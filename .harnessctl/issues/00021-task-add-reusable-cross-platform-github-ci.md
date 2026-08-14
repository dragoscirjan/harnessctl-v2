---
id: "00021"
type: task
title: "Add reusable cross-platform GitHub CI"
status: done
parent: "00018"
depends: ["00020"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Add reusable cross-platform GitHub CI

Given a pull request or main-branch update
When GitHub CI starts
Then locked dependencies and pinned tools run the repository quality gate across supported operating systems.

## Acceptance criteria

- [x] Reusable quality workflow supports Linux, macOS, and Windows runners.
- [x] Linux additionally verifies package tarballs, production dependency audit, and coverage artifacts.
- [x] Workflow actions use immutable commit SHAs and least-privilege permissions.
- [x] Concurrent obsolete CI runs are cancelled.


## Comments

### 2026-08-12 — lead-engineer

Pinned setup action and cross-platform matrix added. `actionlint` passes.
