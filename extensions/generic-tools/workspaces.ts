import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ConfigError, readConfig } from './config.js';
import { isPrefixedIdentity } from './identities.js';
import { discoverIssueStorage, resolveIssueCandidate, validateIssueRoot } from './issues-storage.js';

const STATE_SCHEMA_VERSION = 1;
const STATE_DIRECTORY = join('harnessctl', 'workspaces');
const LOCK_DIRECTORY = join('harnessctl', 'workspaces.lock');
const MAX_STATE_BYTES = 64 * 1024;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_GIT_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_WAIT_MS = 5_000;
const WORKSPACE_STATES = ['creating', 'active', 'cleanup_ready', 'closed'] as const;

export type WorkspaceLifecycle = (typeof WORKSPACE_STATES)[number];
export type WorkspaceStatusState = 'absent' | WorkspaceLifecycle | 'stale';
export type WorkspaceErrorCategory =
  | 'configuration'
  | 'repository_discovery'
  | 'authority'
  | 'conflict'
  | 'unsafe_state'
  | 'git_execution'
  | 'synchronization';

export interface WorkspaceBlocker {
  code: string;
  message: string;
}

export interface WorkspaceResult {
  epic_id: string;
  repository: string;
  primary_path: string;
  workspace_path: string;
  branch: string;
  state: WorkspaceStatusState;
  current_cwd: 'primary' | 'workspace' | 'other';
  current_cwd_match: boolean;
  clean: boolean | null;
  blockers: WorkspaceBlocker[];
}

export interface WorkspaceProviderOptions {
  gitPath?: string;
  gitTimeoutMs?: number;
  lockWaitMs?: number;
  clock?: () => Date;
  /** Deterministic interruption seam used only by real-repository tests. */
  afterWorktreeAdd?: () => void;
  /** Deterministic interruption seams used only by real-repository tests. */
  afterWorktreeUnlock?: () => void;
  afterWorktreeRemove?: () => void;
}

export interface GitWorkspaceProvider {
  ensure(epicId: string): WorkspaceResult;
  status(epicId: string): WorkspaceResult;
  markCleanupReady(epicId: string): WorkspaceResult;
  cleanup(epicId: string): WorkspaceResult;
}

