import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { ConfigError, readConfig } from './config.js';
import { createUlid, isPrefixedIdentity, isUlid } from './identities.js';
import { discoverIssueStorage, resolveIssueCandidate, validateIssueRoot } from './issues-storage.js';

const WORKSPACE_SCHEMA_VERSION = 2;
const BINDING_SCHEMA_VERSION = 1;
const WORKSPACE_DIRECTORY = join('harnessctl', 'workspaces', 'v2');
const BINDING_DIRECTORY = join('harnessctl', 'session-bindings', 'v1');
const LOCK_DIRECTORY = join('harnessctl', 'locks', 'execution-context.lock');
const TRANSACTION_PATH = join('harnessctl', 'transactions', 'execution-context.json');
const LEGACY_WORKSPACE_DIRECTORY = join('harnessctl', 'workspaces');
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_GIT_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_WAIT_MS = 5_000;
const HOSTS = ['opencode', 'pi'] as const;
const LIFECYCLES = ['creating', 'active', 'cleanup_ready', 'closed'] as const;
const BINDING_LIFECYCLES = ['bound', 'released'] as const;

export type ExecutionHost = (typeof HOSTS)[number];
export type ExecutionWorkspaceLifecycle = (typeof LIFECYCLES)[number];
export type SessionBindingLifecycle = (typeof BINDING_LIFECYCLES)[number];
export type ExecutionContextErrorCategory =
  | 'configuration'
  | 'repository_discovery'
  | 'authority'
  | 'conflict'
  | 'unsafe_state'
  | 'unsupported'
  | 'git_execution'
  | 'synchronization';

export interface ExecutionWorkspaceRecord {
  schema_version: typeof WORKSPACE_SCHEMA_VERSION;
  workspace_id: string;
  repository_id: string;
  primary_path: string;
  workspace_path: string;
  branch: string;
  base_revision: string;
  epic_id: string | null;
  lifecycle: ExecutionWorkspaceLifecycle;
  generation: number;
  created_at: string;
  updated_at: string;
}

export interface SessionBindingRecord {
  schema_version: typeof BINDING_SCHEMA_VERSION;
  host: ExecutionHost;
  session_key: string;
  repository_id: string;
  workspace_id: string;
  epic_id: string | null;
  lifecycle: SessionBindingLifecycle;
  generation: number;
  workspace_generation: number;
  created_at: string;
  updated_at: string;
}

export interface ExecutionContext {
  repository_id: string;
  primary_root: string;
  workspace_id: string;
  execution_root: string;
  branch: string;
  base_revision: string;
  epic_id: string | null;
  binding_generation: number;
  workspace_generation: number;
  workspace_lifecycle: ExecutionWorkspaceLifecycle;
  host: ExecutionHost;
  session_key: string;
}

export interface ExecutionContextProviderOptions {
  gitPath?: string;
  gitTimeoutMs?: number;
  lockWaitMs?: number;
  clock?: () => Date;
  ulid?: () => string;
}

export interface ExecutionContextProvider {
  hasBinding(host: ExecutionHost, sessionId: string): boolean;
  allocateProvisional(host: ExecutionHost, sessionId: string): ExecutionContext;
  attachEpic(
    host: ExecutionHost,
    sessionId: string,
    epicId: string,
    expectedBindingGeneration: number,
    expectedWorkspaceGeneration: number,
  ): ExecutionContext;
  adoptV1(host: ExecutionHost, sessionId: string, epicId: string): ExecutionContext;
  bind(
    host: ExecutionHost,
    sessionId: string,
    workspaceId: string,
    expectedBindingGeneration?: number,
    expectedWorkspaceGeneration?: number,
  ): ExecutionContext;
  resolve(host: ExecutionHost, sessionId: string, expectedBindingGeneration?: number): ExecutionContext;
  release(host: ExecutionHost, sessionId: string, expectedBindingGeneration: number): void;
}

export class ExecutionContextError extends Error {
  public constructor(
    public readonly category: ExecutionContextErrorCategory,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ExecutionContextError';
  }
}

interface WorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
  bare: boolean;
  locked?: string;
}

interface RepositoryTopology {
  repositoryId: string;
  commonDir: string;
  primaryPath: string;
  currentRoot: string;
  worktrees: WorktreeEntry[];
}

interface Runtime {
  gitPath: string;
  gitTimeoutMs: number;
  lockWaitMs: number;
  clock: () => Date;
  ulid: () => string;
}

interface ExecutionContextTransaction {
  schema_version: 1;
  workspace_id: string;
  host: ExecutionHost;
  session_key: string;
  previous_workspace: ExecutionWorkspaceRecord | null;
  previous_binding: SessionBindingRecord | null;
}

interface LockOwner {
  schema_version: 1;
  pid: number;
  hostname: string;
  process_start: string | null;
  nonce: string;
  created_at: string;
}

