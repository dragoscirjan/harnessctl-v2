---
id: "00011"
type: task
title: "Add canonical memory contracts and secret screening"
status: done
parent: "00006"
depends: ["00010"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Add canonical memory contracts and secret screening

Given candidate memory records or tombstones
When validated
Then canonical schema, scope, provenance, links, and mandatory secret policy are enforced.

## Technical Requirements

- Define authoritative Zod schemas in `@harnessctl/generic-tools` and infer TypeScript types from them.
- Generate deterministic JSON Schema Draft 2020-12 contracts into the npm package.
- Keep Python validation independent until Python consumes the shared contracts.
- Implement strict YAML parsing, canonical serialization, and link validation.
- Scan every string using field, format, marker, entropy, and deny-pattern checks.

## Acceptance Criteria

- [x] TypeScript runtime validation uses canonical Zod schemas and inferred types.
- [x] Generated JSON contracts stay synchronized through tests.
- [x] Representative secrets fail before mutation.


## Comments

- 2026-08-11: Added canonical schemas/package source, strict runtime validation, YAML safety checks, project scope/provenance rules, and mandatory secret screening with tests.
- 2026-08-12: Replaced committed schema copies with canonical Zod definitions and deterministic npm-packaged JSON Schema generation. Python validation remains intentionally independent.
