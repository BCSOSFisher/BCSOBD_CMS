import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Icon, Empty } from '../ui';
import { GangTabs } from './Gangs';

// Node styling by type
const TYPES = {
  gang: { label: 'Gangs', color: '#b42318', r: 26 },
  person: { label: 'Members', color: '#2557a7', r: 15 },
  business: { label: 'Businesses', color: '#a15c07', r: 13 },
  vehicle: { label: 'Vehicles', color: '#475467', r: 12 },
  case: { label: 'Cases', color: '#1e7a46', r: 13 },
};
const EDGE = { relation: '#98a2b3', member: '#7d93bd', business: '#d9a441', owns: '#98a2b3', gangveh: '#98a2b3', case: '#7fbf99' };
const REL_COLOR = { Rival: '#d92d20', Ally: '#12b76a' };

// Small force-directed layout (no libraries): repulsion + springs + centering
function layout(nodes, edges, W, H) {
  const pos = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2; const rad = n.type === 'gang' ? 120 : 260;
    return [n.id, { x: W / 2 + Math.cos(a) * rad + (Math.random() - 0.5) * 40, y: H / 2 + Math.sin(a) * rad + (Math.random() - 0.5) * 40, vx: 0, vy: 0 }];
  }));
  const ids = nodes.map((n) => n.id);
  for (let it = 0; it < 380; it++) {
    const alpha = 1 - it / 380;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i]), b = pos.get(ids[j]);
      let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 0.01;
      const f = 2600 / d2; const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const e of edges) {
      const a = pos.get(e.a), b = pos.get(e.b); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const want = e.kind === 'relation' ? 260 : e.kind === 'member' ? 110 : 90;
      const f = (d - want) * 0.03;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const id of ids) {
      const p = pos.get(id);
      p.vx += (W / 2 - p.x) * 0.004; p.vy += (H / 2 - p.y) * 0.004;
      p.x += Math.max(-30, Math.min(30, p.vx)) * alpha; p.y += Math.max(-30, Math.min(30, p.vy)) * alpha;
      p.vx *= 0.55; p.vy *= 0.55;
    }
  }
  return pos;
}

