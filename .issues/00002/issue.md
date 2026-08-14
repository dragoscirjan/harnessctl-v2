---
id: "00002"
type: story
title: Compose Epic for canonical single-file YAML issues
status: done
created_at: 2026-08-14T12:51:58.412Z
updated_at: 2026-08-14T12:56:50.328Z
parent: "00001"
created_by: product-owner
assigned_to: product-owner
---

# Compose Epic for canonical single-file YAML issues

## Story

As a product owner
I want an Epic defining canonical single-file YAML issue storage
So that issue state is cohesive, reviewable, and efficient to index.

## Requested Epic Scope

- Define a versioned YAML issue contract containing managed metadata, body content, embedded comments, relationships, hierarchy, document links, and custom metadata.
- Store active issues directly under `.issues/` as `<id>-<title-slug>.yml`.
- Store archived issues under `.issues/archived/` using the same filename convention and schema.
- Remove the issue directory and separate comments-directory model.
- Make comment append operations update the issue YAML atomically while preserving comment immutability.
- Rename the file atomically when the title changes; keep the issue ID as stable identity.
- Update create, get, list, update, transition, comment, relate, unrelate, link, validate, and archive behavior for the new representation.
- Preserve optimistic concurrency through a deterministic revision derived from canonical issue state.
- Add schema validation and filesystem-safety rules for IDs and title slugs.
- Request an HLD Design Story before implementation tasks are composed.

## Explicit Exclusions

- Migration from existing Markdown/frontmatter issues.
- Automatic legacy-file conversion or compatibility promises.
- SQLite implementation, except exposing the provider projection contract required by the cache Epic.

## Acceptance Criteria

### Scenario: Epic is actionable

Given this Story is refined into an Epic
When the Epic is reviewed
Then it defines user value, boundaries, risks, dependencies, and testable acceptance criteria
And it includes a Design Story requesting an HLD.

### Scenario: Single canonical file

Given a new issue receives comments, relationships, links, or status changes
When its state is persisted
Then all managed state is represented in one YAML document
And no issue-specific directory or comments directory is required.

### Scenario: Stable identity and readable filename

Given an issue title changes
When the update succeeds
Then its file is atomically renamed to `<id>-<new-title-slug>.yml`
And references continue using the unchanged issue ID.

### Scenario: Archive consistency

Given an issue is archived
When archival succeeds
Then the same YAML document moves to `.issues/archived/`
And its schema and filename convention remain unchanged.

### Scenario: Migration boundary

Given legacy Markdown issue files exist
When this Epic is implemented
Then they are not silently migrated
And migration remains separately planned work.
