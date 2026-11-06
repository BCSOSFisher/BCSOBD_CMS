import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// ---------- icons (inline, stroke style) ----------
const P = {
  dash: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  image: 'M21 15l-5-5L5 21M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  video: 'M23 7l-7 5 7 5zM1 5h15v14H1z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8',
  box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4',
  note: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  gavel: 'M14 13l-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
  car: 'M5 17h14v-5l-2-5H7l-2 5zM7 17v2M17 17v2M5 12h14',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  lock: 'M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.59 7.59M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  radio: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
};
export function Icon({ n, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={P[n] || P.file} />
    </svg>
  );
}

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, err) => {
    const id = Math.random();
    setList((l) => [...l, { id, msg, err }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), err ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">{list.map((t) => <div key={t.id} className={'toast' + (t.err ? ' err' : '')}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- modal ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-h"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><Icon n="x" /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, span }) {
  return <label className="f" style={span ? { gridColumn: `span ${span}` } : undefined}>{label}{hint && <span className="hint">{hint}</span>}{children}</label>;
}

export function Empty({ icon = 'folder', title, children }) {
  return <div className="empty"><Icon n={icon} /><b>{title}</b>{children}</div>;
}

const STATUS_COLOR = {
  Open: 'blue', 'Pending Warrant': 'amber', Suspended: 'gray', 'Referred to DA': 'purple',
  'Cleared Arrest Warrant': 'green', 'Apprehended - Awaiting Questioning': 'red', 'Apprehended - Pending Case Closure': 'green', Closed: 'navy',
  Draft: 'gray', 'Submitted to DOJ': 'amber', Approved: 'green', Denied: 'red', Executed: 'blue', 'Returned / Expired': 'gray',
};
export function Status({ s }) { return <span className={`pill dot ${STATUS_COLOR[s] || 'gray'}`}>{s}</span>; }
const ROLE_COLOR = { Suspect: 'red', Victim: 'blue', Witness: 'green', 'Person of Interest': 'amber', Complainant: 'purple', Informant: 'gray' };
export function RolePill({ r }) { return <span className={`pill ${ROLE_COLOR[r] || 'gray'}`}>{r}</span>; }

export function Avatar({ u, sm }) {
  if (u?.avatar) return <img className={'avatar' + (sm ? ' sm' : '')} src={u.avatar} alt="" />;
  const ini = (u?.display_name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return <span className={'avatar' + (sm ? ' sm' : '')}>{ini}</span>;
}

export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDT(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function ago(s) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
export const today = () => new Date().toISOString().slice(0, 10);
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export function localTZ() {
  try {
    return new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
  } catch { return ''; }
}

// controlled-form helper
export function useForm(init) {
  const [v, setV] = useState(init);
  const bind = (k, type) => type === 'check'
    ? { checked: !!v[k], onChange: (e) => setV((o) => ({ ...o, [k]: e.target.checked })) }
    : { value: v[k] ?? '', onChange: (e) => setV((o) => ({ ...o, [k]: e.target.value })) };
  return [v, setV, bind];
}

export function Confirm({ text, onYes, onClose, yes = 'Delete', danger = true }) {
  return (
    <Modal title="Please confirm" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => { onYes(); onClose(); }}>{yes}</button>
    </>}>
      <p style={{ margin: 0 }}>{text}</p>
    </Modal>
  );
}
