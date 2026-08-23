# Rust

- Follow `rust-toolchain`, Cargo metadata, minimum supported Rust version, feature flags, and crate policy.
- Use `rustfmt`, Clippy, and Cargo test commands already configured by the workspace. The complete strict Clippy form is commonly `cargo clippy -- -D warnings`, but preserve repository flags.
- Model expected absence and failure with `Option` and `Result`. Avoid `unwrap` and `expect` in reusable library paths; permit them in tests or proven invariants when policy allows and context is clear.
- Prefer borrowing over cloning when ownership remains understandable; do not trade clarity or correctness for avoiding every allocation.
- Select error libraries by existing architecture; `thiserror` and `anyhow` are options, not mandatory dependencies.
- Use the configured async runtime, if any. Do not introduce Tokio or asynchronous code solely because I/O exists.
