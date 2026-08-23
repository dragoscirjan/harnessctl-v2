# External code-intelligence providers

This guide compares external repository-intelligence MCP integrations without
recommending or endorsing a provider. Harnessctl is provider-neutral: it does not
install, recognize, register, configure, start, stop, probe, index, watch, update, or
remove a provider, adapter, model, database, credential, process, index, or data store.
Provider instructions are not authorization to run them.

The user owns the host entry and every provider lifecycle decision. Opt-in maps exactly
one user-selected host key into guidance:

```yaml
skills:
  sdlc-code-index:
    enabled: true
    mcp_server: <exact-user-owned-host-key>
```

`skills.sdlc-code-index.mcp_server` only names the user's existing host entry. It does
not declare a provider, create an entry, or transfer ownership to harnessctl. MCP output
is advisory and must be checked against source, configuration, tests, and version-control
state. See the [provider-neutral contract](code-intelligence.md).

## Evidence boundary

Evidence was accessed on **2026-08-23 UTC**. `Supported`, `Unsupported`, `Ambiguous`,
`Unknown`, and `Stale` have the meanings in the local
[evidence policy](../.harnessctl/tasks/hrn-00110/evidence-policy.md). Absence of evidence
is not evidence of absence. Full citation records are in the
[graph-provider research](../.harnessctl/tasks/hrn-00111/research.md) and
[repository-context research](../.harnessctl/tasks/hrn-00112/research.md).

Every citation must be checked within seven calendar days before its research task
completes. Formal Verify must independently recheck URL reachability, version
applicability, status, and guide wording; prior Build freshness is not Verify evidence.
Unreachable, inapplicable, or older evidence becomes `Stale`, and the claim must be
narrowed or removed.

One historical GitNexus `list_repos` invocation occurred through a pre-existing
connection as the Plan-authorized, nonprecedential research exception. Its output is excluded
from claims, citations, search inputs, corroboration, qualifications, the matrix, and
guide wording. No intended mutation was observed. Provider retention, egress, and remote
state resulting from that invocation are **Unknown**. The exception authorizes no later
provider call, handshake, probe, or other operation.

## Comparison matrix