export class WorkspaceError extends Error {
  public constructor(
    public readonly category: WorkspaceErrorCategory,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

interface WorkspaceRecord {
  schema_version: typeof STATE_SCHEMA_VERSION;
  repository: string;
  epic_id: string;
  primary_path: string;
  workspace_path: string;
  branch: string;
  state: WorkspaceLifecycle;
  cleanup_started_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked?: string;
  prunable?: string;
}

interface RepositoryTopology {
  repository: string;
  commonDir: string;
  primaryPath: string;
  currentRoot: string;
  currentPath: string;
  worktrees: WorktreeEntry[];
}

interface Runtime {
  gitPath: string;
  gitTimeoutMs: number;
  lockWaitMs: number;
  clock: () => Date;
  afterWorktreeAdd?: () => void;
  afterWorktreeUnlock?: () => void;
  afterWorktreeRemove?: () => void;
}

export function createGitWorkspaceProvider(cwd: string, options: WorkspaceProviderOptions = {}): GitWorkspaceProvider {
  const runtime = runtimeOptions(options);
  return {
    ensure: (epicId) => ensureWorkspace(cwd, epicId, runtime),
    status: (epicId) => statusWorkspace(cwd, epicId, runtime),
    markCleanupReady: (epicId) => markWorkspaceCleanupReady(cwd, epicId, runtime),
    cleanup: (epicId) => cleanupWorkspace(cwd, epicId, runtime),
  };
}

export function workspaceEnsure(cwd: string, epicId: string, options: WorkspaceProviderOptions = {}): WorkspaceResult {
  return createGitWorkspaceProvider(cwd, options).ensure(epicId);
}

export function workspaceStatus(cwd: string, epicId: string, options: WorkspaceProviderOptions = {}): WorkspaceResult {
  return createGitWorkspaceProvider(cwd, options).status(epicId);
}

export function workspaceMarkCleanupReady(
  cwd: string,
  epicId: string,
  options: WorkspaceProviderOptions = {},
): WorkspaceResult {
  return createGitWorkspaceProvider(cwd, options).markCleanupReady(epicId);
}

export function workspaceCleanup(cwd: string, epicId: string, options: WorkspaceProviderOptions = {}): WorkspaceResult {
  return createGitWorkspaceProvider(cwd, options).cleanup(epicId);
}

function ensureWorkspace(cwd: string, epicId: string, runtime: Runtime): WorkspaceResult {
  const context = loadContext(cwd, epicId, runtime);
  return withWorkspaceLock(context.commonDir, runtime.lockWaitMs, () => {
    const topology = discoverTopology(cwd, runtime);
    const current = readState(topology.commonDir, epicId);
    if (current) {
      assertRecordIdentity(current, topology, epicId);
      if (current.state === 'closed') throw new WorkspaceError('unsafe_state', 'closed workspace cannot be reopened');
      assertEnsureCwd(topology, current);
      let reconciled = reconcileResult(topology, current, runtime);
      if (
        current.state === 'creating' &&
        reconciled.blockers.length === 1 &&
        reconciled.blockers[0]?.code === 'ownership_lock_mismatch'
      ) {
        runGit(
          topology.primaryPath,
          ['worktree', 'lock', '--reason', `harnessctl:${epicId}`, current.workspace_path],
          runtime,
        );
        reconciled = reconcileResult(discoverTopology(cwd, runtime), current, runtime);
      }
      if (current.state === 'creating' && reconciled.blockers.length === 0) {
        const active = updateState(topology.commonDir, current, 'active', runtime.clock);
        return reconcileResult(discoverTopology(cwd, runtime), active, runtime);
      }
      if (current.state !== 'creating' && reconciled.blockers.length === 0) return reconciled;
      throw new WorkspaceError('unsafe_state', blockerMessage(reconciled));
    }

    assertExactCwd(topology, topology.primaryPath, 'workspace creation must run from the exact primary checkout');
    assertClean(topology.primaryPath, runtime, 'primary checkout must be clean before workspace creation');
    const issuePath = requireCanonicalEpic(topology.primaryPath, epicId);
    assertCommittedAuthority(topology.primaryPath, issuePath, runtime);
    const mapping = expectedMapping(topology, epicId);
    assertCreationIdentitiesAvailable(topology, mapping.workspacePath, mapping.branch, runtime);

    const now = validNow(runtime.clock);
    const creating: WorkspaceRecord = {
      schema_version: STATE_SCHEMA_VERSION,
      repository: topology.repository,
      epic_id: epicId,
      primary_path: topology.primaryPath,
      workspace_path: mapping.workspacePath,
      branch: mapping.branch,
      state: 'creating',
      cleanup_started_at: null,
      created_at: now,
      updated_at: now,
    };
    writeState(topology.commonDir, creating);
    try {
      runGit(topology.primaryPath, ['worktree', 'add', '-b', mapping.branch, mapping.workspacePath, 'HEAD'], runtime);
      runtime.afterWorktreeAdd?.();
      runGit(
        topology.primaryPath,
        ['worktree', 'lock', '--reason', `harnessctl:${epicId}`, mapping.workspacePath],
        runtime,
      );
    } catch (error: unknown) {
      const observed = discoverTopology(cwd, runtime);
      const result = reconcileResult(observed, creating, runtime);
      if (result.blockers.length !== 0) throw error;
    }
    const observed = discoverTopology(cwd, runtime);
    const result = reconcileResult(observed, creating, runtime);
    if (result.blockers.length !== 0)
      throw new WorkspaceError(
        'synchronization',
        `workspace creation could not be reconciled: ${blockerMessage(result)}`,
      );
    const active = updateState(topology.commonDir, creating, 'active', runtime.clock);
    return reconcileResult(observed, active, runtime);
  });
}

function statusWorkspace(cwd: string, epicId: string, runtime: Runtime): WorkspaceResult {
  const topology = loadContext(cwd, epicId, runtime);
  const record = readState(topology.commonDir, epicId);
  if (!record) return absentResult(topology, epicId);
  assertRecordIdentity(record, topology, epicId);
  return reconcileResult(topology, record, runtime);
}

function markWorkspaceCleanupReady(cwd: string, epicId: string, runtime: Runtime): WorkspaceResult {
  const topology = loadContext(cwd, epicId, runtime);
  return withWorkspaceLock(topology.commonDir, runtime.lockWaitMs, () => {
    const record = requireState(topology.commonDir, epicId);
    assertRecordIdentity(record, topology, epicId);
    if (record.state !== 'active')
      throw new WorkspaceError('unsafe_state', `workspace must be active, found ${record.state}`);
    assertExactCwd(topology, record.workspace_path, 'cleanup readiness must run from the exact Epic workspace');
    const status = reconcileResult(topology, record, runtime);
    if (status.blockers.length !== 0) throw new WorkspaceError('unsafe_state', blockerMessage(status));
    assertClean(record.workspace_path, runtime, 'Epic workspace must be clean before cleanup readiness');
    const ready = updateState(topology.commonDir, record, 'cleanup_ready', runtime.clock);
    return reconcileResult(topology, ready, runtime);
  });
}

function cleanupWorkspace(cwd: string, epicId: string, runtime: Runtime): WorkspaceResult {
  const topology = loadContext(cwd, epicId, runtime);
  return withWorkspaceLock(topology.commonDir, runtime.lockWaitMs, () => {
    const record = requireState(topology.commonDir, epicId);
    assertRecordIdentity(record, topology, epicId);
    if (record.state !== 'cleanup_ready')
      throw new WorkspaceError('unsafe_state', `workspace must be cleanup_ready, found ${record.state}`);
    assertExactCwd(topology, record.primary_path, 'workspace cleanup must run from the exact primary checkout');
    if (isWithin(record.workspace_path, topology.currentPath))
      throw new WorkspaceError('unsafe_state', 'workspace cleanup cannot remove the current directory or its ancestor');
    const status = reconcileCleanup(topology, record, runtime);
    if (status.complete) return closeRemovedWorkspace(topology, record, runtime);
    if (status.blockers.length !== 0)
      throw new WorkspaceError(
        'unsafe_state',
        status.blockers.map(({ code, message }) => `${code}: ${message}`).join('; '),
      );
    assertClean(record.workspace_path, runtime, 'Epic workspace must be clean before cleanup');
    const removing =
      record.cleanup_started_at === null ? beginCleanup(topology.commonDir, record, runtime.clock) : record;
    try {
      if (status.entry?.locked === `harnessctl:${record.epic_id}`) {
        runGit(record.primary_path, ['worktree', 'unlock', record.workspace_path], runtime);
        runtime.afterWorktreeUnlock?.();
      }
      runGit(record.primary_path, ['worktree', 'remove', record.workspace_path], runtime);
      runtime.afterWorktreeRemove?.();
    } catch (error: unknown) {
      const observed = discoverTopology(cwd, runtime);
      throw new WorkspaceError(
        error instanceof WorkspaceError ? error.category : 'git_execution',
        `${safeMessage(error)}; cleanup outcome: ${describeCleanupOutcome(observed, removing, runtime)}`,
      );
    }
    const observed = discoverTopology(cwd, runtime);
    if (findWorktree(observed, record.workspace_path) || existsSync(record.workspace_path))
      throw new WorkspaceError('synchronization', 'Git did not remove the exact Epic workspace');
    return closeRemovedWorkspace(observed, removing, runtime);
  });
}

function reconcileCleanup(
  topology: RepositoryTopology,
  record: WorkspaceRecord,
  runtime: Runtime,
): { blockers: WorkspaceBlocker[]; complete: boolean; entry?: WorktreeEntry } {
  const entry = findWorktree(topology, record.workspace_path);
  const present = existsSync(record.workspace_path);
  if (!entry && !present) {
    return record.cleanup_started_at === null
      ? { blockers: [blocker('registration_missing', 'workspace is not registered with Git')], complete: false }
      : { blockers: [], complete: true };
  }
  const blockers: WorkspaceBlocker[] = [];
  if (!entry) blockers.push(blocker('registration_missing', 'workspace is not registered with Git'));
  if (!present) blockers.push(blocker('workspace_missing', 'workspace path does not exist'));
  if (entry) {
    if (entry.branch !== record.branch)
      blockers.push(blocker('branch_mismatch', 'workspace branch is detached or mismatched'));
    if (entry.prunable !== undefined)
      blockers.push(blocker('worktree_prunable', 'Git reports the workspace as prunable'));
    const expectedLock = `harnessctl:${record.epic_id}`;
    if (entry.locked !== expectedLock && !(record.cleanup_started_at !== null && entry.locked === undefined))
      blockers.push(blocker('ownership_lock_mismatch', 'workspace ownership lock is missing or mismatched'));
    if (present && !isClean(record.workspace_path, runtime))
      blockers.push(blocker('workspace_dirty', 'workspace has tracked or untracked changes'));
  }
  return { blockers, complete: false, entry };
}

function closeRemovedWorkspace(
  topology: RepositoryTopology,
  record: WorkspaceRecord,
  runtime: Runtime,
): WorkspaceResult {
  if (!branchExists(record.primary_path, record.branch, runtime))
    throw new WorkspaceError('synchronization', 'Epic branch was not retained after workspace cleanup');
  const closed = updateState(topology.commonDir, record, 'closed', runtime.clock);
  return reconcileResult(topology, closed, runtime);
}

function describeCleanupOutcome(topology: RepositoryTopology, record: WorkspaceRecord, runtime: Runtime): string {
  const status = reconcileCleanup(topology, record, runtime);
  if (status.complete) return 'worktree removed; rerun cleanup to record closure';
  if (status.blockers.length === 0) return 'exact cleanup-ready worktree remains; rerun cleanup to continue';
  return status.blockers.map(({ code, message }) => `${code}: ${message}`).join('; ');
}

function loadContext(cwd: string, epicId: string, runtime: Runtime): RepositoryTopology {
  const topology = discoverTopology(cwd, runtime);
  const config = readConfig(topology.primaryPath);
  if (config instanceof ConfigError)
    throw new WorkspaceError('configuration', `unable to read primary workspace configuration: ${config.message}`);
  if (!config.skills.cvs.workspaces || !config.skills.cvs.enabled || config.skills.cvs.local !== 'git')
    throw new WorkspaceError('configuration', 'Git Epic workspaces are not enabled in the primary checkout');
  requireCanonicalEpic(topology.primaryPath, epicId);
  return topology;
}

function requireCanonicalEpic(primaryPath: string, epicId: string): string {
  const config = readConfig(primaryPath);
  if (config instanceof ConfigError) throw new WorkspaceError('configuration', config.message);
  const issues = config.skills.issues;
  if (!issues.enabled || issues.provider.type !== 'filesystem')
    throw new WorkspaceError('authority', 'workspace operations require filesystem Issue authority');
  if (!isPrefixedIdentity(epicId, issues.prefix)) throw new WorkspaceError('authority', 'Epic ID is invalid');
  const storage = discoverIssueStorage(primaryPath, {
    issuePrefix: issues.prefix,
    issueRoot: validateIssueRoot(issues.root),
  });
  try {
    const candidate = resolveIssueCandidate(storage, epicId, 'active');
    const issue = candidate.decoded?.issue;
    if (!issue || issue.type !== 'epic') throw new WorkspaceError('authority', `${epicId} is not a canonical Epic`);
    return candidate.absolutePath;
  } catch (error: unknown) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError('authority', safeMessage(error));
  }
}

function discoverTopology(cwd: string, runtime: Runtime): RepositoryTopology {
  const currentPath = canonicalExistingDirectory(cwd, 'current working directory');
  if (gitText(currentPath, ['rev-parse', '--is-bare-repository'], runtime).trim() !== 'false')
    throw new WorkspaceError('repository_discovery', 'workspace operations require a non-bare Git repository');
  const currentRoot = canonicalExistingDirectory(
    gitText(currentPath, ['rev-parse', '--show-toplevel'], runtime).trim(),
    'current Git worktree',
  );
  const commonOutput = gitText(currentRoot, ['rev-parse', '--git-common-dir'], runtime).trim();
  const commonDir = canonicalExistingDirectory(
    isAbsolute(commonOutput) ? commonOutput : resolve(currentRoot, commonOutput),
    'Git common directory',
  );
  const worktrees = parseWorktreePorcelain(runGit(currentRoot, ['worktree', 'list', '--porcelain', '-z'], runtime));
  if (worktrees.length === 0 || worktrees.some((entry) => entry.bare))
    throw new WorkspaceError(
      'repository_discovery',
      'Git worktree topology does not identify one non-bare primary checkout',
    );
  const primary = worktrees[0];
  if (!primary) throw new WorkspaceError('repository_discovery', 'Git primary checkout is missing');
  const primaryPath = canonicalExistingDirectory(primary.path, 'primary Git checkout');
  const repository = `${commonDir}\0${primaryPath}`;
  return { repository, commonDir, primaryPath, currentRoot, currentPath, worktrees };
}

function parseWorktreePorcelain(output: Buffer): WorktreeEntry[] {
  const fields = decodeUtf8(output, 'Git worktree topology').split('\0');
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;
  for (const field of fields) {
    if (field === '') {
      if (current) entries.push(current);
      current = undefined;
      continue;
    }
    const separator = field.indexOf(' ');
    const key = separator < 0 ? field : field.slice(0, separator);
    const value = separator < 0 ? '' : field.slice(separator + 1);
    if (key === 'worktree') {
      if (current) throw new WorkspaceError('repository_discovery', 'malformed Git worktree topology');
      current = { path: canonicalReportedPath(value), bare: false, detached: false };
      continue;
    }
    if (!current) throw new WorkspaceError('repository_discovery', 'malformed Git worktree topology');
    if (key === 'HEAD') current.head = value;
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//u, '');
    else if (key === 'bare') current.bare = true;
    else if (key === 'detached') current.detached = true;
    else if (key === 'locked') current.locked = value;
    else if (key === 'prunable') current.prunable = value;
  }
  if (current) throw new WorkspaceError('repository_discovery', 'unterminated Git worktree topology');
  return entries;
}

function reconcileResult(topology: RepositoryTopology, record: WorkspaceRecord, runtime: Runtime): WorkspaceResult {
  const blockers: WorkspaceBlocker[] = [];
  const entry = findWorktree(topology, record.workspace_path);
  let clean: boolean | null = null;
  if (record.state !== 'closed') {
    if (!existsSync(record.workspace_path))
      blockers.push(blocker('workspace_missing', 'workspace path does not exist'));
    if (!entry) blockers.push(blocker('registration_missing', 'workspace is not registered with Git'));
    else {
      if (entry.branch !== record.branch)
        blockers.push(blocker('branch_mismatch', 'workspace branch is detached or mismatched'));
      if (entry.prunable !== undefined)
        blockers.push(blocker('worktree_prunable', 'Git reports the workspace as prunable'));
      if (entry.locked !== `harnessctl:${record.epic_id}`)
        blockers.push(blocker('ownership_lock_mismatch', 'workspace ownership lock is missing or mismatched'));
      if (existsSync(record.workspace_path)) {
        clean = isClean(record.workspace_path, runtime);
        if (!clean) blockers.push(blocker('workspace_dirty', 'workspace has tracked or untracked changes'));
      }
    }
  } else if (entry || existsSync(record.workspace_path)) {
    blockers.push(blocker('closed_workspace_present', 'closed workspace remains registered or present'));
  }
  return resultFrom(topology, record, blockers.length === 0 ? record.state : 'stale', clean, blockers);
}

function absentResult(topology: RepositoryTopology, epicId: string): WorkspaceResult {
  const mapping = expectedMapping(topology, epicId);
  const record: WorkspaceRecord = {
    schema_version: STATE_SCHEMA_VERSION,
    repository: topology.repository,
    epic_id: epicId,
    primary_path: topology.primaryPath,
    workspace_path: mapping.workspacePath,
    branch: mapping.branch,
    state: 'creating',
    cleanup_started_at: null,
    created_at: '',
    updated_at: '',
  };
  return resultFrom(topology, record, 'absent', null, []);
}

function resultFrom(
  topology: RepositoryTopology,
  record: WorkspaceRecord,
  state: WorkspaceStatusState,
  clean: boolean | null,
  blockers: WorkspaceBlocker[],
): WorkspaceResult {
  const currentCwd =
    topology.currentPath === record.primary_path
      ? 'primary'
      : topology.currentPath === record.workspace_path
        ? 'workspace'
        : 'other';
  return {
    epic_id: record.epic_id,
    repository: record.repository,
    primary_path: record.primary_path,
    workspace_path: record.workspace_path,
    branch: record.branch,
    state,
    current_cwd: currentCwd,
    current_cwd_match: currentCwd === 'workspace',
    clean,
    blockers,
  };
}

function expectedMapping(topology: RepositoryTopology, epicId: string): { workspacePath: string; branch: string } {
  return {
    workspacePath: resolve(dirname(topology.primaryPath), `${basename(topology.primaryPath)}--workspaces`, epicId),
    branch: `harnessctl/epic/${epicId}`,
  };
}

function assertCreationIdentitiesAvailable(
  topology: RepositoryTopology,
  workspacePath: string,
  branch: string,
  runtime: Runtime,
): void {
  if (existsSync(workspacePath) || findWorktree(topology, workspacePath))
    throw new WorkspaceError('conflict', `deterministic workspace path is already occupied: ${workspacePath}`);
  if (branchExists(topology.primaryPath, branch, runtime))
    throw new WorkspaceError('conflict', `deterministic workspace branch already exists: ${branch}`);
}

function assertCommittedAuthority(primaryPath: string, issuePath: string, runtime: Runtime): void {
  const repositoryPath = relative(primaryPath, issuePath).split(sep).join('/');
  if (!repositoryPath || repositoryPath === '..' || repositoryPath.startsWith(`../`) || isAbsolute(repositoryPath))
    throw new WorkspaceError('authority', 'canonical Epic authority must be inside the primary checkout');
  const result = runGitResult(primaryPath, ['cat-file', '-e', `HEAD:${repositoryPath}`], runtime);
  if (result.status !== 0)
    throw new WorkspaceError('authority', 'canonical Epic authority must exist in primary HEAD before creation');
}

function branchExists(primaryPath: string, branch: string, runtime: Runtime): boolean {
  const result = runGitResult(primaryPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], runtime);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw gitResultError(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], result);
}

