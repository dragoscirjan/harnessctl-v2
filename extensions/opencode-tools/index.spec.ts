import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      'document_id',
      'document_create',
      'document_list',
      'document_get',
      'document_update',
      'document_version',
      'document_validate',
      'document_archive',
      'document_restore',
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
    expect(hooks.tool?.['document_create']?.args.title).toBeDefined();
    const enumCases = [
      ['document_create', 'kind', ['hld', 'lld', 'design-overview', 'gdd'], ['task', 'draft', 'document']],
      ['document_create', 'status', ['draft', 'review', 'approved'], ['active', 'archived', 'unknown']],
      ['document_list', 'kind', ['hld', 'lld', 'design-overview', 'gdd'], ['task', 'draft', 'document']],
      ['document_list', 'status', ['draft', 'review', 'approved'], ['active', 'archived', 'unknown']],
      ['document_update', 'kind', ['hld', 'lld', 'design-overview', 'gdd'], ['task', 'draft', 'document']],
      ['document_update', 'status', ['draft', 'review', 'approved'], ['active', 'archived', 'unknown']],
      ['document_version', 'kind', ['hld', 'lld', 'design-overview', 'gdd'], ['task', 'draft', 'document']],
      ['document_version', 'status', ['draft', 'review', 'approved'], ['active', 'archived', 'unknown']],
    ] as const;
    for (const [toolName, field, accepted, rejected] of enumCases) {
      const valueSchema = hooks.tool?.[toolName]?.args[field] as
        { safeParse(input: unknown): { success: boolean } } | undefined;
      for (const value of accepted) expect(valueSchema?.safeParse(value).success).toBe(true);
      for (const value of rejected) expect(valueSchema?.safeParse(value).success).toBe(false);
    }
    const locationSchema = hooks.tool?.['document_list']?.args.location as
      { safeParse(input: unknown): { success: boolean } } | undefined;
    expect(locationSchema?.safeParse('active').success).toBe(true);
    expect(locationSchema?.safeParse('archived').success).toBe(false);
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
    const issueLinkPathSchema = hooks.tool?.['issue_link_document']?.args.path as { description?: string } | undefined;
    expect(issueLinkPathSchema?.description).toContain('fixed active .harnessctl/documents authority');
    expect(issueLinkPathSchema?.description).not.toMatch(/\.specs|\.ai\.tmp/u);
  });

  it('delegates execution to the generic configuration tools', async () => {
    const hooks = await CustomToolsPlugin({} as never);
    const tools = hooks.tool ?? {};
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-'));
    try {
      const context = { directory: cwd } as never;

      const defaultTasksPath = await tools.config_get?.execute({ path: 'paths.tasks' }, context);
      await tools.config_create?.execute({}, context);
      writeFileSync(join(cwd, '.harnessctl/config.yaml'), 'version: 1\nskills:\n  memory:\n    enabled: true\n');
      const result = await tools.config_get?.execute({ path: 'version' }, context);
      const document = await tools['document_create']?.execute(
        { title: 'Adapter document', kind: 'hld', body: 'Adapter body.' },
        context,
      );
      const createdDocument = JSON.parse(String(document)) as { id: string; revision: string };
      const emptyMetadataDocument = JSON.parse(
        String(
          await tools['document_create']?.execute(
            { title: 'Empty metadata', kind: 'design-overview', metadata: '' },
            context,
          ),
        ),
      ) as { metadata: { metadata?: Record<string, unknown> } };
      const versionedDocument = await tools['document_version']?.execute(
        { id: createdDocument.id, status: 'review', expectedRevision: createdDocument.revision },
        context,
      );
      const currentDocument = JSON.parse(String(versionedDocument)) as { id: string; path: string; revision: string };
      const restorable = JSON.parse(
        String(await tools['document_create']?.execute({ title: 'Restorable', kind: 'lld' }, context)),
      ) as { id: string; revision: string };
      const archivedRestorable = JSON.parse(
        String(
          await tools['document_archive']?.execute(
            { id: restorable.id, expectedRevision: restorable.revision },
            context,
          ),
        ),
      ) as { documents: Array<{ revision: string }> };
      const restoredDocument = await tools['document_restore']?.execute(
        { id: restorable.id, expectedRevision: archivedRestorable.documents.at(-1)?.revision ?? '' },
        context,
      );
      const invalidDocumentLocations = await Promise.all(
        ['archived', 'ACTIVE', ' active ', 'Archive', '', 'x'.repeat(100_000)].map((location) =>
          tools['document_list']?.execute({ location: location as never }, context),
        ),
      );
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
      const createdIssue = JSON.parse(String(issue)) as { id: string; metadata: { metadata: { huge: number } } };
      const relatedIssue = JSON.parse(
        String(await tools['issue_create']?.execute({ type: 'task', title: 'Related task' }, context)),
      ) as { id: string };
      const issues = await tools['issue_list']?.execute({}, context);
      const fetched = await tools['issue_get']?.execute({ id: createdIssue.id }, context);
      const fetchedIssue = JSON.parse(String(fetched)) as { revision: string };
      const updated = await tools['issue_update']?.execute(
        { id: createdIssue.id, title: 'Updated task', expectedRevision: fetchedIssue.revision },
        context,
      );
      const updatedIssue = JSON.parse(String(updated)) as { revision: string };
      const transitioned = await tools['issue_transition']?.execute(
        { id: createdIssue.id, status: 'done', expectedRevision: updatedIssue.revision },
        context,
      );
      const comment = await tools['issue_comment']?.execute(
        { id: createdIssue.id, body: 'Review this', author: 'tester' },
        context,
      );
      const related = await tools['issue_relate']?.execute(
        { id: createdIssue.id, relationship: 'relates_to', targetId: relatedIssue.id },
        context,
      );
      const unrelated = await tools['issue_unrelate']?.execute(
        { id: createdIssue.id, relationship: 'relates_to', targetId: relatedIssue.id },
        context,
      );
      const retiredSpecsLink = await tools['issue_link_document']?.execute(
        { id: createdIssue.id, path: '.specs/adapter.md', kind: 'design' },
        context,
      );
      const retiredDraftLink = await tools['issue_link_document']?.execute(
        { id: createdIssue.id, path: '.ai.tmp/draft.md' },
        context,
      );
      const linkedDocument = await tools['issue_link_document']?.execute(
        { id: createdIssue.id, path: currentDocument.path, kind: 'document' },
        context,
      );
      const blockedDocumentUpdate = await tools['document_update']?.execute(
        { id: currentDocument.id, title: 'Renamed adapter document', expectedRevision: currentDocument.revision },
        context,
      );
      const blockedDocumentArchive = await tools['document_archive']?.execute(
        { id: currentDocument.id, expectedRevision: currentDocument.revision },
        context,
      );
      const issueAfterArchiveRejection = await tools['issue_get']?.execute({ id: createdIssue.id }, context);
      const validation = await tools['issue_validate']?.execute({}, context);
      const archive = await tools['issue_archive']?.execute({ id: createdIssue.id }, context);

      expect(defaultTasksPath).toBe('".harnessctl/tasks"');
      expect(result).toBe('1');
      expect(createdDocument.id).toMatch(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u);
      expect(emptyMetadataDocument.metadata.metadata).toBeUndefined();
      expect(versionedDocument).toContain('"version":2');
      expect(restoredDocument).toContain('"location":"active"');
      for (const result of invalidDocumentLocations)
        expect(result).toContain('Document error: invalid document location; expected active or archive');
      expect(JSON.parse(String(stored)).summary).toContain('repository storage');
      expect(JSON.parse(String(searched))).toEqual([
        expect.objectContaining({ record_type: 'fact', confidence: 'verified' }),
      ]);
      expect(JSON.parse(String(memoryValidation))).toEqual(
        expect.objectContaining({
          valid: true,
          records: 1,
          tombstones: 0,
          cache: { outcome: 'checked', evidence: 'canonical_snapshot_match_verified' },
        }),
      );
      expect(issueId).toBe('["hrn-00042","hrn-00007"]');
      expect(createdIssue.metadata.metadata.huge).toBe(9_007_199_254_740_992);
      expect(Number.isFinite(createdIssue.metadata.metadata.huge)).toBe(true);
      expect(createdIssue.id).toMatch(/^hrn-[0-9A-HJKMNP-TV-Z]{26}$/u);
      expect(JSON.parse(String(issues))).toHaveLength(2);
      expect(JSON.parse(String(archive)).archived).toEqual([createdIssue.id]);
      expect(fetched).toContain('Example task');
      expect(updated).toContain('Updated task');
      expect(transitioned).toContain('"status":"done"');
      expect(comment).toContain(`${createdIssue.id}-C0001`);
      expect(related).toContain(`"relates_to":["${relatedIssue.id}"]`);
      expect(unrelated).not.toContain('"relates_to"');
      expect(retiredSpecsLink).toMatch(/structured \.specs and \.ai\.tmp links are retired/u);
      expect(retiredDraftLink).toMatch(/structured \.specs and \.ai\.tmp links are retired/u);
      expect(linkedDocument).toContain(currentDocument.path);
      expect(blockedDocumentUpdate).toMatch(/linked by canonical issue/u);
      expect(blockedDocumentArchive).toMatch(/linked by canonical issue/u);
      expect(issueAfterArchiveRejection).toContain(currentDocument.path);
      expect(tools['issue_unlink_document']).toBeUndefined();
      expect(validation).toContain('"valid":true');
      const invalidIssue = await tools['issue_create']?.execute({ type: 'invalid', title: 'Invalid' }, context);
      expect(invalidIssue).toContain('Issue error: invalid type');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
