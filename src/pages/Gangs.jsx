import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Modal, Field, Empty, Confirm, Status, useToast, fmtDate } from '../ui';
import { Fields, loadGangs } from '../sections/common';

export const GANG_TYPES = ['Cartel', 'Street Gang', 'Motorcycle Club', 'Organized Crime Group', 'Other'];
export const GANG_STATUSES = ['Recognized', 'Suspected', 'Inactive'];
export const RANKS = ['Leader', 'Second in Command', 'Shot Caller', 'Lieutenant', 'Enforcer', 'Member', 'Associate', 'Prospect', 'Unknown'];
const RELATIONS = ['Ally', 'Rival', 'Supplier', 'Customer', 'Splinter Group', 'Parent Organization', 'Other'];
const STATUS_TONE = { Recognized: 'red', Suspected: 'amber', Inactive: 'gray' };
const GANG_FIELDS = [
  { k: 'name', label: 'Gang Name', span: 3 }, { k: 'abbreviation', label: 'Abbreviation', span: 1, ph: 'CDJ' },
  { k: 'status', label: 'Status', type: 'select', options: GANG_STATUSES, span: 2 }, { k: 'type', label: 'Type', type: 'select', options: GANG_TYPES, span: 2 },
  { k: 'territory', label: 'Territory / Turf', span: 4, ph: 'Areas, streets, hangouts' },
  { k: 'identifiers', label: 'Colors, Tattoos & Identifiers', span: 4, ph: 'Colors, hand signs, tattoos, vehicles, patches…' },
  { k: 'description', label: 'Overview', type: 'textarea', rows: 3, ph: 'Known activity, structure, history…' },
  { k: 'notes', label: 'Intelligence Notes', type: 'textarea', rows: 3 },
];

// Sub-tabs under Gangs & Organizations
export function GangTabs({ active }) {
  const nav = useNavigate();
  return (
    <div className="subtabs">
      <button className={active === 'registry' ? 'on' : ''} onClick={() => nav('/gangs')}><Icon n="users" />Registry</button>
      <button className={active === 'chart' ? 'on' : ''} onClick={() => nav('/gangs/chart')}><Icon n="link" />Link Chart</button>
    </div>
  );
}

