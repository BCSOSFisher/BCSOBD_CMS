import React, { useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';
import { Avatar, Icon, Modal, Field, useToast, fmtDT, fmtDate } from '../ui';

export default function Roster() {
  const { users, config, me, reloadUsers } = useApp();
  const toast = useToast();
  const [cs, setCs] = useState({});
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const order = config.rankOrder;
  const cmd = config.commandRanks.includes(me.rank);
  const rankIdx = (r) => order.indexOf(r); // lower index = higher rank
  const canRemove = (u) => cmd && u.id !== me.id && rankIdx(u.rank) >= rankIdx(me.rank);
  const sort = (a, b) => rankIdx(a.rank) - rankIdx(b.rank) || a.display_name.localeCompare(b.display_name);
  const active = users.filter((u) => u.active).sort(sort);
  const inactive = users.filter((u) => !u.active).sort((a, b) => (b.deactivated_at || '').localeCompare(a.deactivated_at || ''));

  const remove = async () => {
    try { await api.post(`/api/users/${removing.id}/deactivate`, { reason }); await reloadUsers(); toast(`${removing.display_name} removed from the roster`); setRemoving(null); setReason(''); }
    catch (e) { toast(e.message, true); }
  };
  const restore = async (u) => {
    try { await api.post(`/api/users/${u.id}/reactivate`); await reloadUsers(); toast(`${u.display_name} restored to the roster`); } catch (e) { toast(e.message, true); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Personnel Roster</h1><p>Ranks and units sync from Discord roles at each sign-in. People who lose their Bureau role are removed automatically the next time they try to sign in{cmd ? '; command can also remove someone immediately' : ''}.</p></div></div>
      <div className="panel">
        <div className="panel-h"><h3>Active Personnel<span className="sub">{active.length} member(s)</span></h3></div>
        <table className="t">
          <thead><tr><th style={{ width: 50 }} /><th>Name</th><th>Rank</th><th>Unit(s)</th><th>Callsign / Badge #</th><th>Discord</th><th>Last sign-in</th>{cmd && <th />}</tr></thead>
          <tbody>
            {active.map((u) => (
              <tr key={u.id}>
                <td><Avatar u={u} sm /></td><td><b>{u.display_name}</b>{u.id === me.id && <span className="faint small"> (you)</span>}</td>
                <td><span className={`pill ${config.commandRanks.includes(u.rank) ? 'navy' : u.rank === 'lead' ? 'blue' : 'gray'}`}>{config.ranks[u.rank]}</span></td>
                <td>{(u.units || []).map((x) => <span key={x} className="tag" style={{ marginRight: 4 }}>{config.divisions.find((d) => d.id === x)?.short || x}</span>)}{!(u.units || []).length && <span className="faint">—</span>}</td>
                <td>
                  {cmd || me.id === u.id ? (
                    <input style={{ width: 120, padding: '4px 8px' }} defaultValue={u.callsign || ''} onChange={(e) => setCs({ ...cs, [u.id]: e.target.value })}
                      onBlur={async () => { if (cs[u.id] === undefined) return; await api.patch(`/api/users/${u.id}`, { callsign: cs[u.id] }); reloadUsers(); toast('Callsign saved'); }} />
                  ) : (u.callsign || '—')}
                </td>
                <td className="muted">@{u.username}</td><td className="muted small">{fmtDT(u.last_login)}</td>
                {cmd && <td style={{ textAlign: 'right' }}>{canRemove(u) && <button className="btn danger sm" onClick={() => setRemoving(u)}>Remove</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cmd && inactive.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-h">
            <h3>Removed Personnel<span className="sub">{inactive.length} — no access; kept on past cases for the record</span></h3>
            <button className="btn ghost sm" onClick={() => setShowInactive(!showInactive)}><Icon n={showInactive ? 'up' : 'down'} />{showInactive ? 'Hide' : 'Show'}</button>
          </div>
          {showInactive && (
            <table className="t">
              <thead><tr><th style={{ width: 50 }} /><th>Name</th><th>Last rank</th><th>Removed</th><th>Reason</th><th>By</th><th /></tr></thead>
              <tbody>
                {inactive.map((u) => (
                  <tr key={u.id}>
                    <td><Avatar u={u} sm /></td><td><b>{u.display_name}</b><div className="small muted">@{u.username}</div></td>
                    <td className="muted">{config.ranks[u.rank]}</td>
                    <td className="small">{fmtDate(u.deactivated_at)}<div><span className={`pill ${u.deactivated_type === 'manual' ? 'red' : 'gray'}`}>{u.deactivated_type === 'manual' ? 'By command' : 'Automatic'}</span></div></td>
                    <td className="small">{u.deactivated_reason}</td>
                    <td className="small muted">{u.deactivated_by}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => restore(u)}>Restore</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {removing && (
        <Modal title={`Remove ${removing.display_name} from the roster`} onClose={() => setRemoving(null)} footer={<>
          <button className="btn" onClick={() => setRemoving(null)}>Cancel</button>
          <button className="btn danger" onClick={remove}>Remove Access</button></>}>
          <p style={{ marginTop: 0 }}>{removing.display_name} will be signed out immediately and won’t be able to sign in again — even if they still hold a Bureau role in Discord — until command restores them.</p>
          <p className="small muted">Their name stays on past cases, notes and signatures for the record. They’ll be listed under Removed Personnel, where you can restore them.</p>
          <Field label="Reason"><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Transferred to Patrol / Resigned / Disciplinary" /></Field>
        </Modal>
      )}
    </>
  );
}
