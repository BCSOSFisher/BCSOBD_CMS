process.removeAllListeners('warning'); // silence node:sqlite experimental warning
const path = require('path');
const fs = require('fs');
// Load .env for local runs (hosting platforms set real environment variables instead)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET) { console.error('SESSION_SECRET must be set in production.'); process.exit(1); }
  if (process.env.DEV_LOGIN === 'true') { console.error('DEV_LOGIN must not be enabled in production.'); process.exit(1); }
}
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const { db, J, UPLOAD_DIR } = require('./db');
const auth = require('./auth');
const config = require('../shared/config.json');
const penalCode = require('../shared/penal-code.json');
// Hand-written elements for priority charges replace the auto-generated ones
const curatedElements = require('../shared/charge-elements.json');
for (const c of penalCode) {
  if (curatedElements[c.code]) { c.elements = curatedElements[c.code]; c.curated = true; }
}
const { buildCaseReport, buildWarrantPacket } = require('./report');
const gangs = require('./gangs');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(cookieSession({
  name: 'bcdb_sess',
  keys: [process.env.SESSION_SECRET || 'dev-only-insecure-secret'],
  maxAge: 12 * 60 * 60 * 1000,
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
}));

auth.mount(app);

// ---------- helpers ----------
const now = () => new Date().toISOString();
const RANK_ORDER = { admin: 9, bureau_lead: 8, co_lead: 7, supervisor: 6, lead: 5, det2: 4, det1: 3, trainee: 2, viewer: 1 };
// View-only members (base Detective Bureau role, no rank): can read non-classified cases, can't change anything
const isViewer = (u) => u.rank === 'viewer';
// Gang intelligence is restricted to Gang & Narcotics Unit members and command
const canSeeGangs = (u) => isSup(u) || J(u.units, []).includes('GNU');
const GANG_FIELDS_ON_PERSON = ['gang_id', 'gang_name', 'gang_abbr', 'gang_status', 'gang_rank', 'gang_confidence'];
const stripGang = (p) => { const o = { ...p }; for (const k of GANG_FIELDS_ON_PERSON) delete o[k]; return o; };
const VIEW_ONLY_MSG = 'Your access is view-only. Ask Bureau command if you need more access.';
// Trainees work cases they're assigned to, but can't open cases, lead them, or sign them off for closure
const isTrainee = (u) => u.rank === 'trainee';
function requireUser(req, res, next) {
  const uid = req.session && req.session.uid;
  if (!uid) return res.status(401).json({ error: 'Not signed in' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  if (!u || !RANK_ORDER[u.rank]) return res.status(401).json({ error: 'Not authorised' });
  if (u.active === 0) { req.session = null; return res.status(401).json({ error: 'Your access has been removed.', code: 'revoked' }); }
  req.user = u;
  next();
}
// Bureau Lead, Co-Lead and Supervisors share command permissions (sign-off, reopen, delete, edit any case)
const isSup = (u) => (config.commandRanks || ['supervisor']).includes(u.rank);
function audit(caseId, userId, action, detail = '') {
  db.prepare('INSERT INTO audit (case_id,user_id,action,detail,at) VALUES (?,?,?,?,?)').run(caseId, userId, action, String(detail).slice(0, 500), now());
}
function getCase(id) {
  const c = db.prepare('SELECT * FROM cases WHERE id=?').get(Number(id));
  if (!c) return null;
  for (const k of ['bureau_units', 'other_agencies', 'sections']) c[k] = J(c[k], []);
  for (const k of ['scene', 'coroner', 'closure', 'secure']) c[k] = J(c[k], {});
  return c;
}
// ---- Classified cases ----
// Visible to: Bureau command, the case's investigators, and members of the units the lead selected.
const secureOf = (c) => (typeof c.secure === 'string' ? J(c.secure, {}) : c.secure || {});
const isClassified = (c) => !!secureOf(c).on;
function canView(user, c) {
  if (!c || !isClassified(c)) return true;
  if (isSup(user)) return true;
  if (isViewer(user)) return false;
  if (c.created_by === user.id || c.lead_id === user.id) return true;
  if (db.prepare('SELECT 1 FROM case_members WHERE case_id=? AND user_id=?').get(c.id, user.id)) return true;
  const mine = J(user.units, []);
  return (secureOf(c).units || []).some((u) => mine.includes(u));
}
const unitNames = (ids) => (ids || []).map((id) => config.divisions.find((d) => d.id === id)?.name || id);
// What someone without access sees in a list
const redacted = (c) => ({ id: c.id, number: c.number, code: c.code, division: c.division, title: 'CLASSIFIED', status: 'Classified', restricted: true,
  classified_units: unitNames(secureOf(c).units), closure: '{}', opened_at: null, updated_at: c.updated_at, location: '' });
function canEdit(user, c) {
  if (!c) return false;
  if (isViewer(user)) return false;
  if (isSup(user)) return true;
  if (c.status === 'Closed' || c.closure?.requested) return false; // locked once submitted/closed
  if (c.created_by === user.id || c.lead_id === user.id) return true;
  return !!db.prepare('SELECT 1 FROM case_members WHERE case_id=? AND user_id=?').get(c.id, user.id);
}
function canManageMembers(user, c) {
  return isSup(user) || c.created_by === user.id || c.lead_id === user.id;
}
function loadCaseForEdit(req, res) {
  const c = getCase(req.params.id);
  if (!c) { res.status(404).json({ error: 'Case not found' }); return null; }
  if (!canEdit(req.user, c)) { res.status(403).json({ error: 'You are not assigned to this case (view only).' }); return null; }
  return c;
}
function touch(caseId) { db.prepare('UPDATE cases SET updated_at=? WHERE id=?').run(now(), caseId); }
const userPublic = (u) => u && ({ id: u.id, display_name: u.display_name, username: u.username, avatar: u.avatar, rank: u.rank, callsign: u.callsign, units: J(u.units, []), active: u.active !== 0 });

function caseBundle(c, user) {
  const members = db.prepare(`SELECT m.role, u.* FROM case_members m JOIN users u ON u.id=m.user_id WHERE m.case_id=?`).all(c.id)
    .map((r) => ({ ...userPublic(r), role: r.role }));
  const persons = db.prepare(`SELECT cp.id AS link_id, cp.role AS case_role, cp.notes AS case_notes, cp.custody_status, p.*, g.name AS gang_name, g.status AS gang_status, gm.rank AS gang_rank, gm.confidence AS gang_confidence
      FROM case_persons cp JOIN persons p ON p.id=cp.person_id LEFT JOIN gangs g ON g.id=p.gang_id LEFT JOIN gang_members gm ON gm.gang_id=p.gang_id AND gm.person_id=p.id WHERE cp.case_id=? ORDER BY cp.id`).all(c.id)
    .map((p) => ({ ...p, flags: J(p.flags, []) })).map((p) => (canSeeGangs(user) ? p : stripGang(p)));
  const items = db.prepare('SELECT * FROM items WHERE case_id=? ORDER BY id').all(c.id).map((i) => ({ ...i, data: J(i.data, {}) }));
  const files = db.prepare('SELECT * FROM files WHERE case_id=? ORDER BY id').all(c.id);
  const links = db.prepare(`SELECT l.id, l.reason, c.id AS case_id, c.number, c.code, c.title, c.status, c.division, c.secure, c.lead_id, c.created_by
      FROM case_links l JOIN cases c ON c.id = CASE WHEN l.a=? THEN l.b ELSE l.a END WHERE l.a=? OR l.b=?`).all(c.id, c.id, c.id)
    .map((l) => { const lc = { ...l, id: l.case_id }; const ok = canView(user, lc); const { secure, lead_id, created_by, ...rest } = l; return ok ? { ...rest, classified: isClassified(lc) } : { ...rest, title: 'CLASSIFIED', status: 'Classified', reason: '', restricted: true }; });
  // Last meaningful activity (downloads don't count as working the case)
  const lastActivity = db.prepare(`SELECT a.at, a.action, u.display_name FROM audit a LEFT JOIN users u ON u.id=a.user_id
     WHERE a.case_id=? AND a.action NOT IN ('Report downloaded','Warrant packet downloaded','Classified access blocked') ORDER BY a.id DESC LIMIT 1`).get(c.id) || null;
  const auditRows = db.prepare('SELECT a.*, u.display_name FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE case_id=? ORDER BY a.id DESC LIMIT 200').all(c.id);
  const users = Object.fromEntries(db.prepare('SELECT * FROM users').all().map((u) => [u.id, userPublic(u)]));
  return {
    case: c, members, persons, items, files, links, audit: auditRows, lastActivity,
    creator: users[c.created_by], lead: users[c.lead_id],
    canEdit: canEdit(user, c), canManage: canManageMembers(user, c), isSupervisor: isSup(user),
    canClassify: c.lead_id === user.id, classifiedUnits: unitNames(c.secure?.units),
  };
}
function caseRow(c) {
  return {
    ...c, classified: isClassified(c), secure: undefined,
    lead_name: c.lead_id ? db.prepare('SELECT display_name FROM users WHERE id=?').get(c.lead_id)?.display_name : null,
  };
}

// ---------- reference ----------
app.get('/api/me', requireUser, (req, res) => res.json({ user: userPublic(req.user), devLogin: auth.DEV }));
app.get('/api/config', requireUser, (req, res) => res.json(config));
let pcEtag = crypto.createHash('md5').update(JSON.stringify(penalCode)).digest('hex');
app.get('/api/penal-code', requireUser, (req, res) => { res.set('ETag', pcEtag); res.json(penalCode); });
app.get('/api/users', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY display_name').all().map((u) => ({ ...userPublic(u), last_login: u.last_login,
    ...(u.active === 0 ? { deactivated_at: u.deactivated_at, deactivated_by: u.deactivated_by, deactivated_type: u.deactivated_type, deactivated_reason: u.deactivated_reason } : {}) })));
});
// Command can remove someone from the roster (blocks sign-in immediately) and restore them
app.post('/api/users/:id/deactivate', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Only Bureau command can remove personnel.' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
  if (RANK_ORDER[u.rank] > RANK_ORDER[req.user.rank]) return res.status(403).json({ error: 'You cannot remove someone who outranks you.' });
  const reason = String(req.body.reason || '').trim().slice(0, 200) || 'Removed by command';
  db.prepare("UPDATE users SET active=0, deactivated_at=?, deactivated_by=?, deactivated_type='manual', deactivated_reason=? WHERE id=?").run(now(), req.user.display_name, reason, u.id);
  audit(null, req.user.id, 'Removed from roster', `${u.display_name} — ${reason}`);
  res.json({ ok: true });
});
app.post('/api/users/:id/reactivate', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Only Bureau command can restore personnel.' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE users SET active=1, deactivated_at=NULL, deactivated_by=NULL, deactivated_type=NULL, deactivated_reason=NULL WHERE id=?').run(u.id);
  audit(null, req.user.id, 'Restored to roster', u.display_name);
  res.json({ ok: true });
});
app.patch('/api/users/:id', requireUser, (req, res) => {
  if (!isSup(req.user) && req.user.id !== Number(req.params.id)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE users SET callsign=? WHERE id=?').run(String(req.body.callsign || '').slice(0, 20), Number(req.params.id));
  res.json({ ok: true });
});

// ---------- dashboard ----------
const INACTIVE_DAYS = 14;
const SECURITY_ACTIONS = ['Denied sign-in', 'Classified access blocked', 'Removed from roster', 'Restored to roster'];
const NOT_ACTIVITY = "('Report downloaded','Warrant packet downloaded','Classified access blocked')";
app.get('/api/dashboard', requireUser, (req, res) => {
  const me = req.user; const uid = me.id;
  const cmd = isSup(me);
  const division = config.divisions.some((d) => d.id === req.query.division) ? req.query.division : '';
  const inDiv = (c) => !division || c.division === division;
  const days = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  // all cases with last meaningful activity, filtered to what this user may see
  const all = db.prepare(`SELECT c.*, (SELECT MAX(a.at) FROM audit a WHERE a.case_id=c.id AND a.action NOT IN ${NOT_ACTIVITY}) AS last_at FROM cases c`).all()
    .filter((c) => canView(me, c) && inDiv(c));
  const memberOf = new Set(db.prepare('SELECT case_id FROM case_members WHERE user_id=?').all(uid).map((r) => r.case_id));
  const isMine = (c) => c.lead_id === uid || c.created_by === uid || memberOf.has(c.id);
  const open = all.filter((c) => c.status !== 'Closed');
  const row = (c) => ({ ...caseRow(c), last_at: c.last_at || c.created_at, idle_days: days(c.last_at || c.created_at) });
  const mineOpen = open.filter(isMine).sort((a, b) => (b.last_at || '').localeCompare(a.last_at || '')).map(row);

  // inactive: everyone sees their own; command sees every case they can view
  const inactive = open.filter((c) => (cmd || isMine(c)) && days(c.last_at || c.created_at) > INACTIVE_DAYS).map(row).sort((a, b) => b.idle_days - a.idle_days);

  // warrants (in progress) on visible cases
  const caseById = Object.fromEntries(all.map((c) => [c.id, c]));
  const warrants = db.prepare(`SELECT id, case_id, data FROM items WHERE kind='warrant'`).all()
    .filter((w) => caseById[w.case_id]).map((w) => ({ ...w, data: J(w.data, {}), code: caseById[w.case_id].code, number: caseById[w.case_id].number }))
    .filter((w) => ['Draft', 'Submitted to DOJ'].includes(w.data.status));

  // needs attention — things waiting on THIS user
  const myOpenIds = new Set(mineOpen.map((c) => c.id));
  const outstanding = db.prepare(`SELECT case_id, data FROM items WHERE kind='charge'`).all().filter((ch) => myOpenIds.has(ch.case_id))
    .reduce((acc, ch) => { const d = J(ch.data, {}); const miss = (d.elements || []).filter((e) => !e.met).length; if (miss) { const k = ch.case_id; acc[k] = acc[k] || { charges: 0, missing: 0 }; acc[k].charges++; acc[k].missing += miss; } return acc; }, {});
  const attention = {
    inactive: inactive.filter((c) => myOpenIds.has(c.id)),
    returned: mineOpen.filter((c) => { const cl = J(c.closure, {}); return cl.rejected && !cl.requested; }).map((c) => ({ ...c, rejected: J(c.closure, {}).rejected })),
    drafts: warrants.filter((w) => myOpenIds.has(w.case_id) && w.data.status === 'Draft'),
    outstanding: mineOpen.filter((c) => outstanding[c.id]).map((c) => ({ ...c, ...outstanding[c.id] })),
  };

  const review = cmd ? all.filter((c) => J(c.closure, {}).requested).map(row) : [];
  const stats = {
    active: open.length, total: all.length,
    pendingWarrant: open.filter((c) => c.status === 'Pending Warrant').length,
    warrantsInProgress: warrants.length,
    closed30: all.filter((c) => c.status === 'Closed' && days(c.updated_at) <= 30).length,
    review: review.length, inactive: inactive.length,
  };
  const byDivision = config.divisions.map((d) => ({ division: d.id, n: open.filter((c) => c.division === d.id).length }));

  // detective workload (command only)
  let workload = [];
  if (cmd) {
    const members = db.prepare('SELECT case_id, user_id FROM case_members').all();
    workload = db.prepare('SELECT * FROM users WHERE active!=0').all().map((u) => {
      const lead = open.filter((c) => c.lead_id === u.id);
      const assist = open.filter((c) => c.lead_id !== u.id && members.some((m) => m.case_id === c.id && m.user_id === u.id));
      return { ...userPublic(u), lead: lead.length, assist: assist.length, idle: lead.filter((c) => days(c.last_at || c.created_at) > INACTIVE_DAYS).length };
    }).filter((u) => !division || u.units.includes(division) || u.lead || u.assist)
      .sort((a, b) => (b.lead + b.assist) - (a.lead + a.assist) || a.display_name.localeCompare(b.display_name));
  }


  const recent = db.prepare(`SELECT a.*, u.display_name, c.code, c.number, c.title, c.division, c.secure, c.lead_id, c.created_by FROM audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN cases c ON c.id=a.case_id
      WHERE a.action NOT IN (${SECURITY_ACTIONS.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT 60`).all(...SECURITY_ACTIONS)
    .filter((a) => (division ? a.division === division : true))
    .filter((a) => canSeeGangs(me) || !/^Gang /.test(a.action))
    .map(({ secure, lead_id, created_by, ...a }) => (a.case_id && !canView(me, { id: a.case_id, secure, lead_id, created_by }) ? { ...a, title: null, detail: 'Classified case' } : a))
    .slice(0, 15);

  const recentCases = isViewer(me) ? open.sort((a, b) => (b.last_at || '').localeCompare(a.last_at || '')).slice(0, 10).map(row) : [];
  res.json({ division, isCommand: cmd, isTrainee: isTrainee(me), isViewer: isViewer(me), recentCases, inactiveDays: INACTIVE_DAYS, stats, mine: mineOpen, inactive, attention, review, warrants, byDivision, workload, recent, serverTime: now() });
});

// Security alerts page (command only): denied sign-ins, blocked classified access, roster removals/restores
app.get('/api/security', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Command only.' });
  const type = SECURITY_ACTIONS.includes(req.query.type) ? [req.query.type] : SECURITY_ACTIONS;
  const q = String(req.query.q || '').trim();
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  let sql = `SELECT a.*, u.display_name, c.code, c.number FROM audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN cases c ON c.id=a.case_id
     WHERE a.action IN (${type.map(() => '?').join(',')}) AND a.at >= ?`;
  const p = [...type, new Date(Date.now() - days * 86400000).toISOString()];
  if (q) { sql += ' AND (u.display_name LIKE ? OR a.detail LIKE ? OR c.code LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = db.prepare(sql + ' ORDER BY a.id DESC LIMIT 500').all(...p);
  const since24 = new Date(Date.now() - 86400000).toISOString();
  const counts = Object.fromEntries(SECURITY_ACTIONS.map((t) => [t, db.prepare('SELECT COUNT(*) n FROM audit WHERE action=? AND at >= ?').get(t, since24).n]));
  res.json({ rows, counts24h: counts, days });
});

// ---------- cases ----------
app.get('/api/cases', requireUser, (req, res) => {
  const { q = '', status = '', division = '', mine = '' } = req.query;
  let sql = `SELECT DISTINCT c.* FROM cases c LEFT JOIN case_members m ON m.case_id=c.id WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND c.status=?'; p.push(status); }
  if (division) { sql += ' AND c.division=?'; p.push(division); }
  if (mine) { sql += ' AND (c.lead_id=? OR c.created_by=? OR m.user_id=?)'; p.push(req.user.id, req.user.id, req.user.id); }
  if (q) {
    sql += ` AND (c.title LIKE ? OR c.code LIKE ? OR CAST(c.number AS TEXT)=? OR c.location LIKE ? OR c.id IN
      (SELECT cp.case_id FROM case_persons cp JOIN persons pp ON pp.id=cp.person_id WHERE pp.name LIKE ? OR pp.ssn LIKE ?))`;
    const like = `%${q}%`; p.push(like, like, q.replace('#', ''), like, like, like);
  }
  sql += ' ORDER BY c.number DESC LIMIT 500';
  // Classified cases the user can't access: shown as a locked row, and never matched by a search
  res.json(db.prepare(sql).all(...p).filter((c) => !q || canView(req.user, c)).map((c) => (canView(req.user, c) ? caseRow(c) : redacted(c))));
});

function nextCaseNumber() {
  const max = db.prepare('SELECT MAX(number) m FROM cases').get().m;
  const start = Number(process.env.CASE_NUMBER_START || 1);
  return Math.max((max || 0) + 1, start);
}
app.post('/api/cases', requireUser, (req, res) => {
  if (isViewer(req.user)) return res.status(403).json({ error: VIEW_ONLY_MSG });
  if (isTrainee(req.user)) return res.status(403).json({ error: 'Trainees can’t open cases. Ask a detective to open the case and add you to it.' });
  const b = req.body || {};
  const div = config.divisions.find((d) => d.id === b.division);
  if (!div) return res.status(400).json({ error: 'Choose a division' });
  if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Case title is required' });
  const number = nextCaseNumber();
  const year = (b.incident_date || new Date().toISOString()).slice(0, 4);
  const code = `${div.prefix}-${year}-${String(number).padStart(4, '0')}`;
  const sections = [...new Set([...(div.sections || []), ...(b.sections || [])])];
  const r = db.prepare(`INSERT INTO cases (number,code,division,title,status,priority,created_by,lead_id,opened_at,incident_date,incident_time,incident_tz,location,bureau_units,other_agencies,summary,sections,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(number, code, div.id, String(b.title).trim().slice(0, 200), 'Open', b.priority || 'Standard',
    req.user.id, req.user.id, b.opened_at || new Date().toISOString().slice(0, 10), b.incident_date || '', b.incident_time || '', b.incident_tz || '', b.location || '',
    JSON.stringify([div.name]), JSON.stringify(b.other_agencies || []), b.summary || '', JSON.stringify(sections), now(), now());
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO case_members (case_id,user_id,role) VALUES (?,?,?)').run(id, req.user.id, 'Lead Investigator');
  for (const uid of b.assistants || []) {
    if (Number(uid) !== req.user.id) db.prepare('INSERT OR IGNORE INTO case_members (case_id,user_id,role) VALUES (?,?,?)').run(id, Number(uid), 'Assistant');
  }
  audit(id, req.user.id, 'Case opened', `${code} — ${b.title}`);
  res.json({ id, number, code });
});

app.get('/api/cases/:id', requireUser, (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (!canView(req.user, c)) {
    audit(c.id, req.user.id, 'Classified access blocked', '');
    return res.status(403).json({ error: 'This case is classified.', code: 'classified', number: c.number, case_code: c.code, units: unitNames(c.secure.units) });
  }
  res.json(caseBundle(c, req.user));
});

const CASE_FIELDS = ['title', 'priority', 'opened_at', 'incident_date', 'incident_time', 'incident_tz', 'location', 'bureau_units', 'other_agencies', 'summary', 'scene', 'coroner', 'sections', 'status', 'lead_id'];
app.patch('/api/cases/:id', requireUser, (req, res) => {
  const c = loadCaseForEdit(req, res); if (!c) return;
  const b = req.body || {};
  const sets = []; const vals = [];
  for (const k of CASE_FIELDS) {
    if (!(k in b)) continue;
    let v = b[k];
    if (k === 'status') {
      if (!config.statuses.includes(v)) return res.status(400).json({ error: 'Invalid status' });
      if (v === 'Closed' && !isSup(req.user)) return res.status(403).json({ error: 'Cases are closed through supervisor sign-off (Review & Closure).' });
      if (v !== c.status) audit(c.id, req.user.id, 'Status changed', `${c.status} → ${v}`);
    }
    if (k === 'lead_id') {
      if (!canManageMembers(req.user, c)) return res.status(403).json({ error: 'Only the lead or a supervisor can reassign the lead.' });
      v = Number(v);
      if (db.prepare('SELECT rank FROM users WHERE id=?').get(v)?.rank === 'trainee') return res.status(400).json({ error: 'A trainee can’t be the Lead Investigator.' });
      db.prepare('INSERT OR IGNORE INTO case_members (case_id,user_id,role) VALUES (?,?,?)').run(c.id, v, 'Lead Investigator');
      db.prepare("UPDATE case_members SET role='Lead Investigator' WHERE case_id=? AND user_id=?").run(c.id, v);
      if (c.lead_id && c.lead_id !== v) db.prepare("UPDATE case_members SET role='Assistant' WHERE case_id=? AND user_id=?").run(c.id, c.lead_id);
      audit(c.id, req.user.id, 'Lead reassigned', db.prepare('SELECT display_name FROM users WHERE id=?').get(v)?.display_name);
    }
    if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
    sets.push(`${k}=?`); vals.push(v);
  }
  if (!sets.length) return res.json({ ok: true });
  sets.push('updated_at=?'); vals.push(now());
  db.prepare(`UPDATE cases SET ${sets.join(',')} WHERE id=?`).run(...vals, c.id);
  if (!('status' in b) && !('lead_id' in b)) {
    const what = Object.keys(b).filter((k) => CASE_FIELDS.includes(k)).join(', ');
    audit(c.id, req.user.id, 'Case updated', what);
  }
  res.json({ ok: true });
});

app.delete('/api/cases/:id', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Only supervisors can delete cases.' });
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  for (const f of db.prepare('SELECT stored_name FROM files WHERE case_id=?').all(c.id)) fs.rmSync(path.join(UPLOAD_DIR, f.stored_name), { force: true });
  db.prepare('DELETE FROM cases WHERE id=?').run(c.id);
  audit(null, req.user.id, 'Case deleted', `${c.code} — ${c.title}`);
  res.json({ ok: true });
});

// members
app.post('/api/cases/:id/members', requireUser, (req, res) => {
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (!canManageMembers(req.user, c)) return res.status(403).json({ error: 'Only the case lead/creator or a supervisor can add investigators.' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.body.user_id));
  if (!u) return res.status(400).json({ error: 'Unknown user' });
  if (u.active === 0) return res.status(400).json({ error: `${u.display_name} has been removed from the roster.` });
  if (isViewer(u)) return res.status(400).json({ error: `${u.display_name} has view-only access and can't be added to cases.` });
  db.prepare('INSERT OR REPLACE INTO case_members (case_id,user_id,role) VALUES (?,?,?)').run(c.id, u.id, req.body.role || 'Assistant');
  audit(c.id, req.user.id, 'Investigator added', `${u.display_name} (${req.body.role || 'Assistant'})`);
  touch(c.id); res.json({ ok: true });
});
app.delete('/api/cases/:id/members/:uid', requireUser, (req, res) => {
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (!canManageMembers(req.user, c)) return res.status(403).json({ error: 'Forbidden' });
  if (Number(req.params.uid) === c.lead_id) return res.status(400).json({ error: 'Reassign the lead before removing them.' });
  const u = db.prepare('SELECT display_name FROM users WHERE id=?').get(Number(req.params.uid));
  db.prepare('DELETE FROM case_members WHERE case_id=? AND user_id=?').run(c.id, Number(req.params.uid));
  audit(c.id, req.user.id, 'Investigator removed', u?.display_name);
  touch(c.id); res.json({ ok: true });
});

// ---------- persons ----------
const PERSON_FIELDS = ['name', 'ssn', 'dob', 'gender', 'phone', 'address', 'description', 'background', 'affiliations', 'flags', 'photo_id'];
function insertPerson(b, uid, allowGang) {
  const r = db.prepare(`INSERT INTO persons (name,ssn,dob,gender,phone,address,description,background,affiliations,flags,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(String(b.name || '').trim(), b.ssn || '', b.dob || '', b.gender || '', b.phone || '', b.address || '', b.description || '', b.background || '', b.affiliations || '', JSON.stringify(b.flags || []), uid, now(), now());
  const id = Number(r.lastInsertRowid);
  if (b.gang_id && allowGang) gangs.setPrimaryGang(id, b.gang_id, uid);
  return id;
}
app.get('/api/persons', requireUser, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare(`SELECT p.*, g.name gang_name, g.abbreviation gang_abbr, (SELECT COUNT(DISTINCT case_id) FROM case_persons WHERE person_id=p.id) case_count FROM persons p LEFT JOIN gangs g ON g.id=p.gang_id
     WHERE p.name LIKE ? OR p.ssn LIKE ? OR p.phone LIKE ? ORDER BY p.name LIMIT 300`).all(q, q, q).map((p) => ({ ...p, flags: J(p.flags, []) })).map((p) => (canSeeGangs(req.user) ? p : stripGang(p))));
});
app.post('/api/persons', requireUser, (req, res) => {
  if (isViewer(req.user)) return res.status(403).json({ error: VIEW_ONLY_MSG });
  if (!req.body?.name?.trim()) return res.status(400).json({ error: 'Name is required' });
  res.json({ id: insertPerson(req.body, req.user.id, canSeeGangs(req.user)) });
});
app.get('/api/persons/:id', requireUser, (req, res) => {
  const p = db.prepare('SELECT * FROM persons WHERE id=?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!canSeeGangs(req.user)) { delete p.gang_id; p.gangs = []; } else p.gangs = db.prepare('SELECT m.rank, m.confidence, g.id, g.name, g.abbreviation, g.status FROM gang_members m JOIN gangs g ON g.id=m.gang_id WHERE m.person_id=?').all(p.id);
  p.flags = J(p.flags, []);
  const cases = db.prepare(`SELECT cp.role, cp.notes, c.id, c.number, c.code, c.title, c.status, c.division, c.opened_at, c.secure, c.lead_id, c.created_by FROM case_persons cp JOIN cases c ON c.id=cp.case_id WHERE cp.person_id=? ORDER BY c.number DESC`).all(p.id)
    .map(({ secure, lead_id, created_by, ...c }) => (canView(req.user, { ...c, secure, lead_id, created_by }) ? { ...c, classified: isClassified({ secure }) } : { ...c, title: 'CLASSIFIED', notes: '', role: 'Restricted', status: 'Classified', restricted: true }));
  const files = db.prepare('SELECT * FROM files WHERE person_id=? ORDER BY id DESC').all(p.id);
  res.json({ person: p, cases, files });
});
app.patch('/api/persons/:id', requireUser, (req, res) => {
  if (isViewer(req.user)) return res.status(403).json({ error: VIEW_ONLY_MSG });
  const sets = []; const vals = [];
  for (const k of PERSON_FIELDS) if (k in req.body) { sets.push(`${k}=?`); vals.push(k === 'flags' ? JSON.stringify(req.body[k] || []) : req.body[k]); }
  if (sets.length) db.prepare(`UPDATE persons SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), Number(req.params.id));
  if ('gang_id' in req.body && canSeeGangs(req.user)) gangs.setPrimaryGang(Number(req.params.id), req.body.gang_id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/cases/:id/persons', requireUser, (req, res) => {
  const c = loadCaseForEdit(req, res); if (!c) return;
  const b = req.body || {};
  if (!config.personRoles.includes(b.role)) return res.status(400).json({ error: 'Choose a role' });
  let pid = Number(b.person_id);
  if (!pid) {
    if (!b.person?.name?.trim()) return res.status(400).json({ error: 'Name is required' });
    pid = insertPerson(b.person, req.user.id, canSeeGangs(req.user));
  }
  try {
    db.prepare('INSERT INTO case_persons (case_id,person_id,role,notes) VALUES (?,?,?,?)').run(c.id, pid, b.role, b.notes || '');
  } catch { return res.status(400).json({ error: 'That person is already listed with that role.' }); }
  const name = db.prepare('SELECT name FROM persons WHERE id=?').get(pid)?.name;
  audit(c.id, req.user.id, `${b.role} added`, name);
  touch(c.id); res.json({ ok: true, person_id: pid });
});
app.patch('/api/case-persons/:lid', requireUser, (req, res) => {
  const l = db.prepare('SELECT * FROM case_persons WHERE id=?').get(Number(req.params.lid));
  if (!l) return res.status(404).end();
  req.params.id = l.case_id; const c = loadCaseForEdit(req, res); if (!c) return;
  db.prepare('UPDATE case_persons SET notes=COALESCE(?,notes), custody_status=COALESCE(?,custody_status), role=COALESCE(?,role) WHERE id=?')
    .run(req.body.notes ?? null, req.body.custody_status ?? null, req.body.role ?? null, l.id);
  touch(c.id); res.json({ ok: true });
});
app.delete('/api/case-persons/:lid', requireUser, (req, res) => {
  const l = db.prepare('SELECT cp.*, p.name FROM case_persons cp JOIN persons p ON p.id=cp.person_id WHERE cp.id=?').get(Number(req.params.lid));
  if (!l) return res.status(404).end();
  req.params.id = l.case_id; const c = loadCaseForEdit(req, res); if (!c) return;
  db.prepare('DELETE FROM case_persons WHERE id=?').run(l.id);
  audit(c.id, req.user.id, `${l.role} removed`, l.name);
  touch(c.id); res.json({ ok: true });
});

