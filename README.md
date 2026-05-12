# GWM Daily Sales Reporting, simplified testing build v2.1

Dealer-facing static input page -> Google Apps Script -> Google Sheets -> Power BI.

This v2.1 package actions the rollout premortem fixes from v2:

- Forecast has been removed from the daily activity grid so blank fields cannot wipe monthly forecast reporting.
- Browser submission now uses an iframe/postMessage receipt from Apps Script instead of `fetch(..., no-cors)`, so the page only shows success after the backend confirms the write.
- Apps Script validates dealer, report date, direction, model buckets and numeric values server-side.
- Server generates `submitted_at`, `last_updated_at`, `is_late`, `submission_id` and `revision`.
- Current reporting rows are stored in `submissions_current`.
- Every submission version is retained in `submissions_audit`.
- Errors are written to `error_log`.
- Dealer, model and config dimensions are seeded into `dealers`, `model_buckets` and `config`.
- Optional pilot access code and dealer-token support are included for a safer live test.

## Files

| File | Purpose |
|---|---|
| `index.html` | Dealer-facing input page. |
| `styles.css` | Shared styling. |
| `code.gs` | Apps Script backend. |
| `setup-guide.html` | Internal setup and rollout guide. |
| `dealer-user-guide.html` | Dealer-facing instructions. |
| `user-guide.html` | Same dealer guide, included so the old live `/user-guide.html` can be replaced. |
| `gwm-wordmark.png` | Brand asset. |
| `*_template.csv` | Optional Sheet header/dimension templates. |

## Apps Script tabs created

- `submissions_current` - active Power BI fact table. One row per dealer/date/model.
- `submissions_audit` - append-only history of every submitted row.
- `dealers` - dealer dimension and optional dealer tokens.
- `model_buckets` - approved model list and sort order.
- `config` - pilot access code, correction/date rules and CSV token.
- `error_log` - rejected/failed submissions.
- `forecast_current` and `forecast_audit` - placeholder forecast tables for the separate forecast workflow.

## Setup summary

1. Create or open the Google Sheet that Power BI will use.
2. Open **Extensions > Apps Script**.
3. Paste the full contents of `code.gs`.
4. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with the Sheet ID, or leave as-is if the script is bound to the Sheet.
5. Run `initWorkbookForPilot` once and authorise.
6. Run `smokeTestSetup` and confirm it passes.
7. Deploy Apps Script as a Web App: execute as **Me**, access **Anyone** for pilot use.
8. Paste the Web App URL into `APPS_SCRIPT_URL` in `index.html`.
9. Publish `index.html`, `styles.css`, `gwm-wordmark.png` and `user-guide.html` to GitHub Pages.
10. Do not publish any old dashboard files.

## Power BI CSV endpoints

Preferred Apps Script endpoint:

```text
WEB_APP_URL?format=csv&sheet=current
WEB_APP_URL?format=csv&sheet=dealers
WEB_APP_URL?format=csv&sheet=models
WEB_APP_URL?format=csv&sheet=forecast_current
```

If `config.read_csv_token` is populated, append:

```text
&token=YOUR_READ_TOKEN
```

Direct Google Sheet CSV can still work during testing, but the Apps Script CSV endpoint gives a cleaner control point.

## Pilot behaviour

Submitting the same dealer and report date again replaces the active rows in `submissions_current`. The previous version remains in `submissions_audit` with a lower revision number.

## Forecast treatment

Forecast is not part of daily activity in v2.1. Treat monthly forecast as a separate workflow using `forecast_current` and `forecast_audit`, or handle forecast manually in Power BI until the forecast form is built.

## Rollback

- GitHub Pages: revert to the previous commit or republish the previous ZIP.
- Apps Script: Deploy > Manage deployments > edit deployment > select previous version.
- Data: use `submissions_audit` or any `submissions_current_archive_yyyyMMdd_HHmmss` tab to restore.