interface LegacyWorkspaceRecord {
  schema_version: 1;
  repository: string;
  epic_id: string;
  primary_path: string;
  workspace_path: string;
  branch: string;
  state: ExecutionWorkspaceLifecycle;
  cleanup_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export function createExecutionContextProvider(
  controlRoot: string,
  options: ExecutionContextProviderOptions = {},
): ExecutionContextProvider {
  const runtime = runtimeOptions(options);
  return {
    hasBinding: (host, sessionId) => hasBinding(controlRoot, host, sessionId, runtime),
    allocateProvisional: (host, sessionId) => allocateProvisional(controlRoot, host, sessionId, runtime),
    attachEpic: (host, sessionId, epicId, bindingGeneration, workspaceGeneration) =>
      attachEpic(controlRoot, host, sessionId, epicId, bindingGeneration, workspaceGeneration, runtime),
    adoptV1: (host, sessionId, epicId) => adoptV1(controlRoot, host, sessionId, epicId, runtime),
    bind: (host, sessionId, workspaceId, expectedBindingGeneration, expectedWorkspaceGeneration) =>
      bindSession(
        controlRoot,
        host,
        sessionId,
        workspaceId,
        expectedBindingGeneration,
        expectedWorkspaceGeneration,
        runtime,
      ),
    resolve: (host, sessionId, expectedGeneration) =>
      resolveSession(controlRoot, host, sessionId, expectedGeneration, runtime),
    release: (host, sessionId, expectedGeneration) =>
      releaseSession(controlRoot, host, sessionId, expectedGeneration, runtime),
  };
}

function hasBinding(controlRoot: string, host: ExecutionHost, sessionId: string, runtime: Runtime): boolean {
  assertHost(host);
  const sessionKey = sessionKeyFor(sessionId);
  const topology = discoverTopology(controlRoot, runtime);
  return readBinding(topology.commonDir, host, sessionKey)?.lifecycle === 'bound';
}

function allocateProvisional(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string,
  runtime: Runtime,
): ExecutionContext {
  assertHost(host);
  const sessionKey = sessionKeyFor(sessionId);
  const discovered = loadEnabledTopology(controlRoot, runtime);
  assertPrimaryControlRoot(discovered);
  return withRepositoryLock(discovered.commonDir, runtime.lockWaitMs, () => {
    const topology = refreshTopology(discovered, runtime);
    if (readBinding(topology.commonDir, host, sessionKey))
      throw new ExecutionContextError('conflict', 'host session already has an execution workspace binding');
    assertClean(
      topology.primaryPath,
      runtime,
      'primary checkout must be clean before provisional workspace allocation',
    );
    const workspaceId = newWorkspaceId(runtime);
    const workspacePath = resolve(
      dirname(topology.primaryPath),
      `${basename(topology.primaryPath)}--workspaces`,
      workspaceId,
    );
    const branch = `harnessctl/workspace/${workspaceId}`;
    assertWorkspaceIdentityAvailable(topology, workspacePath, branch, runtime);
    const baseRevision = gitText(topology.primaryPath, ['rev-parse', 'HEAD'], runtime).trim();
    assertFullCommit(baseRevision);
    const now = validNow(runtime.clock);
    const creating: ExecutionWorkspaceRecord = {
      schema_version: WORKSPACE_SCHEMA_VERSION,
      workspace_id: workspaceId,
      repository_id: topology.repositoryId,
      primary_path: topology.primaryPath,
      workspace_path: workspacePath,
      branch,
      base_revision: baseRevision,
      epic_id: null,
      lifecycle: 'creating',
      generation: 1,
      created_at: now,
      updated_at: now,
    };
    writeWorkspace(topology.commonDir, creating);
    try {
      runGit(topology.primaryPath, ['worktree', 'add', '-b', branch, workspacePath, baseRevision], runtime);
      runGit(
        topology.primaryPath,
        ['worktree', 'lock', '--reason', `harnessctl:${workspaceId}`, workspacePath],
        runtime,
      );
      const active = updateWorkspace(creating, { lifecycle: 'active' }, runtime.clock);
      const binding = newBinding(host, sessionKey, active, runtime.clock);
      publishWorkspaceAndBinding(topology.commonDir, active, binding, creating);
      return contextFrom(active, binding);
    } catch (error: unknown) {
      const recovered = recoverProvisionalAllocation(topology, creating, host, sessionKey, runtime);
      if (recovered) return recovered;
      throw normalizeError(error, 'provisional workspace allocation failed');
    }
  });
}

function recoverProvisionalAllocation(
  original: RepositoryTopology,
  creating: ExecutionWorkspaceRecord,
  host: ExecutionHost,
  sessionKey: string,
  runtime: Runtime,
): ExecutionContext | undefined {
  let topology = refreshTopology(original, runtime);
  let entry = topology.worktrees.find((candidate) => candidate.path === creating.workspace_path);
  if (!entry) return undefined;
  if (entry.branch !== creating.branch || entry.head !== creating.base_revision)
    throw new ExecutionContextError(
      'unsafe_state',
      'provisional workspace topology is ambiguous after allocation failure',
    );
  if (entry.locked !== `harnessctl:${creating.workspace_id}`) {
    if (entry.locked)
      throw new ExecutionContextError('unsafe_state', 'provisional workspace has a conflicting ownership lock');
    runGit(
      topology.primaryPath,
      ['worktree', 'lock', '--reason', `harnessctl:${creating.workspace_id}`, creating.workspace_path],
      runtime,
    );
    topology = refreshTopology(original, runtime);
    entry = topology.worktrees.find((candidate) => candidate.path === creating.workspace_path);
  }
  if (entry?.locked !== `harnessctl:${creating.workspace_id}`)
    throw new ExecutionContextError('synchronization', 'provisional workspace ownership lock could not be reconciled');
  assertClean(creating.workspace_path, runtime, 'recovered provisional workspace must be clean');
  const active = updateWorkspace(creating, { lifecycle: 'active' }, runtime.clock);
  const binding = newBinding(host, sessionKey, active, runtime.clock);
  publishWorkspaceAndBinding(topology.commonDir, active, binding, creating);
  return contextFrom(active, binding);
}

function attachEpic(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string,
  epicId: string,
  expectedBindingGeneration: number,
  expectedWorkspaceGeneration: number,
  runtime: Runtime,
): ExecutionContext {
  assertHost(host);
  const sessionKey = sessionKeyFor(sessionId);
  const discovered = loadEnabledTopology(controlRoot, runtime);
  return withRepositoryLock(discovered.commonDir, runtime.lockWaitMs, () => {
    const topology = refreshTopology(discovered, runtime);
    const binding = requireBoundBinding(topology.commonDir, host, sessionKey);
    const workspace = requireWorkspace(topology.commonDir, binding.workspace_id);
    assertGeneration(binding.generation, expectedBindingGeneration, 'binding');
    assertGeneration(workspace.generation, expectedWorkspaceGeneration, 'workspace');
    assertBindingMatchesWorkspace(binding, workspace, topology);
    assertWorkspaceTopology(topology, workspace, runtime);
    if (workspace.epic_id !== null || binding.epic_id !== null)
      throw new ExecutionContextError('conflict', 'workspace is already attached to an Epic');
    requireCanonicalEpic(workspace.workspace_path, epicId);
    assertNoWorkspaceForEpic(topology.commonDir, epicId, workspace.workspace_id);
    const nextWorkspace = updateWorkspace(workspace, { epic_id: epicId }, runtime.clock);
    const nextBinding = updateBinding(binding, nextWorkspace, runtime.clock);
    publishWorkspaceAndBinding(topology.commonDir, nextWorkspace, nextBinding, workspace, binding);
    return contextFrom(nextWorkspace, nextBinding);
  });
}

function bindSession(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string,
  workspaceId: string,
  expectedBindingGeneration: number | undefined,
  expectedWorkspaceGeneration: number | undefined,
  runtime: Runtime,
): ExecutionContext {
  assertHost(host);
  assertWorkspaceId(workspaceId);
  const sessionKey = sessionKeyFor(sessionId);
  const discovered = loadEnabledTopology(controlRoot, runtime);
  return withRepositoryLock(discovered.commonDir, runtime.lockWaitMs, () => {
    const topology = refreshTopology(discovered, runtime);
    const workspace = requireWorkspace(topology.commonDir, workspaceId);
    if (expectedWorkspaceGeneration === undefined)
      throw new ExecutionContextError('conflict', 'binding requires the exact target workspace generation');
    assertGeneration(workspace.generation, expectedWorkspaceGeneration, 'workspace');
    assertWorkspaceTopology(topology, workspace, runtime);
    const current = readBinding(topology.commonDir, host, sessionKey);
    if (current?.workspace_id === workspaceId) {
      if (current.lifecycle === 'released') {
        if (expectedBindingGeneration === undefined)
          throw new ExecutionContextError('conflict', 'rebinding requires the exact released binding generation');
        assertGeneration(current.generation, expectedBindingGeneration, 'binding');
        const next = updateBinding(current, workspace, runtime.clock);
        writeBinding(topology.commonDir, next);
        return contextFrom(workspace, next);
      }
      if (expectedBindingGeneration !== undefined)
        assertGeneration(current.generation, expectedBindingGeneration, 'binding');
      assertBindingMatchesWorkspace(current, workspace, topology);
      return contextFrom(workspace, current);
    }
    if (current) {
      if (expectedBindingGeneration === undefined)
        throw new ExecutionContextError('conflict', 'rebinding requires the exact current binding generation');
      assertGeneration(current.generation, expectedBindingGeneration, 'binding');
    } else if (expectedBindingGeneration !== undefined) {
      throw new ExecutionContextError('conflict', 'binding generation was supplied for an unbound session');
    }
    const next = current
      ? updateBinding(current, workspace, runtime.clock)
      : newBinding(host, sessionKey, workspace, runtime.clock);
    writeBinding(topology.commonDir, next);
    return contextFrom(workspace, next);
  });
}

function resolveSession(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string,
  expectedBindingGeneration: number | undefined,
  runtime: Runtime,
): ExecutionContext {
  assertHost(host);
  const sessionKey = sessionKeyFor(sessionId);
  const discovered = loadEnabledTopology(controlRoot, runtime);
  return withRepositoryLock(discovered.commonDir, runtime.lockWaitMs, () => {
    const topology = refreshTopology(discovered, runtime);
    const binding = requireBoundBinding(topology.commonDir, host, sessionKey);
    if (expectedBindingGeneration !== undefined)
      assertGeneration(binding.generation, expectedBindingGeneration, 'binding');
    const workspace = requireWorkspace(topology.commonDir, binding.workspace_id);
    assertBindingMatchesWorkspace(binding, workspace, topology);
    assertWorkspaceTopology(topology, workspace, runtime);
    return contextFrom(workspace, binding);
  });
}

function releaseSession(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string,
  expectedBindingGeneration: number,
  runtime: Runtime,
): void {
  assertHost(host);
  const sessionKey = sessionKeyFor(sessionId);
  const discovered = loadEnabledTopology(controlRoot, runtime);
  withRepositoryLock(discovered.commonDir, runtime.lockWaitMs, () => {
    const topology = refreshTopology(discovered, runtime);
    const binding = requireBoundBinding(topology.commonDir, host, sessionKey);
    assertGeneration(binding.generation, expectedBindingGeneration, 'binding');
    writeBinding(topology.commonDir, releaseBinding(binding, runtime.clock));
  });
}

function adoptV1(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string,
  epicId: string,
  runtime: Runtime,
): ExecutionContext {
  assertHost(host);
  const sessionKey = sessionKeyFor(sessionId);
  const discovered = loadEnabledTopology(controlRoot, runtime);
  return withRepositoryLock(discovered.commonDir, runtime.lockWaitMs, () => {
    const topology = refreshTopology(discovered, runtime);
    if (readBinding(topology.commonDir, host, sessionKey))
      throw new ExecutionContextError('conflict', 'host session already has an execution workspace binding');
    requireCanonicalEpic(topology.primaryPath, epicId);
    const legacy = readLegacyWorkspace(topology.commonDir, epicId);
    assertLegacyAdoption(topology, legacy, epicId, runtime);
    assertNoWorkspaceForEpic(topology.commonDir, epicId);
    const workspaceId = newWorkspaceId(runtime);
    const now = validNow(runtime.clock);
    const workspace: ExecutionWorkspaceRecord = {
      schema_version: WORKSPACE_SCHEMA_VERSION,
      workspace_id: workspaceId,
      repository_id: topology.repositoryId,
      primary_path: topology.primaryPath,
      workspace_path: legacy.workspace_path,
      branch: legacy.branch,
      base_revision: gitText(legacy.workspace_path, ['rev-parse', 'HEAD'], runtime).trim(),
      epic_id: epicId,
      lifecycle: legacy.state,
      generation: 1,
      created_at: now,
      updated_at: now,
    };
    const binding = newBinding(host, sessionKey, workspace, runtime.clock);
    publishWorkspaceAndBinding(topology.commonDir, workspace, binding);
    return contextFrom(workspace, binding);
  });
}

function loadEnabledTopology(controlRoot: string, runtime: Runtime): RepositoryTopology {
  const topology = discoverTopology(controlRoot, runtime);
  const config = readConfig(topology.primaryPath);
  if (config instanceof ConfigError)
    throw new ExecutionContextError('configuration', `unable to read primary configuration: ${config.message}`);
  if (!config.skills.cvs.workspaces || !config.skills.cvs.enabled || config.skills.cvs.local !== 'git')
    throw new ExecutionContextError('configuration', 'session-bound Git workspaces are not enabled');
  return topology;
}

function discoverTopology(cwd: string, runtime: Runtime): RepositoryTopology {
  const currentPath = canonicalDirectory(cwd, 'control root');
  if (gitText(currentPath, ['rev-parse', '--is-bare-repository'], runtime).trim() !== 'false')
    throw new ExecutionContextError('repository_discovery', 'execution contexts require a non-bare Git repository');
  const currentRoot = canonicalDirectory(
    gitText(currentPath, ['rev-parse', '--show-toplevel'], runtime).trim(),
    'current Git worktree',
  );
  const commonOutput = gitText(currentRoot, ['rev-parse', '--git-common-dir'], runtime).trim();
  const commonDir = canonicalDirectory(
    isAbsolute(commonOutput) ? commonOutput : resolve(currentRoot, commonOutput),
    'Git common directory',
  );
  const worktrees = parseWorktrees(runGit(currentRoot, ['worktree', 'list', '--porcelain', '-z'], runtime));
  const primary = worktrees[0];
  if (!primary || primary.bare)
    throw new ExecutionContextError('repository_discovery', 'Git primary checkout is unavailable');
  const primaryPath = canonicalDirectory(primary.path, 'primary Git checkout');
  const commonStat = statSync(commonDir, { bigint: true });
  const repositoryId = createHash('sha256')
    .update(`${commonDir}\0${commonStat.dev.toString()}\0${commonStat.ino.toString()}`)
    .digest('hex');
  return { repositoryId, commonDir, primaryPath, currentRoot, worktrees };
}

function refreshTopology(discovered: RepositoryTopology, runtime: Runtime): RepositoryTopology {
  const current = discoverTopology(discovered.currentRoot, runtime);
  if (current.commonDir !== discovered.commonDir || current.repositoryId !== discovered.repositoryId)
    throw new ExecutionContextError(
      'conflict',
      'repository identity changed while acquiring the execution context lock',
    );
  return current;
}

function parseWorktrees(output: Buffer): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;
  for (const field of decodeUtf8(output, 'Git worktree topology').split('\0')) {
    if (field === '') {
      if (current) entries.push(current);
      current = undefined;
      continue;
    }
    const separator = field.indexOf(' ');
    const key = separator < 0 ? field : field.slice(0, separator);
    const value = separator < 0 ? '' : field.slice(separator + 1);
    if (key === 'worktree') {
      if (current) throw new ExecutionContextError('repository_discovery', 'malformed Git worktree topology');
      current = { path: canonicalReportedPath(value), bare: false };
    } else {
      if (!current) throw new ExecutionContextError('repository_discovery', 'malformed Git worktree topology');
      if (key === 'HEAD') current.head = value;
      else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//u, '');
      else if (key === 'bare') current.bare = true;
      else if (key === 'locked') current.locked = value;
    }
  }
  if (current) throw new ExecutionContextError('repository_discovery', 'unterminated Git worktree topology');
  return entries;
}

