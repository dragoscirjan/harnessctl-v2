---
type: lld
status: review
author: lead-engineer
parent: .specs/00001-prd-human-governed-sdlc-v1.md
---

# Caveman and Memory Skills — Low-Level Design

## Context

`harnessctl` needs two global, SDLC-independent skills:

1. `caveman` reduces generated and consumed prompt tokens without removing technical substance.
2. `memory` gives agents consistent rules for retrieving and preserving project knowledge across sessions and developers.

Persistent project memory must always be shareable with authorized developers. Local-only SQLite or JSONL files outside version control do not satisfy this requirement. Project artifacts remain authoritative; memory helps locate and recover context.

This LLD adds skills, configuration, installation, and a backend contract. It does not rewrite existing SDLC commands. That is a later task using the completed `caveman` rules.

## Goals

- Install concise, self-contained `caveman` and `memory` skills.
- Compile each skill from Jinja at install time.
- Generate only selected behavior and backend instructions.
- Support Git-native repository memory first.
- Define optional shared libSQL, Mem0 OSS, Graphiti, and custom-service profiles.
- Make memory classification deterministic.
- Keep retrieval bounded and token-efficient.
- Reject secrets before persistence.
- Preserve backend portability through a canonical record format.

## Non-Goals

- Persisting chain-of-thought, scratch reasoning, or complete transcripts.
- Replacing specs, issues, source code, tests, reports, or version control.
- Synchronizing active conversation buffers between harnesses.
- Providing managed cloud infrastructure.
- Shipping Graphiti or Mem0 infrastructure in the first implementation.
- Guaranteeing secret detection for arbitrary encoded or previously unknown secret formats.

## Approach

### Compile-time specialization

Source skills are Jinja templates. Installer reads `.harnessctl/config.yaml`, validates it against one canonical JSON Schema, then renders backend-specific `SKILL.md` files. Generated `memory` skill names only selected tools and supported operations. It does not teach agents about unused backends.

Benefits:

- Smaller prompts.
- Lower tool-selection ambiguity.
- No runtime backend decision.
- Deterministic generated files.
- One source template for OpenCode and Pi-compatible hosts.

The installer selects **storage backend**. The generated skill selects **memory type** for each information item.

### Caveman behavior

`caveman` derives from the existing `productivity-caveman` skill. It has two install-time modes:

- `strict` (default): fragments, short synonyms, common technical abbreviations, no filler.
- `balanced`: concise professional sentences, no forced fragment style.

Both modes:

- Remove greetings, filler, repetition, and closing restatements.
- Preserve technical names, code, commands, errors, constraints, and evidence.
- Ask only blocking questions; combine related questions compactly.
- Prefer bullets, tables, and arrows when shorter.
- Never use hard word/token limits.
- Temporarily expand for security warnings, destructive confirmations, or ordered instructions where compression risks ambiguity.
- Stay active after loading until explicitly disabled.

`caveman` is templated because generated skill needs only one mode. Existing SDLC prompts may later be rewritten with the same rules and will not need runtime `caveman` loading merely to remain concise.

### Memory classification

Generated `memory` skill applies this decision tree independently to every information item:

1. **Needed only for current turn/session?** Keep in working context. Do not persist.
2. **Stable, reusable statement?** Store as `semantic` memory.
3. **Something that happened, changed, was decided, failed, or completed?** Store as `episodic` memory.
4. **Distilled reusable method or lesson from repeated work?** Store as `procedural` memory.

Classification examples:

| Information | Type | Persistent |
| --- | --- | --- |
| Temporary command output | Working | No |
| Project uses Python 3.11+ | Semantic | Yes |
| Team approved memory backend on a date | Episodic | Yes |
| A failed migration and its outcome | Episodic | Yes |
| Reusable release recovery procedure | Procedural | Yes |
| Unconfirmed hypothesis | Working until confirmed | No |

Folder mapping for repository backend:

- Semantic → `facts/`
- Episodic decision → `decisions/`
- Other episodic event → `events/`
- Procedural → `lessons/`
- Logical removal → `tombstones/`

