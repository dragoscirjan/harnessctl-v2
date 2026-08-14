---
id: "00022"
type: task
title: "Publish changed workspaces to npm"
status: done
parent: "00018"
depends: ["00021"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Publish changed workspaces to npm

Given changesets exist on main
When the release workflow runs
Then it updates a release PR; after that PR merges, it publishes changed packages and Git tags.

## Acceptance criteria

- [x] Version and publish modes are selected deterministically by Changesets.
- [x] Version mode creates or updates a release PR without npm credentials.
- [x] Publish mode runs full validation in the protected `npm` environment.
- [x] Only publish mode receives `NPM_TOKEN` through `NODE_AUTH_TOKEN`.


## Comments

### 2026-08-12 — lead-engineer

Release workflow uses Changesets v2 subactions and a protected `npm` environment with least-privilege permissions.
