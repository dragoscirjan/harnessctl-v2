# Graph-Oriented Code-Index MCP Provider Research

Task: `hrn-00111`
Policy: `.harnessctl/tasks/hrn-00110/evidence-policy.md`
Evidence access date: 2026-08-23

## Research Boundary and Acceptance Exception

This revision is based only on repository source, official documentation, release metadata, registries, licenses, security policies, and local project documentation. No provider was installed, executed, indexed, watched, configured, updated, removed, or probed during this revision.

An earlier research pass inadvertently invoked `list_repos` through a pre-existing GitNexus MCP connection. That invocation violated the policy's no-provider-command and no-live-handshake acceptance condition. Its entire output is quarantined: no repository name, path, count, state, version, capability, storage observation, or other returned value is used as evidence, corroboration, search input, qualification, comparison value, or guide wording anywhere in this artifact. The invocation made no intended mutation, but this research cannot truthfully satisfy the checklist statement that no provider command ever ran. This unresolved acceptance exception must be carried into formal Verify.

Statuses have only the policy meanings `Supported`, `Unsupported`, `Ambiguous`, `Unknown`, and `Stale`. An `Unknown` row is a reproducible search record, not an inference from silence. Installation, configuration, update, and removal commands are quoted documentation only and were not run.

## CodeGraphContext

### 1. Status and version

| Claim | Status | Evidence |
| --- | --- | --- |
| PyPI publishes `codegraphcontext` version `0.6.5`. | Supported | CGC-01 |
| Source commit `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` declares version `0.6.5`. | Supported | CGC-02 |
| Release identity is coherent across PyPI, source, and GitHub Releases. | Ambiguous | CGC-03 |

### 2. License

| Claim | Status | Evidence |
| --- | --- | --- |
| CodeGraphContext source at the reviewed commit uses the MIT License. | Supported | CGC-04 |
| Redistribution requires retaining the copyright and permission notice. | Supported | CGC-05 |
| Licenses for optional databases, dependencies, bundles, and hosted services are established by the repository MIT license. | Unknown | CGC-U01 |

### 3. Install and update

Documentation examples only; not executed:

```bash
pip install codegraphcontext==0.6.5
pip install --upgrade codegraphcontext==0.6.5
```

The package name and version are registry-supported. [CGC-01] The Python requirement is recorded separately. [CGC-20]

### 4. MCP applicability

**Supported.** Release-matched documentation identifies `cgc mcp start` as a stdio MCP server and lists its tools. This is documented applicability, not a live interoperability result. [CGC-06]

### 5. OpenCode

**Supported.** OpenCode's immutable documentation source defines local MCP entries with `type: "local"` and a command array; CGC's release-matched setup guide supplies `cgc mcp start`. The combined example is syntactic composition of two authoritative contracts and was not executed. [CGC-06, CGC-07]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "codegraphcontext": {
      "type": "local",
      "command": ["cgc", "mcp", "start"],
      "enabled": true
    }
  }
}
```

### 6. Pi

**Unsupported (Pi core).** Pi core explicitly omits native MCP. [CGC-08]

**Supported, untested (separate adapter).** The independently maintained `pi-mcp-adapter` `2.26.0` documents user-owned `.pi/mcp.json` stdio configuration. Composing that syntax with CGC's cited `cgc mcp start` command is supported by the two documented contracts but was not executed. Adapter installation, permissions, trust, updates, and removal remain outside Pi core and harnessctl. [CGC-06, CGC-09]

User-owned `.pi/mcp.json`:

```json
{
  "mcpServers": {
    "codegraphcontext": {
      "command": "cgc",
      "args": ["mcp", "start"]
    }
  }
}
```

### 7. Server mapping

**Supported.** Harnessctl maps an exact, user-owned MCP server name and does not own provider registration or lifecycle. [CGC-10]

```yaml
skills:
  sdlc-code-index:
    mcp_server: codegraphcontext
