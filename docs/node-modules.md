# Node Modules

Harnessctl ships a harness-neutral tools package and two host adapters. This catalog
describes those public workspace packages, how they relate, and the boundary of the
evidence available in this repository.

**Evidence review date:** 2026-09-02. Status uses the shared
[status and evidence vocabulary](status-and-evidence.md). A `working` package entry
means current source and automated tests cover the described repository behavior. It
does not claim that a package is currently available from the npm registry or that an
external host or provider is operational.

## What belongs in this catalog

A catalog entry is a workspace selected by the root
[workspace configuration](../package.json) whose manifest declares public access. The
private root workspace, individual source files, generated skills, MCP servers,
provider processes, and installer components are not separate Node Module entries.

Packages supply programmatic capabilities. [Skills](skills.md) supply agent guidance,
[MCP Servers](mcp-servers.md) describe provider connections, and
[Installation](installation.md) owns how harnessctl writes and registers artifacts for
a project. The [Harnesses](harnesses.md) page owns host support status. For Pi package
consent, path, timeout, or registration failures, see
[Troubleshooting](troubleshooting.md#pi-package-installation).

## Package relationships

All three packages are ESM packages at version `0.1.10`, use the MIT license, and
declare Node `^22.13.0 || >=24.0.0`. The adapters depend on the generic layer rather
than reimplementing its project operations.

| Package                      | Layer           | Consumer or environment        | Loading path                                  | Direct harnessctl relationship        | Status    |
| ---------------------------- | --------------- | ------------------------------ | --------------------------------------------- | ------------------------------------- | --------- |
| `@harnessctl/generic-tools`  | Harness-neutral | Adapter authors or integrators | ESM import from its public package entrypoint | Foundation used by both host adapters | `working` |
| `@harnessctl/opencode-tools` | Host adapter    | OpenCode project tools         | OpenCode plugin registration                  | Depends on `generic-tools` `0.1.10`   | `working` |
| `@harnessctl/pi-tools`       | Host adapter    | Pi extension runtime           | Pi extension entrypoint                       | Depends on `generic-tools` `0.1.10`   | `working` |

**Evidence:** Source: the [root workspace declaration](../package.json) and the three
package manifests linked beside their entries. Automated test: the
[package inspection script](../scripts/check-packages.mjs) builds and packs this exact
inventory, checks required metadata and entrypoints, and rejects unsafe package
contents. This evidence validates local release artifacts, not registry publication.

## `@harnessctl/generic-tools`

**Purpose:** Provide harness-neutral project operations and generated contracts that
host adapters can expose through their own tool APIs.

**Capability:** Read and create harnessctl configuration; manage local issues,
documents, and curated memory; validate those stores; and expose configuration schemas
and defaults. The [Configuration](configuration.md), [Issues](issues.md),
[Documents](documents.md), and [Memory](memory.md) references own the exact contracts.

**Consumer or environment:** Host adapters and Node integrators that need the shared
project behavior without OpenCode- or Pi-specific registration.

**Conceptual inputs and outputs:** Accepts repository-local paths and validated tool
arguments; returns structured project-authority results or generated JSON contracts.

**Loading path:** Import the ESM entrypoint or exported JSON contracts. This package is
not a standalone coding harness or host extension.

**Prerequisites:** Node `^22.13.0 || >=24.0.0` and a repository in which the caller is
authorized to read or change harnessctl project authority.

**Limitations:** It does not register tools with a host, install prompts or skills,
start MCP providers, authenticate external services, or guarantee private source-file
APIs.

**Related components:** Used by both adapters below. See [Config Schema](config-schema.md)
for generated configuration contracts and [Command Reference](command-reference.md)
for lifecycle prompts, which are separate from this package API.

**Status:** `working`

**Evidence:** Source and generated-contract evidence: the
[package manifest](../extensions/generic-tools/package.json), public entrypoint, and
published-file declaration. Automated test: the package's
[configuration](../extensions/generic-tools/config.spec.ts),
[document](../extensions/generic-tools/documents.spec.ts),
[issue](../extensions/generic-tools/issues.spec.ts), and
[memory](../extensions/generic-tools/memory.spec.ts) suites plus package inspection.

## `@harnessctl/opencode-tools`

**Purpose:** Adapt the generic project operations to OpenCode's project-tool interface.

**Capability:** Register configuration, issue, document, and memory tools so OpenCode
can invoke the shared harnessctl behavior. Exact tool contracts remain in the linked
[reference pages](docs-overview.md#choose-a-content-type).

**Consumer or environment:** An OpenCode project configured to load the harnessctl
plugin.

**Conceptual inputs and outputs:** Receives OpenCode tool calls, delegates validated
operations to `@harnessctl/generic-tools`, and returns host-compatible tool results.

**Loading path:** Harnessctl registers the plugin through the OpenCode project
configuration described by [Installation](installation.md) and
[Harnesses](harnesses.md#opencode).

**Prerequisites:** Node `^22.13.0 || >=24.0.0`, the latest OpenCode plugin, a supported OpenCode
project installation, and the required runtime capabilities. Major host releases require
deliberate integration review; patch releases need no version-specific harnessctl policy.

**Limitations:** Registration does not prove that OpenCode loaded the plugin or that an
external MCP provider authenticated or operated successfully. The package does not add
support for other harnesses and does not make private implementation files public API.

**Related components:** Depends exactly on `@harnessctl/generic-tools` `0.1.10`. Skills,
commands, configuration, and MCP state remain owned by [Skills](skills.md),
[Command Reference](command-reference.md), [Configuration](configuration.md), and
[MCP Servers](mcp-servers.md).

**Status:** `working`

**Evidence:** Source: the [package manifest](../extensions/opencode-tools/package.json)
and [adapter registration](../extensions/opencode-tools/index.ts). Automated test: the
[registration and delegation suite](../extensions/opencode-tools/index.spec.ts) and
[host integration suite](../extensions/opencode-tools/integration.test.ts).

## `@harnessctl/pi-tools`

**Purpose:** Adapt the generic project operations to Pi's extension tool interface.

**Capability:** Register configuration, issue, document, and memory tools so Pi can
invoke the shared harnessctl behavior. Exact tool contracts remain in the linked
[reference pages](docs-overview.md#choose-a-content-type).

**Consumer or environment:** A Pi project configured to load the harnessctl extension.

**Conceptual inputs and outputs:** Receives Pi tool calls, delegates validated
operations to `@harnessctl/generic-tools`, and returns Pi-compatible text results.

**Loading path:** The manifest declares `./dist/index.js` as its Pi extension entrypoint.
Harnessctl manages the pinned package setting through the consent-aware process in
[Installation](installation.md) and [Harnesses](harnesses.md#pi).

**Prerequisites:** Node `^22.13.0 || >=24.0.0`, the latest Pi coding agent, a supported Pi project
installation, the required runtime capabilities, and explicit consent before harnessctl installs
managed Pi packages. Major host releases require deliberate integration review; patch releases
need no version-specific harnessctl policy.

**Limitations:** Package declaration or installation does not prove that Pi loaded the
extension or that an external MCP provider authenticated or operated successfully. The
package does not add support for other harnesses and does not make private
implementation files public API.

**Related components:** Depends exactly on `@harnessctl/generic-tools` `0.1.10`. Skills,
prompts, configuration, and MCP state remain owned by [Skills](skills.md),
[Command Reference](command-reference.md), [Configuration](configuration.md), and
[MCP Servers](mcp-servers.md).

**Status:** `working`

**Evidence:** Source: the [package manifest](../extensions/pi-tools/package.json) and
[adapter registration](../extensions/pi-tools/index.ts). Automated test: the
[registration and delegation suite](../extensions/pi-tools/index.spec.ts),
[host integration suite](../extensions/pi-tools/integration.test.ts), and
[release-artifact coverage](../tests/test_release_artifacts.py).
