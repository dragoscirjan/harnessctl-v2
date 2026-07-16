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

    expect(tools.map((tool) => tool.name)).toEqual([
      'config_create',
      'config_get',
      'issue_id',
      'issue_create',
      'issue_list',
      'issue_archive',
      'issue_get',
      'issue_update',
      'issue_transition',
      'issue_comment',
      'issue_relate',
      'issue_unrelate',
      'issue_link_document',
      'issue_validate',
    ]);
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
        { prompt: 'Please investigate issues 00042 and 00007' },
        undefined,
        undefined,
        { cwd },
      );
      const issue = await tools[3]?.execute('call-3', { type: 'task', title: 'Example task' }, undefined, undefined, {
        cwd,
      });
      const issues = await tools[4]?.execute('call-4', {}, undefined, undefined, { cwd });
      const fetched = await tools[6]?.execute('call-7', { id: '00001' }, undefined, undefined, { cwd });
      const transitioned = await tools[8]?.execute('call-8', { id: '00001', status: 'done' }, undefined, undefined, {
        cwd,
      });
      const comment = await tools[9]?.execute(
        'call-9',
        { id: '00001', body: 'Review this', author: 'tester' },
        undefined,
        undefined,
        { cwd },
      );
      const validation = await tools[13]?.execute('call-10', {}, undefined, undefined, { cwd });
      const archive = await tools[5]?.execute('call-6', { id: '00001' }, undefined, undefined, { cwd });

      expect(result?.content[0]?.text).toBe('1');
      expect(issueId?.content[0]?.text).toBe('["00042","00007"]');
      expect(JSON.parse(issue?.content[0]?.text ?? '').id).toBe('00001');
      expect(JSON.parse(issues?.content[0]?.text ?? '')).toEqual([
        expect.objectContaining({ id: '00001', type: 'task', status: 'open' }),
      ]);
      expect(JSON.parse(archive?.content[0]?.text ?? '').archived).toEqual(['00001']);
      expect(fetched?.content[0]?.text).toContain('Example task');
      expect(transitioned?.content[0]?.text).toContain('"status":"done"');
      expect(comment?.content[0]?.text).toContain('00001-C0001');
      expect(validation?.content[0]?.text).toContain('"valid":true');
      const invalidIssue = await tools[3]?.execute(
        'call-5',
        { type: 'invalid', title: 'Invalid' },
        undefined,
        undefined,
        { cwd },
      );
      expect(invalidIssue?.content[0]?.text).toContain('Issue error: invalid type');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
