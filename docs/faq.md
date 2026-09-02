# Frequently Asked Questions

These answers point to the canonical page for exact behavior. Status terms follow the
[status and evidence vocabulary](status-and-evidence.md); a documented declaration or
generated artifact is not proof of external operation.

## What is harnessctl?

Harnessctl installs a controlled, Epic-first software delivery workflow into supported
coding harnesses. Start with [Docs](docs-overview.md), then follow
[Installation](installation.md) and [Getting Started](getting-started.md).

## Which coding harnesses are supported?

OpenCode and Pi harnessctl integration is `working`. Claude and Codex integration is
`not implemented`. These statuses describe harnessctl only, not the capabilities of
those host products. The [Harnesses](harnesses.md#support-matrix) page owns the current
capability matrix and evidence.

## Does harnessctl install globally?

The documented path installs project-owned commands, skills, tools, and configuration
into the selected checkout. It does not own global OpenCode skills. Review exact target
paths and prerequisites in [Installation](installation.md).

## Why did installation refuse to overwrite files?

Harnessctl stops when existing generated paths conflict and ownership is uncertain.
Review the reported paths before considering `--force`; legacy skill removal has a
separate consent boundary. Follow the safe
[installation conflict recovery](troubleshooting.md#installation-conflict).

## Why does Pi ask to install packages?

The Pi adapter and related managed packages require explicit package consent.
Noninteractive automation stops unless the dedicated consent option is supplied after
reviewing the disclosed effects. See [Pi consent](installation.md#pi-consent) and the
[Pi troubleshooting entry](troubleshooting.md#pi-package-installation).

## Are skills the same as tools or MCP servers?

No. Skills are generated agent guidance; Node modules provide programmatic project
tools; MCP servers are external capability routes. A skill does not register a tool,
provide credentials, or operate a provider. Compare [Skills](skills.md),
[Node Modules](node-modules.md), and [MCP Servers](mcp-servers.md).

## Which Node modules does harnessctl publish?

The repository currently defines three public workspace packages: one harness-neutral
tools layer and OpenCode and Pi adapters. Repository source and tests establish local
package behavior, not current registry availability. Use the evidence-backed
[Node Modules catalog](node-modules.md) for exact names, versions, prerequisites, and
relationships.

## Does a valid configuration mean an integration works?

No. Declared configuration, generated output, host registration, authentication, and
verified operation are separate evidence states. [Config File](configuration.md) explains
configuration behavior; [MCP Servers](mcp-servers.md#how-a-declaration-becomes-a-result)
defines the external-operation boundary.

## Where should credentials go?

Keep credential values outside project configuration. Store only an accepted
environment-variable name or placeholder where the schema permits it. Do not paste
credential values, authorization headers, or full environment dumps into issues or
diagnostic logs. See [Config credentials](configuration.md#credentials) and the exact
[Config Schema](config-schema.md).

## What are the lifecycle commands?

Harnessctl installs Plan, Build, Verify, Release, Continue, and standalone Refresh
commands. Each has a defined purpose, approval boundary, and stopping point. The
[Command Reference](command-reference.md) owns their exact contracts.

## Why did a command stop before finishing everything?

Lifecycle phases stop deliberately at approval, evidence, remote-action, and safety
boundaries. A stop can be correct behavior rather than a failure. Use the command's
compact result and the [command troubleshooting entry](troubleshooting.md#command-stopped)
to choose the next phase or resolve a blocker.

## Does YOLO mode approve every action?

No. YOLO can repeat eligible local Build slices inside one already approved Epic scope.
It does not authorize remote or destructive work, issue closure, merge, deployment,
safety removal, or expansion outside that Epic. See the Build contract in the
[Command Reference](command-reference.md#work-build).

## Can harnessctl merge or deploy automatically?

No. Release stops at a ready pull request by default. Push, pull-request, merge, and
deployment actions retain their documented consent boundaries, and merge always needs
fresh explicit consent. See [work-release](command-reference.md#work-release).

## What evidence supports a documentation claim?

Harnessctl uses Source, Generated contract, Automated test, Approved design, Active
configuration, and Dated provider observation evidence. The claim must stay within what
that evidence proves and include freshness where state can drift. See
[Status and Evidence](status-and-evidence.md).

## Where can I see what was released?

[Changelog](changelog.md) distinguishes shipped project and package releases,
explicitly Unreleased material, and dated documentation changes. It links the
authoritative checked-in changelogs and release records rather than inferring release
state from plans.

## How do I report a problem safely?

Use the [Troubleshooting escalation checklist](troubleshooting.md#escalation-checklist).
Include the exact symptom, version or revision, selected harness, minimal reproduction,
proven state, and a bounded sanitized log excerpt. Exclude credential values, complete
environment dumps, and unrelated private project content.
