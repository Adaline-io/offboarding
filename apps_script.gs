/**
 * ADALINE OFFBOARDING — Apps Script (standalone, readable columns)
 * -----------------------------------------------------------------
 * A dedicated script for the **Adaline Offboarding** Google Sheet.
 * One submission = ONE ROW, each field in its OWN labelled column —
 * readable, sortable, filterable. No raw JSON. Empty fields are
 * skipped. Same house style as the onboarding script.
 *
 * It also archives a formatted Google Doc per submission (grouped by
 * the form's sections) and emails the PDF to bettercall@myadaline.com.
 *
 * DEPLOY (one-time, ~2 min, on the Offboarding sheet):
 *   1. Open the "Adaline Offboarding" Sheet -> Extensions -> Apps Script
 *   2. Select all, delete, paste THIS file, Ctrl/Cmd+S
 *   3. Deploy -> New deployment -> type "Web app"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Deploy -> copy the /exec URL (that's the webhook to share)
 *   4. Put that /exec URL into the form's WEBHOOK_URL.
 *
 * REDEPLOY after edits: Deploy -> Manage deployments -> edit the active
 * Web app -> Version: "New version" -> Deploy (keeps the SAME /exec URL).
 */

// Tab inside the Offboarding sheet that rows are written to.
var SHEET_TAB     = 'Offboarding';
var NOTIFY_EMAIL  = 'bettercall@myadaline.com';
var DRIVE_FOLDER  = 'Adaline Offboarding Submissions';

// Columns that always come first.
var BASE_HEADERS = ['Submitted', 'Client', 'Project', 'Status', 'Doc'];

// Fixed column order: [Column header, section id, field name].
// Mirrors exactly what the offboarding form sends. Anything not listed
// here is collected into a single trailing "Other" column.
var SCHEMA = [
  // 01 · Delivery Receipt
  ['Design 1 — Kerala Doodle Art',  'delivery',    'recv_design_1'],
  ['Design 2 — Kerala Mural Comics','delivery',    'recv_design_2'],
  ['Design 3 — Pookalam Collage',   'delivery',    'recv_design_3'],
  ['Source Files Received',         'delivery',    'recv_sources'],
  ['Print + Web Exports Received',  'delivery',    'recv_exports'],
  ['Outstanding Items',             'delivery',    'outstanding'],

  // 02 · The Debrief
  ['NPS (0–10)',                    'debrief',     'nps_score'],
  ['Star Rating (1–5)',             'debrief',     'star_rating'],
  ['What We Got Right',             'debrief',     'got_right'],
  ['What Could Be Better',          'debrief',     'could_better'],
  ['Best Moment',                   'debrief',     'best_moment'],
  ['Biggest Surprise',              'debrief',     'biggest_surprise'],

  // 03 · The Quote
  ['Testimonial',                   'testimonial', 'testimonial_quote'],
  ['Attribution Name',              'testimonial', 'quote_name'],
  ['Attribution Title',             'testimonial', 'quote_title'],
  ['Perm: Website',                 'testimonial', 'perm_quote_web'],
  ['Perm: Logo in Portfolio',       'testimonial', 'perm_logo'],
  ['Perm: Case Study',              'testimonial', 'perm_case_study'],
  ['Perm: Social Tag',              'testimonial', 'perm_social'],
  ['Willing to Leave Public Review','testimonial', 'public_review'],

  // 04 · Pass the Mic
  ['Well-Wishes (private)',         'wishes',      'wish_message'],
  ['Shoutout',                      'wishes',      'shoutout'],

  // 05 · What's Next
  ['Interested In',                 'next',        'interest'],

  // 06 · Sign-Off
  ['Sign-Off Confirmed',            'signoff',     'signoff_confirm']
];

// Section titles for the archived Doc (grouped, in order).
var SECTION_TITLES = {
  delivery:    '01 · Delivery Receipt',
  debrief:     '02 · The Debrief',
  testimonial: '03 · The Quote',
  wishes:      "04 · Pass the Mic",
  next:        "05 · What's Next",
  signoff:     '06 · Sign-Off'
};

