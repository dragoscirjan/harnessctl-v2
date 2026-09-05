import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, readConfig } from './config.js';
import { createExecutionContextProvider, type ExecutionHost } from './execution-context.js';
import { resolveProjectRoot } from './execution-routing.js';
import { getIssue } from './issues.js';
import type { AutomationRunner } from './schemas.js';

const TASK_OPERATIONS = {
  'bootstrap.install': { timeout_ms: 300_000, idempotency_policy: 'once_per_workspace_generation' },
  'repository.build': { timeout_ms: 300_000, idempotency_policy: 'repeatable' },
  'repository.format': { timeout_ms: 300_000, idempotency_policy: 'repeatable' },
  'repository.integration': { timeout_ms: 900_000, idempotency_policy: 'repeatable' },
  'repository.lint': { timeout_ms: 300_000, idempotency_policy: 'repeatable' },
  'repository.quality': { timeout_ms: 900_000, idempotency_policy: 'repeatable' },
  'repository.test': { timeout_ms: 600_000, idempotency_policy: 'repeatable' },
} as const;

const ENVIRONMENT_KEYS = [
  'CI',
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USER',
  'ComSpec',
  'SystemRoot',
] as const;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export const OPERATION_REGISTRY_VERSION = 1 as const;
export const SEMANTIC_OPERATION_REGISTRY = Object.freeze({
  'workspace.allocate_provisional': operationRegistration('control', ['unbound'], 'local_mutation', 'create'),
  'session.bind': operationRegistration('control', ['active', 'cleanup_ready'], 'local_mutation', 'update'),
  'workspace.attach_epic': operationRegistration('control', ['active'], 'local_mutation', 'update'),
  'workspace.adopt_v1': operationRegistration('control', ['active', 'cleanup_ready'], 'local_mutation', 'create'),
  'session.recover': operationRegistration('control', ['active', 'cleanup_ready'], 'none', 'read'),
  'repository.task.run': operationRegistration(
    'project',
    ['active', 'cleanup_ready', 'disabled'],
    'local_mutation',
    'repeatable',
  ),
  'bootstrap.install': operationRegistration(
    'project',
    ['active', 'disabled'],
    'local_mutation',
    'once_per_workspace_generation',
  ),
  'session.release': operationRegistration('control', ['active', 'cleanup_ready'], 'local_mutation', 'delete'),
  'command.exceptional': operationRegistration(
    'project',
    ['active', 'cleanup_ready', 'disabled'],
    'exceptional_command',
    'repeatable',
  ),
});

const RUNNERS: Record<
  Exclude<AutomationRunner, 'auto'>,
  { manifest: string; executable: string; args: (target: string) => string[] }
> = {
  mise: { manifest: 'mise.toml', executable: 'mise', args: (target) => ['run', target] },
  task: { manifest: 'Taskfile.yml', executable: 'task', args: (target) => [target] },
  just: { manifest: 'justfile', executable: 'just', args: (target) => [target] },
  make: { manifest: 'Makefile', executable: 'make', args: (target) => [target] },
  npm: { manifest: 'package.json', executable: 'npm', args: (target) => ['run', target] },
  pnpm: { manifest: 'pnpm-workspace.yaml', executable: 'pnpm', args: (target) => ['run', target] },
  yarn: { manifest: 'yarn.lock', executable: 'yarn', args: (target) => [target] },
  bun: { manifest: 'bun.lock', executable: 'bun', args: (target) => ['run', target] },
};

export type SemanticTaskOperationId = keyof typeof TASK_OPERATIONS;
export type OperationApproval = 'none' | 'local_mutation' | 'exceptional_command';
export type OperationErrorCategory =
  'configuration' | 'unsupported' | 'stale' | 'consent' | 'execution' | 'timeout' | 'output_overflow';
export type OperationClass = 'control' | 'project';
export type OperationWorkspaceState = 'unbound' | 'creating' | 'active' | 'cleanup_ready' | 'closed' | 'disabled';
export type OperationIdempotencyPolicy =
  'read' | 'create' | 'update' | 'delete' | 'repeatable' | 'once_per_workspace_generation';
export type BootstrapOperationId =
  'workspace.allocate_provisional' | 'authority.create' | 'workspace.attach_epic' | 'bootstrap.install';

export type BootstrapState =
  | { stage: 'unbound' }
  | { stage: 'workspace_bound'; binding_generation: number; workspace_generation: number }
  | { stage: 'authority_created'; binding_generation: number; workspace_generation: number; epic_id: string }
  | { stage: 'epic_attached'; binding_generation: number; workspace_generation: number; epic_id: string }
  | { stage: 'complete'; binding_generation: number; workspace_generation: number; epic_id: string };
