import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Status, Empty, fmtDate, ago } from '../ui';
import { NewCaseModal } from './Cases';

export default function Dashboard() {
  const { me, config, setReviewCount } = useApp();
  const [d, setD] = useState(null);
  const [newCase, setNewCase] = useState(false);
  const [sp] = useSearchParams();
  const reviewRef = useRef();
  const nav = useNavigate();
  useEffect(() => { api.get('/api/dashboard').then((x) => { setD(x); setReviewCount(x.review.length); }); }, []);
  useEffect(() => { if (d && sp.get('review') && reviewRef.current) reviewRef.current.scrollIntoView({ behavior: 'smooth' }); }, [d, sp]);
  if (!d) return <div className="muted">Loading dashboard…</div>;
  const open = d.byStatus.filter((s) => s.status !== 'Closed').reduce((a, b) => a + b.n, 0);
  const st = (k) => d.byStatus.find((s) => s.status === k)?.n || 0;
  const divMax = Math.max(1, ...d.byDivision.map((x) => x.n));
  const hour = new Date().getHours();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {me.display_name}</h1>
          <p>{config.ranks[me.rank]} · Bureau overview for {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        {me.rank !== 'trainee' && <button className="btn gold" onClick={() => setNewCase(true)}><Icon n="plus" />Open New Case</button>}
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="panel stat"><div className="k">Active Investigations</div><div className="v">{open}</div><div className="d">{d.total} total case files</div></div>
        <div className="panel stat"><div className="k">My Assignments</div><div className="v">{d.mine.length}</div><div className="d">Open cases you are assigned to</div></div>
        <div className="panel stat"><div className="k">Pending Warrant</div><div className="v">{st('Pending Warrant')}</div><div className="d">{d.warrants.length} warrant request(s) in progress</div></div>
        <div className="panel stat"><div className="k">Closed (30 days)</div><div className="v">{d.closed30}</div><div className="d">{d.review.length} awaiting supervisor sign-off</div></div>
      </div>

      {(config.commandRanks.includes(me.rank) || d.review.length > 0) && (
        <div className="panel" ref={reviewRef} style={{ marginBottom: 16, borderColor: d.review.length ? '#e7cf85' : undefined }}>
          <div className="panel-h"><h3><Icon n="pen" width="15" style={{ verticalAlign: -2, marginRight: 6 }} />Supervisor Review Queue<span className="sub">Cases submitted for closure</span></h3></div>
          {d.review.length ? (
            <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Lead</th><th>Submitted</th><th /></tr></thead><tbody>
              {d.review.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/cases/${c.id}?s=closure`)}>
                  <td className="mono">#{c.number} | {c.code}</td><td><b>{c.title}</b></td><td>{c.lead_name}</td>
                  <td className="muted">{ago(JSON.parse(c.closure || '{}').requested_at || c.updated_at)}</td>
                  <td style={{ textAlign: 'right' }}><span className="btn sm">Review</span></td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty icon="check" title="Nothing waiting">No cases are pending supervisor sign-off.</Empty>}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel">
            <div className="panel-h"><h3>My Active Cases</h3><Link to="/cases?mine=1" className="small">View all →</Link></div>
            {d.mine.length ? (
              <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>
                {d.mine.slice(0, 10).map((c) => (
                  <tr key={c.id} className="click" onClick={() => nav(`/cases/${c.id}`)}>
                    <td className="mono">#{c.number} | {c.code}</td><td><b>{c.title}</b><div className="small muted">{config.divisions.find((x) => x.id === c.division)?.short} · Lead: {c.lead_name}</div></td>
                    <td><Status s={c.status} /></td><td className="muted small">{ago(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody></table>
            ) : <Empty title="No active assignments">Open a new case or ask a lead to add you to one.</Empty>}
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Warrant Requests In Progress</h3></div>
            {d.warrants.length ? (
              <table className="t"><thead><tr><th>Case</th><th>Warrant</th><th>Target</th><th>Status</th></tr></thead><tbody>
                {d.warrants.map((w) => (
                  <tr key={w.id} className="click" onClick={() => nav(`/cases/${w.case_id}?s=warrants`)}>
                    <td className="mono">#{w.number}</td><td>{w.data.type}</td><td className="muted">{w.data.target || '—'}</td><td><Status s={w.data.status} /></td>
                  </tr>
                ))}
              </tbody></table>
            ) : <Empty icon="gavel" title="No pending warrants" />}
          </div>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel">
            <div className="panel-h"><h3>Caseload by Division</h3></div>
            <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
              {config.divisions.map((dv) => {
                const n = d.byDivision.find((x) => x.division === dv.id)?.n || 0;
                return (
                  <div key={dv.id}>
                    <div className="row small" style={{ marginBottom: 5 }}><b>{dv.short}</b><span className="spacer" /><span className="muted">{n} open</span></div>
                    <div className="bar"><i style={{ width: `${(n / divMax) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Recent Activity</h3></div>
            <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
              {d.recent.length ? d.recent.map((a) => (
                <div key={a.id} className="small">
                  <b>{a.display_name || (a.action === 'Denied sign-in' ? 'Unknown user' : 'System')}</b> <span className="muted" style={a.action === 'Denied sign-in' ? { color: 'var(--red)' } : undefined}>{a.action.toLowerCase()}</span>{a.code && <> · <Link to={`/cases/${a.case_id}`} className="mono">{a.code}</Link></>}
                  {a.detail && <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</div>}
                  <div className="faint" style={{ fontSize: 11.5 }}>{ago(a.at)}</div>
                </div>
              )) : <span className="muted">No activity yet.</span>}
            </div>
          </div>
        </div>
      </div>
      {newCase && <NewCaseModal onClose={() => setNewCase(false)} />}
    </>
  );
}
