Proposed product definition
harnessctl
A portable SDLC configuration system for existing coding harnesses.
It distributes:

- Orchestrator agent definitions;
- anonymous worker agent definitions;
- commands;
- skills;
- prompt templates;
- output contracts;
- tool and MCP configuration;
- model-tier configuration;
- retry and escalation policies;
- project-level configuration conventions;
- local artifact and task-management tools;
- harness-specific adapters.
It does not initially provide:
- its own agent runtime;
- its own model API;
- its own database;
- its own coding harness;
- its own issue tracker;
- automatic PR merging;
- a universal abstraction over every possible tool.
The initial supported harness is OpenCode. Pi.dev becomes the second adapter after the OpenCode workflow has proven itself.
The central design
The core unit is not a permanent agent persona.
It is a temporary assignment:
Orchestrator
  ↓
creates assignment
  ↓
selects worker tier
  ↓
provides requirements + context + tools + output contract
  ↓
anonymous worker executes
  ↓
Orchestrator evaluates result
  ↓
accept / retry / parallelize / escalate / ask human
Your OpenCode worker concept is appropriate:

---

description: Multi Purpose Agent Tier 0
mode: subagent
model: lmstudio/qwen3.6-coder...
temperature: 0.2
hidden: true
permissions:
  read: true
  bash: true
  skill: true
  env-read: true
---

You are a Multi Purpose Agent.

The Orchestrator will provide your assignment, requirements,
available context, permitted tools, and required output format.
The worker should remain intentionally generic.
The Orchestrator supplies the meaningful identity at runtime:
You are currently acting as:

- repository investigator
- test investigator
- bug reproducer
- plan candidate generator
- implementation worker
- verification worker
- adversarial reviewer

Your current assignment is...
This means the system defines execution contracts, not a fixed hierarchy of AI employees.
The smallest useful first slice
I recommend that Version 0.1 contain only these elements:
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
│       └── ...
├── templates/
│   ├── assignments/
│   ├── evaluations/
│   └── reports/
├── defaults/
│   ├── models.yaml
│   ├── policy.yaml
│   └── workflow.yaml
└── docs/
    └── ...
A consuming project would receive:
project/
└── .harnessctl/
    ├── config.yaml
    ├── models.yaml
    ├── policy.yaml
    ├── workflow.yaml
    ├── tasks/
    ├── reports/
    └── artifacts/
The first complete workflow should be:
User reports a small bug
  ↓
Orchestrator intake
  ↓
Orchestrator dispatches Tier-0 exploration
  ↓
Orchestrator creates a plan
  ↓
Human approves plan
  ↓
Orchestrator dispatches implementation worker
  ↓
Orchestrator runs or requests verification
  ↓
Human reviews result
  ↓
Worker or Orchestrator prepares commit / push / PR
  ↓
Human reviews PR
  ↓
Human merges
The first version should not attempt to support every task type. A small bug fix is sufficient to expose the important behavior.
The roadmap
Because the complete vision is larger than one Epic, I recommend an Initiative with several bounded Epics.
Initiative: Human-Governed Extensible SDLC for Coding Harnesses
Business outcome
Enable developers to use a consistent, configurable, evidence-oriented development workflow inside OpenCode, starting with human-governed bug fixes and progressively adding anonymous workers, model routing, retry, escalation, external tools, and autopilot.
Epic 1 — OpenCode Orchestrator Foundation
Purpose
Create the central Orchestrator agent and the minimal command system.
Scope

- Orchestrator agent definition;
- common SDLC vocabulary;
- intake, explore, plan, implement, verify, finish commands;
- project .harnessctl/ directory convention;
- structured output formats;
- no automatic escalation yet;
- no external issue-tracker integration yet.
Acceptance criteria
Given a project with the harnessctl configuration installed
When a user gives the Orchestrator a development request
Then the Orchestrator identifies the task type, objective, constraints, unknowns, and risks
And it does not modify files during intake

Given an existing repository
When the user invokes exploration
Then the Orchestrator inspects the repository using available tools
And reports confirmed facts separately from assumptions
And does not modify project files

Given exploration findings
When the user requests a plan
Then the Orchestrator produces a bounded implementation plan
And identifies affected areas, validation steps, risks, and open decisions

Given a plan requiring code changes
When the plan has not been approved
Then the Orchestrator does not authorize implementation
This Epic should establish behavior before sophisticated routing is introduced.
Epic 2 — Human-Governed Bug-Fix Workflow
Purpose
Prove the entire lifecycle on one narrow but realistic task.
Scope

