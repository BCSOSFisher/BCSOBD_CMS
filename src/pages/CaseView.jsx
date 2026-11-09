import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, download } from '../api';
import { useApp } from '../App';
import { Icon, Modal, Confirm, Field, useToast, fmtDate } from '../ui';
import { GenericSection } from '../sections/common';
import { Overview, Scene, Coroner } from '../sections/Overview';
import PersonsSection from '../sections/Persons';
import Charges from '../sections/Charges';
import Evidence from '../sections/Evidence';
import Interviews from '../sections/Interviews';
import { Notes, Timeline, Links, CustomSection } from '../sections/Misc';
import Warrants from '../sections/Warrants';
import Media from '../sections/Media';
import CaseVehicles from '../sections/Vehicles';
import Closure from '../sections/Closure';
import { GENERIC } from '../sections/generic-config';

export default function CaseView() {
  const { id } = useParams();
  const { config, me } = useApp();
  const [sp, setSp] = useSearchParams();
  const [b, setB] = useState(null);
  const [err, setErr] = useState(null);
  const [addSec, setAddSec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delCase, setDelCase] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const sec = sp.get('s') || 'overview';
  const setSec = (s) => { const n = new URLSearchParams(sp); n.set('s', s); setSp(n, { replace: true }); window.scrollTo({ top: 0 }); };

  const reload = useCallback(() => api.get(`/api/cases/${id}`).then((x) => { setErr(null); setB(x); }).catch((e) => setErr(e)), [id]);
  const [classify, setClassify] = useState(false);
  const [transfer, setTransfer] = useState(false);
  useEffect(() => { reload(); }, [reload]);
  if (err?.data?.code === 'classified') return (
    <div className="classified-block">
      <div className="classified-icon"><Icon n="lock" /></div>
      <div className="mono" style={{ color: 'var(--red)', fontSize: 12.5, letterSpacing: '.06em' }}>CASE #{err.data.number} | {err.data.case_code}</div>
      <h2>Classified Case</h2>
      <p>This case has been classified by its Lead Investigator. Access is restricted to: <b>{err.data.units.join(', ')}</b>, the assigned investigators, and Bureau command.</p>
      <p className="small muted">Your attempt to open this case has been recorded. If you need access, ask the Lead Investigator to add you to the case.</p>
      <button className="btn" onClick={() => nav('/cases')}>Back to Case Files</button>
    </div>
  );
  if (err) return <div className="panel panel-b">{err.message}</div>;
  if (!b) return <div className="muted">Loading case file…</div>;
  const c = b.case;
  const div = config.divisions.find((d) => d.id === c.division);
  const count = (k) => b.items.filter((i) => i.kind === k).length;
  const counts = {
    persons: b.persons.length, charges: count('charge'), evidence: count('evidence'), interviews: count('interview'), notes: count('note'),
    warrants: count('warrant'), media: b.files.length + count('medialink'), links: b.links.length, vehicles: (b.vehicles || []).length, bolos: count('bolo'),
    surveillance: count('surveillance'), informants: count('informant'), operations: count('operation'), financial: count('financial'),
  };
  // a section with content always shows, even if it was never added from "Add Section"
  const enabled = [...new Set([...(c.sections || []), ...((b.vehicles || []).length ? ['vehicles'] : [])])];
  const customs = b.items.filter((i) => i.kind === 'custom');

  const setStatus = async (status) => {
    try { await api.patch(`/api/cases/${c.id}`, { status }); await reload(); toast(`Status set to ${status}`); } catch (e) { toast(e.message, true); }
  };
  const addSection = async (key) => {
    setAddSec(false);
    if (key === 'custom') {
      const title = prompt('Section title (e.g. “Phone Extraction Findings”)');
      if (!title) return;
      await api.post(`/api/cases/${c.id}/items`, { kind: 'custom', data: { title, body: '' } });
      await reload(); return;
    }
    await api.patch(`/api/cases/${c.id}`, { sections: [...new Set([...enabled, key])] });
    await reload(); setSec(key);
  };
  const removeSection = async (key) => {
    await api.patch(`/api/cases/${c.id}`, { sections: enabled.filter((k) => k !== key) });
    await reload(); setSec('overview');
  };
  const report = async () => {
    setBusy(true);
    try { await download(`/api/cases/${c.id}/report.docx`, `${c.code} Case Report.docx`); toast('Report downloaded'); } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  const props = { b, reload, setSec };
  const optLabel = (k) => config.optionalSections.find((o) => o.key === k)?.label;
  let body;
  if (sec.startsWith('custom-')) { const it = customs.find((x) => x.id === Number(sec.slice(7))); body = it ? <CustomSection {...props} item={it} /> : null; }
  else if (GENERIC[sec]) body = <GenericSection {...props} {...GENERIC[sec]} />;
  else body = {
    overview: <Overview {...props} />, persons: <PersonsSection {...props} />, charges: <Charges {...props} />, evidence: <Evidence {...props} />,
    interviews: <Interviews {...props} />, notes: <Notes {...props} />, timeline: <Timeline {...props} />, warrants: <Warrants {...props} />,
    media: <Media {...props} />, vehicles: <CaseVehicles {...props} />, links: <Links {...props} />, closure: <Closure {...props} />, scene: <Scene {...props} />, coroner: <Coroner {...props} />,
  }[sec] || <Overview {...props} />;

  return (
    <>
      <div className="case-head">
        <div className="num">Case #{c.number} | {c.code}{c.secure?.on ? <span className="classified-tag"><Icon n="lock" />CLASSIFIED · {b.classifiedUnits.join(', ')}</span> : null}</div>
        <h1>{c.title}</h1>
        <div className="meta">
          <div><span>Division</span><b>{div?.name}</b></div>
          <div><span>Lead Investigator</span><b>{b.lead?.display_name || '—'}</b></div>
          <div><span>Assistants</span><b>{b.members.filter((m) => m.id !== c.lead_id).map((m) => m.display_name).join(', ') || '—'}</b></div>
          <div><span>Date Opened</span><b>{fmtDate(c.opened_at)}</b></div>
          <div><span>Status</span>
            {b.canEdit ? (
              <select value={c.status} onChange={(e) => setStatus(e.target.value)}>
                {config.statuses.filter((s) => s !== 'Closed' || b.isSupervisor || c.status === 'Closed').map((s) => <option key={s}>{s}</option>)}
              </select>
            ) : <b>{c.status}</b>}
          </div>
        </div>
        <div className="actions">
          {(b.canClassify || b.isSupervisor) && c.status !== 'Closed' && !c.closure?.requested && <button className="btn" style={{ background: 'transparent', color: '#fff', borderColor: '#33476b' }} onClick={() => setTransfer(true)}><Icon n="users" />Transfer</button>}
          {b.canClassify && <button className="btn" style={{ background: c.secure?.on ? '#7a1712' : 'transparent', color: '#fff', borderColor: c.secure?.on ? '#b42318' : '#33476b' }} onClick={() => setClassify(true)}><Icon n="lock" />{c.secure?.on ? 'Classified' : 'Classify'}</button>}
          <button className="btn gold" onClick={report} disabled={busy}><Icon n="download" />{busy ? 'Generating…' : 'Download Report'}</button>
          {b.isSupervisor && <button className="btn" style={{ background: 'transparent', color: '#c8d1e0', borderColor: '#33476b' }} onClick={() => setDelCase(true)} title="Delete case"><Icon n="trash" /></button>}
        </div>
      </div>

      {!b.canEdit && (
        <div className="readonly-banner"><Icon n="lock" width="15" />
          {c.status === 'Closed' ? 'This case is closed and locked. A supervisor can reopen it from Review & Closure.'
            : c.closure?.requested ? 'This case has been submitted for supervisor review and is locked until it is approved or returned.'
              : me.rank === 'viewer' ? 'View only — your Detective Bureau access is read-only.' : 'View only — you are not assigned to this case. Ask the lead investigator to add you.'}
        </div>
      )}
      {c.closure?.rejected && !c.closure?.requested && c.status !== 'Closed' && (
        <div className="readonly-banner" style={{ background: 'var(--red-soft)', color: 'var(--red)', borderColor: '#f3c1bb' }}>
          <Icon n="alert" width="15" />Returned by {c.closure.rejected.by}: {c.closure.rejected.reason || 'No reason given.'}
        </div>
      )}

      <div className="case-grid">
        <div className="panel sec-nav">
          {config.coreSections.filter((s) => s.key !== 'closure').map((s) => (
            <button key={s.key} className={sec === s.key ? 'on' : ''} onClick={() => setSec(s.key)}>{s.label}{counts[s.key] != null && <span className="n">{counts[s.key]}</span>}</button>
          ))}
          {(enabled.length > 0 || customs.length > 0) && <div className="div" />}
          {enabled.map((k) => (
            <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{optLabel(k)}{counts[k] != null && <span className="n">{counts[k]}</span>}</button>
          ))}
          {customs.map((cs) => <button key={cs.id} className={sec === `custom-${cs.id}` ? 'on' : ''} onClick={() => setSec(`custom-${cs.id}`)}>{cs.data.title}</button>)}
          {b.canEdit && <button className="add" onClick={() => setAddSec(true)}><Icon n="plus" width="14" />Add Section</button>}
          <div className="div" />
          <button className={sec === 'closure' ? 'on' : ''} onClick={() => setSec('closure')}><Icon n="pen" width="14" />Review & Closure
            {c.closure?.requested ? <span className="n" style={{ color: 'var(--amber)' }}>●</span> : null}</button>
        </div>
        <div>
          {enabled.includes(sec) && b.canEdit && (
            <div className="row end" style={{ marginBottom: 8 }}><button className="btn ghost sm" onClick={() => removeSection(sec)}>Hide this section</button></div>
          )}
          {body}
        </div>
      </div>

      {addSec && (
        <Modal title="Add a Section to This Case" onClose={() => setAddSec(false)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {config.optionalSections.filter((o) => o.key === 'custom' || !enabled.includes(o.key)).map((o) => (
              <button key={o.key} className="card" style={{ textAlign: 'left', cursor: 'pointer', margin: 0 }} onClick={() => addSection(o.key)}>
                <b>{o.label}</b><div className="muted small">{o.desc}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {classify && <ClassifyModal b={b} reload={reload} onClose={() => setClassify(false)} />}
      {transfer && <TransferModal b={b} reload={reload} onClose={() => setTransfer(false)} />}
      {delCase && <Confirm text={`Permanently delete case ${c.code} and all of its evidence, media and records? This cannot be undone.`}
        onYes={async () => { await api.del(`/api/cases/${c.id}`); toast('Case deleted'); nav('/cases'); }} onClose={() => setDelCase(false)} />}
    </>
  );
}

function ClassifyModal({ b, reload, onClose }) {
  const { config, users } = useApp();
  const toast = useToast();
  const c = b.case;
  const on = !!c.secure?.on;
  const [units, setUnits] = useState(on ? c.secure.units : [c.division]);
  const [reason, setReason] = useState(c.secure?.reason || '');
  const tog = (id) => setUnits((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const memberCount = (id) => users.filter((u) => u.active && (u.units || []).includes(id)).length;
  const save = async () => {
    try { await api.post(`/api/cases/${c.id}/classify`, { units, reason }); await reload(); toast(on ? 'Classification updated' : 'Case classified'); onClose(); } catch (e) { toast(e.message, true); }
  };
  const lift = async () => {
    try { await api.post(`/api/cases/${c.id}/declassify`); await reload(); toast('Classification removed'); onClose(); } catch (e) { toast(e.message, true); }
  };
  return (
    <Modal title={on ? 'Classified Case Settings' : 'Classify This Case'} onClose={onClose} footer={<>
      {on && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={lift}>Remove Classification</button>}
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!units.length} onClick={save}><Icon n="lock" />{on ? 'Save' : 'Classify Case'}</button></>}>
      <p style={{ marginTop: 0 }}>Only the units you select below can open this case. Everyone else will see it as <b>CLASSIFIED</b> with no details, and it won’t appear in their searches.</p>
      <div className="small muted" style={{ marginBottom: 14 }}>Always allowed: investigators assigned to this case, and Bureau command (Lead, Co-Lead, Supervisors) for oversight and sign-off.</div>
      <div className="form">
        <Field label="Units with access">
          <div style={{ display: 'grid', gap: 6 }}>
            {config.divisions.map((d) => (
              <label key={d.id} className="check"><input type="checkbox" checked={units.includes(d.id)} onChange={() => tog(d.id)} />
                {d.name} <span className="faint small">· {memberCount(d.id)} member(s) via Discord unit role</span></label>
            ))}
          </div>
        </Field>
        <Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Internal investigation / Active CI / Ongoing operation" /></Field>
      </div>
      {on && <p className="small faint" style={{ marginBottom: 0 }}>Classified by {c.secure.by} on {fmtDate(c.secure.at)}.</p>}
    </Modal>
  );
}

function TransferModal({ b, reload, onClose }) {
  const { config, users } = useApp();
  const toast = useToast();
  const c = b.case;
  const [v, setV] = useState({ to_user_id: '', division: c.division, reason: '', keep_previous: true });
  const eligible = users.filter((u) => u.active && !['trainee', 'viewer'].includes(u.rank) && u.id !== c.lead_id)
    .sort((a, z) => ((z.units || []).includes(v.division) - (a.units || []).includes(v.division)) || a.display_name.localeCompare(z.display_name));
  const save = async () => {
    try { await api.post(`/api/cases/${c.id}/transfer`, v); await reload(); toast('Case transferred'); onClose(); } catch (e) { toast(e.message, true); }
  };
  return (
    <Modal title="Transfer Case" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!v.to_user_id || !v.reason.trim()} onClick={save}><Icon n="users" />Transfer Case</button></>}>
      <p style={{ marginTop: 0 }}>Hand <b>Case #{c.number} | {c.code}</b> to a new Lead Investigator{config.divisions.length > 1 ? ', and optionally another unit' : ''}. The transfer is recorded in the case history and the report.</p>
      <div className="form">
        <Field label="Transfer to unit"><select value={v.division} onChange={(e) => setV({ ...v, division: e.target.value })}>{config.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}{d.id === c.division ? ' (current)' : ''}</option>)}</select></Field>
        <Field label="New Lead Investigator" hint="Members of the selected unit are listed first">
          <select value={v.to_user_id} onChange={(e) => setV({ ...v, to_user_id: Number(e.target.value) || '' })}>
            <option value="">Select…</option>
            {eligible.map((u) => <option key={u.id} value={u.id}>{u.display_name} — {config.ranks[u.rank]}{(u.units || []).includes(v.division) ? ' ★' : ''}</option>)}
          </select>
        </Field>
        <Field label="Reason for transfer"><textarea rows={3} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. Suspect linked to CDJ — transferring to Gang & Narcotics" /></Field>
        <label className="check"><input type="checkbox" checked={v.keep_previous} onChange={(e) => setV({ ...v, keep_previous: e.target.checked })} />Keep {b.lead?.display_name || 'the current lead'} on the case as an assistant</label>
      </div>
      <p className="small faint" style={{ marginBottom: 0 }}>The case number and code (e.g. {c.code}) stay the same after a transfer.</p>
    </Modal>
  );
}
