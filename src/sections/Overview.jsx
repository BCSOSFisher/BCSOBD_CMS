import React, { useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Field, Avatar, useToast, fmtDate, Confirm } from '../ui';
import { Fields, SectionPanel } from './common';

export function Overview({ b, reload }) {
  const { config, users } = useApp();
  const toast = useToast();
  const c = b.case;
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(null);
  const [narr, setNarr] = useState(null);
  const [addUser, setAddUser] = useState('');
  const [rm, setRm] = useState(null);
  const startEdit = () => { setV({ title: c.title, opened_at: c.opened_at, incident_date: c.incident_date, incident_time: c.incident_time, incident_tz: c.incident_tz, location: c.location, priority: c.priority, other_agencies: c.other_agencies, bureau_units: c.bureau_units }); setEditing(true); };
  const save = async (patch) => { try { await api.patch(`/api/cases/${c.id}`, patch); await reload(); toast('Saved'); return true; } catch (e) { toast(e.message, true); } };
  const toggle = (k, x) => setV((o) => ({ ...o, [k]: o[k].includes(x) ? o[k].filter((y) => y !== x) : [...o[k], x] }));
  const div = config.divisions.find((d) => d.id === c.division);
  const charges = b.items.filter((i) => i.kind === 'charge');

  return (
    <div className="grid">
      <InactivityNotice b={b} />
      <SectionPanel title="Case Information" actions={b.canEdit && !editing && <button className="btn sm" onClick={startEdit}><Icon n="edit" />Edit</button>}>
        {editing ? (
          <div className="form">
            <Fields v={v} set={setV} fields={[
              { k: 'title', label: 'Case Title', span: 4 },
              { k: 'opened_at', label: 'Date Opened', type: 'date', span: 1 }, { k: 'incident_date', label: 'Date of Incident', type: 'date', span: 1 },
              { k: 'incident_time', label: 'Time of Incident', type: 'time', span: 1 }, { k: 'incident_tz', label: 'Time Zone', span: 1, ph: 'EST' },
              { k: 'location', label: 'Incident Location', span: 3 }, { k: 'priority', label: 'Priority', type: 'select', options: ['Standard', 'High', 'Critical'], span: 1 },
            ]} />
            <div className="grid g2">
              <Field label="Detective Bureau Units Involved">
                <div className="row">{config.divisions.map((d) => <label key={d.id} className="check"><input type="checkbox" checked={v.bureau_units.includes(d.name)} onChange={() => toggle('bureau_units', d.name)} />{d.short}</label>)}</div>
              </Field>
              <Field label="Other Agencies Involved">
                <div className="row">{config.agencies.map((a) => <label key={a} className="check"><input type="checkbox" checked={v.other_agencies.includes(a)} onChange={() => toggle('other_agencies', a)} />{a}</label>)}</div>
              </Field>
            </div>
            <div className="row end"><button className="btn" onClick={() => setEditing(false)}>Cancel</button><button className="btn primary" onClick={async () => (await save(v)) && setEditing(false)}>Save Changes</button></div>
          </div>
        ) : (
          <div className="kv">
            <div>Case Number</div><div className="mono">Case #{c.number} | {c.code}</div>
            <div>Division</div><div>{div?.name}</div>
            <div>Lead Investigator</div><div>{b.lead ? `${config.ranks[b.lead.rank]} ${b.lead.display_name}` : '—'}</div>
            <div>Status</div><div>{c.status}{c.priority && c.priority !== 'Standard' && <span className={`pill ${c.priority === 'Critical' ? 'red' : 'amber'}`} style={{ marginLeft: 8 }}>{c.priority} priority</span>}</div>
            <div>Date Opened</div><div>{fmtDate(c.opened_at)}</div>
            <div>Date of Incident</div><div>{[fmtDate(c.incident_date), c.incident_time, c.incident_tz].filter(Boolean).join(' ') || '—'}</div>
            <div>Location</div><div>{c.location || '—'}</div>
            <div>Bureau Units Involved</div><div>{c.bureau_units.join(', ') || '—'}</div>
            <div>Other Agencies Involved</div><div>{c.other_agencies.join(', ') || 'N/A'}</div>
            <div>Charges Investigated</div><div>{charges.length ? charges.map((ch, i) => <div key={ch.id}>[{i + 1}] {ch.data.code} — {ch.data.name}</div>) : <span className="faint">None yet — add them under Charges & Elements.</span>}</div>
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Incident Report" sub="Narrative of the incident as known"
        actions={b.canEdit && narr == null && <button className="btn sm" onClick={() => setNarr(c.summary || '')}><Icon n="edit" />Edit</button>}>
        {narr != null ? (
          <div className="form">
            <textarea rows={14} value={narr} onChange={(e) => setNarr(e.target.value)} placeholder="At approximately 2030 hours on …" />
            <div className="row end"><button className="btn" onClick={() => setNarr(null)}>Cancel</button><button className="btn primary" onClick={async () => (await save({ summary: narr })) && setNarr(null)}>Save Report</button></div>
          </div>
        ) : c.summary ? <div className="pre" style={{ lineHeight: 1.6 }}>{c.summary}</div> : <span className="faint">No incident narrative has been written yet.</span>}
      </SectionPanel>

      <SectionPanel title="Assigned Investigators" sub="Only these investigators (and supervisors) can edit this case">
        <table className="t" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
          <tbody>
            {b.members.map((m) => (
              <tr key={m.id}>
                <td style={{ width: 40 }}><Avatar u={m} sm /></td>
                <td><b>{m.display_name}</b>{!m.active && <span className="pill red" style={{ marginLeft: 8 }}>Removed from roster</span>}<div className="small muted">{config.ranks[m.rank]}{m.callsign ? ` · ${m.callsign}` : ''}</div></td>
                <td>{m.id === c.lead_id ? <span className="pill navy">Lead Investigator</span> : <span className="pill gray">{m.role}</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  {b.canManage && m.id !== c.lead_id && <>
                    
                    <button className="icon-btn" onClick={() => setRm(m)}><Icon n="x" /></button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {b.canManage && (
          <div className="row" style={{ marginTop: 12 }}>
            <select style={{ maxWidth: 320 }} value={addUser} onChange={(e) => setAddUser(e.target.value)}>
              <option value="">Add an investigator…</option>
              {users.filter((u) => u.active && u.rank !== 'viewer' && !b.members.some((m) => m.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.display_name} — {config.ranks[u.rank]}</option>)}
            </select>
            <button className="btn primary" disabled={!addUser} onClick={async () => {
              try { await api.post(`/api/cases/${c.id}/members`, { user_id: addUser }); setAddUser(''); await reload(); toast('Investigator added'); } catch (e) { toast(e.message, true); }
            }}><Icon n="plus" />Add</button>
          </div>
        )}
      </SectionPanel>

      {(c.transfers || []).length > 0 && (
        <SectionPanel title="Transfer History" sub={`${c.transfers.length} transfer(s)`}>
          <table className="t" style={{ border: '1px solid var(--line)' }}>
            <thead><tr><th>Date</th><th>From</th><th>To</th><th>Unit</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{[...c.transfers].reverse().map((t, i) => (
              <tr key={i}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.at)}</td><td>{t.from_name}</td><td><b>{t.to_name}</b></td>
                <td className="small">{t.from_division === t.to_division ? <span className="faint">—</span> : <>{config.divisions.find((d) => d.id === t.from_division)?.short} → <b>{config.divisions.find((d) => d.id === t.to_division)?.short}</b></>}</td>
                <td className="small">{t.reason}</td><td className="small muted">{t.by}</td></tr>
            ))}</tbody>
          </table>
        </SectionPanel>
      )}

      <SectionPanel title="Audit Trail" sub="Every change to this case file is recorded">
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <table className="t"><tbody>
            {b.audit.map((a) => (
              <tr key={a.id}><td className="mono small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td><b>{a.display_name}</b></td><td>{a.action}</td><td className="muted small">{a.detail}</td></tr>
            ))}
          </tbody></table>
        </div>
      </SectionPanel>
      {rm && <Confirm text={`Remove ${rm.display_name} from this case? They will keep view-only access.`} yes="Remove"
        onYes={async () => { try { await api.del(`/api/cases/${c.id}/members/${rm.id}`); await reload(); } catch (e) { toast(e.message, true); } }} onClose={() => setRm(null)} />}
    </div>
  );
}

function CaseJsonForm({ b, reload, field, title, sub, fields }) {
  const toast = useToast();
  const c = b.case;
  const [v, setV] = useState(null);
  const data = c[field] || {};
  return (
    <SectionPanel title={title} sub={sub} actions={b.canEdit && v == null && <button className="btn sm" onClick={() => setV({ ...data })}><Icon n="edit" />Edit</button>}>
      {v != null ? (
        <div className="form">
          <Fields fields={fields} v={v} set={setV} b={b} />
          <div className="row end"><button className="btn" onClick={() => setV(null)}>Cancel</button>
            <button className="btn primary" onClick={async () => { try { await api.patch(`/api/cases/${c.id}`, { [field]: v }); await reload(); setV(null); toast('Saved'); } catch (e) { toast(e.message, true); } }}>Save</button></div>
        </div>
      ) : (
        <div className="kv">
          {fields.flatMap((f) => [<div key={f.k + 'l'}>{f.label}</div>, <div key={f.k} className="pre">{f.type === 'person' ? (b.persons.find((p) => p.id === data[f.k])?.name || 'N/A') : (data[f.k] || 'N/A')}</div>])}
        </div>
      )}
    </SectionPanel>
  );
}

export const Scene = (p) => <CaseJsonForm {...p} field="scene" title="Scene Observations" sub="Conditions documented at the scene" fields={[
  { k: 'entry', label: 'Entry Points', type: 'textarea', rows: 2 },
  { k: 'weapons', label: 'Weapons', type: 'textarea', rows: 2 },
  { k: 'blood', label: 'Blood Evidence', type: 'textarea', rows: 2 },
  { k: 'condition', label: 'Scene Condition', type: 'textarea', rows: 2 },
  { k: 'other', label: 'Other Details', type: 'textarea', rows: 3 },
]} />;

export const Coroner = (p) => <CaseJsonForm {...p} field="coroner" title="Coroner Summary" sub="Medical examiner findings" fields={[
  { k: 'person_id', label: 'Decedent', type: 'person' },
  { k: 'signed', label: 'Signed (Coroner / M.E.)', ph: 'State Coroner Phil Jones' },
  { k: 'examined', label: 'Date / Time Examined', ph: '30/08/2026 - 1:41 AM BST' },
  { k: 'tod', label: 'Estimated Date / Time of Death' },
  { k: 'cause', label: 'Cause of Death' },
  { k: 'manner', label: 'Manner of Death', type: 'select', options: ['Homicide', 'Suicide', 'Accident', 'Natural', 'Undetermined', 'Pending'] },
  { k: 'tox', label: 'Toxicology Report', type: 'textarea', rows: 2 },
  { k: 'notes', label: 'Additional Notes', type: 'textarea', rows: 3 },
]} />;

// Warns when an open case has had no activity for more than 14 days
export const INACTIVE_DAYS = 14;
function InactivityNotice({ b }) {
  const c = b.case;
  const last = b.lastActivity?.at || c.updated_at;
  if (c.status === 'Closed' || !last) return null;
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (days <= INACTIVE_DAYS) return null;
  const suspended = c.status === 'Suspended';
  return (
    <div className="inactive-notice" role="alert" style={suspended ? { background: 'var(--subtle)', borderColor: 'var(--line-strong)', color: 'var(--muted)' } : undefined}>
      <div className="ico"><Icon n="clock" /></div>
      <div>
        <b>{suspended ? 'Suspended case — ' : ''}No activity for {days} days</b>
        <div>
          Last activity {fmtDate(last)}{b.lastActivity?.display_name ? ` by ${b.lastActivity.display_name}` : ''}{b.lastActivity?.action ? ` (${b.lastActivity.action.toLowerCase()})` : ''}.
          {' '}{suspended ? 'Review whether this case should be reopened or closed.' : 'Add a note, update the case, or change its status (e.g. Suspended) to keep the file current.'}
        </div>
      </div>
    </div>
  );
}
