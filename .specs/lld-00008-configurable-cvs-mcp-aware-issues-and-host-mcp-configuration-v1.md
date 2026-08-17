---
id: "00008"
type: lld
title: "Configurable CVS, MCP-Aware Issues, and Host MCP Configuration"
version: 1
status: review
parent: "00008"
opencode-agent: lead-engineer
---

# Configurable CVS, MCP-Aware Issues, and Host MCP Configuration

## Status and authority

Implementation-ready low-level design for `.specs/hld-00008-configurable-cvs-mcp-aware-issues-and-generated-host-mcp-configuration-v1.md`. The HLD and approved plan govern behavior. Existing local issue, memory, cache, command, and rollback contracts remain authoritative where this document does not explicitly extend them.

This revision uses verified upstream contracts without inventing provider, Pi, OpenCode, adapter, or server fields. Pi package presence is determined from the documented project settings model, not human-readable `pi list` output. Provider tool-name catalogs are deliberately omitted because exact names are not stable enough to project safely.

Verified release evidence is the Pi package documentation for project-local packages, project trust flags, and `.pi/settings.json`; pi-mcp-adapter v2.26.0 documentation for `.pi/mcp.json`, proxy-only defaults, and `settings.outputGuard`; and forgejo-mcp v2.33.0 documentation for standard-I/O startup, CLI mode, and `get_forgejo_mcp_server_version`. Release tests pin those sources and fail on drift.

## Scope

The change adds independently configured CVS and Issues routing, MCP server intent projection, provider-aware generated CVS and Issues skills, transactional OpenCode and Pi host-file merges, and a consent-gated Pi adapter prerequisite path.

It does not add provider API clients, execute remote work during installation, install provider CLIs, resolve secrets, migrate repositories or issues, alter canonical filesystem issues, alter repository memory, or make SQLite authoritative.

## Current repository boundaries

- `src/harnessctl/config.py` owns Python defaults, migration, and installer-time validation.
- `extensions/generic-tools/config.ts` and `extensions/generic-tools/schemas.ts` own matching TypeScript migration and runtime schema behavior.
- `extensions/generic-tools/contracts/config-v2.schema.json` is generated from the TypeScript schema and is never edited manually.
- `src/harnessctl/templates.py` and `src/harnessctl/templates/` own generated commands and skills.
- `src/harnessctl/install.py` currently plans and atomically writes project artifacts, captures file before-images, and restores exact bytes and presence on failure.
- `.opencode/opencode.json` currently contains operator-owned OpenCode configuration and has no `mcp` member.
- `.pi/mcp.json` does not currently exist.
- `extensions/generic-tools/issues.ts` remains the local filesystem issue façade. Its existing remote-provider rejection and all canonical YAML, revision, comment, relationship, archive, barrier, and cache behavior remain unchanged.
- Memory-enabled Pi and `all` installation currently fail before writes. That safeguard remains first in installer preflight and also precedes executable discovery, adapter inspection, consent, or package mutation.

## Exact project configuration contract

Configuration remains version 2. Existing missing-file, version 1, partial version 2, fresh-copy, and recursive overlay semantics remain unchanged. Mappings merge; scalars and arrays replace. Unknown or incompatible values fail closed.

### CVS keys

| Key | Type and accepted values | Default | Contract |
| --- | --- | --- | --- |
| `cvs.local` | `git` or `jj` | `git` | Selects direct local repository operations. It never routes through MCP. |
| `cvs.remote.provider` | `github`, `gitlab`, `gitea`, or `forgejo` | `github` | Selects the remote collaboration authority independently of Issues. |
| `cvs.remote.transport` | `auto`, `cli`, or `mcp` | `auto` | Selects only the CVS remote transport policy. |
| `cvs.remote.tools` | One exact provider CLI identifier | `gh` | Uses `gh`, `glab`, `tea`, or `forgejo-cli` according to provider. It is an identifier, never command text. |
| `cvs.remote.url` | Validated provider URL | `https://github.com` | GitHub and GitLab accept only their public service URL. Gitea and Forgejo require an explicit HTTPS instance URL. |
| `cvs.remote.token_env` | Valid environment-variable name | `GH_TOKEN` | Stores a name only. GitHub uses it for hosted MCP PAT interpolation. Gitea and Forgejo map it to `FORGEJO_ACCESS_TOKEN`. GitLab MCP ignores it because OAuth owns credentials. |

The exact provider CLI matrix is GitHub with `gh`, GitLab with `glab`, Gitea with `tea`, and Forgejo with `forgejo-cli`. The exact public collaboration URLs are `https://github.com` and `https://gitlab.com`. Gitea and Forgejo reject HTTP, credentials, query strings, fragments, whitespace, control characters, backticks, and unsafe interpolation content.

### Issues keys

The existing `issues.type`, `issues.root`, `issues.prefix`, `issues.tools`, `issues.remote.url`, and `issues.remote.token_env` keys remain. Add only `issues.remote.transport` for remote providers.

| Issue authority | Transport behavior |
| --- | --- |
| `filesystem` | No transport key is accepted. Existing local harnessctl tools, expected revisions, append-only comments, relationships, archive behavior, and no-direct-edit policy remain exact. |
| Remote provider | `issues.remote.transport` accepts `auto`, `cli`, or `mcp` and defaults to `auto` when upgrading an existing valid remote configuration. Provider, CLI, URL, and environment-name validation remain independent of CVS. |

Existing remote Issues configurations gain only the compatible `auto` default. They do not inherit CVS provider, transport, tool, URL, or environment name. Existing filesystem configurations remain byte-semantically unchanged at the canonical issue layer.

### MCP policy key

| Key | Accepted values | Default | Contract |
| --- | --- | --- | --- |
| `mcp.output_limit_mode` | `bounded-guidance` or `hard` | `bounded-guidance` | Controls only whether verified host output limiting is requested. It never represents a provider body-size or workflow aggregate limit. |

