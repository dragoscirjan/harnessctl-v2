---
id: "doc-00008"
title: "Documentation Set and Configured Issue-Tracking Skill"
kind: lld
status: review
version: 1
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "lead-engineer"
metadata: {"legacy_spec":{"source_path":".specs/lld-00007-documentation-set-and-configured-issue-tracking-skill-v1.md","source_sha256":"b2ad18e6c74455548d49806e5e30bbc3c0f888e37bd8c403ed760b83a3d47a73","decoder_version":1,"original_status":"review","field_conversions":{"type":"kind","id":"migration_mapping","status":"review","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00007","type":"lld","title":"Documentation Set and Configured Issue-Tracking Skill","version":1,"status":"review","opencode-agent":"lead-engineer"},"rewrites":[{"from":".specs/lld-00006-simplified-local-persistence-and-sqlite-write-through-cache-v1.md","to":".harnessctl/documents/doc-00007-simplified-local-persistence-and-sqlite-write-through-cache-v1.md"},{"from":".specs/lld-00001-generic-configuration-tools-and-harness-adapters-v1.md","to":".harnessctl/documents/doc-00001-generic-configuration-tools-and-harness-adapters-v1.md"},{"from":".specs/lld-00002-caveman-memory-hooks-across-sdlc-commands-v2.md","to":".harnessctl/documents/doc-00002-caveman-memory-hooks-across-sdlc-commands-v2.md"},{"from":".specs/lld-00005-canonical-yaml-issue-storage-v1.md","to":".harnessctl/documents/doc-00005-canonical-yaml-issue-storage-v1.md"},{"from":".specs/lld-00002-caveman-and-memory-skills-v1.md","to":".harnessctl/documents/doc-00002-caveman-and-memory-skills-low-level-design-v1.md"}]}}
---

# Documentation Set and Configured Issue-Tracking Skill

## Status and design authority

This is a new linked design for documentation, provider-aware issue configuration, and an installable OpenCode issue-tracking skill. It extends the following designs without restating or replacing their contracts:

- `.harnessctl/documents/doc-00001-generic-configuration-tools-and-harness-adapters-v1.md` for configuration ownership, default overlay behavior, and host adapters.
- `.harnessctl/documents/doc-00002-caveman-and-memory-skills-low-level-design-v1.md` for skill compilation, repository memory, security, and OpenCode/Pi boundaries.
- `.harnessctl/documents/doc-00002-caveman-memory-hooks-across-sdlc-commands-v2.md` for current SDLC command integration, exact installer rollback, and release-artifact verification.
- `.harnessctl/documents/doc-00005-canonical-yaml-issue-storage-v1.md` for issue lineage, subject to its supersession notice.
- `.harnessctl/documents/doc-00007-simplified-local-persistence-and-sqlite-write-through-cache-v1.md` as the authoritative current local issue, memory, and cache contract.

Where an earlier document conflicts with LLD 00006, LLD 00006 wins. This design changes issue-provider routing and guidance only. It does not revive superseded transaction, projection, migration, or cache behavior.

## Goals

- Add a concise documentation set that routes readers to current behavior and separately labels future intent.
- Document the implemented SDLC, caveman, memory, issue-tracking, configuration, issue, and memory tool contracts without copying the full root `README.md` or `FLOWS.md`.
- Accept filesystem, GitHub, GitLab, Gitea, and Forgejo issue-provider selections in configuration version 2.
- Generate one self-contained issue-tracking skill from project configuration rather than from `ISSUE_TRACKING` or any other environment value.
- Install that skill for OpenCode for every valid issue provider.
- Keep local canonical issue behavior unchanged for `issues.type=filesystem`.
- Make every public local issue operation reject a remote provider clearly before filesystem, barrier, or SQLite work.
- Direct remote-provider agents to an operator-installed and authenticated CLI without adding a harnessctl remote adapter or API client.
- Preserve exact installer rollback, package-resource verification, and current Pi compile-out boundaries.

## Non-goals

- A documentation generator, documentation site framework, or duplicated command reference.
- GitHub, GitLab, Gitea, or Forgejo API integration in generic-tools or either host adapter.
- Executing, discovering, installing, authenticating, or version-checking remote CLIs.
- Persisting token values, passwords, CLI login state, or command arguments in harnessctl configuration. Remote endpoint URLs and token environment-variable names are configuration, but secret values are not.
- Translating local issue revisions, hierarchy, metadata, relationships, or archive semantics into remote-provider APIs.
- Automatic issue migration between providers.
- Changing canonical issue YAML, the shared local barrier, or the disposable SQLite cache model.
- Pi skill installation or an invented Pi skill-discovery path.
- Implementing libSQL, Mem0 OSS, Graphiti, or a custom memory service.

## Current codebase constraints

- `src/harnessctl/config.py` owns Python defaults, version 1 and partial version 2 overlay, and installer-time validation. It currently rejects every issue provider except filesystem.
- `extensions/generic-tools/config.ts` owns TypeScript defaults and migration. `extensions/generic-tools/schemas.ts` owns the canonical runtime schema, and `extensions/generic-tools/contracts/config-v2.schema.json` is generated from it.
- The current issue defaults are root `.harnessctl/issues`, prefix `hrn-`, type `filesystem`, and the full comma-separated local issue tool list.
- `extensions/generic-tools/issues.ts` is the public filesystem issue façade. Its exported local operations currently derive root and prefix without a common remote-provider rejection.
- `extensions/opencode-tools/index.ts` and `extensions/pi-tools/index.ts` register the established local issue tool names. Registration is not provider-specific.
- `src/harnessctl/templates.py` renders the caveman and memory Jinja skills through `render_skill`.
- `src/harnessctl/install.py` installs OpenCode skills as conflict-protected generated files and restores exact file bytes and file presence on failure. Memory-enabled installation also owns the existing plugin and dependency registration.
- Pi tool registration exists, but automatic Pi skill distribution is unverified. Memory-enabled Pi installation already fails before writes.
- `tests/test_install.py` owns Python configuration, rendering, installation, conflict, and rollback coverage. `tests/test_release_artifacts.py` verifies wheel and source-distribution resources from an isolated install.
- The root `README.md` contains useful product context but some current/future detail is stale. `FLOWS.md` remains the detailed intended flow reference and must not be duplicated.

