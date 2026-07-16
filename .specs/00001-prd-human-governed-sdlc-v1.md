# Human-Governed SDLC v1: OpenCode Orchestrator Foundation

**Document type:** Technical design baseline / PRD
**Status:** Draft for implementation planning
**Scope:** OpenCode adapter and first human-governed bug-fix vertical slice
**Related issues:** Initiative `00001`; Story `00002`

## 1. Executive summary

So what I am hearing is: harnessctl must make development work safer, more inspectable, and more economical **inside an existing coding harness**, without becoming another harness. OpenCode is the first host. The first product is therefore a small, check-in-friendly distribution of OpenCode agents, commands, skills, configuration guidance, and file-based workflow artifacts.

The first vertical slice is one primary OpenCode Orchestrator and one hidden, generic Tier-0 subagent. The Orchestrator guides a small bug fix through intake, evidence-based exploration, plan generation, human approval, implementation, verification, human review, and optional delivery preparation. OpenCode supplies the model loop, sessions, tools, permissions, approvals, and subagent execution. harnessctl supplies the workflow protocol, prompts, contracts, policies, artifact conventions, and OpenCode packaging.

The initial design deliberately does **not** introduce a harnessctl runtime, database, plugin, external tracker, worktree manager, Pi.dev adapter, automatic escalation engine, or automatic merge.

## 2. Goals and non-goals

### Goals

1. Make the first bug-fix workflow implementable as OpenCode configuration and content.
2. Preserve a harness-neutral lifecycle and contracts beneath OpenCode-specific packaging.
3. Make task progress recoverable from `.harnessctl/` without the original chat transcript.
4. Make claims distinguishable from tool-backed evidence.
5. Put model tiers, approval gates, retry limits, and delivery permissions behind readable project configuration.
6. Establish extension points for later routing, ensembles, escalation, providers, Pi.dev, and self-development.

### Non-goals for v1

- A standalone executable, daemon, scheduler, or agent runtime.
- A database or event-sourcing system.
- Permanent planner/coder/reviewer personas.
- External issue-tracker or hosting integration.
- Worktrees, deployment, or automatic PR merge.
- Fully automatic retry/ensemble/escalation orchestration.
- Game-specific workflows.
- OpenCode plugins or custom tools unless a blocking gap is demonstrated.

## 3. OpenCode capability findings

The following facts were checked against the official OpenCode documentation on 2026-07-16. OpenCode is version-sensitive; implementation must recheck the installed version and schema before packaging.

| Capability | Verified OpenCode behavior | v1 consequence |
|---|---|---|
| Agents | Agents can be configured in `opencode.json` or Markdown under project `.opencode/agents/`; modes include `primary`, `subagent`, and `all`. Agent config supports description, model, prompt, temperature, steps, hidden, and permissions. | Install one primary `orchestrator` and one hidden `worker-tier-0` subagent. |
| Delegation | Primary agents can invoke subagents using the native `task` tool. `permission.task` can allow/ask/deny named subagents using patterns. Hidden agents remain callable by Task. | Orchestrator delegates assignments through OpenCode Task; no harnessctl worker runtime is needed. |
| Commands | Markdown commands live under `.opencode/commands/`; frontmatter can select agent, model, and `subtask`. Templates support arguments, shell-output injection, and file references. | Commands are thin lifecycle entry points that instruct the Orchestrator; they are not a state machine engine. |
| Skills | On-demand `SKILL.md` files are discovered under `.opencode/skills/<name>/`; `name` and `description` are required. Access is permission-controlled. | Put reusable workflow rules and output schemas in skills; load only when needed. |
| Tools | Built-ins include read/search (`read`, `glob`, `grep`), mutation (`edit`, `write`, `apply_patch`), shell (`bash`), delegation (`task`), question, skill, LSP, and web tools. | v1 relies on native tools, not custom harnessctl tools. |
| Permissions | Rules resolve to `allow`, `ask`, or `deny`, can be global/per-agent and pattern-specific. Explicit deny remains enforced in `--auto` mode. | OpenCode permission prompts are the host-level safety boundary; workflow approvals are recorded in artifacts as the product-level decision boundary. |
| Models | Model IDs use `provider/model-id`; agents and commands can select a model. Local providers are supported. | Abstract harnessctl tiers resolve to concrete OpenCode model IDs in project config. Tiers are not assumed to be OpenCode-native. |
| Config | JSON/JSONC config is merged across remote, global, project, `.opencode`, and managed sources. Project config is check-in compatible; environment/file substitution exists. | Keep harnessctl defaults in `.opencode` and project policy in `.harnessctl`; avoid secrets in Git. |
| MCP | Local and remote MCP servers can be configured and exposed as tools, globally or per agent. MCP adds context overhead. | MCP is optional in v1; expose capability names, not vendor names. |
| Plugins | JavaScript/TypeScript plugins can add hooks and tools. | Defer plugins: they are an extension escape hatch, not a v1 dependency. |

