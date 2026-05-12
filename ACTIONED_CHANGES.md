# Actioned Changes, GWM Daily Reporting v2.1

## Must-fix items actioned

1. **Replace stale live user guide**
   - Added `user-guide.html` as a clean v2.1 dealer guide so the old dashboard-era `/user-guide.html` can be replaced directly.

2. **Fix false success confirmation**
   - Removed `fetch(..., mode: 'no-cors')` flow.
   - Added iframe form POST and `postMessage` response from Apps Script.
   - Dealer page now shows success only after Apps Script returns a confirmed receipt.

3. **Remove forecast from daily grid**
   - Removed forecast from `index.html`, totals and daily schema.
   - Added `forecast_current` and `forecast_audit` placeholder tables for a separate forecast workflow.

4. **Add server-side validation**
   - Apps Script validates dealer, report date, direction, model bucket list, exactly 19 rows and non-negative whole-number metrics.

5. **Generate server-side timestamp and late flag**
   - Apps Script now owns `submitted_at`, `last_updated_at`, `is_late`, `submission_id` and revision.

6. **Add audit trail**
   - Added `submissions_current` for active rows.
   - Added `submissions_audit` for every submission version.
   - Resubmitting a dealer/date replaces current rows but retains history.

7. **Add pilot security options**
   - Added optional `pilot_access_code` in config.
   - Added optional dealer-token validation using `dealer_token` in the `dealers` tab and URL parameter `?dealer=CODE&token=TOKEN`.

8. **Add all-zero confirmation**
   - Front-end warns before all-zero submission.
   - Backend rejects all-zero payloads unless confirmed by the front-end.

9. **Power BI structure improved**
   - Added current, audit, dealer, model and forecast CSV endpoints.
   - Added dimension templates and header templates.

10. **Setup guide updated**
   - Added smoke test, rollback, security, reset/archive and go/no-go instructions.

## Items deliberately not overbuilt for pilot

- Full identity login was not added. Dealer tokens and access code are the fast-pilot control.
- Admin portal was not added. Corrections are handled by resubmitting the same dealer/date.
- Automated reminders were not added. This should sit outside the static page for now.
- Forecast form was not built. Forecast has been separated so daily reporting is safe first.

## Remaining production recommendations

- Move to authenticated dealer identity if this becomes permanent.
- Build a separate forecast workflow.
- Add automated dealer reminder and missing-submission notification.
- Store data in a controlled database or data warehouse if usage expands beyond pilot.
