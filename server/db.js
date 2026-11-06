// SQLite storage (Node's built-in node:sqlite — no native build step needed).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'bcdb.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  username TEXT, display_name TEXT, avatar TEXT,
  rank TEXT NOT NULL,             -- bureau_lead | co_lead | supervisor | lead | det2 | det1
  callsign TEXT,
  last_login TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  division TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  priority TEXT DEFAULT 'Standard',
  created_by INTEGER REFERENCES users(id),
  lead_id INTEGER REFERENCES users(id),
  opened_at TEXT,
  incident_date TEXT, incident_time TEXT, incident_tz TEXT, location TEXT,
  bureau_units TEXT DEFAULT '[]', other_agencies TEXT DEFAULT '[]',
  summary TEXT DEFAULT '',
  scene TEXT DEFAULT '{}', coroner TEXT DEFAULT '{}',
  sections TEXT DEFAULT '[]',
  closure TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS case_members (
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'Assistant',
  PRIMARY KEY (case_id, user_id)
);
CREATE TABLE IF NOT EXISTS persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, ssn TEXT, dob TEXT, gender TEXT, phone TEXT, address TEXT,
  description TEXT, background TEXT, affiliations TEXT, flags TEXT DEFAULT '[]',
  photo_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS case_persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES persons(id),
  role TEXT NOT NULL,          -- Suspect | Victim | Witness | Person of Interest | Informant | Complainant
  notes TEXT DEFAULT '',
  custody_status TEXT DEFAULT '',
  UNIQUE(case_id, person_id, role)
);
-- Generic per-case records: evidence, interview, note, timeline, warrant, bolo, vehicle, charge, custom, surveillance
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS items_case_kind ON items(case_id, kind);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  person_id INTEGER,
  stored_name TEXT NOT NULL, original_name TEXT, mime TEXT, size INTEGER,
  caption TEXT DEFAULT '', evidence_ref TEXT DEFAULT '', taken_at TEXT DEFAULT '',
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS case_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  b INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  reason TEXT DEFAULT '', created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER, user_id INTEGER, action TEXT, detail TEXT,
  at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
`);

const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

module.exports = { db, J, DATA_DIR, UPLOAD_DIR };
