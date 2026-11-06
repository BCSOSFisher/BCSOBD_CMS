// Word (.docx) generation for the Case Report and Warrant Packet.
// Layout deliberately sticks to features Google Docs imports faithfully:
// fixed-width tables, cell shading, simple borders, inline images, header/footer text and page numbers.
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  ShadingType, ImageRun, Header, Footer, PageNumber, VerticalAlign, TableLayoutType, PageBreak,
} = require('docx');

const FONT = 'Arial';
const NAVY = '1B2A41';
const LABEL_FILL = 'E8EBF0';
const HEAD_FILL = '1B2A41';
const BORDER = 'A9B1BD';
const W = 10080; // content width in DXA (8.5in - 2 x 0.75in)
const BADGE = path.join(__dirname, '..', 'public', 'img', 'badge.png');

// ---------- primitives ----------
const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size || 19, bold: o.bold, italics: o.italics, color: o.color, allCaps: o.caps, break: o.break });
function para(text, o = {}) {
  const parts = Array.isArray(text) ? text : String(text ?? '').split('\n');
  const children = [];
  if (Array.isArray(text) && text[0] instanceof TextRun) children.push(...text);
  else parts.forEach((t, i) => children.push(run(t, { ...o, break: i ? 1 : 0 })));
  return new Paragraph({ children, alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60, ...(o.tight ? {} : { line: 264 }) }, keepNext: o.keepNext });
}
const blank = (after = 120) => new Paragraph({ children: [], spacing: { after } });
const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 4, color: BORDER } };
function cell(content, o = {}) {
  const children = Array.isArray(content) ? content : [para(content ?? '', { bold: o.bold, color: o.color, size: o.size, align: o.align, after: 0 })];
  return new TableCell({
    children, width: { size: o.w, type: WidthType.DXA }, columnSpan: o.span,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 }, verticalAlign: o.valign || VerticalAlign.TOP, borders: cellBorders,
  });
}
function table(rows, widths) {
  return new Table({ rows, width: { size: W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED });
}
// Navy bar section heading (one-cell table — survives Google Docs import)
function sectionHead(title, sub) {
  return [
    new Paragraph({
      children: [run(' ' + title.toUpperCase(), { bold: true, color: 'FFFFFF', size: 21 }), ...(sub ? [run('   ' + sub, { color: 'C9D3E3', size: 17 })] : [])],
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: HEAD_FILL },
      border: { top: { style: BorderStyle.SINGLE, size: 24, color: HEAD_FILL, space: 2 }, bottom: { style: BorderStyle.SINGLE, size: 24, color: HEAD_FILL, space: 2 } },
      spacing: { before: 280, after: 160 }, keepNext: true, keepLines: true,
    }),
  ];
}
function subHead(text) {
  return new Paragraph({ children: [run(text, { bold: true, color: NAVY, size: 20 })], spacing: { before: 140, after: 60 }, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 2 } } });
}
// Two-column label/value table like the bureau's template
function kv(rows, labelW = 3000) {
  const r = rows.filter(Boolean).map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, { w: labelW, fill: LABEL_FILL, bold: true }), cell(v === '' || v == null ? 'N/A' : v, { w: W - labelW })] }));
  return table(r, [labelW, W - labelW]);
}
function grid(head, rows, widths) {
  const hr = new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, { w: widths[i], fill: LABEL_FILL, bold: true })) });
  const body = rows.length ? rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v === '' || v == null ? '—' : v, { w: widths[i] })) }))
    : [new TableRow({ children: [cell('None recorded.', { w: W, span: widths.length, color: '666666' })] })];
  return table([hr, ...body], widths);
}

// ---------- formatting helpers ----------
const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDT = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
};
const dt = (date, time, tz) => [fmtDate(date), time, tz].filter(Boolean).join(' ');
const yn = (b) => (b ? 'Yes' : 'No');