```

### 8. Lifecycle and storage

| Claim | Status | Evidence |
| --- | --- | --- |
| Embedded KuzuDB, LadybugDB, and FalkorDB Lite paths default under `~/.codegraphcontext/global/db/`. | Supported | CGC-11 |
| Remote FalkorDB, Neo4j, and Nornic are optional configured backends. | Supported | CGC-12 |
| File-hash caching and watcher controls support incremental updates. | Supported | CGC-13 |
| A time-based retention policy for local graph data is documented. | Unknown | CGC-U02 |

Lifecycle ownership remains with the user and provider. Harnessctl only consumes a configured server name. [CGC-10]

### 9. Credentials, privacy, telemetry, and security

| Required topic | Status | Narrow finding | Evidence |
| --- | --- | --- | --- |
| Network exposure and listening interfaces | Supported | Local stdio MCP and optional remote database endpoints are documented. | CGC-06, CGC-12 |
| Transport encryption | Unknown | The reviewed evidence does not establish one transport-encryption policy across all backends. | CGC-U03 |
| Authentication and authorization | Unknown | MCP client authentication and per-tool authorization remain unanswered. | CGC-U04 |
| Filesystem and process permissions | Unknown | Required OS permissions and process isolation remain unanswered. | CGC-U05 |
| Data egress and remote requests | Supported | Package discovery/download, public bundle loading, and remote database modes are documented network paths. | CGC-14 |
| Supply-chain posture | Ambiguous | PyPI digests and a source commit exist, but package `0.6.5` lacks a matching GitHub release identity. | CGC-03, CGC-15 |
| Telemetry and diagnostics | Unknown | Telemetry collection, payloads, and opt-out behavior remain unanswered. | CGC-U06 |
| Credentials and secret handling | Unknown | Environment-based database credentials are documented; storage permissions, redaction, and secret-store behavior remain unanswered. | CGC-16, CGC-U12 |
| Retention and deletion | Unknown | A time-based retention and deletion-verification contract remains unanswered. | CGC-U02 |
| Storage locations and ownership | Unknown | Embedded paths and remote endpoints are documented; ownership terms across local, remote, and bundle stores remain unanswered. | CGC-11, CGC-12, CGC-U13 |
| Models and databases | Supported | Tree-sitter/optional SCIP and multiple embedded or remote graph backends are documented. | CGC-17 |
| Sandboxing and isolation | Unknown | A built-in sandbox boundary remains unanswered. | CGC-U07 |
| Remote services and hosted processing | Unknown | Terms, ownership, retention, and processing rules for bundle/hosted surfaces remain unanswered. | CGC-U08 |

### 10. Capabilities and limitations

**Supported:** the MCP reference documents code ingestion, watchers, symbol search, relationship analysis, Cypher queries, repository statistics, bundle loading, and deletion tools. [CGC-18]

**Unknown:** deterministic ranking, recall guarantees, cross-repository graph semantics, and language-parity guarantees remain unanswered by the reviewed release evidence. [CGC-U09]

### 11. Stale-index behavior

**Supported:** watcher tools, file-hash caching, and optional auto-watch are documented freshness controls. [CGC-13]

**Unknown:** a mandatory query-time Git-head comparison or standardized stale-result warning remains unanswered. [CGC-U10]

### 12. Removal

Documentation examples only; not executed. `ALLOW_DB_DELETION` defaults to false and gates destructive database operations. Provider documentation exposes repository deletion and configuration paths, but complete verified cleanup across package, embedded/remote data, credentials, bundles, and host configuration is **Unknown**. [CGC-19, CGC-U11]

```bash
pip uninstall codegraphcontext
```

User-owned OpenCode configuration, the `.pi/mcp.json` entry, the separately installed adapter, and the harnessctl mapping require independent removal. Removing CGC does not remove or manage the adapter. Harnessctl performs none of these operations. [CGC-09, CGC-10]

### 13. Sources

| ID | Claim supported | Evidence status | Source URL | Source kind | Access date | Provider version, tag, or commit | Applicable component | Evidence excerpt or location | Qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CGC-01 | PyPI publishes `codegraphcontext` version `0.6.5`. | Supported | https://pypi.org/pypi/codegraphcontext/0.6.5/json | Registry | 2026-08-23 | `0.6.5` | Library | `info.name`, `info.version` | Registry metadata only; package was not installed. |
| CGC-02 | Source commit `39557ada...` declares project version `0.6.5`. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/pyproject.toml | Repository | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Library | `[project] version = "0.6.5"` | Applies to source, not GitHub release naming. |
| CGC-03 | Release identity is inconsistent between package/source `0.6.5` and GitHub release `v0.5.7`. | Ambiguous | https://pypi.org/pypi/codegraphcontext/0.6.5/json<br>https://github.com/CodeGraphContext/CodeGraphContext/releases/tag/v0.5.7 | Registry; Release | 2026-08-23 | `0.6.5`; `v0.5.7` | Library | Registry version and release tag | Both are authoritative for different release surfaces. |
| CGC-04 | CodeGraphContext source uses the MIT License. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/LICENSE | License | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Library | `MIT License` | Does not license dependencies or services. |
| CGC-05 | MIT redistribution requires retaining the copyright and permission notice. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/LICENSE | License | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Library | "The above copyright notice and this permission notice shall be included" | Engineering summary, not legal advice. |
| CGC-06 | `cgc mcp start` is the documented stdio MCP server command. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/getting-started/mcp-setup.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | "Command: `cgc`; Arguments: `mcp start`"; troubleshooting states stdin/stdout JSON-RPC | Not executed. |
| CGC-07 | OpenCode local MCP configuration uses `type: "local"` and a command array. | Supported | https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/web/src/content/docs/mcp-servers.mdx | Host docs | 2026-08-23 | `3a31c4ea801915c0b050df4b3842997ea62b6e93` | Other: OpenCode host | `## Local`; local options table | Host syntax only; provider interoperability was not executed. |
| CGC-08 | Pi core intentionally omits native MCP support. | Unsupported | https://github.com/badlogic/pi-mono/blob/a1f955e9f47fd3379b44f4aace65ab916c80519a/packages/coding-agent/README.md | Host docs | 2026-08-23 | `a1f955e9f47fd3379b44f4aace65ab916c80519a` | Other: Pi host | MCP omission/extension guidance in README | Does not evaluate third-party adapters. |
| CGC-09 | `pi-mcp-adapter` `2.26.0` documents user-owned `.pi/mcp.json` stdio server entries with `command` and `args`. | Supported | https://github.com/nicobailon/pi-mcp-adapter/blob/v2.26.0/README.md<br>https://registry.npmjs.org/pi-mcp-adapter/2.26.0 | Official docs; Registry | 2026-08-23 | `2.26.0` | Extension | README `.pi/mcp.json` and `mcpServers` configuration sections; registry version | Separate third-party extension; composition was not executed and does not establish first-party Pi MCP support. |
| CGC-10 | Harnessctl maps an exact configured MCP server name and does not own provider lifecycle. | Supported | docs/code-intelligence.md<br>docs/configuration.md | Official docs | 2026-08-23 | Workspace documentation at access date | Other: harnessctl | `skills.sdlc-code-index.mcp_server`; lifecycle boundary | Project-local authority. |
| CGC-11 | Embedded database paths default below `~/.codegraphcontext/global/db/`. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | `Embedded Database Directories` table | Paths are configurable. |
| CGC-12 | Remote FalkorDB, Neo4j, and Nornic backends are configurable. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | `Database Connection Configurations` | Security depends on selected deployment. |
| CGC-13 | File-hash cache and watcher controls support incremental updates. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | `CACHE_ENABLED`; `ENABLE_AUTO_WATCH` | Does not establish query-time stale detection. |
| CGC-14 | Package, bundle, and remote-database features are documented network paths. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | `add_package_to_graph`, `load_bundle`, registry tools | Payload scope was not runtime-observed. |
| CGC-15 | PyPI publishes SHA-256 distribution digests for `0.6.5`. | Supported | https://pypi.org/pypi/codegraphcontext/0.6.5/json | Registry | 2026-08-23 | `0.6.5` | Library | `urls[].digests.sha256` | Digest is integrity metadata, not full provenance. |
| CGC-16 | Database credentials may be supplied by environment configuration. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Neo4j/Nornic/Falkor password variables; env precedence | Secret-store and redaction behavior are not asserted. |
| CGC-17 | CGC documents Tree-sitter/SCIP and multiple graph backends. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/README.md | Repository | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | CLI | Architecture, database options, SCIP sections | Capability description was not benchmarked. |
| CGC-18 | The MCP reference lists ingestion, watcher, query, analysis, bundle, and deletion tools. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | MCP tool headings | Tool behavior was not executed. |
| CGC-19 | `ALLOW_DB_DELETION` defaults false and gates destructive operations. | Supported | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md | Official docs | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | CLI | `Destructive Operation Safety` | Does not prove complete cleanup. |
| CGC-20 | CodeGraphContext `0.6.5` requires Python 3.10 or newer. | Supported | https://pypi.org/pypi/codegraphcontext/0.6.5/json | Registry | 2026-08-23 | `0.6.5` | Library | `info.requires_python` | Runtime compatibility was not tested. |
| CGC-U01 | What licenses apply to optional databases, dependencies, bundles, and hosted services? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/README.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/pyproject.toml | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Other: dependencies/services | Searched `license`, `terms`, `bundle`, database dependency declarations | Repository MIT license cannot be extended to separate components. |
| CGC-U02 | What time-based retention and deletion-verification contract applies to graph data? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `retention`, `purge`, `delete`, `verify` | Paths and deletion controls do not answer retention duration or verification. |
| CGC-U03 | What transport-encryption policy applies across MCP and all database backends? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/getting-started/mcp-setup.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `TLS`, `SSL`, `transport`, `stdio`, backend connection settings | Falkor SSL setting does not establish a universal policy. |
| CGC-U04 | What MCP authentication and per-tool authorization model applies? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/getting-started/mcp-setup.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `auth`, `authorization`, `permission`, `token` | Database credentials are a separate question. |
| CGC-U05 | What filesystem permissions and process privileges are required? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/.github/SECURITY.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `permission`, `mode`, `privilege`, `filesystem` | No affirmative permission model is asserted. |
| CGC-U06 | What telemetry or diagnostic data is collected and how can it be disabled? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/README.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/.github/SECURITY.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | CLI | Searched `telemetry`, `analytics`, `diagnostics`, `tracking`, `opt out` | No absence claim is made. |
| CGC-U07 | What built-in sandbox or isolation boundary applies? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/.github/SECURITY.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `sandbox`, `isolation`, `container`, `seccomp`, `privilege` | Isolation guidance is not proof of a built-in sandbox. |
| CGC-U08 | What terms govern hosted bundle processing, ownership, and retention? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/web/src/pages/Privacy.tsx<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Hosted service | Searched `terms`, `ownership`, `retention`, `processing`, `bundle` | Website privacy text does not answer the hosted bundle contract. |
| CGC-U09 | What formal ranking, recall, cross-repository, and language-parity guarantees apply? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/README.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `recall`, `ranking`, `deterministic`, `cross repository`, `parity` | Capability lists are not quality guarantees. |
| CGC-U10 | Does every query perform Git-head stale-index detection or emit a standard warning? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `stale`, `git head`, `freshness`, `warning` | Watch controls do not answer query-time detection. |
| CGC-U11 | What procedure verifies complete removal across every component? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | CLI | Searched `uninstall`, `cleanup`, `purge`, `verify deletion` | Individual controls do not establish comprehensive cleanup. |
| CGC-U12 | How are credential files permissioned and secrets redacted or delegated to a secret store? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/.github/SECURITY.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Server | Searched `credential`, `secret`, `redact`, `permission`, `keyring` | Environment-variable support is narrower than a secret-handling contract. |
| CGC-U13 | What ownership terms apply across embedded data, remote databases, and bundles? | Unknown | https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/config.md<br>https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/reference/mcp.md | Search record | 2026-08-23 | `39557ada8ea88dfe23ff54cef1df1bedfa542b9a` | Other: storage/services | Searched `owner`, `ownership`, `rights`, `bundle`, backend storage | Configurable locations do not establish legal ownership. |

