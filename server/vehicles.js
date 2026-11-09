// Vehicle directory: one shared record per vehicle, linked to cases (with a per-case status) and an owner profile.
const { db, J } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT DEFAULT '', model TEXT DEFAULT '', color TEXT DEFAULT '', vin TEXT DEFAULT '',
  owner_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL, owner_text TEXT DEFAULT '',
  gang_id INTEGER, flags TEXT DEFAULT '', notes TEXT DEFAULT '',
  created_by INTEGER, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS case_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'Of Interest', notes TEXT DEFAULT '',
  created_by INTEGER, created_at TEXT,
  UNIQUE(case_id, vehicle_id)
);
`);
const now = () => new Date().toISOString();
const normPlate = (p) => String(p || '').trim().toUpperCase().replace(/\s+/g, ' ');
const FIELDS = ['plate', 'model', 'color', 'vin', 'owner_person_id', 'owner_text', 'gang_id', 'flags', 'notes'];
const CASE_STATUSES = ['Of Interest', 'Suspect Vehicle', 'Victim Vehicle', 'Witness Vehicle', 'BOLO Issued', 'Impounded', 'Seized', 'Released', 'Cleared'];

function insertVehicle(v, uid) {
  const r = db.prepare('INSERT INTO vehicles (plate,model,color,vin,owner_person_id,owner_text,gang_id,flags,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(normPlate(v.plate), v.model || '', v.color || '', v.vin || '', Number(v.owner_person_id) || null, v.owner_text || '', Number(v.gang_id) || null, v.flags || '', v.notes || '', uid || null, now(), now());
  return Number(r.lastInsertRowid);
}

// One-time move of free-text case vehicles (old "Vehicles" section) into the directory
(function migrate() {
  const old = db.prepare("SELECT * FROM items WHERE kind='vehicle'").all();
  for (const it of old) {
    const d = J(it.data, {});
    const plate = normPlate(d.plate);
    let vid = plate ? db.prepare('SELECT id FROM vehicles WHERE plate=?').get(plate)?.id : null;
    if (!vid) vid = insertVehicle({ plate, model: d.model, color: d.color, vin: d.vin, owner_text: d.owner }, it.created_by);
    db.prepare('INSERT OR IGNORE INTO case_vehicles (case_id,vehicle_id,status,notes,created_by,created_at) VALUES (?,?,?,?,?,?)')
      .run(it.case_id, vid, CASE_STATUSES.includes(d.status) ? d.status : 'Of Interest', d.notes || '', it.created_by, it.created_at || now());
    db.prepare('DELETE FROM items WHERE id=?').run(it.id);
  }
})();

function mount(app, { requireUser, isSup, isViewer, audit, canView, canEdit, getCase, canSeeGangs, touch }) {
  const VIEW_ONLY = 'Your access is view-only.';
  const gangOut = (user, v) => {
    // gang: G&N/command see the link; others see the gang name only
    if (!v.gang_id) return { ...v, gang_name: null };
    const g = db.prepare('SELECT name FROM gangs WHERE id=?').get(v.gang_id);
    return canSeeGangs(user) ? { ...v, gang_name: g?.name || null } : { ...v, gang_id: null, gang_name: g?.name || null };
  };
  const ownerName = (v) => (v.owner_person_id ? db.prepare('SELECT name FROM persons WHERE id=?').get(v.owner_person_id)?.name : null) || v.owner_text || '';

  app.get('/api/vehicles', requireUser, (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const rows = db.prepare(`SELECT v.*, p.name owner_name, (SELECT COUNT(*) FROM case_vehicles cv WHERE cv.vehicle_id=v.id) case_count
      FROM vehicles v LEFT JOIN persons p ON p.id=v.owner_person_id
      WHERE v.plate LIKE ? OR v.model LIKE ? OR v.vin LIKE ? OR v.color LIKE ? OR p.name LIKE ? OR v.owner_text LIKE ? ORDER BY v.updated_at DESC LIMIT 300`).all(q, q, q, q, q, q);
    res.json(rows.map((v) => gangOut(req.user, v)));
  });
  app.post('/api/vehicles', requireUser, (req, res) => {
    if (isViewer(req.user)) return res.status(403).json({ error: VIEW_ONLY });
    if (!normPlate(req.body.plate) && !req.body.model) return res.status(400).json({ error: 'Enter at least a plate or a make/model.' });
    const b = { ...req.body }; if (!canSeeGangs(req.user)) delete b.gang_id;
    const id = insertVehicle(b, req.user.id);
    audit(null, req.user.id, 'Vehicle added', `${normPlate(b.plate) || '(no plate)'} ${b.model || ''}`);
    res.json({ id });
  });
  app.get('/api/vehicles/:id', requireUser, (req, res) => {
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(Number(req.params.id));
    if (!v) return res.status(404).json({ error: 'Not found' });
    const owner = v.owner_person_id ? db.prepare('SELECT id, name, ssn, dob, photo_id FROM persons WHERE id=?').get(v.owner_person_id) : null;
    const cases = db.prepare(`SELECT cv.id link_id, cv.status vstatus, cv.notes vnotes, c.id, c.number, c.code, c.title, c.status, c.division, c.secure, c.lead_id, c.created_by
        FROM case_vehicles cv JOIN cases c ON c.id=cv.case_id WHERE cv.vehicle_id=? ORDER BY c.number DESC`).all(v.id)
      .map(({ secure, lead_id, created_by, ...c }) => (canView(req.user, { ...c, secure, lead_id, created_by }) ? c : { ...c, title: 'CLASSIFIED', vnotes: '', vstatus: '', status: 'Classified', restricted: true }));
    res.json({ vehicle: gangOut(req.user, v), owner, cases, canEdit: !isViewer(req.user), isCommand: isSup(req.user) });
  });
  app.patch('/api/vehicles/:id', requireUser, (req, res) => {
    if (isViewer(req.user)) return res.status(403).json({ error: VIEW_ONLY });
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(Number(req.params.id)); if (!v) return res.status(404).end();
    const sets = []; const vals = [];
    for (const k of FIELDS) {
      if (!(k in req.body)) continue;
      if (k === 'gang_id' && !canSeeGangs(req.user)) continue;
      let val = req.body[k];
      if (k === 'plate') val = normPlate(val);
      if (k === 'owner_person_id' || k === 'gang_id') val = Number(val) || null;
      sets.push(`${k}=?`); vals.push(val ?? '');
    }
    if (sets.length) db.prepare(`UPDATE vehicles SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), v.id);
    res.json({ ok: true });
  });
  app.delete('/api/vehicles/:id', requireUser, (req, res) => {
    if (!isSup(req.user)) return res.status(403).json({ error: 'Only command can delete a vehicle record.' });
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(Number(req.params.id)); if (!v) return res.status(404).end();
    db.prepare('DELETE FROM vehicles WHERE id=?').run(v.id);
    audit(null, req.user.id, 'Vehicle deleted', `${v.plate} ${v.model}`);
    res.json({ ok: true });
  });

  // ---- vehicles on a case ----
  const caseEdit = (req, res, caseId) => {
    const c = getCase(caseId);
    if (!c) { res.status(404).json({ error: 'Case not found' }); return null; }
    if (!canEdit(req.user, c)) { res.status(403).json({ error: 'You are not assigned to this case (view only).' }); return null; }
    return c;
  };
  app.post('/api/cases/:id/vehicles', requireUser, (req, res) => {
    const c = caseEdit(req, res, req.params.id); if (!c) return;
    let vid = Number(req.body.vehicle_id);
    if (!vid) {
      const nv = { ...(req.body.vehicle || {}) }; if (!canSeeGangs(req.user)) delete nv.gang_id;
      const plate = normPlate(nv.plate);
      if (!plate && !nv.model) return res.status(400).json({ error: 'Enter at least a plate or a make/model.' });
      vid = (plate && db.prepare('SELECT id FROM vehicles WHERE plate=?').get(plate)?.id) || insertVehicle(nv, req.user.id);
    }
    try {
      db.prepare('INSERT INTO case_vehicles (case_id,vehicle_id,status,notes,created_by,created_at) VALUES (?,?,?,?,?,?)')
        .run(c.id, vid, CASE_STATUSES.includes(req.body.status) ? req.body.status : 'Of Interest', req.body.notes || '', req.user.id, now());
    } catch { return res.status(400).json({ error: 'That vehicle is already on this case.' }); }
    const v = db.prepare('SELECT plate, model FROM vehicles WHERE id=?').get(vid);
    audit(c.id, req.user.id, 'Vehicle added', `${v.plate || '(no plate)'} ${v.model || ''}`);
    touch(c.id); res.json({ ok: true, vehicle_id: vid });
  });
  app.patch('/api/case-vehicles/:lid', requireUser, (req, res) => {
    const l = db.prepare('SELECT * FROM case_vehicles WHERE id=?').get(Number(req.params.lid)); if (!l) return res.status(404).end();
    const c = caseEdit(req, res, l.case_id); if (!c) return;
    db.prepare('UPDATE case_vehicles SET status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=?')
      .run(CASE_STATUSES.includes(req.body.status) ? req.body.status : null, req.body.notes ?? null, l.id);
    audit(c.id, req.user.id, 'Vehicle updated', req.body.status || '');
    touch(c.id); res.json({ ok: true });
  });
  app.delete('/api/case-vehicles/:lid', requireUser, (req, res) => {
    const l = db.prepare('SELECT cv.*, v.plate FROM case_vehicles cv JOIN vehicles v ON v.id=cv.vehicle_id WHERE cv.id=?').get(Number(req.params.lid)); if (!l) return res.status(404).end();
    const c = caseEdit(req, res, l.case_id); if (!c) return;
    db.prepare('DELETE FROM case_vehicles WHERE id=?').run(l.id);
    audit(c.id, req.user.id, 'Vehicle removed', l.plate);
    touch(c.id); res.json({ ok: true });
  });
}

// For case bundles and reports
function caseVehicles(caseId) {
  return db.prepare(`SELECT cv.id link_id, cv.status vstatus, cv.notes vnotes, v.*, p.name owner_name
    FROM case_vehicles cv JOIN vehicles v ON v.id=cv.vehicle_id LEFT JOIN persons p ON p.id=v.owner_person_id WHERE cv.case_id=? ORDER BY cv.id`).all(caseId);
}
function personVehicles(personId) {
  return db.prepare(`SELECT v.*, (SELECT COUNT(*) FROM case_vehicles cv WHERE cv.vehicle_id=v.id) case_count FROM vehicles v WHERE v.owner_person_id=? ORDER BY v.plate`).all(personId);
}

module.exports = { mount, caseVehicles, personVehicles, CASE_STATUSES };
