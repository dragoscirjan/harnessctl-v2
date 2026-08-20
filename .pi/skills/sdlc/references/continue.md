# Continue

Accept optional Epic/Story/Task/Bug ID. Resolve one owning Epic and its active checkpoint. Without ID, search once; show at most five unfinished Epic workflows and wait for selection. Never auto-select newest. Missing Epic → Plan.

Multiple/interrupted checkpoints are ambiguous: load `continue-reconcile.md`.

Validate checkpoint against current issue hierarchy/status, specs/plans, source/Git, tests/reports, CVS/provider evidence. Report conflicts. If Epic has no valid checkpoint, show only authority-supported candidate phases; user chooses. Never invent history or combine phases.

Resume exactly one current Plan/Build/Verify/Release phase and one confirmed next step. Record public command `work-continue` plus resumed phase. After step, verify/checkpoint only that result; stop with same-phase recommendation or separate next command. Pending Next enters checkpoint only after confirmation. Never execute next step or combine phases.
