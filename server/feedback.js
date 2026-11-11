// Feature requests and problem reports from detectives, reviewed by command.
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  page TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  response TEXT DEFAULT '',
  responded_by INTEGER,
  responded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const KINDS = ['Suggestion', 'Problem', 'Question'];
const STATUSES = ['New', 'Under Review', 'Planned', 'Done', 'Declined'];
const now = () => new Date().toISOString();
const SELECT = `SELECT f.*, u.display_name author, u.rank author_rank, r.display_name responder FROM feedback f
  LEFT JOIN users u ON u.id=f.user_id LEFT JOIN users r ON r.id=f.responded_by`;

function mount(app, { requireUser, isSup, notif, commandRanks }) {
  app.get('/api/feedback', requireUser, (req, res) => {
    const mine = db.prepare(`${SELECT} WHERE f.user_id=? ORDER BY f.id DESC LIMIT 50`).all(req.user.id);
    const out = { kinds: KINDS, statuses: STATUSES, mine };
    if (isSup(req.user)) {
      out.all = db.prepare(`${SELECT} ORDER BY CASE f.status WHEN 'New' THEN 0 WHEN 'Under Review' THEN 1 WHEN 'Planned' THEN 2 ELSE 3 END, f.id DESC LIMIT 300`).all();
      out.newCount = db.prepare("SELECT COUNT(*) n FROM feedback WHERE status='New'").get().n;
    }
    res.json(out);
  });

  app.post('/api/feedback', requireUser, (req, res) => {
    const b = req.body || {};
    const kind = KINDS.includes(b.kind) ? b.kind : 'Suggestion';
    const title = String(b.title || '').trim().slice(0, 140);
    const body = String(b.body || '').trim().slice(0, 4000);
    if (title.length < 3) return res.status(400).json({ error: 'Give it a short title.' });
    // Light spam guard: 10 submissions per person per day
    const today = db.prepare("SELECT COUNT(*) n FROM feedback WHERE user_id=? AND created_at >= ?").get(req.user.id, new Date(Date.now() - 864e5).toISOString()).n;
    if (today >= 10) return res.status(429).json({ error: 'You’ve sent 10 today — please wait until tomorrow.' });
    const r = db.prepare('INSERT INTO feedback (user_id,kind,title,body,page,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(req.user.id, kind, title, body, String(b.page || '').slice(0, 200), now(), now());
    notif.notify(notif.commandUsers(commandRanks()), { kind: 'feedback', title: `New ${kind.toLowerCase()}: ${title}`, body: `From ${req.user.display_name}`, actorId: req.user.id });
    res.json({ id: Number(r.lastInsertRowid) });
  });

  // Command: change status and/or reply. The submitter is notified.
  app.patch('/api/feedback/:id', requireUser, (req, res) => {
    if (!isSup(req.user)) return res.status(403).json({ error: 'Command only' });
    const f = db.prepare('SELECT * FROM feedback WHERE id=?').get(Number(req.params.id)); if (!f) return res.status(404).end();
    const status = STATUSES.includes(req.body.status) ? req.body.status : f.status;
    const response = req.body.response !== undefined ? String(req.body.response).trim().slice(0, 2000) : f.response;
    db.prepare('UPDATE feedback SET status=?, response=?, responded_by=?, responded_at=?, updated_at=? WHERE id=?').run(status, response, req.user.id, now(), now(), f.id);
    if (status !== f.status || response !== f.response) {
      notif.notify([f.user_id], { kind: 'feedback', title: `Your ${f.kind.toLowerCase()} “${f.title}” — ${status}`, body: response && response !== f.response ? response : '', actorId: req.user.id });
    }
    res.json({ ok: true });
  });

  // Submitter can withdraw their own while it's still New; command can delete any
  app.delete('/api/feedback/:id', requireUser, (req, res) => {
    const f = db.prepare('SELECT * FROM feedback WHERE id=?').get(Number(req.params.id)); if (!f) return res.status(404).end();
    if (!(isSup(req.user) || (f.user_id === req.user.id && f.status === 'New'))) return res.status(403).json({ error: 'Forbidden' });
    db.prepare('DELETE FROM feedback WHERE id=?').run(f.id);
    res.json({ ok: true });
  });
}

module.exports = { mount };
