import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
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
import { dirname, join, relative, resolve, sep } from 'node:path';
import { comparePrefixedIdentities, prefixedIdentityPattern } from './identities.js';
import {
  IssueError,
  canonicalIssueFilename,
  computeIssueRevision,
  decodeIssueDocument,
  type DecodedIssueDocument,
  type IssueLocation,
} from './issues-contract.js';
import {
  LocalPersistenceError,
  assertLocalBarrierLease,
  withLocalBarrier,
  type BarrierLease,
} from './local-persistence.js';

export const DEFAULT_ISSUE_ROOT = '.harnessctl/issues';
export const MAX_ISSUE_FILES = 9_999;
const ARCHIVE_DIRECTORY = 'archived';
const DEFAULT_LOCK_WAIT_MS = 5_000;
const MAX_BATCH_PATHS = 10_000;
const MAX_BEFORE_IMAGE_BYTES = 256 * 1024 * 1024;
const MAX_ISSUE_FILE_BYTES = 16 * 1024 * 1024;

export type IssueStorageStatus = 'empty' | 'canonical' | 'legacy' | 'mixed' | 'invalid';

export interface IssueStorageFinding {
  category:
    | 'storage_classification'
    | 'path_safety'
    | 'parse_safety'
    | 'schema'
    | 'canonical_form'
    | 'resource_limit'
    | 'identity_ambiguity';
  message: string;
  path?: string;
  issueId?: string;
}

export interface IssueStorageCandidate {
  id: string;
  location: IssueLocation;
  path: string;
  absolutePath: string;
  decoded?: DecodedIssueDocument;
  error?: IssueError;
}

export interface IssueStorageCatalog {
  repositoryRoot: string;
  issueRoot: string;
  status: IssueStorageStatus;
  candidates: readonly IssueStorageCandidate[];
  active: readonly IssueStorageCandidate[];
  archived: readonly IssueStorageCandidate[];
  findings: readonly IssueStorageFinding[];
  byId: ReadonlyMap<string, readonly IssueStorageCandidate[]>;
  reservedIds: ReadonlySet<string>;
}

export interface DiscoverIssueStorageOptions {
  issuePrefix?: string;
  issueRoot?: string;
  candidateLimit?: number;
}

export type { BarrierLease };

export interface FileReplacement {
  path: string;
  bytes?: Uint8Array;
  expectedRevision?: string | null;
}

export function withIssueBarrier<T>(
  repositoryRoot: string,
  operation: (lease: BarrierLease) => T,
  waitMs = DEFAULT_LOCK_WAIT_MS,
): T {
  try {
    return withLocalBarrier(repositoryRoot, operation, waitMs);
  } catch (error: unknown) {
    throw asIssuePersistenceError(error);
  }
}

