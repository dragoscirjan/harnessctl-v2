---
id: "doc-00015"
title: "Config v3 Architecture and Ownership"
kind: hld
status: approved
version: 1
created_at: "2026-08-29T22:20:12.888Z"
updated_at: "2026-08-29T22:20:59.864Z"
created_by: "OpenCode"
---

# Config v3 Architecture and Ownership

## Purpose

Define the system architecture for a breaking Config v3 that removes cross-runtime contract drift and establishes explicit configuration and host-projection ownership.

## Context

Config v2 currently has independent defaults and validation in TypeScript and Python. Zod generates a portable schema, but Python manually restates the contract. MCP server intent is assembled from fixed capability settings, while host reconciliation can conflict with operator edits. The root `config.ts` file is an incomplete design sketch and is not canonical authority.

## Decisions

### Contract Authority

TypeScript Zod is the sole hand-maintained authority for Config v3 fields, defaults, enums, refinements, and cross-field rules. Generation emits a versioned JSON Schema and defaults JSON manifest. Generated artifacts are shipped, reproducible, and checked for drift.

Python loads the generated schema and defaults and validates through a standards-based JSON Schema implementation. Python may implement parsing, error presentation, and merge orchestration, but it must not restate the contract.

### Capability Model

Capability configuration is grouped under `skills` for issues, documents, CVS, caveman, code index, and memory. Shared paths, workflow policy, and MCP declarations remain separate infrastructure concerns. Provider-specific settings stay inside their owning capability.

### Version Boundary

Config v3 is a hard boundary. Missing or v2 documents fail with actionable migration guidance. No automatic migration, fallback reader, or lossy compatibility path is provided.

### MCP Intent and Projection

Harness configuration declares generic MCP connection intent without a transport/type field. URL-oriented declarations and command-oriented declarations are mutually exclusive. OpenCode and Pi adapters infer and emit host-native HTTP or stdio transport only during compilation.

Harnessctl owns only exact entries it generated. Any pre-existing same-ID entry or any divergence from an exact generated value is operator-owned. Compilation preserves operator-owned entries byte-for-byte, emits a remediation warning, and never overwrites or deletes them, including under force. Harnessctl does not own MCP installation, process lifecycle, authentication, credentials, or service operation.

## Components

- Canonical Zod v3 contract and defaults in `extensions/generic-tools`.
- Deterministic contract/default artifact generator and stale-artifact check.
- TypeScript runtime loader and capability consumers.
- Python installer loader backed by generated artifacts.
- Shared conformance fixtures for normalization and failures.
- Projection-neutral MCP intents and OpenCode/Pi adapters.
- Entry-level MCP reconciliation and ownership warnings.
- Config v3 reference and migration documentation.

## Data Flow

1. Maintainer changes the Zod contract or canonical defaults.
2. Generation produces versioned schema/default artifacts and checks them into the package contract surface.
3. TypeScript validates directly with Zod and applies canonical defaults.
4. Python loads the generated defaults, merges user input, and validates with the generated JSON Schema.
5. Capability settings and generic MCP declarations produce projection-neutral installation intent.
6. Host adapters infer native transport and render OpenCode/Pi entries.
7. Reconciliation mutates only exact managed entries and adopts any divergent entry as operator-owned.

## Rollout

Implement contract generation first, migrate both runtimes second, change MCP projection/reconciliation third, then publish migration/reference documentation. Release must coordinate Python and npm artifacts so no consumer observes a schema/default version mismatch.

## Risks and Controls

- Generator semantic loss: shared positive/negative fixtures and explicit generation failure for unsupported refinements.
- Package path differences: source, wheel, and npm artifact-loading tests.
- Runtime skew: embed and compare contract version/fingerprint where artifacts are loaded.
- Operator intent not applied: deterministic warning identifies preserved host entry and manual remediation.
- Breaking adoption cost: complete v2-to-v3 field mapping and safe examples.

## Non-Goals

Automatic v2 migration; v2 compatibility; MCP lifecycle ownership; source implementation during Plan; absorbing `hrn-00157`, `hrn-00158`, or `hrn-00159`.
