// In-app guide for detectives. Sections adapt to the viewer's rank and units.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Icon, canSeeGangs } from '../ui';

// Screenshot with caption; click to enlarge
function Shot({ src, alt, caption, narrow }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <figure className={'help-shot' + (narrow ? ' narrow' : '')}>
        <button type="button" onClick={() => setBig(true)} title="Click to enlarge"><img src={`/img/help/${src}`} alt={alt} loading="lazy" /></button>
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
      {big && <div className="lightbox" onClick={() => setBig(false)}><img src={`/img/help/${src}`} alt={alt} style={{ maxWidth: '96vw', maxHeight: '90vh', borderRadius: 8 }} /><div className="lb-cap">{caption || alt} · click anywhere to close</div></div>}
    </>
  );
}
const Tip = ({ children }) => <div className="help-tip"><Icon n="check" width="15" /><div>{children}</div></div>;
const Warn = ({ children }) => <div className="help-tip warn"><Icon n="alert" width="15" /><div>{children}</div></div>;

const STATUS_HELP = {
  Open: 'Active investigation — the default for a new case.',
  'Pending Warrant': 'A warrant has been requested and you are waiting on the DOJ.',
  Suspended: 'On hold — no workable leads right now. Add a note explaining why.',
  'Referred to DA': 'The case has been handed to the District Attorney for charging.',
  'Cleared Arrest Warrant': 'The arrest warrant was approved and served or cleared.',
  'Apprehended - Awaiting Questioning': 'The suspect is in custody and hasn’t been interviewed yet.',
  'Apprehended - Pending Case Closure': 'The suspect is processed; the paperwork is being finished.',
  Closed: 'Signed off by a supervisor. Set automatically — you can’t pick it yourself.',
};

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
      id: 'first', icon: 'check', title: 'Your first day — quick start',
      body: <>
        <p>New to the system? Do these in order and you'll be up and running in ten minutes.</p>
        <ol className="help-steps">
          <li><b>Check your rank and units</b> below. If they're wrong, your Discord roles need updating — sign out and back in after they're fixed.</li>
          <li><b>Look around the <Link to="/">Dashboard</Link>.</b> It shows your cases and anything waiting on you.</li>
          <li><b>Open a case you've been added to</b> from <Link to="/cases?mine=1">My Assignments</Link>, and click through the sections on the left.</li>
          <li><b>Read <a href="#charges">Charges &amp; elements</a> and <a href="#evidence">Evidence</a></b> — these are what make a case hold up in court.</li>
          <li><b>When you're ready, open your own case</b> — see <a href="#open">Opening a case</a>.</li>
          <li><b>Stuck?</b> Ask your Lead Investigator, or send a question through <Link to="/feedback">Feedback</Link>.</li>
        </ol>
        <p>Your current rank: <b>{config.ranks[me.rank]}</b>{(me.units || []).length > 0 && <> · Units: <b>{me.units.map((u) => config.divisions.find((d) => d.id === u)?.short || u).join(', ')}</b></>}.</p>
      </>,
    },
    {
      id: 'start', icon: 'shield', title: 'Getting around',
      body: <>
        <p>You sign in with Discord. Your access comes from your Discord roles in the BCSO server — your rank and units update every time you sign in, so if you're promoted or join a unit, just sign out and back in.</p>
        <ul>
          <li><b>Dashboard</b> — your open cases, anything that needs attention, cases going inactive, and recent activity.</li>
          <li><b>Case Files</b> — every case in the Bureau. <b>My Assignments</b> shows only cases you're on.</li>
          <li><b>Search</b> (top bar) — finds cases by number, title, person or SSN.</li>
          <li><b>Moon / sun icon</b> (top right) — switches between dark and light mode. Your choice is remembered on that device; until you pick, it follows your device's setting.</li>
          <li><b>Bell icon</b> (top right) — your notifications. See <a href="#notifications">Notifications</a>.</li>
        </ul>
        <Shot src="dashboard.jpg" alt="The dashboard" caption="The dashboard: your stats along the top, items needing attention, your active cases, and Bureau activity." />
        <p>On a phone, tap <b>☰</b> (top left) to open the menu. Everything works on mobile, including downloading reports.</p>
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
          <li>Pick the unit (this sets the prefix, e.g. <span className="mono">HOM-2026-0053</span>) and give it a clear title — <i>what happened, where</i> (e.g. “Homicide — Grove Street shooting”).</li>
          <li>Fill in the incident date, time and location, and a first incident report. You can expand it later.</li>
          <li>Tick any other agencies involved and any detectives assisting you, then press <b>Open Case</b>.</li>
          <li>You become the <b>Lead Investigator</b>. You can add more detectives later from <b>Overview &amp; Incident</b> under <b>Assigned Investigators</b>.</li>
        </ol>
        <Shot src="open-case.jpg" alt="Open New Case form" caption="The Open New Case form. The case number is assigned automatically when you press Open Case." narrow />
        <p>Units get extra sections automatically (e.g. Crime Scene and Coroner for Major Crimes). Use <b>Add Section</b> at the bottom of the case menu for anything else — Surveillance, BOLOs, Informants, Operations, Financial, Vehicles, or your own custom section.</p>
      </>,
    },
    {
      id: 'sections', icon: 'layers', title: 'Filling out the case file',
      body: <>
        <Shot src="case-file.jpg" alt="A case file" caption="A case file. The header has the case number, lead, status and the Download Report button. The menu on the left switches between sections; the numbers show how many entries each has." />
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
        <h4 className="help-h">Case statuses</h4>
        <p>Change the status from the drop-down in the case header as the case moves along.</p>
        <table className="help-table"><tbody>
          {config.statuses.map((st) => <tr key={st}><th>{st}</th><td>{STATUS_HELP[st] || ''}</td></tr>)}
        </tbody></table>
      </>,
    },
    {
      id: 'persons', icon: 'users', title: 'Adding people to a case',
      body: <>
        <ol>
          <li>Open <b>Persons Involved</b> and press <b>Add Person</b>.</li>
          <li><b>Search first</b> by name, SSN or phone. If they're already in the directory, pick them — their history from other cases comes with them.</li>
          <li>Only if they aren't found, switch to <b>New profile</b> and fill in what you know.</li>
          <li>Choose their <b>role</b> (Suspect, Victim, Witness, Person of Interest, Complainant or Informant) and a short note on why they matter.</li>
        </ol>
        <Shot src="add-person.jpg" alt="Add Person to Case" caption="Search the directory first. The same person can be on many cases with different roles." narrow />
        <Tip>Put identifying details in <b>Physical Description</b> (height, build, tattoos, clothing). It helps other detectives recognise the person later.</Tip>
      </>,
    },
    {
      id: 'charges', icon: 'scale', title: 'Charges & elements',
      body: <>
        <p>Every charge is made up of <b>elements</b> — the facts you must prove for it to stick. The system lists them for you; your job is to show what evidence proves each one.</p>
        <ol>
          <li>Open <b>Charges &amp; Elements</b> → <b>Add Charge</b>, search the penal code, and pick the charge.</li>
          <li>Set the <b>Suspect</b> it applies to.</li>
          <li>For each element, use <b>+ Link evidence</b> to attach the evidence items that prove it, and <b>Explain how established</b> to write one or two sentences.</li>
          <li>Tick the circle when the element is proven. The bar shows how many are done.</li>
        </ol>
        <Shot src="charges.jpg" alt="Charges and elements" caption="A First Degree Murder charge with two of eight elements proven. Each element shows the kind of proof that usually establishes it." narrow />
        <Tip>Grey <i>Typical proof</i> hints show what usually proves an element (for example CCTV, DNA or a confession). Use them as a checklist of what to look for.</Tip>
        <Warn>A charge with unproven elements is the most common reason a supervisor returns a case. Prove every element, or remove the charge.</Warn>
      </>,
    },
    {
      id: 'evidence', icon: 'box', title: 'Evidence',
      body: <>
        <p>Every evidence item gets a number automatically — <span className="mono">ED-01</span>, <span className="mono">ED-02</span> and so on. You use these numbers to link evidence to charges, photos and warrants.</p>
        <Shot src="evidence.jpg" alt="Evidence log" caption="The evidence log. Each item records what it is, where it was found, who collected it and where it's stored." />
        <p><b>A good evidence entry answers:</b></p>
        <ul>
          <li><b>What</b> it is, in plain words (“Black 9mm pistol”, not just “gun”).</li>
          <li><b>Where</b> and <b>when</b> it was found, and <b>who</b> collected it.</li>
          <li><b>Where it's stored</b> (locker number) and any <b>lab or forensic result</b>.</li>
          <li><b>Why it matters</b> to the case.</li>
        </ul>
      </>,
    },
    {
      id: 'interviews', icon: 'mic', title: 'Interviews & statements',
      body: <>
        <p>In <b>Interviews &amp; Statements</b>, log every interview: who, when, where, who conducted it, and a summary of what was said.</p>
        <ul>
          <li>For <b>suspect interviews</b>, record whether Miranda rights were read and whether they waived or invoked them. This matters in court.</li>
          <li>Tick <b>Interview recorded</b> if there's a recording, and add the recording as a media link.</li>
          <li>Pick the subject from <b>Persons Involved</b> so the statement is linked to their profile.</li>
        </ul>
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
        <Shot src="media.jpg" alt="Media and attachments" caption="Media & Attachments, with two video links. The ED-02 tag connects the CCTV clip to its evidence entry." />
        <Tip>Use <b>Tag uploads to evidence</b> (or the evidence field on a link) so each photo or video is tied to its ED number in the report.</Tip>
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
        <Shot src="warrants.jpg" alt="Warrants" caption="A submitted arrest warrant. Download Warrant Packet creates the document for the DOJ." />
        <Tip>Write the <b>Statement of Probable Cause</b> in your own words and refer to evidence by number (“the pistol, ED-03, matches the casings, ED-01”).</Tip>
      </>,
    },
    {
      id: 'report', icon: 'download', title: 'Downloading the court report',
      body: <>
        <p>Press <b>Download Report</b> at the top of any case. You'll get a .docx with every section, the charges with their elements and supporting evidence, persons, timeline, media log and signatures.</p>
        <p><b>To use it in Google Docs:</b> upload the file to Google Drive, then right-click → <b>Open with → Google Docs</b>. The formatting carries over.</p>
        <Shot src="report-1.jpg" alt="First page of a case report" caption="The first page of a downloaded case report." narrow />
        <Tip>The report only contains what's in the case file. Before downloading for court, check the <b>Case Readiness</b> list in Review &amp; Closure.</Tip>
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
        <Shot src="closure.jpg" alt="Review and closure" caption="Case Readiness lists anything still missing. Choose a disposition, write the closing summary, tick the declaration and sign." />
        <p className="small muted">Trainees can't sign for closure — the Lead Investigator must sign.</p>
      </>,
    },
    {
      id: 'transfer', icon: 'users', title: 'Transferring & classifying a case',
      body: <>
        <p><b>Transfer</b> (Lead Investigator or command): press <b>Transfer</b> at the top of the case, pick the new lead and, if needed, a new unit, and give a reason. You can choose to stay on as an Assistant. The transfer is recorded in the case's Transfer History and the new lead is notified.</p>
        <Shot src="transfer.jpg" alt="Transfer case" caption="Transferring a case: pick the new lead, optionally a new unit, and give a reason." narrow />
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
        <Shot src="bell.jpg" alt="Notifications" caption="Notifications from the bell icon. Unread ones are highlighted." narrow />
        <p className="small muted">You aren't notified about your own actions. Click a notification to jump to the case. Nothing is sent to Discord.</p>
      </>,
    },
    {
      id: 'feedback', icon: 'note', title: 'Feedback & problems',
      body: <p>Have an idea, found a bug, or not sure how to do something? Open <Link to="/feedback">Feedback</Link> in the sidebar and send a suggestion, problem or question. It goes straight to Bureau command, and you'll get a notification when they update or reply to it.</p>,
    },
    {
      id: 'inactive', icon: 'clock', title: 'Inactive cases',
      body: <p>If an open case has no activity for <b>14 days</b>, it's flagged on the dashboard and shows an inactivity notice on the case. Any update clears it — add a detective note, log evidence, or change something on the case. If the case is genuinely on hold, set it to <b>Suspended</b> and add a note explaining why, so command can see it isn't forgotten.</p>,
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
      id: 'tips', icon: 'pen', title: 'Tips for a strong case file',
      body: <ul>
        <li><b>Write as you go.</b> Log evidence and interviews the same day — details fade fast.</li>
        <li><b>Facts, not opinions.</b> “The witness said she saw a blue Sultan”, not “the suspect obviously did it.”</li>
        <li><b>Use evidence numbers everywhere.</b> Link ED numbers to elements, photos and warrants so the report connects everything.</li>
        <li><b>Keep the timeline up to date.</b> A clear order of events makes the report easy for the DA to follow.</li>
        <li><b>Search before you create.</b> Check the Persons and Vehicle directories first so records aren't duplicated.</li>
        <li><b>Keep the status current.</b> Command uses it to see where every case stands.</li>
        <li><b>Download the report before submitting</b> and read it through once — it's what the DA will see.</li>
      </ul>,
    },
    {
      id: 'glossary', icon: 'book', title: 'Glossary',
      body: <dl className="help-faq">
        <dt>Lead Investigator</dt><dd>The detective responsible for the case. Usually whoever opened it; can be changed by transfer.</dd>
        <dt>Assistant</dt><dd>Another detective added to the case. Can edit everything but can't transfer or classify it.</dd>
        <dt>Element</dt><dd>One fact that must be proven for a charge (for example “the victim is dead”).</dd>
        <dt>ED number</dt><dd>Evidence ID — ED-01, ED-02… — assigned automatically to each evidence item.</dd>
        <dt>Disposition</dt><dd>How the case ended, chosen at closure (for example Cleared by Arrest, or Unfounded).</dd>
        <dt>Classified</dt><dd>A case locked to certain units by its Lead Investigator. Others can't open it.</dd>
        <dt>Warrant packet</dt><dd>The formatted document you download from a warrant and submit to the DOJ.</dd>
      </dl>,
    },
    {
      id: 'faq', icon: 'help', title: 'Common questions',
      body: <dl className="help-faq">
        <dt>I can't edit a case.</dt><dd>You need to be added to it by the Lead Investigator. Closed cases and cases waiting for sign-off are locked for everyone.</dd>
        <dt>My rank or unit is wrong.</dt><dd>Sign out and back in to refresh your Discord roles. If it's still wrong, your Discord roles need updating.</dd>
        <dt>A video won't upload.</dt><dd>Videos must be added as links — see <a href="#media">Photos & videos</a>.</dd>
        <dt>The report looks wrong in Google Docs.</dt><dd>Make sure you open it with <b>Open with → Google Docs</b> from Drive rather than copy-pasting the text.</dd>
        <dt>I see an “Unauthorized” page.</dt><dd>Your Detective Bureau role is missing in Discord or command removed your access. Contact a supervisor.</dd>
        <dt>I added someone by mistake / deleted something.</dt><dd>Remove the entry and add it again. Every change is in the case's activity log, so nothing is lost silently. If it's serious, ask command.</dd>
        <dt>Someone already has a profile but with a different spelling.</dt><dd>Use the existing profile, and ask command to merge the duplicates if two exist.</dd>
        <dt>I'm a trainee — what can I do?</dt><dd>Work on any case you've been added to: add persons, evidence, interviews and notes. You can't open, lead or sign a case.</dd>
        <dt>Where do I report a bug?</dt><dd>Use <Link to="/feedback">Feedback</Link> → <b>Problem</b>, and say what you were doing and on which case or page.</dd>
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
