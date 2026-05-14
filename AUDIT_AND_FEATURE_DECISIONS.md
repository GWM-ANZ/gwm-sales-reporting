# Option B Build Notes

This package combines the premium dealer-facing page with the lean backend submit path.

## Retained
- Premium styling and GWM visual shell.
- Mobile activity accordion.
- Dealer token links.
- Dealer information modal.
- Totals bar and zero-activity confirmation.
- 5:00pm same-day reporting.
- Current table for Power BI.
- Audit history.
- Lightweight `submissions_status` for Sales Ops monitoring.

## Removed from dealer submit path
- Dealer-facing status polling.
- Verification polling.
- Workbook setup/styling during submit.
- Daily Direction validation.
- Fleet 5+ UI and validation.
- Full current-table rebuild.

## Temporarily retained for schema compatibility
- `direction` output column is written as fixed `Flat`.
- `fleet_5_plus` output column is written as fixed `0`.

These should only be removed after the Power BI schema is updated.


## v2.6.2 audit corrections
- Removed the inline mobile fallback CSS so the premium stylesheet controls the mobile accordion presentation.
- Fixed backend late-flag logic so yesterday's report is only late after the 10:00am local deadline, not automatically late for every prior-day submission.
- Replaced raw Date.getHours() in backend same-day validation with Australia/Melbourne timezone-safe hour calculation.