Agents do not ask users to choose a type unless classification remains genuinely ambiguous after applying these rules.

### Memory lifecycle

#### Retrieve

Retrieve memory at session start, resume, phase/layer transition, or when current work needs an earlier fact. Query project and topic scope first. Return a bounded result set. Do not load complete stores.

Retrieval order:

1. Current authoritative artifacts.
2. Active, non-superseded memory relevant to project/topic.
3. User clarification when artifacts and memory conflict or remain incomplete.

#### Store

Store only confirmed, reusable, concise information. Each write contains one atomic fact, event, decision, or lesson. Never store raw transcripts, chain-of-thought, temporary outputs, duplicated artifact bodies, or secrets.

#### Reconcile

Artifact wins on conflict. Agent records a new memory that supersedes stale memory, with artifact provenance. Existing shared history is not silently overwritten.

#### Delete

Normal deletion creates a tombstone. Accidental secret persistence is an incident: stop, rotate credential, remove it from backend and repository history using approved security procedures. Tombstones are insufficient for leaked secrets.

### Canonical portable record

All backends must support import/export equivalent to this logical schema:

```yaml
schema_version: 1
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
memory_type: semantic
record_type: fact
organization_id: dragosc
project_id: harnessctl-v2
topic: memory
summary: Project memory uses Git-native immutable records.
details: null
source:
  kind: discussion
  ref: null
  revision: null
created_at: 2026-08-11T12:00:00Z
created_by: developer-id
confidence: confirmed
status: active
supersedes: []
tags: []
```

Enums:

- `memory_type`: `semantic | episodic | procedural`.
- `record_type`: `fact | decision | event | lesson`.
- Valid pairs: semantic/fact, episodic/decision, episodic/event, procedural/lesson.
- `source.kind`: `artifact | user-confirmed | discussion | tool-observation`.
- `confidence`: `confirmed | verified`; `verified` requires artifact or tool-observation provenance.
- `status`: `active` in immutable records. Superseded/deleted state is derived from links and tombstones.

Required fields: schema version, valid Crockford ULID, memory type, record type, organization/project/topic scope, concise summary, source, RFC 3339 UTC timestamp, author, confidence, active status, supersession list.

Canonical YAML is UTF-8, LF-only, final newline, fixed key order, no aliases, custom tags, duplicate keys, or implicit non-schema fields. Import accepts equivalent field order but export rewrites canonical form. Supersession references must resolve within the same project, cannot self-reference, and must form an acyclic graph.

Tombstones use a separate schema containing `schema_version`, tombstone ULID, organization/project scope, `target_id`, reason, source, creator, and timestamp. They contain no replacement content.

Records are immutable. Corrections create a new record with `supersedes`. Repository deletion creates a tombstone referencing target ID. Derived indexes exclude superseded and tombstoned records by default.

### Secret prohibition

No supported configuration disables secret protection. Allowing secrets requires replacing/forking the generated skill and any harnessctl-owned adapter.

Defense in depth:

1. Skill refuses credentials, tokens, private keys, passwords, session cookies, recovery codes, and secret-bearing environment values.
2. Harnessctl-owned write and import tools scan every string field using field names, known credential formats, private-key markers, entropy, and configured deny patterns. Export validates again and fails closed if canonical data contains a suspected secret.
3. Records store environment variable **names**, never values.
4. CI and pre-commit validation scan manually added repository records.
5. Tests cover representative secret fixtures and sanitized alternatives.

Detection cannot mathematically prove arbitrary text contains no secret. Documentation must state this limit and require credential rotation/history purge after accidental exposure. Personally identifiable or otherwise sensitive information is a separate policy: project memory is team-visible, so the skill stores it only when necessary, explicitly approved, and permitted by project policy. Credentials remain prohibited without exception.

## Backend Options

### 1. Repository records with derived SQLite index — default and first implementation

Canonical data:

```text
.harnessctl/memory/
├── facts/<ulid>.yaml
├── decisions/<ulid>.yaml
├── events/<ulid>.yaml
├── lessons/<ulid>.yaml
└── tombstones/<ulid>.yaml
```

