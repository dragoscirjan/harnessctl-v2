---
id: "00023"
type: task
title: "Document and verify package release process"
status: done
parent: "00018"
depends: ["00022"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Document and verify package release process

Given maintainers need to operate releases safely
When they read project documentation
Then they can add changesets, configure GitHub/npm, inspect package contents, and recover from common failures.

## Acceptance criteria

- [x] README documents contributor and maintainer release flows.
- [x] Required `npm` environment and `NPM_TOKEN` setup are explicit.
- [x] Local quality, package, workflow, and Changesets checks pass.
- [x] No model-backed integration test or npm credential is required by regular CI.


## Comments

### 2026-08-12 — lead-engineer

README and LLD document release operation, secret boundaries, validation, and failure recovery.
