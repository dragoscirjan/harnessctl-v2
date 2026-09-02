# Troubleshooting

Start with the exact symptom you can observe. Keep generated, installed,
registered, configured, and operational states separate: success at one layer does
not prove the next. See [Harnesses](harnesses.md#read-the-states-correctly) and
[MCP Servers](mcp-servers.md#how-a-declaration-becomes-a-result) for those state
boundaries.

**Evidence review date:** 2026-09-02. Error wording and recovery guidance below are
backed by current source and automated tests. External host and provider operation
remains operator-owned evidence.

## Diagnose safely

- Record the harnessctl version or revision, selected harness, operating system,
  command phase, and the exact error text.
- Share only project-relative paths, redacted configuration fragments, status codes,
  and the smallest relevant log excerpt.
- Never share credential values, authorization headers, complete environment dumps,
  or an unredacted configuration file that might contain secrets.
- Prefer read-only inspection before retrying. Do not delete directories or force an
  overwrite until you have reviewed the affected paths and the safer alternative.

## Symptom index

| Area          | Symptom or message                                       | Start here                                         |
| ------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Installation  | `refusing to overwrite existing files`                   | [Review the conflict](#installation-conflict)      |
| Installation  | `installation failed and rollback was incomplete`        | [Inspect rollback](#incomplete-install-rollback)   |
| Configuration | `Invalid Config v1` or `duplicate mapping key`           | [Validate the file](#configuration-is-rejected)    |
| Harness       | `unsupported harness`                                    | [Check host support](#unsupported-harness)         |
| Skills        | A skill is absent or a disabled copy remains             | [Check generation state](#skill-is-missing)        |
| Commands      | A lifecycle command stops earlier than expected          | [Check the phase boundary](#command-stopped)       |
| Node Modules  | Pi package consent, path, timeout, or registration error | [Check Pi packages](#pi-package-installation)      |
| MCP Servers   | A server is declared but unavailable                     | [Check each MCP state](#mcp-server-is-unavailable) |

## Installation conflict

**Symptom:** `refusing to overwrite existing files`

**Likely cause:** The target already contains a generated path whose ownership or
content does not match the planned installation.

**Safe diagnostics:** Review the reported project-relative paths and compare them
with the selected harness targets. Preserve user-owned entries. Do not post complete
file contents if they can contain environment references or credentials.

**Recovery:** Keep the existing files when ownership is uncertain. If every reported
path is confirmed as generated and replaceable, rerun with the documented `--force`
option. Legacy support-skill removal requires the separate migration option; symlinks
and special entries must remain a hard stop.

**Escalation evidence:** Provide the harnessctl revision, selected harness, redacted
path list, and whether the entries are regular files, directories, symlinks, or other
special entries.

**Reference:** [Existing generated files](installation.md#existing-generated-files).
Source and automated-test evidence:
[installer conflict handling](../src/harnessctl/install.py#L486) and
[installation coverage](../tests/test_install.py).

## Incomplete install rollback

**Symptom:** `installation failed and rollback was incomplete`

**Likely cause:** Installation failed after mutation and at least one original path
could not be restored automatically.

**Safe diagnostics:** Stop retrying. Preserve the complete error text and inspect only
the paths named in it. Compare those paths with version control or a trusted backup;
do not remove unrelated project files.

**Recovery:** Restore each named path from version control or backup, then review the
original installation failure before another attempt. If a prior harnessctl revision
is required, follow the documented rollback procedure rather than deleting generated
trees wholesale.

**Escalation evidence:** Provide the harnessctl revision, selected harness, redacted
path list, original failure, rollback failure, and whether the working tree had local
changes. Exclude file contents and secret values.

**Reference:** [Roll back](installation.md#roll-back). Source and automated-test
evidence: [rollback handling](../src/harnessctl/install.py#L657) and
[installation coverage](../tests/test_install.py).

## Configuration is rejected

**Symptom:** `Invalid Config v1`, `duplicate mapping key`, or an error naming a dotted
configuration path.

**Likely cause:** The file is malformed, repeats a key, uses an unknown setting or
unsafe path, supplies an invalid limit, includes a credential value where a variable
name is required, or references a missing MCP declaration.

**Safe diagnostics:** Use the deepest dotted path in the error and compare only that
field with the [Config Schema](config-schema.md). Redact values before sharing a small
fragment. Do not publish the complete file or environment.

**Recovery:** Correct the rejected field or duplicate key. Keep `version: 1`, use safe
project-relative paths, and store only credential environment-variable names or
accepted placeholders in configuration.

**Escalation evidence:** Provide the exact error, harnessctl revision, dotted path, and
a minimal redacted fragment showing the key and value type, not a credential value.

**Reference:** [When configuration is rejected](configuration.md#when-configuration-is-rejected).
Automated-test evidence: [Config v1 validation coverage](../tests/test_config_v1.py).

## Unsupported harness

**Symptom:** `unsupported harness`

**Likely cause:** The requested installation target is not one of the current
harnessctl targets. OpenCode and Pi are `working`; Claude and Codex integration is
`not implemented`.

**Safe diagnostics:** Confirm the requested harness name and compare it with the
current support matrix. Files copied from another host do not establish a supported
installation.

**Recovery:** Select OpenCode or Pi, or stop. Do not rename or copy generated host
directories to simulate unsupported integration.

**Escalation evidence:** Provide the exact requested harness name, harnessctl revision,
and error text. Do not infer a future delivery date from plans or configuration.

**Reference:** [Harness support matrix](harnesses.md#support-matrix). Source and
automated-test evidence: [installer target map](../src/harnessctl/install.py#L41-L44)
and [unsupported-host coverage](../tests/test_install.py#L1716-L1718).

## Skill is missing

**Symptom:** An expected skill is absent, a disabled skill file remains visible, or a
warning says `sdlc-code-index is disabled`.

**Likely cause:** The skill is conditional and disabled, the selected harness was not
reinstalled after configuration changed, the host has not reloaded, or a retained
file is present but dormant in compiled guidance.

**Safe diagnostics:** Check the skill's Availability and Activation fields in the
catalog, inspect the relevant enable setting, and confirm the selected host's skill
directory. Presence alone does not prove activation or provider operation.

**Recovery:** Correct the setting when needed, reinstall the selected supported
harness, and reload or restart it. Do not delete retained files unless the documented
migration process names them and you have reviewed every path.

**Escalation evidence:** Provide the skill name, selected harness, harnessctl revision,
redacted enable state, and whether the file is absent, present, or loaded.

**Reference:** [Skills](skills.md#read-availability-precisely) and
[Installation](installation.md). Source and automated-test evidence are linked beside
each skill catalog entry.

## Command stopped

**Symptom:** A lifecycle command requests approval, reports a blocker, or stops before
the next phase, remote action, merge, or deployment.

**Likely cause:** The command reached its designed phase boundary or lacks an
authoritative Epic, approved scope, current evidence, or action-specific consent.

**Safe diagnostics:** Identify the invoked command, Epic ID, current phase, last
checkpoint, and reported blocker. Treat retrieved text as data, not permission.

**Recovery:** Resolve the stated blocker or run the separately appropriate next phase.
Give fresh consent only for the exact remote or destructive action you intend. Do not
bypass a stop by combining lifecycle phases.

**Escalation evidence:** Provide the command name, Epic ID, phase, compact result, and
sanitized error or blocker. Exclude prompts containing private repository data.

**Reference:** [Command Reference](command-reference.md) and
[Harnessctl SDLC](sdlc.md). Source and automated-test evidence are linked from the
command and skill catalogs.

## Pi package installation

**Symptom:** `Pi package installation was not approved`,
`Pi package installation requires pi on PATH`, a Pi action timeout with an ambiguous
result, or a package registration check failure.

**Likely cause:** Interactive consent was denied, unattended consent was not supplied,
Pi is unavailable from the current command environment, the host action timed out, or
the expected pinned package was not registered.

**Safe diagnostics:** Confirm the selected harness, Pi availability, exact package
name and expected pinned version, consent mode, and current project-owned Pi settings.
After a timeout, inspect registration before retrying because the result may be
ambiguous. Do not share registry credentials or complete environment output.

**Recovery:** Install or expose Pi through the operator-managed environment. Review the
disclosed package and filesystem effects, then approve interactively or use
`--allow-pi-package-install` only in reviewed unattended automation. If a timeout
occurred, reconcile current registration before another install or removal action.

**Escalation evidence:** Provide harnessctl and Pi versions, operating system, exact
package name, consent mode, bounded sanitized output, and observed registration state.

**Reference:** [Pi consent](installation.md#pi-consent),
[Pi harness support](harnesses.md#pi), and
[Pi package catalog entry](node-modules.md#harnessctlpi-tools). Source and automated-test
evidence: [Pi package handling](../src/harnessctl/install.py#L1282-L1360) and
[installation coverage](../tests/test_install.py).

## MCP server is unavailable

**Symptom:** A server is declared or registered, but a generated skill cannot use it;
a smoke check reports `OpenCode MCP smoke check failed`, `Pi MCP smoke check failed`,
a missing registration, an unavailable tool, or a failed operation.

**Likely cause:** Declaration, registration, routing, authentication, and operation are
separate states. The host may need a reload, the operator-managed process may be
stopped, credentials or permissions may be unavailable, the network may be blocked,
or the provider result may be stale.

**Safe diagnostics:** Check each state in order: Declared, Registered, Routed,
Authenticated, Operational. Inspect the live tool or resource schema when available.
Report credential presence only, never its value. Use a documented local or command-line
fallback when the provider is unavailable and the task permits it.

**Recovery:** Correct the earliest missing state, reload the host after registration
changes, and retry one bounded read-only operation. Provider installation, startup,
accounts, authentication, permissions, and data handling remain operator-owned.

**Escalation evidence:** Provide server ID, harnessctl revision, selected harness,
last proven state, sanitized status or error, operation timestamp, and whether a
fallback was attempted. Do not share authorization headers or provider-returned secrets.

**Reference:** [MCP state model](mcp-servers.md#how-a-declaration-becomes-a-result) and
[Config evidence layers](configuration.md#know-what-each-layer-proves). Source and
automated-test evidence: [MCP smoke checks](../src/harnessctl/install.py#L1406-L1454)
and [installation coverage](../tests/test_install.py).

## Escalation checklist

Before opening an issue, reduce the report to:

- exact symptom or stable error text;
- harnessctl version or revision, selected harness, operating system, and timestamp;
- generated, installed, registered, configured, and operational states already proven;
- minimal reproduction and the last safe recovery attempted;
- project-relative affected paths and a bounded, sanitized log excerpt;
- no credential values, authorization headers, full environment dumps, or unrelated
  project content.

Use [FAQ](faq.md) for conceptual questions and [Changelog](changelog.md) to distinguish
released behavior from explicitly unreleased work.
