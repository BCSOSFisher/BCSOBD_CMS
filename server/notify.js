// In-app notifications (bell icon). Nothing is sent to Discord.
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  actor_id INTEGER,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, id);
`);
// Keep the table small: drop read notifications after 30 days, everything after 90.
db.exec(`DELETE FROM notifications WHERE (read_at IS NOT NULL AND created_at < datetime('now','-30 days')) OR created_at < datetime('now','-90 days')`);

const now = () => new Date().toISOString();
const ids = (rows) => rows.map((r) => r.id ?? r.user_id);

// Investigators assigned to a case
const caseMembers = (caseId) => ids(db.prepare('SELECT user_id FROM case_members WHERE case_id=?').all(caseId));
// Everyone with command rank (Department Administration, Bureau Lead, Co-Lead, Supervisor)
const commandUsers = (ranks) => ids(db.prepare(`SELECT id FROM users WHERE active!=0 AND rank IN (${ranks.map(() => '?').join(',')})`).all(...ranks));

// Send one notification to each user (skipping whoever caused it, and removed users)
function notify(userIds, { caseId = null, kind, title, body = '', actorId = null }) {
  const ins = db.prepare('INSERT INTO notifications (user_id,case_id,kind,title,body,actor_id,created_at) VALUES (?,?,?,?,?,?,?)');
  const active = db.prepare('SELECT active FROM users WHERE id=?');
  for (const uid of new Set(userIds.filter(Boolean).map(Number))) {
    if (uid === actorId) continue;
    const u = active.get(uid);
    if (!u || u.active === 0) continue;
    ins.run(uid, caseId, kind, String(title).slice(0, 200), String(body || '').slice(0, 400), actorId, now());
  }
}

function mount(app, { requireUser }) {
  app.get('/api/notifications', requireUser, (req, res) => {
    const items = db.prepare(`SELECT n.*, c.code case_code, c.number case_number, c.title case_title, u.display_name actor_name
      FROM notifications n LEFT JOIN cases c ON c.id=n.case_id LEFT JOIN users u ON u.id=n.actor_id
      WHERE n.user_id=? ORDER BY n.id DESC LIMIT 40`).all(req.user.id);
    const unread = db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id).n;
    res.json({ items, unread });
  });
  // Mark one (body.id) or all as read
  app.post('/api/notifications/read', requireUser, (req, res) => {
    if (req.body?.id) db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL').run(now(), Number(req.body.id), req.user.id);
    else db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(), req.user.id);
    res.json({ ok: true });
  });
  app.delete('/api/notifications', requireUser, (req, res) => {
    db.prepare('DELETE FROM notifications WHERE user_id=? AND read_at IS NOT NULL').run(req.user.id);
    res.json({ ok: true });
  });
}

module.exports = { notify, caseMembers, commandUsers, mount };
