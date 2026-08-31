# Config Schema

Use this page to look up an exact Config v1 field after choosing the behavior you need in the [Config File guide](configuration.md). The tables follow the YAML object hierarchy; dotted paths appear only in cross-field rules and error examples.

Every object is closed: properties not listed for that object are rejected. Project files may omit defaulted values because Harnessctl merges the file over the generated defaults before validation.

## Minimal file

```yaml
version: 1
```

## Config

The project configuration root.

| Property     | Required | Type        | Default            | Description                                                    | Constraint                       |
| ------------ | -------- | ----------- | ------------------ | -------------------------------------------------------------- | -------------------------------- |
| `version`    | Yes      | literal `1` | `1`                | Config contract version. Config v1 is the only accepted value. | Exactly `1`.                     |
| `paths`      | Yes      | object      | Object shown below | Shared repository paths used by Harnessctl.                    | Unknown properties are rejected. |
| `workflow`   | Yes      | object      | Object shown below | Defaults for SDLC work creation.                               | Unknown properties are rejected. |
| `mcp`        | Yes      | object      | Object shown below | Shared MCP response behavior.                                  | Unknown properties are rejected. |
| `mcpServers` | Yes      | object      | Object shown below | Complete registry of portable MCP connection declarations.     | See the selected object shape.   |
| `skills`     | Yes      | object      | Object shown below | Capability-specific configuration.                             | Unknown properties are rejected. |

## Paths

Repository-local authority and report locations.

| Property  | Required | Type   | Default                 | Description                                    | Constraint                             |
| --------- | -------- | ------ | ----------------------- | ---------------------------------------------- | -------------------------------------- |
| `root`    | Yes      | string | `".harnessctl"`         | Root for Harnessctl-managed project authority. | Safe, non-empty project-relative path. |
| `tasks`   | Yes      | string | `".harnessctl/tasks"`   | Directory for task artifacts.                  | Safe, non-empty project-relative path. |
| `reports` | Yes      | string | `".harnessctl/reports"` | Directory for generated reports.               | Safe, non-empty project-relative path. |

## Workflow

Defaults used when creating SDLC work.

| Property            | Required | Type | Default | Description                                                    | Constraint                                           |
| ------------------- | -------- | ---- | ------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `default_task_type` | Yes      | enum | `"bug"` | Issue type used when a command needs a default work item type. | One of `initiative`, `epic`, `story`, `task`, `bug`. |

## MCP output

Shared behavior for MCP responses.

| Property            | Required | Type | Default              | Description                                       | Constraint                         |
| ------------------- | -------- | ---- | -------------------- | ------------------------------------------------- | ---------------------------------- |
| `output_limit_mode` | Yes      | enum | `"bounded-guidance"` | How MCP output limits are communicated to agents. | One of `bounded-guidance`, `hard`. |

## MCP servers

A registry keyed by server identity. Each declaration uses either the URL shape or the command shape.

| Property      | Required            | Type            | Default               | Description                                                              | Constraint                                                                |
| ------------- | ------------------- | --------------- | --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `url`         | URL declaration     | string          | Varies by declaration | HTTPS endpoint for a remote MCP server.                                  | Safe HTTPS URL without embedded credentials.                              |
| `headers`     | No                  | object          | Varies by declaration | HTTP headers; values may contain `{env:NAME}` placeholders.              | Valid header names; literal text or `{env:UPPER_CASE_NAME}` placeholders. |
| `command`     | Command declaration | string          | Varies by declaration | Executable for a local MCP server.                                       | See the selected object shape.                                            |
| `args`        | No                  | array of string | Varies by declaration | Arguments passed to the local MCP executable.                            | See the selected object shape.                                            |
| `environment` | No                  | object          | Varies by declaration | Maps process variables to operator environment-variable names.           | Variable names map to upper-case environment-variable names.              |
| `cwd`         | No                  | string          | Varies by declaration | Optional project-relative working directory for the command.             | Safe, non-empty project-relative path.                                    |
| `opencode`    | No                  | JSON value      | Varies by declaration | JSON-compatible OpenCode settings that do not replace connection fields. | See the selected object shape.                                            |
| `pi`          | No                  | JSON value      | Varies by declaration | JSON-compatible Pi settings that do not replace connection fields.       | See the selected object shape.                                            |

