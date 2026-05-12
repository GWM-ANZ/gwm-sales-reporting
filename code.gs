// ============================================================
// GWM Daily Sales Reporting, v2.1 pilot-safe backend
// Purpose: accept dealer index.html submissions, validate server-side,
// write active rows to submissions_current, retain every version in
// submissions_audit, and expose clean CSV output for Power BI.
// ============================================================

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
const REGION = 'Southern Region';
const TIMEZONE = 'Australia/Melbourne';
const CUTOFF_HOUR = 10;
const HARD_MAX_METRIC_VALUE = 9999;

const SHEETS = {
  current: 'submissions_current',
  audit: 'submissions_audit',
  dealers: 'dealers',
  models: 'model_buckets',
  config: 'config',
  errors: 'error_log',
  forecastCurrent: 'forecast_current',
  forecastAudit: 'forecast_audit'
};

const CURRENT_COLUMNS = [
  'submission_id',
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
  'total_activity',
  'revision',
  'source'
];

const AUDIT_COLUMNS = CURRENT_COLUMNS.concat([
  'audit_action',
  'client_submitted_at',
  'user_agent'
]);

const ERROR_COLUMNS = [
  'logged_at',
  'error_message',
  'dealer_code',
  'report_date',
  'payload_preview'
];

const DEALER_COLUMNS = [
  'dealer_code',
  'dealer_name',
  'region',
  'active',
  'dealer_token',
  'contact_email'
];

const MODEL_COLUMNS = [
  'sort_order',
  'model_bucket',
  'active'
];

const CONFIG_COLUMNS = [
  'key',
  'value',
  'notes'
];

const FORECAST_COLUMNS = [
  'forecast_id',
  'submitted_at',
  'forecast_month',
  'dealer_code',
  'dealer_name',
  'region',
  'submitted_by',
  'model_bucket',
  'forecast',
  'revision',
  'source'
];

const METRICS = ['enquiry', 'test_drives', 'new_sold', 'fleet_5_plus', 'demo_sold'];

const DEFAULT_DEALERS = [
  ['H3100', 'Berwick GWM', REGION, 'TRUE', '', ''],
  ['H3101', 'Doncaster GWM', REGION, 'TRUE', '', ''],
  ['H3104', 'Astoria GWM', REGION, 'TRUE', '', ''],
  ['H3107', 'Melton GWM', REGION, 'TRUE', '', ''],
  ['H3128', 'Werribee GWM', REGION, 'TRUE', '', ''],
  ['H3161', 'Peninsula GWM', REGION, 'TRUE', '', ''],
  ['H3163', 'Ringwood GWM', REGION, 'TRUE', '', ''],
  ['H3182', "Ralph D'Silva GWM", REGION, 'TRUE', '', ''],
  ['H3167', 'Essendon GWM', REGION, 'TRUE', '', ''],
  ['H3318', 'Thompson GWM (Shepparton)', REGION, 'TRUE', '', ''],
  ['H3315', 'Valley GWM', REGION, 'TRUE', '', ''],
  ['H7215', 'Hobart GWM', REGION, 'TRUE', '', ''],
  ['H7309', 'Launceston GWM', REGION, 'TRUE', '', ''],
  ['H3230', 'Geelong GWM', REGION, 'TRUE', '', ''],
  ['H3236', 'Bendigo GWM', REGION, 'TRUE', '', ''],
  ['H3176', 'South Morang GWM', REGION, 'TRUE', '', ''],
  ['H3179', 'Burwood GWM', REGION, 'TRUE', '', ''],
  ['H3185', 'Knox GWM', REGION, 'TRUE', '', ''],
  ['H3196', 'Western GWM', REGION, 'TRUE', '', ''],
  ['H3195', 'Pakenham GWM', REGION, 'TRUE', '', ''],
  ['H3239', 'Ballarat GWM', REGION, 'TRUE', '', ''],
  ['H3336', 'Thompson GWM (Echuca)', REGION, 'TRUE', '', ''],
  ['H3342', 'Horsham GWM', REGION, 'TRUE', '', ''],
  ['H3188', 'Blackburn GWM', REGION, 'TRUE', '', ''],
  ['H3191', 'Lilydale GWM', REGION, 'TRUE', '', ''],
  ['H3333', 'Blacklocks GWM (Albury)', REGION, 'TRUE', '', ''],
  ['H3330', 'Warrnambool GWM', REGION, 'TRUE', '', ''],
  ['H3110', 'Dandenong GWM', REGION, 'TRUE', '', ''],
  ['H3345', 'Peter Dullard GWM (Bairnsdale)', REGION, 'TRUE', '', ''],
  ['H3111', 'Melbourne CBD', REGION, 'TRUE', '', '']
];

