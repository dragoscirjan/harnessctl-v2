# CSS

- Preserve the existing styling architecture: plain CSS, modules, BEM, utility classes, CSS-in-JS, or framework conventions. Do not mix approaches without an approved migration.
- Reuse design tokens or CSS custom properties for stable shared values; avoid premature variables for one-off values.
- Keep responsive behavior and supported browsers consistent with repository evidence. Prefer mobile-first rules when that is the established approach.
- Preserve focus visibility, contrast, reduced-motion behavior, zoom, and responsive layout accessibility.
- Avoid inline styles when they conflict with project policy, CSP, reuse, or maintainability; do not ban them when the framework deliberately uses them.
- Use the configured formatter, linter, visual tests, and browser checks; add none solely because they are named here.
