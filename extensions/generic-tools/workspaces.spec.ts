import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalIssueFilename, encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import { WorkspaceError, createGitWorkspaceProvider } from './workspaces.js';

const EPIC_ID = 'hrn-00009';
const SECOND_EPIC_ID = 'hrn-00010';
const roots: string[] = [];
const execFileAsync = promisify(execFile);
const workspaceModuleUrl = pathToFileURL(join(import.meta.dirname, 'workspaces.ts')).href;

interface RepositoryFixture {
  root: string;
  workspace: string;
  branch: string;
  statePath: string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function repository(options: { workspaces?: boolean; commitEpic?: boolean } = {}): RepositoryFixture {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'harnessctl workspace ')));
  roots.push(container);
  const root = join(container, 'primary repo');
  mkdirSync(root);
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Harnessctl Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(root, '.harnessctl', 'issues'), { recursive: true });
  writeFileSync(
    join(root, '.harnessctl', 'config.yaml'),
    `version: 1\nskills:\n  cvs:\n    workspaces: ${options.workspaces ?? true}\n  issues:\n    prefix: hrn-\n`,
    'utf8',
  );
  git(root, 'add', '.harnessctl/config.yaml');
  git(root, 'commit', '-m', 'Configure repository');

  const issue: CanonicalIssueDocument = {
    version: 1,
    id: EPIC_ID,
    type: 'epic',
    title: 'Workspace test Epic',
    status: 'in_progress',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    body: 'Test authority.',
    comments: [],
  };
  const issuePath = join(root, '.harnessctl', 'issues', canonicalIssueFilename(issue.id, issue.title));
  writeFileSync(issuePath, encodeCanonicalIssue(issue));
  if (options.commitEpic ?? true) {
    git(root, 'add', '.harnessctl/issues');
    git(root, 'commit', '-m', 'Add Epic authority');
  }

  return {
    root,
    workspace: join(container, 'primary repo--workspaces', EPIC_ID),
    branch: `harnessctl/epic/${EPIC_ID}`,
    statePath: join(root, '.git', 'harnessctl', 'workspaces', `${EPIC_ID}.json`),
  };
}

function addEpic(root: string, epicId: string): void {
  const issue: CanonicalIssueDocument = {
    version: 1,
    id: epicId,
    type: 'epic',
    title: `Workspace test ${epicId}`,
    status: 'in_progress',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    body: 'Test authority.',
    comments: [],
  };
  const issuePath = join(root, '.harnessctl', 'issues', canonicalIssueFilename(issue.id, issue.title));
  writeFileSync(issuePath, encodeCanonicalIssue(issue));
  git(root, 'add', '.harnessctl/issues');
  git(root, 'commit', '-m', `Add ${epicId} authority`);
}

