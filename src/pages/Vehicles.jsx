import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, Modal, Field, Confirm, Status, useToast, fmtDate, canSeeGangs } from '../ui';
import { Fields } from '../sections/common';

export const VEHICLE_FIELDS = [
  { k: 'plate', label: 'Plate', span: 1, ph: 'e.g. 46EEK572' }, { k: 'model', label: 'Make / Model', span: 2, ph: 'e.g. Bravado Buffalo STX' }, { k: 'color', label: 'Color', span: 1 },
  { k: 'vin', label: 'VIN', span: 2 }, { k: 'owner_person_id', label: 'Registered Owner', type: 'owner', span: 2 },
  { k: 'gang_id', label: 'Gang Link', type: 'gang', span: 2, hint: 'Gang & Narcotics only' }, { k: 'flags', label: 'Flags', span: 2, ph: 'Stolen, Wanted, Fake plates, Modified…' },
  { k: 'notes', label: 'Notes', type: 'textarea', rows: 3, ph: 'Distinguishing features, where it’s been seen…' },
];

// Person search used for "Registered Owner"
export function OwnerPicker({ value, text, onChange }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [name, setName] = useState(text || '');
  useEffect(() => { if (value) api.get(`/api/persons/${value}`).then((d) => setName(d.person.name)).catch(() => {}); }, [value]);
  useEffect(() => { if (!q) { setRes([]); return; } const t = setTimeout(() => api.get(`/api/persons?q=${encodeURIComponent(q)}`).then((r) => setRes(r.slice(0, 6))), 200); return () => clearTimeout(t); }, [q]);
  if (value) return <div className="row" style={{ flexWrap: 'nowrap' }}><input value={name} disabled /><button type="button" className="btn sm" onClick={() => { onChange(null); setName(''); }}>Change</button></div>;
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search persons directory…" />
      {res.length > 0 && <div className="charge-pick" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: '#fff', boxShadow: 'var(--shadow)' }}>
        {res.map((p) => <div key={p.id} className="opt" onClick={() => { onChange(p.id); setName(p.name); setQ(''); setRes([]); }}><b>{p.name}</b> <span className="small muted">{p.ssn && `SSN ${p.ssn}`}</span></div>)}
      </div>}
    </div>
  );
}

export default function Vehicles() {
  const { me } = useApp();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [add, setAdd] = useState(null);
  const nav = useNavigate();
  const toast = useToast();
  useEffect(() => { const t = setTimeout(() => api.get(`/api/vehicles?q=${encodeURIComponent(q)}`).then(setRows), 200); return () => clearTimeout(t); }, [q]);
  return (
    <>
      <div className="page-head">
        <div><h1>Vehicle Directory</h1><p>Every vehicle recorded across Bureau cases — search by plate, model, VIN, color or owner.</p></div>
        {me.rank !== 'viewer' && <button className="btn primary" onClick={() => setAdd({})}><Icon n="plus" />New Vehicle</button>}
      </div>
      <div className="panel">
        <div className="panel-h"><input style={{ maxWidth: 380 }} placeholder="Search plate, model, VIN, color or owner…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /><span className="muted small">{rows ? `${rows.length} vehicle(s)` : ''}</span></div>
        {rows && rows.length ? (
          <table className="t">
            <thead><tr><th>Plate</th><th>Vehicle</th><th>Registered Owner</th><th>Gang</th><th>Flags</th><th>Cases</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.id} className="click" onClick={() => nav(`/vehicles/${v.id}`)}>
                <td><span className="plate">{v.plate || '—'}</span></td>
                <td><b>{v.model || 'Unknown model'}</b>{v.color && <div className="small muted">{v.color}</div>}</td>
                <td>{v.owner_name || v.owner_text || <span className="faint">Unknown</span>}</td>
                <td>{v.gang_name ? <span className="pill purple">{v.gang_name}</span> : <span className="faint">—</span>}</td>
                <td className="small">{v.flags ? <span className="pill red">{v.flags}</span> : <span className="faint">—</span>}</td>
                <td>{v.case_count}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : rows ? <Empty icon="car" title="No vehicles found">Vehicles are added from a case’s Vehicles section, or here.</Empty> : <div className="panel-b muted">Loading…</div>}
      </div>
      {add && <VehicleModal title="New Vehicle" v={add} setV={setAdd} onClose={() => setAdd(null)}
        onSave={async () => { try { const r = await api.post('/api/vehicles', add); nav(`/vehicles/${r.id}`); } catch (e) { toast(e.message, true); } }} />}
    </>
  );
}

