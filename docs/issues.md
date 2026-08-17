# Issue tracking

## Current implementation

Python and TypeScript validators accept `filesystem`, `github`, `gitlab`, `gitea`,
and `forgejo`. The provider selection compiles the OpenCode issue-tracking skill; it
does not add a remote adapter. Generic local issue tools operate only when
`issues.type=filesystem` and fail before filesystem, barrier, or cache access in remote
mode.

For filesystem mode, generic tools store one canonical versioned YAML document per
issue under `issues.root`, default `.harnessctl/issues`; archived documents move under
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

The local adapter tool set is listed in [configuration](configuration.md). OpenCode
and Pi adapters register it when their packages are loaded. Skill installation and
tool registration are separate concerns.

## Configured remote providers

Configuration-driven guidance for GitHub, GitLab, Gitea, and Forgejo is implemented.
No harnessctl remote adapter, API client, provider migration, CLI installer, command
runner, repository selector, or credential store exists. Local issue operations are
not a remote-provider interface.

Routing pairs GitHub with `gh`, GitLab with `glab`, Gitea with `tea`, and
Forgejo with `forgejo-cli`. The CLI must already be installed. Remote configuration
identifies the provider endpoint and names the environment variable containing the
token; the token value remains only in the environment and must never appear in YAML.
Agents must confirm an ambiguous repository before mutation and must not fall back to
filesystem or another provider when the selected CLI fails.

| Provider | CLI           | Required URL          | Required token environment variable |
| -------- | ------------- | --------------------- | ----------------------------------- |
| GitHub   | `gh`          | `https://github.com`  | `GH_TOKEN`                          |
| GitLab   | `glab`        | `https://gitlab.com`  | `GITLAB_TOKEN`                      |
| Gitea    | `tea`         | Explicit instance URL | `GITEA_TOKEN`                       |
| Forgejo  | `forgejo-cli` | Explicit instance URL | `FORGEJO_TOKEN`                     |

### GitHub

```yaml
issues:
  type: github
  tools: gh
  remote:
    url: https://github.com
    token_env: GH_TOKEN
```

### GitLab

```yaml
issues:
  type: gitlab
  tools: glab
  remote:
    url: https://gitlab.com
    token_env: GITLAB_TOKEN
```

### Gitea

```yaml
issues:
  type: gitea
  tools: tea
  remote:
    url: https://gitea.example.com
    token_env: GITEA_TOKEN
```

### Forgejo

```yaml
issues:
  type: forgejo
  tools: forgejo-cli
  remote:
    url: https://forgejo.example.com
    token_env: FORGEJO_TOKEN
```

Replace only the example self-hosted URL. Every remote provider requires
`issues.remote`; filesystem rejects it. `issues.root` and `issues.prefix` apply only
to filesystem and are ignored remotely.

Local tools remain registered but reject remote mode before reading or writing
filesystem issues, entering the local barrier, or touching SQLite. The generated
OpenCode issue-tracking skill contains only the selected provider guidance. It does
not install tools or grant access. Pi issue-skill installation remains unsupported
because no skill discovery path is verified.

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
