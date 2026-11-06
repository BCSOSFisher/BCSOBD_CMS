import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon, Empty, Confirm, Modal, Field, useToast, fmtDate } from '../ui';
import { SectionPanel } from './common';

const isImg = (f) => /^image\//.test(f.mime || '');
const isVid = (f) => /^video\//.test(f.mime || '');
const size = (n) => (n >= 1048576 ? `${+(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export default function Media({ b, reload }) {
  const toast = useToast();
  const inp = useRef();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState('');
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [filter, setFilter] = useState('');
  const evidence = b.items.filter((i) => i.kind === 'evidence');
  const [store, setStore] = useState(null);
  useEffect(() => { api.get('/api/storage').then(setStore).catch(() => {}); }, [b.files.length]);
  const upload = async (files) => {
    if (!files?.length) return;
    if (store) {
      const big = [...files].find((f) => f.size > store.perFile);
      if (big) return toast(`${big.name} is larger than the ${size(store.perFile)} per-file limit.`, true);
      const left = store.perCase - b.files.length;
      if (files.length > left) return toast(left > 0 ? `Only ${left} more upload(s) allowed on this case (limit ${store.perCase}).` : `This case has reached its limit of ${store.perCase} uploads. Delete a file before adding more.`, true);
      const total = [...files].reduce((a, f) => a + f.size, 0);
      if (store.limit && store.used + total > store.limit) return toast(`Not enough media storage: ${size(store.limit - store.used)} left of ${size(store.limit)}.`, true);
    }
    setBusy(true);
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    fd.append('evidence_ref', ref);
    try { await api.upload(`/api/cases/${b.case.id}/files`, fd); await reload(); toast(`${files.length} file(s) uploaded`); } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const shown = b.files.filter((f) => !filter || (filter === 'img' ? isImg(f) : filter === 'vid' ? isVid(f) : !isImg(f) && !isVid(f)));
  return (
    <SectionPanel title="Media & Attachments" sub="Photos, videos, documents and recordings" actions={<>
      <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">All files</option><option value="img">Photos</option><option value="vid">Videos</option><option value="doc">Documents & other</option>
      </select></>}>
      {b.canEdit && (
        <div style={{ marginBottom: 16 }}>
          <div className={'drop' + (over ? ' over' : '')} onClick={() => inp.current.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
            <Icon n="image" width="26" height="26" /><div style={{ marginTop: 6 }}><b>{busy ? 'Uploading…' : 'Drop files here or click to upload'}</b></div>
            <div className="small faint">Images, video, audio, PDFs and documents · up to {store ? size(store.perFile) : '500 MB'} each{store ? ` · max ${store.perCase} per case` : ''}</div>
          </div>
          <input ref={inp} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <div className="row small" style={{ marginTop: 8 }}>
            <span className="muted">Tag uploads to evidence:</span>
            <select style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }} value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">— none —</option>{evidence.map((e) => <option key={e.id} value={e.data.ed}>{e.data.ed} — {(e.data.title || '').slice(0, 40)}</option>)}
            </select>
          </div>
        </div>
      )}
      {store && (() => {
        const pct = b.files.length / store.perCase;
        return (
          <div style={{ marginBottom: 14 }}>
            <div className="row small" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="muted">Uploads on this case</span>
              <b style={{ color: pct >= 1 ? 'var(--red)' : undefined }}>{b.files.length} of {store.perCase} used</b>
            </div>
            <div className="bar"><i style={{ width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? 'var(--red)' : pct >= 0.8 ? 'var(--amber)' : undefined }} /></div>
          </div>
        );
      })()}
      {!shown.length ? <Empty icon="image" title="No media uploaded" /> : (
        <div className="media-grid">
          {shown.map((f) => (
            <div className="media" key={f.id}>
              <div className="thumb" onClick={() => (isImg(f) || isVid(f) ? setView(f) : window.open(`/api/files/${f.id}`, '_blank'))}>
                {isImg(f) ? <img src={`/api/files/${f.id}`} loading="lazy" alt="" /> : isVid(f) ? <video src={`/api/files/${f.id}#t=0.5`} preload="metadata" muted /> : <Icon n="file" />}
              </div>
              <div className="cap">
                <b title={f.original_name}>{f.caption || f.original_name}</b>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  {f.evidence_ref && <span className="chip">{f.evidence_ref}</span>}
                  <span className="faint" style={{ fontSize: 11.5 }}>{size(f.size)} · {fmtDate(f.created_at)}</span>
                  <span className="spacer" />
                  <a className="icon-btn" href={`/api/files/${f.id}?download=1`} title="Download"><Icon n="download" /></a>
                  {b.canEdit && <><button className="icon-btn" onClick={() => setEdit({ ...f })}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setDel(f)}><Icon n="trash" /></button></>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="small faint" style={{ marginBottom: 0, marginTop: 14 }}>Photos (PNG/JPG/GIF) are embedded in the downloaded case report’s Photographic Evidence Appendix. Videos and documents are listed in the media index.</p>
      {view && (
        <div className="lightbox" onClick={() => setView(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            {isImg(view) ? <img src={`/api/files/${view.id}`} alt="" /> : <video src={`/api/files/${view.id}`} controls autoPlay />}
            <div className="lb-cap">{view.evidence_ref && <span className="chip" style={{ marginRight: 8 }}>{view.evidence_ref}</span>}{view.caption || view.original_name}</div>
          </div>
        </div>
      )}
      {edit && (
        <Modal title="Edit Media Details" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" onClick={async () => { await api.patch(`/api/files/${edit.id}`, edit); await reload(); setEdit(null); }}>Save</button></>}>
          <div className="form">
            <Field label="Caption"><input value={edit.caption} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} placeholder="e.g. Kitchen floor, facing north" /></Field>
            <Field label="Evidence Reference"><select value={edit.evidence_ref} onChange={(e) => setEdit({ ...edit, evidence_ref: e.target.value })}>
              <option value="">— none —</option>{evidence.map((e) => <option key={e.id} value={e.data.ed}>{e.data.ed} — {e.data.title}</option>)}</select></Field>
            <Field label="Date / Time Taken"><input value={edit.taken_at} onChange={(e) => setEdit({ ...edit, taken_at: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {del && <Confirm text={`Delete ${del.original_name}? This cannot be undone.`} onYes={async () => { await api.del(`/api/files/${del.id}`); reload(); }} onClose={() => setDel(null)} />}
    </SectionPanel>
  );
}
