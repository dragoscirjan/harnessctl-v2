---
id: "00005"
type: lld
title: "Canonical YAML Issue Storage"
version: 1
status: review
parent: "00004"
opencode-agent: lead-engineer
---

# Canonical YAML Issue Storage

## 1. Document Control

| Item | Value |
| --- | --- |
| Design baseline | `.specs/hld-00004-canonical-yaml-issue-storage-v1.md` |
| Requirement lineage | Initiative 00001, Epic 00004, Story 00005 |
| Rollout dependency | Story 00006 |
| Implementation scope | Canonical filesystem issue provider only |
| Explicit exclusions | Legacy migration, SQLite implementation, cache-first query implementation, remote providers |

The orchestrator identifies the HLD as approved. Its repository frontmatter still says `draft`; maintainers should correct that governance metadata before implementation begins, without changing the technical baseline described here.

## 2. Objective and Delivery Boundary

Replace the filesystem issue provider’s `.issues/<id>/issue.md` and per-comment files with one authoritative `.issues/<id>-<title-slug>.yml` document per active issue and the equivalent single file under `.issues/archived/` for archived issues.

The delivery preserves the existing generic-tools operation names and the OpenCode and Pi tool names. It changes filesystem representation, paths, revision tokens, validation depth, and failure categorization. It introduces a provider-level projection contract but no SQLite driver.

This delivery may operate only on empty or already canonical repositories. A repository containing legacy issue directories must fail with an actionable migration-required result. A repository containing both legacy and canonical representations must fail closed. No operation, including read, validation, startup recovery, or configuration handling, may convert legacy data.

## 3. Current-Code Findings and Constraints

### 3.1 Existing implementation

`extensions/generic-tools/issues.ts` currently combines domain rules, frontmatter parsing, path discovery, lock handling, comments, mutation, validation, and archival in one synchronous module. It stores issue metadata in Markdown frontmatter, body content after frontmatter, and comments in `.issues/<id>/comments/*.md`.

The current lock is per issue, is used only by update, contains no ownership evidence, and has no wait or recovery protocol. Parent, relationship, and archive operations use compensating rollback after direct writes. Revisions currently concatenate `updated_at` and body, so they do not cover all managed state. Temporary rewrites are not durably flushed.

### 3.2 Existing public surface

`extensions/generic-tools/index.ts` exports the issue functions and types. `extensions/opencode-tools/index.ts` and `extensions/pi-tools/index.ts` are thin synchronous adapters around those exports. Their tool names and input fields are already shared in practice and must remain stable.

The host adapters currently expose `expectedRevision` only for update and transition. Comment, relationship, link, and archive operations therefore rely on project-lock serialization in this release, as allowed by the HLD. Adding expected revisions to those tool schemas is a later additive tool-contract change.

### 3.3 Tests and runtime

The primary unit suite is `extensions/generic-tools/issues.spec.ts`. Host contract coverage is in `extensions/opencode-tools/index.spec.ts` and `extensions/pi-tools/index.spec.ts`; model-driven flows are in each adapter’s `integration.test.ts`.

The workspace is strict TypeScript using ESM and NodeNext resolution, targets ES2022, pins Node 24.15.0 in `mise.toml` and CI, and publishes packages supporting Node `^22.13.0 || >=24.0.0`. Vitest runs files in parallel. CI already runs Ubuntu, macOS, and Windows. The generic package already depends on MIT-licensed `yaml` version 2 and Zod; no new production dependency is required.

The existing memory provider in `extensions/generic-tools/memory.ts` provides repository-local patterns for exclusive files, file flushes, POSIX directory flushes, prepared manifests, roll-forward recovery, bounded directory locks, and checksums. Issue storage should share the same filesystem durability vocabulary, but issue transactions need stronger before-and-after conflict detection and lock ownership evidence.

## 4. Design Principles

1. Canonical YAML is the only authoritative issue state.
2. Domain operations address issues by immutable ID, never by filename.
3. All storage-facing operations pass through control-plane recovery before ordinary storage classification, then discovery, decoding, and validation boundaries.
4. All operations that may observe issue files, including validation, serialize through one project issue lock. This is intentionally conservative and prevents provider readers from observing a partially applied multi-file transaction.
5. A mutation is not reported as successful until canonical state is committed and the configured projection sink acknowledges the complete change-set.
6. Invalid, ambiguous, unsupported, unsafe, or non-canonical documents are diagnosable but not mutable.
7. Control artifacts are never issue candidates and never enter revision calculation.
8. Error messages identify safe paths, IDs, categories, limits, and recovery actions without echoing body, comment, or metadata values.

## 5. Proposed File Structure

### 5.1 Production files

| File | Responsibility |
| --- | --- |
| `extensions/generic-tools/issues.ts` | Backward-compatible public function façade, domain operation orchestration, existing input normalization, hierarchy and relationship rules, and public result types. |
| `extensions/generic-tools/issues-contract.ts` | Version-1 entity types, schema checks, safe YAML decoding, canonical encoding, canonical-form comparison, timestamps, decimal values, revisions, limits, and diagnostics. |
| `extensions/generic-tools/issues-storage.ts` | Storage classification, path safety, slug and filename policy, active/archive discovery, global identity catalog, stable-ID resolution, durable single-file primitives, and projection records. |
| `extensions/generic-tools/issues-transactions.ts` | Project lock, owner evidence, transaction manifests, staging, deterministic apply, recovery, conflict handling, cleanup, and projection dirty marker. |
| `extensions/generic-tools/index.ts` | Export the stable façade plus the new provider, projection, diagnostic, and recovery types needed by future cache work. |
| `extensions/opencode-tools/index.ts` | Preserve schemas and operation names; pass metadata JSON text through the shared lossless boundary, serialize issue results without binary-number coercion, update descriptions to canonical files, and retain categorized error text. |
| `extensions/pi-tools/index.ts` | Match OpenCode metadata, result serialization, descriptions, and error behavior without host-owned storage logic. |

The three internal generic-tools modules are intentionally separate. The contract module is pure apart from reading supplied bytes. The storage module owns paths but not domain mutations. The transaction module owns durability but does not interpret issue relationships.

### 5.2 Test files