const DEFAULT_MODELS = [
  'Jolion ICE', 'Jolion HEV', 'H6 Petrol', 'H6 HEV', 'H6 PHEV',
  'H6 GT Petrol', 'H6 GT PHEV', 'H7 HEV', 'Tank 300 Petrol',
  'Tank 300 Diesel', 'Tank 300 PHEV', 'Tank 500 Hybrid',
  'Tank 500 PHEV', 'Tank 500 Diesel', 'Cannon Diesel',
  'Cannon Alpha Diesel', 'Cannon Alpha PHEV', 'Ora', 'Ora 5'
];

const DEFAULT_CONFIG = [
  ['pilot_access_code', '', 'Optional shared pilot code. Leave blank for no shared code. Prefer dealer tokens for production.'],
  ['allow_today_for_testing', 'FALSE', 'TRUE only during controlled internal smoke testing.'],
  ['allow_earlier_corrections', 'TRUE', 'Allows a dealer/date resubmission for an earlier report date.'],
  ['read_csv_token', '', 'Optional token for Apps Script CSV reads: ?format=csv&sheet=current&token=...'],
  ['cutoff_hour', String(CUTOFF_HOUR), 'Hour in local timezone when same-morning submissions become late.'],
  ['timezone', TIMEZONE, 'Reporting timezone.']
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  let body = {};
  try {
    lock.waitLock(10000);
    body = parseBody(e);
    const result = processSubmission(body);
    return shouldReturnHtml(e, body) ? htmlPostMessage(result) : jsonResponse(result);
  } catch (err) {
    logError(err, body);
    const result = { success: false, error: err.message };
    return shouldReturnHtml(e, body) ? htmlPostMessage(result) : jsonResponse(result);
  } finally {
    try { lock.releaseLock(); } catch (releaseErr) {}
  }
}

function doGet(e) {
  setupWorkbookIfNeeded();
  const params = e && e.parameter ? e.parameter : {};
  if (params.format === 'csv') return csvResponse(params);
  return jsonResponse({
    success: true,
    message: 'GWM Daily Reporting v2.1 endpoint is live',
    sheets: SHEETS,
    version: '2.1'
  });
}