Python and TypeScript configuration validation accept `hard` as a policy value, while installation validates it against selected hosts. OpenCode or `all` rejects `hard`. Pi accepts it only with the verified adapter output guard. This preserves host-aware validation without pretending OpenCode has a control it does not expose.

### Validation and secret boundary

- Environment references accept names only. Values, assignments, shell fragments, command lines, paths, interpolation expressions, and token-shaped input are rejected.
- Remote tools remain exact identifiers. No configurable arguments are accepted.
- `mcp` requires a complete supported server definition. For Gitea and Forgejo, explicit `mcp` also requires installer preflight to find `forgejo-mcp`; absence fails before mutation. Under `auto`, absence of `forgejo-mcp` does not fail installation: no local MCP server entry is rendered and the valid configured CLI route remains available. When found under `auto`, the local MCP entry is rendered. Hosted GitHub and GitLab MCP definitions require no local executable.
- GitHub, Gitea, and Forgejo MCP projection requires a valid token environment-variable name. GitLab MCP requires none in generated host configuration.
- Gitea and Forgejo always require an explicit HTTPS instance URL.
- Unknown keys inside `issues` and the new CVS and MCP mappings fail in Python exactly as they fail in Zod and the generated JSON Schema. Existing top-level passthrough behavior remains unchanged for compatibility.
- Default migration adds local Git, GitHub remote CVS, `auto` CVS transport, and `bounded-guidance`. It does not change existing Issues authority.

## Python interfaces and responsibilities

### `src/harnessctl/config.py`

Extend `DEFAULT_CONFIG` and `load_config` with the exact keys above. Keep `ConfigError`, `_merge`, path validation, memory validation, and existing issue normalization behavior.

Add named validated concepts for local CVS, provider, transport, remote service, and MCP output-limit mode. The loaded mapping remains the public Python configuration return shape; no second config source is introduced. Python applies explicit allowed-key sets to `issues`, `cvs`, `cvs.remote`, and `mcp`, matching Zod strict objects and generated `additionalProperties` constraints after the existing v1/v2 overlay.

Provider validation must return normalized values but must never resolve an environment variable. Error messages name the field and expected provider contract without echoing environment contents.

### `src/harnessctl/mcp.py`

This new pure module owns shared provider metadata and projection-neutral server intents. Its public interfaces are:

- `ServerIntent`: fixed ID, provider, endpoint or process identity, transport kind, OAuth mode, environment-name mapping, tested compatibility version, server-level toolsets, and requesting route policies. Route-policy provenance is not part of the rendered server definition, but prevents an `auto` request from weakening an explicit `mcp` request for the same deduplicated ID.
- `required_server_intents(config, harness)`: returns candidate intents only for remote CVS or Issues policies that can use MCP. `cli` contributes none. Installer preflight retains hosted candidates, requires `forgejo-mcp` for explicit local `mcp`, and retains an `auto` local candidate only when that executable is present. Removing an unavailable `auto` candidate preserves its validated CLI route rather than failing the plan.
- `deduplicate_server_intents(intents)`: preserves first-seen provider order, collapses structurally identical same-ID intents while retaining all requesting policies, and raises `ConfigError` for any same-ID server-definition difference.
- `render_opencode_mcp(intent)` and `render_pi_mcp(intent)`: return only the exact host-native server object for one validated intent.

Structural identity includes provider, fixed ID, endpoint, process command and arguments, tested compatibility version, OAuth mode, headers, environment mapping, and server-level toolsets. The deduplicator never chooses CVS over Issues or Issues over CVS.

### `src/harnessctl/install.py`

Retain `install(cwd, harness, force=False)` compatibility. Extend it with an explicit keyword-only Pi package-install authorization input defaulting to false. The CLI exposes that input as `--allow-pi-mcp-adapter-install`; it is independent of `--force` and applies only to noninteractive operation. Interactive confirmation remains fresh and immediate even when this flag is present.

Add plan objects for rendered files, semantic JSON merges, Pi prerequisite state, captured before-images, executable prerequisites, and rollback actions. Existing callers that omit the new input retain fail-closed behavior.

The installer remains the only component allowed to invoke the pinned Pi package command. Rendering, config tools, generated skills, and TypeScript adapters never invoke it. The Pi launcher uses the executable path returned by Python `shutil.which`, the resolved project root as working directory, a bounded timeout, and captured output.

On POSIX, and on Windows when Pi resolves to an `.exe`, launch Pi directly as an argument vector with `shell=False`. On Windows, npm commonly resolves Pi to a `.cmd` or `.bat` shim. Launch such a shim explicitly through a separately resolved `cmd.exe` using `/d /s /c` and one fixed, safely quoted command. That command is composed only from the discovered Pi path and the pinned constant adapter package arguments. Reject a discovered shim path containing carriage return, line feed, NUL, double quote, percent, exclamation mark, caret, ampersand, vertical bar, less-than, or greater-than before invocation. No user or configuration string enters the command. Do not claim universal shell-free execution.

## TypeScript interfaces and generated schema

### `extensions/generic-tools/config.ts`

Extend `DEFAULT_CONFIG` and `validateAndMigrateConfig` with the same CVS, Issues transport, and MCP policy behavior as Python. Existing `createConfig`, `readConfig`, `getConfigValue`, `parseConfig`, and `ConfigError` interfaces remain stable.

Remote Issues explicitness remains enforced before deep overlay. Equivalent CVS explicitness applies when an override changes provider: required provider-specific tool, URL, and token-name fields must come from that CVS branch rather than being inherited from GitHub defaults.

### `extensions/generic-tools/schemas.ts`

Add strict schemas and exported inferred types for `CvsLocal`, `RemoteProvider`, `RemoteTransport`, `RemoteService`, and `McpOutputLimitMode`. Reuse one provider matrix for CVS and remote Issues refinements, while preserving the existing filesystem Issues discriminant and complete local tool set.

The schema retains the existing memory/caveman cross-field rule and the tolerated unused memory cache compatibility key. It does not add remote issue execution or MCP client behavior to generic-tools.

