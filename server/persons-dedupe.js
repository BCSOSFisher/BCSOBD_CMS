// Duplicate person detection (on create) and merging (command only).
const { db, J } = require('./db');

const now = () => new Date().toISOString();
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// SSN / State ID: ignore blanks and placeholders like "unknown" or "N/A"
const normSsn = (s) => { const v = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return v.length >= 3 && !/^(unknown|none|na|nil|tbd|0+)$/.test(v) ? v : ''; };

// Every person with the same name AND the same SSN / State ID (both must be filled in and match).
function findDuplicates(p, excludeId = 0) {
  const name = normName(p.name); const ssn = normSsn(p.ssn);
  if (!name || !ssn) return [];
  const rows = db.prepare(`SELECT p.id, p.name, p.ssn, p.dob, p.photo_id, p.address,
      (SELECT COUNT(DISTINCT case_id) FROM case_persons WHERE person_id=p.id) case_count FROM persons p WHERE p.id != ?`).all(Number(excludeId) || 0);
  return rows.filter((r) => normName(r.name) === name && normSsn(r.ssn) === ssn)
    .map((r) => ({ ...r, reason: 'Same name and SSN' }))
    .sort((a, b) => b.case_count - a.case_count).slice(0, 8);
}

// Returns true (and sends a 409) when the new person looks like an existing one and the user hasn't confirmed.
function blockIfDuplicate(person, body, res) {
  if (body && body.force_new) return false;
  const matches = findDuplicates(person);
  if (!matches.length) return false;
  res.status(409).json({ code: 'duplicate', error: `A person named “${matches[0].name}” may already exist.`, matches });
  return true;
}

// Groups of likely duplicates across the whole directory (for command cleanup)
function duplicateGroups() {
  const rows = db.prepare(`SELECT p.id, p.name, p.ssn, p.dob, p.photo_id, (SELECT COUNT(DISTINCT case_id) FROM case_persons WHERE person_id=p.id) case_count FROM persons p`).all();
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const join = (a, b) => parent.set(find(a), find(b));
  const by = (key) => { const m = new Map(); for (const r of rows) { const k = key(r); if (!k) continue; if (m.has(k)) join(r.id, m.get(k)); else m.set(k, r.id); } };
  by((r) => normName(r.name)); by((r) => normSsn(r.ssn));
  const groups = new Map();
  for (const r of rows) { const g = find(r.id); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => b.case_count - a.case_count || a.id - b.id));
}

const FILL = ['ssn', 'dob', 'gender', 'phone', 'address', 'description', 'affiliations', 'photo_id', 'gang_id'];

// Move everything from person `fromId` onto `intoId`, then delete `fromId`.
function mergePersons(fromId, intoId, user, audit) {
  const from = db.prepare('SELECT * FROM persons WHERE id=?').get(fromId);
  const into = db.prepare('SELECT * FROM persons WHERE id=?').get(intoId);
  if (!from || !into) throw new Error('Person not found');
  const touched = new Set();
  db.exec('BEGIN');
  try {
    // Case links (a person can't hold the same role twice on one case)
    for (const l of db.prepare('SELECT * FROM case_persons WHERE person_id=?').all(fromId)) {
      touched.add(l.case_id);
      const dup = db.prepare('SELECT * FROM case_persons WHERE case_id=? AND person_id=? AND role=?').get(l.case_id, intoId, l.role);
      if (dup) {
        const notes = [dup.notes, l.notes].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n');
        db.prepare('UPDATE case_persons SET notes=? WHERE id=?').run(notes, dup.id);
        db.prepare('DELETE FROM case_persons WHERE id=?').run(l.id);
      } else db.prepare('UPDATE case_persons SET person_id=? WHERE id=?').run(intoId, l.id);
    }
    // References inside case items (charge suspect, interview / warrant subject)
    for (const [kind, key] of [['charge', 'suspect_person_id'], ['interview', 'person_id'], ['warrant', 'person_id']]) {
      const rows = db.prepare(`SELECT id, case_id FROM items WHERE kind=? AND CAST(json_extract(data,'$.${key}') AS INTEGER)=?`).all(kind, fromId);
      for (const r of rows) { touched.add(r.case_id); db.prepare(`UPDATE items SET data=json_set(data,'$.${key}',?) WHERE id=?`).run(intoId, r.id); }
    }
    // Coroner's decedent
    for (const c of db.prepare(`SELECT id, coroner FROM cases WHERE CAST(json_extract(coroner,'$.person_id') AS INTEGER)=?`).all(fromId)) {
      touched.add(c.id); db.prepare(`UPDATE cases SET coroner=json_set(coroner,'$.person_id',?) WHERE id=?`).run(intoId, c.id);
    }
    // Gang membership
    for (const m of db.prepare('SELECT * FROM gang_members WHERE person_id=?').all(fromId)) {
      if (db.prepare('SELECT 1 FROM gang_members WHERE gang_id=? AND person_id=?').get(m.gang_id, intoId)) db.prepare('DELETE FROM gang_members WHERE id=?').run(m.id);
      else db.prepare('UPDATE gang_members SET person_id=? WHERE id=?').run(intoId, m.id);
    }
    db.prepare('UPDATE vehicles SET owner_person_id=? WHERE owner_person_id=?').run(intoId, fromId);
    db.prepare('UPDATE files SET person_id=? WHERE person_id=?').run(intoId, fromId);
    // Fill blanks on the kept profile; keep both write-ups
    const upd = {};
    for (const k of FILL) if ((into[k] === null || into[k] === '' || into[k] === undefined) && from[k]) upd[k] = from[k];
    if (from.background && from.background !== into.background) upd.background = [into.background, `— Merged from duplicate profile “${from.name}” —\n${from.background}`].filter(Boolean).join('\n\n');
    const flags = [...new Set([...J(into.flags, []), ...J(from.flags, [])])];
    upd.flags = JSON.stringify(flags);
    const keys = Object.keys(upd);
    db.prepare(`UPDATE persons SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=? WHERE id=?`).run(...keys.map((k) => upd[k]), now(), intoId);
    db.prepare('DELETE FROM persons WHERE id=?').run(fromId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  const label = `${from.name} (#${fromId}) merged into ${into.name} (#${intoId})`;
  audit(null, user.id, 'Persons merged', label);
  for (const cid of touched) audit(cid, user.id, 'Persons merged', label);
  return { cases: touched.size };
}

module.exports = { findDuplicates, blockIfDuplicate, duplicateGroups, mergePersons };
