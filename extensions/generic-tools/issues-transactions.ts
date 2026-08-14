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
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { IssueError, canonicalIssueFilename, decodeIssueDocument, encodeCanonicalIssue } from './issues-contract.js';
import {
  projectIssueDocument,
  type IssueProjectionChange,
  type IssueProjectionChangeSet,
  type IssueProjectionSink,
} from './issues-storage.js';

const TRANSACTION_VERSION = 1 as const;
const CONTROL_PATH = '.issues/.control';
const TRANSACTIONS_PATH = `${CONTROL_PATH}/transactions`;
const LOCK_PATH = `${CONTROL_PATH}/mutation.lock`;
const PROJECTION_DIRTY_PATH = `${CONTROL_PATH}/projection-dirty.json`;
const DEFAULT_LOCK_WAIT_MS = 5_000;
const DEFAULT_STALE_GRACE_MS = 1_000;
const DEFAULT_TRANSACTION_BYTES = 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export type IssueTransactionActionKind = 'create' | 'rewrite' | 'move';

export interface IssueTransactionActionPlan {
  issueId: string;
  kind: IssueTransactionActionKind;
  source?: string;
  destination: string;
  afterBytes?: Uint8Array;
  expectedBeforeDigest?: string;
  resultingRevision?: string;
}

export interface IssueTransactionRequest {
  transactionId?: string;
  operation: string;
  actions: readonly IssueTransactionActionPlan[];
}

export type IssueTransactionFaultBoundary =
  | 'staged-write'
  | 'staged-flush'
  | 'manifest-temporary-write'
  | 'manifest-temporary-flush'
  | 'manifest-publish'
  | 'canonical-apply'
  | 'directory-flush'
  | 'before-commit-gate'
  | 'committed-marker'
  | 'projection-apply'
  | 'projection-dirty-marker'
  | 'cleanup';

export interface IssueTransactionFaultEvent {
  boundary: IssueTransactionFaultBoundary;
  transactionId: string;
  actionIndex?: number;
  path?: string;
}

export interface IssueTransactionOptions {
  issuePrefix?: string;
  lockWaitMs?: number;
  staleLockGraceMs?: number;
  maxTransactionBytes?: number;
  now?: () => Date;
  transactionId?: () => string;
  fault?: (event: IssueTransactionFaultEvent) => void;
  projectionSink?: IssueProjectionSink;
}

export interface IssueTransactionResult {
  transactionId: string;
  recovered: boolean;
}

export interface IssueMutationContext {
  commit(request: IssueTransactionRequest): IssueTransactionResult;
}

interface FileState {
  presence: boolean;
  digest?: string;
}

interface IssueTransactionManifestAction {
  issueId: string;
  kind: IssueTransactionActionKind;
  source?: string;
  destination: string;
  beforeSource: FileState;
  beforeDestination: FileState;
  afterSource: FileState;
  afterDestination: FileState;
  staged?: string;
  intermediate?: string;
  resultingRevision?: string;
}

interface IssueTransactionManifest {
  version: typeof TRANSACTION_VERSION;
  transactionId: string;
  operation: string;
  preparedAt: string;
  issueIds: string[];
  totalStagedBytes: number;
  actions: IssueTransactionManifestAction[];
}

interface LockOwner {
  version: typeof TRANSACTION_VERSION;
  nonce: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
  processStart?: string;
}

interface ResolvedOptions {
  issuePrefix: string;
  lockWaitMs: number;
  staleLockGraceMs: number;
  maxTransactionBytes: number;
  now: () => Date;
  transactionId: () => string;
  fault?: (event: IssueTransactionFaultEvent) => void;
  projectionSink?: IssueProjectionSink;
}

/**
 * Serializes every storage-facing issue operation. Prepared work is recovered
 * before the callback can classify or inspect ordinary issue storage.
 */
export function withIssueMutationLock<T>(
  repositoryRoot: string,
  operation: (context: IssueMutationContext) => T,
  options: IssueTransactionOptions = {},
): T {
  const root = validateRepositoryRoot(repositoryRoot);
  const resolvedOptions = resolveOptions(options);
  return withProjectLock(root, resolvedOptions, () => {
    recoverPreparedTransactionsUnlocked(root, resolvedOptions);
    return operation({
      commit: (request) => commitUnlocked(root, request, resolvedOptions),
    });
  });
}

export function commitIssueTransaction(
  repositoryRoot: string,
  request: IssueTransactionRequest,
  options: IssueTransactionOptions = {},
): IssueTransactionResult {
  return withIssueMutationLock(repositoryRoot, (context) => context.commit(request), options);
}

export function recoverIssueTransactions(
  repositoryRoot: string,
  options: IssueTransactionOptions = {},
): readonly string[] {
  const recovered: string[] = [];
  const root = validateRepositoryRoot(repositoryRoot);
  const resolvedOptions = resolveOptions(options);
  return withProjectLock(root, resolvedOptions, () => {
    recoverPreparedTransactionsUnlocked(root, resolvedOptions, recovered);
    return recovered;
  });
}

/** Reports retained control-plane evidence without changing repository state. */
export function inspectIssueTransactionEvidence(repositoryRoot: string): readonly IssueError[] {
  const root = validateRepositoryRoot(repositoryRoot);
  const findings: IssueError[] = [];
  const dirtyPath = resolveControlPath(root, PROJECTION_DIRTY_PATH);
  if (existsSync(dirtyPath)) {
    let transactionId: string | undefined;
    try {
      const marker = JSON.parse(readRegularFile(dirtyPath).toString('utf8')) as unknown;
      if (isRecord(marker) && typeof marker.transactionId === 'string') transactionId = marker.transactionId;
    } catch {
      // Malformed or unsafe evidence is itself reportable and must remain untouched.
    }
    findings.push(
      new IssueError('projection_sync', 'canonical issue projection is dirty and requires a successful rebuild', {
        paths: [PROJECTION_DIRTY_PATH],
        ...(transactionId ? { transactionId } : {}),
        retryable: true,
      }),
    );
  }

  const transactionsRoot = resolveControlPath(root, TRANSACTIONS_PATH);
  if (!existsSync(transactionsRoot)) return findings;
  try {
    assertSafeDirectory(transactionsRoot, 'issue transaction root');
    for (const entry of readdirSync(transactionsRoot, { withFileTypes: true }).sort((left, right) =>
      compareCodePoints(left.name, right.name),
    )) {
      findings.push(
        recoveryError(entry.name, 'prepared issue transaction evidence remains and requires recovery', [
          `${TRANSACTIONS_PATH}/${entry.name}`,
        ]),
      );
    }
  } catch (error: unknown) {
    findings.push(error instanceof IssueError ? error : recoveryError('', 'issue transaction evidence is unsafe'));
  }
  return findings;
}

