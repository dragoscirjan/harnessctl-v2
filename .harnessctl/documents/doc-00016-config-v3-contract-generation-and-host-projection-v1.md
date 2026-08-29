---
id: "doc-00016"
title: "Config v3 Contract, Generation, and Host Projection"
kind: lld
status: approved
version: 1
created_at: "2026-08-29T22:20:13.129Z"
updated_at: "2026-08-29T22:21:00.107Z"
created_by: "OpenCode"
---

# Config v3 Contract, Generation, and Host Projection

## Scope

Specify implementable Config v3 contract generation, runtime consumption, migration errors, generic MCP intent, and adopt-on-edit host reconciliation for Epic `hrn-00160`.

## Canonical Contract

The existing generic-tools schema module evolves to a v3 Zod authority. All field definitions, defaults, enum members, safety constraints, and cross-field refinements are declared there or in one directly owned canonical defaults constant. No Python constant or validator may duplicate them.

The top-level model contains `version: 3`, capability-oriented `skills`, shared `paths`, workflow policy, and generic `mcp` declarations. Capability entries own provider selection and provider-specific values. Exact names and optionality are finalized in the Zod model and reflected verbatim in generated artifacts and documentation.

## Generated Artifacts

Generation emits:

- `config-v3.schema.json`: portable JSON Schema with a stable schema identifier and Config v3 metadata.
- `config-v3.defaults.json`: complete normalized defaults derived from the same TypeScript authority.

Generation is deterministic. A check mode regenerates in memory and fails on byte differences. Package tests verify both artifacts are included in npm and Python distribution layouts. Unsupported Zod semantics cause generation failure; they are not silently omitted or reimplemented in Python.

## Runtime Loading

TypeScript parses YAML with existing duplicate/non-string-key protections, merges canonical defaults, validates with Zod, and returns the normalized v3 type.

Python uses safe YAML parsing, loads generated defaults, performs the same merge semantics, and validates against the generated JSON Schema through a standards-based dependency. Python translates validation paths into stable user-facing errors but does not encode field knowledge.

Shared fixtures cover valid partial documents, fully normalized documents, malformed YAML, unknown/invalid fields, provider branches, tool lists, path safety, and cross-field failures. Each runtime must produce equivalent acceptance and normalization; error prose may differ only where fixtures explicitly permit it.

Missing version, v1, and v2 inputs fail with a Config v3 migration message that references the migration documentation. There is no automatic migration.

## Generic MCP Declarations

Each named server declaration chooses exactly one connection shape:

- URL-oriented values: URL plus optional generic headers/environment-reference values supported by both adapters.
- Command-oriented values: command plus optional arguments, environment, and working/path-oriented values supported by both adapters.

No `type`, `transport`, `http`, `stdio`, `html`, or `cli` discriminator is stored in harness config. Shape validation determines intent. Host adapters select and emit native transport only at projection time. Credentials remain references, never resolved secret values.

Documentation supplies credential-safe examples for known integrations and custom URL/command servers. The declarations do not imply that harnessctl installs or operates servers.

## Host Reconciliation

Reconciliation classifies each same-ID host entry:

- Absent: create the desired generated entry.
- Exact desired: no-op.
- Exact recognized historical/generated value: update or remove as required.
- Any other existing value: adopt as operator-owned, preserve byte-for-byte, warn, and skip mutation.

Operator-owned entries are never overwritten or deleted, including with force. Unrelated host configuration remains byte-preserved. Warnings name the server ID, host target, and manual remediation without exposing environment values or credentials.

Tests cover first creation, idempotence, generated updates, generated removal, historical migration, pre-existing collisions, post-generation edits, normal/force behavior, unrelated-member preservation, and OpenCode/Pi output.

## Implementation Sequence

1. Add v3 Zod/default authority, generators, artifacts, drift and packaging tests.
2. Migrate TypeScript and Python loaders plus shared conformance fixtures.
3. Migrate capability consumers to the v3 normalized model.
4. Add generic MCP declaration validation, intent conversion, host rendering, and adopt-on-edit reconciliation.
5. Update reference, migration guide, examples, and release notes.

## Verification Contract

Build must leave focused unit tests for every component. Verify must run Python tests, generic-tools tests/typecheck/build, contract-generation drift checks, package artifact checks, and cross-runtime fixture comparison. Release is outside this Plan.

## Non-Goals

A v2 reader or migrator; arbitrary host-native MCP fields in harness config; MCP process management; forced overwrite of operator-owned entries; implementation during Plan.