Sources: [agents](https://opencode.ai/docs/agents/), [config](https://opencode.ai/docs/config/), [commands](https://opencode.ai/docs/commands/), [skills](https://opencode.ai/docs/skills/), [permissions](https://opencode.ai/docs/permissions/), [tools](https://opencode.ai/docs/tools/), [models](https://opencode.ai/docs/models/), [MCP](https://opencode.ai/docs/mcp-servers/), [CLI](https://opencode.ai/docs/cli/), [plugins](https://opencode.ai/docs/plugins/), [rules](https://opencode.ai/docs/rules/).

### Important qualification

OpenCode commands are prompt templates, and OpenCode permissions are host execution controls. Neither is a durable workflow transaction system. The Orchestrator must therefore use explicit filesystem artifacts and conservative instructions to represent state. A later runtime may automate these transitions, but v1 must not pretend that prompts provide transactional guarantees.

## 4. Boundary architecture

```text
Human
  │ request / approval / review
  ▼
OpenCode primary agent: orchestrator
  │ native Task calls, native tools, native permission prompts
  ▼
OpenCode hidden subagent: worker-tier-0
  │ reads assignment and writes result through normal workspace tools
  ▼
Repository + .harnessctl task artifacts
```

### harnessctl owns

- Harness-neutral lifecycle vocabulary and transition rules.
- Assignment, result, evidence, approval, decision, and report contracts.
- Prompt/skill content that teaches the Orchestrator how to apply those contracts.
- Abstract capability names and model tier names.
- Default policy, artifact layout, report requirements, and extension points.
- OpenCode distribution files and installation/upgrade documentation.

### OpenCode owns

- Model/provider calls and model selection syntax.
- Conversation/session lifecycle and context handling.
- Invoking subagents through Task.
- File, search, shell, LSP, web, and MCP tool execution.
- Permission prompts and enforcement.
- Its own config merging, snapshots, TUI/CLI, and optional server/API.

### Deliberate boundary rule

If a requirement can be expressed as an agent prompt, command template, skill, project config, or ordinary artifact, it belongs in harnessctl v1. If it requires durable scheduling, cross-session execution control, atomic transitions, hidden state, or provider-independent tool execution, it is a future runtime/adapter concern and must not be smuggled into v1 through prompt complexity.

## 5. First vertical slice

### Supported task

One small, repository-local bug fix with a bounded file scope and an existing or easily identified verification command. The task must not require external tracker data, deployment, secrets, schema migration, or broad redesign.

### Lifecycle

```text
NEW
 → INTAKE_RECORDED
 → EXPLORING
 → PLAN_READY
 → WAITING_PLAN_APPROVAL
 → IMPLEMENTING
 → VERIFYING
 → WAITING_HUMAN_REVIEW
 → DELIVERY_READY
 → FINISHED
```

Alternative terminal/exception states: `BLOCKED`, `REJECTED`, `ABANDONED`.

Allowed recovery transitions:

- `EXPLORING` → `EXPLORING` for a bounded retry with recorded feedback.
- `PLAN_READY` → `EXPLORING` when evidence is insufficient.
- `VERIFYING` → `IMPLEMENTING` only after an explicit repair decision and updated assignment.
- Any active state → `BLOCKED` when required capability, approval, or evidence is unavailable.

### Human gates

Required in the first slice:

1. Plan approval before any implementation edit.
2. Approval before paid-model use when the selected policy requires it.
3. Human review after verification before delivery preparation is accepted.
4. Approval before push and pull-request creation when configured.
5. Merge is forbidden to automation, regardless of policy.

OpenCode `ask` permissions may provide an additional prompt, but a prompt alone is not the durable approval record. The Orchestrator must write an approval artifact containing the task ID, plan hash/version, decision, actor, timestamp, scope, and optional rationale.

### Stage contracts

| Stage | May modify repository? | Required output |
|---|---:|---|
| Intake | No | `intake.md`: objective, task type, constraints, success criteria, risks, unknowns. |
| Explore | No | `exploration.md`: confirmed facts, commands/evidence, relevant files, hypotheses, unresolved questions. |
| Plan | No | `plan.md`: bounded change, files, sequence, tests, rollback, risks, plan version/hash. |
| Approval | No | `approvals/plan-<version>.md`: human decision tied to exact plan. |
| Implement | Yes, only within approved scope | `worker-results/<id>.md`: changes made, deviations, evidence, unresolved issues. |
| Verify | Prefer no repository edits | `verification.md`: exact commands, exit codes, output summaries, changed-file list, unsupported claims. |
| Human review | No automatic changes | `decisions.md`: accept, request repair, block, or reject, tied to verification and diff. |
| Finish | Delivery actions only if approved | `finish.md`: final state, checks, diff summary, commit/PR preparation status; never merge. |

## 6. Orchestrator-to-anonymous-worker contract

The worker is an execution slot, not a persona. `worker-tier-0.md` has stable host configuration; all meaningful role identity is supplied per invocation.

### Assignment input

The Orchestrator must provide a self-contained assignment artifact or prompt containing:

```yaml
assignment_id: TASK-001-A003
task_id: TASK-001
protocol_version: "1"
stage: explore | plan | implement | verify | review
role_label: repository-investigator # descriptive runtime label, not an installed persona
objective: "..."
requirements:
  - "..."
confirmed_context:
  - fact: "..."
    evidence_ref: ".harnessctl/tasks/TASK-001/exploration.md#..."
unresolved_questions:
  - "..."
approved_scope:
  files: ["src/...", "tests/..."]
  forbidden_changes: ["..." ]
permitted_capabilities: [repository.read, repository.search, command.run]
acceptance_criteria:
  - "..."
prior_failure_findings: []
output_contract: worker-result-v1
```

For implementation, `approved_scope` and the plan approval reference are mandatory. The worker must not infer permission to edit from a general request. The assignment should pass targeted context and artifact references, not the whole prior conversation.

### Result output

The worker must return a structured result with:

- assignment ID and worker invocation ID;
- status: `complete`, `incomplete`, `blocked`, or `failed`;
- claimed findings/actions;
- evidence references, including exact tool commands where applicable;
- files read/changed;
- acceptance criteria mapping;
- deviations and unresolved risks;
- recommendation: accept, retry, repair, escalate, or ask human.

The Orchestrator treats a claim without evidence as unverified. Malformed, incomplete, contradictory, or out-of-scope results cannot complete a stage. A later judge may normalize results, but v1 judgment is performed by the Orchestrator using the contract and deterministic tool output.

## 7. Minimum OpenCode distribution

The installable package should be organized conceptually as follows; the exact installer mechanism is implementation work.

```text
harnessctl/
├── opencode/
│   ├── agents/
│   │   ├── orchestrator.md
│   │   └── worker-tier-0.md
│   ├── commands/
│   │   ├── sdlc-intake.md
│   │   ├── sdlc-explore.md
│   │   ├── sdlc-plan.md
│   │   ├── sdlc-implement.md
│   │   ├── sdlc-verify.md
│   │   └── sdlc-finish.md
│   └── skills/
│       ├── sdlc-protocol/SKILL.md
│       ├── assignment-contract/SKILL.md
│       └── evidence-reporting/SKILL.md
├── templates/
│   ├── assignments/worker-assignment-v1.yaml
│   ├── results/worker-result-v1.md
│   └── reports/*.md
├── defaults/
│   ├── models.yaml
│   ├── policy.yaml
│   └── workflow.yaml
└── docs/
    └── opencode-installation.md
```

The project installation adds or updates `.opencode/` content and creates `.harnessctl/` defaults. It must not silently overwrite user-authored agents, commands, skills, or policy; installation and upgrade conflict behavior must be explicit.

### Minimum agent behavior

`orchestrator.md` is primary and may read/search, ask questions, write artifacts, invoke `worker-tier-0`, and edit the repository only after the policy and artifact gates authorize it. Its prompt must emphasize that OpenCode permissions are not a substitute for lifecycle approval.

`worker-tier-0.md` is hidden, `mode: subagent`, and initially read-only for explore/plan assignments. Because one static agent permission set cannot safely express per-assignment capability changes, implementation should use one of these conservative approaches: separate OpenCode worker slots per permission profile, OpenCode `ask` permissions plus strict assignment instructions, or a later adapter/runtime. The first implementation must not claim that assignment text can revoke an OpenCode permission already granted.

## 8. Project configuration and artifacts

### Recommended project layout

```text
.harnessctl/
├── config.yaml              # protocol version, enabled harness adapter, paths
├── models.yaml              # abstract tiers -> concrete OpenCode model IDs
├── policy.yaml              # approvals, retries, costs, delivery limits
├── workflow.yaml            # task types and allowed transitions
├── capabilities.yaml        # optional capability/provider declarations
├── tasks/
│   └── TASK-001/
│       ├── task.yaml
│       ├── intake.md
│       ├── exploration.md
│       ├── plan.md
│       ├── approvals/
│       │   └── plan-v1.md
│       ├── assignments/
│       ├── worker-results/
│       ├── verification.md
│       ├── decisions.md
│       └── finish.md
├── reports/
└── artifacts/               # optional durable evidence not belonging to one task
```

`task.yaml` contains current state, task type, branch, plan version, active assignment IDs, and references to artifacts. It is a derived index, not the only source of truth. Human-readable Markdown remains authoritative for decisions and reports.

### Configuration minimum

```yaml
# models.yaml
tiers:
  local:
    model: "provider/model-id"
    purpose: scouting
  capable:
    model: "provider/model-id"
    purpose: implementation-or-repair
  premium:
    model: "provider/model-id"
    purpose: unresolved-risk
```

```yaml
# policy.yaml
approval:
  implementation: required
  paid_model: required
  push: required
  pull_request: required
  merge: forbidden
retry:
  max_attempts_per_stage: 1
  automatic_read_only_retry: true
escalation:
  enabled: false
  require_human: true
delivery:
  allow_commit: true
  allow_push: false
  allow_pull_request: false
limits:
  max_changed_files: 10
```

These are project conventions consumed by prompts and commands in v1. They are not enforced by a hidden harnessctl policy engine. Where OpenCode can enforce a corresponding boundary (for example `bash` patterns or `edit: ask/deny`), the installer should configure it; where it cannot, the Orchestrator must stop and request human confirmation rather than imply enforcement.

## 9. Capability and model abstraction

The workflow names capabilities, not vendors:

`repository.read`, `repository.search`, `repository.edit`, `command.run`, `test.run`, `git.status`, `git.branch`, `artifact.write`, and `human.approval` are sufficient for the first slice. OpenCode maps these to native tools and permission rules. An MCP provider may later implement a capability, but MCP names must not leak into the workflow contract.

Model tiers are logical policy labels. A task stage requests a tier; the OpenCode adapter resolves that tier to `provider/model-id`, temperature/variant, and optional step limit. Tier availability must be checked before dispatch. A missing tier is a blocked condition, not permission to silently select a stronger or paid model.

## 10. Approval, retry, and escalation mechanics

### v1 decision algorithm

1. Read `task.yaml`, current artifact, policy, and required capability declarations.
2. Validate that the requested transition is legal.
3. Check whether a human approval artifact exists for the exact plan/version and action.
4. Dispatch the smallest permitted assignment to the lowest configured tier.
5. Validate the result against its output contract.
6. Prefer deterministic evidence: file diff, exit status, test output, and artifact references.
7. On incomplete/unsupported result, record findings and either perform one policy-allowed retry or stop as `BLOCKED`.
8. Do not automatically escalate in the first slice. If escalation is enabled in configuration, pause for human approval and show evidence, cost estimate, proposed tier, and why the current tier failed.

### Future routing extension

The policy vocabulary should reserve `single`, `retry`, `ensemble`, `escalate`, `ask_human`, and `block`. A retry must include evaluator findings; an escalation must include all failed-attempt evidence and not merely repeat the original request. Ensemble candidates must be independent and judged against identical criteria. No agent self-report of difficulty is sufficient escalation evidence.

## 11. Security and safety boundaries

- Never place provider keys or secrets in `.harnessctl/` or checked-in `opencode.json`.
- Default worker exploration to read-only; use explicit implementation approval before enabling edits.
- Treat `.env` and similar files as denied or ask-by-default and verify effective OpenCode permissions during installation tests.
- Keep push and PR creation denied/ask until the human gate is recorded.
- Merge is not a harnessctl capability in v1; no prompt or command may offer it as an automated action.
- Changes to policy, permissions, model routing, escalation, or merge controls are protected changes in future self-development mode and always require explicit human review.
- Record out-of-scope edits, unsupported claims, failed checks, and permission denials as evidence, not as successful completion.

## 12. Verification and acceptance criteria

### Installation

- Given a clean supported OpenCode project, installation creates the documented `.opencode` content and `.harnessctl` defaults without requiring a new runtime.
- Given an existing same-named user file, installation reports a conflict and does not overwrite it silently.
- Given an installed project, OpenCode lists the Orchestrator and can invoke the hidden worker through Task when permission allows.

### Workflow

- Given a small bug request, intake creates a task and does not edit repository files.
- Given exploration, the artifact separates confirmed facts, evidence, hypotheses, and unknowns.
- Given a plan, implementation is blocked until an approval artifact references the exact plan version/hash.
- Given an approved plan, implementation reports changed files and deviations.
- Given verification, every claimed check is marked executed with command and result or explicitly unverified.
- Given failed verification, the task is not marked complete and a repair/block decision is recorded.
- Given successful verification, finish can prepare delivery according to policy but cannot merge.
- Given a resumed session without the original conversation, the Orchestrator reconstructs task state from `.harnessctl/tasks/TASK-ID/`.

### Cost and quality instrumentation

For every worker attempt record model tier, concrete model ID if available, attempt number, elapsed time, token/cost data when exposed by OpenCode, human interventions, result status, and verification outcome. This enables later decisions about retries, ensembles, and escalation based on measured evidence.

## 13. Risks and open questions

### Risks

1. Prompt-driven transitions can be skipped or misrepresented because v1 lacks transactional enforcement. Mitigation: explicit artifacts, conservative permissions, and acceptance tests.
2. A generic worker with edit access may exceed assignment scope. Mitigation: read-only worker baseline, separate permission profiles or host `ask`, changed-file checks, and human review.
3. OpenCode config/permission schemas may change. Mitigation: pin/document supported versions and run an installation smoke test against the installed CLI.
4. MCP context overhead can erase local-model savings. Mitigation: optional, per-agent enablement and capability-specific opt-in.
5. Model tier config may name unavailable models. Mitigation: preflight availability and block rather than silently fall back.

### Open questions for implementation

- Which OpenCode version(s) are the initial support contract?
- Should the Orchestrator invoke commands recursively, or should commands only be human entry points?
- How will the implementation worker be constrained: separate read/write agent slots, per-tool `ask`, or a later plugin/runtime?
- What exact artifact serialization and plan hashing mechanism will be used?
- How will GitHub/other PR preparation be represented before an external adapter exists?
- Which OpenCode usage/cost information is reliably available for metrics in the supported version?

## 14. Deferred work and advancement criteria

Defer until the first slice completes against real tasks: automatic routing, retries with feedback, ensembles, paid-model escalation, external issue trackers, MCP capability providers, worktrees, plugins/custom tools, semi-autopilot, Pi.dev, game workflows, and self-development.

Advance only after a corpus of at least three small bug fixes demonstrates that:

- plan approval cannot be bypassed in normal supported operation;
- task state can be resumed from files;
- unsupported claims are surfaced;
- verification results are reproducible and distinguish claims from evidence;
- changed-file scope is reported;
- no automated path can merge;
- installation does not silently destroy project customization;
- cost, latency, retry, escalation, and human-intervention observations are recorded.

The next design/implementation phase should resolve the worker permission-profile question before adding dynamic routing. This is the most important boundary where a prompt-level contract may otherwise be mistaken for host-level enforcement.

## 15. Implementation handoff

This document is a design baseline, not an implementation. The implementation story should create the OpenCode package, minimal project bootstrap, agents, six commands, three skills, default configuration, artifact templates, installation smoke tests, and an end-to-end fixture for one small bug fix. It should not add a standalone runtime or broaden the first slice beyond the boundaries above.
