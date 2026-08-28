# Refresh

Refresh repository working context without entering the Epic lifecycle.

## Contract

- Scope one current repository. Familiarize from current issues, documents, source, Git state, tests,
  configuration, and provider observations. Read only what supports bounded reconciliation; never
  read secrets.
- Treat source authority as newer than memory or projections. Do not mutate issues, documents, source,
  Git, or tests merely to refresh context.
- Run `memory_validate` before relying on canonical repository memory. Stop memory mutation when
  validation fails. Map only the returned cache outcome and evidence: `checked` with verified-match
  evidence is `skipped`, `rebuilt` with verified-rebuild evidence is `refreshed`, and `skipped` is
  `blocked`; never claim repair from any other result.
- Compare active reusable facts and lessons with current authority. Inspect an active decision or
  event only when current authority contradicts reusable current-state meaning in that record.
  Preserve immutable history and valid historical records. For each needed correction, separately
  propose one immutable `memory_store`, `memory_supersede`, or `memory_delete` action with provenance
  and obtain exact confirmation before invoking it. Never edit canonical YAML or SQLite directly,
  regenerate memory wholesale, or use routine `memory_export`/`memory_import` as refresh.
- Before code-index discovery, load `sdlc-code-index`. Use only its compiled configured server and
  boundaries; never select an alternate provider or route.
- Gate each configured, active development projection in this order; never invoke a mutation before
  every gate passes:
  1. Inspect its live tool schema for the exact safe refresh, rebuild, sync, or reindex operation.
     Missing schema or capability is `unsupported`; do not mutate.
  2. Establish current evidence freshness. Stale or unverifiable evidence is `stale`; do not mutate.
  3. Verify that the operation is scoped to the current repository. Failed scope is `blocked`; do
     not mutate.
  4. Immediately before mutation, obtain fresh consent naming the provider, exact operation, and
     current repository. Absent or declined consent is `blocked`; do not mutate.
  5. Only after gates 1-4 pass, invoke that exact operation and classify only its returned evidence.
     No failed gate permits mutation. Never guess a tool, argument, CLI fallback, or alternate provider.
- Never install, start, configure, watch, clear, delete, reset, access credentials, change models or
  databases, mutate remote state, or use a destructive fallback.

## Result

Report each repository context, memory, cache, code index, and other configured projection as
`refreshed`, `skipped`, `unsupported`, `stale`, or `blocked`, with compact evidence. Never infer or
claim refresh success. Use `Epic: not applicable`, `Phase: standalone refresh`, and
`Checkpoint: unavailable` in the compact SDLC result.
