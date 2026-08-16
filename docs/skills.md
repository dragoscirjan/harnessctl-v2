# Generated skills

Skills are generated Markdown instructions. They influence agent behavior but do not
grant permissions, register tools, install provider CLIs, or create an authorization
boundary. Tool availability comes from separately loaded host adapters.

## Current implementation

[`src/harnessctl/templates.py`](../src/harnessctl/templates.py) currently registers three
skill templates.

| Skill          | Configuration                                           | OpenCode installation                                          | Purpose                                                        |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Caveman        | `communication.caveman.enabled` and `mode`              | Generated at `.opencode/skills/caveman/SKILL.md` when enabled  | Concise communication without losing exact technical substance |
| Memory         | `memory.enabled`, retrieval bounds, and repository root | Generated at `.opencode/skills/memory/SKILL.md` when enabled   | Safe retrieval and persistence of curated repository knowledge |
| Issue tracking | `issues.type`, `tools`, `root`, and `prefix`            | Always generated at `.opencode/skills/issue-tracking/SKILL.md` | Provider-exclusive local or remote issue workflow guidance     |

Memory requires caveman. Enabling memory also installs the OpenCode plugin entry and
adds `@harnessctl/opencode-tools` to `.opencode/package.json`; this is the current
adapter-registration path. The memory skill receives only compiled retrieval limits
and repository root, not the whole configuration.

All 18 SDLC prompts are configuration-rendered. OpenCode receives memory hooks when
memory is enabled. Pi prompt rendering intentionally omits those hooks.

OpenCode and Pi adapter packages expose generic configuration, filesystem issue, and
repository-memory tools. Pi has normalized memory tool registration in
`@harnessctl/pi-tools`, but harnessctl does not install a Pi extension or skill.
Memory-enabled `--harness pi` and `--harness all` installation therefore fail before
writes; operators must register the Pi package themselves.

The issue-tracking skill is self-contained and provider-specific. Filesystem mode
documents normalized harnessctl tools and revision handling. Remote modes document
only the configured CLI boundary. The skill does not install a CLI, perform login,
store credentials, invoke commands itself, or add a remote adapter.

No Pi issue-tracking skill path or discovery contract has been verified. Planned
Pi issue-skill generation remains compiled out until that boundary is designed and
tested. See [issues](issues.md) for filesystem support and configured routing.