// Health check — visiting the /exec URL in a browser returns this.
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', ping: 'alive', service: 'Adaline Offboarding' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data    = JSON.parse(e.postData.contents);
    var meta    = data._meta || {};
    var client  = meta.client  || 'Unknown';
    var project = meta.project || '';
    var ts         = new Date();
    var stamp      = Utilities.formatDate(ts, 'Asia/Kolkata', 'yyyy-MM-dd HH-mm');
    var prettyTime = Utilities.formatDate(ts, 'Asia/Kolkata', 'dd MMM yyyy, HH:mm');
    var fileName   = client + ' — offboarding — ' + stamp;

    // Ordered [header, value] pairs for this submission.
    var fields = collectFields(data);

    // 1) Formatted Google Doc archive (grouped by section) -------------
    var doc  = DocumentApp.create(fileName);
    var body = doc.getBody();
    body.appendParagraph(client).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('PROJECT WRAP' + (project ? ' — ' + project : '')).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
    body.appendParagraph('Submitted: ' + prettyTime);

    var order = ['delivery', 'debrief', 'testimonial', 'wishes', 'next', 'signoff'];
    for (var s = 0; s < order.length; s++) {
      var secId = order[s];
      var rows  = [];
      for (var i = 0; i < SCHEMA.length; i++) {
        if (SCHEMA[i][1] !== secId) continue;
        var val = readField(data, SCHEMA[i][1], SCHEMA[i][2]);
        if (val !== '') rows.push([SCHEMA[i][0], val]);
      }
      if (!rows.length) continue;
      body.appendParagraph('');
      body.appendParagraph(SECTION_TITLES[secId] || secId).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      for (var r = 0; r < rows.length; r++) {
        var p = body.appendParagraph('');
        p.appendText(rows[r][0] + ': ').setBold(true);
        p.appendText(rows[r][1]).setBold(false);
      }
    }
    doc.saveAndClose();

    var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);
    var file    = DriveApp.getFileById(doc.getId());
    file.moveTo(folder);

    // 2) One clean row in the Offboarding tab --------------------------
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_TAB);
      var seed = BASE_HEADERS.slice();
      for (var h = 0; h < SCHEMA.length; h++) seed.push(SCHEMA[h][0]);
      sheet.appendRow(seed);
      styleHeader(sheet);
      sheet.setFrozenRows(1);
      sheet.setFrozenColumns(2);
    }

    var record = {
      'Submitted': prettyTime,
      'Client':    client,
      'Project':   project,
      'Status':    'New',
      'Doc':       doc.getUrl()
    };
    var orderedHeaders = BASE_HEADERS.slice();
    for (var j = 0; j < fields.length; j++) {
      orderedHeaders.push(fields[j][0]);
      if (record[fields[j][0]] === undefined) record[fields[j][0]] = fields[j][1];
    }

    appendRecord(sheet, orderedHeaders, record);

    // Make the Doc cell a clickable link.
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var docCol  = headers.indexOf('Doc') + 1;
    if (docCol > 0) sheet.getRange(sheet.getLastRow(), docCol).setFormula('=HYPERLINK("' + doc.getUrl() + '","Open Doc")');

    // 3) Email the PDF -------------------------------------------------
    var pdf = file.getAs('application/pdf').setName(fileName + '.pdf');
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: '[Adaline Offboarding] ' + client + (project ? ' — ' + project : ''),
      body: client + ' submitted the offboarding (Project Wrap) form.\n\n' +
            'Project: ' + project + '\n' +
            'Submitted: ' + prettyTime + '\n\n' +
            'A new row was added to the "' + SHEET_TAB + '" tab; the Doc is attached.',
      attachments: [pdf]
    });

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ---- helpers --------------------------------------------------------------

// Ordered [header, value] list using the fixed schema; anything sent but
// not in the schema is folded into a single trailing "Other" column.
function collectFields(data) {
  var out = [];
  for (var i = 0; i < SCHEMA.length; i++) {
    out.push([SCHEMA[i][0], readField(data, SCHEMA[i][1], SCHEMA[i][2])]);
  }
  var used = {};
  for (var s = 0; s < SCHEMA.length; s++) used[SCHEMA[s][1] + '.' + SCHEMA[s][2]] = true;
  var extras = [];
  eachField(data, function (sec, key, val) {
    if (!used[sec + '.' + key]) extras.push(labelize(key) + ': ' + val);
  });
  out.push(['Other', extras.join(' | ')]);
  return out;
}

