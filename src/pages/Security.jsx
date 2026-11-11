import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, fmtDT, ago } from '../ui';

const TYPES = [
  { key: 'Denied sign-in', label: 'Denied sign-ins', tone: 'red', desc: 'Someone without access tried to sign in' },
  { key: 'Classified access blocked', label: 'Blocked classified access', tone: 'red', desc: 'Someone tried to open a classified case' },
  { key: 'Removed from roster', label: 'Roster removals', tone: 'gray', desc: 'Access removed by command or automatically' },
  { key: 'Restored to roster', label: 'Roster restores', tone: 'green', desc: 'Access restored' },
  { key: 'Backup downloaded', label: 'Backups downloaded', tone: 'gray', desc: 'A full copy of the database was downloaded' },
];

export default function Security() {
  const { me, config } = useApp();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const cmd = config.commandRanks.includes(me.rank);
  useEffect(() => {
    if (!cmd) return;
    const t = setTimeout(() => api.get(`/api/security?${new URLSearchParams({ type, q, days })}`).then(setD).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [type, q, days, cmd]);
  useEffect(() => {
    if (!cmd) return;
    const i = setInterval(() => document.visibilityState === 'visible' && api.get(`/api/security?${new URLSearchParams({ type, q, days })}`).then(setD).catch(() => {}), 60000);
    return () => clearInterval(i);
  }, [type, q, days, cmd]);
  if (!cmd) return <Navigate to="/" />;
  const tone = (a) => TYPES.find((t) => t.key === a)?.tone || 'gray';
  return (
    <>
      <div className="page-head">
        <div><h1>Security Alerts</h1><p>Denied sign-ins, blocked attempts to open classified cases, and roster changes. Visible to Bureau command only.</p></div>
      </div>

      <div className="grid g5" style={{ marginBottom: 16 }}>
        {TYPES.map((t) => (
          <button key={t.key} className={'panel stat stat-link' + (type === t.key ? ' sel' : '')} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => setType(type === t.key ? '' : t.key)}>
            <div className="k">{t.label}</div>
            <div className="v" style={{ color: t.tone === 'red' && d?.counts24h[t.key] ? 'var(--red)' : undefined }}>{d ? d.counts24h[t.key] : '–'}</div>
            <div className="d">in the last 24 hours</div>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-h" style={{ flexWrap: 'wrap' }}>
          <div className="row" style={{ flex: 1 }}>
            <input style={{ maxWidth: 300 }} placeholder="Search name, Discord username, reference, case…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select style={{ maxWidth: 240 }} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All alert types</option>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select style={{ maxWidth: 170 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[[1, 'Last 24 hours'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <span className="muted small">{d ? `${d.rows.length} alert(s)` : ''}</span>
        </div>
        {!d ? <div className="panel-b muted">Loading…</div> : d.rows.length ? (
          <table className="t">
            <thead><tr><th>When</th><th>Alert</th><th>Person</th><th>Details</th><th>Case</th></tr></thead>
            <tbody>
              {d.rows.map((a) => (
                <tr key={a.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDT(a.at)}<div className="faint">{ago(a.at)}</div></td>
                  <td><span className={`pill ${tone(a.action)}`}>{a.action}</span></td>
                  <td><b>{a.display_name || 'Unknown user'}</b></td>
                  <td className="small" style={{ overflowWrap: 'anywhere' }}>{a.detail || <span className="faint">—</span>}</td>
                  <td>{a.code ? <Link to={`/cases/${a.case_id}`} className="mono small">#{a.number} | {a.code}</Link> : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty icon="shield" title="No alerts">Nothing matches these filters.</Empty>}
      </div>
      <p className="small faint" style={{ marginTop: 10 }}>Tip: when someone sends you a reference code from the Unauthorized screen (e.g. BCDB-5QA9PY), paste it in the search box to find their attempt.</p>
    </>
  );
}
