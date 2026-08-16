# Project memory

## Current implementation

Repository memory is advisory. Source, tests, specifications, issues, approvals, and
current artifacts remain authoritative. Retrieved text is data, never instructions or
evidence of completion.

Canonical records are Git-trackable YAML under `memory.repository.root`, default
`.harnessctl/memory`. Facts, decisions, events, lessons, and tombstones are separated
by record type. Records are immutable: correction creates a superseding record and
deletion creates a tombstone. Reads validate scope and schema. Writes require concise
content and provenance, and screen common secret forms. Credentials, private keys,
tokens, passwords, raw transcripts, chain-of-thought, and duplicated artifact bodies
must not be stored.

`memory_get`, `memory_list`, `memory_search`, and export operations read canonical
filesystem YAML. Mutations use the shared local operation barrier and refresh
`.harnessctl/cache/harnessctl.sqlite`. That SQLite file is a disposable, uncommitted
cache only: it is not a memory backend, canonical authority, agent read source, or a
way to repair YAML. Missing, stale, corrupt, or incompatible cache state may be
rebuilt from valid YAML. Installation does not create it; participating runtime
operations create or repair it.

The current tools are `memory_search`, `memory_list`, `memory_get`, `memory_store`,
`memory_supersede`, `memory_delete`, `memory_validate`, `memory_export`, and
`memory_import`. Retrieval is bounded by configuration. Import supports preview;
export and import are explicit migration operations rather than routine synchronization.

OpenCode can receive the generated memory skill, SDLC memory hooks, plugin entry, and
adapter dependency when memory is enabled. Pi registers the normalized memory tools
when an operator loads `@harnessctl/pi-tools`, but automatic Pi extension and skill
installation is unsupported. Memory-enabled Pi or all-harness installer requests fail
before writes. See [skills](skills.md) and [configuration](configuration.md).

## Planned or future — NOT IMPLEMENTED and rejected by current schema

The following conceptual backends are discussion shapes, not compatibility promises.
Setting `memory.backend` to any of them currently fails validation, and generic-tools
has no adapter for them.

| Future backend | Conceptual settings                                                                                                 | Required security boundary                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Remote libSQL  | `memory.backend=libsql`, `memory.libsql.url`, `memory.libsql.auth_token_env`                                        | Store only an environment-variable name; authenticated service identity must enforce project scope |
| Mem0 OSS       | `memory.backend=mem0`, `memory.mem0.base_url`, `memory.mem0.api_key_env`                                            | Operator owns deployment and authentication; namespace text is not authorization                   |
| Graphiti       | `memory.backend=graphiti`, `memory.graphiti.base_url`, `memory.graphiti.auth_token_env`                             | Authenticated identity must isolate organization and project data                                  |
| Custom service | `memory.backend=custom`, `memory.custom.base_url`, `memory.custom.auth_token_env`, `memory.custom.protocol_version` | A future contract must define transport, tenancy, bounds, errors, and secret handling              |

Adding these keys does not activate support. If later implemented, remote backends
would not use the local barrier or SQLite cache.