## Configuration contract

Configuration remains version 2. Missing files continue to return a fresh deep copy of defaults without creating `.harnessctl/config.yaml`. Version 1 and partial version 2 mappings continue to overlay defaults recursively; mappings merge, while scalars and arrays replace their defaults. `config_create` remains create-if-absent and never rewrites an existing file. `config_get` remains read-only dotted mapping lookup.

### Issue keys

| Key                       | Accepted value                                          | Meaning                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issues.type`             | `filesystem`, `github`, `gitlab`, `gitea`, or `forgejo` | Selects the issue authority and the provider-specific rendered guidance.                                                                                                |
| `issues.root`             | Safe project-relative path                              | Canonical root only when type is filesystem. Ignored when type is remote.                                                                                               |
| `issues.prefix`           | ASCII letters, digits, underscores, or hyphens          | Local ID prefix only when type is filesystem. Ignored when type is remote.                                                                                              |
| `issues.tools`            | Provider-valid comma-separated identifiers              | Required normalized capability selection compiled into the issue skill. It is not a shell command and contains no arguments, URLs, assignments, or credentials.         |
| `issues.remote.url`       | Provider-valid HTTPS URL                                | Required when type is remote and rejected when type is filesystem. GitHub and GitLab use their public service URLs; Gitea and Forgejo require an explicit instance URL. |
| `issues.remote.token_env` | Provider-specific environment-variable name             | Required when type is remote and rejected when type is filesystem. It names the environment variable holding the token; it never contains the token value.              |

The filesystem value is required to normalize to exactly the current complete harnessctl issue-tool set: `issue_id`, `issue_create`, `issue_list`, `issue_get`, `issue_update`, `issue_transition`, `issue_comment`, `issue_relate`, `issue_unrelate`, `issue_link_document`, `issue_validate`, and `issue_archive`. Validation trims entries, verifies exact set membership, and normalizes accepted input to this canonical order and comma formatting. It rejects missing, duplicate, additional, or differently named entries. This preserves one complete local capability contract rather than supporting custom subsets.

Remote providers require both `issues.tools` and `issues.remote` to be explicitly present and must not inherit filesystem defaults through overlay. The complete provider matrix is GitHub with `gh`, `https://github.com`, and `GH_TOKEN`; GitLab with `glab`, `https://gitlab.com`, and `GITLAB_TOKEN`; Gitea with `tea`, an explicit instance URL, and `GITEA_TOKEN`; and Forgejo with `forgejo-cli`, an explicit instance URL, and `FORGEJO_TOKEN`. Known provider mismatches are rejected. These fail-closed rules prevent local-tool leakage, mixed-provider guidance, and unsupported fallback chains.

Each tools entry is an identifier, not free-form shell text. Identifier validation rejects blanks, control characters, whitespace-bearing command lines, shell operators, path separators, assignments, and secret-bearing argument forms. Provider validation then enforces the exact filesystem set or exact remote-provider executable from the matrix. Harnessctl neither invokes nor probes configured executables.

Remote configuration supplies the provider endpoint and token environment-variable name. The token value remains only in the process environment and must never enter YAML, generated guidance, issues, comments, logs, or errors. Repository selection remains CLI- and working-directory-dependent unless the provider identifies it through its normal context.

Concrete compact YAML examples are `issues: {type: github, tools: gh, remote: {url: "https://github.com", token_env: GH_TOKEN}}`, `issues: {type: gitlab, tools: glab, remote: {url: "https://gitlab.com", token_env: GITLAB_TOKEN}}`, `issues: {type: gitea, tools: tea, remote: {url: "https://gitea.example.com", token_env: GITEA_TOKEN}}`, and `issues: {type: forgejo, tools: forgejo-cli, remote: {url: "https://forgejo.example.com", token_env: FORGEJO_TOKEN}}`. A filesystem example is `issues: {type: filesystem, root: ".harnessctl/issues", prefix: "hrn-", tools: "issue_id, issue_create, issue_list, issue_get, issue_update, issue_transition, issue_comment, issue_relate, issue_unrelate, issue_link_document, issue_validate, issue_archive"}`; it rejects `issues.remote`.

### Compatibility and migration

