// ============================================================
// GWM Daily Sales Reporting, v2.6.0 LEAN pilot backend
// Purpose: fast, direct dealer submission receipt for GitHub Pages
// + Google Apps Script + Google Sheets pilot.
//
// Design choice:
// - No status polling path for dealer receipt.
// - No workbook setup/styling on submit.
// - No legacy Daily Direction validation.
// - No visible Fleet 5+ logic.
// - Keep direction/fleet_5_plus columns only for Power BI/header compatibility.
// ============================================================

const SHEET_ID = '1KyuOPWpc7tTIxJxYakZoGg7FMnw9DlrEqCHL80l_7SI';
const APP_VERSION = '2.6.0';
const REGION = 'Southern Region';
const TIMEZONE = 'Australia/Melbourne';
const CUTOFF_HOUR = 10;
const SAME_DAY_UNLOCK_HOUR = 17;
const HARD_MAX_METRIC_VALUE = 9999;
const LOCK_WAIT_MS = 5000;
const CACHE_SECONDS = 300;

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
  'submission_id', 'submitted_at', 'report_date', 'is_late', 'dealer_code', 'dealer_name',
  'region', 'submitted_by', 'direction', 'is_complete_submission', 'input_method',
  'submission_duration_seconds', 'last_updated_at', 'model_bucket', 'enquiry', 'test_drives',
  'new_sold', 'fleet_5_plus', 'demo_sold', 'total_activity', 'revision', 'source'
];

const AUDIT_COLUMNS = CURRENT_COLUMNS.concat(['audit_action', 'client_submitted_at', 'user_agent']);
const ERROR_COLUMNS = ['logged_at', 'error_message', 'dealer_code', 'report_date', 'payload_preview'];
const DEALER_COLUMNS = ['dealer_code', 'dealer_name', 'region', 'active', 'dealer_token', 'contact_email'];
const MODEL_COLUMNS = ['sort_order', 'model_bucket', 'active'];
const CONFIG_COLUMNS = ['key', 'value', 'notes'];
const FORECAST_COLUMNS = ['forecast_id', 'submitted_at', 'forecast_month', 'dealer_code', 'dealer_name', 'region', 'submitted_by', 'model_bucket', 'forecast', 'revision', 'source'];

// Visible inputs only. direction and fleet_5_plus are preserved as output columns for compatibility only.
const METRICS = ['enquiry', 'test_drives', 'new_sold', 'demo_sold'];

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
  ['allow_same_day_after_5pm', 'TRUE', 'Allows same-day close-out submissions from 5:00pm.'],
  ['same_day_unlock_hour', String(SAME_DAY_UNLOCK_HOUR), 'Local hour when same-day close-out reporting becomes available.'],
  ['allow_earlier_corrections', 'TRUE', 'Allows dealer/date corrections for earlier report dates.'],
  ['allow_negative_corrections', 'FALSE', 'Set TRUE only if cancellations should be entered as negative numbers.'],
  ['read_csv_token', '', 'Optional token for Apps Script CSV reads: ?format=csv&sheet=current&token=...'],
  ['cutoff_hour', String(CUTOFF_HOUR), 'Hour in local timezone when same-morning submissions become late.'],
  ['timezone', TIMEZONE, 'Reporting timezone.']
];

function doPost(e) {
  let lock;
  let body = {};
  try {
    body = parseBody(e);
    validateSubmissionShape(body);

    lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error('Reporting system is busy. Wait 20 seconds and submit once.');
    }

    const result = processSubmissionLean(body);
    return shouldReturnHtml(e, body) ? htmlPostMessage(result) : jsonResponse(result);
  } catch (err) {
    try { logError(err, body); } catch (logErr) {}
    const result = { success: false, version: APP_VERSION, error: err.message };
    return shouldReturnHtml(e, body) ? htmlPostMessage(result) : jsonResponse(result);
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (releaseErr) {}
    }
  }
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (params.format === 'csv') return csvResponse(params);
  if (params.health) return jsonResponse(healthPayload());
  return jsonResponse({
    success: true,
    message: 'GWM Daily Reporting v2.6.0 lean endpoint is live',
    sheets: SHEETS,
    version: APP_VERSION
  });
}

