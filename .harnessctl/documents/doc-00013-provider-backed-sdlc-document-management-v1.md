---
id: "doc-00013"
title: "Provider-backed SDLC document management"
kind: hld
status: approved
version: 1
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/hld-00011-provider-backed-sdlc-document-management-v1.md","source_sha256":"7f340500e688a7a8ad3e3d98351231e03b7334be373cff53315d208077ea0545","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"hld","title":"Provider-backed SDLC document management","version":1,"status":"approved","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Provider-backed SDLC document management

## Context

Harnessctl manages Issues, CVS, and Memory but has no owned document domain.
Older user-level OpenCode tools create `.specs` and `.ai.tmp` files directly,
without project configuration, atomic mutation, locking, validation, cache
projection, provider routing, or lifecycle-wide guidance.

This design adds one independently configured Documents authority. It follows
the established Issues and Memory principles while preserving provider
differences instead of hiding them behind a false common remote API.

## Goals

- Provide a generated `sdlc-documents` skill for OpenCode and Pi.
- Provide safe normalized tools for repository-backed documents.
- Support filesystem, GitHub Wiki, GitLab Wiki, Gitea Wiki, and Forgejo Wiki
  authorities.
- Keep Gitea and Forgejo implementations strictly separate across all managed
  routes.
- Replace the old spec and draft creation use cases with a smaller coherent
  document lifecycle.
- Leave a provider seam that can later support Confluence without changing the
  filesystem authority contract.

## Non-Goals

- WYSIWYG editing, attachment storage, full-text search, or collaborative
  editing.
- Local mirrors of remote wikis or bidirectional synchronization.
- Provider SDK clients embedded in harnessctl.
- Credential storage or credential discovery.
- Automatic movement or rewriting of `.specs` or `.ai.tmp` files.
- Atlassian or Confluence implementation in this release.

## Authority Model

Exactly one `documents.type` is authoritative for a project.

### Filesystem

Canonical Markdown records live under `.harnessctl/documents`. The shared
SQLite database is a disposable projection. Missing, corrupt, or contradictory
cache state is repaired only from validated canonical files.

### Remote Wiki

When `documents.type` is a remote provider, that provider's wiki is canonical.
Harnessctl generates configuration and operating guidance but does not mirror
wiki content locally. An agent selects one configured route before a mutation.
After a mutation is attempted, success or failure is terminal; another route
must not be tried automatically.

## Provider Boundaries

| Provider | Managed route                                                        | Verified wiki capability                                                               |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GitHub   | `gh` authentication plus non-force Git against `OWNER/REPO.wiki.git` | Full wiki repository history and writes; no claimed GitHub MCP wiki CRUD               |
| GitLab   | Hosted MCP where supported; `glab api` for Wiki REST                 | Full REST list/read/create/update/delete; hosted MCP writes are not assumed            |
| Gitea    | Official `gitea.com/gitea/gitea-mcp` v1.6.0, `gitea-mcp`             | Native `wiki_read` and `wiki_write`                                                    |
| Forgejo  | `goern/forgejo-mcp` v2.33.0, `forgejo-mcp`                           | Native wiki tools; server is unscoped at runtime because v2.33.0 has no tool allowlist |

Gitea and Forgejo have different fixed server identities, executables,
compatibility pins, environment variables, rendered definitions, tests, and
guidance. Their intents never deduplicate with or fall back to each other.

The dedicated Forgejo Documents process does not provide process-level least
privilege. Tagged v2.33.0 source exposes no scope/tool filter and unconditionally
registers all tool domains and resources. Harnessctl therefore renders no invented
flag or wrapper. Generated guidance permits agent use of only the six wiki tools,
prohibits cross-domain tool and resource operations, and requires operators to
recognize the residual token-authority limitation.

## Major Components

### Configuration

The v2 project configuration gains a strict `documents` section. Filesystem
configuration names the canonical root and ID prefix. Remote configuration
names the authority, repository identity, selected CLI/MCP tools, URL where
required, and token environment variable name. Secret values never enter the
configuration.

### Filesystem Provider

A repository provider owns canonical record parsing, ID allocation, creation,
retrieval, bounded listing, optimistic updates, immutable version creation,
validation, archive moves, and explicit restores. It uses the shared
non-reentrant local-operation barrier and publication patterns already used by
Issues and Memory.

### Generic Tools and Host Adapters

`@harnessctl/generic-tools` exposes the normalized filesystem operations.
OpenCode and Pi adapters project the same contracts. The adapters register the
local tools consistently, and each operation rejects remote authority before
accessing the barrier, canonical root, or cache. Remote authorities use their
configured provider tools.

### Cache Projection

Only fixed, non-sensitive document fields needed for validation and filtering
(identity, version, location, path, revision, title, kind, status, timestamps,
and optional creator) are projected into the shared SQLite cache with
provider-generation evidence. Arbitrary document metadata and bodies remain
canonical-file-only. Cache publication is atomic. Reads never treat unverified
cache rows as canonical.

### Generated Skill

