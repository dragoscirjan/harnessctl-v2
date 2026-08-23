# Code intelligence

Harnessctl can generate provider-neutral retrieval guidance for an external MCP server.
It does not register or run that server and never makes index output authoritative.
For sourced, non-endorsing provider comparisons and user-owned host examples, see the
[external provider guide](code-intelligence-providers.md). The guide does not change this
provider-neutral contract.

## Configuration

The feature is explicitly opt-in:

```yaml
skills:
  sdlc-code-index:
    enabled: true
    mcp_server: sdlc-code-index
```

`mcp_server` must be 1 through 64 lowercase ASCII characters, start and end with an
alphanumeric character, contain only alphanumeric characters, `_`, or `-`, and not use
the reserved `cvs_` prefix. The name must match a server that the user separately
configures in the selected host. Harnessctl treats the value only as guidance: it does
not create, recognize, remove, install, configure, start, probe, index, watch, or manage
the server or its processes, packages, models, credentials, storage, or data.

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

Tool availability grants no permission for installation, setup, startup, indexing,
watching, mutation, deletion, model download, credential access, storage changes, or any
other lifecycle operation. Those actions remain separate user decisions outside the
generated skill.

## Disablement and migration

A fresh disabled install writes no code-index skill. If a generated skill already exists,
a disabled install preserves its exact bytes and emits one warning per selected host. The
warning identifies the discoverable, active-capable file and its manual removal path;
harnessctl never deletes it automatically.

The old top-level `code_index` key and all `mcp.servers` mappings are rejected. Migrate
only the desired `enabled` state and external server name to `skills.sdlc-code-index`.
Then audit `.opencode/opencode.json` and `.pi/mcp.json` manually, retaining or removing
external entries according to current user intent. Stop any old processes separately.
An old provider package may be uninstalled only after confirming no other project or
workflow uses it; package and index data removal is also user-owned.

Formal Verify owns current acceptance mapping and independent security, privacy,
compatibility, and maintainability review. A runtime MCP handshake is a separate
user-authorized operation outside harnessctl's SDLC phases.