function commitUnlocked(
  root: string,
  request: IssueTransactionRequest,
  options: ResolvedOptions,
): IssueTransactionResult {
  const transactionId = validateTransactionId(request.transactionId ?? options.transactionId());
  const transactionRoot = resolveControlPath(root, `${TRANSACTIONS_PATH}/${transactionId}`);
  ensureSafeDirectory(dirname(transactionRoot));
  if (existsSync(transactionRoot)) {
    throw recoveryError(transactionId, 'issue transaction identity already exists', [
      portableRelative(root, transactionRoot),
    ]);
  }
  validateOperation(request.operation);
  const plans = [...request.actions].sort(comparePlans);
  if (plans.length === 0) throw new IssueError('schema', 'issue transaction must contain at least one action');
  assertNonOverlappingPlans(plans);

  mkdirDurable(transactionRoot);
  const stagedRoot = join(transactionRoot, 'staged');
  mkdirDurable(stagedRoot);
  let manifestPublished = false;
  try {
    const manifest = prepareManifest(root, transactionRoot, transactionId, request.operation, plans, options);
    assertManifestBeforeState(root, manifest);
    const temporaryManifest = join(transactionRoot, 'manifest.json.tmp');
    writeExclusiveFlushed(temporaryManifest, Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'));
    fault(options, { boundary: 'manifest-temporary-write', transactionId });
    fault(options, { boundary: 'manifest-temporary-flush', transactionId });
    renameSync(temporaryManifest, join(transactionRoot, 'manifest.json'));
    flushDirectory(transactionRoot);
    manifestPublished = true;
    fault(options, { boundary: 'manifest-publish', transactionId });
    applyManifest(root, transactionRoot, manifest, options);
    publishProjection(root, transactionRoot, manifest, options);
    cleanupTransaction(root, transactionRoot, options, transactionId);
    return { transactionId, recovered: false };
  } catch (error: unknown) {
    if (!manifestPublished) cleanupUnpreparedTransaction(root, transactionRoot);
    throw asTransactionError(error, transactionId);
  }
}

function assertManifestBeforeState(root: string, manifest: IssueTransactionManifest): void {
  const conflicts = manifest.actions.flatMap((action) => actionStateConflicts(root, action, false));
  if (conflicts.length === 0) return;
  throw new IssueError('stale_revision', 'issue transaction input changed before durable preparation', {
    paths: [...new Set(conflicts)].sort(compareCodePoints),
    retryable: manifest.operation === 'create',
  });
}

function prepareManifest(
  root: string,
  transactionRoot: string,
  transactionId: string,
  operation: string,
  plans: readonly IssueTransactionActionPlan[],
  options: ResolvedOptions,
): IssueTransactionManifest {
  const actions: IssueTransactionManifestAction[] = [];
  let totalStagedBytes = 0;
  for (const [index, plan] of plans.entries()) {
    const source = plan.source ? validateCanonicalPath(root, plan.source) : undefined;
    const destination = validateCanonicalPath(root, plan.destination);
    validateActionShape(plan, source, destination);
    const beforeSource = source ? inspectFile(root, source) : absentState();
    const beforeDestination = source === destination ? beforeSource : inspectFile(root, destination);
    assertBeforeState(plan, beforeSource, beforeDestination);

    let afterBytes = plan.afterBytes;
    if (plan.kind === 'move' && afterBytes === undefined) {
      if (!source || !beforeSource.presence) throw new IssueError('stale_revision', 'issue move source is missing');
      afterBytes = readRegularFile(resolve(root, source));
    }
    if (!afterBytes) throw new IssueError('schema', 'issue transaction action requires canonical after bytes');
    const decoded = decodeIssueDocument(afterBytes, { expectedId: plan.issueId, issuePrefix: options.issuePrefix });
    if (plan.resultingRevision !== undefined && plan.resultingRevision !== decoded.revision) {
      throw new IssueError('schema', 'issue transaction projection revision differs from canonical after-image', {
        issueIds: [plan.issueId],
      });
    }
    const expectedDestination = `${dirname(destination)}/${canonicalIssueFilename(plan.issueId, decoded.issue.title)}`;
    if (expectedDestination !== destination) {
      throw new IssueError(
        'schema',
        'issue transaction destination does not match canonical issue identity and title',
        {
          issueIds: [plan.issueId],
          paths: [destination],
        },
      );
    }
    totalStagedBytes += afterBytes.byteLength;
    if (totalStagedBytes > options.maxTransactionBytes) {
      throw new IssueError('resource_limit', 'prepared issue transaction byte limit exceeded', {
        limit: 'transactionBytes',
      });
    }
    const staged = `staged/${String(index).padStart(6, '0')}.bin`;
    writeExclusiveFlushed(resolve(transactionRoot, staged), afterBytes);
    fault(options, { boundary: 'staged-write', transactionId, actionIndex: index, path: staged });
    fault(options, { boundary: 'staged-flush', transactionId, actionIndex: index, path: staged });
    const afterDigest = digest(afterBytes);
    const intermediate = temporaryCanonicalPath(destination, transactionId, index);
    actions.push({
      issueId: plan.issueId,
      kind: plan.kind,
      source,
      destination,
      beforeSource,
      beforeDestination,
      afterSource: source && source !== destination ? absentState() : presentState(afterDigest),
      afterDestination: presentState(afterDigest),
      staged,
      intermediate,
      resultingRevision: decoded.revision,
    });
  }
  flushDirectory(join(transactionRoot, 'staged'));
  return {
    version: TRANSACTION_VERSION,
    transactionId,
    operation,
    preparedAt: canonicalTimestamp(options.now()),
    issueIds: [...new Set(actions.map((action) => action.issueId))].sort(compareCodePoints),
    totalStagedBytes,
    actions,
  };
}

function validateIssuePrefix(value: string): string {
  if (Array.from(value).some((character) => character < ' ') || /[/\\<>:"|?*]/u.test(value)) {
    throw new IssueError('configuration', 'configured issue prefix is unsafe');
  }
  return value;
}

function applyManifest(
  root: string,
  transactionRoot: string,
  manifest: IssueTransactionManifest,
  options: ResolvedOptions,
): void {
  validateStagedFiles(transactionRoot, manifest, options.maxTransactionBytes, options.issuePrefix);
  for (const [index, action] of manifest.actions.entries()) {
    applyAction(root, transactionRoot, manifest.transactionId, action, index, options);
  }
  fault(options, { boundary: 'before-commit-gate', transactionId: manifest.transactionId });
  const conflicts = finalAfterStateConflicts(root, manifest.actions);
  if (conflicts.length > 0) {
    throw recoveryError(manifest.transactionId, 'issue transaction destination after-state conflict', conflicts);
  }
  const marker = join(transactionRoot, 'committed');
  if (!existsSync(marker)) writeExclusiveFlushed(marker, Buffer.from('committed\n', 'utf8'));
  flushDirectory(transactionRoot);
  fault(options, { boundary: 'committed-marker', transactionId: manifest.transactionId });
}

function applyAction(
  root: string,
  transactionRoot: string,
  transactionId: string,
  action: IssueTransactionManifestAction,
  index: number,
  options: ResolvedOptions,
): void {
  const afterConflicts = actionStateConflicts(root, action, true);
  if (afterConflicts.length === 0) return;
  const beforeConflicts = actionStateConflicts(root, action, false);
  const intermediate = inspectIntermediate(root, action);
  const moveIntermediate = isMoveIntermediate(root, action);
  if (beforeConflicts.length > 0 && !intermediate && !moveIntermediate) {
    throw recoveryError(
      transactionId,
      'prepared issue transaction conflicts with canonical state',
      conflictPaths(action),
    );
  }
  const stagedPath = resolve(transactionRoot, action.staged ?? '');
  const bytes = readRegularFile(stagedPath);
  if (moveIntermediate) {
    unlinkSync(resolve(root, action.source ?? ''));
    if (action.intermediate) rmSync(resolve(root, action.intermediate), { force: true });
    fault(options, { boundary: 'canonical-apply', transactionId, actionIndex: index, path: action.source });
  } else if (intermediate && action.kind === 'rewrite') {
    finishRewriteIntermediate(root, action, bytes);
    fault(options, { boundary: 'canonical-apply', transactionId, actionIndex: index, path: action.destination });
  } else if (action.kind === 'rewrite') {
    applyRewrite(root, action, bytes);
    fault(options, { boundary: 'canonical-apply', transactionId, actionIndex: index, path: action.destination });
  } else {
    applyCreateOrMove(root, action, stagedPath, options, transactionId, index);
  }
  flushActionDirectories(root, action);
  fault(options, {
    boundary: 'directory-flush',
    transactionId,
    actionIndex: index,
    path: dirname(action.destination),
  });
}

function applyRewrite(root: string, action: IssueTransactionManifestAction, bytes: Buffer): void {
  const sourcePath = resolve(root, action.source ?? '');
  const intermediatePath = resolve(root, action.intermediate ?? '');
  assertMatches(root, action.source ?? '', action.beforeSource);
  writeExclusiveFlushed(intermediatePath, bytes);
  assertMatches(root, action.source ?? '', action.beforeSource);
  renameSync(intermediatePath, sourcePath);
}

function finishRewriteIntermediate(root: string, action: IssueTransactionManifestAction, bytes: Buffer): void {
  const intermediate = action.intermediate;
  if (!intermediate) throw new IssueError('transaction_recovery', 'issue transaction intermediate is missing');
  const intermediatePath = resolve(root, intermediate);
  if (digest(readRegularFile(intermediatePath)) !== digest(bytes)) {
    throw new IssueError('transaction_recovery', 'issue transaction intermediate digest differs');
  }
  assertMatches(root, action.source ?? '', action.beforeSource);
  renameSync(intermediatePath, resolve(root, action.destination));
}

function applyCreateOrMove(
  root: string,
  action: IssueTransactionManifestAction,
  stagedPath: string,
  options: ResolvedOptions,
  transactionId: string,
  actionIndex: number,
): void {
  const destinationPath = resolve(root, action.destination);
  if (!statesEqual(inspectFile(root, action.destination), action.afterDestination)) {
    assertMatches(root, action.destination, action.beforeDestination);
    ensureCanonicalParent(root, action.destination);
    const intermediatePath = resolve(root, action.intermediate ?? '');
    if (!existsSync(intermediatePath)) writeExclusiveFlushed(intermediatePath, readRegularFile(stagedPath));
    assertMatches(root, action.destination, action.beforeDestination);
    try {
      linkSync(intermediatePath, destinationPath);
    } catch (error: unknown) {
      if (isErrorCode(error, 'EEXIST')) {
        throw new IssueError('transaction_recovery', 'issue transaction destination changed during apply', {
          paths: [action.destination],
        });
      }
      throw error;
    }
    fault(options, {
      boundary: 'canonical-apply',
      transactionId,
      actionIndex,
      path: action.destination,
    });
  }
  if (action.intermediate) rmSync(resolve(root, action.intermediate), { force: true });
  if (action.kind === 'move' && action.source && action.source !== action.destination) {
    const sourceState = inspectFile(root, action.source);
    if (statesEqual(sourceState, action.afterSource)) return;
    if (!statesEqual(sourceState, action.beforeSource)) {
      throw recoveryError('', 'issue move source changed before removal', [action.source]);
    }
    unlinkSync(resolve(root, action.source));
  }
}

function isMoveIntermediate(root: string, action: IssueTransactionManifestAction): boolean {
  return (
    action.kind === 'move' &&
    action.source !== undefined &&
    statesEqual(inspectFile(root, action.source), action.beforeSource) &&
    statesEqual(inspectFile(root, action.destination), action.afterDestination)
  );
}

function recoverPreparedTransactionsUnlocked(root: string, options: ResolvedOptions, recovered: string[] = []): void {
  const transactionsRoot = resolveControlPath(root, TRANSACTIONS_PATH);
  if (!existsSync(transactionsRoot)) return;
  assertSafeDirectory(transactionsRoot, 'issue transaction root');
  const entries = readdirSync(transactionsRoot, { withFileTypes: true }).sort((left, right) =>
    compareCodePoints(left.name, right.name),
  );
  for (const entry of entries) {
    const transactionId = validateTransactionId(entry.name);
    const transactionRoot = join(transactionsRoot, transactionId);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw recoveryError(transactionId, 'issue transaction entry must be a non-symlink directory', [
        portableRelative(root, transactionRoot),
      ]);
    }
    const manifestPath = join(transactionRoot, 'manifest.json');
    if (!existsSync(manifestPath)) {
      cleanupUnpreparedTransaction(root, transactionRoot);
      continue;
    }
    const manifest = parseManifest(root, transactionRoot, readRegularFile(manifestPath).toString('utf8'));
    if (manifest.transactionId !== transactionId) {
      throw recoveryError(transactionId, 'issue transaction manifest identity differs from its directory', [
        portableRelative(root, manifestPath),
      ]);
    }
    try {
      validateStagedFiles(transactionRoot, manifest, options.maxTransactionBytes, options.issuePrefix);
      if (!existsSync(join(transactionRoot, 'committed'))) applyManifest(root, transactionRoot, manifest, options);
      if (!options.projectionSink && hasProjectionDirtyEvidence(root, transactionId)) continue;
      publishProjection(root, transactionRoot, manifest, options);
      cleanupTransaction(root, transactionRoot, options, transactionId);
      recovered.push(transactionId);
    } catch (error: unknown) {
      throw asTransactionError(error, transactionId);
    }
  }
}

function parseManifest(root: string, transactionRoot: string, content: string): IssueTransactionManifest {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new IssueError('transaction_recovery', 'prepared issue transaction manifest is malformed');
  }
  if (!isRecord(value) || value.version !== 1) {
    throw new IssueError('transaction_recovery', 'prepared issue transaction version is unsupported');
  }
  const transactionId = requireString(value.transactionId, 'transaction identity');
  validateTransactionId(transactionId);
  const operation = requireString(value.operation, 'transaction operation');
  validateOperation(operation);
  const preparedAt = requireString(value.preparedAt, 'transaction preparation timestamp');
  if (!Array.isArray(value.issueIds) || !value.issueIds.every(isNonEmptyString)) {
    throw new IssueError('transaction_recovery', 'prepared issue transaction issue IDs are malformed');
  }
  if (!Number.isSafeInteger(value.totalStagedBytes) || Number(value.totalStagedBytes) < 0) {
    throw new IssueError('transaction_recovery', 'prepared issue transaction byte total is malformed');
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    throw new IssueError('transaction_recovery', 'prepared issue transaction actions are malformed');
  }
  const actions = value.actions.map((entry) => parseManifestAction(root, transactionRoot, entry));
  const manifest: IssueTransactionManifest = {
    version: TRANSACTION_VERSION,
    transactionId,
    operation,
    preparedAt,
    issueIds: [...value.issueIds],
    totalStagedBytes: Number(value.totalStagedBytes),
    actions,
  };
  const ordered = [...actions].sort(compareManifestActions);
  if (ordered.some((action, index) => action !== actions[index])) {
    throw new IssueError('transaction_recovery', 'prepared issue transaction action order is invalid');
  }
  return manifest;
}

