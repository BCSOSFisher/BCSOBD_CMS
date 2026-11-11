import React, { useEffect, useMemo, useState } from 'react';
import { loadPenalCode } from '../api';
import { Icon } from '../ui';

const CLASS_COLOR = (c = '') => (/felony/i.test(c) ? 'red' : /federal/i.test(c) ? 'purple' : /misdemeanor/i.test(c) ? 'amber' : 'gray');

export default function PenalCode() {
  const [pc, setPc] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState(null);
  useEffect(() => { loadPenalCode().then(setPc); }, []);
  const cats = useMemo(() => (pc ? [...new Set(pc.map((c) => c.category))] : []), [pc]);
  const list = useMemo(() => {
    if (!pc) return [];
    const t = q.toLowerCase();
    return pc.filter((c) => (!cat || c.category === cat) && (!t || `${c.code} ${c.name} ${c.definition}`.toLowerCase().includes(t)));
  }, [pc, q, cat]);
  return (
    <>
      <div className="page-head">
        <div><h1>San Andreas Penal Code</h1><p>Reference copy of docs.sadrp.net/penal-code, with the elements used for charging. {pc && `${pc.length} charges.`}</p></div>
        <a className="btn" href="https://docs.sadrp.net/penal-code" target="_blank" rel="noreferrer"><Icon n="external" />Official source</a>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-h" style={{ flexWrap: 'wrap' }}>
            <input placeholder="Search code, name or text…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: 1, minWidth: 180 }}><option value="">All titles</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 240px)', overflow: 'auto' }} className="charge-pick">
            {list.map((c) => (
              <div key={c.code + c.name} className={'opt' + (sel === c ? ' sel' : '')} onClick={() => { setSel(c); if (window.innerWidth <= 900) setTimeout(() => document.getElementById('pc-detail')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>
                <div className="row" style={{ gap: 8 }}><span className="mono small" style={{ minWidth: 62 }}>{c.code}</span><b style={{ flex: 1 }}>{c.name}</b>{c.curated && <span className="pill green" title="Hand-written elements">✓</span>}<span className={`pill ${CLASS_COLOR(c.classification)}`}>{c.classification}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel" id="pc-detail" style={{ position: 'sticky', top: 74 }}>
          {sel ? (
            <div className="panel-b">
              <div className="mono small muted">{sel.code} · {sel.category}</div>
              <h2 style={{ margin: '6px 0 10px' }}>{sel.name}</h2>
              <div className="row" style={{ marginBottom: 14 }}>
                <span className={`pill ${CLASS_COLOR(sel.classification)}`}>{sel.classification}</span>
                {sel.sentence && <span className="pill gray">Sentence: {sel.sentence}</span>}
                {sel.fine && <span className="pill gray">Fine: {sel.fine}</span>}
              </div>
              <div style={{ lineHeight: 1.6 }}>{sel.definition}</div>
              {sel.details?.length > 0 && <div className="small" style={{ marginTop: 12, lineHeight: 1.55, color: 'var(--text2)' }}>{sel.details.map((d, i) => <p key={i} style={{ margin: '0 0 6px' }}>{d}</p>)}</div>}
              <hr className="sep" />
              <div className="tag" style={{ marginBottom: 8 }}>Elements to prove{sel.curated ? ' · hand-written' : ' · auto-generated from statute'}</div>
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>{sel.elements.map((e) => <li key={e.key} style={{ marginBottom: 6 }}>{e.text}{e.proof && <div className="small faint"><i>Typical proof:</i> {e.proof}</div>}</li>)}</ol>
              {sel.examples?.length > 0 && <><hr className="sep" /><div className="tag" style={{ marginBottom: 8 }}>Examples</div>
                <ul className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>{sel.examples.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
              <div style={{ marginTop: 14 }}><a href={sel.url} target="_blank" rel="noreferrer" className="small">Open on docs.sadrp.net <Icon n="external" width="12" /></a></div>
            </div>
          ) : <div className="empty"><Icon n="book" /><b>Select a charge</b>See its definition, penalties and the elements you must prove.</div>}
        </div>
      </div>
    </>
  );
}