function assertWorkspaceTopology(
  topology: RepositoryTopology,
  workspace: ExecutionWorkspaceRecord,
  runtime: Runtime,
): void {
  if (workspace.repository_id !== topology.repositoryId || workspace.primary_path !== topology.primaryPath)
    throw new ExecutionContextError('conflict', 'workspace belongs to a different repository');
  if (workspace.lifecycle !== 'active' && workspace.lifecycle !== 'cleanup_ready')
    throw new ExecutionContextError(
      'unsafe_state',
      `workspace lifecycle does not permit project operations: ${workspace.lifecycle}`,
    );
  const entry = topology.worktrees.find((candidate) => candidate.path === workspace.workspace_path);
  if (!entry || !existsSync(workspace.workspace_path))
    throw new ExecutionContextError('unsafe_state', 'execution workspace is missing from Git topology');
  if (entry.branch !== workspace.branch)
    throw new ExecutionContextError('unsafe_state', 'execution workspace branch is detached or mismatched');
  const expectedLock = workspace.branch.startsWith('harnessctl/epic/')
    ? `harnessctl:${workspace.epic_id ?? ''}`
    : `harnessctl:${workspace.workspace_id}`;
  if (entry.locked !== expectedLock)
    throw new ExecutionContextError('unsafe_state', 'execution workspace ownership lock is missing or mismatched');
  const head = gitText(workspace.workspace_path, ['rev-parse', 'HEAD'], runtime).trim();
  assertFullCommit(head);
  if (workspace.epic_id !== null) requireCanonicalEpic(workspace.workspace_path, workspace.epic_id);
}