| File | Responsibility |
| --- | --- |
| `extensions/generic-tools/issues-contract.spec.ts` | Golden canonical YAML, safe-subset rejection, revisions, limits, Unicode, decimals, timestamps, and slug fixtures. |
| `extensions/generic-tools/issues-storage.spec.ts` | Classification, discovery, identity conflicts, path policy, lookup, allocation, symlinks, active/archive behavior, and non-mutating validation fixtures. |
| `extensions/generic-tools/issues-transactions.spec.ts` | Lock contention and ownership, durability fault injection, manifests, roll-forward recovery, tampering, conflicts, cleanup, and projection acknowledgement. |
| `extensions/generic-tools/issues.spec.ts` | Public operation behavior, field preservation, graph invariants, comments, rename, relationships, links, and recursive archive. Existing legacy-layout assertions are replaced rather than retained. |
| `extensions/opencode-tools/index.spec.ts` | Stable tool names and schemas, canonical path results, revision propagation, and safe categorized errors. |
| `extensions/pi-tools/index.spec.ts` | The same adapter contract as OpenCode. |
| `extensions/opencode-tools/integration.test.ts` | Existing lifecycle prompts against canonical fixtures; no migration behavior. |
| `extensions/pi-tools/integration.test.ts` | Existing lifecycle prompts against canonical fixtures; no migration behavior. |

## 6. Canonical Domain and Persistence Contracts

### 6.1 Issue document version 1

The root is exactly one YAML mapping. Top-level fields appear in this canonical order.

| Field | Public type and rule | Canonical presence |
| --- | --- | --- |
| `version` | Integer with value 1 | Always |
| `id` | Configured prefix followed by one or more decimal digits; immutable; must equal filename ID | Always |
| `type` | `initiative`, `epic`, `story`, `task`, or `bug` | Always |
| `title` | Non-empty string after current tool-level trimming | Always |
| `status` | `open`, `in_progress`, `done`, or `closed` | Always |
| `created_at` | Canonical UTC RFC 3339 timestamp at exact millisecond precision | Always |
| `updated_at` | Same timestamp contract; updated by every managed mutation, including comment append | Always |
| `created_by` | Non-empty string | Omit when absent |
| `assigned_to` | Non-empty string | Omit when absent |
| `parent` | One valid issue ID | Omit when absent |
| `children` | Unique immediate-child IDs | Omit when empty |
| `depends_on` | Unique dependency IDs | Omit when empty |
| `blocks` | Unique blocked issue IDs | Omit when empty |
| `blocked_by` | Unique inverse blocking IDs | Omit when empty |
| `relates_to` | Unique related issue IDs | Omit when empty |
| `duplicates` | Unique symmetric duplicate IDs | Omit when empty |
| `supersedes` | Unique directional supersession IDs | Omit when empty |
| `documents` | Unique validated repository-relative document paths | Omit when empty |
| `metadata` | Safe custom mapping; managed names may not appear at its root | Omit when empty |
| `body` | Complete string, including Markdown where desired | Always, including empty string |
| `comments` | Ordered embedded comment sequence | Always, including empty sequence |

Unknown top-level keys are errors. Unknown keys under `metadata` are retained as semantic values through every supported mutation. Managed fields include every top-level name in this table; those names are prohibited at the root of `metadata`. No legacy custom top-level field is relocated automatically.

Relationship, child, and document sequences are de-duplicated only when accepting a tool mutation assembled from valid canonical input. A manually edited document containing duplicates is invalid and is not silently repaired. Canonical output sorts those sequences lexically. Comments retain append order.

### 6.2 Embedded comment version 1

Each comment mapping has exactly four fields in this order: `id`, `created_at`, `created_by`, and `body`. All are required non-empty strings except that body is validated by the comment operation’s existing non-empty trimmed-input rule. The parent issue is implicit.

The comment ID is `<issue-id>-C<sequence>`, where sequence is at least four decimal digits and is zero padded to four digits until larger values require more digits. Allocation uses one greater than the maximum valid sequence already present. Deleted or manually missing sequence values are never reused. IDs must be unique and list order must have strictly increasing sequence values. Timestamps need not be monotonic.

General update and section-update operations cannot accept comments. The comment operation appends exactly one comment and cannot edit, reorder, or delete existing entries.

### 6.3 Public entity compatibility

The exported `Issue` result retains `id`, `path`, `metadata`, `body`, and `revision` so existing adapters and callers continue to work. `metadata` contains the managed top-level fields other than `version`, `body`, and `comments`, plus a nested `metadata` property for custom extension data. It no longer flattens custom keys into managed metadata. The result adds `version`, `comments`, and `location` as additive fields. `location` is `active` or `archived`.

The exported `IssueComment` result retains `id`, `issue`, `path`, `created_at`, `created_by`, and `body`. Its `path` is now the containing canonical issue path. It adds the resulting issue `revision` so callers can continue an optimistic mutation sequence.

`IssueSummary` retains `id`, `type`, `title`, `status`, and `path`, and adds `revision`. Active listing remains the default and excludes archived entities.

`ArchiveReport` retains `archived`, `skipped`, and `location`; it adds `revisions` keyed by affected active external parent IDs and archived issue IDs, plus `transactionId` when canonical work was prepared.

### 6.4 Lossless metadata boundary

The HLD’s metadata contract includes arbitrary finite base-10 integers and decimals, so the adapters may not narrow metadata to JavaScript’s binary-number range. The existing tool field remains an optional string containing one JSON object. When present, including when empty, its exact text is passed as `IssueMetadataText` to the generic-tools contract boundary; OpenCode and Pi must not call `JSON.parse` or otherwise materialize its numbers first.

The contract boundary accepts strict JSON mappings, sequences, strings, booleans, null, and finite JSON number spellings. It rejects duplicate keys, a non-object root, trailing content, malformed JSON, non-finite extensions, and contract resource-limit violations. The already approved `yaml` package’s document tree provides the numeric source lexemes, while the boundary admits only strict JSON grammar; no new production dependency or binary-number conversion is needed. Numeric source spellings become `ExactDecimalValue` values before any host-number conversion. Values larger than 2^53 remain exact, exponent spellings retain their mathematical value, and negative zero has the HLD-defined semantic value zero. Canonical YAML then applies the normalization rules in section 7.2.

The existing object-valued `CreateIssueOptions.metadata` remains available to direct generic-tools callers, but its ordinary JavaScript numbers are accepted only when they are finite safe integers and are not negative zero. Other numeric values are rejected rather than guessed from an already lossy runtime value. Direct callers needing arbitrary finite decimals use `IssueMetadataText` or `ExactDecimalValue`. Strings, booleans, null, arrays, and plain string-keyed mappings remain accepted subject to the same limits and collision rules. This compatibility rule is shared by all generic entry points; adapters do not use the object-valued path.