## GitNexus

### 1. Status and version

| Claim | Status | Evidence |
| --- | --- | --- |
| npm and release tag identify GitNexus `1.6.9` at commit `4227194ad7bdfbedc29a7fe20e09c6737ce0e744`. | Supported | GN-01, GN-02 |

### 2. License

| Claim | Status | Evidence |
| --- | --- | --- |
| GitNexus `v1.6.9` uses PolyForm Noncommercial License 1.0.0. | Supported | GN-03 |
| General commercial production use is granted by that license. | Unsupported | GN-04 |
| Dependencies and hosted/publish/wiki services share the repository license. | Unknown | GN-U01 |

### 3. Install and update

Documentation examples only; not executed:

```bash
npm install -g gitnexus@1.6.9
```

The package requires Node.js 22 or newer. A distinct authoritative update procedure was not established by the reviewed release evidence. [GN-20, GN-U15]

### 4. MCP applicability

**Supported.** Release-matched documentation identifies `gitnexus mcp` as the local MCP command. [GN-05]

### 5. OpenCode

**Supported.** OpenCode's immutable source documents local command arrays, and GitNexus documents `gitnexus mcp`. This composition was not executed. [GN-05, GN-06]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "gitnexus": {
      "type": "local",
      "command": ["gitnexus", "mcp"],
      "enabled": true
    }
  }
}
```

### 6. Pi

**Unsupported (Pi core).** Pi core omits native MCP. [GN-07]

**Supported, untested (separate adapter).** `pi-mcp-adapter` `2.26.0` documents user-owned `.pi/mcp.json` stdio configuration. Composing that syntax with GitNexus's cited `gitnexus mcp` command is supported by the two documented contracts but was not executed. Adapter installation, permissions, trust, updates, and removal remain separate from Pi core and harnessctl. [GN-05, GN-08]

User-owned `.pi/mcp.json`:

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "gitnexus",
      "args": ["mcp"]
    }
  }
}
```

### 7. Server mapping

**Supported.** The exact user-owned server name may be mapped; harnessctl does not register or manage it. [GN-09]

```yaml
skills:
  sdlc-code-index:
    mcp_server: gitnexus
```

### 8. Lifecycle and storage

| Claim | Status | Evidence |
| --- | --- | --- |
| Each analyzed checkout stores index data and caches in repository-local `<repo>/.gitnexus/`. | Supported | GN-10 |
| `~/.gitnexus/registry.json` is global MCP discovery metadata, not the index-data directory. | Supported | GN-11 |
| Browser mode uses OPFS storage. | Supported | GN-12 |
| Repository metadata files are atomically written with mode `0600`. | Supported | GN-13 |
| Global registry file permissions are `0600`. | Unknown | GN-U02 |

### 9. Credentials, privacy, telemetry, and security