function imageSize(buf) {
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), type: 'jpg' };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.slice(0, 3).toString() === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), type: 'gif' };
  return null;
}
function imageRun(file, maxW = 560, maxH = 340) {
  try {
    const buf = fs.readFileSync(file);
    const s = imageSize(buf); if (!s) return null;
    const k = Math.min(1, maxW / s.w, maxH / s.h);
    return new ImageRun({ type: s.type, data: buf, transformation: { width: Math.round(s.w * k), height: Math.round(s.h * k) } });
  } catch { return null; }
}

function pageHeader(config, c, docTitle) {
  const badge = imageRun(BADGE, 48, 60);
  return new Header({ children: [
    table([new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ children: badge ? [badge] : [] })], width: { size: 900, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER }),
      new TableCell({ children: [
        para(config.orgName.toUpperCase(), { bold: true, size: 20, color: NAVY, after: 0 }),
        para(docTitle, { size: 16, color: '555555', after: 0 }),
      ], width: { size: 5580, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER }),
      new TableCell({ children: [
        para(`Case #${c.number}  |  ${c.code}`, { bold: true, size: 18, color: NAVY, align: AlignmentType.RIGHT, after: 0 }),
        para('LAW ENFORCEMENT SENSITIVE', { size: 14, color: '9B1C1C', bold: true, align: AlignmentType.RIGHT, after: 0 }),
      ], width: { size: 3600, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER }),
    ] })], [900, 5580, 3600]),
    new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 1 } }, spacing: { after: 120 } }),
  ] });
}
const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
function pageFooter(c, generatedBy) {
  return new Footer({ children: [
    new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 4 } }, alignment: AlignmentType.CENTER, spacing: { after: 0 },
      children: [run(`${c.code}  •  Generated ${fmtDT(new Date().toISOString())} by ${generatedBy}  •  Page `, { size: 15, color: '666666' }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: '666666' }),
        run(' of ', { size: 15, color: '666666' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: '666666' })] }),
    para('This document contains information compiled for criminal investigative and judicial purposes. Unauthorized disclosure is prohibited.', { size: 13, color: '888888', align: AlignmentType.CENTER, after: 0 }),
  ] });
}

// ---------- data shaping ----------
function shape(bundle, config) {
  const c = bundle.case;
  const by = (k) => bundle.items.filter((i) => i.kind === k);
  const evidence = by('evidence');
  const edById = Object.fromEntries(evidence.map((e) => [e.id, e.data.ed]));
  const personById = Object.fromEntries(bundle.persons.map((p) => [p.id, p]));
  const role = (r) => bundle.persons.filter((p) => p.case_role === r);
  const division = config.divisions.find((d) => d.id === c.division);
  return { c, by, evidence, edById, personById, role, division };
}
const rankName = (config, r) => config.ranks[r] || r || '';

function personBlock(p, label) {
  return [subHead(`${label} Profile — ${p.name}`), kv([
    ['Name & SSN:', [p.name, p.ssn].filter(Boolean).join('  |  ')],
    ['Date of Birth:', fmtDate(p.dob)],
    ['Gender:', p.gender], p.phone ? ['Phone:', p.phone] : null,
    ['Address (If Known):', p.address],
    p.description ? ['Physical Description:', p.description] : null,
    p.affiliations ? ['Known Affiliations:', p.affiliations] : null,
    ['Background:', p.background],
    p.custody_status ? ['Custody Status:', p.custody_status] : null,
    p.case_notes ? ['Relevance to Case:', p.case_notes] : null,
  ]), blank(80)];
}