async function ensureInChildProcess(cwd: string, epicId: string): Promise<Record<string, unknown>> {
  const script = `
    import { createGitWorkspaceProvider } from ${JSON.stringify(workspaceModuleUrl)};
    process.stdout.write(JSON.stringify(createGitWorkspaceProvider(${JSON.stringify(cwd)}).ensure(${JSON.stringify(epicId)})));
  `;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Git Epic workspace state engine', () => {
  it('requires the explicit workspace capability without creating state', () => {
    const fixture = repository({ workspaces: false });

    expect(() => createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID)).toThrowError(
      expect.objectContaining<Partial<WorkspaceError>>({ category: 'configuration' }),
    );
    expect(existsSync(fixture.statePath)).toBe(false);
    expect(existsSync(fixture.workspace)).toBe(false);
  });

  it('requires clean primary state and committed canonical Epic authority', () => {
    const dirty = repository();
    writeFileSync(join(dirty.root, 'untracked.txt'), 'dirty\n');
    expect(() => createGitWorkspaceProvider(dirty.root).ensure(EPIC_ID)).toThrow(/must be clean/u);
    expect(existsSync(dirty.statePath)).toBe(false);

    const uncommitted = repository({ commitEpic: false });
    const relativeIssue = '.harnessctl/issues';
    writeFileSync(join(uncommitted.root, '.git', 'info', 'exclude'), `${relativeIssue}\n`, 'utf8');
    expect(git(uncommitted.root, 'status', '--porcelain=v1')).toBe('');
    expect(() => createGitWorkspaceProvider(uncommitted.root).ensure(EPIC_ID)).toThrow(/must exist in primary HEAD/u);
    expect(existsSync(uncommitted.statePath)).toBe(false);
  });

  it('creates one deterministic locked workspace and returns it idempotently', () => {
    const fixture = repository();
    const provider = createGitWorkspaceProvider(fixture.root);

    expect(provider.status(EPIC_ID)).toMatchObject({ state: 'absent', blockers: [] });
    expect(provider.ensure(EPIC_ID)).toMatchObject({
      epic_id: EPIC_ID,
      primary_path: fixture.root,
      workspace_path: fixture.workspace,
      branch: fixture.branch,
      state: 'active',
      current_cwd: 'primary',
      current_cwd_match: false,
      clean: true,
      blockers: [],
    });
    expect(provider.ensure(EPIC_ID)).toMatchObject({ state: 'active', blockers: [] });
    expect(git(fixture.root, 'worktree', 'list', '--porcelain')).toContain(`locked harnessctl:${EPIC_ID}`);
    expect(git(fixture.workspace, 'branch', '--show-current')).toBe(fixture.branch);
  });

  it('returns an existing workspace only from its exact primary or Epic workspace', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);

    expect(createGitWorkspaceProvider(fixture.workspace).ensure(EPIC_ID)).toMatchObject({
      state: 'active',
      current_cwd: 'workspace',
      current_cwd_match: true,
      blockers: [],
    });

    const nested = join(fixture.workspace, 'nested');
    mkdirSync(nested);
    expect(() => createGitWorkspaceProvider(nested).ensure(EPIC_ID)).toThrow(
      new RegExp(
        `exact primary checkout or exact Epic workspace; expected ${fixture.root} or ${fixture.workspace}`,
        'u',
      ),
    );
  });

  it('serializes concurrent same-Epic ensure across processes', async () => {
    const fixture = repository();

    const results = await Promise.all([
      ensureInChildProcess(fixture.root, EPIC_ID),
      ensureInChildProcess(fixture.root, EPIC_ID),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ epic_id: EPIC_ID, state: 'active', workspace_path: fixture.workspace }),
      expect.objectContaining({ epic_id: EPIC_ID, state: 'active', workspace_path: fixture.workspace }),
    ]);
    expect(git(fixture.root, 'worktree', 'list', '--porcelain').match(new RegExp(fixture.branch, 'gu'))).toHaveLength(
      1,
    );
  });

  it('creates distinct deterministic mappings for concurrent different-Epic ensure', async () => {
    const fixture = repository();
    addEpic(fixture.root, SECOND_EPIC_ID);

    const [first, second] = await Promise.all([
      ensureInChildProcess(fixture.root, EPIC_ID),
      ensureInChildProcess(fixture.root, SECOND_EPIC_ID),
    ]);

    expect(first).toMatchObject({ epic_id: EPIC_ID, state: 'active' });
    expect(second).toMatchObject({ epic_id: SECOND_EPIC_ID, state: 'active' });
    expect(first.workspace_path).not.toBe(second.workspace_path);
    expect(first.branch).not.toBe(second.branch);
  });

  it('reconciles an interruption after Git creates the worktree', () => {
    const fixture = repository();
    const interrupted = createGitWorkspaceProvider(fixture.root, {
      afterWorktreeAdd: () => {
        throw new Error('simulated interruption');
      },
    });

    expect(() => interrupted.ensure(EPIC_ID)).toThrow(/simulated interruption/u);
    expect(JSON.parse(readFileSync(fixture.statePath, 'utf8'))).toMatchObject({ state: 'creating' });
    expect(createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID)).toMatchObject({
      state: 'active',
      clean: true,
      blockers: [],
    });
  });

  it('reports dirty topology as stale and blocks readiness', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    writeFileSync(join(fixture.workspace, 'dirty.txt'), 'dirty\n');
    const workspaceProvider = createGitWorkspaceProvider(fixture.workspace);

    expect(workspaceProvider.status(EPIC_ID)).toMatchObject({
      state: 'stale',
      current_cwd: 'workspace',
      current_cwd_match: true,
      clean: false,
      blockers: [{ code: 'workspace_dirty' }],
    });
    expect(() => workspaceProvider.markCleanupReady(EPIC_ID)).toThrow(/workspace_dirty/u);
  });

  it('reports detached and wrong workspace branches without modifying state', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    const before = readFileSync(fixture.statePath, 'utf8');
    const workspaceProvider = createGitWorkspaceProvider(fixture.workspace);

    git(fixture.workspace, 'checkout', '--detach');
    expect(workspaceProvider.status(EPIC_ID)).toMatchObject({
      state: 'stale',
      blockers: [{ code: 'branch_mismatch', message: expect.stringMatching(/detached or mismatched/u) }],
    });
    expect(() => workspaceProvider.markCleanupReady(EPIC_ID)).toThrow(/branch_mismatch/u);
    expect(readFileSync(fixture.statePath, 'utf8')).toBe(before);

    git(fixture.workspace, 'switch', '-c', 'unrelated-workspace-branch');
    expect(workspaceProvider.status(EPIC_ID)).toMatchObject({
      state: 'stale',
      blockers: [{ code: 'branch_mismatch', message: expect.stringMatching(/detached or mismatched/u) }],
    });
    expect(() => workspaceProvider.ensure(EPIC_ID)).toThrow(/branch_mismatch/u);
    expect(readFileSync(fixture.statePath, 'utf8')).toBe(before);
  });

  it('rejects bare repositories before creating workspace state', () => {
    const container = mkdtempSync(join(tmpdir(), 'harnessctl bare workspace '));
    roots.push(container);
    const bare = join(container, 'bare repo.git');
    mkdirSync(bare);
    git(bare, 'init', '--bare', '--initial-branch=main');

    expect(() => createGitWorkspaceProvider(bare).status(EPIC_ID)).toThrowError(
      expect.objectContaining<Partial<WorkspaceError>>({
        category: 'repository_discovery',
        message: expect.stringMatching(/non-bare Git repository/u),
      }),
    );
    expect(existsSync(join(bare, 'harnessctl'))).toBe(false);
  });

  it('requires exact workspace and primary CWDs for forward lifecycle transitions', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    const nested = join(fixture.workspace, 'nested');
    mkdirSync(nested);

    expect(() => createGitWorkspaceProvider(fixture.root).markCleanupReady(EPIC_ID)).toThrow(/exact Epic workspace/u);
    expect(() => createGitWorkspaceProvider(nested).markCleanupReady(EPIC_ID)).toThrow(/exact Epic workspace/u);
    rmSync(nested, { recursive: true });
    expect(createGitWorkspaceProvider(fixture.workspace).markCleanupReady(EPIC_ID)).toMatchObject({
      state: 'cleanup_ready',
      blockers: [],
    });
    expect(() => createGitWorkspaceProvider(fixture.workspace).cleanup(EPIC_ID)).toThrow(/exact primary checkout/u);
  });

  it('removes only a clean ready workspace and retains its branch', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    createGitWorkspaceProvider(fixture.workspace).markCleanupReady(EPIC_ID);

    expect(createGitWorkspaceProvider(fixture.root).cleanup(EPIC_ID)).toMatchObject({
      state: 'closed',
      current_cwd: 'primary',
      clean: null,
      blockers: [],
    });
    expect(existsSync(fixture.workspace)).toBe(false);
    expect(git(fixture.root, 'show-ref', '--verify', `refs/heads/${fixture.branch}`)).not.toBe('');
    expect(() => createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID)).toThrow(/cannot be reopened/u);
  });

  it('recovers an ambiguous timeout after unlock without a blind retry', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    createGitWorkspaceProvider(fixture.workspace).markCleanupReady(EPIC_ID);
    const interrupted = createGitWorkspaceProvider(fixture.root, {
      afterWorktreeUnlock: () => {
        throw new WorkspaceError('git_execution', 'simulated Git timeout');
      },
    });

    expect(() => interrupted.cleanup(EPIC_ID)).toThrow(/exact cleanup-ready worktree remains/u);
    expect(existsSync(fixture.workspace)).toBe(true);
    expect(JSON.parse(readFileSync(fixture.statePath, 'utf8'))).toMatchObject({
      state: 'cleanup_ready',
      cleanup_started_at: expect.any(String),
    });
    expect(createGitWorkspaceProvider(fixture.root).cleanup(EPIC_ID)).toMatchObject({ state: 'closed', blockers: [] });
  });

  it('records closure on retry after an ambiguous timeout following removal', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    createGitWorkspaceProvider(fixture.workspace).markCleanupReady(EPIC_ID);
    const interrupted = createGitWorkspaceProvider(fixture.root, {
      afterWorktreeRemove: () => {
        throw new WorkspaceError('git_execution', 'simulated Git timeout');
      },
    });

    expect(() => interrupted.cleanup(EPIC_ID)).toThrow(/worktree removed; rerun cleanup to record closure/u);
    expect(existsSync(fixture.workspace)).toBe(false);
    expect(JSON.parse(readFileSync(fixture.statePath, 'utf8'))).toMatchObject({ state: 'cleanup_ready' });
    expect(createGitWorkspaceProvider(fixture.root).cleanup(EPIC_ID)).toMatchObject({ state: 'closed', blockers: [] });
    expect(git(fixture.root, 'show-ref', '--verify', `refs/heads/${fixture.branch}`)).not.toBe('');
  });

  it('fails closed on deterministic branch and path collisions', () => {
    const branchCollision = repository();
    git(branchCollision.root, 'branch', branchCollision.branch);
    expect(() => createGitWorkspaceProvider(branchCollision.root).ensure(EPIC_ID)).toThrowError(
      expect.objectContaining<Partial<WorkspaceError>>({ category: 'conflict' }),
    );
    expect(existsSync(branchCollision.statePath)).toBe(false);

    const pathCollision = repository();
    mkdirSync(pathCollision.workspace, { recursive: true });
    expect(() => createGitWorkspaceProvider(pathCollision.root).ensure(EPIC_ID)).toThrow(/path is already occupied/u);
    expect(existsSync(pathCollision.statePath)).toBe(false);
  });

  it('rejects malformed persisted state without modifying it', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    writeFileSync(fixture.statePath, '{"schema_version":2}\n', 'utf8');
    const before = readFileSync(fixture.statePath, 'utf8');

    expect(() => createGitWorkspaceProvider(fixture.root).status(EPIC_ID)).toThrow(/unsupported fields/u);
    expect(readFileSync(fixture.statePath, 'utf8')).toBe(before);
  });

  it('reports a missing registered workspace as stale without repairing it', () => {
    const fixture = repository();
    createGitWorkspaceProvider(fixture.root).ensure(EPIC_ID);
    rmSync(fixture.workspace, { recursive: true });

    expect(createGitWorkspaceProvider(fixture.root).status(EPIC_ID)).toMatchObject({
      state: 'stale',
      clean: null,
      blockers: expect.arrayContaining([{ code: 'workspace_missing', message: expect.any(String) }]),
    });
    expect(existsSync(fixture.workspace)).toBe(false);
  });
});
