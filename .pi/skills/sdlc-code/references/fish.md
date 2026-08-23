# Fish shell

- Confirm Fish from the `.fish` extension, shebang, or repository policy. Fish is not POSIX shell; do not import Bash syntax or assumptions.
- Use `set` with explicit scope, `argparse` for non-trivial options, and `status` for command and function outcomes.
- Quote expansions where Fish syntax requires it and preserve list semantics rather than emulating shell word splitting.
- Check command failures deliberately and keep cleanup behavior explicit.
- Use existing Fish formatting, linting, and test tooling; do not introduce shell tooling that cannot parse Fish.
