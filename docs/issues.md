# Issue tracking

## Current implementation

Harnessctl accepts `filesystem`, `github`, `gitlab`, `gitea`, `forgejo`, and `bitbucket`
issue providers. The provider selection compiles the issue-tracking skill; it
does not add a remote adapter. Generic local issue tools operate only when
`skills.issues.provider.type=filesystem` and fail before filesystem, barrier, or cache access in remote
mode.

For filesystem mode, generic tools store one canonical versioned YAML document per
issue under `skills.issues.root`, default `.harnessctl/issues`; archived documents move under
its `archived/` child. YAML is authoritative. The shared SQLite file is only a
disposable cache, never an issue backend or repair source.

Issue types are initiative, epic, story, task, and bug. The supported hierarchy is
initiative, Epic, Story, then Task or Bug; Tasks and Bugs may also use the narrower
parents accepted by runtime validation. Tool-managed documents contain metadata,
body, relationships, document links, and append-only comments. Do not edit canonical
files directly because that bypasses validation, relationship rules, revision checks,
and cache synchronization.

Use `issue_create`, then `issue_get` to obtain the current revision. Pass its latest
`expectedRevision` to `issue_update` or `issue_transition`; after any intervening
change, get the issue again. A revision conflict writes nothing. Use `issue_comment`
for append-only progress, relationship tools for links, `issue_link_document` instead
of copying specifications, and `issue_validate` before relying on manually moved or
edited repository data. `issue_archive` recursively archives an issue and active
descendants with rollback on ordinary failure.

`issue_link_document` accepts real files beneath configured `paths.tasks` and active
canonical files beneath configured `skills.documents.root`. Use kind `task` for task
artifacts and `document` for canonical design records. The tool stores only the
repository-relative path. Archive paths, symlinks, traversal, absolute paths, missing
files, oversized files, and retired legacy roots are rejected. See [Documents](documents.md).

The local adapter tool set is listed in [configuration](configuration.md). OpenCode
and Pi adapters register it when their packages are loaded. Skill installation and
tool registration are separate concerns.

## Configured remote providers and capabilities

Configuration-driven CLI/MCP guidance and host MCP projection for GitHub, GitLab,
Gitea, and Forgejo are implemented. No harnessctl remote adapter, API client, provider
migration, CLI installer, command runner, repository selector, or credential store exists.
OpenCode and Pi both receive the configured issue-tracking skill. Local issue operations
are not a remote-provider interface.

Routing pairs GitHub with `gh`, GitLab with `glab`, Gitea with `tea`, and
Forgejo with `forgejo-cli`. The CLI must already be installed. Remote configuration
identifies the provider endpoint and names the environment variable containing the
token; the token value remains only in the environment and must never appear in YAML.
Agents must confirm an ambiguous repository before mutation and must not fall back to
filesystem or another provider when a selected route fails.

Remote Issues always enumerate the provider's valid CLI capabilities. They enumerate MCP
capabilities only when optional `mcpName` configuration yields an available projected
server. The agent chooses the suitable available capability for each operation; there is
no configured selector or required MCP-first order. It must choose before a mutation
starts. After mutation begins, every result, error, timeout, cancellation, or ambiguity is
terminal for that route and the agent must never switch routes for the same mutation. CVS
configuration and runtime success never determine the Issues choice.

| Provider  | CLI           | Required URL            | Example token environment variable |
| --------- | ------------- | ----------------------- | ---------------------------------- |
| GitHub    | `gh`          | `https://github.com`    | `GH_TOKEN`                         |
| GitLab    | `glab`        | `https://gitlab.com`    | `GITLAB_TOKEN`                     |
| Gitea     | `tea`         | Explicit instance URL   | `GITEA_TOKEN`                      |
| Forgejo   | `forgejo-cli` | Explicit instance URL   | `FORGEJO_TOKEN`                    |
| Bitbucket | `git`         | `https://bitbucket.org` | `BITBUCKET_TOKEN`                  |

