# GWM Daily Sales Reporting, simplified testing build

## What this build does

This package strips the reporting tool back to the safest pilot version:

1. Dealers use `index.html` only.
2. `index.html` posts flat model rows to Google Apps Script.
3. Google Apps Script writes those rows to the `submissions` tab in Google Sheets.
4. Power BI connects directly to the Google Sheet CSV export URL.

There is no internal dashboard, no dashboard configuration drawer, no Chart.js dependency, no reopen workflow, and no missed-day enforcement.

## Files to deploy

Upload these files to GitHub Pages or your static host:

- `index.html`
- `styles.css`
- `gwm-wordmark.png`

Paste `code.gs` into the Google Sheet's Apps Script project and deploy it as a Web App.

## Apps Script setup

1. Create or open the Google Sheet.
2. Add a tab named `submissions`, or let the script create it.
3. Go to Extensions > Apps Script.
4. Paste the contents of `code.gs`.
5. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Google Sheet ID. If the script is bound to the sheet, you can leave it as-is.
6. Deploy > New deployment > Web app.
7. Execute as: Me.
8. Who has access: Anyone.
9. Copy the Web App URL.
10. Paste that URL into `APPS_SCRIPT_URL` near the top of the script block in `index.html`.

## Power BI connection

Use this format in Power BI Desktop via Get Data > Web:

```text
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=submissions
```

Set column types:

- `submitted_at`: Date/Time
- `report_date`: Date
- `is_late`: True/False
- `enquiry`, `test_drives`, `new_sold`, `fleet_5_plus`, `demo_sold`, `forecast`: Whole Number

## Testing notes

During pilot testing, submitting the same dealer and report date again replaces the earlier rows for that dealer/date. This is deliberate because the dashboard reopen function has been removed.

For production, decide whether this behaviour should remain or whether duplicate protection should be added back.
