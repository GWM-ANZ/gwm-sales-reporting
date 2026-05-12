// ============================================================
// GWM Daily Sales Reporting, simplified testing backend
// Purpose: accept index.html submissions and write flat rows to Google Sheets.
// Power BI should connect directly to the Google Sheet CSV export URL.
// ============================================================

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
const SHEET_NAME = 'submissions';
const ACCESS_CODE = '';

const COLUMNS = [
  'submitted_at',
  'report_date',
  'is_late',
  'dealer_code',
  'dealer_name',
  'region',
  'submitted_by',
  'direction',
  'is_complete_submission',
  'input_method',
  'submission_duration_seconds',
  'last_updated_at',
  'model_bucket',
  'enquiry',
  'test_drives',
  'new_sold',
  'fleet_5_plus',
  'demo_sold',
  'forecast'
];

function doPost(e) {
  try {
    const bodyText = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(bodyText);

    if (ACCESS_CODE && body.code !== ACCESS_CODE) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new Error('No rows supplied');

    const first = rows[0];
    const dealerCode = clean(first.dealer_code);
    const reportDate = normaliseDate(first.report_date);
    if (!dealerCode) throw new Error('dealer_code is required');
    if (!reportDate) throw new Error('report_date is required');

    const sheet = getSubmissionSheet();
    ensureHeaders(sheet);

    // Testing-safe behaviour: resubmitting the same dealer/date replaces prior rows.
    // This removes the need for dashboard reopen controls during the pilot.
    deleteRowsForDealerDate(sheet, dealerCode, reportDate);

    const output = rows.map(row => COLUMNS.map(col => valueForColumn(row, col, dealerCode, reportDate)));
    if (output.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, output.length, COLUMNS.length).setValues(output);
    }

    SpreadsheetApp.flush();
    return jsonResponse({ success: true, rows_written: output.length, dealer_code: dealerCode, report_date: reportDate });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (params.format === 'csv') return csvResponse();
  return jsonResponse({ success: true, message: 'GWM simplified reporting endpoint is live', sheet: SHEET_NAME });
}

// Run this manually once before pilot testing if you want a clean Google Sheet.
// Apps Script menu: select resetSubmissionsForTesting, press Run, then authorise.
function resetSubmissionsForTesting() {
  const sheet = getSubmissionSheet();
  sheet.clear();
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  styleHeader(sheet);
  sheet.autoResizeColumns(1, COLUMNS.length);
  SpreadsheetApp.flush();
  return 'Reset complete. The submissions tab now contains headers only.';
}

// Optional safety copy before reset. Run this before resetSubmissionsForTesting if old data needs to be retained.
function archiveSubmissionsBeforeReset() {
  const spreadsheet = getSpreadsheet();
  const source = getSubmissionSheet();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const copy = source.copyTo(spreadsheet).setName('submissions_archive_' + stamp);
  spreadsheet.setActiveSheet(copy);
  SpreadsheetApp.flush();
  return 'Archive created: ' + copy.getName();
}

function valueForColumn(row, col, dealerCode, reportDate) {
  if (col === 'dealer_code') return dealerCode;
  if (col === 'report_date') return reportDate;
  if (col === 'is_late') return truthy(row[col]) ? 'TRUE' : 'FALSE';
  if (col === 'is_complete_submission') return truthy(row[col]) ? 'TRUE' : 'FALSE';
  if (['enquiry', 'test_drives', 'new_sold', 'fleet_5_plus', 'demo_sold', 'forecast'].indexOf(col) >= 0) return safeInt(row[col]);
  if (col === 'last_updated_at') return clean(row[col]) || clean(row.submitted_at) || new Date().toISOString();
  return row[col] === undefined || row[col] === null ? '' : row[col];
}

function getSpreadsheet() {
  if (SHEET_ID && SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE') {
    return SpreadsheetApp.openById(SHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSubmissionSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    styleHeader(sheet);
    return;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), COLUMNS.length)).getValues()[0]
    .map(v => clean(v))
    .filter(Boolean);

  const matches = current.length === COLUMNS.length && COLUMNS.every((c, i) => current[i] === c);
  if (!matches) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  }
  styleHeader(sheet);
}

function styleHeader(sheet) {
  sheet.getRange(1, 1, 1, COLUMNS.length)
    .setFontWeight('bold')
    .setBackground('#111111')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}

function deleteRowsForDealerDate(sheet, dealerCode, reportDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  const dealerCol = COLUMNS.indexOf('dealer_code');
  const dateCol = COLUMNS.indexOf('report_date');

  for (let i = values.length - 1; i >= 0; i--) {
    const rowDealer = clean(values[i][dealerCol]);
    const rowDate = normaliseDate(values[i][dateCol]);
    if (rowDealer === dealerCode && rowDate === reportDate) {
      sheet.deleteRow(i + 2);
    }
  }
}

function csvResponse() {
  const sheet = getSubmissionSheet();
  ensureHeaders(sheet);
  const values = sheet.getDataRange().getValues();
  const lines = values.map(row => row.map(csvEscape).join(','));
  return ContentService.createTextOutput(lines.join('\n')).setMimeType(ContentService.MimeType.CSV);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function clean(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function safeInt(value) {
  const number = parseInt(value, 10);
  return isNaN(number) || number < 0 ? 0 : number;
}

function truthy(value) {
  return value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1';
}

function normaliseDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}