Decoded issue and projection metadata retain `ExactDecimalValue` for values that cannot be represented losslessly as permitted ordinary runtime numbers. Adapter issue responses use the shared `IssueToolResultEncoder`, which emits those values as exact JSON number tokens while preserving the existing result field shapes. Adapter issue results must not pass through `JSON.stringify`. This defines losslessness from tool input text through canonical storage and back to tool result text; downstream consumers that independently use a lossy JSON decoder are outside the provider boundary.

### 6.5 Timestamps and revisions

Managed timestamps use UTC with exactly three fractional digits. Input timestamps with offsets, missing or excess fractional precision, lowercase markers, invalid calendar values, or leap seconds are rejected as non-canonical. The codec may recognize an otherwise exact timestamp for diagnostic classification, but mutation eligibility requires the canonical spelling.

The revision is an opaque token with a version prefix and a lowercase SHA-256 digest of the complete canonical UTF-8 bytes. It includes the final newline and all issue fields, including comments and custom metadata. It excludes path, location, locks, transaction state, and projection state. Moving an unchanged issue to archive therefore preserves its revision; changing a title changes both bytes and revision.

Callers compare revisions only as opaque exact strings. No API may parse business meaning from a token.

## 7. Safe YAML Decode and Canonical Encode

### 7.1 Decode stages

Decoding is ordered and short-circuits at the first unsafe document-level condition while collecting independent schema findings where safe:

1. Confirm a regular non-symlink file and enforce the 16 MiB byte limit before decoding text.
2. Require valid UTF-8 without a byte-order mark. Preserve Unicode scalar values exactly; reject malformed sequences and unpaired surrogates.
3. Parse exactly one document with YAML 1.2 behavior and duplicate-key detection enabled.
4. Inspect the parsed document tree before conversion. Reject directives, explicit document variants, aliases, anchors, merge keys, explicit or custom tags, comments, non-string mapping keys, unsupported scalar kinds, multiple documents, and parser warnings that weaken the contract.
5. Traverse the tree iteratively while enforcing depth 32, 100,000 materialized nodes, scalar byte limits, body and comment limits, comment count, and metadata-key count. Do not call general object conversion until this traversal passes.
6. Convert through the contract-owned tree walker with no custom tag handlers. Preserve numeric source lexemes as exact decimal values rather than passing them through JavaScript binary floating point. Any use of the package’s general conversion for already-approved nonnumeric subtrees sets alias count to zero.
7. Validate the version discriminator, exact top-level keys, field types, enums, IDs, comment structure, safe metadata value model, finite decimal representability, and exact timestamp values.
8. Canonically encode the semantic value and byte-compare it with the source. A mismatch is `canonical_form`, not a parse failure.

The `yaml` package remains the parser because it is already approved and exposes document-tree nodes, duplicate-key checking, anchors, tags, directives, and alias controls. Its general-purpose stringifier is not the canonical emitter because the HLD requires exact cross-version quoting, escaping, key ordering, and decimal spelling.

### 7.2 Canonical emitter

The contract module owns a small deterministic emitter restricted to the approved value model. It emits fixed document and comment field order, recursively sorts metadata keys by Unicode code point, and emits all strings and keys in double-quoted form. It applies the exact escape rules in HLD section 9, emits lowercase plain booleans and null, and emits no directives, aliases, tags, comments, or document markers.

Numbers are represented internally as validated base-10 values rather than binary floating-point values. Canonical comparison removes leading plus signs, exponent notation, digit separators, insignificant leading and trailing zeros, and negative zero. A value that cannot be represented exactly as a finite base-10 integer or decimal is rejected. The encoder never rounds.

Every canonical file uses UTF-8, LF line endings, and exactly one final newline. Equal semantic values produce equal bytes and therefore equal revisions on every supported platform.

### 7.3 Metadata key comparison

Metadata mappings reject duplicate exact keys and keys whose comparison keys collide. A comparison key is Unicode compatibility-normalized and then transformed with ECMAScript locale-independent lowercase under the supported Node runtime. Original key content is preserved. Sorting itself uses original Unicode code-point order. This separates deterministic output order from collision safety.

## 8. Naming and Path Contract

### 8.1 Canonical paths

Active issues are immediate regular files under `.issues/`. Archived issues are immediate regular files under `.issues/archived/`. Only lowercase `.yml` is canonical.

Control state is under `.issues/.control/` and is excluded explicitly. Temporary names end in `.tmp` and cannot match the issue candidate grammar. The provider does not recurse into arbitrary directories and does not follow symlinks.

### 8.2 Filename grammar and slug derivation

The filename is the immutable issue ID, one hyphen, the title slug, and `.yml`. The complete UTF-8 filename is at most 180 bytes.

Slug derivation applies these steps in order:

1. Apply Unicode compatibility decomposition.
2. Remove combining marks.
3. Apply locale-independent lowercase conversion.
4. Retain ASCII letters and digits.
5. Replace each run of all other characters with one hyphen.
6. Remove leading and trailing hyphens.
7. Use `issue` if no characters remain.
8. Calculate the remaining byte budget after ID, separator, and suffix.
9. Retain the longest whole-code-point prefix within that budget and remove a trailing hyphen.
10. Reject the title and configuration if the fallback or final slug cannot fit.

The resulting alphabet is ASCII, but the implementation still measures UTF-8 bytes to keep the policy explicit. The provider rejects separators, controls, trailing dots or spaces, Windows forbidden characters, and reserved device-name outcomes before constructing an absolute path.

### 8.3 Identity catalog

Discovery builds one catalog across active and archived roots. Every validly named candidate reserves its ID for allocation even when content is malformed. The catalog records path, location, exact ID, portable case-fold key, extension, file kind, and decode status.

An ID is ambiguous if more than one candidate claims it, if active and archive both claim it, or if exact or case-folded path identities collide. All direct operations on an ambiguous ID fail. Full validation reports every participating path.

Allocation extracts numeric sequences only from candidate names matching the configured prefix, across active and archive, including malformed content. It chooses one greater than the highest sequence, retaining the existing minimum five-digit formatting. While holding the project lock it rechecks the catalog and creates exclusively. An external destination race causes a fresh catalog and next-ID retry until the operation bound is reached.

## 9. Storage Classification and Rollout Gate

Ordinary storage classification occurs only after recovery. Before classification, the provider performs a recovery inventory restricted to `.issues/.control/transactions/` and filesystem entries named by a durable transaction manifest. This inventory does not interpret ordinary issue candidates or relax the rollout gate; it establishes whether prepared canonical work must be completed before repository state can be classified.

