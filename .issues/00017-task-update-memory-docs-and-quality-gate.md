---
id: "00017"
type: task
title: "Update memory docs and quality gate"
status: open
parent: "00006"
depends: ["00016"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Update memory docs and quality gate

Given completed implementation
When maintainers and users inspect or validate project
Then documentation is accurate and all required checks run from the main quality target.

## Technical Requirements

- Update README/FLOWS with skill install, config, authority, security, and backend status.
- Add strict TypeScript typecheck and memory validation to quality gate.
- Document test procedure and known Pi/remote limitations.

## Acceptance Criteria

- [ ] Documentation matches shipped behavior.
- [ ] Full quality suite includes strict typecheck and passes.
- [ ] User-facing install/test steps are reproducible.


## Comments
