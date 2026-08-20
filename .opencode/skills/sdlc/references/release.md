# Release

Require one Epic and current successful Verify evidence; otherwise redirect to Plan/Verify.

Inspect fresh Git/CVS/provider state in order: feature branch, intended commit, push to intended remote branch, PR to correct base. For each, prove Satisfied or confirm exact action. Do not repeat satisfied work. Branch/commit use normal mutation gate. Push and PR create/update each need fresh immediate consent. Verify and checkpoint each result; failure/ambiguity stops.

Default stop = ready PR; human merges. Merge requires current checks/permission plus fresh consent naming exact PR/action immediately before invocation. Never auto-merge.

Load `release-deploy.md` only when user explicitly requests deployment.

Close detailed issues/Epic only when current acceptance and delivery evidence proves every criterion; deployment evidence is required when scope requires deployment. Show mapping and separately confirm each status mutation. Merge alone proves neither deployment nor completion.
