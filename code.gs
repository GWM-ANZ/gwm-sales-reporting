// ============================================================
// GWM Daily Sales Reporting, v2.4.6 pilot-hardened backend
// Purpose: accept dealer index.html submissions, validate server-side,
// write active rows to submissions_current, retain every version in
// submissions_audit, and expose clean CSV output for Power BI.
// ============================================================

const SHEET_ID = '1KyuOPWpc7tTIxJxYakZoGg7FMnw9DlrEqCHL80l_7SI';
const REGION = 'Southern Region';
const TIMEZONE = 'Australia/Melbourne';
const CUTOFF_HOUR = 10;
const SAME_DAY_UNLOCK_HOUR = 17;
const HARD_MAX_METRIC_VALUE = 9999;
const APP_VERSION = '2.4.6';
const LOCK_WAIT_MS = 30000;
const CACHE_SECONDS = 300;
const CACHE_KEYS = {
  dealers: 'dealers_map_v246',
  models: 'active_models_v246',
  config: 'config_map_v246'
};

const SHEETS = {
  current: 'submissions_current',
  audit: 'submissions_audit',
  dealers: 'dealers',
  models: 'model_buckets',
  config: 'config',
  errors: 'error_log',
  forecastCurrent: 'forecast_current',
  forecastAudit: 'forecast_audit',
  status: 'submissions_status'
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

const STATUS_COLUMNS = [
  'client_submission_id',
  'status',
  'submission_id',
  'dealer_code',
  'dealer_name',
  'report_date',
  'rows_written',
  'audit_rows_written',
  'revision',
  'is_late',
  'total_activity',
  'message',
  'error',
  'updated_at'
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
  ['cutoff_hour', String(CUTOFF_HOUR), 'Hour in local timezone when prior-day submissions become late.'],
  ['same_day_unlock_hour', String(SAME_DAY_UNLOCK_HOUR), 'Hour in local timezone when current-day reporting opens. 17 means 5:00pm.'],
  ['timezone', TIMEZONE, 'Reporting timezone.']
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  let body = {};
  let clientSubmissionId = '';

  try {
    body = parseBody(e);
    clientSubmissionId = clean(body.client_submission_id);

    lock.waitLock(LOCK_WAIT_MS);

    if (clientSubmissionId) {
      try {
        upsertSubmissionStatus(clientSubmissionId, {
          status: 'processing',
          message: 'Received by Apps Script.',
          updated_at: isoTimestamp(new Date())
        });
      } catch (statusErr) {
        // Status logging must never block a dealer submission.
      }
    }

    const result = processSubmission(body);

    if (clientSubmissionId) {
      try {
        upsertSubmissionStatus(clientSubmissionId, {
          status: 'completed',
          submission_id: result.submission_id,
          dealer_code: result.dealer_code,
          dealer_name: result.dealer_name,
          report_date: result.report_date,
          rows_written: result.rows_written,
          audit_rows_written: result.audit_rows_written,
          revision: result.revision,
          is_late: result.is_late,
          total_activity: result.total_activity,
          message: 'Submission completed.',
          error: '',
          updated_at: isoTimestamp(new Date())
        });
      } catch (statusErr) {
        // The current/audit write has succeeded. Do not turn a good submission into a failure
        // just because the receipt/status helper sheet had a temporary issue.
        try { logError(statusErr, body); } catch (logErr) {}
      }
    }

    return shouldReturnHtml(e, body) ? htmlPostMessage(result) : jsonResponse(result);
  } catch (err) {
    logError(err, body);

    if (clientSubmissionId) {
      try {
        const first = body && Array.isArray(body.rows) && body.rows.length ? body.rows[0] : {};
        upsertSubmissionStatus(clientSubmissionId, {
          status: 'failed',
          dealer_code: clean(first.dealer_code),
          dealer_name: clean(first.dealer_name),
          report_date: clean(first.report_date),
          message: 'Submission rejected.',
          error: err.message,
          updated_at: isoTimestamp(new Date())
        });
      } catch (statusErr) {}
    }

    const result = { success: false, version: APP_VERSION, error: err.message };
    return shouldReturnHtml(e, body) ? htmlPostMessage(result) : jsonResponse(result);
  } finally {
    try { lock.releaseLock(); } catch (releaseErr) {}
  }
}

function doGet(e) {
  setupWorkbookIfNeeded();

  const params = e && e.parameter ? e.parameter : {};

  if (params.health) return callbackOrJson(params, healthPayload());
  if (params.status) return callbackOrJson(params, getSubmissionStatus(params.status));
  if (params.verify) return callbackOrJson(params, verifyCurrentSubmission(params));
  if (params.format === 'csv') return csvResponse(params);

  return callbackOrJson(params, {
    success: true,
    message: 'GWM Daily Reporting v2.4.6 endpoint is live',
    sheets: SHEETS,
    version: APP_VERSION
  });
}

function processSubmission(body) {
  ensureSubmissionSheetsReady();
  validateAccess(body);

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw new Error('No rows supplied.');

  const first = rows[0];
  const dealerCode = clean(first.dealer_code);
  const reportDate = normaliseDate(first.report_date);
  const submittedBy = clean(first.submitted_by);

  if (!dealerCode) throw new Error('dealer_code is required.');
  if (!reportDate) throw new Error('report_date is required.');
  if (!submittedBy) throw new Error('submitted_by is required.');

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
  const inputMethod = clean(first.input_method) || 'single_index_v2_4_6_activity_first';
  const duration = safeInt(first.submission_duration_seconds);
  const clientSubmittedAt = clean(body.client_submitted_at);
  const userAgent = clean(body.user_agent);
  const source = 'index_html_v2_4_6_activity_first';

  const cleanedRows = activeModels.map(model => {
    const submittedRow = rows.find(row => clean(row.model_bucket) === model);
    const metrics = {};

    METRICS.forEach(metric => {
      metrics[metric] = validateMetric(submittedRow ? submittedRow[metric] : 0, metric, model);
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

      // Legacy compatibility column. Direction is no longer dealer-facing.
      // Use Flat so any old validation or report dependency does not reject blank values.
      direction: 'Flat',

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

function validateAccess(body) {
  const config = getConfigMap();
  const requiredCode = clean(config.pilot_access_code);

  if (requiredCode && clean(body.code) !== requiredCode) {
    throw new Error('Unauthorized. Pilot access code is incorrect.');
  }
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
  const currentHour = Number(Utilities.formatDate(new Date(), TIMEZONE, 'H'));
  const sameDayUnlockHour = safeInt(config.same_day_unlock_hour) || SAME_DAY_UNLOCK_HOUR;

  if (reportDate > today) throw new Error('Future report dates are not allowed.');

  if (!allowToday && reportDate === today && currentHour < sameDayUnlockHour) {
    throw new Error('Current-day reporting opens from 5:00pm. Select yesterday for prior-day reporting.');
  }

  if (!allowToday && reportDate > today) {
    throw new Error('Future report dates are not allowed.');
  }

  if (!allowEarlier && reportDate !== yesterday && reportDate !== today) {
    throw new Error('Only yesterday or current-day after 5:00pm can be submitted for this pilot.');
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

function validateMetric(value, metric, model) {
  const text = clean(value);
  const number = text === '' ? 0 : Number(text);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(metric + ' for ' + model + ' must be a whole number of zero or above.');
  }

  if (number > HARD_MAX_METRIC_VALUE) {
    throw new Error(metric + ' for ' + model + ' is above the hard limit of ' + HARD_MAX_METRIC_VALUE + '.');
  }

  return number;
}

function getNextRevision(dealerCode, reportDate) {
  // Faster path: current only contains the latest active dealer/date rows.
  // This avoids scanning the full audit history on every morning submission.
  const currentMax = getMaxRevisionForDealerDate(SHEETS.current, CURRENT_COLUMNS, dealerCode, reportDate);
  if (currentMax > 0) return currentMax + 1;

  // Fallback: use audit if current was reset during testing or recovery.
  const auditMax = getMaxRevisionForDealerDate(SHEETS.audit, AUDIT_COLUMNS, dealerCode, reportDate);
  return auditMax + 1;
}

function getMaxRevisionForDealerDate(sheetName, columns, dealerCode, reportDate) {
  const sheet = getPlainSheet(sheetName);
  if (!sheet) return 0;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  const dealerCol = columns.indexOf('dealer_code');
  const dateCol = columns.indexOf('report_date');
  const revisionCol = columns.indexOf('revision');
  let maxRevision = 0;

  values.forEach(row => {
    if (clean(row[dealerCol]) === dealerCode && safeNormaliseDate(row[dateCol]) === reportDate) {
      const revision = safeInt(row[revisionCol]);
      if (revision > maxRevision) maxRevision = revision;
    }
  });

  return maxRevision;
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
  const rowsToDelete = [];

  for (let i = 0; i < values.length; i++) {
    const rowDealer = clean(values[i][dealerCol]);
    const rowDate = safeNormaliseDate(values[i][dateCol]);

    if (rowDealer === dealerCode && rowDate === reportDate) {
      rowsToDelete.push(i + 2);
    }
  }

  deleteRowsInGroups(sheet, rowsToDelete);
}

function deleteRowsInGroups(sheet, rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) return;

  const sorted = rowNumbers.slice().sort((a, b) => b - a);
  let groupStart = sorted[0];
  let groupCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const row = sorted[i];

    if (row === groupStart - groupCount) {
      groupCount++;
    } else {
      sheet.deleteRows(groupStart - groupCount + 1, groupCount);
      groupStart = row;
      groupCount = 1;
    }
  }

  sheet.deleteRows(groupStart - groupCount + 1, groupCount);
}

function valueFromRow(row, col) {
  const value = row[col];

  if (col === 'is_late' || col === 'is_complete_submission') {
    return value ? 'TRUE' : 'FALSE';
  }

  return value === undefined || value === null ? '' : value;
}

function setupWorkbookIfNeeded() {
  getSheet(SHEETS.current, CURRENT_COLUMNS);
  getSheet(SHEETS.audit, AUDIT_COLUMNS);
  getSheet(SHEETS.errors, ERROR_COLUMNS);
  getSheet(SHEETS.status, STATUS_COLUMNS);
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

  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
  }

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

  const current = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), columns.length))
    .getValues()[0]
    .slice(0, columns.length)
    .map(v => clean(v));

  const matches = current.length === columns.length && columns.every((c, i) => current[i] === c);

  if (!matches) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }

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
  const dealers = getDealersMap();
  const dealer = dealers[dealerCode];

  if (!dealer) throw new Error('Unknown dealer_code: ' + dealerCode);
  if (!truthy(dealer.active)) throw new Error('Dealer is inactive: ' + dealerCode);

  return {
    dealer_code: dealer.dealer_code,
    dealer_name: dealer.dealer_name,
    region: dealer.region || REGION,
    dealer_token: dealer.dealer_token || ''
  };
}

function getDealersMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEYS.dealers);

  if (cached) return JSON.parse(cached);

  const sheet = getPlainSheet(SHEETS.dealers) || seedSheetIfEmpty(SHEETS.dealers, DEALER_COLUMNS, DEFAULT_DEALERS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return {};

  const values = sheet.getRange(1, 1, lastRow, DEALER_COLUMNS.length).getValues();
  const header = values.shift().map(clean);
  const codeCol = header.indexOf('dealer_code');
  const nameCol = header.indexOf('dealer_name');
  const regionCol = header.indexOf('region');
  const activeCol = header.indexOf('active');
  const tokenCol = header.indexOf('dealer_token');
  const map = {};

  values.forEach(row => {
    const code = clean(row[codeCol]);
    if (!code) return;

    map[code] = {
      dealer_code: code,
      dealer_name: clean(row[nameCol]),
      region: clean(row[regionCol]) || REGION,
      active: clean(row[activeCol]) || 'TRUE',
      dealer_token: tokenCol >= 0 ? clean(row[tokenCol]) : ''
    };
  });

  cache.put(CACHE_KEYS.dealers, JSON.stringify(map), CACHE_SECONDS);

  return map;
}

function getActiveModels() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEYS.models);

  if (cached) return JSON.parse(cached);

  const sheet = getPlainSheet(SHEETS.models) || seedSheetIfEmpty(SHEETS.models, MODEL_COLUMNS, DEFAULT_MODELS.map((model, index) => [index + 1, model, 'TRUE']));
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return DEFAULT_MODELS.slice();

  const values = sheet.getRange(2, 1, lastRow - 1, MODEL_COLUMNS.length).getValues();
  const models = values
    .filter(row => truthy(row[2]))
    .sort((a, b) => safeInt(a[0]) - safeInt(b[0]))
    .map(row => clean(row[1]))
    .filter(Boolean);

  cache.put(CACHE_KEYS.models, JSON.stringify(models), CACHE_SECONDS);

  return models;
}

function getConfigMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEYS.config);

  if (cached) return JSON.parse(cached);

  const sheet = getPlainSheet(SHEETS.config) || seedSheetIfEmpty(SHEETS.config, CONFIG_COLUMNS, DEFAULT_CONFIG);
  const lastRow = sheet.getLastRow();
  const config = {};

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, CONFIG_COLUMNS.length).getValues();

    values.forEach(row => {
      const key = clean(row[0]);
      if (key) config[key] = clean(row[1]);
    });
  }

  cache.put(CACHE_KEYS.config, JSON.stringify(config), CACHE_SECONDS);

  return config;
}

function getPlainSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function healthPayload() {
  const config = getConfigMap();

  return {
    success: true,
    version: APP_VERSION,
    timestamp: isoTimestamp(new Date()),
    active_models: getActiveModels().length,
    active_dealers: getActiveDealerCount(),
    cutoff_hour: safeInt(config.cutoff_hour) || CUTOFF_HOUR,
    same_day_unlock_hour: safeInt(config.same_day_unlock_hour) || SAME_DAY_UNLOCK_HOUR,
    timezone: clean(config.timezone) || TIMEZONE,
    lock_wait_ms: LOCK_WAIT_MS
  };
}

function getActiveDealerCount() {
  const dealers = getDealersMap();

  return Object.keys(dealers).filter(code => truthy(dealers[code].active)).length;
}


