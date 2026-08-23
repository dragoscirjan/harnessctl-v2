# JavaScript

- Follow `package.json`, lockfiles, runtime declarations, module type, browserslist, framework, and existing lint/format/test configuration.
- Preserve CommonJS or ESM compatibility; do not force ESM or a newer Node.js target without repository evidence.
- Prefer `const`, use `let` for reassignment, and avoid `var` in new code unless compatibility requires it.
- Prefer `async`/`await` when it clarifies asynchronous control flow; preserve promise concurrency, cancellation, and error behavior.
- Use destructuring, spread, and arrow functions when they improve clarity rather than as mechanical rewrites.
- Document public APIs and non-obvious contracts using the repository's established documentation approach. Use configured tools such as ESLint, Prettier, Vitest, or Jest only when selected by the project.