| Required topic | Status | Narrow finding | Evidence |
| --- | --- | --- | --- |
| Network exposure and listening interfaces | Ambiguous | Local MCP plus optional serve/publish/wiki network surfaces are documented. | GN-05, GN-14 |
| Transport encryption | Unknown | A complete TLS policy for optional network surfaces remains unanswered. | GN-U03 |
| Authentication and authorization | Unknown | MCP and serve authorization contracts remain unanswered. | GN-U04 |
| Filesystem and process permissions | Unknown | Repository metadata temporary files use mode `0600`; broader index, registry, directory, and process permissions remain unanswered. | GN-13, GN-U02, GN-U14 |
| Data egress and remote requests | Ambiguous | Optional publish/wiki flows are remote; an exhaustive egress inventory remains unanswered. | GN-14, GN-U05 |
| Supply-chain posture | Supported | npm publishes package integrity, signatures, and provenance attestation metadata for `1.6.9`. | GN-15 |
| Telemetry and diagnostics | Unknown | `@scarf/scarf` is a dependency, but runtime collection, payload, and opt-out behavior remain unanswered. | GN-U06 |
| Credentials and secret handling | Unknown | Storage, redaction, and log handling for optional provider keys remain unanswered. | GN-U07 |
| Retention and deletion | Unknown | Hosted/browser retention and verified deletion remain unanswered. | GN-U08 |
| Storage locations and ownership | Unknown | Repository-local indexes, global discovery metadata, and browser OPFS locations are documented; ownership terms across local, browser, and remote stores remain unanswered. | GN-10, GN-11, GN-12, GN-U10 |
| Models and databases | Supported | Local embeddings and LadybugDB-backed index behavior are documented. | GN-16 |
| Sandboxing and isolation | Unknown | A built-in parser/process sandbox remains unanswered. | GN-U09 |
| Remote services and hosted processing | Unknown | Terms, ownership, and retention for publish/wiki/hosted processing remain unanswered. | GN-U10 |

### 10. Capabilities and limitations

**Supported:** GitNexus documents graph/context queries, impact analysis, execution processes, Cypher, change detection, and repository management. [GN-17]

**Unknown:** equal extraction fidelity across languages and formal retrieval-quality guarantees remain unanswered. [GN-U11]

### 11. Stale-index behavior

**Supported.** Release source compares indexed and current Git commits and classifies staleness. Re-analysis is the documented refresh path. [GN-18]

Dirty-worktree, rewritten-history, and concurrent-query semantics beyond the cited implementation are **Unknown**. [GN-U12]

### 12. Removal

Documentation examples only; not executed:

```bash
npm uninstall -g gitnexus
```

GitNexus has local clean/uninstall logic, but complete verified cleanup across repository-local `.gitnexus/`, global registry metadata, browser OPFS, published artifacts, credentials, and backups is **Unknown**. The user-owned `.pi/mcp.json` entry and separately installed adapter require independent removal; uninstalling GitNexus does not remove or manage the adapter. [GN-08, GN-19, GN-U13]

### 13. Sources

