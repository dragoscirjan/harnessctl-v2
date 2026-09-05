import { execFile, execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createExecutionContextProvider, ExecutionContextError } from './execution-context.js';
import { canonicalIssueFilename, encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import { buildTaskOperation, deriveNextBootstrapOperation, executeTaskOperation } from './operations.js';
import { createGitWorkspaceProvider } from './workspaces.js';

const FIRST_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SECOND_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const EPIC_ID = 'hrn-00009';
const roots: string[] = [];
const execFileAsync = promisify(execFile);

interface RepositoryFixture {
  container: string;
  root: string;
  commonDir: string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function repository(workspaces = true): RepositoryFixture {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'harnessctl execution context ')));
  roots.push(container);
  const root = join(container, 'primary repo');
  mkdirSync(root);
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Harnessctl Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(root, '.harnessctl', 'issues'), { recursive: true });
  writeFileSync(
    join(root, '.harnessctl', 'config.yaml'),
    `version: 1\nskills:\n  cvs:\n    workspaces: ${workspaces}\n  issues:\n    prefix: hrn-\nautomation:\n  runner: mise\n  tasks:\n    bootstrap.install: install-prompts\n`,
    'utf8',
  );
  writeFileSync(join(root, 'mise.toml'), '[tasks.install-prompts]\nrun = "true"\n');
  git(root, 'add', '.harnessctl/config.yaml', 'mise.toml');
  git(root, 'commit', '-m', 'Configure repository');
  return { container, root, commonDir: join(root, '.git') };
}