function assertLegacyAdoption(
  topology: RepositoryTopology,
  legacy: LegacyWorkspaceRecord,
  epicId: string,
  runtime: Runtime,
): void {
  if (
    legacy.epic_id !== epicId ||
    legacy.primary_path !== topology.primaryPath ||
    legacy.repository !== `${topology.commonDir}\0${topology.primaryPath}`
  )
    throw new ExecutionContextError('conflict', 'legacy workspace metadata does not match repository ownership');
  if (legacy.state !== 'active' && legacy.state !== 'cleanup_ready')
    throw new ExecutionContextError('unsafe_state', `legacy workspace cannot be adopted from state ${legacy.state}`);
  const entry = topology.worktrees.find((candidate) => candidate.path === legacy.workspace_path);
  if (!entry || entry.branch !== legacy.branch || entry.locked !== `harnessctl:${epicId}`)
    throw new ExecutionContextError('unsafe_state', 'legacy workspace topology is missing or mismatched');
  assertClean(legacy.workspace_path, runtime, 'legacy workspace must be clean before adoption');
}

function assertBindingMatchesWorkspace(
  binding: SessionBindingRecord,
  workspace: ExecutionWorkspaceRecord,
  topology: RepositoryTopology,
): void {
  if (
    binding.repository_id !== topology.repositoryId ||
    binding.repository_id !== workspace.repository_id ||
    binding.workspace_id !== workspace.workspace_id ||
    binding.epic_id !== workspace.epic_id ||
    binding.workspace_generation !== workspace.generation
  )
    throw new ExecutionContextError('conflict', 'session binding is stale or mismatched');
}

function contextFrom(workspace: ExecutionWorkspaceRecord, binding: SessionBindingRecord): ExecutionContext {
  return Object.freeze({
    repository_id: workspace.repository_id,
    primary_root: workspace.primary_path,
    workspace_id: workspace.workspace_id,
    execution_root: workspace.workspace_path,
    branch: workspace.branch,
    base_revision: workspace.base_revision,
    epic_id: workspace.epic_id,
    binding_generation: binding.generation,
    workspace_generation: workspace.generation,
    workspace_lifecycle: workspace.lifecycle,
    host: binding.host,
    session_key: binding.session_key,
  });
}

