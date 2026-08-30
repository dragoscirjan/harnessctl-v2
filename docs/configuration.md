# Configuration

Project configuration is `.harnessctl/config.yaml`. The Python installer owns
installer-time loading in [`src/harnessctl/config.py`](../src/harnessctl/config.py).
Generic tools own runtime loading and the portable schema in
[`extensions/generic-tools/config.ts`](../extensions/generic-tools/config.ts) and
[`schemas.ts`](../extensions/generic-tools/schemas.ts).

## Current implementation

Configuration version 1 is current. If the file is absent, readers return a fresh
in-memory copy of defaults and do not create the file. `config_create` creates the
full default file only when absent and never rewrites an existing file. `config_get`
performs a read-only dotted mapping lookup, such as `paths.tasks`.

Every existing file must declare `version: 1`. Missing and non-1 versions fail with
manual stable-v1 rewrite guidance; no compatibility reader or automatic migration exists.
Overlay is recursive for mappings; scalar and array values replace their defaults.
Malformed YAML, unsafe project paths, invalid bounds, and incompatible settings fail
validation. Python loads the generated defaults and JSON Schema produced by the canonical
TypeScript contract.

## Config v1 reference

The generated
[`config-v1.defaults.json`](../extensions/generic-tools/contracts/config-v1.defaults.json)
is the authority for defaults. The generated
[`config-v1.schema.json`](../extensions/generic-tools/contracts/config-v1.schema.json)
is the complete portable validation contract. Every canonical defaulted leaf is listed
below; “none” means that the field is optional and absent from the generated defaults.

| Key                                          | Default                     | Meaning                                                              |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `version`                                    | `1`                         | Required contract version.                                           |
| `paths.root`                                 | `.harnessctl`               | Safe project-relative general artifact root.                         |
| `paths.tasks`                                | `.harnessctl/tasks`         | Safe project-relative task artifact root.                            |
| `paths.reports`                              | `.harnessctl/reports`       | Safe project-relative report root.                                   |
| `workflow.default_task_type`                 | `bug`                       | `initiative`, `epic`, `story`, `task`, or `bug`.                     |
| `mcp.output_limit_mode`                      | `bounded-guidance`          | `bounded-guidance` or `hard`; `hard` is Pi-only at installation.     |
| `mcpServers`                                 | Three explicit declarations | Host-neutral URL or command declarations listed below.               |
| `skills.issues.enabled`                      | `true`                      | Enable the configured Issues capability.                             |
| `skills.issues.root`                         | `.harnessctl/issues`        | Safe project-relative filesystem issue root; ignored remotely.       |
| `skills.issues.prefix`                       | `hrn-`                      | Filesystem issue ID prefix; ignored remotely.                        |
| `skills.issues.provider.type`                | `filesystem`                | Issues authority type.                                               |
| `skills.issues.provider.tools`               | Complete 12-tool local list | Exact filesystem tool set listed below.                              |
| `skills.issues.provider.mcpName`             | none                        | Optional provider MCP association.                                   |
| `skills.documents.enabled`                   | `true`                      | Enable the configured Documents capability.                          |
| `skills.documents.root`                      | `.harnessctl/documents`     | Safe canonical Documents root; custom safe roots are supported.      |
| `skills.documents.prefix`                    | `doc-`                      | Fixed Documents ID prefix.                                           |
| `skills.documents.provider.type`             | `filesystem`                | Documents authority type.                                            |
| `skills.documents.provider.tools`            | Complete 9-tool local list  | Exact filesystem tool set listed below.                              |
| `skills.documents.provider.mcpName`          | none                        | Optional association; local Documents tools do not route through it. |
| `skills.cvs.enabled`                         | `true`                      | Enable CVS guidance and its optional MCP reference.                  |
| `skills.cvs.local`                           | `git`                       | Direct local authority: `git` or `jj`.                               |
| `skills.cvs.provider.type`                   | `github`                    | Remote collaboration provider.                                       |
| `skills.cvs.provider.tools`                  | `gh`                        | Exact provider CLI identifier.                                       |
| `skills.cvs.provider.mcpName`                | `sdlc_cvs_github`           | Optional reference to an explicit `mcpServers` key.                  |
| `skills.cvs.provider.url`                    | `https://github.com`        | Validated collaboration URL.                                         |
| `skills.cvs.provider.token_env`              | `GH_TOKEN`                  | Environment-variable name, never a credential value.                 |
| `skills.caveman.enabled`                     | `true`                      | Enable concise generated guidance.                                   |
| `skills.caveman.mode`                        | `strict`                    | `strict` or `balanced`.                                              |
| `skills.tdd.enabled`                         | `false`                     | Opt in to TDD skill and Build guidance.                              |
| `skills.codeIndex.enabled`                   | `false`                     | Opt in to external code-index retrieval guidance.                    |
| `skills.codeIndex.mcpName`                   | `sdlc_code_index`           | External server name compiled into guidance only.                    |
| `skills.memory.enabled`                      | `false`                     | Enable repository memory guidance and installation.                  |
| `skills.memory.root`                         | `.harnessctl/memory`        | Safe project-relative canonical memory root.                         |
| `skills.memory.backend`                      | `repository`                | Current and only accepted backend.                                   |
| `skills.memory.namespace.organization_id`    | `local`                     | Scope identifier, not authorization.                                 |
| `skills.memory.namespace.project_id`         | `project`                   | Scope identifier, not authorization.                                 |
| `skills.memory.namespace.default_topic`      | `general`                   | Default retrieval topic.                                             |
| `skills.memory.retrieval.limit`              | `8`                         | Result limit from 1 through 100.                                     |
| `skills.memory.retrieval.max_chars`          | `12000`                     | Serialized result bound from 256 through 100000 characters.          |
| `skills.memory.retrieval.include_superseded` | `false`                     | Include inactive history by default.                                 |

