---
id: "doc-00016"
title: "Config v1 Contract, Generation, and Host Projection"
kind: lld
status: approved
version: 2
created_at: "2026-08-29T22:20:13.129Z"
updated_at: "2026-08-29T22:44:59.889Z"
created_by: "OpenCode"
---

# Config v1 Contract, Generation, and Host Projection

## Scope

Specify implementable Config v1 contract generation, runtime consumption, version errors, generic MCP intent, and adopt-on-edit host reconciliation for Epic `hrn-00160`.

## Canonical Contract

The generic-tools schema module provides `configV1Schema` and `CONFIG_V1_DEFAULTS` as the Config authority. All field definitions, defaults, enum members, safety constraints, and cross-field refinements are declared there or in one directly owned canonical defaults constant. No Python constant or validator duplicates them.

The top-level model contains explicit `version: 1`, capability-oriented `skills`, shared `paths`, workflow policy, and generic `mcp` declarations. Capability entries own provider selection and provider-specific values. Exact names and optionality are reflected verbatim in generated artifacts and documentation.

Config v2/v3 config schemas, symbols, generated artifacts, fixtures, and documentation are retired rather than retained as compatibility surfaces. `memory-record-v1.schema.json` is independent and remains unchanged.

## Generated Artifacts

Generation emits:

- `config-v1.schema.json`: portable JSON Schema with a stable schema identifier and Config v1 metadata.
- `config-v1.defaults.json`: complete normalized defaults derived from the same TypeScript authority.

Generation is deterministic. Check mode renders in memory and fails on byte differences without rewriting. Matching fingerprints identify schema/default revisions across runtimes. Package tests verify both artifacts in npm and Python layouts and distinguish them from memory-record v1. Unsupported Zod semantics cause generation failure; they are not silently omitted or reimplemented in Python.

## Runtime Loading

TypeScript parses YAML with duplicate/non-string-key protections, merges canonical defaults, validates with Zod, and returns normalized Config v1.

Python uses safe YAML parsing, loads generated defaults, performs matching merge semantics, and validates against generated JSON Schema through a standards-based dependency. Python translates validation paths into stable user-facing errors but encodes no field knowledge.

Shared fixtures cover valid partial documents, fully normalized documents, malformed YAML, missing/non-1 versions, unknown or invalid fields, provider branches, tool lists, path safety, and cross-field failures. Both runtimes produce equivalent acceptance and normalization; error prose may differ only where fixtures explicitly permit it.

Only explicit `version: 1` is accepted. Missing and non-1 inputs fail with a stable-v1 rewrite message referencing configuration documentation. Config v2/v3 are unreleased development inputs and have no automatic migration or compatibility reader.

## Generic MCP Declarations

Each named server declaration chooses exactly one connection shape:

- URL-oriented values: URL plus optional generic headers/environment-reference values supported by both adapters.
- Command-oriented values: command plus optional arguments, environment, and working/path-oriented values supported by both adapters.

No `type`, `transport`, `http`, `stdio`, `html`, or `cli` discriminator is stored in harness config. Shape validation determines intent. Host adapters select and emit native transport only at projection time. Credentials remain references, never resolved secret values.

Documentation supplies credential-safe examples for known integrations and custom URL/command servers. Declarations do not imply that harnessctl installs or operates servers.

## Host Reconciliation

Reconciliation classifies each same-ID host entry:

- Absent: create the desired generated entry.
- Exact desired: no-op.
- Exact recognized historical generated value: update or remove as required.
- Any other existing value: adopt as operator-owned, preserve byte-for-byte, warn, and skip mutation.

Operator-owned entries are never overwritten or deleted, including with force. Unrelated host configuration remains byte-preserved. Warnings name the server ID, host target, and manual remediation without exposing environment values or credentials.

Tests cover first creation, idempotence, generated updates/removal, recognized historical values, pre-existing collisions, post-generation edits, normal/force behavior, unrelated-member preservation, and OpenCode/Pi output.

## Implementation Sequence

1. Rename and complete Config v1 Zod/default authority, generators, artifacts, fingerprints, drift checks, and packaging tests.
2. Migrate TypeScript and Python loaders plus shared conformance fixtures to explicit Config v1.
3. Migrate capability consumers and repository-owned development config/examples to v1.
4. Add generic MCP declaration validation, intent conversion, host rendering, and adopt-on-edit reconciliation.
5. Publish the Config v1 reference, development rewrite note, examples, initial-release notes, and evidence matrix.

## Verification Contract

Build leaves focused tests for every component. Verify runs Python tests; generic-tools tests, typecheck, and build; contract-generation drift checks; package artifact/fingerprint checks; and cross-runtime fixture comparison. Release is outside this Plan.

## Release and Rollback

The release target is the first coordinated stable-v1 Python/npm release. Before release, rollback means reverting the implementation branch. The runtime provides no Config v2/v3 fallback or migration rollback.

## Non-Goals

Config v2/v3 readers or migrators; arbitrary host-native MCP fields in harness config; MCP process management; forced overwrite of operator-owned entries; implementation during Plan.
