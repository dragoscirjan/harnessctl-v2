# Test-driven development

Use `skills.tdd` to add Red-Green-Refactor guidance to SDLC Build work. TDD is disabled by
default.

```yaml
version: 1
skills:
  tdd:
    enabled: true
```

When enabled, Build starts with a focused behavior test that fails for the expected reason,
adds the minimum implementation needed to pass, then refactors without changing behavior.
Tests should exercise observable behavior and mock external systems rather than internal
logic.

See the [TDD schema](config-schema.md#tdd) for the exact field and default. This setting
controls generated guidance; it does not choose a test framework or change application
runtime behavior.

## Disablement

A disabled install does not activate TDD guidance. A previously installed TDD skill may
remain on disk but is dormant because the generated core SDLC guidance does not load it.
Harnessctl does not delete operator-visible artifacts merely because the feature is disabled.
