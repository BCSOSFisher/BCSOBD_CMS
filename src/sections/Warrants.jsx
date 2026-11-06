import React, { useState } from 'react';
import { download } from '../api';
import { useApp } from '../App';
import { Icon, Empty, Confirm, Modal, Status, useToast, fmtDate, fmtDT, today } from '../ui';
import { Fields, SectionPanel, useItems } from './common';

export default function Warrants({ b, reload }) {
  const { me, config } = useApp();
  const toast = useToast();
  const I = useItems(b, reload);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(null);
  const items = b.items.filter((i) => i.kind === 'warrant');
  const P = (id) => b.persons.find((p) => p.id === id);
  const packet = async (w) => {
    setBusy(w.id);
    try { await download(`/api/items/${w.id}/warrant.docx`, 'Warrant Packet.docx'); toast('Warrant packet downloaded — upload it to Google Docs and link it in your DOJ submission.'); } catch (e) { toast(e.message, true); }
    setBusy(null);
  };
  return (
    <SectionPanel title="Warrants" sub="Prepare the DOJ packet here, then submit on the DOJ website"
      actions={b.canEdit && <button className="btn primary sm" onClick={() => setEdit({ data: { status: 'Draft', affiant: me.display_name, prepared_date: today(), charge_ids: [], evidence_ids: [], interview_ids: [] } })}><Icon n="plus" />New Warrant Request</button>}>
      <div className="small muted" style={{ background: '#f8f9fb', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
        <b>Workflow:</b> 1) Create the request and select the supporting charges, evidence and statements → 2) <b>Download Warrant Packet</b> → 3) Upload the .docx to Google Drive (it opens as a Google Doc with formatting intact) and share it → 4) Submit on the DOJ website → 5) Update the status and DOJ reference here.
      </div>
      {!items.length && <Empty icon="gavel" title="No warrant requests" />}
      {items.map((w) => {
        const d = w.data;
        return (
          <div className="card" key={w.id}>
            <div className="card-h">
              <Icon n="gavel" width="16" /><b>{d.type || 'Warrant'}</b><Status s={d.status} />
              {d.doj_ref && <span className="mono small muted">DOJ ref {d.doj_ref}</span>}
              <span className="spacer" />
              <button className="btn gold sm" disabled={busy === w.id} onClick={() => packet(w)}><Icon n="download" />{busy === w.id ? 'Generating…' : 'Download Warrant Packet'}</button>
              {b.canEdit && <><button className="icon-btn" onClick={() => setEdit(w)}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setDel(w)}><Icon n="trash" /></button></>}
            </div>
            <div className="kv">
              <div>Subject</div><div>{P(d.person_id)?.name || '—'}</div>
              {d.target && <><div>Place / Property</div><div>{d.target}</div></>}
              {d.items_sought && <><div>Items / Data Sought</div><div className="pre">{d.items_sought}</div></>}
              <div>Supporting Material</div><div>{(d.charge_ids || []).length || 'all suspect’s'} charge(s) · {(d.evidence_ids || []).length || 'all'} evidence item(s) · {(d.interview_ids || []).length} statement(s)</div>
              <div>Affiant</div><div>{d.affiant}{d.affiant_signed ? <span className="pill green" style={{ marginLeft: 8 }}>Signed {fmtDT(d.affiant_signed)}</span> : <span className="pill amber" style={{ marginLeft: 8 }}>Unsigned</span>}</div>
              {d.submitted_date && <><div>Submitted to DOJ</div><div>{fmtDate(d.submitted_date)}</div></>}
              {d.executed_date && <><div>Executed</div><div>{fmtDate(d.executed_date)}{d.return_notes ? ` — ${d.return_notes}` : ''}</div></>}
            </div>
            {d.pc_statement && <details style={{ marginTop: 10 }}><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Probable cause statement</summary><div className="pre small" style={{ marginTop: 6, lineHeight: 1.55 }}>{d.pc_statement}</div></details>}
            {b.canEdit && !d.affiant_signed && <div className="row" style={{ marginTop: 10 }}><button className="btn sm" onClick={() => I.update(w.id, { affiant_signed: new Date().toISOString(), affiant: me.display_name })}><Icon n="pen" />Sign as Affiant ({me.display_name})</button></div>}
          </div>
        );
      })}
      {edit && <WarrantModal b={b} item={edit} onClose={() => setEdit(null)} onSave={(v) => (edit.id ? I.update(edit.id, v) : I.add('warrant', v))} />}
      {del && <Confirm text="Delete this warrant request?" onYes={() => I.remove(del.id)} onClose={() => setDel(null)} />}
    </SectionPanel>
  );
}