| ID | Claim supported | Evidence status | Source URL | Source kind | Access date | Provider version, tag, or commit | Applicable component | Evidence excerpt or location | Qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GN-01 | npm publishes GitNexus `1.6.9` from gitHead `4227194...`. | Supported | https://registry.npmjs.org/gitnexus/1.6.9 | Registry | 2026-08-23 | `1.6.9`; gitHead `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | `version`, `gitHead` | Package was not installed. |
| GN-02 | GitHub release `v1.6.9` corresponds to commit `4227194...`. | Supported | https://github.com/abhigyanpatwari/GitNexus/releases/tag/v1.6.9 | Release | 2026-08-23 | `v1.6.9`; `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Release tag and source link | Release notes are project-authored. |
| GN-03 | GitNexus `v1.6.9` uses PolyForm Noncommercial License 1.0.0. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/LICENSE | License | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | `PolyForm Noncommercial License 1.0.0` | Does not license dependencies/services. |
| GN-04 | General commercial production use is granted by the source license. | Unsupported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/LICENSE | License | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | `Noncommercial Purposes` and permitted-use sections | Legal review is required for a specific use. |
| GN-05 | `gitnexus mcp` is the documented MCP command. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Official docs | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | MCP setup section | Not executed. |
| GN-06 | OpenCode local MCP entries use a command array. | Supported | https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/web/src/content/docs/mcp-servers.mdx | Host docs | 2026-08-23 | `3a31c4ea801915c0b050df4b3842997ea62b6e93` | Other: OpenCode host | `## Local`; options table | Host syntax only. |
| GN-07 | Pi core omits native MCP. | Unsupported | https://github.com/badlogic/pi-mono/blob/a1f955e9f47fd3379b44f4aace65ab916c80519a/packages/coding-agent/README.md | Host docs | 2026-08-23 | `a1f955e9f47fd3379b44f4aace65ab916c80519a` | Other: Pi host | MCP omission/extension guidance | Does not evaluate adapters. |
| GN-08 | `pi-mcp-adapter` `2.26.0` documents user-owned `.pi/mcp.json` stdio server entries with `command` and `args`. | Supported | https://github.com/nicobailon/pi-mcp-adapter/blob/v2.26.0/README.md<br>https://registry.npmjs.org/pi-mcp-adapter/2.26.0 | Official docs; Registry | 2026-08-23 | `2.26.0` | Extension | README `.pi/mcp.json` and `mcpServers` configuration sections; registry version | Separate third-party extension; composition was not executed and does not establish first-party Pi MCP support. |
| GN-09 | Harnessctl maps an exact configured MCP server name without lifecycle ownership. | Supported | docs/code-intelligence.md<br>docs/configuration.md | Official docs | 2026-08-23 | Workspace documentation at access date | Other: harnessctl | `skills.sdlc-code-index.mcp_server` | Project-local authority. |
| GN-10 | Index data and caches are repository-local under `<repo>/.gitnexus/`. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/storage/repo-manager.ts | Repository | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | `getStoragePath`; `getStoragePaths`; file header | Applies per checkout/worktree. |
| GN-11 | `~/.gitnexus/registry.json` stores global MCP discovery metadata. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/storage/repo-manager.ts | Repository | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | `Global registry at ~/.gitnexus/registry.json for MCP server discovery` | Registry is not the repository index directory. |
| GN-12 | Browser mode uses OPFS for local index storage. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Official docs | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Library | Browser/local storage section | Browser storage lifecycle differs from CLI. |
| GN-13 | Repository metadata temporary files use exclusive creation and mode `0600`. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/storage/repo-manager.ts | Repository | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | `writeMetaFile`: `fs.open(tmpPath, 'wx', 0o600)` | This does not establish global registry permissions. |
| GN-14 | Publish, wiki, and serve features introduce optional remote/network surfaces. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Official docs | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Publish, wiki, and serve sections | Does not enumerate every request. |
| GN-15 | npm publishes integrity, signature, and provenance metadata for `1.6.9`. | Supported | https://registry.npmjs.org/gitnexus/1.6.9 | Registry | 2026-08-23 | `1.6.9` | CLI | `dist.integrity`, `dist.signatures`, `dist.attestations` | Registry metadata; not an independent audit. |
| GN-16 | GitNexus documents local embeddings and a LadybugDB-backed index. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Official docs | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Architecture/storage sections | Optional wiki models are separate. |
| GN-17 | GitNexus documents context, impact, process, Cypher, change, and repository tools. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Official docs | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | MCP tool reference | Tools were not executed. |
| GN-18 | Git staleness logic compares current and indexed commits. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/core/git-staleness.ts | Repository | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Commit comparison and status classification | No behavior beyond source is inferred. |
| GN-19 | GitNexus implements local clean/uninstall operations. | Supported | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/cli/uninstall.ts | Repository | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Uninstall implementation | Does not cover browser, remote, or backups. |
| GN-20 | GitNexus `1.6.9` requires Node.js 22 or newer. | Supported | https://registry.npmjs.org/gitnexus/1.6.9 | Registry | 2026-08-23 | `1.6.9` | CLI | `engines.node` | Runtime compatibility was not tested. |
| GN-U01 | What licenses govern dependencies and publish/wiki/hosted services? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/package.json<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Other: dependencies/services | Searched `license`, `terms`, `publish`, `wiki`, `hosted` | Repository license is not extended to separate components. |
| GN-U02 | What permissions are applied to `~/.gitnexus/registry.json`? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/storage/repo-manager.ts | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | Reviewed `writeRegistry`; searched `mode`, `chmod`, `0600` | `0600` applies to metadata temp files, not this registry writer. |
| GN-U03 | What TLS policy applies to serve, publish, and wiki network surfaces? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/SECURITY.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | Searched `TLS`, `HTTPS`, `certificate`, `transport` | No universal transport claim is made. |
| GN-U04 | What MCP and serve authentication/authorization model applies? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/SECURITY.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | Searched `auth`, `authorization`, `token`, `permission` | No affirmative auth model is asserted. |
| GN-U05 | What exhaustive data-egress inventory applies? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/package.json | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched `network`, `publish`, `wiki`, `request`, dependency list | Optional remote features do not answer all runtime requests. |
| GN-U06 | Does `@scarf/scarf` execute, and what telemetry payload/opt-out applies? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/package.json<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Found dependency; searched `telemetry`, `analytics`, `scarf`, `opt out` | Dependency presence is not evidence of execution. |
| GN-U07 | How are optional provider keys stored, redacted, and logged? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/SECURITY.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched `API key`, `credential`, `redact`, `log`, `secret` | Key use does not establish handling guarantees. |
| GN-U08 | What retention and verified deletion apply to browser and remote artifacts? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/cli/uninstall.ts | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Other: browser/hosted | Searched `retention`, `delete`, `OPFS`, `published`, `verify` | Local uninstall does not answer other stores. |
| GN-U09 | What built-in sandbox isolates parsing and subprocesses? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/SECURITY.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched `sandbox`, `isolation`, `seccomp`, `privilege` | No absence claim is made. |
| GN-U10 | What terms govern hosted processing, ownership, and retention? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/SECURITY.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Hosted service | Searched `terms`, `privacy`, `ownership`, `DPA`, `retention` | Feature docs are not hosted-service terms. |
| GN-U11 | What language-parity and retrieval-quality guarantees apply? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | Server | Searched `parity`, `recall`, `precision`, `guarantee`, `benchmark` | Language support is not a parity guarantee. |
| GN-U12 | How do dirty worktrees, rewritten history, and concurrent queries affect freshness? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/core/git-staleness.ts | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched implementation for dirty worktree, rewrite, concurrent query semantics | Only cited commit-comparison behavior is asserted. |
| GN-U13 | What procedure verifies complete cleanup across all GitNexus stores? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/cli/uninstall.ts<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched `clean`, `uninstall`, `OPFS`, `published`, `backup`, `verify` | Local operations do not establish comprehensive verification. |
| GN-U14 | What permissions and privileges apply beyond repository metadata temporary files? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/storage/repo-manager.ts<br>https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/SECURITY.md | Search record | 2026-08-23 | `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched `mode`, `chmod`, `permission`, `privilege`, `process` | The cited `0600` write is a narrow metadata implementation detail. |
| GN-U15 | What authoritative update procedure applies to GitNexus `1.6.9`? | Unknown | https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/README.md<br>https://github.com/abhigyanpatwari/GitNexus/releases/tag/v1.6.9 | Search record | 2026-08-23 | `1.6.9`; `4227194ad7bdfbedc29a7fe20e09c6737ce0e744` | CLI | Searched install, upgrade, and release instructions for an explicit update procedure | Reinstalling a pin is not asserted as an official update workflow. |

## Graphify

### 1. Status and version

| Claim | Status | Evidence |
| --- | --- | --- |
| PyPI and source identify package `graphifyy` version `0.9.48` at tag `v0.9.48`. | Supported | GF-01, GF-02 |
| The security policy's supported-version table applies coherently to `0.9.48`. | Ambiguous | GF-03 |

### 2. License

| Claim | Status | Evidence |
| --- | --- | --- |
| Graphify `v0.9.48` declares Apache-2.0. | Supported | GF-04 |
| Distribution includes `LICENSE`, `NOTICE`, and `LICENSE-MIT`. | Supported | GF-05 |
| The exact file-level scope of retained MIT material is established. | Ambiguous | GF-06 |
| External model providers and hosted services share Apache-2.0. | Unknown | GF-U01 |

### 3. Install and update

Documentation examples only; not executed. MCP requires the documented `mcp` extra. [GF-07]

```bash
uv tool install "graphifyy[mcp]==0.9.48"
uv tool upgrade graphifyy
```

### 4. MCP applicability

**Supported.** Graphify `v0.9.48` declares the `mcp` optional dependency and documents the stdio command `python -m graphify.serve graphify-out/graph.json`. [GF-07, GF-08] `pyproject.toml` separately exposes the `graphify-mcp` script. [GF-28]

### 5. OpenCode

**Supported.** OpenCode's immutable source supports a local command array. The provider command requires a graph path and the `mcp` extra; this composition was not executed. [GF-07, GF-09]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "graphify": {
      "type": "local",
      "command": ["python", "-m", "graphify.serve", "graphify-out/graph.json"],
      "enabled": true
    }
  }
}
```

### 6. Pi

