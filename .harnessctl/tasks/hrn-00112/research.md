# Repository-context and indexing MCP provider research

- Task: `hrn-00112`
- Access date: `2026-08-23` UTC
- Evidence policy: `.harnessctl/tasks/hrn-00110/evidence-policy.md`

This is a research handoff, not installation guidance or a provider
recommendation. No provider software was installed, executed, probed, indexed,
configured, updated, or removed, and no live MCP handshake was performed.
Commands quoted below are provider or host documentation, not commands run during
research.

Status words have the meanings defined by the evidence policy. Provider commands
and server names come from provider evidence; OpenCode object shape comes from
OpenCode documentation. Pi core has no native MCP host syntax. The Pi examples in
this artifact instead use the documented `.pi/mcp.json` shape owned by the
separately maintained `pi-mcp-adapter` v2.26.0; they do not attribute MCP support
to Pi core. In every supported host case, the user-selected server key is the
value to place in the provider-neutral
`skills.sdlc-code-index.mcp_server` contract. Harnessctl does not register, start,
stop, or remove that external server.

## Task comparison matrix

| Provider | Version/evidence date | MCP applicability | License/component | OpenCode | Pi | Index/storage ownership | Network/data egress | Telemetry | Stale-index behavior | Evidence limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [Repomix](#repomix) | **Supported**: v1.18.0; evidence 2026-08-23 ([R1]) | **Supported**: current documentation describes an experimental MCP repository packer; release applicability is **Unknown** ([R3]) | **Supported**: MIT npm CLI/MCP package; separate-component terms are **Unknown** ([R2], [R23]) | **Supported**: local command array; user-owned key ([R9]) | **Supported**: composed through separately maintained `pi-mcp-adapter` v2.26.0; Pi core is separately **Unsupported** ([H2], [H4], [H5]) | **Unknown**: documented tools pack and search snapshots, but evidence does not establish whether another persistent index exists ([R3]) | **Supported**: local packing is offline after install; remote packing is optional and sandbox disables it ([R18]) | **Supported**: CLI policy says no telemetry or repository-data transmission; local diagnostics retention is **Unknown** ([R7], [R16]) | **Unknown**: documented snapshots require repacking after changes; no broader persistent-index freshness contract is established ([R3]) | **Unknown**: authentication, remote TLS, output storage, retention, deletion, broad process permissions, hosted terms, and separate-component licenses ([R10], [R14], [R21], [R22], [R23]) |
| [FastCode](#fastcode) | **Supported**: v1.0.1; evidence 2026-08-23 ([F1]) | **Supported**: stdio default and optional SSE ([F3]) | **Ambiguous**: README says MIT; root license lookups fail at release and current-main commits ([F2]) | **Supported**: local command array composed from host and provider evidence ([H1], [F3]) | **Supported**: composed through separately maintained `pi-mcp-adapter` v2.26.0; Pi core is separately **Unsupported** ([H2], [H4], [H5]) | **Unknown**: local clone/index/cache/log paths and optional Redis are documented, but ownership terms are not ([F5], [F8], [F15], [F21]) | **Supported**: configured LLM calls and URL cloning can use the network; SSE may listen on a port ([F3], [F5], [F10]) | **Unknown**: no telemetry policy found ([F17]) | **Supported**: v1.0.1 skips refresh when FAISS and metadata files exist ([F4]) | **Unknown**: auth/TLS, process permissions, telemetry, sandboxing, complete removal, storage ownership, and exact root license terms ([F2], [F13], [F17], [F18], [F19], [F20], [F24], [F25], [F26], [F27]) |
| [CocoIndex](#cocoindex) | **Supported**: `cocoindex-code` v0.2.41; evidence 2026-08-23 ([C1]) | **Supported**: `ccc mcp` stdio server ([C4]) | **Supported**: Apache-2.0 `cocoindex-code` package ([C3]) | **Supported**: provider-published JSON matches host schema ([C14], [H1]) | **Supported**: composed through separately maintained `pi-mcp-adapter` v2.26.0; Pi core is separately **Unsupported** ([H2], [H4], [H5]) | **Unknown**: project settings/database paths and remapping are documented, but ownership terms are not ([C6]) | **Supported**: local model option; LiteLLM/cloud options send embedding input to configured providers ([C7]) | **Supported**: anonymous usage telemetry, documented exclusions, and opt-out ([C8]) | **Supported**: search refreshes incrementally by default; disabling refresh permits stale results ([C9]) | **Unknown**: auth, IPC encryption, process permissions, storage ownership, native sandbox, hosted terms, model licenses, and telemetry retention ([C12], [C16], [C17], [C18], [C19], [C29]) |

Matrix cells are condensed from the linked provider citation records. Host records
[H1]-[H5] are shared across providers.

## Repomix

### 1. Status and version

- **Supported.** The latest official release checked is v1.18.0, published
   2026-08-08, tag commit `c4c80eb8ab3fad8c60f23ff9280f3f2c65789379`.
  [R1]
- Applicable component: the `repomix` npm CLI package and its built-in MCP mode.
  [R1]

### 2. License

- **Supported:** SPDX `MIT` for the v1.18.0 npm CLI/MCP package. The tag's
  `LICENSE`, `package.json`, and npm metadata agree. [R2]
- Redistribution permits use, copying, modification, merging, publication,
  distribution, sublicensing, and sale, provided the copyright and permission
  notice remain in copies or substantial portions. [R11]

### 3. Install and update

- Official documentation offers npm/npx, yarn, Bun, Homebrew, and Docker. The
  package requires Node `>=22.0.0`; npm v1.18.0 has an integrity value, registry
  signature, and SLSA provenance attestation link. [R19], [R5]
- Official update commands are package-manager-specific; npm's documented command
  is `npm update -g repomix`. Research did not run any command. [R6]
- Examples below use an explicit version rather than `latest` or an untagged
  container so the documented composition is reproducible. This is a research
  qualification, not a provider guarantee.

### 4. MCP applicability

- **Supported** for repository-context use. Current official documentation
  describes MCP mode with `--mcp`, packing, packed-output read/search, and
  sandbox-only filesystem tools, and labels MCP experimental. Applicability to
  release v1.18.0 is **Unknown** because that page is unversioned. [R3]
- Persistent code-index applicability is **Unknown**. The cited material describes
  packaging and searching generated output, but it does not establish whether
  another persistent index exists. [R3]

### 5. OpenCode

- **Supported** host syntax. Provider command provenance is Repomix's documented
  `npx -y repomix --mcp`; host object-shape provenance is OpenCode's local MCP
  schema. [R3], [R9], [H1]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "repomix": {
      "type": "local",
      "command": ["npx", "-y", "repomix@1.18.0", "--mcp", "--sandbox"],
      "enabled": true
    }
  }
}
```

The pinned version and `--sandbox` are narrowed research choices. The user owns
this OpenCode configuration and maps the chosen key `repomix` to
`skills.sdlc-code-index.mcp_server`. Harnessctl does not recognize or launch it.

### 6. Pi

- Pi core applicability is **Unsupported**. Current official Pi documentation
  states “No MCP” and directs users to build an extension for MCP support. [H2]
- Composed applicability through the separately maintained `pi-mcp-adapter`
  v2.26.0 is **Supported** for the documented command/arguments configuration
  shape. Repomix does not maintain this adapter, and no live operation was tested.
  The user owns adapter installation, trust, and lifecycle. [R3], [H3], [H4],
  [H5]
- User-managed `.pi/mcp.json` example using the adapter-owned schema:

```json
{
  "mcpServers": {
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix@1.18.0", "--mcp", "--sandbox"]
    }
  }
}
```

### 7. Server mapping

- Provider examples use `repomix`; OpenCode permits any unique user-selected MCP
  key. [R3], [H1]
- For the user-selected host key shown above, the corresponding mapping record is:
  `skills.sdlc-code-index.mcp_server: repomix`.
- This string is guidance consumed by the skill contract only; it is not an
  external-server lifecycle declaration.

### 8. Lifecycle and storage

- The OpenCode local MCP host starts the configured command. Repomix MCP packages
  local or remote repositories and returns an output ID for subsequent reads and
  regular-expression searches. [H1], [R3]
- Sandbox mode confines registered tools to a workspace root and removes remote
  packing, skill generation, and external-output attachment. It is an
  application-level boundary, not OS isolation. [R4]
- Persistent index existence and ownership are **Unknown**. Exact MCP output
  storage location, ownership, retention, and deletion are also **Unknown**.
  [R3], [R14], [R22]

### 9. Credentials, privacy, telemetry, and security

| Topic | Status | Finding |
| --- | --- | --- |
| Network exposure / transport encryption | **Unknown** | The checked sources do not establish TLS properties for optional remote repository requests. [R21] |
| Authentication / authorization | **Unknown** | No MCP authentication or authorization contract found. [R10] |
| Filesystem / process permissions | **Unknown** | Sandbox confines the documented MCP tool surface, but broad filesystem access, process privileges, and OS permissions are not established. [R4] |
| Data egress / remote requests | **Supported** | CLI is offline after install except remote processing and manual update checks; sandbox mode disables remote packing. [R18] |
| Supply chain | **Supported** | npm v1.18.0 publishes integrity, signature, trusted-publisher, and provenance metadata. [R5] |
| Telemetry / diagnostics | **Supported** | CLI privacy statement says no user data, telemetry, or repository information is collected, transmitted, or stored. Local log retention is **Unknown**. [R7], [R16] |
| Credentials / secrets | **Unknown** | Secretlint and remote-URL redaction are documented, but complete credential storage, handling, and log-redaction behavior is not established. [R8], [R20] |
| Retention / deletion | **Unknown** | No authoritative MCP output-retention or deletion contract found. [R22] |
| Storage location / ownership | **Unknown** | No authoritative MCP output-storage location found. [R14] |
| Models / databases | **Unknown** | Tree-sitter compression is documented as optional, but the checked sources do not provide a complete negative dependency contract for models or databases. [R3], [R15] |
| Sandboxing / isolation | **Supported** | `--sandbox` is root-confined defense in depth, explicitly not OS isolation. [R4] |
| Remote / hosted processing | **Unknown** | Optional remote repository cloning and its removal in sandbox mode are documented, but hosted-processing terms and a complete remote-service contract are not established. [R3], [R18] |

### 10. Capabilities and limitations

- MCP can pack local code, optionally pack remote repositories, read/search packed
  output, and, only in sandbox mode, read files/directories. [R3]
- Sandbox mode deliberately removes network- and write-capable MCP tools. Secret
  scanning is not an access boundary. [R4], [R20]
- It is a context packer, not AST/embedding semantic retrieval. Its grep tool uses
  JavaScript regular expressions over a generated output. [R3]

### 11. Stale-index behavior

- **Unknown** for any persistent index because the cited evidence does not
  establish whether one exists. For the documented packed-output workflow, an
  output is a snapshot and packing must run again to represent later repository
  changes; no automatic freshness promise is asserted. [R3]

### 12. Removal

- Package removal is package-manager-owned. The official material checked gives
  install and update commands but no complete removal procedure for every install
  channel. **Unknown** for a universal removal command. [R17]
- User-owned host registration is removed by deleting the `mcp.repomix` entry;
  OpenCode documents enabling/disabling entries but not provider cleanup. [H1]
- MCP output cleanup details are **Unknown**. [R22]

### 13. Sources

#### [R1] Release identity

| Field | Record |
| --- | --- |
| Claim supported | Repomix v1.18.0 is the latest official release checked. |
| Evidence status | Supported |
| Source URL | https://github.com/yamadashy/repomix/releases/tag/v1.18.0 |
| Source kind | Release |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; `c4c80eb8ab3fad8c60f23ff9280f3f2c65789379` |
| Applicable component | CLI and MCP server |
| Evidence excerpt or location | Release title, publication date, tag, and commit identity |
| Qualification | Release published 2026-08-08; no live verification performed. |

#### [R2] License identity

| Field | Record |
| --- | --- |
| Claim supported | Repomix v1.18.0 CLI/MCP package identifies its license as MIT. |
| Evidence status | Supported |
| Source URL | https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/LICENSE; https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/package.json; https://registry.npmjs.org/repomix/1.18.0 |
| Source kind | License; repository; registry |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; `c4c80eb8...` |
| Applicable component | npm CLI and MCP server |
| Evidence excerpt or location | `LICENSE` title; package and registry `license: MIT` |
| Qualification | Applies only to the cited CLI/MCP package and repository release. |

#### [R3] MCP command and tool surface

| Field | Record |
| --- | --- |
| Claim supported | `repomix --mcp` exposes the documented experimental repository-packing MCP tools. |
| Evidence status | Supported |
| Source URL | https://repomix.com/guide/mcp-server |
| Source kind | Official docs |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Unknown; unversioned page checked 2026-08-23 |
| Applicable component | MCP server |
| Evidence excerpt or location | “Running Repomix as an MCP Server” and “Available MCP Tools” |
| Qualification | The documented surface packs and searches packed output; it is not evidence of an embedding or graph index. |

#### [R4] Sandbox boundary

| Field | Record |
| --- | --- |
| Claim supported | Repomix `--sandbox` confines registered tools to a workspace root and is not OS-level isolation. |
| Evidence status | Supported |
| Source URL | https://repomix.com/guide/mcp-server; https://github.com/yamadashy/repomix/releases/tag/v1.18.0 |
| Source kind | Official docs; release |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; `c4c80eb8...` |
| Applicable component | MCP server sandbox mode |
| Evidence excerpt or location | “Sandbox Mode”; release “Security Hardening” |
| Qualification | Application tool-boundary control only; not process or OS isolation. |

#### [R5] npm integrity metadata

| Field | Record |
| --- | --- |
| Claim supported | npm package 1.18.0 publishes integrity, signature, and provenance metadata. |
| Evidence status | Supported |
| Source URL | https://registry.npmjs.org/repomix/1.18.0 |
| Source kind | Registry |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | 1.18.0 |
| Applicable component | npm CLI/MCP package |
| Evidence excerpt or location | `dist.integrity`, `dist.signatures`, and `dist.attestations` |
| Qualification | Does not attest alternative distribution channels. |

#### [R6] npm update command

| Field | Record |
| --- | --- |
| Claim supported | Repomix documents `npm update -g repomix` for npm-managed updates. |
| Evidence status | Supported |
| Source URL | https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/README.md#updating-repomix |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; `c4c80eb8...` |
| Applicable component | npm-installed CLI/MCP package |
| Evidence excerpt or location | “Updating Repomix” npm subsection |
| Qualification | Does not establish update commands for every installation channel. |

#### [R7] CLI telemetry and repository-data policy

| Field | Record |
| --- | --- |
| Claim supported | Repomix CLI declares no telemetry or repository-data collection, transmission, or storage. |
| Evidence status | Supported |
| Source URL | https://repomix.com/guide/privacy |
| Source kind | Official docs |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Unknown; unversioned policy checked with v1.18.0 |
| Applicable component | CLI/MCP package |
| Evidence excerpt or location | “Repomix CLI Tool” privacy statements |
| Qualification | Website and browser-extension behavior is separately described and not assigned to MCP. |

#### [R8] Remote-URL credential redaction

| Field | Record |
| --- | --- |
| Claim supported | v1.18.0 redacts known credential forms from remote repository URLs. |
| Evidence status | Supported |
| Source URL | https://github.com/yamadashy/repomix/security/advisories/GHSA-w8cw-mgw9-74h7 |
| Source kind | Security policy |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Patched in v1.18.0 |
| Applicable component | Remote repository URL processing |
| Evidence excerpt or location | Advisory “Fix (v1.18.0)” |
| Qualification | Redaction coverage is not an access-control guarantee. |

#### [R9] Repomix OpenCode composition

| Field | Record |
| --- | --- |
| Claim supported | Repomix's documented local command can be represented by OpenCode's local argv-array schema. |
| Evidence status | Supported |
| Source URL | https://repomix.com/guide/mcp-server; https://opencode.ai/docs/mcp-servers/#local |
| Source kind | Official docs; host docs |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Repomix v1.18.0; OpenCode unversioned docs updated 2026-08-21 |
| Applicable component | MCP server and OpenCode host |
| Evidence excerpt or location | Repomix command example; OpenCode local `command` array |
| Qualification | Version pin and sandbox flag are narrowed research choices; no handshake performed. |

#### [R10] Repomix MCP authentication search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish MCP authentication or authorization. |
| Evidence status | Unknown |
| Source URL | https://repomix.com/guide/mcp-server; https://repomix.com/guide/security; https://repomix.com/guide/privacy; https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/SECURITY.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; `c4c80eb8...` |
| Applicable component | MCP server |
| Evidence excerpt or location | Searched MCP, security, privacy, and security-policy material for `auth` and `authorization`. |
| Qualification | Records an unanswered question rather than absence of access control. |

#### [R11] MIT redistribution obligation

| Field | Record |
| --- | --- |
| Claim supported | The MIT text requires retention of its copyright and permission notice in copies or substantial portions. |
| Evidence status | Supported |
| Source URL | https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/LICENSE |
| Source kind | License |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; `c4c80eb8...` |
| Applicable component | CLI/MCP repository release |
| Evidence excerpt or location | MIT permission and notice-retention paragraphs |
| Qualification | No conclusion is made for website or browser-extension service terms. |

#### [R14] Repomix MCP output storage search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish MCP packed-output storage location or ownership. |
| Evidence status | Unknown |
| Source URL | https://repomix.com/guide/mcp-server; https://github.com/yamadashy/repomix/releases/tag/v1.18.0 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0 |
| Applicable component | MCP packed output |
| Evidence excerpt or location | Searched MCP tool descriptions and release notes for `storage`, `path`, `location`, and `ownership`. |
| Qualification | Does not assert that output is never persisted. |

#### [R15] Repomix models and databases search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish a complete model or database dependency contract for MCP mode. |
| Evidence status | Unknown |
| Source URL | https://repomix.com/guide/mcp-server; https://repomix.com/guide/code-compress |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; unversioned docs |
| Applicable component | MCP packer and optional compression |
| Evidence excerpt or location | Searched MCP and compression documentation for `model`, `embedding`, `database`, `index`, and `Tree-sitter`. |
| Qualification | Optional Tree-sitter compression is documented; silence is not converted into a no-model/no-database claim. |

#### [R16] Repomix local-log retention search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish local MCP log retention. |
| Evidence status | Unknown |
| Source URL | https://repomix.com/guide/mcp-server; https://repomix.com/guide/privacy |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; unversioned policy |
| Applicable component | Local MCP diagnostics |
| Evidence excerpt or location | Searched for `log`, `diagnostic`, and `retention`. |
| Qualification | The CLI telemetry statement does not answer local-log retention. |

#### [R17] Repomix removal search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish one provider-authored removal procedure covering every distribution channel. |
| Evidence status | Unknown |
| Source URL | https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/README.md; https://repomix.com/guide/installation |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; unversioned installation docs |
| Applicable component | Distributed CLI/MCP package |
| Evidence excerpt or location | Searched installation and update sections for `uninstall`, `remove`, and cleanup by channel. |
| Qualification | Package-manager behavior is not represented as provider-authored universal guidance. |

#### [R18] CLI network exceptions

| Field | Record |
| --- | --- |
| Claim supported | Repomix CLI documents remote repository processing and update checks as network exceptions to offline operation. |
| Evidence status | Supported |
| Source URL | https://repomix.com/guide/privacy; https://repomix.com/guide/mcp-server |
| Source kind | Official docs |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; unversioned privacy page |
| Applicable component | CLI/MCP network behavior |
| Evidence excerpt or location | CLI network exceptions and remote MCP tool; sandbox tool exclusions |
| Qualification | TLS properties of remote requests remain unknown. |

#### [R19] Node runtime requirement

| Field | Record |
| --- | --- |
| Claim supported | npm package 1.18.0 requires Node 22 or newer. |
| Evidence status | Supported |
| Source URL | https://registry.npmjs.org/repomix/1.18.0 |
| Source kind | Registry |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | 1.18.0 |
| Applicable component | npm CLI/MCP package |
| Evidence excerpt or location | `engines.node` |
| Qualification | Applies to the npm package, not every alternative distribution. |

#### [R20] Secretlint scope

| Field | Record |
| --- | --- |
| Claim supported | Repomix enables Secretlint checking by default as heuristic secret detection. |
| Evidence status | Supported |
| Source URL | https://repomix.com/guide/security |
| Source kind | Official docs |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Unversioned page checked with v1.18.0 |
| Applicable component | Repository-content processing |
| Evidence excerpt or location | “Secretlint Integration” and default behavior |
| Qualification | Secret detection is not a filesystem, process, or authorization boundary. |

#### [R21] Repomix remote-request TLS search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish TLS or certificate-validation properties for optional remote repository requests. |
| Evidence status | Unknown |
| Source URL | https://repomix.com/guide/mcp-server; https://repomix.com/guide/security; https://repomix.com/guide/privacy |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; unversioned docs |
| Applicable component | Optional remote repository requests |
| Evidence excerpt or location | Searched remote-processing documentation for `TLS`, `certificate`, `HTTPS`, and transport security. |
| Qualification | Does not describe the local host-to-child-process channel. |

#### [R22] Repomix MCP output retention and deletion search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish retention or deletion behavior for MCP packed output. |
| Evidence status | Unknown |
| Source URL | https://repomix.com/guide/mcp-server; https://github.com/yamadashy/repomix/releases/tag/v1.18.0 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0 |
| Applicable component | MCP packed output |
| Evidence excerpt or location | Searched MCP tool descriptions and release notes for `retention`, `delete`, `cleanup`, and output lifecycle. |
| Qualification | Does not assert that output persists indefinitely. |

#### [R23] Separate-component license search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish one license contract for Repomix dependencies, remote services, and separately distributed components. |
| Evidence status | Unknown |
| Source URL | https://github.com/yamadashy/repomix/blob/c4c80eb8ab3fad8c60f23ff9280f3f2c65789379/package.json; https://repomix.com/guide/mcp-server; https://repomix.com/guide/privacy |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.18.0; unversioned service documentation |
| Applicable component | Dependencies, remote services, and separately distributed components |
| Evidence excerpt or location | Searched dependency declarations and provider documentation for component-specific licenses and service terms. |
| Qualification | The repository MIT license is asserted only for the cited npm CLI/MCP package. |

## FastCode

### 1. Status and version

- **Supported:** latest official release checked is v1.0.1, published
  2026-02-25 at commit `f11da38916aa87d886b7469adf3d5316deaa88fa`.
  [F1]
- The release note says “Add MCP support.” [F14]
- Current `main` is newer (`e606d2258c79dfc59857f6a9f86779d47475ee4e`,
  2026-07-06) but is not a newer tagged release. Claims below target v1.0.1;
  newer-main behavior is called out only where it creates a qualification. [F11]

### 2. License

- **Ambiguous:** the v1.0.1 README license section says MIT, but root `LICENSE`
  lookups at both the release commit and checked current-main commit return 404;
  GitHub repository metadata reports no detected license. [F2]
- The checked root sources therefore do not establish exact license text or
  redistribution obligations for the FastCode server release. Do not publish
  “MIT licensed” as resolved fact. [F2]
- The vendored `nanobot/LICENSE` applies to that named subcomponent only and does
  not cure the root-component gap. [F2]

### 3. Install and update

- v1.0.1 documents cloning the repository, creating Python 3.12 environment, and
  installing unpinned `requirements.txt`; the MCP dependency is `mcp[cli]`. [F9]
- No PyPI project/distribution for HKUDS FastCode, immutable package digest,
  lockfile, signed release asset, or official update procedure was found. **Unknown**
  for package update and artifact integrity. [F19], [F23]

### 4. MCP applicability

- **Supported.** v1.0.1 includes first-party `mcp_server.py`, six tools, stdio as
  default, and optional SSE on a configurable port. [F3], [F16]
- This determination relies on `HKUDS/FastCode`, not the unrelated
  `baladithyab/FastCode-mcp` wrapper. The wrapper is not cited as provider
  evidence and is not treated as the integration.

### 5. OpenCode

- **Supported** by composition: FastCode documents its Python command/arguments
  and OpenCode documents local MCP `command` as an argv array. [F3], [H1]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "fastcode": {
      "type": "local",
      "command": [
        "/path/to/FastCode/.venv/bin/python",
        "/path/to/FastCode/mcp_server.py"
      ],
      "enabled": true
    }
  }
}
```

