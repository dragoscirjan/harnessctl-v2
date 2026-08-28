# Generated skills

Skills are generated Markdown instructions. They influence agent behavior but do not
grant permissions, register tools, install provider CLIs, or create an authorization
boundary. Tool availability comes from separately loaded host adapters.

## Current implementation

[`src/harnessctl/templates.py`](../src/harnessctl/templates.py) currently registers eight
skill templates.

| Skill ID              | Configuration                                           | Installation                                             | Purpose                                                              |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `sdlc-caveman`        | `communication.caveman.enabled` and `mode`              | OpenCode when enabled; Pi always                         | Concise communication without losing exact technical substance       |
| `sdlc-code-index`     | `skills.sdlc-code-index`                                | Each selected harness only when enabled                  | Relationship-aware retrieval with source verification and fallback   |
| `sdlc-code`           | None                                                    | Always under each selected harness's `skills/` directory | Build-only clean-code policy plus conditional ecosystem references   |
| `sdlc-memory`         | `memory.enabled`, retrieval bounds, and repository root | OpenCode when enabled; Pi always                         | Safe retrieval and persistence of curated repository knowledge       |
| `sdlc-issue-tracking` | `issues.type`, `tools`, `root`, and `prefix`            | Always under each selected harness's `skills/` directory | Provider-exclusive local or remote issue workflow guidance           |
| `sdlc-cvs`            | `cvs.local` and validated remote provider               | Always under each selected harness's `skills/` directory | Direct Git/Jujutsu and provider-exclusive CLI/MCP guidance           |
| `sdlc`                | Memory availability, retrieval bounds, and TDD setting  | Always under each selected harness's `skills/` directory | Epic-first core policy plus progressively disclosed phase references |
| `sdlc-develop-tdd`    | `workflow.tdd.enabled`                                  | Each selected harness only when enabled                  | Red-Green-Refactor development guidance                              |

Generated support-skill ownership is explicit in each renamed ID. The breaking rename
map contains only five support skills:

| Legacy ID        | Current ID            |
| ---------------- | --------------------- |
| `caveman`        | `sdlc-caveman`        |
| `cvs`            | `sdlc-cvs`            |
| `develop-tdd`    | `sdlc-develop-tdd`    |
| `issue-tracking` | `sdlc-issue-tracking` |
| `memory`         | `sdlc-memory`         |

The existing `sdlc`, `sdlc-code`, and `sdlc-code-index` IDs are retained unchanged and
are never legacy migration targets.

Fresh installs generate only current IDs. A normal upgrade, including one using
`--force`, detects the five legacy support roots without traversing them, preserves every
entry byte-for-byte, and warns with their exact paths. Remove disclosed directories
manually or pass `--replace-sdlc-skill-set` to delete the selected harnesses' legacy
support trees transactionally. The flag discloses every affected root before mutation,
rejects symlinks and special entries, and restores file bytes, file existence, and
directory topology if installation fails. It never changes the functional
`skills.sdlc-code-index` configuration key, MCP IDs, commands, global skills, or an
unselected host.

The retired `sdlc-documents` ID is not generated and is not part of the rename set. On
each selected host, installation removes it transactionally only when the complete tree
is the exact historical managed one-file output with the expected byte size and SHA-256.
Modified, additional, special, unreadable, or symlink entries preserve the complete tree
and produce an exact-path warning. This fingerprint rule also applies under `--force`.

Memory requires caveman. Every OpenCode installation registers
`@harnessctl/opencode-tools@latest` in `.opencode/opencode.json`; config and issue tools
therefore remain available even when memory is disabled. Older local plugin shims are
retired. The memory skill receives only compiled retrieval limits and repository root,
not the whole configuration.

`sdlc-code` is always installed as byte-equivalent OpenCode and Pi trees containing one
generic policy and 26 bundled references. Build loads the root once, then reads only
references relevant to the confirmed files and repository context. Explicit repository
policy and approved scope take precedence, followed by detected runtime, compiler,
framework, version, and existing-tool constraints; ecosystem references and generic
defaults apply only when higher-priority evidence is silent. Named tools are alternatives,
not cumulative installation requirements, and no dependency or configuration is added
unless the approved task requires it.