function findWorktree(topology: RepositoryTopology, path: string): WorktreeEntry | undefined {
  return topology.worktrees.find((entry) => entry.path === path);
}

function isClean(path: string, runtime: Runtime): boolean {
  return runGit(path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], runtime).byteLength === 0;
}

function assertClean(path: string, runtime: Runtime, message: string): void {
  if (!isClean(path, runtime)) throw new WorkspaceError('unsafe_state', message);
}

function assertExactCwd(topology: RepositoryTopology, expected: string, message: string): void {
  if (topology.currentPath !== expected) throw new WorkspaceError('unsafe_state', `${message}; expected ${expected}`);
}

function assertEnsureCwd(topology: RepositoryTopology, record: WorkspaceRecord): void {
  if (topology.currentPath === record.primary_path || topology.currentPath === record.workspace_path) return;
  throw new WorkspaceError(
    'unsafe_state',
    `workspace ensure must run from the exact primary checkout or exact Epic workspace; expected ${record.primary_path} or ${record.workspace_path}`,
  );
}

function assertRecordIdentity(record: WorkspaceRecord, topology: RepositoryTopology, epicId: string): void {
  const expected = expectedMapping(topology, epicId);
  if (
    record.repository !== topology.repository ||
    record.epic_id !== epicId ||
    record.primary_path !== topology.primaryPath ||
    record.workspace_path !== expected.workspacePath ||
    record.branch !== expected.branch
  )
    throw new WorkspaceError('conflict', 'workspace metadata does not match deterministic repository ownership');
}

