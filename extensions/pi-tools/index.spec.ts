import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutionContextProvider } from '@harnessctl/generic-tools';
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
    on(): void {},
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
  it('supports the installed host capability contract', () => {
    const tools: RegisteredTool[] = [];
    const handlers = new Map<string, unknown>();
    harnessctlTools({
      registerTool(tool: unknown): void {
        tools.push(tool as RegisteredTool);
      },
      on(event: string, handler: unknown): void {
        handlers.set(event, handler);
      },
    } as never);
    expect(tools.some((tool) => tool.name === 'read')).toBe(true);
    expect(handlers.has('session_start')).toBe(true);
    expect(handlers.has('session_compact')).toBe(true);
    expect(handlers.has('tool_call')).toBe(true);
  });

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
      'workspace_ensure',
      'workspace_status',
      'workspace_mark_cleanup_ready',
      'workspace_cleanup',
      'workspace_session_allocate',
      'workspace_session_attach_epic',
      'workspace_session_adopt',
      'workspace_session_bind',
      'workspace_session_status',
      'workspace_session_release',
      'operation_prepare',
      'operation_execute',
      'operation_prepare_command',
      'operation_execute_command',
      'read',
      'write',
      'edit',
      'grep',
      'find',
      'ls',
      'bash',
    ]);
    expect(tools.every((tool) => (tool.parameters as { type?: string }).type === 'object')).toBe(true);
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
    for (const name of ['workspace_ensure', 'workspace_status', 'workspace_mark_cleanup_ready', 'workspace_cleanup'])
      expect(JSON.stringify(toolNamed(tools, name).parameters)).toContain('epic_id');
    expect(JSON.stringify(toolNamed(tools, 'workspace_session_status').parameters)).toContain(
      'expected_binding_generation',
    );
    expect(JSON.stringify(toolNamed(tools, 'operation_prepare').parameters)).toContain('operation_id');
    expect(JSON.stringify(toolNamed(tools, 'operation_prepare_command').parameters)).toContain('argv');
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
      const createdIssue = JSON.parse(issue.content[0]?.text ?? '') as {
        id: string;
        metadata: { metadata: { huge: number } };
      };
      const relatedIssueResult = await toolNamed(tools, 'issue_create').execute(
        'call-3b',
        { type: 'task', title: 'Related task' },
        undefined,
        undefined,
        { cwd },
      );
      const relatedIssue = JSON.parse(relatedIssueResult.content[0]?.text ?? '') as { id: string };
      const issues = await toolNamed(tools, 'issue_list').execute('call-4', {}, undefined, undefined, { cwd });
      const fetched = await toolNamed(tools, 'issue_get').execute(
        'call-7',
        { id: createdIssue.id },
        undefined,
        undefined,
        { cwd },
      );
      const fetchedIssue = JSON.parse(fetched?.content[0]?.text ?? '') as { revision: string };
      const updated = await toolNamed(tools, 'issue_update').execute(
        'call-7b',
        { id: createdIssue.id, title: 'Updated task', expectedRevision: fetchedIssue.revision },
        undefined,
        undefined,
        { cwd },
      );
      const updatedIssue = JSON.parse(updated.content[0]?.text ?? '') as { revision: string };
      const transitioned = await toolNamed(tools, 'issue_transition').execute(
        'call-8',
        { id: createdIssue.id, status: 'done', expectedRevision: updatedIssue.revision },
        undefined,
        undefined,
        { cwd },
      );
      const related = await toolNamed(tools, 'issue_relate').execute(
        'call-9b',
        { id: createdIssue.id, relationship: 'relates_to', targetId: relatedIssue.id },
        undefined,
        undefined,
        { cwd },
      );
      const unrelated = await toolNamed(tools, 'issue_unrelate').execute(
        'call-9c',
        { id: createdIssue.id, relationship: 'relates_to', targetId: relatedIssue.id },
        undefined,
        undefined,
        { cwd },
      );
      const retiredSpecsLink = await toolNamed(tools, 'issue_link_document').execute(
        'call-9d',
        { id: createdIssue.id, path: '.specs/adapter.md', kind: 'design' },
        undefined,
        undefined,
        { cwd },
      );
      const retiredDraftLink = await toolNamed(tools, 'issue_link_document').execute(
        'call-9d-draft',
        { id: createdIssue.id, path: '.ai.tmp/draft.md' },
        undefined,
        undefined,
        { cwd },
      );
      const linkedDocument = await toolNamed(tools, 'issue_link_document').execute(
        'call-9e',
        { id: createdIssue.id, path: currentDocument.path, kind: 'document' },
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
        { id: createdIssue.id },
        undefined,
        undefined,
        { cwd },
      );
      const comment = await toolNamed(tools, 'issue_comment').execute(
        'call-9',
        { id: createdIssue.id, body: 'Review this', author: 'tester' },
        undefined,
        undefined,
        { cwd },
      );
      const validation = await toolNamed(tools, 'issue_validate').execute('call-10', {}, undefined, undefined, { cwd });
      const archive = await toolNamed(tools, 'issue_archive').execute(
        'call-6',
        { id: createdIssue.id },
        undefined,
        undefined,
        {
          cwd,
        },
      );
      const workspaceStatus = await toolNamed(tools, 'workspace_status').execute(
        'workspace-status',
        { epic_id: createdIssue.id },
        undefined,
        undefined,
        { cwd },
      );
      expect(defaultTasksPath?.content[0]?.text).toBe('".harnessctl/tasks"');
      expect(result?.content[0]?.text).toBe('1');
      expect(emptyMetadataRecord.metadata.metadata).toBeUndefined();
      expect(createdDocument.id).toMatch(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u);
      expect(documentVersion.content[0]?.text).toContain('"version":2');
      expect(restoredDocument?.content[0]?.text).toContain('"location":"active"');
      for (const result of invalidDocumentLocations)
        expect(result?.content[0]?.text).toContain(
          'Document error: invalid document location; expected active or archive',
        );
      expect(issueId?.content[0]?.text).toBe('["hrn-00042","hrn-00007"]');
      expect(createdIssue.metadata.metadata.huge).toBe(9_007_199_254_740_992);
      expect(Number.isFinite(createdIssue.metadata.metadata.huge)).toBe(true);
      expect(createdIssue.id).toMatch(/^hrn-[0-9A-HJKMNP-TV-Z]{26}$/u);
      expect(JSON.parse(issues?.content[0]?.text ?? '')).toHaveLength(2);
      expect(JSON.parse(archive?.content[0]?.text ?? '').archived).toEqual([createdIssue.id]);
      expect(blockedDocumentUpdate?.content[0]?.text).toMatch(/linked by canonical issue/u);
      expect(blockedDocumentArchive?.content[0]?.text).toMatch(/linked by canonical issue/u);
      expect(workspaceStatus.content[0]?.text).toMatch(/^Workspace error:/u);
      expect(issueAfterArchiveRejection?.content[0]?.text).toContain(currentDocument.path);
      expect(tools.some((tool) => tool.name === 'issue_unlink_document')).toBe(false);
      expect(fetched?.content[0]?.text).toContain('Example task');
      expect(updated.content[0]?.text).toContain('Updated task');
      expect(transitioned?.content[0]?.text).toContain('"status":"done"');
      expect(comment?.content[0]?.text).toContain(`${createdIssue.id}-C0001`);
      expect(related.content[0]?.text).toContain(`"relates_to":["${relatedIssue.id}"]`);
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

  it('routes bound sessions while Pi remains in primary', async () => {
    const tools: RegisteredTool[] = [];
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const entries: Array<{ type: string; data: unknown }> = [];
    harnessctlTools({
      registerTool(tool: unknown): void {
        tools.push(tool as RegisteredTool);
      },
      on(event: string, handler: (...args: unknown[]) => unknown): void {
        handlers.set(event, handler);
      },
      appendEntry(type: string, data: unknown): void {
        entries.push({ type, data });
      },
    } as never);

    const container = mkdtempSync(join(tmpdir(), 'harnessctl-pi-routing-'));
    const primary = join(container, 'primary');
    mkdirSync(primary);
    try {
      git(primary, 'init', '--initial-branch=main');
      git(primary, 'config', 'user.name', 'Harnessctl Test');
      git(primary, 'config', 'user.email', 'test@example.invalid');
      mkdirSync(join(primary, '.harnessctl'), { recursive: true });
      writeFileSync(
        join(primary, '.harnessctl', 'config.yaml'),
        'version: 1\nskills:\n  cvs:\n    workspaces: true\n  memory:\n    enabled: true\n',
      );
      git(primary, 'add', '.harnessctl/config.yaml');
      git(primary, 'commit', '-m', 'Configure routing');

      const sessionId = 'pi-session';
      const context = {
        cwd: primary,
        sessionManager: { getSessionId: () => sessionId },
      } as never;
      await handlers.get('session_start')?.({ type: 'session_start', reason: 'startup' }, context);
      const allocation = await toolNamed(tools, 'workspace_session_allocate').execute(
        'workspace-session-allocate',
        {},
        undefined,
        undefined,
        context,
      );
      const bound = JSON.parse(allocation.content[0]?.text ?? '') as {
        workspace_id: string;
        execution_root: string;
        binding_generation: number;
      };
      mkdirSync(join(bound.execution_root, '.harnessctl', 'issues'), { recursive: true });
      writeFileSync(join(bound.execution_root, 'workspace.txt'), 'workspace content\n');

      expect(entries).toEqual([
        {
          type: 'harnessctl.workspace-binding',
          data: {
            schema_version: 1,
            status: 'unbound',
            reason: 'host session has no execution workspace binding',
          },
        },
        {
          type: 'harnessctl.workspace-binding',
          data: {
            schema_version: 1,
            repository_id: expect.any(String),
            workspace_id: bound.workspace_id,
            epic_id: null,
            generation: bound.binding_generation,
          },
        },
      ]);

      const issueResult = await toolNamed(tools, 'issue_create').execute(
        'issue-create',
        { type: 'task', title: 'Workspace-local Pi issue' },
        undefined,
        undefined,
        context,
      );
      const issue = JSON.parse(issueResult.content[0]?.text ?? '') as { id: string };
      expect(existsSync(join(primary, '.harnessctl', 'issues'))).toBe(false);
      expect(
        (await toolNamed(tools, 'issue_get').execute('issue-get', { id: issue.id }, undefined, undefined, context))
          .content[0]?.text,
      ).toContain('Workspace-local Pi issue');
      expect(
        (
          await toolNamed(tools, 'workspace_session_status').execute(
            'workspace-session-status',
            {},
            undefined,
            undefined,
            context,
          )
        ).content[0]?.text,
      ).toContain(bound.workspace_id);

      const routedRead = { type: 'tool_call', toolCallId: 'read', toolName: 'read', input: { path: 'workspace.txt' } };
      expect(await handlers.get('tool_call')?.(routedRead, context)).toBeUndefined();
      expect(routedRead.input.path).toBe(join(bound.execution_root, 'workspace.txt'));
      const readResult = await toolNamed(tools, 'read').execute(
        'read',
        routedRead.input,
        undefined,
        undefined,
        context,
      );
      expect(readResult.content[0]?.text).toContain('workspace content');

      const primaryRead = {
        type: 'tool_call',
        toolCallId: 'primary-read',
        toolName: 'read',
        input: { path: join(primary, 'README.md') },
      };
      expect(await handlers.get('tool_call')?.(primaryRead, context)).toMatchObject({ block: true });
      expect(
        await handlers.get('tool_call')?.(
          { type: 'tool_call', toolCallId: 'bash', toolName: 'bash', input: { command: 'pwd' } },
          context,
        ),
      ).toMatchObject({ block: true });
      expect(
        await handlers.get('tool_call')?.(
          { type: 'tool_call', toolCallId: 'external', toolName: 'external', input: {} },
          context,
        ),
      ).toMatchObject({ block: true });
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  });

  it('records an enabled unbound session without crashing startup', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const entries: Array<{ type: string; data: unknown }> = [];
    harnessctlTools({
      registerTool(): void {},
      on(event: string, handler: (...args: unknown[]) => unknown): void {
        handlers.set(event, handler);
      },
      appendEntry(type: string, data: unknown): void {
        entries.push({ type, data });
      },
    } as never);

    const container = mkdtempSync(join(tmpdir(), 'harnessctl-pi-unbound-'));
    const primary = join(container, 'primary');
    mkdirSync(primary);
    try {
      git(primary, 'init', '--initial-branch=main');
      git(primary, 'config', 'user.name', 'Harnessctl Test');
      git(primary, 'config', 'user.email', 'test@example.invalid');
      mkdirSync(join(primary, '.harnessctl'), { recursive: true });
      writeFileSync(join(primary, '.harnessctl', 'config.yaml'), 'version: 1\nskills:\n  cvs:\n    workspaces: true\n');
      git(primary, 'add', '.harnessctl/config.yaml');
      git(primary, 'commit', '-m', 'Configure routing');

      const context = {
        cwd: primary,
        sessionManager: { getSessionId: () => 'unbound-session' },
      } as never;

      expect(() =>
        handlers.get('session_start')?.({ type: 'session_start', reason: 'startup' }, context),
      ).not.toThrow();
      expect(
        handlers.get('tool_call')?.(
          {
            type: 'tool_call',
            toolCallId: 'workspace-status',
            toolName: 'workspace_status',
            input: { epic_id: 'hrn-00009' },
          },
          context,
        ),
      ).toBeUndefined();
      expect(entries).toEqual([
        {
          type: 'harnessctl.workspace-binding',
          data: {
            schema_version: 1,
            status: 'unbound',
            reason: 'host session has no execution workspace binding',
          },
        },
      ]);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  });

  it('recovers two isolated sessions with authorities, files, and tasks in a fresh process', () => {
    const container = mkdtempSync(join(tmpdir(), 'harnessctl-pi-restart-'));
    const primary = join(container, 'primary');
    mkdirSync(primary);
    try {
      git(primary, 'init', '--initial-branch=main');
      git(primary, 'config', 'user.name', 'Harnessctl Test');
      git(primary, 'config', 'user.email', 'test@example.invalid');
      mkdirSync(join(primary, '.harnessctl'), { recursive: true });
      writeFileSync(
        join(primary, '.harnessctl', 'config.yaml'),
        'version: 1\nskills:\n  cvs:\n    workspaces: true\n  memory:\n    enabled: true\nautomation:\n  runner: npm\n  tasks:\n    repository.test: workspace-task\n    bootstrap.install: workspace-bootstrap\n',
      );
      writeFileSync(
        join(primary, 'package.json'),
        `${JSON.stringify({
          scripts: {
            'workspace-task': "node -e \"require('node:fs').writeFileSync('task-marker.txt',process.cwd())\"",
            'workspace-bootstrap': "node -e \"require('node:fs').writeFileSync('bootstrap-marker.txt',process.cwd())\"",
          },
        })}\n`,
      );
      git(primary, 'add', '.harnessctl/config.yaml', 'package.json');
      git(primary, 'commit', '-m', 'Configure routing');

      const sessions = ['restart-session-a', 'restart-session-b'];
      const provider = createExecutionContextProvider(primary);
      const allocated = sessions.map((session) => provider.allocateProvisional('pi', session));
      const adapterUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'index.ts')).href;
      const tsxLoader = createRequire(import.meta.url).resolve('tsx');
      const output = execFileSync(
        process.execPath,
        [
          '--import',
          tsxLoader,
          '--input-type=module',
          '--eval',
          PI_FRESH_PROCESS_SCRIPT,
          primary,
          adapterUrl,
          ...sessions,
        ],
        { cwd: primary, encoding: 'utf8' },
      );
      const { recovered, lifecycle } = JSON.parse(output) as {
        recovered: Array<{
          workspace_id: string;
          issue_id: string;
          document_id: string;
          task_outcome: string;
          task_exit_code: number;
          bootstrap_outcome: string;
          recovery_generation: number;
          source_read: boolean;
          checkpoint_written: boolean;
          artifact_written: boolean;
        }>;
        lifecycle: Array<{
          workspace_id: string;
          reasons: string[];
          generations: number[];
        }>;
      };

      expect(recovered).toHaveLength(2);
      for (const [index, result] of recovered.entries()) {
        expect(result.workspace_id).toBe(allocated[index]?.workspace_id);
        expect(result.issue_id).toMatch(/^hrn-[0-9A-HJKMNP-TV-Z]{26}$/u);
        expect(result.document_id).toMatch(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u);
        expect(result.task_outcome).toBe('succeeded');
        expect(result.task_exit_code).toBe(0);
        expect(result.bootstrap_outcome).toBe('succeeded');
        expect(result.recovery_generation).toBe(allocated[index]?.binding_generation);
        expect(result.source_read).toBe(true);
        expect(result.checkpoint_written).toBe(true);
        expect(result.artifact_written).toBe(true);
        expect(existsSync(join(allocated[index]?.execution_root ?? '', 'session.txt'))).toBe(true);
        expect(
          existsSync(join(allocated[index]?.execution_root ?? '', '.harnessctl', 'checkpoints', 'session.txt')),
        ).toBe(true);
        expect(
          existsSync(join(allocated[index]?.execution_root ?? '', '.harnessctl', 'artifacts', 'session.txt')),
        ).toBe(true);
        expect(existsSync(join(allocated[index]?.execution_root ?? '', 'task-marker.txt'))).toBe(true);
        expect(existsSync(join(allocated[index]?.execution_root ?? '', 'bootstrap-marker.txt'))).toBe(true);
      }
      expect(lifecycle).toHaveLength(2);
      for (const result of lifecycle) {
        const allocation = allocated.find((candidate) => candidate.workspace_id === result.workspace_id);
        expect(result.reasons).toEqual(['reload', 'fork', 'compact']);
        expect(result.generations).toEqual([
          allocation?.binding_generation,
          allocation?.binding_generation,
          allocation?.binding_generation,
        ]);
      }
      expect(existsSync(join(primary, '.harnessctl', 'issues'))).toBe(false);
      expect(existsSync(join(primary, '.harnessctl', 'documents'))).toBe(false);
      expect(existsSync(join(primary, '.harnessctl', 'memory'))).toBe(false);
      expect(existsSync(join(primary, 'session.txt'))).toBe(false);
      expect(existsSync(join(primary, 'task-marker.txt'))).toBe(false);
      expect(existsSync(join(primary, 'bootstrap-marker.txt'))).toBe(false);
      expect(git(primary, 'status', '--porcelain')).toBe('');
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  it('fails closed when required Pi capabilities are unavailable', () => {
    expect(() => harnessctlTools({ registerTool(): void {} } as never)).toThrow(
      /missing required extension capabilities/u,
    );

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    harnessctlTools({
      registerTool(): void {},
      on(event: string, handler: (...args: unknown[]) => unknown): void {
        handlers.set(event, handler);
      },
      appendEntry(): void {},
    } as never);
    expect(() =>
      handlers.get('session_start')?.({ type: 'session_start', reason: 'startup' }, { cwd: process.cwd() }),
    ).toThrow(/missing required session capability/u);
  });
});

