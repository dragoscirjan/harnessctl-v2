---
id: "doc-00014"
title: "Provider-backed SDLC document management"
kind: lld
status: approved
version: 1
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/lld-00011-provider-backed-sdlc-document-management-v1.md","source_sha256":"9c3bb2340b18a1b499e2d23429112db5935e1ce1ea45f6032ac4a8a54886bc1c","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"lld","title":"Provider-backed SDLC document management","version":1,"status":"approved","parent":"00011","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Provider-backed SDLC document management

## Implementation Scope

This LLD implements `hrn-00135` through Stories `hrn-00136` to `hrn-00139`.
It extends the current Python installer/configuration layer and the TypeScript
generic-tools/OpenCode/Pi packages without adding provider SDK dependencies.

## Proposed Configuration

Filesystem default:

```text
documents:
  type: filesystem
  root: .harnessctl/documents
  prefix: doc-
  tools: document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore
```

Remote shape:

```yaml
documents:
  type: gitea
  tools: gitea-mcp
  remote:
    repository: owner/repository
    url: https://gitea.example.com
    token_env: GITEA_TOKEN
```

Allowed remote types are `github`, `gitlab`, `gitea`, and `forgejo`. Defaults
for CLI names, public-host URLs, and token environment names follow the existing
provider registry, but every remote authority must be explicit in user config.
Self-hosted providers require a normalized HTTPS URL. Repository identity is a
provider-valid owner/path value and cannot contain credentials or traversal.

The Python loader, TypeScript schema, and generated JSON Schema must reject
unknown keys and remain behaviorally identical.

## Canonical Filesystem Layout

```text
.harnessctl/documents/
  doc-00001-title-v1.md
  doc-00001-title-v2.md
  archive/
    doc-00002-retired-v1.md
```

Each Markdown file uses strict YAML frontmatter:

```text
---
id: doc-00001
title: Architecture decision
kind: hld
status: draft
version: 1
created_at: 2026-08-25T00:00:00Z
updated_at: 2026-08-25T00:00:00Z
created_by: OpenCode
---
```

After frontmatter, the body begins exactly with `# <title>`, followed by a blank
line. Additional level-one headings are rejected; lower-level headings remain
valid Markdown. Parsing rejects duplicate keys, non-string mapping keys,
unsupported fields/enums, invalid timestamps, filename/frontmatter mismatches,
duplicate `(id, version)` pairs, gaps that violate version rules, oversized
content, and symlinked roots or records.

Initial kinds: `hld`, `lld`, `gdd`, `design-overview`, `task`, `draft`, and
`document`. Stored statuses are `draft`, `review`, and `approved`, valid for all
initial kinds. `superseded` is derived for non-current versions and `archived`
is derived from archive location; tools reject both as mutation input.

## Tool Contracts

### `document_id`

Input: arbitrary text. Output: one configured document ID found in the text.
It does not read or mutate storage.

### `document_create`

Required: `title`, `kind`. Optional: `status`, `author`, `body`, metadata.
Allocates the next ID and version 1 under the local-operation barrier. Returns
ID, relative path, metadata, revision, and location.

### `document_list`

Optional filters: kind, status, active/archive location. Returns bounded summary
records in deterministic ID/version order, excluding document bodies.

### `document_get`

Required: ID. Optional: version. Returns metadata, bounded body, canonical
relative path, content revision, and active/archive location.

### `document_update`

Required: ID and `expectedRevision`. Applies focused metadata/body changes to
the current version. It never changes ID or version and publishes atomically. A
title change that would change the canonical path is rejected before publication
when any active or archived canonical issue references the old path. It never
migrates issue links; updates that preserve the path continue normally.

### `document_version`

Required: ID and `expectedRevision`. Creates the next version from the current
record plus supplied changes and never rewrites older versions. Version order
alone derives supersession.

### `document_validate`

Optional ID. Validates one document lineage or all canonical documents without
mutation and returns bounded findings.

### `document_archive`

Required: ID and `expectedRevision`. Moves the active lineage beneath the
configured archive transactionally and refreshes the cache only after canonical
publication succeeds. Before publication it scans active and archived canonical
issues and rejects the operation when any issue references any active lineage
path. It never migrates issue links.