The provider fields `type`, `tools`, `url`, `token_env`, and optional `mcpName` are also
canonical under `skills.issues.provider`, `skills.documents.provider`, and
`skills.cvs.provider`. A provider-type change replaces that complete mapping instead of
inheriting fields from the default provider:

| Provider    | `tools`       | `url`                            | `token_env`                                      | `mcpName` |
| ----------- | ------------- | -------------------------------- | ------------------------------------------------ | --------- |
| `github`    | `gh`          | `https://github.com`             | Uppercase name; conventionally `GH_TOKEN`        | Optional  |
| `gitlab`    | `glab`        | `https://gitlab.com`             | Uppercase name; conventionally `GITLAB_TOKEN`    | Optional  |
| `gitea`     | `tea`         | Explicit safe HTTPS instance URL | Uppercase name; conventionally `GITEA_TOKEN`     | Optional  |
| `forgejo`   | `forgejo-cli` | Explicit safe HTTPS instance URL | Uppercase name; conventionally `FORGEJO_TOKEN`   | Optional  |
| `bitbucket` | `git`         | `https://bitbucket.org`          | Uppercase name; conventionally `BITBUCKET_TOKEN` | Optional  |

Every `mcpName` uses the shared server-name grammar: 1 through 64 lowercase ASCII letters,
digits, underscores, or hyphens; the first and last characters must be alphanumeric.
Provider `mcpName` values are optional references for every remote provider. When an enabled
CVS or remote Issues/Documents skill carries one, that exact key must exist in `mcpServers`.
The provider type, URL, and token environment never synthesize MCP transport intent. Omitting
`mcpName` produces CLI-only guidance. Filesystem providers may carry an optional name for
future/local semantics, but it is not required to resolve while the filesystem route is used.

`filesystem` is available to Issues and Documents only and requires the exact tool string
shown in the generated defaults. Provider `type` selects an authority; it is not an MCP
transport discriminator.

### Issue and workflow settings

