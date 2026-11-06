# BCDB Case Management System

Investigation dashboard for the **Blaine County Detective Bureau**. Open and manage cases, log evidence with chain of custody, record interviews, map every charge's legal elements to evidence, track warrants, upload media, and export court-ready **Case Reports** and **Warrant Packets** as Word documents that import into Google Docs with formatting intact.

## Features

- **Discord sign-in.** Access and rank come from your Discord server roles: Bureau Lead, Bureau Co-Lead, Bureau Supervisor, Detective III, Detective II or Detective I. Bureau Lead, Co-Lead and Supervisor all have command permissions (sign-off, reopen, delete, edit any case). Anyone without a Bureau role is refused.
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
     - Bureau Lead → `ROLE_BUREAU_LEAD`
     - Bureau Co-Lead → `ROLE_CO_LEAD`
     - Bureau Supervisor → `ROLE_SUPERVISOR`
     - Detective III → `ROLE_LEAD`
     - Detective II → `ROLE_DET2`
     - Detective I → `ROLE_DET1`
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
   | `ROLE_BUREAU_LEAD`, `ROLE_CO_LEAD`, `ROLE_SUPERVISOR`, `ROLE_LEAD`, `ROLE_DET2`, `ROLE_DET1` | role IDs |
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

## Updating the penal code

The penal code is stored in `shared/penal-code.json`. When docs.sadrp.net changes:

```bash
npm run update-penal-code
```

Then commit and redeploy. This needs Python 3. Charges already added to cases keep the wording they had when they were added.

## Changing divisions, agencies, statuses or sections

Edit `shared/config.json`. You can change division names and prefixes, outside agencies, statuses, evidence types, warrant types, and the default sections for each division. Redeploy after editing.

## Media storage limit

All uploaded media combined is capped at **500 MB** by default, so storage costs stay predictable. Each file can be up to 100 MB. A usage bar appears in every case's Media section, and uploads are refused once the cap is reached. To change the limits, set `MEDIA_LIMIT_MB` (total) and `MAX_UPLOAD_MB` (per file) in Railway's Variables.

## Backups

All data lives in `DATA_DIR`: `bcdb.sqlite` plus an `uploads/` folder. Back up that folder; on Railway, volume backups are under the volume's settings.
