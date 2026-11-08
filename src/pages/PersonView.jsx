import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, Modal, RolePill, Status, useToast, fmtDate } from '../ui';
import { Fields } from '../sections/common';
import { PERSON_FIELDS } from '../sections/Persons';

export default function PersonView() {
  const { id } = useParams();
  const { config, me } = useApp();
  const ro = me.rank === 'viewer';
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  const nav = useNavigate();
  const photo = useRef();
  const load = () => api.get(`/api/persons/${id}`).then(setD);
  useEffect(() => { load(); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;
  const p = d.person;
  const roles = [...new Set(d.cases.map((c) => c.role))];
  return (
    <>
      <div className="page-head">
        <div><div className="small muted"><a onClick={() => nav('/persons')} style={{ cursor: 'pointer' }}>Persons Directory</a> /</div><h1>{p.name}</h1>
          <div className="row" style={{ marginTop: 6 }}>{roles.map((r) => <RolePill key={r} r={r} />)}</div></div>
        {!ro && <button className="btn" onClick={() => setEdit(Object.fromEntries(PERSON_FIELDS.map((f) => [f.k, p[f.k] || ''])))}><Icon n="edit" />Edit Profile</button>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
        <div className="panel panel-b" style={{ textAlign: 'center' }}>
          {p.photo_id ? <img className="person-photo" style={{ width: '100%', height: 260 }} src={`/api/files/${p.photo_id}`} /> : <div className="person-photo" style={{ width: '100%', height: 260 }}><Icon n="user" /></div>}
          {!ro && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => photo.current.click()}><Icon n="image" />{p.photo_id ? 'Replace photo' : 'Upload photo'}</button>}
          <input ref={photo} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f);
            try { await api.upload(`/api/persons/${p.id}/photo`, fd); load(); } catch (er) { toast(er.message, true); }
          }} />
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel">
            <div className="panel-h"><h3>Profile</h3></div>
            <div className="panel-b"><div className="kv">
              <div>Name & SSN</div><div>{p.name}{p.ssn ? ` | ${p.ssn}` : ''}</div>
              <div>Date of Birth</div><div>{fmtDate(p.dob) || 'N/A'}</div>
              <div>Gender</div><div>{p.gender || 'N/A'}</div>
              <div>Phone</div><div>{p.phone || 'N/A'}</div>
              <div>Address</div><div>{p.address || 'N/A'}</div>
              <div>Description</div><div className="pre">{p.description || 'N/A'}</div>
              <div>Gang Affiliation</div><div>{p.gangs?.length ? p.gangs.map((g) => <div key={g.id}><Link to={`/gangs/${g.id}`}><b>{g.name}</b></Link>{g.abbreviation ? ` (${g.abbreviation})` : ''} <span className="pill purple">{g.confidence} {g.rank}</span> <span className="faint small">{g.status} gang</span></div>) : 'None known'}</div>
              <div>Other Affiliations</div><div>{p.affiliations || 'N/A'}</div>
              <div>Background</div><div className="pre">{p.background || 'N/A'}</div>
            </div></div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Case History<span className="sub">{d.cases.length} case(s)</span></h3></div>
            {d.cases.length ? (
              <table className="t"><thead><tr><th>Case</th><th>Title</th><th>Role</th><th>Status</th><th>Opened</th></tr></thead>
                <tbody>{d.cases.map((c) => (
                  <tr key={c.id + c.role} className="click" onClick={() => nav(`/cases/${c.id}`)}>
                    <td className="mono">#{c.number} | {c.code}</td><td>{c.restricted ? <span className="classified-pill"><Icon n="lock" />CLASSIFIED</span> : <><b>{c.title}</b>{c.classified && <span className="classified-pill sm" style={{ marginLeft: 6 }}><Icon n="lock" />Classified</span>}</>}{c.notes && <div className="small muted">{c.notes}</div>}</td>
                    <td><RolePill r={c.role} /></td><td><Status s={c.status} /></td><td className="muted small">{fmtDate(c.opened_at)}</td>
                  </tr>))}</tbody></table>
            ) : <Empty title="Not linked to any case" />}
          </div>
        </div>
      </div>
      {edit && (
        <Modal wide title="Edit Profile" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" onClick={async () => { await api.patch(`/api/persons/${p.id}`, edit); setEdit(null); load(); toast('Profile updated'); }}>Save</button></>}>
          <Fields fields={PERSON_FIELDS} v={edit} set={setEdit} />
        </Modal>
      )}
    </>
  );
}