### `extensions/generic-tools/contracts/config-v2.schema.json`

Regenerate this artifact through `generate-contracts.ts`. It must express enums, required mappings, strict nested keys, URL and environment-name formats, filesystem exclusion of `issues.remote`, and the remote provider branches. Runtime-only host selection and same-ID semantic equality remain Python installer checks and are documented as such.

## Fixed MCP service catalog

| Provider | Fixed ID | Pinned service contract |
| --- | --- | --- |
| GitHub | `cvs_github` | Remote `https://api.githubcopilot.com/mcp/`; PAT header; toolsets exactly `repos,issues,pull_requests,actions,git`; OpenCode OAuth false. |
| GitLab | `cvs_gitlab` | Remote `https://gitlab.com/api/v4/mcp`; native OAuth and Dynamic Client Registration; no token header or environment reference. |
| Gitea | `cvs_gitea` | External `forgejo-mcp` 2.33.0 process using standard I/O and the configured Gitea HTTPS URL. |
| Forgejo | `cvs_forgejo` | External `forgejo-mcp` 2.33.0 process using standard I/O and the configured Forgejo HTTPS URL. |

`forgejo-mcp` is operator-installed and remains an external GPL process. Harnessctl does not distribute, vendor, import, link, or install it. `MushroomFleet/gitea-mcp` is neither a fallback nor generated guidance.

The Pi adapter identity is exactly `npm:pi-mcp-adapter@2.26.0`, licensed MIT. The only approved automatic package commands are `pi install -l npm:pi-mcp-adapter@2.26.0 --no-approve` and the transaction-owned rollback command `pi remove -l npm:pi-mcp-adapter@2.26.0 --no-approve`. No unpinned package reference is allowed.

Pi uses the adapter’s default proxy-only mode. No provider `includeTools`, `excludeTools`, or direct-tool catalogs are generated because exact provider tool names are not stably verified. GitHub’s server-level toolset header remains exactly the five approved toolsets; it is not represented as a per-tool catalog.

## OpenCode projection and merge

The owned file is `.opencode/opencode.json`. Parse it as one JSON object before any mutation. Preserve its existing `$schema`, `plugin`, unrelated top-level keys, and unrelated `mcp` IDs.

Harnessctl owns only the fixed IDs it needs beneath top-level `mcp`:

| ID | Exact owned OpenCode definition |
| --- | --- |
| `cvs_github` | `type` is `remote`; `url` is the official hosted endpoint; `headers.Authorization` is `Bearer {env:NAME}`; `headers.X-MCP-Toolsets` is the exact five-toolset string; `oauth` is false. |
| `cvs_gitlab` | `type` is `remote`; `url` is the official GitLab MCP endpoint; `oauth` is an empty object; no authorization header or token environment reference exists. |
| `cvs_gitea` | `type` is `local`; `command` is the ordered list containing `forgejo-mcp`, `--transport`, `stdio`, `--url`, and the validated URL; `environment.FORGEJO_ACCESS_TOKEN` is `{env:NAME}`. |
| `cvs_forgejo` | Same local shape as Gitea with the validated Forgejo URL and Forgejo token-name reference. |

An absent `mcp` member is created. A non-object `mcp` member fails. An identical owned ID is retained semantically and is not treated as a conflict. A differing owned ID blocks the complete plan unless force is supplied. Force replaces only that fixed-ID value. It never rewrites unrelated MCP IDs or unrelated top-level settings.

JSON formatting may change only when the semantic merge requires writing the file. If all required entries are already identical, preserve the original bytes and omit the file from writes.

OpenCode rejects `mcp.output_limit_mode=hard`. Character and workflow targets appear only in generated guidance and must not be projected as undocumented fields.

## Pi projection and merge

The owned file is `.pi/mcp.json`. Parse it as one JSON object before package mutation or project writes. Preserve unrelated top-level keys, unrelated `mcpServers` IDs, and unrelated `settings` keys.

Harnessctl owns required fixed IDs beneath `mcpServers` and only `outputGuard` beneath top-level `settings`.

The exact owned value is `settings.outputGuard` containing `maxBytes` 51200, `maxLines` 2000, and `detailsMaxBytes` 16384. Existing different values at that owned path are conflicts. Force may replace only that path; it may not replace the entire settings object. Harnessctl omits global and per-server `directTools`; the adapter’s documented default therefore keeps one proxy tool and prevents direct-tool expansion. It also omits `hostConfigDiscovery`, `includeTools`, and `excludeTools`.

| ID | Exact owned Pi definition |
| --- | --- |
| `cvs_github` | Official URL; PAT authorization as `Bearer ${NAME}`; exact GitHub toolset header; `auth` bearer; `lifecycle` lazy. No direct-tool or tool-name filter fields. |
| `cvs_gitlab` | Official URL; `auth` oauth; empty `oauth`; no authorization header, token reference, `bearerToken`, or `bearerTokenEnv`; `lifecycle` lazy. No direct-tool or tool-name filter fields. |
| `cvs_gitea` | `command` `forgejo-mcp`; ordered `args` of `--transport`, `stdio`, `--url`, validated URL; `env.FORGEJO_ACCESS_TOKEN` as `${NAME}`; lazy lifecycle. No direct-tool or tool-name filter fields. |
| `cvs_forgejo` | Same process shape with the validated Forgejo URL and Forgejo token-name reference. No direct-tool or tool-name filter fields. |

No global lifecycle key is emitted. No undocumented aggregate-output, provider-body-size, OAuth-token, discovery, direct-tool, or provider tool-catalog field is emitted.

If the exact pinned package source is not configured after the prerequisite phase, the Pi MCP file is not written. Existing operator content is preserved; installation does not leave a new file claiming operational MCP support.

## Merge ownership, dedupe, and conflict rules

CVS and Issues each produce a server intent from their own validated policy. Matching providers deduplicate only when every server-defining value is identical. Different token environment names or instance URLs under the same fixed ID are conflicts even if both are valid individually.

