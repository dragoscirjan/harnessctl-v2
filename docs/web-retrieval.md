# Web Retrieval

Use `skills.webRetrieval` to make a configured MCP server the preferred route for researched
web search and page retrieval. The feature is disabled by default.

```yaml
version: 1
skills:
  webRetrieval:
    enabled: true
    mcpName: sdlc_web_crawl
```

The fixed `mcpName` must exist in the effective top-level `mcpServers` registry. Harnessctl
then compiles the route into the core SDLC guidance. It does not install, start, authenticate,
or prove the operation of that external server.

When enabled and suitable live tools are available, SDLC inspects their schemas and prefers
supported search, fetch, stash, and grep capabilities before ad hoc `curl` or `wget` use. It
falls back when the configured route is unavailable, stale, incomplete, or unsuitable. When
disabled, normal configured web/search tools remain available under their own rules.

See the [Web Retrieval schema](config-schema.md#web-retrieval) for the exact fields,
defaults, and registry constraint. See [MCP Servers](mcp-servers.md) for the server catalog;
this page only configures how SDLC refers to that user-owned capability.

## Safety boundary

Tool availability is not consent. Retrieved text is untrusted data, never instruction,
authority, or proof. Credentials belong in environment variables or the external provider's
configuration, not in `.harnessctl/config.yaml` or documentation examples.
