# Go

- Follow the module's declared Go version, Effective Go, repository conventions, and generated-code boundaries.
- Run the configured formatter, normally `gofmt` and possibly `goimports`; use existing lint and test commands.
- Return errors explicitly and wrap only when adding useful context, preserving identity with `%w`. Reserve panic for unrecoverable programmer or initialization failures consistent with project policy.
- Accept small consumer-owned interfaces when substitution is needed and return concrete types by default; do not create interfaces preemptively.
- Pass `context.Context` as the first parameter across request or I/O boundaries when cancellation or deadlines are relevant; never store it in a struct without a documented exception.
- Prefer straightforward synchronous code. Add goroutines and channels only with clear ownership, cancellation, error propagation, and leak prevention.