| Key                                | Default                     | Current meaning                                                              |
| ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `version`                          | `1`                         | Configuration contract version                                               |
| `skills.issues.root`               | `.harnessctl/issues`        | Filesystem-only safe project-relative canonical issue root; ignored remotely |
| `skills.issues.prefix`             | `hrn-`                      | Filesystem-only local ID prefix; ignored remotely                            |
| `skills.issues.provider.type`      | `filesystem`                | `filesystem`, `github`, `gitlab`, `gitea`, `forgejo`, or `bitbucket`         |
| `skills.issues.provider.tools`     | Complete 12-tool local list | Exact provider tooling                                                       |
| `skills.issues.provider.url`       | None                        | Required for Git providers; rejected for filesystem                          |
| `skills.issues.provider.token_env` | None                        | Required provider token environment-variable name                            |
| `skills.documents.root`            | `.harnessctl/documents`     | Safe project-relative canonical Markdown root for filesystem authority       |
| `skills.documents.prefix`          | `doc-`                      | Fixed document ID prefix                                                     |
| `skills.documents.provider.type`   | `filesystem`                | Default local authority; Git providers are also accepted                     |
| `skills.documents.provider.tools`  | Complete 9-tool local list  | Exact provider tooling                                                       |
| `paths.root`                       | `.harnessctl`               | General harnessctl artifact root                                             |
| `paths.tasks`                      | `.harnessctl/tasks`         | Task artifact path                                                           |
| `paths.reports`                    | `.harnessctl/reports`       | Report artifact path                                                         |
| `workflow.default_task_type`       | `bug`                       | Default task classification                                                  |
| `skills.tdd.enabled`               | `false`                     | Opt in to generated TDD skill and Build guidance                             |
| `skills.codeIndex.enabled`         | `false`                     | Opt in to the selected-host SDLC code-index retrieval skill                  |
| `skills.codeIndex.mcpName`         | `sdlc_code_index`           | External MCP server name compiled into the skill as guidance only            |

The default local issue tools are `issue_id`, `issue_create`, `issue_list`,
`issue_get`, `issue_update`, `issue_transition`, `issue_comment`, `issue_relate`,
`issue_unrelate`, `issue_link_document`, `issue_validate`, and `issue_archive`.

A complete default configuration is:

```yaml
version: 1
paths:
  root: .harnessctl
  tasks: .harnessctl/tasks
  reports: .harnessctl/reports
workflow:
  default_task_type: bug
mcp:
  output_limit_mode: bounded-guidance
mcpServers:
  sdlc_cvs_github:
    url: https://api.githubcopilot.com/mcp/
    headers:
      Authorization: Bearer {env:GH_TOKEN}
      X-MCP-Toolsets: repos,issues,pull_requests,actions,git
  sdlc_code_index:
    command: cgc
    args: [mcp, start]
  webcrawl_searchable:
    command: npx
    args:
      - -y
      - >-
        @dragoscirjan/mcp-searchable@latest
skills:
  issues:
    enabled: true
    root: .harnessctl/issues
    prefix: hrn-
    provider:
      type: filesystem
      tools: issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive
  documents:
    enabled: true
    root: .harnessctl/documents
    prefix: doc-
    provider:
      type: filesystem
      tools: document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore
  cvs:
    enabled: true
    local: git
    provider:
      type: github
      tools: gh
      mcpName: sdlc_cvs_github
      url: https://github.com
      token_env: GH_TOKEN
  caveman:
    enabled: true
    mode: strict
  tdd:
    enabled: false
  codeIndex:
    enabled: false
    mcpName: sdlc_code_index
  memory:
    enabled: false
    root: .harnessctl/memory
    backend: repository
    namespace:
      organization_id: local
      project_id: project
      default_topic: general
    retrieval:
      limit: 8
      max_chars: 12000
      include_superseded: false
```

Filesystem configuration rejects Git-provider connection fields.

