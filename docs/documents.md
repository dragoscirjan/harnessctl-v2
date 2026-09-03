# Documents

## Configure document authority

Harnessctl uses `skills.documents` to locate canonical design documents. The default keeps
them in `.harnessctl/documents`, enables the document tools, and fixes IDs to the `doc-`
prefix.

```yaml
version: 1
skills:
  documents:
    enabled: true
    root: .harnessctl/documents
    prefix: doc-
    provider:
      type: filesystem
      tools: document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore
```

See the [Documents schema](config-schema.md#documents) for every field, default, provider
shape, and constraint. Selecting a remote provider changes generated guidance; it does not
turn local document tools into a remote API client.

## Repository Authority

Canonical active design Markdown lives directly under the safe project-relative
`skills.documents.root`, which defaults to `.harnessctl/documents`, and uses the fixed
`doc-` ID prefix. A Config v1 override may select another safe repository-local root. The
four kinds are exactly
`hld`, `lld`, `design-overview`, and `gdd`; statuses are `draft`, `review`, and
`approved`. Custom prefixes, wiki routes, a Documents agent, and a generated
`sdlc-documents` skill are not supported. Git provider mappings are accepted configuration,
but local Documents tools fail closed and leave remote behavior provider-owned.

The normalized tool set is exactly `document_id`, `document_create`, `document_list`,
`document_get`, `document_update`, `document_version`, `document_validate`,
`document_archive`, and `document_restore`. OpenCode and Pi expose equivalent thin
adapters. Canonical Markdown remains authoritative; the shared SQLite cache is disposable,
advisory, and never a repair source.

Every new Document ID is `doc-` followed by a 26-character uppercase Crockford ULID,
for example `doc-01K4A7X9Z8B3N5Q6R2TVCW0YJM`. The ULID alphabet is `0-9` and
`A-HJKMNP-TV-Z`; lowercase and the ambiguous letters `I`, `L`, `O`, and `U` are invalid.
Legacy `doc-` IDs with at least five decimal digits remain permanently discoverable and
usable across versions, links, validation, archive, and restore. No automatic migration
rewrites them. Mixed lists place legacy IDs first in numeric order, then ULID IDs in
lexicographic order.

Creation publishes a collision-safe identity exclusively and fails closed rather than
overwriting an existing canonical path. SQLite continues storing IDs as strings, so the
dual-format authority needs no cache schema migration. Rollback remains compatible with
all legacy numeric records; once ULID records exist, readers must retain this dual-format
contract.

## Lifecycle

The existing SDLC Plan reference owns design work. It selects a proportionate kind, checks
existing records with `document_list` and `document_get`, creates version 1 as `draft` with
`document_create`, applies same-version review corrections with `document_update`, and uses
`document_version` for a semantic successor. Moving to `review` and moving from review to
`approved` are separately confirmed transitions. Each transition obtains the latest exact-byte
`expectedRevision` fresh from `document_get` immediately before mutation; approval never
reuses the review revision. After approval, separately confirm `issue_link_document` and link only
the approved active canonical path rather than copying the body into an issue or memory.
Run both `document_validate` and `issue_validate` after linking and before checkpointing.

Earlier versions remain immutable and supersession derives from version order. Archive
moves the complete active lineage beneath `<skills.documents.root>/archive`; restore is its
explicit collision-safe inverse. Neither operation is deletion. Path-changing update,
archive, and restore preflight issue references and fail closed rather than rewriting issue
links. The current normalized issue tools have no document-unlink operation, so do not edit
canonical issue files to bypass that limitation.

## Legacy Boundaries

No `.specs` or `.ai.tmp` migration command or link compatibility ships. Neither location is
a live authority or an accepted new-link target. `.specs-v1` is inert repository history.
Immutable issue comments, memory records, old Changesets, released changelogs, and
superseded Documents remain historical evidence and are not rewritten.

## Retired Skill Cleanup

An install checks selected OpenCode and Pi skill roots for the retired
`sdlc-documents/SKILL.md`. It removes the tree transactionally only when the complete tree
is the exact previously managed one-file output with the expected byte size and SHA-256.
A symlink, special entry, additional entry, unreadable file, or any byte modification is
operator-owned evidence: harnessctl preserves the complete tree and emits its exact path in
a warning. `--force` does not weaken this fingerprint rule.

See the approved repository-local Documents
[HLD](../.harnessctl/documents/doc-00013-repository-local-sdlc-design-document-management-v4.md)
and
[LLD](../.harnessctl/documents/doc-00014-repository-local-sdlc-design-document-management-v4.md).
