# Generated skills

Skills are generated Markdown instructions. They influence agent behavior but do not
grant permissions, register tools, install provider CLIs, or create an authorization
boundary. Tool availability comes from separately loaded host adapters.

## Current implementation

[`src/harnessctl/templates.py`](../src/harnessctl/templates.py) currently registers four
skill templates.

| Skill          | Configuration                                           | OpenCode installation                                          | Purpose                                                        |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Caveman        | `communication.caveman.enabled` and `mode`              | Generated at `.opencode/skills/caveman/SKILL.md` when enabled  | Concise communication without losing exact technical substance |
| Memory         | `memory.enabled`, retrieval bounds, and repository root | Generated at `.opencode/skills/memory/SKILL.md` when enabled   | Safe retrieval and persistence of curated repository knowledge |
| Issue tracking | `issues.type`, `tools`, `root`, and `prefix`            | Always generated at `.opencode/skills/issue-tracking/SKILL.md` | Provider-exclusive local or remote issue workflow guidance     |
| CVS            | `cvs.local` and validated remote provider policy        | Always generated at `.opencode/skills/cvs/SKILL.md`            | Direct Git/Jujutsu and provider-exclusive CLI/MCP guidance      |

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
only the configured CLI/MCP policy. The skill does not install a CLI, perform login,
store credentials, invoke commands itself, or add a remote adapter.

The CVS skill receives only validated local authority, provider, transport, CLI, URL,
environment-variable name, and fixed MCP ID. It keeps Git or Jujutsu local, applies
`auto`, `cli`, or `mcp` remote routing, checks repository context and live capability,
and requires fresh consent immediately before merge. It never receives an environment
value or the complete configuration. The CVS and remote Issues skills share trust,
bounded-read, no-upload, and no-cross-transport-retry guidance while remaining
independent policy owners.

A complete example generating strict caveman and GitHub issue guidance is:

```yaml
communication:
  caveman:
    enabled: true
    mode: strict
memory:
  enabled: false
issues:
  type: github
  tools: gh
  remote:
    transport: auto
    url: https://github.com
    token_env: GH_TOKEN
```

Remote `issues.remote` is required; filesystem rejects it. The token value belongs
only in the named environment variable, never YAML. `issues.root` and `issues.prefix`
are filesystem-only and ignored remotely.

OpenCode host MCP entries are merged into `.opencode/opencode.json`. Pi host entries and
the verified per-call output guard are merged into `.pi/mcp.json` when the exact external
MIT `npm:pi-mcp-adapter@2.26.0` prerequisite is present or separately consented to.
These host files register routes; they do not grant authentication, prove capability,
or install provider CLIs or external GPL `forgejo-mcp` 2.33.0.

No Pi issue-tracking skill path or discovery contract has been verified. Planned
Pi issue- and CVS-skill generation remains compiled out until that boundary is designed
and tested. Pi MCP host configuration is implemented and does not imply skill support.
See [issues](issues.md) and [CVS and MCP providers](cvs.md).
