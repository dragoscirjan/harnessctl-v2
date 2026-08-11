---
id: "00014"
type: task
title: "Expose normalized OpenCode memory tools"
status: in_progress
parent: "00006"
depends: ["00013"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Expose normalized OpenCode memory tools

Given installed repository-memory adapter
When OpenCode discovers project tools
Then all supported normalized memory operations delegate to generic implementation.

## Technical Requirements

- Expose search/get/store/supersede/delete/list/validate/export/import.
- Keep schemas and capability claims exact.
- Return useful structured validation and conflict errors without leaking secrets.

## Acceptance Criteria

- [ ] Adapter schema and delegation tests pass.
- [ ] Unsupported capabilities are not advertised.
- [ ] Tool discovery smoke fixture passes when OpenCode is available.


## Comments
