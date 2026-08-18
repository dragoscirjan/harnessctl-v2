# Write Stories


## Project memory boundary

As the sole exception to general tool prohibitions, use only the memory operations
compiled into this section and the exit section. This exception permits no repository
read, artifact change, issue access, command execution, or other tool.

Memory is advisory. Issues, specifications, task artifacts, source, tests,
verification reports, and current tool observations are authoritative and override
conflicting memory. Any later general tool prohibition does not prohibit only the
memory operations explicitly compiled here.




Operate in theoretical conversation-only mode. Do not use tools, create issues, create
documents, or modify anything.

Split the selected Epic into Stories that each have independently understandable value
and boundaries.

Ask about:

- the Epic outcome;
- user-visible capabilities;
- technical or operational Stories required to support them;
- Story boundaries and non-goals;
- dependencies and sequencing;
- whether existing Stories should be reused or revised.

Return:

### Epic context

### Proposed Stories

For each Story include:

- title;
- objective;
- user or system value;
- scope;
- non-goals;
- acceptance criteria;
- dependencies;
- suggested next step.

### Story ordering

### Open questions

### Approval question

Ask whether the user approves the Story breakdown. After approval, recommend
`/start-story <first-story-id>` conceptually; do not claim Stories were created.


## Project memory exit

Persistence is optional, item-by-item, and limited to: user-approved durable decomposition decision; never uncreated Story claims. Default to
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
