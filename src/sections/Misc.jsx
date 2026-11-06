import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, Confirm, Status, useToast, fmtDate, fmtDT, today, nowTime } from '../ui';
import { ItemModal, SectionPanel, useItems } from './common';

export function Notes({ b, reload }) {
  const { me } = useApp();
  const I = useItems(b, reload);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today());
  const [del, setDel] = useState(null);
  const notes = b.items.filter((i) => i.kind === 'note').sort((a, z) => (z.data.date || z.created_at).localeCompare(a.data.date || a.created_at) || z.id - a.id);
  return (
    <SectionPanel title="Detective Notes" sub="Dated running log of leads, actions and thoughts">
      {b.canEdit && (
        <div className="form" style={{ marginBottom: 18 }}>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Follow up on the laptop email threats — request subscriber info for sender address." />
          <div className="row"><input type="date" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} /><span className="spacer" />
            <button className="btn primary" disabled={!text.trim()} onClick={async () => { await I.add('note', { text: text.trim(), date, author: me.display_name }); setText(''); }}>Add Note</button></div>
        </div>
      )}
      {!notes.length && <Empty icon="note" title="No notes yet" />}
      {notes.map((n) => (
        <div key={n.id} className="card">
          <div className="card-h"><b className="mono small">{fmtDate(n.data.date || n.created_at)}</b><span className="muted small">{n.data.author}</span><span className="spacer" />
            {b.canEdit && <button className="icon-btn" onClick={() => setDel(n)}><Icon n="trash" /></button>}</div>
          <div className="pre">{n.data.text}</div>
        </div>
      ))}
      {del && <Confirm text="Delete this note?" onYes={() => I.remove(del.id)} onClose={() => setDel(null)} />}
    </SectionPanel>
  );
}

export function Timeline({ b, reload }) {
  const I = useItems(b, reload);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [showAuto, setShowAuto] = useState(true);
  const c = b.case;
  const P = (id) => b.persons.find((p) => p.id === id)?.name;
  const ev = [];
  if (c.incident_date) ev.push({ k: 'incident', when: `${c.incident_date} ${c.incident_time || ''}`, what: 'Incident occurred', det: c.location, auto: true });
  b.items.forEach((it) => {
    const d = it.data;
    if (it.kind === 'timeline') ev.push({ k: 'manual', when: `${d.date || ''} ${d.time || ''}`, what: d.title, det: d.description, item: it });
    if (!showAuto) return;
    if (it.kind === 'evidence' && d.collected_date) ev.push({ k: 'evidence', when: `${d.collected_date} ${d.collected_time || ''}`, what: `${d.ed} collected — ${d.title || ''}`, det: d.location, auto: true });
    if (it.kind === 'interview' && d.date) ev.push({ k: 'interview', when: `${d.date} ${d.time || ''}`, what: `${d.type} — ${P(d.person_id) || d.subject || ''}`, det: d.summary, auto: true });
    if (it.kind === 'warrant' && d.submitted_date) ev.push({ k: 'warrant', when: d.submitted_date, what: `${d.type} submitted to DOJ`, det: d.status, auto: true });
    if (it.kind === 'warrant' && d.executed_date) ev.push({ k: 'warrant', when: d.executed_date, what: `${d.type} executed`, det: d.return_notes, auto: true });
    if (it.kind === 'note') ev.push({ k: 'note', when: d.date || it.created_at.slice(0, 10), what: `Note — ${d.author}`, det: d.text, auto: true });
    if (it.kind === 'bolo' && d.date) ev.push({ k: 'warrant', when: `${d.date} ${d.time || ''}`, what: `BOLO issued — ${d.subject || ''}`, det: d.description, auto: true });
  });
  ev.sort((a, z) => a.when.localeCompare(z.when));
  return (
    <SectionPanel title="Timeline" sub="Chronology built from evidence, interviews, warrants and notes — plus your own events"
      actions={<>
        <label className="check small"><input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} />Include automatic events</label>
        {b.canEdit && <button className="btn primary sm" onClick={() => setEdit({ data: { date: today(), time: nowTime() } })}><Icon n="plus" />Add Event</button>}
      </>}>
      {!ev.length ? <Empty icon="clock" title="Nothing on the timeline yet" /> : (
        <div className="timeline">
          {ev.map((e, i) => (
            <div key={i} className={`tl k-${e.k}`}>
              <div className="when">{fmtDate(e.when.trim().slice(0, 10))} {e.when.trim().slice(11)}{e.auto && <span className="tag" style={{ marginLeft: 8 }}>auto</span>}</div>
              <div className="what">{e.what}
                {e.item && b.canEdit && <span style={{ marginLeft: 6 }}><button className="icon-btn" onClick={() => setEdit(e.item)}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setDel(e.item)}><Icon n="trash" /></button></span>}
              </div>
              {e.det && <div className="det">{e.det}</div>}
            </div>
          ))}
        </div>
      )}
      {edit && <ItemModal b={b} wide={false} title={edit.id ? 'Edit Event' : 'Add Timeline Event'} initial={edit.data}
        fields={[{ k: 'date', label: 'Date', type: 'date' }, { k: 'time', label: 'Time', type: 'time' }, { k: 'title', label: 'Event', span: 4, ph: 'e.g. Suspect seen on CCTV leaving building' }, { k: 'description', label: 'Details', type: 'textarea', rows: 3 }]}
        onSave={(v) => (edit.id ? I.update(edit.id, v) : I.add('timeline', v))} onClose={() => setEdit(null)} />}
      {del && <Confirm text="Delete this event?" onYes={() => I.remove(del.id)} onClose={() => setDel(null)} />}
    </SectionPanel>
  );
}

