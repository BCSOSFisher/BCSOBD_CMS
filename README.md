# BCDB Case Management System

Investigation dashboard for the **Blaine County Detective Bureau**. Open and manage cases, log evidence with chain of custody, record interviews, map every charge's legal elements to evidence, track warrants, upload media, and export court-ready **Case Reports** and **Warrant Packets** as Word documents that import into Google Docs with formatting intact.

## Features

- **Discord sign-in.** Access and rank come from your Discord server roles: Department Administration, Bureau Lead, Bureau Co-Lead, Bureau Supervisor, Detective III, Detective II, Detective I or Application Accepted - Pending Training. Department Administration, Bureau Lead, Co-Lead and Supervisor all have command permissions (sign-off, reopen, delete, edit any case). Anyone without a Bureau role is refused.
- **Case files** are numbered `Case #53 | HOM-2026-0053`, with the prefix set by division (HOM, VCU, GNU, VICE, SOD).
- **Permissions.** Every detective can view every case. Only the case creator, the people they add, and supervisors can edit.
- **Statuses:** Open, Pending Warrant, Suspended, Referred to DA, Cleared Arrest Warrant, Apprehended - Awaiting Questioning, Apprehended - Pending Case Closure, Closed.
- **Sections** every case has:
  - Overview & Incident Report
  - Persons Involved
  - Charges & Elements
  - Evidence Log (ED-01, ED-02…) with chain of custody
  - Interviews & Statements (Miranda, recording, Q&A)
  - Detective Notes
  - Timeline
  - Warrants
  - Media & Attachments
  - Linked Cases
  - Review & Closure
- **Optional sections** a detective can add to a case:
  - Scene Observations
  - Coroner Summary
  - Vehicles
  - BOLOs
  - Surveillance Log
  - Confidential Informants
  - Operations Plan
  - Financial / Assets
  - Custom sections with any title
