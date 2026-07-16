---
id: ""
type: lld
title: "Filesystem Issue Management"
version: 2
status: draft
parent: "00001"
opencode-agent: lead-engineer
---

# Filesystem Issue Management

## 1. Purpose and scope

This LLD defines a small filesystem-backed issue-management feature for harnessctl.
It is an issue-management layer only. It does not define SDLC prompts, orchestration,
planning, implementation, verification, model routing, or external tracker integration.

The design must support:

- Creating and reading issues.
- Updating issue metadata and content through focused operations.
- Adding append-only comments.
- Representing hierarchy and issue relationships.
- Linking task documents and design documents.
- Safe use by an LLM without asking the LLM to allocate IDs or rewrite files manually.
- Normal Git workflows, including review, branching, merging, and cherry-picking.

The filesystem is the complete source of truth. No database, generated database, or
mandatory index is introduced.

## 2. Design principles

1. **Filesystem first** — every authoritative value is stored in ordinary Git-tracked
   files.
2. **Tool-owned mutations** — the LLM supplies intent and content; issue tools perform
   validation, ID allocation, relationship updates, and serialization.
3. **Small operations** — tools update one concern at a time instead of asking the LLM
   to rewrite a complete issue file.
4. **Git-friendly changes** — metadata changes should be narrow, comments should be
   append-only, and supporting documents should remain ordinary text files.
5. **Human-readable canonical records** — Markdown with YAML frontmatter is retained
   because it is easy to inspect and review in CVS.
6. **No hidden state** — deleting an optional cache must never delete issue data or
   prevent issue management from working.

## 3. Filesystem layout

Each issue owns a directory:

```text
.issues/
  00001/
    issue.md
    comments/
      0001.md
      0002.md
```

The issue directory contains only issue-management-owned files. Additional documents
are not copied into this directory by default:

- Task documents are stored under the configured tasks directory, normally
  `.harnessctl/tasks/<issue-id>/`.
- Design documents remain in `.specs/`.
- The issue stores relative links to both locations.

Example:

```text
.issues/00001/issue.md
.issues/00001/comments/0001.md
.harnessctl/tasks/00001/intake.md
.harnessctl/tasks/00001/verification.md
.specs/lld--filesystem-issue-management-v2.md
```

The issue manager may create the issue-owned directory and comments directory. It
must not move or duplicate a design document in `.specs/` merely to associate it with
an issue.

## 4. Issue document

The canonical issue record is `.issues/<id>/issue.md`.

```markdown
---
id: "00001"
type: task
title: Add filesystem issue management
status: open
created_at: 2026-07-16T20:00:00Z
updated_at: 2026-07-16T20:00:00Z
created_by: user
assigned_to: lead-engineer
parent: "00003"
children: "00002, 00004"
depends_on: "00000"
blocks: "00005"
relates_to: "00002"
documents: .harnessctl/tasks/00001/intake.md, .specs/lld--filesystem-issue-management-v2.md
priority: normal
labels: harnessctl, issue-management
---

# Add filesystem issue management

## Summary

Implement a filesystem-backed issue-management layer.

## Acceptance criteria

- Issues are stored under `.issues/`.
- Issue IDs are allocated by the issue manager.
- Comments and related documents are linked without manual file surgery.
```

### Required metadata

The first implementation should support:

- `id`
- `type`
- `title`
- `status`
- `created_at`
- `updated_at`
- `created_by`
- `assigned_to`
- `parent`
- `children`
- `depends_on`
- `blocks`
- `relates_to`
- `documents`

Optional values may be omitted. Unknown frontmatter fields must be preserved during
updates so that future versions do not destroy human or tool-added metadata.

### Comma-separated references

The following properties are intentionally simple comma-separated references:

```yaml
children: "00002, 00004"
depends_on: "00000, 00003"
blocks: "00005"
relates_to: "00002"
documents: .harnessctl/tasks/00001/intake.md, .specs/00002-design.md
```

The parser trims whitespace and treats an empty value as an empty list. IDs and paths
must not contain commas in this first version.

`children` is maintained by the issue manager. The LLM must not manually maintain the
parent's child list.

## 5. Issue IDs

The LLM must never calculate, select, or edit the next issue ID.

`issue_create` receives issue information without an ID. The issue manager:

1. Reads `issues.prefix` from `.harnessctl/config.yaml`; the value may be empty.
2. Finds the next available numeric sequence candidate.
3. Builds the ID as `<prefix><number>`, for example `TASK-00001` when the
   prefix is `TASK-`, or `00001` when it is empty.
4. Creates `.issues/<id>/issue.md` using an exclusive filesystem operation.
5. Retries on a collision.
6. Returns the assigned ID and path to the caller.

The ID is immutable after creation. Renaming an issue title must not rename its issue
directory or change references.

