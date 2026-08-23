# C#

- Follow repository style, target framework, language version, analyzers, and nullable settings before ecosystem defaults.
- Prefer nullable reference types and immutable records for data carriers when supported by the existing target and compatibility contract.
- Use pattern matching and LINQ when they clarify intent; avoid pipelines that obscure cost, ordering, or side effects.
- Use `async`/`await` for asynchronous I/O and the repository's naming convention, commonly an `Async` suffix. Do not convert synchronous APIs without scope and compatibility evidence.
- Use constructor injection where dependency injection already fits the architecture; do not introduce a container for its own sake.
- Prefer configured tooling such as Roslyn analyzers, `dotnet format`, xUnit, NUnit, MSTest, or the existing mocking library.