function newBinding(
  host: ExecutionHost,
  sessionKey: string,
  workspace: ExecutionWorkspaceRecord,
  clock: () => Date,
): SessionBindingRecord {
  const now = validNow(clock);
  return {
    schema_version: BINDING_SCHEMA_VERSION,
    host,
    session_key: sessionKey,
    repository_id: workspace.repository_id,
    workspace_id: workspace.workspace_id,
    epic_id: workspace.epic_id,
    lifecycle: 'bound',
    generation: 1,
    workspace_generation: workspace.generation,
    created_at: now,
    updated_at: now,
  };
}

function updateBinding(
  binding: SessionBindingRecord,
  workspace: ExecutionWorkspaceRecord,
  clock: () => Date,
): SessionBindingRecord {
  return {
    ...binding,
    repository_id: workspace.repository_id,
    workspace_id: workspace.workspace_id,
    epic_id: workspace.epic_id,
    lifecycle: 'bound',
    generation: binding.generation + 1,
    workspace_generation: workspace.generation,
    updated_at: validNow(clock),
  };
}

function updateWorkspace(
  workspace: ExecutionWorkspaceRecord,
  changes: Partial<Pick<ExecutionWorkspaceRecord, 'epic_id' | 'lifecycle'>>,
  clock: () => Date,
): ExecutionWorkspaceRecord {
  return {
    ...workspace,
    ...changes,
    generation: workspace.generation + 1,
    updated_at: validNow(clock),
  };
}

function workspacePath(commonDir: string, workspaceId: string): string {
  return join(commonDir, WORKSPACE_DIRECTORY, `${workspaceId}.json`);
}

function bindingPath(commonDir: string, host: ExecutionHost, sessionKey: string): string {
  return join(commonDir, BINDING_DIRECTORY, host, `${sessionKey}.json`);
}

function readWorkspace(commonDir: string, workspaceId: string): ExecutionWorkspaceRecord | undefined {
  assertWorkspaceId(workspaceId);
  return readRecord(workspacePath(commonDir, workspaceId), validateWorkspace, 'workspace');
}

function requireWorkspace(commonDir: string, workspaceId: string): ExecutionWorkspaceRecord {
  const workspace = readWorkspace(commonDir, workspaceId);
  if (!workspace) throw new ExecutionContextError('unsafe_state', `workspace metadata does not exist: ${workspaceId}`);
  return workspace;
}

function readBinding(commonDir: string, host: ExecutionHost, sessionKey: string): SessionBindingRecord | undefined {
  return readRecord(bindingPath(commonDir, host, sessionKey), validateBinding, 'session binding');
}

function requireBinding(commonDir: string, host: ExecutionHost, sessionKey: string): SessionBindingRecord {
  const binding = readBinding(commonDir, host, sessionKey);
  if (!binding) throw new ExecutionContextError('unsafe_state', 'host session has no execution workspace binding');
  return binding;
}

function requireBoundBinding(commonDir: string, host: ExecutionHost, sessionKey: string): SessionBindingRecord {
  const binding = requireBinding(commonDir, host, sessionKey);
  if (binding.lifecycle !== 'bound')
    throw new ExecutionContextError('unsafe_state', 'host session execution workspace binding is released');
  return binding;
}

function readLegacyWorkspace(commonDir: string, epicId: string): LegacyWorkspaceRecord {
  const path = join(commonDir, LEGACY_WORKSPACE_DIRECTORY, `${epicId}.json`);
  const record = readRecord(path, validateLegacyWorkspace, 'legacy workspace');
  if (!record) throw new ExecutionContextError('unsafe_state', 'legacy workspace metadata does not exist');
  return record;
}

