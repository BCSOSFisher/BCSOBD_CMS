import React, { useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Field, useToast, fmtDT } from '../ui';
import { SectionPanel } from './common';

const DISPOSITIONS = ['Cleared by Arrest', 'Referred to DA — Charges Filed', 'Exceptionally Cleared (suspect deceased / unavailable)', 'Unfounded', 'Insufficient Evidence — Inactive', 'Transferred to Other Agency'];

export default function Closure({ b, reload }) {
  const { me, config } = useApp();
  const toast = useToast();
  const c = b.case; const cl = c.closure || {};
  const [v, setV] = useState({ disposition: cl.disposition || '', closing_summary: cl.closing_summary || '', agree: false });
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const call = async (url, body, msg) => { try { await api.post(url, body); await reload(); toast(msg); } catch (e) { toast(e.message, true); } };

  const charges = b.items.filter((i) => i.kind === 'charge');
  const outstanding = charges.reduce((n, ch) => n + (ch.data.elements || []).filter((e) => !e.met).length, 0);
  const checks = [
    { ok: !!c.summary, t: 'Incident report narrative written' },
    { ok: b.persons.some((p) => p.case_role === 'Suspect') || c.status !== 'Closed', t: 'Suspect(s) identified (if applicable)', soft: true },
    { ok: charges.length > 0, t: 'Charges recorded', soft: true },
    { ok: charges.length > 0 && outstanding === 0, t: outstanding ? `${outstanding} charge element(s) still outstanding` : 'All charge elements established', soft: true },
    { ok: b.items.some((i) => i.kind === 'evidence'), t: 'Evidence logged' },
    { ok: !b.items.some((i) => i.kind === 'warrant' && ['Draft', 'Submitted to DOJ'].includes(i.data.status)), t: 'No warrants left in Draft / Submitted', soft: true },
  ];
  const leadName = cl.detective_sig?.name || b.lead?.display_name || me.display_name;
  const canSubmit = b.canEdit && !cl.requested && c.status !== 'Closed' && me.rank !== 'trainee';
  const traineeBlocked = b.canEdit && !cl.requested && c.status !== 'Closed' && me.rank === 'trainee';

  return (
    <div className="grid">
      <SectionPanel title="Case Readiness" sub="Checked before submission — soft items are warnings only">
        <div style={{ display: 'grid', gap: 8 }}>
          {checks.map((x, i) => (
            <div key={i} className="row small">
              <span className={`pill ${x.ok ? 'green' : x.soft ? 'amber' : 'red'}`} style={{ minWidth: 74, justifyContent: 'center' }}>{x.ok ? 'Complete' : x.soft ? 'Review' : 'Missing'}</span>{x.t}
            </div>
          ))}
        </div>
      </SectionPanel>

      <SectionPanel title="Detective Declaration & Signature" sub="Lead investigator submits the case for supervisor review">
        {traineeBlocked ? <p style={{ margin: 0 }} className="muted">Trainees can’t sign a case for closure. The lead investigator signs and submits it once the investigation is complete.</p> : canSubmit ? (
          <div className="form">
            <div className="grid g2">
              <Field label="Case Disposition"><select value={v.disposition} onChange={(e) => setV({ ...v, disposition: e.target.value })}><option value="">Select…</option>{DISPOSITIONS.map((d) => <option key={d}>{d}</option>)}</select></Field>
              <Field label="Current Status"><input value={c.status} disabled /></Field>
            </div>
            <Field label="Closing Summary" hint="Outcome of the investigation, arrests made, charges filed."><textarea rows={5} value={v.closing_summary} onChange={(e) => setV({ ...v, closing_summary: e.target.value })} /></Field>
            <div className="declaration">I, Detective {me.display_name}, declare that the information provided in this statement is true and accurate to the best of my knowledge and belief. I understand that knowingly providing false or misleading information may result in criminal charges.</div>
            <label className="check"><input type="checkbox" checked={v.agree} onChange={(e) => setV({ ...v, agree: e.target.checked })} />I affirm the declaration above and electronically sign this case report.</label>
            <div className="row end"><button className="btn gold" disabled={!v.agree || !v.disposition} onClick={() => call(`/api/cases/${c.id}/closure/submit`, v, 'Signed and submitted for supervisor review')}><Icon n="pen" />Sign & Submit for Closure</button></div>
            <p className="small faint" style={{ margin: 0 }}>Once submitted, the case is locked for editing until a supervisor approves or returns it.</p>
          </div>
        ) : (
          <div className="grid g2">
            <div className="sig">
              <div className="tag">Detective Signature</div>
              <div className="line">{cl.detective_sig ? cl.detective_sig.name : ''}</div>
              <div className="small muted" style={{ marginTop: 6 }}>{cl.detective_sig ? <>{config.ranks[cl.detective_sig.rank]} {cl.detective_sig.name} · {fmtDT(cl.detective_sig.signed_at)}</> : 'Not yet signed'}</div>
            </div>
            <div className="sig">
              <div className="tag">Disposition</div>
              <div style={{ marginTop: 8, fontWeight: 600 }}>{cl.disposition || '—'}</div>
              {cl.closing_summary && <div className="small pre muted" style={{ marginTop: 6 }}>{cl.closing_summary}</div>}
            </div>
          </div>
        )}
        {cl.requested && (b.isSupervisor || cl.detective_sig?.user_id === me.id) ? (
          <div className="row end" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => call(`/api/cases/${c.id}/closure/withdraw`, {}, 'Submission withdrawn')}>Withdraw submission</button></div>
        ) : null}
      </SectionPanel>

      <SectionPanel title="Command Sign-off" sub="Bureau Lead, Co-Lead or Supervisor — required to close the case">
        {cl.supervisor_sig ? (
          <div className="sig">
            <div className="tag">Supervisor Signature</div>
            <div className="line">{cl.supervisor_sig.name}</div>
            <div className="small muted" style={{ marginTop: 6 }}>{config.ranks[cl.supervisor_sig.rank || 'supervisor']} {cl.supervisor_sig.name} · {fmtDT(cl.supervisor_sig.signed_at)}</div>
            {cl.supervisor_sig.comment && <div className="small" style={{ marginTop: 6 }}><b>Comments:</b> {cl.supervisor_sig.comment}</div>}
          </div>
        ) : cl.requested && b.isSupervisor ? (
          <div className="form">
            <p style={{ margin: 0 }}>Review the full case file (use <b>Download Report</b> above for the court-ready document), then approve or return it to the detective.</p>
            <Field label="Supervisor Comments (optional)"><textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
            <div className="row end"><button className="btn green" onClick={() => call(`/api/cases/${c.id}/closure/approve`, { comment }, 'Case approved and closed')}><Icon n="check" />Sign & Close Case</button></div>
            <hr className="sep" />
            <Field label="Return to detective — reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Element 3 of charge [1] needs supporting evidence" /></Field>
            <div className="row end"><button className="btn danger" disabled={!reason} onClick={() => call(`/api/cases/${c.id}/closure/reject`, { reason }, 'Case returned to detective')}>Return for Revision</button></div>
          </div>
        ) : (
          <span className="muted">{cl.requested ? 'Awaiting review by a Bureau Supervisor.' : 'The case must be signed and submitted by the detective first.'}</span>
        )}
        {c.status === 'Closed' && b.isSupervisor && (
          <div className="row end" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => { const r = prompt('Reason for reopening this case?'); if (r !== null) call(`/api/cases/${c.id}/reopen`, { reason: r }, 'Case reopened'); }}>Reopen Case</button></div>
        )}
      </SectionPanel>
    </div>
  );
}