function parseManifestAction(root: string, transactionRoot: string, value: unknown): IssueTransactionManifestAction {
  if (!isRecord(value) || !isActionKind(value.kind)) {
    throw new IssueError('transaction_recovery', 'prepared issue transaction action is malformed');
  }
  const source =
    value.source === undefined ? undefined : validateCanonicalPath(root, requireString(value.source, 'source'));
  const destination = validateCanonicalPath(root, requireString(value.destination, 'destination'));
  const staged =
    value.staged === undefined ? undefined : validateStagedPath(transactionRoot, requireString(value.staged, 'staged'));
  const intermediate =
    value.intermediate === undefined
      ? undefined
      : validateIntermediatePath(root, requireString(value.intermediate, 'intermediate'));
  const resultingRevision =
    value.resultingRevision === undefined ? undefined : requireString(value.resultingRevision, 'resulting revision');
  return {
    issueId: requireString(value.issueId, 'issue ID'),
    kind: value.kind,
    source,
    destination,
    beforeSource: parseFileState(value.beforeSource),
    beforeDestination: parseFileState(value.beforeDestination),
    afterSource: parseFileState(value.afterSource),
    afterDestination: parseFileState(value.afterDestination),
    staged,
    intermediate,
    resultingRevision,
  };
}

function validateStagedFiles(
  transactionRoot: string,
  manifest: IssueTransactionManifest,
  maximumBytes: number,
  issuePrefix: string,
): void {
  const stagedRoot = join(transactionRoot, 'staged');
  if (!existsSync(stagedRoot)) {
    throw recoveryError(manifest.transactionId, 'prepared issue transaction staging directory is missing');
  }
  try {
    assertSafeDirectory(stagedRoot, 'issue transaction staging directory');
  } catch {
    throw recoveryError(manifest.transactionId, 'prepared issue transaction staging directory is unsafe', [
      `${portableRelative(dirname(dirname(dirname(transactionRoot))), transactionRoot)}/staged`,
    ]);
  }
  let total = 0;
  const manifestedIssueIds: string[] = [];
  for (const action of manifest.actions) {
    if (!action.staged || !action.afterDestination.digest) {
      throw recoveryError(manifest.transactionId, 'prepared issue transaction staged image is missing');
    }
    const stagedPath = resolve(transactionRoot, action.staged);
    const staged = readRegularFile(stagedPath);
    total += staged.byteLength;
    let canonical: Uint8Array;
    let revision: string;
    let title: string;
    try {
      const decoded = decodeIssueDocument(staged, {
        expectedId: action.issueId,
        issuePrefix,
        requireCanonical: false,
      });
      canonical = encodeCanonicalIssue(decoded.issue);
      revision = decoded.revision;
      title = decoded.issue.title;
    } catch {
      throw recoveryError(manifest.transactionId, 'prepared issue transaction staged image is not canonical', [
        `${portableRelative(dirname(dirname(dirname(transactionRoot))), transactionRoot)}/${action.staged}`,
      ]);
    }
    const canonicalDigest = digest(canonical);
    const expectedDestination = `${dirname(action.destination)}/${canonicalIssueFilename(action.issueId, title)}`;
    const validActionShape =
      (action.kind === 'create' && action.source === undefined) ||
      (action.kind === 'rewrite' && action.source === action.destination) ||
      (action.kind === 'move' && action.source !== undefined && action.source !== action.destination);
    const validActionImage =
      validActionShape &&
      Buffer.from(canonical).equals(staged) &&
      canonicalDigest === action.afterDestination.digest &&
      action.afterDestination.presence &&
      action.resultingRevision === revision &&
      expectedDestination === action.destination &&
      (!action.source || action.source === action.destination
        ? statesEqual(action.afterSource, action.afterDestination)
        : !action.afterSource.presence);
    if (total > maximumBytes || !validActionImage) {
      throw recoveryError(manifest.transactionId, 'prepared issue transaction staged image differs', [
        `${portableRelative(dirname(dirname(dirname(transactionRoot))), transactionRoot)}/${action.staged}`,
      ]);
    }
    manifestedIssueIds.push(action.issueId);
  }
  if (total !== manifest.totalStagedBytes) {
    throw recoveryError(manifest.transactionId, 'prepared issue transaction staged byte total differs');
  }
  const expectedIssueIds = [...new Set(manifestedIssueIds)].sort(compareCodePoints);
  if (
    expectedIssueIds.length !== manifest.issueIds.length ||
    expectedIssueIds.some((issueId, index) => issueId !== manifest.issueIds[index])
  ) {
    throw recoveryError(manifest.transactionId, 'prepared issue transaction issue ID inventory differs');
  }
}

