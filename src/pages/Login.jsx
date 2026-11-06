import React, { useEffect, useState } from 'react';

export default function Login() {
  const err = new URLSearchParams(location.search).get('error');
  const [st, setSt] = useState(null);
  const [dev, setDev] = useState({ name: 'S. Fisher', rank: 'lead' });
  useEffect(() => { fetch('/auth/status').then((r) => r.json()).then(setSt).catch(() => {}); }, []);
  return (
    <div className="login">
      <div className="login-card">
        <img src="/img/badge.png" alt="Detective Bureau badge" />
        <h1>Detective Bureau</h1>
        <p>Blaine County Detective Bureau · Case Management System<br />Authorized personnel only.</p>
        {err && <div className="login-err">{err}</div>}
        {st && !st.discordConfigured && !st.devLogin && <div className="login-err">Discord login has not been configured on the server yet. See the setup guide.</div>}
        <a className="discord-btn" href="/auth/discord">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.8a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.92 1.53.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z" /></svg>
          Sign in with Discord
        </a>
        <div className="login-foot">Access is granted automatically based on your Detective Bureau role in the department Discord server. All activity is logged.</div>
        {st?.devLogin && (
          <div className="dev-box">
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#f5c451', marginBottom: 8 }}>Developer test login (disable in production)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={dev.name} onChange={(e) => setDev({ ...dev, name: e.target.value })} />
              <select value={dev.rank} onChange={(e) => setDev({ ...dev, rank: e.target.value })} style={{ width: 140 }}>
                <option value="bureau_lead">Bureau Lead</option><option value="co_lead">Bureau Co-Lead</option><option value="supervisor">Supervisor</option><option value="lead">Detective III</option><option value="det2">Detective II</option><option value="det1">Detective I</option>
              </select>
              <a className="btn" href={`/auth/dev?name=${encodeURIComponent(dev.name)}&rank=${dev.rank}`}>Go</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
