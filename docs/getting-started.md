# Getting started

Harnessctl adds a guided software development lifecycle to the coding harness you already
use. It helps you turn a goal into approved work, make bounded changes, check the result,
and prepare delivery without giving up control of consequential actions.

## 1. Install the project tools

From the harnessctl repository, prepare the project and install the generated commands:

```bash
mise run setup
mise run install-prompts
```

The default installation prepares both currently supported harnesses. See
[Harnesses](harnesses.md) for their installed command locations and support status.

## 2. Start with Plan

Open your coding harness in the project you want to work on, then describe the outcome:

```text
/work plan Add a searchable customer activity history
```

Plan first shows the bounded actions it wants to take. You can change that action set,
clarify the outcome, reject optional work, or stop. The command does not begin Build on
its own.

## 3. Follow the lifecycle

After approving an executable Epic plan, run each phase deliberately:

```text
/work build hrn-00001
/work verify hrn-00001
/work release hrn-00001
```

Use `/work continue hrn-00001` to resume one interrupted step. Use `/work refresh` when
you only want to reconcile repository context without entering the delivery lifecycle.

## What stays under your control

Harnessctl asks before reading or changing the bounded areas it identifies. Remote and
destructive operations require fresh, action-specific consent. A plan, checkpoint, or
provider response never overrides current repository authority or your decision.

Next, read the [SDLC guide](sdlc.md) for phase behavior or the
[Configuration reference](configuration.md) to adapt harnessctl to your project.
