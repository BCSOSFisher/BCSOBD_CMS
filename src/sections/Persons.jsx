import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Modal, Field, Empty, RolePill, Confirm, useToast, fmtDate } from '../ui';
import { Fields, SectionPanel } from './common';

export const PERSON_FIELDS = [
  { k: 'name', label: 'Full Name' }, { k: 'ssn', label: 'SSN / State ID', span: 1 }, { k: 'dob', label: 'Date of Birth', type: 'date', span: 1 },
  { k: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other', 'Unknown'], span: 1 }, { k: 'phone', label: 'Phone', span: 1 },
  { k: 'address', label: 'Address (If Known)' },
  { k: 'description', label: 'Physical Description', type: 'textarea', rows: 2, ph: 'Height, build, hair, tattoos, clothing…' },
  { k: 'gang_id', label: 'Gang Affiliation', type: 'gang', span: 2, hint: 'Adds them to the gang’s member list' },
  { k: 'affiliations', label: 'Other Affiliations', ph: 'Employer, crew, associates…', span: 2 },
  { k: 'background', label: 'Background', type: 'textarea', rows: 3, ph: 'Employment, vehicles, criminal history…' },
];

export default function PersonsSection({ b, reload }) {
  const { config } = useApp();
  const toast = useToast();
  const [add, setAdd] = useState(null);
  const [edit, setEdit] = useState(null);
  const [rm, setRm] = useState(null);
  return (
    <SectionPanel title="Persons Involved" sub="Suspects, victims, witnesses and persons of interest"
      actions={b.canEdit && <button className="btn primary sm" onClick={() => setAdd('Suspect')}><Icon n="plus" />Add Person</button>}>
      {!b.persons.length && <Empty icon="users" title="No persons recorded">Add suspects, victims and witnesses. Profiles are shared across cases.</Empty>}
      {config.personRoles.map((role) => {
        const list = b.persons.filter((p) => p.case_role === role);
        if (!list.length) return null;
        return (
          <div key={role} style={{ marginBottom: 18 }}>
            <div className="row" style={{ marginBottom: 8 }}><span className="tag">{role}{list.length > 1 ? 's' : ''}</span></div>
            {list.map((p) => (
              <div className="card" key={p.link_id}>
                <div className="card-h">
                  {p.photo_id ? <img src={`/api/files/${p.photo_id}`} style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover' }} /> : null}
                  <div><b><Link to={`/persons/${p.id}`}>{p.name}</Link></b><div className="small muted">{[p.ssn && `SSN ${p.ssn}`, p.dob && `DOB ${fmtDate(p.dob)}`].filter(Boolean).join(' · ')}</div></div>
                  <RolePill r={p.case_role} />
                  {p.custody_status && <span className="pill gray">{p.custody_status}</span>}
                  {p.gang_name && <Link to={`/gangs/${p.gang_id}`} className="pill purple" title={`${p.gang_confidence || 'Suspected'} ${p.gang_rank || 'member'}`}>{p.gang_name}{p.gang_rank ? ` · ${p.gang_rank}` : ''}</Link>}
                  <span className="spacer" />
                  {b.canEdit && <><button className="icon-btn" title="Edit" onClick={() => setEdit(p)}><Icon n="edit" /></button><button className="icon-btn" title="Remove from case" onClick={() => setRm(p)}><Icon n="trash" /></button></>}
                </div>
                <div className="kv">
                  <div>Address (If Known)</div><div>{p.address || 'N/A'}</div>
                  {p.description && <><div>Description</div><div className="pre">{p.description}</div></>}
                  {p.affiliations && <><div>Affiliations</div><div>{p.affiliations}</div></>}
                  <div>Background</div><div className="pre">{p.background || 'N/A'}</div>
                  {p.case_notes && <><div>Relevance to Case</div><div className="pre">{p.case_notes}</div></>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {add && <AddPersonModal b={b} reload={reload} defaultRole={add} onClose={() => setAdd(null)} />}
      {edit && <EditPersonModal b={b} p={edit} reload={reload} onClose={() => setEdit(null)} />}
      {rm && <Confirm text={`Remove ${rm.name} (${rm.case_role}) from this case? Their profile stays in the Persons Directory.`} yes="Remove"
        onYes={async () => { try { await api.del(`/api/case-persons/${rm.link_id}`); await reload(); } catch (e) { toast(e.message, true); } }} onClose={() => setRm(null)} />}
    </SectionPanel>
  );
}

function AddPersonModal({ b, reload, defaultRole, onClose }) {
  const { config } = useApp();
  const toast = useToast();
  const [mode, setMode] = useState('search');
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [pick, setPick] = useState(null);
  const [person, setPerson] = useState({});
  const [role, setRole] = useState(defaultRole);
  const [notes, setNotes] = useState('');
  useEffect(() => { const t = setTimeout(() => api.get(`/api/persons?q=${encodeURIComponent(q)}`).then(setRes), 200); return () => clearTimeout(t); }, [q]);
  const save = async () => {
    try {
      await api.post(`/api/cases/${b.case.id}/persons`, mode === 'search' ? { person_id: pick?.id, role, notes } : { person, role, notes });
      await reload(); toast('Person added'); onClose();
    } catch (e) { toast(e.message, true); }
  };
  return (
    <Modal wide title="Add Person to Case" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={mode === 'search' ? !pick : !person.name} onClick={save}>Add to Case</button></>}>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={'btn sm ' + (mode === 'search' ? 'primary' : '')} onClick={() => setMode('search')}>Existing person</button>
        <button className={'btn sm ' + (mode === 'new' ? 'primary' : '')} onClick={() => setMode('new')}>New profile</button>
      </div>
      {mode === 'search' ? (
        <div className="form">
          <input placeholder="Search by name, SSN or phone…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="charge-pick" style={{ maxHeight: 240 }}>
            {res.map((p) => (
              <div key={p.id} className={'opt' + (pick?.id === p.id ? ' sel' : '')} onClick={() => setPick(p)}>
                <b>{p.name}</b> <span className="muted small">{[p.ssn && `SSN ${p.ssn}`, p.dob && `DOB ${fmtDate(p.dob)}`, `${p.case_count} case(s)`].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
            {!res.length && <div className="opt muted">No matches. Switch to “New profile” to create one.</div>}
          </div>
        </div>
      ) : <Fields fields={PERSON_FIELDS} v={person} set={setPerson} />}
      <hr className="sep" />
      <div className="grid g2">
        <Field label="Role in this Case"><select value={role} onChange={(e) => setRole(e.target.value)}>{config.personRoles.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Relevance to Case"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. DNA located on murder weapon" /></Field>
      </div>
    </Modal>
  );
}

function EditPersonModal({ b, p, reload, onClose }) {
  const { config } = useApp();
  const toast = useToast();
  const [v, setV] = useState(Object.fromEntries(PERSON_FIELDS.map((f) => [f.k, p[f.k] || ''])));
  const [link, setLink] = useState({ role: p.case_role, notes: p.case_notes || '', custody_status: p.custody_status || '' });
  const save = async () => {
    try {
      await api.patch(`/api/persons/${p.id}`, v);
      await api.patch(`/api/case-persons/${p.link_id}`, link);
      await reload(); toast('Saved'); onClose();
    } catch (e) { toast(e.message, true); }
  };
  return (
    <Modal wide title={`Edit — ${p.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <Fields fields={PERSON_FIELDS} v={v} set={setV} />
      <hr className="sep" />
      <div className="grid g3">
        <Field label="Role in this Case"><select value={link.role} onChange={(e) => setLink({ ...link, role: e.target.value })}>{config.personRoles.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Custody Status"><select value={link.custody_status} onChange={(e) => setLink({ ...link, custody_status: e.target.value })}>
          {['', 'At large', 'Warrant issued', 'In custody', 'Released', 'Deceased', 'Cooperating'].map((s) => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
        <Field label="Relevance to Case"><input value={link.notes} onChange={(e) => setLink({ ...link, notes: e.target.value })} /></Field>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>Profile changes apply to this person across every case they appear in.</p>
    </Modal>
  );
}
