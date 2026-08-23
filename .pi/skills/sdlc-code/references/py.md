# Python

- Follow `pyproject.toml`, supported Python versions, framework conventions, and configured formatter, linter, type checker, test runner, and dependency manager.
- Add type hints at public and changed boundaries when compatible with project policy; do not impose full typing on an intentionally dynamic codebase.
- Prefer comprehensions for simple transformations and generators for lazy large sequences; use explicit loops when clearer.
- Catch specific exceptions, preserve causal context with `raise ... from error`, and never use a bare `except` without a narrowly justified boundary behavior.
- Use `asyncio`, task groups, threads, or processes only when the existing stack and workload require them; preserve cancellation and cleanup.
- Typical tools include Ruff, mypy or Pyright, pytest, and uv, but existing repository choices take precedence and named tools are not installation requirements.
