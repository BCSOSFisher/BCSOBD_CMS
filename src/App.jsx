import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api } from './api';
import { Icon, Avatar } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import CaseView from './pages/CaseView';
import Persons from './pages/Persons';
import PersonView from './pages/PersonView';
import PenalCode from './pages/PenalCode';
import Roster from './pages/Roster';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/login')) return <Login />;
  return <Authed />;
}

function Authed() {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const reloadUsers = async () => { const users = await api.get('/api/users'); setState((s) => ({ ...s, users })); };
  useEffect(() => {
    Promise.all([api.get('/api/me'), api.get('/api/config'), api.get('/api/users'), api.get('/api/dashboard')])
      .then(([me, config, users, dash]) => setState({ me: me.user, config, users, reviewCount: dash.review.length }))
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="content"><p>{err}</p></div>;
  if (!state) return <div className="content muted">Loading…</div>;
  return (
    <AppCtx.Provider value={{ ...state, reloadUsers, setReviewCount: (n) => setState((s) => ({ ...s, reviewCount: n })) }}>
      <div className="shell">
        <Sidebar />
        <div className="main">
          <Topbar />
          <div className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cases" element={<Cases />} />
              <Route path="/cases/:id" element={<CaseView />} />
              <Route path="/persons" element={<Persons />} />
              <Route path="/persons/:id" element={<PersonView />} />
              <Route path="/penal-code" element={<PenalCode />} />
              <Route path="/roster" element={<Roster />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>
    </AppCtx.Provider>
  );
}

function Sidebar() {
  const { me, config, reviewCount } = useApp();
  const logout = async () => { await api.post('/auth/logout'); location.href = '/login'; };
  return (
    <aside className="side">
      <div className="brand">
        <img src="/img/badge.png" alt="" />
        <div><b>DETECTIVE BUREAU</b><span>Case Management</span></div>
      </div>
      <nav className="nav">
        <div className="grp">Investigations</div>
        <NavItem to="/" exact icon="dash">Dashboard</NavItem>
        <NavItem to="/cases" icon="folder">Case Files</NavItem>
        <NavItem to="/cases?mine=1" icon="user">My Assignments</NavItem>
        <div className="grp">Records</div>
        <NavItem to="/persons" icon="users">Persons Directory</NavItem>
        <NavItem to="/penal-code" icon="book">Penal Code</NavItem>
        <div className="grp">Bureau</div>
        <NavItem to="/roster" icon="shield">Personnel Roster</NavItem>
        {config.commandRanks.includes(me.rank) && (
          <NavItem to="/?review=1" icon="pen">Supervisor Review{reviewCount > 0 && <span className="count">{reviewCount}</span>}</NavItem>
        )}
      </nav>
      <div className="me">
        <Avatar u={me} />
        <div className="who"><b>{me.display_name}</b><span>{config.ranks[me.rank]}</span></div>
        <button onClick={logout} title="Sign out"><Icon n="logout" width="14" height="14" /></button>
      </div>
    </aside>
  );
}

function NavItem({ to, icon, children }) {
  const loc = useLocation();
  const [path, qs = ''] = to.split('?');
  const cur = loc.search.replace(/^\?/, '');
  let active = qs ? loc.pathname === path && cur.includes(qs) : (path === '/' ? loc.pathname === '/' && !cur.includes('review') : loc.pathname.startsWith(path) && !(path === '/cases' && cur.includes('mine')));
  return <NavLink to={to} className={() => (active ? 'active' : '')}><Icon n={icon} />{children}</NavLink>;
}

function Topbar() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  return (
    <div className="topbar">
      <div className="crumbs"><b>Blaine County Detective Bureau</b> · Records Management</div>
      <form className="search" onSubmit={(e) => { e.preventDefault(); nav(`/cases?q=${encodeURIComponent(q)}`); }}>
        <Icon n="search" />
        <input placeholder="Search cases, case #, persons, SSN…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="clock">{t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  );
}