The example intentionally omits `environment`: provider evidence names
`OPENAI_API_KEY`, `MODEL`, and `BASE_URL`, but this artifact does not invent host
indirection variable names. The user owns paths, process environment,
registration, and lifecycle. Map the selected key `fastcode` only into
`skills.sdlc-code-index.mcp_server`. [F10]

### 6. Pi

- Pi core applicability is **Unsupported** because official Pi core deliberately
  has no MCP. [H2]
- Composed applicability through the separately maintained `pi-mcp-adapter`
  v2.26.0 is **Supported** for FastCode's documented default stdio command.
  FastCode does not maintain the adapter, and operation was not tested. The user
  owns adapter installation, trust, and lifecycle. [F3], [H3], [H4], [H5]
- User-managed `.pi/mcp.json` example using the adapter-owned schema; required
  provider variables are inherited from the process environment rather than
  assigned invented aliases:

```json
{
  "mcpServers": {
    "fastcode": {
      "command": "/path/to/FastCode/.venv/bin/python",
      "args": ["/path/to/FastCode/mcp_server.py"]
    }
  }
}
```

### 7. Server mapping

- FastCode's provider examples use `fastcode`; its internal FastMCP server name is
  `FastCode`. OpenCode's external key is user-selected. [F16], [H1]
- For the user-selected host key shown above, the corresponding skill mapping is
  `skills.sdlc-code-index.mcp_server: fastcode`.
  Case and key choice follow host registration, not FastMCP's internal label.