function finalAfterStateConflicts(root: string, actions: readonly IssueTransactionManifestAction[]): string[] {
  const conflicts: string[] = [];
  for (const action of actions) conflicts.push(...actionStateConflicts(root, action, true));
  return [...new Set(conflicts)].sort(compareCodePoints);
}

function actionStateConflicts(root: string, action: IssueTransactionManifestAction, after: boolean): string[] {
  const conflicts: string[] = [];
  const sourceState = after ? action.afterSource : action.beforeSource;
  const destinationState = after ? action.afterDestination : action.beforeDestination;
  if (action.source && !statesEqual(inspectFile(root, action.source), sourceState)) conflicts.push(action.source);
  if (action.source !== action.destination && !statesEqual(inspectFile(root, action.destination), destinationState)) {
    conflicts.push(action.destination);
  }
  if (after && action.intermediate && inspectFile(root, action.intermediate, true).presence) {
    conflicts.push(action.intermediate);
  }
  if (after && hasPortableAlias(root, action.destination)) conflicts.push(action.destination);
  return conflicts;
}

function inspectIntermediate(root: string, action: IssueTransactionManifestAction): boolean {
  if (!action.intermediate) return false;
  const state = inspectFile(root, action.intermediate, true);
  if (!state.presence) return false;
  if (state.digest !== action.afterDestination.digest) {
    throw new IssueError('transaction_recovery', 'issue transaction intermediate conflicts with manifest', {
      paths: [action.intermediate],
    });
  }
  return true;
}