Conflict discovery covers commands, skills, OpenCode JSON, Pi JSON, package registration, memory files, and settings snapshots before the first project write. Without force, any conflict blocks all writes and any Pi package installation. Force is narrow: generated command and skill targets follow existing behavior; fixed MCP IDs and owned settings paths may be replaced; operator-owned siblings never are.

Malformed JSON, duplicate JSON members detectable by the selected parser, non-object roots, incompatible container types, symlinks or paths escaping the project, and non-file targets fail preflight. No last-writer-wins behavior is permitted.

## Generated CVS skill

Add `src/harnessctl/templates/skills/cvs/SKILL.md.j2` and register `cvs` in `SKILL_TEMPLATES`. Install it at `.opencode/skills/cvs/SKILL.md`. Pi skill distribution remains unsupported; Pi receives host MCP configuration only when its existing safety gates permit installation.

The render context contains only validated local CVS, remote provider, transport, CLI identifier, remote URL, token environment-variable name, fixed MCP ID, bounded-call policy, and host capability notes. It never receives the whole configuration or any environment value.

The skill states that local Git or Jujutsu operations stay direct. It describes provider capabilities, branch and change-request workflow, repository-context confirmation, attribution, and fresh consent immediately before every merge. It refers uncertain command syntax to installed CLI help or live MCP tool schemas instead of inventing flags.

For Gitea and Forgejo MCP, the generated skill connects first, then calls `get_forgejo_mcp_server_version` before any provider mutation. Only the tested 2.33.0 result is compatible; absent, malformed, or different results stop the route. The installer does not call the remote service and does not invent a `--version` probe.

Runtime CLI routing always uses the configured provider CLI matrix: GitHub uses `gh`, GitLab uses `glab`, Gitea uses `tea`, and Forgejo uses `forgejo-cli`. Generated skills perform PATH discovery and context checks before selecting that route and refer uncertain syntax to the selected CLI's live help. `forgejo-mcp` is MCP transport only and must never be invoked with `--cli` or used as a CLI fallback. Upload, file-creation, and attachment-content operations remain prohibited by generated skill policy. OpenCode is not claimed to hard-filter those operations.

## Generated MCP-aware Issues skill

Extend the existing issue-tracking template and narrow render context with the independent Issues transport and fixed MCP ID. Filesystem rendering remains unchanged in authority: use local tools, obtain current expected revisions, append comments through tools, link documents, and never directly edit canonical YAML.

Remote rendering applies the same routing and trust rules as CVS but only to Issues capabilities. It must not infer a working route from CVS, even when the server registration is shared.

Provider branches remain mutually exclusive. A provider-channel failure is reported directly to the user and never recursively through the broken channel.

## Runtime route policy in generated guidance

The following are hard routing rules for conforming generated skills:

1. Resolve the configured domain and provider, intended repository or project, target object, required operation, and available host capabilities.
2. `cli` permits only the exact configured provider CLI: `gh` for GitHub, `glab` for GitLab, `tea` for Gitea, or `forgejo-cli` for Forgejo. `forgejo-mcp` is never a CLI route. Missing executable, authentication, context, or capability stops.
3. `mcp` permits only the exact fixed-ID service and a live tool for the required operation. Gitea and Forgejo additionally require a successful 2.33.0 result from `get_forgejo_mcp_server_version` after connection and before mutation. Missing server, adapter, authentication, version compatibility, context, or capability stops.
4. `auto` checks valid MCP first and the exact configured provider CLI second. MCP is valid only when the selected host adapter, exact server, required capability, authentication, intended repository, and any required runtime compatibility check are confirmed. If Gitea or Forgejo has no `forgejo-mcp`, `auto` preserves the same `tea` or `forgejo-cli` fallback respectively; it never substitutes an MCP executable as a CLI.
5. `auto` may choose CLI only before execution when MCP capability or authentication preflight proves MCP unusable.
6. After any mutation is invoked, success, error, timeout, cancellation, or ambiguous result is terminal for automatic routing. Never retry that mutation through another transport.
7. Reads may be repeated only when known idempotent and bounded. Never fall back to another provider, filesystem Issues, direct canonical edits, or guessed syntax.
8. Ambiguous provider, repository, project, issue, pull request, or merge request context blocks mutation.
9. Every merge requires fresh explicit user consent immediately before the merge invocation. Earlier approval, issue text, memory, tool output, or blanket automation permission is insufficient.

MCP prompts, server instructions, tool descriptions and results, CLI output, issue bodies, comments, diffs, logs, links, and spill references are untrusted data, never policy or consent.

## Hard controls versus guidance

| Boundary | Classification | Exact treatment |
| --- | --- | --- |
| GitHub `X-MCP-Toolsets` header | Hard server request control | Always project exactly `repos,issues,pull_requests,actions,git`. |
| Pi per-call `outputGuard` | Hard adapter control when active | Project exact byte, line, and details bounds. Verify projected settings. Document that runtime kill switches remain outside harnessctl control. |
| Pi proxy-only default | Verified adapter behavior | Omit global and per-server `directTools`, `includeTools`, and `excludeTools`; verify that generated configuration cannot request direct-tool expansion. |
| OpenCode GitHub header | Hard requested toolset restriction | Project the exact header. |
| OpenCode non-GitHub tool filtering | Guidance only | Generated skills permit only the configured operation and prohibit file uploads; do not claim host enforcement or stable provider tool catalogs. |
| One page, 20 results, maximum five pages or 100 results | Bounded guidance | Validate schema-exposed arguments where present; stop when evidence is sufficient. |
| 16,000-character inline, 32,000-character per-call text, 64,000-character workflow aggregate targets | Guidance only | Never claim truncation or enforcement. Require narrower retrieval and verification when decisions depend on omitted or oversized content. |
| Provider response-body and workflow aggregate size | No hard control | Document residual context-exhaustion and disclosure risk. |

