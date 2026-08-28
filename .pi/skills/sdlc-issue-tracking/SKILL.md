---
name: sdlc-issue-tracking
description: Manage project issues through the configured filesystem issue authority.
---

# Issue Tracking

Use only the configured issue tooling described below. Never switch providers, call an unconfigured tool, call provider APIs directly, or edit provider storage directly. If a required tool is unavailable, stop and report the exact missing capability to the user.

## Issue Content

Manage initiatives, epics, stories, tasks, and bugs. Use this hierarchy where provider capabilities permit:

- Initiative: top-level business goal.
  - Epic: large project phase.
    - Story: user-facing feature.
      - Task: atomic implementation step.
      - Bug: defect in a story.
    - Bug: defect in an epic.

Write clear, testable acceptance criteria. When useful, describe a feature as “As a …, I want …, so that …” or a defect with `Given` / `When` / `Then` Gherkin steps.

Keep progress comments concise: status, links to produced artifacts, next step or blocker, and agent attribution. Link to active canonical Documents, task documents, and source artifacts instead of pasting their bodies.

Record an execution failure as an issue comment only when its target issue is known and the configured tooling, repository context, authentication when applicable, and comment capability remain operational. If the provider, CLI, authentication, repository resolution, or comment operation fails, stop and report directly to the user. Never retry failure reporting through the broken issue channel.

## Filesystem Provider

Canonical issues are under `.harnessctl/issues` and use the `hrn-` ID prefix. Available normalized harnessctl tools: `issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive`.

1. Use `issue_create` to create metadata and obtain an ID.
2. Use `issue_get` to read that issue and obtain its latest `expectedRevision`.
3. Use `issue_update` with the complete body and that `expectedRevision`.
4. Before every later revision-sensitive `issue_update` or `issue_transition`, call `issue_get` again and pass the newly returned `expectedRevision`.

Use `issue_list` for discovery, `issue_comment` for append-only progress, and `issue_link_document` for task or design documents. Use relationship and archive tools rather than encoding those changes in text. Never directly edit canonical files under `.harnessctl/issues`: IDs, front matter, timestamps, relationships, revisions, and comments are tool-managed. A revision conflict requires a fresh `issue_get`; never bypass concurrency or validation controls.
