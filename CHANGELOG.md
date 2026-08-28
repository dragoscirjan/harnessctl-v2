# Changelog

## Unreleased

- Add a fixed repository-local `.harnessctl/documents` authority for HLD, LLD,
  design-overview, and GDD records with nine normalized lifecycle tools and thin OpenCode
  and Pi adapters.
- Integrate Documents creation, review, versioning, validation, and issue linking into the
  existing SDLC Plan reference without generating a Documents agent or skill.
- Ship no `.specs` or `.ai.tmp` migration or link compatibility; `.specs-v1` remains inert
  repository history rather than live authority.
- Remove remote Documents providers, wiki routes, MCP identities, and configuration. Exact
  previously generated `sdlc-documents` trees are removed transactionally; modified trees
  are preserved with a warning.
- Add patch Changesets for all three runtime packages; package versions and dependency
  ranges remain unchanged until release versioning.

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
- **Breaking:** rename harnessctl-owned CVS MCP IDs from `cvs_github`, `cvs_gitlab`,
  `cvs_gitea`, and `cvs_forgejo` to the corresponding `sdlc_cvs_*` IDs. Fresh installs
  emit only canonical IDs. Upgrades transactionally remove exact generated legacy
  definitions; modified legacy or operator entries remain byte-for-byte unchanged with a
  warning. No compatibility aliases are installed.

This release builds Python wheel and source distributions as CI artifacts and includes a patch
changeset for `@harnessctl/generic-tools`; Changesets will propagate required exact-range adapter
dependency updates. It does not publish artifacts to PyPI or npm.
