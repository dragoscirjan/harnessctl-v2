---
id: "00010"
type: task
title: "Extend atomic installer for skills and adapter"
status: done
parent: "00006"
depends: ["00009"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Extend atomic installer for skills and adapter

Given selected OpenCode skill configuration
When installation succeeds or fails
Then skills and adapter registration are installed atomically or restored exactly.

## Technical Requirements

- Validate config before writes.
- Install skill files, package dependency, plugin shim, canonical dirs, and cache ignore.
- Preserve conflict, force, path-safety, smoke-check, and rollback semantics.

## Acceptance Criteria

- [ ] Successful fixture installs all selected artifacts.
- [ ] Failure restores original bytes and removes new artifacts.
- [ ] Existing command installation remains compatible.


## Comments

- 2026-08-11: Installer now loads/migrates config, installs specialized OpenCode skills, merges exact adapter dependency, writes plugin shim/cache ignore, initializes repository layout, smoke-checks, and rolls file writes back exactly.
