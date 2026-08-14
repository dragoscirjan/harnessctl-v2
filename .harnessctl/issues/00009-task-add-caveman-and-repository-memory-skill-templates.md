---
id: "00009"
type: task
title: "Add caveman and repository memory skill templates"
status: done
parent: "00006"
depends: ["00008"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Add caveman and repository memory skill templates

Given valid skill configuration
When templates render
Then generated skills contain only selected communication mode and repository-memory guidance.

## Technical Requirements

- Add strict/balanced caveman Jinja template.
- Add deterministic memory classification/lifecycle template.
- Exclude unused backend names and unsupported tools.

## Acceptance Criteria

- [ ] Snapshot tests cover both caveman modes and repository memory.
- [ ] Rendering is deterministic.
- [ ] Generated skills preserve security and authority rules.


## Comments

- 2026-08-11: Added strict/balanced caveman and repository-only memory Jinja templates with deterministic rendering tests.
