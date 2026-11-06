import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, download } from '../api';
import { useApp } from '../App';
import { Icon, Modal, Confirm, useToast, fmtDate } from '../ui';
import { GenericSection } from '../sections/common';
import { Overview, Scene, Coroner } from '../sections/Overview';
import PersonsSection from '../sections/Persons';
import Charges from '../sections/Charges';
import Evidence from '../sections/Evidence';
import Interviews from '../sections/Interviews';
import { Notes, Timeline, Links, CustomSection } from '../sections/Misc';
import Warrants from '../sections/Warrants';
import Media from '../sections/Media';
import Closure from '../sections/Closure';
import { GENERIC } from '../sections/generic-config';

export default function CaseView() {
  const { id } = useParams();
  const { config } = useApp();
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

  const reload = useCallback(() => api.get(`/api/cases/${id}`).then(setB).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);
  if (err) return <div className="panel panel-b">{err}</div>;
  if (!b) return <div className="muted">Loading case file…</div>;
  const c = b.case;
  const div = config.divisions.find((d) => d.id === c.division);
  const count = (k) => b.items.filter((i) => i.kind === k).length;
  const counts = {
    persons: b.persons.length, charges: count('charge'), evidence: count('evidence'), interviews: count('interview'), notes: count('note'),
    warrants: count('warrant'), media: b.files.length + count('medialink'), links: b.links.length, vehicles: count('vehicle'), bolos: count('bolo'),
    surveillance: count('surveillance'), informants: count('informant'), operations: count('operation'), financial: count('financial'),
  };
  const enabled = c.sections || [];
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
    media: <Media {...props} />, links: <Links {...props} />, closure: <Closure {...props} />, scene: <Scene {...props} />, coroner: <Coroner {...props} />,
  }[sec] || <Overview {...props} />;

  return (
    <>
      <div className="case-head">
        <div className="num">Case #{c.number} | {c.code}</div>
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
          <button className="btn gold" onClick={report} disabled={busy}><Icon n="download" />{busy ? 'Generating…' : 'Download Report'}</button>
          {b.isSupervisor && <button className="btn" style={{ background: 'transparent', color: '#c8d1e0', borderColor: '#33476b' }} onClick={() => setDelCase(true)} title="Delete case"><Icon n="trash" /></button>}
        </div>
      </div>

      {!b.canEdit && (
        <div className="readonly-banner"><Icon n="lock" width="15" />
          {c.status === 'Closed' ? 'This case is closed and locked. A supervisor can reopen it from Review & Closure.'
            : c.closure?.requested ? 'This case has been submitted for supervisor review and is locked until it is approved or returned.'
              : 'View only — you are not assigned to this case. Ask the lead investigator to add you.'}
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
      {delCase && <Confirm text={`Permanently delete case ${c.code} and all of its evidence, media and records? This cannot be undone.`}
        onYes={async () => { await api.del(`/api/cases/${c.id}`); toast('Case deleted'); nav('/cases'); }} onClose={() => setDelCase(false)} />}
    </>
  );
}