- A missing `issues` mapping, a version 1 file, or a partial version 2 file continues to become the current filesystem configuration with the complete local tool list.
- Existing valid filesystem configurations retain their root, prefix, and tools behavior byte-for-byte at the canonical issue layer.
- Existing filesystem configurations with a custom subset, extra tool, duplicate, or wrong name become invalid and must be updated to the normalized complete harnessctl issue-tool set. This intentional migration break avoids generating incomplete or misleading local workflows.
- A remote type without explicitly supplied tools and remote settings is invalid even though deep overlay normally supplies defaults. Diagnostics identify the missing provider contract. Filesystem rejects `issues.remote`.
- Unknown types, malformed tools, provider-matrix mismatches, malformed or insecure URLs, wrong token environment-variable names, unsafe roots, and unsafe prefixes fail in Python, TypeScript, and the generated JSON contract where expressible.
- Changing `issues.type` never moves, deletes, archives, imports, or rewrites local issue files. Returning to filesystem exposes the same canonical root after normal validation.
- Config version does not increment because the default filesystem contract remains valid and remote-provider support, including `issues.remote`, is introduced entirely within this unreleased feature PR. No released remote configuration exists to migrate. The stricter exact-value rule intentionally invalidates previously tolerated custom filesystem subsets; migration diagnostics must name the required normalized set. Generated full configuration still includes every default filesystem key.

## Generated issue-tracking skill

### Template and render interface

Add `issue-tracking` to `SKILL_TEMPLATES` in `src/harnessctl/templates.py`, backed by `src/harnessctl/templates/skills/issue-tracking/SKILL.md.j2`. Prefer this single template. A partial is justified only if review shows that shared issue-body or comment guidance becomes materially clearer rather than merely shorter.

`render_skill` receives only the validated issue provider, normalized provider-valid tools value, remote URL and token environment-variable name for remote providers, and local root and prefix for filesystem. It must not receive the whole configuration document or read the token value. This narrow context prevents unrelated configuration and secrets from entering generated Markdown.

The rendered file is self-contained. It does not refer to global `skills/issue-tracking/issue.md` or `comment.md`, does not call `env-get`, and contains no `ISSUE_TRACKING` reference. It adapts the useful hierarchy, Gherkin, comment, and links-over-text guidance from the existing operator skill while removing its environment-driven routing.

### Shared content

Every valid provider rendering contains:

- Scope for initiatives, epics, stories, tasks, and bugs.
- The established hierarchy: initiative, epic, story, then task or bug, with bugs also allowed under an epic where provider capabilities permit.
- Clear, testable acceptance criteria and Gherkin-style feature or defect descriptions when useful.
- Concise progress comments containing status, artifact links, next steps or blockers, and agent attribution.
- Links to `.specs/`, task documents, and source artifacts instead of pasted document bodies.
- A requirement to record an execution failure as an issue comment only when the target issue is known and the configured issue tooling, authentication where applicable, and comment capability remain operational.
- A stop rule for provider, CLI, authentication, repository-resolution, or unavailable-comment failures: report directly to the user and never retry reporting through the broken issue channel.
- A requirement to use only configured tools and to stop with an actionable unavailable-tool error instead of switching providers or editing storage directly.
- No label-management requirement; remote hierarchy is represented through issue links and body text unless the selected CLI and repository conventions provide an operator-controlled mechanism.

### Filesystem branch

The filesystem rendering names the exact normalized local issue-tool set. It preserves the create, get, update workflow and requires the latest `expectedRevision` from `issue_get` before `issue_update` or `issue_transition`. Before each later revision-sensitive mutation it gets the issue again. It uses `issue_comment` for append-only progress and for execution-failure records only when the target is known and issue tooling remains operational.

The skill forbids direct edits to canonical files under the configured issue root. It explains that front matter, IDs, timestamps, relationships, and comments are tool-managed. It uses `issue_link_document` instead of pasting linked task or design documents. Configuration validation guarantees the complete tool set; a runtime-unavailable tool causes a direct user report rather than bypassing validation or concurrency controls.

### Remote-provider branches

All remote branches state that the configured CLI must already be installed. They use the configured endpoint and named token environment variable without reading, rendering, or persisting its value. Harnessctl does not execute login or choose a repository. Titles retain the hierarchy emoticons from the source guidance because remote systems do not have harnessctl's local type field. Capability-specific prose is rendered only for the exact provider matrix entry.

The GitHub branch may state only the verified official capability surface: official `gh issue` supports create, list, view, edit, comment, close, and reopen. It directs the agent to the installed CLI help for exact options instead of embedding an unmaintained command tutorial.

The GitLab branch may state only the verified official capability surface: official `glab issue` supports create, list, view, update, note, close, and reopen. Exact options come from the installed CLI help.

The Gitea branch may state that Gitea's official CLI is `tea` and that its issue-facing command groups include `issues` or `issue` and `comment`. It does not generalize GitHub or GitLab syntax to Gitea.

The Forgejo branch names `forgejo-cli`, the explicit instance URL, and `FORGEJO_TOKEN`, and requires the agent to inspect installed help before every unsupported or uncertain operation. Its operation syntax remains help-driven: no capability list, hardcoded subcommand, or syntax is inferred from GitHub, GitLab, or Gitea.

Each provider branch is exclusive at render time. GitHub output contains no GitLab, Gitea, or Forgejo operational guidance; equivalent wrong-provider absence applies to every other branch. Tests reject unrelated provider capability prose, boilerplate, CLI names, and syntax. Shared prose may use the generic term “remote provider.”

### OpenCode and Pi installation

For every valid provider, an OpenCode installation adds `.opencode/skills/issue-tracking/SKILL.md` as a normal conflict-protected generated target. Installation does not depend on caveman or memory being enabled. Existing `--force` behavior governs replacement.

This change does not add a remote tool adapter. The OpenCode and Pi adapter source continues registering the established local issue tools. In remote mode, calls to those tools return the provider-mismatch error described below. Remote work uses only the provider-matrix CLI, endpoint, and token environment-variable name rendered in the skill.

