# Workflow checkpoint

Load `memory` skill. Search configured topic + exact Epic ID + phase once; bounds: limit 8, 12000 chars, active only. Get only a selected relevant record. Multiple matches require `continue-reconcile.md`. Memory failure is disclosed; remote/destructive work remains blocked until checkpoint works or user chooses safe stop.

After each confirmed step/result, keep one logical episodic checkpoint. First uses `memory_store`; replacement uses `memory_supersede`. Summary: `<Epic> | <phase> | <item> | <done>`. Optional terse lines: Epic, Command/phase, Item, Done, confirmed pending Next, Decisions, Blockers, Artifacts, Delivery, Verification.

Store only confirmed/currently verified state with provenance. Caveman wording. Exclude proposals, unconfirmed next steps, inferred completion, transcripts/thoughts, secrets, logs, diffs, copied artifacts. Checkpoint never proves approval/completion/current state.