`token_env` may use any valid uppercase environment-variable name. `mcpName` is optional
for GitHub, GitLab, Gitea, and Forgejo; omitting it makes that route CLI-only and produces
no managed provider MCP entry. Bitbucket prohibits `mcpName` and is always CLI-only.

### GitHub

```yaml
version: 1
skills:
  issues:
    provider:
      type: github
      tools: gh
      mcpName: sdlc_cvs_github
      url: https://github.com
      token_env: GH_TOKEN
```

### GitLab

```yaml
version: 1
skills:
  issues:
    provider:
      type: gitlab
      tools: glab
      mcpName: sdlc_cvs_gitlab
      url: https://gitlab.com
      token_env: GITLAB_TOKEN
```

### Gitea

```yaml
version: 1
skills:
  issues:
    provider:
      type: gitea
      tools: tea
      mcpName: sdlc_cvs_gitea
      url: https://gitea.example.com
      token_env: GITEA_TOKEN
```

### Forgejo

```yaml
version: 1
skills:
  issues:
    provider:
      type: forgejo
      tools: forgejo-cli
      mcpName: sdlc_cvs_forgejo
      url: https://forgejo.example.com
      token_env: FORGEJO_TOKEN
```

Replace only the example self-hosted URL. Every remote provider requires
the complete `skills.issues.provider` mapping; filesystem rejects Git connection fields. `skills.issues.root` and `skills.issues.prefix` apply only
to filesystem and are ignored remotely.

Local tools remain registered but reject remote mode before reading or writing
filesystem issues, entering the local barrier, or touching SQLite. The generated
OpenCode and Pi issue-tracking skills contain only the selected provider's valid CLI
guidance and, when projected, MCP capability guidance. They do not install provider tools
or grant access. Pi uses `.pi/skills/sdlc-issue-tracking/SKILL.md`; MCP host configuration
uses the pinned adapter.

The examples use `sdlc_cvs_github`, `sdlc_cvs_gitlab`, `sdlc_cvs_gitea`, and
`sdlc_cvs_forgejo`; configured `mcpName` values determine the actual IDs. Identical CVS
and Issues definitions deduplicate; a same-ID URL,
environment-name, endpoint, command, version, OAuth, header, or toolset mismatch fails
instead of choosing one domain. GitHub and GitLab use official hosted MCP services.
Gitea uses operator-installed official `gitea-mcp` 1.6.0; Forgejo uses external
`forgejo-mcp` 2.33.0. Each requires its provider-specific runtime version check before
mutation. See [CVS and MCP providers](cvs.md) for exact host formats, vetted license
boundaries, output limits, and Pi consent/residuals.
Exact generated legacy `cvs_*` definitions migrate to the canonical IDs; modified legacy
definitions are preserved with a warning and are never treated as aliases.

Gitea MCP capability is available only when `gitea-mcp` is present; Forgejo MCP
capability is available only when `forgejo-mcp` is present. CLI capability is
independently available only when `tea` or `forgejo-cli`, respectively, is present. One
provider's executable or one route's absence does not affect the other.

Capability references used by generated guidance are:

- [GitHub CLI `gh issue` manual](https://cli.github.com/manual/gh_issue): create,
  list, view, edit, comment, close, and reopen capability families.
- [GitLab CLI issue documentation](https://docs.gitlab.com/cli/issue/): create, list,
  view, update, note, close, and reopen capability families.
- [Gitea `tea` project](https://gitea.com/gitea/tea): official Gitea CLI identity and
  issue/comment groups.
- Forgejo uses configured `forgejo-cli`, but its operation syntax is help-driven.
  Inspect the installed help before use rather than inferring GitHub, GitLab, or Gitea
  syntax.

Exact options belong to the installed CLI help because versions drift. Authentication
or provider-channel failures must be reported directly to the user, not recursively
reported through the broken issue channel.
