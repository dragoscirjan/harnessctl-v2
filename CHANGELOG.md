# Changelog

## 0.2.0

- **Breaking:** replace the 18-command SDLC surface with `work-plan`, `work-build`,
  `work-verify`, `work-release`, and `work-continue`; deprecated aliases are not installed.
- Add explicit `--replace-sdlc-command-set` migration consent. Migration replaces overlapping
  Plan/Verify outputs and removes the 16 retired outputs only for selected harnesses.
- Preserve normal conflict handling for unrelated customized outputs and exact transactional
  rollback on migration failure.
- **Breaking:** namespace five generated support skills under `sdlc-`: `caveman`, `cvs`,
  `develop-tdd`, `issue-tracking`, and `memory`. Existing `sdlc`, `sdlc-code`, and
  `sdlc-code-index` skill IDs, configuration key `skills.sdlc-code-index`, and external MCP
  IDs remain unchanged.
- Fresh installs generate only current skill IDs. Normal and `--force` upgrades preserve
  the five legacy support roots without traversal and disclose exact paths;
  `--replace-sdlc-skill-set` removes selected-host legacy support trees after symlink and
  special-entry validation, with transactional rollback of file bytes, existence, and
  directory topology.

This release builds Python wheel and source distributions as CI artifacts. It does not publish
to PyPI or change npm packages.
