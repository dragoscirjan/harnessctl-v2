---
id: "00018"
type: story
title: "Publish harnessctl Node packages through GitHub CI/CD"
status: done
parent: "00001"
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Publish harnessctl Node packages through GitHub CI/CD

As a harnessctl maintainer
I want cross-platform quality checks and independent npm package releases
So that OpenCode and Pi integrations can consume reviewed, reproducible artifacts.

## Acceptance criteria

- [x] Pull requests and main pushes run locked quality checks on Linux, macOS, and Windows.
- [x] Changesets creates a release PR with independent package versions.
- [x] Merging the release PR publishes only changed public packages to npm.
- [x] npm credentials are available only to the protected publish job.
- [x] Package tarballs contain declared runtime files and no tests or build debris.

## Design

See [LLD 00003](../.specs/lld-00003-github-ci-and-independent-npm-package-releases-v1.md).


## Comments

### 2026-08-12 — lead-engineer

Implemented approved LLD. Local quality, strict typecheck, package inspection, workflow lint, and Changesets status pass. GitHub environment/token setup remains maintainer configuration before first publication.