Existing plugin and package registration behavior remains owned by the memory installation path; this design does not widen or rename it. Environments using local issue tools remain responsible for loading the existing adapter as today. Documentation must state this boundary so installing a skill is not mistaken for installing a CLI or host adapter.

Pi discovers project skills under `.pi/skills/`. Current installation writes the configured issue-tracking skill there and registers local issue tools through project-local `@harnessctl/pi-tools`; package mutation requires explicit operator consent.

## Local issue provider guard

`extensions/generic-tools/issues.ts` gains one provider assertion at the public local issue boundary. The assertion reads validated configuration and requires `issues.type=filesystem` before resolving root or prefix, parsing IDs, entering the local barrier, reading YAML, or touching SQLite.

The guard applies to `parseIssueIds`, `parseIssueId`, `createFilesystemIssueProvider`, `createIssueRecord`, `getIssue`, `listIssueSummaries`, `updateIssue`, `transitionIssue`, `commentIssue`, `relateIssue`, `unrelateIssue`, `linkDocument`, `validateIssues`, and `archiveIssueReport`. Adapter registrations remain present, so accidental calls fail consistently rather than disappearing according to provider.

The stable error identifies the attempted local issue operation, the configured remote type, and the configured executable. It says that harnessctl local issue tools are available only for `issues.type=filesystem`. It does not suggest changing provider automatically and does not execute the configured CLI.

`validateIssues` may preserve its established report envelope, but the report must be invalid and contain the same actionable configuration finding. `issue_id` must not return an empty successful result in remote mode. OpenCode and Pi wrappers retain their current issue-error envelopes.

`validateCanonicalIssueGraph` remains an internal cross-domain helper and continues treating remote issue configuration as outside the local snapshot. This exception is necessary so repository-memory operations do not inspect a dormant local issue root when the issue authority is remote. It is not exposed as a successful local issue operation.

The provider assertion occurs before local state work. A remote-mode call must leave the configured issue root, `.harnessctl/cache/`, the shared barrier, and `harnessctl.sqlite` absent or unchanged.

## Documentation architecture

### Root routing

Update `README.md` with a compact Documentation section linking `docs/README.md` and the six topic pages. Keep product positioning and high-level flow in the root file. Correct only stale statements that directly contradict the current 18-template registry or current issue/memory behavior; do not reproduce the new topic pages.

`docs/README.md` is the documentation index. It explains the authority order: source and current designs for exact behavior, topic docs for user guidance, `FLOWS.md` for the detailed intended lifecycle, and explicitly marked future sections for roadmap concepts.

### Topic ownership

| File                    | Responsibility                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/sdlc.md`          | Current 18-command OpenCode/Pi rendering, stage boundaries, approval gates, and links to `FLOWS.md` instead of copied flow contracts. Clearly mark grouped Pi commands and other unverified host aliases as future.                  |
| `docs/skills.md`        | Caveman, memory, and issue-tracking skill purpose, configuration-driven compilation, OpenCode installation, Pi compile-out boundaries, and distinction between a skill and tool registration.                                        |
| `docs/configuration.md` | `config_create`, `config_get`, missing-file defaults, deep overlay, version migration, validation, and every current configuration key grouped by skill or tool. Include valid provider examples without credentials.                |
| `docs/memory.md`        | Canonical repository YAML, immutable record behavior, advisory authority, secret screening, filesystem reads, and the disposable shared SQLite cache. Include current OpenCode/Pi boundaries and separately labeled future backends. |
| `docs/issues.md`        | Filesystem canonical issue workflow, expected revisions, hierarchy, comments, provider selection, remote CLI responsibility, local-tool rejection in remote mode, and verified CLI capability citations.                             |

The requested six docs are `docs/README.md`, `docs/sdlc.md`, `docs/skills.md`, `docs/configuration.md`, `docs/memory.md`, and `docs/issues.md`. No generated documentation framework is introduced.

### Current versus future language

Every topic uses explicit “Current implementation” and “Planned or future” headings where both appear. Current claims cite repository paths or current design documents. Future claims use “not implemented” and never use present-tense capability language.

Documentation must not claim that SQLite is a memory or issue backend. Repository issue YAML and repository-memory YAML are canonical. `.harnessctl/cache/harnessctl.sqlite` is disposable, shared local projection state, never an agent read source, never committed, and never used to repair YAML. It is created or repaired only by participating runtime operations, not installation.

### Current memory configuration

The current documented memory keys are:

| Key                                   | Current meaning                                                     |
| ------------------------------------- | ------------------------------------------------------------------- |
| `memory.enabled`                      | Enables repository memory guidance and OpenCode installation.       |
| `memory.backend`                      | Must be `repository`.                                               |
| `memory.namespace.organization_id`    | Required non-blank local scope identifier; not authorization.       |
| `memory.namespace.project_id`         | Required non-blank project scope identifier; not authorization.     |
| `memory.namespace.default_topic`      | Default retrieval topic.                                            |
| `memory.retrieval.limit`              | Bounded result count from 1 through 100.                            |
| `memory.retrieval.max_chars`          | Bounded serialized result size from 256 through 100,000 characters. |
| `memory.retrieval.include_superseded` | Default history inclusion flag.                                     |
| `memory.repository.root`              | Safe project-relative canonical YAML root.                          |

Memory currently requires caveman to be enabled. The old `memory.repository.cache` key is tolerated for one TypeScript compatibility period but is unused and not generated. Documentation does not recommend it.

OpenCode currently receives automatic caveman installation and, when enabled, memory skill and adapter registration. Pi has normalized memory tool registration in `@harnessctl/pi-tools`, but automatic Pi extension and skill installation is unsupported. Enabled-memory Pi and all-harness installer requests remain fail-closed before writes.

### Future memory shapes

The memory page includes the following conceptual shapes under a prominent “NOT IMPLEMENTED — rejected by current schema” heading. They are design intent for discussion, not reserved compatibility contracts. The current Python and TypeScript validators reject each complete shape because `memory.backend` accepts only `repository`; generic-tools has no corresponding adapter.

| Future backend | Intended conceptual keys                                                                                            | Security boundary                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Remote libSQL  | `memory.backend=libsql`, `memory.libsql.url`, `memory.libsql.auth_token_env`                                        | Configuration stores an environment-variable name, never the token. Authenticated service identity must enforce project scope. |
| Mem0 OSS       | `memory.backend=mem0`, `memory.mem0.base_url`, `memory.mem0.api_key_env`                                            | Deployment and authentication are operator-owned; namespace strings are not authorization.                                     |
| Graphiti       | `memory.backend=graphiti`, `memory.graphiti.base_url`, `memory.graphiti.auth_token_env`                             | The service must isolate organization and project data using authenticated identity.                                           |
| Custom service | `memory.backend=custom`, `memory.custom.base_url`, `memory.custom.auth_token_env`, `memory.custom.protocol_version` | A later adapter contract must define transport, tenancy, errors, bounds, and secret handling before schema acceptance.         |

The docs state that none of these future providers uses the local barrier or SQLite cache if later implemented. They must not imply that adding these keys activates support; today it causes configuration failure.

### CLI citations

`docs/issues.md` cites the official sources used for capability claims and records that exact syntax is delegated to installed CLI help:

- GitHub CLI manual at `https://cli.github.com/manual/gh_issue` for the verified `gh issue` capability family.
- GitLab CLI issue documentation at `https://docs.gitlab.com/cli/issue/` for the verified `glab issue` capability family.
- Gitea `tea` project documentation at `https://gitea.com/gitea/tea` for the official CLI identity and issue/comment groups.
- Forgejo guidance names `forgejo-cli` but treats operation syntax as help-driven; no unsupported command syntax is cited or invented.

