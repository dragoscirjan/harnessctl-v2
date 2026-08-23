# Zig

- Follow the repository's pinned Zig version; language and standard-library APIs can change between releases.
- Use `zig fmt`, `zig test`, and build commands already established by the project.
- Make allocator ownership explicit and pass allocators according to local API conventions. Use debug allocators only in supported development or test paths.
- Use `defer` and `errdefer` for clear resource cleanup and error-path ownership.
- Model recoverable failures with error unions and propagate precise errors; avoid broad error sets when the public contract can be narrower.
- Use `comptime` when compile-time behavior materially simplifies or validates the implementation, not as a default abstraction mechanism.
