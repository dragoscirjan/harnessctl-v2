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

**Status Update:**
Strict workspace typecheck currently fails in Pi integration tests because installed `@earendil-works/pi-coding-agent` types no longer export `AuthStorage`, `ModelRegistry.inMemory`, or the previously used session options. Unit tests still pass. This failure is unrelated to the contract-copy removal but confirms Pi compatibility needs verification.

**Artifacts:**
- [`extensions/pi-tools/integration.test.ts`](../extensions/pi-tools/integration.test.ts)

**Next Steps / Blockers:**
- Verify the installed Pi API against authoritative documentation before changing integration code.
- Pi support remains blocked until the test harness is migrated to supported APIs.

---

opencode-agent: lead-engineer