## Security and trust boundaries

- Project configuration is operator-controlled input, but generated guidance still receives only validated issue fields rather than the entire document.
- `issues.tools` contains identifiers only. Token values, passwords, login commands, shell fragments, and environment-variable assignments are invalid content. The endpoint URL belongs only in `issues.remote.url`.
- `issues.remote.token_env` stores exactly the provider-matrix environment-variable name. Authentication values remain in the process environment. Harnessctl never reads, persists, renders, or logs those values.
- Generated skills are instructions, not a security boundary. Host permissions and CLI authorization determine actual access.
- Remote CLIs may infer the wrong repository if invoked from the wrong directory. The skill requires confirming the active repository through provider tooling before mutation when ambiguity exists; harnessctl does not persist a repository override.
- Retrieved memory remains untrusted advisory data. Documentation must preserve authoritative-artifact precedence and never present memory as approval or completion evidence.
- Direct canonical issue-file edits remain prohibited by skill policy because they bypass expected revisions, validation, relationship rules, and cache synchronization.
- Links-over-text limits accidental duplication of sensitive artifact bodies into issues and comments.

## Error and edge-case contract

- Malformed YAML, unsupported config versions, unknown issue providers, unsafe paths, unsafe prefixes, invalid tools entries, missing or mismatched remote settings, and filesystem configuration containing `issues.remote` fail before installation writes.
- A remote local-tool call returns a provider-mismatch error before creating an issue root, lock, cache directory, or database.
- A missing configured CLI, failed CLI authentication, provider mismatch, unsupported CLI capability, ambiguous repository, or failed provider request is reported directly to the user. The skill must not fall back to filesystem or another remote provider.
- Execution failures are added to a known target issue only while the configured issue tooling, authentication where applicable, repository context, and comment operation remain usable. If any reporting dependency failed, the agent stops and reports directly to the user; it never loops by trying to report a broken issue channel through itself.
- Forgejo receives no inferred `tea`, `gh`, or `glab` capability or subcommand syntax. It uses `forgejo-cli`, and operation syntax is determined from installed help.
- Filesystem configuration missing any member of the normalized required tool set, or containing any unrelated member, fails validation; no partial workflow or direct YAML edit is permitted.
- Existing local issue revision conflicts continue to write nothing and require a fresh `issue_get`.
- Switching from filesystem to remote leaves local YAML untouched and dormant. Switching back subjects it to normal canonical validation.
- An existing generated issue skill is a conflict unless `--force` is supplied. All conflicts are collected before writes.
- Any render, write, initialization, or smoke-check failure restores exact prior file bytes and presence and removes only installer-created empty directories. Rollback errors are reported alongside the original failure.
- Pi issue-skill absence is intentional, not a partial installation error. Memory-enabled Pi safeguards remain pre-write.
- Documentation examples contain placeholders only, never token-shaped sample secrets. Current examples must pass the corresponding validator; future memory examples must be labeled invalid today.
- Broken local documentation links, stale provider names, or examples that drift from defaults fail documentation tests.

## Files and responsibilities