function processSubmission(body) {
  setupWorkbookIfNeeded();
  validateAccess(body);

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw new Error('No rows supplied.');

  const first = rows[0];
  const dealerCode = clean(first.dealer_code);
  const reportDate = normaliseDate(first.report_date);
  const submittedBy = clean(first.submitted_by);
  const direction = clean(first.direction);

  if (!dealerCode) throw new Error('dealer_code is required.');
  if (!reportDate) throw new Error('report_date is required.');
  if (!submittedBy) throw new Error('submitted_by is required.');
  if (['Up', 'Flat', 'Down'].indexOf(direction) === -1) throw new Error('direction must be Up, Flat or Down.');

  validateReportDate(reportDate);

  const dealer = getDealerRecord(dealerCode);
  validateDealerToken(body, dealer);

  const activeModels = getActiveModels();
  validateModelRows(rows, activeModels);

  const submittedAtDate = new Date();
  const submittedAt = isoTimestamp(submittedAtDate);
  const lastUpdatedAt = submittedAt;
  const isLate = calculateLateFlag(submittedAtDate, reportDate);
  const revision = getNextRevision(dealerCode, reportDate);
  const submissionId = buildSubmissionId(dealerCode, reportDate, revision);
  const inputMethod = clean(first.input_method) || 'single_index_v2_1';
  const duration = safeInt(first.submission_duration_seconds);
  const clientSubmittedAt = clean(body.client_submitted_at);
  const userAgent = clean(body.user_agent);
  const source = 'index_html_v2_1';

  const cleanedRows = activeModels.map(model => {
    const submittedRow = rows.find(row => clean(row.model_bucket) === model);
    const metrics = {};
    METRICS.forEach(metric => metrics[metric] = validateMetric(submittedRow[metric], metric, model));
    const totalActivity = METRICS.reduce((sum, metric) => sum + metrics[metric], 0);
    return {
      submission_id: submissionId,
      submitted_at: submittedAt,
      report_date: reportDate,
      is_late: isLate,
      dealer_code: dealer.dealer_code,
      dealer_name: dealer.dealer_name,
      region: dealer.region || REGION,
      submitted_by: submittedBy,
      direction: direction,
      is_complete_submission: true,
      input_method: inputMethod,
      submission_duration_seconds: duration,
      last_updated_at: lastUpdatedAt,
      model_bucket: model,
      enquiry: metrics.enquiry,
      test_drives: metrics.test_drives,
      new_sold: metrics.new_sold,
      fleet_5_plus: metrics.fleet_5_plus,
      demo_sold: metrics.demo_sold,
      total_activity: totalActivity,
      revision: revision,
      source: source,
      audit_action: revision > 1 ? 'replace_current' : 'new_current',
      client_submitted_at: clientSubmittedAt,
      user_agent: userAgent
    };
  });

  const totalActivity = cleanedRows.reduce((sum, row) => sum + row.total_activity, 0);
  if (totalActivity === 0 && body.confirm_all_zero !== true) {
    throw new Error('All-zero submission rejected. Confirm genuine zero activity before submitting.');
  }

  appendAuditRows(cleanedRows);
  replaceCurrentRows(cleanedRows, dealer.dealer_code, reportDate);

  SpreadsheetApp.flush();

  return {
    success: true,
    version: '2.1',
    submission_id: submissionId,
    dealer_code: dealer.dealer_code,
    dealer_name: dealer.dealer_name,
    report_date: reportDate,
    rows_written: cleanedRows.length,
    audit_rows_written: cleanedRows.length,
    revision: revision,
    is_late: isLate,
    total_activity: totalActivity
  };
}

function validateAccess(body) {
  const config = getConfigMap();
  const requiredCode = clean(config.pilot_access_code);
  if (requiredCode && clean(body.code) !== requiredCode) throw new Error('Unauthorized. Pilot access code is incorrect.');
}

function validateDealerToken(body, dealer) {
  const requiredToken = clean(dealer.dealer_token);
  if (requiredToken && clean(body.dealer_token) !== requiredToken) {
    throw new Error('Unauthorized. Dealer token does not match the selected dealer.');
  }
}

function validateReportDate(reportDate) {
  const config = getConfigMap();
  const allowToday = truthy(config.allow_today_for_testing);
  const allowEarlier = config.allow_earlier_corrections === undefined ? true : truthy(config.allow_earlier_corrections);
  const today = localDateIso(new Date());
  const yesterday = addDaysIso(today, -1);

  if (reportDate > today) throw new Error('Future report dates are not allowed.');
  if (!allowToday && reportDate >= today) throw new Error('Today is not allowed. Reporting is retrospective only.');
  if (!allowEarlier && reportDate !== yesterday) throw new Error('Only yesterday can be submitted for this pilot.');
}

function validateModelRows(rows, activeModels) {
  if (rows.length !== activeModels.length) {
    throw new Error('Submission must contain exactly ' + activeModels.length + ' model rows. Received ' + rows.length + '.');
  }

  const seen = {};
  rows.forEach(row => {
    const model = clean(row.model_bucket);
    if (!model) throw new Error('Every row must include model_bucket.');
    if (activeModels.indexOf(model) === -1) throw new Error('Invalid model bucket: ' + model);
    if (seen[model]) throw new Error('Duplicate model bucket supplied: ' + model);
    seen[model] = true;
  });

  activeModels.forEach(model => {
    if (!seen[model]) throw new Error('Missing model bucket: ' + model);
  });
}