function chargesSection(S, penalCode) {
  const out = [];
  const charges = S.by('charge');
  if (!charges.length) return [para('No charges have been recorded for this investigation.', { italics: true, color: '666666' })];
  // summary table
  out.push(grid(['#', 'Charge', 'Class', 'Suspect', 'Counts', 'Elements Met'], charges.map((ch, i) => {
    const d = ch.data; const els = d.elements || []; const met = els.filter((e) => e.met).length;
    return [`[${i + 1}]`, `${d.code} — ${d.name}`, d.classification, S.personById[d.suspect_person_id]?.name || 'Unassigned', String(d.counts || 1), `${met} of ${els.length}`];
  }), [520, 3440, 1500, 1920, 900, 1800]));
  charges.forEach((ch, i) => {
    const d = ch.data; const pc = penalCode.find((p) => p.code === d.code) || {};
    out.push(subHead(`Charge [${i + 1}]: ${d.code} — ${d.name}`));
    out.push(kv([
      ['Suspect:', S.personById[d.suspect_person_id]?.name || 'Unassigned'],
      ['Classification:', d.classification],
      ['Penalty (per Penal Code):', [pc.sentence && `Sentence: ${pc.sentence}`, pc.fine && `Fine: ${pc.fine}`].filter(Boolean).join('   ') || 'See statute'],
      ['Counts:', String(d.counts || 1)],
      ['Statutory Definition:', d.definition || pc.definition],
      d.enhancement ? ['Enhancement Applied:', d.enhancement] : null,
      d.charge_notes ? ['Charging Notes:', d.charge_notes] : null,
    ]));
    out.push(blank(60));
    const els = d.elements || [];
    out.push(grid(['#', 'Required Element', 'Status', 'Supporting Evidence', 'How Element Is Established'], els.map((e, k) => [
      String(k + 1), e.text, e.met ? 'Established' : 'Outstanding',
      (e.evidence || []).map((id) => S.edById[id]).filter(Boolean).join(', '), e.notes || '',
    ]), [450, 3350, 1400, 1550, 3330]));
    const missing = els.filter((e) => !e.met).length;
    out.push(para(missing ? `${missing} element(s) remain outstanding for this charge.` : 'All required elements for this charge are established by the evidence referenced above.',
      { italics: true, size: 17, color: missing ? '9B1C1C' : '1E6B3A', before: 60, after: 120 }));
  });
  return out;
}

function evidenceSection(S) {
  const out = [grid(['Evidence ID', 'Description', 'Type', 'Collected / Located', 'Storage'], S.evidence.map((e) => {
    const d = e.data;
    return [d.ed, [d.title, d.description].filter(Boolean).join(' — '), d.type, [dt(d.collected_date, d.collected_time), d.collected_by, d.location].filter(Boolean).join('\n'), d.storage || ''];
  }), [1250, 4150, 1300, 2100, 1280])];
  const withCustody = S.evidence.filter((e) => (e.data.custody || []).length);
  if (withCustody.length) {
    out.push(subHead('Chain of Custody'));
    withCustody.forEach((e) => {
      out.push(para(`${e.data.ed} — ${e.data.title || ''}`, { bold: true, size: 18, before: 80 }));
      out.push(grid(['Date / Time', 'Released By', 'Received By', 'Purpose / Location'], e.data.custody.map((x) => [dt(x.date, x.time), x.from, x.to, x.purpose]), [2100, 2400, 2400, 3180]));
    });
  }
  return out;
}

function interviewBlocks(list, S, title) {
  const out = [];
  list.forEach((iv) => {
    const d = iv.data; const p = S.personById[d.person_id];
    out.push(subHead(`${title} — ${p?.name || d.subject || 'Unknown'}`));
    const isSuspect = d.type === 'Suspect Interview';
    out.push(kv([
      ['Name & SSN:', p ? [p.name, p.ssn].filter(Boolean).join('  |  ') : d.subject],
      ['Date of Birth:', fmtDate(p?.dob)], ['Address (If Known):', p?.address],
      ['Date / Time:', dt(d.date, d.time, d.tz)], ['Location:', d.location],
      ['Conducted By:', d.conducted_by],
      isSuspect || d.miranda ? ['Miranda Rights Read:', yn(d.miranda)] : null,
      isSuspect || d.miranda ? ['Miranda Waiver:', d.waiver || 'N/A'] : null,
      ['Interview Recorded:', yn(d.recorded)],
      d.counsel ? ['Counsel Present:', d.counsel] : null,
      d.summary ? ['Summary:', d.summary] : null,
    ]));
    const qa = (d.qa || []).filter((x) => x.q || x.a);
    if (qa.length) {
      out.push(blank(40));
      out.push(table(qa.map((x) => new TableRow({ cantSplit: true, children: [cell([
        para([run('Q: ', { bold: true, color: NAVY }), run(`“${x.q}”`, { bold: true })], { after: 30 }),
        para([run('A: ', { bold: true, color: NAVY }), run(x.a)], { after: 0 }),
      ], { w: W })] })), [W]));
    }
    if (d.statement) { out.push(blank(40)); out.push(kv([['Statement:', d.statement]])); }
    out.push(blank(80));
  });
  return out;
}

