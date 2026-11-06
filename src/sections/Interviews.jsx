import React, { useState } from 'react';
import { useApp } from '../App';
import { Icon, Empty, Confirm, Modal, useToast, fmtDate, today, nowTime, localTZ } from '../ui';
import { Fields, SectionPanel, useItems } from './common';

const TYPES = ['Suspect Interview', 'Witness Statement', 'Victim Statement', 'Informant Debrief', 'Other Interview'];

export default function Interviews({ b, reload }) {
  const { me } = useApp();
  const I = useItems(b, reload);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [open, setOpen] = useState({});
  const items = b.items.filter((i) => i.kind === 'interview');
  return (
    <SectionPanel title="Interviews & Statements" sub="Suspect interviews, witness and victim statements"
      actions={b.canEdit && <button className="btn primary sm" onClick={() => setEdit({ data: { type: 'Witness Statement', date: today(), time: nowTime(), tz: localTZ(), conducted_by: me.display_name, qa: [] } })}><Icon n="plus" />New Interview</button>}>
      {!items.length && <Empty icon="mic" title="No interviews recorded">Record Miranda status, whether it was recorded, and the question-and-answer record.</Empty>}
      {items.map((it) => {
        const d = it.data; const p = b.persons.find((x) => x.id === d.person_id);
        const isS = d.type === 'Suspect Interview';
        return (
          <div className="card" key={it.id}>
            <div className="card-h">
              <span className={`pill ${isS ? 'red' : 'blue'}`}>{d.type}</span>
              <b>{p?.name || d.subject || 'Unknown subject'}</b>
              <span className="muted small">{[fmtDate(d.date), d.time, d.tz].filter(Boolean).join(' ')}</span>
              <span className="spacer" />
              {b.canEdit && <><button className="icon-btn" onClick={() => setEdit(it)}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setDel(it)}><Icon n="trash" /></button></>}
            </div>
            <div className="row small" style={{ gap: 16, marginBottom: 8 }}>
              {(isS || d.miranda) && <span><b>Miranda read:</b> <span className={`pill ${d.miranda ? 'green' : 'red'}`}>{d.miranda ? 'Yes' : 'No'}</span></span>}
              {(isS || d.miranda) && d.waiver && <span><b>Waiver:</b> {d.waiver}</span>}
              <span><b>Recorded:</b> <span className={`pill ${d.recorded ? 'green' : 'gray'}`}>{d.recorded ? 'Yes' : 'No'}</span></span>
              {d.location && <span><b>Location:</b> {d.location}</span>}
              {d.conducted_by && <span><b>By:</b> {d.conducted_by}</span>}
              {d.counsel && <span><b>Counsel:</b> {d.counsel}</span>}
            </div>
            {d.summary && <div className="pre small" style={{ marginBottom: 8 }}><b>Summary: </b>{d.summary}</div>}
            {d.statement && <div className="pre" style={{ background: '#f8f9fb', padding: 10, borderRadius: 6, marginBottom: 8 }}>{d.statement}</div>}
            {(d.qa || []).length > 0 && (
              <>
                <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => setOpen({ ...open, [it.id]: !open[it.id] })}><Icon n={open[it.id] ? 'up' : 'down'} />{open[it.id] ? 'Hide' : 'Show'} transcript ({d.qa.length} Q&A)</button>
                {open[it.id] && d.qa.map((x, i) => <div className="qa" key={i}><div className="q">Q: “{x.q}”</div><div className="a">A: {x.a}</div></div>)}
              </>
            )}
          </div>
        );
      })}
      {edit && <InterviewModal b={b} item={edit} onClose={() => setEdit(null)} onSave={(v) => (edit.id ? I.update(edit.id, v) : I.add('interview', v))} />}
      {del && <Confirm text="Delete this interview record?" onYes={() => I.remove(del.id)} onClose={() => setDel(null)} />}
    </SectionPanel>
  );
}

function InterviewModal({ b, item, onSave, onClose }) {
  const toast = useToast();
  const [v, setV] = useState({ qa: [], ...item.data });
  const isS = v.type === 'Suspect Interview';
  const fields = [
    { k: 'type', label: 'Type', type: 'select', options: TYPES, span: 1 },
    { k: 'person_id', label: 'Subject (from Persons Involved)', type: 'person', span: 2 },
    { k: 'subject', label: 'Or name (if not listed)', span: 1 },
    { k: 'date', label: 'Date', type: 'date', span: 1 }, { k: 'time', label: 'Time', type: 'time', span: 1 }, { k: 'tz', label: 'Time Zone', span: 1 },
    { k: 'location', label: 'Location', span: 1, ph: 'Interview Room 2' },
    { k: 'conducted_by', label: 'Conducted By', span: 2 }, { k: 'counsel', label: 'Counsel Present', span: 2, ph: 'None / attorney name' },
    { k: 'miranda', label: 'Miranda rights read', type: 'check', span: 1 },
    ...(isS || v.miranda ? [{ k: 'waiver', label: 'Waiver', type: 'select', options: ['Waived — agreed to speak', 'Invoked right to silence', 'Invoked right to counsel', 'Not applicable'], span: 2 }] : []),
    { k: 'recorded', label: 'Interview recorded', type: 'check', span: isS || v.miranda ? 1 : 3 },
    { k: 'summary', label: 'Summary', type: 'textarea', rows: 3 },
    ...(!isS ? [{ k: 'statement', label: 'Written / Verbal Statement', type: 'textarea', rows: 5 }] : []),
  ];
  const setQA = (i, patch) => setV({ ...v, qa: v.qa.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Modal wide title={item.id ? 'Edit Interview' : 'New Interview / Statement'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={async () => { try { await onSave(v); onClose(); } catch (e) { toast(e.message, true); } }}>Save</button></>}>
      <Fields fields={fields} v={v} set={setV} b={b} />
      <hr className="sep" />
      <div className="row" style={{ marginBottom: 8 }}><div className="tag">Question & Answer Record</div><span className="spacer" /><button className="btn sm" onClick={() => setV({ ...v, qa: [...v.qa, { q: '', a: '' }] })}><Icon n="plus" />Add Q&A</button></div>
      {v.qa.map((x, i) => (
        <div key={i} className="card" style={{ padding: 10 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <b className="mono" style={{ paddingTop: 8 }}>Q{i + 1}</b>
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <input placeholder="Question asked" value={x.q} onChange={(e) => setQA(i, { q: e.target.value })} />
              <textarea rows={2} placeholder="Response" value={x.a} onChange={(e) => setQA(i, { a: e.target.value })} />
            </div>
            <button className="icon-btn" onClick={() => setV({ ...v, qa: v.qa.filter((_, j) => j !== i) })}><Icon n="x" /></button>
          </div>
        </div>
      ))}
      {!v.qa.length && <div className="small faint">No questions yet. Add each question and the subject’s response — they appear verbatim in the report.</div>}
    </Modal>
  );
}