Manifested temporary, source, and destination states are transaction intermediates rather than invalid storage while recovery is evaluating that transaction. They are tolerated only when their paths, kinds, and digests match a documented intermediate for that manifest. Unknown issue-like temporary files, unreferenced intermediates, unsafe paths, or mismatched bytes remain errors. A malformed or conflicting prepared transaction stops entry with `transaction_recovery` and retained evidence; it is not reclassified as an ordinary invalid repository. After all prepared work is committed or cleaned, classification runs against the resulting canonical tree and may still report empty, canonical, legacy, mixed, or invalid.

| State | Definition | Allowed behavior |
| --- | --- | --- |
| `empty` | No legacy layouts and no canonical candidates; recognized empty control/archive directories do not change this | Creation and all non-mutating operations |
| `canonical` | At least one canonical candidate, no legacy layout, and no disallowed representation | Recovery, validation, reads, and eligible mutations |
| `legacy` | One or more `.issues/<id>/issue.md` layouts or issue comment directories, and no canonical candidate | ID text parsing only; validation reports migration required; all canonical reads and mutations stop |
| `mixed` | Both legacy and canonical representations | ID text parsing only; validation reports both forms; all canonical reads and mutations stop |
| `invalid` | Unsafe roots, symlinked managed roots, unsupported issue-like files, malformed control state, path conflicts, or incompatible prefix configuration | Validation and safe diagnostics only; mutations stop |

`.yaml`, uppercase extension variants, unmanifested issue-like temporary files outside `.control`, nested canonical candidates, and symlink candidates are findings rather than silently ignored user data. No read or mutation falls back to the legacy reader.

Story 00006 remains a release gate. This implementation must not change defaults or documentation in a way that implies existing repositories are upgraded. Integration tests use empty canonical-native temporary repositories. Migration fixtures verify rejection only.

## 10. Public APIs and Provider Boundary

### 10.1 Stable façade

The following existing exports remain callable with their current required inputs: `parseIssueIds`, `parseIssueId`, `createIssue`, `createIssueRecord`, `getIssue`, `listIssueSummaries`, `listIssues`, `updateIssue`, `transitionIssue`, `commentIssue`, `relateIssue`, `unrelateIssue`, `linkDocument`, `validateIssues`, `archiveIssue`, and `archiveIssueReport`.

Existing façade functions create a filesystem provider for the supplied repository root with no projection sink and delegate the operation. They do not contain YAML, lock, or transaction logic.

`CreateIssueOptions.metadata` retains its object-valued compatibility path under section 6.4’s representability rules. The façade adds optional `metadataText` carrying `IssueMetadataText` without changing any existing required input; host adapters map their existing `metadata` tool string to this field. Supplying both `metadata` and `metadataText` is a schema error. The exact-decimal metadata and result encoder types are exported from `extensions/generic-tools/index.ts` so host adapters share one contract rather than implementing JSON policy independently.

### 10.2 New provider API

`createFilesystemIssueProvider` accepts a repository root and optional provider options. It returns a provider exposing parse, create, get, list, update, transition, append-comment, relate, unrelate, link-document, validate, archive-tree, recover, discover, decode, project, and storage-status capabilities.

Provider options include an optional synchronous `IssueProjectionSink`, a clock for deterministic tests, a transaction identity source for deterministic tests, stricter resource limits, lock wait duration, and bounded transient filesystem retry policy. Production defaults are fixed by this LLD; test substitutions are not exported by adapters.

Create accepts either validated semantic metadata or `IssueMetadataText` and normalizes both at the contract boundary before domain planning. Every provider result carries semantic metadata, never parser nodes or unexamined host objects.

The provider validates that configured limits do not exceed HLD ceilings. The default lock wait is five seconds. Transient sharing-violation retries are bounded to five attempts within the same five-second operation budget and apply only when source and target identities still match expectations.

### 10.3 Projection contract

`IssueProjectionRecord` contains stable ID, location, canonical relative path, version, type, title, status, timestamps, attribution, assignee, hierarchy, relationships, document links, custom metadata, body, comments, and revision. It contains semantic values and no YAML nodes or adapter types.

`IssueProjectionChangeSet` contains contract version 1, transaction identity, commit timestamp, and an ordered sequence of changes. Each change is an upsert, removal, or location change and includes the resulting revision where an entity remains. Changes are ordered by issue ID, then operation kind.

`IssueProjectionSink.apply` acknowledges the whole change-set or throws. It must be idempotent by transaction identity and resulting revisions. Partial acknowledgement is not a valid response.

With no sink configured, canonical commit completes without projection control state. With a sink configured, canonical commit is followed by one apply call. On failure, the provider writes `.issues/.control/projection-dirty.json` durably with transaction identity and safe change metadata, leaves canonical files authoritative, and throws `projection_sync`. A later projection implementation must restore from discovery and clear the marker only after a complete successful build. Remote providers never create or consume these contracts.

### 10.4 Error contract

`IssueError` is the common exported error. It has a stable category, safe message, optional issue IDs, optional repository-relative paths, optional transaction identity, optional limit name, and a retryable flag.

Categories are `configuration`, `storage_classification`, `path_safety`, `parse_safety`, `schema`, `canonical_form`, `resource_limit`, `identity_ambiguity`, `domain_invariant`, `stale_revision`, `lock_contention`, `transaction_recovery`, `filesystem_durability`, and `projection_sync`.

Adapters continue returning their existing `Issue error:` text envelope, using only the safe message. No tool schema changes are required. Tests assert categories at generic-tools level and safe envelope behavior at adapter level.

## 11. Operation Semantics

### 11.1 Common operation entry

Except ID text parsing, every provider operation follows this boundary:

1. Resolve configuration and verify root containment.
2. Acquire the project issue lock.
3. Inventory control state and transaction-linked intermediates without performing ordinary storage classification.
4. Recover every valid prepared transaction in transaction-ID order, including documented intermediate states, or stop with recovery-required diagnostics.
5. Classify the recovered storage and enforce the rollout gate.
6. Build a fresh global identity catalog.
7. Decode and validate the entities required by the operation.
8. For mutations, plan the complete post-state and validate all post-state invariants before preparation.
9. Commit through the transaction coordinator.
10. Publish one projection change-set when configured.
11. Release the lock and return semantic results.

Validation remains byte-for-byte non-mutating when there is no prepared transaction. If a prepared transaction exists, the provider must complete or explicitly fail recovery before validation can describe repository state; recovery is control-plane completion, not validation repair.

### 11.2 Create

Create validates type, status, title, author, assignee, metadata, parent, and dependency inputs. It reserves the next global ID, sets both timestamps from one clock reading, creates the default body under current behavior, and initializes comments as empty.

Without a parent, create is one exclusive canonical target. With a parent, it plans the new issue and the parent’s sorted `children` update as one transaction. Parent type and dependency existence are checked against fresh canonical state. The destination is preflighted for exact and case-fold collisions. No issue-specific directory is created.