Generated cache:

```text
.harnessctl/cache/memory-index.json
```

Memory records are Git-tracked. Cache is gitignored, disposable, rebuilt after pull/checkout when manifest hash differs. One immutable file per record minimizes merge conflicts. Writes use exclusive creation (`O_CREAT | O_EXCL`) so an existing ID can never be replaced. Validation rejects malformed schema, duplicate ULIDs, broken or cyclic supersession/tombstone links, wrong project scope, and known secrets.

Cache manifest hashes sorted canonical relative paths plus SHA-256 file bytes, record schema version, and index schema version. Rebuild takes a project cache lock, builds a uniquely named temporary DB, validates source manifest again, fsyncs, then atomically replaces cache. A changed source manifest causes bounded retry; lock/process failure leaves prior valid cache available and stale cache is never used silently.

All mutations use one project filesystem lock. `store`, `supersede`, `delete`, and `import` hold it from state read through validation and durable write. A supersede target must remain active and have no active replacement; first writer wins and later writers receive `MemoryConflictError`. Delete similarly requires an active, non-tombstoned target.

Batch import stages canonical files plus a manifest containing each target path and SHA-256 under gitignored `.harnessctl/cache/memory-transactions/<transaction-id>/`. It writes and fsyncs every staged file and staging directory before acquiring mutation lock. Under lock it revalidates against current state, atomically renames an fsynced temporary manifest to `prepared.yaml`, then fsyncs transaction directory before creating targets in deterministic ULID order.

Every reader/writer first rolls any prepared transaction forward under lock. Recovery treats an existing target with bytes matching prepared SHA-256 as already completed; a mismatch is a hard recovery conflict and no file is overwritten. After all exclusive creates, recovery fsyncs affected canonical directories, writes/fsyncs a committed marker, then removes staging. Failure before durable prepare mutates no canonical file; interruption after prepare completes idempotently during recovery. Import never overwrites an existing ID.

Search uses SQLite FTS over generated cache. SQLite is never canonical and never committed.

**Advantages:** shareable, reviewable, portable, mergeable, no service, cheap retrieval.
**Costs:** many small files, Git history growth, no semantic retrieval in v1.

### 2. Repository JSONL log

One append-only `.harnessctl/memory/memory.jsonl` file.

**Advantages:** compact, easy streaming/import.
**Costs:** concurrent appends create conflict hotspots; malformed lines affect processing.
**Decision:** supported only as import/export format, not recommended canonical team mode.

### 3. Repository topic files

One YAML file per topic.

**Advantages:** readable, fewer files.
**Costs:** active topics become merge-conflict hotspots; updates rewrite shared files.
**Decision:** not implemented initially.

### 4. Dolt or another versioned SQL database

**Advantages:** SQL queries plus branch/merge semantics.
**Costs:** heavy runtime, separate VCS workflow, custom MCP/tools, operational burden.
**Decision:** documented experimental profile only after a dedicated spike.

### 5. Remote libSQL through `mcp-memory-libsql`

MIT-licensed MCP supports remote `LIBSQL_URL` and `LIBSQL_AUTH_TOKEN`, entity/observation/relation operations, and text search.

**Advantages:** small stack, existing MCP, no mandatory ingestion LLM.
**Costs:** upstream tools do not provide harnessctl record schema, strong project authorization, temporal semantics, or server-side harnessctl secret policy. Database/token-per-project isolation is required; name prefixes are not security boundaries.

**Decision:** minimal shared option. Direct integration is capability-limited. A harnessctl adapter is required before claiming full normalized contract or enforced secret filtering.

### 6. Mem0 OSS self-hosted

Apache-2.0. Self-hosted API uses Postgres/pgvector and dashboard with JWT/API-key support. Memory can be scoped by app/user/agent/run. Local model/embedding configurations are possible.

Managed Mem0 client scope fields must not be assumed to exist unchanged in the self-hosted API. Adapter design must contract-test the selected OSS version. Project isolation uses a server-supported tenant/collection/metadata boundary bound to credentials; if unavailable, use deployment/database per project. Developer, agent, and run identifiers are mapped only where the self-hosted API verifies those fields.

