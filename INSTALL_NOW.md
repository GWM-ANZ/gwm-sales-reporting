# GWM Daily Reporting v2.6.2 Premium Lean + Admin Monitoring

## Files
- `index.html` - premium dealer-facing page with mobile accordion retained.
- `styles.css` - restored/premium dealer styling.
- `code.gs` - lean Apps Script backend with lightweight admin `submissions_status`.
- `gwm-wordmark.png` - brand asset used by the page.

## Install
1. Upload/replace `index.html`, `styles.css`, and `gwm-wordmark.png` in the GitHub repo root.
2. Open Apps Script and replace the full `code.gs`.
3. Save.
4. Deploy > Manage deployments > Edit > New version > Deploy.
5. In Apps Script, run once: `initLeanWorkbookOnce()` then `clearRuntimeCache()`.
6. Hard refresh the live GitHub Pages URL.

## Test
Use H3100 valid token. Submit a small test. Expected result:
- Dealer page shows `Report received`.
- `submissions_current` writes 19 rows.
- `submissions_audit` writes 19 rows.
- `submissions_status` shows `accepted` then `completed`.
- `error_log` stays blank.
