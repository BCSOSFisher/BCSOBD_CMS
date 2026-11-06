import React, { useState } from 'react';
import { useApp } from '../App';
import { Icon, Empty, Confirm, Modal, Field, fmtDate, today, nowTime } from '../ui';
import { ItemModal, SectionPanel, useItems } from './common';

export default function Evidence({ b, reload, setSec }) {
  const { config, me } = useApp();
  const I = useItems(b, reload);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [custody, setCustody] = useState(null);
  const [filter, setFilter] = useState('');
  const items = b.items.filter((i) => i.kind === 'evidence');
  const charges = b.items.filter((i) => i.kind === 'charge');
  const shown = items.filter((e) => !filter || e.data.type === filter);
  const FIELDS = [
    { k: 'title', label: 'Short Title', ph: 'e.g. Broken ceramic bowl', span: 2 },
    { k: 'type', label: 'Evidence Type', type: 'select', options: config.evidenceTypes, span: 1 },
    { k: 'ed', label: 'Evidence ID', hint: 'Auto-assigned', span: 1 },
    { k: 'description', label: 'Description', type: 'textarea', rows: 4, ph: 'What it is, where/how it was found, and its significance.' },
    { k: 'location', label: 'Location Found', span: 2 }, { k: 'collected_by', label: 'Collected / Observed By', span: 2 },
    { k: 'collected_date', label: 'Date Collected', type: 'date', span: 1 }, { k: 'collected_time', label: 'Time', type: 'time', span: 1 },
    { k: 'storage', label: 'Storage Location / Locker #', span: 2 },
    { k: 'lab_result', label: 'Lab / Forensic Result', type: 'textarea', rows: 2, ph: 'e.g. DNA matched to Adam Maginley (SSN 238395302).' },
  ];
  return (
    <SectionPanel title="Evidence Log" sub={`${items.length} item(s)`} actions={<>
      <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All types</option>{config.evidenceTypes.map((t) => <option key={t}>{t}</option>)}</select>
      {b.canEdit && <button className="btn primary sm" onClick={() => setEdit({ data: { collected_by: me.display_name, collected_date: today(), collected_time: nowTime() } })}><Icon n="plus" />Log Evidence</button>}
    </>}>
      {!items.length && <Empty icon="box" title="No evidence logged">Each item gets a sequential Evidence ID (ED-01, ED-02…) that you can reference in charges, warrants and the report.</Empty>}
      {shown.map((e) => {
        const d = e.data;
        const media = b.files.filter((f) => f.evidence_ref && f.evidence_ref === d.ed);
        const mlinks = b.items.filter((i) => i.kind === 'medialink' && i.data.evidence_ref === d.ed);
        const supports = charges.flatMap((ch) => (ch.data.elements || []).map((el, k) => ((el.evidence || []).includes(e.id) ? `${ch.data.code} el. ${k + 1}` : null)).filter(Boolean));
        return (
          <div className="card" key={e.id}>
            <div className="card-h">
              <span className="ed">{d.ed}</span><b>{d.title || 'Untitled item'}</b>{d.type && <span className="pill gray">{d.type}</span>}
              <span className="spacer" />
              {b.canEdit && <>
                <button className="btn ghost sm" onClick={() => setCustody(e)}><Icon n="link" />Custody</button>
                <button className="icon-btn" onClick={() => setEdit(e)}><Icon n="edit" /></button>
                <button className="icon-btn" onClick={() => setDel(e)}><Icon n="trash" /></button>
              </>}
            </div>
            {d.description && <div className="pre" style={{ marginBottom: 10, lineHeight: 1.55 }}>{d.description}</div>}
            <div className="row small muted" style={{ gap: 18 }}>
              {d.location && <span><b>Found:</b> {d.location}</span>}
              {(d.collected_by || d.collected_date) && <span><b>Collected:</b> {[d.collected_by, fmtDate(d.collected_date), d.collected_time].filter(Boolean).join(' · ')}</span>}
              {d.storage && <span><b>Storage:</b> {d.storage}</span>}
            </div>
            {d.lab_result && <div className="small" style={{ marginTop: 8, background: 'var(--blue-soft)', borderRadius: 6, padding: '7px 10px' }}><b>Forensic result:</b> {d.lab_result}</div>}
            {(supports.length > 0 || media.length > 0 || mlinks.length > 0 || (d.custody || []).length > 0) && (
              <div className="row small" style={{ marginTop: 10, gap: 14 }}>
                {supports.length > 0 && <span><b className="muted">Supports:</b> {supports.map((s) => <span key={s} className="chip" style={{ marginRight: 4 }}>{s}</span>)}</span>}
                {media.length > 0 && <a onClick={() => setSec('media')} style={{ cursor: 'pointer' }}><Icon n="image" width="13" style={{ verticalAlign: -2 }} /> {media.length} media file(s)</a>}
                {mlinks.map((l) => <a key={l.id} href={l.data.url} target="_blank" rel="noreferrer"><Icon n="external" width="13" style={{ verticalAlign: -2 }} /> {l.data.title || 'Media link'}</a>)}
                {(d.custody || []).length > 0 && <a onClick={() => setCustody(e)} style={{ cursor: 'pointer' }}><Icon n="link" width="13" style={{ verticalAlign: -2 }} /> {d.custody.length} custody transfer(s)</a>}
              </div>
            )}
          </div>
        );
      })}
      {edit && <ItemModal b={b} title={edit.id ? `Edit ${edit.data.ed}` : 'Log Evidence'} fields={FIELDS} initial={edit.data}
        onSave={(v) => (edit.id ? I.update(edit.id, v) : I.add('evidence', v))} onClose={() => setEdit(null)} />}
      {del && <Confirm text={`Delete ${del.data.ed}? Links from charge elements will be broken.`} onYes={() => I.remove(del.id)} onClose={() => setDel(null)} />}
      {custody && <CustodyModal e={b.items.find((x) => x.id === custody.id)} canEdit={b.canEdit} I={I} onClose={() => setCustody(null)} />}
    </SectionPanel>
  );
}

