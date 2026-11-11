import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Status, Empty, ago, fmtDate } from '../ui';
import { NewCaseModal } from './Cases';

const REFRESH_MS = 60000;
const LS_KEY = 'bcdb.dashUnit';

export default function Dashboard() {
  const { me, config, setReviewCount } = useApp();
  const [d, setD] = useState(null);
  const [newCase, setNewCase] = useState(false);
  const [moreActivity, setMoreActivity] = useState(false);
  const [unit, setUnit] = useState(() => { try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; } });
  const [, tick] = useState(0);
  const [sp] = useSearchParams();
  const reviewRef = useRef();
  const nav = useNavigate();

  const load = useCallback(() => api.get(`/api/dashboard?division=${unit}`).then((x) => { setD({ ...x, loadedAt: Date.now() }); setReviewCount(x.stats.review); }).catch(() => {}), [unit]);
  useEffect(() => { load(); }, [load]);
  // Live updates: refresh every minute while the tab is visible, and right away when you come back to it
  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    const t = setInterval(() => tick((n) => n + 1), 15000);
    const v = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(i); clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [load]);
  useEffect(() => { if (d && sp.get('review') && reviewRef.current) reviewRef.current.scrollIntoView({ behavior: 'smooth' }); }, [d, sp]);
  const setUnitSaved = (u) => { setUnit(u); try { localStorage.setItem(LS_KEY, u); } catch {} };

  if (!d) return <div className="muted">Loading dashboard…</div>;
  const hour = new Date().getHours();
  const divQ = unit ? `&division=${unit}` : '';
  const unitName = config.divisions.find((x) => x.id === unit)?.name;
  const secAgo = Math.round((Date.now() - d.loadedAt) / 1000);
  const att = d.attention;
  const attCount = att.inactive.length + att.returned.length + att.drafts.length + att.outstanding.length;

  const head = (
    <div className="page-head">
      <div>
        <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {me.display_name}</h1>
        <p>{config.ranks[me.rank]} · {unitName ? `${unitName} view` : 'Bureau overview'} for {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <div className="row dash-tools">
        <span className="live" title="The dashboard refreshes automatically every minute"><i />Live · {secAgo < 20 ? 'just updated' : `updated ${ago(new Date(d.loadedAt).toISOString())}`}</span>
        {!d.isTrainee && !d.isViewer && (
          <select value={unit} onChange={(e) => setUnitSaved(e.target.value)} style={{ width: 'auto' }} aria-label="Filter by unit">
            <option value="">All units</option>{config.divisions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        {!d.isTrainee && !d.isViewer && <button className="btn gold" onClick={() => setNewCase(true)}><Icon n="plus" />Open New Case</button>}
      </div>
    </div>
  );

  const attention = (
    <div className="panel" style={{ marginBottom: 16, borderColor: attCount ? 'var(--amber-line)' : undefined }}>
      <div className="panel-h"><h3><Icon n="alert" width="15" style={{ verticalAlign: -2, marginRight: 6, color: attCount ? 'var(--amber)' : 'var(--green)' }} />Needs Your Attention<span className="sub">{attCount ? `${attCount} item(s) waiting on you` : 'Nothing waiting on you'}</span></h3></div>
      {attCount ? (
        <div className="attention">
          {att.returned.map((c) => (
            <Link key={'r' + c.id} to={`/cases/${c.id}?s=closure`} className="att red"><Icon n="pen" /><div><b>Returned by supervisor — #{c.number} {c.title}</b><span>{c.rejected?.reason || 'See the case for details'} · {c.rejected?.by}</span></div></Link>
          ))}
          {att.inactive.map((c) => (
            <Link key={'i' + c.id} to={`/cases/${c.id}`} className="att amber"><Icon n="clock" /><div><b>No activity for {c.idle_days} days — #{c.number} {c.title}</b><span>Add a note or update the case, or change its status.</span></div></Link>
          ))}
          {att.drafts.map((w) => (
            <Link key={'w' + w.id} to={`/cases/${w.case_id}?s=warrants`} className="att blue"><Icon n="gavel" /><div><b>Warrant still in Draft — #{w.number} {w.data.type}</b><span>Finish the request, download the packet and submit it to the DOJ.</span></div></Link>
          ))}
          {att.outstanding.map((c) => (
            <Link key={'o' + c.id} to={`/cases/${c.id}?s=charges`} className="att gray"><Icon n="scale" /><div><b>{c.missing} charge element(s) not yet established — #{c.number} {c.title}</b><span>Across {c.charges} charge(s). Link evidence to each element.</span></div></Link>
          ))}
        </div>
      ) : <Empty icon="check" title="You're all caught up">No inactive cases, returned cases, draft warrants or open elements.</Empty>}
    </div>
  );

  const myCases = (
    <div className="panel">
      <div className="panel-h"><h3>{d.isTrainee ? 'Cases You’re Assigned To' : 'My Active Cases'}</h3><Link to="/cases?mine=1" className="small">View all →</Link></div>
      {d.mine.length ? (
        <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Status</th><th>Last activity</th></tr></thead><tbody>
          {d.mine.slice(0, 10).map((c) => (
            <tr key={c.id} className="click" onClick={() => nav(`/cases/${c.id}`)}>
              <td className="mono">#{c.number} | {c.code}</td>
              <td><b>{c.title}</b>{c.classified && <span className="classified-pill sm" style={{ marginLeft: 6 }}><Icon n="lock" />Classified</span>}<div className="small muted">{config.divisions.find((x) => x.id === c.division)?.short} · Lead: {c.lead_name}</div></td>
              <td><Status s={c.status} /></td>
              <td className={'small ' + (c.idle_days > d.inactiveDays ? '' : 'muted')} style={c.idle_days > d.inactiveDays ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>{ago(c.last_at)}</td>
            </tr>
          ))}
        </tbody></table>
      ) : <Empty title={d.isTrainee ? 'Not assigned to any cases yet' : 'No active assignments'}>{d.isTrainee ? 'A detective will add you to a case when you’re assigned.' : 'Open a new case or ask a lead to add you to one.'}</Empty>}
    </div>
  );

  // ---------- View-only dashboard (base Detective Bureau role, no rank) ----------
  if (d.isViewer) {
    return (
      <>
        {head}
        <div className="panel panel-b" style={{ marginBottom: 16, background: 'var(--subtle)' }}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <Icon n="eye" width="22" height="22" style={{ color: 'var(--muted)', flex: 'none', marginTop: 2 }} />
            <div>
              <b>View-only access.</b> You hold the Detective Bureau role without a rank, so you can read case files (except classified cases), the persons directory and the penal code.
              <div className="small muted" style={{ marginTop: 6 }}>You can’t open, edit or be assigned to cases. Contact Bureau command if you need more access.</div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Recently Active Cases</h3><Link to="/cases" className="small">All case files →</Link></div>
          {d.recentCases.length ? (
            <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Status</th><th>Last activity</th></tr></thead><tbody>
              {d.recentCases.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/cases/${c.id}`)}>
                  <td className="mono">#{c.number} | {c.code}</td><td><b>{c.title}</b><div className="small muted">{config.divisions.find((x) => x.id === c.division)?.short} · Lead: {c.lead_name}</div></td>
                  <td><Status s={c.status} /></td><td className="small muted">{ago(c.last_at)}</td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty title="No open cases" />}
        </div>
      </>
    );
  }

  // ---------- Trainee dashboard ----------
  if (d.isTrainee) {
    return (
      <>
        {head}
        <div className="panel panel-b" style={{ marginBottom: 16, background: 'var(--blue-soft)', borderColor: 'var(--focus)' }}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <Icon n="shield" width="22" height="22" style={{ color: 'var(--blue)', flex: 'none', marginTop: 2 }} />
            <div>
              <b>Welcome to the Detective Bureau.</b> Your status is <b>{config.ranks[me.rank]}</b>.
              <div className="small" style={{ marginTop: 6, lineHeight: 1.6 }}>
                ✓ You can view case files, the penal code and the persons directory, and fully work any case a detective adds you to.<br />
                ✕ You can’t open new cases, lead a case, or sign a case for closure until you complete training.
              </div>
            </div>
          </div>
        </div>
        {attention}
        {myCases}
        {newCase && <NewCaseModal onClose={() => setNewCase(false)} />}
      </>
    );
  }

  // ---------- Detective / command dashboard ----------
  const S = d.stats;
  const Stat = ({ k, v, sub, to, tone }) => {
    const inner = <><div className="k">{k}</div><div className="v">{v}</div><div className="d">{sub}</div></>;
    const cls = 'panel stat stat-link' + (tone ? ' ' + tone : '');
    return to.startsWith('#')
      ? <a href={to} className={cls} onClick={(e) => { e.preventDefault(); document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }}>{inner}</a>
      : <Link to={to} className={cls}>{inner}</Link>;
  };
  const maxLoad = Math.max(1, ...d.workload.map((u) => u.lead + u.assist));
  const divMax = Math.max(1, ...d.byDivision.map((x) => x.n));

  return (
    <>
      {head}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat k="Active Investigations" v={S.active} sub={`${S.closed30} closed in the last 30 days`} to={`/cases?${divQ.slice(1)}`} />
        <Stat k="My Assignments" v={d.mine.length} sub="Open cases you’re on" to="/cases?mine=1" />
        <Stat k="Pending Warrant" v={S.pendingWarrant} sub={`${S.warrantsInProgress} warrant request(s) in progress`} to={`/cases?status=${encodeURIComponent('Pending Warrant')}${divQ}`} />
        <Stat k={`Inactive ${d.inactiveDays}+ Days`} v={S.inactive} sub={d.isCommand ? 'Across the Bureau' : 'On your cases'} to="#inactive" tone={S.inactive ? 'warn' : ''} />
      </div>

      {attention}

      {d.isCommand && (
        <div className="panel" ref={reviewRef} style={{ marginBottom: 16, borderColor: d.review.length ? 'var(--amber-line)' : undefined }}>
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
          ) : <div className="panel-b small muted" style={{ padding: '12px 18px' }}><Icon n="check" width="14" style={{ verticalAlign: -2, marginRight: 6, color: 'var(--green)' }} />Nothing waiting — no cases are pending supervisor sign-off.</div>}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
        <div className="grid" style={{ alignContent: 'start' }}>
          {myCases}

          <div className="panel" id="inactive">
            <div className="panel-h"><h3><Icon n="clock" width="15" style={{ verticalAlign: -2, marginRight: 6 }} />Inactive Cases<span className="sub">No activity for more than {d.inactiveDays} days{d.isCommand ? ' · all units' : ' · your cases'}</span></h3></div>
            {d.inactive.length ? (
              <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Lead</th><th>Idle</th><th>Status</th></tr></thead><tbody>
                {d.inactive.map((c) => (
                  <tr key={c.id} className="click" onClick={() => nav(`/cases/${c.id}`)}>
                    <td className="mono">#{c.number} | {c.code}</td><td><b>{c.title}</b><div className="small muted">Last activity {fmtDate(c.last_at)}</div></td>
                    <td>{c.lead_name}</td><td><span className={`pill ${c.idle_days > 30 ? 'red' : 'amber'}`}>{c.idle_days} days</span></td><td><Status s={c.status} /></td>
                  </tr>
                ))}
              </tbody></table>
            ) : <Empty icon="check" title="No inactive cases">Every open case has had activity in the last {d.inactiveDays} days.</Empty>}
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
          {d.isCommand && (
            <div className="panel">
              <div className="panel-h"><h3>Detective Workload<span className="sub">Open cases{unitName ? ` · ${unitName}` : ''}</span></h3></div>
              <div className="panel-b" style={{ display: 'grid', gap: 11 }}>
                <div className="row small muted" style={{ gap: 14 }}><span><i className="key lead" />Lead</span><span><i className="key assist" />Assisting</span><span><i className="key idle" />Idle {d.inactiveDays}+ days (lead)</span></div>
                {d.workload.map((u) => (
                  <div key={u.id}>
                    <div className="row small" style={{ marginBottom: 4 }}><b>{u.display_name}</b><span className="faint">{config.ranks[u.rank]}</span><span className="spacer" />
                      <span className="muted">{u.lead} lead · {u.assist} assist{u.idle ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}> · {u.idle} idle</span> : ''}</span></div>
                    <div className="bar load">
                      <i className="lead" style={{ width: `${(u.lead / maxLoad) * 100}%` }} />
                      <i className="assist" style={{ width: `${(u.assist / maxLoad) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {!d.workload.length && <span className="muted small">No personnel in this unit.</span>}
              </div>
            </div>
          )}

          {!unit && (
            <div className="panel">
              <div className="panel-h"><h3>Caseload by Division</h3></div>
              <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
                {config.divisions.map((dv) => {
                  const n = d.byDivision.find((x) => x.division === dv.id)?.n || 0;
                  return (
                    <a key={dv.id} className="div-row" onClick={() => setUnitSaved(dv.id)} title={`Show ${dv.name} only`}>
                      <div className="row small" style={{ marginBottom: 5 }}><b>{dv.short}</b><span className="spacer" /><span className="muted">{n} open</span></div>
                      <div className="bar"><i style={{ width: `${(n / divMax) * 100}%` }} /></div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-h"><h3>Recent Activity</h3>{d.recent.length > 5 && <button className="btn ghost sm" onClick={() => setMoreActivity(!moreActivity)}><Icon n={moreActivity ? 'up' : 'down'} />{moreActivity ? 'Show less' : 'Show more'}</button>}</div>
            <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
              {d.recent.length ? d.recent.slice(0, moreActivity ? 15 : 5).map((a) => (
                <div key={a.id} className="small" style={{ minWidth: 0 }}>
                  <b>{a.display_name || 'System'}</b> <span className="muted">{a.action.toLowerCase()}</span>{a.code && <> · <Link to={`/cases/${a.case_id}`} className="mono">{a.code}</Link></>}
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
