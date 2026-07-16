---
id: "00005"
type: task
title: "Implement Pi configuration adapter"
status: open
parent: "00001"
depends: ["00003"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Implement Pi configuration adapter

## Technical Requirements

- Create `extensions/pi-tools` as `@harnessctl/pi-tools`.
- Register equivalent `config_create` and `config_get` tools through the Pi
  extension API.
- Delegate all configuration behavior to `@harnessctl/generic-tools`.
- Keep the package independent of OpenCode APIs.

## Acceptance Criteria

- [ ] The package uses the `@harnessctl/pi-tools` name.
- [ ] Both tools are registered through the Pi host API.
- [ ] No configuration logic is duplicated from the generic package.
- [ ] Package validation passes.


## Comments