### Generic MCP declarations

Each `mcpServers.<name>` value has exactly one of these shapes. The following are mandatory
compiler invariants, not defaults:

1. The `mcpServers` map key is the required server name and stable projection identity.
2. Every declaration contains exactly one portable connection core: `url` or `command`.
3. Host overrides may extend a compiled definition but may not replace its portable core or
   adapter-owned translation fields.

`mcpServers.<name>` uses the same 1–64-character server-name grammar as `mcpName`. There are
no provider-reserved IDs: names such as `sdlc_cvs_github` are ordinary explicit declarations.

| Field                       | Default | Contract                                                                        |
| --------------------------- | ------- | ------------------------------------------------------------------------------- |
| `url`                       | none    | Required for a URL declaration; safe absolute HTTPS service URL.                |
| `headers.<header-name>`     | none    | Optional static/template value using explicit `{env:NAME}` references.          |
| `command`                   | none    | Required for a command declaration; nonblank printable executable name or path. |
| `args`                      | none    | Optional array of printable arguments.                                          |
| `environment.<target-name>` | none    | Optional map from process variable name to a source environment-variable name.  |
| `cwd`                       | none    | Optional safe project-relative working directory.                               |
| `opencode`                  | none    | Optional JSON-compatible OpenCode-native extension map.                         |
| `pi`                        | none    | Optional JSON-compatible Pi-native extension map.                               |

Declarations deliberately omit `type` and `transport`. OpenCode and Pi infer host-native
remote or local transport from the presence of `url` or `command` during compilation.
Environment values name source variables. Header values preserve static text and translate
each explicit `{env:NAME}` reference to OpenCode `{env:NAME}` or Pi `${NAME}`. Malformed
placeholders, braces, and control characters are rejected. Harnessctl never reads or writes
credential values.

Portable optional fields remain editable. Host override maps preserve nested JSON strings,
finite numbers, booleans, nulls, arrays, and objects exactly and are copied before rendering.
YAML timestamps and other non-JSON objects, undefined values, non-finite numbers, and control
characters in setting names are rejected. Only the override matching the selected host is
merged into that host's native definition.

Adapter-owned fields are protected even if a caller bypasses normal compilation; the portable
core remains authoritative. OpenCode overrides cannot define `type`, `url`, `command`,
`headers`, `environment`, `cwd`, `auth`, or `oauth`. Pi overrides cannot define `url`,
`command`, `args`, `headers`, `env`, `cwd`, `lifecycle`, `auth`, or `oauth`. Validation reports
the exact protected field path, such as `mcpServers.remote-docs.opencode.url`.

The default registry contains `sdlc_cvs_github`, `sdlc_code_index`, and
`webcrawl_searchable`. The GitHub declaration uses the hosted endpoint, a
`Bearer {env:GH_TOKEN}` Authorization template, and the static toolsets
`repos,issues,pull_requests,actions,git`. An explicit
`mcpServers` mapping replaces that registry rather than merging with it, so `mcpServers: {}`
disables all defaults and a custom mapping contains only the entries the operator declares.
Any enabled skill reference must still resolve after replacement.

Credential-safe custom examples:

```yaml
version: 1
mcpServers:
  remote-docs:
    url: https://mcp.example.com/api
    headers:
      Authorization: Bearer {env:DOCS_MCP_TOKEN}
      X-Mode: static
    opencode:
      enabled: false
      native:
        labels:
          - docs
          - internal
    pi:
      timeout: 5000
  local-index:
    command: npx
    args:
      - -y
      - example-index-mcp
    environment:
      API_TOKEN: INDEX_MCP_TOKEN
    cwd: tools/mcp
    opencode:
      enabled: true
    pi:
      timeout: 7000
```

The host-specific keys above are illustrative and must be supported by the installed host or
adapter version. Harnessctl validates their JSON portability and ownership boundary; it does
not claim that arbitrary future native keys are implemented by a particular host release.

