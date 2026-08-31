---
id: "doc-00017"
title: "Documentation Website Foundation and Evidence Model"
kind: design-overview
status: approved
version: 1
created_at: "2026-08-30T21:14:02.697Z"
updated_at: "2026-08-30T21:16:51.973Z"
created_by: "OpenCode"
metadata: {"epic":"hrn-00167","initiative":"hrn-00166"}
---

# Documentation Website Foundation and Evidence Model

## Purpose

Define the shared documentation website foundation and evidence semantics that constrain `hrn-00167` and downstream content Epics `hrn-00168` through `hrn-00171`.

## Context

Harnessctl already maintains canonical Markdown under `docs/`, with tests for inventory, local links, Mermaid accessibility metadata, and selected contract claims. The repository has no documentation-site framework. Many pages link to evidence outside `docs/`, including repository files and canonical `.harnessctl` artifacts.

The website must add navigation and presentation without creating a second documentation authority or publishing copied planning artifacts.

## Decisions

### Site layer

Use MkDocs Material as a static presentation layer. Resolve and lock the compatible dependency through the existing uv development workflow during Build. Configure the site at repository root with `docs/` as the documentation source and `docs/README.md` as Home.

Use task-oriented navigation with stable extension points for Configuration, Skills, SDLC, and MCP/integration content. Enable built-in search, responsive navigation, light and dark palettes, and code-copy support without requiring client-side application code.

### Source authority

Markdown under `docs/` remains canonical and useful in repository viewers. Do not create a parallel website-content tree or commit generated `site/` output.

A native MkDocs local hook transforms rendered links that resolve outside `docs/` into repository source URLs under `https://github.com/dragoscirjan/harnessctl-v2/blob/main/`. Source Markdown retains repository-local relative links. The hook must preserve anchors and support the inline and reference-link forms present in the repository. It must not copy `.harnessctl` authority into the generated site.

### Status vocabulary

Every described feature in downstream domain content uses one of these visible text labels:

| Status | Required meaning |
| --- | --- |
| `working` | Implementation evidence and current relevant verification evidence both exist. |
| `working but untested` | Implementation evidence exists; current relevant verification evidence does not. |
| `partially implemented` | Evidence confirms implementation, but contracted or described scope is missing. |
| `not implemented` | Intended or explicitly unsupported scope is evidenced, with no implementation evidence. |
| `unknown/stale` | Evidence is insufficient, contradictory, unavailable, or older than the applicable freshness rule. |

Status is written as explicit `Status:` text. Styling is optional and may not carry meaning by color or icon alone.

### Evidence provenance

Each status claim identifies one or more evidence classes: source, generated contract, automated test, approved design, active configuration, or dated provider observation. Evidence links point to the narrowest authoritative location available. A design proves intent, not implementation. Configuration proves declared state, not successful provider operation. Provider observations include their observation date and become `unknown/stale` when freshness cannot be established.

### Authoring model

Use short, human-first paragraphs, practical repository-grounded examples, copyable commands or payloads, and explicit limitations. Do not use product claims unsupported by current source, tests, generated contracts, approved designs, active configuration, or dated provider observations.

### Local workflow and quality

Add stable `docs-build` and `docs-serve` mise tasks. The build task runs MkDocs in strict mode; the repository quality workflow includes the strict build.

Automated checks retain the current exact page inventory and source-link validation, then add site navigation, rendered external-evidence links, status-contract structure, and strict build coverage. Existing Mermaid syntax and accessible-text parity checks remain mandatory.

Responsive and accessibility verification covers desktop and mobile navigation, keyboard-reachable controls, visible focus, readable light/dark palettes, textual status labels, and Mermaid accessible alternatives.

## Delivery Slices

1. Build the local MkDocs Material documentation site while preserving Markdown authority.
2. Define the evidence-backed feature status contract and examples.
3. Enforce strict build, navigation, link, status, Mermaid, and quality gates after the first two slices.

## Consequences

The repository gains a Python development dependency and static-site configuration, but no runtime dependency or deployment requirement. Downstream Epics can add or reorganize domain pages within fixed navigation and evidence contracts.

Rendered links to internal evidence rely on the repository source URL and default branch. Tests must detect malformed rewrites and preserve anchors. Deployment target selection, hosting, product behavior changes, and domain-content rewrites remain out of scope.