function CustodyModal({ e, I, onClose, canEdit }) {
  const { me } = useApp();
  const list = e.data.custody || [];
  const [v, setV] = useState({ date: today(), time: nowTime(), from: list.length ? list[list.length - 1].to : e.data.collected_by || '', to: me.display_name, purpose: '' });
  return (
    <Modal wide title={`Chain of Custody — ${e.data.ed} ${e.data.title || ''}`} onClose={onClose}>
      <table className="t" style={{ border: '1px solid var(--line)', marginBottom: 16 }}>
        <thead><tr><th>Date / Time</th><th>Released By</th><th>Received By</th><th>Purpose / Location</th></tr></thead>
        <tbody>
          <tr><td className="mono small">{fmtDate(e.data.collected_date)} {e.data.collected_time}</td><td className="muted">— (collected)</td><td>{e.data.collected_by}</td><td>{e.data.location ? `Collected at ${e.data.location}` : 'Initial collection'}</td></tr>
          {list.map((x, i) => <tr key={i}><td className="mono small">{fmtDate(x.date)} {x.time}</td><td>{x.from}</td><td>{x.to}</td><td>{x.purpose}</td></tr>)}
        </tbody>
      </table>
      {canEdit && (
        <div className="form">
          <div className="tag">Record transfer</div>
          <div className="grid g4">
            <Field label="Date"><input type="date" value={v.date} onChange={(x) => setV({ ...v, date: x.target.value })} /></Field>
            <Field label="Time"><input type="time" value={v.time} onChange={(x) => setV({ ...v, time: x.target.value })} /></Field>
            <Field label="Released By"><input value={v.from} onChange={(x) => setV({ ...v, from: x.target.value })} /></Field>
            <Field label="Received By"><input value={v.to} onChange={(x) => setV({ ...v, to: x.target.value })} /></Field>
          </div>
          <Field label="Purpose / New Location"><input value={v.purpose} onChange={(x) => setV({ ...v, purpose: x.target.value })} placeholder="e.g. Transferred to State Lab for DNA analysis" /></Field>
          <div className="row end"><button className="btn primary" disabled={!v.to} onClick={async () => { await I.update(e.id, { custody: [...list, v] }); setV({ ...v, from: v.to, purpose: '' }); }}>Add Transfer</button></div>
        </div>
      )}
    </Modal>
  );
}
