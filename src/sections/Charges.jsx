import React, { useEffect, useMemo, useState } from 'react';
import { loadPenalCode } from '../api';
import { Icon, Modal, Field, Empty, Confirm, useToast } from '../ui';
import { SectionPanel, useItems } from './common';

const CLASS_COLOR = (c = '') => (/felony/i.test(c) ? 'red' : /federal/i.test(c) ? 'purple' : /misdemeanor/i.test(c) ? 'amber' : 'gray');
const CHARGE_STATUS = ['Under Investigation', 'Supported — Ready to File', 'Filed / Referred to DA', 'Not Pursued'];

export default function Charges({ b, reload, setSec }) {
  const [adding, setAdding] = useState(false);
  const [rm, setRm] = useState(null);
  const I = useItems(b, reload);
  const charges = b.items.filter((i) => i.kind === 'charge');
  const [pc, setPc] = useState(null);
  useEffect(() => { loadPenalCode().then(setPc); }, []);
  return (
    <SectionPanel title="Charges & Legal Elements" sub="Prove every element — link each one to the evidence that establishes it"
      actions={b.canEdit && <button className="btn primary sm" onClick={() => setAdding(true)}><Icon n="plus" />Add Charge</button>}>
      {!charges.length && <Empty icon="scale" title="No charges yet">Add charges from the San Andreas Penal Code. Each charge comes with its required elements so you can document how each one is proven.</Empty>}
      {charges.map((ch, i) => <ChargeCard key={ch.id} idx={i + 1} ch={ch} b={b} I={I} onRemove={() => setRm(ch)} setSec={setSec} pcEntry={pc?.find((x) => x.code === ch.data.code)} />)}
      {adding && <AddChargeModal b={b} onClose={() => setAdding(false)} onAdd={(data) => I.add('charge', data)} />}
      {rm && <Confirm text={`Remove ${rm.data.code} — ${rm.data.name} from this case?`} yes="Remove" onYes={() => I.remove(rm.id)} onClose={() => setRm(null)} />}
    </SectionPanel>
  );
}

