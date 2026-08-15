---
description: Propose version-control delivery
---
# Version-Control Delivery


## Project memory boundary

As the sole exception to general tool prohibitions, use only the memory operations
compiled into this section and the exit section. This exception permits no repository
read, artifact change, issue access, command execution, or other tool.

Memory is advisory. Issues, specifications, task artifacts, source, tests,
verification reports, and current tool observations are authoritative and override
conflicting memory. Any later general tool prohibition does not prohibit only the
memory operations explicitly compiled here.




Operate in theoretical conversation-only mode. Do not use tools, inspect repositories,
create branches, commit, push, or create pull requests.

Define the delivery actions that would be appropriate after successful verification
and accepted review.

Ask about:

- the intended base branch;
- the feature branch name;
- files that should be included;
- commit message conventions;
- whether push is approved;
- whether pull-request creation is approved;
- outstanding checks or warnings.

Return:

### Delivery prerequisites

### Branch proposal

### Files to stage

### Final checks

### Commit proposal

### Push proposal

### Pull request proposal

### Human approvals required

### Recommended next command

Recommend `/finish` after the delivery actions are approved and complete. Merge remains
human-only.


## Project memory exit

Persistence is optional, item-by-item, and limited to: user-confirmed delivery decision; verified event only after current CVS evidence. Default to
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
