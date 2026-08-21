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

| Key                          | Default                     | Current meaning                                                               |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `version`                    | `2`                         | Configuration contract version                                                |
| `issues.root`                | `.harnessctl/issues`        | Filesystem-only safe project-relative canonical issue root; ignored remotely  |
| `issues.prefix`              | `hrn-`                      | Filesystem-only local ID prefix; ignored remotely                             |
| `issues.type`                | `filesystem`                | `filesystem`, `github`, `gitlab`, `gitea`, or `forgejo`                       |
| `issues.tools`               | Complete 12-tool local list | Exact provider tooling: local tool set, `gh`, `glab`, `tea`, or `forgejo-cli` |
| `issues.remote.url`          | None                        | Required for remote providers; rejected for filesystem                        |
| `issues.remote.token_env`    | None                        | Required provider token environment-variable name; rejected for filesystem    |
| `paths.root`                 | `.harnessctl`               | General harnessctl artifact root                                              |
| `paths.tasks`                | `.harnessctl/tasks`         | Task artifact path                                                            |
| `paths.reports`              | `.harnessctl/reports`       | Report artifact path                                                          |
| `workflow.default_task_type` | `bug`                       | Default task classification                                                   |
| `workflow.tdd.enabled`       | `false`                     | Opt in to generated TDD skill and Build guidance                              |

The default local issue tools are `issue_id`, `issue_create`, `issue_list`,
`issue_get`, `issue_update`, `issue_transition`, `issue_comment`, `issue_relate`,
`issue_unrelate`, `issue_link_document`, `issue_validate`, and `issue_archive`.

A complete default configuration is:

```yaml
version: 2
issues:
  type: filesystem
  root: .harnessctl/issues
  prefix: hrn-
  tools: issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive
cvs:
  local: git
  remote:
    provider: github
    tools: gh
    url: https://github.com
    token_env: GH_TOKEN
mcp:
  output_limit_mode: bounded-guidance
paths:
  root: .harnessctl
  tasks: .harnessctl/tasks
  reports: .harnessctl/reports
workflow:
  default_task_type: bug
  tdd:
    enabled: false
communication:
  caveman:
    enabled: true
    mode: strict
memory:
  enabled: false
  backend: repository
  namespace:
    organization_id: local
    project_id: project
    default_topic: general
  retrieval:
    limit: 8
    max_chars: 12000
    include_superseded: false
  repository:
    root: .harnessctl/memory
```

Filesystem configuration rejects `issues.remote`.

### TDD settings

`workflow.tdd.enabled` is a boolean and its default is `false`. The default preserves
existing Build behavior and does not install a TDD skill. Enable it with a partial
version 2 override:

```yaml
workflow:
  tdd:
    enabled: true
```

The setting is applied when harnessctl installs the selected host outputs; changing the
file does not toggle an already installed skill at runtime. Enabled installs generate
the canonical `develop-tdd` skill for each selected host and compile TDD instructions
into Build and Build-resuming Continue. Disabling the setting and reinstalling compiles
those instructions out but leaves any existing skill untouched and dormant. See
[generated skills](skills.md) for paths and behavior.

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

### CVS and MCP settings

| Key                     | Default              | Current meaning                                                             |
| ----------------------- | -------------------- | --------------------------------------------------------------------------- |
| `cvs.local`             | `git`                | Direct local authority: `git` or `jj`; never routed through MCP             |
| `cvs.remote.provider`   | `github`             | Independent remote CVS authority: `github`, `gitlab`, `gitea`, or `forgejo` |
| `cvs.remote.tools`      | `gh`                 | Exact provider CLI identifier; no arguments or paths                        |
| `cvs.remote.url`        | `https://github.com` | Validated collaboration URL                                                 |
| `cvs.remote.token_env`  | `GH_TOKEN`           | Environment-variable name only, never a value                               |
| `mcp.output_limit_mode` | `bounded-guidance`   | `bounded-guidance` or Pi-only `hard`; OpenCode and `all` reject `hard`      |

GitHub requires `gh`, `https://github.com`, and `GH_TOKEN`; GitLab requires
`glab`, `https://gitlab.com`, and `GITLAB_TOKEN`; Gitea requires `tea`, an
explicit HTTPS URL, and `GITEA_TOKEN`; Forgejo requires `forgejo-cli`, an explicit
HTTPS URL, and `FORGEJO_TOKEN`. A non-GitHub provider override must specify the complete
remote branch rather than inherit GitHub fields. The complete provider and host-format
examples are in [CVS and MCP providers](cvs.md).

CVS and Issues are validated independently. Identical MCP definitions may share a fixed
server registration, but neither domain inherits the other's provider, CLI,
URL, token environment name, or authority. Fixed IDs are generated and cannot be
configured.

## Remote issue routing

Provider-aware issue configuration, CLI/MCP capability guidance, MCP projection, and OpenCode
skill generation are implemented. Remote selections require explicit tools instead of
inheriting filesystem defaults:
GitHub uses `gh`, GitLab uses `glab`, Gitea uses `tea`, and Forgejo uses
`forgejo-cli`. Known provider/tool mismatches fail validation.

Every remote selection requires `issues.remote` with `url` and `token_env`. Both the
valid provider CLI capabilities and fixed-ID MCP capabilities are enumerated for the
agent. The agent chooses per operation before mutation and never switches routes after
mutation begins. No configuration selector or MCP-first precedence applies.
GitHub requires `https://github.com` and `GH_TOKEN`; GitLab requires
`https://gitlab.com` and `GITLAB_TOKEN`. Gitea and Forgejo require an explicit
operator-selected instance URL and respectively `GITEA_TOKEN` and `FORGEJO_TOKEN`.
The token environment-variable name belongs in YAML; the token value exists only in
the process environment and must never be written to configuration, generated skills,
issues, or logs. `issues.root` and `issues.prefix` are filesystem-only and ignored in
remote mode.

Complete remote provider examples:

```yaml
# GitHub
version: 2
issues:
  type: github
  tools: gh
  remote:
    url: https://github.com
    token_env: GH_TOKEN
```

```yaml
# GitLab
version: 2
issues:
  type: gitlab
  tools: glab
  remote:
    url: https://gitlab.com
    token_env: GITLAB_TOKEN
```

```yaml
# Gitea
version: 2
issues:
  type: gitea
  tools: tea
  remote:
    url: https://gitea.example.com
    token_env: GITEA_TOKEN
```

```yaml
# Forgejo
version: 2
issues:
  type: forgejo
  tools: forgejo-cli
  remote:
    url: https://forgejo.example.com
    token_env: FORGEJO_TOKEN
```

Replace only the Gitea or Forgejo example host with the real instance URL. These tool
values are executable identifiers, not commands. harnessctl does not install,
authenticate, or invoke a configured CLI. The generated issue-tracking skill instructs the host agent to use
the configured provider's valid CLI/MCP capabilities and remote endpoint. Generic local issue tools fail closed
in remote mode instead of mutating YAML. For Gitea and Forgejo, MCP capability depends
on `forgejo-mcp` executable availability; CLI capability independently depends on `tea`
or `forgejo-cli`. See [CVS and MCP providers](cvs.md) for host files, consent, and
security boundaries.
See [issues](issues.md). Future memory shapes are documented separately in
[memory](memory.md); all remain invalid today.
