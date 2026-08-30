---
id: "doc-00015"
title: "Config v1 Architecture and Ownership"
kind: hld
status: approved
version: 2
created_at: "2026-08-29T22:20:12.888Z"
updated_at: "2026-08-29T22:44:59.630Z"
created_by: "OpenCode"
---

# Config v1 Architecture and Ownership

## Purpose

Define the system architecture for harnessctl's first stable Config v1 contract, remove cross-runtime contract drift, and establish explicit configuration and host-projection ownership.

## Context

The repository is pre-release. Its current Config v2 implementation has independent defaults and validation in TypeScript and Python; a paused Config v3 slice began replacing that duplication. Neither Config v2 nor Config v3 is a released compatibility target. The stable contract is therefore numbered Config v1 rather than introducing migration debt before the first release. The root `config.ts` sketch remains non-canonical design input.

## Decisions

### Contract Authority

TypeScript Zod is the sole hand-maintained authority for Config v1 fields, defaults, enums, refinements, and cross-field rules. Generation emits `config-v1.schema.json` and `config-v1.defaults.json`. Generated artifacts are shipped in Python and npm layouts, reproducible, fingerprint-aligned, and checked for drift.

Python loads the generated schema and defaults and validates through a standards-based JSON Schema implementation. Python may implement parsing, error presentation, and merge orchestration, but it must not restate the contract.

The unrelated portable memory contract remains `memory-record-v1.schema.json`; package tests and documentation distinguish its domain from Config v1.

### Capability Model

Capability configuration is grouped under `skills` for issues, documents, CVS, caveman, code index, and memory. Shared paths, workflow policy, and MCP declarations remain separate infrastructure concerns. Provider-specific settings stay inside their owning capability.

### Version Boundary

Config v1 is the first stable public boundary and requires explicit `version: 1`. Missing and non-1 documents fail with actionable stable-v1 rewrite guidance. Config v2 and Config v3 are unreleased development contracts and receive no automatic migration, fallback reader, or compatibility path.

### MCP Intent and Projection

Harness configuration declares generic MCP connection intent without a transport/type field. URL-oriented and command-oriented declarations are mutually exclusive. OpenCode and Pi adapters infer and emit host-native HTTP or stdio transport only during compilation.

Harnessctl owns only exact entries it generated or exact recognized historical generated values. Any pre-existing same-ID entry or divergence from an exact generated value is operator-owned. Compilation preserves operator-owned entries byte-for-byte, emits a safe remediation warning, and never overwrites or deletes them, including under force. Harnessctl does not own MCP installation, process lifecycle, authentication, credentials, or service operation.

## Components

- Canonical Config v1 Zod contract and defaults in `extensions/generic-tools`.
- Deterministic contract/default artifact generator, fingerprints, and stale-artifact check.
- TypeScript runtime loader and capability consumers.
- Python installer loader backed by generated artifacts.
- Shared conformance fixtures for normalization and failures.
- Projection-neutral MCP intents and OpenCode/Pi adapters.
- Entry-level MCP reconciliation and ownership warnings.
- Config v1 reference, development rewrite note, examples, and initial-release documentation.

## Data Flow

1. A maintainer changes the Config v1 Zod contract or canonical defaults.
2. Generation produces versioned schema/default artifacts and fingerprints.
3. TypeScript validates directly with Zod and applies canonical defaults.
4. Python loads generated defaults, merges user input, and validates against generated JSON Schema.
5. Capability settings and generic MCP declarations produce projection-neutral installation intent.
6. Host adapters infer native transport and render OpenCode/Pi entries.
7. Reconciliation mutates only exact managed entries and adopts divergent entries as operator-owned.

## Rollout

Rename and complete the paused contract-generation slice first, migrate both runtimes second, change MCP projection/reconciliation third, then publish the stable-v1 reference and examples. Release coordinates Python and npm artifacts so no consumer observes a schema/default fingerprint mismatch.

## Verification Contract

Verify runs Python tests; generic-tools tests, typecheck, and build; contract drift checks; source/wheel/npm package checks; and shared cross-runtime fixture comparison. Release remains a separate phase.

## Risks and Controls

- Stale v3 naming: exhaustive symbol/artifact/reference checks plus generation drift tests.
- Generator semantic loss: shared positive/negative fixtures and generation failure for unsupported refinements.
- Package path differences: source, wheel, and npm artifact-loading tests.
- Runtime skew: embedded contract version/fingerprint comparisons.
- Config-v1 versus memory-record-v1 confusion: domain-specific filenames and package assertions.
- Operator intent not applied: deterministic warnings identify preserved host entries and manual remediation.
- Existing developer v2 files: explicit rewrite guidance, without compatibility code.

## Release, Rollback, and Operations

This is an initial coordinated stable-v1 release. Before release, rollback means reverting the implementation branch. No runtime compatibility rollback is provided. No service operation or MCP lifecycle work is required.

## Non-Goals

Config v2/v3 readers or migration code; public compatibility for unreleased contracts; MCP lifecycle ownership; source implementation during Plan; absorbing `hrn-00157`, `hrn-00158`, or `hrn-00159`.
