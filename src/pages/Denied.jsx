import React from 'react';

const REASONS = {
  revoked: {
    title: 'Access Revoked',
    detail: 'Your access has been removed by Bureau command. You will not be able to sign in until a Bureau Supervisor, Co-Lead or Lead restores your access.',
  },
  no_role: {
    title: 'Access Denied',
    detail: 'Your Discord account does not hold a Detective Bureau role. Access is limited to sworn members of the Detective Bureau.',
  },
  not_member: {
    title: 'Access Denied',
    detail: 'Your Discord account is not a member of the department Discord server.',
  },
};

export default function Denied() {
  const q = new URLSearchParams(location.search);
  const r = REASONS[q.get('reason')] || REASONS.no_role;
  const ref = q.get('ref');
  const when = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  return (
    <div className="denied">
      <div className="denied-card">
        <div className="denied-stripe"><span>UNAUTHORIZED</span><span>UNAUTHORIZED</span><span>UNAUTHORIZED</span></div>
        <div className="denied-body">
          <div className="denied-badge">
            <img src="/img/badge.png" alt="" />
            <div className="denied-lock">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></svg>
            </div>
          </div>
          <div className="denied-code">ERROR 401 · {r.title.toUpperCase()}</div>
          <h1>Unauthorized</h1>
          <p className="denied-main">Your access to BCSO’s Case Management has been revoked and/or denied.</p>
          <p className="denied-detail">{r.detail}</p>
          <div className="denied-meta">
            <div><span>Time</span><b>{when}</b></div>
            {ref && <div><span>Reference</span><b className="mono">{ref}</b></div>}
            <div><span>Status</span><b>Attempt recorded</b></div>
          </div>
          <p className="denied-help">If you believe this is a mistake, contact a Bureau Supervisor and give them the reference above.</p>
          <a className="btn denied-btn" href="/login">Return to sign-in</a>
        </div>
      </div>
      <div className="denied-foot">Blaine County Detective Bureau · Restricted system — unauthorized access attempts are logged.</div>
    </div>
  );
}
