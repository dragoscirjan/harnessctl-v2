import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import harnessctlTools from './index.js';

interface RegisteredTool {
  name: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
}

function registeredTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  harnessctlTools({
    registerTool(tool: unknown): void {
      tools.push(tool as RegisteredTool);
    },
  } as never);
  return tools;
}

function toolNamed(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Expected registered tool: ${name}`);
  return tool;
}

function literalValues(tool: RegisteredTool, property: string): string[] {
  const parameters = tool.parameters as { properties?: Record<string, { anyOf?: Array<{ const?: string }> }> };
  return (parameters.properties?.[property]?.anyOf ?? [])
    .flatMap((variant) => (variant.const === undefined ? [] : [variant.const]))
    .sort();
}

describe('Pi adapter', () => {
  it('registers the configuration tools', () => {
    const tools = registeredTools();

    expect(tools.map((tool) => tool.name)).toEqual([
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
      'document_id',
      'document_create',
      'document_list',
      'document_get',
      'document_update',
      'document_version',
      'document_validate',
      'document_archive',
      'document_restore',
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
    expect(toolNamed(tools, 'config_get').parameters).toBeDefined();
    const kindValues = ['design-overview', 'gdd', 'hld', 'lld'];
    const statusValues = ['approved', 'draft', 'review'];
    for (const name of ['document_create', 'document_list', 'document_update', 'document_version']) {
      const documentTool = toolNamed(tools, name);
      expect(literalValues(documentTool, 'kind')).toEqual(kindValues);
      expect(literalValues(documentTool, 'status')).toEqual(statusValues);
    }
    expect(JSON.stringify(toolNamed(tools, 'document_list').parameters)).toContain('"const":"active"');
    expect(JSON.stringify(toolNamed(tools, 'document_list').parameters)).not.toContain('archived');
    expect(toolNamed(tools, 'memory_store').parameters).toBeDefined();
    expect(toolNamed(tools, 'issue_id').parameters).toBeDefined();
    const issueLinkSchema = JSON.stringify(toolNamed(tools, 'issue_link_document').parameters);
    expect(issueLinkSchema).toContain('fixed active .harnessctl/documents authority');
    expect(issueLinkSchema).not.toMatch(/\.specs|\.ai\.tmp/u);
  });

  it('delegates execution to the generic configuration tools', async () => {
    const tools = registeredTools();
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-pi-'));
    try {
      const createTool = toolNamed(tools, 'config_create');
      const getTool = toolNamed(tools, 'config_get');

      const defaultTasksPath = await getTool?.execute('call-0', { path: 'paths.tasks' }, undefined, undefined, { cwd });
      await createTool?.execute('call-1', {}, undefined, undefined, { cwd });
      const result = await getTool?.execute('call-2', { path: 'version' }, undefined, undefined, { cwd });
      const document = await toolNamed(tools, 'document_create').execute(
        'document-create',
        { title: 'Pi document', kind: 'hld', body: 'Adapter body.' },
        undefined,
        undefined,
        { cwd },
      );
      const createdDocument = JSON.parse(document.content[0]?.text ?? '') as { id: string; revision: string };
      const emptyMetadataDocument = await toolNamed(tools, 'document_create').execute(
        'document-create-empty-metadata',
        { title: 'Empty metadata', kind: 'design-overview', metadata: '' },
        undefined,
        undefined,
        { cwd },
      );
      const emptyMetadataRecord = JSON.parse(emptyMetadataDocument.content[0]?.text ?? '') as {
        metadata: { metadata?: Record<string, unknown> };
      };
      const documentVersion = await toolNamed(tools, 'document_version').execute(
        'document-version',
        { id: createdDocument.id, status: 'review', expectedRevision: createdDocument.revision },
        undefined,
        undefined,
        { cwd },
      );
      const currentDocument = JSON.parse(documentVersion.content[0]?.text ?? '') as {
        id: string;
        path: string;
        revision: string;
      };
      const restorable = await toolNamed(tools, 'document_create').execute(
        'call-document-create-restorable',
        { title: 'Restorable', kind: 'lld' },
        undefined,
        undefined,
        { cwd },
      );
      const restorableRecord = JSON.parse(restorable?.content[0]?.text ?? '') as { id: string; revision: string };
      const archivedRestorable = await toolNamed(tools, 'document_archive').execute(
        'call-document-archive-restorable',
        { id: restorableRecord.id, expectedRevision: restorableRecord.revision },
        undefined,
        undefined,
        { cwd },
      );
      const archivedRestorableRecord = JSON.parse(archivedRestorable?.content[0]?.text ?? '') as {
        documents: Array<{ revision: string }>;
      };
      const restoredDocument = await toolNamed(tools, 'document_restore').execute(
        'call-document-restore-restorable',
        {
          id: restorableRecord.id,
          expectedRevision: archivedRestorableRecord.documents.at(-1)?.revision ?? '',
        },
        undefined,
        undefined,
        { cwd },
      );
      const invalidDocumentLocations = await Promise.all(
        ['archived', 'ACTIVE', ' active ', 'Archive', '', 'x'.repeat(100_000)].map((location, index) =>
          toolNamed(tools, 'document_list').execute(
            `document-list-invalid-${String(index)}`,
            { location },
            undefined,
            undefined,
            { cwd },
          ),
        ),
      );
      const issueId = await toolNamed(tools, 'issue_id').execute(
        'call-2',
        { prompt: 'Please investigate issues hrn-00042 and hrn-00007' },
        undefined,
        undefined,
        { cwd },
      );
      const issue = await toolNamed(tools, 'issue_create').execute(
        'call-3',
        { type: 'task', title: 'Example task', metadata: '{"huge":9007199254740993}' },
        undefined,
        undefined,
        { cwd },
      );
      await toolNamed(tools, 'issue_create').execute(
        'call-3b',
        { type: 'task', title: 'Related task' },
        undefined,
        undefined,
        { cwd },
      );
      const issues = await toolNamed(tools, 'issue_list').execute('call-4', {}, undefined, undefined, { cwd });
      const fetched = await toolNamed(tools, 'issue_get').execute('call-7', { id: 'hrn-00001' }, undefined, undefined, {
        cwd,
      });
      const fetchedIssue = JSON.parse(fetched?.content[0]?.text ?? '') as { revision: string };
      const updated = await toolNamed(tools, 'issue_update').execute(
        'call-7b',
        { id: 'hrn-00001', title: 'Updated task', expectedRevision: fetchedIssue.revision },
        undefined,
        undefined,
        { cwd },
      );
      const updatedIssue = JSON.parse(updated.content[0]?.text ?? '') as { revision: string };
      const transitioned = await toolNamed(tools, 'issue_transition').execute(
        'call-8',
        { id: 'hrn-00001', status: 'done', expectedRevision: updatedIssue.revision },
        undefined,
        undefined,
        { cwd },
      );
      const related = await toolNamed(tools, 'issue_relate').execute(
        'call-9b',
        { id: 'hrn-00001', relationship: 'relates_to', targetId: 'hrn-00002' },
        undefined,
        undefined,
        { cwd },
      );
      const unrelated = await toolNamed(tools, 'issue_unrelate').execute(
        'call-9c',
        { id: 'hrn-00001', relationship: 'relates_to', targetId: 'hrn-00002' },
        undefined,
        undefined,
        { cwd },
      );
      const retiredSpecsLink = await toolNamed(tools, 'issue_link_document').execute(
        'call-9d',
        { id: 'hrn-00001', path: '.specs/adapter.md', kind: 'design' },
        undefined,
        undefined,
        { cwd },
      );
      const retiredDraftLink = await toolNamed(tools, 'issue_link_document').execute(
        'call-9d-draft',
        { id: 'hrn-00001', path: '.ai.tmp/draft.md' },
        undefined,
        undefined,
        { cwd },
      );
      const linkedDocument = await toolNamed(tools, 'issue_link_document').execute(
        'call-9e',
        { id: 'hrn-00001', path: currentDocument.path, kind: 'document' },
        undefined,
        undefined,
        { cwd },
      );
      const blockedDocumentUpdate = await toolNamed(tools, 'document_update').execute(
        'call-9f-update',
        { id: currentDocument.id, title: 'Renamed Pi document', expectedRevision: currentDocument.revision },
        undefined,
        undefined,
        { cwd },
      );
      const blockedDocumentArchive = await toolNamed(tools, 'document_archive').execute(
        'call-9f',
        { id: currentDocument.id, expectedRevision: currentDocument.revision },
        undefined,
        undefined,
        { cwd },
      );
      const issueAfterArchiveRejection = await toolNamed(tools, 'issue_get').execute(
        'call-9g',
        { id: 'hrn-00001' },
        undefined,
        undefined,
        { cwd },
      );
      const comment = await toolNamed(tools, 'issue_comment').execute(
        'call-9',
        { id: 'hrn-00001', body: 'Review this', author: 'tester' },
        undefined,
        undefined,
        { cwd },
      );
      const validation = await toolNamed(tools, 'issue_validate').execute('call-10', {}, undefined, undefined, { cwd });
      const archive = await toolNamed(tools, 'issue_archive').execute(
        'call-6',
        { id: 'hrn-00001' },
        undefined,
        undefined,
        {
          cwd,
        },
      );
      const createdIssue = JSON.parse(issue.content[0]?.text ?? '') as {
        id: string;
        metadata: { metadata: { huge: number } };
      };

      expect(defaultTasksPath?.content[0]?.text).toBe('".harnessctl/tasks"');
      expect(result?.content[0]?.text).toBe('1');
      expect(emptyMetadataRecord.metadata.metadata).toBeUndefined();
      expect(createdDocument.id).toBe('doc-00001');
      expect(documentVersion.content[0]?.text).toContain('"version":2');
      expect(restoredDocument?.content[0]?.text).toContain('"location":"active"');
      for (const result of invalidDocumentLocations)
        expect(result?.content[0]?.text).toContain(
          'Document error: invalid document location; expected active or archive',
        );
      expect(issueId?.content[0]?.text).toBe('["hrn-00042","hrn-00007"]');
      expect(createdIssue.metadata.metadata.huge).toBe(9_007_199_254_740_992);
      expect(Number.isFinite(createdIssue.metadata.metadata.huge)).toBe(true);
      expect(createdIssue.id).toBe('hrn-00001');
      expect(JSON.parse(issues?.content[0]?.text ?? '')).toHaveLength(2);
      expect(JSON.parse(archive?.content[0]?.text ?? '').archived).toEqual(['hrn-00001']);
      expect(blockedDocumentUpdate?.content[0]?.text).toMatch(/linked by canonical issue/u);
      expect(blockedDocumentArchive?.content[0]?.text).toMatch(/linked by canonical issue/u);
      expect(issueAfterArchiveRejection?.content[0]?.text).toContain(currentDocument.path);
      expect(tools.some((tool) => tool.name === 'issue_unlink_document')).toBe(false);
      expect(fetched?.content[0]?.text).toContain('Example task');
      expect(updated.content[0]?.text).toContain('Updated task');
      expect(transitioned?.content[0]?.text).toContain('"status":"done"');
      expect(comment?.content[0]?.text).toContain('hrn-00001-C0001');
      expect(related.content[0]?.text).toContain('"relates_to":["hrn-00002"]');
      expect(unrelated.content[0]?.text).not.toContain('"relates_to"');
      expect(retiredSpecsLink.content[0]?.text).toMatch(/structured \.specs and \.ai\.tmp links are retired/u);
      expect(retiredDraftLink.content[0]?.text).toMatch(/structured \.specs and \.ai\.tmp links are retired/u);
      expect(linkedDocument.content[0]?.text).toContain(currentDocument.path);
      expect(validation?.content[0]?.text).toContain('"valid":true');
      const invalidIssue = await toolNamed(tools, 'issue_create').execute(
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

  it('stores, searches, and validates repository memory', async () => {
    const tools = registeredTools();
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-pi-memory-'));

    try {
      await toolNamed(tools, 'config_create').execute('config', {}, undefined, undefined, { cwd });
      writeFileSync(join(cwd, '.harnessctl/config.yaml'), 'version: 1\nskills:\n  memory:\n    enabled: true\n');
      const stored = await toolNamed(tools, 'memory_store').execute(
        'store',
        {
          memory_type: 'semantic',
          record_type: 'fact',
          summary: 'Pi exposes repository memory tools.',
          source_kind: 'tool-observation',
          created_by: 'pi-test',
          confidence: 'verified',
          tags: 'pi, adapter',
        },
        undefined,
        undefined,
        { cwd },
      );
      const search = await toolNamed(tools, 'memory_search').execute(
        'search',
        { query: 'repository memory' },
        undefined,
        undefined,
        { cwd },
      );
      const validation = await toolNamed(tools, 'memory_validate').execute('validate', {}, undefined, undefined, {
        cwd,
      });

      expect(stored.content[0]?.text).toContain('Pi exposes repository memory tools.');
      expect(search.content[0]?.text).toContain('Pi exposes repository memory tools.');
      expect(validation.content[0]?.text).toContain('"valid":true');
      expect(validation.content[0]?.text).toContain(
        '"cache":{"outcome":"checked","evidence":"canonical_snapshot_match_verified"}',
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15_000);
});