function withProjectLock<T>(root: string, options: ResolvedOptions, operation: () => T): T {
  const lockPath = resolveControlPath(root, LOCK_PATH);
  const controlExisted = existsSync(resolve(root, CONTROL_PATH));
  const issuesExisted = existsSync(resolve(root, '.issues'));
  ensureControlDirectories(root);
  const deadline = Date.now() + options.lockWaitMs;
  const owner = createLockOwner(options);
  while (true) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      writeExclusiveFlushed(join(lockPath, 'owner.json'), Buffer.from(`${JSON.stringify(owner)}\n`, 'utf8'));
      flushDirectory(lockPath);
      break;
    } catch (error: unknown) {
      if (!isErrorCode(error, 'EEXIST')) {
        throw new IssueError('filesystem_durability', 'cannot acquire project issue mutation lock');
      }
      if (tryRemoveDeadLock(lockPath, options)) continue;
      if (Date.now() >= deadline) {
        throw new IssueError(
          'lock_contention',
          'project issue mutation lock is busy; verify its owner before manual recovery',
          {
            paths: [LOCK_PATH],
            retryable: true,
          },
        );
      }
      sleep(20);
    }
  }
  try {
    return operation();
  } finally {
    releaseOwnedLock(root, lockPath, owner.nonce, controlExisted, issuesExisted);
  }
}

function tryRemoveDeadLock(lockPath: string, options: ResolvedOptions): boolean {
  let owner: LockOwner;
  try {
    owner = parseLockOwner(readRegularFile(join(lockPath, 'owner.json')).toString('utf8'));
  } catch {
    return false;
  }
  if (owner.hostname !== hostname()) return false;
  const acquired = Date.parse(owner.acquiredAt);
  if (!Number.isFinite(acquired) || options.now().getTime() - acquired < options.staleLockGraceMs) return false;
  if (processExists(owner.pid)) return false;
  rmSync(lockPath, { recursive: true, force: true });
  flushDirectory(dirname(lockPath));
  return true;
}

function releaseOwnedLock(
  root: string,
  lockPath: string,
  nonce: string,
  controlExisted: boolean,
  issuesExisted: boolean,
): void {
  try {
    const owner = parseLockOwner(readRegularFile(join(lockPath, 'owner.json')).toString('utf8'));
    if (owner.nonce !== nonce) return;
    rmSync(lockPath, { recursive: true, force: true });
    flushDirectory(dirname(lockPath));
    removeEmptyDirectory(resolve(root, TRANSACTIONS_PATH));
    if (!controlExisted) removeEmptyDirectory(resolve(root, CONTROL_PATH));
    if (!issuesExisted) removeEmptyDirectory(resolve(root, '.issues'));
  } catch {
    // Ownership uncertainty must retain the lock rather than remove another owner's evidence.
  }
}

