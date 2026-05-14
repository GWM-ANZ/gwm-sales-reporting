# GWM Daily Sales Reporting v2.5.1 Pilot-Safe Patch

## Changed
- Removed unconditional setupWorkbookIfNeeded() from doGet(). Status, verify and CSV endpoints now return without workbook setup/header styling/tab seeding.
- Moved setupWorkbookIfNeeded() to the explicit ?health admin path only.
- Added client_submission_id idempotency before writing audit/current rows.
- Duplicate completed client_submission_id returns the existing completed receipt and does not write duplicate rows.
- Duplicate accepted/processing client_submission_id returns a safe processing response and does not write duplicate rows.
- Added client_submission_id to backend success and failure responses.
- Added SpreadsheetApp.flush() after the completed status event is written.
- Hardened dealer token validation so blank dealer_token or blank supplied token rejects.
- Hardened verify endpoint token validation so blank dealer token does not allow verification.
- Hardened metric validation to accept blanks as zero and otherwise only allow whole-number strings matching /^\d+$/.
- Updated index.html postMessage listener to ignore stale iframe responses where client_submission_id does not match the pending submission.

## Not changed
- Dealer-facing layout.
- Branding.
- Page structure.
- CSS classes.
- Mobile accordion structure.
- Desktop table structure.
- Daily Direction and Fleet 5+ remain hidden dealer-side.
- Current/audit column schemas remain unchanged.
- Power BI CSV endpoint structure remains unchanged.