`sdlc-documents` describes current authority, available operations, path and
revision safety, remote capability limits, fresh-consent requirements, and
terminal mutation behavior. It references exact visible tool names and never
invents unavailable provider operations.

### Issue Integration

Issue document links accept the configured canonical document root in addition
to existing `.specs` and configured task roots. Links remain references; issue
storage does not copy document bodies.

Path-changing updates and archive perform a cross-domain preflight over active
and archived canonical issues. An update is rejected when an issue references
the current version's old path, and archive is rejected when an issue references
any active lineage path. Neither operation migrates nor rewrites issue links.
No normalized document-unlink issue operation exists in this release, so
tool-created links currently block both operations until that capability is
added; direct canonical-file edits remain prohibited.

## Local Document Lifecycle

A document has a stable ID, title, kind, status, current version, timestamps,
and canonical Markdown body. Supported initial kinds cover design, task, draft,
and general documentation. Stored mutable statuses are draft, review, and
approved. Superseded state is derived when a newer version exists; archived
state is derived from location. Derived states are not mutation input.

`document_create` covers both former spec and draft creation. `document_update`
changes the current version with optimistic revision protection.
`document_version` creates a new immutable version and preserves the prior
version. `document_archive` moves active records beneath the configured archive
without deleting history. `document_restore` is the explicit inverse and fails
on any active-path collision.

GitHub CLI authentication is not Git transport authentication. GitHub writes
require an already authenticated non-interactive Git transport and a successful
`git ls-remote --exit-code -- <wiki-url> HEAD` probe before mutation. When the
credential helper is missing, the verified official setup path is
`gh auth setup-git --hostname <host>`. Because it persistently mutates Git
configuration, an agent must never invoke it automatically and must obtain fresh
explicit consent immediately before use, avoid `--force`, expose no token value,
and repeat the Git probe afterward. Token-environment presence alone is
insufficient.

## Consistency and Failure Model

- Paths must remain repository-relative, normalized, and beneath configured
  roots. Symlink traversal and ambiguous YAML are rejected.
- IDs are allocated under the shared local-operation barrier.
- Canonical file batches publish atomically and roll back on publication
  failure. Cache synchronization follows the established local persistence
  contract: direct sync falls back to full rebuild; if both fail, canonical
  files remain authoritative and the next initialization retries repair.
- Remote updates use provider revision evidence when available. Missing or
  stale evidence fails before mutation.
- Unsupported operations fail explicitly before invoking a provider.
- Remote destructive operations require fresh action-specific user consent.
- Output is bounded and paginated according to provider and host limits.

## Migration and Compatibility

- `.specs` and `.ai.tmp` remain readable and linkable. They are not silently
  imported, renamed, or removed.
- Existing task document links remain valid.
- Managed Gitea CVS and remote-Issues intents migrate from the historical
  Forgejo-backed definition to official Gitea tooling.
- Only byte-equivalent historical generated definitions are eligible for
  automatic removal. Modified operator definitions and unrelated host JSON are
  preserved byte-for-byte with warnings, including force mode.
- GitHub, GitLab, Forgejo, Issues, Memory, and external MCP configuration retain
  existing behavior except for the approved Gitea provider correction.

## Security and Privacy

- Configuration stores environment variable names, never token values.
- Local input is bounded and validated before filesystem mutation.
- Remote provider output is untrusted data, not instruction or consent.
- No cross-provider fallback can duplicate writes.
- Archive and delete are distinct; remote deletion is destructive and requires
  fresh consent.
- Logs, cache rows, generated skills, and issue links must not contain secret
  values.

## Delivery Structure

- `hrn-00136`: separate managed Gitea and Forgejo MCP contracts.
- `hrn-00137`: implement filesystem document authority and tools.
- `hrn-00138`: configure provider-specific remote wiki routes.
- `hrn-00139`: integrate guidance, issue links, host adapters, and release
  artifacts.

## Verification Strategy

- Unit and contract tests for config, parsing, IDs, revisions, path safety,
  atomicity, cache repair, and provider capability mapping.
- Installer matrices for OpenCode, Pi, and `all`, including reinstall, force,
  canonical conflicts, exact legacy migration, modified legacy preservation,
  and rollback.
- Cross-platform package tests and artifact parity checks.
- Structured deterministic remote command/tool and outcome contracts for every
  provider, verified through generated guidance tests. Harnessctl has no remote
  provider execution layer, so executable provider mocks would be fictitious.
- Live-provider checks only when explicitly configured and separately
  consented; absence of credentials cannot weaken deterministic coverage.
- Full repository quality and build gates before release.

## Decisions

1. Documents is an independent authority, not an extension of CVS or Issues.
2. Filesystem is the default because it is portable, reviewable, and
   repository-transactional.
3. Remote providers share lifecycle guidance, not a fabricated uniform API.
4. Gitea and Forgejo use distinct upstream implementations everywhere.
5. One creation tool replaces separate spec and draft tools.
6. Remote synchronization and automatic legacy migration are deferred to keep
   the first implementation safe and comprehensible.
7. Local revisions hash exact canonical file bytes, matching Issues optimistic
   concurrency semantics.