The issue type is metadata only and is never included in the issue directory or file
name. Sequential IDs can collide across independent Git branches. The exclusive create
operation prevents local concurrent writers from overwriting one another; a Git merge
may still require human conflict resolution. This is acceptable for the filesystem
first version.

## 6. Hierarchy

Hierarchy uses `parent` and `children`:

```text
initiative
└── epic
    └── story
        ├── task
        └── bug
```

The child stores:

```yaml
parent: "00003"
```

The parent stores:

```yaml
children: "00001, 00002"
```

The issue manager updates both sides in one logical operation. If one side is
missing or inconsistent, `issue_validate` reports it and `issue_relate` or
`issue_update` repairs it. Direct LLM edits are not assumed to preserve consistency.

Default parent validation:

| Child type | Allowed parent    |
| ---------- | ----------------- |
| initiative | none              |
| epic       | initiative        |
| story      | epic, initiative  |
| task       | story, epic       |
| bug        | story, task, epic |

These rules should be implementation constants initially, with future configuration
possible if real use requires it.

### 6.1 Archiving a hierarchy

`issue_archive(id)` moves the requested issue directory and every active descendant
reachable through `children` from `.issues/<id>/` to `.issues/archived/<id>/`. The
traversal is cycle-safe, preserves each directory unchanged, and skips descendants
that have already been moved. Unrelated active issues remain in `.issues/`. The
`archived` directory is excluded from normal listing and is included when allocating
the next number so IDs are never reused after archival. Archiving an already archived
issue is an idempotent informational result.

## 7. Relationships

Hierarchy is distinct from relationships.

Initial relationship kinds:

- `depends_on`
- `blocks`
- `relates_to`
- `duplicates`
- `supersedes`

The first implementation may store directional properties directly in frontmatter:

```yaml
depends_on: 00003
blocks: 00005
relates_to: 00002
```

The relationship tool updates the target's inverse view when an inverse is useful.
For example, adding `A blocks B` may update:

```yaml
# A
blocks: B

# B
blocked_by: A
```

`blocked_by` is a derived or maintained view, not a separate user decision. The
manager must avoid duplicate IDs and must reject self-references. It should report
missing references and obvious dependency cycles.

## 8. Comments

Comments are append-only files:

```text
.issues/00001/comments/0001.md
```

Example:

```markdown
---
id: "00001-C0001"
issue: "00001"
created_at: 2026-07-16T20:20:00Z
created_by: orchestrator
---

The issue ID is immutable and remains independent of the issue type or title.
```

`issue_comment` allocates the comment ID and filename using an exclusive `wx` file
creation and retries with the next number on `EEXIST`. The LLM supplies only the
issue ID, author, and comment text. If updating the issue timestamp fails, the new
comment file is removed.

Comments should not be edited or deleted by normal tools. Corrections are new
comments. This preserves a simple audit trail in Git history.

## 9. Issue amendments

The LLM must not be instructed to manually rewrite the complete issue file.

The issue manager exposes focused operations:

```text
issue_update
issue_transition
issue_comment
issue_relate
issue_unrelate
issue_link_document
issue_validate
```

`issue_update` accepts targeted field changes and selected body sections. It must:

1. Read and parse the current issue.
2. Validate the requested changes.
3. Preserve unknown metadata and unrelated body content.
4. Update only requested fields or sections.
5. Update `updated_at`.
6. Write the result atomically.

Every mutating operation must use concurrency protection. Issue updates use an
expected revision/content hash and return a conflict if the issue changed since it
was read. Multi-file mutations use the same compare-before-write discipline and
rollback on failure; they must never silently overwrite a newer revision.

## 10. Documents

Documents are linked by relative repository paths.

### Task documents

Documents associated with implementation work should live under the configured task
directory:

```text
.harnessctl/tasks/00001/intake.md
.harnessctl/tasks/00001/investigation.md
```

The issue stores links only:

```yaml
documents: .harnessctl/tasks/00001/intake.md, .harnessctl/tasks/00001/investigation.md
```

The issue manager may create the task directory when explicitly asked to attach a
task document.

### Design documents

Design documents remain under `.specs/` and are never copied into the issue directory:

```yaml
documents: .specs/lld--filesystem-issue-management-v2.md
```

`issue_link_document` normalizes backslashes to `/`, rejects absolute paths, `..`
segments, commas, and paths outside the repository, and stores the normalized path.
Symlink targets are rejected to prevent links escaping the repository. It records the
link only and does not create or modify the target design document.

## 11. Tool contracts

The initial generic API should remain small:

```text
issue_create(type, title, metadata) -> Issue
issue_get(id) -> Issue
issue_list(filters) -> IssueSummary[]
issue_update(id, changes, expected_revision) -> Issue
issue_transition(id, status, expected_revision) -> Issue
issue_comment(id, body, author) -> Comment
issue_relate(id, relationship, target_id) -> Issue
issue_unrelate(id, relationship, target_id) -> Issue
issue_link_document(id, path, kind?) -> Issue
issue_validate(id?) -> ValidationReport
issue_archive(id) -> ArchiveReport
issue_id(prompt) -> string[]
```

The generic package should return structured values. OpenCode and Pi adapters may
format those values as text for their tool protocols.

`issue_id` reads `issues.prefix`, treats it literally, and matches whole-token
occurrences of every `<prefix><number>` in the provided prompt. It escapes the
prefix before constructing the matcher, rejects adjacent identifier characters,
removes duplicates while retaining first-appearance order, and returns an empty list
when configuration is unavailable or invalid. An empty prefix matches numeric IDs;
the prefix must contain only ASCII letters, digits, `_`, or `-` (and may be empty).
It is a prompt-identification helper, not an issue existence check.

`issue_transition` may initially be implemented as a constrained `issue_update`, but
it should remain a separate public operation so status rules can be added without
changing callers.

## 12. Validation

`issue_validate` checks:

- Valid frontmatter.
- Valid issue ID and filename.
- Valid type and status.
- Required metadata.
- Parent existence and allowed hierarchy.
- Parent/children consistency.
- Relationship target existence.
- No self-reference.
- No obvious dependency cycle.
- Linked document paths are repository-relative.
- Linked documents exist when the link is expected to be resolvable.

Validation should report findings rather than mutate files automatically. A separate
repair operation can be added later after real malformed-file cases are understood.

## 13. Git and CVS behavior

The design must work with ordinary Git commands:

```text
git diff
git log
git blame
git merge
git cherry-pick
```

Rules:

- Issue IDs are immutable.
- The filesystem is authoritative.
- No database or mandatory generated index exists.
- Comments are append-only.
- Documents remain ordinary text files.
- Unknown issue metadata is preserved.
- Tools make focused changes.
- Tools never silently overwrite an issue changed by another writer.

Git conflicts are acceptable and should remain visible to humans. The issue manager
must not hide conflicts by inventing a second state store.

## 14. Explicit non-goals

This LLD does not define:

- Intake, exploration, planning, implementation, or verification prompts.
- Orchestrator behavior.
- Automatic SDLC progression.
- Model selection or escalation.
- External issue providers.
- Database persistence.
- Worktrees or branch automation.
- Automatic commits, pushes, pull requests, or merges.

## 15. Implementation order

1. Define typed issue, comment, relationship, document-link, archive, and issue-ID models.
2. Replace regular-expression frontmatter parsing with YAML parsing.
3. Implement issue directory creation and tool-owned ID allocation.
4. Implement `issue_get` and structured `issue_list`.
5. Implement focused `issue_update` with unknown-field preservation.
6. Implement append-only comments.
7. Implement hierarchy and relationships, including `children` maintenance.
8. Implement document links for `.harnessctl/tasks/` and `.specs/`.
9. Implement validation and conflict detection.
10. Add OpenCode and Pi registrations only after generic behavior is stable.
11. Register `issue_archive` and the multi-match `issue_id` helper in both adapters.

## 16. Acceptance criteria

Given a project with `.harnessctl/config.yaml` and no database

When an LLM invokes `issue_create` without an ID

Then the issue manager allocates the ID, creates `.issues/<id>/issue.md`, and returns
the ID and path.

Given `issues.prefix` is empty or contains a safe prefix

When an LLM invokes `issue_create` without an ID

Then the tool allocates a numeric ID with at least five digits and never includes the
issue type or title in the issue directory name.

Given an issue with active descendants recorded in `children`

When `issue_archive` is invoked for the root issue

Then the root and all reachable active descendants move to `.issues/archived/`, while
unrelated issues and already archived descendants are left untouched.

Given a prompt containing multiple configured issue IDs

When `issue_id` is invoked

Then it returns all distinct IDs in first-appearance order.

Given a parent issue and a new child issue

When the child is assigned to the parent

Then the child receives `parent` and the parent receives the comma-separated child ID
in `children`.

Given an existing issue

When the LLM invokes `issue_comment`, `issue_update`, or `issue_link_document`

Then the issue manager performs a focused validated mutation without requiring the
LLM to manually rewrite the issue file.

Given a task document under `.harnessctl/tasks/` or a design document under `.specs/`

When it is linked to an issue

Then the issue records the relative path and the document remains in its original
location.

Given two concurrent local issue creators

When both request a new issue

Then neither operation overwrites the other's issue file.

Given a malformed or inconsistent issue file

When `issue_validate` is invoked

Then it returns actionable findings without silently changing the file.