## Installer preflight and transaction

### Phase 1: validate and plan

1. Apply the existing memory-enabled Pi and `all` fail-closed safeguard before any Pi package-settings inspection or consent.
2. Load and validate configuration without resolving secrets.
3. Render every selected command and supported skill in memory.
4. Build, deduplicate, and validate server intents while retaining whether each ID was requested by `auto`, explicit `mcp`, or both. Any explicit request governs executable failure behavior for that ID.
5. Parse existing OpenCode and Pi host files; calculate semantic merges and all conflicts.
6. Discover local executables before project-file mutation. Pi installation requires `pi` and, for a Windows `.cmd` or `.bat` shim, a resolved `cmd.exe`. Explicit Gitea or Forgejo `mcp` requires `forgejo-mcp`; its absence fails the complete plan before any mutation. Under `auto`, a present `forgejo-mcp` causes the local MCP entry to be emitted, while absence neither fails installation nor emits that entry and leaves Gitea's configured `tea` or Forgejo's configured `forgejo-cli` route intact. Hosted GitHub and GitLab require no local MCP executable. Runtime CLI fallback performs its own PATH check when selected rather than being treated as installer proof of future availability. Installer and runtime guidance never invoke `forgejo-mcp --cli`.
7. Capture exact bytes and presence for every harnessctl-owned project file that could change.
8. For Pi, capture exact bytes and presence of project-local `.pi/settings.json` before package mutation.
9. Parse `.pi/settings.json` as an object and inspect only its top-level `packages` array. Each entry may be a source string or an object with a string `source`. The adapter is configured only when an entry’s source equals `npm:pi-mcp-adapter@2.26.0` exactly. Do not parse or depend on `pi list` output.

Malformed settings, malformed package entries, duplicate exact entries, or unpinned/wrong-version entries for the adapter stop before project writes and package installation. The diagnosis directs operator repair; force does not override it.

### Phase 2: Pi adapter prerequisite

If the exact pinned source is already configured, preserve it and `.pi/settings.json`. Do not reinstall, remove, rewrite, or toggle it. This is the supported manual-preinstallation path.

If absent, automatic installation is available only with fresh interactive consent or the dedicated noninteractive opt-in. Otherwise stop before mutation and instruct the operator to install the exact project-local source manually, then rerun harnessctl.

Immediately before automatic installation, disclose the exact pinned command `pi install -l npm:pi-mcp-adapter@2.26.0 --no-approve`, `.pi/settings.json`, project-local `.pi/npm/`, and residual package-manager metadata, package-directory, lifecycle-script, download, cache, and other external effects that cannot be exactly reversed.

- Interactive operation requires fresh explicit confirmation after disclosure. Confirmation is the final action before invoking the package command.
- Noninteractive operation requires `--allow-pi-mcp-adapter-install`. Emit the same disclosure immediately before honoring it. Without the flag, stop before mutation and provide the manual path.
- `--force`, earlier approval, or general package consent never substitutes for this confirmation.

Invoke install and removal through the Pi launcher contract above. POSIX and Windows `.exe` paths use direct argument vectors with `shell=False`; Windows `.cmd` and `.bat` shims use only the fixed `cmd.exe /d /s /c` form. Re-read `.pi/settings.json` and require exactly one configured source equal to `npm:pi-mcp-adapter@2.26.0` before writing project files. On failure, attempt `pi remove -l npm:pi-mcp-adapter@2.26.0 --no-approve` only when this transaction added it, then restore exact pre-install `.pi/settings.json` bytes or absence. Report every cleanup failure and non-reversible package-directory, cache, download, lifecycle, or package-manager effect.

### Phase 3: project commit and smoke check

Write planned files through existing same-directory atomic replacement. Unchanged semantic merges are omitted. Smoke checks parse both host files, compare every owned path with the plan, verify required skills and commands, verify no unsupported fields, and recheck the exact Pi package source in `.pi/settings.json`.

Any failure restores only harnessctl-owned project before-images and exact `.pi/settings.json` bytes and presence, then verifies those boundaries. If this transaction installed the adapter, attempt the exact pinned project-local removal before restoring settings. The removal assertion proves only that the best-effort command was attempted. `.pi/npm`, package-manager caches, downloads, lifecycle effects, and other external state may remain and are outside exact rollback assertions. Execute every cleanup action even after an earlier cleanup error and return all errors together.

External package installation is not exactly reversible. Never remove a pre-existing adapter or other pre-existing external state. Clearly report known or possible residual package-manager, lifecycle, global-state, download, and cache effects.

## Failure flows and edge cases

- Invalid or partial provider configuration fails before rendering.
- A requested `mcp` route with an incomplete server requirement fails validation; it never silently becomes CLI.
- A requested `cli` route never creates an MCP registration and never silently becomes MCP.
- `auto` with no valid route stops without provider substitution.
- Matching CVS and Issues definitions deduplicate. Same fixed ID with different URL, token-name mapping, endpoint, command, tested compatibility version, OAuth, headers, or server-level toolsets fails the complete plan.
- GitLab generated MCP objects never contain a token reference even if its CLI configuration names one.
- Existing identical host entries remain unchanged. Different owned entries require narrow force. Unrelated host settings survive normal and forced installation.
- A mutating timeout or ambiguous result never triggers cross-transport retry.
- Authentication, DCR, secure-store, permission, capability, or repository-context failure stops before mutation when detectable.
- Missing `forgejo-mcp` fails explicit Gitea or Forgejo `mcp` before mutation. Under `auto`, it does not fail installation and no local MCP entry is emitted; Gitea retains `tea` and Forgejo retains `forgejo-cli` as the validated fallback. When present under `auto`, the installer emits the local MCP entry. The installer neither calls it nor claims its version; generated runtime guidance verifies 2.33.0 through `get_forgejo_mcp_server_version` after connection and before mutation. No flow invokes `forgejo-mcp --cli`.
- Missing, malformed, duplicate, unpinned, or wrong-version Pi package settings produce manual-preinstallation guidance and no project mutation.
- Refused consent or missing noninteractive opt-in produces no package or project mutation.
- Pi package installation verification failure performs cleanup before any project write.
- Rollback restoration failure, adapter removal failure, and residual external effects are all surfaced; one does not suppress another.
- Environment-variable values are never read, rendered, logged, diffed, captured in diagnostics, or included in snapshots.
- Executable absence, unsafe Windows shim path, timeout, non-zero exit, or undecodable captured output is reported without an alternate launcher fallback. The sole shell-mediated case is the explicit fixed `cmd.exe` launch for a discovered Windows `.cmd` or `.bat` Pi shim. Runtime mutation timeout remains ambiguous and never triggers transport retry.
- Existing local issue files, IDs, revisions, relationships, comments, archive state, repository memory, and SQLite cache behavior are untouched.

