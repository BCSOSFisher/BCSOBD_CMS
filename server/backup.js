// Full backup download: the whole database plus every uploaded file, as one .zip.
// Access: Department Administration, the Bureau Lead, and any Discord IDs listed in BACKUP_DISCORD_IDS.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const { db, UPLOAD_DIR } = require('./db');

const BACKUP_RANKS = ['admin', 'bureau_lead'];
const extraIds = () => String(process.env.BACKUP_DISCORD_IDS || '').split(/[\s,]+/).filter(Boolean);
const canBackup = (u) => !!u && u.active !== 0 && (BACKUP_RANKS.includes(u.rank) || extraIds().includes(String(u.discord_id)));

function uploadStats() {
  let files = 0, bytes = 0;
  for (const f of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!f.isFile()) continue;
    files++; bytes += fs.statSync(path.join(UPLOAD_DIR, f.name)).size;
  }
  return { files, bytes };
}
const count = (t) => { try { return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { return 0; } };

function mount(app, { requireUser, audit }) {
  const guard = (req, res, next) => (canBackup(req.user) ? next() : res.status(403).json({ error: 'Only Department Administration and the Bureau Lead can download backups.' }));

  app.get('/api/backup/info', requireUser, guard, (req, res) => {
    const dbFile = db.prepare('PRAGMA page_count').get().page_count * db.prepare('PRAGMA page_size').get().page_size;
    const history = db.prepare(`SELECT a.at, a.detail, u.display_name FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.action='Backup downloaded' ORDER BY a.id DESC LIMIT 10`).all();
    res.json({ dbBytes: dbFile, uploads: uploadStats(), counts: { cases: count('cases'), persons: count('persons'), vehicles: count('vehicles'), users: count('users') }, history });
  });

  app.get('/api/backup/download', requireUser, guard, async (req, res) => {
    // A consistent snapshot of the live database (safe while people are using the site)
    const tmp = path.join(os.tmpdir(), `bcdb-snap-${crypto.randomBytes(6).toString('hex')}.sqlite`);
    try { db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); }
    catch (e) { console.error('Backup snapshot failed', e); return res.status(500).json({ error: 'Could not create the backup. Try again.' }); }
    const cleanup = () => fs.rm(tmp, { force: true }, () => {});

    const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const name = `BCDB-backup-${stamp}.zip`;
    const up = uploadStats();
    const manifest = {
      created_at: new Date().toISOString(), created_by: req.user.display_name, version: process.env.RAILWAY_GIT_COMMIT_SHA || 'local',
      counts: { cases: count('cases'), persons: count('persons'), vehicles: count('vehicles'), users: count('users'), files: up.files },
      restore: 'Stop the service, replace bcdb.sqlite and the uploads/ folder on the /data volume with the copies in this archive, then start the service again. Delete any bcdb.sqlite-wal / bcdb.sqlite-shm files first.',
    };
    audit(null, req.user.id, 'Backup downloaded', `${manifest.counts.cases} case${manifest.counts.cases === 1 ? '' : 's'} · ${up.files} file${up.files === 1 ? '' : 's'}`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.on('warning', (e) => console.warn('Backup warning', e));
    zip.on('error', (e) => { console.error('Backup failed', e); cleanup(); res.destroy(e); });
    res.on('close', cleanup);
    zip.pipe(res);
    zip.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    zip.file(tmp, { name: 'bcdb.sqlite' });
    // Photos and documents are already compressed — store them as-is so big backups stay fast
    zip.directory(UPLOAD_DIR, 'uploads', (entry) => ({ ...entry, store: true }));
    await zip.finalize();
  });
}

module.exports = { mount, canBackup };
