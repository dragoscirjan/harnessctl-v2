# Harnesses

A coding harness is the application in which you work with an LLM. Harnessctl installs
the same lifecycle concepts into supported harnesses while adapting command, skill,
project-tool, and MCP locations to each host.

**Evidence review date:** 2026-09-02. Status uses the shared
[status and evidence vocabulary](status-and-evidence.md). A status describes only the
harnessctl integration, not the host product or a provider service.

## Read the states correctly

These states are separate:

- **Generated** means harnessctl rendered an artifact.
- **Installed** means the artifact was written to the selected host location.
- **Registered** means the host configuration names a project tool or MCP server.
- **Configured** means the required local settings and environment references exist.
- **Operational** requires the host and provider to load, authenticate, and successfully
  use that integration.

Installation evidence can establish the first three states. It cannot by itself prove
that a provider is authenticated or operational. See [MCP Servers](mcp-servers.md) for
the complete MCP state model and operator boundary.

## Support matrix

| Harness  | Status            | Installation | Commands or prompts | Skills    | Project tools | MCP projection | Configuration                          | Prerequisites                                                                 | Current limitation                                                                                       |
| -------- | ----------------- | ------------ | ------------------- | --------- | ------------- | -------------- | -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OpenCode | `working`         | Supported    | Commands            | Installed | Registered    | Supported      | `.opencode/opencode.json`              | OpenCode plus the [installation prerequisites](installation.md#prerequisites) | Provider authentication and operation remain external.                                                   |
| Pi       | `working`         | Supported    | Prompts             | Installed | Registered    | Supported      | `.pi/mcp.json` and `.pi/settings.json` | Pi, installation prerequisites, and explicit package consent                  | Unattended package installation needs the dedicated consent option; provider operation remains external. |
| Claude   | `not implemented` | Unsupported  | None                | None      | None          | None           | None                                   | Not applicable                                                                | Harnessctl has no Claude installation target.                                                            |
| Codex    | `not implemented` | Unsupported  | None                | None      | None          | None           | None                                   | Not applicable                                                                | Harnessctl has no Codex installation target.                                                             |

The `working` rows are backed by the current
[installer target map](../src/harnessctl/install.py#L41-L44) and
[installer coverage](../tests/test_install.py). The unsupported-host boundary is also
[covered explicitly](../tests/test_install.py#L1716-L1718). These are source and
automated-test evidence, not evidence that any local provider account is operational.

## OpenCode

**Status:** `working`

Harnessctl installs commands under `.opencode/commands/`, skills under
`.opencode/skills/`, and managed project-tool and MCP declarations in
`.opencode/opencode.json`. Use the installed `work-*` commands or their `/work *`
aliases. The [Command Reference](command-reference.md) owns command behavior, and the
[Skills](skills.md) page owns the generated skill catalog.

The installer merges entries it identifies as managed and preserves user-owned entries
when ownership is uncertain, including during forced installation. A generated or
registered declaration still needs valid host permissions, provider authentication, and
model configuration before it is operational. Current behavior is backed by the
[OpenCode installer implementation](../src/harnessctl/install.py) and
[OpenCode installation tests](../tests/test_install.py).

Follow [Installation](installation.md#install-into-the-current-checkout) for the supported command,
reload requirement, replacement controls, and rollback procedure. See
[Configuration](configuration.md) for harnessctl settings and [Node Modules](node-modules.md)
for the separately owned module catalog.

## Pi

**Status:** `working`

Harnessctl installs prompts under `.pi/prompts/`, skills under `.pi/skills/`, MCP
declarations in `.pi/mcp.json`, and managed package settings in `.pi/settings.json`.
Use the installed `work-*` prompts or their `/work *` aliases. The
[Command Reference](command-reference.md) and [Skills](skills.md) pages own those
host-independent contracts.

Pi package installation requires explicit consent. In unattended environments, use
`--allow-pi-package-install`; do not bypass the consent boundary. MCP adapter
registration does not prove provider authentication or operation. Current behavior,
including pinned packages, consent, configuration preservation, and rollback, is backed
by the [Pi installer implementation](../src/harnessctl/install.py) and
[Pi installation tests](../tests/test_install.py).

Follow [Installation](installation.md#install-into-the-current-checkout) for setup and rollback,
[Configuration](configuration.md) for harnessctl settings, [MCP Servers](mcp-servers.md)
for provider ownership, and [Node Modules](node-modules.md) for the separately owned
module catalog.

## Claude

**Status:** `not implemented`

Harnessctl has no Claude installation target, so it does not install or register Claude
commands, skills, project tools, MCP declarations, or configuration. This statement is
limited to harnessctl integration; it makes no claim about Claude product capabilities
or future delivery. Files copied from another host are not a supported harnessctl Claude
installation. Evidence: current [installer target map](../src/harnessctl/install.py#L41-L44)
and [unsupported-host coverage](../tests/test_install.py#L1716-L1718).

## Codex

**Status:** `not implemented`

Harnessctl has no Codex installation target, so it does not install or register Codex
commands, skills, project tools, MCP declarations, or configuration. This statement is
limited to harnessctl integration; it makes no claim about Codex product capabilities or
future delivery. Files copied from another host are not a supported harnessctl Codex
installation. Evidence: current [installer target map](../src/harnessctl/install.py#L41-L44)
and [unsupported-host coverage](../tests/test_install.py#L1716-L1718).

For host-independent workflow behavior, continue with the [SDLC guide](sdlc.md). For
installation and host-state failures, start with [Troubleshooting](troubleshooting.md).
