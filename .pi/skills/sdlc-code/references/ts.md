# TypeScript

- Follow `tsconfig`, package metadata, runtime targets, generated boundaries, and configured lint/format/test tools.
- Preserve the repository's strictness level. Improve types locally without silently enabling strict mode or changing compilation scope.
- Prefer `unknown` over `any` at untrusted boundaries and narrow it safely. Use `any` only for documented compatibility escape hatches.
- Give public APIs explicit stable types where project policy requires them; allow clear inference for local implementation details.
- Use discriminated unions for genuine state variants. Choose `interface` or `type` according to project conventions and semantic needs, not a universal rule.
- Typical tools include TypeScript ESLint, Prettier, Vitest, or Jest; use only the selected repository toolchain.