export interface BootstrapCoordinatorInput {
  readonly epic_id?: string;
  readonly evidence?: readonly OperationEvidence[];
}
export type RegisteredProcessOperationId = SemanticTaskOperationId | 'command.exceptional';

export interface TaskOperationDescriptor {
  readonly schema_version: 1;
  readonly registry_version: typeof OPERATION_REGISTRY_VERSION;
  readonly operation_id: SemanticTaskOperationId;
  readonly input_schema: Readonly<{ type: 'object'; additional_properties: false }>;
  readonly input_digest: string;
  readonly operation_class: 'project';
  readonly legal_workspace_states: readonly OperationWorkspaceState[];
  readonly runner: Exclude<AutomationRunner, 'auto'>;
  readonly task_target: string;
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment_keys: readonly string[];
  readonly approval_class: OperationApproval;
  readonly cwd_policy: 'execution_root';
  readonly timeout_ms: number;
  readonly max_output_bytes: number;
  readonly workspace_id: string | null;
  readonly binding_generation: number | null;
  readonly workspace_generation: number | null;
  readonly idempotency_policy: OperationIdempotencyPolicy;
  readonly state_transition: 'none';
  readonly evidence_schema: Readonly<{ schema_version: 1; output: 'sha256'; generations: 'before_after' }>;
  readonly digest: string;
}

export interface ExceptionalCommandDescriptor {
  readonly schema_version: 1;
  readonly registry_version: typeof OPERATION_REGISTRY_VERSION;
  readonly operation_id: 'command.exceptional';
  readonly input_schema: Readonly<{ type: 'object'; additional_properties: false }>;
  readonly input_digest: string;
  readonly operation_class: 'project';
  readonly legal_workspace_states: readonly OperationWorkspaceState[];
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment_keys: readonly string[];
  readonly approval_class: 'exceptional_command';
  readonly cwd_policy: 'execution_root';
  readonly timeout_ms: number;
  readonly max_output_bytes: number;
  readonly workspace_id: string | null;
  readonly binding_generation: number | null;
  readonly workspace_generation: number | null;
  readonly idempotency_policy: 'repeatable';
  readonly state_transition: 'none';
  readonly evidence_schema: Readonly<{ schema_version: 1; output: 'sha256'; generations: 'before_after' }>;
  readonly digest: string;
}

export type RegisteredProcessDescriptor = TaskOperationDescriptor | ExceptionalCommandDescriptor;

export interface OperationEvidence {
  readonly schema_version: 1;
  readonly operation_id: RegisteredProcessOperationId;
  readonly descriptor_digest: string;
  readonly input_digest: string;
  readonly workspace_id: string | null;
  readonly before_binding_generation: number | null;
  readonly after_binding_generation: number | null;
  readonly before_workspace_generation: number | null;
  readonly after_workspace_generation: number | null;
  readonly outcome: 'succeeded' | 'failed';
  readonly exit_code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly duration_ms: number;
  readonly stdout_sha256: string;
  readonly stderr_sha256: string;
}

export interface ExecuteTaskOperationOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly spawn?: typeof spawnSync;
  readonly clock?: () => number;
}