export function Links({ b, reload }) {
  const { config } = useApp();
  const toast = useToast();
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  return (
    <SectionPanel title="Linked Cases" sub="Related investigations — same suspect, series, retaliation, etc.">
      {b.canEdit && (
        <div className="row" style={{ marginBottom: 16 }}>
          <input style={{ maxWidth: 220 }} placeholder="Case # or code (e.g. 48)" value={ref} onChange={(e) => setRef(e.target.value)} />
          <input placeholder="Relationship (e.g. Same suspect — prior assault)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn primary" disabled={!ref} onClick={async () => {
            try { await api.post(`/api/cases/${b.case.id}/links`, { ref, reason }); setRef(''); setReason(''); await reload(); toast('Cases linked'); } catch (e) { toast(e.message, true); }
          }}><Icon n="link" />Link</button>
        </div>
      )}
      {b.links.length ? (
        <table className="t" style={{ border: '1px solid var(--line)' }}>
          <thead><tr><th>Case</th><th>Title</th><th>Division</th><th>Status</th><th>Relationship</th><th /></tr></thead>
          <tbody>{b.links.map((l) => (
            <tr key={l.id}><td className="mono"><Link to={`/cases/${l.case_id}`}>#{l.number} | {l.code}</Link></td><td>{l.title}</td>
              <td>{config.divisions.find((d) => d.id === l.division)?.short}</td><td><Status s={l.status} /></td><td className="muted">{l.reason}</td>
              <td>{b.canEdit && <button className="icon-btn" onClick={async () => { await api.del(`/api/links/${l.id}`); reload(); }}><Icon n="x" /></button>}</td></tr>
          ))}</tbody>
        </table>
      ) : <Empty icon="link" title="No linked cases" />}
    </SectionPanel>
  );
}

export function CustomSection({ b, reload, item, setSec }) {
  const I = useItems(b, reload);
  const [v, setV] = useState(null);
  const [del, setDel] = useState(false);
  return (
    <SectionPanel title={item.data.title} sub="Custom section" actions={b.canEdit && v == null && <>
      <button className="btn sm" onClick={() => setV({ ...item.data })}><Icon n="edit" />Edit</button>
      <button className="icon-btn" onClick={() => setDel(true)}><Icon n="trash" /></button></>}>
      {v != null ? (
        <div className="form">
          <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          <textarea rows={14} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          <div className="row end"><button className="btn" onClick={() => setV(null)}>Cancel</button><button className="btn primary" onClick={async () => { await I.update(item.id, v); setV(null); }}>Save</button></div>
        </div>
      ) : item.data.body ? <div className="pre" style={{ lineHeight: 1.6 }}>{item.data.body}</div> : <span className="faint">Empty — click Edit to add content.</span>}
      {del && <Confirm text={`Delete the section “${item.data.title}”?`} onYes={async () => { await I.remove(item.id); setSec('overview'); }} onClose={() => setDel(false)} />}
    </SectionPanel>
  );
}
