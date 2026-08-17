# @harnessctl/generic-tools

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
