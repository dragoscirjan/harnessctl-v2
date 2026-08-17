# SDLC commands

## Current implementation

The registry in
[`src/harnessctl/templates.py`](../src/harnessctl/templates.py) contains 18 canonical
templates. Installation renders every template as a hyphenated Markdown command for
OpenCode and Pi. Source inspection, artifact creation, code edits, checks, and
delivery remain theoretical conversation-only actions. When repository memory is
enabled, OpenCode and Pi prompts may perform their explicitly bounded memory retrieval or
persistence hook; that does not prove any SDLC work occurred. Command names describe
the stage being proposed, not automation already performed.

| Installed command       | Stage responsibility                                | Boundary or gate                                       |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `work-new`              | Establish a work contract                           | Confirm scope; stop before exploration                 |
| `work-explore`          | Define an evidence investigation                    | Report unverified gaps; stop before planning           |
| `work-plan`             | Propose an implementation plan                      | Explicit human approval; no implementation             |
| `work-resume`           | Recover interrupted context                         | Report state; never continue silently                  |
| `work-start-initiative` | Propose an initiative decomposition                 | Human approval; do not claim Epics were created        |
| `work-start-epic`       | Establish Epic context                              | User chooses the next stage                            |
| `work-start-from`       | Select an existing active entity                    | Context selection only                                 |
| `work-write-stories`    | Propose an Epic’s Stories                           | Human approval; do not claim Story creation            |
| `work-start-story`      | Establish Story context                             | User chooses the next stage                            |
| `work-design-doc`       | Propose a general design                            | Do not claim the document was written or linked        |
| `work-hld`              | Propose high-level architecture                     | Do not claim the HLD was written or approved           |
| `work-lld`              | Propose low-level design                            | Do not claim the LLD was written or approved           |
| `work-write-tasks`      | Propose atomic implementation tasks                 | Human approval of the task graph                       |
| `work-implement`        | Propose how approved work should be implemented     | Do not edit or claim completion                        |
| `work-verify`           | Define acceptance and quality checks                | Do not run or claim verification                       |
| `work-review`           | Propose an independent review                       | Human accepts, repairs, blocks, or rejects             |
| `work-cvs`              | Propose branch, commit, push, and pull request work | Perform no delivery action; never merge                |
| `work-finish`           | Propose final delivery or deployment                | Perform no deployment; human approval remains required |

OpenCode files are installed under `.opencode/commands/`; Pi files are installed under
`.pi/prompts/`. Rendering is harness-specific, but stage intent is shared. Enabled
repository memory adds bounded entry or exit guidance to both harnesses; it does not
establish approval, completion, verification, merge, or deployment.

A complete example enabling those memory hooks is:

```yaml
communication:
  caveman:
    enabled: true
    mode: strict
memory:
  enabled: true
  backend: repository
  namespace:
    organization_id: local
    project_id: project
    default_topic: general
  retrieval:
    limit: 8
    max_chars: 12000
    include_superseded: false
  repository:
    root: .harnessctl/memory
```

Stage contracts frame expected inputs and bounded outputs. A command must report a
missing prerequisite rather than infer it, and must not silently cross into the next
stage. Plans, decompositions, designs, delivery actions, deployment, and merge retain
their stated human gates. See [FLOWS.md](../FLOWS.md) for the intended tool-enabled
lifecycle, arguments, artifacts, dependencies, resumability, and invalid transitions.

## Planned or future — not implemented

Grouped Pi commands such as `/work plan` are not installed. Short aliases such as
`/plan`, and any other host alias not represented by an installed file, are not
guaranteed. Tool-enabled execution of the lifecycle, automatic orchestration,
model-tier routing, retries, autonomous merge, and automatic deployment are also
outside the current command installer.

See [skills](skills.md) for prompt/skill distinctions and
[configuration](configuration.md) for installer settings.