### 8. Lifecycle and storage

- On first use, the MCP process initializes FastCode, may clone URL repositories,
  indexes repositories not already recognized, and writes `logs/mcp_server.log`.
  [F5], [F21]
- Defaults store FAISS indexes and pickle metadata under `./data/vector_store`,
  disk cache under `./data/cache`, cloned repositories under `./repos`, and logs
  under `./logs`. Optional Redis is available for cache. Dialogue TTL defaults to
  30 days; general cache TTL defaults to one hour. [F15], [F8]
- `delete_repo_metadata` removes index artifacts and overview metadata but keeps
  source; `delete_session` removes cached session turns/index. [F6], [F22]

### 9. Credentials, privacy, telemetry, and security

| Topic | Status | Finding |
| --- | --- | --- |
| Network exposure / transport encryption | **Unknown** | Stdio is the documented default, but optional SSE bind-interface and TLS behavior are not established. [F3], [F13] |
| Authentication / authorization | **Unknown** | No SSE auth or authorization contract found. [F25] |
| Filesystem / process permissions | **Unknown** | MCP accepts local paths and URL sources, but broad filesystem access, process privileges, and OS permissions are not established; exclusions are content filters, not a sandbox. [F16] |
| Data egress / remote requests | **Supported** | Queries use an LLM configured by `OPENAI_API_KEY`, `MODEL`, and `BASE_URL`; URL repository inputs may be cloned. [F5], [F10] |
| Supply chain | **Unknown** | `requirements.txt` is unpinned and the checked release has no package digest or lockfile. [F9], [F19] |
| Telemetry / diagnostics | **Unknown** | No telemetry policy found; file logging is separately documented. [F17], [F21] |
| Credentials / secrets | **Unknown** | `.env` is force-excluded from indexing, but secret scanning, credential storage, and log redaction are not established. [F16], [F18] |
| Retention / deletion | **Unknown** | Cache TTLs and session deletion are documented, but index retention is not established. [F8], [F20], [F22] |
| Storage location / ownership | **Unknown** | Default project-relative repositories, vector store, cache, and log paths are documented, but ownership terms and deployment-wide storage guarantees are not established. [F15], [F21] |
| Models / databases | **Supported** | Default local SentenceTransformer plus FAISS, optional Redis cache, and configured LLM use are documented. Chroma/Qdrant operational completeness was not tested. [F7], [F10] |
| Sandboxing / isolation | **Unknown** | No application or OS sandbox contract found. [F26] |
| Remote / hosted processing | **Unknown** | User-configured LLM endpoints are supported, but no provider-operated hosted FastCode service terms were found. [F10], [F27] |