- branch-based implementation;
- implementation worker;
- verification worker or verification command;
- changed-file reporting;
- test-result reporting;
- human approval gates;
- commit and PR preparation;
- no automatic merge.
Acceptance criteria
Given an approved bug-fix plan
When the Orchestrator authorizes implementation
Then the implementation worker receives only the approved objective, relevant context, permitted tools, and output contract

Given an implementation worker has changed files
When verification begins
Then the system reports all changed files
And runs the configured relevant checks
And distinguishes executed checks from claimed checks

Given verification fails
When the failure is potentially repairable
Then the Orchestrator reports the failure
And proposes a repair cycle
And does not declare the task complete

Given verification passes
When the task is ready for delivery
Then the Orchestrator prepares a concise report
And may prepare a commit, push, or pull request according to policy
And does not merge the pull request automatically
This is the first milestone that should be considered a real product.
Epic 3 — Anonymous Worker Pool
Purpose
Introduce generic Tier-0 workers without creating permanent role-specific agents.
Scope

- generic worker definitions;
- worker tier configuration;
- generated assignments;
- output contracts;
- worker result normalization;
- anonymous temporary execution sessions;
- multiple worker invocations for one stage.
The first worker types should not be named personas. They should be slots such as:
worker-tier-0
worker-tier-1
worker-tier-2
The Orchestrator decides whether a particular invocation is being used for exploration, planning, implementation, or review.
Acceptance criteria
Given a stage requiring delegated work
When the Orchestrator dispatches a worker
Then it generates an assignment containing the stage, objective, requirements, context, tools, restrictions, and output format

Given two workers receive the same assignment
When both complete independently
Then their results remain distinguishable
And neither worker is required to know the identity or result of the other

Given a worker returns incomplete or malformed output
When the Orchestrator evaluates the result
Then the result is rejected or marked incomplete
And the Orchestrator does not treat it as a successful stage completion
Epic 4 — Configurable Retry, Ensemble, and Escalation
Purpose
Implement your main innovation: allocate intelligence dynamically instead of always using the strongest model.
Initial strategies
SINGLE
RETRY
ENSEMBLE
ESCALATE
ASK_HUMAN
BLOCK
Suggested default policy
routing:
  first_attempt:
    strategy: single
    tier: local
    count: 1

  incomplete_result:
    strategy: retry
    same_tier: true
    max_attempts: 2

  disagreement:
    strategy: ensemble
    tier: local
    count: 3

  failed_verification:
    strategy: retry_with_feedback
    max_attempts: 1

  repeated_failure:
    strategy: escalate
    step: 1

  paid_model:
    require_human_approval: true

  implementation:
    require_human_approval: true

  push:
    require_human_approval: true

  pull_request:
    require_human_approval: true

  merge:
    forbidden: true
The important rule is:
Escalation must be triggered by observable failure, contradiction, insufficient evidence, risk, or policy—not by an agent merely claiming that the task is difficult.
Acceptance criteria
Given a Tier-0 worker produces an incomplete result
When the policy permits automatic retry
Then the Orchestrator retries with specific feedback from the evaluation

Given multiple candidates are required
When the Orchestrator launches an ensemble
Then candidates are generated independently
And the judge evaluates each against the same acceptance criteria

Given all candidates fail the acceptance criteria
When the policy permits escalation
Then the Orchestrator sends the failure evidence and evaluation findings to the next configured tier
And does not send only the original request

Given escalation requires human approval
When escalation becomes necessary
Then the Orchestrator pauses
And explains the observed failure, estimated cost, proposed tier, and reason for escalation
Epic 5 — Dynamic Project Configuration
Purpose
Allow users to customize the SDLC without editing the installed base package.
This abstraction should exist early, even if configuration editing is initially manual.
Configuration areas
.harnessctl/
├── config.yaml
├── models.yaml
├── policy.yaml
├── workflow.yaml
├── permissions.yaml
└── tool-preferences.yaml
Configuration should control:

- available model tiers;
- model-to-provider mappings;
- temperature and context budgets;
- maximum attempts;
- ensemble sizes;
- maximum cost;
- escalation thresholds;
- human approval requirements;
- allowed commands;
- branch naming;
- commit and PR policy;
- artifacts and report location;
- task-type workflow selection.
Example:
models:
  local:
    provider: lmstudio
    model: qwen3.6-coder

  economy:
    provider: openrouter
    model: ...

  premium:
    provider: ...
    model: ...

policy:
  max_cost_per_task: 2.00
  max_attempts_per_stage: 3
  auto_retry: true
  auto_escalate: false

approval:
  implementation: required
  paid_model: required
  push: required
  pull_request: required
  merge: forbidden