// ---------- generic case items ----------
const KINDS = ['evidence', 'interview', 'note', 'timeline', 'warrant', 'bolo', 'vehicle', 'charge', 'custom', 'surveillance', 'informant', 'operation', 'financial', 'medialink'];
const KIND_LABEL = { evidence: 'Evidence', interview: 'Interview', note: 'Note', timeline: 'Timeline event', warrant: 'Warrant', bolo: 'BOLO', vehicle: 'Vehicle', charge: 'Charge', custom: 'Section', surveillance: 'Surveillance entry', informant: 'Informant entry', operation: 'Operation', financial: 'Financial record', medialink: 'Media link' };
const TITLE_MSG = 'Add a title describing what the video shows (e.g. “Bodycam — suspect fleeing the scene”).';
const hasTitle = (t) => String(t || '').trim().length >= 3;
const validUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(String(u)).protocol); } catch { return false; } };
function itemLabel(kind, d) {
  return [d.ed, d.code, d.title, d.name, d.type, d.plate, d.subject].filter(Boolean).slice(0, 2).join(' — ') || '';
}
app.post('/api/cases/:id/items', requireUser, (req, res) => {
  const c = loadCaseForEdit(req, res); if (!c) return;
  const { kind } = req.body; let data = req.body.data || {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Bad kind' });
  if (kind === 'evidence') {
    const n = db.prepare("SELECT COUNT(*) n FROM items WHERE case_id=? AND kind='evidence'").get(c.id).n;
    const used = new Set(db.prepare("SELECT json_extract(data,'$.ed') ed FROM items WHERE case_id=? AND kind='evidence'").all(c.id).map((r) => r.ed));
    let k = n + 1; while (used.has(`ED-${String(k).padStart(2, '0')}`)) k++;
    data.ed = data.ed || `ED-${String(k).padStart(2, '0')}`;
  }
  if (kind === 'note') data.author = data.author || req.user.display_name;
  if (kind === 'medialink' && !validUrl(data.url)) return res.status(400).json({ error: 'Enter a full link starting with https://' });
  if (kind === 'medialink' && !hasTitle(data.title)) return res.status(400).json({ error: TITLE_MSG });
  const r = db.prepare('INSERT INTO items (case_id,kind,data,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(c.id, kind, JSON.stringify(data), req.user.id, now(), now());
  audit(c.id, req.user.id, `${KIND_LABEL[kind]} added`, itemLabel(kind, data));
  touch(c.id);
  res.json({ id: Number(r.lastInsertRowid), data });
});
function loadItem(req, res) {
  const it = db.prepare('SELECT * FROM items WHERE id=?').get(Number(req.params.itemId));
  if (!it) { res.status(404).json({ error: 'Not found' }); return null; }
  req.params.id = it.case_id;
  const c = loadCaseForEdit(req, res); if (!c) return null;
  it.data = J(it.data, {});
  return { it, c };
}
app.patch('/api/items/:itemId', requireUser, (req, res) => {
  const r = loadItem(req, res); if (!r) return;
  const data = { ...r.it.data, ...(req.body.data || {}) };
  if (r.it.kind === 'medialink' && !validUrl(data.url)) return res.status(400).json({ error: 'Enter a full link starting with https://' });
  if (r.it.kind === 'medialink' && !hasTitle(data.title)) return res.status(400).json({ error: TITLE_MSG });
  db.prepare('UPDATE items SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(data), now(), r.it.id);
  if (!req.body.silent) audit(r.c.id, req.user.id, `${KIND_LABEL[r.it.kind]} updated`, itemLabel(r.it.kind, data));
  touch(r.c.id);
  res.json({ ok: true, data });
});
app.delete('/api/items/:itemId', requireUser, (req, res) => {
  const r = loadItem(req, res); if (!r) return;
  db.prepare('DELETE FROM items WHERE id=?').run(r.it.id);
  audit(r.c.id, req.user.id, `${KIND_LABEL[r.it.kind]} deleted`, itemLabel(r.it.kind, r.it.data));
  touch(r.c.id);
  res.json({ ok: true });
});

// ---------- files ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024 },
});
// ---- upload limits ----
// MAX_UPLOAD_MB      per file (default 500)
// MAX_FILES_PER_CASE uploads per case file (default 15)
// MEDIA_LIMIT_MB     optional total cap across all cases (unset = no total cap)
const MB = 1024 * 1024;
const perFile = () => Number(process.env.MAX_UPLOAD_MB || 500) * MB;
const perCase = () => Number(process.env.MAX_FILES_PER_CASE || 15);
const mediaLimit = () => (process.env.MEDIA_LIMIT_MB ? Number(process.env.MEDIA_LIMIT_MB) * MB : null);
const mediaUsed = () => db.prepare('SELECT COALESCE(SUM(size),0) n FROM files').get().n;
// Only photo uploads count toward the per-case limit (media links and other file types don't).
const caseCount = (id) => db.prepare("SELECT COUNT(*) n FROM files WHERE case_id=? AND mime LIKE 'image/%'").get(id).n;
const isPhoto = (f) => /^image\//.test(f.mimetype || f.mime || '');
const fullMsg = () => `Media storage is full (${Math.round(mediaUsed() / MB)} MB of ${Math.round(mediaLimit() / MB)} MB used). Delete old files or ask command to raise the limit.`;
const caseFullMsg = (id) => `This case already has ${caseCount(id)} of ${perCase()} allowed photos. Delete a photo before adding more, or add the media as a link.`;
function checkQuota(req, res, next) {
  const lim = mediaLimit();
  if (lim && mediaUsed() + Number(req.headers['content-length'] || 0) > lim) return res.status(413).json({ error: fullMsg() });
  next();
}
// After saving: if the batch broke a limit, remove the new files again.
function enforceQuota(files, res, caseId) {
  let err = null;
  const photos = files.filter(isPhoto).length;
  if (caseId && photos && caseCount(caseId) + photos > perCase()) err = caseCount(caseId) >= perCase() ? caseFullMsg(caseId) : `Only ${perCase() - caseCount(caseId)} more photo(s) allowed on this case (limit ${perCase()}). Nothing was uploaded.`;
  const lim = mediaLimit();
  if (!err && lim && mediaUsed() + files.reduce((a, f) => a + f.size, 0) > lim) err = fullMsg();
  if (!err) return true;
  for (const f of files) fs.rmSync(f.path, { force: true });
  res.status(413).json({ error: err });
  return false;
}
app.get('/api/storage', requireUser, (req, res) => res.json({ used: mediaUsed(), limit: mediaLimit(), perFile: perFile(), perCase: perCase() }));

app.post('/api/cases/:id/files', requireUser, (req, res, next) => {
  const c = loadCaseForEdit(req, res); if (!c) return;
  req.caseObj = c; next();
}, checkQuota, upload.array('files', 20), (req, res) => {
  // Uploaded videos must carry a title (sent as the caption)
  if ((req.files || []).some((f) => /^video\//.test(f.mimetype)) && !hasTitle(req.body.caption)) {
    for (const f of req.files) fs.rmSync(f.path, { force: true });
    return res.status(400).json({ error: TITLE_MSG });
  }
  if (!enforceQuota(req.files || [], res, req.caseObj.id)) return;
  const out = [];
  for (const f of req.files || []) {
    const r = db.prepare('INSERT INTO files (case_id,stored_name,original_name,mime,size,caption,evidence_ref,taken_at,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(req.caseObj.id, f.filename, f.originalname, f.mimetype, f.size, req.body.caption || '', req.body.evidence_ref || '', req.body.taken_at || '', req.user.id, now());
    out.push(Number(r.lastInsertRowid));
  }
  audit(req.caseObj.id, req.user.id, 'Media uploaded', (req.files || []).map((f) => f.originalname).join(', '));
  touch(req.caseObj.id);
  res.json({ ids: out });
});
app.post('/api/persons/:pid/photo', requireUser, (req, res, next) => (isViewer(req.user) ? res.status(403).json({ error: VIEW_ONLY_MSG }) : next()), checkQuota, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  if (!enforceQuota([req.file], res)) return;
  const r = db.prepare('INSERT INTO files (person_id,stored_name,original_name,mime,size,caption,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(Number(req.params.pid), req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, 'Photo', req.user.id, now());
  db.prepare('UPDATE persons SET photo_id=?, updated_at=? WHERE id=?').run(Number(r.lastInsertRowid), now(), Number(req.params.pid));
  res.json({ id: Number(r.lastInsertRowid) });
});
app.get('/api/files/:fid', requireUser, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(Number(req.params.fid));
  if (!f) return res.status(404).end();
  if (f.case_id && !canView(req.user, getCase(f.case_id))) return res.status(403).json({ error: 'This file belongs to a classified case.' });
  res.set('Content-Type', f.mime || 'application/octet-stream');
  res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(f.original_name || 'file')}"`);
  res.sendFile(path.join(UPLOAD_DIR, f.stored_name));
});
app.patch('/api/files/:fid', requireUser, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(Number(req.params.fid)); if (!f) return res.status(404).end();
  req.params.id = f.case_id; const c = loadCaseForEdit(req, res); if (!c) return;
  if (/^video\//.test(f.mime || '') && req.body.caption !== undefined && !hasTitle(req.body.caption)) return res.status(400).json({ error: TITLE_MSG });
  db.prepare('UPDATE files SET caption=COALESCE(?,caption), evidence_ref=COALESCE(?,evidence_ref), taken_at=COALESCE(?,taken_at) WHERE id=?')
    .run(req.body.caption ?? null, req.body.evidence_ref ?? null, req.body.taken_at ?? null, f.id);
  res.json({ ok: true });
});
app.delete('/api/files/:fid', requireUser, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(Number(req.params.fid)); if (!f) return res.status(404).end();
  req.params.id = f.case_id; const c = loadCaseForEdit(req, res); if (!c) return;
  db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  fs.rmSync(path.join(UPLOAD_DIR, f.stored_name), { force: true });
  audit(c.id, req.user.id, 'Media deleted', f.original_name);
  res.json({ ok: true });
});

