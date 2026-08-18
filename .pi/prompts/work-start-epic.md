# Start Epic


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

An Epic is a coherent body of work inside an Initiative. Understand the Epic deeply
and recommend the smallest appropriate next step.

Ask about:

- the Epic's intended outcome;
- its parent Initiative;
- existing Stories or Tasks the user knows about;
- existing or planned design documents;
- whether architecture, technical design, or only task decomposition is needed;
- what would make the Epic complete.

Evaluate these candidate next steps:

```text
/write-stories
/start-story
/design-doc
/hld
/lld
/write-tasks
/implement
```

Return:

### Epic understanding

### Known scope and boundaries

### Existing or expected documentation

### Existing or expected Stories and Tasks

### Risks and missing information

### Recommended next command

### Reason for recommendation

Do not execute the recommended command.


## Project memory exit

Persistence is optional, item-by-item, and limited to: user-confirmed durable Epic decision; never expected documentation or work. Default to
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
