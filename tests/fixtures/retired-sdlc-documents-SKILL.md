---
name: sdlc-documents
description: Manage project documents through the configured filesystem Documents authority.
---

# Documents

Use this skill whenever creating, reading, updating, versioning, validating, archiving, restoring, linking, or deleting project documents. Exactly one configured Documents authority is canonical. Link documents from issues rather than pasting duplicate bodies.

## Filesystem Authority

Canonical active Markdown files are under `.harnessctl/documents` and use the `doc-` ID prefix. The exact normalized tool set is `document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore`. These local tools are statically registered by the host adapters, but they execute only while `documents.type=filesystem`; remote authority fails closed before local filesystem, barrier, or cache access.

The shared SQLite cache is disposable, advisory, and non-authoritative. Validate canonical Markdown and repair projection state from it; never repair canonical files from cache rows. Revisions hash exact canonical file bytes. Before `document_update`, `document_version`, `document_archive`, or `document_restore`, obtain a current revision with `document_get` and pass it as `expectedRevision`; stale evidence writes nothing.

Use `document_create` for version 1, `document_list` for bounded discovery, `document_get` for content and revision evidence, `document_update` only for the current version, and `document_validate` before relying on manually changed state. `document_version` creates an immutable next version; older versions remain unchanged and supersession is derived from version order. `document_archive` transactionally moves the complete active lineage beneath `.harnessctl/documents/archive`; `document_restore` is its explicit collision-safe inverse. Archived state is derived from location. Never call either operation delete.

Before a path-changing update or archive, every active and archived canonical issue must be free of links to the affected old path or active lineage paths. Neither operation migrates issue links; path-preserving updates remain allowed. The current issue tool contract has no document-unlink operation, so a tool-created document link cannot currently be removed through normalized issue tools; report this limitation and do not edit canonical issue files directly.

Never edit tool-managed IDs, frontmatter, filenames, timestamps, versions, or revision evidence directly. Reject absolute, traversal, dot-segment, symlink, missing, and out-of-root paths. Keep reads and validation findings bounded. Report unsupported operations instead of bypassing the authority.
