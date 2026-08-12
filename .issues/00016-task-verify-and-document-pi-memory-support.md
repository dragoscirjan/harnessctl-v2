---
id: "00016"
type: task
title: "Verify and document Pi memory support"
status: done
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

- [x] Evidence and supported/unsupported decision are documented.
- [x] Any implemented Pi output has automated tests.
- [x] Installer fails clearly for unverified memory integration.


## Comments

**Status Update:**
Strict workspace typecheck currently fails in Pi integration tests because installed `@earendil-works/pi-coding-agent` types no longer export `AuthStorage`, `ModelRegistry.inMemory`, or the previously used session options. Unit tests still pass. This failure is unrelated to the contract-copy removal but confirms Pi compatibility needs verification.

**Artifacts:**
- [`extensions/pi-tools/integration.test.ts`](../extensions/pi-tools/integration.test.ts)

**Next Steps / Blockers:**
- Verify automatic Pi extension distribution and skill discovery before enabling installer output.
- Run full project quality checks and review the new adapter.

**Implementation Update:**
- Migrated the Pi SDK integration harness to `ModelRuntime` from the removed `AuthStorage`/`ModelRegistry.inMemory` APIs.
- Added all nine normalized repository-memory tools to `@harnessctl/pi-tools` using Pi 0.81's verified `registerTool` contract.
- Added unit coverage for registration plus memory store, search, and validation delegation.
- Kept automatic Pi extension/skill installation disabled; memory-enabled Pi/all installation now fails before writes with a clear manual-registration boundary.

**Verification Note:**
- The generic `run-quality-checks` helper could not map its `format:fix` target to this repository's `format-fix` mise task. No formatter ran through that helper; repository-native `mise run quality` is used instead.
- `mise run quality` passed: 14 Python tests, 24 generic TypeScript tests, 2 OpenCode tests, and 3 Pi tests.
- Strict TypeScript typechecking passed for all workspaces. Model-backed Pi tests remain environment-gated and were not executed locally.

---

opencode-agent: lead-engineer
