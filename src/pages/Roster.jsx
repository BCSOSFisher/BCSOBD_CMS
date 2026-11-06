import React, { useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';
import { Avatar, useToast, fmtDT } from '../ui';

export default function Roster() {
  const { users, config, me, reloadUsers } = useApp();
  const toast = useToast();
  const [cs, setCs] = useState({});
  const order = config.rankOrder;
  const cmd = config.commandRanks.includes(me.rank);
  return (
    <>
      <div className="page-head"><div><h1>Personnel Roster</h1><p>Ranks are synced from Discord roles at each sign-in. To change someone’s rank, change their role in Discord.</p></div></div>
      <div className="panel">
        <table className="t">
          <thead><tr><th style={{ width: 50 }} /><th>Name</th><th>Rank</th><th>Callsign / Badge #</th><th>Discord</th><th>Last sign-in</th></tr></thead>
          <tbody>
            {[...users].sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank) || a.display_name.localeCompare(b.display_name)).map((u) => (
              <tr key={u.id}>
                <td><Avatar u={u} sm /></td><td><b>{u.display_name}</b></td>
                <td><span className={`pill ${config.commandRanks.includes(u.rank) ? 'navy' : u.rank === 'lead' ? 'blue' : 'gray'}`}>{config.ranks[u.rank]}</span></td>
                <td>
                  {cmd || me.id === u.id ? (
                    <input style={{ width: 120, padding: '4px 8px' }} defaultValue={u.callsign || ''} onChange={(e) => setCs({ ...cs, [u.id]: e.target.value })}
                      onBlur={async () => { if (cs[u.id] === undefined) return; await api.patch(`/api/users/${u.id}`, { callsign: cs[u.id] }); reloadUsers(); toast('Callsign saved'); }} />
                  ) : (u.callsign || '—')}
                </td>
                <td className="muted">@{u.username}</td><td className="muted small">{fmtDT(u.last_login)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