// Ensure every header exists (grows columns as needed) then append the row.
function appendRecord(sheet, orderedHeaders, record) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var i = 0; i < headers.length; i++) idx[headers[i]] = i;
  var wanted = orderedHeaders.slice();
  for (var k in record) if (record.hasOwnProperty(k)) wanted.push(k);
  for (var w = 0; w < wanted.length; w++) {
    if (idx[wanted[w]] === undefined) {
      var col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(wanted[w]).setFontWeight('bold').setBackground('#0a0a0a').setFontColor('#ffffff');
      idx[wanted[w]] = col - 1;
      headers.push(wanted[w]);
    }
  }
  var row = [];
  for (var r = 0; r < headers.length; r++) row.push('');
  for (var key in record) if (record.hasOwnProperty(key)) row[idx[key]] = record[key];
  sheet.appendRow(row);
}

// Iterate every non-_meta field; arrays joined, empties skipped.
function eachField(data, cb) {
  var order = [];
  for (var k in data) if (data.hasOwnProperty(k) && k !== '_meta') order.push(k);
  for (var i = 0; i < order.length; i++) {
    var sec = order[i];
    var sd  = data[sec];
    if (!sd || typeof sd !== 'object') continue;
    for (var key in sd) {
      if (!sd.hasOwnProperty(key)) continue;
      var v = sd[key];
      if (v === null || v === undefined) continue;
      if (Object.prototype.toString.call(v) === '[object Array]') v = v.join(', ');
      v = pretty(String(v));
      if (v === '') continue;
      cb(sec, key, v);
    }
  }
}

function readField(data, section, key) {
  var sd = data[section];
  if (!sd || typeof sd !== 'object') return '';
  var v = sd[key];
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Array]') v = v.join(', ');
  v = String(v);
  return v === '' ? '' : pretty(v);
}

// Turn machine values into readable cells:
//  - yes/true/confirmed/on -> "Yes"
//  - snake_case tokens (incl. comma-joined lists) -> Title Case
//  - free text is left untouched
function pretty(v) {
  v = String(v);
  if (v === '') return '';
  var low = v.toLowerCase();
  if (low === 'yes' || low === 'true' || low === 'confirmed' || low === 'on') return 'Yes';
  return v.split(', ').map(function (part) {
    if (/^[a-z0-9]+(_[a-z0-9]+)*$/.test(part)) {
      return part.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    return part;
  }).join(', ');
}

function titleize(s) {
  return String(s).replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '')
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// Friendly labels for known offboarding field names; falls back to Title Case.
function labelize(key) {
  var map = {
    recv_design_1: 'Design 1 — Kerala Doodle Art', recv_design_2: 'Design 2 — Kerala Mural Comics',
    recv_design_3: 'Design 3 — Pookalam Collage', recv_sources: 'Source Files Received',
    recv_exports: 'Print + Web Exports Received', outstanding: 'Outstanding Items',
    nps_score: 'NPS (0–10)', star_rating: 'Star Rating (1–5)', got_right: 'What We Got Right',
    could_better: 'What Could Be Better', best_moment: 'Best Moment', biggest_surprise: 'Biggest Surprise',
    testimonial_quote: 'Testimonial', quote_name: 'Attribution Name', quote_title: 'Attribution Title',
    perm_quote_web: 'Perm: Website', perm_logo: 'Perm: Logo in Portfolio', perm_case_study: 'Perm: Case Study',
    perm_social: 'Perm: Social Tag', public_review: 'Willing to Leave Public Review',
    wish_message: 'Well-Wishes (private)', shoutout: 'Shoutout', interest: 'Interested In',
    signoff_confirm: 'Sign-Off Confirmed'
  };
  return map[key] || titleize(key);
}

function styleHeader(sheet) {
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight('bold').setBackground('#0a0a0a').setFontColor('#ffffff');
}