function readRecord<T>(path: string, validate: (value: unknown) => T, label: string): T | undefined {
  if (!existsSync(path)) return undefined;
  assertRegularFile(path, `${label} metadata`);
  const stat = lstatSync(path);
  if (stat.size > MAX_RECORD_BYTES)
    throw new ExecutionContextError('synchronization', `${label} metadata exceeds the size limit`);
  try {
    return validate(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  } catch (error: unknown) {
    if (error instanceof ExecutionContextError) throw error;
    throw new ExecutionContextError('synchronization', `${label} metadata is malformed: ${safeMessage(error)}`);
  }
}

function validateWorkspace(value: unknown): ExecutionWorkspaceRecord {
  const record = strictRecord(
    value,
    [
      'base_revision',
      'branch',
      'created_at',
      'epic_id',
      'generation',
      'lifecycle',
      'primary_path',
      'repository_id',
      'schema_version',
      'updated_at',
      'workspace_id',
      'workspace_path',
    ],
    'workspace',
  );
  if (record.schema_version !== WORKSPACE_SCHEMA_VERSION)
    throw new ExecutionContextError('synchronization', 'workspace metadata schema version is unsupported');
  assertWorkspaceId(fieldString(record, 'workspace_id', 'workspace'));
  for (const field of ['repository_id', 'primary_path', 'workspace_path', 'branch', 'base_revision'])
    fieldString(record, field, 'workspace');
  if (record.epic_id !== null && typeof record.epic_id !== 'string')
    throw new ExecutionContextError('synchronization', 'workspace metadata Epic ID is invalid');
  if (typeof record.lifecycle !== 'string' || !LIFECYCLES.includes(record.lifecycle as ExecutionWorkspaceLifecycle))
    throw new ExecutionContextError('synchronization', 'workspace metadata lifecycle is invalid');
  positiveInteger(record.generation, 'workspace generation');
  timestampFields(record, 'workspace');
  assertFullCommit(record.base_revision as string);
  return record as unknown as ExecutionWorkspaceRecord;
}

function validateBinding(value: unknown): SessionBindingRecord {
  const record = strictRecord(
    value,
    [
      'created_at',
      'epic_id',
      'generation',
      'host',
      'lifecycle',
      'repository_id',
      'schema_version',
      'session_key',
      'updated_at',
      'workspace_generation',
      'workspace_id',
    ],
    'session binding',
  );
  if (record.schema_version !== BINDING_SCHEMA_VERSION)
    throw new ExecutionContextError('synchronization', 'session binding schema version is unsupported');
  if (typeof record.host !== 'string' || !HOSTS.includes(record.host as ExecutionHost))
    throw new ExecutionContextError('synchronization', 'session binding host is invalid');
  if (typeof record.lifecycle !== 'string' || !BINDING_LIFECYCLES.includes(record.lifecycle as SessionBindingLifecycle))
    throw new ExecutionContextError('synchronization', 'session binding lifecycle is invalid');
  if (typeof record.session_key !== 'string' || !/^[a-f0-9]{64}$/u.test(record.session_key))
    throw new ExecutionContextError('synchronization', 'session binding key is invalid');
  assertWorkspaceId(fieldString(record, 'workspace_id', 'session binding'));
  fieldString(record, 'repository_id', 'session binding');
  if (record.epic_id !== null && typeof record.epic_id !== 'string')
    throw new ExecutionContextError('synchronization', 'session binding Epic ID is invalid');
  positiveInteger(record.generation, 'binding generation');
  positiveInteger(record.workspace_generation, 'bound workspace generation');
  timestampFields(record, 'session binding');
  return record as unknown as SessionBindingRecord;
}

function validateLegacyWorkspace(value: unknown): LegacyWorkspaceRecord {
  const record = strictRecord(
    value,
    [
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
    ],
    'legacy workspace',
  );
  if (record.schema_version !== 1)
    throw new ExecutionContextError('synchronization', 'legacy workspace schema version is unsupported');
  for (const field of ['repository', 'epic_id', 'primary_path', 'workspace_path', 'branch'])
    fieldString(record, field, 'legacy workspace');
  if (typeof record.state !== 'string' || !LIFECYCLES.includes(record.state as ExecutionWorkspaceLifecycle))
    throw new ExecutionContextError('synchronization', 'legacy workspace lifecycle is invalid');
  timestampFields(record, 'legacy workspace');
  return record as unknown as LegacyWorkspaceRecord;
}

function strictRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ExecutionContextError('synchronization', `${label} metadata must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index]))
    throw new ExecutionContextError('synchronization', `${label} metadata contains unsupported fields`);
  return value;
}

function fieldString(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0)
    throw new ExecutionContextError('synchronization', `${label} metadata field is invalid: ${field}`);
  return value;
}

function timestampFields(record: Record<string, unknown>, label: string): void {
  for (const field of ['created_at', 'updated_at']) {
    const value = fieldString(record, field, label);
    if (!validIsoDate(value))
      throw new ExecutionContextError('synchronization', `${label} metadata timestamp is invalid: ${field}`);
  }
}

function publishWorkspaceAndBinding(
  commonDir: string,
  workspace: ExecutionWorkspaceRecord,
  binding: SessionBindingRecord,
  previousWorkspace?: ExecutionWorkspaceRecord,
  previousBinding?: SessionBindingRecord,
): void {
  const transaction: ExecutionContextTransaction = {
    schema_version: 1,
    workspace_id: workspace.workspace_id,
    host: binding.host,
    session_key: binding.session_key,
    previous_workspace: previousWorkspace ?? null,
    previous_binding: previousBinding ?? null,
  };
  writeRecord(join(commonDir, TRANSACTION_PATH), transaction);
  try {
    writeWorkspace(commonDir, workspace);
    writeBinding(commonDir, binding);
    removeRecord(join(commonDir, TRANSACTION_PATH));
  } catch (error: unknown) {
    rollbackTransaction(commonDir, transaction);
    throw error;
  }
}

function writeWorkspace(commonDir: string, workspace: ExecutionWorkspaceRecord): void {
  writeRecord(workspacePath(commonDir, workspace.workspace_id), workspace);
}

function writeBinding(commonDir: string, binding: SessionBindingRecord): void {
  writeRecord(bindingPath(commonDir, binding.host, binding.session_key), binding);
}

function writeRecord(path: string, record: object): void {
  const directory = ensureDirectory(dirname(path));
  const temporary = join(directory, `.${basename(path)}.${randomBytes(12).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (existsSync(path)) assertRegularFile(path, 'execution context metadata');
    renameSync(temporary, path);
    syncDirectory(directory);
  } catch (error: unknown) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
    if (error instanceof ExecutionContextError) throw error;
    throw new ExecutionContextError(
      'synchronization',
      `cannot publish execution context metadata: ${safeMessage(error)}`,
    );
  }
}

function removeRecord(path: string): void {
  if (!existsSync(path)) return;
  assertRegularFile(path, 'execution context metadata');
  rmSync(path);
  syncDirectory(dirname(path));
}

function ensureDirectory(path: string): string {
  const parent = dirname(path);
  if (parent !== path && !existsSync(parent)) ensureDirectory(parent);
  if (existsSync(path)) assertDirectory(path, 'execution context state directory');
  else {
    mkdirSync(path, { mode: 0o700 });
    syncDirectory(parent);
  }
  return path;
}

