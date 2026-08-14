---
id: "00008"
type: task
title: Implement safe YAML issue discovery and storage
status: done
created_at: 2026-08-14T13:43:41.772Z
updated_at: 2026-08-14T13:59:53.977Z
parent: "00004"
depends_on:
  - "00007"
created_by: lead-engineer
assigned_to: backend-dev
---

# Implement safe YAML issue discovery and storage

Given canonical YAML issues
When active or archived storage is discovered and read
Then files are resolved by stable ID without traversal, symlink, collision, or mixed-format ambiguity.

## Deliverables

- `issues-storage.ts` discovery, path validation, classification, atomic create/rewrite/rename primitives.
- Active `.issues/<id>-<slug>.yml` and archived `.issues/archived/<id>-<slug>.yml` support.
- Mixed legacy/YAML rejection and migration guidance.

## Acceptance

- [x] Create emits exactly one canonical file.
- [x] Duplicate IDs, unsafe names, symlinks, malformed files, and mixed formats are reported.
- [x] Title rename preserves stable ID and removes old path atomically.