### `document_restore`

Required: ID and `expectedRevision`. Moves one complete archived lineage back
to active storage transactionally. It rejects partial lineages and any active
destination collision.

## Revision and Transaction Semantics

Revisions are deterministic hashes over exact canonical Markdown bytes. Every
revision-sensitive operation rereads canonical state while holding the shared
non-reentrant barrier and rejects stale revisions.

Canonical Documents files, transaction journals, and transaction backups use
bounded descriptor reads. Platforms supporting `O_NOFOLLOW` reject a symlink at
open; the cross-platform fallback validates the opened descriptor identity
against non-following path metadata before consuming bytes. Both paths verify
descriptor and path identity after reading. Portable runtimes still leave the
documented final-syscall race after the last path check because they do not
expose an `openat`-style directory-descriptor API.

Mutation phases are:

1. Validate inputs and current canonical graph.
2. Build and validate new canonical bytes.
3. Publish the canonical file batch atomically, restoring file before-images if
   publication fails.
4. Load the new canonical snapshot and attempt direct SQLite synchronization.
5. Rebuild SQLite from canonical files if direct synchronization fails.
6. If both cache paths fail, report a projection error; canonical files remain
   authoritative and the next initialization retries repair.

No result reports success until canonical and cache validation complete.

## SQLite Projection

Add document rows containing only fixed, non-sensitive fields needed by
validation and filters: identity, version, location, canonical path, byte
revision, title, kind, status, timestamps, and optional creator. Arbitrary
document metadata and bodies remain canonical in Markdown and are never copied
into SQLite.

Cache loading verifies schema, provider row, generation, row counts, primary
keys, version relationships, and canonical revision evidence. Any mismatch
causes a rebuild from canonical Markdown. Contradictory cache rows never affect
tool results.

## Provider Intents

### Gitea

- Fixed Documents ID: `sdlc_documents_gitea`.
- Command: official `gitea-mcp` compatible with v1.6.0.
- Environment target: `GITEA_ACCESS_TOKEN`; source is configured token env.
- Host is passed through the official Gitea host contract.
- Requested scope/tools: wiki only (`wiki_read`, `wiki_write`).
- Existing managed Gitea CVS/Issues definitions also move to this official
  provider implementation, with route-specific tool scope as supported.

### Forgejo

- Fixed Documents ID: `sdlc_documents_forgejo`.
- Command: `forgejo-mcp`, compatibility version 2.33.0.
- Environment target: `FORGEJO_ACCESS_TOKEN`; source is configured token env.
- URL uses the Forgejo MCP contract. Tagged v2.33.0 has no scope or tool
  allowlist flag/environment variable and registers every domain and resource,
  so the dedicated process is unscoped at runtime.
- Generated guidance permits only `list_wiki_pages`, `get_wiki_page`,
  `get_wiki_revisions`, `create_wiki_page`, `update_wiki_page`, and
  `delete_wiki_page`; all cross-domain tools and resources are prohibited.
- The agent boundary is not process-level least privilege. No unsupported flag,
  host wrapper, or token capability is invented.
- No definition or identity is shared with Gitea.

### GitHub

The generated skill checks `gh` authentication, then separately requires an
already authenticated non-interactive Git transport and verifies it with
`git ls-remote --exit-code -- <wiki-url> HEAD` before mutation. A token
environment variable alone is insufficient. If credential-helper setup is
missing, the verified official path is `gh auth setup-git --hostname <host>`.
That command persistently mutates Git configuration and therefore requires fresh
explicit consent immediately before invocation; it is never automatic, never
uses `--force`, never exposes token values, and must be followed by another Git
probe. The route then uses a temporary clone of `OWNER/REPO.wiki.git`. Reads use Git history and
working-tree files. Writes fetch before mutation, reject divergent/stale state,
commit only the selected page change, and push without force. Temporary state is
cleaned on every exit. GitHub MCP remains available only for operations its live
schema supports.

### GitLab

The generated skill uses hosted MCP only for verified operations. `glab api`
calls official project Wiki endpoints for list/get/create/update/delete and
passes project/page identifiers as encoded API parameters. Update/delete
requires fresh read evidence. It never places token values in arguments or
generated files.