GitHub's checked repository security page reports no security policy. That lookup
does not establish whether vulnerabilities or undocumented controls exist. [F12]

### 10. Capabilities and limitations

- v1.0.1 MCP exposes repository Q&A, indexed-repository listing, session
  list/history/deletion, and index-metadata deletion. It supports local paths and
  Git URL inputs and multi-repository queries. [F16]
- Config describes AST-level units, semantic + BM25 retrieval, and call,
  dependency, and inheritance graphs over multiple languages. [F7]
- Q&A is not local-only even though embeddings default locally: query enhancement,
  repository selection, and answer generation may call the configured LLM. [F7],
  [F10]

### 11. Stale-index behavior

- **Supported limitation:** v1.0.1 considers a repository indexed when matching
  `.faiss` and `_metadata.pkl` files exist, then “skips” indexing. It does not
  compare local source state or remote revision before query. [F4]
- Current untagged main adds incremental local reindexing, but that does not alter
  v1.0.1 behavior and still does not establish remote-repository freshness. [F11]

### 12. Removal

- MCP `delete_repo_metadata` removes `.faiss`, metadata, BM25, graph, and overview
  records while preserving source. Session deletion is separately exposed. [F6]
- Full removal of source clones, logs, cache, virtual environment, configuration,
  optional Redis data, and SSE registration is **Unknown** because no complete
  official uninstall procedure was found. [F24]
- OpenCode registration remains user-owned and can be disabled or removed from the
  host configuration; harnessctl does not perform removal. [H1]

### 13. Sources

#### [F1] Release identity

| Field | Record |
| --- | --- |
| Claim supported | FastCode v1.0.1 is the latest official release checked. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/releases/tag/v1.0.1; https://github.com/HKUDS/FastCode/commit/f11da38916aa87d886b7469adf3d5316deaa88fa |
| Source kind | Release; repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1; `f11da38916aa87d886b7469adf3d5316deaa88fa` |
| Applicable component | Framework and MCP server |
| Evidence excerpt or location | Release title, publication date, tag, and commit identity |
| Qualification | Current main is newer but untagged. |

#### [F2] License discrepancy

| Field | Record |
| --- | --- |
| Claim supported | The v1.0.1 README says MIT, while root `LICENSE` lookups at the release and checked current-main commits return 404 and repository metadata reports no detected license. |
| Evidence status | Ambiguous |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/README.md#license; https://api.github.com/repos/HKUDS/FastCode/contents/LICENSE?ref=f11da38916aa87d886b7469adf3d5316deaa88fa; https://api.github.com/repos/HKUDS/FastCode/contents/LICENSE?ref=e606d2258c79dfc59857f6a9f86779d47475ee4e; https://api.github.com/repos/HKUDS/FastCode |
| Source kind | Repository; license search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 `f11da389...`; current-main check `e606d225...` |
| Applicable component | Root framework/MCP server |
| Evidence excerpt or location | README “FastCode is released under the MIT License”; both content API lookups return 404; repository `license: null` |
| Qualification | The root discrepancy leaves exact text and redistribution obligations unresolved; `nanobot/LICENSE` applies only to that subcomponent. |

#### [F3] Released MCP transports

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 provides stdio by default and optional SSE transport. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1; `f11da389...` |
| Applicable component | MCP server |
| Evidence excerpt or location | Argparse transport selection and server run branch |
| Qualification | Source inspection only; no server execution or handshake. |

#### [F4] Released stale-index behavior

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 treats matching FAISS and metadata files as already indexed and skips source-freshness comparison. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Released MCP index initialization |
| Evidence excerpt or location | `_is_repo_indexed` and `_ensure_repos_ready` skip branch |
| Qualification | Does not establish freshness behavior for unreleased source. |

#### [F5] MCP repository startup

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 MCP initialization can load local repositories or clone URL repositories. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | MCP process lifecycle |
| Evidence excerpt or location | `initialize_fastcode` and repository-loading path |
| Qualification | Does not establish clone retention or freshness. |

#### [F6] MCP deletion tools

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 exposes metadata and session deletion tools while preserving repository source. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | MCP deletion tools |
| Evidence excerpt or location | `delete_repo_metadata` and `delete_session` tool bodies |
| Qualification | Does not remove source clones, logs, environments, or optional Redis data. |

#### [F7] Index and model defaults

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 config defaults to local SentenceTransformer embeddings and FAISS, with configured LLM generation. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/config/config.yaml |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Framework/indexer configuration |
| Evidence excerpt or location | `embedding`, `vector_store`, and `generation` defaults |
| Qualification | Chroma/Qdrant labels appear in config; operational completeness was not tested. |

#### [F8] Cache retention

| Field | Record |
| --- | --- |
| Claim supported | Disk/Redis cache code applies configured general TTL and 30-day dialogue retention. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/fastcode/cache.py; https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/config/config.yaml |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Cache/session storage |
| Evidence excerpt or location | `CacheManager`, `save_dialogue_turn`, and cache TTL settings |
| Qualification | Does not specify index, log, or clone retention. |

