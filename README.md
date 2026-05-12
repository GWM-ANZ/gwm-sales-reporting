# GWM Daily Sales Reporting, simplified testing build v2

## Purpose

This package strips the daily reporting tool back to the safest pilot version.

Dealers submit through `index.html`. The page posts flat model rows to Google Apps Script. Apps Script writes those rows to the `submissions` tab in Google Sheets. Power BI connects directly to the Google Sheet CSV export URL.

## Removed from this testing build

- Internal dashboard page
- Dashboard configuration drawer
- Chart.js dashboard dependency
- Reopen workflow
- Missed-day lock/enforcement
- Dashboard CSV/export controls
- Old setup requirements linked to the dashboard

## Included files

- `index.html` — dealer-facing input page
- `styles.css` — simplified shared styling
- `code.gs` — Google Apps Script backend
- `gwm-wordmark.png` — GWM header asset
- `setup-guide.html` — deployment and Power BI setup guide
- `dealer-user-guide.html` — simple dealer-facing usage guide
- `submissions_header_template.csv` — header reference for the Google Sheet

## Critical Google Sheet reset note

The actual Google Sheet is not automatically reset by downloading this package. That is deliberate.

To reset the live testing sheet, paste `code.gs` into Apps Script, then manually run:

```text
resetSubmissionsForTesting
```

That clears the `submissions` tab and rebuilds the correct headers only.

If old data should be retained before clearing, manually run this first:

```text
archiveSubmissionsBeforeReset
```

## Deployment summary

1. Upload `index.html`, `styles.css`, and `gwm-wordmark.png` to GitHub Pages or your static host.
2. Paste `code.gs` into the Google Sheet's Apps Script project.
3. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with the actual Sheet ID, or leave it unchanged if the script is bound to the Sheet.
4. Run `archiveSubmissionsBeforeReset` if required.
5. Run `resetSubmissionsForTesting` for a clean pilot sheet.
6. Deploy Apps Script as a Web App.
7. Paste the Web App URL into `APPS_SCRIPT_URL` in `index.html`.
8. In Power BI, connect to the Google Sheet CSV URL for the `submissions` tab.

## Power BI CSV format

```text
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=submissions
```

## Pilot behaviour

Submitting the same dealer and report date again replaces the earlier rows for that dealer/date. This is deliberate for testing because the dashboard reopen function has been removed.