function processSubmissionLean(body) {
  assertOperationalSheetsReady();
  validateAccess(body);

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const first = rows[0] || {};
  const dealerCode = clean(first.dealer_code).toUpperCase();
  const reportDate = normaliseDate(first.report_date);
  const submittedBy = clean(first.submitted_by);

  if (!dealerCode) throw new Error('dealer_code is required.');
  if (!reportDate) throw new Error('report_date is required.');
  if (!submittedBy) throw new Error('Submitted by is required.');

  validateReportDate(reportDate);

  const dealer = getDealerRecord(dealerCode);
  validateDealerToken(body, dealer);

  const activeModels = getActiveModels();
  validateModelRows(rows, activeModels);

  const config = getConfigMap();
  const allowNegative = truthy(config.allow_negative_corrections);

  const submittedAtDate = new Date();
  const submittedAt = isoTimestamp(submittedAtDate);
  const isLate = calculateLateFlag(submittedAtDate, reportDate);
  const revisionInfo = getRevisionInfoFromCurrent(dealer.dealer_code, reportDate);
  const revision = revisionInfo.maxRevision + 1;
  const submissionId = buildSubmissionId(dealer.dealer_code, reportDate, revision);
  const auditAction = revision > 1 ? 'replace_current' : 'new_current';
  const inputMethod = clean(first.input_method) || 'single_index_v2_6_0_activity_first';
  const duration = safeInt(first.submission_duration_seconds);
  const clientSubmittedAt = clean(body.client_submitted_at);
  const userAgent = clean(body.user_agent);

  const submittedByModel = {};
  rows.forEach(row => submittedByModel[clean(row.model_bucket)] = row);

  const cleanedRows = activeModels.map(model => {
    const submittedRow = submittedByModel[model] || {};
    const metrics = {};
    METRICS.forEach(metric => {
      metrics[metric] = validateMetric(submittedRow[metric], metric, model, allowNegative);
    });
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
      direction: 'Flat',
      is_complete_submission: true,
      input_method: inputMethod,
      submission_duration_seconds: duration,
      last_updated_at: submittedAt,
      model_bucket: model,
      enquiry: metrics.enquiry,
      test_drives: metrics.test_drives,
      new_sold: metrics.new_sold,
      fleet_5_plus: 0,
      demo_sold: metrics.demo_sold,
      total_activity: totalActivity,
      revision: revision,
      source: 'index_html_v2_6_0_activity_first',
      audit_action: auditAction,
      client_submitted_at: clientSubmittedAt,
      user_agent: userAgent
    };
  });

  const totalActivity = cleanedRows.reduce((sum, row) => sum + row.total_activity, 0);
  if (totalActivity === 0 && body.confirm_all_zero !== true) {
    throw new Error('All-zero submission rejected. Confirm genuine zero activity before submitting.');
  }

  // Fast write path: only two batch writes plus targeted current-row replacement.
  appendAuditRows(cleanedRows);
  replaceCurrentRows(cleanedRows, dealer.dealer_code, reportDate, revisionInfo.rowsToDelete);

  return {
    success: true,
    version: APP_VERSION,
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

function validateSubmissionShape(body) {
  if (!body || !Array.isArray(body.rows) || !body.rows.length) throw new Error('No rows supplied.');
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
  const today = localDateIso(new Date());
  const now = new Date();
  const allowEarlier = config.allow_earlier_corrections === undefined ? true : truthy(config.allow_earlier_corrections);
  const allowSameDay = config.allow_same_day_after_5pm === undefined ? true : truthy(config.allow_same_day_after_5pm);
  const unlockHour = safeInt(config.same_day_unlock_hour || SAME_DAY_UNLOCK_HOUR);
  const yesterday = addDaysIso(today, -1);

  if (reportDate > today) throw new Error('Future report dates are not allowed.');
  if (reportDate === today && (!allowSameDay || now.getHours() < unlockHour)) {
    throw new Error('Current-day reporting opens from 5:00pm. Select yesterday for prior-day reporting.');
  }
  if (!allowEarlier && reportDate !== yesterday && reportDate !== today) {
    throw new Error('Only yesterday can be submitted for this pilot.');
  }
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

function validateMetric(value, metric, model, allowNegative) {
  const text = clean(value);
  const number = text === '' ? 0 : Number(text);
  if (!Number.isInteger(number)) throw new Error(metric + ' for ' + model + ' must be a whole number.');
  if (!allowNegative && number < 0) throw new Error(metric + ' for ' + model + ' must be zero or above.');
  if (Math.abs(number) > HARD_MAX_METRIC_VALUE) throw new Error(metric + ' for ' + model + ' is above the hard limit of ' + HARD_MAX_METRIC_VALUE + '.');
  return number;
}

function getRevisionInfoFromCurrent(dealerCode, reportDate) {
  const sheet = getExistingSheet(SHEETS.current);
  const lastRow = sheet.getLastRow();
  const info = { maxRevision: 0, rowsToDelete: [] };
  if (lastRow <= 1) return info;

  const values = sheet.getRange(2, 1, lastRow - 1, CURRENT_COLUMNS.length).getValues();
  const dealerCol = CURRENT_COLUMNS.indexOf('dealer_code');
  const dateCol = CURRENT_COLUMNS.indexOf('report_date');
  const revisionCol = CURRENT_COLUMNS.indexOf('revision');

  values.forEach((row, index) => {
    if (clean(row[dealerCol]) === dealerCode && normaliseDate(row[dateCol]) === reportDate) {
      const revision = safeInt(row[revisionCol]);
      if (revision > info.maxRevision) info.maxRevision = revision;
      info.rowsToDelete.push(index + 2);
    }
  });
  return info;
}

function appendAuditRows(rows) {
  const sheet = getExistingSheet(SHEETS.audit);
  const output = rows.map(row => AUDIT_COLUMNS.map(col => valueFromRow(row, col)));
  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, AUDIT_COLUMNS.length).setValues(output);
}

function replaceCurrentRows(rows, dealerCode, reportDate, rowsToDelete) {
  const sheet = getExistingSheet(SHEETS.current);
  if (rowsToDelete && rowsToDelete.length) deleteRowsInGroups(sheet, rowsToDelete);
  const output = rows.map(row => CURRENT_COLUMNS.map(col => valueFromRow(row, col)));
  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, CURRENT_COLUMNS.length).setValues(output);
}

