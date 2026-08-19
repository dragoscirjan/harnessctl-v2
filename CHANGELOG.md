# Changelog

## 0.2.0

- **Breaking:** replace the 18-command SDLC surface with `work-plan`, `work-build`,
  `work-verify`, `work-release`, and `work-continue`; deprecated aliases are not installed.
- Add explicit `--replace-sdlc-command-set` migration consent. Migration replaces overlapping
  Plan/Verify outputs and removes the 16 retired outputs only for selected harnesses.
- Preserve normal conflict handling for unrelated customized outputs and exact transactional
  rollback on migration failure.

This release builds Python wheel and source distributions as CI artifacts. It does not publish
to PyPI or change npm packages.
