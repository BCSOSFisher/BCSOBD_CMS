import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Status, Empty, Modal, Field, useForm, useToast, fmtDate, today, nowTime, localTZ, ago } from '../ui';

export default function Cases() {
  const { config } = useApp();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [newCase, setNewCase] = useState(false);
  const nav = useNavigate();
  const q = sp.get('q') || ''; const status = sp.get('status') || ''; const division = sp.get('division') || ''; const mine = sp.get('mine') || '';
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); };
  useEffect(() => {
    setRows(null);
    api.get(`/api/cases?${new URLSearchParams({ q, status, division, mine })}`).then(setRows);
  }, [q, status, division, mine]);
  return (
    <>
      <div className="page-head">
        <div><h1>{mine ? 'My Assignments' : 'Case Files'}</h1><p>{mine ? 'Cases you lead, created, or are assigned to.' : 'All Detective Bureau investigations. Any detective may view; only assigned investigators may edit.'}</p></div>
        <button className="btn gold" onClick={() => setNewCase(true)}><Icon n="plus" />Open New Case</button>
      </div>
      <div className="panel">
        <div className="panel-h" style={{ flexWrap: 'wrap' }}>
          <div className="row" style={{ flex: 1 }}>
            <input style={{ maxWidth: 300 }} placeholder="Search title, case #, location, person…" defaultValue={q} onKeyDown={(e) => e.key === 'Enter' && set('q', e.target.value)} />
            <select style={{ maxWidth: 230 }} value={status} onChange={(e) => set('status', e.target.value)}>
              <option value="">All statuses</option>{config.statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select style={{ maxWidth: 230 }} value={division} onChange={(e) => set('division', e.target.value)}>
              <option value="">All divisions</option>{config.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={!!mine} onChange={(e) => set('mine', e.target.checked ? '1' : '')} />Only my cases</label>
          </div>
          <span className="muted small">{rows ? `${rows.length} case(s)` : ''}</span>
        </div>
        {!rows ? <div className="panel-b muted">Loading…</div> : rows.length ? (
          <table className="t">
            <thead><tr><th>Case #</th><th>Title</th><th>Division</th><th>Lead Investigator</th><th>Status</th><th>Opened</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/cases/${c.id}`)}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>#{c.number} | {c.code}</td>
                  <td><b>{c.title}</b>{c.location && <div className="small muted">{c.location}</div>}</td>
                  <td>{config.divisions.find((d) => d.id === c.division)?.short}</td>
                  <td>{c.lead_name}</td>
                  <td><Status s={c.status} />{JSON.parse(c.closure || '{}').requested ? <div style={{ marginTop: 4 }}><span className="pill amber">Awaiting sign-off</span></div> : null}</td>
                  <td className="muted small">{fmtDate(c.opened_at)}</td>
                  <td className="muted small">{ago(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="No cases found">Try different filters, or open a new case.</Empty>}
      </div>
      {newCase && <NewCaseModal onClose={() => setNewCase(false)} />}
    </>
  );
}

export function NewCaseModal({ onClose }) {
  const { config, users, me } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const [v, setV, bind] = useForm({ division: (me.units || []).find((u) => config.divisions.some((d) => d.id === u)) || '', title: '', incident_date: today(), incident_time: nowTime(), incident_tz: localTZ(), location: '', summary: '', other_agencies: [], assistants: [], opened_at: today() });
  const [busy, setBusy] = useState(false);
  const toggle = (k, x) => setV((o) => ({ ...o, [k]: o[k].includes(x) ? o[k].filter((y) => y !== x) : [...o[k], x] }));
  const div = config.divisions.find((d) => d.id === v.division);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/cases', v);
      toast(`Case #${r.number} | ${r.code} opened`);
      nav(`/cases/${r.id}`);
    } catch (e) { toast(e.message, true); setBusy(false); }
  };
  return (
    <Modal wide title="Open New Case" onClose={onClose} footer={<>
      <span className="muted small" style={{ marginRight: 'auto' }}>{div ? <>Will be filed as <b className="mono">{div.prefix}-{(v.incident_date || today()).slice(0, 4)}-####</b></> : 'Choose a division to generate the case code.'}</span>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy || !v.title || !v.division} onClick={submit}>Open Case</button>
    </>}>
      <div className="form">
        <div className="grid g2">
          <Field label="Division / Unit"><select {...bind('division')}><option value="">Select…</option>{config.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Case Title" hint="e.g. “Homicide — 7138 Las Lagunas Blvd”"><input {...bind('title')} autoFocus /></Field>
        </div>
        <div className="grid g4">
          <Field label="Date of Incident"><input type="date" {...bind('incident_date')} /></Field>
          <Field label="Time"><input type="time" {...bind('incident_time')} /></Field>
          <Field label="Time Zone" hint="Your local zone"><input {...bind('incident_tz')} placeholder="EST" /></Field>
          <Field label="Date Opened"><input type="date" {...bind('opened_at')} /></Field>
        </div>
        <Field label="Incident Location"><input {...bind('location')} placeholder="Address / area" /></Field>
        <Field label="Initial Incident Report" hint="You can expand this later."><textarea {...bind('summary')} rows={4} /></Field>
        <div className="grid g2">
          <Field label="Other Agencies Involved">
            <div className="row">{config.agencies.map((a) => <label key={a} className="check"><input type="checkbox" checked={v.other_agencies.includes(a)} onChange={() => toggle('other_agencies', a)} />{a}</label>)}</div>
          </Field>
          <Field label="Assisting Investigators">
            <div className="row" style={{ maxHeight: 110, overflow: 'auto' }}>
              {users.filter((u) => u.id !== me.id).map((u) => <label key={u.id} className="check"><input type="checkbox" checked={v.assistants.includes(u.id)} onChange={() => toggle('assistants', u.id)} />{u.display_name}</label>)}
              {users.length <= 1 && <span className="faint small">Other detectives appear here after their first login.</span>}
            </div>
          </Field>
        </div>
        {div && <div className="small muted">Sections added automatically for {div.short}: {div.sections.map((s) => config.optionalSections.find((o) => o.key === s)?.label).join(', ') || 'none'}. Detectives can add more sections from the case file.</div>}
      </div>
    </Modal>
  );
}