function timelineRows(bundle, S) {
  const ev = [];
  const c = bundle.case;
  if (c.incident_date) ev.push({ when: `${c.incident_date} ${c.incident_time || ''}`, what: 'Incident occurred', detail: c.location || '' });
  S.by('timeline').forEach((t) => ev.push({ when: `${t.data.date || ''} ${t.data.time || ''}`, what: t.data.title, detail: t.data.description || '' }));
  S.evidence.forEach((e) => e.data.collected_date && ev.push({ when: `${e.data.collected_date} ${e.data.collected_time || ''}`, what: `${e.data.ed} collected`, detail: e.data.title || '' }));
  S.by('interview').forEach((i) => i.data.date && ev.push({ when: `${i.data.date} ${i.data.time || ''}`, what: i.data.type || 'Interview', detail: S.personById[i.data.person_id]?.name || '' }));
  S.by('warrant').forEach((w) => w.data.submitted_date && ev.push({ when: `${w.data.submitted_date}`, what: `${w.data.type} submitted to DOJ`, detail: w.data.status || '' }));
  return ev.sort((a, b) => a.when.localeCompare(b.when)).map((e) => [[fmtDate(e.when.trim().slice(0, 10)), e.when.trim().slice(11)].filter(Boolean).join('  '), e.what, e.detail]);
}

function freeformItems(items, fields) {
  return items.map((it) => kv(fields.map(([label, key]) => [label, typeof key === 'function' ? key(it.data) : it.data[key]]))).flatMap((t) => [t, blank(80)]);
}

function photoAppendix(bundle, uploadDir) {
  const out = [];
  const imgs = bundle.files.filter((f) => /^image\/(png|jpe?g|gif)$/.test(f.mime || '')).slice(0, 40);
  imgs.forEach((f, i) => {
    const r = imageRun(path.join(uploadDir, f.stored_name));
    if (!r) return;
    out.push(new Paragraph({ children: [r], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 }, keepNext: true }));
    out.push(para(`Figure ${i + 1}${f.evidence_ref ? ` (${f.evidence_ref})` : ''}: ${f.caption || f.original_name}`, { italics: true, size: 16, align: AlignmentType.CENTER, color: '444444', after: 160 }));
  });
  return out;
}

function signatureBlock(bundle, config) {
  const c = bundle.case; const cl = c.closure || {};
  const ds = cl.detective_sig; const ss = cl.supervisor_sig;
  const leadName = ds?.name || bundle.lead?.display_name || '________________';
  return [
    blank(120),
    para(`I, Detective ${leadName}, declare that the information provided in this statement is true and accurate to the best of my knowledge and belief. I understand that knowingly providing false or misleading information may result in criminal charges.`, { bold: true, after: 160 }),
    kv([['Detective Name:', ds?.name || ''], ['Rank:', rankName(config, ds?.rank)], ['Detective Signature:', ds ? `/s/ ${ds.name}  (electronically signed)` : 'UNSIGNED'], ['Date:', ds ? fmtDT(ds.signed_at) : '']]),
    blank(160),
    para('Bureau Supervisor Review', { bold: true, size: 20, color: NAVY, after: 80 }),
    kv([['Supervisor Name:', ss?.name || ''], ['Supervisor Signature:', ss ? `/s/ ${ss.name}  (electronically signed)` : 'PENDING SUPERVISOR REVIEW'], ['Date:', ss ? fmtDT(ss.signed_at) : ''], ss?.comment ? ['Supervisor Comments:', ss.comment] : null]),
  ];
}