- **Penal code.** All 262 charges from docs.sadrp.net are built in. Each charge comes with an elements checklist; a detective ticks off each element and links the evidence (ED-##) that proves it. Elements can be edited or added per case.
- **Persons directory.** People are shared across cases, so a person's profile shows every case they appear in.
- **Download Report.** Produces a formatted Word document with:
  - Case information and the incident report
  - Charges with an element-by-element proof table
  - Persons, the evidence log and chain of custody
  - Scene and coroner sections, statements and interviews
  - Warrants, timeline, notes and related cases
  - Actions taken, the media index and a photo appendix
  - The sworn declaration and signature blocks
- **Download Warrant Packet.** Produces a DOJ-ready document with the probable cause statement, alleged offenses and their elements, supporting evidence, the subject profile, photo exhibits and the affiant declaration.
- **Supervisor sign-off.** The detective signs the declaration and submits the case, which locks it. A Bureau Lead, Co-Lead or Supervisor then signs to close it, or returns it with a reason.
- **Audit trail** of every change, recorded per case.

---

## 1. Create the Discord application (about 5 minutes)

1. Go to <https://discord.com/developers/applications> and click **New Application**. Name it "BCDB Case Management".
2. Open **OAuth2** in the left menu.
   - Copy the **Client ID** and **Client Secret**. Click **Reset Secret** if no secret is shown.
   - Under **Redirects**, add `https://YOUR-DOMAIN/auth/discord/callback`. You'll get the domain in step 3; you can come back and add it then.
3. You do **not** need to create a bot or invite anything to your server. The app reads only the signed-in user's own roles.
4. In the Discord client, turn on **User Settings → Advanced → Developer Mode**. Then:
   - Right-click your department server icon → **Copy Server ID**. This is `DISCORD_GUILD_ID`.
   - Go to **Server Settings → Roles**, right-click each role → **Copy Role ID**. Copy the IDs for:
     - Department Administration (Sheriff, Undersheriff, etc.) → `ROLE_ADMIN` — top rank with full command powers; list several role IDs separated by commas
     - Bureau Lead → `ROLE_BUREAU_LEAD`
     - Bureau Co-Lead → `ROLE_CO_LEAD`
     - Bureau Supervisor → `ROLE_SUPERVISOR`
     - Detective III → `ROLE_LEAD`
     - Detective II → `ROLE_DET2`
     - Detective I → `ROLE_DET1`
     - Application Accepted - Pending Training → `ROLE_TRAINEE` (can work cases they're added to, but can't open cases, be lead, or sign for closure)
     - Base Detective Bureau role → `ROLE_BASE` — people with only this role (no rank role) get **view-only** access: they can read non-classified cases, persons and the penal code, but can't change anything or be added to cases
   - If several roles should map to one rank, separate their IDs with commas.
   - Optional unit roles: `UNIT_ROLE_HOM`, `UNIT_ROLE_GNU`, `UNIT_ROLE_VICE` (and `UNIT_ROLE_VCU`, `UNIT_ROLE_SOD` if you add those roles). Units appear on the roster and pre-select the division when a detective opens a new case.

## 2. Deploy (Railway, about 10 minutes, roughly $5/month)

Any Node.js host with a persistent disk works. These steps are for [Railway](https://railway.com):

1. Sign in with GitHub → **New Project → Deploy from GitHub repo** → pick this repository.
2. Open the service → **Settings → Networking → Generate Domain**. Note the URL, for example `bcdb-cms.up.railway.app`.
3. In the service, open **Volumes** (or right-click the service → **Attach Volume**) and set the mount path to `/data`. The database and uploaded media are stored here, so **don't skip this step** or data is lost on every redeploy.
4. Open **Variables** and add each item from `.env.example`:

   | Variable | Value |
   |---|---|
   | `DISCORD_CLIENT_ID` | from step 1 |
   | `DISCORD_CLIENT_SECRET` | from step 1 |
   | `DISCORD_REDIRECT_URI` | `https://<your-domain>/auth/discord/callback` |
   | `DISCORD_GUILD_ID` | server ID |
   | `ROLE_ADMIN`, `ROLE_BUREAU_LEAD`, `ROLE_CO_LEAD`, `ROLE_SUPERVISOR`, `ROLE_LEAD`, `ROLE_DET2`, `ROLE_DET1`, `ROLE_TRAINEE`, `ROLE_BASE` | role IDs |
   | `SESSION_SECRET` | any long random string (40+ characters) |
   | `DATA_DIR` | `/data` |
   | `CASE_NUMBER_START` | the next case number you want, e.g. `54` |
   | `NODE_ENV` | `production` |

5. Go back to the Discord app's **OAuth2 → Redirects** and make sure the exact same callback URL is listed there.
6. Redeploy and open the domain. Everyone signs in with **Sign in with Discord**.

Railway runs `npm install`, `npm run build` and `npm start` automatically. The app needs **Node 22.13 or newer**; `package.json` already declares this.

## 3. Using the reports in Google Docs

1. Click **Download Report** (or **Download Warrant Packet** on a warrant).
2. Upload the `.docx` to Google Drive.
3. Right-click it → **Open with → Google Docs**. Tables, shading, header, page numbers and photos carry over.
4. To have uploads always convert automatically, turn on Drive **Settings → Convert uploads to Google Docs editor format**.

## Running locally (for testing)

```bash
npm install
npm run build
DEV_LOGIN=true node server/index.js
```

Open <http://localhost:3000>. `DEV_LOGIN=true` adds a test sign-in box to the login page so you can try every rank without Discord. **Never set `DEV_LOGIN` on the live site.** The server refuses to start if it's enabled while `NODE_ENV=production`.

## Hand-written charge elements

`shared/charge-elements.json` holds hand-written elements (with "typical proof" hints) for the Bureau's priority charges: homicide, drug trafficking/sale/manufacturing, kidnapping/hostage/unlawful imprisonment, and firearms smuggling/manufacturing/sale. They replace the auto-generated checklists and survive penal code updates. Charges marked **✓ Elements** in the picker use them. Cases that already had one of these charges show a **Use updated elements** button.

## Inactive case warning

An open case with no activity for more than 14 days shows a warning on its Overview page with the date and person of the last activity. Downloading reports doesn't count as activity.

## Vehicle Directory

Records → Vehicle Directory holds one record per vehicle (plate, make/model, color, VIN, registered owner, flags, notes). A case's **Vehicles** section links vehicles from the directory with a per-case status (Of Interest, Suspect Vehicle, BOLO Issued, Impounded…), so each vehicle's page shows its full case history and owners' profiles list their vehicles. The vehicle's gang link follows the same rule as people: Gang & Narcotics sees and sets it; others see the gang name only.

## Case Transfers

The Lead Investigator (or command) can **Transfer** a case to a new lead, optionally in another unit, with a required reason. The previous lead can stay on as an assistant or come off the case. Every transfer is kept in the case's Transfer History and printed in the report. The case number and code don't change.

## Gangs & Organizations

A registry of **Recognized** and **Suspected** gangs (menu: Records → Gangs & Organizations). Each gang has members with a **suspected rank** and Confirmed/Suspected membership, **businesses** (legal fronts and illegal operations), **affiliations** with other gangs (ally, rival, supplier…), an intelligence profile, and automatically linked cases. Setting **Gang Affiliation** on a person's profile adds them to that gang's member list; their gang and rank also appear on case person cards and in the downloaded report. The registry is **visible only to Gang & Narcotics Unit members and command** (based on the `UNIT_ROLE_GNU` Discord role at sign-in). Everyone else can see only **which gang** a person is in (the name) on profiles, the directory, case cards and reports — not their rank, membership confidence, or anything in the registry. They don't get the Gangs menu item or the Gang Affiliation dropdown. Starts with Cartel De Jaurez (CDJ, recognized), Angels of Death MC and Callaghan Crime Group (suspected).

The **Link Chart** tab (Gang & Narcotics and command only) draws an interactive map of gangs, members (with ranks), businesses, vehicles and cases, and the rival/ally/supplier links between gangs. Filter to one gang, hide types, hover to highlight connections, drag, zoom, and click any item to open it. Classified cases appear masked.

## Dashboard

- **Needs Your Attention** lists what's waiting on you: your inactive cases, cases returned by a supervisor, draft warrants, and charge elements not yet established.
- **Inactive Cases** (14+ days without activity): detectives see their own; command sees every case.
- **Detective Workload** is shown to command only.
- **Recent Activity** shows the latest 5 items; click **Show more** for 15.
- **Security Alerts** has its own page under **Supervisor** in the menu (command only): denied sign-ins, blocked classified access and roster changes, with search, type and date filters. Paste a reference code from the Unauthorized screen to find that attempt.
- **Unit filter** narrows the dashboard to one unit (remembered per browser). Stat boxes are clickable.
- **Pending Training** members get a simplified dashboard.
- The dashboard **refreshes itself** every minute, and immediately when you return to the tab.

## Classified cases

The **Lead Investigator** (only) can click **Classify** on a case and choose which units may access it. A classified case can be opened by: members of those units (from their Discord unit roles), investigators assigned to the case, and Bureau command. Everyone else sees it as **CLASSIFIED** in lists with no details; it never appears in their searches, and its files, report and linked-case details are blocked. Blocked attempts are logged. The downloaded report is marked **CLASSIFIED — RESTRICTED ACCESS**. The lead can change the units or remove the classification at any time.

## Removing personnel

- **Automatic:** when someone who lost their Bureau role (or left the Discord server) tries to sign in, they're refused and moved to **Removed Personnel** on the roster. If their role is given back, they're restored automatically on their next sign-in.
- **Manual:** Bureau Lead, Co-Lead and Supervisors can click **Remove** on the roster. The person is signed out immediately and stays blocked even if they still hold a Discord role, until command clicks **Restore**. Command can't remove themselves or someone who outranks them.
- Removed people stay on their past cases, notes and signatures for the record, but can't be added to new cases.

## Updating the penal code

The penal code is stored in `shared/penal-code.json`. When docs.sadrp.net changes:

```bash
npm run update-penal-code
```

Then commit and redeploy. This needs Python 3. Charges already added to cases keep the wording they had when they were added.

## Changing divisions, agencies, statuses or sections

Edit `shared/config.json`. You can change division names and prefixes, outside agencies, statuses, evidence types, warrant types, and the default sections for each division. Redeploy after editing.

## Upload limits

- **500 MB per file.** Larger files are refused before they upload.
- **15 photos per case.** A counter in each case's Media section shows how many are used; delete a photo to make room. Other uploaded files (PDFs, documents, audio) don't count.
- **Videos are links only.** Video files can't be uploaded; detectives post them to YouTube, Streamable, Medal, etc. and use **Add Video / Media Link**, which requires a title describing what the video shows. Videos uploaded before this change stay viewable.
- **Media links are unlimited.** Use **Add Video / Media Link** for Medal, YouTube, Streamable, Google Drive and similar clips. Links appear in the Media section, on the evidence item they're tagged to, and as clickable links in the Case Report and Warrant Packet.

To change them, set `MAX_UPLOAD_MB` and `MAX_FILES_PER_CASE` in Railway's Variables. You can also add an overall cap across all cases with `MEDIA_LIMIT_MB` (unset by default). Person profile photos don't count toward the per-case limit.

## Backups

All data lives in `DATA_DIR`: `bcdb.sqlite` plus an `uploads/` folder. Back up that folder; on Railway, volume backups are under the volume's settings.