function validateMetric(value, metric, model) {
  const text = clean(value);
  const number = text === '' ? 0 : Number(text);
  if (!Number.isInteger(number) || number < 0) throw new Error(metric + ' for ' + model + ' must be a whole number of zero or above.');
  if (number > HARD_MAX_METRIC_VALUE) throw new Error(metric + ' for ' + model + ' is above the hard limit of ' + HARD_MAX_METRIC_VALUE + '.');
  return number;
}

function getNextRevision(dealerCode, reportDate) {
  const auditSheet = getSheet(SHEETS.audit, AUDIT_COLUMNS);
  const lastRow = auditSheet.getLastRow();
  if (lastRow <= 1) return 1;

  const values = auditSheet.getRange(2, 1, lastRow - 1, AUDIT_COLUMNS.length).getValues();
  const dealerCol = AUDIT_COLUMNS.indexOf('dealer_code');
  const dateCol = AUDIT_COLUMNS.indexOf('report_date');
  const revisionCol = AUDIT_COLUMNS.indexOf('revision');
  let maxRevision = 0;

  values.forEach(row => {
    if (clean(row[dealerCol]) === dealerCode && normaliseDate(row[dateCol]) === reportDate) {
      const revision = safeInt(row[revisionCol]);
      if (revision > maxRevision) maxRevision = revision;
    }
  });
  return maxRevision + 1;
}

function appendAuditRows(rows) {
  const auditSheet = getSheet(SHEETS.audit, AUDIT_COLUMNS);
  const output = rows.map(row => AUDIT_COLUMNS.map(col => valueFromRow(row, col)));
  auditSheet.getRange(auditSheet.getLastRow() + 1, 1, output.length, AUDIT_COLUMNS.length).setValues(output);
}

function replaceCurrentRows(rows, dealerCode, reportDate) {
  const currentSheet = getSheet(SHEETS.current, CURRENT_COLUMNS);
  deleteCurrentRowsForDealerDate(currentSheet, dealerCode, reportDate);
  const output = rows.map(row => CURRENT_COLUMNS.map(col => valueFromRow(row, col)));
  currentSheet.getRange(currentSheet.getLastRow() + 1, 1, output.length, CURRENT_COLUMNS.length).setValues(output);
}

function deleteCurrentRowsForDealerDate(sheet, dealerCode, reportDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const values = sheet.getRange(2, 1, lastRow - 1, CURRENT_COLUMNS.length).getValues();
  const dealerCol = CURRENT_COLUMNS.indexOf('dealer_code');
  const dateCol = CURRENT_COLUMNS.indexOf('report_date');

  for (let i = values.length - 1; i >= 0; i--) {
    const rowDealer = clean(values[i][dealerCol]);
    const rowDate = normaliseDate(values[i][dateCol]);
    if (rowDealer === dealerCode && rowDate === reportDate) sheet.deleteRow(i + 2);
  }
}

function valueFromRow(row, col) {
  const value = row[col];
  if (col === 'is_late' || col === 'is_complete_submission') return value ? 'TRUE' : 'FALSE';
  return value === undefined || value === null ? '' : value;
}

function setupWorkbookIfNeeded() {
  getSheet(SHEETS.current, CURRENT_COLUMNS);
  getSheet(SHEETS.audit, AUDIT_COLUMNS);
  getSheet(SHEETS.errors, ERROR_COLUMNS);
  seedSheetIfEmpty(SHEETS.dealers, DEALER_COLUMNS, DEFAULT_DEALERS);
  seedSheetIfEmpty(SHEETS.models, MODEL_COLUMNS, DEFAULT_MODELS.map((model, index) => [index + 1, model, 'TRUE']));
  seedSheetIfEmpty(SHEETS.config, CONFIG_COLUMNS, DEFAULT_CONFIG);
  getSheet(SHEETS.forecastCurrent, FORECAST_COLUMNS);
  getSheet(SHEETS.forecastAudit, FORECAST_COLUMNS);
}

