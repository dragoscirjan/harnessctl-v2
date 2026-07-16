import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import harnessctlTools from './index.js';

interface RegisteredTool {
  name: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
}

describe('Pi adapter', () => {
  it('registers the configuration tools', () => {
    const tools: RegisteredTool[] = [];
    harnessctlTools({
      registerTool(tool: unknown): void {
        tools.push(tool as RegisteredTool);
      },
    } as never);

    expect(tools.map((tool) => tool.name)).toEqual(['config_create', 'config_get', 'issue_id']);
    expect(tools[1]?.parameters).toBeDefined();
    expect(tools[2]?.parameters).toBeDefined();
  });

  it('delegates execution to the generic configuration tools', async () => {
    const tools: RegisteredTool[] = [];
    harnessctlTools({
      registerTool(tool: unknown): void {
        tools.push(tool as RegisteredTool);
      },
    } as never);
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-pi-'));
    try {
      const createTool = tools[0];
      const getTool = tools[1];

      await createTool?.execute('call-1', {}, undefined, undefined, { cwd });
      const result = await getTool?.execute('call-2', { path: 'version' }, undefined, undefined, { cwd });
      const issueId = await tools[2]?.execute(
        'call-2',
        { prompt: 'Please investigate issue 00042' },
        undefined,
        undefined,
        { cwd },
      );

      expect(result?.content[0]?.text).toBe('1');
      expect(issueId?.content[0]?.text).toBe('00042');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
