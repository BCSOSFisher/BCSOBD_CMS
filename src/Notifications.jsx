// Bell icon in the top bar: case assignments, transfers, closure reviews and warrant updates.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { Icon, ago } from './ui';

const KIND = {
  assigned: { icon: 'user', cls: 'blue' },
  transfer: { icon: 'layers', cls: 'purple' },
  review: { icon: 'pen', cls: 'amber' },
  approved: { icon: 'check', cls: 'green' },
  returned: { icon: 'alert', cls: 'red' },
  reopened: { icon: 'folder', cls: 'amber' },
  warrant: { icon: 'gavel', cls: 'blue' },
  status: { icon: 'clock', cls: 'gray' },
  feedback: { icon: 'note', cls: 'purple' },
};

export default function Bell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const load = useCallback(() => api.get('/api/notifications').then(setData).catch(() => {}), []);

  // Refresh every 45 s, on page change, and when the tab comes back into view
  useEffect(() => {
    load();
    const i = setInterval(load, 45000);
    const vis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  useEffect(() => { load(); setOpen(false); }, [loc.pathname, load]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const go = async (n) => {
    if (!n.read_at) { await api.post('/api/notifications/read', { id: n.id }).catch(() => {}); load(); }
    setOpen(false);
    if (n.kind === 'feedback') nav('/feedback');
    else if (n.case_id && n.case_code) nav(`/cases/${n.case_id}`);
  };
  const readAll = async () => { await api.post('/api/notifications/read'); load(); };
  const clearRead = async () => { await api.del('/api/notifications'); load(); };

  return (
    <div className="bell" ref={box}>
      <button className={'bell-btn' + (open ? ' on' : '')} onClick={() => setOpen(!open)} aria-label={`Notifications${data.unread ? ` (${data.unread} unread)` : ''}`} title="Notifications">
        <Icon n="bell" />
        {data.unread > 0 && <span className="bell-count">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <b>Notifications</b>
            <div className="row" style={{ gap: 4 }}>
              {data.unread > 0 && <button className="btn sm ghost" onClick={readAll}>Mark all read</button>}
              {data.items.some((n) => n.read_at) && <button className="btn sm ghost" onClick={clearRead}>Clear read</button>}
            </div>
          </div>
          <div className="bell-list">
            {!data.items.length && (
              <div className="bell-empty"><Icon n="bell" width="22" height="22" /><div>You're all caught up.</div>
                <div className="small faint">You'll be notified here when you're added to a case, a case is transferred to you, a closure is reviewed, or a warrant changes status.</div></div>
            )}
            {data.items.map((n) => {
              const k = KIND[n.kind] || KIND.status;
              return (
                <button key={n.id} className={'bell-item' + (n.read_at ? '' : ' unread')} onClick={() => go(n)}>
                  <span className={`bell-ic ${k.cls}`}><Icon n={k.icon} /></span>
                  <span className="bell-txt">
                    <b>{n.title}</b>
                    {n.body && <span className="bell-body">{n.body}</span>}
                    <span className="bell-meta">{n.actor_name ? `${n.actor_name} · ` : ''}{ago(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="bell-dot" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