Later, configuration can be edited through an Orchestrator-guided command:
/sdlc configure escalation
/sdlc configure model-tier
/sdlc configure approval-policy
/sdlc explain-policy
The first version does not need a graphical interface or a complex policy language.
Epic 6 — Evidence-Oriented Artifacts and Local Task State
Purpose
Prevent the Orchestrator from relying on conversational memory alone.
Initial artifacts should be plain files:
.harnessctl/tasks/TASK-001/
├── intake.md
├── exploration.md
├── plan.md
├── approvals.md
├── assignments/
├── worker-results/
├── verification.md
├── decisions.md
└── finish.md
Do not begin with a database. The files should be understandable and recoverable by both humans and agents.
At this stage, introduce a small vocabulary:

- task;
- assignment;
- result;
- decision;
- evidence;
- approval;
- report.
Do not immediately implement the entire ontology from the PDF. Concepts such as claims, obligations, leases, event streams, and capability registries should be added only when they solve observed problems.
Acceptance criteria
Given a task that has reached multiple SDLC stages
When the Orchestrator resumes work
Then it can reconstruct the current state from .harnessctl files
And does not require the original conversation to be present

Given a worker claims that a check passed
When no tool output or stored evidence supports the claim
Then the claim is reported as unverified
And is not treated as proof of completion

Given a human approves a plan
When the approval is recorded
Then the approval is associated with the task and plan version
And later changes to the plan require renewed approval
Epic 7 — Capability-Based Tool and MCP Integration
Purpose
Use existing tools without hard-coding the SDLC to specific vendors.
The system should think in capabilities:
repository.search
repository.read
repository.edit
repository.status
command.run
test.run
code.index
memory.retrieve
issue.read
issue.write
document.read
document.write
git.branch
git.commit
git.push
pull_request.create
Providers can later implement those capabilities:
repository.search
├── local search
├── code index MCP
└── harness-native search

issue.read
├── local issue files
├── GitHub
├── GitLab
├── Forgejo/Gitea
└── Bitbucket/Jira

memory.retrieve
├── local project memory
├── MCP memory server
└── code-index context
The first release should use only the capabilities needed by the bug-fix workflow:

- repository reading/search;
- command execution;
- tests;
- git status;
- branch creation;
- artifact writing.
Memory, code indexing, and sequential thinking can be optional accelerators rather than mandatory dependencies.
That is important for portability. The SDLC should still function with a basic OpenCode installation.
Epic 8 — Semi-Autopilot
Purpose
Allow the Orchestrator to make low-risk decisions automatically under a human-authored policy.
Example:
Automatically allowed:
- repeat read-only exploration;
- retry incomplete planning;
- run independent read-only scouts;
- rerun failed verification;
- produce reports.

Human approval required:

- code modification;
- paid model escalation;
- branch push;
- pull request creation;
- changes outside declared scope.

Always forbidden:

- automatic merge;
- destructive commands;
- secret access without explicit policy;
- deployment.
This is where the system starts to approach “launch and forget,” but with explicit boundaries.
Epic 9 — Pi.dev Adapter
Purpose
Port the validated protocol to Pi.dev.
Do not design both adapters equally from day one. Instead:
- keep the conceptual workflow harness-neutral;
- keep OpenCode-specific packaging isolated;
- translate the same Orchestrator behavior into Pi.dev’s agent, command, tool, and configuration conventions.
The acceptance criterion should be behavioral equivalence, not identical files.
Given the same task and equivalent available capabilities
When the workflow runs through OpenCode or Pi.dev
Then both harnesses produce the same required lifecycle artifacts
And both respect the same policy decisions
And harness-specific differences are limited to presentation and tool invocation
Epic 10 — Self-Development Mode
Purpose
Allow harnessctl to use its own workflow to propose and implement changes to itself.
The first self-development tasks should be deliberately low-risk:

1. improve documentation;
2. add or revise prompt templates;
3. add test fixtures;
4. improve configuration examples;
5. add new workflow scenarios;
6. improve reports;
7. add harness adapters;
8. modify orchestration policies.
Only later should it modify core orchestration behavior.
The self-development loop should be:
Human creates or approves task
  ↓
Orchestrator explores harnessctl
  ↓
Workers propose changes
  ↓
Human approves plan
  ↓
Worker implements on branch
  ↓
Independent verification
  ↓
Tests and validation
  ↓
PR creation
  ↓
Human reviews and merges
The project should not be allowed to silently modify the rules governing its own approval, escalation, or merge behavior.
That should be a protected boundary:
The SDLC may propose changes to its own policies, but policy changes require explicit human approval.
What to build first
The first implementation target should be:
“Human-governed OpenCode bug-fix workflow with one Orchestrator and one generic Tier-0 worker”
It should include:

