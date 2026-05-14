# GWM v2.6.0 lean pilot fast submit

1. Upload `index.html` to GitHub and replace the existing root index file.
2. Replace the full Apps Script `code.gs` with this package's `code.gs`.
3. Apps Script: Deploy > Manage deployments > Edit > New version > Deploy.
4. In Apps Script, run once before pilot: `initLeanWorkbookOnce()`, then `clearRuntimeCache()`.
5. Hard refresh the live GitHub page.

This version removes the status-polling receipt architecture and returns to one authoritative POST receipt.
