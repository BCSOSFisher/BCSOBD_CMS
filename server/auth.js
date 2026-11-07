// Discord OAuth2 login + guild role → rank mapping.
// Uses the "guilds.members.read" scope, so no bot is required: we read the signed-in
// user's own member record (roles + server nickname) in your Discord server.
const crypto = require('crypto');
const { db } = require('./db');

const {
  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID,
  ROLE_BUREAU_LEAD = '', ROLE_CO_LEAD = '', ROLE_SUPERVISOR = '', ROLE_LEAD = '', ROLE_DET2 = '', ROLE_DET1 = '',
} = process.env;
const DEV = process.env.DEV_LOGIN === 'true';
const API = 'https://discord.com/api/v10';
// Shown on /auth/status so you can confirm which update is live
const BUILD = 'mobile-layout-2';

const ids = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
// Unit membership roles: UNIT_ROLE_<DIVISION ID>=roleId (e.g. UNIT_ROLE_HOM, UNIT_ROLE_GNU, UNIT_ROLE_VICE)
const UNIT_ROLES = Object.entries(process.env).filter(([k]) => k.startsWith('UNIT_ROLE_')).map(([k, v]) => [k.slice(10), ids(v)]);
const unitsFromRoles = (roles) => UNIT_ROLES.filter(([, list]) => list.some((r) => roles.includes(r))).map(([u]) => u);
// Highest role wins.
const RANK_ROLES = [
  ['bureau_lead', ids(ROLE_BUREAU_LEAD)],
  ['co_lead', ids(ROLE_CO_LEAD)],
  ['supervisor', ids(ROLE_SUPERVISOR)],
  ['lead', ids(ROLE_LEAD)],
  ['det2', ids(ROLE_DET2)],
  ['det1', ids(ROLE_DET1)],
];
function rankFromRoles(roles) {
  for (const [rank, list] of RANK_ROLES) if (list.some((r) => roles.includes(r))) return rank;
  return null;
}

function upsertUser({ discord_id, username, display_name, avatar, rank, units = [] }) {
  const at = new Date().toISOString();
  const ex = db.prepare('SELECT id FROM users WHERE discord_id=?').get(discord_id);
  if (ex) {
    // Holding a Bureau role again restores someone who was auto-removed (manual removals stay until command restores them)
    db.prepare(`UPDATE users SET username=?, display_name=?, avatar=?, rank=?, units=?, last_login=?,
      active=1, deactivated_at=NULL, deactivated_by=NULL, deactivated_type=NULL, deactivated_reason=NULL WHERE id=?`).run(username, display_name, avatar, rank, JSON.stringify(units), at, ex.id);
    return ex.id;
  }
  return Number(db.prepare('INSERT INTO users (discord_id,username,display_name,avatar,rank,units,last_login) VALUES (?,?,?,?,?,?,?)')
    .run(discord_id, username, display_name, avatar, rank, JSON.stringify(units), at).lastInsertRowid);
}

// Former member tried to sign in without a Bureau role: mark them inactive on the roster
function autoDeactivate(discord_id, reason) {
  const u = db.prepare('SELECT id, active FROM users WHERE discord_id=?').get(discord_id);
  if (!u || u.active === 0) return;
  db.prepare("UPDATE users SET active=0, deactivated_at=?, deactivated_by='System (Discord role check)', deactivated_type='auto', deactivated_reason=? WHERE id=?")
    .run(new Date().toISOString(), reason, u.id);
  db.prepare('INSERT INTO audit (case_id,user_id,action,detail,at) VALUES (NULL,?,?,?,?)').run(u.id, 'Removed from roster', reason, new Date().toISOString());
}
const manuallyRemoved = (discord_id) => db.prepare("SELECT 1 FROM users WHERE discord_id=? AND active=0 AND deactivated_type='manual'").get(discord_id);