export function applyIssueFileBatch(lease: BarrierLease, replacements: readonly FileReplacement[]): void {
  assertLease(lease);
  if (replacements.length === 0 || replacements.length > MAX_BATCH_PATHS) {
    throw new IssueError('resource_limit', 'issue batch path limit exceeded', { limit: 'batchPaths' });
  }
  const ordered = [...replacements].sort((left, right) => compareCodePoints(left.path, right.path));
  const seen = new Set<string>();
  const before = new Map<string, Uint8Array | undefined>();
  let retainedBytes = 0;
  for (const replacement of ordered) {
    const key = portableKey(replacement.path);
    if (seen.has(key)) throw new IssueError('path_safety', 'issue batch contains duplicate paths');
    seen.add(key);
    const absolute = validateManagedIssuePath(lease.repositoryRoot, replacement.path);
    const bytes = readOptionalRegularFile(lease.repositoryRoot, absolute, replacement.path);
    if (replacement.expectedRevision === null && bytes !== undefined) {
      throw new IssueError('stale_revision', 'issue destination already exists', { paths: [replacement.path] });
    }
    if (
      typeof replacement.expectedRevision === 'string' &&
      (bytes === undefined || computeIssueRevision(bytes) !== replacement.expectedRevision)
    ) {
      throw new IssueError('stale_revision', 'issue changed since the expected revision was calculated', {
        paths: [replacement.path],
      });
    }
    retainedBytes += bytes?.byteLength ?? 0;
    if (retainedBytes > MAX_BEFORE_IMAGE_BYTES) {
      throw new IssueError('resource_limit', 'issue batch before-image limit exceeded', { limit: 'beforeImageBytes' });
    }
    before.set(replacement.path, bytes);
  }

  const applied: FileReplacement[] = [];
  try {
    for (const replacement of ordered) {
      applied.push(replacement);
      publishReplacement(lease.repositoryRoot, replacement.path, replacement.bytes);
    }
  } catch (error: unknown) {
    let rollbackFailure: unknown;
    for (const replacement of applied.reverse()) {
      try {
        publishReplacement(lease.repositoryRoot, replacement.path, before.get(replacement.path));
      } catch (rollbackError: unknown) {
        rollbackFailure ??= rollbackError;
      }
    }
    if (rollbackFailure) {
      throw new IssueError(
        'filesystem_durability',
        'issue batch failed and rollback failed; canonical state may be inconsistent',
      );
    }
    if (error instanceof IssueError) throw error;
    throw new IssueError('filesystem_durability', 'issue batch failed; before-images were restored');
  }
}

export function discoverIssueStorage(
  repositoryRoot: string,
  options: DiscoverIssueStorageOptions = {},
): IssueStorageCatalog {
  const root = validateRepositoryRoot(repositoryRoot);
  const issueRoot = validateIssueRoot(options.issueRoot ?? DEFAULT_ISSUE_ROOT);
  const prefix = validateIssuePrefix(options.issuePrefix ?? '');
  const limit = validateCandidateLimit(options.candidateLimit ?? MAX_ISSUE_FILES);
  const findings: IssueStorageFinding[] = [];
  const candidates: IssueStorageCandidate[] = [];
  const absoluteRoot = resolve(root, issueRoot);
  const unsafe = unsafeAncestor(root, issueRoot);
  if (unsafe)
    return makeCatalog(root, issueRoot, prefix, 'invalid', candidates, [
      pathFinding(unsafe, 'managed issue root must use non-symlink directories'),
    ]);
  if (!existsSync(absoluteRoot)) return makeCatalog(root, issueRoot, prefix, 'empty', candidates, findings);
  if (!isSafeDirectory(absoluteRoot)) {
    return makeCatalog(root, issueRoot, prefix, 'invalid', candidates, [
      pathFinding(issueRoot, 'managed issue root must be a non-symlink directory'),
    ]);
  }

  let legacy = scan(root, absoluteRoot, 'active', prefix, limit, candidates, findings);
  const archiveRoot = join(absoluteRoot, ARCHIVE_DIRECTORY);
  if (existsSync(archiveRoot)) {
    if (!isSafeDirectory(archiveRoot))
      findings.push(pathFinding(`${issueRoot}/archived`, 'managed archive root must be a non-symlink directory'));
    else legacy ||= scan(root, archiveRoot, 'archived', prefix, limit, candidates, findings);
  }
  addIdentityFindings(candidates, findings);
  const canonical = candidates.length > 0;
  const status: IssueStorageStatus = legacy
    ? canonical
      ? 'mixed'
      : 'legacy'
    : findings.length > 0
      ? 'invalid'
      : canonical
        ? 'canonical'
        : 'empty';
  if (legacy) findings.push({ category: 'storage_classification', message: 'legacy issue storage is unsupported' });
  return makeCatalog(root, issueRoot, prefix, status, candidates, findings);
}

