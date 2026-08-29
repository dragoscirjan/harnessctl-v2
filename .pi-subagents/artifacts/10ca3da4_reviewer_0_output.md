## Review — PASS

- Correct: Default is disabled in both runtimes (`src/harnessctl/config.py:63`, `extensions/generic-tools/config.ts:37`) and validation accepts only `mcp.web_retrieval.enabled` (`src/harnessctl/config.py:218`, `extensions/generic-tools/schemas.ts:138`).
- Correct: Enabled config adds fixed MCP server id `sdlc_web_crawl` projected to `npx -y @dragoscirjan/mcp-searchable@latest` for OpenCode/Pi (`src/harnessctl/mcp.py:76`, `src/harnessctl/mcp.py:101`, tests at `tests/test_mcp_projection.py:179`, `tests/test_install.py:3348`).
- Correct: SDLC guidance covers MCP-first preference, live schema inspection, fallback, and untrusted web text (`src/harnessctl/templates/skills/sdlc/SKILL.md.j2:29`, `docs/configuration.md:152`, `docs/sdlc.md:41`).
- Note: No blockers found. Residual risks are normal: `@latest` can drift, and the fixed server id string is duplicated in a few places.
