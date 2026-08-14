---
scope: rollout-gate
implementation: deferred
id: "00006"
type: story
title: Migrate legacy issues before YAML rollout
status: open
created_at: 2026-08-14T13:16:30.809Z
updated_at: 2026-08-14T13:17:17.712Z
parent: "00001"
depends_on:
  - "00004"
created_by: lead-engineer
assigned_to: tech-advisor
---

# Migrate legacy issues before YAML rollout

## Story

As a repository maintainer
I want an explicit migration and rollout plan for legacy Markdown issues
So that canonical YAML storage is never enabled against an incompatible repository silently.

## Scope

- Define legacy Markdown/frontmatter and comment-folder discovery.
- Define an explicit, separately invoked migration.
- Preserve every managed field and comment.
- Validate migrated YAML before removing or archiving legacy inputs.
- Define backup, rollback, dry-run, and mixed-format rejection behavior.
- Gate production rollout of canonical YAML issue storage until migration is delivered.

## Out of Scope

Implementation is deferred and is not part of Epic #00004 or the current Initiative implementation request.

## Acceptance Criteria

### Scenario: Explicit migration

Given legacy issue storage exists
When canonical YAML storage is introduced
Then no migration occurs implicitly
And users receive an actionable migration requirement.

### Scenario: Safe future rollout

Given a future migration implementation
When migration succeeds
Then all issue-managed state and comments are preserved
And canonical YAML validates before legacy state is retired.
