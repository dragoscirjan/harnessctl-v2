# Java

- Follow the build's Java release, framework baseline, style, and compatibility policy. Do not assume Java 17 or 21 when manifests or CI target another release.
- Use records, sealed types, switch expressions, and other modern features only when the declared release permits them and they simplify the model.
- Use streams for clear data transformations; prefer ordinary control flow when it better exposes state, short-circuiting, checked failures, or performance.
- Avoid returning `null` collections. Use `Optional` for an established optional-result API, not fields, parameters, or every nullable value by default.
- Use try-with-resources for `AutoCloseable` resources. Preserve interruption and causal context in concurrency and error paths.
- Use virtual threads only on a supported runtime and workload. Prefer configured formatting, analysis, and JUnit-family test tooling.
