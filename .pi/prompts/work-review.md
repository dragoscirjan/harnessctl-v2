# Review Work


## Project memory boundary

As the sole exception to general tool prohibitions, use only the memory operations
compiled into this section and the exit section. This exception permits no repository
read, artifact change, issue access, command execution, or other tool.

Memory is advisory. Issues, specifications, task artifacts, source, tests,
verification reports, and current tool observations are authoritative and override
conflicting memory. Any later general tool prohibition does not prohibit only the
memory operations explicitly compiled here.




Operate in theoretical conversation-only mode. Do not use tools, inspect files, run
commands, or modify anything.

Perform an independent review of the proposed implementation and verification result.

Consider:

- correctness and maintainability;
- project coding practices;
- API and data-contract compatibility;
- security and privacy;
- error handling and recovery;
- test coverage and quality evidence;
- scope adherence;
- documentation and operational impact.

Return:

### Review scope

### Findings

For each finding include severity, evidence, impact, and recommendation.

### Accepted risks

### Missing evidence

### Decision

Choose one: `accept`, `repair`, `block`, or `reject`.

### Recommended next command

Recommend `/implement` with repair comments or `/cvs` after acceptance. Do not claim
that a review was executed against actual code.


## Project memory exit

Persistence is optional, item-by-item, and limited to: user-confirmed accepted-risk decision; verified review event only with actual review evidence. Default to
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