// ---------- CASE REPORT ----------
async function buildCaseReport(bundle, { config, penalCode, user, uploadDir }) {
  const S = shape(bundle, config); const c = S.c;
  const secOn = (k) => (c.sections || []).includes(k);
  const members = bundle.members;
  const assistants = members.filter((m) => m.id !== c.lead_id).map((m) => m.display_name).join(', ');
  const charges = S.by('charge');
  const body = [];
  let n = 0; const H = (t, sub) => body.push(...sectionHead(`${++n}. ${t}`, sub));

  // Title block
  body.push(para(S.division?.short?.toUpperCase() || 'INVESTIGATION', { bold: true, size: 16, color: '666666', after: 60, tight: true }));
  body.push(para(c.title, { bold: true, size: 36, color: NAVY, after: 40, tight: true }));
  body.push(para(`Investigative Case Report  •  Status: ${c.status}`, { size: 18, color: '555555', after: 160 }));

  H('Case Information');
  body.push(kv([
    ['Case Number:', `Case #${c.number}  |  ${c.code}`],
    ['Lead Investigator:', bundle.lead ? `${rankName(config, bundle.lead.rank)} ${bundle.lead.display_name}` : ''],
    ['Assistant(s):', assistants],
    ['Status:', c.status],
    ['Date Opened:', fmtDate(c.opened_at)],
    ['Division:', S.division?.name],
  ]));
  body.push(blank(80));
  body.push(kv([
    ['Detective Bureau Units Involved:', (c.bureau_units || []).join(', ')],
    ['Other Agencies Involved:', (c.other_agencies || []).join(', ') || 'N/A'],
    ['Charges Investigated:', charges.map((ch, i) => `[${i + 1}] ${ch.data.code} — ${ch.data.name}`).join('\n') || 'N/A'],
  ]));

  H('Incident Report', dt(c.incident_date, c.incident_time, c.incident_tz) ? `Date of Incident: ${dt(c.incident_date, c.incident_time, c.incident_tz)}` : '');
  body.push(kv([['Date of Incident:', dt(c.incident_date, c.incident_time, c.incident_tz)], ['Location:', c.location]]));
  body.push(blank(60));
  body.push(table([new TableRow({ children: [cell((c.summary || 'No narrative entered.').split(/\n{2,}/).map((p) => para(p, { after: 100 })), { w: W })] })], [W]));

  H('Charges & Legal Elements', 'Each element mapped to supporting evidence');
  body.push(...chargesSection(S, penalCode));

  H('Persons Involved');
  const order = ['Suspect', 'Victim', 'Witness', 'Person of Interest', 'Complainant', 'Informant'];
  let any = false;
  for (const r of order) for (const p of S.role(r)) { any = true; body.push(...personBlock(p, r)); }
  if (!any) body.push(para('No persons recorded.', { italics: true, color: '666666' }));

  H('Evidence Log');
  body.push(...evidenceSection(S));

  if (secOn('scene') || Object.values(c.scene || {}).some(Boolean)) {
    H('Scene Observations');
    const s = c.scene || {};
    body.push(kv([['Entry Points:', s.entry], ['Weapons:', s.weapons], ['Blood Evidence:', s.blood], ['Scene Condition:', s.condition], ['Other Details:', s.other]]));
  }
  if (secOn('coroner') || Object.values(c.coroner || {}).some(Boolean)) {
    H('Coroner Summary');
    const k = c.coroner || {};
    body.push(kv([['Decedent:', S.personById[k.person_id]?.name], ['Date / Time Examined:', k.examined], ['Estimated Date / Time of Death:', k.tod], ['Cause of Death:', k.cause], ['Toxicology Report:', k.tox], ['Manner of Death:', k.manner], ['Additional Notes:', k.notes], ['Signed:', k.signed]]));
  }

  const ivs = S.by('interview');
  H('Statements & Interviews');
  const stmts = ivs.filter((i) => i.data.type !== 'Suspect Interview');
  const sus = ivs.filter((i) => i.data.type === 'Suspect Interview');
  if (!ivs.length) body.push(para('No interviews or statements recorded.', { italics: true, color: '666666' }));
  body.push(...interviewBlocks(stmts, S, 'Witness / Victim Statement'));
  body.push(...interviewBlocks(sus, S, 'Suspect Interview Notes'));

  const extra = [
    ['vehicles', 'vehicle', 'Vehicles of Interest', [['Plate:', 'plate'], ['Make / Model:', 'model'], ['Color:', 'color'], ['Registered Owner:', 'owner'], ['Relevance:', 'notes']]],
    ['bolos', 'bolo', 'BOLOs Issued', [['Subject:', 'subject'], ['Type:', 'type'], ['Issued:', (d) => dt(d.date, d.time)], ['Description:', 'description'], ['Status:', 'status']]],
    ['surveillance', 'surveillance', 'Surveillance Log', [['Date / Time:', (d) => dt(d.date, d.time) + (d.end_time ? ' – ' + d.end_time : '')], ['Location:', 'location'], ['Officers:', 'officers'], ['Target:', 'target'], ['Observations:', 'observations']]],
    ['informants', 'informant', 'Confidential Informant Information', [['CI Reference:', 'ci'], ['Handler:', 'handler'], ['Reliability:', 'reliability'], ['Date:', 'date'], ['Information Provided:', 'information'], ['Corroboration:', 'corroboration']]],
    ['operations', 'operation', 'Operations', [['Operation:', 'title'], ['Date / Time:', (d) => dt(d.date, d.time)], ['Location:', 'location'], ['Personnel:', 'personnel'], ['Plan:', 'plan'], ['Outcome / Debrief:', 'outcome']]],
    ['financial', 'financial', 'Financial Records & Assets', [['Item:', 'title'], ['Source:', 'source'], ['Amount:', 'amount'], ['Date:', 'date'], ['Details:', 'details']]],
  ];
  for (const [sec, kind, title, fields] of extra) {
    const items = S.by(kind);
    if (!secOn(sec) && !items.length) continue;
    H(title);
    body.push(...(items.length ? freeformItems(items, fields) : [para('None recorded.', { italics: true, color: '666666' })]));
  }
  for (const cs of S.by('custom')) {
    H(cs.data.title || 'Additional Information');
    body.push(table([new TableRow({ children: [cell((cs.data.body || '').split(/\n{2,}/).map((p) => para(p, { after: 100 })), { w: W })] })], [W]));
  }

  const warrants = S.by('warrant');
  H('Warrants');
  body.push(grid(['Type', 'Subject / Target', 'Status', 'Submitted', 'DOJ Ref.', 'Executed'], warrants.map((w) => {
    const d = w.data; return [d.type, [S.personById[d.person_id]?.name, d.target].filter(Boolean).join('\n'), d.status, fmtDate(d.submitted_date), d.doj_ref, d.executed_date ? fmtDate(d.executed_date) + (d.return_notes ? '\n' + d.return_notes : '') : ''];
  }), [2000, 2500, 1400, 1300, 1380, 1500]));

  H('Investigation Timeline');
  body.push(grid(['Date / Time', 'Event', 'Details'], timelineRows(bundle, S), [2100, 3200, 4780]));

  H('Detective Notes');
  const notes = S.by('note').sort((a, b) => (a.data.date || a.created_at).localeCompare(b.data.date || b.created_at));
  body.push(grid(['Date', 'Author', 'Note'], notes.map((x) => [fmtDate(x.data.date || x.created_at), x.data.author, x.data.text]), [1500, 1900, 6680]));

  if (bundle.links.length) {
    H('Related Cases');
    body.push(grid(['Case', 'Title', 'Status', 'Relationship'], bundle.links.map((l) => [`#${l.number} | ${l.code}`, l.title, l.status, l.reason]), [2300, 3600, 1700, 2480]));
  }

  H('Actions Taken');
  body.push(kv([
    ['Forensic Analysis:', yn(S.evidence.some((e) => /DNA|Fingerprint|Ballistic|Biological/.test(e.data.type || '') || e.data.lab_result))],
    ['Interviews Conducted:', yn(ivs.length)],
    ['Warrants Requested:', yn(warrants.length)],
    ['BOLO Implemented:', yn(S.by('bolo').length)],
    ['Media / Photographs Logged:', `${bundle.files.length} file(s)`],
  ]));

  if (bundle.files.length) {
    H('Media & Attachments Index');
    body.push(grid(['#', 'File', 'Evidence Ref.', 'Caption', 'Uploaded'], bundle.files.map((f, i) => [String(i + 1), f.original_name, f.evidence_ref, f.caption, fmtDate(f.created_at)]), [500, 3000, 1300, 3580, 1700]));
    const photos = photoAppendix(bundle, uploadDir);
    if (photos.length) { body.push(new Paragraph({ children: [new PageBreak()] })); body.push(...sectionHead('Photographic Evidence Appendix')); body.push(...photos); }
  }

  if (c.closure?.closing_summary || c.closure?.disposition) {
    H('Case Disposition');
    body.push(kv([['Disposition:', c.closure.disposition], ['Closing Summary:', c.closure.closing_summary]]));
  }
  H('Declaration & Signatures');
  body.push(...signatureBlock(bundle, config));

  return Packer.toBuffer(makeDoc(config, c, 'Investigative Case Report', body, user));
}

