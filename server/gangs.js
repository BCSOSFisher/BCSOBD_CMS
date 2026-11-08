// Gang & organization registry: gangs, members (suspected rank), businesses, gang-to-gang affiliations.
const { db, J } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS gangs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, abbreviation TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Suspected',      -- Recognized | Suspected | Inactive
  type TEXT DEFAULT '',                           -- Cartel | Street Gang | Motorcycle Club | Organized Crime Group | Other
  description TEXT DEFAULT '', territory TEXT DEFAULT '', identifiers TEXT DEFAULT '', notes TEXT DEFAULT '',
  created_by INTEGER, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS gang_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gang_id INTEGER REFERENCES gangs(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
  rank TEXT DEFAULT 'Associate', confidence TEXT DEFAULT 'Suspected', notes TEXT DEFAULT '',
  created_by INTEGER, created_at TEXT, updated_at TEXT,
  UNIQUE(gang_id, person_id)
);
CREATE TABLE IF NOT EXISTS gang_businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gang_id INTEGER REFERENCES gangs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, legality TEXT DEFAULT 'Illegal', kind TEXT DEFAULT '', address TEXT DEFAULT '',
  description TEXT DEFAULT '', created_by INTEGER, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS gang_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gang_id INTEGER REFERENCES gangs(id) ON DELETE CASCADE,
  other_id INTEGER REFERENCES gangs(id) ON DELETE CASCADE,
  relation TEXT DEFAULT 'Ally', notes TEXT DEFAULT '', created_by INTEGER, created_at TEXT
);
`);
const pcols = db.prepare('PRAGMA table_info(persons)').all().map((c) => c.name);
if (!pcols.includes('gang_id')) db.exec('ALTER TABLE persons ADD COLUMN gang_id INTEGER');

// Starting registry (only when empty)
if (!db.prepare('SELECT COUNT(*) n FROM gangs').get().n) {
  const at = new Date().toISOString();
  const ins = db.prepare('INSERT INTO gangs (name,abbreviation,status,type,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  ins.run('Cartel De Jaurez', 'CDJ', 'Recognized', 'Cartel', at, at);
  ins.run('Angels of Death MC', 'AOD', 'Suspected', 'Motorcycle Club', at, at);
  ins.run('Callaghan Crime Group', 'CCG', 'Suspected', 'Organized Crime Group', at, at);
}

const now = () => new Date().toISOString();
const GANG_FIELDS = ['name', 'abbreviation', 'status', 'type', 'description', 'territory', 'identifiers', 'notes'];
const STATUSES = ['Recognized', 'Suspected', 'Inactive'];

// Keep persons.gang_id (the dropdown) and the member list in step
function setPrimaryGang(personId, gangId, uid) {
  gangId = Number(gangId) || null;
  const p = db.prepare('SELECT gang_id FROM persons WHERE id=?').get(personId);
  if (!p) return;
  if (p.gang_id && p.gang_id !== gangId) db.prepare('DELETE FROM gang_members WHERE gang_id=? AND person_id=?').run(p.gang_id, personId);
  db.prepare('UPDATE persons SET gang_id=? WHERE id=?').run(gangId, personId);
  if (gangId) db.prepare("INSERT OR IGNORE INTO gang_members (gang_id,person_id,rank,confidence,created_by,created_at,updated_at) VALUES (?,?, 'Associate','Suspected',?,?,?)").run(gangId, personId, uid, now(), now());
}

function mount(app, { requireUser, isSup, isViewer, audit, canView, getCase }) {
  // GNU members and command can edit the registry; everyone (incl. view-only) can read it
  const canEditGangs = (u) => !isViewer(u) && (isSup(u) || J(u.units, []).includes('GNU'));
  const guard = (req, res) => { if (!canEditGangs(req.user)) { res.status(403).json({ error: 'Only Gang & Narcotics Unit members and command can edit the gang registry.' }); return false; } return true; };
  const gangName = (id) => db.prepare('SELECT name FROM gangs WHERE id=?').get(id)?.name || '';

  app.get('/api/gangs', requireUser, (req, res) => {
    const rows = db.prepare(`SELECT g.*,
        (SELECT COUNT(*) FROM gang_members m WHERE m.gang_id=g.id) members,
        (SELECT COUNT(*) FROM gang_businesses b WHERE b.gang_id=g.id) businesses
      FROM gangs g ORDER BY CASE g.status WHEN 'Recognized' THEN 0 WHEN 'Suspected' THEN 1 ELSE 2 END, g.name`).all();
    for (const g of rows) {
      g.cases = db.prepare(`SELECT COUNT(DISTINCT cp.case_id) n FROM case_persons cp JOIN gang_members m ON m.person_id=cp.person_id WHERE m.gang_id=?`).get(g.id).n;
    }
    res.json({ gangs: rows, canEdit: canEditGangs(req.user) });
  });

  app.post('/api/gangs', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Gang name is required' });
    const r = db.prepare(`INSERT INTO gangs (name,abbreviation,status,type,description,territory,identifiers,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name.trim(), b.abbreviation || '', STATUSES.includes(b.status) ? b.status : 'Suspected', b.type || '', b.description || '', b.territory || '', b.identifiers || '', b.notes || '', req.user.id, now(), now());
    audit(null, req.user.id, 'Gang added', `${b.name} (${b.status || 'Suspected'})`);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  app.get('/api/gangs/:id', requireUser, (req, res) => {
    const g = db.prepare('SELECT * FROM gangs WHERE id=?').get(Number(req.params.id));
    if (!g) return res.status(404).json({ error: 'Not found' });
    const members = db.prepare(`SELECT m.*, p.name, p.ssn, p.dob, p.photo_id, p.address FROM gang_members m JOIN persons p ON p.id=m.person_id WHERE m.gang_id=?`).all(g.id);
    const businesses = db.prepare('SELECT * FROM gang_businesses WHERE gang_id=? ORDER BY legality, name').all(g.id);
    const relations = db.prepare(`SELECT r.*, o.name other_name, o.abbreviation other_abbr, o.status other_status FROM gang_relations r JOIN gangs o ON o.id = CASE WHEN r.gang_id=? THEN r.other_id ELSE r.gang_id END WHERE r.gang_id=? OR r.other_id=?`).all(g.id, g.id, g.id);
    const cases = db.prepare(`SELECT DISTINCT c.id, c.number, c.code, c.title, c.status, c.division, c.secure, c.lead_id, c.created_by, p.name person, cp.role
        FROM case_persons cp JOIN gang_members m ON m.person_id=cp.person_id JOIN cases c ON c.id=cp.case_id JOIN persons p ON p.id=cp.person_id WHERE m.gang_id=? ORDER BY c.number DESC`).all(g.id)
      .map(({ secure, lead_id, created_by, ...c }) => (canView(req.user, { ...c, secure, lead_id, created_by }) ? c : { ...c, title: 'CLASSIFIED', person: '', role: '', restricted: true }));
    res.json({ gang: g, members, businesses, relations, cases, canEdit: canEditGangs(req.user), isCommand: isSup(req.user) });
  });

  app.patch('/api/gangs/:id', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const g = db.prepare('SELECT * FROM gangs WHERE id=?').get(Number(req.params.id)); if (!g) return res.status(404).end();
    const sets = []; const vals = [];
    for (const k of GANG_FIELDS) if (k in req.body) {
      if (k === 'status' && !STATUSES.includes(req.body.status)) continue;
      sets.push(`${k}=?`); vals.push(String(req.body[k] ?? ''));
    }
    if (sets.length) db.prepare(`UPDATE gangs SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), g.id);
    if (req.body.status && req.body.status !== g.status) audit(null, req.user.id, 'Gang status changed', `${g.name}: ${g.status} → ${req.body.status}`);
    res.json({ ok: true });
  });

  app.delete('/api/gangs/:id', requireUser, (req, res) => {
    if (!isSup(req.user)) return res.status(403).json({ error: 'Only command can delete a gang from the registry.' });
    const g = db.prepare('SELECT * FROM gangs WHERE id=?').get(Number(req.params.id)); if (!g) return res.status(404).end();
    db.prepare('UPDATE persons SET gang_id=NULL WHERE gang_id=?').run(g.id);
    db.prepare('DELETE FROM gangs WHERE id=?').run(g.id);
    audit(null, req.user.id, 'Gang deleted', g.name);
    res.json({ ok: true });
  });

  // members
  app.post('/api/gangs/:id/members', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const gid = Number(req.params.id); if (!gangName(gid)) return res.status(404).end();
    let pid = Number(req.body.person_id);
    if (!pid) {
      const p = req.body.person || {};
      if (!String(p.name || '').trim()) return res.status(400).json({ error: 'Choose a person or enter a name' });
      pid = Number(db.prepare('INSERT INTO persons (name,ssn,dob,gender,address,description,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(p.name.trim(), p.ssn || '', p.dob || '', p.gender || '', p.address || '', p.description || '', req.user.id, now(), now()).lastInsertRowid);
    }
    try {
      db.prepare('INSERT INTO gang_members (gang_id,person_id,rank,confidence,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(gid, pid, req.body.rank || 'Associate', req.body.confidence || 'Suspected', req.body.notes || '', req.user.id, now(), now());
    } catch { return res.status(400).json({ error: 'That person is already listed in this gang.' }); }
    const p = db.prepare('SELECT name, gang_id FROM persons WHERE id=?').get(pid);
    if (!p.gang_id) db.prepare('UPDATE persons SET gang_id=? WHERE id=?').run(gid, pid);
    audit(null, req.user.id, 'Gang member added', `${p.name} → ${gangName(gid)} (${req.body.rank || 'Associate'})`);
    res.json({ ok: true });
  });
  app.patch('/api/gang-members/:mid', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const m = db.prepare('SELECT * FROM gang_members WHERE id=?').get(Number(req.params.mid)); if (!m) return res.status(404).end();
    db.prepare('UPDATE gang_members SET rank=COALESCE(?,rank), confidence=COALESCE(?,confidence), notes=COALESCE(?,notes), updated_at=? WHERE id=?')
      .run(req.body.rank ?? null, req.body.confidence ?? null, req.body.notes ?? null, now(), m.id);
    res.json({ ok: true });
  });
  app.delete('/api/gang-members/:mid', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const m = db.prepare('SELECT m.*, p.name FROM gang_members m JOIN persons p ON p.id=m.person_id WHERE m.id=?').get(Number(req.params.mid)); if (!m) return res.status(404).end();
    db.prepare('DELETE FROM gang_members WHERE id=?').run(m.id);
    db.prepare('UPDATE persons SET gang_id=NULL WHERE id=? AND gang_id=?').run(m.person_id, m.gang_id);
    audit(null, req.user.id, 'Gang member removed', `${m.name} from ${gangName(m.gang_id)}`);
    res.json({ ok: true });
  });

  // businesses
  const BIZ = ['name', 'legality', 'kind', 'address', 'description'];
  app.post('/api/gangs/:id/businesses', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Business name is required' });
    db.prepare('INSERT INTO gang_businesses (gang_id,name,legality,kind,address,description,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(Number(req.params.id), b.name.trim(), b.legality === 'Legal (front)' ? 'Legal (front)' : 'Illegal', b.kind || '', b.address || '', b.description || '', req.user.id, now(), now());
    audit(null, req.user.id, 'Gang business added', `${b.name} — ${gangName(Number(req.params.id))}`);
    res.json({ ok: true });
  });
  app.patch('/api/gang-businesses/:bid', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const sets = []; const vals = [];
    for (const k of BIZ) if (k in req.body) { sets.push(`${k}=?`); vals.push(String(req.body[k] ?? '')); }
    if (sets.length) db.prepare(`UPDATE gang_businesses SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), Number(req.params.bid));
    res.json({ ok: true });
  });
  app.delete('/api/gang-businesses/:bid', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    db.prepare('DELETE FROM gang_businesses WHERE id=?').run(Number(req.params.bid));
    res.json({ ok: true });
  });

  // gang-to-gang affiliations
  app.post('/api/gangs/:id/relations', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const a = Number(req.params.id), b = Number(req.body.other_id);
    if (!gangName(b) || a === b) return res.status(400).json({ error: 'Choose another gang' });
    db.prepare('INSERT INTO gang_relations (gang_id,other_id,relation,notes,created_by,created_at) VALUES (?,?,?,?,?,?)').run(a, b, req.body.relation || 'Ally', req.body.notes || '', req.user.id, now());
    res.json({ ok: true });
  });
  app.delete('/api/gang-relations/:rid', requireUser, (req, res) => {
    if (!guard(req, res)) return;
    db.prepare('DELETE FROM gang_relations WHERE id=?').run(Number(req.params.rid));
    res.json({ ok: true });
  });
}

module.exports = { mount, setPrimaryGang };
