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
    db.prepare('UPDATE users SET username=?, display_name=?, avatar=?, rank=?, units=?, last_login=? WHERE id=?').run(username, display_name, avatar, rank, JSON.stringify(units), at, ex.id);
    return ex.id;
  }
  return Number(db.prepare('INSERT INTO users (discord_id,username,display_name,avatar,rank,units,last_login) VALUES (?,?,?,?,?,?,?)')
    .run(discord_id, username, display_name, avatar, rank, JSON.stringify(units), at).lastInsertRowid);
}

function deny(res, msg) {
  res.redirect('/login?error=' + encodeURIComponent(msg));
}

function mount(app) {
  app.get('/auth/status', (req, res) => res.json({
    discordConfigured: !!(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_REDIRECT_URI && DISCORD_GUILD_ID),
    devLogin: DEV,
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
      if (memberRes.status === 404) return deny(res, 'You are not a member of the department Discord server.');
      if (!memberRes.ok) return deny(res, 'Could not verify your Discord roles. Try again in a moment.');
      const member = await memberRes.json();
      const rank = rankFromRoles(member.roles || []);
      if (!rank) return deny(res, 'Access denied — your Discord account does not hold a Detective Bureau role.');
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
    req.session.uid = upsertUser({ discord_id: 'dev-' + name.toLowerCase().replace(/\W+/g, '-'), username: name, display_name: name, avatar: null, rank, units });
    res.redirect('/');
  });

  app.post('/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
}

module.exports = { mount, DEV };