#### [F9] Installation and dependency specification

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 documents Python 3.12 setup and an unpinned requirements file containing `mcp[cli]`. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/README.md#installation; https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/requirements.txt |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Framework and MCP server installation |
| Evidence excerpt or location | README installation steps; `requirements.txt` dependency declarations |
| Qualification | Unpinned dependencies are not artifact-integrity evidence. |

#### [F10] LLM credentials and egress

| Field | Record |
| --- | --- |
| Claim supported | FastCode config uses `OPENAI_API_KEY`, `MODEL`, and `BASE_URL` for calls to a user-configured LLM endpoint. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/env.example; https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/config/config.yaml |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Query/generation pipeline |
| Evidence excerpt or location | Environment variable names and generation endpoint configuration |
| Qualification | This record does not define OpenCode interpolation or an invented alias variable. |

#### [F11] Current-main freshness divergence

| Field | Record |
| --- | --- |
| Claim supported | Checked current main attempts incremental reindexing for already-indexed local repositories, unlike v1.0.1. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/e606d2258c79dfc59857f6a9f86779d47475ee4e/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | `e606d2258c79dfc59857f6a9f86779d47475ee4e` |
| Applicable component | Unreleased MCP server source |
| Evidence excerpt or location | `_ensure_repos_ready(... allow_incremental=True)` and `incremental_reindex` branch |
| Qualification | Not applied to released v1.0.1; remote freshness remains unresolved. |

#### [F12] Security-policy lookup

| Field | Record |
| --- | --- |
| Claim supported | GitHub reports no repository security policy at the checked state. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/security/policy |
| Source kind | Security policy |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Current repository as of access date |
| Applicable component | Repository reporting process |
| Evidence excerpt or location | “No security policy detected” |
| Qualification | Does not establish absence of vulnerabilities or controls. |

#### [F13] SSE bind and TLS search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish SSE bind-interface or TLS defaults. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py; https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Optional SSE endpoint |
| Evidence excerpt or location | Searched server and release tree for `host`, `bind`, `TLS`, and `certificate`. |
| Qualification | Stdio behavior does not answer optional SSE controls. |

#### [F14] MCP release note

| Field | Record |
| --- | --- |
| Claim supported | FastCode v1.0.1 release notes state that the release adds MCP support. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/releases/tag/v1.0.1 |
| Source kind | Release |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | MCP server |
| Evidence excerpt or location | “What's Changed”: “new feature: Add MCP support” |
| Qualification | Implementation details come from the versioned source record, not this note alone. |

#### [F15] Local storage paths

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 defaults repositories, vector metadata, disk cache, and logs to project-relative paths and permits optional Redis cache. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/config/config.yaml; https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Repository, vector, cache, and log storage |
| Evidence excerpt or location | `repo_root`, `vector_store`, `cache`, and logging path settings |
| Qualification | Effective location depends on process working directory and configuration. |

#### [F16] MCP tool and repository-input surface

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 exposes six MCP tools, accepts local/URL repository inputs, and applies named environment-directory exclusions. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | MCP tool and repository-ingestion surface |
| Evidence excerpt or location | `@mcp.tool` declarations, repository parameters, and forced exclusions |
| Qualification | Exclusions are content filters, not a sandbox or secret-scanning guarantee. |

#### [F17] Telemetry and privacy search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish a FastCode telemetry or privacy policy. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa; https://github.com/HKUDS/FastCode/releases/tag/v1.0.1 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Framework and MCP server |
| Evidence excerpt or location | Searched release tree and release page for `telemetry`, `analytics`, `privacy`, and `tracking`. |
| Qualification | File logging is documented separately and is not classified as telemetry by inference. |

#### [F18] Secret handling search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish secret scanning or credential storage/redaction. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa; https://github.com/HKUDS/FastCode/security/policy |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Repository ingestion, config, and logging |
| Evidence excerpt or location | Searched source, config, env example, and security page for `secret`, `redact`, and `credential`. |
| Qualification | `.env` exclusion is a content filter, not proof of these controls. |

#### [F19] Package integrity search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish a package digest, signed release asset, or lockfile for v1.0.1. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa; https://github.com/HKUDS/FastCode/releases/tag/v1.0.1 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Source-distributed framework/MCP server |
| Evidence excerpt or location | Checked release assets, dependency files, README, and release tree for `lock`, `digest`, `signature`, and package artifacts. |
| Qualification | Does not convert missing release packaging into a claim about all third-party installation methods. |

#### [F20] Index retention search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish an index-retention period. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa; https://github.com/HKUDS/FastCode/releases/tag/v1.0.1 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Persisted index |
| Evidence excerpt or location | Searched README, config, server, and release material for `retention`, `TTL`, and index deletion. |
| Qualification | Cache TTLs do not establish index retention. |

#### [F21] MCP file logging

| Field | Record |
| --- | --- |
| Claim supported | v1.0.1 configures file logging at `logs/mcp_server.log`. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | MCP diagnostics |
| Evidence excerpt or location | Module logging setup and file handler path |
| Qualification | Log retention and redaction are not established. |

#### [F22] Session deletion

| Field | Record |
| --- | --- |
| Claim supported | Cache code and MCP tooling support deletion of a selected session. |
| Evidence status | Supported |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/fastcode/cache.py; https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Session cache and MCP deletion tool |
| Evidence excerpt or location | `delete_session` implementations |
| Qualification | Does not remove repository indexes, clones, or logs. |

#### [F23] Update procedure search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish an official FastCode update procedure. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/README.md; https://github.com/HKUDS/FastCode/releases/tag/v1.0.1 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Source-distributed framework/MCP server |
| Evidence excerpt or location | Searched README and release material for `update` and `upgrade`. |
| Qualification | Does not infer behavior for user-selected Git workflows. |

#### [F24] Complete removal search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish one complete procedure removing clones, indexes, cache, logs, environment, optional Redis data, and host registration. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/README.md; https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Complete local deployment |
| Evidence excerpt or location | Searched removal tools and README for `uninstall`, `remove`, and cleanup coverage. |
| Qualification | Metadata/session deletion tools cover only named local artifacts. |

#### [F25] SSE authentication search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish authentication or authorization for optional SSE. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py; https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Optional SSE endpoint |
| Evidence excerpt or location | Searched server and release tree for `auth`, `authentication`, and `authorization`. |
| Qualification | Does not infer public exposure or lack of deployment controls. |

#### [F26] Sandbox search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish an application or OS sandbox for FastCode. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa; https://github.com/HKUDS/FastCode/security/policy |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Framework/MCP process |
| Evidence excerpt or location | Searched source and security page for `sandbox`, `isolation`, and privilege controls. |
| Qualification | Content exclusions are not treated as a sandbox. |

#### [F27] Hosted-service terms search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish terms for a provider-operated FastCode hosted service. |
| Evidence status | Unknown |
| Source URL | https://github.com/HKUDS/FastCode/tree/f11da38916aa87d886b7469adf3d5316deaa88fa; https://github.com/HKUDS/FastCode/releases/tag/v1.0.1 |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v1.0.1 |
| Applicable component | Any provider-operated hosted service |
| Evidence excerpt or location | Searched README and release material for `hosted`, `cloud`, `service`, and `terms`. |
| Qualification | User-configured third-party LLM endpoints are documented separately. |

## CocoIndex

### 1. Status and version

- Applicable MCP component is the official `cocoindex-io/cocoindex-code`
  distribution, built on the separate CocoIndex framework. [C1]
- **Supported:** latest release checked is `cocoindex-code` v0.2.41, published
  2026-08-07 at commit `9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59`.
  [C1]
- The generic framework's separate latest release was v1.0.20; it is not the MCP
  package version. [C2]

### 2. License

- **Supported:** Apache-2.0 for the v0.2.41 repository and PyPI package; license
  file, `pyproject.toml`, and PyPI expression agree. [C3]
- Redistribution requires a license copy, notices of changed files, and retention
  of applicable attribution/patent/trademark notices; the patent grant terminates
  under the license's stated patent-litigation condition. [C13]
- Downloaded embedding models, cloud services, Docker base layers, CocoIndex Code
  Plus, and enterprise services are separate components whose licenses/terms must
  be evaluated independently. Their terms are **Unknown** in this component
  record. [C18], [C19]

### 3. Install and update

- Official v0.2.41 README documents `pipx install 'cocoindex-code[full]'`,
  `pipx upgrade cocoindex-code`, and `uv tool install --upgrade
  'cocoindex-code[full]'`. Research did not run them. [C5]