function ChargeCard({ ch, idx, b, I, onRemove, setSec, pcEntry }) {
  const d = ch.data;
  const els = d.elements || [];
  const met = els.filter((e) => e.met).length;
  const [open, setOpen] = useState(true);
  const [showDef, setShowDef] = useState(false);
  const [noteEdit, setNoteEdit] = useState(null);
  const [newEl, setNewEl] = useState('');
  const evidence = b.items.filter((i) => i.kind === 'evidence');
  const suspects = b.persons.filter((p) => p.case_role === 'Suspect' || p.case_role === 'Person of Interest');
  const save = (patch) => I.update(ch.id, patch, true);
  const setEl = (k, patch) => save({ elements: els.map((e, j) => (j === k ? { ...e, ...patch } : e)) });
  const pct = els.length ? Math.round((met / els.length) * 100) : 0;
  const [upd, setUpd] = useState(false);
  const outdated = pcEntry?.curated && !d.curated;
  return (
    <div className="card" style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: 'var(--subtle)', borderBottom: open ? '1px solid var(--line)' : 0 }}>
        <div className="card-h" style={{ marginBottom: 6 }}>
          <span className="mono muted">[{idx}]</span>
          <b>{d.code} — {d.name}</b>
          <span className={`pill ${CLASS_COLOR(d.classification)}`}>{d.classification}</span>
          {d.counts > 1 && <span className="pill gray">{d.counts} counts</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={() => setOpen(!open)}><Icon n={open ? 'up' : 'down'} /></button>
          {b.canEdit && <button className="icon-btn" onClick={onRemove}><Icon n="trash" /></button>}
        </div>
        <div className="row small">
          <span className="muted">Suspect:</span>
          {b.canEdit ? (
            <select style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }} value={d.suspect_person_id || ''} onChange={(e) => save({ suspect_person_id: Number(e.target.value) || null })}>
              <option value="">Unassigned</option>{suspects.map((p) => <option key={p.link_id} value={p.id}>{p.name}</option>)}
            </select>
          ) : <b>{b.persons.find((p) => p.id === d.suspect_person_id)?.name || 'Unassigned'}</b>}
          <span className="muted" style={{ marginLeft: 10 }}>Status:</span>
          {b.canEdit ? (
            <select style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }} value={d.status || CHARGE_STATUS[0]} onChange={(e) => save({ status: e.target.value })}>
              {CHARGE_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : <b>{d.status}</b>}
          {b.canEdit && <><span className="muted" style={{ marginLeft: 10 }}>Counts:</span>
            <input type="number" min="1" style={{ width: 60, padding: '3px 6px' }} value={d.counts || 1} onChange={(e) => save({ counts: Math.max(1, Number(e.target.value)) })} /></>}
          <span className="spacer" />
          <div style={{ width: 160 }}>
            <div className="row small" style={{ justifyContent: 'space-between', marginBottom: 3 }}><span className="muted">Elements</span><b style={{ color: met === els.length && els.length ? 'var(--green)' : undefined }}>{met}/{els.length}</b></div>
            <div className="bar"><i style={{ width: pct + '%', background: pct === 100 ? 'var(--green)' : undefined }} /></div>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ padding: '12px 16px 16px' }}>
          {outdated && (
            <div className="readonly-banner" style={{ background: 'var(--blue-soft)', color: 'var(--blue)', borderColor: 'var(--focus)', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span><Icon n="scale" width="15" style={{ verticalAlign: -3, marginRight: 6 }} />Updated, hand-written elements are available for this charge.</span>
              {b.canEdit && <button className="btn sm" onClick={() => setUpd(true)}>Use updated elements</button>}
            </div>
          )}
          {upd && <Confirm danger={false} yes="Replace elements" text="Replace this charge's elements with the updated checklist? Ticks, linked evidence and notes on the current elements will be cleared, so you'll re-link evidence to the new elements."
            onYes={() => save({ curated: true, elements: pcEntry.elements.map((e) => ({ ...e, met: false, evidence: [], notes: '' })) })} onClose={() => setUpd(false)} />}
          <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => setShowDef(!showDef)}><Icon n="book" />{showDef ? 'Hide' : 'Show'} statutory definition</button>
          {showDef && <div className="small" style={{ background: 'var(--subtle)', border: '1px solid var(--line)', borderRadius: 6, padding: 12, margin: '6px 0', lineHeight: 1.55 }}>{d.definition}
            {d.url && <div style={{ marginTop: 6 }}><a href={d.url} target="_blank" rel="noreferrer">View on SADRP docs <Icon n="external" width="12" /></a></div>}</div>}
          <div className="elements">
            {els.map((e, k) => (
              <div key={k} className={'el' + (e.met ? ' met' : '')}>
                <div className="tick" title={b.canEdit ? 'Mark established' : ''} onClick={() => b.canEdit && setEl(k, { met: !e.met })}>{e.met && <Icon n="check" />}</div>
                <div>
                  <div className="txt"><b className="small muted" style={{ marginRight: 6 }}>Element {k + 1}.</b>{e.text}</div>
                  {e.proof && <div className="small faint" style={{ marginTop: 3 }}><i>Typical proof:</i> {e.proof}</div>}
                  <div className="sub">
                    {(e.evidence || []).map((id) => {
                      const ev = evidence.find((x) => x.id === id);
                      return ev ? <span key={id} className="chip" title={ev.data.title}>{ev.data.ed}{b.canEdit && <button onClick={() => setEl(k, { evidence: e.evidence.filter((x) => x !== id) })}>×</button>}</span> : null;
                    })}
                    {b.canEdit && evidence.length > 0 && (
                      <select style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }} value="" onChange={(ev) => ev.target.value && setEl(k, { evidence: [...new Set([...(e.evidence || []), Number(ev.target.value)])] })}>
                        <option value="">+ Link evidence</option>
                        {evidence.filter((x) => !(e.evidence || []).includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.data.ed} — {(x.data.title || '').slice(0, 50)}</option>)}
                      </select>
                    )}
                    {b.canEdit && !evidence.length && <button className="btn ghost sm" onClick={() => setSec('evidence')}>Log evidence first →</button>}
                    {b.canEdit && <button className="btn ghost sm" onClick={() => setNoteEdit({ k, text: e.notes || '' })}><Icon n="edit" />{e.notes ? 'Edit basis' : 'Explain how established'}</button>}
                    {b.canEdit && e.key?.startsWith('custom') && <button className="btn ghost sm" onClick={() => save({ elements: els.filter((_, j) => j !== k) })}>Remove</button>}
                  </div>
                  {e.notes && noteEdit?.k !== k && <div className="small" style={{ marginTop: 6, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}><b>Basis: </b>{e.notes}</div>}
                  {noteEdit?.k === k && (
                    <div style={{ marginTop: 8 }}>
                      <textarea rows={3} autoFocus value={noteEdit.text} onChange={(ev) => setNoteEdit({ ...noteEdit, text: ev.target.value })} placeholder="e.g. DNA recovered from the bowl (ED-09) was matched to the suspect by the State Lab." />
                      <div className="row end" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => setNoteEdit(null)}>Cancel</button><button className="btn primary sm" onClick={async () => { await setEl(k, { notes: noteEdit.text }); setNoteEdit(null); }}>Save</button></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {b.canEdit && (
            <div className="row" style={{ marginTop: 10 }}>
              <input placeholder="Add an additional element (e.g. sentence enhancement, aggravating factor)…" value={newEl} onChange={(e) => setNewEl(e.target.value)} />
              <button className="btn sm" disabled={!newEl.trim()} onClick={async () => { await save({ elements: [...els, { key: 'custom' + Date.now(), text: newEl.trim(), met: false, evidence: [], notes: '' }] }); setNewEl(''); }}><Icon n="plus" />Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddChargeModal({ b, onClose, onAdd }) {
  const toast = useToast();
  const [pc, setPc] = useState(null);
  const [q, setQ] = useState('');
  const [hideInf, setHideInf] = useState(true);
  const [sel, setSel] = useState(null);
  const [suspect, setSuspect] = useState('');
  const [counts, setCounts] = useState(1);
  useEffect(() => { loadPenalCode().then(setPc); }, []);
  const suspects = b.persons.filter((p) => p.case_role === 'Suspect' || p.case_role === 'Person of Interest');
  const list = useMemo(() => {
    if (!pc) return [];
    const t = q.toLowerCase().trim();
    return pc.filter((c) => (!hideInf || !/^infraction/i.test(c.classification)) &&
      (!t || `${c.code} ${c.name} ${c.category}`.toLowerCase().includes(t) || c.code.replace(/[\[\]\s]/g, '').includes(t.replace(/[\[\]\s]/g, ''))));
  }, [pc, q, hideInf]);
  const add = async () => {
    try {
      await onAdd({
        code: sel.code, name: sel.name, classification: sel.classification, definition: sel.definition, url: sel.url, curated: !!sel.curated,
        suspect_person_id: Number(suspect) || null, counts, status: 'Under Investigation',
        elements: sel.elements.map((e) => ({ ...e, met: false, evidence: [], notes: '' })),
      });
      onClose();
    } catch (e) { toast(e.message, true); }
  };
  return (
    <Modal wide title="Add Charge from Penal Code" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!sel} onClick={add}>Add Charge</button></>}>
      <div className="row" style={{ marginBottom: 10 }}>
        <input autoFocus placeholder="Search by code (e.g. 2-1.2) or name (e.g. murder, robbery)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={hideInf} onChange={(e) => setHideInf(e.target.checked)} />Hide infractions</label>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="charge-pick">
          {!pc && <div className="opt muted">Loading penal code…</div>}
          {list.slice(0, 200).map((c) => (
            <div key={c.code + c.name} className={'opt' + (sel === c ? ' sel' : '')} onClick={() => setSel(c)}>
              <div className="row" style={{ gap: 6 }}><span className="mono small">{c.code}</span><b style={{ flex: 1 }}>{c.name}</b>{c.curated && <span className="pill green" title="Hand-written elements">✓ Elements</span>}<span className={`pill ${CLASS_COLOR(c.classification)}`}>{c.classification}</span></div>
              <div className="small faint">{c.category}</div>
            </div>
          ))}
          {pc && !list.length && <div className="opt muted">No charges match.</div>}
        </div>
        <div>
          {sel ? (
            <div className="form">
              <div><div className="mono small muted">{sel.code} · {sel.category}</div><h3 style={{ margin: '4px 0 8px' }}>{sel.name}</h3>
                <div className="small" style={{ lineHeight: 1.55 }}>{sel.definition}</div>
                <div className="row small" style={{ marginTop: 8 }}>{sel.sentence && <span className="pill gray">Sentence: {sel.sentence}</span>}{sel.fine && <span className="pill gray">Fine: {sel.fine}</span>}</div>
              </div>
              <div><div className="tag" style={{ marginBottom: 6 }}>Elements to prove</div>
                <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>{sel.elements.map((e) => <li key={e.key} style={{ marginBottom: 4 }}>{e.text}{e.proof && <div className="faint"><i>Typical proof:</i> {e.proof}</div>}</li>)}</ol>
                <div className="small faint" style={{ marginTop: 6 }}>You can edit, add or remove elements after adding the charge.</div>
              </div>
              <div className="grid g2">
                <Field label="Suspect"><select value={suspect} onChange={(e) => setSuspect(e.target.value)}><option value="">Unassigned</option>{suspects.map((p) => <option key={p.link_id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Counts"><input type="number" min="1" value={counts} onChange={(e) => setCounts(Math.max(1, Number(e.target.value)))} /></Field>
              </div>
            </div>
          ) : <Empty icon="scale" title="Select a charge">Pick a charge on the left to see its definition and elements.</Empty>}
        </div>
      </div>
    </Modal>
  );
}
