import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Icon, Empty, Confirm, Modal, Field, useToast } from '../ui';
import { SectionPanel } from './common';
import { VehicleModal } from '../pages/Vehicles';

export const CASE_VEHICLE_STATUSES = ['Of Interest', 'Suspect Vehicle', 'Victim Vehicle', 'Witness Vehicle', 'BOLO Issued', 'Impounded', 'Seized', 'Released', 'Cleared'];

export default function CaseVehicles({ b, reload }) {
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [rm, setRm] = useState(null);
  const run = async (fn, msg) => { try { await fn(); await reload(); if (msg) toast(msg); } catch (e) { toast(e.message, true); } };
  const list = b.vehicles || [];
  return (
    <SectionPanel title="Vehicles" sub="Linked to the Vehicle Directory — click a plate for its full history"
      actions={b.canEdit && <button className="btn primary sm" onClick={() => setAdd(true)}><Icon n="plus" />Add Vehicle</button>}>
      {!list.length && <Empty icon="car" title="No vehicles on this case">Search the directory by plate, or add a new vehicle.</Empty>}
      {list.map((v) => (
        <div className="card" key={v.link_id}>
          <div className="card-h">
            <Link to={`/vehicles/${v.id}`} className="plate">{v.plate || 'NO PLATE'}</Link>
            <b>{[v.color, v.model].filter(Boolean).join(' ') || 'Unknown vehicle'}</b>
            {v.flags && <span className="pill red">{v.flags}</span>}
            {v.gang_name && <span className="pill purple">{v.gang_name}</span>}
            <span className="spacer" />
            {b.canEdit ? (
              <select style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }} value={v.vstatus} onChange={(e) => run(() => api.patch(`/api/case-vehicles/${v.link_id}`, { status: e.target.value }), 'Status updated')}>
                {CASE_VEHICLE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            ) : <span className="pill gray">{v.vstatus}</span>}
            {b.canEdit && <button className="icon-btn" title="Remove from case" onClick={() => setRm(v)}><Icon n="trash" /></button>}
          </div>
          <div className="row small muted" style={{ gap: 16 }}>
            <span><b>Owner:</b> {v.owner_person_id ? <Link to={`/persons/${v.owner_person_id}`}>{v.owner_name}</Link> : (v.owner_text || 'Unknown')}</span>
            {v.vin && <span><b>VIN:</b> <span className="mono">{v.vin}</span></span>}
          </div>
          {b.canEdit
            ? <input style={{ marginTop: 8 }} defaultValue={v.vnotes} placeholder="Relevance to this case (e.g. seen leaving the scene at 20:27)…" onBlur={(e) => e.target.value !== v.vnotes && run(() => api.patch(`/api/case-vehicles/${v.link_id}`, { notes: e.target.value }), 'Saved')} />
            : v.vnotes && <div className="small" style={{ marginTop: 6 }}><b>Relevance:</b> {v.vnotes}</div>}
        </div>
      ))}
      {add && <AddCaseVehicle b={b} onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload(); }} />}
      {rm && <Confirm text={`Remove ${rm.plate || 'this vehicle'} from this case? It stays in the Vehicle Directory.`} yes="Remove" onYes={() => run(() => api.del(`/api/case-vehicles/${rm.link_id}`), 'Removed')} onClose={() => setRm(null)} />}
    </SectionPanel>
  );
}

function AddCaseVehicle({ b, onClose, onDone }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [pick, setPick] = useState(null);
  const [nv, setNv] = useState(null);
  const [status, setStatus] = useState('Of Interest');
  const [notes, setNotes] = useState('');
  useEffect(() => { const t = setTimeout(() => api.get(`/api/vehicles?q=${encodeURIComponent(q)}`).then((r) => setRes(r.slice(0, 30))), 200); return () => clearTimeout(t); }, [q]);
  const save = async (body) => {
    try { await api.post(`/api/cases/${b.case.id}/vehicles`, { ...body, status, notes }); toast('Vehicle added'); onDone(); } catch (e) { toast(e.message, true); }
  };
  const caseFields = (
    <div className="grid g2" style={{ marginTop: 14 }}>
      <Field label="Status in this case"><select value={status} onChange={(e) => setStatus(e.target.value)}>{CASE_VEHICLE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Relevance to this case"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Seen fleeing northbound" /></Field>
    </div>
  );
  if (nv) return <VehicleModal title="New Vehicle" v={nv} setV={setNv} onClose={onClose} onSave={() => save({ vehicle: nv })} extra={caseFields} />;
  return (
    <Modal wide title="Add Vehicle to Case" onClose={onClose} footer={<>
      <button className="btn" style={{ marginRight: 'auto' }} onClick={() => setNv({ plate: q.toUpperCase() })}><Icon n="plus" />New vehicle not in directory</button>
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!pick} onClick={() => save({ vehicle_id: pick.id })}>Add to Case</button></>}>
      <input autoFocus placeholder="Search plate, model, color or owner…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="charge-pick" style={{ maxHeight: 240, marginTop: 8 }}>
        {res.map((v) => (
          <div key={v.id} className={'opt' + (pick?.id === v.id ? ' sel' : '')} onClick={() => setPick(v)}>
            <span className="plate" style={{ marginRight: 8 }}>{v.plate || '—'}</span><b>{[v.color, v.model].filter(Boolean).join(' ')}</b>
            <span className="small muted"> · {v.owner_name || v.owner_text || 'owner unknown'} · {v.case_count} case(s)</span>
          </div>
        ))}
        {!res.length && <div className="opt muted">No matches — use “New vehicle not in directory”.</div>}
      </div>
      {caseFields}
    </Modal>
  );
}