export function VehicleModal({ title, v, setV, onSave, onClose, extra }) {
  const fields = VEHICLE_FIELDS.map((f) => (f.type === 'owner' ? { ...f, type: 'custom' } : f));
  return (
    <Modal wide title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.plate && !v.model} onClick={onSave}>Save</button></>}>
      <Fields fields={fields.filter((f) => f.type !== 'custom')} v={v} set={setV} />
      <div style={{ marginTop: 14 }}><Field label="Registered Owner" hint="Link to a person profile — or type a name if they’re not in the directory">
        <OwnerPicker value={v.owner_person_id} text={v.owner_text} onChange={(id) => setV({ ...v, owner_person_id: id })} />
        {!v.owner_person_id && <input style={{ marginTop: 6 }} placeholder="…or owner name (not in directory)" value={v.owner_text || ''} onChange={(e) => setV({ ...v, owner_text: e.target.value })} />}
      </Field></div>
      {extra}
    </Modal>
  );
}

export function VehicleView() {
  const { id } = useParams();
  const { me, config } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(false);
  const load = () => api.get(`/api/vehicles/${id}`).then(setD);
  useEffect(() => { load(); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;
  const v = d.vehicle;
  return (
    <>
      <div className="small muted" style={{ marginBottom: 6 }}><Link to="/vehicles">Vehicle Directory</Link> /</div>
      <div className="page-head">
        <div><div className="row"><span className="plate lg">{v.plate || 'NO PLATE'}</span>{v.flags && <span className="pill red">{v.flags}</span>}</div>
          <h1 style={{ marginTop: 8 }}>{[v.color, v.model].filter(Boolean).join(' ') || 'Unknown vehicle'}</h1></div>
        <div className="row">
          {d.canEdit && <button className="btn" onClick={() => setEdit({ ...v })}><Icon n="edit" />Edit</button>}
          {d.isCommand && <button className="btn danger" onClick={() => setDel(true)}><Icon n="trash" /></button>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', alignItems: 'start' }}>
        <div className="panel"><div className="panel-h"><h3>Vehicle Details</h3></div><div className="panel-b"><div className="kv">
          <div>Plate</div><div className="mono">{v.plate || '—'}</div>
          <div>Make / Model</div><div>{v.model || '—'}</div>
          <div>Color</div><div>{v.color || '—'}</div>
          <div>VIN</div><div className="mono">{v.vin || '—'}</div>
          <div>Registered Owner</div><div>{d.owner ? <Link to={`/persons/${d.owner.id}`}><b>{d.owner.name}</b></Link> : (v.owner_text || 'Unknown')}</div>
          <div>Gang Link</div><div>{v.gang_name ? (v.gang_id && canSeeGangs(me, config) ? <Link to={`/gangs/${v.gang_id}`}>{v.gang_name}</Link> : v.gang_name) : '—'}</div>
          <div>Notes</div><div className="pre">{v.notes || '—'}</div>
        </div></div></div>
        <div className="panel">
          <div className="panel-h"><h3>Case History<span className="sub">{d.cases.length} case(s)</span></h3></div>
          {d.cases.length ? (
            <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Vehicle status</th><th>Case status</th></tr></thead><tbody>
              {d.cases.map((c) => (
                <tr key={c.link_id} className="click" onClick={() => nav(`/cases/${c.id}?s=vehicles`)}>
                  <td className="mono">#{c.number} | {c.code}</td>
                  <td>{c.restricted ? <span className="classified-pill"><Icon n="lock" />CLASSIFIED</span> : <><b>{c.title}</b>{c.vnotes && <div className="small muted">{c.vnotes}</div>}</>}</td>
                  <td>{c.vstatus ? <span className="pill gray">{c.vstatus}</span> : '—'}</td><td>{c.restricted ? '—' : <Status s={c.status} />}</td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty icon="folder" title="Not linked to any case" />}
        </div>
      </div>
      {edit && <VehicleModal title="Edit Vehicle" v={edit} setV={setEdit} onClose={() => setEdit(null)}
        onSave={async () => { try { await api.patch(`/api/vehicles/${v.id}`, edit); setEdit(null); load(); toast('Saved'); } catch (e) { toast(e.message, true); } }} />}
      {del && <Confirm text={`Delete ${v.plate || 'this vehicle'} from the directory? It will be removed from every case.`} onYes={async () => { await api.del(`/api/vehicles/${v.id}`); nav('/vehicles'); }} onClose={() => setDel(false)} />}
    </>
  );
}