function deleteRowsInGroups(sheet, rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) return;
  const sorted = rowNumbers.slice().sort((a, b) => b - a);
  let groupStart = sorted[0];
  let groupCount = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === groupStart - groupCount) {
      groupCount++;
    } else {
      sheet.deleteRows(groupStart - groupCount + 1, groupCount);
      groupStart = sorted[i];
      groupCount = 1;
    }
  }
  sheet.deleteRows(groupStart - groupCount + 1, groupCount);
}

function valueFromRow(row, col) {
  const value = row[col];
  if (col === 'is_late' || col === 'is_complete_submission') return value ? 'TRUE' : 'FALSE';
  return value === undefined || value === null ? '' : value;
}

function getDealerRecord(dealerCode) {
  const dealers = getDealersMap();
  const dealer = dealers[clean(dealerCode).toUpperCase()];
  if (!dealer) throw new Error('Unknown dealer code: ' + dealerCode);
  if (!truthy(dealer.active)) throw new Error('Dealer is inactive: ' + dealerCode);
  return dealer;
}

function getDealersMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('dealers_map_v260');
  if (cached) return JSON.parse(cached);

  const sheet = getExistingSheet(SHEETS.dealers);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(clean);
  const map = {};
  values.forEach(row => {
    const record = rowToObject(headers, row);
    const code = clean(record.dealer_code).toUpperCase();
    if (code) map[code] = {
      dealer_code: code,
      dealer_name: clean(record.dealer_name),
      region: clean(record.region),
      active: record.active,
      dealer_token: clean(record.dealer_token),
      contact_email: clean(record.contact_email)
    };
  });
  cache.put('dealers_map_v260', JSON.stringify(map), CACHE_SECONDS);
  return map;
}