export function resolveIssueCandidate(
  storage: IssueStorageCatalog,
  id: string,
  location?: IssueLocation,
): IssueStorageCandidate {
  const matches = (storage.byId.get(id) ?? []).filter(
    (candidate) => location === undefined || candidate.location === location,
  );
  if (matches.length === 0) throw new IssueError('schema', `canonical issue was not found: ${id}`, { issueIds: [id] });
  if (matches.length !== 1)
    throw new IssueError('identity_ambiguity', `canonical issue ID is ambiguous: ${id}`, {
      issueIds: [id],
      paths: matches.map((item) => item.path),
    });
  if (storage.status !== 'canonical') throw classificationError(storage);
  const candidate = matches[0];
  if (!candidate) throw new IssueError('identity_ambiguity', `canonical issue ID is ambiguous: ${id}`);
  if (candidate.error) throw candidate.error;
  return candidate;
}

export function validateIssueRoot(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new IssueError('configuration', 'configured issue root must be a safe project-relative path');
  }
  return value;
}

function scan(
  repositoryRoot: string,
  directory: string,
  location: IssueLocation,
  prefix: string,
  limit: number,
  candidates: IssueStorageCandidate[],
  findings: IssueStorageFinding[],
): boolean {
  let legacy = false;
  for (const name of readdirSync(directory).sort(compareCodePoints)) {
    if (location === 'active' && (name === ARCHIVE_DIRECTORY || name === '.control')) continue;
    const absolutePath = join(directory, name);
    const path = portableRelative(repositoryRoot, absolutePath);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      findings.push(pathFinding(path, 'symlinks are not permitted in canonical issue storage'));
      continue;
    }
    if (stat.isDirectory()) {
      if (existsSync(join(absolutePath, 'issue.md')) || existsSync(join(absolutePath, 'comments'))) legacy = true;
      else findings.push(pathFinding(path, 'unexpected nested directory in canonical issue storage'));
      continue;
    }
    if (!stat.isFile()) {
      findings.push(pathFinding(path, 'canonical issue candidates must be regular files'));
      continue;
    }
    const id = parseCandidateName(name, prefix);
    if (!id) {
      if (/\.(?:ya?ml|tmp)$/iu.test(name))
        findings.push(pathFinding(path, 'unsupported or malformed canonical issue filename'));
      continue;
    }
    if (candidates.length >= limit)
      throw new IssueError('resource_limit', 'issue discovery candidate limit exceeded', {
        limit: 'candidates',
        paths: [path],
      });
    const candidate: IssueStorageCandidate = { id, location, path, absolutePath };
    try {
      const decoded = decodeIssueDocument(readBoundedIssueFile(absolutePath, path), {
        expectedId: id,
        issuePrefix: prefix,
      });
      if (canonicalIssueFilename(id, decoded.issue.title) !== name)
        throw new IssueError('schema', 'canonical issue filename slug does not match its title');
      candidate.decoded = decoded;
    } catch (error: unknown) {
      candidate.error = asIssueError(error, path, id);
      findings.push({
        category: findingCategory(candidate.error.category),
        message: candidate.error.message,
        path,
        issueId: id,
      });
    }
    candidates.push(candidate);
  }
  return legacy;
}

function addIdentityFindings(candidates: readonly IssueStorageCandidate[], findings: IssueStorageFinding[]): void {
  const byId = new Map<string, IssueStorageCandidate[]>();
  const byPath = new Map<string, IssueStorageCandidate[]>();
  for (const candidate of candidates) {
    append(byId, candidate.id, candidate);
    append(byPath, portableKey(candidate.path), candidate);
  }
  for (const [id, matches] of byId)
    if (matches.length > 1)
      for (const candidate of matches)
        findings.push({
          category: 'identity_ambiguity',
          message: `duplicate canonical issue ID: ${id}`,
          path: candidate.path,
          issueId: id,
        });
  for (const matches of byPath.values())
    if (matches.length > 1)
      for (const candidate of matches)
        findings.push({
          category: 'identity_ambiguity',
          message: 'canonical issue paths collide under portable comparison',
          path: candidate.path,
          issueId: candidate.id,
        });
}

