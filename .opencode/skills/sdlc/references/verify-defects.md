# Verify: failures and Bugs

Classify product defect vs test/tool/environment/dependency/config failure, evidence gap, or requirement/design/docs/operations finding. Group symptoms by distinct unresolved occurrence; recurrence after verified resolution is regression. Show evidence, scope, impact, uncertainty, likely cause. Offer repair, defer accepted risk, narrow scope, gather evidence, or stop; user chooses.

For each confirmed defect, search provider-discoverable non-archived Epic Bugs across statuses. Keep one canonical Bug per occurrence and at most one active. Reuse active match after confirmation. Matching done/closed unresolved Bug blocks duplicate; transition/reopen only if selected capability supports it. Archived history is not enumerated; exact user-supplied archived ID is reference-only when supported. Regression/new occurrence may create one new Bug referencing prior ID in body/document link, never invented relation.

Before Bug create/update/comment/status/relation, show exact proposal and confirm. Parent created Bug to Epic; optional supported `relates_to` may target affected Story/Task. Never edit authority files directly or invent provider syntax.