**Unsupported (Pi core).** Graphify's documented Pi assistant skill is not native Pi MCP support, and Pi core omits native MCP. [GF-10, GF-11]

**Supported, untested (separate adapter).** `pi-mcp-adapter` `2.26.0` documents user-owned `.pi/mcp.json` stdio configuration. Composing that syntax with Graphify's cited `python -m graphify.serve graphify-out/graph.json` command is supported by the two documented contracts but was not executed. The `graphifyy[mcp]` extra and an existing graph remain prerequisites. Adapter installation, permissions, trust, updates, and removal remain separate from Pi core, Graphify's Pi skill, and harnessctl. [GF-07, GF-08, GF-12]

User-owned `.pi/mcp.json`:

```json
{
  "mcpServers": {
    "graphify": {
      "command": "python",
      "args": ["-m", "graphify.serve", "graphify-out/graph.json"]
    }
  }
}
```

### 7. Server mapping

**Supported.** The exact user-owned OpenCode server name may be mapped; harnessctl does not install Graphify, build `graphify-out/`, or start the server. [GF-13]

```yaml
skills:
  sdlc-code-index:
    mcp_server: graphify
```

### 8. Lifecycle and storage

| Claim | Status | Evidence |
| --- | --- | --- |
| Default generated artifacts are written to repository-local `graphify-out/`. | Supported | GF-14 |
| `graphify-out/` is documented as intended for commit to Git. | Supported | GF-15 |
| Query logging has one unambiguous documented default. | Ambiguous | GF-16 |
| A time-based retention policy for output and logs is documented. | Unknown | GF-U02 |

### 9. Credentials, privacy, telemetry, and security

| Required topic | Status | Narrow finding | Evidence |
| --- | --- | --- | --- |
| Network exposure and listening interfaces | Supported | stdio is default; HTTP defaults to `127.0.0.1`, with configurable host/port. | GF-17, GF-29 |
| Transport encryption | Unknown | A TLS termination or encryption contract for HTTP remains unanswered. | GF-U03 |
| Authentication and authorization | Unknown | HTTP API-key authentication is documented; per-tool authorization, stdio trust boundaries, and key lifecycle remain unanswered. | GF-18, GF-U10 |
| Filesystem and process permissions | Unknown | Output/log file modes and required process privileges remain unanswered. | GF-U04 |
| Data egress and remote requests | Supported | Code AST processing is documented local; docs/PDFs/images may be sent to configured model providers. | GF-19 |
| Supply-chain posture | Ambiguous | PyPI digests and release metadata exist; complete signed provenance remains unanswered. | GF-20, GF-U05 |
| Telemetry and diagnostics | Supported | The release README states "No telemetry, no usage tracking, no analytics." | GF-21 |
| Credentials and secret handling | Unknown | Model/API environment variables are documented; storage, redaction, and secret-store behavior remain unanswered. | GF-22, GF-U11 |
| Retention and deletion | Unknown | Retention, rotation, backup, and deletion-verification rules remain unanswered. | GF-U02 |
| Storage locations and ownership | Unknown | `graphify-out/` and query-log locations are documented; ownership terms for local, committed, model-provider, and hosted copies remain unanswered. | GF-14, GF-16, GF-U12 |
| Models and databases | Supported | Optional model backends and Neo4j/FalkorDB extras are documented. | GF-23 |
| Sandboxing and isolation | Unknown | Target-source non-execution is documented; a built-in OS/process sandbox remains unanswered. | GF-24, GF-U13 |
| Remote services and hosted processing | Unknown | Hosted-platform terms, ownership, and retention remain unanswered. | GF-U06 |

The query-log default conflict remains **Ambiguous**: the environment-variable table says logging is off unless enabled, while the Privacy section says every query is logged by default. [GF-16]

### 10. Capabilities and limitations

**Supported:** Graphify documents local AST graph extraction, graph query/path/explain operations, MCP tools, and optional document/media enrichment. [GF-25]

**Unknown:** language-parity and deterministic retrieval guarantees remain unanswered. [GF-U07]

### 11. Stale-index behavior

**Supported:** `--update`, `--watch`, and post-commit hook workflows are documented freshness controls. [GF-26]

**Unknown:** mandatory query-time Git-head validation and a standardized stale-result warning remain unanswered. [GF-U08]

### 12. Removal

Documentation examples only; not executed:

```bash
graphify uninstall
graphify uninstall --purge
```

`--purge` is documented to remove `graphify-out/`. Complete verified removal across package installation, query logs, credentials, external providers, backups, and host configuration is **Unknown**. The user-owned `.pi/mcp.json` entry and separately installed adapter require independent removal; Graphify removal does not remove or manage the adapter. [GF-12, GF-27, GF-U09]

### 13. Sources

