---
id: "00019"
type: task
title: "Prepare npm package manifests and build artifacts"
status: done
parent: "00018"
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Prepare npm package manifests and build artifacts

Given three private workspace packages
When their publish metadata and build scripts are prepared
Then each produces a public npm tarball with JavaScript, declarations, and required contracts only.

## Acceptance criteria

- [x] All packages declare license, repository, engine, exports, files, and public registry metadata.
- [x] Builds clean stale output and work on Linux, macOS, and Windows.
- [x] `npm run packages:check` verifies every packed entry point and rejects tests or build debris.


## Comments

### 2026-08-12 — lead-engineer

Verified three package builds and dry-run tarballs. Generic: 13 files; OpenCode: 3; Pi: 5.
