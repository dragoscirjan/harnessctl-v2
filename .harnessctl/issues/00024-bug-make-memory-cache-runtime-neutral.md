---
id: "00024"
type: bug
title: "Make repository memory cache runtime-neutral"
status: done
parent: "00006"
depends: []
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Make repository memory cache runtime-neutral

Given OpenCode loads npm plugins with Bun
When `@harnessctl/opencode-tools` imports repository memory support
Then plugin registration must not depend on Node-only or Bun-only SQLite modules.

## Steps to Reproduce

1. Configure OpenCode to load `@harnessctl/opencode-tools@0.1.1`.
2. Start OpenCode with Bun 1.3.
3. Observe plugin import fail on static `node:sqlite` resolution.

## Expected Behavior

OpenCode, Pi, Node.js, and Bun load the shared package and expose memory tools.

## Actual Behavior

Bun aborts plugin import with `No such built-in module: node:sqlite`, so no harnessctl tools register.

## Technical Requirements

- Keep YAML files as canonical memory state.
- Use a dependency-free, disposable JSON search index.
- Rebuild malformed or legacy cache files automatically.
- Prevent packed runtime files from importing `node:sqlite` or `bun:sqlite`.

## Acceptance Criteria

- [x] Generic memory tests cover JSON cache creation and legacy-cache replacement.
- [x] Package inspection rejects host-specific SQLite imports.
- [x] Built OpenCode plugin loads under Bun and exposes all expected tools.
- [x] Full repository quality and package checks pass.

## Comments

**Status Update:**
Replaced the Node-only SQLite cache with a runtime-neutral JSON index containing IDs and searchable text only. Canonical records remain authoritative YAML. Added automatic cache rebuild and package portability checks.

**Artifacts:**
- [`extensions/generic-tools/memory.ts`](../extensions/generic-tools/memory.ts)
- [`extensions/generic-tools/memory.spec.ts`](../extensions/generic-tools/memory.spec.ts)
- [`scripts/check-packages.mjs`](../scripts/check-packages.mjs)

**Next Steps / Blockers:**
- Release patch versions through the existing Changesets workflow.
- No implementation blockers.

---

opencode-agent: lead-engineer
