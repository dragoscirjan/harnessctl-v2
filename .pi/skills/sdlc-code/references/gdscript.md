# GDScript

- Use for `.gd` files in a Godot project. Inspect `project.godot`, the supported Godot version, scene and resource conventions, warning settings, addons, and existing tests before choosing syntax or APIs.
- GDScript is a distinct language, not Python. Do not transfer Python syntax, libraries, object behavior, or tooling assumptions into Godot code.
- Follow the repository and official GDScript style. Add static types at public or changed boundaries and explicit types for node references when compatible; do not force a dynamic codebase into a broad typing migration.
- Preserve engine lifecycle semantics: initialize node references at the appropriate stage, use signals for established event boundaries, and release `Node`, `RefCounted`, and server-managed resources according to their actual ownership rules.
- Keep `_process` and `_physics_process` work bounded, use the correct callback and `delta`, and avoid polling when an existing signal or event expresses the behavior more clearly.
- Treat `@tool` scripts, exported properties, scene paths, and deferred operations as editor/runtime contracts. Avoid side effects that can corrupt scenes or diverge between editor and game execution.
- Use the repository's Godot parser, diagnostics, formatter, and test framework. Typical checks include Godot's CLI or LSP plus GUT or GdUnit4, but named tools are not installation requirements.
