---
id: "doc-00017"
title: "Documentation Website Foundation and Information Architecture"
kind: design-overview
status: approved
version: 2
created_at: "2026-08-30T21:14:02.697Z"
updated_at: "2026-08-31T17:10:49.227Z"
created_by: "OpenCode"
metadata: {"epic":"hrn-00167","initiative":"hrn-00166"}
---

# Documentation Website Foundation and Information Architecture

## Purpose

Define the shared website shell, information architecture, visual conventions, evidence presentation, machine-readable indexes, and quality boundaries for `hrn-00167` without taking ownership of domain content assigned to later Epics.

## Context

Harnessctl keeps canonical editable Markdown under `docs/` and uses MkDocs Material as a static presentation layer. The first implementation established strict builds, search, code copy, responsive theme support, Mermaid rendering, repository-link rewriting, and a status vocabulary. It also introduced a navigation hierarchy and domain pages that predate the approved `hrn-00166` information architecture.

This version preserves useful foundation work while replacing the legacy structure and enforcing explicit ownership boundaries. Prior implementation is evidence, not proof that the revised architecture is complete.

## Information Architecture

The primary navigation is:

```text
Home
SDLC
  Introduction to SDLC
  Harnessctl SDLC
Harnesses
Tools
  Skills
  Node Modules
  MCP Servers
Docs
  Installation
  Getting Started
  Reference
    Config File
    Config Schema
    Command Reference
    Skill Configuration
      Issues
      Documents
      Memory
      Code Index
      CVS
      ...
  Troubleshooting
  FAQ
  Changelog
```

Evidence-status guidance may appear as a contextual reference but not as a competing top-level domain. Legacy `Use harnessctl`, `Project authority`, and `MCP and integrations` navigation groups are removed.

## Route And Ownership Contract

`hrn-00167` owns the shell, navigation entries, stable route locations, rendering behavior, shared presentation conventions, and clearly marked structural stubs required for strict builds.

Domain content ownership remains:

| Area | Owner |
| --- | --- |
| Home, Docs landing, Installation, Getting Started | `hrn-00175` |
| Introduction to SDLC, Harnessctl SDLC | `hrn-00170` |
| Harnesses | `hrn-00176` |
| Skills | `hrn-00169` |
| Node Modules | `hrn-00177` |
| MCP Servers | `hrn-00171` |
| Config File, Config Schema, Command Reference, Skill Configuration | `hrn-00168` |
| Troubleshooting, FAQ, Changelog | `hrn-00178` |

Structural stubs state their owner and planned status only. They contain no product claims, tutorials, catalog entries, reference contracts, or inferred support state. Later Epics replace stubs in place rather than creating parallel routes.

## Site And Visual Shell

Keep MkDocs Material, `docs/` as the canonical source, root `mkdocs.yml`, strict builds, generated `site/` exclusion, built-in search, code copy, light/dark modes, and the existing native evidence-link hook.

Use a restrained technical visual language inspired by clear task-oriented documentation, without copying another product's branding, wording, code, or taxonomy. Customize only maintainable extension surfaces: typography hierarchy, spacing, navigation emphasis, content width, code/table treatment, focus visibility, and status/evidence presentation. Avoid a deep theme fork or application JavaScript.

Desktop and mobile navigation expose the same hierarchy. Stable headings and deep links, previous/next navigation, readable responsive tables, keyboard-reachable controls, visible focus, sufficient contrast, and accessible Mermaid descriptions/text equivalents are foundation contracts.

## Status And Evidence Presentation

Preserve explicit `Status:` and `Evidence:` text. Styling may decorate these fields but never carry meaning by color or icon alone.

Use the existing statuses: `working`, `working but untested`, `partially implemented`, `not implemented`, and `unknown/stale`. Evidence classes remain source, generated contract, automated test, approved design, active configuration, and dated provider observation.

The foundation defines page anatomy, heading/deep-link rules, compact table and code conventions, and freshness/conflict presentation. Domain Epics own every product-specific claim and evidence audit.

## LLM Index Contract

Generate `llms.txt` and `llms-full.txt` deterministically from canonical public navigation and Markdown.

`llms.txt` provides a compact ordered index with stable page links and concise page descriptions. `llms-full.txt` provides the same ordered public corpus with clear page boundaries. Both exclude generated site output, repository planning authority, private implementation artifacts, and pages outside the approved public route inventory.

Generation is local and network-free, joins the documentation build, and has one canonical implementation. Manual edits or stale generated output fail deterministic checks.

## Source And Link Authority

Markdown under `docs/` remains useful in repository viewers and is the only editable website-content authority. Do not create a parallel content tree or commit `site/`.

The native MkDocs hook continues transforming rendered links that resolve outside `docs/` into repository source URLs while preserving source Markdown, anchors, inline/reference links, and fenced examples. It must not copy `.harnessctl` artifacts into public output.

## Quality Contract

Automated foundation checks cover:

- exact approved route inventory and route ownership;
- absence of legacy navigation groups;
- strict MkDocs build and canonical Markdown inventory;
- search, code-copy, theme, navigation, and hook configuration;
- repository-local source links and rendered out-of-tree evidence links;
- Mermaid syntax, accessible descriptions, and diagram/text parity;
- visible status/evidence semantics;
- deterministic `llms.txt` and `llms-full.txt` generation;
- prohibition of domain claims in structural stubs.

Formal Verify later covers desktop/mobile navigation, keyboard reachability, visible focus, readable light/dark presentation, responsive tables/code, Mermaid browser rendering, and generated-output inspection. Browser tooling availability is a Verify-phase prerequisite, not proof supplied by Build.

## Delivery Slices

1. Rework the site shell and navigation to the approved architecture.
2. Define shared page, status, and evidence presentation conventions in parallel with the shell.
3. Generate canonical LLM indexes after the route contract exists.
4. Enforce all foundation contracts through deterministic quality gates.

## Release, Rollback, And Operations

Later Release uses one pull request from the existing Epic branch. This design adds no hosting, deployment, runtime service, external provider operation, or operational state.

Rollback reverts the shell, configuration, generator, and foundation-test changes together. Canonical Markdown history remains recoverable and generated output remains disposable.

## Non-Goals

- Writing or approving domain-owned public content.
- Changing harnessctl product behavior, configuration, commands, skills, modules, providers, or harness support.
- Hosting or deploying the website.
- Operating external providers or requiring network access for routine documentation checks.
- Copying Taskfile branding, wording, source code, or product taxonomy.
- Creating a deep MkDocs theme fork or custom documentation application.