export default function Gangs() {
  const [d, setD] = useState(null);
  const [add, setAdd] = useState(null);
  const toast = useToast();
  const nav = useNavigate();
  const load = () => api.get('/api/gangs').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <div className="muted">Loading…</div>;
  return (
    <>
      <GangTabs active="registry" />
      <div className="page-head">
        <div><h1>Gangs & Organizations</h1><p>Recognized and suspected criminal organizations — members and suspected ranks, businesses, and affiliations.</p></div>
        {d.canEdit && <button className="btn primary" onClick={() => setAdd({ status: 'Suspected' })}><Icon n="plus" />Add Gang</button>}
      </div>
      {GANG_STATUSES.map((s) => {
        const list = d.gangs.filter((g) => g.status === s);
        if (!list.length && s === 'Inactive') return null;
        return (
          <div key={s} style={{ marginBottom: 22 }}>
            <div className="row" style={{ marginBottom: 10 }}><span className={`pill ${STATUS_TONE[s]}`}>{s} Gangs</span><span className="faint small">{list.length}</span></div>
            {list.length ? (
              <div className="gang-grid">
                {list.map((g) => (
                  <button key={g.id} className="gang-card" onClick={() => nav(`/gangs/${g.id}`)}>
                    <div className="gang-abbr">{g.abbreviation || g.name.slice(0, 3).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <b>{g.name}</b>
                      <div className="small muted">{g.type || 'Type unknown'}{g.territory ? ` · ${g.territory}` : ''}</div>
                      <div className="row small" style={{ gap: 12, marginTop: 8 }}>
                        <span><b>{g.members}</b> <span className="muted">{g.members === 1 ? 'member' : 'members'}</span></span>
                        <span><b>{g.businesses}</b> <span className="muted">{g.businesses === 1 ? 'business' : 'businesses'}</span></span>
                        <span><b>{g.cases}</b> <span className="muted">{g.cases === 1 ? 'case' : 'cases'}</span></span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="panel"><Empty icon="users" title={`No ${s.toLowerCase()} gangs`} /></div>}
          </div>
        );
      })}
      {!d.canEdit && <p className="small faint">Only Gang & Narcotics Unit members and command can edit the gang registry.</p>}
      {add && (
        <Modal wide title="Add Gang / Organization" onClose={() => setAdd(null)} footer={<><button className="btn" onClick={() => setAdd(null)}>Cancel</button>
          <button className="btn primary" disabled={!add.name} onClick={async () => { try { const r = await api.post('/api/gangs', add); loadGangs(true); nav(`/gangs/${r.id}`); } catch (e) { toast(e.message, true); } }}>Add Gang</button></>}>
          <Fields fields={GANG_FIELDS} v={add} set={setAdd} />
        </Modal>
      )}
    </>
  );
}

export function GangView() {
  const { id } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const [addMember, setAddMember] = useState(false);
  const [biz, setBiz] = useState(null);
  const [rel, setRel] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [allGangs, setAllGangs] = useState([]);
  const load = () => api.get(`/api/gangs/${id}`).then(setD);
  useEffect(() => { load(); loadGangs().then(setAllGangs); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;
  const g = d.gang; const ce = d.canEdit;
  const run = async (fn, msg) => { try { await fn(); await load(); if (msg) toast(msg); } catch (e) { toast(e.message, true); } };
  const rankOrder = (r) => { const i = RANKS.indexOf(r); return i < 0 ? 99 : i; };
  const members = [...d.members].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank) || a.name.localeCompare(b.name));

  return (
    <>
      <div className="small muted" style={{ marginBottom: 6 }}><Link to="/gangs">Gangs & Organizations</Link> /</div>
      <div className="gang-head">
        <div className="gang-abbr lg">{g.abbreviation || g.name.slice(0, 3).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{g.name}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <span className={`pill ${STATUS_TONE[g.status]}`}>{g.status}</span>{g.type && <span className="pill gray">{g.type}</span>}
            <span className="small" style={{ color: '#a9b4c6' }}>{d.members.length} members · {d.businesses.length} businesses · {d.cases.length} linked case(s)</span>
          </div>
        </div>
        {ce && <button className="btn" onClick={() => setEdit(Object.fromEntries(GANG_FIELDS.map((f) => [f.k, g[f.k] || ''])))}><Icon n="edit" />Edit</button>}
        {d.isCommand && <button className="btn" style={{ background: 'transparent', color: '#c8d1e0', borderColor: '#33476b' }} title="Delete gang" onClick={() => setConfirm({ text: `Delete ${g.name} from the registry? Members' profiles are kept.`, yes: () => run(() => api.del(`/api/gangs/${g.id}`)).then(() => { loadGangs(true); nav('/gangs'); }) })}><Icon n="trash" /></button>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel">
            <div className="panel-h"><h3>Members<span className="sub">Suspected ranks — sorted by rank</span></h3>{ce && <button className="btn primary sm" onClick={() => setAddMember(true)}><Icon n="plus" />Add Member</button>}</div>
            {members.length ? (
              <table className="t"><thead><tr><th style={{ width: 46 }} /><th>Name</th><th>Suspected Rank</th><th>Membership</th><th>Notes</th>{ce && <th />}</tr></thead><tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.photo_id ? <img src={`/api/files/${m.photo_id}`} style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} /> : <span className="avatar sm" style={{ background: '#c6cdd8' }}><Icon n="user" width="13" /></span>}</td>
                    <td><Link to={`/persons/${m.person_id}`}><b>{m.name}</b></Link><div className="small muted">{[m.ssn && `SSN ${m.ssn}`, m.dob && `DOB ${fmtDate(m.dob)}`].filter(Boolean).join(' · ')}</div></td>
                    <td>{ce ? <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={m.rank} onChange={(e) => run(() => api.patch(`/api/gang-members/${m.id}`, { rank: e.target.value }), 'Rank updated')}>{RANKS.map((r) => <option key={r}>{r}</option>)}</select> : <b>{m.rank}</b>}</td>
                    <td>{ce ? <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={m.confidence} onChange={(e) => run(() => api.patch(`/api/gang-members/${m.id}`, { confidence: e.target.value }))}><option>Suspected</option><option>Confirmed</option></select>
                      : <span className={`pill ${m.confidence === 'Confirmed' ? 'red' : 'amber'}`}>{m.confidence}</span>}</td>
                    <td className="small">{ce ? <input style={{ padding: '4px 8px', fontSize: 13 }} defaultValue={m.notes} placeholder="Role, intel…" onBlur={(e) => e.target.value !== m.notes && run(() => api.patch(`/api/gang-members/${m.id}`, { notes: e.target.value }), 'Saved')} /> : (m.notes || '—')}</td>
                    {ce && <td><button className="icon-btn" title="Remove from gang" onClick={() => setConfirm({ text: `Remove ${m.name} from ${g.name}?`, yes: () => run(() => api.del(`/api/gang-members/${m.id}`), 'Removed') })}><Icon n="x" /></button></td>}
                  </tr>
                ))}
              </tbody></table>
            ) : <Empty icon="users" title="No known members">Add members here, or set “Gang Affiliation” on a person’s profile.</Empty>}
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Businesses<span className="sub">Legal fronts and illegal operations</span></h3>{ce && <button className="btn primary sm" onClick={() => setBiz({ legality: 'Illegal' })}><Icon n="plus" />Add Business</button>}</div>
            <div className="panel-b">
              {d.businesses.length ? d.businesses.map((b) => (
                <div key={b.id} className="card">
                  <div className="card-h"><b>{b.name}</b><span className={`pill ${b.legality === 'Illegal' ? 'red' : 'blue'}`}>{b.legality}</span>{b.kind && <span className="pill gray">{b.kind}</span>}<span className="spacer" />
                    {ce && <><button className="icon-btn" onClick={() => setBiz(b)}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setConfirm({ text: `Delete ${b.name}?`, yes: () => run(() => api.del(`/api/gang-businesses/${b.id}`)) })}><Icon n="trash" /></button></>}</div>
                  {b.address && <div className="small muted"><Icon n="target" width="12" style={{ verticalAlign: -1 }} /> {b.address}</div>}
                  {b.description && <div className="small pre" style={{ marginTop: 6 }}>{b.description}</div>}
                </div>
              )) : <Empty icon="dollar" title="No businesses recorded" />}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Linked Cases<span className="sub">Cases where a member appears</span></h3></div>
            {d.cases.length ? (
              <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Member</th><th>Status</th></tr></thead><tbody>
                {d.cases.map((c, i) => (
                  <tr key={i} className="click" onClick={() => nav(`/cases/${c.id}`)}>
                    <td className="mono">#{c.number} | {c.code}</td>
                    <td>{c.restricted ? <span className="classified-pill"><Icon n="lock" />CLASSIFIED</span> : <b>{c.title}</b>}</td>
                    <td className="small">{c.person}{c.role && <span className="muted"> ({c.role})</span>}</td>
                    <td>{c.restricted ? '—' : <Status s={c.status} />}</td>
                  </tr>
                ))}
              </tbody></table>
            ) : <Empty icon="folder" title="No linked cases" />}
          </div>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel">
            <div className="panel-h"><h3>Intelligence Profile</h3></div>
            <div className="panel-b"><div className="kv">
              <div>Status</div><div>{g.status}</div>
              <div>Type</div><div>{g.type || '—'}</div>
              <div>Territory</div><div className="pre">{g.territory || '—'}</div>
              <div>Identifiers</div><div className="pre">{g.identifiers || '—'}</div>
              <div>Overview</div><div className="pre">{g.description || '—'}</div>
              <div>Intel Notes</div><div className="pre">{g.notes || '—'}</div>
            </div></div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Gang Affiliations</h3>{ce && <button className="btn sm" onClick={() => setRel({ relation: 'Ally' })}><Icon n="link" />Add</button>}</div>
            <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
              {d.relations.length ? d.relations.map((r) => {
                const otherId = r.gang_id === g.id ? r.other_id : r.gang_id;
                return (
                  <div key={r.id} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <span className={`pill ${r.relation === 'Rival' ? 'red' : r.relation === 'Ally' ? 'green' : 'gray'}`}>{r.relation}</span>
                    <div style={{ flex: 1 }}><Link to={`/gangs/${otherId}`}><b>{r.other_name}</b></Link> <span className="faint">({r.other_status})</span>{r.notes && <div className="muted">{r.notes}</div>}</div>
                    {ce && <button className="icon-btn" onClick={() => run(() => api.del(`/api/gang-relations/${r.id}`))}><Icon n="x" /></button>}
                  </div>
                );
              }) : <span className="muted small">No known affiliations with other gangs.</span>}
            </div>
          </div>
        </div>
      </div>

      {edit && (
        <Modal wide title={`Edit — ${g.name}`} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" onClick={() => run(() => api.patch(`/api/gangs/${g.id}`, edit), 'Saved').then(() => { loadGangs(true); setEdit(null); })}>Save</button></>}>
          <Fields fields={GANG_FIELDS} v={edit} set={setEdit} />
        </Modal>
      )}
      {addMember && <AddMemberModal gang={g} onClose={() => setAddMember(false)} onDone={() => { setAddMember(false); load(); }} />}
      {biz && (
        <Modal title={biz.id ? 'Edit Business' : 'Add Business'} onClose={() => setBiz(null)} footer={<><button className="btn" onClick={() => setBiz(null)}>Cancel</button>
          <button className="btn primary" disabled={!biz.name} onClick={() => run(() => (biz.id ? api.patch(`/api/gang-businesses/${biz.id}`, biz) : api.post(`/api/gangs/${g.id}/businesses`, biz)), 'Saved').then(() => setBiz(null))}>Save</button></>}>
          <Fields v={biz} set={setBiz} fields={[
            { k: 'name', label: 'Business Name', span: 4 },
            { k: 'legality', label: 'Legal or Illegal', type: 'select', options: ['Legal (front)', 'Illegal'], span: 2 },
            { k: 'kind', label: 'Kind', span: 2, ph: 'e.g. Restaurant, Drug lab, Chop shop' },
            { k: 'address', label: 'Address / Location', span: 4 },
            { k: 'description', label: 'Details', type: 'textarea', rows: 3, ph: 'What happens there, who runs it, hours…' },
          ]} />
        </Modal>
      )}
      {rel && (
        <Modal title="Add Gang Affiliation" onClose={() => setRel(null)} footer={<><button className="btn" onClick={() => setRel(null)}>Cancel</button>
          <button className="btn primary" disabled={!rel.other_id} onClick={() => run(() => api.post(`/api/gangs/${g.id}/relations`, rel), 'Saved').then(() => setRel(null))}>Save</button></>}>
          <div className="form">
            <Field label="Other gang"><select value={rel.other_id || ''} onChange={(e) => setRel({ ...rel, other_id: Number(e.target.value) })}><option value="">Select…</option>{allGangs.filter((x) => x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.status})</option>)}</select></Field>
            <Field label="Relationship"><select value={rel.relation} onChange={(e) => setRel({ ...rel, relation: e.target.value })}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Notes"><input value={rel.notes || ''} onChange={(e) => setRel({ ...rel, notes: e.target.value })} placeholder="e.g. Supplies CDJ with weapons" /></Field>
          </div>
        </Modal>
      )}
      {confirm && <Confirm text={confirm.text} onYes={confirm.yes} onClose={() => setConfirm(null)} yes="Confirm" />}
    </>
  );
}