// ---------- linked cases ----------
app.post('/api/cases/:id/links', requireUser, (req, res) => {
  const c = loadCaseForEdit(req, res); if (!c) return;
  const ref = String(req.body.ref || '').trim().replace(/^#/, '');
  const other = db.prepare('SELECT * FROM cases WHERE CAST(number AS TEXT)=? OR code=? COLLATE NOCASE').get(ref, ref);
  if (!other) return res.status(400).json({ error: 'No case found with that number or code.' });
  if (other.id === c.id) return res.status(400).json({ error: 'A case cannot be linked to itself.' });
  if (!canView(req.user, getCase(other.id))) return res.status(403).json({ error: 'That case is classified — you don’t have access to link it.' });
  db.prepare('INSERT INTO case_links (a,b,reason,created_by,created_at) VALUES (?,?,?,?,?)').run(c.id, other.id, req.body.reason || '', req.user.id, now());
  audit(c.id, req.user.id, 'Case linked', `${other.code} ${req.body.reason ? '— ' + req.body.reason : ''}`);
  audit(other.id, req.user.id, 'Case linked', `${c.code} ${req.body.reason ? '— ' + req.body.reason : ''}`);
  touch(c.id); res.json({ ok: true });
});
app.delete('/api/links/:lid', requireUser, (req, res) => {
  const l = db.prepare('SELECT * FROM case_links WHERE id=?').get(Number(req.params.lid)); if (!l) return res.status(404).end();
  req.params.id = l.a; const c = loadCaseForEdit(req, res); if (!c) return;
  db.prepare('DELETE FROM case_links WHERE id=?').run(l.id);
  audit(c.id, req.user.id, 'Case unlinked', '');
  res.json({ ok: true });
});

// ---------- classification (Lead Investigator only) ----------
app.post('/api/cases/:id/classify', requireUser, (req, res) => {
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (c.lead_id !== req.user.id) return res.status(403).json({ error: 'Only the Lead Investigator can classify this case.' });
  const units = [...new Set((req.body.units || []).filter((u) => config.divisions.some((d) => d.id === u)))];
  if (!units.length) return res.status(400).json({ error: 'Choose at least one unit that may access the case.' });
  const secure = { on: 1, units, by: req.user.display_name, by_id: req.user.id, at: now(), reason: String(req.body.reason || '').slice(0, 300) };
  db.prepare('UPDATE cases SET secure=?, updated_at=? WHERE id=?').run(JSON.stringify(secure), now(), c.id);
  audit(c.id, req.user.id, c.secure.on ? 'Classification updated' : 'Case classified', `Restricted to: ${unitNames(units).join(', ')}${secure.reason ? ' — ' + secure.reason : ''}`);
  res.json({ ok: true });
});
app.post('/api/cases/:id/declassify', requireUser, (req, res) => {
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (c.lead_id !== req.user.id) return res.status(403).json({ error: 'Only the Lead Investigator can remove the classification.' });
  db.prepare("UPDATE cases SET secure='{}', updated_at=? WHERE id=?").run(now(), c.id);
  audit(c.id, req.user.id, 'Case declassified', '');
  res.json({ ok: true });
});

// ---------- closure workflow ----------
app.post('/api/cases/:id/closure/submit', requireUser, (req, res) => {
  const c = loadCaseForEdit(req, res); if (!c) return;
  if (isTrainee(req.user)) return res.status(403).json({ error: 'Trainees can’t sign a case for closure. The lead investigator must sign.' });
  if (!req.body.agree) return res.status(400).json({ error: 'You must affirm the declaration to sign.' });
  const closure = { ...c.closure, requested: 1, requested_at: now(), disposition: req.body.disposition || '', closing_summary: req.body.closing_summary || '',
    detective_sig: { user_id: req.user.id, name: req.user.display_name, rank: req.user.rank, signed_at: now() }, rejected: null };
  db.prepare('UPDATE cases SET closure=?, updated_at=? WHERE id=?').run(JSON.stringify(closure), now(), c.id);
  audit(c.id, req.user.id, 'Submitted for closure', 'Detective declaration signed');
  res.json({ ok: true });
});
app.post('/api/cases/:id/closure/withdraw', requireUser, (req, res) => {
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (!(isSup(req.user) || c.closure?.detective_sig?.user_id === req.user.id || c.lead_id === req.user.id)) return res.status(403).json({ error: 'Forbidden' });
  const closure = { ...c.closure, requested: 0, detective_sig: null };
  db.prepare('UPDATE cases SET closure=?, updated_at=? WHERE id=?').run(JSON.stringify(closure), now(), c.id);
  audit(c.id, req.user.id, 'Closure request withdrawn', '');
  res.json({ ok: true });
});
app.post('/api/cases/:id/closure/approve', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Only a Bureau Supervisor can sign off.' });
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (!c.closure?.requested) return res.status(400).json({ error: 'This case has not been submitted for closure.' });
  const closure = { ...c.closure, requested: 0, approved: 1, supervisor_sig: { user_id: req.user.id, name: req.user.display_name, rank: req.user.rank, signed_at: now(), comment: req.body.comment || '' } };
  db.prepare("UPDATE cases SET closure=?, status='Closed', updated_at=? WHERE id=?").run(JSON.stringify(closure), now(), c.id);
  audit(c.id, req.user.id, 'Supervisor sign-off', 'Case closed');
  res.json({ ok: true });
});
app.post('/api/cases/:id/closure/reject', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Only a Bureau Supervisor can return a case.' });
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  const closure = { ...c.closure, requested: 0, detective_sig: null, rejected: { by: req.user.display_name, at: now(), reason: req.body.reason || '' } };
  db.prepare('UPDATE cases SET closure=?, updated_at=? WHERE id=?').run(JSON.stringify(closure), now(), c.id);
  audit(c.id, req.user.id, 'Returned by supervisor', req.body.reason || '');
  res.json({ ok: true });
});
app.post('/api/cases/:id/reopen', requireUser, (req, res) => {
  if (!isSup(req.user)) return res.status(403).json({ error: 'Only a Bureau Supervisor can reopen a case.' });
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  const closure = { history: [...(c.closure.history || []), { ...c.closure, history: undefined }] };
  db.prepare("UPDATE cases SET closure=?, status='Open', updated_at=? WHERE id=?").run(JSON.stringify(closure), now(), c.id);
  audit(c.id, req.user.id, 'Case reopened', req.body.reason || '');
  res.json({ ok: true });
});

