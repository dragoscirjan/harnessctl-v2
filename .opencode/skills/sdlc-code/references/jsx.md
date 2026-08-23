# JSX and React

- Use only when repository evidence establishes React. Follow the installed React version, framework rules, compiler settings, and repository component patterns.
- Prefer function components and hooks for new code when compatible; preserve class components unless migration is approved or required.
- Follow the Rules of Hooks. Add memoization only for measured cost, referential contracts, or documented framework guidance.
- Prefer composition and local ownership over prop drilling, but use the repository's established state and context boundaries.
- Use stable keys derived from item identity for dynamic lists; never use random values and avoid indexes when order can change.
- Collocate files only where project structure supports it. Use configured React lint, formatter, and test tooling.