- OpenCode Orchestrator definition;
- generic Tier-0 anonymous worker;
- six SDLC commands;
- .harnessctl/ project configuration;
- local task artifacts;
- branch creation;
- implementation approval;
- verification;
- configurable commit/push/PR approval;
- no merge automation.
It should not yet include:
- multiple external issue trackers;
- a database;
- worktree management;
- a universal plugin protocol;
- a complex ontology;
- fully automatic escalation;
- a Pi.dev implementation;
- game-development support;
- self-modification.
How to measure whether each phase is ready
Every phase should be evaluated against real tasks, not only prompt quality.
Use a test corpus such as:
3 small bug fixes
3 small features
2 refactors
1 investigation
1 documentation task
For each task, record:
- total model calls;
- model tier used;
- estimated and actual cost;
- total elapsed time;
- number of retries;
- number of escalations;
- human interventions;
- files changed;
- verification success;
- false claims;
- missed requirements;
- unnecessary changes;
- user satisfaction.
The key product metrics are not merely “did the agent finish?”
They are:
quality per dollar
quality per token
human intervention rate
unsupported-claim rate
successful first-attempt rate
retry recovery rate
escalation precision
unnecessary escalation rate
verification escape rate
A particularly important metric is:
Escalation precision: how often escalation was genuinely necessary rather than merely expensive.
Token-reduction strategy
Do not optimize token usage by making prompts shorter alone.
The larger gains will come from reducing repeated context.
Prioritize:

 1. storing task artifacts locally;
 2. passing stage-specific context instead of full conversations;
 3. using code indexing for targeted retrieval;
 4. using local models for repository scouting and summarization;
 5. giving judges candidate summaries rather than complete raw transcripts;
 6. retaining failure findings for retries;
 7. avoiding repeated repository exploration;
 8. separating immutable task facts from temporary agent commentary;
 9. using deterministic tools before asking an LLM to judge;
10. escalating only the unresolved portion of a task.
A useful rule for every generated assignment is:
Original objective
- relevant confirmed facts
- unresolved questions
- current assignment
- acceptance criteria
- permitted capabilities
- prior failure findings
Not:
entire conversation history
- every previous agent response
- every available tool
- all repository documentation
Important product boundary
The first product is not “the perfect SDLC.”
It is:
A configurable Orchestrator protocol that makes development work more inspectable, more economical, and safer inside an existing coding harness.
The “perfect” version should emerge from measured failures:

- where agents need more context;
- where policies are too strict;
- where retries waste money;
- where local models are insufficient;
- where verification misses defects;
- where humans intervene;
- where OpenCode’s configuration model becomes limiting.
That gives you an innovation path based on observed evidence rather than designing the entire future in advance.
Recommended issue structure
This should become an Initiative, not a single Epic:
Initiative: Human-Governed Extensible SDLC for Coding Harnesses

├── Epic 1: OpenCode Orchestrator Foundation
├── Epic 2: Human-Governed Bug-Fix Workflow
├── Epic 3: Anonymous Worker Pool
├── Epic 4: Retry, Ensemble, and Escalation
├── Epic 5: Dynamic Project Configuration
├── Epic 6: Evidence-Oriented Local Task State
├── Epic 7: Capability-Based Tool and MCP Integration
├── Epic 8: Semi-Autopilot
├── Epic 9: Pi.dev Adapter
└── Epic 10: Self-Development Mode
I have not created these issues yet because the product boundary has only now become sufficiently clear, and creating ten Epics immediately would likely freeze assumptions too early.
The next sensible product decision is whether to approve this Initiative structure and make Epic 1 — OpenCode Orchestrator Foundation the first implementation target.
▣  Product-Owner · GPT-5.6 Luna · 50.6s
Would have been nice if you would have written this entire document as under .specs/00001-prd-document-title.md Where document-title you replace with the document title of your choice.
- Thought: Evaluating issue tracking · 1.2s
You’re right—the roadmap should have been captured as a durable project document instead of only being returned in chat.
However, there is an important workflow boundary in my current role:

- I can define and refine the Initiative/Epics.
- I should not author files under .specs/.
- .specs/ documents are intended to be created by the technical design role, such as tech-advisor or an architect.
The correct flow is therefore:
Product Owner
  ↓
Initiative / Epic definition
  ↓
Tech Advisor
  ↓
PRD/HLD under .specs/
I can immediately convert the roadmap into an Initiative issue and create the first design story requesting a PRD/HLD such as:
.specs/00001-extensible-human-governed-sdlc.md
That design document should cover:
- product vision and boundaries;
- Orchestrator-centered model;
- OpenCode-first packaging;
- anonymous worker tiers;
- human-governed bug-fix workflow;
- dynamic configuration;
- retry, ensemble, and escalation;
- local filesystem artifacts;
- capability/MCP integration;
- future Pi.dev adapter;
- self-development mode;
- explicit non-goals and phase gates.
