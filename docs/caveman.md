# Caveman

Use `skills.caveman` to control how concise Harnessctl's generated SDLC guidance is. It is
enabled in `strict` mode by default.

```yaml
version: 1
skills:
  caveman:
    enabled: true
    mode: balanced
```

Choose `strict` for terse technical fragments. Choose `balanced` for concise professional
sentences. Both modes preserve exact IDs, paths, symbols, commands, errors, constraints,
evidence, uncertainty, and consent boundaries. Neither mode imposes a hard word limit, and
both expand when security, destructive actions, or ordered instructions require detail.

Disabling Caveman omits its generated guidance where the selected harness permits that
omission. Project Memory cannot be enabled while Caveman is disabled.

See the [Caveman schema](config-schema.md#caveman) for the exact fields, defaults, and
accepted modes. This page configures response style; the [Skills catalog](skills.md)
describes the distributed skill artifact.

## Boundaries

Caveman mode changes presentation, not authority or safety. It never removes required
approval, evidence, failure details, uncertainty, or lifecycle boundaries.
