import React from 'react';
import { Status, fmtDate, today, nowTime } from '../ui';

// Field-driven optional sections. Keys match config.optionalSections.
export const GENERIC = {
  bolos: {
    kind: 'bolo', title: 'BOLOs', sub: 'Be-on-the-lookout notices', icon: 'radio', addLabel: 'Issue BOLO',
    fields: [
      { k: 'type', label: 'BOLO Type', type: 'select', options: ['Person', 'Vehicle', 'Person & Vehicle', 'Property'] }, { k: 'subject', label: 'Subject / Vehicle' },
      { k: 'date', label: 'Issued Date', type: 'date' }, { k: 'time', label: 'Issued Time', type: 'time' },
      { k: 'issued_to', label: 'Issued To', ph: 'All units, LSPD, SAHP…' }, { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Cancelled', 'Located / Cleared'] },
      { k: 'description', label: 'Description & Reason', type: 'textarea', rows: 3 }, { k: 'caution', label: 'Officer Safety / Caution Notes', type: 'textarea', rows: 2 },
    ],
    display: { title: (d) => `${d.type || 'BOLO'}: ${d.subject || ''}`, badge: (d) => d.status && <span className={`pill ${d.status === 'Active' ? 'red' : 'gray'}`}>{d.status}</span>, defaults: () => ({ date: today(), time: nowTime(), status: 'Active' }) },
  },
  surveillance: {
    kind: 'surveillance', title: 'Surveillance Log', sub: 'Stakeouts & observations', icon: 'eye', addLabel: 'Log Surveillance',
    fields: [
      { k: 'date', label: 'Date', type: 'date' }, { k: 'time', label: 'Start Time', type: 'time' }, { k: 'end_time', label: 'End Time', type: 'time' },
      { k: 'location', label: 'Location' }, { k: 'target', label: 'Target (person / location)' }, { k: 'officers', label: 'Officers Present' },
      { k: 'observations', label: 'Observations', type: 'textarea', rows: 5 },
    ],
    display: { title: (d) => `${fmtDate(d.date)} ${d.time || ''} — ${d.location || ''}`, defaults: () => ({ date: today(), time: nowTime() }) },
  },
  informants: {
    kind: 'informant', title: 'Confidential Informants', sub: 'Use CI reference numbers only — never real names', icon: 'user', addLabel: 'Add CI Entry',
    fields: [
      { k: 'ci', label: 'CI Reference #', ph: 'CI-0042' }, { k: 'handler', label: 'Handler' },
      { k: 'reliability', label: 'Reliability', type: 'select', options: ['Proven reliable', 'Partially corroborated', 'Untested', 'Unreliable'] }, { k: 'date', label: 'Date of Contact', type: 'date' },
      { k: 'information', label: 'Information Provided', type: 'textarea', rows: 4 }, { k: 'corroboration', label: 'Corroboration', type: 'textarea', rows: 3 },
    ],
    display: { title: (d) => `${d.ci || 'CI'} — ${fmtDate(d.date)}`, badge: (d) => d.reliability && <span className="pill gray">{d.reliability}</span> },
  },
  operations: {
    kind: 'operation', title: 'Operations Plan', sub: 'Raids, warrant service & tactical operations', icon: 'target', addLabel: 'Add Operation',
    fields: [
      { k: 'title', label: 'Operation Name' }, { k: 'status', label: 'Status', type: 'select', options: ['Planning', 'Approved', 'Executed', 'Cancelled'] },
      { k: 'date', label: 'Date', type: 'date' }, { k: 'time', label: 'Time', type: 'time' },
      { k: 'location', label: 'Location' }, { k: 'personnel', label: 'Personnel / Units' },
      { k: 'plan', label: 'Plan & Objectives', type: 'textarea', rows: 5 }, { k: 'outcome', label: 'Outcome / Debrief', type: 'textarea', rows: 4 },
    ],
    display: { title: (d) => d.title || 'Operation', badge: (d) => d.status && <Status s={d.status} /> },
  },
  financial: {
    kind: 'financial', title: 'Financial / Assets', sub: 'Records, seizures & money trail', icon: 'dollar', addLabel: 'Add Record',
    fields: [
      { k: 'title', label: 'Item / Account' }, { k: 'source', label: 'Source', ph: 'Bank subpoena, seizure…' },
      { k: 'amount', label: 'Amount', ph: '$' }, { k: 'date', label: 'Date', type: 'date' },
      { k: 'details', label: 'Details', type: 'textarea', rows: 4 },
    ],
    display: { title: (d) => `${d.title || 'Record'}${d.amount ? ' — ' + d.amount : ''}` },
  },
};