function AddMemberModal({ gang, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState('search');
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [pick, setPick] = useState(null);
  const [person, setPerson] = useState({});
  const [rank, setRank] = useState('Associate');
  const [confidence, setConfidence] = useState('Suspected');
  useEffect(() => { const t = setTimeout(() => api.get(`/api/persons?q=${encodeURIComponent(q)}`).then(setRes), 200); return () => clearTimeout(t); }, [q]);
  const save = async () => {
    try { await api.post(`/api/gangs/${gang.id}/members`, mode === 'search' ? { person_id: pick.id, rank, confidence } : { person, rank, confidence }); toast('Member added'); onDone(); } catch (e) { toast(e.message, true); }
  };
  return (
    <Modal wide title={`Add Member — ${gang.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={mode === 'search' ? !pick : !person.name} onClick={save}>Add Member</button></>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={'btn sm ' + (mode === 'search' ? 'primary' : '')} onClick={() => setMode('search')}>Existing person</button>
        <button className={'btn sm ' + (mode === 'new' ? 'primary' : '')} onClick={() => setMode('new')}>New person</button>
      </div>
      {mode === 'search' ? (
        <div className="form">
          <input autoFocus placeholder="Search by name, SSN or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="charge-pick" style={{ maxHeight: 220 }}>
            {res.map((p) => (
              <div key={p.id} className={'opt' + (pick?.id === p.id ? ' sel' : '')} onClick={() => setPick(p)}>
                <b>{p.name}</b> <span className="muted small">{[p.ssn && `SSN ${p.ssn}`, p.gang_name && `currently: ${p.gang_name}`].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
            {!res.length && <div className="opt muted">No matches — switch to “New person”.</div>}
          </div>
        </div>
      ) : (
        <Fields v={person} set={setPerson} fields={[{ k: 'name', label: 'Full Name' }, { k: 'ssn', label: 'SSN / State ID', span: 1 }, { k: 'dob', label: 'Date of Birth', type: 'date', span: 1 }, { k: 'description', label: 'Physical Description / Identifiers', type: 'textarea', rows: 2 }]} />
      )}
      <hr className="sep" />
      <div className="grid g2">
        <Field label="Suspected Rank"><select value={rank} onChange={(e) => setRank(e.target.value)}>{RANKS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Membership"><select value={confidence} onChange={(e) => setConfidence(e.target.value)}><option>Suspected</option><option>Confirmed</option></select></Field>
      </div>
    </Modal>
  );
}