function getActiveModels() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('active_models_v260');
  if (cached) return JSON.parse(cached);

  const sheet = getExistingSheet(SHEETS.models);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(clean);
  const sortCol = headers.indexOf('sort_order');
  const modelCol = headers.indexOf('model_bucket');
  const activeCol = headers.indexOf('active');

  const models = values
    .filter(row => clean(row[modelCol]) && truthy(row[activeCol]))
    .sort((a, b) => safeInt(a[sortCol]) - safeInt(b[sortCol]))
    .map(row => clean(row[modelCol]));

  if (!models.length) throw new Error('No active model buckets configured.');
  cache.put('active_models_v260', JSON.stringify(models), CACHE_SECONDS);
  return models;
}

function getConfigMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('config_map_v260');
  if (cached) return JSON.parse(cached);

  const sheet = getExistingSheet(SHEETS.config);
  const values = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const key = clean(values[i][0]);
    if (key) map[key] = clean(values[i][1]);
  }
  cache.put('config_map_v260', JSON.stringify(map), CACHE_SECONDS);
  return map;
}

function csvResponse(params) {
  const config = getConfigMap();
  const requiredToken = clean(config.read_csv_token);
  if (requiredToken && clean(params.token) !== requiredToken) {
    return jsonResponse({ success: false, error: 'Unauthorized CSV token.' });
  }

  const map = {
    current: { name: SHEETS.current, columns: CURRENT_COLUMNS },
    audit: { name: SHEETS.audit, columns: AUDIT_COLUMNS },
    dealers: { name: SHEETS.dealers, columns: DEALER_COLUMNS },
    models: { name: SHEETS.models, columns: MODEL_COLUMNS },
    config: { name: SHEETS.config, columns: CONFIG_COLUMNS },
    errors: { name: SHEETS.errors, columns: ERROR_COLUMNS },
    forecast_current: { name: SHEETS.forecastCurrent, columns: FORECAST_COLUMNS },
    forecast_audit: { name: SHEETS.forecastAudit, columns: FORECAST_COLUMNS }
  };
  const key = clean(params.sheet || 'current');
  const selected = map[key];
  if (!selected) return jsonResponse({ success: false, error: 'Unknown CSV sheet: ' + key });

  const sheet = getExistingSheet(selected.name);
  const values = sheet.getDataRange().getValues();
  const csv = values.map(row => row.map(csvEscape).join(',')).join('\n');
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

function parseBody(e) {
  if (!e || !e.parameter) return {};
  if (e.parameter.payload) return JSON.parse(e.parameter.payload);
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) {}
  }
  return e.parameter || {};
}

function shouldReturnHtml(e, body) {
  return body && clean(body.return_mode).indexOf('iframe_postmessage') === 0;
}

function htmlPostMessage(payload) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><body><script>' +
    'window.parent.postMessage({source:"gwm-daily-reporting",payload:' + json + '},"*");' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function csvEscape(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function logError(err, body) {
  const sheet = getExistingSheet(SHEETS.errors);
  const first = body && Array.isArray(body.rows) && body.rows.length ? body.rows[0] : {};
  const preview = JSON.stringify(body || {}).slice(0, 1000);
  sheet.appendRow([isoTimestamp(new Date()), err.message || String(err), clean(first.dealer_code), clean(first.report_date), preview]);
}

function assertOperationalSheetsReady() {
  const spreadsheet = getSpreadsheet();
  const required = [SHEETS.current, SHEETS.audit, SHEETS.dealers, SHEETS.models, SHEETS.config, SHEETS.errors];
  required.forEach(name => {
    if (!spreadsheet.getSheetByName(name)) {
      throw new Error('Required sheet missing: ' + name + '. Run initLeanWorkbookOnce before rollout.');
    }
  });
}

function getExistingSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Required sheet missing: ' + name + '. Run initLeanWorkbookOnce before rollout.');
  return sheet;
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => obj[header] = row[index]);
  return obj;
}

