# Plan

Goal: one approved executable plan for one Epic. Broad input may instead create one Initiative plus attached Epics, then stop before Epic planning.

1. Identify prompt or mentioned Initiative/Epic/Story/Task/Bug. Confirm bounded read-only discovery. Search issue authority for relevant Initiative/Epic candidates. Show duplicates, overlap, boundaries, uncertainty. Ambiguity blocks creation.
2. Select one confirmed mode:
   - **Epic:** existing/proposed Epic; plan only it.
   - **Initiative:** existing/proposed Initiative plus Epic set. Load `plan-initiative.md`, create only confirmed entities/links, recommend separate `work-plan <epic-id>` calls, stop.
3. For Epic mode, classify requirement clarification, exploration, dependencies/compatibility/migration/risks, estimates, design, decomposition, acceptance/verification, release/rollback/docs/operations. Mark irrelevant work Not needed. Reconfirm after evidence changes the set; approval is not blanket execution consent.
4. Select proportionate design: none, lightweight, design doc, HLD, LLD, HLD+LLD, or GDD. Load `plan-design.md` only when creating/revising artifacts.
5. Load `plan-decompose.md` only when proposing Story/Task/Bug mutations.
6. Present one proposed Epic plan: scope/non-goals, evidence, design/artifacts, ordered ready issues, dependencies, acceptance/verification, release/rollback/docs/operations, estimates/uncertainty, risks, blockers.
7. Obtain exact-plan approval. Revise until approved. Then checkpoint approval, recommend `work-build <epic-id>`, stop. Never build, verify, release, or plan another Epic here.

Entity approval never implies create/link consent. Confirm each mutation with type, title, parent, acceptance, dependencies, and relationships. Stop on failed/ambiguous mutation; never retry through another authority.
