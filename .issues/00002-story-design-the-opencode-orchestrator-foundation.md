---
id: "00002"
type: story
title: "Design the OpenCode Orchestrator Foundation"
status: open
parent: "00001"
opencode-agent: product-owner
opencode-assignee: tech-advisor
---

# Design the OpenCode Orchestrator Foundation

## Description

As the product owner of harnessctl,
I want a technical design for the OpenCode-first Orchestrator foundation,
So that the first implementation can remain harness-native, small, configurable, and extensible without becoming a standalone coding harness.

The design must translate Initiative `00001` into an implementable first phase. It should define the Orchestrator agent, generic anonymous Tier-0 worker, SDLC commands, project `.harnessctl/` configuration, local task artifacts, approval boundaries, and the minimum OpenCode tools/MCP capabilities required for a human-governed small bug-fix workflow.

The requested design document should be created as:

```text
.specs/00001-prd-human-governed-sdlc-v1.md
```

## Scope

- OpenCode packaging and installation boundaries.
- Orchestrator responsibilities and interaction model.
- Generic anonymous worker definition and runtime assignment contract.
- Intake, explore, plan, implement, verify, and finish command contracts.
- Human approval gates for implementation, paid model use, push, and pull-request creation.
- Local `.harnessctl/` project configuration and filesystem artifacts.
- Abstract model tiers and project-specific model mapping.
- Minimum required tool/MCP capability abstractions.
- Extension points for retry, ensemble, escalation, Pi.dev, and self-development.

## Goals

1. Produce a design that can be implemented as OpenCode configuration, agents, commands, skills, and tool configuration.
2. Keep harnessctl independent of a standalone runtime, database, and custom harness.
3. Make future dynamic model routing and policy configuration possible without redesigning the foundation.
4. Define testable contracts between the Orchestrator, workers, tools, artifacts, and human approvals.
5. Identify OpenCode-specific assumptions and isolate them from harness-neutral concepts.

## Non-Goals

- Implementing the feature.
- Designing the complete SDLC kernel or universal plugin ecosystem.
- Implementing Pi.dev support.
- Implementing automatic PR merging or deployment.
- Adding external issue trackers or databases.
- Designing game-development workflows.

## Acceptance Criteria

```gherkin
Given the harnessctl initiative requirements
When the technical design is completed
Then it defines the first OpenCode installation layout and all required configuration files
And it identifies which parts are harness-neutral and which parts are OpenCode-specific

Given the Orchestrator-centered model
When the design describes worker delegation
Then it defines how a generic anonymous worker receives its generated assignment, requirements, context, permitted capabilities, acceptance criteria, and output contract
And it does not require permanent role-specific worker personas

Given the human-governed bug-fix workflow
When the design defines lifecycle transitions
Then it specifies intake, exploration, planning, approval, implementation, verification, finish, retry, and blocked states or equivalent transitions
And it specifies which transitions require human approval

Given future configurable model tiers and escalation
When the design defines configuration
Then it shows how project configuration maps abstract tiers to concrete models
And it defines extension points for retry, ensemble, escalation, cost limits, and approval policies

Given local filesystem persistence
When the design defines task state and artifacts
Then it specifies a readable `.harnessctl/` layout
And a later Orchestrator session can reconstruct task status without the original chat transcript

Given the requested document
When the design is delivered
Then it exists at `.specs/00001-prd-human-governed-sdlc-v1.md`
And it includes explicit assumptions, risks, open questions, and advancement criteria for the next phase
```

## Risks

- The design may accidentally introduce a standalone runtime — constrain the design to installed harness configuration and clearly label future runtime ideas.
- OpenCode capabilities may be assumed rather than verified — document assumptions and validate them against the actual harness configuration model before implementation.
- Configuration abstractions may become over-engineered — specify the smallest useful initial configuration and defer advanced policy language.

## Deliverable

Create and review `.specs/00001-prd-human-governed-sdlc-v1.md` as the technical design baseline for the first implementation Epic. The Product Owner's `.specs/00001-requirement-summary.md` is reference input, not the final technical design.



## Comments