function createLockOwner(options: ResolvedOptions): LockOwner {
  const processStart = readProcessStart(process.pid);
  return {
    version: TRANSACTION_VERSION,
    nonce: randomBytes(16).toString('hex'),
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: canonicalTimestamp(options.now()),
    ...(processStart ? { processStart } : {}),
  };
}

function parseLockOwner(content: string): LockOwner {
  const value = JSON.parse(content) as unknown;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.nonce !== 'string' ||
    !/^[a-f0-9]{32}$/u.test(value.nonce) ||
    !Number.isSafeInteger(value.pid) ||
    Number(value.pid) <= 0 ||
    typeof value.hostname !== 'string' ||
    typeof value.acquiredAt !== 'string' ||
    (value.processStart !== undefined && typeof value.processStart !== 'string')
  ) {
    throw new Error('invalid lock owner');
  }
  return {
    version: TRANSACTION_VERSION,
    nonce: value.nonce,
    pid: Number(value.pid),
    hostname: value.hostname,
    acquiredAt: value.acquiredAt,
    ...(value.processStart === undefined ? {} : { processStart: value.processStart }),
  };
}

function cleanupTransaction(
  root: string,
  transactionRoot: string,
  options: ResolvedOptions,
  transactionId: string,
): void {
  fault(options, { boundary: 'cleanup', transactionId });
  rmSync(transactionRoot, { recursive: true, force: true });
  flushDirectory(dirname(transactionRoot));
  removeEmptyDirectory(resolve(root, TRANSACTIONS_PATH));
}

function publishProjection(
  root: string,
  transactionRoot: string,
  manifest: IssueTransactionManifest,
  options: ResolvedOptions,
): void {
  if (!options.projectionSink) return;
  const changeSet = projectionChangeSet(transactionRoot, manifest);
  try {
    options.projectionSink.apply(changeSet);
    fault(options, { boundary: 'projection-apply', transactionId: manifest.transactionId });
    clearProjectionDirtyMarker(root, manifest.transactionId);
  } catch {
    writeProjectionDirtyMarker(root, changeSet);
    fault(options, { boundary: 'projection-dirty-marker', transactionId: manifest.transactionId });
    throw new IssueError('projection_sync', 'canonical issue state committed but projection synchronization failed', {
      transactionId: manifest.transactionId,
      issueIds: changeSet.changes.map((change) => change.id),
      retryable: true,
    });
  }
}

function projectionChangeSet(transactionRoot: string, manifest: IssueTransactionManifest): IssueProjectionChangeSet {
  const changes: IssueProjectionChange[] = manifest.actions.map((action) => {
    if (!action.staged) {
      throw recoveryError(manifest.transactionId, 'prepared issue transaction projection metadata is incomplete');
    }
    const decoded = decodeIssueDocument(readRegularFile(resolve(transactionRoot, action.staged)), {
      expectedId: action.issueId,
    });
    if (action.resultingRevision !== decoded.revision) {
      throw recoveryError(
        manifest.transactionId,
        'prepared issue transaction projection revision differs from after-image',
      );
    }
    const revision = decoded.revision;
    const location = issueLocation(action.destination);
    const record = projectIssueDocument(decoded.issue, location, action.destination, revision);
    if (action.kind === 'move' && action.source && issueLocation(action.source) !== location) {
      return {
        kind: 'location',
        id: action.issueId,
        from: issueLocation(action.source),
        to: location,
        record,
        revision,
      };
    }
    return { kind: 'upsert', id: action.issueId, record, revision };
  });
  changes.sort((left, right) => compareCodePoints(left.id, right.id) || compareCodePoints(left.kind, right.kind));
  return {
    version: TRANSACTION_VERSION,
    transactionId: manifest.transactionId,
    committedAt: manifest.preparedAt,
    changes,
  };
}

function hasProjectionDirtyEvidence(root: string, transactionId: string): boolean {
  const path = resolveControlPath(root, PROJECTION_DIRTY_PATH);
  if (!existsSync(path)) return false;
  try {
    const marker = JSON.parse(readRegularFile(path).toString('utf8')) as unknown;
    return !isRecord(marker) || marker.transactionId === transactionId;
  } catch {
    return true;
  }
}

function issueLocation(path: string): 'active' | 'archived' {
  return path.startsWith('.issues/archived/') ? 'archived' : 'active';
}

function writeProjectionDirtyMarker(root: string, changeSet: IssueProjectionChangeSet): void {
  const path = resolveControlPath(root, PROJECTION_DIRTY_PATH);
  const temporary = `${path}.tmp`;
  const safeMarker = {
    version: TRANSACTION_VERSION,
    transactionId: changeSet.transactionId,
    committedAt: changeSet.committedAt,
    changes: changeSet.changes.map((change) => ({
      kind: change.kind,
      id: change.id,
      ...('revision' in change ? { revision: change.revision } : {}),
    })),
  };
  rmSync(temporary, { force: true });
  writeExclusiveFlushed(temporary, Buffer.from(`${JSON.stringify(safeMarker)}\n`, 'utf8'));
  rmSync(path, { force: true });
  renameSync(temporary, path);
  flushDirectory(dirname(path));
}

function clearProjectionDirtyMarker(root: string, transactionId: string): void {
  const path = resolveControlPath(root, PROJECTION_DIRTY_PATH);
  if (!existsSync(path)) return;
  try {
    const marker = JSON.parse(readRegularFile(path).toString('utf8')) as unknown;
    if (!isRecord(marker) || marker.transactionId !== transactionId) return;
    unlinkSync(path);
    flushDirectory(dirname(path));
  } catch {
    // A malformed marker is retained for validation and manual recovery.
  }
}

function cleanupUnpreparedTransaction(root: string, transactionRoot: string): void {
  rmSync(transactionRoot, { recursive: true, force: true });
  if (existsSync(dirname(transactionRoot))) flushDirectory(dirname(transactionRoot));
  removeEmptyDirectory(resolve(root, TRANSACTIONS_PATH));
}