function withRepositoryLock<T>(commonDir: string, waitMs: number, operation: () => T): T {
  const lock = join(commonDir, LOCK_DIRECTORY);
  ensureDirectory(dirname(lock));
  const deadline = Date.now() + waitMs;
  const owner = currentLockOwner();
  while (true) {
    try {
      acquireLock(lock, owner);
      break;
    } catch (error: unknown) {
      if (!hasCode(error, 'EEXIST') && !hasCode(error, 'ENOTEMPTY'))
        throw new ExecutionContextError('synchronization', 'cannot acquire execution context lock');
      recoverStaleLock(lock);
      if (Date.now() >= deadline)
        throw new ExecutionContextError('synchronization', 'execution context lock is busy', true);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    recoverPendingTransaction(commonDir);
    return operation();
  } finally {
    try {
      const current = readLockOwner(lock);
      if (current.nonce === owner.nonce) {
        rmSync(lock, { recursive: true });
        syncDirectory(dirname(lock));
      }
    } catch {
      // Leaving an unreleased lock blocks later mutations instead of risking concurrent writes.
    }
  }
}

function releaseBinding(binding: SessionBindingRecord, clock: () => Date): SessionBindingRecord {
  return {
    ...binding,
    lifecycle: 'released',
    generation: binding.generation + 1,
    updated_at: validNow(clock),
  };
}

function rollbackTransaction(commonDir: string, transaction: ExecutionContextTransaction): void {
  if (transaction.previous_workspace) writeWorkspace(commonDir, transaction.previous_workspace);
  else removeRecord(workspacePath(commonDir, transaction.workspace_id));
  if (transaction.previous_binding) writeBinding(commonDir, transaction.previous_binding);
  else removeRecord(bindingPath(commonDir, transaction.host, transaction.session_key));
  removeRecord(join(commonDir, TRANSACTION_PATH));
}

function recoverPendingTransaction(commonDir: string): void {
  const path = join(commonDir, TRANSACTION_PATH);
  const transaction = readRecord(path, validateTransaction, 'execution context transaction');
  if (transaction) rollbackTransaction(commonDir, transaction);
}

function validateTransaction(value: unknown): ExecutionContextTransaction {
  const record = strictRecord(
    value,
    ['host', 'previous_binding', 'previous_workspace', 'schema_version', 'session_key', 'workspace_id'],
    'execution context transaction',
  );
  if (record.schema_version !== 1)
    throw new ExecutionContextError('synchronization', 'transaction schema is unsupported');
  assertWorkspaceId(fieldString(record, 'workspace_id', 'execution context transaction'));
  if (typeof record.host !== 'string' || !HOSTS.includes(record.host as ExecutionHost))
    throw new ExecutionContextError('synchronization', 'transaction host is invalid');
  if (typeof record.session_key !== 'string' || !/^[a-f0-9]{64}$/u.test(record.session_key))
    throw new ExecutionContextError('synchronization', 'transaction session key is invalid');
  if (record.previous_workspace !== null) validateWorkspace(record.previous_workspace);
  if (record.previous_binding !== null) validateBinding(record.previous_binding);
  return record as unknown as ExecutionContextTransaction;
}

function acquireLock(lock: string, owner: LockOwner): void {
  const parent = dirname(lock);
  const temporary = join(parent, `.${basename(lock)}.${owner.nonce}.tmp`);
  try {
    writeRecord(temporary, owner);
    linkSync(temporary, lock);
    syncDirectory(parent);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function currentLockOwner(): LockOwner {
  return {
    schema_version: 1,
    pid: process.pid,
    hostname: hostname(),
    process_start: processStartToken(process.pid),
    nonce: randomBytes(16).toString('hex'),
    created_at: new Date().toISOString(),
  };
}

function recoverStaleLock(lock: string): void {
  const owner = readOptionalLockOwner(lock);
  if (!owner) return;
  if (owner.hostname !== hostname() || isProcessOwnerAlive(owner)) return;
  const quarantine = `${lock}.stale.${randomBytes(16).toString('hex')}`;
  try {
    renameSync(lock, quarantine);
  } catch (error: unknown) {
    if (hasCode(error, 'ENOENT')) return;
    throw error;
  }
  syncDirectory(dirname(lock));
  rmSync(quarantine, { recursive: true });
  syncDirectory(dirname(lock));
}

function readLockOwner(lock: string): LockOwner {
  const owner = readOptionalLockOwner(lock);
  if (!owner) throw new ExecutionContextError('synchronization', 'execution context lock owner is missing');
  return owner;
}

function readOptionalLockOwner(lock: string): LockOwner | undefined {
  return readRecord(lock, validateLockOwner, 'execution context lock owner');
}

function validateLockOwner(value: unknown): LockOwner {
  const record = strictRecord(
    value,
    ['created_at', 'hostname', 'nonce', 'pid', 'process_start', 'schema_version'],
    'execution context lock owner',
  );
  if (record.schema_version !== 1)
    throw new ExecutionContextError('synchronization', 'lock owner schema is unsupported');
  positiveInteger(record.pid, 'lock owner PID');
  fieldString(record, 'hostname', 'execution context lock owner');
  if (
    record.process_start !== null &&
    (typeof record.process_start !== 'string' || !/^\d+$/u.test(record.process_start))
  )
    throw new ExecutionContextError('synchronization', 'lock owner process start token is invalid');
  if (typeof record.nonce !== 'string' || !/^[a-f0-9]{32}$/u.test(record.nonce))
    throw new ExecutionContextError('synchronization', 'lock owner nonce is invalid');
  const createdAt = fieldString(record, 'created_at', 'execution context lock owner');
  if (!validIsoDate(createdAt))
    throw new ExecutionContextError('synchronization', 'execution context lock owner timestamp is invalid');
  return record as unknown as LockOwner;
}

function isProcessOwnerAlive(owner: LockOwner): boolean {
  try {
    process.kill(owner.pid, 0);
  } catch (error: unknown) {
    if (hasCode(error, 'ESRCH')) return false;
    return true;
  }
  const currentStart = processStartToken(owner.pid);
  return owner.process_start === null || currentStart === null || owner.process_start === currentStart;
}

function processStartToken(pid: number): string | null {
  const path = `/proc/${pid}/stat`;
  if (!existsSync(path)) return null;
  try {
    const stat = readFileSync(path, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return fields[19] && /^\d+$/u.test(fields[19]) ? fields[19] : null;
  } catch {
    return null;
  }
}

function requireCanonicalEpic(root: string, epicId: string): void {
  const config = readConfig(root);
  if (config instanceof ConfigError) throw new ExecutionContextError('configuration', config.message);
  const issues = config.skills.issues;
  if (!issues.enabled || issues.provider.type !== 'filesystem')
    throw new ExecutionContextError('authority', 'workspace attachment requires filesystem Issue authority');
  if (!isPrefixedIdentity(epicId, issues.prefix)) throw new ExecutionContextError('authority', 'Epic ID is invalid');
  try {
    const storage = discoverIssueStorage(root, {
      issuePrefix: issues.prefix,
      issueRoot: validateIssueRoot(issues.root),
    });
    const issue = resolveIssueCandidate(storage, epicId, 'active').decoded?.issue;
    if (!issue || issue.type !== 'epic')
      throw new ExecutionContextError('authority', `${epicId} is not a canonical Epic`);
  } catch (error: unknown) {
    if (error instanceof ExecutionContextError) throw error;
    throw new ExecutionContextError('authority', safeMessage(error));
  }
}

function assertNoWorkspaceForEpic(commonDir: string, epicId: string, exceptWorkspaceId?: string): void {
  const directory = join(commonDir, WORKSPACE_DIRECTORY);
  if (!existsSync(directory)) return;
  assertDirectory(directory, 'workspace state directory');
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue;
    const workspaceId = name.slice(0, -5);
    if (workspaceId === exceptWorkspaceId) continue;
    const workspace = readWorkspace(commonDir, workspaceId);
    if (workspace?.epic_id === epicId)
      throw new ExecutionContextError('conflict', `Epic already has a v2 workspace: ${workspace.workspace_id}`);
  }
}

function assertWorkspaceIdentityAvailable(
  topology: RepositoryTopology,
  workspacePathValue: string,
  branch: string,
  runtime: Runtime,
): void {
  if (existsSync(workspacePathValue) || topology.worktrees.some((entry) => entry.path === workspacePathValue))
    throw new ExecutionContextError('conflict', `workspace path is already occupied: ${workspacePathValue}`);
  const result = runGitResult(
    topology.primaryPath,
    ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    runtime,
  );
  if (result.status === 0) throw new ExecutionContextError('conflict', `workspace branch already exists: ${branch}`);
  if (result.status !== 1) throw gitResultError(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], result);
}

function assertPrimaryControlRoot(topology: RepositoryTopology): void {
  if (topology.currentRoot !== topology.primaryPath)
    throw new ExecutionContextError(
      'unsafe_state',
      `workspace allocation must use the primary control root: ${topology.primaryPath}`,
    );
}

function assertClean(path: string, runtime: Runtime, message: string): void {
  if (runGit(path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], runtime).byteLength !== 0)
    throw new ExecutionContextError('unsafe_state', message);
}

function newWorkspaceId(runtime: Runtime): string {
  const ulid = runtime.ulid();
  if (!isUlid(ulid))
    throw new ExecutionContextError('configuration', 'workspace ULID generator returned an invalid value');
  return `ws-${ulid}`;
}

function assertWorkspaceId(value: string): void {
  if (!value.startsWith('ws-') || !isUlid(value.slice(3)))
    throw new ExecutionContextError('synchronization', 'workspace ID is invalid');
}

function sessionKeyFor(sessionId: string): string {
  if (!sessionId || sessionId.length > 4096 || sessionId.includes('\0'))
    throw new ExecutionContextError('configuration', 'host session ID is invalid');
  return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

function assertHost(host: string): asserts host is ExecutionHost {
  if (!HOSTS.includes(host as ExecutionHost)) throw new ExecutionContextError('configuration', 'host is unsupported');
}

function assertGeneration(actual: number, expected: number, label: string): void {
  positiveInteger(expected, `expected ${label} generation`);
  if (actual !== expected)
    throw new ExecutionContextError('conflict', `${label} generation is stale; expected ${expected}, found ${actual}`);
}

function positiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new ExecutionContextError('synchronization', `${label} must be a positive integer`);
}

function assertFullCommit(value: string): void {
  if (!/^[a-f0-9]{40,64}$/u.test(value))
    throw new ExecutionContextError('synchronization', 'workspace base revision is invalid');
}

function runtimeOptions(options: ExecutionContextProviderOptions): Runtime {
  const gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  const lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
  if (!Number.isInteger(gitTimeoutMs) || gitTimeoutMs < 1 || gitTimeoutMs > DEFAULT_GIT_TIMEOUT_MS)
    throw new ExecutionContextError('configuration', 'Git timeout must be between 1 and 30000 milliseconds');
  if (!Number.isInteger(lockWaitMs) || lockWaitMs < 0 || lockWaitMs > DEFAULT_LOCK_WAIT_MS)
    throw new ExecutionContextError('configuration', 'lock wait must be between 0 and 5000 milliseconds');
  if (options.gitPath !== undefined && (!options.gitPath || options.gitPath.includes('\0')))
    throw new ExecutionContextError('configuration', 'Git executable path is invalid');
  return {
    gitPath: options.gitPath ?? 'git',
    gitTimeoutMs,
    lockWaitMs,
    clock: options.clock ?? (() => new Date()),
    ulid: options.ulid ?? (() => createUlid()),
  };
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
    throw new ExecutionContextError(
      'git_execution',
      `git ${args[0] ?? 'command'} failed: ${safeMessage(result.error)}`,
    );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gitResultError(
  args: readonly string[],
  result: { status: number | null; stdout: Buffer; stderr: Buffer },
): ExecutionContextError {
  const diagnostic = boundedDiagnostic(
    decodeUtf8(result.stderr, 'Git diagnostic') || decodeUtf8(result.stdout, 'Git output'),
  );
  return new ExecutionContextError(
    'git_execution',
    `git ${args[0] ?? 'command'} exited ${result.status ?? 'without status'}${diagnostic ? `: ${diagnostic}` : ''}`,
  );
}

function canonicalDirectory(path: string, label: string): string {
  try {
    const canonical = realpathSync(resolve(path));
    assertDirectory(canonical, label);
    return canonical;
  } catch (error: unknown) {
    if (error instanceof ExecutionContextError) throw error;
    throw new ExecutionContextError('repository_discovery', `${label} is unavailable: ${safeMessage(error)}`);
  }
}

function canonicalReportedPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function assertDirectory(path: string, label: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new ExecutionContextError('unsafe_state', `${label} must be a non-symlink directory`);
}

function assertRegularFile(path: string, label: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new ExecutionContextError('unsafe_state', `${label} must be a non-symlink regular file`);
}

function syncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error: unknown) {
    if (process.platform !== 'win32')
      throw new ExecutionContextError('synchronization', `cannot synchronize state directory: ${safeMessage(error)}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validNow(clock: () => Date): string {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new ExecutionContextError('configuration', 'execution context clock returned an invalid date');
  return value.toISOString();
}

function validIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function decodeUtf8(value: Buffer, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch (error: unknown) {
    throw new ExecutionContextError('git_execution', `${label} is not UTF-8: ${safeMessage(error)}`);
  }
}

function boundedDiagnostic(value: string): string {
  return (
    value
      // Preserve whitespace while neutralizing unsafe control bytes from Git diagnostics.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '?')
      .trim()
      .slice(0, 2_000)
  );
}

function normalizeError(error: unknown, prefix: string): ExecutionContextError {
  if (error instanceof ExecutionContextError) return error;
  return new ExecutionContextError('synchronization', `${prefix}: ${safeMessage(error)}`);
}

function safeMessage(error: unknown): string {
  return boundedDiagnostic(error instanceof Error ? error.message : String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
