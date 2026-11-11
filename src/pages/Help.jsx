// In-app guide for detectives. Sections adapt to the viewer's rank and units.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, canSeeGangs } from '../ui';

const mb = (n) => (n >= 1024 * 1024 * 1024 ? `${Math.round(n / 1024 ** 3)} GB` : `${Math.round(n / 1024 ** 2)} MB`);

export default function Help() {
  const { me, config } = useApp();
  const [store, setStore] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/api/storage').then(setStore).catch(() => {}); }, []);
  const cmd = config.commandRanks.includes(me.rank);
  const gangs = canSeeGangs(me, config);
  const photos = store?.perCase ?? 15;
  const perFile = store ? mb(store.perFile) : '500 MB';

  const topics = [
    {
      id: 'start', icon: 'shield', title: 'Getting started',
      body: <>
        <p>You sign in with Discord. Your access comes from your Discord roles in the BCSO server — your rank and units update every time you sign in, so if you're promoted or join a unit, just sign out and back in.</p>
        <ul>
          <li><b>Dashboard</b> — your open cases, anything that needs attention, cases going inactive, and recent activity.</li>
          <li><b>Case Files</b> — every case in the Bureau. <b>My Assignments</b> shows only cases you're on.</li>
          <li><b>Search</b> (top bar) — finds cases by number, title, person or SSN.</li>
          <li><b>Moon / sun icon</b> (top right) — switches between dark and light mode. Your choice is remembered on that device; until you pick, it follows your device's setting.</li>
          <li><b>Bell icon</b> (top right) — your notifications. See <a href="#notifications">Notifications</a>.</li>
        </ul>
        <p>Your current rank: <b>{config.ranks[me.rank]}</b>{(me.units || []).length > 0 && <> · Units: <b>{me.units.map((u) => config.divisions.find((d) => d.id === u)?.short || u).join(', ')}</b></>}.</p>
      </>,
    },
    {
      id: 'access', icon: 'lock', title: 'Who can do what',
      body: <>
        <table className="help-table"><tbody>
          <tr><th>Detective Bureau role only</th><td>View-only. Can read non-classified cases and records but can't create or edit anything.</td></tr>
          <tr><th>{config.ranks.trainee}</th><td>Can work on cases they've been added to, but can't open cases, lead a case or sign for closure.</td></tr>
          <tr><th>Detective I – III</th><td>Open cases, edit cases they're assigned to, and view every non-classified case.</td></tr>
          <tr><th>Lead Investigator (on a case)</th><td>Adds investigators, transfers the case, and is the only one who can classify it.</td></tr>
          <tr><th>Command</th><td>Supervisors, Co-Lead, Bureau Lead and Department Administration — edit any case, sign off closures, reopen cases, manage the roster and see Security Alerts.</td></tr>
        </tbody></table>
        <p className="small muted">Only investigators on a case can edit it. If you need to help on a case, ask its Lead Investigator to add you.</p>
      </>,
    },
    {
      id: 'open', icon: 'folder', title: 'Opening a case',
      body: <>
        <ol>
          <li>Go to <Link to="/cases">Case Files</Link> and press <b>Open New Case</b>.</li>
          <li>Pick the unit (this sets the prefix, e.g. <span className="mono">HOM-2026-0053</span>), give it a clear title, and fill in the incident date, time and location.</li>
          <li>You become the <b>Lead Investigator</b>. Add other detectives from <b>Overview &amp; Incident</b> under <b>Assigned Investigators</b>.</li>
          <li>Set the <b>Status</b> as the case progresses (Open → Pending Warrant → Referred to DA, etc.).</li>
        </ol>
        <p>Units get extra sections automatically (e.g. Crime Scene and Coroner for Major Crimes). Use <b>Add Section</b> at the bottom of the case menu for anything else — Surveillance, BOLOs, Informants, Operations, Financial, Vehicles, or your own custom section.</p>
      </>,
    },
    {
      id: 'sections', icon: 'layers', title: 'Filling out the case file',
      body: <>
        <ul>
          <li><b>Overview & Incident</b> — summary, location, agencies involved and investigators.</li>
          <li><b>Persons Involved</b> — add suspects, victims and witnesses. People are saved to the shared <Link to="/persons">Persons Directory</Link>, so search before creating someone new — their history follows them across cases.</li>
          <li><b>Charges & Elements</b> — pick charges from the penal code. Each charge lists its legal elements; link the evidence and statements that prove each one. Major charges include “what proves it” hints.</li>
          <li><b>Evidence Log</b> — every item gets an evidence number (ED-01, ED-02…). Record where it was found, who collected it and the chain of custody.</li>
          <li><b>Interviews & Statements</b> — who was interviewed, when, and what they said.</li>
          <li><b>Detective Notes</b> and <b>Timeline</b> — working notes and a chronological order of events.</li>
          <li><b>Linked Cases</b> — connect related investigations.</li>
        </ul>
        <p className="small muted">Everything you enter is saved immediately and logged in the case's activity history.</p>
      </>,
    },
    {
      id: 'media', icon: 'image', title: 'Photos & videos',
      body: <>
        <ul>
          <li><b>Photos:</b> up to <b>{photos} per case</b>, {perFile} each. Drag them into <b>Media & Attachments</b> and tag them to an evidence number. The counter shows how many are used — delete one to make room.</li>
          <li><b>Videos can't be uploaded.</b> Post the clip to YouTube, Streamable, Medal or Google Drive, then press <b>Add Video / Media Link</b> and paste the link. Every video needs a title describing what it shows (e.g. “Bodycam — suspect fleeing the scene”).</li>
          <li>Media links are unlimited and don't count toward the photo limit.</li>
          <li>PDFs, documents and audio can still be uploaded.</li>
        </ul>
      </>,
    },
    {
      id: 'warrants', icon: 'gavel', title: 'Warrants',
      body: <>
        <ol>
          <li>In <b>Warrants</b>, press <b>New Warrant Request</b> and select the charges, evidence and statements that support it.</li>
          <li>Press <b>Download Warrant Packet</b> to get a formatted .docx for the DOJ.</li>
          <li>Upload the .docx to Google Drive — it opens as a Google Doc with formatting intact — and submit it on the DOJ website.</li>
          <li>Come back and update the warrant's <b>Status</b> and DOJ reference. Everyone on the case is notified when the status changes.</li>
        </ol>
      </>,
    },
    {
      id: 'report', icon: 'download', title: 'Downloading the court report',
      body: <>
        <p>Press <b>Download Report</b> at the top of any case. You'll get a .docx with every section, the charges with their elements and supporting evidence, persons, timeline, media log and signatures.</p>
        <p><b>To use it in Google Docs:</b> upload the file to Google Drive, then right-click → <b>Open with → Google Docs</b>. The formatting carries over.</p>
      </>,
    },
    {
      id: 'closure', icon: 'pen', title: 'Closing a case',
      body: <>
        <ol>
          <li>Open <b>Review & Closure</b>, choose a disposition and write a closing summary.</li>
          <li>Tick the declaration and press <b>Sign & Submit for Closure</b>. The case locks while it's waiting.</li>
          <li>A supervisor reviews it and either signs it closed or <b>returns it for revision</b> with a reason. You'll get a notification either way.</li>
          <li>If it's returned, the reason shows at the top of the case — fix it and submit again.</li>
        </ol>
        <p className="small muted">Trainees can't sign for closure — the Lead Investigator must sign.</p>
      </>,
    },
    {
      id: 'transfer', icon: 'users', title: 'Transferring & classifying a case',
      body: <>
        <p><b>Transfer</b> (Lead Investigator or command): press <b>Transfer</b> at the top of the case, pick the new lead and, if needed, a new unit, and give a reason. You can choose to stay on as an Assistant. The transfer is recorded in the case's Transfer History and the new lead is notified.</p>
        <p><b>Classify</b> (Lead Investigator only): press <b>Classify</b> and choose which units may see the case. Everyone else — including view-only members — is blocked, and any attempt to open it is logged for command. Investigators on the case and command always keep access.</p>
      </>,
    },
    {
      id: 'notifications', icon: 'bell', title: 'Notifications',
      body: <>
        <p>The bell in the top bar shows a red count when something needs your attention. You're notified when:</p>
        <ul>
          <li>You're added to a case, or a case is transferred to (or away from) you.</li>
          <li>A case you're on changes status, or one of its warrants changes status.</li>
          <li>Your closure submission is signed off or returned — or a case you're on is reopened.</li>
          {cmd && <li><b>Command:</b> a case is submitted for supervisor sign-off.</li>}
        </ul>
        <p className="small muted">You aren't notified about your own actions. Click a notification to jump to the case. Nothing is sent to Discord.</p>
      </>,
    },
    {
      id: 'feedback', icon: 'note', title: 'Feedback & problems',
      body: <p>Have an idea, found a bug, or not sure how to do something? Open <Link to="/feedback">Feedback</Link> in the sidebar and send a suggestion, problem or question. It goes straight to Bureau command, and you'll get a notification when they update or reply to it.</p>,
    },
    {
      id: 'inactive', icon: 'clock', title: 'Inactive cases',
      body: <p>If an open case has no activity for <b>14 days</b>, it's flagged on the dashboard and shows an inactivity notice on the case. Add a note or update the case to clear it — or set it to <b>Suspended</b> if it's genuinely on hold.</p>,
    },
    {
      id: 'records', icon: 'car', title: 'Persons & vehicles',
      body: <>
        <p>The <Link to="/persons">Persons Directory</Link> and <Link to="/vehicles">Vehicle Directory</Link> are shared across the Bureau. Each record shows every case it appears in. Vehicles are searched by plate and can be linked to an owner.</p>
        <p>When you create a new person, the system checks for an existing profile with the same name and SSN. If it finds one, choose <b>Use this person</b> to keep their history in one place — only create a new profile if it's genuinely a different person.{cmd && <> Command can combine duplicates with <b>Merge Duplicate</b> on a profile, or review them all with <b>Find Duplicates</b> in the directory.</>}</p>
        {!gangs && <p className="small muted">A person's gang affiliation (name only) may show on their profile. Full gang intelligence is restricted to the Gang & Narcotics Unit.</p>}
      </>,
    },
    gangs && {
      id: 'gangs', icon: 'target', title: 'Gangs & Organizations (G&N)',
      body: <p>Only the Gang & Narcotics Unit and command can see this. Track each organization's status (recognized/suspected), members and ranks, businesses and rivalries. The <b>Link Chart</b> sub-tab maps members, businesses, vehicles and cases visually — drag nodes, filter, and zoom to find connections. Other detectives only ever see a person's gang name.</p>,
    },
    cmd && {
      id: 'command', icon: 'alert', title: 'Command tools',
      body: <ul>
        <li><b>Supervisor Review</b> — cases waiting for your sign-off.</li>
        <li><Link to="/roster">Personnel Roster</Link> — remove or restore a member's access. Members who lose their Discord role are removed automatically.</li>
        <li><Link to="/security">Security Alerts</Link> — denied sign-ins, blocked classified access and roster changes.</li>
        <li>Command can edit any case, reopen closed cases and transfer any case.</li>
      </ul>,
    },
    {
      id: 'faq', icon: 'help', title: 'Common questions',
      body: <dl className="help-faq">
        <dt>I can't edit a case.</dt><dd>You need to be added to it by the Lead Investigator. Closed cases and cases waiting for sign-off are locked for everyone.</dd>
        <dt>My rank or unit is wrong.</dt><dd>Sign out and back in to refresh your Discord roles. If it's still wrong, your Discord roles need updating.</dd>
        <dt>A video won't upload.</dt><dd>Videos must be added as links — see <a href="#media">Photos & videos</a>.</dd>
        <dt>The report looks wrong in Google Docs.</dt><dd>Make sure you open it with <b>Open with → Google Docs</b> from Drive rather than copy-pasting the text.</dd>
        <dt>I see an “Unauthorized” page.</dt><dd>Your Detective Bureau role is missing in Discord or command removed your access. Contact a supervisor.</dd>
      </dl>,
    },
  ].filter(Boolean);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return topics;
    const text = (n) => (n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(text).join(' ') : text(n.props?.children));
    return topics.filter((x) => (x.title + ' ' + text(x.body)).toLowerCase().includes(t));
  }, [q, topics]);

  return (
    <>
      <div className="page-head">
        <div><h1>Help & Guide</h1><p>How to use the Detective Bureau Case Management system.</p></div>
        <div className="search help-search"><Icon n="search" /><input placeholder="Search the guide…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="help-grid">
        <nav className="panel help-toc">
          {topics.map((t) => <a key={t.id} href={`#${t.id}`}><Icon n={t.icon} />{t.title}</a>)}
        </nav>
        <div className="help-body">
          {!shown.length && <div className="panel panel-b muted">Nothing in the guide matches “{q}”.</div>}
          {shown.map((t) => (
            <section key={t.id} id={t.id} className="panel help-sec">
              <h2><span className="help-ic"><Icon n={t.icon} /></span>{t.title}</h2>
              <div className="help-txt">{t.body}</div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