| ID | Claim supported | Evidence status | Source URL | Source kind | Access date | Provider version, tag, or commit | Applicable component | Evidence excerpt or location | Qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GF-01 | PyPI publishes `graphifyy` version `0.9.48`. | Supported | https://pypi.org/pypi/graphifyy/0.9.48/json | Registry | 2026-08-23 | `0.9.48` | Library | `info.name`, `info.version` | Package was not installed. |
| GF-02 | Source tag `v0.9.48` declares version `0.9.48`. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Repository | 2026-08-23 | `v0.9.48`; `b2cd36267456c166788c95be6e68574064a92a42` | Library | `[project] version = "0.9.48"` | Source identity matches registry version. |
| GF-03 | Security support status for release `0.9.48` is contradictory. | Ambiguous | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/SECURITY.md<br>https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.48 | Security policy; Release | 2026-08-23 | `v0.9.48`; `b2cd36267456c166788c95be6e68574064a92a42` | Library | Security table lists `0.3.x`; release is `0.9.48` | Conflict is preserved, not labeled stale without policy evidence. |
| GF-04 | Graphify `v0.9.48` declares Apache-2.0. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Repository | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Library | `license = "Apache-2.0"` | Does not license external services. |
| GF-05 | Distribution declares `LICENSE`, `LICENSE-MIT`, and `NOTICE` as license files. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Repository | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Library | `license-files` list | Redistribution must preserve applicable notices. |
| GF-06 | Exact file-level scope of retained MIT material is not identified by the package declaration. | Ambiguous | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/LICENSE-MIT<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/NOTICE | License | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Library | Retained MIT text and NOTICE | No broader scope is inferred. |
| GF-07 | MCP support requires optional extra `graphifyy[mcp]`. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Official docs; Repository | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | Optional extras table; `[project.optional-dependencies].mcp` | Base package alone is not represented as sufficient. |
| GF-08 | The documented stdio server command is `python -m graphify.serve graphify-out/graph.json`. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | `Using the graph directly` | Requires an existing graph path; not executed. |
| GF-09 | OpenCode local MCP entries use a command array. | Supported | https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/web/src/content/docs/mcp-servers.mdx | Host docs | 2026-08-23 | `3a31c4ea801915c0b050df4b3842997ea62b6e93` | Other: OpenCode host | `## Local`; options table | Host syntax only. |
| GF-10 | Graphify documents installation of a Pi assistant skill. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Extension | Platform table: `graphify install --platform pi` | A skill is not native Pi MCP support. |
| GF-11 | Pi core omits native MCP. | Unsupported | https://github.com/badlogic/pi-mono/blob/a1f955e9f47fd3379b44f4aace65ab916c80519a/packages/coding-agent/README.md | Host docs | 2026-08-23 | `a1f955e9f47fd3379b44f4aace65ab916c80519a` | Other: Pi host | MCP omission/extension guidance | Does not evaluate adapters. |
| GF-12 | `pi-mcp-adapter` `2.26.0` documents user-owned `.pi/mcp.json` stdio server entries with `command` and `args`. | Supported | https://github.com/nicobailon/pi-mcp-adapter/blob/v2.26.0/README.md<br>https://registry.npmjs.org/pi-mcp-adapter/2.26.0 | Official docs; Registry | 2026-08-23 | `2.26.0` | Extension | README `.pi/mcp.json` and `mcpServers` configuration sections; registry version | Separate third-party extension; composition was not executed and does not establish first-party Pi MCP support. |
| GF-13 | Harnessctl maps an exact configured MCP server name without lifecycle ownership. | Supported | docs/code-intelligence.md<br>docs/configuration.md | Official docs | 2026-08-23 | Workspace documentation at access date | Other: harnessctl | `skills.sdlc-code-index.mcp_server` | Project-local authority. |
| GF-14 | Generated artifacts default to repository-local `graphify-out/`. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | `Get started`: `graphify-out/` tree | The path has no leading dot. |
| GF-15 | `graphify-out/` is documented as intended for commit to Git. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | `Team setup` | Cost/cache subpaths have separate guidance. |
| GF-16 | Query-log default is contradictory within the release README. | Ambiguous | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Environment table says off by default; Privacy says every query is logged | Runtime behavior was not probed. |
| GF-17 | MCP transport defaults to stdio. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | `Shared HTTP server`: `--transport {stdio,http}` default `stdio` | Not executed. |
| GF-18 | HTTP transport supports API-key authentication. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | `--api-key`; Authorization/X-API-Key text | Does not establish per-tool authorization or TLS. |
| GF-19 | Code AST processing is local, while docs/PDFs/images may use configured model providers. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | `Privacy` section | Provider terms remain separate. |
| GF-20 | PyPI publishes SHA-256 digests for `graphifyy` `0.9.48`. | Supported | https://pypi.org/pypi/graphifyy/0.9.48/json | Registry | 2026-08-23 | `0.9.48` | Library | `urls[].digests.sha256` | Digest is not full signed provenance. |
| GF-21 | Release README states no telemetry, usage tracking, or analytics. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Privacy bullet: "No telemetry, no usage tracking, no analytics." | Documentation claim; not runtime-probed. |
| GF-22 | Model/API credentials are configured through named environment variables. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Environment variables table | Storage/redaction guarantees are not inferred. |
| GF-23 | Optional model, Neo4j, and FalkorDB dependencies are documented. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Repository | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Library | `[project.optional-dependencies]` | Separate licenses and terms apply. |
| GF-24 | The security policy states Graphify parses target source without importing or executing it. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/SECURITY.md | Security policy | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Source-processing security section | This is narrower than an OS sandbox claim. |
| GF-25 | Graphify documents graph extraction, query/path/explain, MCP tools, and optional media enrichment. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | `What it does`, `Using the graph directly` | Capabilities were not executed. |
| GF-26 | `--update`, `--watch`, and hook workflows are documented freshness controls. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Common/full command reference and team setup | Does not establish query-time stale detection. |
| GF-27 | `graphify uninstall --purge` also deletes `graphify-out/`. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Install/removal and command-reference sections | Command was not executed. |
| GF-28 | Graphify declares a `graphify-mcp` console script. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Repository | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | `[project.scripts] graphify-mcp = "graphify.serve:_main"` | Script arguments still require provider documentation. |
| GF-29 | HTTP MCP defaults to host `127.0.0.1` and port `8080`. | Supported | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Official docs | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | `Shared HTTP server` flags table | Non-loopback exposure is optional. |
| GF-U01 | What licenses govern model providers and hosted Graphify services? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Other: providers/services | Searched `license`, `terms`, model providers, hosted platform | Apache-2.0 is not extended to external services. |
| GF-U02 | What retention, rotation, backup, and deletion-verification rules apply to outputs and logs? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/graphify/querylog.py | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `retention`, `rotation`, `backup`, `delete`, `purge`, `verify` | Locations and purge command do not answer full lifecycle. |
| GF-U03 | What TLS termination or transport-encryption contract applies to HTTP MCP? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/graphify/serve.py | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | Searched `TLS`, `HTTPS`, `certificate`, `SSL` | API-key support does not imply transport encryption. |
| GF-U04 | What file modes and process privileges apply to output and logs? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/SECURITY.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/graphify/querylog.py | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `permission`, `mode`, `chmod`, `privilege` | No affirmative file-mode claim is made. |
| GF-U05 | What complete signed provenance or attestation applies to PyPI artifacts? | Unknown | https://pypi.org/pypi/graphifyy/0.9.48/json<br>https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.48 | Search record | 2026-08-23 | `0.9.48`; `v0.9.48` | Library | Checked registry digests and release metadata; searched `attestation`, `provenance`, `signature` | Digests and CI are narrower evidence. |
| GF-U06 | What hosted-platform terms govern processing, ownership, retention, and deletion? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Hosted service | Searched `terms`, `ownership`, `retention`, `DPA`, `deletion` around graphify.com/app links | Product links are not service terms. |
| GF-U07 | What language-parity and deterministic retrieval guarantees apply? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `parity`, `deterministic`, `guarantee`, benchmark qualifications | Capability/benchmark claims do not answer parity. |
| GF-U08 | Does every query validate Git head or emit a standardized stale warning? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `stale`, `git head`, `freshness`, `warning`; reviewed update/watch/hooks | Refresh controls do not answer query-time validation. |
| GF-U09 | What procedure verifies complete removal across every Graphify component and external provider? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `uninstall`, `purge`, `query log`, `credentials`, `provider`, `backup` | `--purge` has narrower documented scope. |
| GF-U10 | What complete authentication, authorization, and key-lifecycle model applies to stdio and HTTP MCP? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/graphify/serve.py | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Server | Searched `auth`, `authorization`, `API key`, `permission`, `key rotation` | HTTP API-key support is narrower than the complete question. |
| GF-U11 | How are model/API credentials stored, redacted, and delegated to secret stores? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/SECURITY.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `credential`, `secret`, `redact`, `keyring`, `log` | Environment-variable names do not establish handling guarantees. |
| GF-U12 | What ownership terms apply to local, committed, provider-processed, and hosted graph copies? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | Other: storage/services | Searched `owner`, `ownership`, `rights`, `commit`, `hosted`, model-provider sections | Documented locations do not establish ownership terms. |
| GF-U13 | What built-in OS or process sandbox contains Graphify itself? | Unknown | https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/SECURITY.md<br>https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md | Search record | 2026-08-23 | `b2cd36267456c166788c95be6e68574064a92a42` | CLI | Searched `sandbox`, `isolation`, `container`, `seccomp`, `privilege` | Not executing target source is not an OS sandbox guarantee. |