**Advantages:** team auth, semantic retrieval, useful scopes, dashboard.
**Costs:** heavier stack, model/embedding operations, operational cost. Official open-source `mem0-mcp` repository is archived; hosted MCP is not acceptable as default.

**Decision:** recommended robust shared backend only through a maintained harnessctl-owned MCP adapter targeting self-hosted API.

### 7. Graphiti

Apache-2.0 temporal knowledge graph using FalkorDB or Neo4j. MCP supports HTTP, episodes, facts, nodes, and `group_id` namespaces.

**Advantages:** strongest temporal validity, provenance, semantic/episodic graph retrieval.
**Costs:** experimental MCP, several LLM calls per ingestion, model cost/latency, heavier DB, local model reliability concerns. `group_id` is namespace—not authorization. Shared deployment requires network isolation plus an authenticated reverse proxy or harnessctl adapter that binds authenticated identity to allowed groups.

**Decision:** advanced optional backend after security and cost spike.

### 8. Custom harnessctl memory service

Normalized MCP backed by SQLite for development and PostgreSQL/pgvector for shared service.

**Advantages:** exact contract, ACLs, audit, secret enforcement, stable harness-neutral tools.
**Costs:** harnessctl owns auth, migrations, search, concurrency, backup, security, and operations.

**Decision:** future option if memory becomes core product. Do not build in first slice.

## Recommended Delivery Path

1. Repository YAML canonical store + generated SQLite FTS cache.
2. Normalized repository tools in generic TypeScript package with OpenCode/Pi adapters.
3. Import/export canonical records.
4. Remote libSQL adapter for minimal shared service.
5. Mem0 OSS adapter for robust authenticated shared service.
6. Graphiti advanced adapter only after spike.

Every persistent mode is shared either through Git or authenticated service. A local untracked database is never a supported canonical mode.

## Configuration

Config v2 initially accepts only implemented `repository` backend. Future backend shapes below are reserved design, not accepted configuration until their adapters ship. This prevents generated skills from referring to unavailable tools.

Initial `.harnessctl/config.yaml` additions:

```yaml
version: 2

communication:
  caveman:
    enabled: true
    mode: strict # strict | balanced

memory:
  enabled: true
  backend: repository
  namespace:
    organization_id: dragosc
    project_id: harnessctl-v2
    default_topic: general
  retrieval:
    limit: 8
    max_chars: 12000
    include_superseded: false
  repository:
    root: .harnessctl/memory
    cache: .harnessctl/cache/memory-index.json
```

Future schema versions add one backend at a time after its adapter passes contract tests. Planned remote profile fields use environment-variable references only:

```yaml
# Design examples; rejected by config v2 until implemented.
memory:
  backend: libsql
  libsql:
    url_env: HARNESSCTL_MEMORY_LIBSQL_URL
    token_env: HARNESSCTL_MEMORY_LIBSQL_AUTH_TOKEN
    isolation: database-per-project
# mem0: endpoint_env + api_key_env
# graphiti: authenticated_gateway_endpoint_env + auth_token_env + group_id
# custom: endpoint_env + auth_token_env
```

Only selected backend subsection is required and rendered. Credentials are referenced by environment-variable name and never read into generated files.

Zod 4 schemas in `extensions/generic-tools/schemas.ts` are the only authored structural schema source. TypeScript infers types and validates runtime values from those schemas. `z.toJSONSchema()` generates portable Draft 2020-12 contracts into `extensions/generic-tools/contracts/`; generated files ship with `@harnessctl/generic-tools`. Python validation remains independent in this slice because the installer does not consume memory records and must not depend on npm workspace layout. Shared valid/invalid fixtures detect behavioral drift.

Fixed security behavior is intentionally absent from config. Secret prohibition, atomic records, provenance, and project scoping cannot be disabled through standard configuration.

### Installer validation

Installer fails before writing when:

