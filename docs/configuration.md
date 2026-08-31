# Config File

Use `.harnessctl/config.yaml` to choose how Harnessctl runs the SDLC in this
repository: where authority is stored, which workflow defaults apply, which
capabilities are enabled, and which local or remote providers they use.

You only need to include settings that differ from the defaults. Every file starts
with `version: 1`.

## Start with the change you need

| I want to...                             | Configure                    | Details                            |
| ---------------------------------------- | ---------------------------- | ---------------------------------- |
| Change the default work item type        | `workflow.default_task_type` | This page                          |
| Enable test-driven development           | `skills.tdd`                 | [TDD](tdd.md)                      |
| Enable shared project memory             | `skills.memory`              | [Memory](memory.md)                |
| Enable relationship-aware code retrieval | `skills.codeIndex`           | [Code Index](code-intelligence.md) |
| Enable researched web retrieval          | `skills.webRetrieval`        | [Web Retrieval](web-retrieval.md)  |
| Change issue storage or provider         | `skills.issues`              | [Issues](issues.md)                |
| Change document storage                  | `skills.documents`           | [Documents](documents.md)          |
| Change version control or forge          | `skills.cvs`                 | [CVS](cvs.md)                      |
| Change concise-response behavior         | `skills.caveman`             | [Caveman](caveman.md)              |
| Add or replace an MCP declaration        | `mcpServers`                 | [Config Schema](config-schema.md)  |

The [Config Schema](config-schema.md) is the complete field and default reference.
Use this page when deciding what to put in a project file.

## Common recipes

### Change the default work item

Plan-created work defaults to a Bug. Choose another supported issue type when your
repository usually starts elsewhere:

```yaml
version: 1
workflow:
  default_task_type: story
```

Valid values are `initiative`, `epic`, `story`, `task`, and `bug`.

### Enable TDD

```yaml
version: 1
skills:
  tdd:
    enabled: true
```

This makes the TDD guidance available during Build. It does not run tests or choose
TDD for work that did not request it. See [TDD](tdd.md).

### Enable project memory

```yaml
version: 1
skills:
  memory:
    enabled: true
    namespace:
      project_id: payments-api
```

Memory requires Caveman mode so reusable records remain concise. The default Caveman
configuration already satisfies that requirement. See [Memory](memory.md).

### Enable code and web retrieval

```yaml
version: 1
skills:
  codeIndex:
    enabled: true
  webRetrieval:
    enabled: true
```

The default MCP registry contains the server names referenced by both settings. If
you replace `mcpServers`, declare those names in the replacement registry too. These
capabilities provide advisory evidence; they do not replace repository authority.

### Use GitLab for issues

Changing a provider type requires the complete provider mapping:

```yaml
version: 1
skills:
  issues:
    provider:
      type: gitlab
      tools: glab
      url: https://gitlab.com
      token_env: GITLAB_TOKEN
```

The YAML stores only the environment-variable name. Put the credential value in the
operator-managed process environment. See [Issues](issues.md) for every provider and
its routing boundaries.

### Move repository authority

```yaml
version: 1
paths:
  tasks: project/tasks
  reports: project/reports
skills:
  issues:
    root: project/issues
  documents:
    root: project/documents
```

Paths must be safe, project-relative paths. Moving a configured root does not migrate
existing files.

## Create and inspect the file

When no file exists, Harnessctl uses a fresh in-memory copy of the generated defaults
without writing anything. The `config_create` tool writes the complete default file only
when it is absent and never overwrites an existing file. The read-only `config_get` tool
looks up a dotted path such as `skills.tdd.enabled`.

You can also create `.harnessctl/config.yaml` directly with a minimal overlay:

```yaml
version: 1
skills:
  tdd:
    enabled: true
```

## How overrides work

Mappings merge recursively with the defaults. Scalars and arrays replace their default
values. Two boundaries deliberately replace more:

- Supplying `mcpServers` replaces the complete default registry. `mcpServers: {}`
  disables all default declarations.
- Changing a skill provider's `type` replaces the complete provider mapping. Include
  every required field for the new provider.

Config v1 is the only supported contract. Existing files require a numeric `version: 1`;
Harnessctl does not migrate or repair another version.

## When configuration is rejected

Harnessctl rejects malformed YAML, duplicate keys, unknown settings, unsafe paths,
invalid limits, credential values where names are expected, and enabled capabilities
whose MCP names are missing from the effective registry. Errors identify the deepest
available dotted path without printing the complete configuration.

Check the [Config Schema](config-schema.md) for the accepted type, default, and constraint,
then check the relevant Skill Configuration page for operational meaning. Configuration
declares intent; generated host output and successful external-provider operation are
separate evidence.

## Credentials

Keep credential values out of YAML. Store an environment-variable name such as
`GH_TOKEN`, or an explicit placeholder such as `{env:GH_TOKEN}` where the field accepts
one. Harnessctl does not read, render, log, snapshot, or persist the credential value.

## Know what each layer proves

Configuration and operation are separate evidence:

| Layer                    | What it proves                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| Declared Config          | The intent recorded in `.harnessctl/config.yaml`.                      |
| Generated reference      | The accepted Config v1 shape and defaults at generation time.          |
| Generated harness output | The settings Harnessctl projected into a supported coding harness.     |
| Harness registration     | The harness has a command, skill, or MCP declaration available.        |
| External provider state  | The provider or MCP server is installed, reachable, and authenticated. |
| Verified operation       | A current check exercised the configured route successfully.           |

One layer does not imply the next. In particular, a valid declaration or generated
harness entry does not prove that an external provider is available or working.

## Source authority

The current Config v1 contract and generated defaults are linked from the
[Config Schema](config-schema.md). Documentation explains how to use those contracts but
does not replace them.
