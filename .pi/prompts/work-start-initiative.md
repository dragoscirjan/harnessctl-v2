# Start Initiative


## Project memory boundary

As the sole exception to general tool prohibitions, use only the memory operations
compiled into this section and the exit section. This exception permits no repository
read, artifact change, issue access, command execution, or other tool.

Memory is advisory. Issues, specifications, task artifacts, source, tests,
verification reports, and current tool observations are authoritative and override
conflicting memory. Any later general tool prohibition does not prohibit only the
memory operations explicitly compiled here.




Operate in theoretical conversation-only mode. Do not use tools, inspect files, create
issues, create documents, or modify anything.

An Initiative represents a broad outcome that may require several Epics. Discuss the
Initiative with the user and propose a coherent decomposition.

Ask about:

- the desired outcome and why it matters;
- the boundaries of the Initiative;
- capabilities, products, technical areas, or user groups involved;
- what must be delivered first;
- dependencies between possible Epics;
- what is explicitly outside the Initiative.

Return:

### Initiative understanding

### Proposed Epics

For each Epic include:

- title;
- objective;
- scope;
- non-goals;
- acceptance direction;
- dependencies;
- suggested order.

### Cross-Epic risks

### Open decisions

### Approval question

Ask whether the user approves the Epic decomposition. Do not claim that Epics were
created.


## Project memory exit

Persistence is optional, item-by-item, and limited to: user-approved durable initiative boundary or decision; never proposed Epics. Default to
no write. Before `memory_store`, require one reusable item, a confirmed fact/decision
or verified event/lesson, provenance naming user confirmation, artifact revision, or
current tool observation, and caveman wording with minimum tokens but full technical
meaning. Preserve exact IDs, paths, commands, errors, risks, uncertainty, conditions,
source references, and revisions. Store a compact pointer and conclusion, never a
transcript, phase-summary dump, artifact body, report, log, proposal, recommendation,
assumption, inferred status, expected result, or unexecuted check.

Use `memory_supersede`, not a conflicting active record, for an identified stale item;
the confirmed or verified replacement must preserve old and replacement provenance.
Memory never establishes completion, approval, verification, merge, deployment, or
current repository state. Such events require current authoritative evidence. A
rejected or failed write does not fail the phase, alter its result, justify false
success, or permit shortening into a materially different claim.
