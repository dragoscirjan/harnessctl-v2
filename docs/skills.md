# Generated skills

Skills are generated Markdown instructions. They influence agent behavior but do not
grant permissions, register tools, install provider CLIs, or create an authorization
boundary. Tool availability comes from separately loaded host adapters.

## Current implementation

[`src/harnessctl/templates.py`](../src/harnessctl/templates.py) currently registers four
skill templates.

| Skill          | Configuration                                           | Installation                                                | Purpose                                                        |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Caveman        | `communication.caveman.enabled` and `mode`              | OpenCode when enabled; always `.pi/skills/caveman/SKILL.md` | Concise communication without losing exact technical substance |
| Memory         | `memory.enabled`, retrieval bounds, and repository root | OpenCode when enabled; always `.pi/skills/memory/SKILL.md`  | Safe retrieval and persistence of curated repository knowledge |
| Issue tracking | `issues.type`, `tools`, `root`, and `prefix`            | Always under each selected harness's `skills/` directory    | Provider-exclusive local or remote issue workflow guidance     |
| CVS            | `cvs.local` and validated remote provider               | Always under each selected harness's `skills/` directory    | Direct Git/Jujutsu and provider-exclusive CLI/MCP guidance      |

Memory requires caveman. Enabling memory also installs the OpenCode plugin entry and
adds `@harnessctl/opencode-tools` to `.opencode/package.json`; this is the current
adapter-registration path. The memory skill receives only compiled retrieval limits
and repository root, not the whole configuration.

All 18 SDLC prompts are configuration-rendered under `.opencode/commands/` or the
official Pi `.pi/prompts/` path. Both harnesses receive memory hooks when
memory is enabled.

OpenCode and Pi adapter packages expose generic configuration, filesystem issue, and
repository-memory tools. Pi installs `npm:@harnessctl/pi-tools@latest` project-locally;
its `pi.extensions` manifest loads the tool registration extension.

The issue-tracking skill is self-contained and provider-specific. Filesystem mode
documents normalized harnessctl tools and revision handling. Remote modes document
the configured provider's valid CLI and MCP capabilities. The skill does not install a CLI, perform login,
store credentials, invoke commands itself, or add a remote adapter.

The CVS skill receives only validated local authority, provider, CLI, URL,
environment-variable name, fixed MCP ID, and the valid capabilities exposed by each
route. It keeps Git or Jujutsu local and lets the agent choose CLI or MCP for each remote
operation after checking repository context and live capability. The choice must be made
before mutation and cannot change after mutation begins. It requires fresh consent
immediately before merge and never receives an environment value or the complete
configuration. CVS and remote Issues remain independent policy owners.

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

Pi uses the official `.pi/skills/<name>/SKILL.md` discovery path for all four skills.
Issue guidance is written to `.opencode/skills/issue-tracking/SKILL.md` or
`.pi/skills/issue-tracking/SKILL.md`.
See [issues](issues.md) and [CVS and MCP providers](cvs.md).
