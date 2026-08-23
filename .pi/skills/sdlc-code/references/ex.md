# Elixir

- Follow the repository's Elixir, OTP, and formatter versions. Use `mix format`, Credo, Dialyxir, and ExUnit only when configured or required by scope.
- Use pattern matching and function heads to make valid states and branches explicit. Use pipelines when they improve left-to-right readability.
- Return `{:ok, value}` and `{:error, reason}` for expected outcomes unless the surrounding API establishes another contract.
- Rely on supervision and restart strategies for process failures that OTP is designed to isolate; do not use "let it crash" to skip validation or recoverable error handling.
- Keep processes focused, message contracts explicit, and shared mutable state out of ordinary modules.