// ---------- exports ----------
function sendDocx(res, buf, name) {
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
}
app.get('/api/cases/:id/report.docx', requireUser, async (req, res) => {
  const c = getCase(req.params.id); if (!c) return res.status(404).end();
  if (!canView(req.user, c)) return res.status(403).json({ error: 'This case is classified.' });
  try {
    const buf = await buildCaseReport(caseBundle(c, req.user), { config, penalCode, user: req.user, uploadDir: UPLOAD_DIR });
    audit(c.id, req.user.id, 'Report downloaded', '');
    sendDocx(res, buf, `${c.code} Case Report.docx`);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Report generation failed: ' + e.message }); }
});
app.get('/api/items/:itemId/warrant.docx', requireUser, async (req, res) => {
  const it = db.prepare("SELECT * FROM items WHERE id=? AND kind='warrant'").get(Number(req.params.itemId));
  if (!it) return res.status(404).end();
  const c = getCase(it.case_id);
  if (!canView(req.user, c)) return res.status(403).json({ error: 'This case is classified.' });
  try {
    const buf = await buildWarrantPacket(caseBundle(c, req.user), { ...it, data: J(it.data, {}) }, { config, penalCode, user: req.user, uploadDir: UPLOAD_DIR });
    audit(c.id, req.user.id, 'Warrant packet downloaded', J(it.data, {}).type || '');
    sendDocx(res, buf, `${c.code} ${J(it.data, {}).type || 'Warrant'} Packet.docx`);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Warrant packet failed: ' + e.message }); }
});

gangs.mount(app, { requireUser, isSup, isViewer, audit, canView, getCase, canSeeGangs });

// ---------- static client ----------
const dist = path.join(__dirname, '..', 'dist');
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img')));
if (fs.existsSync(dist)) {
  // Hashed build files can be cached forever; the page itself must always be re-checked
  // so phones pick up new deployments immediately.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
  app.get(/^\/(?!api|auth).*/, (req, res) => { res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); res.sendFile(path.join(dist, 'index.html')); });
}
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File is too large. The limit is ${Math.round(perFile() / MB)} MB per file.` : (err.message || 'Server error') });
});

app.listen(PORT, () => console.log(`BCDB Case Management running on http://localhost:${PORT}${auth.DEV ? '  [DEV LOGIN ENABLED]' : ''}`));