function WarrantModal({ b, item, onSave, onClose }) {
  const { config } = useApp();
  const toast = useToast();
  const [v, setV] = useState({ charge_ids: [], evidence_ids: [], interview_ids: [], ...item.data });
  const tog = (k, id) => setV({ ...v, [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] });
  const charges = b.items.filter((i) => i.kind === 'charge');
  const evidence = b.items.filter((i) => i.kind === 'evidence');
  const ivs = b.items.filter((i) => i.kind === 'interview');
  const fields = [
    { k: 'type', label: 'Warrant Type', type: 'select', options: config.warrantTypes },
    { k: 'person_id', label: 'Subject', type: 'person' },
    { k: 'target', label: 'Place / Property / Account to be Searched', span: 4, ph: 'e.g. 7138 Las Lagunas Blvd, Apt 2 — or — phone number / vehicle plate' },
    { k: 'items_sought', label: 'Items / Data to be Seized', type: 'textarea', rows: 2 },
    { k: 'pc_statement', label: 'Statement of Probable Cause', type: 'textarea', rows: 8, hint: 'Facts establishing probable cause, in your own words. Reference evidence by ED number.' },
    { k: 'affiant', label: 'Affiant', span: 1 }, { k: 'status', label: 'Status', type: 'select', options: config.warrantStatuses, span: 1 },
    { k: 'doj_ref', label: 'DOJ Reference #', span: 1 }, { k: 'submitted_date', label: 'Submitted Date', type: 'date', span: 1 },
    { k: 'executed_date', label: 'Executed Date', type: 'date', span: 1 }, { k: 'return_notes', label: 'Return / Execution Notes', span: 3 },
  ];
  const Pick = ({ title, k, list, label }) => (
    <div>
      <div className="tag" style={{ marginBottom: 6 }}>{title}</div>
      <div className="charge-pick" style={{ maxHeight: 160 }}>
        {list.length ? list.map((x) => <label key={x.id} className="opt check" style={{ display: 'flex' }}><input type="checkbox" checked={v[k].includes(x.id)} onChange={() => tog(k, x.id)} />{label(x)}</label>)
          : <div className="opt muted small">None in this case yet.</div>}
      </div>
    </div>
  );
  return (
    <Modal wide title={item.id ? 'Edit Warrant Request' : 'New Warrant Request'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!v.type} onClick={async () => { try { await onSave(v); onClose(); } catch (e) { toast(e.message, true); } }}>Save</button></>}>
      <Fields fields={fields} v={v} set={setV} b={b} />
      <hr className="sep" />
      <div className="grid g3">
        <Pick title="Charges supporting this warrant" k="charge_ids" list={charges} label={(x) => `${x.data.code} — ${x.data.name}`} />
        <Pick title="Evidence to include (none = all)" k="evidence_ids" list={evidence} label={(x) => `${x.data.ed} — ${x.data.title || ''}`} />
        <Pick title="Statements to include" k="interview_ids" list={ivs} label={(x) => `${x.data.type} — ${b.persons.find((p) => p.id === x.data.person_id)?.name || x.data.subject || ''}`} />
      </div>
    </Modal>
  );
}