function makeCatalog(
  repositoryRoot: string,
  issueRoot: string,
  prefix: string,
  status: IssueStorageStatus,
  candidates: IssueStorageCandidate[],
  findings: IssueStorageFinding[],
): IssueStorageCatalog {
  const ordered = [...candidates].sort(
    (left, right) =>
      comparePrefixedIdentities(left.id, right.id, prefix) ||
      compareCodePoints(left.location, right.location) ||
      compareCodePoints(left.path, right.path),
  );
  const byId = new Map<string, IssueStorageCandidate[]>();
  for (const candidate of ordered) append(byId, candidate.id, candidate);
  return {
    repositoryRoot,
    issueRoot,
    status,
    candidates: ordered,
    active: ordered.filter((candidate) => candidate.location === 'active'),
    archived: ordered.filter((candidate) => candidate.location === 'archived'),
    findings,
    byId,
    reservedIds: new Set(ordered.map((candidate) => candidate.id)),
  };
}

function publishReplacement(root: string, path: string, bytes: Uint8Array | undefined): void {
  const absolute = validateManagedIssuePath(root, path);
  ensureSafeDirectoryTree(root, portableRelative(root, dirname(absolute)));
  if (bytes === undefined) {
    if (!existsSync(absolute)) return;
    assertRegularFile(absolute);
    unlinkSync(absolute);
    fsyncDirectory(dirname(absolute));
    return;
  }
  if (existsSync(absolute)) assertRegularFile(absolute);
  const temporary = join(dirname(absolute), `.${randomBytes(12).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (existsSync(absolute)) assertRegularFile(absolute);
    renameSync(temporary, absolute);
    fsyncDirectory(dirname(absolute));
  } catch (error: unknown) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
    if (error instanceof IssueError) throw error;
    throw new IssueError('filesystem_durability', `cannot publish canonical issue path: ${path}`, { paths: [path] });
  }
}

function validateManagedIssuePath(root: string, value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new IssueError('path_safety', 'managed issue path is unsafe');
  }
  const absolute = resolve(root, value);
  assertContained(root, absolute);
  const parts = value.split('/');
  if (!parts.at(-1)?.endsWith('.yml')) throw new IssueError('path_safety', 'managed issue path must name a YAML file');
  let current = root;
  for (const component of parts.slice(0, -1)) {
    current = join(current, component);
    if (existsSync(current) && !isSafeDirectory(current))
      throw new IssueError('path_safety', 'managed issue ancestor must be a non-symlink directory', {
        paths: [portableRelative(root, current)],
      });
  }
  return absolute;
}

function readOptionalRegularFile(root: string, absolute: string, path: string): Uint8Array | undefined {
  assertContained(root, absolute);
  if (!existsSync(absolute)) return undefined;
  try {
    return readBoundedIssueFile(absolute, path);
  } catch (error: unknown) {
    if (error instanceof IssueError) throw error;
    throw new IssueError('filesystem_durability', 'cannot read issue before-image', { paths: [path] });
  }
}

function readBoundedIssueFile(absolute: string, path: string): Uint8Array {
  assertRegularFile(absolute);
  const size = lstatSync(absolute).size;
  if (size > MAX_ISSUE_FILE_BYTES)
    throw new IssueError('resource_limit', 'issue file exceeds 16 MiB', { limit: 'fileBytes', paths: [path] });
  try {
    return readFileSync(absolute);
  } catch {
    throw new IssueError('filesystem_durability', 'cannot read issue file', { paths: [path] });
  }
}

function validateRepositoryRoot(value: string): string {
  if (!value || value.includes('\0')) throw new IssueError('configuration', 'repository root is invalid');
  const root = resolve(value);
  if (!existsSync(root) || !isSafeDirectory(root))
    throw new IssueError('path_safety', 'repository root must be an existing non-symlink directory');
  return root;
}

function ensureSafeDirectoryTree(root: string, path: string): void {
  let current = root;
  for (const component of path.split('/')) {
    current = join(current, component);
    if (existsSync(current)) {
      if (!isSafeDirectory(current)) throw new IssueError('path_safety', 'managed directory ancestor is unsafe');
      continue;
    }
    mkdirSync(current, { mode: 0o700 });
    fsyncDirectory(dirname(current));
  }
}

function unsafeAncestor(root: string, path: string): string | undefined {
  let current = root;
  for (const component of path.split('/')) {
    current = join(current, component);
    if (!existsSync(current)) return undefined;
    if (!isSafeDirectory(current)) return portableRelative(root, current);
  }
  return undefined;
}

function classificationError(storage: IssueStorageCatalog): IssueError {
  return new IssueError('storage_classification', `issue storage is ${storage.status}`, {
    paths: storage.findings.flatMap((finding) => (finding.path ? [finding.path] : [])),
  });
}

function assertLease(lease: BarrierLease): void {
  try {
    assertLocalBarrierLease(lease);
  } catch (error: unknown) {
    throw asIssuePersistenceError(error);
  }
}

function assertRegularFile(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new IssueError('path_safety', 'managed issue path must be a regular non-symlink file');
}

function isSafeDirectory(path: string): boolean {
  const stat = lstatSync(path);
  return !stat.isSymbolicLink() && stat.isDirectory();
}

function validateIssuePrefix(prefix: string): string {
  if (
    Array.from(prefix).some((character) => (character.codePointAt(0) ?? 0) <= 0x1f) ||
    /[/\\<>:"|?*]/u.test(prefix) ||
    prefix === '.' ||
    prefix === '..'
  )
    throw new IssueError('configuration', 'configured issue prefix is unsafe');
  return prefix;
}

function validateCandidateLimit(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_ISSUE_FILES)
    throw new IssueError('configuration', 'issue discovery candidate limit is invalid', { limit: 'candidates' });
  return value;
}

function parseCandidateName(name: string, prefix: string): string | undefined {
  const identity = prefixedIdentityPattern(prefix).source.slice(1, -1);
  return new RegExp(`^(${identity})-[a-z0-9]+(?:-[a-z0-9]+)*\\.yml$`, 'u').exec(name)?.[1];
}

function asIssueError(error: unknown, path: string, id: string): IssueError {
  if (error instanceof IssueError)
    return new IssueError(error.category, error.message, {
      issueIds: error.issueIds ?? [id],
      paths: error.paths ?? [path],
      limit: error.limit,
      retryable: error.retryable,
    });
  return new IssueError('parse_safety', 'canonical issue could not be read', { issueIds: [id], paths: [path] });
}

function findingCategory(category: IssueError['category']): IssueStorageFinding['category'] {
  return [
    'storage_classification',
    'path_safety',
    'parse_safety',
    'schema',
    'canonical_form',
    'resource_limit',
    'identity_ambiguity',
  ].includes(category)
    ? (category as IssueStorageFinding['category'])
    : 'schema';
}

function pathFinding(path: string, message: string): IssueStorageFinding {
  return { category: 'path_safety', message, path };
}

function assertContained(root: string, path: string): void {
  const difference = relative(root, path);
  if (!difference || difference === '..' || difference.startsWith(`..${sep}`))
    throw new IssueError('path_safety', 'managed issue path escapes the repository root');
}

function fsyncDirectory(path: string): void {
  if (process.platform === 'win32' || !existsSync(path)) return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error: unknown) {
    if (!isUnsupportedDirectorySync(error)) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function isUnsupportedDirectorySync(error: unknown): boolean {
  return ['EINVAL', 'ENOTSUP', 'EISDIR', 'EBADF'].some((code) => isErrorCode(error, code));
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function asIssuePersistenceError(error: unknown): unknown {
  if (!(error instanceof LocalPersistenceError)) return error;
  const category =
    error.category === 'synchronization'
      ? 'filesystem_durability'
      : error.category === 'path_safety'
        ? 'path_safety'
        : error.category === 'resource_limit'
          ? 'resource_limit'
          : error.category === 'lock_contention'
            ? 'lock_contention'
            : 'configuration';
  return new IssueError(category, error.message, { retryable: error.retryable });
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function portableKey(value: string): string {
  return value.normalize('NFKC').toLowerCase();
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