export class OperationError extends Error {
  public constructor(
    public readonly category: OperationErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

function operationRegistration(
  operationClass: OperationClass,
  legalWorkspaceStates: readonly OperationWorkspaceState[],
  approvalClass: OperationApproval,
  idempotencyPolicy: OperationIdempotencyPolicy,
) {
  return Object.freeze({
    schema_version: OPERATION_REGISTRY_VERSION,
    input_schema: Object.freeze({ type: 'object' as const, additional_properties: false as const }),
    operation_class: operationClass,
    legal_workspace_states: Object.freeze([...legalWorkspaceStates]),
    approval_class: approvalClass,
    cwd_policy: operationClass === 'project' ? ('execution_root' as const) : ('primary_root' as const),
    environment_allowlist: Object.freeze([...ENVIRONMENT_KEYS]),
    max_output_bytes: MAX_OUTPUT_BYTES,
    idempotency_policy: idempotencyPolicy,
    state_transition:
      idempotencyPolicy === 'read' || idempotencyPolicy === 'repeatable' ? ('none' as const) : idempotencyPolicy,
    evidence_schema: Object.freeze({
      schema_version: 1 as const,
      output: 'sha256' as const,
      generations: 'before_after' as const,
    }),
  });
}

export function buildTaskOperation(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string | undefined,
  operationId: SemanticTaskOperationId,
  expectedBindingGeneration?: number,
): TaskOperationDescriptor {
  const registration = TASK_OPERATIONS[operationId];
  if (!registration) throw new OperationError('unsupported', `unsupported semantic operation: ${operationId}`);
  const config = readConfig(controlRoot);
  if (config instanceof ConfigError) throw new OperationError('configuration', config.message);
  const resolution = resolveProjectRoot(controlRoot, host, sessionId, expectedBindingGeneration);
  const target = config.automation.tasks[operationId];
  if (!target) throw new OperationError('configuration', `automation.tasks.${operationId} is not configured`);
  const runner = resolveRunner(config.automation.runner, resolution.root);
  const definition = RUNNERS[runner];
  const registrationId = operationId === 'bootstrap.install' ? 'bootstrap.install' : 'repository.task.run';
  const operation = SEMANTIC_OPERATION_REGISTRY[registrationId];
  const workspaceState: OperationWorkspaceState = resolution.enabled
    ? (resolution.context?.workspace_lifecycle ?? 'unbound')
    : 'disabled';
  if (!operation.legal_workspace_states.includes(workspaceState as never))
    throw new OperationError('stale', `operation ${operationId} is illegal in workspace state ${workspaceState}`);
  const inputSchema = Object.freeze({ type: 'object' as const, additional_properties: false as const });
  const evidenceSchema = Object.freeze({
    schema_version: 1 as const,
    output: 'sha256' as const,
    generations: 'before_after' as const,
  });
  const unsigned = {
    schema_version: 1 as const,
    registry_version: OPERATION_REGISTRY_VERSION,
    operation_id: operationId,
    input_schema: inputSchema,
    input_digest: digest({}),
    operation_class: 'project' as const,
    legal_workspace_states: [...operation.legal_workspace_states],
    runner,
    task_target: target,
    executable: definition.executable,
    argv: definition.args(target),
    cwd: realpathSync(resolution.root),
    environment_keys: [...ENVIRONMENT_KEYS],
    approval_class: operation.approval_class,
    cwd_policy: 'execution_root' as const,
    timeout_ms: registration.timeout_ms,
    max_output_bytes: MAX_OUTPUT_BYTES,
    workspace_id: resolution.context?.workspace_id ?? null,
    binding_generation: resolution.context?.binding_generation ?? null,
    workspace_generation: resolution.context?.workspace_generation ?? null,
    idempotency_policy: registration.idempotency_policy,
    state_transition: 'none' as const,
    evidence_schema: evidenceSchema,
  };
  const descriptor = { ...unsigned, digest: digest(unsigned) };
  Object.freeze(descriptor.argv);
  Object.freeze(descriptor.environment_keys);
  Object.freeze(descriptor.legal_workspace_states);
  return Object.freeze(descriptor);
}

export function executeTaskOperation(
  descriptor: RegisteredProcessDescriptor,
  consentDigest: string | undefined,
  options: ExecuteTaskOperationOptions = {},
): OperationEvidence {
  assertDescriptor(descriptor);
  if (descriptor.approval_class !== 'none' && consentDigest !== descriptor.digest)
    throw new OperationError('consent', 'consent does not match the immutable operation descriptor');
  const environment = selectEnvironment(options.environment ?? process.env, descriptor.environment_keys);
  const clock = options.clock ?? Date.now;
  const started = clock();
  const result = (options.spawn ?? spawnSync)(descriptor.executable, [...descriptor.argv], {
    cwd: descriptor.cwd,
    env: environment,
    encoding: 'utf8',
    shell: false,
    timeout: descriptor.timeout_ms,
    maxBuffer: descriptor.max_output_bytes,
    windowsHide: true,
  }) as SpawnSyncReturns<string>;
  const duration = Math.max(0, clock() - started);
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    const category = code === 'ETIMEDOUT' ? 'timeout' : code === 'ENOBUFS' ? 'output_overflow' : 'execution';
    throw new OperationError(
      category,
      `operation ${descriptor.operation_id} failed to execute: ${result.error.message}`,
    );
  }
  return Object.freeze({
    schema_version: 1,
    operation_id: descriptor.operation_id,
    descriptor_digest: descriptor.digest,
    input_digest: descriptor.input_digest,
    workspace_id: descriptor.workspace_id,
    before_binding_generation: descriptor.binding_generation,
    after_binding_generation: descriptor.binding_generation,
    before_workspace_generation: descriptor.workspace_generation,
    after_workspace_generation: descriptor.workspace_generation,
    outcome: result.status === 0 ? 'succeeded' : 'failed',
    exit_code: result.status,
    signal: result.signal,
    duration_ms: duration,
    stdout_sha256: digestOutput(result.stdout),
    stderr_sha256: digestOutput(result.stderr),
  });
}

export function buildExceptionalCommand(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string | undefined,
  executable: string,
  argv: readonly string[],
  expectedBindingGeneration?: number,
): ExceptionalCommandDescriptor {
  assertCommand(executable, argv);
  const resolution = resolveProjectRoot(controlRoot, host, sessionId, expectedBindingGeneration);
  const operation = SEMANTIC_OPERATION_REGISTRY['command.exceptional'];
  const workspaceState: OperationWorkspaceState = resolution.enabled
    ? (resolution.context?.workspace_lifecycle ?? 'unbound')
    : 'disabled';
  if (!operation.legal_workspace_states.includes(workspaceState as never))
    throw new OperationError('stale', `operation command.exceptional is illegal in workspace state ${workspaceState}`);
  const inputSchema = Object.freeze({ type: 'object' as const, additional_properties: false as const });
  const evidenceSchema = Object.freeze({
    schema_version: 1 as const,
    output: 'sha256' as const,
    generations: 'before_after' as const,
  });
  const unsigned = {
    schema_version: 1 as const,
    registry_version: OPERATION_REGISTRY_VERSION,
    operation_id: 'command.exceptional' as const,
    input_schema: inputSchema,
    input_digest: digest({ executable, argv }),
    operation_class: 'project' as const,
    legal_workspace_states: [...operation.legal_workspace_states],
    executable,
    argv: [...argv],
    cwd: realpathSync(resolution.root),
    environment_keys: [...ENVIRONMENT_KEYS],
    approval_class: 'exceptional_command' as const,
    cwd_policy: 'execution_root' as const,
    timeout_ms: 300_000,
    max_output_bytes: MAX_OUTPUT_BYTES,
    workspace_id: resolution.context?.workspace_id ?? null,
    binding_generation: resolution.context?.binding_generation ?? null,
    workspace_generation: resolution.context?.workspace_generation ?? null,
    idempotency_policy: 'repeatable' as const,
    state_transition: 'none' as const,
    evidence_schema: evidenceSchema,
  };
  const descriptor = { ...unsigned, digest: digest(unsigned) };
  Object.freeze(descriptor.argv);
  Object.freeze(descriptor.environment_keys);
  Object.freeze(descriptor.legal_workspace_states);
  return Object.freeze(descriptor);
}

export function executeRegisteredExceptionalCommand(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string | undefined,
  executable: string,
  argv: readonly string[],
  consentDigest: string,
  expectedBindingGeneration?: number,
  options: ExecuteTaskOperationOptions = {},
): OperationEvidence {
  return executeTaskOperation(
    buildExceptionalCommand(controlRoot, host, sessionId, executable, argv, expectedBindingGeneration),
    consentDigest,
    options,
  );
}

export function executeRegisteredTaskOperation(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string | undefined,
  operationId: SemanticTaskOperationId,
  consentDigest: string,
  expectedBindingGeneration?: number,
  options: ExecuteTaskOperationOptions = {},
): OperationEvidence {
  const descriptor = buildTaskOperation(controlRoot, host, sessionId, operationId, expectedBindingGeneration);
  return executeTaskOperation(descriptor, consentDigest, options);
}

export function nextBootstrapOperation(state: BootstrapState): BootstrapOperationId | null {
  assertGenerationState(state);
  switch (state.stage) {
    case 'unbound':
      return 'workspace.allocate_provisional';
    case 'workspace_bound':
      return 'authority.create';
    case 'authority_created':
      return 'workspace.attach_epic';
    case 'epic_attached':
      return 'bootstrap.install';
    case 'complete':
      return null;
  }
}

export function deriveNextBootstrapOperation(
  controlRoot: string,
  host: ExecutionHost,
  sessionId: string | undefined,
  input: BootstrapCoordinatorInput = {},
): BootstrapOperationId | null {
  if (!sessionId) throw new OperationError('configuration', 'bootstrap coordination requires host session identity');
  const config = readConfig(controlRoot);
  if (config instanceof ConfigError) throw new OperationError('configuration', config.message);
  if (!config.skills.cvs.enabled || config.skills.cvs.local !== 'git' || !config.skills.cvs.workspaces)
    throw new OperationError('configuration', 'bootstrap coordination requires session-bound Git workspaces');

  const evidence = input.evidence ?? [];
  const provider = createExecutionContextProvider(controlRoot);
  if (!provider.hasBinding(host, sessionId)) {
    if (input.epic_id || evidence.length > 0)
      throw new OperationError('stale', 'unbound bootstrap cannot accept later-stage authority or evidence');
    return 'workspace.allocate_provisional';
  }

  const context = provider.resolve(host, sessionId);
  if (context.epic_id === null) {
    if (evidence.length > 0) throw new OperationError('stale', 'bootstrap evidence is illegal before Epic attachment');
    if (!input.epic_id) return 'authority.create';
    const authority = getIssue(context.execution_root, input.epic_id);
    if (authority.metadata.type !== 'epic' || authority.location !== 'active')
      throw new OperationError('stale', 'bootstrap authority must be one active canonical Epic');
    return 'workspace.attach_epic';
  }

  if (input.epic_id && input.epic_id !== context.epic_id)
    throw new OperationError('stale', 'bootstrap Epic does not match the attached execution workspace');
  const descriptor = buildTaskOperation(controlRoot, host, sessionId, 'bootstrap.install', context.binding_generation);
  const matching = evidence.filter(
    (item) =>
      item.operation_id === descriptor.operation_id &&
      item.descriptor_digest === descriptor.digest &&
      item.input_digest === descriptor.input_digest &&
      item.workspace_id === context.workspace_id &&
      item.before_binding_generation === context.binding_generation &&
      item.after_binding_generation === context.binding_generation &&
      item.before_workspace_generation === context.workspace_generation &&
      item.after_workspace_generation === context.workspace_generation,
  );
  if (evidence.length !== matching.length)
    throw new OperationError('stale', 'bootstrap evidence is stale, reordered, or belongs to another workspace');
  if (matching.length > 1) throw new OperationError('stale', 'bootstrap install evidence is repeated');
  return matching[0]?.outcome === 'succeeded' ? null : 'bootstrap.install';
}

function resolveRunner(runner: AutomationRunner, root: string): Exclude<AutomationRunner, 'auto'> {
  if (runner !== 'auto') {
    if (!existsSync(join(root, RUNNERS[runner].manifest)))
      throw new OperationError(
        'configuration',
        `configured automation runner ${runner} has no ${RUNNERS[runner].manifest}`,
      );
    return runner;
  }
  const matches = (
    Object.entries(RUNNERS) as Array<
      [Exclude<AutomationRunner, 'auto'>, (typeof RUNNERS)[Exclude<AutomationRunner, 'auto'>]]
    >
  )
    .filter(([, definition]) => existsSync(join(root, definition.manifest)))
    .map(([name]) => name);
  if (matches.length !== 1)
    throw new OperationError(
      'configuration',
      matches.length === 0
        ? 'no supported automation task manifest found'
        : `automation runner is ambiguous: ${matches.join(', ')}`,
    );
  return matches[0] as Exclude<AutomationRunner, 'auto'>;
}

function assertDescriptor(descriptor: RegisteredProcessDescriptor): void {
  const { digest: descriptorDigest, ...unsigned } = descriptor;
  if (digest(unsigned) !== descriptorDigest)
    throw new OperationError('stale', 'operation descriptor digest is invalid');
  if (descriptor.operation_id !== 'command.exceptional' && !TASK_OPERATIONS[descriptor.operation_id])
    throw new OperationError('unsupported', `unsupported semantic operation: ${descriptor.operation_id}`);
}

function assertCommand(executable: string, argv: readonly string[]): void {
  if (!executable || executable.length > 1024 || executable.includes('\0'))
    throw new OperationError('configuration', 'exceptional command executable is invalid');
  if (
    !Array.isArray(argv) ||
    argv.length > 256 ||
    argv.some((value) => typeof value !== 'string' || value.length > 4096 || value.includes('\0'))
  )
    throw new OperationError('configuration', 'exceptional command arguments are invalid');
}

function assertGenerationState(state: BootstrapState): void {
  if (state.stage === 'unbound') return;
  if (!Number.isSafeInteger(state.binding_generation) || state.binding_generation < 1)
    throw new OperationError('stale', 'bootstrap binding generation is invalid');
  if (!Number.isSafeInteger(state.workspace_generation) || state.workspace_generation < 1)
    throw new OperationError('stale', 'bootstrap workspace generation is invalid');
  if ('epic_id' in state && !/^hrn-(?:\d{5}|[0-9A-HJKMNP-TV-Z]{26})$/.test(state.epic_id))
    throw new OperationError('configuration', 'bootstrap Epic identity is invalid');
}

function selectEnvironment(source: NodeJS.ProcessEnv, keys: readonly string[]): NodeJS.ProcessEnv {
  return Object.fromEntries(keys.flatMap((key) => (source[key] === undefined ? [] : [[key, source[key]]])));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function digestOutput(value: string | Buffer | null): string {
  return createHash('sha256')
    .update(value ?? '')
    .digest('hex');
}