function getSheet(name, columns) {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  ensureHeaders(sheet, columns);
  return sheet;
}

function seedSheetIfEmpty(name, columns, rows) {
  const sheet = getSheet(name, columns);
  if (sheet.getLastRow() > 1) return sheet;
  if (rows && rows.length) sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
  sheet.autoResizeColumns(1, columns.length);
  return sheet;
}

function ensureHeaders(sheet, columns) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    styleHeader(sheet, columns.length);
    return;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), columns.length)).getValues()[0]
    .slice(0, columns.length)
    .map(v => clean(v));
  const matches = current.length === columns.length && columns.every((c, i) => current[i] === c);
  if (!matches) sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  styleHeader(sheet, columns.length);
}

function styleHeader(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#111111')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}

function getDealerRecord(dealerCode) {
  const sheet = seedSheetIfEmpty(SHEETS.dealers, DEALER_COLUMNS, DEFAULT_DEALERS);
  const values = sheet.getDataRange().getValues();
  const header = values.shift().map(clean);
  const codeCol = header.indexOf('dealer_code');
  const nameCol = header.indexOf('dealer_name');
  const regionCol = header.indexOf('region');
  const activeCol = header.indexOf('active');
  const tokenCol = header.indexOf('dealer_token');

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (clean(row[codeCol]) === dealerCode) {
      if (!truthy(row[activeCol])) throw new Error('Dealer is inactive: ' + dealerCode);
      return {
        dealer_code: clean(row[codeCol]),
        dealer_name: clean(row[nameCol]),
        region: clean(row[regionCol]) || REGION,
        dealer_token: tokenCol >= 0 ? clean(row[tokenCol]) : ''
      };
    }
  }
  throw new Error('Unknown dealer_code: ' + dealerCode);
}

function getActiveModels() {
  const sheet = seedSheetIfEmpty(SHEETS.models, MODEL_COLUMNS, DEFAULT_MODELS.map((model, index) => [index + 1, model, 'TRUE']));
  const values = sheet.getDataRange().getValues();
  values.shift();
  return values
    .filter(row => truthy(row[2]))
    .sort((a, b) => safeInt(a[0]) - safeInt(b[0]))
    .map(row => clean(row[1]))
    .filter(Boolean);
}

function getConfigMap() {
  const sheet = seedSheetIfEmpty(SHEETS.config, CONFIG_COLUMNS, DEFAULT_CONFIG);
  const values = sheet.getDataRange().getValues();
  values.shift();
  const config = {};
  values.forEach(row => {
    const key = clean(row[0]);
    if (key) config[key] = clean(row[1]);
  });
  return config;
}

function csvResponse(params) {
  const config = getConfigMap();
  const token = clean(params.token);
  const requiredReadToken = clean(config.read_csv_token);
  if (requiredReadToken && token !== requiredReadToken) return jsonResponse({ success: false, error: 'Unauthorized CSV token.' });

  const key = clean(params.sheet || 'current');
  const map = {
    current: SHEETS.current,
    audit: SHEETS.audit,
    dealers: SHEETS.dealers,
    models: SHEETS.models,
    forecast_current: SHEETS.forecastCurrent,
    forecast_audit: SHEETS.forecastAudit,
    errors: SHEETS.errors
  };
  const sheetName = map[key] || SHEETS.current;
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.CSV);

  const values = sheet.getDataRange().getValues();
  const lines = values.map(row => row.map(csvEscape).join(','));
  return ContentService.createTextOutput(lines.join('\n')).setMimeType(ContentService.MimeType.CSV);
}

function parseBody(e) {
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  const bodyText = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  return JSON.parse(bodyText);
}

function shouldReturnHtml(e, body) {
  return Boolean((e && e.parameter && e.parameter.payload) || (body && body.return_mode === 'iframe'));
}

