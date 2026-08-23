# Svelte

- Follow the component's script declaration and repository JavaScript or TypeScript configuration selected by the root guidance.
- Follow the installed Svelte and SvelteKit versions. Use runes for Svelte 5 where the project adopts them; preserve legacy reactive declarations in Svelte 4 or unmigrated components.
- Keep local component state local. Use stores or framework context for genuinely shared state according to existing architecture.
- Treat reactive effects as synchronization with external systems, not as a default place for derivation.
- Preserve component accessibility and server/client boundaries. Use configured Svelte lint, formatter, and test tooling.