Provider mappings select CLI and generated guidance only. Every projected host definition
comes exclusively from `mcpServers`, which may use URL or command form independently of the
provider. Harnessctl does not install, authenticate, start, stop, monitor, upgrade, or remove
the service, CLI, package, process, or credential.

Exact generic entries first generated by harnessctl remain managed while their host value
still exactly matches recorded provenance. They may be updated or removed when declared
intent changes. A same-ID entry without matching provenance is permanently operator-owned,
including a pre-existing or otherwise unproven entry byte-equivalent to the desired value.
A generated entry whose current host value diverges from its recorded provenance also
becomes permanently operator-owned. Harnessctl byte-preserves every such collision under
normal and `--force` installs, emits an operator-owned warning without declaration or
credential values, and leaves the declaration unapplied; therefore the Config v1 intent and
active host behavior may differ.

To remediate safely, inspect and back up `.opencode/opencode.json` or `.pi/mcp.json`, decide
whether the operator entry or Config v1 declaration is authoritative, and remove or rename
the operator-owned host key manually. Then rerun installation. Do not copy credentials into
YAML or delete a process, package, index, or data store as part of host-key cleanup.

### Documents settings

Documents is independent from Issues and CVS. Its provider defaults to the local filesystem;
Git provider mappings use the same strict provider contract as Issues and CVS. Roots and
prefixes remain safe project-relative identity settings.

```yaml
# Filesystem
version: 1
skills:
  documents:
    enabled: true
    root: .harnessctl/documents
    prefix: doc-
    provider:
      type: filesystem
      tools: document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore
```

The exact tools are `document_id`, `document_create`, `document_list`, `document_get`,
`document_update`, `document_version`, `document_validate`, `document_archive`, and
`document_restore`. See [Documents](documents.md) for lifecycle, legacy compatibility,
cache, and retired-skill cleanup boundaries.

Installation compiles the configured `skills.documents.root` into the OpenCode and Pi
SDLC Plan design guidance. A safe custom root therefore replaces `.harnessctl/documents`
in newly generated `references/plan-design.md` files.

### SDLC code-index settings

`skills.codeIndex.enabled` is a boolean and its default is `false`.
`skills.codeIndex.mcpName` names the explicit `mcpServers` declaration whose live tools the
generated skill may use when enabled. The name must contain 1 through 64 lowercase ASCII
characters, start and end with an alphanumeric character, use only alphanumeric
characters, `_`, or `-` internally; `cvs_` is permitted.
The reference is guidance only; the independent generic declaration controls host projection
and provenance reconciliation. Harnessctl does not install, start, watch, or otherwise manage
the underlying server. When enabled, `work-refresh` may discover
through live schemas and, after fresh exact consent, invoke a supported safe operation
scoped to the current repository. Unsupported capability is reported; configuration does
not grant provider ownership or general lifecycle authority.

An enabled install generates byte-equivalent `sdlc-code-index` skills for the selected
OpenCode and Pi hosts. A fresh disabled install writes no code-index skill. If a selected
host already has the generated path, disabling preserves its exact bytes and warns that
the discoverable file remains active-capable, including the manual removal path.
Harnessctl never deletes it automatically. Enabled, disabled, forced, migration, and
rollback installs leave every existing code-index MCP host entry unchanged.

Code-index capability settings live only under `skills.codeIndex`; `mcpName` remains a
guidance-only reference and grants no ownership. Generic `mcpServers` declarations are
separate projection intents: exact provenance-backed generated entries are managed, while
pre-existing, unproven, or divergent host entries are permanently operator-owned and warn
as described above. See [code intelligence](code-intelligence.md) for lifecycle boundaries.

### TDD settings

`skills.tdd.enabled` is a boolean and its default is `false`. The default preserves
existing Build behavior and does not install a TDD skill. Enable it with a partial
version 1 override:

```yaml
version: 1
skills:
  tdd:
    enabled: true
```