## Concrete files and ownership

| Files | Responsibility |
| --- | --- |
| `src/harnessctl/config.py`, `tests/test_install.py` | Python defaults, migration, validation, and installer contract cases. |
| `extensions/generic-tools/config.ts`, `extensions/generic-tools/config.spec.ts` | Matching TypeScript defaults, migration, explicitness, and parity. |
| `extensions/generic-tools/schemas.ts`, `extensions/generic-tools/schemas.spec.ts` | Strict runtime schema, inferred interfaces, cross-field rules, and portable-schema parity. |
| `extensions/generic-tools/contracts/config-v2.schema.json` | Generated portable configuration contract. |
| `src/harnessctl/mcp.py`, `tests/test_mcp_projection.py` | Fixed catalog, intent dedupe/conflict, exact OpenCode and Pi projection, and merge ownership. |
| `src/harnessctl/templates.py`, `src/harnessctl/templates/skills/cvs/SKILL.md.j2` | CVS skill registration and narrow rendering. |
| `src/harnessctl/templates/skills/issue-tracking/SKILL.md.j2`, `tests/test_issue_skill.py` | Independent Issues transport routing, trust rules, bounded guidance, and filesystem preservation. |
| `src/harnessctl/install.py`, `tests/test_install.py` | Transaction planning, host merges, Pi prerequisite consent and verification, atomic commit, rollback, and CLI opt-in. |
| `docs/configuration.md`, `docs/skills.md` | Exact keys, defaults, independent domains, generated skill behavior, hard controls versus guidance. |
| `docs/issues.md`, new `docs/cvs.md` | Local issue preservation, provider matrices, transport routing, merge consent, and CLI/MCP troubleshooting. |
| `docs/README.md`, `README.md` | Documentation routing and concise current capability summary. |
| `tests/test_docs.py`, `tests/test_release_artifacts.py` | Link, example, pin, artifact, isolated install, and current-versus-future checks. |
| New `.changeset/*.md` | Patch release for `@harnessctl/generic-tools`; package versions remain Changesets-owned. |
| `.opencode/opencode.json`, `.opencode/skills/cvs/SKILL.md`, `.opencode/skills/issue-tracking/SKILL.md` | Reinstalled generated repository artifacts after all checks. |

Do not add generated `.pi/mcp.json` to this repository during reinstall because current memory-enabled Pi and `all` installation remain fail closed. Do not hand-edit generated schemas, package versions, or generated skills.

## Test matrix

### Configuration parity

- Missing, version 1, and partial version 2 configurations receive Git, GitHub CVS, `auto`, and bounded-guidance defaults without changing Issues authority.
- Test both local CVS values against all four remote providers and all three transports.
- Test filesystem Issues plus every remote Issues provider and transport independently from CVS.
- Prove changing only CVS leaves Issues unchanged and changing only Issues leaves CVS unchanged.
- Reject unknown enum values, extra nested keys, provider/tool mismatches, unsafe URLs, malformed environment names, secret values, shell text, and incomplete MCP-only definitions.
- Prove Python, TypeScript, and generated JSON Schema accept and reject the same complete fixtures where JSON Schema can express the rule, including unknown keys at `issues`, `cvs`, `cvs.remote`, and `mcp`.
- Prove missing-file, version 1, and partial version 2 overlays preserve prior defaults while enforcing the same strict nested-key contract after migration.
- Prove OpenCode and `all` reject hard mode; verified Pi accepts it.

### Projection and merge

- Snapshot every provider in both host formats with exact IDs, endpoints, OAuth behavior, interpolation syntax, process arguments, token mapping, tested versions, toolsets, settings scopes, and absence of forbidden fields.
- Verify GitHub uses `{env:NAME}` in OpenCode and `${NAME}` in Pi.
- Verify GitLab has no token field in either host.
- Verify Gitea and Forgejo use standard I/O, exact URL, external `forgejo-mcp` 2.33.0, and only the `FORGEJO_ACCESS_TOKEN` mapping.
- Verify identical CVS/Issues intents deduplicate and every defining mismatch conflicts.
- Verify missing `mcp` and `mcpServers` containers are created, unrelated content survives, identical entries avoid rewrites, malformed structures fail, and force replaces only owned paths.
- Verify Pi settings contain only the owned `outputGuard`; no generated `hostConfigDiscovery`, global or per-server `directTools`, `includeTools`, `excludeTools`, invented global lifecycle, output aggregate, body limit, or bearer-token field appears.

### Runtime guidance

