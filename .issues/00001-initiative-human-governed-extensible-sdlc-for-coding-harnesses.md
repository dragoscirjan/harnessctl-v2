---
id: "00001"
type: initiative
title: "Human-Governed Extensible SDLC for Coding Harnesses"
status: open
opencode-agent: product-owner
---

# Human-Governed Extensible SDLC for Coding Harnesses

## Description

As a software developer using an existing coding harness,
I want a portable, configurable SDLC orchestrator installed into that harness,
So that development work becomes more consistent, inspectable, economical, and safe without requiring a replacement harness.

`harnessctl` is a distributable set of agent definitions, commands, skills, prompt templates, output contracts, tool/MCP configuration, model-tier configuration, and retry/escalation policies. It is not initially a standalone runtime, binary, database, model provider, coding harness, or issue tracker.

The Orchestrator is the focal point. It is an OpenCode agent definition that uses the installed commands and tools to guide a human-governed development lifecycle. Anonymous workers are temporary generic subagent slots. The Orchestrator dynamically supplies each worker's assignment, requirements, context, permissions, acceptance criteria, and output contract.

The first supported harness is OpenCode. Pi.dev support follows after the OpenCode workflow has been validated.

## Scope

- OpenCode-first distribution and configuration.
- Human-governed development workflow beginning with small bug fixes.
- Orchestrator-centered intake, exploration, planning, implementation, verification, and finish stages.
- Generic anonymous worker tiers mapped to local or commercial models.
- Configurable retry, ensemble, and escalation behavior.
- Project-specific configuration under `.harnessctl/`.
- Local filesystem task artifacts and reports, without a database.
- Branch-based implementation with configurable commit, push, and pull-request permissions.
- Human review required before merge.
- Capability-oriented integration with local tools and MCP providers.
- Later semi-autopilot, Pi.dev support, and self-development capabilities.

## Goals

1. Establish a reusable SDLC protocol that works inside existing coding harnesses.
2. Start with the cheapest reasonable model and increase intelligence only when evidence requires it.
3. Reduce repeated context and token usage through staged artifacts, targeted retrieval, local models, memory, and code indexing.
4. Make agent claims distinguishable from tool-generated evidence.
5. Allow humans to configure which decisions the Orchestrator may make autonomously.
6. Make the workflow measurable using real development tasks, cost, latency, quality, retries, escalations, and human intervention.
7. Preserve a safe path toward semi-autopilot and eventual self-development.

## Non-Goals

- Building a new coding-agent harness or standalone orchestration runtime in the initial phases.
- Requiring a database for task state.
- Supporting every external project-management provider in the first release.
- Creating permanent named AI personas such as planner, coder, or reviewer.
- Automatic pull-request merging.
- Game-development workflows in the initial generic-development product.
- Designing the complete future SDLC kernel before validating a small workflow.

## Planned Epics

1. OpenCode Orchestrator Foundation
2. Human-Governed Bug-Fix Workflow
3. Anonymous Worker Pool
4. Configurable Retry, Ensemble, and Escalation
5. Dynamic Project Configuration
6. Evidence-Oriented Local Task State
7. Capability-Based Tool and MCP Integration
8. Semi-Autopilot
9. Pi.dev Adapter
10. Self-Development Mode

## First Product Slice

The first implementation target is a human-governed OpenCode bug-fix workflow with one Orchestrator and one generic Tier-0 worker:

```text
User reports a small bug
  -> Orchestrator intake
  -> delegated exploration
  -> plan generation
  -> human plan approval
  -> delegated implementation
  -> verification
  -> human review
  -> optional commit, push, and PR preparation
  -> human merge
```

The first slice must not depend on a database, worktree manager, external issue tracker, Pi.dev adapter, game tooling, or automatic merge.

## Acceptance Criteria

### Initiative completion

```gherkin
Given a supported OpenCode project
When the harnessctl configuration is installed
Then the project has an Orchestrator agent, generic worker tier, SDLC commands, and documented project configuration
And no standalone harness runtime is required

Given a small bug-fix request
When the human-governed workflow is executed
Then the Orchestrator guides intake, exploration, planning, implementation, verification, and finish
And implementation cannot begin before the configured approval gate

Given a worker result is incomplete, contradictory, or unsupported by evidence
When the Orchestrator evaluates it
Then the result is rejected, retried, investigated, escalated, or presented for human decision according to policy
And the task is not declared complete solely from the worker's assertion

Given an implementation has passed configured verification
When delivery is requested
Then the system can prepare a branch commit, push, or pull request according to policy
And merging remains unavailable to automation

Given a project owner changes model, retry, escalation, or approval settings
When the next task is run
Then the Orchestrator follows the project-specific configuration without requiring changes to the installed base package
```

## Risks and Mitigations

- OpenCode configuration and delegation behavior may be difficult to customize — isolate harness-specific packaging from workflow concepts and validate one thin vertical slice first.
- Cheap models may produce confident but incorrect results — require structured outputs and prefer deterministic tool evidence over self-reported claims.
- Retry and ensemble strategies may increase cost rather than reduce it — record cost, latency, and success metrics for every attempt.
- Dynamic policy may become too complex for users — begin with a small readable YAML policy and add guided configuration later.
- Self-development may allow the system to weaken its own controls — require human approval for policy, permission, escalation, and merge behavior changes.
- Supporting too many MCPs too early may create dependency and portability problems — define abstract capabilities and add providers only when a workflow needs them.

## Advancement Gates

Progress to later phases only after the current phase is tested against representative tasks and its failures are recorded. The initial evaluation corpus should contain three small bugs, three small features, two refactors, one investigation, and one documentation task.

Track at least:

- quality per dollar;
- quality per token;
- human intervention rate;
- unsupported-claim rate;
- first-attempt success rate;
- retry recovery rate;
- escalation precision;
- unnecessary escalation rate;
- verification escape rate.



## Comments
