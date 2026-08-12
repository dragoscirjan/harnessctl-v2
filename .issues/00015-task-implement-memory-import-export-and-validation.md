---
id: "00015"
type: task
title: "Implement memory import export and validation"
status: open
parent: "00006"
depends: ["00014"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Implement memory import export and validation

Given canonical portable memory data
When imported, exported, or manually validated
Then records remain canonical, secret-free, and recoverable after interruption.

## Technical Requirements

- Implement preview/validate and canonical JSONL/YAML export paths.
- Implement staged manifest, durable prepare, deterministic roll-forward, and conflict checks.
- Add manual-record validation target for hooks/CI.

## Acceptance Criteria

- [ ] Round-trip checksums and counts match.
- [ ] Interrupted import recovery is idempotent.
- [ ] Existing mismatched target causes hard conflict and no overwrite.


## Comments