function makeDoc(config, c, title, children, user) {
  return new Document({
    creator: config.orgName, title: `${c.code} ${title}`, description: title,
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1000, left: 1080, right: 1080, header: 500, footer: 450 } } },
      headers: { default: pageHeader(config, c, title) },
      footers: { default: pageFooter(c, user.display_name) },
      children,
    }],
  });
}

// ---------- WARRANT PACKET ----------
async function buildWarrantPacket(bundle, warrant, { config, penalCode, user, uploadDir }) {
  const S = shape(bundle, config); const c = S.c; const d = warrant.data;
  const subject = S.personById[d.person_id];
  const body = [];
  let n = 0; const H = (t, sub) => body.push(...sectionHead(`${++n}. ${t}`, sub));
  body.push(para('WARRANT APPLICATION — SUPPORTING DOCUMENTATION', { bold: true, size: 16, color: '666666', after: 60, tight: true }));
  body.push(para(d.type || 'Warrant Request', { bold: true, size: 36, color: NAVY, after: 40, tight: true }));
  body.push(para(`Prepared for review by the Department of Justice  •  ${c.code}`, { size: 18, color: '555555', after: 160 }));

  H('Application Summary');
  body.push(kv([
    ['Warrant Type:', d.type],
    ['Related Case:', `Case #${c.number}  |  ${c.code} — ${c.title}`],
    ['Affiant (Requesting Detective):', d.affiant || (bundle.lead && `${rankName(config, bundle.lead.rank)} ${bundle.lead.display_name}`)],
    ['Subject:', subject ? [subject.name, subject.ssn].filter(Boolean).join('  |  ') : ''],
    ['Subject DOB:', fmtDate(subject?.dob)],
    ['Subject Address:', subject?.address],
    ['Place / Property to be Searched:', d.target],
    ['Items / Data to be Seized:', d.items_sought],
    ['Status:', d.status],
    ['Date Prepared:', fmtDate(d.prepared_date || new Date().toISOString())],
  ]));

  const chIds = d.charge_ids && d.charge_ids.length ? d.charge_ids : S.by('charge').filter((ch) => !d.person_id || ch.data.suspect_person_id === d.person_id).map((ch) => ch.id);
  const charges = S.by('charge').filter((ch) => chIds.includes(ch.id));
  H('Offenses Alleged');
  if (!charges.length) body.push(para('No charges linked.', { italics: true, color: '666666' }));
  charges.forEach((ch, i) => {
    const x = ch.data; const pc = penalCode.find((p) => p.code === x.code) || {};
    body.push(subHead(`[${i + 1}] ${x.code} — ${x.name} (${x.classification || ''})`));
    body.push(kv([['Statutory Definition:', x.definition || pc.definition], ['Penalty:', [pc.sentence && `Sentence: ${pc.sentence}`, pc.fine && `Fine: ${pc.fine}`].filter(Boolean).join('   ')]]));
    body.push(blank(40));
    body.push(grid(['#', 'Element', 'Status', 'Evidence', 'Basis'], (x.elements || []).map((e, k) => [String(k + 1), e.text, e.met ? 'Established' : 'Outstanding', (e.evidence || []).map((id) => S.edById[id]).filter(Boolean).join(', '), e.notes || '']), [450, 3600, 1250, 1500, 3280]));
  });

  H('Statement of Probable Cause');
  body.push(table([new TableRow({ children: [cell((d.pc_statement || 'No probable cause statement entered.').split(/\n{2,}/).map((p) => para(p, { after: 100 })), { w: W })] })], [W]));

  H('Incident Summary');
  body.push(kv([['Date of Incident:', dt(c.incident_date, c.incident_time, c.incident_tz)], ['Location:', c.location]]));
  body.push(blank(40));
  body.push(table([new TableRow({ children: [cell((c.summary || '').split(/\n{2,}/).map((p) => para(p, { after: 100 })), { w: W })] })], [W]));

  const evIds = d.evidence_ids && d.evidence_ids.length ? d.evidence_ids : S.evidence.map((e) => e.id);
  const ev = S.evidence.filter((e) => evIds.includes(e.id));
  H('Supporting Evidence');
  body.push(grid(['Evidence ID', 'Description', 'Type', 'Collected / Located'], ev.map((e) => [e.data.ed, [e.data.title, e.data.description].filter(Boolean).join(' — ') + (e.data.lab_result ? `\nResult: ${e.data.lab_result}` : ''), e.data.type, [dt(e.data.collected_date, e.data.collected_time), e.data.collected_by, e.data.location].filter(Boolean).join('\n')]), [1200, 5000, 1400, 2480]));

  if (subject) { H('Subject Profile'); body.push(...personBlock(subject, 'Subject')); }
  const ivs = S.by('interview').filter((i) => (d.interview_ids || []).includes(i.id));
  if (ivs.length) { H('Relevant Statements'); body.push(...interviewBlocks(ivs, S, 'Statement')); }

  const files = bundle.files.filter((f) => !d.evidence_ids?.length || ev.some((e) => e.data.ed === f.evidence_ref));
  if (files.length) {
    const photos = photoAppendix({ ...bundle, files }, uploadDir);
    if (photos.length) { H('Photographic Exhibits'); body.push(...photos); }
  }

  H('Affiant Declaration');
  const aff = d.affiant || bundle.lead?.display_name || '________________';
  body.push(para(`I, ${aff}, being duly sworn, declare that I am a detective of the ${config.orgName}; that the facts set forth in this application are true and correct to the best of my knowledge and belief; and that, based on the foregoing, probable cause exists to issue the requested ${(d.type || 'warrant').toLowerCase()}.`, { bold: true, after: 160 }));
  body.push(kv([['Affiant Name:', aff], ['Affiant Signature:', d.affiant_signed ? `/s/ ${aff}  (electronically signed)` : ''], ['Date:', d.affiant_signed ? fmtDT(d.affiant_signed) : '']]));
  body.push(blank(160));
  body.push(para('For DOJ / Judicial Use', { bold: true, size: 20, color: NAVY, after: 80 }));
  body.push(kv([['Decision:', '☐ Approved     ☐ Denied     ☐ Returned for more information'], ['Reviewing Official:', ''], ['Signature:', ''], ['Date:', '']]));

  return Packer.toBuffer(makeDoc(config, c, `${d.type || 'Warrant'} Application Packet`, body, user));
}

module.exports = { buildCaseReport, buildWarrantPacket };