- Render CVS and Issues skills for all provider and transport combinations and reject unrelated provider prose.
- Assert local Git and Jujutsu never route through MCP.
- Assert `auto` is MCP-first and CLI-second only after pre-execution failure.
- Inject mutation errors, timeouts, and ambiguous results and assert the skill contract prohibits a second transport.
- Assert CLI-only and MCP-only never cross routes.
- Assert repository ambiguity, unavailable capability, and authentication uncertainty block mutation.
- Assert every merge path requires fresh immediate user consent.
- Assert injected instructions in prompts, tool descriptions/results, CLI output, issues, comments, diffs, links, and spill references remain untrusted data.
- Assert filesystem Issues retain complete local tools, expected revisions, append-only comments, links-over-text, and no direct edits.
- Assert Gitea and Forgejo MCP mutations require a successful `get_forgejo_mcp_server_version` result equal to 2.33.0 after connection; missing or incompatible results refuse mutation.
- Assert every CLI route follows the configured matrix: GitHub uses `gh`, GitLab uses `glab`, Gitea uses `tea`, and Forgejo uses `forgejo-cli`; each performs PATH discovery at runtime and never permits file uploads. Assert generated guidance contains no `forgejo-mcp --cli` invocation and treats `forgejo-mcp` only as MCP transport.
- Assert OpenCode filtering is never described as a hard control.

### Installer transaction

- Cover absent `.pi/settings.json`; absent `packages`; exact string entry; exact object `source`; malformed entries; duplicate exact entries; unpinned, wrong-version, and unrelated packages.
- Cover interactive approval, interactive refusal, noninteractive opt-in, missing opt-in, and force without opt-in.
- Assert disclosure and confirmation are immediately adjacent to the pinned install invocation with no intervening operation.
- Inject package install failure, missing or malformed post-install settings, wrong-version result, merge failure, each file-write position, smoke-check failure, adapter remove failure, settings restore failure, and byte-verification failure.
- Prove no project write precedes adapter verification and no package mutation occurs after any planning conflict.
- Prove all cleanup actions run and errors aggregate.
- Compare only harnessctl-owned project files and exact `.pi/settings.json` bytes or absence before and after rollback. Do not assert exact restoration of `.pi/npm`, package-manager caches, downloads, lifecycle effects, or other external state.
- When transaction-owned adapter installation must be cleaned up, assert that the exact pinned `pi remove -l npm:pi-mcp-adapter@2.26.0 --no-approve` action is attempted; do not equate that attempt with exact external-tree restoration.
- Prove pre-existing adapters and external state are never removed.
- Prove memory-enabled Pi and `all` stop before adapter inspection, consent, package mutation, or project writes.
- Add exact Pi launcher unit cases for POSIX direct invocation, Windows `.exe` direct invocation, Windows `.cmd` and `.bat` invocation through resolved `cmd.exe /d /s /c`, rejection of each prohibited unsafe-path class, timeout, and non-zero exit. Assert direct cases use argument vectors with `shell=False`; batch cases contain only the safely quoted discovered Pi path and pinned constant package arguments. Assert resolved-root working directory, bounded timeout, captured output, and no user or configuration string in the batch command.
- Cover Gitea and Forgejo `auto` with `forgejo-mcp` present and absent, plus explicit `mcp` with it absent. Assert present `auto` emits the exact local MCP entry; absent `auto` succeeds without that entry and preserves `tea` for Gitea or `forgejo-cli` for Forgejo; absent explicit `mcp` fails before package or project mutation. Assert no installer or generated runtime path invokes `forgejo-mcp --cli`.
- Assert hosted GitHub and GitLab MCP require no local server executable, `forgejo-mcp` uses no installer `--version` probe, remote services are never contacted, and secrets are never resolved.

### Release, docs, and security

- Verify exact endpoints, package identities, versions, licenses, OpenCode fields, Pi fields, Pi package-settings contract, forgejo-mcp version tool, and documented CLI form against pinned source links. Fail on drift rather than adapting silently.
- Scan config fixtures, generated output, errors, snapshots, wheel, source distribution, and npm package contents for credential values and unsafe interpolation.
- Verify `MushroomFleet/gitea-mcp` appears only in rejection documentation and never in runtime metadata or generated output.
- Build isolated wheel and source distribution; render both skills and install representative OpenCode configurations without checkout imports.
- Build npm packages and verify generated config schema is included and fresh.
- Validate documentation links and all examples against current validators.
- Run formatting, lint, strict type checks, duplicate check, audit, Python and TypeScript tests, builds, package checks, release-artifact checks, and generated-file checks.

## Ordered implementation plan

Each subtask changes one to three files and depends on the preceding contract work.

1. Update `src/harnessctl/config.py` and focused cases in `tests/test_install.py` for exact defaults, CVS, Issues transport, MCP policy, migration, validation, and independence.
2. Update `extensions/generic-tools/config.ts` and `extensions/generic-tools/config.spec.ts` with matching defaults, migration, and explicit provider override behavior.
3. Update `extensions/generic-tools/schemas.ts` and `extensions/generic-tools/schemas.spec.ts` for strict interfaces, provider branches, and parity fixtures.
4. Regenerate `extensions/generic-tools/contracts/config-v2.schema.json` through `extensions/generic-tools/generate-contracts.ts`; do not hand-edit it.
5. Add `src/harnessctl/mcp.py` and `tests/test_mcp_projection.py` for fixed catalog intents, exact projections, dedupe, conflicts, and semantic host merges.
6. Add `src/harnessctl/templates/skills/cvs/SKILL.md.j2` and register it in `src/harnessctl/templates.py`; add rendering coverage to `tests/test_install.py`.
7. Extend `src/harnessctl/templates/skills/issue-tracking/SKILL.md.j2` and `tests/test_issue_skill.py` for independent transport routing while preserving filesystem behavior.
8. Refactor planning, executable discovery, bounded process execution, Windows Pi shim launching, and semantic JSON merge boundaries in `src/harnessctl/install.py`; cover conflict collection, conditional `auto` projection, explicit MCP preflight, cross-platform launcher behavior, and exact ownership in `tests/test_install.py`.
9. Add exact `.pi/settings.json` package inspection, Pi adapter opt-in and consent, pinned project-local install/remove, exact settings restoration, cleanup, and rollback to `src/harnessctl/install.py`; extend failure-injection cases in `tests/test_install.py`.
10. Update `docs/configuration.md` and `docs/skills.md` for exact schemas, host files, generated guidance, and hard-versus-guidance boundaries.
11. Update `docs/issues.md` and add `docs/cvs.md` for independent workflows, provider matrices, deterministic routing, fallback, merge consent, and failure recovery.
12. Update `docs/README.md` and `README.md` only for routing and concise current behavior.
13. Extend `tests/test_docs.py` and `tests/test_release_artifacts.py` for examples, pins, links, resources, isolated installation, and freshness.
14. Add one patch Changeset for `@harnessctl/generic-tools`; do not manually change npm or Python versions.
15. Run the complete quality and release gates. Resolve source-pin, package-settings, host-projection, and forgejo-mcp compatibility-contract checks before enabling automatic installation.
16. Reinstall with the repository’s validated current configuration using the OpenCode-only path. Regenerate `.opencode/opencode.json`, `.opencode/skills/cvs/SKILL.md`, and `.opencode/skills/issue-tracking/SKILL.md`; verify commands, memory, canonical issues, and other generated artifacts did not change unexpectedly.