### 11.3 Get and list

Get resolves one ID across active and archive and returns the complete entity only when unambiguous, valid, and canonical. The location is explicit in the result.

List discovers active issues only, decodes every active candidate, applies normalized status and type filters, and sorts by numeric ID sequence with lexical ID as a deterministic tie-breaker. Malformed or ambiguous storage fails the list rather than returning a silently incomplete set. A future cache may replace this implementation behind the provider boundary.

### 11.4 Update and transition

Update requires `expectedRevision`. The comparison occurs after lock acquisition against fresh canonical bytes. A stale token leaves all files and control state unchanged.

The operation accepts only current mutable fields: type, title, status, creator attribution, assignee, parent, body, and named body sections. It preserves created time, all relationships, documents, custom metadata, and comments. Empty author or assignee removes the optional field, matching the intent of existing focused updates. Section updates retain existing Markdown section behavior and affect only body.

A parent change plans child, old parent, and new parent documents together. A type change validates the parent and every immediate child. The final planned graph must have reciprocal parent/children references, permitted parent types, and no hierarchy cycle.

If title changes, the transaction includes the canonical content update and path move. The destination is checked before preparation and immediately before apply. On success only the new canonical path remains. Relationships remain unchanged because they contain IDs.

Transition delegates to update with status as the only requested field and requires the same expected revision.

### 11.5 Append comment

Comment validates an active issue, non-empty trimmed body, non-empty trimmed author, body byte limit, comment count, file limit, and current comment sequence. It allocates one greater than the maximum comment sequence, appends one entry, updates the issue timestamp, and rewrites the same canonical file under the project lock.

The response contains the embedded comment, containing issue path, and resulting revision. No comment directory or separate file is created. Existing comments are included in before-state validation and must be byte-equivalent semantically in the planned post-state.

### 11.6 Relate and unrelate

Both source and target must be active, valid, canonical, and distinct. Supported user-facing relationships remain `depends_on`, `blocks`, `relates_to`, `duplicates`, and `supersedes`.

`blocks` updates source `blocks` and target `blocked_by`. `duplicates` updates both entities symmetrically. `depends_on`, `relates_to`, and `supersedes` remain directional because that is current behavior and the HLD reserves no inverse for them. Dependency addition validates that no path from the target reaches the source. Duplicate addition validates symmetry in the planned result. Removal is idempotent semantically but rewrites nothing and does not change timestamps when the requested edge is already absent.

All affected documents are one transaction. Any invalid participant or conflict prevents preparation.

### 11.7 Document link

Link validates a repository-relative path, normalization, containment, no absolute or traversal form, no symlink component, existence, regular-file target, permitted task or design root, and optional kind. It adds one sorted unique path while preserving all other fields. An already-present link is a no-op and does not change revision or timestamp.

### 11.8 Validate

Validation can target one ID or the complete active and archived catalog. Full validation continues after recoverable per-file errors up to resource ceilings. Findings include category, severity, issue where known, safe relative path, field location, and actionable remedy.

Validation covers storage classification, roots and file kinds, names and slug/content agreement, duplicate and case-fold identities, YAML safety, schema, canonical bytes, revisions, comments, prefix compatibility, global hierarchy reciprocity and cycles, relationship targets and cycles, inverse relationships, document containment and existence, resource limits, transaction artifacts, and projection dirty state.

Validation does not rewrite, rename, sort, canonicalize, delete, or repair issue data. A canonical-form finding is an error because mutations require canonical starting bytes.

### 11.9 Recursive archive

Archive resolves the requested ID across active and archive. An already archived root returns it in `skipped`. For an active root, traversal follows `children` IDs in lexical order, detects cycles, and includes active descendants. Archived descendants are traversed for their active descendants and reported as skipped.

The operation enforces 10,000 issues and 1 GiB prepared bytes. It preflights every destination and rejects conflicts. Each active candidate moves to `.issues/archived/` without filename or content change. Any active parent outside the archive set has the archived child removed from `children` in the same transaction. Unrelated active documents are untouched.

The result orders archived and skipped IDs deterministically. Physical partial moves after interruption are never returned as success; the provider rolls the prepared transaction forward before its next result.

## 12. Lock Contract

The lock is the directory `.issues/.control/mutation.lock`. Directory creation is the exclusive acquisition primitive. Its `owner.json` is written and flushed immediately after acquisition and contains contract version, random ownership nonce, process ID, hostname, acquisition timestamp, and process-start evidence when the platform exposes reliable evidence.

Acquisition waits up to five seconds using short bounded sleeps, then returns `lock_contention` with safe manual guidance. The process verifies its nonce before removing the lock in normal cleanup.

Normal release also removes provider-created empty `.control` and `.issues` directories when they did not predate the operation. Consequently a missing-issue read, rejected create, validation-only call, or other unprepared failure leaves the repository tree unchanged after lock cleanup.

An existing lock is never removed because of age alone. Automated stale recovery is permitted only when owner metadata is valid, hostname matches, the operating system positively reports that the recorded process does not exist, and the lock has exceeded a short grace interval that prevents racing owner metadata creation. A live process, access-denied probe, reused live PID, different host, corrupt owner metadata, or unsupported liveness probe is treated as unknown ownership and requires manual recovery.

All storage-facing reads acquire this lock as a consistency barrier. `parseIssueIds` and `parseIssueId` read only configuration and do not acquire it.

## 13. Transaction and Recovery Contract

### 13.1 Control layout

Prepared transactions live under `.issues/.control/transactions/<transaction-id>/`. Each directory contains staged canonical after-images, a durable `manifest.json`, and, after canonical completion, a `committed` marker. Transaction IDs combine a UTC time component with cryptographic randomness and are treated as opaque.

The manifest is control data, not an issue document. Version 1 contains transaction ID, operation kind, preparation timestamp, ordered issue IDs, ordered file actions, total staged bytes, and the intended projection change-set. Each file action records action kind, source and destination repository-relative paths as applicable, expected before presence and digest, expected after presence and digest, staged after-image path where applicable, every permitted temporary or move-intermediate path with its expected presence and digest, and resulting issue revision. Recovery recognizes no intermediate that is absent from this manifest contract.

Paths are relative, normalized, and constrained to the two canonical issue roots. Staged paths are constrained to their transaction directory. Digests are lowercase SHA-256. No body, comment, or metadata value appears in the manifest.

### 13.2 Preparation

