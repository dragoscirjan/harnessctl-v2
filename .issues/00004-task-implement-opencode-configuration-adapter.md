---
id: "00004"
type: task
title: "Implement OpenCode configuration adapter"
status: open
parent: "00001"
depends: ["00003"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Implement OpenCode configuration adapter

## Technical Requirements

- Replace `extensions/opencode-harnessctl` with
  `extensions/opencode-tools` as `@harnessctl/opencode-tools`.
- Register `config_create` and `config_get` using `@opencode-ai/plugin`.
- Delegate all configuration behavior to `@harnessctl/generic-tools`.
- Pass the OpenCode context directory to generic functions.
- Add adapter registration tests where the host SDK permits deterministic
  testing.

## Acceptance Criteria

- [ ] The package uses the corrected `@harnessctl/opencode-tools` name.
- [ ] Both tools are registered and expose the expected arguments.
- [ ] No `.env.ai` tools remain in the adapter.
- [ ] No configuration logic is duplicated from the generic package.
- [ ] Package validation passes.


## Comments
