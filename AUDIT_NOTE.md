# v2.6.0 lean audit note

Why the early v2.1 felt faster:
- It had one submit path.
- It did not poll `submissions_status`.
- It did not run status verification loops.
- It had fewer operational sheets and less duplicated legacy code.

What remains intentionally:
- `direction` column remains in outputs as `Flat` for header/Power BI compatibility, but no UI or validation depends on it.
- `fleet_5_plus` remains in outputs as `0` for header/Power BI compatibility, but no UI depends on it.

What was stripped from dealer submit:
- No `submissions_status` polling.
- No status/verify GET loops.
- No workbook setup/styling on submit.
- No legacy Daily Direction validation.
- No duplicate slow processSubmission path.