function addEpic(root: string, epicId: string, commit = false): void {
  mkdirSync(join(root, '.harnessctl', 'issues'), { recursive: true });
  const issue: CanonicalIssueDocument = {
    version: 1,
    id: epicId,
    type: 'epic',
    title: 'Execution context Epic',
    status: 'open',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    body: 'Test authority.',
    comments: [],
  };
  writeFileSync(
    join(root, '.harnessctl', 'issues', canonicalIssueFilename(issue.id, issue.title)),
    encodeCanonicalIssue(issue),
  );
  if (commit) {
    git(root, 'add', '.harnessctl/issues');
    git(root, 'commit', '-m', 'Add Epic authority');
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('session-bound execution context state', () => {
  it('does not create state when workspace routing is disabled', () => {
    const fixture = repository(false);
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });

    expect(() => provider.allocateProvisional('opencode', 'opaque-session')).toThrowError(
      expect.objectContaining<Partial<ExecutionContextError>>({ category: 'configuration' }),
    );
    expect(existsSync(join(fixture.commonDir, 'harnessctl'))).toBe(false);
  });

  it('allocates, binds, and resolves a provisional workspace without exposing the session ID', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });

    const allocated = provider.allocateProvisional('opencode', 'private/session/value');

    expect(allocated).toMatchObject({
      workspace_id: `ws-${FIRST_ULID}`,
      execution_root: join(fixture.container, 'primary repo--workspaces', `ws-${FIRST_ULID}`),
      branch: `harnessctl/workspace/ws-${FIRST_ULID}`,
      epic_id: null,
      binding_generation: 1,
      workspace_generation: 2,
      workspace_lifecycle: 'active',
      host: 'opencode',
    });
    expect(allocated.session_key).toMatch(/^[a-f0-9]{64}$/u);
    expect(allocated.session_key).not.toContain('private');
    expect(provider.resolve('opencode', 'private/session/value')).toEqual(allocated);
    expect(git(allocated.execution_root, 'branch', '--show-current')).toBe(allocated.branch);
    const bindingDirectory = join(fixture.commonDir, 'harnessctl', 'session-bindings', 'v1', 'opencode');
    expect(readdirSync(bindingDirectory)).toEqual([`${allocated.session_key}.json`]);
    expect(readFileSync(join(bindingDirectory, `${allocated.session_key}.json`), 'utf8')).not.toContain(
      'private/session/value',
    );
  });

  it('reconciles an ambiguous Git failure after the provisional worktree is created', () => {
    const fixture = repository();
    const gitWrapper = join(fixture.container, 'ambiguous-git');
    writeFileSync(
      gitWrapper,
      '#!/bin/sh\ngit "$@"\nstatus=$?\nif [ "$1" = worktree ] && [ "$2" = add ] && [ "$status" -eq 0 ]; then exit 1; fi\nexit "$status"\n',
    );
    chmodSync(gitWrapper, 0o755);

    const allocated = createExecutionContextProvider(fixture.root, {
      gitPath: gitWrapper,
      ulid: () => FIRST_ULID,
    }).allocateProvisional('opencode', 'ambiguous-session');

    expect(allocated).toMatchObject({ workspace_lifecycle: 'active', workspace_generation: 2 });
    expect(git(fixture.root, 'worktree', 'list', '--porcelain')).toContain(
      `locked harnessctl:${allocated.workspace_id}`,
    );
  });

  it('attaches workspace-local Epic authority without renaming the workspace', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('pi', 'session-1');
    addEpic(allocated.execution_root, EPIC_ID);

    const attached = provider.attachEpic(
      'pi',
      'session-1',
      EPIC_ID,
      allocated.binding_generation,
      allocated.workspace_generation,
    );

    expect(attached).toMatchObject({
      workspace_id: allocated.workspace_id,
      execution_root: allocated.execution_root,
      branch: allocated.branch,
      epic_id: EPIC_ID,
      binding_generation: 2,
      workspace_generation: 3,
    });
    expect(() =>
      provider.attachEpic('pi', 'session-1', EPIC_ID, allocated.binding_generation, allocated.workspace_generation),
    ).toThrow(/generation is stale/u);
  });

  it('requires an exact generation to move or release an existing binding', () => {
    const fixture = repository();
    const ulids = [FIRST_ULID, SECOND_ULID];
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => ulids.shift() ?? FIRST_ULID });
    const first = provider.allocateProvisional('opencode', 'first-session');
    const second = provider.allocateProvisional('opencode', 'second-session');

    expect(() => provider.bind('opencode', 'first-session', second.workspace_id)).toThrow(
      /target workspace generation/u,
    );
    expect(() =>
      provider.bind(
        'opencode',
        'first-session',
        second.workspace_id,
        first.binding_generation,
        second.workspace_generation - 1,
      ),
    ).toThrow(/workspace generation is stale/u);
    const rebound = provider.bind(
      'opencode',
      'first-session',
      second.workspace_id,
      first.binding_generation,
      second.workspace_generation,
    );
    expect(rebound).toMatchObject({ workspace_id: second.workspace_id, binding_generation: 2 });
    expect(() => provider.release('opencode', 'first-session', 1)).toThrow(/generation is stale/u);
    provider.release('opencode', 'first-session', rebound.binding_generation);
    expect(provider.hasBinding('opencode', 'first-session')).toBe(false);
    expect(() => provider.resolve('opencode', 'first-session')).toThrow(/binding is released/u);

    const bindingPath = join(
      fixture.commonDir,
      'harnessctl',
      'session-bindings',
      'v1',
      'opencode',
      `${first.session_key}.json`,
    );
    expect(JSON.parse(readFileSync(bindingPath, 'utf8'))).toMatchObject({ lifecycle: 'released', generation: 3 });
    expect(
      provider.bind('opencode', 'first-session', second.workspace_id, 3, second.workspace_generation),
    ).toMatchObject({ binding_generation: 4, workspace_id: second.workspace_id });
  });

  it('rolls back an interrupted workspace-binding transaction before serving readers', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('opencode', 'transaction-session');
    const workspacePath = join(fixture.commonDir, 'harnessctl', 'workspaces', 'v2', `${allocated.workspace_id}.json`);
    const bindingPath = join(
      fixture.commonDir,
      'harnessctl',
      'session-bindings',
      'v1',
      'opencode',
      `${allocated.session_key}.json`,
    );
    const workspace = JSON.parse(readFileSync(workspacePath, 'utf8')) as Record<string, unknown>;
    const binding = JSON.parse(readFileSync(bindingPath, 'utf8')) as Record<string, unknown>;
    const interruptedWorkspace = { ...workspace, generation: 3 };
    const interruptedBinding = { ...binding, generation: 2, workspace_generation: 3 };
    writeFileSync(workspacePath, `${JSON.stringify(interruptedWorkspace)}\n`);
    writeFileSync(bindingPath, `${JSON.stringify(interruptedBinding)}\n`);
    const transactionPath = join(fixture.commonDir, 'harnessctl', 'transactions', 'execution-context.json');
    mkdirSync(join(fixture.commonDir, 'harnessctl', 'transactions'), { recursive: true });
    writeFileSync(
      transactionPath,
      `${JSON.stringify({
        schema_version: 1,
        workspace_id: allocated.workspace_id,
        host: 'opencode',
        session_key: allocated.session_key,
        previous_workspace: workspace,
        previous_binding: binding,
      })}\n`,
    );

    expect(provider.resolve('opencode', 'transaction-session')).toEqual(allocated);
    expect(JSON.parse(readFileSync(workspacePath, 'utf8'))).toEqual(workspace);
    expect(JSON.parse(readFileSync(bindingPath, 'utf8'))).toEqual(binding);
    expect(existsSync(transactionPath)).toBe(false);
  });

  it.each([
    ['allocation', 'workspace write', false],
    ['allocation', 'binding write', true],
    ['adoption', 'workspace write', false],
    ['adoption', 'binding write', true],
  ] as const)(
    'recovers an interrupted %s publication after the %s boundary',
    (_operation, _boundary, bindingPublished) => {
      const fixture = repository();
      const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
      const allocated = provider.allocateProvisional('opencode', 'publication-session');
      const workspacePath = join(fixture.commonDir, 'harnessctl', 'workspaces', 'v2', `${allocated.workspace_id}.json`);
      const bindingPath = join(
        fixture.commonDir,
        'harnessctl',
        'session-bindings',
        'v1',
        'opencode',
        `${allocated.session_key}.json`,
      );
      const transactionPath = join(fixture.commonDir, 'harnessctl', 'transactions', 'execution-context.json');
      writeFileSync(
        transactionPath,
        `${JSON.stringify({
          schema_version: 1,
          workspace_id: allocated.workspace_id,
          host: 'opencode',
          session_key: allocated.session_key,
          previous_workspace: null,
          previous_binding: null,
        })}\n`,
      );
      if (!bindingPublished) rmSync(bindingPath);

      expect(() => createExecutionContextProvider(fixture.root).resolve('opencode', 'publication-session')).toThrow(
        /has no execution workspace binding/u,
      );
      expect(existsSync(workspacePath)).toBe(false);
      expect(existsSync(bindingPath)).toBe(false);
      expect(existsSync(transactionPath)).toBe(false);
    },
  );

  it('recovers interrupted attachment publication to the prior generations', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('opencode', 'attachment-crash');
    const workspacePath = join(fixture.commonDir, 'harnessctl', 'workspaces', 'v2', `${allocated.workspace_id}.json`);
    const bindingPath = join(
      fixture.commonDir,
      'harnessctl',
      'session-bindings',
      'v1',
      'opencode',
      `${allocated.session_key}.json`,
    );
    const workspace = JSON.parse(readFileSync(workspacePath, 'utf8')) as Record<string, unknown>;
    const binding = JSON.parse(readFileSync(bindingPath, 'utf8')) as Record<string, unknown>;
    const transactionPath = join(fixture.commonDir, 'harnessctl', 'transactions', 'execution-context.json');
    writeFileSync(workspacePath, `${JSON.stringify({ ...workspace, epic_id: EPIC_ID, generation: 3 })}\n`);
    writeFileSync(
      transactionPath,
      `${JSON.stringify({
        schema_version: 1,
        workspace_id: allocated.workspace_id,
        host: 'opencode',
        session_key: allocated.session_key,
        previous_workspace: workspace,
        previous_binding: binding,
      })}\n`,
    );

    expect(createExecutionContextProvider(fixture.root).resolve('opencode', 'attachment-crash')).toEqual(allocated);
    expect(JSON.parse(readFileSync(workspacePath, 'utf8'))).toEqual(workspace);
    expect(JSON.parse(readFileSync(bindingPath, 'utf8'))).toEqual(binding);
  });

  it('ignores an interrupted rebind temporary file and serves the complete prior binding', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('opencode', 'rebind-crash');
    const bindingPath = join(
      fixture.commonDir,
      'harnessctl',
      'session-bindings',
      'v1',
      'opencode',
      `${allocated.session_key}.json`,
    );
    const binding = JSON.parse(readFileSync(bindingPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(join(dirname(bindingPath), `.${allocated.session_key}.json.interrupted.tmp`), '{"torn":true}\n');

    expect(createExecutionContextProvider(fixture.root).resolve('opencode', 'rebind-crash')).toEqual(allocated);
    expect(JSON.parse(readFileSync(bindingPath, 'utf8'))).toEqual(binding);
  });

  it('keeps independent sessions isolated while the primary checkout remains unchanged', () => {
    const fixture = repository();
    const ulids = [FIRST_ULID, SECOND_ULID];
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => ulids.shift() ?? FIRST_ULID });
    const first = provider.allocateProvisional('opencode', 'session-a');
    const second = provider.allocateProvisional('opencode', 'session-b');

    writeFileSync(join(first.execution_root, 'session.txt'), 'first\n');
    writeFileSync(join(second.execution_root, 'session.txt'), 'second\n');

    expect(provider.resolve('opencode', 'session-a').execution_root).toBe(first.execution_root);
    expect(provider.resolve('opencode', 'session-b').execution_root).toBe(second.execution_root);
    expect(readFileSync(join(first.execution_root, 'session.txt'), 'utf8')).toBe('first\n');
    expect(readFileSync(join(second.execution_root, 'session.txt'), 'utf8')).toBe('second\n');
    expect(existsSync(join(fixture.root, 'session.txt'))).toBe(false);
    expect(git(fixture.root, 'status', '--porcelain=v1')).toBe('');
  });

  it('derives bootstrap progress from live authority, generations, and execution evidence', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    expect(deriveNextBootstrapOperation(fixture.root, 'opencode', 'bootstrap-session')).toBe(
      'workspace.allocate_provisional',
    );
    const allocated = provider.allocateProvisional('opencode', 'bootstrap-session');
    expect(deriveNextBootstrapOperation(fixture.root, 'opencode', 'bootstrap-session')).toBe('authority.create');
    addEpic(allocated.execution_root, EPIC_ID);
    expect(deriveNextBootstrapOperation(fixture.root, 'opencode', 'bootstrap-session', { epic_id: EPIC_ID })).toBe(
      'workspace.attach_epic',
    );
    const attached = provider.attachEpic(
      'opencode',
      'bootstrap-session',
      EPIC_ID,
      allocated.binding_generation,
      allocated.workspace_generation,
    );
    expect(deriveNextBootstrapOperation(fixture.root, 'opencode', 'bootstrap-session', { epic_id: EPIC_ID })).toBe(
      'bootstrap.install',
    );
    const descriptor = buildTaskOperation(
      fixture.root,
      'opencode',
      'bootstrap-session',
      'bootstrap.install',
      attached.binding_generation,
    );
    const evidence = executeTaskOperation(descriptor, descriptor.digest, {
      spawn: (() => ({ stdout: '', stderr: '', status: 0, signal: null })) as never,
    });
    expect(
      deriveNextBootstrapOperation(fixture.root, 'opencode', 'bootstrap-session', {
        epic_id: EPIC_ID,
        evidence: [evidence],
      }),
    ).toBeNull();
    expect(() =>
      deriveNextBootstrapOperation(fixture.root, 'opencode', 'bootstrap-session', {
        epic_id: EPIC_ID,
        evidence: [evidence, evidence],
      }),
    ).toThrow(/repeated/u);
  });

  it('fails closed while another execution-context mutation owns the repository lock', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    provider.allocateProvisional('pi', 'session');
    writeFileSync(
      join(fixture.commonDir, 'harnessctl', 'locks', 'execution-context.lock'),
      `${JSON.stringify({
        schema_version: 1,
        pid: process.pid,
        hostname: hostname(),
        process_start: null,
        nonce: 'a'.repeat(32),
        created_at: new Date().toISOString(),
      })}\n`,
    );

    expect(() => createExecutionContextProvider(fixture.root, { lockWaitMs: 0 }).resolve('pi', 'session')).toThrowError(
      expect.objectContaining<Partial<ExecutionContextError>>({ category: 'synchronization', retryable: true }),
    );
  });

  it('recovers a lock owned by a provably dead local process', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('pi', 'session');
    writeFileSync(
      join(fixture.commonDir, 'harnessctl', 'locks', 'execution-context.lock'),
      `${JSON.stringify({
        schema_version: 1,
        pid: 2_147_483_647,
        hostname: hostname(),
        process_start: '1',
        nonce: 'b'.repeat(32),
        created_at: new Date().toISOString(),
      })}\n`,
    );

    expect(provider.resolve('pi', 'session')).toEqual(allocated);
    expect(existsSync(join(fixture.commonDir, 'harnessctl', 'locks', 'execution-context.lock'))).toBe(false);
  });

  it('serializes concurrent recovery attempts for one provably dead lock owner', async () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('pi', 'concurrent-session');
    const lockPath = join(fixture.commonDir, 'harnessctl', 'locks', 'execution-context.lock');
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        schema_version: 1,
        pid: 2_147_483_647,
        hostname: hostname(),
        process_start: '1',
        nonce: 'c'.repeat(32),
        created_at: new Date().toISOString(),
      })}\n`,
    );
    const moduleUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'execution-context.ts')).href;
    const tsxLoader = createRequire(import.meta.url).resolve('tsx');
    const child = [
      '--import',
      tsxLoader,
      '--input-type=module',
      '--eval',
      `const [root,moduleUrl]=process.argv.slice(1); const {createExecutionContextProvider}=await import(moduleUrl); process.stdout.write(createExecutionContextProvider(root,{lockWaitMs:2000}).resolve('pi','concurrent-session').workspace_id);`,
      fixture.root,
      moduleUrl,
    ];

    const [first, second] = await Promise.all([
      execFileAsync(process.execPath, child, { cwd: fixture.root, encoding: 'utf8' }),
      execFileAsync(process.execPath, child, { cwd: fixture.root, encoding: 'utf8' }),
    ]);
    expect(first.stdout).toBe(allocated.workspace_id);
    expect(second.stdout).toBe(allocated.workspace_id);
    expect(existsSync(lockPath)).toBe(false);
    expect(readdirSync(dirname(lockPath)).filter((name) => name.includes('.stale.'))).toEqual([]);
  });

  it('fails closed without deleting malformed lock ownership evidence', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    provider.allocateProvisional('pi', 'session');
    const lockPath = join(fixture.commonDir, 'harnessctl', 'locks', 'execution-context.lock');
    writeFileSync(lockPath, '{}\n');

    expect(() => provider.resolve('pi', 'session')).toThrowError(
      expect.objectContaining<Partial<ExecutionContextError>>({ category: 'synchronization' }),
    );
    expect(readFileSync(lockPath, 'utf8')).toBe('{}\n');
  });

  it('adopts an exact clean v1 workspace without changing legacy state or topology', () => {
    const fixture = repository();
    addEpic(fixture.root, EPIC_ID, true);
    const legacy = createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    const legacyStatePath = join(fixture.commonDir, 'harnessctl', 'workspaces', `${EPIC_ID}.json`);
    const before = readFileSync(legacyStatePath, 'utf8');
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });

    const adopted = provider.adoptV1('pi', 'legacy-session', EPIC_ID);

    expect(adopted).toMatchObject({
      execution_root: legacy.workspace_path,
      branch: legacy.branch,
      epic_id: EPIC_ID,
      workspace_id: `ws-${FIRST_ULID}`,
    });
    expect(readFileSync(legacyStatePath, 'utf8')).toBe(before);
    expect(git(fixture.root, 'worktree', 'list', '--porcelain')).toContain(`locked harnessctl:${EPIC_ID}`);
    expect(provider.resolve('pi', 'legacy-session')).toEqual(adopted);
  });

  it('rejects malformed and future state without rewriting it', () => {
    const fixture = repository();
    const provider = createExecutionContextProvider(fixture.root, { ulid: () => FIRST_ULID });
    const allocated = provider.allocateProvisional('opencode', 'session');
    const statePath = join(fixture.commonDir, 'harnessctl', 'workspaces', 'v2', `${allocated.workspace_id}.json`);
    writeFileSync(statePath, '{"schema_version":3}\n', 'utf8');
    const before = readFileSync(statePath, 'utf8');

    expect(() => provider.resolve('opencode', 'session')).toThrow(/unsupported fields/u);
    expect(readFileSync(statePath, 'utf8')).toBe(before);
  });
});