The setting is applied when harnessctl installs the selected host outputs; changing the
file does not toggle an already installed skill at runtime. Enabled installs generate
the canonical `sdlc-develop-tdd` skill for each selected host and compile TDD instructions
into Build and Build-resuming Continue. Disabling the setting and reinstalling compiles
those instructions out but leaves any existing skill untouched and dormant. See
[generated skills](skills.md) for paths and behavior.

### Caveman settings

| Key                      | Default  | Current meaning                             |
| ------------------------ | -------- | ------------------------------------------- |
| `skills.caveman.enabled` | `true`   | Generate the OpenCode caveman skill         |
| `skills.caveman.mode`    | `strict` | `strict` or `balanced` compression guidance |

### Memory settings

| Key                                          | Default              | Current meaning                                             |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| `skills.memory.enabled`                      | `false`              | Enable repository memory guidance and OpenCode installation |
| `skills.memory.backend`                      | `repository`         | Current and only accepted backend                           |
| `skills.memory.namespace.organization_id`    | `local`              | Required local scope identifier, not authorization          |
| `skills.memory.namespace.project_id`         | `project`            | Required project scope identifier, not authorization        |
| `skills.memory.namespace.default_topic`      | `general`            | Default retrieval topic                                     |
| `skills.memory.retrieval.limit`              | `8`                  | Result bound from 1 through 100                             |
| `skills.memory.retrieval.max_chars`          | `12000`              | Serialized result bound from 256 through 100000 characters  |
| `skills.memory.retrieval.include_superseded` | `false`              | Include inactive history by default                         |
| `skills.memory.root`                         | `.harnessctl/memory` | Safe project-relative canonical YAML root                   |

`skills.memory.enabled=true` requires `skills.caveman.enabled=true`.

### CVS and MCP settings

| Key                             | Default              | Current meaning                                                        |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `skills.cvs.local`              | `git`                | Direct local authority: `git` or `jj`; never routed through MCP        |
| `skills.cvs.provider.type`      | `github`             | Independent Git authority                                              |
| `skills.cvs.provider.tools`     | `gh`                 | Exact provider CLI identifier; no arguments or paths                   |
| `skills.cvs.provider.mcpName`   | `sdlc_cvs_github`    | Optional MCP association                                               |
| `skills.cvs.provider.url`       | `https://github.com` | Validated collaboration URL                                            |
| `skills.cvs.provider.token_env` | `GH_TOKEN`           | Environment-variable name only, never a value                          |
| `mcp.output_limit_mode`         | `bounded-guidance`   | `bounded-guidance` or Pi-only `hard`; OpenCode and `all` reject `hard` |

GitHub requires `gh` and `https://github.com`; GitLab requires `glab` and
`https://gitlab.com`; Gitea requires `tea` and an explicit HTTPS URL; Forgejo requires
`forgejo-cli` and an explicit HTTPS URL. Every `token_env` must be an uppercase
environment-variable name. The examples use conventional provider-specific names, but the
schema does not require those exact names. A non-GitHub provider override must specify the
complete provider mapping rather than inherit GitHub fields. The complete provider and
host-format examples are in [CVS and MCP providers](cvs.md).

CVS and Issues are validated independently. Their optional `mcpName` values may reference
the same explicit declaration, but neither domain inherits the other's provider, CLI, URL,
token environment name, authority, or MCP definition.

## Remote issue routing

Provider-aware issue configuration, CLI/MCP capability guidance, MCP projection, and OpenCode
skill generation are implemented. Remote selections require explicit tools instead of
inheriting filesystem defaults:
GitHub uses `gh`, GitLab uses `glab`, Gitea uses `tea`, and Forgejo uses
`forgejo-cli`. Known provider/tool mismatches fail validation.