The coordinator validates all planned canonical bytes before touching canonical destinations. It writes staged after-images with owner-only creation where supported, flushes each file, flushes the staging directory on POSIX, writes a temporary manifest, flushes it, renames it to `manifest.json`, and flushes the transaction directory on POSIX.

Before the durable manifest rename, failure removes best-effort staging and leaves canonical state unchanged. After that rename, roll-forward is the only normal recovery direction.

### 13.3 Deterministic apply

Actions are ordered by issue ID and then path. Immediately before an action’s first change, current paths and digests must match the recorded before state or already match the complete recorded after state.

Creates use exclusive destination semantics. Same-path rewrites use a fully flushed same-directory temporary and atomic replacement. Title changes publish validated after-bytes and perform the same-volume source-to-destination move without overwriting. Archive actions move unchanged bytes to the archive destination. Parent and relationship after-images use the same rewrite primitive.

After every action reaches its after state, affected directories are flushed where supported. The coordinator then performs a final transaction-wide commit gate immediately before creating `committed`. It revalidates every action’s complete destination after-state and every required source absence or retained source state, including regular-file identity, path safety, exact digest, and no unexpected case-fold alias. Revalidation follows manifest action order and reports conflicts in that same order, making the result independent of directory enumeration order.

If any final after-state differs, the coordinator does not write `committed`, does not overwrite or roll back the external edit, retains the manifest and staged evidence, and returns `transaction_recovery` with the transaction identity and deterministically ordered safe conflict paths. The conflict is non-retryable until the external state is remediated or explicitly restored to a documented state. Recovery applies the same transaction-wide gate before it may create the marker.

Only after the complete gate succeeds does the coordinator write and flush `committed`, flush the transaction directory, and treat canonical state as committed. Windows flushes files but skips unsupported directory-handle flushes; this residual difference is surfaced in platform documentation and tests.

### 13.4 Recovery

Recovery runs before ordinary storage classification. It validates the transaction directory kind, manifest schema, transaction identity, every path, total bound, staged file size, staged digest, expected canonical roots, and any transaction-linked intermediate before applying anything.

For each action:

- If all relevant paths match the after state, the action is complete.
- If they match the before state, recovery applies the action.
- If a safe intermediate state from that action’s documented move sequence is present and all bytes match recorded digests, recovery completes it.
- If any path or digest matches neither before, after, nor a documented intermediate, recovery stops without deleting evidence and returns `transaction_recovery` with exact safe conflicts.

Recovery is idempotent. A committed transaction may publish or retry its projection change-set, then remove its transaction directory. An uncommitted prepared transaction is rolled forward, passes the complete after-state commit gate, is marked committed, projected when configured, and cleaned. Unmanifested transaction directories are removed only when provably incomplete preparation contains no canonical action evidence; otherwise they are reported for manual recovery. Ordinary classification begins only after this sequence completes.

Rollback is allowed only before durable preparation. No general post-prepare rollback is promised because external edits can make old bytes unsafe to restore.

### 13.5 Single-file mutations

Single-file create, rewrite, comment, link, and status changes use the same manifest protocol rather than a separate weaker path. This yields one failure and recovery model. The extra control write is accepted in favor of deterministic rename recovery and future projection ordering.

## 14. Domain Validation Rules

Hierarchy retains the current allowed-parent matrix: initiatives have no parent; epics may belong to initiatives; stories may belong to epics or initiatives; tasks may belong to stories or epics; bugs may belong to stories, tasks, or epics.

Every child-to-parent edge must have a reciprocal parent-to-children edge. IDs may not reference themselves. Hierarchy and dependency graphs must be acyclic. Every non-document reference must resolve to one unambiguous issue. Normal mutations target active issues; archived references remain stable and are valid where historical graph semantics permit them, but archived entities cannot be directly mutated.

`blocks` and `blocked_by` must be reciprocal. `duplicates` must be reciprocal. Relationship lists and documents must contain unique values in canonical lexical order. An issue may not hold the same self-reference in any relationship field.

Document links remain limited to the configured task root and `.specs/`. Normalized backslashes are accepted only as tool input and are stored with forward slashes. Canonical document values containing alternate separators are invalid.

## 15. Resource Limits

| Resource | Default and hard maximum |
| --- | ---: |
| Canonical issue file | 16 MiB |
| Issue body | 2 MiB UTF-8 |
| One comment body | 256 KiB UTF-8 |
| Comments per issue | 10,000 |
| One scalar | 2 MiB UTF-8 |
| YAML nesting depth | 32 |
| Materialized nodes per document | 100,000 |
| Metadata keys across nested mappings | 10,000 |
| Active plus archived candidates | 100,000 |
| Recursive archive issues | 10,000 |
| Prepared canonical after-images | 1 GiB |
| Filename | 180 UTF-8 bytes |

Project options may lower these values. They may not raise them. Validation reports the named first exceeded per-document bound and continues with other files when safe. Repository discovery truncation is explicit and makes the report invalid.

## 16. Security and Cross-Platform Requirements

Every managed path is resolved from the repository root and checked for containment after normalization. Absolute paths, traversal, NUL, controls, alternate separators in canonical values, unsafe platform names, symlinks, junction-like redirections, and non-regular issue candidates are rejected at discovery and rechecked immediately before mutation.

Canonical content and control data are never interpolated into a shell. Routine logs and errors omit body, comment, and metadata values. Files are created owner-only where supported without broadening an existing repository’s permissions.

Exact and portable case-fold collision checks run on every platform, not only Windows. Case-only rename is handled through a unique same-directory intermediate while the prepared manifest records all expected states. Sharing violations and open-handle failures use bounded retries only while digests and identities remain expected.

Source, staging, active, and archive paths must remain under `.issues/` on one filesystem volume. Configuration or path redirection that breaks this assumption is invalid.

## 17. Test Design

### 17.1 Contract golden tests

Golden fixtures cover every field, omitted optional values, required empty body and comments, multiline and control-containing strings, exact quoting, key order, nested metadata sorting, Unicode scalar preservation, non-BMP text, invalid surrogates, exact escapes, booleans, null, finite decimals, negative zero, rejected binary-float-only values, and one final newline. Lossless metadata fixtures include integers immediately above 2^53 and much larger values, positive and negative exponents, exponent values with fractional results, and negative zero; assertions cover exact semantic value, canonical YAML spelling, revision stability, and exact tool-result JSON number tokens.

Tests prove parse-and-encode stability, equal semantic values yielding equal bytes and revisions, and path-independent revisions. Timestamp fixtures cover exact UTC milliseconds and every prohibited spelling. Unknown versions, unknown top-level fields, managed metadata shadowing, duplicate keys, comments in YAML source, directives, aliases, anchors, merge keys, tags, multiple documents, non-string keys, malformed UTF-8, malformed YAML, non-finite values, unsupported scalar types, and valid non-canonical YAML are rejected in their proper categories.

