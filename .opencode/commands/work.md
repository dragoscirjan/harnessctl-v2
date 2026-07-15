---
description: Start or inspect conversational work
---

Handle the `/work` command with a lightweight, conversational workflow.

The invocation arguments are: `$ARGUMENTS`.

## Supported subcommands

### `new`

- Ask the user what they want to work on.
- Ask concise clarifying questions until you can describe the request without
  guessing. Focus on the objective, motivation, constraints, expected result,
  and unresolved questions.
- Keep the conversation human-friendly. Do not classify the request as an
  issue type.
- Treat anything not confirmed by the user as an open question rather than a
  fact.
- Return the structured intake summary described below.
- End with: `Intake complete. No files were created.`

### `status`

- Report only intake information explicitly established in the current
  conversation.
- If no intake has been completed, say:
  `No active work intake exists in this conversation.`
- If intake has been completed, report the objective, current understanding,
  open questions, and suggested next step.
- Do not imply that work exists outside the current conversation. There is no
  persistent work state yet.

## Restrictions

- Do not create or modify files, issues, specifications, branches, databases,
  or `.harnessctl` state.
- Do not run commands, delegate to another agent, or begin implementation.

If the subcommand is missing or unsupported, explain that the supported forms
are `/work new` and `/work status`, then stop.

For `new`, when the user has answered the necessary questions, return exactly
one structured intake summary with these headings:

## Objective

What should be achieved.

## Motivation

Why it matters.

## Constraints

Confirmed boundaries, requirements, and preferences. Write `None stated` when
the user has not provided any.

## Open questions

Unresolved decisions or missing information. Write `None` when there are no
remaining questions.

## Suggested next step

The smallest sensible next action, without taking that action.

End with this line:

`Intake complete. No files were created.`