| Provider                              | Version/evidence date                                                                                                                              | MCP applicability                                                                                         | License/component                                                                                            | OpenCode                                                         | Pi                                                                                               | Index/storage ownership                                                                              | Network/data egress                                                                                          | Telemetry                                                                                  | Stale-index behavior                                                                  | Evidence limitations                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CodeGraphContext](#codegraphcontext) | **Ambiguous:** package/source `0.6.5`, GitHub release `v0.5.7`; 2026-08-23 ([CGC-03](../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext)) | **Supported:** stdio MCP ([CGC-06](../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext))          | **Supported:** MIT source; separate components **Unknown** ([CGC-04], [CGC-U01])                             | **Supported:** user-owned composition ([CGC-06], [CGC-07])       | Pi core **Unsupported**; adapter composition **Supported**, untested ([CGC-08], [CGC-09])        | **Unknown:** paths known, ownership terms unresolved ([CGC-11], [CGC-12], [CGC-U13])                 | **Supported:** local/remote paths documented; universal encryption **Unknown** ([CGC-14], [CGC-U03])         | **Unknown** ([CGC-U06])                                                                    | Controls **Supported**; query-time warning **Unknown** ([CGC-13], [CGC-U10])          | Release identity, security, retention, sandbox, hosted terms, and complete cleanup unresolved ([CGC-03], [CGC-U02], [CGC-U07], [CGC-U08], [CGC-U11]) |
| [GitNexus](#gitnexus)                 | **Supported:** `1.6.9`; 2026-08-23 ([GN-01], [GN-02])                                                                                              | **Supported:** stdio MCP ([GN-05])                                                                        | **Supported:** PolyForm Noncommercial 1.0.0 CLI; general commercial grant **Unsupported** ([GN-03], [GN-04]) | **Supported:** user-owned composition ([GN-05], [GN-06])         | Pi core **Unsupported**; adapter composition **Supported**, untested ([GN-07], [GN-08])          | **Unknown:** locations known, cross-store ownership unresolved ([GN-10], [GN-11], [GN-12], [GN-U10]) | **Ambiguous:** optional remote features; exhaustive egress/TLS unresolved ([GN-14], [GN-U03], [GN-U05])      | **Unknown:** Scarf behavior unresolved ([GN-U06])                                          | **Supported:** indexed/current commit comparison ([GN-18])                            | Noncommercial license; auth, credentials, hosted terms, permissions, and cleanup unresolved ([GN-04], [GN-U02], [GN-U04], [GN-U07], [GN-U13])        |
| [Graphify](#graphify)                 | **Ambiguous:** `0.9.48`, conflicting security support table; 2026-08-23 ([GF-02], [GF-03])                                                         | **Supported:** `graphifyy[mcp]` and stdio command ([GF-07], [GF-08])                                      | **Supported:** Apache-2.0 library; retained MIT scope **Ambiguous** ([GF-04], [GF-06])                       | **Supported:** user-owned composition ([GF-08], [GF-09])         | Pi core **Unsupported**; adapter composition **Supported**, untested ([GF-10], [GF-11], [GF-12]) | **Unknown:** `graphify-out/` known, cross-copy ownership unresolved ([GF-14], [GF-U12])              | **Supported:** local code and optional model egress documented; HTTP TLS **Unknown** ([GF-19], [GF-U03])     | **Supported:** README says none ([GF-21])                                                  | Controls **Supported**; query-time warning **Unknown** ([GF-26], [GF-U08])            | Security-version and logging conflicts; retention, hosted terms, sandbox, and cleanup unresolved ([GF-03], [GF-16], [GF-U02], [GF-U06], [GF-U09])    |
| [Repomix](#repomix)                   | **Supported:** `1.18.0`; 2026-08-23 ([R1])                                                                                                         | **Supported:** experimental context packer; release applicability and persistent index **Unknown** ([R3]) | **Supported:** MIT npm CLI/MCP; separate components **Unknown** ([R2], [R23])                                | **Supported:** user-owned composition ([R9])                     | Pi core **Unsupported**; adapter composition **Supported**, untested ([H2], [H4], [H5])          | **Unknown:** output storage, persistence, and ownership ([R3], [R14])                                | **Supported:** offline exceptions and sandbox restrictions documented; remote TLS **Unknown** ([R18], [R21]) | **Supported:** CLI says none; local logs **Unknown** ([R7], [R16])                         | **Unknown:** snapshots require repacking; persistent-index contract unresolved ([R3]) | Auth, output retention/deletion, permissions, hosted terms, and complete cleanup unresolved ([R10], [R22], [R23])                                    |
| [FastCode](#fastcode)                 | **Supported:** `1.0.1`; 2026-08-23 ([F1])                                                                                                          | **Supported:** stdio and optional SSE ([F3])                                                              | **Ambiguous:** README says MIT; root license absent at checked commits ([F2])                                | **Supported:** user-owned composition ([H1], [F3])               | Pi core **Unsupported**; adapter composition **Supported**, untested ([H2], [H4], [H5])          | **Unknown:** paths known, ownership unresolved ([F15], [F21])                                        | **Supported:** LLM calls and URL cloning; SSE exposure details **Unknown** ([F5], [F10], [F13])              | **Unknown:** file logging separately documented ([F17], [F21])                             | **Supported limitation:** existing index files skip refresh ([F4])                    | License, auth/TLS, supply chain, secrets, sandbox, remote freshness, and cleanup unresolved ([F2], [F19], [F24]-[F27])                               |
| [CocoIndex](#cocoindex)               | **Supported:** `cocoindex-code` `0.2.41`; 2026-08-23 ([C1])                                                                                        | **Supported:** `ccc mcp` stdio ([C4])                                                                     | **Supported:** Apache-2.0 MCP/CLI package; separate components **Unknown** ([C3], [C18], [C19])              | **Supported:** provider-published user-owned entry ([C14], [H1]) | Pi core **Unsupported**; adapter composition **Supported**, untested ([H2], [H4], [H5])          | **Unknown:** paths/remapping known, ownership unresolved ([C6])                                      | **Supported:** local model or cloud embedding egress ([C7])                                                  | **Supported:** anonymous usage telemetry with opt-out; retention **Unknown** ([C8], [C16]) | **Supported:** refresh defaults on; disabling permits stale results ([C9])            | Auth, IPC encryption, permissions, sandbox, hosted terms, model licenses, and telemetry lifecycle unresolved ([C12], [C16]-[C19], [C29])             |

Bracketed source IDs without individual links resolve in each provider's **13. Sources**
section and its linked full research record.

## Shared host boundary

OpenCode local MCP syntax is **Supported** as a user-owned key, `type: "local"`, and an
argument-array command ([H1]). Pi core is **Unsupported** for native MCP ([H2]). The
separately maintained `pi-mcp-adapter` `2.26.0` composition is **Supported** at the
documented syntax level but untested; `.pi/mcp.json`, installation, permissions, trust,
updates, and removal remain user-owned ([H3]-[H5]). These examples do not establish a
live handshake or first-party Pi support.

## CodeGraphContext

### 1. Status and version

**Ambiguous.** PyPI and source identify `codegraphcontext` `0.6.5`, while the matching
GitHub release identity was not found and the checked release is `v0.5.7`. [CGC-01]-[CGC-03]

### 2. License

**Supported:** MIT for source commit `39557ada...`, with notice retention required.
Licenses for dependencies, optional databases, bundles, and hosted services are
**Unknown**. [CGC-04], [CGC-05], [CGC-U01]

### 3. Install and update

The registry documents Python 3.10+ and package `codegraphcontext==0.6.5`; installation
or upgrade remains a user-owned package-manager action and was not tested. [CGC-01],
[CGC-20]

### 4. MCP applicability

**Supported:** release-matched source documents `cgc mcp start` as a stdio MCP server.
This is documentation evidence, not interoperability evidence. [CGC-06]

### 5. OpenCode

**Supported**, untested user-owned composition: command array
`["cgc", "mcp", "start"]` under a selected local key such as `codegraphcontext`.
[CGC-06], [CGC-07]

### 6. Pi

Pi core is **Unsupported**. Adapter 2.26.0 composition is **Supported**, untested:
user-owned `.pi/mcp.json` may use `"command": "cgc"` and
`"args": ["mcp", "start"]`. [CGC-08], [CGC-09]

### 7. Server mapping

For that example only, `mcp_server: codegraphcontext` names the exact user-owned host
key. Harnessctl does not recognize or manage CodeGraphContext. [CGC-10]

### 8. Lifecycle and storage

**Supported:** embedded KuzuDB, LadybugDB, and FalkorDB Lite default below
`~/.codegraphcontext/global/db/`; remote FalkorDB, Neo4j, and Nornic are optional.
File-hash caching and watchers support updates. Retention and cross-store ownership are
**Unknown**. [CGC-11]-[CGC-13], [CGC-U02], [CGC-U13]

### 9. Credentials, privacy, telemetry, and security

Local stdio, optional remote databases, package/bundle requests, environment credentials,
and model/database dependencies are documented. Universal transport encryption, MCP
auth/authorization, OS permissions, telemetry, credential redaction/storage, retention,
sandboxing, hosted terms, and ownership are **Unknown**; supply-chain identity is
**Ambiguous** because package/source and GitHub release identities differ. [CGC-03],
[CGC-06], [CGC-12], [CGC-14]-[CGC-17], [CGC-U02]-[CGC-U08], [CGC-U12], [CGC-U13]

### 10. Capabilities and limitations

**Supported:** ingestion, watchers, symbol/relationship search, Cypher, statistics,
bundles, and deletion tools are documented. Ranking, recall, cross-repository semantics,
and language parity are **Unknown**. [CGC-18], [CGC-U09]

### 11. Stale-index behavior

Watcher, hash-cache, and auto-watch controls are **Supported**. Mandatory query-time
Git-head comparison or a standard stale warning is **Unknown**. [CGC-13], [CGC-U10]

### 12. Removal

Database deletion is gated off by default. Complete cleanup of package, local/remote
data, credentials, bundles, and user-owned host entries is **Unknown** and remains the
user's responsibility. [CGC-19], [CGC-U11]

### 13. Sources

Full records: [CGC-01 through CGC-20 and CGC-U01 through CGC-U13](../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext).
Key official evidence includes the
[0.6.5 registry record](https://pypi.org/pypi/codegraphcontext/0.6.5/json) and
[versioned MCP setup](https://github.com/CodeGraphContext/CodeGraphContext/blob/39557ada8ea88dfe23ff54cef1df1bedfa542b9a/docs/docs/getting-started/mcp-setup.md).

## GitNexus

### 1. Status and version

**Supported:** npm and release tag identify GitNexus `1.6.9` at commit `4227194...`.
[GN-01], [GN-02]

### 2. License

**Supported:** the CLI source uses PolyForm Noncommercial License 1.0.0. A general
commercial production-use grant is **Unsupported**; dependencies and service terms are
**Unknown**. Obtain legal review for a specific use. [GN-03], [GN-04], [GN-U01]

### 3. Install and update

The npm package requires Node.js 22+. Installation remains user-owned; an authoritative
release-specific update procedure is **Unknown**. [GN-20], [GN-U15]

### 4. MCP applicability

**Supported:** `gitnexus mcp` is the documented local MCP command. It was not run for
this guide. [GN-05]

### 5. OpenCode

**Supported**, untested user-owned composition: command array
`["gitnexus", "mcp"]` under a selected local key such as `gitnexus`. [GN-05], [GN-06]

### 6. Pi

Pi core is **Unsupported**. Adapter 2.26.0 composition is **Supported**, untested:
user-owned `.pi/mcp.json` may use `"command": "gitnexus"` and `"args": ["mcp"]`.
[GN-07], [GN-08]

### 7. Server mapping

For that example only, `mcp_server: gitnexus` names the exact user-owned host key. It
does not authorize or repeat the historical research invocation. [GN-09]

### 8. Lifecycle and storage

**Supported:** each checkout stores index data and caches in repository-local
`<repo>/.gitnexus/`; `~/.gitnexus/registry.json` is distinct global MCP discovery
metadata, not the index directory. Browser mode uses OPFS. Cross-store ownership and
global registry permissions are **Unknown**. [GN-10]-[GN-13], [GN-U02], [GN-U10]

### 9. Credentials, privacy, telemetry, and security

Local MCP and optional serve/publish/wiki surfaces make network exposure and exhaustive
egress **Ambiguous**. npm integrity/signature/provenance is **Supported**. TLS, auth,
broad permissions, optional-key handling, retention, sandboxing, hosted terms, ownership,
and Scarf telemetry behavior are **Unknown**. [GN-14]-[GN-16], [GN-U02]-[GN-U10],
[GN-U14]

### 10. Capabilities and limitations

**Supported:** context/graph queries, impact analysis, processes, Cypher, change
detection, and repository management are documented. Language parity and formal
retrieval guarantees are **Unknown**. [GN-17], [GN-U11]

### 11. Stale-index behavior

**Supported:** source compares indexed and current Git commits and classifies staleness;
re-analysis is the refresh path. Dirty worktrees, rewritten history, and concurrent
queries remain **Unknown**. [GN-18], [GN-U12]

### 12. Removal

Local clean/uninstall logic is documented, but complete cleanup of every repository
`.gitnexus/`, global registry, OPFS, published artifact, credential, backup, adapter, and
host entry is **Unknown** and user-owned. [GN-19], [GN-U13]

### 13. Sources

Full records: [GN-01 through GN-20 and GN-U01 through GN-U15](../.harnessctl/tasks/hrn-00111/research.md#gitnexus).
Key official evidence includes the
[v1.6.9 license](https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/LICENSE)
and [storage source](https://github.com/abhigyanpatwari/GitNexus/blob/4227194ad7bdfbedc29a7fe20e09c6737ce0e744/gitnexus/src/storage/repo-manager.ts).

## Graphify

### 1. Status and version

**Ambiguous:** PyPI/source identify `graphifyy` `0.9.48`, but its security policy's
supported-version table names `0.3.x`. [GF-01]-[GF-03]

### 2. License

**Supported:** `v0.9.48` declares Apache-2.0 and ships `LICENSE`, `NOTICE`, and
`LICENSE-MIT`. Exact file-level scope of retained MIT material is **Ambiguous**; external
services/models are **Unknown**. [GF-04]-[GF-06], [GF-U01]

### 3. Install and update

The MCP dependency is the `graphifyy[mcp]` extra. Provider docs describe uv-managed
installation/update, but no command was run and package lifecycle remains user-owned.
[GF-07]

### 4. MCP applicability

**Supported:** with the MCP extra and an existing graph, the documented stdio command is
`python -m graphify.serve graphify-out/graph.json`; a `graphify-mcp` script also exists.
[GF-07], [GF-08], [GF-28]

### 5. OpenCode

**Supported**, untested user-owned composition: command array
`["python", "-m", "graphify.serve", "graphify-out/graph.json"]` under a selected local
key such as `graphify`. [GF-08], [GF-09]

### 6. Pi

Pi core is **Unsupported**; a Graphify Pi skill is not native MCP. Adapter 2.26.0
composition is **Supported**, untested, using command `python` and args
`["-m", "graphify.serve", "graphify-out/graph.json"]` in user-owned `.pi/mcp.json`.
[GF-10]-[GF-12]

### 7. Server mapping

For that example only, `mcp_server: graphify` names the exact user-owned host key.
Harnessctl does not build `graphify-out/` or start Graphify. [GF-13]

### 8. Lifecycle and storage

**Supported:** generated artifacts default to repository-local `graphify-out/`, which is
documented as intended for Git. Query-log default is **Ambiguous** because one table says
off while privacy prose says every query is logged. Retention and ownership are
**Unknown**. [GF-14]-[GF-16], [GF-U02], [GF-U12]

### 9. Credentials, privacy, telemetry, and security

Stdio defaults and HTTP loopback/API-key options are **Supported**. Local code parsing,
optional model egress, environment credentials, and a no-telemetry documentation claim
are documented. HTTP TLS, complete auth/key lifecycle, file/process permissions,
credential handling, retention, ownership, native sandboxing, hosted terms, and complete
signed provenance are **Unknown**; query logging remains **Ambiguous**. [GF-16]-[GF-24],
[GF-29], [GF-U02]-[GF-U06], [GF-U10]-[GF-U13]

### 10. Capabilities and limitations

**Supported:** local AST graph extraction, graph query/path/explain, MCP tools, and
optional document/media enrichment. Language parity and deterministic retrieval are
**Unknown**. [GF-25], [GF-U07]

### 11. Stale-index behavior

`--update`, `--watch`, and hook workflows are **Supported** freshness controls.
Mandatory query-time Git-head validation and standard stale warnings are **Unknown**.
[GF-26], [GF-U08]

### 12. Removal

Provider docs say purge removes `graphify-out/`. Complete removal of package, logs,
credentials, external-provider copies, backups, adapter, and host entries is **Unknown**
and user-owned. [GF-27], [GF-U09]

### 13. Sources

Full records: [GF-01 through GF-29 and GF-U01 through GF-U13](../.harnessctl/tasks/hrn-00111/research.md#graphify).
Key official evidence includes the
[v0.9.48 project metadata](https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/pyproject.toml)
and [README](https://github.com/Graphify-Labs/graphify/blob/b2cd36267456c166788c95be6e68574064a92a42/README.md).

## Repomix

### 1. Status and version

**Supported:** official release `v1.18.0` applies to the npm CLI and built-in MCP mode.
[R1]

### 2. License

**Supported:** MIT for the `v1.18.0` npm CLI/MCP package, with notice retention.
Licenses/terms for dependencies, remote services, and separate components are
**Unknown**. [R2], [R11], [R23]

### 3. Install and update

Node 22+ and several package/distribution channels are documented; npm integrity,
signature, and provenance metadata are **Supported**. Update/removal remains specific to
the user's chosen package manager. [R5], [R6], [R19]

### 4. MCP applicability

**Supported:** current unversioned docs describe an experimental MCP repository packer
and packed-output reader/searcher. Applicability to `v1.18.0` and existence of another
persistent index are **Unknown**. Repomix packed output is a snapshot, not an asserted
semantic index. [R3]

### 5. OpenCode

**Supported**, untested user-owned composition: command array
`["npx", "-y", "repomix@1.18.0", "--mcp", "--sandbox"]` under a selected local key such
as `repomix`. The version pin and sandbox flag are narrowed guide choices. [R3], [R9],
[H1]

### 6. Pi

Pi core is **Unsupported**. Adapter 2.26.0 composition is **Supported**, untested, with
command `npx` and args `[-y, repomix@1.18.0, --mcp, --sandbox]` represented as JSON
strings in user-owned `.pi/mcp.json`. [H2]-[H5]

### 7. Server mapping

For that example only, `mcp_server: repomix` names the exact user-owned host key. It is
not an external-server lifecycle declaration. [R3], [H1]

### 8. Lifecycle and storage

**Supported:** MCP packs repositories and returns output IDs; sandbox confines its tool
surface to a workspace root and disables remote/write-capable tools, but is not OS
isolation. Persistent index existence, output location, retention, deletion, and
ownership are **Unknown**. [R3], [R4], [R14], [R22]

### 9. Credentials, privacy, telemetry, and security

CLI offline exceptions, optional remote packing, update checks, sandbox restrictions,
Secretlint, URL credential redaction, and a no-telemetry/repository-transmission policy
are **Supported**. Remote TLS, MCP auth, broad permissions, complete credential handling,
local-log retention, output lifecycle/ownership, complete model/database contract, and
hosted terms are **Unknown**. [R4], [R7], [R8], [R10], [R14]-[R16], [R18], [R20]-[R23]

### 10. Capabilities and limitations

**Supported:** local/optional remote packing and regex search over generated output;
sandbox mode removes network/write-capable tools. It is a context packer, not documented
AST/embedding semantic retrieval. [R3], [R4]

### 11. Stale-index behavior

**Unknown** for any persistent index. Documented packed outputs are snapshots and must be
repacked after source changes; no automatic freshness promise is established. [R3]

### 12. Removal

One provider-authored procedure covering every distribution channel is **Unknown**.
Package, packed outputs, adapter, and user-owned host entries require separate cleanup.
[R17], [R22], [H1]

### 13. Sources

Full records: [R1-R23 and shared H1-H5](../.harnessctl/tasks/hrn-00112/research.md#repomix).
Key official evidence includes the [v1.18.0 release](https://github.com/yamadashy/repomix/releases/tag/v1.18.0)
and [MCP documentation](https://repomix.com/guide/mcp-server).

## FastCode

### 1. Status and version

**Supported:** official release `v1.0.1` at commit `f11da389...`; newer `main` is
untagged and is not release evidence. [F1], [F11], [F14]

### 2. License

**Ambiguous:** the `v1.0.1` README says MIT, but root `LICENSE` lookups at the release and
checked `main` commits fail and repository metadata detects no license. A vendored
subcomponent license does not resolve the root license or redistribution obligations.
[F2]

### 3. Install and update

Source documents Python 3.12 and unpinned `requirements.txt` installation. Package
artifact integrity and an official update procedure are **Unknown**. Lifecycle remains
user-owned. [F9], [F19], [F23]

### 4. MCP applicability

**Supported:** `v1.0.1` includes first-party `mcp_server.py`, six tools, stdio by default,
and optional SSE. Unrelated wrappers are not this integration. [F3], [F16]

### 5. OpenCode

**Supported**, untested user-owned composition: command array with the user's absolute
virtual-environment Python path and `/path/to/FastCode/mcp_server.py`, under a selected
local key such as `fastcode`. Required provider environment remains process-owned. [F3],
[F10], [H1]

### 6. Pi

Pi core is **Unsupported**. Adapter 2.26.0 composition is **Supported**, untested, using
those user-owned Python/script paths in `.pi/mcp.json`; provider variables are inherited
from the process environment. [F3], [H2]-[H5]

### 7. Server mapping

For that example only, `mcp_server: fastcode` matches the user-owned external key, not
the internal FastMCP label. [F16], [H1]

### 8. Lifecycle and storage

**Supported:** startup can clone/index repositories and log to `logs/mcp_server.log`.
Defaults use `./data/vector_store`, `./data/cache`, `./repos`, and `./logs`, with optional
Redis. Cache/session TTL and selected metadata/session deletion exist; index retention
and storage ownership are **Unknown**. [F5], [F6], [F8], [F15], [F20]-[F22]

### 9. Credentials, privacy, telemetry, and security

Configured LLM calls, URL cloning, local embeddings/FAISS, optional Redis, and file
logging are documented. SSE bind/TLS/auth, broad permissions, supply-chain integrity,
telemetry, secret/log handling, index retention, ownership, sandboxing, and hosted terms
are **Unknown**. Content exclusions are not a sandbox or secret scanner. [F7], [F9],
[F10], [F13], [F15]-[F21], [F25]-[F27]

### 10. Capabilities and limitations

**Supported:** repository Q&A, repository/session listing, history/deletion, metadata
deletion, local/Git URL inputs, multi-repository queries, AST units, semantic/BM25
retrieval, and relationship graphs. Q&A may call the configured LLM and is not
local-only. [F7], [F10], [F16]

### 11. Stale-index behavior

**Supported limitation:** `v1.0.1` treats matching FAISS and metadata files as indexed
and skips refresh without comparing source or remote revision. Newer untagged `main`
behavior does not change the released result. [F4], [F11]

### 12. Removal

Metadata/session tools remove only named artifacts. Full cleanup of clones, indexes,
caches, logs, environment, Redis, credentials, processes, adapter, and host entries is
**Unknown** and user-owned. [F6], [F22], [F24]

### 13. Sources

Full records: [F1-F27 and shared H1-H5](../.harnessctl/tasks/hrn-00112/research.md#fastcode).
Key official evidence includes the [v1.0.1 release](https://github.com/HKUDS/FastCode/releases/tag/v1.0.1)
and [MCP source](https://github.com/HKUDS/FastCode/blob/f11da38916aa87d886b7469adf3d5316deaa88fa/mcp_server.py).

## CocoIndex

### 1. Status and version

**Supported:** the applicable MCP package is `cocoindex-code` `0.2.41`. It is distinct
from the generic CocoIndex framework `1.0.20`; versions are not interchangeable. [C1],
[C2]

### 2. License

**Supported:** Apache-2.0 for the `cocoindex-code` `0.2.41` package, with Apache notice,
change, attribution, and patent conditions. Models, cloud providers, enterprise/Plus
components, and services have separate **Unknown** terms. [C3], [C13], [C18], [C19]

### 3. Install and update

Provider docs describe pipx/uv install and upgrade paths. PyPI/release digests and OIDC
publishing are **Supported**; actions are tag-pinned rather than commit-pinned. Full/local
embedding mode downloads model dependencies; lifecycle remains user-owned. [C5], [C7],
[C11], [C25]

### 4. MCP applicability

**Supported:** `ccc mcp` runs a stdio server with one semantic `search` tool. The generic
framework is not the MCP executable, and CLI-only structural grep is not an MCP tool.
[C1], [C2], [C4], [C9]

### 5. OpenCode

**Supported**, untested user-owned provider-published composition: command array
`["ccc", "mcp"]` under a selected local key such as `cocoindex-code`. [C14], [H1]

### 6. Pi

Pi core is **Unsupported**. Adapter 2.26.0 composition is **Supported**, untested:
user-owned `.pi/mcp.json` may use `"command": "ccc"` and `"args": ["mcp"]`. [C4],
[H2]-[H5]

### 7. Server mapping

For that example only, `mcp_server: cocoindex-code` names the exact user-owned host key.
Harnessctl does not manage `ccc` or its daemon. [C9], [C14]

### 8. Lifecycle and storage

**Supported:** `ccc mcp` fronts an automatically started local daemon with configurable
heartbeat/idle timeout. Defaults include global/project settings and project-local
`cocoindex.db`/`target_sqlite.db`, with path remapping. Reset and daemon stop are separate
operations. Ownership terms are **Unknown**. [C6], [C10], [C22], [C23]

### 9. Credentials, privacy, telemetry, and security

**Supported:** local or cloud embedding modes, broad project reads, database/model
dependencies, package provenance, and anonymous usage telemetry with documented content
exclusions and opt-out. Cloud/LiteLLM mode sends embedding input to the selected provider.
Auth, daemon IPC encryption, broad process permissions, credential encryption/redaction,
telemetry retention/deletion, ownership, native sandboxing, hosted terms, and downloaded
model licenses are **Unknown**. [C7], [C8], [C11], [C12], [C15]-[C19], [C25], [C26],
[C29]

### 10. Capabilities and limitations

**Supported:** semantic search with pagination and language/path filters, AST-aware
chunking, and incremental indexing. The `0.2.41` MCP surface is one search tool, not
call-graph or impact-analysis tools; structural grep is CLI-only. [C4], [C9], [C27]

### 11. Stale-index behavior

**Supported:** search refreshes incrementally by default. Disabling `refresh_index`
permits stale results after source changes; changing embedding dimensions requires reset
and reindex. [C9], [C24], [C27]

### 12. Removal

Index reset and daemon stop are documented, while provider-authored package-uninstall
syntax is **Unknown**. Package, settings, database, telemetry, model cache, Docker data,
adapter, and host entries require separately reviewed user-owned cleanup. [C20], [C22],
[C23], [C28]

### 13. Sources

Full records: [C1-C29 and shared H1-H5](../.harnessctl/tasks/hrn-00112/research.md#cocoindex).
Key official evidence includes the
[cocoindex-code v0.2.41 release](https://github.com/cocoindex-io/cocoindex-code/releases/tag/v0.2.41),
[MCP source](https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/src/cocoindex_code/server.py),
and [telemetry disclosure](https://github.com/cocoindex-io/cocoindex-code/blob/9fd2e7470a8b042a338dc3cc47fb9940ac5ebb59/README.md#telemetry).

## Migration and manual cleanup

Unreleased harnessctl builds may have generated provider-specific MCP entries. Current
harnessctl does not own or reconcile them. Audit user-owned `.opencode/opencode.json` and
`.pi/mcp.json`; remove or retain each old entry according to current intent, then map
only the exact retained host key through `skills.sdlc-code-index.mcp_server`.

Disabling code intelligence preserves an existing generated skill and warns instead of
deleting it. If removal is intended, manually review the warned generated skill path.
Also separately stop provider/adapter processes and review package installations,
repository/global/browser indexes, caches, logs, cloned source, databases, model files,
credentials, environment/YAML settings, remote or published data, backups, telemetry,
and hosted-service retention. Removal coverage is provider- and deployment-specific;
`Unknown` items above must not be assumed deleted. Confirm no other project uses shared
packages or data before removal. Harnessctl performs none of these actions.

[CGC-04]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U01]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-06]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-07]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-08]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-09]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-11]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-12]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-13]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-14]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U02]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U03]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U06]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U07]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U08]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U10]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U11]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U13]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[GN-01]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-02]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-03]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-04]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-05]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-06]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-07]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-08]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-10]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-11]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-12]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-14]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-18]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U02]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U03]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U04]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U05]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U06]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U07]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U10]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U13]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GF-02]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-03]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-04]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-06]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-07]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-08]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-09]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-10]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-11]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-12]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-14]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-16]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-19]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-21]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-26]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U02]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U03]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U06]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U08]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U09]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U12]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[R1]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R2]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R3]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R7]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R9]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R10]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R14]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R16]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R18]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R21]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R22]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R23]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[F1]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F2]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F3]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F4]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F5]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F10]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F13]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F15]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F17]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F19]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F21]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F24]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F25]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F26]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F27]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[C1]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C3]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C4]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C6]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C7]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C8]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C9]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C12]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C14]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C16]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C17]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C18]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C19]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C29]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[H1]: ../.harnessctl/tasks/hrn-00112/research.md#shared-host-citation-records
[H2]: ../.harnessctl/tasks/hrn-00112/research.md#shared-host-citation-records
[H3]: ../.harnessctl/tasks/hrn-00112/research.md#shared-host-citation-records
[H4]: ../.harnessctl/tasks/hrn-00112/research.md#shared-host-citation-records
[H5]: ../.harnessctl/tasks/hrn-00112/research.md#shared-host-citation-records
[CGC-01]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-03]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-05]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-10]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-17]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-18]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-19]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-20]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U09]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[CGC-U12]: ../.harnessctl/tasks/hrn-00111/research.md#codegraphcontext
[GN-09]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-13]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-16]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-17]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-19]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-20]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U01]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U11]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U12]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U14]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GN-U15]: ../.harnessctl/tasks/hrn-00111/research.md#gitnexus
[GF-01]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-13]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-24]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-25]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-27]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-28]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-29]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U01]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U07]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U10]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[GF-U13]: ../.harnessctl/tasks/hrn-00111/research.md#graphify
[R4]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R5]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R6]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R8]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R11]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R17]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R19]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[R20]: ../.harnessctl/tasks/hrn-00112/research.md#repomix
[F6]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F7]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F8]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F9]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F11]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F14]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F16]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F20]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F22]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[F23]: ../.harnessctl/tasks/hrn-00112/research.md#fastcode
[C2]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C5]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C10]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C11]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C13]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C15]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C20]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C22]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C23]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C24]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C25]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C26]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C27]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
[C28]: ../.harnessctl/tasks/hrn-00112/research.md#cocoindex