Property tests use deterministic generated cases for Unicode scalar strings, metadata trees within limits, title slugs, UTF-8 byte boundaries, decimal normalization, and repeated canonical round trips. If the repository avoids adding a property-testing dependency, these are table-driven generated loops using Vitest and seeded local generators.

### 17.2 Discovery and classification tests

Fixtures cover empty, canonical, legacy, mixed, and invalid states; active and archived candidates; malformed names; `.yaml` and case variants; nested candidates; symlinks; non-regular files; temporary and control artifacts; ID/content mismatch; slug/title mismatch; duplicate IDs; active/archive duplicates; case-fold collisions; prefix changes; malformed content reserving an ID; and platform-reserved names. Entry-order fixtures place valid prepared transactions beside states that ordinary classification would call invalid or mixed and prove recovery runs first. Manifest-linked rename, replacement, and archive intermediates are tolerated only for matching paths and digests; unlinked lookalikes remain findings after recovery.

Validation snapshots canonical and control trees before and after to prove non-mutation when no recovery is pending.

### 17.3 Public operation tests

Success tests cover create, create with parent and dependencies, get active and archived, list/filter order, update, section update, transition, title rename, parent reassignment, type changes, comment append, every relationship kind, unrelate no-op, link no-op, targeted and global validation, and recursive archive.

Every mutation test seeds hierarchy, all relationship fields, documents, nested metadata, body, and prior comments, then asserts unrelated state preservation. Tests assert new revisions for semantic changes and unchanged revisions for no-ops and archive-only moves.

Negative tests cover missing and stale expected revisions, malformed starting bytes, non-canonical starting bytes, invalid metadata, comment replacement attempts, cycles, broken inverses, missing references, unsafe documents, collisions, file and transaction bounds, and migration-gate rejection.

### 17.4 Lock and recovery tests

Lock tests cover concurrent creators, concurrent comments, bounded wait, live owner, dead same-host owner, PID reuse treated as live, unknown remote owner, corrupt metadata, nonce mismatch, and safe release after exceptions.

Fault injection is placed after every durable boundary: staged write, staged flush, manifest temporary write, manifest flush, manifest publish, each canonical replacement or move, each directory flush, committed marker, projection apply, dirty-marker write, and cleanup.

Recovery tests cover each operation kind, partial title rename, partial parent update, reciprocal relationship, recursive archive, already-applied actions, repeated recovery, staged digest tampering, manifest path escape, before/after conflict, unexpected target, malformed control state, committed cleanup, projection retry, and retained evidence on conflict. Tests inject external edits after each action’s local check and after the last apply but before the committed marker; every case must fail the final transaction-wide gate, omit the marker, preserve the external bytes and evidence, and report the same conflict ordering across repeated runs and directory enumeration orders.

### 17.5 Adapter and platform tests

OpenCode and Pi contract tests assert identical tool names, required inputs, canonical result shapes, comment revision, archive report, and safe error envelope. Shared adapter cases submit metadata JSON containing values above 2^53, exponent spellings, and negative zero, prove neither adapter performs a lossy pre-parse, and compare stored canonical values and exact result JSON tokens. Malformed, duplicate-key, non-object, empty, and trailing-content inputs produce the same safe categorized error in both hosts. Existing model-driven integration sequences remain, using canonical-native temporary repositories.

CI runs generic behavior on Ubuntu, macOS, and Windows. Platform-focused cases cover CRLF as non-canonical input, Unicode normalization, case-only rename, filename budget, long repository roots, locked destinations, permission failures, POSIX directory flush behavior, Windows directory-flush omission, and symlink or junction handling where the runner permits it.

## 18. Ordered Implementation Tasks

Each task is independently reviewable and changes at most three production or test files. Later tasks depend on all earlier tasks listed for them.

1. Contract fixtures and version-1 model. Add `extensions/generic-tools/issues-contract.ts` and `extensions/generic-tools/issues-contract.spec.ts`. Define semantic types, limits, safe YAML and JSON-text boundaries, exact-decimal values, tool-result encoding, canonical emitter, revision, timestamp and decimal policy, and golden fixtures. No existing operation switches storage yet.
2. Naming, classification, and discovery. Add `extensions/generic-tools/issues-storage.ts` and `extensions/generic-tools/issues-storage.spec.ts`. Implement slug/path policy, storage states, catalog, global identity reservation, lookup, and validation diagnostics using the contract module. Depends on task 1.
3. Lock and transaction coordinator. Add `extensions/generic-tools/issues-transactions.ts` and `extensions/generic-tools/issues-transactions.spec.ts`. Deliver owner-aware project locking, pre-classification recovery inventory, manifested-intermediate handling, manifests, durable staging, apply, transaction-wide final after-state gating, deterministic conflict evidence, and fault seams. Depends on tasks 1 and 2.
4. Public entity and provider façade. Refactor `extensions/generic-tools/issues.ts`, update `extensions/generic-tools/index.ts`, and revise the first portion of `extensions/generic-tools/issues.spec.ts`. Preserve public function inputs and compatibility fields while routing create, get, list, update, and transition through canonical storage. Depends on tasks 1–3.
5. Comments and single-issue preservation. Update `extensions/generic-tools/issues.ts` and `extensions/generic-tools/issues.spec.ts`. Add embedded append-only comments, document links, no-op semantics, title rename, stale revisions, and full field-preservation coverage. Depends on task 4.
6. Multi-issue graph mutations. Update `extensions/generic-tools/issues.ts`, `extensions/generic-tools/issues.spec.ts`, and `extensions/generic-tools/issues-transactions.spec.ts`. Add parent reassignment, relationship transactions, graph validation, and operation-specific recovery cases. Depends on task 5.
7. Recursive archive and complete validation. Update `extensions/generic-tools/issues.ts`, `extensions/generic-tools/issues.spec.ts`, and `extensions/generic-tools/issues-storage.spec.ts`. Add bounded traversal, external-parent detach, active/archive skips, global validation, and migration-gate assertions. Depends on task 6.
8. Projection boundary. Update `extensions/generic-tools/issues-storage.ts`, `extensions/generic-tools/issues-transactions.ts`, and `extensions/generic-tools/index.ts`. Export semantic projection records and change-sets, optional sink acknowledgement, dirty marker, and recovery retry behavior without adding SQLite. Depends on task 7.
9. OpenCode adapter alignment. Update `extensions/opencode-tools/index.ts`, `extensions/opencode-tools/index.spec.ts`, and `extensions/opencode-tools/integration.test.ts`. Preserve schemas, replace adapter-owned metadata parsing and issue-result stringification with the shared lossless boundaries, update descriptions and expected canonical paths/results, and verify errors and exact numeric fixtures. Depends on task 8.
10. Pi adapter alignment. Update `extensions/pi-tools/index.ts`, `extensions/pi-tools/index.spec.ts`, and `extensions/pi-tools/integration.test.ts`. Match OpenCode lossless metadata input, exact result encoding, errors, and shared contracts. Depends on task 8.
11. Cross-platform and package verification. Update `extensions/generic-tools/issues-transactions.spec.ts` and, only if required by demonstrated gaps, `.github/workflows/ci.quality.yml`. Run format, lint, strict typecheck, unit tests, package build/inspection, duplicate check, and the three-platform CI matrix. No dependency or engine change is expected. Depends on tasks 9 and 10.
12. Rollout hold. Update release-facing documentation in a separately approved task only after Story 00006 exists. Until then, retain fail-closed legacy and mixed behavior and do not advertise implicit upgrade. This is a gate, not migration implementation.