## Skills

Configuration domains compiled into Harnessctl guidance.

| Property       | Required | Type   | Default            | Description                                             | Constraint                       |
| -------------- | -------- | ------ | ------------------ | ------------------------------------------------------- | -------------------------------- |
| `issues`       | Yes      | object | Object shown below | Issue authority, naming, tools, and provider.           | Unknown properties are rejected. |
| `documents`    | Yes      | object | Object shown below | Design-document authority, naming, tools, and provider. | Unknown properties are rejected. |
| `cvs`          | Yes      | object | Object shown below | Local version control and remote collaboration route.   | Unknown properties are rejected. |
| `caveman`      | Yes      | object | Object shown below | Concise-response behavior used by generated guidance.   | Unknown properties are rejected. |
| `tdd`          | Yes      | object | Object shown below | Red-Green-Refactor guidance availability.               | Unknown properties are rejected. |
| `codeIndex`    | Yes      | object | Object shown below | Relationship-aware code retrieval guidance.             | Unknown properties are rejected. |
| `webRetrieval` | Yes      | object | Object shown below | Researched web retrieval guidance.                      | Unknown properties are rejected. |
| `memory`       | Yes      | object | Object shown below | Repository-backed shared memory behavior.               | Unknown properties are rejected. |

### Issues

Issue authority and provider selection.

| Property   | Required | Type           | Default                | Description                                  | Constraint                             |
| ---------- | -------- | -------------- | ---------------------- | -------------------------------------------- | -------------------------------------- |
| `enabled`  | Yes      | boolean        | `true`                 | Whether issue-tracking guidance is active.   | See the selected object shape.         |
| `root`     | Yes      | string         | `".harnessctl/issues"` | Canonical filesystem issue root.             | Safe, non-empty project-relative path. |
| `prefix`   | Yes      | string         | `"hrn-"`               | Prefix used for generated issue IDs.         | Letters, numbers, `_`, or `-`.         |
| `provider` | Yes      | provider union | Object shown below     | Filesystem or remote issue provider mapping. | See the selected object shape.         |

### Issue provider

Choose filesystem storage or one supported remote collaboration provider.

| Property    | Required            | Type                      | Default                                                                                                                                                                 | Description                                                     | Constraint                                                                                                                                                                                                               |
| ----------- | ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`      | Yes                 | provider-specific literal | `"filesystem"`                                                                                                                                                          | Selected provider identity.                                     | One of `filesystem`, `github`, `gitlab`, `gitea`, `forgejo`, `bitbucket`.                                                                                                                                                |
| `tools`     | Yes                 | provider-specific literal | `"issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive"` | Exact CLI or normalized tool capability list for that provider. | One of `issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive`, `gh`, `glab`, `tea`, `forgejo-cli`, `git`. |
| `mcpName`   | No                  | string                    | No default                                                                                                                                                              | Optional MCP registry key used by the provider route.           | 1-64 lower-case letters, numbers, `_`, or `-`; alphanumeric ends.                                                                                                                                                        |
| `url`       | Depends on provider | string                    | No default                                                                                                                                                              | Provider service URL.                                           | Provider-specific safe HTTPS URL without embedded credentials.                                                                                                                                                           |
| `token_env` | Depends on provider | string                    | No default                                                                                                                                                              | Name of the environment variable containing the credential.     | Upper-case environment-variable name.                                                                                                                                                                                    |

### Documents

Canonical design-document authority.

| Property   | Required | Type             | Default                   | Description                                  | Constraint                             |
| ---------- | -------- | ---------------- | ------------------------- | -------------------------------------------- | -------------------------------------- |
| `enabled`  | Yes      | boolean          | `true`                    | Whether document guidance is active.         | See the selected object shape.         |
| `root`     | Yes      | string           | `".harnessctl/documents"` | Canonical filesystem document root.          | Safe, non-empty project-relative path. |
| `prefix`   | Yes      | literal `"doc-"` | `"doc-"`                  | Fixed prefix used for document IDs.          | Exactly `"doc-"`.                      |
| `provider` | Yes      | provider union   | Object shown below        | Filesystem or provider-owned document route. | See the selected object shape.         |

### Document provider

Choose filesystem storage or a provider-owned remote route.

| Property    | Required            | Type                      | Default                                                                                                                                         | Description                                                     | Constraint                                                                                                                                                                                       |
| ----------- | ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`      | Yes                 | provider-specific literal | `"filesystem"`                                                                                                                                  | Selected provider identity.                                     | One of `filesystem`, `github`, `gitlab`, `gitea`, `forgejo`, `bitbucket`.                                                                                                                        |
| `tools`     | Yes                 | provider-specific literal | `"document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore"` | Exact CLI or normalized tool capability list for that provider. | One of `document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore`, `gh`, `glab`, `tea`, `forgejo-cli`, `git`. |
| `mcpName`   | No                  | string                    | No default                                                                                                                                      | Optional MCP registry key used by the provider route.           | 1-64 lower-case letters, numbers, `_`, or `-`; alphanumeric ends.                                                                                                                                |
| `url`       | Depends on provider | string                    | No default                                                                                                                                      | Provider service URL.                                           | Provider-specific safe HTTPS URL without embedded credentials.                                                                                                                                   |
| `token_env` | Depends on provider | string                    | No default                                                                                                                                      | Name of the environment variable containing the credential.     | Upper-case environment-variable name.                                                                                                                                                            |

