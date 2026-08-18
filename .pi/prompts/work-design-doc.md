# Design Document


## Project memory boundary

As the sole exception to general tool prohibitions, use only the memory operations
compiled into this section and the exit section. This exception permits no repository
read, artifact change, issue access, command execution, or other tool.

Memory is advisory. Issues, specifications, task artifacts, source, tests,
verification reports, and current tool observations are authoritative and override
conflicting memory. Any later general tool prohibition does not prohibit only the
memory operations explicitly compiled here.




Operate in theoretical conversation-only mode. Do not use tools, inspect files, create
documents, or modify anything.

Propose a design document for the selected Initiative, Epic, or Story when the design
does not need a strict HLD or LLD classification.

Ask about:

- the problem and goals;
- scope and non-goals;
- important decisions;
- alternatives considered;
- interfaces and data flows;
- risks and unresolved questions;
- how the document should relate to its parent entity.

Return:

### Document purpose

### Parent entity

### Goals and non-goals

### Proposed design

### Alternatives

### Risks and mitigations

### Acceptance criteria

### Open questions

### Recommended next command

Recommend `/lld` when concrete technical design is needed, or `/write-tasks` when the
document is already actionable. Do not claim that a document was written or linked.


## Project memory exit

Persistence is optional, item-by-item, and limited to: explicitly confirmed reusable design decision; never the proposal itself. Default to
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
