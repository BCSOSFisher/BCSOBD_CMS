import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, Modal, useToast, fmtDate, canSeeGangs } from '../ui';
import { Fields } from '../sections/common';
import { PERSON_FIELDS } from '../sections/Persons';

export default function Persons() {
  const { me, config } = useApp();
  const gangs = canSeeGangs(me, config);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [add, setAdd] = useState(null);
  const nav = useNavigate();
  const toast = useToast();
  useEffect(() => { const t = setTimeout(() => api.get(`/api/persons?q=${encodeURIComponent(q)}`).then(setRows), 200); return () => clearTimeout(t); }, [q]);
  return (
    <>
      <div className="page-head">
        <div><h1>Persons Directory</h1><p>Every suspect, victim, witness and person of interest across all Bureau cases.</p></div>
        {me.rank !== 'viewer' && <button className="btn primary" onClick={() => setAdd({})}><Icon n="plus" />New Profile</button>}
      </div>
      <div className="panel">
        <div className="panel-h"><input style={{ maxWidth: 360 }} placeholder="Search name, SSN or phone…" value={q} onChange={(e) => setQ(e.target.value)} /><span className="muted small">{rows ? `${rows.length} record(s)` : ''}</span></div>
        {rows && rows.length ? (
          <table className="t">
            <thead><tr><th style={{ width: 52 }} /><th>Name</th><th>SSN</th><th>DOB</th><th>Address</th><th>Gang</th><th>Cases</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="click" onClick={() => nav(`/persons/${p.id}`)}>
                <td>{p.photo_id ? <img src={`/api/files/${p.photo_id}`} style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} /> : <span className="avatar sm" style={{ background: 'var(--line-strong)' }}><Icon n="user" width="13" /></span>}</td>
                <td><b>{p.name}</b></td><td className="mono">{p.ssn || '—'}</td><td>{fmtDate(p.dob) || '—'}</td>
                <td className="muted">{p.address || '—'}</td><td>{p.gang_name ? <span className="pill purple" title={p.gang_name}>{p.gang_abbr || p.gang_name}</span> : <span className="faint">—</span>}</td><td>{p.case_count}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : rows ? <Empty icon="users" title="No records found">Profiles are created when persons are added to a case, or here.</Empty> : <div className="panel-b muted">Loading…</div>}
      </div>
      {add && (
        <Modal wide title="New Person Profile" onClose={() => setAdd(null)} footer={<><button className="btn" onClick={() => setAdd(null)}>Cancel</button>
          <button className="btn primary" disabled={!add.name} onClick={async () => { try { const r = await api.post('/api/persons', add); nav(`/persons/${r.id}`); } catch (e) { toast(e.message, true); } }}>Create</button></>}>
          <Fields fields={PERSON_FIELDS} v={add} set={setAdd} />
        </Modal>
      )}
    </>
  );
}
