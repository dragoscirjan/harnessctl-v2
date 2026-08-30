# Code intelligence

Harnessctl can generate provider-neutral retrieval guidance for an external MCP server.
It does not register or run that server and never makes index output authoritative.
For sourced, non-endorsing provider comparisons and user-owned host examples, see the
[external provider guide](code-intelligence-providers.md). The guide does not change this
provider-neutral contract.

## Configuration

The feature is explicitly opt-in:

```yaml
version: 1
skills:
  codeIndex:
    enabled: true
    mcpName: sdlc-code-index
```

`mcpName` must be 1 through 64 lowercase ASCII characters, start and end with an
alphanumeric character, and contain only alphanumeric characters, `_`, or `-`; `cvs_` is
permitted. The name must match a server that the user separately
configures in the selected host. Harnessctl treats the value only as guidance: it does
not create, recognize, remove, install, configure, start, watch, or manage the server or
its processes, packages, models, credentials, storage, or data.

Enabled OpenCode and Pi selections receive byte-equivalent skills at
`.opencode/skills/sdlc-code-index/SKILL.md` and
`.pi/skills/sdlc-code-index/SKILL.md`. Existing code-index entries in
`.opencode/opencode.json` and `.pi/mcp.json` remain byte-for-byte user-owned under normal,
forced, migration, and rollback paths.

## Retrieval boundary

When code indexing is enabled and `sdlc-code-index` is available, relationship-aware
codebase retrieval or impact analysis tells the core SDLC guidance to load
`sdlc-code-index` before retrieval. When disabled, the compiled core explicitly refuses to load a discoverable
retained copy. If unavailable, disabled, or unsuitable, SDLC continues with direct source
discovery, Glob, Grep, and file reads.

The skill inspects live schemas and uses supported relationship-aware symbol, caller,
dependency, execution-flow, and impact retrieval. MCP output is advisory retrieval
evidence, never source authority. Material claims must be confirmed against source,
configuration, tests, and version-control state. If the MCP or required capability is
missing, stale, incomplete, or unsuitable, use Glob for file discovery and Grep for
exact text search, then read the relevant files.

Plan, Build, Verify, Release, and Continue are retrieval-only. The sole `work-refresh`
exception first loads `sdlc-code-index` and uses only its compiled configured server and
boundaries. It may invoke an explicitly supported safe refresh or reindex operation only
after ordered checks for live-schema support, current evidence freshness,
current-repository scope, and fresh consent naming the provider, operation, and repository.
Unsupported capability is reported without guessed tools, CLI fallback, alternate provider,
or route. Tool availability grants no permission
for installation, setup, startup, configuration, watching, clearing, deletion, reset,
model download, credential access, database or storage management, remote mutation,
destructive fallback, or any other lifecycle operation.

## Disablement and migration

A fresh disabled install writes no code-index skill. If a generated skill already exists,
a disabled install preserves its exact bytes and emits one warning per selected host. The
warning identifies the discoverable, active-capable file and its manual removal path;
harnessctl never deletes it automatically.

Use the `skills.codeIndex` mapping for the desired `enabled` state and external `mcpName`.
Generic host-neutral declarations belong in the independent top-level `mcpServers` registry.
Then audit `.opencode/opencode.json` and `.pi/mcp.json` manually, retaining or removing
external entries according to current user intent. Stop any old processes separately.
An old provider package may be uninstalled only after confirming no other project or
workflow uses it; package and index data removal is also user-owned.

Formal Verify owns current acceptance mapping and independent security, privacy,
compatibility, and maintainability review. A runtime MCP handshake is a separate
user-authorized operation outside harnessctl's SDLC phases. `work-refresh` is also outside
those phases, but its narrow provider operation remains subject to the exact live-schema,
repository-scope, and fresh-consent gates above.
