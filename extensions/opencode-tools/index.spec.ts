import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CustomToolsPlugin } from './index.js';

describe('OpenCode adapter', () => {
  it('registers the configuration tools', async () => {
    const hooks = await CustomToolsPlugin({} as never);

    expect(Object.keys(hooks.tool ?? {})).toEqual([
      'config_create',
      'config_get',
      'issue_id',
      'issue_create',
      'issue_list',
      'issue_get',
      'issue_update',
      'issue_transition',
      'issue_comment',
      'issue_relate',
      'issue_unrelate',
      'issue_link_document',
      'issue_validate',
      'issue_archive',
    ]);
    expect(hooks.tool?.config_get?.args.path).toBeDefined();
    expect(hooks.tool?.['issue_id']?.args.prompt).toBeDefined();
    expect(hooks.tool?.['issue_create']?.args.type).toBeDefined();
    expect(hooks.tool?.['issue_create']?.args.title).toBeDefined();
    expect(hooks.tool?.['issue_list']?.args.status).toBeDefined();
    expect(hooks.tool?.['issue_get']?.args.id).toBeDefined();
    expect(hooks.tool?.['issue_update']?.args.id).toBeDefined();
    expect(hooks.tool?.['issue_comment']?.args.body).toBeDefined();
    expect(hooks.tool?.['issue_relate']?.args.targetId).toBeDefined();
    expect(hooks.tool?.['issue_link_document']?.args.path).toBeDefined();
  });

  it('delegates execution to the generic configuration tools', async () => {
    const hooks = await CustomToolsPlugin({} as never);
    const tools = hooks.tool ?? {};
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-'));
    try {
      const context = { directory: cwd } as never;

      await tools.config_create?.execute({}, context);
      const result = await tools.config_get?.execute({ path: 'version' }, context);
      const issueId = await tools['issue_id']?.execute(
        { prompt: 'Please investigate issues 00042 and 00007' },
        context,
      );
      const issue = await tools['issue_create']?.execute({ type: 'task', title: 'Example task' }, context);
      const issues = await tools['issue_list']?.execute({}, context);
      const fetched = await tools['issue_get']?.execute({ id: '00001' }, context);
      const fetchedIssue = JSON.parse(String(fetched)) as { revision: string };
      const transitioned = await tools['issue_transition']?.execute(
        { id: '00001', status: 'done', expectedRevision: fetchedIssue.revision },
        context,
      );
      const comment = await tools['issue_comment']?.execute(
        { id: '00001', body: 'Review this', author: 'tester' },
        context,
      );
      const validation = await tools['issue_validate']?.execute({}, context);
      const archive = await tools['issue_archive']?.execute({ id: '00001' }, context);

      expect(result).toBe('1');
      expect(issueId).toBe('["00042","00007"]');
      expect(JSON.parse(String(issue)).id).toBe('00001');
      expect(JSON.parse(String(issues))).toEqual([
        expect.objectContaining({ id: '00001', type: 'task', status: 'open' }),
      ]);
      expect(JSON.parse(String(archive)).archived).toEqual(['00001']);
      expect(fetched).toContain('Example task');
      expect(transitioned).toContain('"status":"done"');
      expect(comment).toContain('00001-C0001');
      expect(validation).toContain('"valid":true');
      const invalidIssue = await tools['issue_create']?.execute({ type: 'invalid', title: 'Invalid' }, context);
      expect(invalidIssue).toContain('Issue error: invalid type');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