function statePath(commonDir: string, epicId: string): string {
  return join(commonDir, STATE_DIRECTORY, `${epicId}.json`);
}

function readState(commonDir: string, epicId: string): WorkspaceRecord | undefined {
  const path = statePath(commonDir, epicId);
  if (!existsSync(path)) return undefined;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES)
    throw new WorkspaceError('synchronization', 'workspace metadata must be a bounded regular file');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: unknown) {
    throw new WorkspaceError('synchronization', `workspace metadata is malformed: ${safeMessage(error)}`);
  }
  return validateRecord(parsed);
}

function requireState(commonDir: string, epicId: string): WorkspaceRecord {
  const record = readState(commonDir, epicId);
  if (!record) throw new WorkspaceError('unsafe_state', 'workspace metadata does not exist');
  return record;
}

function validateRecord(value: unknown): WorkspaceRecord {
  if (!isRecord(value)) throw new WorkspaceError('synchronization', 'workspace metadata must be an object');
  const keys = Object.keys(value).sort();
  const expected = [
    'branch',
    'cleanup_started_at',
    'created_at',
    'epic_id',
    'primary_path',
    'repository',
    'schema_version',
    'state',
    'updated_at',
    'workspace_path',
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]))
    throw new WorkspaceError('synchronization', 'workspace metadata contains unsupported fields');
  if (value.schema_version !== STATE_SCHEMA_VERSION)
    throw new WorkspaceError('synchronization', 'workspace metadata schema version is unsupported');
  for (const key of ['repository', 'epic_id', 'primary_path', 'workspace_path', 'branch', 'created_at', 'updated_at'])
    if (typeof value[key] !== 'string' || value[key].length === 0)
      throw new WorkspaceError('synchronization', `workspace metadata field is invalid: ${key}`);
  if (typeof value.state !== 'string' || !WORKSPACE_STATES.includes(value.state as WorkspaceLifecycle))
    throw new WorkspaceError('synchronization', 'workspace metadata lifecycle state is invalid');
  if (
    value.cleanup_started_at !== null &&
    (typeof value.cleanup_started_at !== 'string' || !validIsoDate(value.cleanup_started_at))
  )
    throw new WorkspaceError('synchronization', 'workspace metadata cleanup timestamp is invalid');
  if (!validIsoDate(value.created_at as string) || !validIsoDate(value.updated_at as string))
    throw new WorkspaceError('synchronization', 'workspace metadata timestamp is invalid');
  return value as unknown as WorkspaceRecord;
}