function verifyCurrentSubmission(params) {
  try {
    const dealerCode = clean(params.dealer);
    const reportDate = normaliseDate(params.date);
    const expectedTotalText = clean(params.total);
    const expectedTotal = expectedTotalText === '' ? null : safeInt(expectedTotalText);
    const suppliedToken = clean(params.token);

    if (!dealerCode) return { success: false, found: false, error: 'Missing dealer.', version: APP_VERSION };
    if (!reportDate) return { success: false, found: false, error: 'Missing report date.', version: APP_VERSION };

    const dealer = getDealerRecord(dealerCode);

    if (clean(dealer.dealer_token) && suppliedToken !== clean(dealer.dealer_token)) {
      return { success: false, found: false, error: 'Unauthorized dealer token.', version: APP_VERSION };
    }

    const sheet = getSheet(SHEETS.current, CURRENT_COLUMNS);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return {
        success: true,
        found: false,
        status: 'not_found',
        dealer_code: dealer.dealer_code,
        dealer_name: dealer.dealer_name,
        report_date: reportDate,
        version: APP_VERSION
      };
    }

    const values = sheet.getRange(2, 1, lastRow - 1, CURRENT_COLUMNS.length).getValues();
    const dealerCol = CURRENT_COLUMNS.indexOf('dealer_code');
    const dateCol = CURRENT_COLUMNS.indexOf('report_date');
    const totalCol = CURRENT_COLUMNS.indexOf('total_activity');
    const revisionCol = CURRENT_COLUMNS.indexOf('revision');
    const lateCol = CURRENT_COLUMNS.indexOf('is_late');
    const submissionCol = CURRENT_COLUMNS.indexOf('submission_id');

    const matching = values.filter(row => {
      return clean(row[dealerCol]) === dealer.dealer_code && safeNormaliseDate(row[dateCol]) === reportDate;
    });

    if (!matching.length) {
      return {
        success: true,
        found: false,
        status: 'not_found',
        dealer_code: dealer.dealer_code,
        dealer_name: dealer.dealer_name,
        report_date: reportDate,
        version: APP_VERSION
      };
    }

    const maxRevision = matching.reduce((max, row) => Math.max(max, safeInt(row[revisionCol])), 0);
    const latestRows = matching.filter(row => safeInt(row[revisionCol]) === maxRevision);
    const totalActivity = latestRows.reduce((sum, row) => sum + safeInt(row[totalCol]), 0);
    const isLate = latestRows.some(row => truthy(row[lateCol]));
    const submissionId = clean(latestRows[0][submissionCol]);

    return {
      success: true,
      found: true,
      status: 'completed',
      submission_id: submissionId,
      dealer_code: dealer.dealer_code,
      dealer_name: dealer.dealer_name,
      report_date: reportDate,
      rows_written: latestRows.length,
      audit_rows_written: latestRows.length,
      revision: maxRevision,
      is_late: isLate,
      total_activity: totalActivity,
      matched_total: expectedTotal === null ? true : totalActivity === expectedTotal,
      message: 'Verified from current submission table.',
      version: APP_VERSION
    };
  } catch (err) {
    return { success: false, found: false, error: err.message, version: APP_VERSION };
  }
}


