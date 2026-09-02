# Installation

Harnessctl currently installs from a source checkout. OpenCode and Pi are supported;
Claude and Codex integration is not implemented. Install only into a project whose
generated harness files you are prepared to review.

## Prerequisites

- Git and [mise](https://mise.jdx.dev/) are available.
- `uv` is required, but no separate `uv` installation is needed for this path. The
  repository's `mise` toolchain declares and provisions it for the setup task.
- You have a harnessctl source checkout at the revision you intend to install.
- You can review changes under `.opencode/` and `.pi/` in the target project.

## Install into the current checkout

From the harnessctl checkout, prepare its tools and install both supported harnesses:

```bash
mise run setup
mise run install-prompts
```

The installation task targets the current checkout. For an explicit target directory or
a single host, use the source installer's options documented under
[Installing prompts](../README.md#installing-prompts).

OpenCode receives commands under `.opencode/commands/`, skills under
`.opencode/skills/`, and project tool registration in `.opencode/opencode.json`. Pi
receives prompts under `.pi/prompts/`, skills under `.pi/skills/`, and project-owned
configuration under `.pi/`.

Reload or restart the selected host after installation so it discovers the generated
commands and skills.

## Pi consent

Pi package installation asks for per-package consent in an interactive session. In
noninteractive automation, review the disclosed package and filesystem effects before
passing `--allow-pi-package-install`. Without that explicit flag, noninteractive Pi
package installation stops instead of assuming consent.

## Existing generated files

Installation stops on conflicting generated files by default. Review the conflict before
using `--force`, which authorizes replacement of generated files but does not authorize
deleting legacy support-skill directories.

Normal upgrades preserve those legacy directories and report their paths. After reviewing
the migration disclosure, `--replace-sdlc-skill-set` separately authorizes removal of the
selected host's legacy support-skill trees. Symlinks and special entries abort that
migration before mutation.

## Roll back

Install the prior harnessctl revision with `--force`, then reload or restart the host.
Remove renamed support-skill directories only when the prior revision does not manage
them and you have reviewed each path. Harnessctl does not read, modify, or own global
OpenCode skills under `~/.config/opencode`.

Continue with [Getting Started](getting-started.md) to confirm the installed `/work-plan`
command through a bounded first workflow.
