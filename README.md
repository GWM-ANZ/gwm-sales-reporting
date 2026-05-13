# GWM Daily Sales Reporting v2.4 Pilot Hardened

Dealer-facing static input page -> Google Apps Script -> Google Sheets -> Power BI.

This package keeps v2.3 as the base and reintegrates the useful reliability, performance and handover items identified across v2.2 fast confirmation patch and v2.1 live handover. It is designed for a controlled phased pilot, not a permanent enterprise SaaS architecture.

## Executive verdict

- Ready for Week 1 pilot after setup smoke test: **Yes**
- Ready for all 30 dealers today without staged pilot: **No**
- Recommended rollout: Week 1 = 5 dealers, Week 2 = 10, Week 3 = 20, Week 4 = 30
- Official dealer deadline: **10:00am**
- Internal correction/final check window: **until 12:00pm**

## What changed from v2.3

- Increased Apps Script lock wait from 10 seconds to 30 seconds.
- Added cached dealer, model and config lookups using `CacheService`.
- Added lightweight `ensureSubmissionSheetsReady()` for live submissions.
- Added grouped current-row deletion to reduce Sheet operations during corrections.
- Added `clearRuntimeCache()`, `shrinkOperationalSheets()`, `validatePilotConfiguration()` and `generateDealerLinks(baseUrl)`.
- Removed duplicate `index.html.html`.
- Updated stale receipt/status versioning to v2.4.
- Added clearer 10:00am deadline and 12:00pm correction-window language.
- Added non-zero confirmation detail before submit.
- Added non-zero row highlight on desktop.
- Recreated Power BI handover, data dictionary, admin guide, risk register, go/no-go checklist and rollout checklist.

## Deploy these static files

Publish only:

```text
index.html
styles.css
gwm-wordmark.png
user-guide.html
```

Paste `code.gs` into Apps Script and deploy the Web App separately.

## Critical setup steps

1. Create or open the Google Sheet that will be the pilot system of record.
2. Open **Extensions > Apps Script**.
3. Paste the full contents of `code.gs`.
4. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with the Sheet ID, or leave it if the script is bound to the Sheet.
5. Run `initWorkbookForPilot()` and authorise.
6. Add dealer tokens in the `dealers` tab.
7. Set `read_csv_token` in the `config` tab before connecting Power BI.
8. Run `clearRuntimeCache()`.
9. Run `validatePilotConfiguration()`.
10. Run `smokeTestSetup()`.
11. Deploy Apps Script as Web App: execute as **Me**, access **Anyone** for pilot use.
12. Paste the Web App URL into `APPS_SCRIPT_URL` in `index.html`.
13. Publish the static files.
14. Test one dealer link using `?dealer=H3100&token=DEALER_TOKEN`.

## CSV endpoints

Use the deployed Apps Script Web App URL. If `read_csv_token` is populated, append `&token=YOUR_READ_TOKEN`.

```text
WEB_APP_URL?format=csv&sheet=current&token=YOUR_READ_TOKEN
WEB_APP_URL?format=csv&sheet=audit&token=YOUR_READ_TOKEN
WEB_APP_URL?format=csv&sheet=dealers&token=YOUR_READ_TOKEN
WEB_APP_URL?format=csv&sheet=models&token=YOUR_READ_TOKEN
WEB_APP_URL?format=csv&sheet=status&token=YOUR_READ_TOKEN
```

## Pilot rule

Submitting the same dealer and report date again replaces the active rows in `submissions_current`. The earlier version remains in `submissions_audit`. Dealers must resubmit the full corrected day, not a delta.

## Long-term architecture note

This package is acceptable for a controlled pilot if tokens are managed properly. It is not a permanent enterprise authentication model. If this becomes business-critical after the pilot, migrate the write layer to a database-backed app with proper authentication, role controls and a formal admin console.