- Unknown caveman mode/backend.
- Missing organization/project identifier.
- Absolute or escaping repository path.
- Cache path lies inside canonical memory root.
- Future selected remote backend lacks required environment-variable **reference names**.
- Selected backend is unsupported for target harness.
- Existing generated files differ and `--force` was not given.
- Pi skill discovery/path contract has not been verified for installed Pi version.

Installer warns—but does not persist credential values—when required runtime environment variables are unset. This supports installation in CI images where secrets arrive later.

## Logical Tool Contract

Harnessctl-owned adapters use these operations:

| Operation | Purpose |
| --- | --- |
| `memory_search` | Bounded active-record search by project, topic, type, query |
| `memory_get` | Read one record by ID |
| `memory_store` | Validate and create immutable record |
| `memory_supersede` | Create replacement linked to prior ID |
| `memory_delete` | Create tombstone or invoke backend deletion policy |
| `memory_list` | Bounded filtered listing |
| `memory_validate` | Validate schema, links, scopes, and secret policy |
| `memory_export` | Export canonical portable records |
| `memory_import` | Validate and import canonical portable records |

Generated skill includes exact tools available for selected backend. Unsupported operations are omitted; installer reports reduced capabilities. It must not pretend upstream tools enforce harnessctl semantics.

Repository backend supplies full contract. Direct `mcp-memory-libsql` supplies search/entity/relation primitives only. Mem0 and Graphiti require explicit adapters before full-contract support. Generated skills may only reference normalized tools installed and registered for that target project.

## File Changes

| File | Change |
| --- | --- |
| `extensions/generic-tools/schemas.ts` | Only authored Zod schemas; inferred TypeScript types and structural runtime validation. |
| `extensions/generic-tools/generate-contracts.ts` | Generate portable Draft 2020-12 JSON contracts from Zod. |
| `extensions/generic-tools/contracts/` | Generated JSON contracts shipped with `@harnessctl/generic-tools`. |
| `src/harnessctl/templates/skills/caveman/SKILL.md.j2` | Compile selected concise communication mode. |
| `src/harnessctl/templates/skills/memory/SKILL.md.j2` | Compile classification/lifecycle rules and selected backend tool instructions. |
| `src/harnessctl/templates.py` | Register skill templates and rendering context. |
| `src/harnessctl/install.py` | Load config, validate profiles, render/install skill files atomically. |
| `extensions/generic-tools/memory.ts` | Repository record schema, validation, secret screening, FTS cache, normalized operations. |
| `extensions/opencode-tools/index.ts` | Expose normalized repository memory tools. |
| `extensions/opencode-tools/package.json` | Add build output, exports, files, and publishable exact-version metadata. |
| `extensions/pi-tools/index.ts` | Expose tools only after Pi compatibility is verified. |
| `.gitignore` template/update | Ignore `.harnessctl/cache/`, never canonical records. |
| Python and TypeScript tests | Rendering, install conflicts, records, cache, security, adapters. |
| `README.md` and `FLOWS.md` | Document skills, configuration, authority, and supported backend status. |

Generated destinations:

- OpenCode: `.opencode/skills/caveman/SKILL.md`, `.opencode/skills/memory/SKILL.md`.
- Pi: destination must be verified against Pi's current skill discovery contract before implementation; do not invent `.pi/skills` behavior.

### OpenCode tool distribution

Current Python installer installs Markdown commands only; workspace TypeScript packages are not delivered to target projects. First slice uses OpenCode's documented project-local plugin auto-discovery:

1. Publish `@harnessctl/opencode-tools` as compiled ESM with package exports, runtime dependencies, and exact version matching Python release.
2. Installer merges that exact dependency into `.opencode/package.json`, preserving unrelated fields. Existing incompatible version is a conflict unless `--force` replaces only that dependency.
3. Installer writes `.opencode/plugins/harnessctl-memory.js`, a fixed shim importing and exporting `@harnessctl/opencode-tools`. OpenCode auto-discovers `.opencode/{plugin,plugins}/*.{ts,js}`.
4. No `opencode.json` plugin-list merge is required.
5. Installer statically validates package version and shim. Integration test launches supported OpenCode in a fixture and verifies normalized tools register.
6. Installer snapshots original `.opencode/package.json` bytes and plugin file; failure restores exact bytes and removes newly created files.

