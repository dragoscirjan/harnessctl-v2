import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CustomToolsPlugin } from './index.js';

describe('OpenCode adapter', () => {
  it('supports the installed host capability contract', async () => {
    const hooks = await CustomToolsPlugin({ directory: process.cwd() } as never);
    expect(hooks.tool?.config_get).toBeDefined();
    expect(hooks['tool.execute.before']).toBeTypeOf('function');
  });

  it('registers the configuration tools', async () => {
    const hooks = await CustomToolsPlugin({ directory: process.cwd() } as never);

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
    for (const name of ['workspace_ensure', 'workspace_status', 'workspace_mark_cleanup_ready', 'workspace_cleanup'])
      expect(hooks.tool?.[name]?.args.epic_id).toBeDefined();
    expect(hooks.tool?.['workspace_session_status']?.args.expected_binding_generation).toBeDefined();
    expect(hooks.tool?.['operation_prepare']?.args.operation_id).toBeDefined();
    expect(hooks.tool?.['operation_prepare_command']?.args.argv).toBeDefined();
    const issueLinkPathSchema = hooks.tool?.['issue_link_document']?.args.path as { description?: string } | undefined;
    expect(issueLinkPathSchema?.description).toContain('fixed active .harnessctl/documents authority');
    expect(issueLinkPathSchema?.description).not.toMatch(/\.specs|\.ai\.tmp/u);
  });

  it('delegates execution to the generic configuration tools', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-'));
    try {
      const hooks = await CustomToolsPlugin({ directory: cwd } as never);
      const tools = hooks.tool ?? {};
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
      const workspaceStatus = await tools['workspace_status']?.execute({ epic_id: createdIssue.id }, context);

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
      expect(workspaceStatus).toMatch(/^Workspace error:/u);
      expect(issueAfterArchiveRejection).toContain(currentDocument.path);
      expect(tools['issue_unlink_document']).toBeUndefined();
      expect(validation).toContain('"valid":true');
      const invalidIssue = await tools['issue_create']?.execute({ type: 'invalid', title: 'Invalid' }, context);
      expect(invalidIssue).toContain('Issue error: invalid type');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed without the OpenCode control-root capability', async () => {
    await expect(CustomToolsPlugin({} as never)).rejects.toThrow(/PluginInput\.directory is required/u);
  });

  it('preserves native tool arguments when workspace routing is disabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-disabled-'));
    try {
      git(root, 'init', '--initial-branch=main');
      mkdirSync(join(root, '.harnessctl'));
      writeFileSync(join(root, '.harnessctl', 'config.yaml'), 'version: 1\nskills:\n  cvs:\n    workspaces: false\n');
      const hooks = await CustomToolsPlugin({ directory: root } as never);
      const before = hooks['tool.execute.before'];
      const patch = { args: { patchText: '*** Begin Patch\n*** Add File: relative.txt\n+content\n*** End Patch' } };
      const bash = { args: { command: 'pwd' } };
      const read = { args: { filePath: 'relative.txt' } };

      await before?.({ tool: 'apply_patch', sessionID: 'disabled', callID: 'patch' }, patch);
      await before?.({ tool: 'bash', sessionID: 'disabled', callID: 'bash' }, bash);
      await before?.({ tool: 'read', sessionID: 'disabled', callID: 'read' }, read);

      expect(patch.args.patchText).toContain('*** Add File: relative.txt');
      expect(bash.args).toEqual({ command: 'pwd' });
      expect(read.args).toEqual({ filePath: 'relative.txt' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('routes bound project tools while the host remains in primary', async () => {
    const container = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-routing-'));
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
      const sessionID = 'opencode-session';
      const hooks = await CustomToolsPlugin({ directory: primary } as never);
      const context = { directory: primary, sessionID } as never;
      await expect(
        hooks['tool.execute.before']?.(
          { tool: 'workspace-status', sessionID, callID: 'unbound-control-call' },
          { args: { epic_id: 'hrn-00009' } },
        ),
      ).resolves.toBeUndefined();
      const bound = JSON.parse(String(await hooks.tool?.['workspace_session_allocate']?.execute({}, context))) as {
        workspace_id: string;
        execution_root: string;
        binding_generation: number;
      };
      mkdirSync(join(bound.execution_root, '.harnessctl', 'issues'), { recursive: true });
      const issue = JSON.parse(
        String(await hooks.tool?.['issue_create']?.execute({ type: 'task', title: 'Workspace-local issue' }, context)),
      ) as { id: string };
      const document = JSON.parse(
        String(
          await hooks.tool?.['document_create']?.execute({ title: 'Workspace-local document', kind: 'hld' }, context),
        ),
      ) as { id: string };
      const memory = await hooks.tool?.['memory_store']?.execute(
        {
          memory_type: 'semantic',
          record_type: 'fact',
          summary: 'Workspace-local memory.',
          source_kind: 'tool-observation',
          created_by: 'test',
          confidence: 'verified',
        },
        context,
      );

      expect(existsSync(join(bound.execution_root, '.harnessctl', 'issues'))).toBe(true);
      expect(existsSync(join(primary, '.harnessctl', 'issues'))).toBe(false);
      expect(await hooks.tool?.['issue_get']?.execute({ id: issue.id }, context)).toContain('Workspace-local issue');
      expect(await hooks.tool?.['document_get']?.execute({ id: document.id }, context)).toContain(
        'Workspace-local document',
      );
      expect(memory).toContain('Workspace-local memory');
      expect(await hooks.tool?.config_get?.execute({ path: 'skills.cvs.workspaces' }, context)).toBe('true');
      expect(await hooks.tool?.['workspace_session_status']?.execute({}, context)).toContain(bound.workspace_id);

      const before = hooks['tool.execute.before'];
      const globOutput = { args: {} };
      await before?.({ tool: 'glob', sessionID, callID: 'glob-call' }, globOutput);
      expect(globOutput.args).toEqual({ path: bound.execution_root });
      const grepOutput = { args: { path: 'src', pattern: 'example' } };
      await before?.({ tool: 'grep', sessionID, callID: 'grep-call' }, grepOutput);
      expect(grepOutput.args.path).toBe(join(bound.execution_root, 'src'));
      const readOutput = { args: { filePath: 'README.md' } };
      await before?.({ tool: 'read', sessionID, callID: 'relative-read-call' }, readOutput);
      expect(readOutput.args.filePath).toBe(join(bound.execution_root, 'README.md'));

      for (const toolName of [
        'compress',
        'detect-language',
        'list-subagents',
        'question',
        'skill',
        'todoread',
        'todowrite',
      ]) {
        const sessionOutput = { args: { value: toolName } };
        await before?.({ tool: toolName, sessionID, callID: `${toolName}-call` }, sessionOutput);
        expect(sessionOutput.args).toEqual({ value: toolName });
      }

      const patchOutput = {
        args: {
          patchText: [
            '*** Begin Patch',
            '*** Add File: added.txt',
            '+added',
            '*** Update File: source.txt',
            '*** Move to: moved.txt',
            '@@',
            '-before',
            '+after',
            '*** Delete File: deleted.txt',
            '*** End Patch',
          ].join('\n'),
        },
      };
      await before?.({ tool: 'apply_patch', sessionID, callID: 'patch-call' }, patchOutput);
      expect(patchOutput.args.patchText).toContain(`*** Add File: ${join(bound.execution_root, 'added.txt')}`);
      expect(patchOutput.args.patchText).toContain(`*** Update File: ${join(bound.execution_root, 'source.txt')}`);
      expect(patchOutput.args.patchText).toContain(`*** Move to: ${join(bound.execution_root, 'moved.txt')}`);
      expect(patchOutput.args.patchText).toContain(`*** Delete File: ${join(bound.execution_root, 'deleted.txt')}`);

      const absolutePatch = {
        args: {
          patchText: `*** Begin Patch\n*** Update File: ${join(bound.execution_root, 'safe.txt')}\n@@\n*** End Patch`,
        },
      };
      await before?.({ tool: 'apply_patch', sessionID, callID: 'absolute-patch-call' }, absolutePatch);
      expect(absolutePatch.args.patchText).toContain(`*** Update File: ${join(bound.execution_root, 'safe.txt')}`);

      const other = JSON.parse(
        String(
          await hooks.tool?.['workspace_session_allocate']?.execute({}, {
            directory: primary,
            sessionID: 'other-session',
          } as never),
        ),
      ) as { execution_root: string };
      const outside = join(container, 'outside');
      mkdirSync(outside);
      symlinkSync(outside, join(bound.execution_root, 'escape'));
      const unsafePatchTargets: ReadonlyArray<readonly [string, string]> = [
        ['primary-patch', join(primary, 'README.md')],
        ['cross-workspace-patch', join(other.execution_root, 'other.txt')],
        ['traversal-patch', '../outside.txt'],
        ['symlink-patch', 'escape/outside.txt'],
      ];
      for (const [callID, target] of unsafePatchTargets) {
        await expect(
          before?.(
            { tool: 'apply_patch', sessionID, callID },
            { args: { patchText: `*** Begin Patch\n*** Add File: ${target}\n+unsafe\n*** End Patch` } },
          ),
        ).rejects.toThrow(/apply_patch path|escapes the execution root/u);
      }

      for (const args of [
        null,
        {},
        { patchText: 42 },
        { patchText: '*** Begin Patch\n*** End Patch' },
        { patchText: '*** Begin Patch\n*** Move to: moved.txt\n*** End Patch' },
        { patchText: '*** Begin Patch\n*** Update File: source.txt\n*** Move to:\n*** End Patch' },
        { patchText: '*** Begin Patch\n*** Add File: safe.txt\n*** End Patch', unexpected: true },
      ]) {
        await expect(before?.({ tool: 'apply_patch', sessionID, callID: 'malformed-patch' }, { args })).rejects.toThrow(
          /invalid apply_patch arguments|malformed apply_patch/u,
        );
      }
      await expect(
        before?.({ tool: 'read', sessionID, callID: 'read-call' }, { args: { filePath: join(primary, 'README.md') } }),
      ).rejects.toThrow(/escapes the execution root/u);
      await expect(
        before?.({ tool: 'bash', sessionID, callID: 'bash-call' }, { args: { command: 'pwd' } }),
      ).rejects.toThrow(/unsupported tool: bash/u);
      await expect(
        before?.({ tool: 'external_tool', sessionID, callID: 'external-call' }, { args: {} }),
      ).rejects.toThrow(/unsupported tool: external_tool/u);
      await expect(
        before?.({ tool: 'env-create', sessionID, callID: 'env-create-call' }, { args: {} }),
      ).rejects.toThrow(/unsupported tool: env-create/u);
      await expect(
        before?.({ tool: 'issue_get', sessionID, callID: 'custom-call' }, { args: { id: issue.id } }),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  });

  it('recovers two isolated sessions with authorities, files, and tasks in a fresh host process', async () => {
    const container = mkdtempSync(join(tmpdir(), 'harnessctl-opencode-restart-'));
    const primary = join(container, 'primary');
    mkdirSync(primary);
    try {
      git(primary, 'init', '--initial-branch=main');
      git(primary, 'config', 'user.name', 'Harnessctl Test');
      git(primary, 'config', 'user.email', 'test@example.invalid');
      mkdirSync(join(primary, '.harnessctl'), { recursive: true });
      writeFileSync(
        join(primary, '.harnessctl', 'config.yaml'),
        'version: 1\nskills:\n  cvs:\n    workspaces: true\n  memory:\n    enabled: true\nautomation:\n  runner: npm\n  tasks:\n    repository.test: workspace-test\n    bootstrap.install: workspace-bootstrap\n',
      );
      writeFileSync(
        join(primary, 'package.json'),
        `${JSON.stringify({
          scripts: {
            'workspace-test': "node -e \"require('node:fs').writeFileSync('task-marker.txt', process.cwd())\"",
            'workspace-bootstrap':
              "node -e \"require('node:fs').writeFileSync('bootstrap-marker.txt', process.cwd())\"",
          },
        })}\n`,
      );
      git(primary, 'add', '.harnessctl/config.yaml', 'package.json');
      git(primary, 'commit', '-m', 'Configure routing');

      const sessions = ['restart-session-a', 'restart-session-b'];
      const hooks = await CustomToolsPlugin({ directory: primary } as never);
      const allocated = [];
      for (const sessionID of sessions) {
        allocated.push(
          JSON.parse(
            String(
              await hooks.tool?.['workspace_session_allocate']?.execute({}, { directory: primary, sessionID } as never),
            ),
          ) as { execution_root: string; workspace_id: string },
        );
      }

      const adapterUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'index.ts')).href;
      const tsxLoader = createRequire(import.meta.url).resolve('tsx');
      const output = execFileSync(
        process.execPath,
        [
          '--import',
          tsxLoader,
          '--input-type=module',
          '--eval',
          FRESH_PROCESS_SCRIPT,
          primary,
          adapterUrl,
          ...sessions,
        ],
        { cwd: primary, encoding: 'utf8' },
      );
      const recovered = JSON.parse(output) as Array<{
        workspace_id: string;
        issue_id: string;
        document_id: string;
        task_outcome: string;
        bootstrap_outcome: string;
        routed_root: string;
        source_path: string;
        checkpoint_root: string;
        artifact_root: string;
      }>;

      expect(recovered).toHaveLength(2);
      for (const [index, result] of recovered.entries()) {
        expect(result.workspace_id).toBe(allocated[index]?.workspace_id);
        expect(result.routed_root).toBe(allocated[index]?.execution_root);
        expect(existsSync(join(allocated[index]?.execution_root ?? '', '.harnessctl', 'issues'))).toBe(true);
        expect(result.issue_id).toMatch(/^hrn-[0-9A-HJKMNP-TV-Z]{26}$/u);
        expect(result.document_id).toMatch(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u);
        expect(result.task_outcome).toBe('succeeded');
        expect(result.bootstrap_outcome).toBe('succeeded');
        expect(result.source_path).toBe(join(allocated[index]?.execution_root ?? '', 'package.json'));
        expect(result.checkpoint_root).toBe(join(allocated[index]?.execution_root ?? '', '.harnessctl', 'checkpoints'));
        expect(result.artifact_root).toBe(join(allocated[index]?.execution_root ?? '', '.harnessctl', 'artifacts'));
        expect(existsSync(join(allocated[index]?.execution_root ?? '', 'task-marker.txt'))).toBe(true);
        expect(existsSync(join(allocated[index]?.execution_root ?? '', 'bootstrap-marker.txt'))).toBe(true);
      }
      expect(existsSync(join(primary, '.harnessctl', 'issues'))).toBe(false);
      expect(existsSync(join(primary, '.harnessctl', 'documents'))).toBe(false);
      expect(existsSync(join(primary, '.harnessctl', 'memory'))).toBe(false);
      expect(existsSync(join(primary, 'task-marker.txt'))).toBe(false);
      expect(existsSync(join(primary, 'bootstrap-marker.txt'))).toBe(false);
      expect(git(primary, 'status', '--porcelain')).toBe('');
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  });
});

const FRESH_PROCESS_SCRIPT = `
const [primary, adapterUrl, ...sessions] = process.argv.slice(1);
const { CustomToolsPlugin } = await import(adapterUrl);
const hooks = await CustomToolsPlugin({ directory: primary });
const results = [];
for (const [index, sessionID] of sessions.entries()) {
  const context = { directory: primary, sessionID };
  const issue = JSON.parse(await hooks.tool.issue_create.execute(
    { type: 'task', title: \`Recovered session \${index + 1}\` },
    context,
  ));
  const document = JSON.parse(await hooks.tool.document_create.execute(
    { title: \`Recovered document \${index + 1}\`, kind: 'lld' },
    context,
  ));
  await hooks.tool.memory_store.execute({
    memory_type: 'episodic', record_type: 'event', summary: \`Recovered memory \${index + 1}\`,
    source_kind: 'artifact', created_by: 'test', confidence: 'verified'
  }, context);
  const taskDescriptor = JSON.parse(await hooks.tool.operation_prepare.execute(
    { operation_id: 'repository.test' }, context,
  ));
  const taskEvidence = JSON.parse(await hooks.tool.operation_execute.execute(
    { operation_id: 'repository.test', consent_digest: taskDescriptor.digest }, context,
  ));
  const bootstrapDescriptor = JSON.parse(await hooks.tool.operation_prepare.execute(
    { operation_id: 'bootstrap.install' }, context,
  ));
  const bootstrapEvidence = JSON.parse(await hooks.tool.operation_execute.execute(
    { operation_id: 'bootstrap.install', consent_digest: bootstrapDescriptor.digest }, context,
  ));
  const status = JSON.parse(await hooks.tool.workspace_session_status.execute({}, context));
  const routed = { args: {} };
  await hooks['tool.execute.before']({ tool: 'glob', sessionID, callID: \`glob-\${index}\` }, routed);
  const source = { args: { filePath: 'package.json' } };
  await hooks['tool.execute.before']({ tool: 'read', sessionID, callID: \`source-\${index}\` }, source);
  const checkpoint = { args: { path: '.harnessctl/checkpoints' } };
  await hooks['tool.execute.before']({ tool: 'glob', sessionID, callID: \`checkpoint-\${index}\` }, checkpoint);
  const artifact = { args: { path: '.harnessctl/artifacts' } };
  await hooks['tool.execute.before']({ tool: 'glob', sessionID, callID: \`artifact-\${index}\` }, artifact);
  results.push({
    workspace_id: status.workspace_id,
    issue_id: issue.id,
    document_id: document.id,
    task_outcome: taskEvidence.outcome,
    bootstrap_outcome: bootstrapEvidence.outcome,
    routed_root: routed.args.path,
    source_path: source.args.filePath,
    checkpoint_root: checkpoint.args.path,
    artifact_root: artifact.args.path,
  });
}
process.stdout.write(JSON.stringify(results));
`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