function getSubmissionStatus(clientSubmissionId) {
  const id = clean(clientSubmissionId);

  if (!id) return { found: false, status: 'missing', error: 'Missing client submission id.' };

  const sheet = getSheet(SHEETS.status, STATUS_COLUMNS);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return { found: false, status: 'not_found' };

  const values = sheet.getRange(2, 1, lastRow - 1, STATUS_COLUMNS.length).getValues();
  const idCol = STATUS_COLUMNS.indexOf('client_submission_id');

  for (let i = values.length - 1; i >= 0; i--) {
    if (clean(values[i][idCol]) === id) {
      return rowToObject(STATUS_COLUMNS, values[i], true);
    }
  }

  return { found: false, status: 'not_found' };
}

function upsertSubmissionStatus(clientSubmissionId, patch) {
  const id = clean(clientSubmissionId);

  if (!id) return;

  const sheet = getSheet(SHEETS.status, STATUS_COLUMNS);
  const lastRow = sheet.getLastRow();
  let targetRow = 0;

  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let i = ids.length - 1; i >= 0; i--) {
      if (clean(ids[i][0]) === id) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const existing = targetRow
    ? rowToObject(STATUS_COLUMNS, sheet.getRange(targetRow, 1, 1, STATUS_COLUMNS.length).getValues()[0], false)
    : {};

  const merged = Object.assign({}, existing, patch || {}, {
    client_submission_id: id,
    updated_at: (patch && patch.updated_at) || isoTimestamp(new Date())
  });

  const output = STATUS_COLUMNS.map(col => valueFromRow(merged, col));

  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, STATUS_COLUMNS.length).setValues([output]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, STATUS_COLUMNS.length).setValues([output]);
  }
}

function rowToObject(columns, row, includeFound) {
  const obj = includeFound ? { found: true } : {};

  columns.forEach((col, index) => {
    obj[col] = row[index];
  });

  return obj;
}

function callbackOrJson(params, payload) {
  const callback = clean(params.callback);

  if (callback) return jsonpResponse(callback, payload);

  return jsonResponse(payload);
}