Published npm package distribution is the first-slice decision. Offline adapter installation is deferred; a future verified tarball option may add it without changing skill contract.

First production slice targets OpenCode only. Pi memory generation remains disabled until skill discovery and extension distribution are verified. `caveman`, needing no custom tools, may ship to any host with a verified skill path independently.

## Install Order

1. Parse and validate config.
2. Resolve target harness and supported skill destination.
3. Verify exact OpenCode adapter package version and project-local plugin contract.
4. Resolve selected caveman mode and implemented memory backend capabilities.
5. Render both skills in memory.
6. Validate rendered frontmatter/content and absence of credential values.
7. For repository backend, create canonical directories and ignore cache path.
8. Atomically install skills, package dependency, and local plugin shim with rollback semantics.
9. Run host tool-discovery smoke check; roll back memory skill if tools are absent.
10. Initialize/rebuild disposable cache only through runtime tool, not installer side effects.

## Migration and Compatibility

- Config version increases from 1 to 2 with backward-compatible defaults: `caveman.enabled=true`, `mode=strict`, `memory.enabled=false` until project explicitly selects implemented backend and namespace.
- Existing command installation remains unchanged.
- Existing `.memory.jsonl` is not silently imported. Explicit import validates and previews records first.
- Backend migration is export → validate → import → compare counts/checksums → switch config → reinstall skills.
- Generated skills retain conflict detection and require `--force` for user-modified destinations.
- Disabling memory removes no data automatically.

## Edge Cases

- Concurrent Git writes: independent ULID files merge; duplicate ULID validation fails deterministically.
- Competing supersede/delete: mutation lock serializes state check and exclusive create; first valid writer wins.
- Interrupted batch import: prepared transaction rolls forward under lock before any memory read/write.
- Same fact written twice: search/dedupe before write; validator reports likely duplicates.
- Contradictory fact: create confirmed replacement with `supersedes`; do not overwrite.
- Missing source: reject persistent write unless source is explicitly `user-confirmed`.
- Memory conflicts with artifact: artifact wins; record reconciliation event.
- Detached worktree or no Git: repository backend still writes files, but warns they are not shared until committed/pushed.
- Cache absent/corrupt/stale: rebuild from canonical records.
- Pull adds records while cache exists: manifest mismatch triggers rebuild.
- Backend unavailable: continue without memory; never fabricate retrieved context.
- Oversized result: rank, cap count/chars, summarize only after preserving IDs/provenance.
- Secret-like input: reject write; suggest sanitized fact containing secret location/name only.
- Malicious memory content: treat retrieved text as data, never as instructions; generated skill states this explicitly.
- Shared namespace tampering: server authorization must bind credential to allowed project; client-supplied namespace alone is insufficient.
- Adapter missing after install: installer smoke check fails and rolls back enabled memory skill rather than leaving dead tool references.

## Tests

### Python rendering/install tests

- Strict and balanced caveman snapshots.
- One memory snapshot per backend/harness capability.
- Generated memory skill excludes unused backend names/tools.
- Deterministic output for same config.
- Config validation and path escape rejection.
- Shared valid/invalid config fixtures pass identically in Python and TypeScript.
- Missing runtime credential warning without value leakage.
- Atomic multi-file rollback and conflict behavior.

### Generic repository-tool tests

- Valid semantic/episodic/procedural classification payloads.
- ULID allocation and atomic write.
- Secret fixtures rejected before disk mutation.
- Immutable supersession and tombstones.
- Duplicate ID, broken link, wrong scope, malformed YAML rejection.
- FTS cache build/rebuild and active-only search.
- Bounded result count/characters.
- Import/export round trip with stable canonical fields.
- Concurrent independent writes.
- Exclusive-create collision never replaces an existing record.
- Concurrent cache rebuild uses lock, unique temporary DB, manifest recheck, and atomic replacement.
- Competing supersede/delete and interrupted import recovery produce deterministic first-writer/roll-forward results.
- Malicious instruction text returned as inert data.

