# Changelog

This page is an evidence-backed index, not a replacement for release notes. It keeps
the project version, public Node package releases, Unreleased changes, and documentation
history separate because those streams do not prove one another.

**Evidence review date:** 2026-09-02. Checked-in changelogs and current
[GitHub Releases](https://github.com/dragoscirjan/harnessctl-v2/releases) are the release
authorities used here. Local tags are not the sole package-release authority because the
available local tag set can be incomplete.

## Project release 0.2.0

| Version | Evidence date | Distribution statement                                                                      |
| ------- | ------------- | ------------------------------------------------------------------------------------------- |
| `0.2.0` | 2026-08-19    | Project version and release notes exist; build artifacts are not publication to a registry. |

Version `0.2.0` introduced the five-command Epic-first lifecycle and explicit migration
boundaries for command, skill, and managed MCP identity changes. The root release notes
own the complete change list and state explicitly that this version does not publish
artifacts to package registries.

**Evidence:** Source: [root changelog](../CHANGELOG.md#020),
[project version](../pyproject.toml), and dated
[source commit](https://github.com/dragoscirjan/harnessctl-v2/commit/544d0431bdc2d184d93c90c28f66d36e44b29d01).
These sources establish repository version and build intent; they do not claim registry
publication.

## Public Node package releases 0.1.10

The three public workspaces have separate package release streams. Their checked-in
release notes record `0.1.10`; the dated provider observation below was reviewed against
GitHub Releases on 2026-09-02.

| Package                      | Version  | Published date | Release authority                                                   |
| ---------------------------- | -------- | -------------- | ------------------------------------------------------------------- |
| `@harnessctl/generic-tools`  | `0.1.10` | 2026-08-28     | [Package changelog](../extensions/generic-tools/CHANGELOG.md#0110)  |
| `@harnessctl/opencode-tools` | `0.1.10` | 2026-08-28     | [Package changelog](../extensions/opencode-tools/CHANGELOG.md#0110) |
| `@harnessctl/pi-tools`       | `0.1.10` | 2026-08-28     | [Package changelog](../extensions/pi-tools/CHANGELOG.md#0110)       |

Release `0.1.10` records repository-local Documents behavior and corresponding adapter
contracts. The OpenCode and Pi adapters also record their exact dependency on
`@harnessctl/generic-tools` `0.1.10`.

**Evidence:** Dated provider observation:
[GitHub Releases](https://github.com/dragoscirjan/harnessctl-v2/releases), reviewed
2026-09-02. Source: the package changelogs above,
[pull request #47](https://github.com/dragoscirjan/harnessctl-v2/pull/47), and
[commit `353a94b`](https://github.com/dragoscirjan/harnessctl-v2/commit/353a94b03c2e14f42de31940b07b12e8f8bc975d).
This evidence does not prove that a registry is reachable now, that a local installation
uses this version, or that a host or external provider is operational. See
[Node Modules](node-modules.md) for package capabilities and prerequisites.

## Unreleased

`Unreleased` means checked-in work that is not represented here as a shipped project or
package release. It has no inferred publication date or delivery estimate.

- The [root Unreleased notes](../CHANGELOG.md#unreleased) currently record Config v1,
  MCP declaration, Documents, migration, and pending package-versioning changes.
- The [generic-tools](../extensions/generic-tools/CHANGELOG.md#unreleased),
  [OpenCode adapter](../extensions/opencode-tools/CHANGELOG.md#unreleased), and
  [Pi adapter](../extensions/pi-tools/CHANGELOG.md#unreleased) each maintain their own
  Unreleased package notes.

An Unreleased entry, merged change, version in a manifest, generated artifact, or active
plan does not by itself establish registry publication, compatibility with an external
host, provider operation, or a future release date.

## Documentation changes

These entries describe documentation delivered to the repository. They are not product
or package release records.

| Date       | Documentation change                                  | Source evidence                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-31 | Established the documentation website foundation      | [Commit `991f89e`](https://github.com/dragoscirjan/harnessctl-v2/commit/991f89ebf6a829f5768b566335a42fcb014cfbb5)                                                                               |
| 2026-09-01 | Published configuration and command references        | [Commit `df80d79`](https://github.com/dragoscirjan/harnessctl-v2/commit/df80d797060554dd468d0f588109e7e027aed07e)                                                                               |
| 2026-09-01 | Published the Skills catalog                          | [Commit `7ff9c76`](https://github.com/dragoscirjan/harnessctl-v2/commit/7ff9c76e4e06bf989b2d2b094030fdc76240a336)                                                                               |
| 2026-09-01 | Published generic and harnessctl SDLC guides          | [Commit `0711784`](https://github.com/dragoscirjan/harnessctl-v2/commit/07117843fe65d1a39871a3c17fb71d7cea6ef6f0)                                                                               |
| 2026-09-02 | Published the MCP Servers catalog                     | [Commit `edb44c2`](https://github.com/dragoscirjan/harnessctl-v2/commit/edb44c23ab762730807ed68ee0d034a5f6aa085d)                                                                               |
| 2026-09-02 | Published home, installation, and onboarding guidance | [Commit `be97f61`](https://github.com/dragoscirjan/harnessctl-v2/commit/be97f61d8ed02ba3a4cd210bcefd4c8df4a789dc)                                                                               |
| 2026-09-02 | Published harness support documentation               | [Pull request #73](https://github.com/dragoscirjan/harnessctl-v2/pull/73) and [commit `208c285`](https://github.com/dragoscirjan/harnessctl-v2/commit/208c28594a835d02827f98373780673d18790a22) |
| 2026-09-02 | Published the Node Modules catalog                    | [Pull request #74](https://github.com/dragoscirjan/harnessctl-v2/pull/74) and [commit `636de97`](https://github.com/dragoscirjan/harnessctl-v2/commit/636de97cf503cb5fca940e31825740310ed17f07) |

Use [Troubleshooting](troubleshooting.md) for current recovery guidance and
[FAQ](faq.md) for conceptual questions. Neither page changes release state.