| File or group                                                                         | Change responsibility                                                                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                                                           | Add documentation routing and correct directly conflicting current-status statements without duplicating topic docs. |
| `docs/README.md`, `docs/sdlc.md`                                                      | Documentation index and concise current SDLC guide with `FLOWS.md` cross-links.                                      |
| `docs/skills.md`, `docs/configuration.md`                                             | Skill compilation and complete current configuration/tool guidance.                                                  |
| `docs/memory.md`, `docs/issues.md`                                                    | Canonical/cache boundaries, future memory shapes, issue providers, local workflow, and verified CLI facts.           |
| `src/harnessctl/config.py`                                                            | Provider enum, normalized exact tools and remote-setting validation, and unchanged overlay/default behavior.         |
| `extensions/generic-tools/config.ts`, `extensions/generic-tools/schemas.ts`           | Matching runtime migration, remote-setting validation, and canonical schema.                                         |
| `extensions/generic-tools/contracts/config-v2.schema.json`                            | Regenerated portable contract; never hand-edited.                                                                    |
| `src/harnessctl/templates.py`                                                         | Register issue-tracking skill and pass a narrow validated render context.                                            |
| `src/harnessctl/templates/skills/issue-tracking/SKILL.md.j2`                          | Self-contained provider-exclusive issue guidance.                                                                    |
| `src/harnessctl/install.py`                                                           | Install and smoke-check the issue skill for both harnesses; preserve package consent and exact owned-file rollback.  |
| `extensions/generic-tools/issues.ts`                                                  | Common local-provider assertion and side-effect-free remote rejection.                                               |
| `extensions/generic-tools/config.spec.ts`, `extensions/generic-tools/schemas.spec.ts` | TypeScript defaults, migration, provider validation, schema parity, and freshness.                                   |
| `extensions/generic-tools/issues.spec.ts`                                             | Every public local operation's remote rejection and no-local-side-effects checks.                                    |
| `extensions/opencode-tools/index.spec.ts`, `extensions/pi-tools/index.spec.ts`        | Existing registration plus provider-mismatch error-envelope coverage.                                                |
| `tests/test_install.py`                                                               | Python config parity, provider-specific rendering, both harness installs, conflicts, package consent, and rollback.  |
| `tests/test_release_artifacts.py`                                                     | Wheel and source-distribution inclusion plus isolated installed rendering and installation.                          |
| `tests/test_docs.py`                                                                  | Local-link, current-example, future-label, defaults, provider fact, and current/future wording consistency.          |
| `.opencode/skills/issue-tracking/SKILL.md`, `.pi/skills/issue-tracking/SKILL.md`      | Reinstalled generated issue skills for this repository after implementation.                                         |
| New Changesets entry                                                                  | Patch release for `@harnessctl/generic-tools`; no manual package-version edit.                                       |

No Python release-version mechanism is introduced. The Python wheel and source distribution change because the new Jinja resource is included, but `pyproject.toml` version remains governed by the project's existing process. Modify `pyproject.toml` only if artifact inspection proves package-resource inclusion needs an explicit declaration.

## Test strategy

### Python configuration and rendering

- Preserve missing-file defaults, version 1 migration, partial version 2 deep overlay, create-if-absent behavior, and memory-to-caveman validation.
- Accept each of the five issue types with its exact provider contract: the complete normalized filesystem set; GitHub with `gh`, `https://github.com`, and `GH_TOKEN`; GitLab with `glab`, `https://gitlab.com`, and `GITLAB_TOKEN`; Gitea with `tea`, an explicit URL, and `GITEA_TOKEN`; or Forgejo with `forgejo-cli`, an explicit URL, and `FORGEJO_TOKEN`.
- Require explicit tools and `issues.remote` in source configuration for every remote type, reject `issues.remote` for filesystem, and prove filesystem omission still receives the complete default list.
- Reject unknown types, blank or malformed entries, shell fragments, assignments, paths, credential-bearing command text, partial or extended filesystem sets, provider executable mismatches, missing or insecure URLs, wrong token environment-variable names, token values, and remote settings under filesystem.
- Render all five provider variants and assert front matter, shared issue-writing rules, configured tools, and provider-exclusive guidance.
- Assert no rendering contains `ISSUE_TRACKING`, `env-get`, unrendered Jinja, unrelated config, credential values, or unrelated provider boilerplate.
- Assert filesystem rendering includes expected-revision, links-over-text, comments, hierarchy, Gherkin, and no-direct-edit guidance.
- Assert Forgejo rendering names `forgejo-cli`, the explicit endpoint, and `FORGEJO_TOKEN`; requires installed help; and has no inferred GitHub, GitLab, or Gitea syntax.
- Assert every rendering permits issue-comment failure reporting only for a known target with operational tooling and authentication, and requires direct user reporting without recursive attempts when the provider channel itself fails.

### TypeScript configuration and generated contract

- Mirror Python default, migration, enum, normalized exact provider-tools validation, mismatch rejection, and remote explicitness outcomes.
- Keep `config_create` and `config_get` behavior unchanged for all valid provider documents.
- Validate representative complete configurations with both Zod and the generated JSON Schema.
- Prove generated-contract structured JSON is exactly fresh against `configV2Schema`.
- Preserve memory schema limits and the existing caveman cross-field condition.
- Confirm future libSQL, Mem0, Graphiti, and custom memory examples remain rejected by current runtime and generated contracts.

### Local issue rejection

- Run every public local issue export under each remote provider and assert the stable provider-mismatch diagnosis.
- Include ID parsing so remote mode cannot appear to succeed with an empty local result.
- Assert `validateIssues` returns an invalid configuration finding rather than a valid empty report.
- Compare tree manifests before and after calls to prove no issue root, lock, cache directory, SQLite file, or canonical file changes.
- Prove filesystem provider behavior and existing response contracts remain unchanged.
- Verify OpenCode and Pi adapters continue registering local issue tools and preserve their established error envelopes when generic-tools rejects remote mode.
- Verify internal remote issue exclusion still permits a valid repository-memory operation without scanning dormant local issue YAML.

