---
id: ""
type: lld
title: "Generic Configuration Tools and Harness Adapters"
version: 1
status: draft
parent: "00001"
opencode-agent: lead-engineer
---

# Generic Configuration Tools and Harness Adapters

## Status

Draft — awaiting user approval before implementation.

## Objective

Replace the temporary `.env.ai` OpenCode tools with a small harness-neutral
configuration layer and two host adapters:

```text
extensions/
├── generic-tools/                  # @harnessctl/generic-tools
├── opencode-tools/                 # @harnessctl/opencode-tools
└── pi-tools/                       # @harnessctl/pi-tools
```

The generic package owns configuration behavior. The OpenCode and Pi packages
only adapt that behavior to their host tool-registration APIs.

## Scope

### In scope

- `config-create`: create `.harnessctl/config.yaml` when absent.
- `config-get`: read the configuration or resolve a dotted path such as
  `paths.tasks` or `workflow.default_task_type`.
- A default configuration matching the PRD's `.harnessctl/config.yaml`
  convention.
- YAML parsing and serialization in the generic package.
- OpenCode tool registration in `extensions/opencode-tools/index.ts`.
- Pi extension registration in `extensions/pi-tools/index.ts`, using the
  installed Pi extension API.
- Unit tests for generic creation, parsing, path lookup, missing files, and
  existing-file protection.

### Out of scope

- Task lifecycle implementation.
- `models.yaml`, `policy.yaml`, `workflow.yaml`, or other artifact files.
- Environment-variable compatibility tools.
- Installer/upgrade behavior beyond the reusable create operation.
- OpenCode/Pi workflow logic.

## Package responsibilities

### `@harnessctl/generic-tools`

Owns pure and filesystem-backed functions. It must not import either host SDK.

Proposed exports:

```ts
createConfig(cwd: string): string
readConfig(cwd: string): ConfigDocument | ConfigError
getConfigValue(cwd: string, path: string): unknown | ConfigError
parseConfig(content: string): ConfigDocument
```

The package also exposes the default YAML content/schema used by
`createConfig`.

### `@harnessctl/opencode-tools`

Imports `@harnessctl/generic-tools` and `@opencode-ai/plugin`. It registers:

- `config_create`
- `config_get`

The host adapter passes the OpenCode tool context directory to generic
functions and returns their human-readable result.

### `@harnessctl/pi-tools`

Imports `@harnessctl/generic-tools` and
`@earendil-works/pi-coding-agent`. It registers equivalent host tools using
the Pi extension API. No generic behavior is duplicated here.

## Configuration contract

The first default `.harnessctl/config.yaml` is intentionally small:

```yaml
version: 1
paths:
  root: .harnessctl
  tasks: .harnessctl/tasks
  reports: .harnessctl/reports
workflow:
  default_task_type: bug
```

`harness` is a project default and may be changed by the user. Adapters must
not silently rewrite an existing file.

`config-get` resolves only mappings through dot-separated keys. Array indexing,
wildcards, expressions, and mutation are not part of the first contract.
Missing files, malformed YAML, empty paths, and missing keys return explicit
errors rather than throwing for normal user input.

## Dependency direction

```text
generic-tools
    ▲             ▲
    │             │
opencode-tools  pi-tools
```

The generic package depends on a small YAML library. Host SDKs remain in their
respective adapter packages. Generic tests must run without either host SDK.

## File layout

```text
extensions/generic-tools/
├── package.json
├── index.ts
├── config.ts
└── config.test.ts

extensions/opencode-tools/
├── package.json
├── index.ts
└── tools/
    └── config-tools.ts

extensions/pi-tools/
├── package.json
└── index.ts
```

The existing `extensions/opencode-harnessctl` and `extensions/pi-harnessctl`
scaffolds are replaced by the new package names rather than retained as
duplicate adapters.

## Validation

Root validation follows the existing npm workspace pattern:

```text
npm run lint
npm run format
npm run dupcheck
npm run test
npm run typecheck
```

Required behavior tests:

1. Create defaults in a new project.
2. Do not overwrite an existing config.
3. Read the complete YAML document.
4. Resolve a nested dotted path.
5. Resolve scalar, mapping, and empty values correctly.
6. Report missing keys and missing files.
7. Report malformed YAML.
8. Register both tools in each host adapter without duplicating config logic.

## Resolved decision

The generated configuration is harness-neutral. It does not include a
`harness: opencode` field. The selected host adapter is determined by the
installed extension rather than persisted as a project-wide configuration
value.