Dispatch uses file content, manifests, lockfiles, tool configuration, shebangs, and
embedded-language declarations rather than extension alone. Ambiguous `.h` and `.sh`
files require repository evidence. TSX combines TypeScript with React guidance only when
React is established; Vue and Svelte select JavaScript or TypeScript from their script
declarations. Documentation, data, configuration, markup, styles, and IaC receive only
relevant guidance, not class-oriented rules by default. Harnessctl neither depends on nor
modifies global skills under `~/.config/opencode`.

GDScript dispatch uses `.gd` files plus Godot project evidence such as `project.godot` and
the supported engine version. Its overlay treats GDScript as distinct from Python, preserves
Godot lifecycle and resource ownership semantics, and follows existing diagnostics and test
tooling rather than installing a new Godot toolchain.

TDD is disabled by default. When enabled, OpenCode and Pi receive byte-equivalent
canonical skills at `.opencode/skills/sdlc-develop-tdd/SKILL.md` and
`.pi/skills/sdlc-develop-tdd/SKILL.md`. Build guidance then loads
`sdlc-develop-tdd` before
implementation and requires observable Red, Green, and Refactor steps. No TDD skill or
instruction is generated on a fresh disabled install. Disabling TDD does not delete,
modify, warn about, or track ownership of an existing skill. A skill left by an earlier
enabled install remains available for manual use but is dormant: the Build reference
still loads `sdlc-code`, but its compiled policy does not load or enforce
`sdlc-develop-tdd`.

SDLC code indexing is disabled by default. Enabled OpenCode and Pi selections receive
byte-equivalent canonical skills at
`.opencode/skills/sdlc-code-index/SKILL.md` and
`.pi/skills/sdlc-code-index/SKILL.md`. The skill receives only the validated external MCP
server name. It treats results as advisory retrieval evidence, verifies findings against
repository sources, and uses Glob/Grep when the service is unavailable, stale,
incomplete, or unsuitable. Ordinary Plan, Build, Verify, Release, and Continue use it
for retrieval only. The sole `work-refresh` exception may invoke an exact supported
repository-scoped refresh operation after live-schema inspection and fresh consent. It
grants no installation, setup, startup, configuration, watching, clearing, deletion,
reset, model, credential, database, remote, destructive, or general lifecycle authority.
When code indexing is enabled, the always-installed SDLC core loads
`sdlc-code-index` when
the skill is available and relationship-aware codebase retrieval or impact analysis is
relevant. When disabled, the compiled core explicitly refuses to load a discoverable
retained copy and continues with direct source discovery, Glob, Grep, and file reads.
The compiled Refresh reference also loads `sdlc-code-index` before code-index discovery,
uses only its configured server and boundaries, and refuses alternate providers or routes.

A fresh disabled install creates no code-index skill. Code-index configuration does not
inspect or change code-index MCP entries; unrelated generic CVS and issue MCP projection
remains active and unchanged. Disabling after an enabled install does not delete or
modify the existing skill. Instead, harnessctl emits one warning for each selected host
whose discoverable file remains active-capable, naming
`.opencode/skills/sdlc-code-index/SKILL.md` or
`.pi/skills/sdlc-code-index/SKILL.md` for manual removal. Harnessctl never deletes it
automatically. Every external MCP registration, process, package, index, credential, and
data store remains user-owned.

All six compact SDLC command shells are rendered under `.opencode/commands/` or the
official Pi `.pi/prompts/` path. Each shell loads the SDLC skill and exactly one normal
command reference. The SDLC tree contains 14 references. Conditional references are
loaded only when their named condition occurs. Memory policy is compiled once into
`sdlc/references/checkpoint.md`, not repeated inside every command.

OpenCode and Pi adapter packages expose generic configuration, filesystem issue,
repository-local Documents, and repository-memory tools. Documents lifecycle guidance is
part of the existing SDLC Plan reference, not a separate skill. Pi installs
`npm:@harnessctl/pi-tools@latest` project-locally;
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
or install provider CLIs, official MIT `gitea-mcp` 1.6.0, or external GPL
`forgejo-mcp` 2.33.0.

Pi uses the official `.pi/skills/<name>/SKILL.md` discovery path for generated skills.
Issue guidance is written to `.opencode/skills/sdlc-issue-tracking/SKILL.md` or
.pi/skills/sdlc-issue-tracking/SKILL.md`. No Documents agent or skill is generated.
See [issues](issues.md), [documents](documents.md), [CVS and MCP providers](cvs.md), and
[code intelligence](code-intelligence.md).