### Installer and rollback

- Install OpenCode with every provider and assert exactly one specialized `.opencode/skills/issue-tracking/SKILL.md` exists.
- Install with caveman disabled and memory disabled and prove the issue skill is still present.
- Install Pi with valid local and remote issue configurations and prove no issue skill path or issue-skill text is emitted.
- Preserve enabled-memory Pi and all-harness pre-write rejection.
- Include the issue skill in conflict aggregation before mutation.
- Inject failures while writing commands, writing the issue skill, initializing memory paths, and smoke-checking. Exact tree manifests must match the pre-install tree after rollback.
- Verify smoke checks require the issue skill for OpenCode while requiring memory skill, plugin, and dependency only under the existing memory-enabled conditions.
- Verify `--force` replaces a generated issue skill consistently with other generated targets.

### Release artifacts

- Inspect wheel and source distribution for `templates/skills/issue-tracking/SKILL.md.j2` alongside every current command, partial, and skill resource.
- Install the wheel in isolation and render all provider variants without checkout imports.
- Exercise isolated OpenCode installation for filesystem and one representative remote provider and verify specialized issue-skill content.
- Preserve checks excluding root `.opencode`, `.pi`, and `.harnessctl` generated outputs from release archives.
- Confirm no Python package-version mechanism or remote CLI dependency is introduced.

### Documentation

- Resolve every repository-relative Markdown link in the root and docs index/topic pages.
- Check that the six required docs exist and are linked from `README.md` and `docs/README.md`.
- Validate current configuration examples with Python loading and, where represented as complete documents, TypeScript contract fixtures.
- Assert future memory examples are adjacent to “NOT IMPLEMENTED” and “rejected by current schema” wording.
- Assert memory docs call SQLite a disposable cache and never a backend or canonical authority.
- Assert issue docs include the complete CLI, URL, and token environment-variable matrix and describe Forgejo syntax as help-driven without inventing operations.
- Assert current command counts and names derive from the current registry fixture rather than a copied three-command claim.
- Check that topic docs link to `FLOWS.md` and do not reproduce its full flow or the root README's product narrative.

### Quality and release checks

Run the repository's Python and TypeScript tests, generated-contract freshness, lint, format, duplicate check, audit, type checks, builds, release-artifact verification, and package checks. Add a patch Changeset for `@harnessctl/generic-tools`. After all checks pass, regenerate only `.opencode/skills/issue-tracking/SKILL.md` from the repository's validated current configuration and confirm no other protected generated root output changed.

## Ordered implementation plan

Each subtask is limited to one through three files and depends on the preceding contract work.

1. Update `src/harnessctl/config.py` and its cases in `tests/test_install.py` for the provider enum, normalized exact provider-tools contract, known-executable mismatch rejection, explicit remote-tools requirement, defaults, and migration.
2. Update `extensions/generic-tools/config.ts` and `extensions/generic-tools/schemas.ts` with matching behavior; extend `extensions/generic-tools/config.spec.ts` for parity.
3. Regenerate `extensions/generic-tools/contracts/config-v2.schema.json`; update `extensions/generic-tools/schemas.spec.ts` for freshness, exact provider-valid documents, mismatched executable rejection, and rejected future memory shapes.
4. Add `src/harnessctl/templates/skills/issue-tracking/SKILL.md.j2` and register it in `src/harnessctl/templates.py`; add focused rendering cases to `tests/test_install.py`.
5. Update `src/harnessctl/install.py` and installer cases in `tests/test_install.py` for unconditional OpenCode issue-skill installation, Pi compile-out, conflict aggregation, conditional smoke checks, and exact rollback.
6. Add the common provider guard in `extensions/generic-tools/issues.ts`; cover all public exports and no-side-effect behavior in `extensions/generic-tools/issues.spec.ts`.
7. Extend `extensions/opencode-tools/index.spec.ts` and `extensions/pi-tools/index.spec.ts` for unchanged registration and remote rejection envelopes.
8. Add `docs/README.md` and `docs/sdlc.md`; update `README.md` only for routing and directly stale current-status claims.
9. Add `docs/skills.md` and `docs/configuration.md` with current configuration, overlay, skill, and host-boundary guidance.
10. Add `docs/memory.md` and `docs/issues.md` with canonical/cache boundaries, explicitly rejected future shapes, provider behavior, and verified CLI citations.
11. Add `tests/test_docs.py` for links, examples, current/future labels, command consistency, and cache terminology.
12. Update `tests/test_release_artifacts.py` for the issue template and isolated provider renders. Change `pyproject.toml` only if the archive test demonstrates missing package data.
13. Create the patch Changesets entry for `@harnessctl/generic-tools`; do not manually alter npm or Python package versions.
14. Run all quality, contract, build, artifact, and package checks. Resolve failures without broadening scope or adding remote adapters.
15. Reinstall the repository's generated `.opencode/skills/issue-tracking/SKILL.md` from current validated config. Confirm that commands, caveman and memory skills, plugin files, canonical memory, and issue files are otherwise unchanged.

## Acceptance criteria