function htmlPostMessage(payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><body><script>' +
    'window.parent.postMessage({source:"gwm-daily-reporting",payload:' + safeJson + '}, "*");' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function logError(err, body) {
  try {
    const sheet = getSheet(SHEETS.errors, ERROR_COLUMNS);
    const first = body && Array.isArray(body.rows) && body.rows.length ? body.rows[0] : {};
    const preview = JSON.stringify(body || {}).slice(0, 1500);
    sheet.appendRow([
      isoTimestamp(new Date()),
      err && err.message ? err.message : String(err),
      clean(first.dealer_code),
      clean(first.report_date),
      preview
    ]);
  } catch (logErr) {}
}

function getSpreadsheet() {
  if (SHEET_ID && SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE') return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function buildSubmissionId(dealerCode, reportDate, revision) {
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMddHHmmss');
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return [dealerCode, reportDate.replace(/-/g, ''), 'R' + revision, stamp, random].join('-');
}

function calculateLateFlag(now, reportDate) {
  const today = localDateIso(now);
  const yesterday = addDaysIso(today, -1);
  if (reportDate < yesterday) return true;
  if (reportDate > yesterday) return true;
  const hour = Number(Utilities.formatDate(now, TIMEZONE, 'H'));
  const config = getConfigMap();
  const cutoff = safeInt(config.cutoff_hour) || CUTOFF_HOUR;
  return hour >= cutoff;
}

function localDateIso(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function addDaysIso(iso, days) {
  const parts = iso.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function isoTimestamp(date) {
  return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function clean(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function safeInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function truthy(value) {
  return value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1' || value === 'yes' || value === 'YES';
}

function normaliseDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error('Invalid date format. Use yyyy-mm-dd.');
}

// Manual setup helper. Run once after pasting code.gs into Apps Script.
function initWorkbookForPilot() {
  setupWorkbookIfNeeded();
  protectDimensionTabs();
  SpreadsheetApp.flush();
  return 'Workbook initialised. Tabs created: current, audit, dealers, model_buckets, config, error_log, forecast_current, forecast_audit.';
}

// Manual reset helper. Clears only current live rows. Audit history remains intact.
function resetCurrentForTesting() {
  const sheet = getSheet(SHEETS.current, CURRENT_COLUMNS);
  sheet.clear();
  ensureHeaders(sheet, CURRENT_COLUMNS);
  SpreadsheetApp.flush();
  return 'submissions_current reset. Audit history was not deleted.';
}

// Optional archive helper before a destructive pilot reset.
function archiveCurrentBeforeReset() {
  const spreadsheet = getSpreadsheet();
  const source = getSheet(SHEETS.current, CURRENT_COLUMNS);
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmmss');
  const copy = source.copyTo(spreadsheet).setName('submissions_current_archive_' + stamp);
  SpreadsheetApp.flush();
  return 'Archive created: ' + copy.getName();
}

// Destructive reset. Use only before internal testing, never mid-rollout.
function resetAllPilotData() {
  [SHEETS.current, SHEETS.audit, SHEETS.errors, SHEETS.forecastCurrent, SHEETS.forecastAudit].forEach(name => {
    const sheet = getSpreadsheet().getSheetByName(name);
    if (sheet) sheet.clear();
  });
  setupWorkbookIfNeeded();
  SpreadsheetApp.flush();
  return 'Pilot data tabs reset. Dealer/model/config tabs were preserved.';
}

function protectDimensionTabs() {
  [SHEETS.dealers, SHEETS.models, SHEETS.config].forEach(name => {
    const sheet = getSpreadsheet().getSheetByName(name);
    if (!sheet) return;
    const protection = sheet.protect().setDescription('GWM reporting protected configuration tab: ' + name);
    protection.setWarningOnly(true);
  });
}

// Internal smoke test utility. Does not submit data, but confirms required setup exists.
function smokeTestSetup() {
  setupWorkbookIfNeeded();
  const activeModels = getActiveModels();
  if (activeModels.length !== DEFAULT_MODELS.length) throw new Error('Active model count mismatch: ' + activeModels.length);
  const dealer = getDealerRecord('H3100');
  if (!dealer.dealer_name) throw new Error('Dealer seed check failed.');
  return 'Smoke test passed. Active models: ' + activeModels.length + '. Sample dealer: ' + dealer.dealer_name + '.';
}