### CVS

Local version control and remote collaboration provider.

| Property   | Required | Type    | Default            | Description                              | Constraint                     |
| ---------- | -------- | ------- | ------------------ | ---------------------------------------- | ------------------------------ |
| `enabled`  | Yes      | boolean | `true`             | Whether CVS guidance is active.          | See the selected object shape. |
| `local`    | Yes      | enum    | `"git"`            | Local version-control executable family. | One of `git`, `jj`.            |
| `provider` | Yes      | object  | Object shown below | Remote collaboration provider mapping.   | See the selected object shape. |

### CVS provider

Choose one remote collaboration provider.

| Property    | Required | Type                      | Default                | Description                                                     | Constraint                                                        |
| ----------- | -------- | ------------------------- | ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `type`      | Yes      | provider-specific literal | `"github"`             | Selected provider identity.                                     | One of `github`, `gitlab`, `gitea`, `forgejo`, `bitbucket`.       |
| `tools`     | Yes      | provider-specific literal | `"gh"`                 | Exact CLI or normalized tool capability list for that provider. | One of `gh`, `glab`, `tea`, `forgejo-cli`, `git`.                 |
| `mcpName`   | No       | string                    | `"sdlc_cvs_github"`    | Optional MCP registry key used by the provider route.           | 1-64 lower-case letters, numbers, `_`, or `-`; alphanumeric ends. |
| `url`       | Yes      | string                    | `"https://github.com"` | Provider service URL.                                           | Provider-specific safe HTTPS URL without embedded credentials.    |
| `token_env` | Yes      | string                    | `"GH_TOKEN"`           | Name of the environment variable containing the credential.     | Upper-case environment-variable name.                             |

### Caveman

Controls concise-response guidance.

| Property  | Required | Type    | Default    | Description                                  | Constraint                     |
| --------- | -------- | ------- | ---------- | -------------------------------------------- | ------------------------------ |
| `enabled` | Yes      | boolean | `true`     | Whether concise-response guidance is active. | See the selected object shape. |
| `mode`    | Yes      | enum    | `"strict"` | Strict or balanced compression policy.       | One of `strict`, `balanced`.   |

### TDD

Controls availability of Red-Green-Refactor guidance.

| Property  | Required | Type    | Default | Description                                      | Constraint                     |
| --------- | -------- | ------- | ------- | ------------------------------------------------ | ------------------------------ |
| `enabled` | Yes      | boolean | `false` | Whether TDD guidance is installed and available. | See the selected object shape. |

### Code Index

Selects advisory relationship-aware retrieval.

| Property  | Required | Type    | Default             | Description                                     | Constraint                                                        |
| --------- | -------- | ------- | ------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `enabled` | Yes      | boolean | `false`             | Whether code-index guidance may be loaded.      | See the selected object shape.                                    |
| `mcpName` | Yes      | string  | `"sdlc_code_index"` | MCP registry key used for code-index retrieval. | 1-64 lower-case letters, numbers, `_`, or `-`; alphanumeric ends. |

