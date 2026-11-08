import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';
import { canSeeGangs } from '../ui';

// Gang registry for the 'Gang Affiliation' dropdown (cached for the session)
let gangCache;
export const loadGangs = (fresh) => ((!gangCache || fresh) ? (gangCache = api.get('/api/gangs').then((r) => r.gangs)) : gangCache);
function GangSelect({ value, onChange }) {
  const [g, setG] = useState([]);
  useEffect(() => { loadGangs().then(setG).catch(() => {}); }, []);
  const grp = (s) => g.filter((x) => x.status === s);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">None / unknown</option>
      {['Recognized', 'Suspected', 'Inactive'].map((s) => grp(s).length > 0 && (
        <optgroup key={s} label={`${s} gangs`}>{grp(s).map((x) => <option key={x.id} value={x.id}>{x.name}{x.abbreviation ? ` (${x.abbreviation})` : ''}</option>)}</optgroup>
      ))}
    </select>
  );
}
import { Modal, Field, Icon, Empty, Confirm, useToast, fmtDate } from '../ui';

// Render a set of fields bound to object v / setter
export function Fields({ fields, v, set, b }) {
  const { me, config } = useApp();
  const showGang = canSeeGangs(me, config);
  const persons = b?.persons || [];
  const uniqPersons = [...new Map(persons.map((p) => [p.id, p])).values()];
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
      {fields.map((f) => {
        const val = v[f.k] ?? '';
        const on = (e) => set({ ...v, [f.k]: f.type === 'check' ? e.target.checked : e.target.value });
        let input;
        if (f.type === 'textarea') input = <textarea rows={f.rows || 4} value={val} onChange={on} placeholder={f.ph} />;
        else if (f.type === 'select') input = <select value={val} onChange={on}><option value="">Select…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>;
        else if (f.type === 'gang') { if (!showGang) return null; input = <GangSelect value={val} onChange={(id) => set({ ...v, [f.k]: id })} />; }
        else if (f.type === 'person') input = (
          <select value={val} onChange={(e) => set({ ...v, [f.k]: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">{f.ph || 'Select person…'}</option>
            {uniqPersons.map((p) => <option key={p.id} value={p.id}>{p.name} ({persons.filter((x) => x.id === p.id).map((x) => x.case_role).join(', ')})</option>)}
          </select>);
        else if (f.type === 'check') return <label key={f.k} className="check" style={{ gridColumn: `span ${f.span || 2}`, alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={!!val} onChange={on} />{f.label}</label>;
        else input = <input type={f.type || 'text'} value={val} onChange={on} placeholder={f.ph} />;
        return <Field key={f.k} label={f.label} hint={f.hint} span={f.span || (f.type === 'textarea' ? 4 : 2)}>{input}</Field>;
      })}
    </div>
  );
}

export function ItemModal({ title, fields, initial, onSave, onClose, b, extra, wide = true }) {
  const [v, setV] = useState(initial || {});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true);
    try { await onSave(v); onClose(); } catch (e) { toast(e.message, true); setBusy(false); }
  };
  return (
    <Modal wide={wide} title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <Fields fields={fields} v={v} set={setV} b={b} />
      {extra && extra(v, setV)}
    </Modal>
  );
}

// Hook for item CRUD on a case
export function useItems(b, reload) {
  const toast = useToast();
  return {
    add: async (kind, data) => { await api.post(`/api/cases/${b.case.id}/items`, { kind, data }); await reload(); toast('Saved'); },
    update: async (id, data, silent) => { await api.patch(`/api/items/${id}`, { data, silent }); await reload(); if (!silent) toast('Saved'); },
    remove: async (id) => { try { await api.del(`/api/items/${id}`); await reload(); toast('Deleted'); } catch (e) { toast(e.message, true); } },
  };
}

export function SectionPanel({ title, sub, actions, children }) {
  return (
    <div className="panel">
      <div className="panel-h"><h3>{title}{sub && <span className="sub">{sub}</span>}</h3><div className="row">{actions}</div></div>
      <div className="panel-b">{children}</div>
    </div>
  );
}

// Data-driven list section (vehicles, BOLOs, surveillance, etc.)
export function GenericSection({ b, reload, kind, title, sub, fields, display, icon = 'file', addLabel = 'Add Entry' }) {
  const items = b.items.filter((i) => i.kind === kind);
  const I = useItems(b, reload);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return (
    <SectionPanel title={title} sub={sub} actions={b.canEdit && <button className="btn primary sm" onClick={() => setEdit({})}><Icon n="plus" />{addLabel}</button>}>
      {items.length ? items.map((it) => (
        <div className="card" key={it.id}>
          <div className="card-h">
            <b>{display.title(it.data)}</b>{display.badge && display.badge(it.data)}
            <span className="spacer" />
            {b.canEdit && <><button className="icon-btn" onClick={() => setEdit(it)}><Icon n="edit" /></button><button className="icon-btn" onClick={() => setDel(it)}><Icon n="trash" /></button></>}
          </div>
          <div className="kv">
            {fields.filter((f) => f.type !== 'check' && it.data[f.k] && !display.skip?.includes(f.k)).flatMap((f) => [
              <div key={f.k + 'l'}>{f.label}</div>,
              <div key={f.k + 'v'} className="pre">{f.type === 'date' ? fmtDate(it.data[f.k]) : f.type === 'person' ? (b.persons.find((p) => p.id === it.data[f.k])?.name || '') : it.data[f.k]}</div>,
            ])}
          </div>
        </div>
      )) : <Empty icon={icon} title={`No ${title.toLowerCase()} recorded`} />}
      {edit && <ItemModal b={b} title={edit.id ? `Edit — ${title}` : `${addLabel}`} fields={fields} initial={edit.data || display.defaults?.() || {}}
        onSave={(v) => (edit.id ? I.update(edit.id, v) : I.add(kind, v))} onClose={() => setEdit(null)} />}
      {del && <Confirm text="Delete this entry? This cannot be undone." onYes={() => I.remove(del.id)} onClose={() => setDel(null)} />}
    </SectionPanel>
  );
}
