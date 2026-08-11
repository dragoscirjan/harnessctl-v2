---
id: "00016"
type: task
title: "Verify and document Pi memory support"
status: open
parent: "00006"
depends: ["00015"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Verify and document Pi memory support

Given current Pi extension and skill contracts
When compatibility is investigated
Then implementation either adds verified output or clearly reports memory support as unavailable.

## Technical Requirements

- Verify current Pi skill discovery and extension distribution using authoritative docs/tests.
- Do not invent destination paths or registration behavior.
- Caveman may ship independently if its skill path is verified.

## Acceptance Criteria

- [ ] Evidence and supported/unsupported decision are documented.
- [ ] Any implemented Pi output has automated tests.
- [ ] Installer fails clearly for unverified memory integration.


## Comments
