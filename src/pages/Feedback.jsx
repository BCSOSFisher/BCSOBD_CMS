// Suggest a feature / report a problem. Everyone can submit; command reviews and replies.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, Empty, Modal, Field, Confirm, useToast, fmtDT, ago } from '../ui';

const KIND_ICON = { Suggestion: 'plus', Problem: 'alert', Question: 'help' };
const STATUS_TONE = { New: 'blue', 'Under Review': 'amber', Planned: 'purple', Done: 'green', Declined: 'gray' };
const Pill = ({ s }) => <span className={`pill dot ${STATUS_TONE[s] || 'gray'}`}>{s}</span>;

export default function Feedback() {
  const { me, config } = useApp();
  const cmd = config.commandRanks.includes(me.rank);
  const toast = useToast();
  const loc = useLocation();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(cmd ? 'all' : 'mine');
  const [form, setForm] = useState({ kind: 'Suggestion', title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('open');
  const [open, setOpen] = useState(null);
  const [del, setDel] = useState(null);
  const load = () => api.get('/api/feedback').then(setD).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post('/api/feedback', { ...form, page: loc.state?.from || '' });
      setForm({ kind: form.kind, title: '', body: '' }); toast('Thanks — sent to Bureau command'); setTab('mine'); await load();
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  };
  const rows = !d ? [] : tab === 'mine' ? d.mine : (d.all || []).filter((f) => filter === 'all' || (filter === 'open' ? !['Done', 'Declined'].includes(f.status) : f.status === filter || f.kind === filter));

  return (
    <>
      <div className="page-head">
        <div><h1>Feedback</h1><p>Suggest a feature, report a problem or ask a question. It goes straight to Bureau command — you'll get a notification when they reply.</p></div>
      </div>

      <div className="fb-grid">
        <form className="panel panel-b fb-form" onSubmit={submit}>
          <h3 style={{ marginBottom: 12 }}>Send feedback</h3>
          <div className="fb-kinds">
            {(d?.kinds || ['Suggestion', 'Problem', 'Question']).map((k) => (
              <button type="button" key={k} className={'fb-kind' + (form.kind === k ? ' on' : '')} onClick={() => setForm({ ...form, kind: k })}><Icon n={KIND_ICON[k]} />{k}</button>
            ))}
          </div>
          <Field label="Title"><input value={form.title} maxLength={140} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={form.kind === 'Problem' ? 'e.g. Report download fails on my phone' : form.kind === 'Question' ? 'e.g. How do I link a warrant to a charge?' : 'e.g. Add a calendar for court dates'} /></Field>
          <Field label="Details" hint={form.kind === 'Problem' ? 'What were you doing, what happened, and on which case or page?' : 'Optional — the more detail the better.'}>
            <textarea rows={5} value={form.body} maxLength={4000} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <div className="row end"><button className="btn primary" disabled={busy || form.title.trim().length < 3}><Icon n="check" />{busy ? 'Sending…' : 'Send to Command'}</button></div>
        </form>

        <div className="panel">
          <div className="panel-h" style={{ flexWrap: 'wrap' }}>
            {cmd ? (
              <div className="subtabs" style={{ margin: 0 }}>
                <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All feedback{d?.newCount ? <span className="pill blue" style={{ marginLeft: 6, padding: "0 7px" }}>{d.newCount} new</span> : null}</button>
                <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My submissions</button>
              </div>
            ) : <h3>My submissions</h3>}
            {cmd && tab === 'all' && (
              <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="open">Open</option><option value="all">All</option>
                {(d?.statuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
                {(d?.kinds || []).map((k) => <option key={k} value={k}>{k}s</option>)}
              </select>
            )}
          </div>
          {!d ? <div className="panel-b muted">Loading…</div> : !rows.length ? (
            <Empty icon="note" title={tab === 'mine' ? 'Nothing sent yet' : 'No feedback here'}>{tab === 'mine' ? 'Your suggestions and reports will show here with command’s reply.' : 'Try a different filter.'}</Empty>
          ) : (
            <div className="fb-list">
              {rows.map((f) => (
                <button key={f.id} className={'fb-item' + (f.status === 'New' && tab === 'all' ? ' unread' : '')} onClick={() => setOpen(f)}>
                  <span className="fb-ic"><Icon n={KIND_ICON[f.kind] || 'note'} /></span>
                  <span className="fb-txt">
                    <b>{f.title}</b>
                    <span className="small muted">{f.kind}{tab === 'all' ? ` · ${f.author}` : ''} · {ago(f.created_at)}</span>
                    {f.response && <span className="fb-reply"><Icon n="check" width="12" />{f.responder}: {f.response}</span>}
                  </span>
                  <Pill s={f.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && <FeedbackModal f={open} cmd={cmd} me={me} statuses={d.statuses} onClose={() => setOpen(null)} onDelete={() => { setDel(open); setOpen(null); }}
        onSaved={async () => { setOpen(null); await load(); }} />}
      {del && <Confirm text={`Delete “${del.title}”?`} onYes={async () => { await api.del(`/api/feedback/${del.id}`); toast('Deleted'); load(); }} onClose={() => setDel(null)} />}
    </>
  );
}

function FeedbackModal({ f, cmd, me, statuses, onClose, onSaved, onDelete }) {
  const toast = useToast();
  const { config } = useApp();
  const [status, setStatus] = useState(f.status === 'New' && cmd ? 'Under Review' : f.status);
  const [response, setResponse] = useState(f.response || '');
  const save = async () => {
    try { await api.patch(`/api/feedback/${f.id}`, { status, response }); toast('Saved — the detective has been notified'); onSaved(); } catch (e) { toast(e.message, true); }
  };
  const canDelete = cmd || (f.user_id === me.id && f.status === 'New');
  return (
    <Modal title={f.title} onClose={onClose} footer={<>
      {canDelete && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={onDelete}><Icon n="trash" />{cmd ? 'Delete' : 'Withdraw'}</button>}
      <button className="btn" onClick={onClose}>Close</button>
      {cmd && <button className="btn primary" onClick={save}>Save & Notify</button>}</>}>
      <div className="row" style={{ marginBottom: 12 }}><Pill s={f.status} /><span className="small muted">{f.kind} · {f.author}{f.author_rank ? ` (${config.ranks[f.author_rank] || f.author_rank})` : ''} · {fmtDT(f.created_at)}</span></div>
      <div className="fb-body">{f.body || <span className="faint">No details given.</span>}</div>
      {!cmd && f.response && <div className="fb-response"><b>{f.responder} replied</b>{f.responded_at && <span className="small muted"> · {fmtDT(f.responded_at)}</span>}<div>{f.response}</div></div>}
      {cmd && (
        <div className="form" style={{ marginTop: 16 }}>
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Reply to the detective" hint="Optional. They'll see this with a notification."><textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="e.g. Good idea — added to the list for next week." /></Field>
        </div>
      )}
    </Modal>
  );
}
