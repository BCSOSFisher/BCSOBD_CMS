// Full backup download — Department Administration, Bureau Lead and named members only.
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, fmtDT, ago, useToast } from '../ui';

const size = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Backups() {
  const { me } = useApp();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [started, setStarted] = useState(false);
  const load = () => api.get('/api/backup/info').then(setD).catch((e) => toast(e.message, true));
  useEffect(() => { if (me.canBackup) load(); }, []);
  if (!me.canBackup) return <Navigate to="/" />;

  const download = () => {
    setStarted(true);
    // A plain link lets the browser stream large backups straight to disk
    const a = document.createElement('a');
    a.href = '/api/backup/download'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Backup started — your browser will save the .zip file');
    setTimeout(() => { setStarted(false); load(); }, 4000);
  };
  const total = d ? d.dbBytes + d.uploads.bytes : 0;

  return (
    <>
      <div className="page-head">
        <div><h1>Backups</h1><p>Download a complete copy of the Case Management system. Restricted to Department Administration and the Bureau Lead.</p></div>
      </div>

      <div className="panel backup-hero">
        <div className="backup-ic"><Icon n="shield" /></div>
        <div className="backup-txt">
          <h2>Full Backup</h2>
          <p>One <b>.zip</b> file containing the entire database — every case, person, vehicle, gang record, warrant, note, roster entry and audit log — plus every uploaded photo and document.</p>
          <p className="small muted">Save it somewhere outside Railway (Google Drive or your computer). Once a week is plenty. If anything ever happens to the site, it can be fully restored from this file.</p>
        </div>
        <button className="btn gold backup-btn" onClick={download} disabled={started}><Icon n="download" />{started ? 'Preparing…' : 'Download Full Backup'}</button>
      </div>

      <div className="backup-warn"><Icon n="lock" width="15" /><span>This file contains <b>everything</b>, including classified cases and gang intelligence. Don't share it, and keep it in a private location. Every download is recorded in Security Alerts.</span></div>

      <div className="grid g4" style={{ margin: '16px 0' }}>
        <div className="panel stat"><div className="k">Estimated size</div><div className="v">{d ? size(total) : '–'}</div><div className="d">before compression</div></div>
        <div className="panel stat"><div className="k">Cases</div><div className="v">{d ? d.counts.cases : '–'}</div><div className="d">{d ? `${d.counts.persons} persons · ${d.counts.vehicles} vehicles` : ''}</div></div>
        <div className="panel stat"><div className="k">Uploaded files</div><div className="v">{d ? d.uploads.files : '–'}</div><div className="d">{d ? size(d.uploads.bytes) : ''}</div></div>
        <div className="panel stat"><div className="k">Last backup</div><div className="v" style={{ fontSize: d?.history[0] ? 20 : undefined }}>{d ? (d.history[0] ? ago(d.history[0].at) : 'Never') : '–'}</div><div className="d">{d?.history[0] ? `by ${d.history[0].display_name}` : 'No backup has been downloaded yet'}</div></div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Backup History</h3><span className="small muted">Last 10 downloads</span></div>
        {!d ? <div className="panel-b muted">Loading…</div> : !d.history.length ? <Empty icon="download" title="No backups yet">Download your first backup above.</Empty> : (
          <table className="t"><thead><tr><th>Date</th><th>Downloaded by</th><th>Contents</th></tr></thead>
            <tbody>{d.history.map((h, i) => <tr key={i}><td>{fmtDT(h.at)}</td><td>{h.display_name || '—'}</td><td className="muted">{h.detail}</td></tr>)}</tbody></table>
        )}
      </div>
    </>
  );
}