export default function LinkChart() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [gang, setGang] = useState('');
  const [show, setShow] = useState({ gang: true, person: true, business: true, vehicle: true, case: true });
  const [hover, setHover] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [pos, setPos] = useState(null);
  const svgRef = useRef(); const drag = useRef(null);
  const W = 1200, H = 760;
  useEffect(() => { api.get('/api/gangs/graph').then(setData); }, []);

  // filter: one gang = that gang plus everything within 2 hops (and its direct gang relations)
  const graph = useMemo(() => {
    if (!data) return null;
    let nodes = data.nodes, edges = data.edges;
    if (gang) {
      // the gang, everything directly linked to it, and one more step out from its members/vehicles/businesses
      // (other gangs appear as single nodes — their own members are not pulled in)
      const root = 'g' + gang; const keep = new Set([root]); const frontier = [];
      for (const e of edges) {
        const o = e.a === root ? e.b : e.b === root ? e.a : null;
        if (o) { keep.add(o); if (!o.startsWith('g')) frontier.push(o); }
      }
      for (const e of edges) for (const f of frontier) {
        const o = e.a === f ? e.b : e.b === f ? e.a : null;
        if (o && !o.startsWith('g')) keep.add(o);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
    }
    nodes = nodes.filter((n) => show[n.type]);
    const ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
    return { nodes, edges };
  }, [data, gang, show]);
  // fit the whole chart into the frame
  const fit = (p) => {
    const pts = [...p.values()]; if (!pts.length) return { x: 0, y: 0, k: 1 };
    const pad = 70; const minX = Math.min(...pts.map((q) => q.x)) - pad, maxX = Math.max(...pts.map((q) => q.x)) + pad;
    const minY = Math.min(...pts.map((q) => q.y)) - pad, maxY = Math.max(...pts.map((q) => q.y)) + pad;
    const k = Math.max(0.4, Math.min(2.2, Math.min(W / (maxX - minX), H / (maxY - minY))));
    return { k, x: (W - (maxX + minX) * k) / 2, y: (H - (maxY + minY) * k) / 2 };
  };
  const relayout = () => { const p = layout(graph.nodes, graph.edges, W, H); setPos(p); setView(fit(p)); };
  useEffect(() => { if (graph) relayout(); }, [graph]);

  if (!data || !graph || !pos) return <><GangTabs active="chart" /><div className="muted">Building link chart…</div></>;
  const neighbors = new Set();
  if (hover) for (const e of graph.edges) { if (e.a === hover) neighbors.add(e.b); if (e.b === hover) neighbors.add(e.a); }
  const dim = (id) => hover && id !== hover && !neighbors.has(id);
  const open = (n) => {
    if (n.type === 'gang') nav(`/gangs/${n.ref}`); else if (n.type === 'person') nav(`/persons/${n.ref}`);
    else if (n.type === 'vehicle') nav(`/vehicles/${n.ref}`); else if (n.type === 'case') nav(`/cases/${n.ref}`); else if (n.type === 'business') nav(`/gangs/${n.ref}`);
  };
  const toSvg = (ev) => { const r = svgRef.current.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H }; };
  const onDown = (ev, id) => { ev.stopPropagation(); const p = toSvg(ev); drag.current = { id, sx: p.x, sy: p.y, moved: false, vx: view.x, vy: view.y }; };
  const onMove = (ev) => {
    const d = drag.current; if (!d) return; const p = toSvg(ev);
    if (Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) > 3) d.moved = true;
    if (d.id) { const np = new Map(pos); np.set(d.id, { ...np.get(d.id), x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k }); setPos(np); }
    else setView({ ...view, x: d.vx + (p.x - d.sx), y: d.vy + (p.y - d.sy) });
  };
  const onUp = (n) => { const d = drag.current; drag.current = null; if (d && d.id && !d.moved && n) open(n); };
  const zoom = (f) => setView((v) => { const k = Math.max(0.4, Math.min(2.5, v.k * f)); return { k, x: W / 2 - ((W / 2 - v.x) / v.k) * k, y: H / 2 - ((H / 2 - v.y) / v.k) * k }; });
  const gangs = data.nodes.filter((n) => n.type === 'gang');

  return (
    <>
      <GangTabs active="chart" />
      <div className="panel">
        <div className="panel-h" style={{ flexWrap: 'wrap' }}>
          <div className="row" style={{ flex: 1 }}>
            <select style={{ maxWidth: 260 }} value={gang} onChange={(e) => setGang(e.target.value)}>
              <option value="">All gangs</option>{gangs.map((g) => <option key={g.ref} value={g.ref}>{g.title}</option>)}
            </select>
            {Object.entries(TYPES).map(([k, t]) => (
              <label key={k} className="check small"><input type="checkbox" checked={show[k]} disabled={k === 'gang'} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />
                <span className="lc-dot" style={{ background: t.color }} />{t.label}</label>
            ))}
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => zoom(1.25)} title="Zoom in"><Icon n="plus" /></button>
            <button className="btn sm" onClick={() => zoom(0.8)} title="Zoom out">−</button>
            <button className="btn sm" onClick={() => setView(fit(pos))}>Fit</button>
            <button className="btn sm" onClick={relayout}>Re-arrange</button>
          </div>
        </div>
        {graph.nodes.length <= 1 ? <Empty icon="link" title="Nothing to chart yet">Add members, businesses and vehicles to gangs, and they’ll appear here connected to their cases.</Empty> : (
          <div className="lc-wrap">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="lc" onMouseDown={(e) => onDown(e, null)} onMouseMove={onMove} onMouseUp={() => onUp(null)} onMouseLeave={() => { drag.current = null; }}
              onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 0.9)}>
              <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                {graph.edges.map((e, i) => {
                  const a = pos.get(e.a), b = pos.get(e.b); if (!a || !b) return null;
                  const col = e.kind === 'relation' ? (REL_COLOR[e.label] || EDGE.relation) : EDGE[e.kind];
                  const faded = hover && !(e.a === hover || e.b === hover);
                  return (
                    <g key={i} opacity={faded ? 0.12 : 1}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={e.kind === 'relation' ? 3 : 1.6} strokeDasharray={e.kind === 'case' || e.label?.startsWith('Susp') ? '5 4' : undefined} />
                      {(e.kind === 'relation' || (hover && !faded)) && e.label && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="lc-elabel" fill={col}>{e.label}</text>}
                    </g>
                  );
                })}
                {graph.nodes.map((n) => {
                  const p = pos.get(n.id); const t = TYPES[n.type];
                  const fill = n.type === 'case' && n.restricted ? '#2a0d0b' : n.type === 'business' && n.legality === 'Illegal' ? '#b42318' : t.color;
                  return (
                    <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim(n.id) ? 0.18 : 1} style={{ cursor: 'pointer' }}
                      onMouseDown={(e) => onDown(e, n.id)} onMouseUp={(e) => { e.stopPropagation(); onUp(n); }} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                      <title>{n.title || n.label}{n.rank ? ` — ${n.rank}` : ''}{n.status ? ` (${n.status})` : ''}</title>
                      {n.type === 'business' ? <rect x={-t.r} y={-t.r} width={t.r * 2} height={t.r * 2} rx="3" fill={fill} stroke="#fff" strokeWidth="2.5" />
                        : n.type === 'vehicle' ? <rect x={-t.r * 1.3} y={-t.r * 0.8} width={t.r * 2.6} height={t.r * 1.6} rx="4" fill={fill} stroke="#fff" strokeWidth="2.5" />
                        : n.type === 'case' ? <polygon points={`0,${-t.r * 1.2} ${t.r * 1.2},0 0,${t.r * 1.2} ${-t.r * 1.2},0`} fill={fill} stroke="#fff" strokeWidth="2.5" />
                        : <circle r={t.r} fill={fill} stroke={n.type === 'gang' && n.status === 'Recognized' ? '#fbbf24' : '#fff'} strokeWidth={n.type === 'gang' ? 4 : 2.5} />}
                      {n.type === 'gang' && <text className="lc-gang" dy="5">{n.label}</text>}
                      {n.type !== 'gang' && <text className="lc-label" y={t.r + 15}>{n.type === 'case' && n.restricted ? `${n.label} 🔒` : n.label}</text>}
                      {n.type === 'person' && n.rank && <text className="lc-sub" y={t.r + 28}>{n.rank}</text>}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
        <div className="panel-b small muted lc-legend">
          <span><span className="lc-dot" style={{ background: TYPES.gang.color, outline: '2px solid #fbbf24' }} /> Recognized gang</span>
          <span><span className="lc-dot" style={{ background: TYPES.gang.color }} /> Suspected gang</span>
          <span><i className="lc-line" style={{ background: REL_COLOR.Rival }} /> Rival</span>
          <span><i className="lc-line" style={{ background: REL_COLOR.Ally }} /> Ally</span>
          <span><i className="lc-line dash" /> Suspected / case link</span>
          <span>■ Business (red = illegal) · ▬ Vehicle · ◆ Case</span>
          <span className="faint">Hover to highlight connections · drag to move · scroll to zoom · click to open</span>
        </div>
      </div>
    </>
  );
}