function beginCleanup(commonDir: string, record: WorkspaceRecord, clock: () => Date): WorkspaceRecord {
  const now = validNow(clock);
  const next = { ...record, cleanup_started_at: now, updated_at: now };
  writeState(commonDir, next);
  return next;
}

function updateState(
  commonDir: string,
  record: WorkspaceRecord,
  state: WorkspaceLifecycle,
  clock: () => Date,
): WorkspaceRecord {
  const next = { ...record, state, updated_at: validNow(clock) };
  writeState(commonDir, next);
  return next;
}

function writeState(commonDir: string, record: WorkspaceRecord): void {
  const directory = ensureStateDirectory(commonDir);
  const destination = statePath(commonDir, record.epic_id);
  const temporary = join(directory, `.${record.epic_id}.${randomBytes(12).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (existsSync(destination)) assertRegularFile(destination, 'workspace metadata');
    renameSync(temporary, destination);
    syncDirectory(directory);
  } catch (error: unknown) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError('synchronization', `cannot publish workspace metadata: ${safeMessage(error)}`);
  }
}

function ensureStateDirectory(commonDir: string): string {
  let current = commonDir;
  for (const component of STATE_DIRECTORY.split(sep)) {
    current = join(current, component);
    const created = mkdirSync(current, { mode: 0o700, recursive: true });
    assertDirectory(current, 'workspace state directory');
    if (created !== undefined) {
      syncDirectory(dirname(current));
    }
  }
  return current;
}

function withWorkspaceLock<T>(commonDir: string, waitMs: number, operation: () => T): T {
  const harnessctlDirectory = join(commonDir, 'harnessctl');
  const created = mkdirSync(harnessctlDirectory, { mode: 0o700, recursive: true });
  assertDirectory(harnessctlDirectory, 'workspace state root');
  if (created !== undefined) {
    syncDirectory(commonDir);
  }
  const lock = join(commonDir, LOCK_DIRECTORY);
  const deadline = Date.now() + waitMs;
  while (true) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error: unknown) {
      if (!hasCode(error, 'EEXIST')) throw new WorkspaceError('synchronization', 'cannot acquire workspace lock');
      if (Date.now() >= deadline) throw new WorkspaceError('synchronization', 'workspace lock is busy', true);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return operation();
  } finally {
    try {
      rmSync(lock, { recursive: true });
      syncDirectory(dirname(lock));
    } catch {
      // A failed release intentionally leaves the lock behind and blocks later mutation.
    }
  }
}

function runGit(cwd: string, args: readonly string[], runtime: Runtime): Buffer {
  const result = runGitResult(cwd, args, runtime);
  if (result.status !== 0) throw gitResultError(args, result);
  return result.stdout;
}

function gitText(cwd: string, args: readonly string[], runtime: Runtime): string {
  return decodeUtf8(runGit(cwd, args, runtime), `git ${args[0] ?? ''} output`);
}

function runGitResult(cwd: string, args: readonly string[], runtime: Runtime) {
  const result = spawnSync(runtime.gitPath, [...args], {
    cwd,
    encoding: 'buffer',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: runtime.gitTimeoutMs,
    windowsHide: true,
    shell: false,
  });
  if (result.error)
    throw new WorkspaceError(
      'git_execution',
      `git ${args[0] ?? 'command'} failed: ${boundedDiagnostic(result.error.message)}`,
    );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gitResultError(
  args: readonly string[],
  result: { status: number | null; stdout: Buffer; stderr: Buffer },
): WorkspaceError {
  const diagnostic = boundedDiagnostic(
    decodeUtf8(result.stderr, 'Git diagnostic') || decodeUtf8(result.stdout, 'Git output'),
  );
  return new WorkspaceError(
    'git_execution',
    `git ${args[0] ?? 'command'} exited ${result.status ?? 'without status'}${diagnostic ? `: ${diagnostic}` : ''}`,
  );
}

function runtimeOptions(options: WorkspaceProviderOptions): Runtime {
  const gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  const lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
  if (!Number.isInteger(gitTimeoutMs) || gitTimeoutMs < 1 || gitTimeoutMs > DEFAULT_GIT_TIMEOUT_MS)
    throw new WorkspaceError('configuration', 'Git timeout must be between 1 and 30000 milliseconds');
  if (!Number.isInteger(lockWaitMs) || lockWaitMs < 0 || lockWaitMs > DEFAULT_LOCK_WAIT_MS)
    throw new WorkspaceError('configuration', 'workspace lock wait must be between 0 and 5000 milliseconds');
  if (options.gitPath !== undefined && (!options.gitPath || options.gitPath.includes('\0')))
    throw new WorkspaceError('configuration', 'Git executable path is invalid');
  return {
    gitPath: options.gitPath ?? 'git',
    gitTimeoutMs,
    lockWaitMs,
    clock: options.clock ?? (() => new Date()),
    afterWorktreeAdd: options.afterWorktreeAdd,
    afterWorktreeUnlock: options.afterWorktreeUnlock,
    afterWorktreeRemove: options.afterWorktreeRemove,
  };
}

function canonicalExistingDirectory(path: string, label: string): string {
  try {
    const canonical = realpathSync(resolve(path));
    assertDirectory(canonical, label);
    return canonical;
  } catch (error: unknown) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError('repository_discovery', `${label} is unavailable: ${safeMessage(error)}`);
  }
}

function canonicalReportedPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function assertDirectory(path: string, label: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new WorkspaceError('unsafe_state', `${label} must be a non-symlink directory`);
}

function assertRegularFile(path: string, label: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new WorkspaceError('unsafe_state', `${label} must be a non-symlink regular file`);
}

function syncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error: unknown) {
    if (process.platform !== 'win32')
      throw new WorkspaceError('synchronization', `cannot synchronize workspace directory: ${safeMessage(error)}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validNow(clock: () => Date): string {
  const date = clock();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new WorkspaceError('configuration', 'workspace clock returned an invalid date');
  return date.toISOString();
}

function validIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function decodeUtf8(value: Buffer, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch (error: unknown) {
    throw new WorkspaceError('git_execution', `${label} is not UTF-8: ${safeMessage(error)}`);
  }
}

function boundedDiagnostic(value: string): string {
  return (
    value
      // Git output can contain C0 bytes; preserve whitespace while neutralizing unsafe diagnostics.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '?')
      .trim()
      .slice(0, 2_000)
  );
}

function blocker(code: string, message: string): WorkspaceBlocker {
  return { code, message };
}

function blockerMessage(result: WorkspaceResult): string {
  return result.blockers.map(({ code, message }) => `${code}: ${message}`).join('; ') || 'workspace state is stale';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function isWithin(parent: string, child: string): boolean {
  const offset = relative(parent, child);
  return offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset));
}

function safeMessage(error: unknown): string {
  return boundedDiagnostic(error instanceof Error ? error.message : String(error));
}
