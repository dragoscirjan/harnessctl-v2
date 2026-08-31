# Harnesses

A coding harness is the application in which you work with an LLM. Harnessctl installs
the same lifecycle concepts into supported harnesses while adapting command, skill, and
tool locations to each host.

## Support matrix

| Harness  | Status            | What you can use                                                    |
| -------- | ----------------- | ------------------------------------------------------------------- |
| OpenCode | `working`         | SDLC commands, generated skills, project tools, and MCP projection. |
| Pi       | `working`         | SDLC prompts, generated skills, project tools, and MCP projection.  |
| Claude   | `not implemented` | No harnessctl command, skill, or tool installation is available.    |
| Codex    | `not implemented` | No harnessctl command, skill, or tool installation is available.    |

The status applies to harnessctl integration, not to the harness product itself. A
supported host still needs its own permissions, provider authentication, and model
configuration.

## OpenCode

**Status:** `working`

OpenCode receives commands under `.opencode/commands/`, skills under
`.opencode/skills/`, and project tool registration in `.opencode/opencode.json`.
Use the installed `work-*` commands or their `/work *` aliases.

Harnessctl merges only entries it can identify as managed. Existing user-owned entries
are preserved when ownership is uncertain, including during forced installation.

## Pi

**Status:** `working`

Pi receives prompts under `.pi/prompts/`, skills under `.pi/skills/`, project tools, and
host configuration under `.pi/`. Use the installed `work-*` prompts or their `/work *`
aliases.

Package installation requires explicit consent. In unattended environments, provide the
installer's dedicated Pi package-consent option rather than bypassing the prompt.

## Claude

**Status:** `not implemented`

Harnessctl does not currently install commands, skills, tools, or MCP entries for Claude.
Do not treat files copied from another harness as a supported Claude installation.

## Codex

**Status:** `not implemented`

Harnessctl does not currently install commands, skills, tools, or MCP entries for Codex.
Do not treat files copied from another harness as a supported Codex installation.

For host-independent workflow behavior, continue with the [SDLC guide](sdlc.md). For MCP
ownership and provider boundaries, see [CVS and MCP providers](cvs.md).
