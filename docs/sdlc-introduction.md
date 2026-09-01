# Introduction to SDLC

A software development lifecycle (SDLC) is a structured way to turn a need into a
delivered, supportable change. It helps a team decide what to do, make the change,
evaluate the result, and deliver it with enough evidence for others to understand and
trust the outcome.

An SDLC is not a promise that work moves in a straight line. Useful feedback often sends
work back to an earlier activity. The structure makes those loops visible so that the team
can respond deliberately instead of hiding uncertainty or discovering it after delivery.

## Why use a lifecycle

A lifecycle gives everyone a shared answer to four questions:

- What outcome are we trying to achieve?
- What work is currently authorized and in scope?
- What evidence shows the change is ready to move forward?
- Who decides whether to continue, revise, deliver, or stop?

Without those answers, teams can build the wrong thing correctly, test against stale
expectations, or deliver changes that cannot be operated or reversed safely. A good SDLC
reduces these risks without turning process into an end in itself.

## Core lifecycle activities

Organizations use different names and may divide the work differently. Most lifecycles
still include the following activities.

| Activity | Main question                                          | Typical outcome                                              |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Discover | What problem or opportunity matters?                   | A shared need, context, and success direction                |
| Plan     | What result and boundaries should guide the work?      | Agreed scope, risks, dependencies, and acceptance            |
| Build    | How will the planned result be created?                | A reviewable implementation and supporting documentation     |
| Verify   | Does current evidence satisfy the agreed expectations? | A pass, a defect to repair, or a need to revise the plan     |
| Deliver  | How does the change reach its intended users safely?   | A controlled release with ownership and rollback information |
| Learn    | What did operation and feedback reveal?                | Follow-up work, improved practices, or a confirmed outcome   |

These activities can overlap. A small change may move through them quickly; a risky or
ambiguous change may need several feedback loops. The important property is not the number
of stages but the presence of explicit decisions and evidence at each boundary.

## Feedback is part of the process

Feedback is most useful when it arrives early enough to change the work. A planning review
may expose a missing dependency. Building a small slice may reveal that an assumption was
wrong. Verification may find a defect or show that the acceptance boundary itself needs
revision. Operational evidence may identify a new need after delivery.

Each result should return to the activity that owns the decision:

| Feedback                                                    | Return to                        | Why                                                                     |
| ----------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| The desired outcome or acceptance changed                   | Planning                         | The team must agree on the new boundary before implementation continues |
| The approach is incomplete but the outcome is unchanged     | Building                         | The implementation needs another bounded slice                          |
| The result does not meet an agreed expectation              | Building, then verification      | A repair needs implementation and fresh evidence                        |
| The change works but cannot be delivered or operated safely | Planning or delivery preparation | Release and operational constraints need an explicit decision           |
| Real-world use reveals a separate need                      | Discovery                        | New work should not be hidden inside completed scope                    |

Returning to an earlier activity is not failure. Continuing with a known-invalid assumption
is the failure the lifecycle is designed to prevent.

## Evidence supports decisions

Evidence is information that can be inspected and connected to an expectation. Depending
on the change, it may include reviewed requirements, source changes, automated checks,
manual observations, security analysis, compatibility results, deployment rehearsal, or
operational measurements.

Strong evidence is:

- **Relevant:** it addresses the current expectation, not a nearby one.
- **Current:** it describes the version and environment being considered now.
- **Reproducible:** another person can understand how the result was obtained.
- **Proportionate:** its cost and depth reflect the consequence of being wrong.
- **Traceable:** the decision can be connected to the evidence that supported it.

Evidence does not remove judgment. It makes the basis for judgment visible. Passing a test
that does not represent the agreed behavior is not useful proof, and an approved plan is
not proof that an implementation works.

## Roles and decision boundaries

The same person may perform several roles, especially on a small team, but the decisions
remain distinct:

- A product or domain owner clarifies the outcome and acceptance boundary.
- Designers and engineers shape and implement an appropriate solution.
- Reviewers and verification owners challenge assumptions and evaluate evidence.
- Release or operations owners control delivery, recovery, and service impact.
- Users and stakeholders provide feedback about whether the result creates value.

Clear boundaries prevent activity from being mistaken for authorization. Writing code does
not approve a requirement change. A successful local check does not authorize a release.
Delivery does not prove that the intended outcome was achieved.

## Common failure modes

- **Starting with a solution:** implementation begins before the need and success boundary
  are understood.
- **Unbounded scope:** adjacent improvements enter the work without an explicit decision.
- **Late feedback:** large batches delay learning and make correction expensive.
- **Evidence by proxy:** status, configuration, or intent is treated as proof of behavior.
- **Stale verification:** results from an older change or environment are reused without
  checking whether they still apply.
- **Hidden release risk:** ownership, migration, recovery, monitoring, or user impact is
  considered only after implementation.
- **No stopping rule:** work continues despite ambiguity, failed checks, or missing
  authorization.

Small, reviewable slices and explicit stopping conditions limit the cost of these failures.

## Choose the next activity

Use the current uncertainty to choose what happens next:

| Current state                                                                   | Next activity                        |
| ------------------------------------------------------------------------------- | ------------------------------------ |
| The need or desired outcome is unclear                                          | Discover                             |
| The outcome is understood but scope, acceptance, risks, or dependencies are not | Plan                                 |
| The plan is agreed and a bounded slice is ready                                 | Build                                |
| An implementation exists but its evidence is incomplete or stale                | Verify                               |
| Current evidence satisfies acceptance but delivery is not complete              | Deliver                              |
| The change is in use and outcome feedback is available                          | Learn                                |
| Authority, safety, or evidence is contradictory                                 | Stop and reconcile before proceeding |

The right next step is the one that resolves the most important current uncertainty while
respecting the people who own the decision.

## How Harnessctl applies these ideas

Harnessctl turns these general principles into an Epic-centered controlled workflow. See
[Harnessctl SDLC](sdlc.md) for its lifecycle, approval boundaries, stopping outcomes, and
command choices. Use the [Command Reference](command-reference.md) when you need the exact
responsibility and contract of a specific command.
