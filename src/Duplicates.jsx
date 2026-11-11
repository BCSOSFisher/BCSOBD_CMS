// Duplicate-person warning (shown when creating a profile) and command merge tools.
import React, { useEffect, useState } from 'react';
import { api } from './api';
import { Icon, Modal, useToast, fmtDate } from './ui';

const line = (p) => [p.ssn && `SSN ${p.ssn}`, p.dob && `DOB ${fmtDate(p.dob)}`, `${p.case_count ?? 0} case${p.case_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
const Thumb = ({ p }) => (p.photo_id ? <img className="dup-thumb" src={`/api/files/${p.photo_id}`} alt="" /> : <span className="dup-thumb"><Icon n="user" /></span>);

// "This person may already exist" — pick an existing profile, or create a new one anyway.
export function DuplicateModal({ name, matches, useLabel = 'Use this person', onUse, onCreate, onClose }) {
  return (
    <Modal title="Possible duplicate" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn" onClick={onCreate}>Create new profile anyway</button></>}>
      <p style={{ marginTop: 0 }}>{matches.length === 1 ? 'A profile' : `${matches.length} profiles`} matching <b>{name}</b> already {matches.length === 1 ? 'exists' : 'exist'} in the Persons Directory. Use the existing profile so this person's history stays in one place.</p>
      <div className="dup-list">
        {matches.map((m) => (
          <div key={m.id} className="dup-row">
            <Thumb p={m} />
            <div className="dup-info"><b>{m.name}</b><span className="small muted">{line(m)}</span><span className="pill amber" style={{ justifySelf: 'start' }}>{m.reason}</span></div>
            <div className="row" style={{ gap: 6 }}>
              <a className="btn sm ghost" href={`/persons/${m.id}`} target="_blank" rel="noreferrer" title="Open profile in a new tab"><Icon n="external" /></a>
              <button className="btn sm primary" onClick={() => onUse(m)}>{useLabel}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>Only create a new profile if this is a different person with the same name.</p>
    </Modal>
  );
}

// Runs a create call; if the server says "duplicate", shows the modal instead.
export function useDuplicateCheck() {
  const toast = useToast();
  const [dup, setDup] = useState(null);
  const run = async (name, attempt, { onUse }) => {
    try { await attempt(false); }
    catch (e) {
      if (e.data?.code !== 'duplicate') { toast(e.message, true); return; }
      setDup({ name, matches: e.data.matches,
        onUse: async (m) => { setDup(null); try { await onUse(m); } catch (err) { toast(err.message, true); } },
        onCreate: async () => { setDup(null); try { await attempt(true); } catch (err) { toast(err.message, true); } } });
    }
  };
  const modal = dup && <DuplicateModal name={dup.name} matches={dup.matches} onUse={dup.onUse} onCreate={dup.onCreate} onClose={() => setDup(null)} />;
  return { run, modal };
}

// Command: merge this profile into another one.
export function MergeModal({ person, onClose, onDone }) {
  const toast = useToast();
  const [q, setQ] = useState(person.name);
  const [res, setRes] = useState([]);
  const [target, setTarget] = useState(null);
  const [keep, setKeep] = useState('target');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => api.get(`/api/persons?q=${encodeURIComponent(q)}`).then((r) => setRes(r.filter((x) => x.id !== person.id))), 200); return () => clearTimeout(t); }, [q]);
  const kept = keep === 'target' ? target : person; const removed = keep === 'target' ? person : target;
  const go = async () => {
    setBusy(true);
    try { await api.post(`/api/persons/${removed.id}/merge`, { into: kept.id }); toast(`Merged into ${kept.name}`); onDone(kept.id); }
    catch (e) { toast(e.message, true); setBusy(false); }
  };
  return (
    <Modal wide title={`Merge “${person.name}” with another profile`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn danger" disabled={!target || busy} onClick={go}><Icon n="layers" />{busy ? 'Merging…' : 'Merge Profiles'}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>Find the duplicate profile. Everything from one profile — cases, charges, interviews, warrants, gang membership, vehicles and photos — moves onto the other, and the duplicate is deleted.</p>
      <input placeholder="Search by name, SSN or phone…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="charge-pick" style={{ maxHeight: 200, marginTop: 8 }}>
        {res.map((p) => <div key={p.id} className={'opt' + (target?.id === p.id ? ' sel' : '')} onClick={() => { setTarget(p); setKeep((p.case_count || 0) > (person.case_count || 0) ? 'target' : 'source'); }}><b>{p.name}</b> <span className="muted small">{line(p)}</span></div>)}
        {!res.length && <div className="opt muted">No other profiles match.</div>}
      </div>
      {target && (
        <>
          <div className="small muted" style={{ margin: '14px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Which profile should be kept?</div>
          <div className="grid g2 merge-pick">
            {[['source', person], ['target', target]].map(([k, p]) => (
              <label key={k} className={'merge-opt' + (keep === k ? ' on' : '')}>
                <input type="radio" name="keep" checked={keep === k} onChange={() => setKeep(k)} />
                <Thumb p={p} /><div className="dup-info"><b>{p.name}</b><span className="small muted">{line(p)}</span></div>
              </label>
            ))}
          </div>
          <div className="merge-sum"><Icon n="alert" width="15" /><span><b>{removed.name}</b> will be merged into <b>{kept.name}</b> and deleted. Blank details on the kept profile are filled in from the duplicate. This can't be undone.</span></div>
        </>
      )}
    </Modal>
  );
}

// Command: every group of likely duplicates in the directory.
export function DuplicatesReview({ onClose, onChanged }) {
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [keep, setKeep] = useState({});
  const [busy, setBusy] = useState(null);
  const load = () => api.get('/api/persons/duplicates').then((g) => { setGroups(g); setKeep(Object.fromEntries(g.map((x, i) => [i, x[0].id]))); });
  useEffect(() => { load(); }, []);
  const merge = async (i) => {
    const g = groups[i]; const into = keep[i];
    if (!confirm(`Merge ${g.length - 1} profile(s) into “${g.find((p) => p.id === into).name}”? This can't be undone.`)) return;
    setBusy(i);
    try { for (const p of g) if (p.id !== into) await api.post(`/api/persons/${p.id}/merge`, { into }); toast('Profiles merged'); onChanged?.(); await load(); }
    catch (e) { toast(e.message, true); }
    setBusy(null);
  };
  return (
    <Modal wide title="Possible Duplicate Profiles" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="muted" style={{ marginTop: 0 }}>Profiles with the same name or SSN. Check they're really the same person, pick the one to keep, then merge.</p>
      {!groups ? <p className="muted">Checking…</p> : !groups.length ? (
        <div className="dup-empty"><Icon n="check" width="22" height="22" /><b>No duplicates found</b><span className="small muted">Every profile has a unique name and SSN.</span></div>
      ) : groups.map((g, i) => (
        <div key={g.map((p) => p.id).join('-')} className="dup-group">
          {g.map((p) => (
            <label key={p.id} className={'dup-row' + (keep[i] === p.id ? ' keep' : '')}>
              <input type="radio" name={`keep-${i}`} checked={keep[i] === p.id} onChange={() => setKeep({ ...keep, [i]: p.id })} />
              <Thumb p={p} />
              <div className="dup-info"><b>{p.name}</b><span className="small muted">{line(p)}</span></div>
              {keep[i] === p.id ? <span className="pill green">Keep</span> : <a className="btn sm ghost" href={`/persons/${p.id}`} target="_blank" rel="noreferrer"><Icon n="external" /></a>}
            </label>
          ))}
          <div className="row end"><button className="btn sm danger" disabled={busy !== null} onClick={() => merge(i)}><Icon n="layers" />{busy === i ? 'Merging…' : `Merge into selected`}</button></div>
        </div>
      ))}
    </Modal>
  );
}
