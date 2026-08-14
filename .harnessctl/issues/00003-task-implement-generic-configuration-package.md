---
id: "00003"
type: task
title: "Implement generic configuration package"
status: open
parent: "00001"
depends: []
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Implement generic configuration package

## Technical Requirements

- Create `extensions/generic-tools` as `@harnessctl/generic-tools`.
- Implement default `.harnessctl/config.yaml` creation without overwriting.
- Parse YAML and resolve dotted paths such as `paths.tasks`.
- Return explicit results for missing files, malformed YAML, empty paths, and
  missing keys.
- Add unit tests for creation, parsing, lookup, and error cases.

## Acceptance Criteria

- [ ] Generic code imports no OpenCode or Pi SDK.
- [ ] A new project receives the harness-neutral default config.
- [ ] Existing config files remain unchanged.
- [ ] `config-get` resolves nested scalar and mapping values.
- [ ] Generic package validation passes.


## Comments
