/**
 * ADALINE OFFBOARDING — Apps Script (standalone, readable columns)
 * -----------------------------------------------------------------
 * A dedicated script for the **Adaline Offboarding** Google Sheet.
 * One submission = ONE ROW, each field in its OWN labelled column —
 * readable, sortable, filterable. No raw JSON. Empty fields skipped.
 *
 * GENERAL vs CUSTOM:
 *   Every offboarding (any service/scope) shares the same general
 *   sections — Debrief, Quote, Pass the Mic, What's Next, Sign-Off.
 *   Those are FIXED columns below. The Delivery Receipt items are
 *   CUSTOM per scope (designs, website, app, social, …), so they are
 *   NOT hardcoded — they collapse into one stable "Deliverables
 *   Confirmed" column. Anything else a form sends lands in "Other".
 *   => one script serves every client and future work, no edits.
 *
 * It also archives a grouped Google Doc per submission and emails the
 * PDF to bettercall@myadaline.com.
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

var SHEET_TAB    = 'Offboarding';
var NOTIFY_EMAIL = 'bettercall@myadaline.com';
var DRIVE_FOLDER = 'Adaline Offboarding Submissions';

// Columns that always come first.
var BASE_HEADERS = ['Submitted', 'Client', 'Project', 'Status', 'Doc'];

// The Delivery Receipt section: which field is the general "anything
// outstanding" note (everything else in this section is a custom
// deliverable and gets summarised, not given its own column).
var DELIVERY_SECTION = 'delivery';
var OUTSTANDING_FIELD = 'outstanding';

// GENERAL offboarding fields — identical across every client/scope.
// [Section title (for the Doc), section id, [ [Column header, field] ... ]].
var GENERAL = [
  { id: 'debrief', title: '02 · The Debrief', fields: [
    ['NPS (0–10)',        'nps_score'],
    ['Star Rating (1–5)', 'star_rating'],
    ['What We Got Right', 'got_right'],
    ['What Could Be Better','could_better'],
    ['Best Moment',       'best_moment'],
    ['Biggest Surprise',  'biggest_surprise']
  ]},
  { id: 'testimonial', title: '03 · The Quote', fields: [
    ['Testimonial',                   'testimonial_quote'],
    ['Attribution Name',              'quote_name'],
    ['Attribution Title',             'quote_title'],
    ['Perm: Website',                 'perm_quote_web'],
    ['Perm: Logo in Portfolio',       'perm_logo'],
    ['Perm: Case Study',              'perm_case_study'],
    ['Perm: Social Tag',              'perm_social'],
    ['Willing to Leave Public Review','public_review']
  ]},
  { id: 'wishes', title: '04 · Pass the Mic', fields: [
    ['Well-Wishes (private)', 'wish_message'],
    ['Shoutout',              'shoutout']
  ]},
  { id: 'next', title: "05 · What's Next", fields: [
    ['Interested In', 'interest']
  ]},
  { id: 'signoff', title: '06 · Sign-Off', fields: [
    ['Sign-Off Confirmed', 'signoff_confirm']
  ]}
];

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

    var groups = buildGroups(data);       // grouped, for the Doc
    var fields = flattenForSheet(data);    // [header, value], for the row

    // 1) Formatted Google Doc archive (grouped by section) -------------
    var doc  = DocumentApp.create(fileName);
    var body = doc.getBody();
    body.appendParagraph(client).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('PROJECT WRAP' + (project ? ' — ' + project : '')).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
    body.appendParagraph('Submitted: ' + prettyTime);

    for (var g = 0; g < groups.length; g++) {
      var rows = [];
      for (var i = 0; i < groups[g].rows.length; i++) {
        if (groups[g].rows[i][1] !== '') rows.push(groups[g].rows[i]);
      }
      if (!rows.length) continue;
      body.appendParagraph('');
      body.appendParagraph(groups[g].title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
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
      for (var h = 0; h < fields.length; h++) seed.push(fields[h][0]);
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

// ---- shaping --------------------------------------------------------------

// Ordered groups of [label, value] rows — Delivery (summarised), the
// general sections, then any custom extras. Used for the Doc.
function buildGroups(data) {
  var groups = [];

  groups.push({ title: '01 · Delivery Receipt', rows: [
    ['Deliverables Confirmed', deliverablesSummary(data)],
    ['Outstanding Items',      readField(data, DELIVERY_SECTION, OUTSTANDING_FIELD)]
  ]});

  for (var s = 0; s < GENERAL.length; s++) {
    var rows = [];
    for (var f = 0; f < GENERAL[s].fields.length; f++) {
      rows.push([GENERAL[s].fields[f][0], readField(data, GENERAL[s].id, GENERAL[s].fields[f][1])]);
    }
    groups.push({ title: GENERAL[s].title, rows: rows });
  }

  var extras = otherEntries(data);
  if (extras.length) groups.push({ title: 'Other Details', rows: extras });

  return groups;
}

// Flat [header, value] list with a STABLE column set for the sheet:
// fixed general columns + one "Deliverables Confirmed" + one "Other".
function flattenForSheet(data) {
  var out = [];
  out.push(['Deliverables Confirmed', deliverablesSummary(data)]);
  out.push(['Outstanding Items',      readField(data, DELIVERY_SECTION, OUTSTANDING_FIELD)]);
  for (var s = 0; s < GENERAL.length; s++) {
    for (var f = 0; f < GENERAL[s].fields.length; f++) {
      out.push([GENERAL[s].fields[f][0], readField(data, GENERAL[s].id, GENERAL[s].fields[f][1])]);
    }
  }
  var extras = otherEntries(data);
  out.push(['Other', extras.map(function (e) { return e[0] + ': ' + e[1]; }).join(' | ')]);
  return out;
}

// Custom deliverables -> a single readable list. If a checkbox carries a
// meaningful value (the deliverable's name) we use it; if it's just a
// generic "confirmed"/"yes", we fall back to the field name.
function deliverablesSummary(data) {
  var sd = data[DELIVERY_SECTION];
  if (!sd || typeof sd !== 'object') return '';
  var items = [];
  for (var key in sd) {
    if (!sd.hasOwnProperty(key) || key === OUTSTANDING_FIELD) continue;
    var v = sd[key];
    if (v === null || v === undefined) continue;
    if (Object.prototype.toString.call(v) === '[object Array]') v = v.join(', ');
    v = String(v);
    if (v === '') continue;
    var pv = pretty(v);
    if (pv === '' || pv === 'Yes') items.push(titleize(stripDeliv(key)));
    else items.push(pv);
  }
  return items.join(', ');
}

function stripDeliv(k) {
  return String(k).replace(/^(recv|recd|received|deliver|delivery|item)_/, '');
}

// Every sent field that isn't general and isn't a delivery item.
function otherEntries(data) {
  var consumed = {};
  for (var s = 0; s < GENERAL.length; s++) {
    for (var f = 0; f < GENERAL[s].fields.length; f++) {
      consumed[GENERAL[s].id + '.' + GENERAL[s].fields[f][1]] = true;
    }
  }
  var entries = [];
  eachField(data, function (sec, key, val) {
    if (sec === DELIVERY_SECTION) return;          // summarised already
    if (consumed[sec + '.' + key]) return;         // a general field
    entries.push([titleize(key), val]);
  });
  return entries;
}

// ---- generic helpers ------------------------------------------------------

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

// Readable cells: yes/true/confirmed -> "Yes"; snake_case -> Title Case;
// free text untouched.
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

function styleHeader(sheet) {
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight('bold').setBackground('#0a0a0a').setFontColor('#ffffff');
}
