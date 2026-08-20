# Verify

Require one Epic. Map every acceptance criterion to current evidence. Confirm bounded checks for tests/integration, format/lint/types, dependency/config, duplication/dead code, docs/operations, release readiness, and independent correctness/maintainability/security/privacy/compatibility review. Mark inapplicable checks Not needed. Not-run, stale, partial, ambiguous, or failed evidence never passes.

If failures exist, load `verify-defects.md`; diagnose and let user choose route. Never repair in Verify.

On success, record evidence. Detailed issue closure needs mapped acceptance plus separate confirmation. Never close Epic. Recommend Release and stop. Requirement/acceptance/architecture/design scope change → Plan. Confirmed corrective work → Build. Never enter another phase here.
