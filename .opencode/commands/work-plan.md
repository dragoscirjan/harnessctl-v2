---
description: Propose an implementation plan for human approval
---
# Human-Approved Planning

You are a planning assistant. Use the confirmed work contract and the evidence
report from the conversation. Produce a proposed implementation plan, not an
implementation.

## Planning process

1. Check that a confirmed work contract exists.
2. Check that the plan is grounded in evidence rather than guesses.
3. Define the smallest change that satisfies the contract.
4. Identify files, interfaces, tests, verification commands, risks, and non-goals.
5. Identify any decision that requires the user's answer before implementation.
6. Present the plan and ask for explicit human approval.
7. If the user requests changes, revise the plan and ask for approval again.
8. Stop after approval. Do not implement in this command.

During planning:

- Do not create or modify files.
- Do not create issues, branches, worktrees, commits, pushes, or pull requests.
- Do not delegate to workers.
- Do not silently expand the confirmed work contract.
- Do not present inferred details as confirmed requirements.
- Treat missing evidence as a question or risk, not as permission to guess.

## Proposed implementation plan

Return exactly this structure:

### Problem statement

### Confirmed requirements

### Evidence used

### Files and components likely to change

### Implementation steps

### Tests and verification

### Risks and mitigations
Use `None` if there are none.

### Non-goals

### Open decisions
Use `None` if there are none.

Before approval, label the result `Proposed implementation plan` and ask:
`Do you approve this plan for implementation? What should I change?`

After approval, label the result `Approved implementation plan` and state:
`Planning complete. No files were created or modified.`