function jsonpResponse(callback, payload) {
  const safeCallback = clean(callback).replace(/[^A-Za-z0-9_.$]/g, '');

  if (!safeCallback) return jsonResponse({ success: false, error: 'Invalid callback.' });

  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');

  return ContentService.createTextOutput(safeCallback + '(' + safeJson + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function csvResponse(params) {
  const config = getConfigMap();
  const token = clean(params.token);
  const requiredReadToken = clean(config.read_csv_token);

  if (requiredReadToken && token !== requiredReadToken) {
    return jsonResponse({ success: false, error: 'Unauthorized CSV token.' });
  }

  const key = clean(params.sheet || 'current');

  const map = {
    current: SHEETS.current,
    audit: SHEETS.audit,
    dealers: SHEETS.dealers,
    models: SHEETS.models,
    forecast_current: SHEETS.forecastCurrent,
    forecast_audit: SHEETS.forecastAudit,
    status: SHEETS.status,
    config: SHEETS.config,
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

function ensureSubmissionSheetsReady() {
  const spreadsheet = getSpreadsheet();
  const required = [
    [SHEETS.current, CURRENT_COLUMNS],
    [SHEETS.audit, AUDIT_COLUMNS],
    [SHEETS.errors, ERROR_COLUMNS],
    [SHEETS.status, STATUS_COLUMNS],
    [SHEETS.dealers, DEALER_COLUMNS],
    [SHEETS.models, MODEL_COLUMNS],
    [SHEETS.config, CONFIG_COLUMNS]
  ];

  required.forEach(pair => {
    const sheet = spreadsheet.getSheetByName(pair[0]);

    if (!sheet) {
      throw new Error('Required sheet missing: ' + pair[0] + '. Run initWorkbookForPilot.');
    }

    const headers = sheet.getRange(1, 1, 1, pair[1].length).getValues()[0].map(clean);
    const ok = pair[1].every((col, index) => headers[index] === col);

    if (!ok) {
      throw new Error('Header mismatch on sheet: ' + pair[0] + '. Run initWorkbookForPilot.');
    }
  });
}

function clearRuntimeCache() {
  CacheService.getScriptCache().removeAll([CACHE_KEYS.dealers, CACHE_KEYS.models, CACHE_KEYS.config]);

  return 'Runtime cache cleared for ' + APP_VERSION + '.';
}

function removeLegacyDirectionValidation() {
  const targets = [
    { name: SHEETS.current, columns: CURRENT_COLUMNS },
    { name: SHEETS.audit, columns: AUDIT_COLUMNS }
  ];

  targets.forEach(target => {
    const sheet = getSpreadsheet().getSheetByName(target.name);
    if (!sheet) return;

    const directionColIndex = target.columns.indexOf('direction') + 1;
    if (directionColIndex <= 0) return;

    const maxRows = sheet.getMaxRows();
    sheet.getRange(1, directionColIndex, maxRows, 1).clearDataValidations();
  });

  SpreadsheetApp.flush();

  return 'Legacy direction validation removed from current and audit sheets.';
}

function shrinkOperationalSheets() {
  [
    [SHEETS.current, CURRENT_COLUMNS.length],
    [SHEETS.audit, AUDIT_COLUMNS.length],
    [SHEETS.errors, ERROR_COLUMNS.length],
    [SHEETS.status, STATUS_COLUMNS.length],
    [SHEETS.dealers, DEALER_COLUMNS.length],
    [SHEETS.models, MODEL_COLUMNS.length],
    [SHEETS.config, CONFIG_COLUMNS.length],
    [SHEETS.forecastCurrent, FORECAST_COLUMNS.length],
    [SHEETS.forecastAudit, FORECAST_COLUMNS.length]
  ].forEach(pair => shrinkSheet(pair[0], pair[1]));

  clearRuntimeCache();

  return 'Operational sheets trimmed and runtime cache cleared.';
}

function shrinkSheet(name, expectedColumns) {
  const sheet = getPlainSheet(name);

  if (!sheet) return;

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const maxRows = sheet.getMaxRows();

  if (maxRows > lastRow + 50) {
    sheet.deleteRows(lastRow + 1, maxRows - lastRow);
  }

  const maxCols = sheet.getMaxColumns();

  if (maxCols > expectedColumns) {
    sheet.deleteColumns(expectedColumns + 1, maxCols - expectedColumns);
  }
}

function validatePilotConfiguration() {
  setupWorkbookIfNeeded();
  clearRuntimeCache();

  const dealers = getDealersMap();
  const models = getActiveModels();
  const config = getConfigMap();
  const missingTokens = Object.keys(dealers).filter(code => truthy(dealers[code].active) && !clean(dealers[code].dealer_token));
  const duplicateModels = models.filter((model, index) => models.indexOf(model) !== index);
  const issues = [];

  if (models.length !== DEFAULT_MODELS.length) {
    issues.push('Active model count is ' + models.length + ', expected ' + DEFAULT_MODELS.length + ' for pilot.');
  }

  if (missingTokens.length) {
    issues.push('Missing dealer tokens: ' + missingTokens.join(', '));
  }

  if (duplicateModels.length) {
    issues.push('Duplicate model buckets: ' + duplicateModels.join(', '));
  }

  if (!clean(config.read_csv_token)) {
    issues.push('read_csv_token is blank. Set this before connecting Power BI outside local testing.');
  }

  return {
    success: issues.length === 0,
    version: APP_VERSION,
    active_dealers: getActiveDealerCount(),
    active_models: models.length,
    cutoff_hour: safeInt(config.cutoff_hour) || CUTOFF_HOUR,
    same_day_unlock_hour: safeInt(config.same_day_unlock_hour) || SAME_DAY_UNLOCK_HOUR,
    issues: issues
  };
}

function generateDealerLinks(baseUrl) {
  const base = clean(baseUrl);

  if (!base) throw new Error('Provide the live index.html URL as baseUrl.');

  const dealers = getDealersMap();
  const rows = [['dealer_code', 'dealer_name', 'dealer_link']];

  Object.keys(dealers).sort().forEach(code => {
    const dealer = dealers[code];

    if (!truthy(dealer.active)) return;

    const token = clean(dealer.dealer_token);
    const separator = base.indexOf('?') >= 0 ? '&' : '?';

    rows.push([
      code,
      dealer.dealer_name,
      base + separator + 'dealer=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(token)
    ]);
  });

  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

function getSpreadsheet() {
  if (SHEET_ID && SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE') {
    return SpreadsheetApp.openById(SHEET_ID);
  }

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
  const hour = Number(Utilities.formatDate(now, TIMEZONE, 'H'));
  const config = getConfigMap();
  const cutoff = safeInt(config.cutoff_hour) || CUTOFF_HOUR;
  const sameDayUnlockHour = safeInt(config.same_day_unlock_hour) || SAME_DAY_UNLOCK_HOUR;

  if (reportDate > today) return true;

  // Current-day reporting opens from 5:00pm and is treated as early/on-time
  // against the next morning's reporting cycle.
  if (reportDate === today) return hour < sameDayUnlockHour;

  // Yesterday is on time only before the 10:00am dealer deadline.
  if (reportDate === yesterday) return hour >= cutoff;

  // Older correction submissions remain marked late for compliance reporting.
  return true;
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
  return value === true ||
    value === 'TRUE' ||
    value === 'true' ||
    value === 1 ||
    value === '1' ||
    value === 'yes' ||
    value === 'YES';
}

function safeNormaliseDate(value) {
  try {
    return normaliseDate(value);
  } catch (err) {
    return clean(value);
  }
}

function normaliseDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }

  const text = clean(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  throw new Error('Invalid date format. Use yyyy-mm-dd.');
}

// Manual setup helper. Run once after pasting code.gs into Apps Script.
function initWorkbookForPilot() {
  setupWorkbookIfNeeded();
  protectDimensionTabs();
  removeLegacyDirectionValidation();
  clearRuntimeCache();
  SpreadsheetApp.flush();

  return 'Workbook initialised. Tabs created: current, audit, dealers, model_buckets, config, error_log, forecast_current, forecast_audit, submissions_status. Direction validation cleared.';
}

// Manual reset helper. Clears only current live rows. Audit history remains intact.
function resetCurrentForTesting() {
  const sheet = getSheet(SHEETS.current, CURRENT_COLUMNS);

  sheet.clear();
  ensureHeaders(sheet, CURRENT_COLUMNS);
  removeLegacyDirectionValidation();
  clearRuntimeCache();
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
  [SHEETS.current, SHEETS.audit, SHEETS.errors, SHEETS.status, SHEETS.forecastCurrent, SHEETS.forecastAudit].forEach(name => {
    const sheet = getSpreadsheet().getSheetByName(name);
    if (sheet) sheet.clear();
  });

  setupWorkbookIfNeeded();
  removeLegacyDirectionValidation();
  clearRuntimeCache();
  SpreadsheetApp.flush();

  return 'Pilot data tabs reset. Dealer/model/config tabs were preserved.';
}

function protectDimensionTabs() {
  [SHEETS.dealers, SHEETS.models, SHEETS.config].forEach(name => {
    const sheet = getSpreadsheet().getSheetByName(name);

    if (!sheet) return;

    const protection = sheet.protect().setDescription('GWM reporting protected configuration tab: ' + name);

    // Warning-only prevents accidental edits without locking the owner out during pilot setup.
    protection.setWarningOnly(true);
  });
}

// Internal smoke test utility. Does not submit data, but confirms required setup exists.
function smokeTestSetup() {
  setupWorkbookIfNeeded();
  removeLegacyDirectionValidation();

  const activeModels = getActiveModels();

  if (activeModels.length !== DEFAULT_MODELS.length) {
    throw new Error('Active model count mismatch: ' + activeModels.length);
  }

  const dealer = getDealerRecord('H3100');

  if (!dealer.dealer_name) {
    throw new Error('Dealer seed check failed.');
  }

  return 'Smoke test passed on v' + APP_VERSION + '. Active models: ' + activeModels.length + '. Sample dealer: ' + dealer.dealer_name + '.';
}