## Cross-Provider Comparison

| Provider | Version/evidence date | MCP applicability | License/component | OpenCode | Pi | Index/storage ownership | Network/data egress | Telemetry | Stale-index behavior | Evidence limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [CodeGraphContext](#codegraphcontext) | **Ambiguous:** package/source `0.6.5`, release `v0.5.7`; 2026-08-23 [CGC-03] | **Supported:** `cgc mcp start` [CGC-06] | **Supported:** MIT, source [CGC-04, CGC-05]; **Unknown:** separate components [CGC-U01] | **Supported:** immutable host syntax plus provider command [CGC-06, CGC-07] | **Unsupported:** Pi core; **Supported, untested:** adapter `2.26.0` composition [CGC-08, CGC-09] | **Unknown:** locations are documented; ownership terms are unresolved [CGC-11, CGC-12, CGC-U13] | **Supported:** documented local/remote paths; **Unknown:** universal encryption [CGC-14, CGC-U03] | **Unknown** [CGC-U06] | **Supported:** watch/cache controls; **Unknown:** query-time stale warning [CGC-13, CGC-U10] | Release identity conflict; security, retention, sandbox, hosted terms, and adapter trust/lifecycle remain unresolved [CGC-03, CGC-09, CGC-U02, CGC-U07, CGC-U08] |
| [GitNexus](#gitnexus) | **Supported:** `1.6.9`; 2026-08-23 [GN-01, GN-02] | **Supported:** `gitnexus mcp` [GN-05] | **Supported:** PolyForm Noncommercial 1.0.0, CLI; **Unsupported:** general commercial grant [GN-03, GN-04] | **Supported:** immutable host syntax plus provider command [GN-05, GN-06] | **Unsupported:** Pi core; **Supported, untested:** adapter `2.26.0` composition [GN-07, GN-08] | **Unknown:** locations are documented; cross-store ownership is unresolved [GN-10, GN-11, GN-12, GN-U10] | **Ambiguous:** optional remote features; exhaustive egress/TLS unresolved [GN-14, GN-U03, GN-U05] | **Unknown:** Scarf behavior unresolved [GN-U06] | **Supported:** indexed/current commit comparison [GN-18] | Noncommercial license; auth, credential, hosted, cleanup, and adapter trust/lifecycle contracts remain unresolved [GN-04, GN-08, GN-U04, GN-U07, GN-U10, GN-U13] |
| [Graphify](#graphify) | **Ambiguous:** `0.9.48` with conflicting security support table; 2026-08-23 [GF-02, GF-03] | **Supported:** `graphifyy[mcp]` plus documented serve command [GF-07, GF-08] | **Supported:** Apache-2.0, library; **Ambiguous:** retained MIT scope [GF-04, GF-05, GF-06] | **Supported:** immutable host syntax plus provider command [GF-08, GF-09] | **Unsupported:** Pi core; **Supported, untested:** adapter `2.26.0` composition [GF-10, GF-11, GF-12] | **Unknown:** `graphify-out/` is documented; cross-copy ownership is unresolved [GF-14, GF-15, GF-U12] | **Supported:** code-local and optional model egress documented; **Unknown:** HTTP TLS [GF-19, GF-U03] | **Supported:** README says no telemetry [GF-21] | **Supported:** update/watch/hooks; **Unknown:** query-time stale warning [GF-26, GF-U08] | Security-version and query-log conflicts; retention, hosted, cleanup, and adapter trust/lifecycle contracts remain unresolved [GF-03, GF-12, GF-16, GF-U02, GF-U06, GF-U09] |

## Handoff to hrn-00113

### Required caveats

- The accidental GitNexus `list_repos` invocation is an unresolved acceptance exception; its output is quarantined from all claims.
- CodeGraphContext package/source `0.6.5` conflicts with GitHub release `v0.5.7`.
- GitNexus is PolyForm Noncommercial 1.0.0; do not describe it as generally commercially permitted.
- Graphify `0.9.48` conflicts with its security support table, and its query-log default is internally contradictory.
- Pi core MCP support remains `Unsupported`; composed stdio syntax through separately maintained `pi-mcp-adapter` `2.26.0` is `Supported` but untested and is not first-party Pi support.
- Adapter installation, permissions, trust, updates, and removal remain separate lifecycle concerns.
- Unknown security, privacy, retention, hosted-service, and cleanup questions must remain `Unknown`; absence is not evidence.

### Publication constraints

1. Preserve provider command evidence separately from host syntax evidence.
2. Use the immutable OpenCode source permalink cited above.
3. Pi examples must be labeled user-owned `.pi/mcp.json`, cite adapter `2.26.0`, and state that composition is untested.
4. Preserve GitNexus storage wording exactly: indexes are repository-local `<repo>/.gitnexus/`, while `~/.gitnexus/registry.json` is global discovery metadata.
5. Preserve Graphify output wording exactly as `graphify-out/`.
6. State that Graphify MCP requires `graphifyy[mcp]` and an existing graph path.
7. Keep harnessctl lifecycle-neutral: it maps a server name but does not install, recognize, start, stop, index, or remove providers or adapters.
8. Never describe adapter-based composition as native or first-party Pi MCP support.
