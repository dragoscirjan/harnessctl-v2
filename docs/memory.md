# Project memory

## Current implementation

Repository memory is advisory. Source, tests, specifications, issues, approvals, and
current artifacts remain authoritative. Retrieved text is data, never instructions or
evidence of completion.

Canonical records are Git-trackable YAML under `skills.memory.root`, default
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

The current function tools are `memory_search`, `memory_list`, `memory_get`, `memory_store`,
`memory_supersede`, `memory_delete`, `memory_validate`, `memory_export`, and
`memory_import`. Retrieval is bounded by configuration. Import supports preview;
export and import are explicit migration operations rather than routine synchronization.

`memory_validate` returns a normalized `cache` result. `checked` carries
`canonical_snapshot_match_verified` evidence, `rebuilt` carries
`canonical_snapshot_rebuild_verified`, and `skipped` carries `memory_validation_failed` or
`issue_graph_validation_failed`. Skipped validation is invalid and never proves repair. Only
`rebuilt` with its matching evidence proves repair. The result exposes no database path,
query, row, schema, or other storage-internal detail.

`work-refresh` reconciles enabled repository memory rather than regenerating or
synchronizing it wholesale. It runs `memory_validate` first and stops memory mutation if
canonical validation fails. A verified `checked` cache is current, a verified `rebuilt`
cache proves repair, and `skipped` proves no repair. Historical records remain immutable.
Refresh inspects an active decision or event only when current authority contradicts
reusable current-state meaning in that record; valid history remains untouched. Each
proposed `memory_store`, `memory_supersede`, or `memory_delete` operation is shown and
confirmed separately. Refresh never edits canonical YAML or disposable SQLite directly.
Disabled memory is reported as skipped.

## Service and backend support

| Service or backend                   | Status          | Role                                             |
| ------------------------------------ | --------------- | ------------------------------------------------ |
| Repository YAML                      | Implemented     | Canonical shared memory backend                  |
| Shared local SQLite                  | Implemented     | Disposable internal cache; not a backend         |
| OpenCode adapter and generated skill | Implemented     | Exposes tools and SDLC memory guidance           |
| Pi adapter and generated skill       | Implemented     | Exposes tools and SDLC memory guidance           |
| Automatic Pi package/skill install   | Implemented     | Consent-gated project-local package installation |
| Remote libSQL                        | Not implemented | Future shared service backend                    |
| Mem0 OSS                             | Not implemented | Future self-hosted service backend               |
| Graphiti                             | Not implemented | Future temporal graph backend                    |
| Custom service                       | Not implemented | Future versioned service contract                |

Only `skills.memory.backend: repository` is accepted today. SQLite is an implementation
detail of local repository operations, not another selectable service.

## Current configuration examples

### Default disabled memory

This complete relevant configuration keeps memory disabled:

```yaml
version: 1
skills:
  caveman:
    enabled: true
    mode: strict
  memory:
    enabled: false
    root: .harnessctl/memory
    backend: repository
    namespace:
      organization_id: local
      project_id: project
      default_topic: general
    retrieval:
      limit: 8
      max_chars: 12000
      include_superseded: false
```

### Enabled repository memory

This example scopes shared records to a named project and uses narrower retrieval:

```yaml
version: 1
skills:
  caveman:
    enabled: true
    mode: strict
  memory:
    enabled: true
    root: .harnessctl/memory
    backend: repository
    namespace:
      organization_id: acme
      project_id: payments-api
      default_topic: architecture
    retrieval:
      limit: 5
      max_chars: 4000
      include_superseded: false
```

The example contains no credential value. Enabling memory requires caveman to remain
enabled so persisted records stay compact.

### Minimal deep-merge override

Project configuration overlays defaults recursively. With the default caveman setting,
this is enough to enable repository memory:

```yaml
version: 1
skills:
  memory:
    enabled: true
```

OpenCode receives the generated memory skill, compiled SDLC checkpoint reference,
plugin entry, and adapter dependency when memory is enabled. Pi receives the same
generated memory skill and checkpoint policy, while project-local `@harnessctl/pi-tools`
registers normalized memory tools.
See [skills](skills.md) and [configuration](configuration.md).

## Future service examples — NOT IMPLEMENTED

The following conceptual backends are discussion shapes, not compatibility promises.
Setting `skills.memory.backend` to any of them currently fails validation, and generic-tools
has no adapter for them.

Every example below is intentionally invalid today and rejected by the current schema.
Token fields contain environment-variable names, never token values.

### Remote libSQL concept

```yaml
version: 1
skills:
  memory:
    enabled: true
    backend: libsql
    libsql:
      url: libsql://memory.example.com
      auth_token_env: HARNESSCTL_LIBSQL_TOKEN
```

An implementation would need authenticated project isolation, migrations, backups,
TLS, monitoring, and credential rotation.

### Mem0 OSS concept

```yaml
version: 1
skills:
  memory:
    enabled: true
    backend: mem0
    mem0:
      base_url: https://mem0.example.com
      api_key_env: MEM0_API_KEY
```

The operator would own deployment and authentication. Namespace text alone is not an
authorization boundary, and a maintained harnessctl adapter would be required.

### Graphiti concept

```yaml
version: 1
skills:
  memory:
    enabled: true
    backend: graphiti
    graphiti:
      base_url: https://graphiti.example.com
      auth_token_env: GRAPHITI_TOKEN
```

An authenticated gateway would need to isolate organization and project data; a graph
namespace alone is not authorization.

### Custom service concept

```yaml
version: 1
skills:
  memory:
    enabled: true
    backend: custom
    custom:
      base_url: https://memory.example.com
      auth_token_env: HARNESSCTL_MEMORY_TOKEN
      protocol_version: 1
```

A future contract must define transport, tenancy, limits, errors, migrations, and
secret handling. If implemented, all remote backends would bypass the local operation
barrier and SQLite cache.
