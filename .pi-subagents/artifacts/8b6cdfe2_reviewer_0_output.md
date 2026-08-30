## Review

- **Pass:** `.pi/mcp.json:12-20` adds `sdlc_code_index` with `command: "cgc"`, args `["mcp","start"]`, `lifecycle: "lazy"`, and `requestTimeoutMs: 30000`.
- **Pass:** Invalid fields `type`, `enabled`, and `timeout` are absent; no `url`/`socket` mixed into the stdio server.
- **Pass:** `sdlc_cvs_github` is unchanged versus `HEAD:.pi/mcp.json`.
- **Pass:** `cgc` resolves locally and `cgc mcp tools` lists MCP tools; I did not invoke provider mutation/index/watch/delete/reindex tools.
- **Evidence gap:** I did not independently reload/restart Pi or inspect live Pi MCP server status. The issue comment claims Pi MCP status lists `sdlc_code_index` and connect exposes 29 tools.
- **Note:** Working tree has unrelated untracked `.harnessctl/memory/*` and `.pi-subagents/*` artifacts; no staged files.
