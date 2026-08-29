# @harnessctl/generic-tools

## 0.1.10

### Patch Changes

- [#47](https://github.com/dragoscirjan/harnessctl-v2/pull/47) [`353a94b`](https://github.com/dragoscirjan/harnessctl-v2/commit/353a94b03c2e14f42de31940b07b12e8f8bc975d) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Add the fixed repository-local Documents lifecycle, safe issue document links, and equivalent OpenCode and Pi adapter contracts.

## Unreleased

### Patch Changes

- Establish the generated Config v1 schema/default contract and credential-reference-only
  generic MCP declarations, with permanent preservation of pre-existing or edited host
  entries.
- Add the repository-local Documents lifecycle, safe custom Config v1 roots, and safe
  active-document issue links.

## 0.1.9

### Patch Changes

- [#43](https://github.com/dragoscirjan/harnessctl-v2/pull/43) [`220f285`](https://github.com/dragoscirjan/harnessctl-v2/commit/220f2852269a0ce4f1b4e278d16629e78462a598) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Reserve the four harnessctl-managed `sdlc_cvs_*` MCP IDs while keeping custom IDs valid.

## 0.1.8

### Patch Changes

- Add an opt-in, provider-neutral `sdlc-code-index` skill contract without owning or projecting the external MCP runtime.

## 0.1.7

### Patch Changes

- [#33](https://github.com/dragoscirjan/harnessctl-v2/pull/33) [`33f9db0`](https://github.com/dragoscirjan/harnessctl-v2/commit/33f9db0f26c7d39f17c89b8da951833027dade29) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Add the opt-in, default-disabled `skills.tdd.enabled` configuration contract.

## 0.1.6

### Patch Changes

- [#25](https://github.com/dragoscirjan/harnessctl-v2/pull/25) [`70281cc`](https://github.com/dragoscirjan/harnessctl-v2/commit/70281cc831c24128fc8566a4744128ea2d048dd2) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Add provider-aware CVS and Issues guidance, generated OpenCode and Pi MCP configuration,
  direct OpenCode tools registration, and complete Pi prompts, skills, and tool-package
  installation.

## 0.1.5

### Patch Changes

- [#23](https://github.com/dragoscirjan/harnessctl-v2/pull/23) [`2df8994`](https://github.com/dragoscirjan/harnessctl-v2/commit/2df8994dc2bcbe885775590d6b376de51608878b) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Add provider-aware issue configuration, explicit remote URL and token-environment contracts, fail-closed remote-mode safeguards for the generated issue-tracking skill, and clear memory service support and configuration examples.

## 0.1.4

### Patch Changes

- [#21](https://github.com/dragoscirjan/harnessctl-v2/pull/21) [`5283154`](https://github.com/dragoscirjan/harnessctl-v2/commit/5283154c5a86f606700b12193eaaccafd4df447d) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Enforce compact caveman memory mutations and the memory-to-caveman configuration invariant.

## 0.1.3

### Patch Changes

- [#19](https://github.com/dragoscirjan/harnessctl-v2/pull/19) [`155788c`](https://github.com/dragoscirjan/harnessctl-v2/commit/155788c5cd735bf03ac872b0d180e2c1de9ab339) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Store complete issues and embedded comments in safe, permissively read canonical YAML
  beneath configurable `issues.root`, defaulting to `.harnessctl/issues` and the `hrn-`
  prefix. Local issue and repository-memory operations now share one barrier and
  synchronously write through to an internally rebuilt disposable SQLite cache while all
  agent reads remain filesystem-only. Legacy and mixed issue layouts remain unsupported
  with no migration.

- [#19](https://github.com/dragoscirjan/harnessctl-v2/pull/19) [`55a0798`](https://github.com/dragoscirjan/harnessctl-v2/commit/55a0798381d0e11cb8936cbf7f3bf9eb99e4eab4) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Serve a fresh default configuration when the project file is absent and deep-merge partial version 1 or version 2 files over those defaults.

## 0.1.2

### Patch Changes

- [#17](https://github.com/dragoscirjan/harnessctl-v2/pull/17) [`11b54cb`](https://github.com/dragoscirjan/harnessctl-v2/commit/11b54cbc5a68cd9dcdf27d48caa00498afef72df) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Replace the Node-only SQLite memory cache with a runtime-neutral JSON index so OpenCode, Pi, Node.js, and Bun can load and use repository memory tools.

## 0.1.1

### Patch Changes

- [#13](https://github.com/dragoscirjan/harnessctl-v2/pull/13) [`5a0f177`](https://github.com/dragoscirjan/harnessctl-v2/commit/5a0f177aa7d868234e1dfa41e9cc811d0a604cea) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Prepare public npm packages with verified build outputs and release metadata.