- PyPI provides wheel/sdist SHA-256 digests. GitHub release carries the same named
  artifacts and digests; release workflow builds on GitHub Actions and publishes
  to PyPI using OIDC trusted publishing. [C11], [C25]
- Slim installs use cloud-capable LiteLLM and require a provider/key; `[full]`
  adds local SentenceTransformers dependencies and a model download/cache. [C7]

### 4. MCP applicability

- **Supported:** `ccc mcp` runs a stdio MCP server exposing one semantic `search`
  tool. The package metadata itself describes the project as an MCP server. [C4]
- Do not treat the generic `cocoindex` framework release as the MCP executable;
  use the separately released `cocoindex-code` component. [C1], [C2]

### 5. OpenCode

- **Supported.** The provider publishes an OpenCode example, and its object shape
  matches current official OpenCode local MCP documentation. [C14], [H1]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "cocoindex-code": {
      "type": "local",
      "command": ["ccc", "mcp"],
      "enabled": true
    }
  }
}
```

The user owns this registration and maps only `cocoindex-code` into
`skills.sdlc-code-index.mcp_server`; harnessctl does not manage the process.

### 6. Pi

- Pi core applicability is **Unsupported** because current official Pi core
  explicitly has no MCP host. [H2]
- Composed applicability through the separately maintained `pi-mcp-adapter`
  v2.26.0 is **Supported** because CocoIndex Code documents `ccc mcp` as stdio and
  the adapter documents command/arguments servers. CocoIndex does not maintain the
  adapter, and operation was not tested. The user owns adapter installation,
  trust, and lifecycle. [C4], [H3], [H4], [H5]
- User-managed `.pi/mcp.json` example using the adapter-owned schema:

```json
{
  "mcpServers": {
    "cocoindex-code": {
      "command": "ccc",
      "args": ["mcp"]
    }
  }
}
```

### 7. Server mapping

- Provider-published OpenCode and other host examples use `cocoindex-code`; the
  server's internal MCP name is also `cocoindex-code`. [C14], [C9]
- For the user-selected host key shown above, the corresponding skill mapping is:
  `skills.sdlc-code-index.mcp_server: cocoindex-code`.
- The mapping is guidance only and must match the user's actual host key.

### 8. Lifecycle and storage

- `ccc mcp` is a stdio front end to an automatically started local daemon. The
  daemon defaults to a 180-minute idle timeout and live MCP sessions send
  heartbeats by default; settings can change both behaviors. [C10]
- Defaults create user settings at
  `~/.cocoindex_code/global_settings.yml`, project settings under
  `<project>/.cocoindex_code/settings.yml`, and databases `cocoindex.db` and
  `target_sqlite.db` under the project settings directory. A path mapping can
  relocate databases. [C6]
- `ccc reset` deletes index databases; `--all` also removes settings. Daemon stop
  and package removal remain separate lifecycle operations. [C22], [C23]

### 9. Credentials, privacy, telemetry, and security

| Topic | Status | Finding |
| --- | --- | --- |
| Network exposure / transport encryption | **Unknown** | MCP uses stdio, while encryption for local daemon IPC is not established. [C4], [C10], [C29] |
| Authentication / authorization | **Unknown** | No authentication or authorization contract was found for the stdio/local-daemon component. [C12] |
| Filesystem / process permissions | **Unknown** | Native project reads and broad Docker-mount access are documented, but process privileges and complete OS permission requirements are not established. [C26] |
| Data egress / remote requests | **Supported** | `[full]` can embed locally; slim/LiteLLM sends embedding inputs to the configured provider. [C7] |
| Supply chain | **Supported** | PyPI and release assets publish digests; release workflow uses GitHub Actions and PyPI OIDC. [C11], [C25] |
| Telemetry / diagnostics | **Supported** | Anonymous usage telemetry is enabled unless opted out; documented exclusions cover source, paths, queries, results, embeddings, settings, and environment content. [C8] |
| Credentials / secrets | **Unknown** | Environment/YAML configuration is documented, but encryption and redaction are not established. [C15] |
| Retention / deletion | **Unknown** | Local index reset is documented, while telemetry retention and deletion are not established. [C16], [C22] |
| Storage location / ownership | **Unknown** | Local settings/database paths and remapping are documented, but ownership terms are not established. [C6] |
| Models / databases | **Supported** | Local SentenceTransformers, optional LiteLLM providers, SQLite/sqlite-vec, and CocoIndex state databases are documented. [C6], [C7] |
| Sandboxing / isolation | **Unknown** | Docker execution is optional, but checked sources do not establish native sandboxing or Docker as a security boundary. [C17] |
| Remote / hosted processing | **Unknown** | User-selected embedding providers are documented separately; public terms for enterprise/shared processing were not established. [C7], [C18] |

The repository has a vulnerability-reporting policy, but that policy is not a
runtime security or data-handling control. [C21]

### 10. Capabilities and limitations

- MCP exposes semantic search with pagination and language/path filters; results
  include path, language, content, line numbers, and similarity score. [C4], [C9]
- AST-aware chunking supports many listed languages; incremental indexing only
  reprocesses changes. Structural `ccc grep` is CLI-only and explicitly depended
  on an unreleased CocoIndex feature in v0.2.41, so it must not be listed as an MCP
  tool. [C27]
- v0.2.41's MCP surface is one `search` tool, not call-graph or impact-analysis
  tools. [C9]

### 11. Stale-index behavior

- **Supported:** MCP `search.refresh_index` defaults to `true`, invoking incremental
  indexing before search; setting it `false` skips that refresh for faster
  consecutive queries and can therefore return stale results after source changes.
  [C9]
- Initial or concurrent indexing causes search to wait for that project's index.
  Changed files are reprocessed and unchanged work is retained by CocoIndex. [C9],
  [C27]
- Changing embedding models requires reset and reindex because dimensions differ.
  [C24]

### 12. Removal

- Official CLI documents `ccc reset` for index databases, `ccc reset --all` for
  index plus settings, and `ccc daemon stop` for the background process. [C22],
  [C23]
- Package removal must use the package manager that installed it; the v0.2.41
  README documents install/upgrade but not explicit pipx/uv uninstall commands.
  **Unknown** for provider-authored package-removal syntax. [C20]
- Docker docs explicitly describe removal of old containers/volumes during a
  migration, but that is not a universal uninstall procedure. User-owned OpenCode
  registration must be removed separately. [C28], [H1]

### 13. Sources

#### [C1] MCP package release identity

| Field | Record |
| --- | --- |
| Claim supported | The applicable MCP package is `cocoindex-code` v0.2.41 at commit `9fd2e747...`. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/releases/tag/v0.2.41; https://github.com/cocoindex-io/cocoindex-code/commit/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59 |
| Source kind | Release; repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | cocoindex-code v0.2.41; `9fd2e747...` |
| Applicable component | MCP/CLI package |
| Evidence excerpt or location | Release name, publication date, tag, and commit identity |
| Qualification | Does not identify the generic framework version. |

#### [C2] Generic framework release identity

| Field | Record |
| --- | --- |
| Claim supported | Generic CocoIndex v1.0.20 is a separate release from `cocoindex-code` v0.2.41. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex/releases/tag/v1.0.20; https://github.com/cocoindex-io/cocoindex-code/releases/tag/v0.2.41 |
| Source kind | Release |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | CocoIndex v1.0.20; cocoindex-code v0.2.41 |
| Applicable component | Generic framework and separate MCP/CLI package |
| Evidence excerpt or location | Distinct repository release titles and tags |
| Qualification | Versions are not interchangeable. |

#### [C3] License identity

| Field | Record |
| --- | --- |
| Claim supported | `cocoindex-code` v0.2.41 repository and PyPI package identify Apache-2.0. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/LICENSE; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/pyproject.toml; https://pypi.org/pypi/cocoindex-code/0.2.41/json |
| Source kind | License; repository; registry |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | OSS MCP/CLI package |
| Evidence excerpt or location | License title; `license = "Apache-2.0"`; PyPI `license_expression` |
| Qualification | Does not license models, cloud providers, enterprise software, or services. |

#### [C4] MCP command and tool surface

| Field | Record |
| --- | --- |
| Claim supported | `ccc mcp` runs a stdio MCP server exposing one semantic `search` tool. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md#mcp-server; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | MCP server |
| Evidence excerpt or location | README “MCP Server”; `create_mcp_server` and `run_stdio_async` |
| Qualification | Structural `ccc grep` is CLI-only and not represented as an MCP tool. |

#### [C5] CLI installation and update

| Field | Record |
| --- | --- |
| Claim supported | v0.2.41 documents pipx/uv installation and upgrade commands. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | CLI/MCP package distribution |
| Evidence excerpt or location | “Install” and “Upgrade” sections |
| Qualification | Commands are quoted as documentation and were not executed. |

#### [C6] Local database paths

| Field | Record |
| --- | --- |
| Claim supported | Each project defaults to local CocoIndex and target SQLite databases under its resolved project database directory, with path remapping available. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/project.py; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md#custom-database-location |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Index storage |
| Evidence excerpt or location | `Project.create`; README database names and path mapping |
| Qualification | Docker and enterprise deployment can change location and ownership. |

#### [C7] Embedding modes and data egress

| Field | Record |
| --- | --- |
| Claim supported | `[full]` supports local SentenceTransformers, while slim/LiteLLM configuration can send embedding inputs to a selected provider. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Embedding pipeline |
| Evidence excerpt or location | Installation variants and embedding-provider configuration |
| Qualification | Third-party provider handling and model licenses remain separate. |

#### [C8] Usage telemetry

| Field | Record |
| --- | --- |
| Claim supported | CocoIndex Code documents anonymous usage telemetry, named content exclusions, and `COCOINDEX_DISABLE_USAGE_TRACKING=1`. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md#telemetry |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | CLI/MCP usage telemetry |
| Evidence excerpt or location | “Telemetry” section |
| Qualification | Endpoint, event schema, retention, and deletion are not specified there. |

#### [C9] MCP search refresh behavior

| Field | Record |
| --- | --- |
| Claim supported | MCP `search` defaults `refresh_index` to true and incrementally refreshes before search; false can leave changed source stale. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/server.py |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | MCP search tool |
| Evidence excerpt or location | `search(refresh_index=True)` and refresh branch |
| Qualification | Source reviewed without executing an index or query. |

#### [C10] Local daemon lifecycle

| Field | Record |
| --- | --- |
| Claim supported | MCP uses a local multiprocessing daemon with heartbeat and idle-timeout behavior. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/daemon.py; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Local daemon |
| Evidence excerpt or location | Daemon `Listener`, heartbeat, and idle reaper; README daemon settings |
| Qualification | Does not establish authentication, authorization, or IPC encryption. |

#### [C11] Package and release-asset digests

| Field | Record |
| --- | --- |
| Claim supported | v0.2.41 wheel/sdist and GitHub release assets publish cryptographic digests. |
| Evidence status | Supported |
| Source URL | https://pypi.org/pypi/cocoindex-code/0.2.41/json; https://github.com/cocoindex-io/cocoindex-code/releases/tag/v0.2.41 |
| Source kind | Registry; release |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | PyPI package and release assets |
| Evidence excerpt or location | PyPI `digests.sha256` and release asset digests |
| Qualification | Does not establish build-workflow provenance. |

#### [C12] Local IPC authentication search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish authentication or authorization for MCP stdio/local-daemon IPC. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/server.py; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/daemon.py; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | MCP stdio and local daemon IPC |
| Evidence excerpt or location | Searched server, daemon, and README for `auth`, `authorization`, and access controls. |
| Qualification | Local process placement is not converted into an authentication or security guarantee. |

#### [C13] Apache redistribution and patent conditions

| Field | Record |
| --- | --- |
| Claim supported | Apache-2.0 requires license/notice handling and includes the stated patent grant and termination condition. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/LICENSE |
| Source kind | License |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | OSS MCP/CLI package |
| Evidence excerpt or location | Apache-2.0 sections 2-6 |
| Qualification | Does not establish terms for separate models, services, or enterprise components. |

#### [C14] Provider-published OpenCode example

| Field | Record |
| --- | --- |
| Claim supported | CocoIndex Code publishes an OpenCode entry using `ccc mcp`. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md#opencode |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | MCP server and OpenCode host example |
| Evidence excerpt or location | README “OpenCode” JSON example |
| Qualification | Host schema is independently checked in [H1]. |

#### [C15] Credential encryption and redaction search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish encryption or redaction for credentials supplied through environment or YAML settings. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/tree/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | CLI/MCP configuration and daemon environment |
| Evidence excerpt or location | Searched settings and source for `credential`, `encrypt`, `redact`, `secret`, and environment persistence. |
| Qualification | Does not assert that values are stored or transmitted in every configuration. |

#### [C16] Telemetry retention and deletion search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish usage-telemetry retention or deletion behavior. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md#telemetry; https://cocoindex.io/privacy-policy/ |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41; unversioned website policy |
| Applicable component | OSS usage telemetry |
| Evidence excerpt or location | Searched for telemetry `retention`, `delete`, `deletion`, and event lifecycle. |
| Qualification | Website policy scope is not automatically assigned to OSS telemetry. |

#### [C17] Native sandbox search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish a native application or OS sandbox for CocoIndex Code. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/tree/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Native MCP/daemon process |
| Evidence excerpt or location | Searched source and Docker/native documentation for `sandbox`, `isolation`, `seccomp`, and privilege controls. |
| Qualification | Optional Docker execution is not treated as proof of a provider security boundary. |

#### [C18] Hosted and enterprise terms search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish public terms applicable to CocoIndex Code enterprise/shared processing. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md; https://cocoindex.io/privacy-policy/; https://cocoindex.io/terms-of-use/ |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41; unversioned service policies |
| Applicable component | Enterprise/shared processing, separate from OSS MCP |
| Evidence excerpt or location | Searched enterprise references and website policies for component scope and processing terms. |
| Qualification | User-selected third-party embedding providers are a separate egress boundary. |

#### [C19] Downloaded-model license search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish the license terms for every model downloaded through local embedding configuration. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Separately downloaded embedding models |
| Evidence excerpt or location | Searched model and installation sections for model-specific license terms. |
| Qualification | Apache-2.0 for the package does not license downloaded models. |

#### [C20] Package uninstall search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish provider-authored pipx/uv package-uninstall syntax. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Installed CLI/MCP package |
| Evidence excerpt or location | Searched install, upgrade, reset, and migration sections for `uninstall` and package removal. |
| Qualification | Index reset and daemon stop are separately documented lifecycle operations. |

#### [C21] Security-reporting scope

| Field | Record |
| --- | --- |
| Claim supported | CocoIndex Code has a vulnerability-reporting policy scoped to its repository/PyPI package. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/SECURITY.md; https://github.com/cocoindex-io/.github/blob/main/SECURITY.md |
| Source kind | Security policy |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 and current organization policy |
| Applicable component | OSS package reporting process |
| Evidence excerpt or location | Product scope and reporting sections |
| Qualification | Reporting policy is not a runtime security or privacy control. |

#### [C22] Local index reset

| Field | Record |
| --- | --- |
| Claim supported | `ccc reset` deletes index databases and `ccc reset --all` also removes settings. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Local index and settings |
| Evidence excerpt or location | Reset command documentation |
| Qualification | Does not remove the installed package or telemetry records. |

#### [C23] Daemon stop operation

| Field | Record |
| --- | --- |
| Claim supported | `ccc daemon stop` stops the local background daemon. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Local daemon |
| Evidence excerpt or location | Daemon command documentation |
| Qualification | Does not remove package, settings, or index databases. |

#### [C24] Embedding-model reset requirement

| Field | Record |
| --- | --- |
| Claim supported | Changing embedding models requires reset and reindex because vector dimensions can differ. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Embedding index |
| Evidence excerpt or location | Embedding-model configuration/reset warning |
| Qualification | Applies when changing model dimensions, not routine source refresh. |

#### [C25] PyPI OIDC release provenance

| Field | Record |
| --- | --- |
| Claim supported | The v0.2.41 release workflow requests OIDC permission and uses the PyPI trusted-publisher action. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/.github/workflows/release.yml |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | PyPI release workflow |
| Evidence excerpt or location | `id-token: write` and `pypa/gh-action-pypi-publish` |
| Qualification | Referenced workflow actions use tags rather than commit pins. |

#### [C26] Filesystem permissions and Docker mounts

| Field | Record |
| --- | --- |
| Claim supported | Native mode reads the selected project with process permissions, and Docker guidance warns that broad host mounts grant broad access. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Native and Docker filesystem access |
| Evidence excerpt or location | Project selection and Docker mount warning |
| Qualification | Filesystem access is not a sandbox guarantee. |

#### [C27] Chunking and incremental indexing behavior

| Field | Record |
| --- | --- |
| Claim supported | CocoIndex Code documents AST-aware chunking and incremental reprocessing of changed files while retaining unchanged work. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Indexing pipeline |
| Evidence excerpt or location | Language/chunking and incremental-indexing sections |
| Qualification | Does not add CLI-only structural grep to the MCP tool surface. |

#### [C28] Docker migration cleanup

| Field | Record |
| --- | --- |
| Claim supported | Docker migration documentation describes removal of named old containers and volumes. |
| Evidence status | Supported |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Repository |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Docker migration artifacts |
| Evidence excerpt or location | Docker migration/removal section |
| Qualification | Not a universal native/package uninstall procedure. |

#### [C29] Local daemon IPC encryption search

| Field | Record |
| --- | --- |
| Claim supported | Search did not establish encryption for local daemon IPC. |
| Evidence status | Unknown |
| Source URL | https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/daemon.py; https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md |
| Source kind | Search record |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v0.2.41 |
| Applicable component | Local daemon IPC |
| Evidence excerpt or location | Searched daemon and README for `encrypt`, `TLS`, and IPC transport security. |
| Qualification | Local placement is not converted into an encryption guarantee. |

## Shared host citation records

### [H1] OpenCode local MCP command shape

| Field | Record |
| --- | --- |
| Claim supported | OpenCode registers a local MCP server under a user-selected `mcp` key with `type: local` and an argv-array `command`. |
| Evidence status | Supported |
| Source URL | https://opencode.ai/docs/mcp-servers/#enable; https://opencode.ai/docs/mcp-servers/#local |
| Source kind | Host docs |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | Unknown; page updated 2026-08-21 |
| Applicable component | OpenCode host |
| Evidence excerpt or location | “Add each MCP with a unique name”; local `type` and `command` fields |
| Qualification | Provider executable/arguments must come from provider evidence; no configuration was written or tested. |

### [H2] Pi core native MCP applicability

| Field | Record |
| --- | --- |
| Claim supported | Pi core deliberately does not provide native MCP support. |
| Evidence status | Unsupported |
| Source URL | https://github.com/badlogic/pi-mono/blob/a1f955e9f47fd3379b44f4aace65ab916c80519a/packages/coding-agent/README.md#philosophy |
| Source kind | Host repository documentation |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | `a1f955e9f47fd3379b44f4aace65ab916c80519a` |
| Applicable component | Pi coding agent host |
| Evidence excerpt or location | “No MCP. Build CLI tools with READMEs ... or build an extension that adds MCP support” |
| Qualification | This core status is independent of separately maintained extensions. |

### [H3] pi-mcp-adapter ownership boundary

| Field | Record |
| --- | --- |
| Claim supported | `pi-mcp-adapter` is maintained in a repository separate from Pi core and the three providers. |
| Evidence status | Supported |
| Source URL | https://github.com/nicobailon/pi-mcp-adapter/blob/v2.26.0/README.md |
| Source kind | Versioned repository documentation |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v2.26.0 |
| Applicable component | Pi MCP adapter extension |
| Evidence excerpt or location | Versioned README package identity and integration scope |
| Qualification | The adapter is not Pi core and is not maintained by Repomix, FastCode, or CocoIndex. Installation, trust, and lifecycle remain user owned. |

### [H4] pi-mcp-adapter stdio configuration shape

| Field | Record |
| --- | --- |
| Claim supported | The adapter documents project `.pi/mcp.json` entries under `mcpServers` with string `command`, array `args`, and optional `env`. |
| Evidence status | Supported |
| Source URL | https://github.com/nicobailon/pi-mcp-adapter/blob/v2.26.0/README.md |
| Source kind | Versioned repository documentation |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | v2.26.0 |
| Applicable component | Pi MCP adapter extension |
| Evidence excerpt or location | Configuration section: `.pi/mcp.json`, `mcpServers`, `command`, `args`, and `env` |
| Qualification | Provider examples are composed from this adapter syntax and provider commands; no adapter/provider process was executed. |

### [H5] pi-mcp-adapter pinned registry release

| Field | Record |
| --- | --- |
| Claim supported | The repository-approved adapter release is represented by npm package version 2.26.0. |
| Evidence status | Supported |
| Source URL | https://registry.npmjs.org/pi-mcp-adapter/2.26.0 |
| Source kind | Registry |
| Access date | 2026-08-23 |
| Provider version, tag, or commit | 2.26.0 |
| Applicable component | Pi MCP adapter package |
| Evidence excerpt or location | Registry package identity and `version: 2.26.0` |
| Qualification | Installation, trust, configuration, and lifecycle remain user owned; no package was installed or executed. |

## Structured handoff to hrn-00113

### Publishable determinations

| Provider | Guide-safe determination | Required qualification |
| --- | --- | --- |
| Repomix | Current documentation supports experimental repository-packing MCP applicability; applicability to v1.18.0 is **Unknown** because the page is unversioned. | Describe the documented pack/search snapshot workflow without asserting the absence of another persistent index. Document sandbox mode and its application-level, non-OS boundary. |
| FastCode | MCP applicability **Supported** at v1.0.1. | License is **Ambiguous**, not safely publishable as MIT; released MCP can silently use stale indexes because existence causes indexing to be skipped. |
| CocoIndex | MCP applicability **Supported** through `cocoindex-code` v0.2.41. | Keep framework and MCP package versions separate; disclose default anonymous telemetry and optional cloud embedding egress. |

### Host handoff

- OpenCode examples may use the JSON shown in each section, with provider command
  provenance and host-shape provenance retained.
- The key under OpenCode `mcp` or adapter-owned Pi `mcpServers` is user-owned and
  is the only value copied to `skills.sdlc-code-index.mcp_server`.
- Pi core is **Unsupported** as a native MCP host at the checked commit.
  The separately maintained, repository-approved `pi-mcp-adapter` v2.26.0 release
  documents the command/arguments shape that makes each provider composition
  **Supported** at the syntax level. Keep core and adapter statuses separate,
  identify `.pi/mcp.json` as adapter-owned and user-managed, preserve user
  ownership of installation/trust/lifecycle, and do not imply first-party provider
  support or tested operation. [H3], [H4], [H5]
- Do not imply that harnessctl installs, recognizes, registers, starts, stops,
  updates, or removes any provider.

### Unresolved evidence gaps for Verify

- Repomix: optional remote-request TLS, authentication, output
  storage/retention/deletion, local log retention, complete model/database
  dependency contract, and complete removal procedure.
- FastCode: exact root license text/obligations, SSE bind/TLS/auth, telemetry/privacy,
  sandboxing, secret/log handling, pinned supply chain, full update/removal, and
  remote-repository freshness.
- CocoIndex Code: telemetry endpoint/fields/retention/deletion, encryption or
  redaction of credentials stored in YAML/environment, native sandboxing,
  provider-authored package uninstall, downloaded-model licenses, and public terms
  for enterprise/shared processing.
- Pi adapter: provider-specific runtime operation remains untested. The pinned
  v2.26.0 README and registry package authority align for syntax evidence; no
  adapter/provider process was run. [H4], [H5]
- All citations must be rechecked during formal Verify for URL reachability,
  release applicability, and the seven-day freshness threshold.

### Do-not-collapse distinctions

- Repomix packed output is not an index.
- FastCode `main` incremental behavior is not v1.0.1 behavior.
- `baladithyab/FastCode-mcp` is not the official HKUDS integration.
- `cocoindex` framework v1.0.20 is not `cocoindex-code` MCP v0.2.41.
- A provider's MCP support does not overcome Pi core's native MCP non-support;
  adapter composition is a separate status and ownership boundary.
- OSS component licenses/privacy do not automatically cover hosted services,
  enterprise components, downloaded models, or third-party embedding providers.

## Research checks

- Confirmed all three providers use the 13 required headings exactly.
- Confirmed each provider has explicit MCP, OpenCode, Pi, license, lifecycle,
  stale-index, security/privacy, removal, and source records.
- Confirmed all 12 evidence-policy security/privacy topics have explicit statuses.
- Confirmed every `Unknown` is backed by a Search record rather than inferred from
  silence.
- Confirmed comparison-matrix cells link to provider or host citation records.
- Confirmed access date is `2026-08-23` UTC throughout.
- Confirmed research used only official repositories, docs, releases, registries,
  license/security/privacy files, official OpenCode/Pi sources, and separately
  maintained `pi-mcp-adapter` repository/registry evidence.
- Confirmed no provider software command, live MCP handshake, indexing operation,
  configuration mutation, or external-state mutation occurred.
