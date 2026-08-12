---
id: "00008"
type: task
title: "Package OpenCode adapter and plugin registration"
status: done
parent: "00006"
depends: ["00007"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Package OpenCode adapter and plugin registration

Given an OpenCode project
When harnessctl enables repository memory
Then exact-version adapter dependency and auto-discovered plugin shim can be installed safely.

## Technical Requirements

- Make `@harnessctl/opencode-tools` publishable compiled ESM.
- Define exact-version package merge and fixed plugin shim contract.
- Preserve unrelated package fields and support exact-byte rollback.

## Acceptance Criteria

- [ ] Package exports and runtime dependencies are complete.
- [ ] Compatible merge succeeds; incompatible version conflicts without force.
- [ ] Registration packaging tests pass.


## Comments

- 2026-08-11: Added compiled ESM exports/builds and exact runtime dependencies; package dry-run contains only publishable artifacts.