function deny(res, msg) {
  res.redirect('/login?error=' + encodeURIComponent(msg));
}
// Access refused (no role / not in server / revoked): full-screen Unauthorized page, and record the attempt
function unauthorized(res, reason, who) {
  const ref = 'BCDB-' + Date.now().toString(36).toUpperCase().slice(-6);
  try {
    const u = who?.id ? db.prepare('SELECT id FROM users WHERE discord_id=?').get(who.id) : null;
    const label = { no_role: 'no Detective Bureau role', not_member: 'not in the department Discord server', revoked: 'access revoked by command' }[reason] || reason;
    db.prepare('INSERT INTO audit (case_id,user_id,action,detail,at) VALUES (NULL,?,?,?,?)')
      .run(u?.id || null, 'Denied sign-in', `${who?.name ? '@' + who.name + ' — ' : ''}${label} (ref ${ref})`, new Date().toISOString());
  } catch (e) { console.error(e); }
  res.redirect(`/denied?reason=${reason}&ref=${ref}`);
}

function mount(app) {
  app.get('/auth/status', (req, res) => res.json({
    discordConfigured: !!(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_REDIRECT_URI && DISCORD_GUILD_ID),
    devLogin: DEV,
    version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'local').slice(0, 7),
    build: BUILD,
  }));

  app.get('/auth/discord', (req, res) => {
    if (!DISCORD_CLIENT_ID) return deny(res, 'Discord login is not configured on the server.');
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    const p = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, redirect_uri: DISCORD_REDIRECT_URI, response_type: 'code',
      scope: 'identify guilds.members.read', state, prompt: 'none',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${p}`);
  });

  app.get('/auth/discord/callback', async (req, res) => {
    try {
      if (!req.query.code || req.query.state !== req.session.oauthState) return deny(res, 'Login session expired. Please try again.');
      req.session.oauthState = null;
      const tok = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code',
          code: String(req.query.code), redirect_uri: DISCORD_REDIRECT_URI,
        }),
      }).then((r) => r.json());
      if (!tok.access_token) return deny(res, 'Discord did not approve the login.');
      const H = { Authorization: `Bearer ${tok.access_token}` };
      const me = await fetch(`${API}/users/@me`, { headers: H }).then((r) => r.json());
      const memberRes = await fetch(`${API}/users/@me/guilds/${DISCORD_GUILD_ID}/member`, { headers: H });
      const who = { id: me.id, name: me.username };
      if (memberRes.status === 404) { autoDeactivate(me.id, 'Left the department Discord server'); return unauthorized(res, 'not_member', who); }
      if (!memberRes.ok) return deny(res, 'Could not verify your Discord roles. Try again in a moment.');
      const member = await memberRes.json();
      const rank = rankFromRoles(member.roles || []);
      if (!rank) { autoDeactivate(me.id, 'Detective Bureau role removed in Discord'); return unauthorized(res, 'no_role', who); }
      if (manuallyRemoved(me.id)) return unauthorized(res, 'revoked', who);
      const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null;
      const uid = upsertUser({
        discord_id: me.id, username: me.username,
        display_name: member.nick || me.global_name || me.username, avatar, rank, units: unitsFromRoles(member.roles || []),
      });
      req.session.uid = uid;
      res.redirect('/');
    } catch (e) {
      console.error('OAuth error', e);
      deny(res, 'Login failed. Please try again.');
    }
  });

  // Local testing only. NEVER enable DEV_LOGIN on the live server.
  app.get('/auth/dev', (req, res) => {
    if (!DEV) return res.status(404).end();
    const rank = ['bureau_lead', 'co_lead', 'supervisor', 'lead', 'det2', 'det1'].includes(req.query.rank) ? req.query.rank : 'det1';
    const name = String(req.query.name || 'Test Detective');
    const units = String(req.query.units || '').split(',').filter(Boolean);
    if (req.query.norole) return unauthorized(res, 'no_role', { name });
    if (manuallyRemoved('dev-' + name.toLowerCase().replace(/\W+/g, '-'))) return unauthorized(res, 'revoked', { id: 'dev-' + name.toLowerCase().replace(/\W+/g, '-'), name });
    req.session.uid = upsertUser({ discord_id: 'dev-' + name.toLowerCase().replace(/\W+/g, '-'), username: name, display_name: name, avatar: null, rank, units });
    res.redirect('/');
  });

  app.post('/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
}

module.exports = { mount, DEV };
