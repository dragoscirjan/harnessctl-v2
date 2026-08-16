# Configuration

Project configuration is `.harnessctl/config.yaml`. The Python installer owns
installer-time loading in [`src/harnessctl/config.py`](../src/harnessctl/config.py).
Generic tools own runtime loading and the portable schema in
[`extensions/generic-tools/config.ts`](../extensions/generic-tools/config.ts) and
[`schemas.ts`](../extensions/generic-tools/schemas.ts).

## Current implementation

Configuration version 2 is current. If the file is absent, readers return a fresh
in-memory copy of defaults and do not create the file. `config_create` creates the
full default file only when absent and never rewrites an existing file. `config_get`
performs a read-only dotted mapping lookup, such as `paths.tasks`.

Version 1, a missing version, and partial version 2 mappings migrate in memory to
version 2. Overlay is recursive for mappings; scalar and array values replace their
defaults. Malformed YAML, unsupported versions, unsafe project paths, invalid bounds,
and incompatible settings fail validation. Python and TypeScript defaults are kept in
parallel; the generated JSON contract comes from the TypeScript runtime schema.

### Issue and workflow settings

| Key                          | Default                     | Current meaning                                                                             |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `version`                    | `2`                         | Configuration contract version                                                              |
| `issues.root`                | `.harnessctl/issues`        | Safe project-relative canonical issue root                                                  |
| `issues.prefix`              | `hrn-`                      | Local ID prefix; ASCII letters, digits, underscores, and hyphens only                       |
| `issues.type`                | `filesystem`                | `filesystem`, `github`, `gitlab`, `gitea`, or `forgejo`                                     |
| `issues.tools`               | Complete 12-tool local list | Exact provider tooling: local tool set, `gh`, `glab`, `tea`, or one safe Forgejo executable |
| `paths.root`                 | `.harnessctl`               | General harnessctl artifact root                                                            |
| `paths.tasks`                | `.harnessctl/tasks`         | Task artifact path                                                                          |
| `paths.reports`              | `.harnessctl/reports`       | Report artifact path                                                                        |
| `workflow.default_task_type` | `bug`                       | Default task classification                                                                 |

The default local issue tools are `issue_id`, `issue_create`, `issue_list`,
`issue_get`, `issue_update`, `issue_transition`, `issue_comment`, `issue_relate`,
`issue_unrelate`, `issue_link_document`, `issue_validate`, and `issue_archive`.

### Caveman settings

| Key                             | Default  | Current meaning                             |
| ------------------------------- | -------- | ------------------------------------------- |
| `communication.caveman.enabled` | `true`   | Generate the OpenCode caveman skill         |
| `communication.caveman.mode`    | `strict` | `strict` or `balanced` compression guidance |

### Memory settings

| Key                                   | Default              | Current meaning                                             |
| ------------------------------------- | -------------------- | ----------------------------------------------------------- |
| `memory.enabled`                      | `false`              | Enable repository memory guidance and OpenCode installation |
| `memory.backend`                      | `repository`         | Current and only accepted backend                           |
| `memory.namespace.organization_id`    | `local`              | Required local scope identifier, not authorization          |
| `memory.namespace.project_id`         | `project`            | Required project scope identifier, not authorization        |
| `memory.namespace.default_topic`      | `general`            | Default retrieval topic                                     |
| `memory.retrieval.limit`              | `8`                  | Result bound from 1 through 100                             |
| `memory.retrieval.max_chars`          | `12000`              | Serialized result bound from 256 through 100000 characters  |
| `memory.retrieval.include_superseded` | `false`              | Include inactive history by default                         |
| `memory.repository.root`              | `.harnessctl/memory` | Safe project-relative canonical YAML root                   |

`memory.enabled=true` requires caveman to be enabled. The retired
`memory.repository.cache` input is temporarily tolerated by TypeScript for
compatibility, but it is unused and not generated; do not configure it.

## Remote issue routing

Provider-aware issue configuration and OpenCode skill generation are implemented.
Remote selections require explicit tools instead of inheriting filesystem defaults:
GitHub uses `gh`, GitLab uses `glab`, Gitea uses `tea`, and Forgejo accepts one
operator-selected safe executable. Known provider/tool mismatches fail validation.

These values are executable identifiers, not commands. The contract excludes
arguments, URLs, assignments, repository coordinates, tokens, passwords, and login
state. harnessctl does not install, authenticate, or invoke a configured CLI. The
generated issue-tracking skill instructs the host agent to use the operator-managed
CLI. Generic local issue tools fail closed in remote mode instead of mutating YAML.
See [issues](issues.md). Future memory shapes are documented separately in
[memory](memory.md); all remain invalid today.
