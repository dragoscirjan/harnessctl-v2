# MCP Servers

Harnessctl can project declared Model Context Protocol (MCP) servers into selected
agent harnesses and generate skills that route work to them. This catalog explains the
current named server contracts, what Harnessctl owns, and what remains the operator's
responsibility.

## How a declaration becomes a result

An MCP declaration is only the first step. Keep these states separate when diagnosing a
server:

| State                | What it means                                                                     | What it does not prove                                   |
| -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Declared             | Config v1 contains a URL or command under `mcpServers`.                           | The selected harness contains the server.                |
| Registered           | Harnessctl projected that declaration into a selected harness.                    | The provider started or accepted credentials.            |
| Routed               | An enabled generated skill names the declared server for a supported task.        | The live server exposes the expected tools or resources. |
| Authenticated        | The external provider accepted the operator's current authentication.             | A requested operation returned a correct result.         |
| Operational          | A current, relevant check completed through the live provider.                    | Later results remain current or complete.                |
| Stale or unavailable | The provider cannot answer, or its result is too old or incomplete for the claim. | The declaration or Harnessctl projection is defective.   |

Harnessctl validates Config v1, projects declared servers, and generates bounded routing
guidance. The selected harness owns loading its generated configuration. The operator
owns provider installation, process startup, accounts, authentication, permissions,
network access, storage, data handling, updates, and removal. The external provider owns
its service behavior and returned data.

Skills reference declarations; they do not create or operate providers. A declaration
can therefore be valid while registration, authentication, or operation is absent. When
a provider is unavailable, generated guidance uses the documented local or CLI fallback
when one is suitable, or stops and reports the limitation.

## Declare and route a server

This credential-free Config v1 excerpt declares the conventional GitHub server ID and
routes the CVS skill to it. The token value stays outside the file:

```yaml
version: 1
mcpServers:
  sdlc_cvs_github:
    url: https://api.githubcopilot.com/mcp/
    headers:
      Authorization: Bearer {env:GH_TOKEN}
      X-MCP-Toolsets: repos,issues,pull_requests,actions,git
skills:
  cvs:
    enabled: true
    local: git
    provider:
      type: github
      tools: gh
      mcpName: sdlc_cvs_github
      url: https://github.com
      token_env: GH_TOKEN
```

The declaration permits projection; `mcpName` permits generated routing. Neither proves
that the host registered the server, that `GH_TOKEN` is present, or that GitHub accepted
it. See [Config File](configuration.md) for merge mechanics and
[Config Schema](config-schema.md) for the exact field contract.

## Current server catalog

The IDs below are the current Harnessctl-managed or repository-selected contracts. The
four CVS IDs are conventional managed identities; a CVS provider can omit `mcpName` and
use only its CLI. `sdlc_code_index` and `sdlc_web_crawl` are the current selected names,
not promises that every compatible provider uses those IDs.

| Server ID          | Route                    | Provider shape                     | Primary fallback       |
| ------------------ | ------------------------ | ---------------------------------- | ---------------------- |
| `sdlc_cvs_github`  | CVS and remote authority | Official hosted GitHub MCP service | `gh`                   |
| `sdlc_cvs_gitlab`  | CVS and remote authority | Official hosted GitLab MCP service | `glab`                 |
| `sdlc_cvs_gitea`   | CVS and remote authority | Operator-run external process      | `tea`                  |
| `sdlc_cvs_forgejo` | CVS and remote authority | Operator-run external process      | `forgejo-cli`          |
| `sdlc_code_index`  | Code intelligence        | Repository-selected local process  | Glob, Grep, file reads |
| `sdlc_web_crawl`   | Web retrieval            | Repository-selected local process  | Suitable direct tools  |

### `sdlc_cvs_github`

**Purpose:** Route GitHub repository, issue, pull request, Actions, and Git operations to
the official hosted MCP service when the live schema supports the requested operation.

**Capabilities:** The managed contract requests the `repos`, `issues`, `pull_requests`,
`actions`, and `git` toolsets. Generated CVS guidance selects either live MCP tools or
`gh`; tool availability does not grant permission.

**Ownership:** Harnessctl owns the declaration and projection contract. The operator owns
the GitHub account, `GH_TOKEN`, permissions, consent, and result review. GitHub owns the
hosted service and its terms.

**Limits and fallback:** A configured entry does not prove authentication or service
availability. Use `gh` when the MCP route is unavailable or unsuitable; remote mutations
still require the workflow's explicit consent.

**Status:** Harnessctl declaration and routing contract: `working`. External operation:
`unknown/stale` until a current live result proves the requested operation.

**Evidence:** Source and automated test: managed MCP projection contract; generated
contract: [`config-v1.defaults.json`](../src/harnessctl/contracts/config-v1.defaults.json);
guide: [CVS](cvs.md).

### `sdlc_cvs_gitlab`

**Purpose:** Route GitLab repository, issue, merge request, pipeline, and related work to
the official hosted MCP service when the live schema supports it.

**Capabilities:** Harnessctl owns a managed GitLab server identity and generates
provider-exclusive CVS guidance. The live provider schema remains authoritative for the
tools available in a session.

**Ownership:** Harnessctl owns the projection contract. The operator owns the GitLab
account, OAuth authorization, permissions, consent, and result review. GitLab owns the
hosted service and its terms.