## Historical Gitea Reconciliation

The installer recognizes the exact historical Gitea definition rendered with
`forgejo-mcp`, its old arguments, compatibility pin, and environment mapping.
It installs the canonical official Gitea definition first, then removes only a
semantically exact historical member. A modified historical definition under either
`cvs_gitea` or `sdlc_cvs_gitea` remains byte-preserved with a warning and blocks
planned canonical replacement under force and non-force. Recognition requires the old
local `forgejo-mcp` executable signature, while operator additions, removals, argument
changes, and environment changes remain preserved. Ordinary unrelated canonical
conflicts retain narrow `--force` replacement. OpenCode/Pi raw JSON preservation and
whole-tree rollback remain mandatory.

## Generated Skill Rules

`sdlc-documents` includes:

- Current authority and exact available tools.
- Local canonical/cache distinction and revision workflow.
- Provider capability matrix and exact route selection.
- Fresh consent before remote writes and all destructive actions.
- No route switching after an attempted mutation.
- No credential reads, values, persistence, or transcript inclusion.
- Link artifacts rather than paste duplicated bodies into issues.
- Report unsupported operations instead of substituting another provider.

## Issue Link Extension

`issue_link_document` accepts a real repository-relative file beneath:

- configured `paths.tasks` for task documents;
- `.specs` for legacy design documents;
- configured `documents.root` for canonical Documents.

The operation preserves existing kind compatibility and stores only the path.
It rejects absent files, archive paths unless explicitly allowed, symlinks,
absolute paths, traversal, dot segments, and paths outside those roots.
Canonical links are read through the shared bounded no-follow descriptor
primitive. Linked paths cannot be renamed by `document_update`, and linked
lineages cannot archive. There is currently no normalized document-unlink issue
tool, so tool-created links cannot currently be removed; direct issue-file edits
and automatic link migration are prohibited.

## Installer and Host Integration

- Register the skill in both OpenCode and Pi installation inventories.
- Register normalized local tools in generic-tools and both adapters.
- Render Documents MCP intents independently from CVS and Issues, deduplicating
  only identical fixed IDs with identical behavior.
- Preserve operator-owned skills/configuration and raw unrelated JSON members.
- Test fresh install, reinstall, host selection, `all`, conflicts, force,
  modified legacy state, transaction failure, and exact output parity.

## Test Matrix

| Area          | Required coverage                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config        | defaults, explicit remotes, unknown keys, URLs, repository IDs, tools, token env names, Python/TS/JSON Schema parity                                                                                             |
| Local records | create/get/list/update/version/archive/restore, revisions, IDs, bounds, malformed YAML, symlinks, concurrency, publication rollback                                                                              |
| Cache         | initial projection, missing/corrupt schema, contradictory rows, sync and rebuild failure, deterministic retry                                                                                                    |
| Providers     | Structured GitHub Git workflow, GitLab REST argv/outcomes, Gitea tool/method, and Forgejo six-tool guidance fixtures; pagination, bounds, stale/auth/not-found/ambiguous outcomes, consent, terminal no-fallback |
| Separation    | Gitea and Forgejo binary/ID/env/pin/tool assertions across CVS, Issues, Documents                                                                                                                                |
| Installer     | OpenCode, Pi, all, reinstall, dedupe, conflict, force, legacy migration, byte preservation, rollback                                                                                                             |
| Artifacts     | generated skills/config, issue links, docs, Changesets, package parity, stale-name allowlist                                                                                                                     |

Live provider checks are optional and require configured credentials plus fresh
consent. Harnessctl does not execute remote provider commands or embed provider
clients, so executable mocks would test a fictitious architecture. Structured
contract data, generated guidance, and host configuration checks are required.

## Delivery Order

1. `hrn-00136`: provider separation and historical Gitea migration.
2. `hrn-00137`: filesystem authority, tools, and cache.
3. `hrn-00138`: remote provider configuration and guidance.
4. `hrn-00139`: host integration, issue links, docs, and release artifacts.

Stories 1 and 2 can proceed independently. Story 3 depends on both. Story 4
depends on all preceding Stories.