function validateActionShape(plan: IssueTransactionActionPlan, source: string | undefined, destination: string): void {
  if (!isNonEmptyString(plan.issueId)) throw new IssueError('schema', 'issue transaction action ID is required');
  if (plan.kind === 'create' && source !== undefined) {
    throw new IssueError('schema', 'issue create action cannot have a source');
  }
  if (plan.kind === 'rewrite' && (!source || source !== destination)) {
    throw new IssueError('schema', 'issue rewrite action source and destination must match');
  }
  if (plan.kind === 'move' && (!source || source === destination)) {
    throw new IssueError('schema', 'issue move action requires distinct source and destination paths');
  }
  if (plan.expectedBeforeDigest !== undefined && !SHA256_PATTERN.test(plan.expectedBeforeDigest)) {
    throw new IssueError('schema', 'issue transaction expected digest is malformed');
  }
}

function assertNonOverlappingPlans(plans: readonly IssueTransactionActionPlan[]): void {
  const claimedPaths = new Set<string>();
  for (const plan of plans) {
    for (const path of new Set([plan.source, plan.destination])) {
      if (!path) continue;
      const key = portableKey(path);
      if (claimedPaths.has(key)) {
        throw new IssueError('schema', 'issue transaction actions contain overlapping canonical paths', {
          paths: [path],
        });
      }
      claimedPaths.add(key);
    }
  }
}

function assertBeforeState(plan: IssueTransactionActionPlan, source: FileState, destination: FileState): void {
  if (plan.kind === 'create') {
    if (destination.presence) throw new IssueError('stale_revision', 'issue create destination already exists');
    return;
  }
  if (!source.presence) throw new IssueError('stale_revision', 'issue transaction source is missing');
  if (plan.expectedBeforeDigest && source.digest !== plan.expectedBeforeDigest) {
    throw new IssueError('stale_revision', 'issue transaction source revision is stale');
  }
  if (plan.kind === 'move' && destination.presence) {
    throw new IssueError('stale_revision', 'issue move destination already exists');
  }
}

function validateCanonicalPath(root: string, value: string): string {
  if (
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new IssueError('path_safety', 'issue transaction canonical path is unsafe');
  }
  const parts = value.split('/');
  const valid =
    (parts.length === 2 && parts[0] === '.issues') ||
    (parts.length === 3 && parts[0] === '.issues' && parts[1] === 'archived');
  if (!valid || !parts.at(-1)?.endsWith('.yml')) {
    throw new IssueError('path_safety', 'issue transaction path must name an active or archived canonical file');
  }
  assertContained(root, resolve(root, value));
  assertSafeAncestors(root, value);
  return value;
}

function validateIntermediatePath(root: string, value: string): string {
  if (!/^\.issues\/(?:archived\/)?\.[A-Za-z0-9._-]+\.tmp$/u.test(value)) {
    throw new IssueError('transaction_recovery', 'issue transaction intermediate path is unsafe');
  }
  assertContained(root, resolve(root, value));
  return value;
}

function validateStagedPath(transactionRoot: string, value: string): string {
  if (!/^staged\/\d{6}\.bin$/u.test(value)) {
    throw new IssueError('transaction_recovery', 'issue transaction staged path is unsafe');
  }
  assertContained(join(transactionRoot, 'staged'), resolve(transactionRoot, value));
  return value;
}

function inspectFile(root: string, path: string, intermediate = false): FileState {
  const absolutePath = resolve(root, path);
  assertContained(root, absolutePath);
  if (!existsSync(absolutePath)) return absentState();
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new IssueError(
      intermediate ? 'transaction_recovery' : 'path_safety',
      'managed issue path is not a regular file',
      {
        paths: [path],
      },
    );
  }
  return presentState(digest(readFileSync(absolutePath)));
}

function assertMatches(root: string, path: string, expected: FileState): void {
  if (!statesEqual(inspectFile(root, path), expected)) {
    throw new IssueError('transaction_recovery', 'managed issue file changed during transaction', { paths: [path] });
  }
}

function statesEqual(left: FileState, right: FileState): boolean {
  return left.presence === right.presence && (!left.presence || left.digest === right.digest);
}

function absentState(): FileState {
  return { presence: false };
}

function presentState(value: string): FileState {
  return { presence: true, digest: value };
}

function parseFileState(value: unknown): FileState {
  if (!isRecord(value) || typeof value.presence !== 'boolean') {
    throw new IssueError('transaction_recovery', 'prepared issue transaction file state is malformed');
  }
  if (!value.presence && value.digest === undefined) return absentState();
  if (value.presence && typeof value.digest === 'string' && SHA256_PATTERN.test(value.digest)) {
    return presentState(value.digest);
  }
  throw new IssueError('transaction_recovery', 'prepared issue transaction file digest is malformed');
}

function ensureControlDirectories(root: string): void {
  ensureSafeDirectory(resolve(root, '.issues'));
  ensureSafeDirectory(resolve(root, CONTROL_PATH));
  ensureSafeDirectory(resolve(root, TRANSACTIONS_PATH));
}

function ensureCanonicalParent(root: string, path: string): void {
  const parent = dirname(resolve(root, path));
  if (!existsSync(parent)) ensureSafeDirectory(parent);
  else assertSafeDirectory(parent, 'canonical issue parent');
}

function ensureSafeDirectory(path: string): void {
  if (existsSync(path)) {
    assertSafeDirectory(path, 'managed issue directory');
    return;
  }
  mkdirSync(path, { mode: 0o700 });
  flushDirectory(dirname(path));
}

function mkdirDurable(path: string): void {
  mkdirSync(path, { mode: 0o700 });
  flushDirectory(dirname(path));
}

function assertSafeDirectory(path: string, description: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new IssueError('path_safety', `${description} must be a non-symlink directory`);
  }
}

function assertSafeAncestors(root: string, path: string): void {
  let current = root;
  for (const component of path.split('/').slice(0, -1)) {
    current = join(current, component);
    if (existsSync(current)) assertSafeDirectory(current, 'managed issue ancestor');
  }
}

