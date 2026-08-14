---
id: "00020"
type: task
title: "Configure independent Changesets releases"
status: done
parent: "00018"
depends: ["00019"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Configure independent Changesets releases

Given package changes may affect different adapters
When a contributor adds a changeset
Then only selected packages receive the requested semantic-version bump.

## Acceptance criteria

- [x] Changesets uses independent versions and public access.
- [x] Internal dependency updates use patch bumps.
- [x] Contributor instructions and an initial three-package changeset exist.


## Comments

### 2026-08-12 — lead-engineer

`changeset status` reports patch releases for all three initial packages.
