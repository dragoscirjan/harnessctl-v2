import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      'memory_search',
      'memory_list',
      'memory_get',
      'memory_store',
      'memory_supersede',
      'memory_delete',
      'memory_validate',
      'memory_export',
      'memory_import',
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
    expect(hooks.tool?.['memory_store']?.args.summary).toBeDefined();
    expect(hooks.tool?.['memory_search']?.args.query).toBeDefined();
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

      const defaultTasksPath = await tools.config_get?.execute({ path: 'paths.tasks' }, context);
      await tools.config_create?.execute({}, context);
      const result = await tools.config_get?.execute({ path: 'version' }, context);
      const stored = await tools['memory_store']?.execute(
        {
          memory_type: 'semantic',
          record_type: 'fact',
          summary: 'OpenCode memory adapter delegates to repository storage.',
          source_kind: 'tool-observation',
          created_by: 'test',
          confidence: 'verified',
        },
        context,
      );
      const searched = await tools['memory_search']?.execute({ query: 'repository storage' }, context);
      const memoryValidation = await tools['memory_validate']?.execute({}, context);
      const issueId = await tools['issue_id']?.execute(
        { prompt: 'Please investigate issues hrn-00042 and hrn-00007' },
        context,
      );
      const issue = await tools['issue_create']?.execute(
        { type: 'task', title: 'Example task', metadata: '{"huge":9007199254740993}' },
        context,
      );
      await tools['issue_create']?.execute({ type: 'task', title: 'Related task' }, context);
      const issues = await tools['issue_list']?.execute({}, context);
      const fetched = await tools['issue_get']?.execute({ id: 'hrn-00001' }, context);
      const fetchedIssue = JSON.parse(String(fetched)) as { revision: string };
      const updated = await tools['issue_update']?.execute(
        { id: 'hrn-00001', title: 'Updated task', expectedRevision: fetchedIssue.revision },
        context,
      );
      const updatedIssue = JSON.parse(String(updated)) as { revision: string };
      const transitioned = await tools['issue_transition']?.execute(
        { id: 'hrn-00001', status: 'done', expectedRevision: updatedIssue.revision },
        context,
      );
      const comment = await tools['issue_comment']?.execute(
        { id: 'hrn-00001', body: 'Review this', author: 'tester' },
        context,
      );
      const related = await tools['issue_relate']?.execute(
        { id: 'hrn-00001', relationship: 'relates_to', targetId: 'hrn-00002' },
        context,
      );
      const unrelated = await tools['issue_unrelate']?.execute(
        { id: 'hrn-00001', relationship: 'relates_to', targetId: 'hrn-00002' },
        context,
      );
      mkdirSync(join(cwd, '.specs'));
      writeFileSync(join(cwd, '.specs', 'adapter.md'), '# Adapter\n');
      const linked = await tools['issue_link_document']?.execute(
        { id: 'hrn-00001', path: '.specs/adapter.md', kind: 'design' },
        context,
      );
      const validation = await tools['issue_validate']?.execute({}, context);
      const archive = await tools['issue_archive']?.execute({ id: 'hrn-00001' }, context);
      const createdIssue = JSON.parse(String(issue)) as { id: string; metadata: { metadata: { huge: number } } };

      expect(defaultTasksPath).toBe('".harnessctl/tasks"');
      expect(result).toBe('2');
      expect(JSON.parse(String(stored)).summary).toContain('repository storage');
      expect(JSON.parse(String(searched))).toEqual([
        expect.objectContaining({ record_type: 'fact', confidence: 'verified' }),
      ]);
      expect(JSON.parse(String(memoryValidation))).toEqual(
        expect.objectContaining({ valid: true, records: 1, tombstones: 0 }),
      );
      expect(issueId).toBe('["hrn-00042","hrn-00007"]');
      expect(createdIssue.metadata.metadata.huge).toBe(9_007_199_254_740_992);
      expect(Number.isFinite(createdIssue.metadata.metadata.huge)).toBe(true);
      expect(createdIssue.id).toBe('hrn-00001');
      expect(JSON.parse(String(issues))).toHaveLength(2);
      expect(JSON.parse(String(archive)).archived).toEqual(['hrn-00001']);
      expect(fetched).toContain('Example task');
      expect(updated).toContain('Updated task');
      expect(transitioned).toContain('"status":"done"');
      expect(comment).toContain('hrn-00001-C0001');
      expect(related).toContain('"relates_to":["hrn-00002"]');
      expect(unrelated).not.toContain('"relates_to"');
      expect(linked).toContain('.specs/adapter.md');
      expect(validation).toContain('"valid":true');
      const invalidIssue = await tools['issue_create']?.execute({ type: 'invalid', title: 'Invalid' }, context);
      expect(invalidIssue).toContain('Issue error: invalid type');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
