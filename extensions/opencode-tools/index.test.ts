import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CustomToolsPlugin } from './index.js';

describe('OpenCode adapter', () => {
  it('registers the configuration tools', async () => {
    const hooks = await CustomToolsPlugin({} as never);

    expect(Object.keys(hooks.tool ?? {})).toEqual(['config_create', 'config_get', 'issue-id']);
    expect(hooks.tool?.config_get?.args.path).toBeDefined();
    expect(hooks.tool?.['issue-id']?.args.prompt).toBeDefined();
  });

  it('delegates execution to the generic configuration tools', async () => {
    const hooks = await CustomToolsPlugin({} as never);
    const tools = hooks.tool ?? {};
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-'));
    try {
      const context = { directory: cwd } as never;

      await tools.config_create?.execute({}, context);
      const result = await tools.config_get?.execute({ path: 'version' }, context);
      const issueId = await tools['issue-id']?.execute({ prompt: 'Please investigate issue 00042' }, context);

      expect(result).toBe('1');
      expect(issueId).toBe('00042');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
