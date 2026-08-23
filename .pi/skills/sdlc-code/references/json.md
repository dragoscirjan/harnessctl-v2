# JSON

- Treat the owning format or schema as authority; generic JSON style never overrides a protocol, package manifest, lockfile, generated file, or tool-owned ordering.
- Emit valid JSON with no comments or trailing commas unless the actual format is JSONC or JSON5 and repository evidence says so.
- Preserve meaningful key order where consumers, diffs, or conventions rely on it; otherwise use the existing formatter.
- Validate changed structured data with its schema or owning tool when available. Do not apply class, interface, or dependency-injection guidance.
- Do not hand-edit generated or lock files unless the approved workflow requires it.
