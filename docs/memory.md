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

The current function tools are `memory_search`, `memory_list`, `memory_get`, `memory_store`,
`memory_supersede`, `memory_delete`, `memory_validate`, `memory_export`, and
`memory_import`. Retrieval is bounded by configuration. Import supports preview;
export and import are explicit migration operations rather than routine synchronization.

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

Only `memory.backend: repository` is accepted today. SQLite is an implementation
detail of local repository operations, not another selectable service.

## Current configuration examples

### Default disabled memory

This complete relevant configuration keeps memory disabled:

```yaml
version: 2
communication:
  caveman:
    enabled: true
    mode: strict
memory:
  enabled: false
  backend: repository
  namespace:
    organization_id: local
    project_id: project
    default_topic: general
  retrieval:
    limit: 8
    max_chars: 12000
    include_superseded: false
  repository:
    root: .harnessctl/memory
```

### Enabled repository memory

This example scopes shared records to a named project and uses narrower retrieval:

```yaml
version: 2
communication:
  caveman:
    enabled: true
    mode: strict
memory:
  enabled: true
  backend: repository
  namespace:
    organization_id: acme
    project_id: payments-api
    default_topic: architecture
  retrieval:
    limit: 5
    max_chars: 4000
    include_superseded: false
  repository:
    root: .harnessctl/memory
```

The example contains no credential value. Enabling memory requires caveman to remain
enabled so persisted records stay compact.

### Minimal deep-merge override

Project configuration overlays defaults recursively. With the default caveman setting,
this is enough to enable repository memory:

```yaml
version: 2
memory:
  enabled: true
```

OpenCode receives the generated memory skill, SDLC memory hooks, plugin entry, and
adapter dependency when memory is enabled. Pi receives the generated memory skill and
hooks, while project-local `@harnessctl/pi-tools` registers normalized memory tools.
See [skills](skills.md) and [configuration](configuration.md).

## Future service examples — NOT IMPLEMENTED

The following conceptual backends are discussion shapes, not compatibility promises.
Setting `memory.backend` to any of them currently fails validation, and generic-tools
has no adapter for them.

Every example below is intentionally invalid today and rejected by the current schema.
Token fields contain environment-variable names, never token values.

### Remote libSQL concept

```yaml
version: 2
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
version: 2
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
version: 2
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
version: 2
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