function healthPayload() {
  return {
    success: true,
    version: APP_VERSION,
    timestamp: isoTimestamp(new Date()),
    current_rows: safeSheetRows(SHEETS.current),
    audit_rows: safeSheetRows(SHEETS.audit),
    dealers: Object.keys(getDealersMap()).length,
    models: getActiveModels().length
  };
}

function safeSheetRows(name) {
  try { return Math.max(0, getExistingSheet(name).getLastRow() - 1); } catch (err) { return null; }
}

function initLeanWorkbookOnce() {
  // Run manually before pilot, not during dealer submit.
  getOrCreateSheet(SHEETS.current, CURRENT_COLUMNS);
  getOrCreateSheet(SHEETS.audit, AUDIT_COLUMNS);
  getOrCreateSheet(SHEETS.errors, ERROR_COLUMNS);
  seedSheetIfEmpty(SHEETS.dealers, DEALER_COLUMNS, DEFAULT_DEALERS);
  seedSheetIfEmpty(SHEETS.models, MODEL_COLUMNS, DEFAULT_MODELS.map((model, index) => [index + 1, model, 'TRUE']));
  seedSheetIfEmpty(SHEETS.config, CONFIG_COLUMNS, DEFAULT_CONFIG);
  getOrCreateSheet(SHEETS.forecastCurrent, FORECAST_COLUMNS);
  getOrCreateSheet(SHEETS.forecastAudit, FORECAST_COLUMNS);
  clearRuntimeCache();
}

function getOrCreateSheet(name, columns) {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  ensureHeaders(sheet, columns);
  return sheet;
}

function seedSheetIfEmpty(name, columns, rows) {
  const sheet = getOrCreateSheet(name, columns);
  if (sheet.getLastRow() > 1) return sheet;
  if (rows && rows.length) sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
  return sheet;
}

function ensureHeaders(sheet, columns) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    return;
  }
  const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), columns.length)).getValues()[0];
  let changed = false;
  for (let i = 0; i < columns.length; i++) {
    if (clean(header[i]) !== columns[i]) { changed = true; break; }
  }
  if (changed) sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
}

function clearRuntimeCache() {
  const cache = CacheService.getScriptCache();
  ['dealers_map_v260', 'active_models_v260', 'config_map_v260'].forEach(key => cache.remove(key));
}

function shrinkOperationalSheets() {
  // Optional manual tidy only. Never called during submit.
  [SHEETS.current, SHEETS.audit, SHEETS.errors].forEach(name => {
    const sheet = getSpreadsheet().getSheetByName(name);
    if (!sheet) return;
    const lastRow = Math.max(1, sheet.getLastRow());
    const maxRows = sheet.getMaxRows();
    if (maxRows > lastRow + 200) sheet.deleteRows(lastRow + 201, maxRows - lastRow - 200);
  });
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function buildSubmissionId(dealerCode, reportDate, revision) {
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMddHHmmss');
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return dealerCode + '-' + reportDate.replace(/-/g, '') + '-R' + revision + '-' + stamp + '-' + suffix;
}

function calculateLateFlag(now, reportDate) {
  const today = localDateIso(now);
  if (reportDate < today) return true;
  if (reportDate > today) return false;
  return now.getHours() >= CUTOFF_HOUR;
}

function localDateIso(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function addDaysIso(iso, days) {
  const date = new Date(iso + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function isoTimestamp(date) {
  return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function clean(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function safeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function truthy(value) {
  const text = clean(value).toLowerCase();
  return ['true', 'yes', 'y', '1', 'on'].indexOf(text) !== -1;
}

function normaliseDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, TIMEZONE, 'yyyy-MM-dd');
  return '';
}