Every remote selection requires a complete `skills.issues.provider` mapping. The valid
provider CLI capabilities are always enumerated; MCP capabilities are added only when the
optional `mcpName` references an explicit declaration. The agent chooses per
operation before mutation and never switches routes after mutation begins. No
configuration selector or MCP-first precedence applies.
GitHub requires `https://github.com`; GitLab requires `https://gitlab.com`. Gitea and
Forgejo require an explicit operator-selected instance URL. The uppercase token
environment-variable name belongs in YAML; the examples use `GH_TOKEN`, `GITLAB_TOKEN`,
`GITEA_TOKEN`, and `FORGEJO_TOKEN`, but the token value exists only in the process
environment and must never be written to configuration, generated skills, issues, or logs.
`skills.issues.root` and `skills.issues.prefix` are filesystem-only and ignored in remote
mode.

Complete remote provider examples:

```yaml
# GitHub
version: 1
mcpServers:
  sdlc_cvs_github:
    url: https://api.githubcopilot.com/mcp/
    headers:
      Authorization: Bearer {env:GH_TOKEN}
      X-MCP-Toolsets: repos,issues,pull_requests,actions,git
skills:
  issues:
    provider:
      type: github
      tools: gh
      mcpName: sdlc_cvs_github
      url: https://github.com
      token_env: GH_TOKEN
```

```yaml
# GitLab
version: 1
skills:
  issues:
    provider:
      type: gitlab
      tools: glab
      url: https://gitlab.com
      token_env: GITLAB_TOKEN
```

```yaml
# Gitea
version: 1
skills:
  issues:
    provider:
      type: gitea
      tools: tea
      url: https://gitea.example.com
      token_env: GITEA_TOKEN
```

```yaml
# Forgejo
version: 1
skills:
  issues:
    provider:
      type: forgejo
      tools: forgejo-cli
      url: https://forgejo.example.com
      token_env: FORGEJO_TOKEN
```

Replace only the Gitea or Forgejo example host with the real instance URL. These tool
values are executable identifiers, not commands. harnessctl does not install,
authenticate, or invoke a configured CLI. The generated issue-tracking skill instructs the
host agent to use the configured provider's valid CLI and any explicitly referenced MCP
capability. Generic local issue tools fail closed in remote mode instead of mutating YAML.
CLI capability independently depends on the configured provider tool. See
[CVS and MCP providers](cvs.md) for host files, consent, and
security boundaries.
See [issues](issues.md) and [memory](memory.md).

## Initial stable release and evidence

Config v1 is the first stable public configuration contract. Unreleased development Config
v2 and Config v3 files are not supported inputs. Manually rewrite them to the schema above,
including explicit `version: 1`; there is no compatibility reader, fallback, automatic
migration, or in-place converter.

Before the initial stable release, formal Verify must record this evidence matrix. These are
release requirements, not proof that Verify ran during documentation Build:

| Evidence                  | Required check                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python behavior           | `uv run pytest tests/test_config_v1.py tests/test_install.py tests/test_mcp_projection.py tests/test_release_artifacts.py tests/test_docs.py`.                                                |
| Generic-tools behavior    | `npm run test --workspace @harnessctl/generic-tools`, its `typecheck`, and its `build`.                                                                                                       |
| Workspace behavior        | `npm test`, `npm run typecheck:strict`, and `npm run packages:check`.                                                                                                                         |
| Generation drift          | `npm run contracts:check` against both generated contract destinations.                                                                                                                       |
| Package artifacts         | `uv run pytest tests/test_release_artifacts.py` plus `npm run packages:check`; wheel/sdist and npm tarballs must contain matching Config v1 schema, defaults, and fingerprint manifest.       |
| Fingerprints              | Python fingerprint tests and generic-tools Config v1 contract tests recompute SHA-256 and compare `config-v1.fingerprints.json` in source and packaged layouts.                               |
| Shared fixture comparison | Python `tests/test_config_v1.py` and generic-tools `config.spec.ts` execute `tests/fixtures/config-v1-conformance.json` and agree on validity, normalized values, and exact validation paths. |
