---
"@harnessctl/generic-tools": patch
"@harnessctl/opencode-tools": patch
"@harnessctl/pi-tools": patch
---

Store complete issues and embedded comments in safe, permissively read canonical YAML
beneath configurable `issues.root`, defaulting to `.harnessctl/issues` and the `hrn-`
prefix. Local issue and repository-memory operations now share one barrier and
synchronously write through to an internally rebuilt disposable SQLite cache while all
agent reads remain filesystem-only. Legacy and mixed issue layouts remain unsupported
with no migration.
