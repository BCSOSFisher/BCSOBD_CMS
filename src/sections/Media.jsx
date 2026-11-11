import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon, Empty, Confirm, Modal, Field, useToast, fmtDate } from '../ui';
import { SectionPanel, ItemModal, useItems } from './common';

// Recognise common clip/media hosts for a friendly label
export function platformOf(u) {
  let h = '';
  try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Link'; }
  const map = { 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'medal.tv': 'Medal', 'streamable.com': 'Streamable', 'drive.google.com': 'Google Drive', 'docs.google.com': 'Google Docs', 'imgur.com': 'Imgur', 'i.imgur.com': 'Imgur', 'twitch.tv': 'Twitch', 'clips.twitch.tv': 'Twitch', 'cdn.discordapp.com': 'Discord', 'media.discordapp.net': 'Discord', 'gyazo.com': 'Gyazo' };
  return map[h] || h;
}
function ytThumb(u) {
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

const isImg = (f) => /^image\//.test(f.mime || '');
const isVidFile = (f) => /^video\//.test(f.type || '') || /\.(mp4|m4v|mov|avi|wmv|webm|mkv|flv|mpe?g|3gp|ogv|ts|mts|m2ts)$/i.test(f.name || '');
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
  const [linkEdit, setLinkEdit] = useState(null);
  const [linkDel, setLinkDel] = useState(null);
  const I = useItems(b, reload);
  const links = b.items.filter((i) => i.kind === 'medialink');
  const photoCount = b.files.filter(isImg).length;
  useEffect(() => { api.get('/api/storage').then(setStore).catch(() => {}); }, [b.files.length]);
  const upload = async (files) => {
    if (!files?.length) return;
    if (store) {
      const big = [...files].find((f) => f.size > store.perFile);
      if (big) return toast(`${big.name} is larger than the ${size(store.perFile)} per-file limit.`, true);
      const newPhotos = [...files].filter((f) => /^image\//.test(f.type)).length;
      const left = store.perCase - photoCount;
      if (newPhotos > left) return toast(left > 0 ? `Only ${left} more photo(s) allowed on this case (limit ${store.perCase}).` : `This case has reached its limit of ${store.perCase} photos. Delete a photo first, or add the media as a link.`, true);
      const total = [...files].reduce((a, f) => a + f.size, 0);
      if (store.limit && store.used + total > store.limit) return toast(`Not enough media storage: ${size(store.limit - store.used)} left of ${size(store.limit)}.`, true);
    }
    // Videos can't be uploaded — they must be added as a media link
    if ([...files].some(isVidFile)) return toast('Video files can’t be uploaded. Post it to YouTube, Streamable or Medal and use “Add Video / Media Link”.', true);
    send([...files], [], ref);
  };
  const send = async (others, vids, evRef) => {
    setBusy(true);
    try {
      if (others.length) {
        const fd = new FormData();
        others.forEach((f) => fd.append('files', f));
        fd.append('evidence_ref', evRef);
        await api.upload(`/api/cases/${b.case.id}/files`, fd);
      }
      for (const v of vids) {
        const fd = new FormData();
        fd.append('files', v.file);
        fd.append('caption', v.title.trim());
        fd.append('evidence_ref', evRef);
        await api.upload(`/api/cases/${b.case.id}/files`, fd);
      }
      toast(`${others.length + vids.length} file(s) uploaded`);
    } catch (e) { toast(e.message, true); }
    await reload();
    setBusy(false);
  };
  const [pending, setPending] = useState(null);
  const titlesOk = pending && pending.titles.every((t) => t.trim().length >= 3);
  const shown = filter === 'link' ? [] : b.files.filter((f) => !filter || (filter === 'img' ? isImg(f) : filter === 'vid' ? isVid(f) : !isImg(f) && !isVid(f)));
  const shownLinks = !filter || filter === 'link' || filter === 'vid' ? links : [];
  return (
    <SectionPanel title="Media & Attachments" sub="Photos, videos, documents and recordings" actions={<>
      <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">All files</option><option value="img">Photos</option><option value="vid">Videos</option><option value="doc">Documents & other</option><option value="link">Media links</option>
      </select>
      {b.canEdit && <button className="btn primary sm" onClick={() => setLinkEdit({ data: { evidence_ref: ref } })}><Icon n="link" />Add Video / Media Link</button>}</>}>
      {b.canEdit && (
        <div style={{ marginBottom: 16 }}>
          <div className={'drop' + (over ? ' over' : '')} onClick={() => inp.current.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
            <Icon n="image" width="26" height="26" /><div style={{ marginTop: 6 }}><b>{busy ? 'Uploading…' : 'Drop files here or click to upload'}</b></div>
            <div className="small faint">Photos, audio, PDFs and documents · up to {store ? size(store.perFile) : '500 MB'} each{store ? ` · max ${store.perCase} photos per case` : ''}</div>
            <div className="small faint" style={{ marginTop: 2 }}><b>Videos must be added as a link</b> — use <b>Add Video / Media Link</b> for YouTube, Streamable, Medal or Drive clips. Links don’t count toward the limit.</div>
          </div>
          <input ref={inp} type="file" multiple hidden accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <div className="row small" style={{ marginTop: 8 }}>
            <span className="muted">Tag uploads to evidence:</span>
            <select style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }} value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">— none —</option>{evidence.map((e) => <option key={e.id} value={e.data.ed}>{e.data.ed} — {(e.data.title || '').slice(0, 40)}</option>)}
            </select>
          </div>
        </div>
      )}
      {store && (() => {
        const pct = photoCount / store.perCase;
        return (
          <div style={{ marginBottom: 14 }}>
            <div className="row small" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="muted">Photos on this case <span className="faint">(links and other files don’t count)</span></span>
              <b style={{ color: pct >= 1 ? 'var(--red)' : undefined }}>{photoCount} of {store.perCase} used</b>
            </div>
            <div className="bar"><i style={{ width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? 'var(--red)' : pct >= 0.8 ? 'var(--amber)' : undefined }} /></div>
          </div>
        );
      })()}
      {shownLinks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="tag" style={{ marginBottom: 8 }}>Video & Media Links</div>
          <div className="media-grid">
            {shownLinks.map((l) => {
              const th = ytThumb(l.data.url);
              return (
                <div className="media" key={l.id}>
                  <a className="thumb" href={l.data.url} target="_blank" rel="noreferrer" style={{ position: 'relative', textDecoration: 'none' }}>
                    <Icon n="video" />{th && <img src={th} alt="" loading="lazy" style={{ position: 'absolute', inset: 0 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                    <span className="pill navy plat" style={{ position: 'absolute', left: 8, top: 8, zIndex: 1 }}><Icon n="external" />{platformOf(l.data.url)}</span>
                  </a>
                  <div className="cap">
                    <b title={l.data.url}>{l.data.title || l.data.url}</b>
                    {l.data.description && <div className="faint" style={{ fontSize: 11.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.data.description}</div>}
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {l.data.evidence_ref && <span className="chip">{l.data.evidence_ref}</span>}
                      <span className="faint" style={{ fontSize: 11.5 }}>Link · {fmtDate(l.created_at)}</span>
                      <span className="spacer" />
                      <a className="icon-btn" href={l.data.url} target="_blank" rel="noreferrer" title="Open"><Icon n="external" /></a>
                      {b.canEdit && <><button className="icon-btn" onClick={() => setLinkEdit(l)}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setLinkDel(l)}><Icon n="trash" /></button></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {filter === 'link' ? (!links.length && <Empty icon="link" title="No media links yet" />) : !shown.length ? (!shownLinks.length && <Empty icon="image" title="No media uploaded" />) : (
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
      <p className="small faint" style={{ marginBottom: 0, marginTop: 14 }}>Photos (PNG/JPG/GIF) are embedded in the downloaded case report’s Photographic Evidence Appendix. Videos, documents and media links are listed in the report with clickable links.</p>
      {pending && (
        <Modal title={`Title ${pending.vids.length > 1 ? 'these videos' : 'this video'}`} onClose={() => setPending(null)} footer={<>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          <button className="btn primary" disabled={!titlesOk} onClick={() => { const p = pending; setPending(null); send(p.others, p.vids.map((file, i) => ({ file, title: p.titles[i] })), p.ref); }}>
            Upload {pending.others.length + pending.vids.length} file(s)</button></>}>
          <p className="muted small" style={{ marginTop: 0 }}>Every video needs a title describing what it shows. The title appears on the case file and in the report.</p>
          <div className="form">
            {pending.vids.map((v, i) => (
              <Field key={i} label={`${v.name} · ${size(v.size)}`}>
                <input autoFocus={i === 0} value={pending.titles[i]} placeholder="e.g. Bodycam — suspect fleeing the scene"
                  onChange={(e) => setPending({ ...pending, titles: pending.titles.map((t, j) => (j === i ? e.target.value : t)) })} />
              </Field>
            ))}
          </div>
          {pending.others.length > 0 && <p className="small faint" style={{ marginBottom: 0 }}>{pending.others.length} other file(s) will upload with them.</p>}
        </Modal>
      )}
      {linkEdit && <ItemModal b={b} wide={false} title={linkEdit.id ? 'Edit Media Link' : 'Add Video / Media Link'} initial={linkEdit.data}
        fields={[
          { k: 'url', label: 'Link', span: 4, ph: 'https://medal.tv/… or https://youtu.be/…' },
          { k: 'title', label: 'Title (required)', hint: 'What does the video show?', span: 4, ph: 'e.g. Bodycam — suspect fleeing scene' },
          { k: 'evidence_ref', label: 'Evidence Reference', type: 'select', options: evidence.map((e) => e.data.ed), span: 2 },
          { k: 'description', label: 'Description', type: 'textarea', rows: 3, ph: 'What the clip shows, timestamps of interest…' },
        ]}
        onSave={(v) => (linkEdit.id ? I.update(linkEdit.id, v) : I.add('medialink', v))} onClose={() => setLinkEdit(null)} />}
      {linkDel && <Confirm text={`Remove the link “${linkDel.data.title || linkDel.data.url}”?`} onYes={() => I.remove(linkDel.id)} onClose={() => setLinkDel(null)} />}
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
          <button className="btn primary" disabled={isVid(edit) && (edit.caption || '').trim().length < 3} onClick={async () => { try { await api.patch(`/api/files/${edit.id}`, edit); await reload(); setEdit(null); } catch (e) { toast(e.message, true); } }}>Save</button></>}>
          <div className="form">
            <Field label={isVid(edit) ? 'Title (required)' : 'Caption'} hint={isVid(edit) ? 'What does the video show?' : undefined}><input value={edit.caption} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} placeholder="e.g. Kitchen floor, facing north" /></Field>
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