## 19. Acceptance-Criteria Traceability

### 19.1 Initiative 00001

Consolidated issue storage is delivered by the version-1 document, canonical paths, embedded comments, and create/comment tests. The canonical file is the one source for all issue-managed state and no comment directory exists.

Synchronized local persistence is preserved as a downstream criterion. This LLD delivers the ordered projection change-set and acknowledgement boundary. SQLite remains outside scope; once a sink is configured, a mutation is not reported successful unless canonical state and the sink agree.

Cache-first queries are preserved as a downstream criterion. This release keeps filesystem discovery behind provider discovery and projection APIs so a later synchronized SQLite provider can replace list, search, filter, validate, and resolution reads. It does not claim cache-first behavior before that Epic.

Cache restoration is preserved as a downstream criterion. Canonical discovery, decode, projection records, dirty state, and complete-batch semantics define the rebuild input and activation precondition. No cache restoration implementation is included.

The remote provider boundary is preserved because only the filesystem provider accepts an issue projection sink. OpenCode and Pi adapters remain provider consumers; remote providers neither require nor update local projection state.

### 19.2 Epic 00004

Create produces exactly one `.issues/<id>-<title-slug>.yml`, validates complete initial version-1 state, and creates no issue directory.

Comment appends stable identity, author, timestamp, and body to the issue document, protects previous comments, returns the resulting revision, and creates no separate file.

Title update performs a prepared same-volume rename to the deterministic slug, leaves no old path after success, and keeps all ID relationships unchanged.

Every operation preserves unrelated hierarchy, relationships, links, extension metadata, body, and comments and emits canonical valid YAML.

Update and transition reject stale expected revisions after lock acquisition without preparing or changing canonical state.

Archive moves the eligible active tree to `.issues/archived/`, preserves filenames and revisions for unchanged files, leaves unrelated issues untouched, and recovers or reports every partial physical outcome.

Validation reports malformed YAML, duplicate IDs, unsafe and conflicting filenames, broken hierarchy, and invalid relationships without repairing canonical files.

Legacy Markdown is never silently converted. Legacy and mixed repositories receive an actionable Story 00006 migration requirement and cannot mutate.

### 19.3 Story 00005

Every current issue operation and storage transition has an explicit path in sections 10 and 11. Choices, assumptions, operational bounds, compatibility, and risks are explicit.

The single-document contract, canonical serialization, version handling, validation stages, and unknown-field behavior are fixed in sections 6 and 7.

Partial-write prevention, concurrency, pre-prepare rollback limits, post-prepare roll-forward, and conflict behavior are testable through sections 12, 13, and 17.

Discovery, decode, semantic projection, and mutation notification are separated from host adapters and future cache drivers.

Section 18 decomposes implementation into ordered, independently verifiable tasks without reopening HLD decisions.

### 19.4 Rollout Story 00006

Explicit migration remains excluded. Legacy and mixed classification never triggers conversion and always names migration as separately required.

Safe future rollout remains blocked until a separately approved migration preserves all fields and comments, validates every generated canonical document and global graph, and retires legacy state only after successful validation. This LLD supplies the canonical validator and rollout gate but no dry-run, backup, conversion, retirement, or rollback workflow.

## 20. Risks, Edge Cases, and Decisions for Implementers

The largest delivery risk is attempting to modify `issues.ts` in place without first extracting contract, storage, and transaction boundaries. That would preserve current rollback weaknesses and make fault testing impractical; tasks 1–3 are mandatory predecessors.

The canonical number contract is stricter than ordinary JavaScript numbers. Implementers must not use binary floating-point conversion for custom numeric metadata at YAML, generic API, adapter input, projection, or adapter result boundaries. `IssueMetadataText`, `ExactDecimalValue`, and `IssueToolResultEncoder` are one shared contract; unsupported object-valued runtime numbers fail safely rather than being rounded.

The HLD requires YAML source comments to be non-canonical. Manual files containing them remain diagnosable but not mutable, even though the parser can preserve them.

Manual external edits during apply or prepared recovery can create states that are neither before nor after. Action-local checks are insufficient because an already-applied destination can change before commit. The final transaction-wide gate must detect that edit deterministically; evidence remains on disk and automatic rollback or overwrite is prohibited.

A process crash while holding the lock may require automated stale-owner proof or manual intervention. Age alone is never proof. This favors safety over availability.

Windows cannot provide POSIX-equivalent directory flushes and may block replacement through open handles. The design accepts that residual difference, uses bounded retries, and never weakens digest or no-overwrite checks.

Changing `Issue.metadata` so custom fields become nested is a deliberate contract correction required by the HLD. Managed-field access used by current adapters remains intact. Any undiscovered direct caller relying on flattened custom fields must migrate to `issue.metadata.metadata`; package release notes must identify this narrow breaking semantic even though the top-level result shape remains compatible.

The HLD says active and archived IDs are global. Archived entities therefore reserve IDs forever, and malformed named candidates reserve their sequence to prevent reuse.

The default body may retain the current Markdown template, but the `Comments` heading has no persistence meaning. Embedded YAML comments are authoritative; no operation derives comments from body text.

## 21. Definition of Done

The implementation is complete only when all canonical, mutation, recovery, adapter, migration-gate, and platform tests pass; strict typecheck, lint, format, duplicate check, package build, package inspection, and audit gates pass; no new production dependency is added without license and security review; existing tool names and required inputs remain stable; no legacy fixture is changed by any operation; and Story 00006 remains visibly required before rollout to existing repositories.