### Web Retrieval

Selects advisory researched web retrieval.

| Property  | Required | Type                       | Default            | Description                                    | Constraint                     |
| --------- | -------- | -------------------------- | ------------------ | ---------------------------------------------- | ------------------------------ |
| `enabled` | Yes      | boolean                    | `false`            | Whether web-retrieval guidance may be loaded.  | See the selected object shape. |
| `mcpName` | Yes      | literal `"sdlc_web_crawl"` | `"sdlc_web_crawl"` | Fixed MCP registry key used for web retrieval. | Exactly `sdlc_web_crawl`.      |

### Memory

Configures repository-backed shared project memory.

| Property    | Required | Type                   | Default                | Description                                              | Constraint                             |
| ----------- | -------- | ---------------------- | ---------------------- | -------------------------------------------------------- | -------------------------------------- |
| `enabled`   | Yes      | boolean                | `false`                | Whether repository memory participates in SDLC commands. | See the selected object shape.         |
| `root`      | Yes      | string                 | `".harnessctl/memory"` | Canonical repository memory root.                        | Safe, non-empty project-relative path. |
| `backend`   | Yes      | literal `"repository"` | `"repository"`         | Current canonical memory backend.                        | Exactly `repository`.                  |
| `namespace` | Yes      | object                 | Object shown below     | Organization, project, and default-topic scope.          | Unknown properties are rejected.       |
| `retrieval` | Yes      | object                 | Object shown below     | Query result and serialization bounds.                   | Unknown properties are rejected.       |

### Memory namespace

Scopes reusable records.

| Property          | Required | Type   | Default     | Description                                  | Constraint      |
| ----------------- | -------- | ------ | ----------- | -------------------------------------------- | --------------- |
| `organization_id` | Yes      | string | `"local"`   | Stable organization scope for records.       | Non-empty text. |
| `project_id`      | Yes      | string | `"project"` | Stable project scope for records.            | Non-empty text. |
| `default_topic`   | Yes      | string | `"general"` | Topic used when a write does not supply one. | Non-empty text. |

### Memory retrieval

Bounds each memory query.

| Property             | Required | Type    | Default | Description                                          | Constraint                       |
| -------------------- | -------- | ------- | ------- | ---------------------------------------------------- | -------------------------------- |
| `limit`              | Yes      | integer | `8`     | Maximum records returned by one query.               | Integer from 1 through 100.      |
| `max_chars`          | Yes      | integer | `12000` | Maximum serialized characters returned by one query. | Integer from 256 through 100000. |
| `include_superseded` | Yes      | boolean | `false` | Whether queries include inactive record history.     | See the selected object shape.   |

## Cross-field rules

- Enabling Memory requires `skills.caveman.enabled: true`.
- Every enabled CVS, remote Issues, remote Documents, Code Index, or Web Retrieval MCP reference must name a key in the effective `mcpServers` registry.
- Supplying `mcpServers` replaces the default registry; it does not deep-merge declarations.
- Changing a provider `type` replaces that provider mapping, so all required fields for the new provider must be supplied.
- Host overrides must be JSON-compatible and cannot replace adapter-owned connection or authentication fields.

## Provider shapes

Issues and Documents accept `filesystem`, `github`, `gitlab`, `gitea`, `forgejo`, or `bitbucket`. CVS accepts the five remote collaboration providers. `tools`, URL, and required credential environment name are fixed or constrained by the selected provider; `mcpName` is optional where supported. Bitbucket is CLI-only.

See [Issues](issues.md), [Documents](documents.md), and [CVS](cvs.md) for complete provider examples and operational boundaries.

## Source and freshness

The hand-maintained [Config v1 contract](../extensions/generic-tools/schemas.ts) generates the [JSON Schema](../extensions/generic-tools/contracts/config-v1.schema.json), [defaults](../extensions/generic-tools/contracts/config-v1.defaults.json), and fingerprint manifest. This page is generated from the schema and defaults; documentation checks fail when its property or description coverage becomes stale.