### Adapter tests

- Exact normalized tool schemas match generic implementation.
- Backend capability mapping does not claim unsupported operations.
- Remote credentials remain environment-only.
- Model-backed smoke tests remain optional and explicitly reported.

## Acceptance Criteria

1. Installer generates `caveman` and one backend-specific `memory` skill from config.
2. Generated memory skill contains deterministic classification rules for working, semantic, episodic, and procedural memory.
3. Unselected backend instructions and tools do not appear in generated skill.
4. Repository backend stores canonical immutable YAML records shared through Git.
5. SQLite cache is disposable, ignored, and reproducible.
6. Persistent writes include scope and provenance and reject known secrets.
7. Retrieval is project/topic scoped, active-only by default, and bounded.
8. Supersession and tombstones preserve history.
9. Export/import uses backend-neutral canonical record schema.
10. Shared backend docs distinguish namespace from authorization.
11. Existing command installation remains compatible.
12. Unit and quality suites pass; strict TypeScript typecheck joins quality gate.

## Ordered Tasks

1. Add config v2 schema/defaults/validation and migration tests.
2. Make OpenCode adapter publishable; implement exact-version `.opencode/package.json` merge and auto-discovered plugin shim.
3. Add caveman and repository-memory Jinja templates plus snapshot tests.
4. Extend atomic installer for skills, adapter registration, smoke check, and rollback.
5. Implement canonical memory record/tombstone schema, secret screening, and validation.
6. Implement exclusive repository writes, supersession, tombstones, and Git-friendly layout.
7. Implement locked generated SQLite FTS cache and bounded search.
8. Expose/package normalized OpenCode tools and tests.
9. Implement canonical import/export and manual-file CI/pre-commit validation.
10. Verify Pi skill/tool discovery; then add Pi output or document unsupported status.
11. Update docs and quality gate.
12. Run separate remote-libSQL, Mem0 OSS, and Graphiti capability/security spikes before adding their config enums.

## Decisions

- Compile backend-specific skill over runtime polymorphic prompt — fewer tokens and fewer wrong tool calls.
- Git-native immutable YAML over committed SQLite — developer-shareable and mergeable.
- Generated SQLite FTS cache over full-file prompt reads — cheap bounded retrieval.
- One file per record over single JSONL/topic files — fewer merge hotspots.
- Artifacts over memory on conflict — memory is advisory context.
- Append/supersede over mutable history — provenance and concurrent safety.
- No secret override in normal config — secure default cannot be toggled accidentally.
- Normalized harnessctl contract over pretending upstream equivalence — honest capability handling.
- Repository backend first over immediate shared service — smallest complete, free, shareable slice.
- Mem0 OSS adapter over archived official OSS MCP for robust shared mode — maintained integration boundary remains ours.
- Graphiti optional over default — temporal value does not justify initial cost/complexity.

## Assumptions

- Persistent project memory is team-visible; personal assistant memory is outside harnessctl scope.
- Git remote access already controls repository-memory sharing.
- Commercial-friendly licenses mean permissive dependencies such as MIT or Apache-2.0.
- Developers accept committing curated memory records, not raw discussions.
- Remote service operators own TLS, backups, monitoring, identity, and network policy.

## Risks and Open Questions

- Confirm Pi's current skill discovery path and metadata contract before promising Pi generation.
- Validate documented OpenCode local-plugin auto-discovery and `.opencode/package.json` dependency installation against supported integration-test version.
- Decide whether repository-memory commits are manual or optionally grouped by workflow commands.
- Choose YAML parser/schema validation library already compatible with generic-tools dependencies.
- Tune secret scanner false positives without weakening mandatory protection.
- Define authenticated transport standard before any remote backend is production-supported.
- Define remote libSQL provisioning, database-per-project ACL binding, TLS, backup, schema migration, monitoring, and credential rotation responsibilities before support.
- Benchmark Git growth, cache rebuild, and FTS relevance on representative project memory.
- Decide whether `details` should remain optional or be removed to enforce maximum concision.