const PI_FRESH_PROCESS_SCRIPT = `
const [primary, adapterUrl, ...sessions] = process.argv.slice(1);
const { default: register } = await import(adapterUrl);
const { mkdirSync } = await import('node:fs');
const results = [];
const lifecycle = [];
const tools = new Map();
const handlers = new Map();
const entries = [];
let activeSessionId = sessions[0];
register({
  registerTool(tool) { tools.set(tool.name, tool); },
  on(event, handler) { handlers.set(event, handler); },
  appendEntry(type, data) { entries.push({ type, data }); },
});
const context = { cwd: primary, sessionManager: { getSessionId: () => activeSessionId } };
for (const [index, sessionId] of sessions.entries()) {
  activeSessionId = sessionId;
  await handlers.get('session_start')({
    type: 'session_start',
    reason: index === 0 ? 'startup' : 'resume',
    previousSessionFile: index === 0 ? undefined : "/tmp/pi-session-previous.jsonl",
  }, context);
  const execute = async (name, params) => {
    const result = await tools.get(name).execute(name, params, undefined, undefined, context);
    return result.content[0].text;
  };
  const issue = JSON.parse(await execute('issue_create', { type: 'task', title: \`Pi session \${index + 1}\` }));
  const document = JSON.parse(await execute('document_create', { title: \`Pi document \${index + 1}\`, kind: 'lld' }));
  await execute('memory_store', {
    memory_type: 'episodic', record_type: 'event', summary: \`Pi memory \${index + 1}\`,
    source_kind: 'artifact', created_by: 'test', confidence: 'verified'
  });
  const status = JSON.parse(await execute('workspace_session_status', {}));
  mkdirSync(new URL('.harnessctl/checkpoints/', new URL('file://' + status.execution_root + '/')), { recursive: true });
  mkdirSync(new URL('.harnessctl/artifacts/', new URL('file://' + status.execution_root + '/')), { recursive: true });
  const source = await execute('read', { path: 'package.json' });
  await execute('write', { path: 'session.txt', content: \`session \${index + 1}\\n\` });
  await execute('write', { path: '.harnessctl/checkpoints/session.txt', content: \`checkpoint \${index + 1}\\n\` });
  await execute('write', { path: '.harnessctl/artifacts/session.txt', content: \`artifact \${index + 1}\\n\` });
  const descriptor = JSON.parse(await execute('operation_prepare', { operation_id: 'repository.test' }));
  const evidence = JSON.parse(await execute('operation_execute', {
    operation_id: 'repository.test', consent_digest: descriptor.digest
  }));
  const bootstrapDescriptor = JSON.parse(await execute('operation_prepare', { operation_id: 'bootstrap.install' }));
  const bootstrapEvidence = JSON.parse(await execute('operation_execute', {
    operation_id: 'bootstrap.install', consent_digest: bootstrapDescriptor.digest
  }));
  const recovery = entries.at(-1).data;
  results.push({
    workspace_id: status.workspace_id,
    issue_id: issue.id,
    document_id: document.id,
    task_outcome: evidence.outcome,
    task_exit_code: evidence.exit_code,
    bootstrap_outcome: bootstrapEvidence.outcome,
    recovery_generation: recovery.generation,
    source_read: source.includes('workspace-task'),
    checkpoint_written: true,
    artifact_written: true,
  });
}
for (const sessionId of [...sessions].reverse()) {
  activeSessionId = sessionId;
  const firstEntry = entries.length;
  await handlers.get('session_start')({ type: 'session_start', reason: 'reload' }, context);
  await handlers.get('session_start')({
    type: 'session_start', reason: 'fork', previousSessionFile: '/tmp/pi-session-parent.jsonl'
  }, context);
  await handlers.get('session_compact')({
    type: 'session_compact', compactionEntry: {}, fromExtension: false,
    reason: 'manual', willRetry: false
  }, context);
  const statusResult = await tools.get('workspace_session_status').execute(
    'resume', {}, undefined, undefined, context
  );
  const status = JSON.parse(statusResult.content[0].text);
  lifecycle.push({
    workspace_id: status.workspace_id,
    reasons: ['reload', 'fork', 'compact'],
    generations: entries.slice(firstEntry).map((entry) => entry.data.generation),
  });
}
process.stdout.write(JSON.stringify({ recovered: results, lifecycle }));
`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