## Acceptance criteria

1. Configuration version 2 defaults CVS to local Git, GitHub remote, and `auto`; Issues remain independently authoritative and existing filesystem defaults remain exact.
2. Python, TypeScript, and generated JSON contracts agree on all defined configuration shapes and migrations; all three reject unknown keys in strict `issues`, `cvs`, `cvs.remote`, and `mcp` objects while preserving compatible v1/v2 overlay defaults.
3. CVS and remote Issues each support `auto`, `cli`, and `mcp` without inheriting policy from the other domain.
4. `auto` deterministically prefers a valid exact MCP route, falls back only before execution to the validated provider CLI, and never retries a mutation through another route.
5. Local Git and Jujutsu operations always remain direct.
6. Fixed IDs are exactly `cvs_github`, `cvs_gitlab`, `cvs_gitea`, and `cvs_forgejo`.
7. Identical intents deduplicate; any same-ID defining mismatch fails without silent precedence.
8. `.opencode/opencode.json` and `.pi/mcp.json` contain only documented host fields, correct interpolation, exact endpoints, exact OAuth behavior, exact process shapes, and preserved unrelated settings.
9. Pi uses top-level `mcpServers` and top-level `settings.outputGuard` with bounds 51200 bytes, 2000 lines, and 16384 details bytes. It remains proxy-only by omitting direct-tool and provider tool-catalog fields; lazy lifecycle is per server only.
10. Host configuration references operator-installed `forgejo-mcp`, tested at 2.33.0, but the installer neither probes with `--version` nor contacts a provider. Generated runtime guidance calls `get_forgejo_mcp_server_version` after connection and refuses mutation unless it reports 2.33.0. The rejected MushroomFleet server is never selected.
11. Pi MCP is operational only when `.pi/settings.json` contains exactly configured source `npm:pi-mcp-adapter@2.26.0` as a string entry or object `source`. Manual preinstallation works without reinstalling or changing prior adapter state; `pi list` output is never parsed.
12. Automatic Pi adapter installation requires immediate interactive consent or the dedicated noninteractive opt-in after disclosure and uses the exact pinned package invocation through the platform-specific Pi launcher. Force is insufficient.
13. Every project artifact and required local executable is validated before project-file mutation. Explicit local MCP fails when `forgejo-mcp` is absent; `auto` succeeds without emitting that local entry and preserves `tea` for Gitea or `forgejo-cli` for Forgejo, or emits the MCP entry when `forgejo-mcp` is present. `forgejo-mcp` remains MCP-only and is never invoked with `--cli`. Hosted GitHub and GitLab MCP require no local server executable.
14. Pi execution uses direct argument vectors with `shell=False` on POSIX and for Windows `.exe` files. Windows `.cmd` and `.bat` shims use only the resolved `cmd.exe /d /s /c` launcher with a safely quoted fixed command derived from the validated discovered path and pinned arguments; unsafe paths are rejected and no user or configuration string enters it.
15. Rollback exactly restores only harnessctl-owned project files and `.pi/settings.json` bytes and presence. Exact pinned project-local removal is attempted only for a transaction-added adapter; tests assert the attempt, while `.pi/npm`, caches, lifecycle effects, and other external state remain explicitly residual.
16. External package installation is never represented as exactly reversible; residual package-manager, package-directory, lifecycle, global-state, download, and cache risk remains explicit.
17. Generated CVS and Issues skills are provider-exclusive, capability-aware, bounded, injection-resistant, prohibit file uploads, do not claim OpenCode hard filtering, and require fresh consent immediately before merge.
18. Hard controls are limited to verified GitHub toolsets and Pi adapter settings. OpenCode body, text, tool filtering, and workflow targets remain guidance with residual risk.
19. Configuration and generated artifacts contain environment-variable names only; harnessctl never resolves or logs values.
20. Existing filesystem issue semantics, repository memory authority, disposable SQLite cache behavior, memory-enabled Pi safeguard, and `all` safeguard remain unchanged.
21. Documentation, tests, Changeset, generated schema, wheel, source distribution, and npm package artifacts remain mutually consistent.
22. OpenCode-only reinstall updates the intended generated CVS, Issues, and MCP artifacts without bypassing the repository’s Pi safeguards.

## Residual risks

- Pi package installation can leave package-manager metadata, lifecycle effects, global state, downloads, or caches after best-effort removal. Consent and diagnostics must state this plainly.
- Provider endpoints, OAuth behavior, live tool schemas, package-settings behavior, and package releases can drift. Pinned freshness tests and runtime forgejo-mcp compatibility checks reduce but cannot eliminate this operational risk.
- OpenCode does not enforce the proposed body, per-call text, or workflow aggregate guidance. A nonconforming agent or server can exceed it.
- Pi’s output guard can be disabled outside harnessctl. Installation verifies projected settings, not immutable runtime enforcement.
- Skills are guidance, not authorization. Effective security remains provider, CLI, MCP server, host, and operator permissions.
- Remote context can remain ambiguous despite preflight. The safe outcome is to block mutation and require operator clarification.