1. The six requested docs exist, are reachable from the root README, cross-link instead of duplicating `README.md` or `FLOWS.md`, and separate current behavior from future plans.
2. Docs accurately explain all 18 current SDLC templates, approval boundaries, caveman, memory, issue tracking, `config_create`, `config_get`, defaults, overlay, migration, and per-skill/tool settings.
3. Memory docs identify repository YAML as canonical and SQLite only as a disposable shared cache that never answers agent reads or repairs YAML.
4. LibSQL, Mem0 OSS, Graphiti, and custom-service shapes are prominently marked not implemented and rejected by the current schema.
5. Config version 2 accepts filesystem, GitHub, GitLab, Gitea, and Forgejo issue types in Python, TypeScript, and generated full-document JSON validation.
6. Filesystem defaults remain the current root, prefix, provider, and complete local tool list. Existing filesystem behavior is unchanged.
7. Filesystem requires exactly the normalized complete harnessctl issue-tool set and rejects `issues.remote`. GitHub requires `gh`, `https://github.com`, and `GH_TOKEN`; GitLab requires `glab`, `https://gitlab.com`, and `GITLAB_TOKEN`; Gitea requires `tea`, an explicit URL, and `GITEA_TOKEN`; Forgejo requires `forgejo-cli`, an explicit URL, and `FORGEJO_TOKEN`. Remote settings never contain token values or silently inherit local tools.
8. The generated self-contained issue skill is configuration-driven, contains no environment routing, preserves hierarchy, Gherkin, comment, links-over-text, expected-revision, and no-direct-edit guidance, and emits one provider branch only.
9. Capability-specific prose appears only for the exact configured provider matrix entry. Forgejo output names `forgejo-cli`, requires installed help for operation syntax, and makes no inferred capability or hardcoded-subcommand claim.
10. OpenCode installation emits the issue skill for every valid provider, including when caveman and memory are disabled. Pi emits no issue skill and retains existing enabled-memory safeguards.
11. Adapter issue-tool registrations remain. Every public local issue operation fails clearly and without local side effects when issue type is remote.
12. `issue_id` does not return an apparently successful empty local result remotely, and `issue_validate` does not return a valid empty report.
13. Config tools continue working under every issue provider.
14. Failure comments are attempted only for a known target while provider tooling, authentication, and commenting remain operational. Provider-channel failures stop and go directly to the user without recursive issue-reporting attempts.
15. No harnessctl remote adapter, provider API client, CLI installer, credential storage, provider migration, or docs generator is added.
16. Installer conflict detection and every tested failure restore the exact pre-install tree, including file bytes, file presence, and installer-created empty directories.
17. The generated config contract is fresh, runtime and portable validation remain aligned, and current memory compatibility tests remain green.
18. Wheel and source distribution include the new Jinja skill and isolated installed rendering works without source-checkout imports.
19. A patch Changeset covers `@harnessctl/generic-tools`; no manual Python release-version mechanism is introduced.
20. `.opencode/skills/issue-tracking/SKILL.md` is regenerated after implementation from current project configuration, with no unrelated protected generated output changed.

## Risks and mitigations

- Provider drift: CLI syntax changes after release. Mitigation: render verified capability-level facts only for exact GitHub, GitLab, and Gitea executable/provider pairs; direct exact options to installed help and keep Forgejo generic.
- Wrong-provider execution: generic local tools remain visible remotely or a known provider is paired with another provider's executable. Mitigation: exact provider-aware validation, common fail-fast local guard, and provider-exclusive skill text.
- Unsafe tool injection: free-form configuration could become prompt or shell instructions. Mitigation: identifier-only tools contract, narrow render context, and no harnessctl execution.
- Accidental credential persistence: operators may try to embed login arguments. Mitigation: validation rejects arguments and assignments; docs require operator-managed CLI authentication.
- Overlay leakage: remote partial config could inherit local defaults. Mitigation: explicit remote-tools presence check before overlay is accepted.
- Forgejo syntax drift: `forgejo-cli` operations may vary by installed version. Mitigation: help-driven syntax with no inferred capabilities or subcommands.
- Recursive failure reporting: a broken CLI or authentication path cannot record its own failure. Mitigation: comment only through an operational channel with a known target; otherwise stop and report directly to the user.
- Skill/tool confusion: installing Markdown does not install a CLI or necessarily register an adapter. Mitigation: explicit docs and generated-skill prerequisites.
- Pi capability drift: package or skill discovery may change. Mitigation: verified `.pi/skills/` paths, explicit `pi.extensions` metadata, package-state checks, and release artifact tests.
- Cache misdescription: users may treat SQLite as authority. Mitigation: consistent canonical/cache language and terminology tests.
- README divergence: a second full flow description would become stale. Mitigation: topic ownership, cross-links, and focused docs consistency tests.
- Rollback regression: one unconditional OpenCode target broadens every installation plan. Mitigation: include it in preflight conflicts, before-images, smoke checks, and exact-tree fault tests.
- Root regeneration damage: broad forced installation could overwrite protected outputs. Mitigation: final regeneration is limited to the newly authorized issue skill and followed by a changed-path check.

## Deferred decisions

- Pi issue-skill distribution awaits a verified extension, installation, discovery, and invocation contract.
- Remote provider adapters, normalized remote issue operations, and cross-provider migration require separate approved designs.
- A richer structured `issues.tools` object may be considered only if one exact provider capability selection proves insufficient; version 2 keeps the existing scalar shape alongside `issues.remote`.
- Repository identity remains CLI-owned; remote endpoint URLs remain explicit configuration.
- Future memory backends require separate schemas, authenticated isolation, normalized contracts, and operational designs before any conceptual key becomes accepted.
- Documentation generation or a hosted documentation site remains unnecessary until manual pages become difficult to keep consistent.