**Limits and fallback:** Registration does not prove OAuth completion or live operation.
Use `glab` when the MCP route is unavailable or unsuitable.

**Status:** Harnessctl projection and routing contract: `working`. External operation:
`unknown/stale` until current authentication and a relevant live result are observed.

**Evidence:** Source and automated test: managed MCP projection contract; guide:
[CVS](cvs.md).

### `sdlc_cvs_gitea`

**Purpose:** Route Gitea repository and collaboration work to an operator-run Gitea MCP
process.

**Capabilities:** Harnessctl owns the fixed managed identity and a version-vetted process
contract. The live server schema determines the tools actually available.

**Ownership:** Harnessctl does not distribute or install the executable. The operator
owns package installation, process lifecycle, Gitea URL, token environment, permissions,
updates, network access, and data handling.

**Limits and fallback:** Current compatibility evidence is bounded to the version named
in the [CVS guide](cvs.md). Use `tea` when the MCP process is absent or unsuitable.

**Status:** Harnessctl projection contract: `working`. Operator installation and external
operation: `unknown/stale` until checked in the current environment.

**Evidence:** Source and automated test: managed MCP projection contract; guide:
[CVS](cvs.md).

### `sdlc_cvs_forgejo`

**Purpose:** Route Forgejo repository and collaboration work to an operator-run Forgejo
MCP process.

**Capabilities:** Harnessctl owns the fixed managed identity and a version-vetted process
contract. The live server schema determines the tools actually available.

**Ownership:** Harnessctl does not distribute or install the executable. The operator
owns package installation, process lifecycle, Forgejo URL, token environment,
permissions, updates, network access, and data handling.

**Limits and fallback:** Current compatibility evidence is bounded to the version named
in the [CVS guide](cvs.md). Use `forgejo-cli` when the MCP process is absent or
unsuitable.

**Status:** Harnessctl projection contract: `working`. Operator installation and external
operation: `unknown/stale` until checked in the current environment.

**Evidence:** Source and automated test: managed MCP projection contract; guide:
[CVS](cvs.md).

### `sdlc_code_index`

**Purpose:** Give generated SDLC guidance relationship-aware code retrieval for symbols,
callers, dependencies, execution flows, and impact analysis.

**Capabilities:** The current default declaration selects CodeGraphContext through
`cgc mcp start`. Generated guidance inspects the live schema and uses only supported
retrieval operations; provider output remains advisory evidence.

**Ownership:** Harnessctl owns the provider-neutral name reference and generated
boundaries, not the provider. The operator owns installation, setup, startup, watchers,
processes, models, credentials, storage, indexed data, freshness, and removal.

**Limits and fallback:** Provider version evidence is currently ambiguous, and declared
configuration does not prove a running or fresh index. Fall back to Glob, Grep, and file
reads when the server is unavailable, stale, incomplete, or unsuitable. Refresh remains
a separate, explicitly gated operation.

**Status:** Harnessctl declaration and generated guidance: `working`. Current provider
operation and index freshness: `unknown/stale` until established for the repository.

**Evidence:** Generated contract:
[`config-v1.defaults.json`](../src/harnessctl/contracts/config-v1.defaults.json); guide:
[Code Intelligence](code-intelligence.md); dated provider observations:
[Code Intelligence Providers](code-intelligence-providers.md).

### `sdlc_web_crawl`

**Purpose:** Give generated SDLC guidance a preferred route for web search, fetch, local
stash, and stash search.

**Capabilities:** The current default declaration selects
`@dragoscirjan/mcp-searchable@latest`. Generated guidance prefers supported live
search/fetch/stash/grep capabilities before suitable direct-tool fallbacks and treats
retrieved text as untrusted data.

**Ownership:** Harnessctl owns the fixed skill reference and generated boundaries, not
the package or process. The operator owns package resolution, startup, credentials,
network access, local stored pages, updates, data handling, and removal.

**Limits and fallback:** The mutable `latest` selector and active declaration do not prove
the process version, startup, or result quality. Use suitable direct search or fetch tools
when the configured server is unavailable, stale, incomplete, or unsuitable.

**Status:** Harnessctl declaration and generated guidance: `working`. Current package and
external operation: `unknown/stale` until observed in the active environment.

**Evidence:** Generated contract:
[`config-v1.defaults.json`](../src/harnessctl/contracts/config-v1.defaults.json); generated
skill source:
[`sdlc/SKILL.md.j2`](../src/harnessctl/templates/skills/sdlc/SKILL.md.j2); guide:
[Web Retrieval](web-retrieval.md).

## Choose the next reference

- Use [Config File](configuration.md) for declaration and merge mechanics.
- Use [Config Schema](config-schema.md) for exact fields, defaults, and validation.
- Use [Skills](skills.md) to distinguish skill generation from MCP registration.
- Use [CVS](cvs.md) for provider-specific CVS setup and host projection.
- Use [Code Intelligence](code-intelligence.md) and
  [Code Intelligence Providers](code-intelligence-providers.md) for code-index routing,
  provider setup, evidence, and limitations.
- Use [Web Retrieval](web-retrieval.md) for web capability and trust boundaries.
- Use [Feature status and evidence](status-and-evidence.md) to interpret every status and
  evidence label on this page.