function writeExclusiveFlushed(path: string, bytes: Uint8Array): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error: unknown) {
    rmSync(path, { force: true });
    throw filesystemError(error, 'cannot durably write issue transaction state');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readRegularFile(path: string): Buffer {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new IssueError('transaction_recovery', 'issue transaction artifact must be a regular non-symlink file');
  }
  return readFileSync(path);
}

function flushDirectory(path: string): void {
  if (process.platform === 'win32' || !existsSync(path)) return;
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function flushActionDirectories(root: string, action: IssueTransactionManifestAction): void {
  const paths = [dirname(resolve(root, action.destination))];
  if (action.source) paths.push(dirname(resolve(root, action.source)));
  for (const path of new Set(paths)) flushDirectory(path);
}

function hasPortableAlias(root: string, path: string): boolean {
  const parent = dirname(resolve(root, path));
  if (!existsSync(parent)) return false;
  const expected = basename(path);
  const key = portableKey(expected);
  return readdirSync(parent).some((name) => name !== expected && portableKey(name) === key);
}

function portableKey(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function temporaryCanonicalPath(path: string, transactionId: string, index: number): string {
  const directory = dirname(path);
  return `${directory}/.${transactionId}-${String(index).padStart(6, '0')}.tmp`;
}

function removeEmptyDirectory(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(path).length > 0) return;
  rmSync(path, { recursive: true });
  flushDirectory(dirname(path));
}

function validateRepositoryRoot(repositoryRoot: string): string {
  if (!repositoryRoot || repositoryRoot.includes('\0')) {
    throw new IssueError('configuration', 'repository root is invalid');
  }
  const root = resolve(repositoryRoot);
  if (!existsSync(root)) throw new IssueError('path_safety', 'repository root does not exist');
  assertSafeDirectory(root, 'repository root');
  return root;
}

function resolveControlPath(root: string, path: string): string {
  const resolved = resolve(root, path);
  assertContained(root, resolved);
  return resolved;
}

function assertContained(root: string, path: string): void {
  const difference = relative(root, path);
  if (!difference || difference === '..' || difference.startsWith(`..${sep}`)) {
    throw new IssueError('path_safety', 'issue transaction path escapes its allowed root');
  }
}

function resolveOptions(options: IssueTransactionOptions): ResolvedOptions {
  return {
    issuePrefix: validateIssuePrefix(options.issuePrefix ?? ''),
    lockWaitMs: boundedInteger(options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS, 0, 60_000, 'lock wait'),
    staleLockGraceMs: boundedInteger(options.staleLockGraceMs ?? DEFAULT_STALE_GRACE_MS, 0, 60_000, 'lock grace'),
    maxTransactionBytes: boundedInteger(
      options.maxTransactionBytes ?? DEFAULT_TRANSACTION_BYTES,
      1,
      DEFAULT_TRANSACTION_BYTES,
      'transaction byte limit',
    ),
    now: options.now ?? (() => new Date()),
    transactionId:
      options.transactionId ??
      (() => `${new Date().toISOString().replaceAll(/[-:.TZ]/gu, '')}-${randomBytes(12).toString('hex')}`),
    fault: options.fault,
    projectionSink: options.projectionSink,
  };
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new IssueError('configuration', `issue ${name} is invalid`);
  }
  return value;
}

function validateTransactionId(value: string): string {
  if (!TRANSACTION_ID_PATTERN.test(value)) {
    throw new IssueError('transaction_recovery', 'issue transaction identity is unsafe');
  }
  return value;
}

function validateOperation(value: string): void {
  if (!isNonEmptyString(value) || value.length > 128 || Array.from(value).some((character) => character < ' ')) {
    throw new IssueError('schema', 'issue transaction operation is invalid');
  }
}

function canonicalTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new IssueError('configuration', 'issue transaction clock is invalid');
  return value.toISOString();
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function comparePlans(left: IssueTransactionActionPlan, right: IssueTransactionActionPlan): number {
  return compareCodePoints(left.issueId, right.issueId) || compareCodePoints(left.destination, right.destination);
}

function compareManifestActions(left: IssueTransactionManifestAction, right: IssueTransactionManifestAction): number {
  return compareCodePoints(left.issueId, right.issueId) || compareCodePoints(left.destination, right.destination);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function conflictPaths(action: IssueTransactionManifestAction): string[] {
  return [...new Set([action.source, action.destination].filter((path): path is string => path !== undefined))].sort(
    compareCodePoints,
  );
}

function recoveryError(transactionId: string, message: string, paths?: readonly string[]): IssueError {
  return new IssueError('transaction_recovery', message, {
    ...(transactionId ? { transactionId } : {}),
    ...(paths ? { paths } : {}),
  });
}

function asTransactionError(error: unknown, transactionId: string): IssueError {
  if (error instanceof IssueError) {
    if (error.transactionId || error.category !== 'transaction_recovery') return error;
    return new IssueError(error.category, error.message, {
      transactionId,
      issueIds: error.issueIds,
      paths: error.paths,
      limit: error.limit,
      retryable: error.retryable,
    });
  }
  return new IssueError('filesystem_durability', 'issue transaction filesystem operation failed', {
    transactionId,
  });
}

function filesystemError(error: unknown, message: string): IssueError {
  return new IssueError('filesystem_durability', message, {
    retryable: isErrorCode(error, 'EBUSY') || isErrorCode(error, 'EPERM'),
  });
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return !isErrorCode(error, 'ESRCH');
  }
}

function readProcessStart(pid: number): string | undefined {
  if (process.platform !== 'linux') return undefined;
  try {
    const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').trim().split(' ');
    return fields[21];
  } catch {
    return undefined;
  }
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function fault(options: ResolvedOptions, event: IssueTransactionFaultEvent): void {
  options.fault?.(event);
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function requireString(value: unknown, name: string): string {
  if (!isNonEmptyString(value)) throw new IssueError('transaction_recovery', `prepared issue ${name} is malformed`);
  return value;
}

function isActionKind(value: unknown): value is IssueTransactionActionKind {
  return value === 'create' || value === 'rewrite' || value === 'move';
}

function isErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
