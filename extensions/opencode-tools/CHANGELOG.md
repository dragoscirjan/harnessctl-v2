# @harnessctl/opencode-tools

## 0.1.10

### Patch Changes

- [#47](https://github.com/dragoscirjan/harnessctl-v2/pull/47) [`353a94b`](https://github.com/dragoscirjan/harnessctl-v2/commit/353a94b03c2e14f42de31940b07b12e8f8bc975d) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Add the fixed repository-local Documents lifecycle, safe issue document links, and equivalent OpenCode and Pi adapter contracts.
- Updated dependencies [[`353a94b`](https://github.com/dragoscirjan/harnessctl-v2/commit/353a94b03c2e14f42de31940b07b12e8f8bc975d)]:
  - @harnessctl/generic-tools@0.1.10

## Unreleased

### Patch Changes

- Register the nine normalized repository-local Documents tools and expanded issue-link
  contract without a Documents skill or remote route.

## 0.1.9

### Patch Changes

- Updated dependencies [[`220f285`](https://github.com/dragoscirjan/harnessctl-v2/commit/220f2852269a0ce4f1b4e278d16629e78462a598)]:
  - @harnessctl/generic-tools@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @harnessctl/generic-tools@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [[`33f9db0`](https://github.com/dragoscirjan/harnessctl-v2/commit/33f9db0f26c7d39f17c89b8da951833027dade29)]:
  - @harnessctl/generic-tools@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`70281cc`](https://github.com/dragoscirjan/harnessctl-v2/commit/70281cc831c24128fc8566a4744128ea2d048dd2)]:
  - @harnessctl/generic-tools@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [[`2df8994`](https://github.com/dragoscirjan/harnessctl-v2/commit/2df8994dc2bcbe885775590d6b376de51608878b)]:
  - @harnessctl/generic-tools@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [[`5283154`](https://github.com/dragoscirjan/harnessctl-v2/commit/5283154c5a86f606700b12193eaaccafd4df447d)]:
  - @harnessctl/generic-tools@0.1.4

## 0.1.3

### Patch Changes

- [#19](https://github.com/dragoscirjan/harnessctl-v2/pull/19) [`155788c`](https://github.com/dragoscirjan/harnessctl-v2/commit/155788c5cd735bf03ac872b0d180e2c1de9ab339) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Store complete issues and embedded comments in safe, permissively read canonical YAML
  beneath configurable `issues.root`, defaulting to `.harnessctl/issues` and the `hrn-`
  prefix. Local issue and repository-memory operations now share one barrier and
  synchronously write through to an internally rebuilt disposable SQLite cache while all
  agent reads remain filesystem-only. Legacy and mixed issue layouts remain unsupported
  with no migration.
- Updated dependencies [[`155788c`](https://github.com/dragoscirjan/harnessctl-v2/commit/155788c5cd735bf03ac872b0d180e2c1de9ab339), [`55a0798`](https://github.com/dragoscirjan/harnessctl-v2/commit/55a0798381d0e11cb8936cbf7f3bf9eb99e4eab4)]:
  - @harnessctl/generic-tools@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`11b54cb`](https://github.com/dragoscirjan/harnessctl-v2/commit/11b54cbc5a68cd9dcdf27d48caa00498afef72df)]:
  - @harnessctl/generic-tools@0.1.2

## 0.1.1

### Patch Changes

- [#13](https://github.com/dragoscirjan/harnessctl-v2/pull/13) [`5a0f177`](https://github.com/dragoscirjan/harnessctl-v2/commit/5a0f177aa7d868234e1dfa41e9cc811d0a604cea) Thanks [@dragoscirjan](https://github.com/dragoscirjan)! - Prepare public npm packages with verified build outputs and release metadata.
- Updated dependencies [[`5a0f177`](https://github.com/dragoscirjan/harnessctl-v2/commit/5a0f177aa7d868234e1dfa41e9cc811d0a604cea)]:
  - @harnessctl/generic-tools@0.1.1
