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
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  IssueError,
  canonicalIssueFilename,
  decodeIssueDocument,
  encodeCanonicalIssue,
  type CanonicalIssueDocument,
  type CanonicalIssueComment,
  type DecodedIssueDocument,
  type IssueLocation,
  type IssueMetadata,
} from './issues-contract.js';

export type IssueStorageStatus = 'empty' | 'canonical' | 'legacy' | 'mixed' | 'invalid';

export interface IssueStorageFinding {
  category:
    'storage_classification' | 'path_safety' | 'parse_safety' | 'schema' | 'canonical_form' | 'identity_ambiguity';
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
  candidateLimit?: number;
}

export interface IssueProjectionRecord {
  id: string;
  location: IssueLocation;
  path: string;
  version: 1;
  type: CanonicalIssueDocument['type'];
  title: string;
  status: CanonicalIssueDocument['status'];
  created_at: string;
  updated_at: string;
  created_by?: string;
  assigned_to?: string;
  parent?: string;
  children: readonly string[];
  depends_on: readonly string[];
  blocks: readonly string[];
  blocked_by: readonly string[];
  relates_to: readonly string[];
  duplicates: readonly string[];
  supersedes: readonly string[];
  documents: readonly string[];
  metadata: IssueMetadata;
  body: string;
  comments: readonly CanonicalIssueComment[];
  revision: string;
}

export type IssueProjectionChange =
  | { kind: 'upsert'; id: string; record: IssueProjectionRecord; revision: string }
  | { kind: 'removal'; id: string }
  | {
      kind: 'location';
      id: string;
      from: IssueLocation;
      to: IssueLocation;
      record: IssueProjectionRecord;
      revision: string;
    };

export interface IssueProjectionChangeSet {
  version: 1;
  transactionId: string;
  committedAt: string;
  changes: readonly IssueProjectionChange[];
}

export interface IssueProjectionSink {
  apply(changeSet: IssueProjectionChangeSet): void;
}

export function projectIssueCandidate(candidate: IssueStorageCandidate): IssueProjectionRecord {
  if (candidate.error) throw candidate.error;
  const decoded = candidate.decoded;
  if (!decoded)
    throw new IssueError('schema', 'canonical issue candidate was not decoded', { paths: [candidate.path] });
  return projectIssueDocument(decoded.issue, candidate.location, candidate.path, decoded.revision);
}

export function projectIssueDocument(
  issue: CanonicalIssueDocument,
  location: IssueLocation,
  path: string,
  revision: string,
): IssueProjectionRecord {
  return {
    id: issue.id,
    location,
    path,
    version: issue.version,
    type: issue.type,
    title: issue.title,
    status: issue.status,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    ...(issue.created_by ? { created_by: issue.created_by } : {}),
    ...(issue.assigned_to ? { assigned_to: issue.assigned_to } : {}),
    ...(issue.parent ? { parent: issue.parent } : {}),
    children: [...(issue.children ?? [])],
    depends_on: [...(issue.depends_on ?? [])],
    blocks: [...(issue.blocks ?? [])],
    blocked_by: [...(issue.blocked_by ?? [])],
    relates_to: [...(issue.relates_to ?? [])],
    duplicates: [...(issue.duplicates ?? [])],
    supersedes: [...(issue.supersedes ?? [])],
    documents: [...(issue.documents ?? [])],
    metadata: { ...(issue.metadata ?? {}) },
    body: issue.body,
    comments: issue.comments.map((comment) => ({ ...comment })),
    revision,
  };
}

const DEFAULT_CANDIDATE_LIMIT = 100_000;
const CONTROL_DIRECTORY = '.control';
const ARCHIVE_DIRECTORY = 'archived';
const MIGRATION_MESSAGE = 'legacy issue storage requires the separately delivered Story 00006 migration';

export function discoverIssueStorage(
  repositoryRoot: string,
  options: DiscoverIssueStorageOptions = {},
): IssueStorageCatalog {
  const root = validateRepositoryRoot(repositoryRoot);
  const issuePrefix = validateIssuePrefix(options.issuePrefix ?? '');
  const candidateLimit = validateCandidateLimit(options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT);
  const issuesRoot = join(root, '.issues');
  const findings: IssueStorageFinding[] = [];
  const candidates: IssueStorageCandidate[] = [];
  let legacy = false;

  if (!existsSync(issuesRoot)) return catalog(root, 'empty', candidates, findings);
  if (!isRegularDirectory(issuesRoot)) {
    findings.push(pathFinding('.issues', 'managed issue root must be a non-symlink directory'));
    return catalog(root, 'invalid', candidates, findings);
  }
  const controlRoot = join(issuesRoot, CONTROL_DIRECTORY);
  if (existsSync(controlRoot) && !isRegularDirectory(controlRoot)) {
    findings.push(pathFinding('.issues/.control', 'managed control root must be a non-symlink directory'));
  }

  const activeScan = scanDirectory(root, issuesRoot, 'active', issuePrefix, candidateLimit, candidates, findings);
  legacy ||= activeScan.legacy;
  const archiveRoot = join(issuesRoot, ARCHIVE_DIRECTORY);
  if (existsSync(archiveRoot)) {
    if (!isRegularDirectory(archiveRoot)) {
      findings.push(pathFinding('.issues/archived', 'managed archive root must be a non-symlink directory'));
    } else {
      const archiveScan = scanDirectory(
        root,
        archiveRoot,
        'archived',
        issuePrefix,
        candidateLimit,
        candidates,
        findings,
      );
      legacy ||= archiveScan.legacy;
    }
  }

  addIdentityFindings(candidates, findings);
  const canonical = candidates.length > 0;
  let status: IssueStorageStatus;
  if (legacy && canonical) status = 'mixed';
  else if (legacy) status = 'legacy';
  else if (findings.length > 0) status = 'invalid';
  else if (canonical) status = 'canonical';
  else status = 'empty';

  if (status === 'legacy' || status === 'mixed') {
    findings.push({ category: 'storage_classification', message: MIGRATION_MESSAGE });
  }
  return catalog(root, status, candidates, findings);
}

export const classifyIssueStorage = discoverIssueStorage;

export function resolveIssueCandidate(
  storage: IssueStorageCatalog,
  id: string,
  location?: IssueLocation,
): IssueStorageCandidate {
  if (storage.status === 'legacy' || storage.status === 'mixed') throw storageClassificationError(storage);
  const matches = (storage.byId.get(id) ?? []).filter(
    (candidate) => location === undefined || candidate.location === location,
  );
  if (matches.length === 0) {
    throw new IssueError('schema', `canonical issue was not found: ${id}`, { issueIds: [id] });
  }
  if (matches.length !== 1) {
    throw new IssueError('identity_ambiguity', `canonical issue ID is ambiguous: ${id}`, {
      issueIds: [id],
      paths: matches.map((candidate) => candidate.path),
    });
  }
  if (storage.status === 'invalid') throw storageClassificationError(storage);
  const candidate = matches[0];
  if (!candidate) throw new IssueError('identity_ambiguity', `canonical issue ID is ambiguous: ${id}`);
  if (candidate.error) throw candidate.error;
  return candidate;
}

export const resolveIssueById = resolveIssueCandidate;

export function createCanonicalIssueFile(
  repositoryRoot: string,
  issue: CanonicalIssueDocument,
  location: IssueLocation = 'active',
  options: DiscoverIssueStorageOptions = {},
): IssueStorageCandidate {
  const storage = discoverIssueStorage(repositoryRoot, options);
  assertMutableStorage(storage);
  if (storage.byId.has(issue.id)) {
    throw new IssueError('identity_ambiguity', `canonical issue ID already exists: ${issue.id}`, {
      issueIds: [issue.id],
      paths: storage.byId.get(issue.id)?.map((candidate) => candidate.path),
    });
  }
  const bytes = encodeCanonicalIssue(issue);
  const directory = ensureLocationDirectory(storage.repositoryRoot, location);
  const filename = canonicalIssueFilename(issue.id, issue.title);
  assertNoPortableNameCollision(directory, filename);
  const absolutePath = join(directory, filename);
  writeExclusiveDurable(absolutePath, bytes);
  return readCreatedCandidate(storage.repositoryRoot, absolutePath, issue.id, location, options.issuePrefix ?? '');
}

export const atomicCreateIssue = createCanonicalIssueFile;

export function rewriteCanonicalIssueFile(
  repositoryRoot: string,
  currentPath: string,
  issue: CanonicalIssueDocument,
  options: DiscoverIssueStorageOptions = {},
): IssueStorageCandidate {
  const storage = discoverIssueStorage(repositoryRoot, options);
  assertMutableStorage(storage);
  const source = candidateAtPath(storage, currentPath);
  if (source.id !== issue.id) throw new IssueError('schema', 'rewritten issue ID must remain unchanged');
  if (source.error) throw source.error;

  const bytes = encodeCanonicalIssue(issue);
  const destinationName = canonicalIssueFilename(issue.id, issue.title);
  const destination = join(dirname(source.absolutePath), destinationName);
  if (destination === source.absolutePath) {
    replaceDurable(source.absolutePath, bytes);
  } else {
    assertNoPortableNameCollision(dirname(destination), destinationName, source.absolutePath);
    rewriteThenRename(source.absolutePath, destination, bytes);
  }
  return readCreatedCandidate(
    storage.repositoryRoot,
    destination,
    issue.id,
    source.location,
    options.issuePrefix ?? '',
  );
}

export const atomicRewriteIssue = rewriteCanonicalIssueFile;
export const atomicRenameIssue = rewriteCanonicalIssueFile;

function scanDirectory(
  repositoryRoot: string,
  directory: string,
  location: IssueLocation,
  prefix: string,
  limit: number,
  candidates: IssueStorageCandidate[],
  findings: IssueStorageFinding[],
): { legacy: boolean } {
  let legacy = false;
  const names = readdirSync(directory).sort(compareCodePoints);
  for (const name of names) {
    if (location === 'active' && (name === ARCHIVE_DIRECTORY || name === CONTROL_DIRECTORY)) continue;
    const absolutePath = join(directory, name);
    const relativePath = portableRelative(repositoryRoot, absolutePath);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      findings.push(pathFinding(relativePath, 'symlinks are not permitted in canonical issue storage'));
      continue;
    }
    if (stat.isDirectory()) {
      if (isLegacyIssueDirectory(absolutePath)) legacy = true;
      else findings.push(pathFinding(relativePath, 'unexpected nested directory in canonical issue storage'));
      continue;
    }
    if (!stat.isFile()) {
      findings.push(pathFinding(relativePath, 'canonical issue candidates must be regular files'));
      continue;
    }
    const parsed = parseCandidateName(name, prefix);
    if (!parsed) {
      if (looksIssueLike(name)) {
        findings.push(pathFinding(relativePath, 'unsupported or malformed canonical issue filename'));
      }
      continue;
    }
    if (candidates.length >= limit) {
      throw new IssueError('resource_limit', 'issue discovery candidate limit exceeded', { limit: 'candidates' });
    }
    const candidate: IssueStorageCandidate = { id: parsed.id, location, path: relativePath, absolutePath };
    try {
      const decoded = decodeIssueDocument(readFileSync(absolutePath), { expectedId: parsed.id, issuePrefix: prefix });
      const expectedName = canonicalIssueFilename(decoded.issue.id, decoded.issue.title);
      if (expectedName !== name) {
        throw new IssueError('schema', 'canonical issue filename slug does not match its title', {
          issueIds: [parsed.id],
          paths: [relativePath],
        });
      }
      candidate.decoded = decoded;
    } catch (error: unknown) {
      candidate.error = asIssueError(error, relativePath, parsed.id);
      findings.push({
        category: findingCategory(candidate.error.category),
        message: candidate.error.message,
        path: relativePath,
        issueId: parsed.id,
      });
    }
    candidates.push(candidate);
  }
  return { legacy };
}

function addIdentityFindings(candidates: IssueStorageCandidate[], findings: IssueStorageFinding[]): void {
  const byId = new Map<string, IssueStorageCandidate[]>();
  const byPortablePath = new Map<string, IssueStorageCandidate[]>();
  for (const candidate of candidates) {
    appendMap(byId, candidate.id, candidate);
    appendMap(byPortablePath, candidate.path.normalize('NFKC').toLowerCase(), candidate);
  }
  for (const [id, matches] of byId) {
    if (matches.length < 2) continue;
    for (const candidate of matches) {
      findings.push({
        category: 'identity_ambiguity',
        message: `duplicate canonical issue ID: ${id}`,
        path: candidate.path,
        issueId: id,
      });
    }
  }
  for (const matches of byPortablePath.values()) {
    if (matches.length < 2) continue;
    for (const candidate of matches) {
      findings.push({
        category: 'identity_ambiguity',
        message: 'canonical issue paths collide under portable comparison',
        path: candidate.path,
        issueId: candidate.id,
      });
    }
  }
}

function catalog(
  repositoryRoot: string,
  status: IssueStorageStatus,
  candidates: IssueStorageCandidate[],
  findings: IssueStorageFinding[],
): IssueStorageCatalog {
  const ordered = [...candidates].sort((left, right) => compareCodePoints(left.path, right.path));
  const byId = new Map<string, IssueStorageCandidate[]>();
  for (const candidate of ordered) appendMap(byId, candidate.id, candidate);
  return {
    repositoryRoot,
    status,
    candidates: ordered,
    active: ordered.filter((candidate) => candidate.location === 'active'),
    archived: ordered.filter((candidate) => candidate.location === 'archived'),
    findings,
    byId,
    reservedIds: new Set(ordered.map((candidate) => candidate.id)),
  };
}

function candidateAtPath(storage: IssueStorageCatalog, path: string): IssueStorageCandidate {
  const relativePath = validateCanonicalRelativePath(path);
  const candidate = storage.candidates.find((item) => item.path === relativePath);
  if (!candidate) {
    throw new IssueError('path_safety', `canonical issue path is not a discovered regular file: ${relativePath}`, {
      paths: [relativePath],
    });
  }
  return candidate;
}

function validateCanonicalRelativePath(path: string): string {
  if (
    !path ||
    path.includes(String.fromCharCode(92)) ||
    path.includes(String.fromCharCode(0)) ||
    path.split('/').includes('..')
  ) {
    throw new IssueError('path_safety', 'canonical issue path is unsafe');
  }
  if (!path.startsWith('.issues/') || resolve('/', path) === resolve('/.issues')) {
    throw new IssueError('path_safety', 'canonical issue path must be repository-relative under .issues');
  }
  return path;
}

function validateRepositoryRoot(repositoryRoot: string): string {
  if (!repositoryRoot || repositoryRoot.includes('\0'))
    throw new IssueError('configuration', 'repository root is invalid');
  const root = resolve(repositoryRoot);
  if (!existsSync(root) || !isRegularDirectory(root)) {
    throw new IssueError('path_safety', 'repository root must be an existing non-symlink directory');
  }
  return root;
}

function validateIssuePrefix(prefix: string): string {
  const hasControl = Array.from(prefix).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (hasControl || /[/\\<>:"|?*]/u.test(prefix) || prefix === '.' || prefix === '..') {
    throw new IssueError('configuration', 'configured issue prefix is unsafe');
  }
  return prefix;
}

function validateCandidateLimit(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > DEFAULT_CANDIDATE_LIMIT) {
    throw new IssueError('configuration', 'issue discovery candidate limit is invalid', { limit: 'candidates' });
  }
  return value;
}

function parseCandidateName(name: string, prefix: string): { id: string } | undefined {
  const expression = new RegExp(`^(${escapeRegex(prefix)}\\d+)-[a-z0-9]+(?:-[a-z0-9]+)*\\.yml$`, 'u');
  const match = expression.exec(name);
  return match?.[1] ? { id: match[1] } : undefined;
}

function looksIssueLike(name: string): boolean {
  return /\.(?:ya?ml|tmp)$/iu.test(name) || /^.+-.*\.yml$/iu.test(name);
}

function isLegacyIssueDirectory(path: string): boolean {
  return existsSync(join(path, 'issue.md')) || existsSync(join(path, 'comments'));
}

function isRegularDirectory(path: string): boolean {
  const stat = lstatSync(path);
  return !stat.isSymbolicLink() && stat.isDirectory();
}

function assertMutableStorage(storage: IssueStorageCatalog): void {
  if (storage.status === 'empty' || storage.status === 'canonical') return;
  throw storageClassificationError(storage);
}

function storageClassificationError(storage: IssueStorageCatalog): IssueError {
  const migration = storage.status === 'legacy' || storage.status === 'mixed' ? `; ${MIGRATION_MESSAGE}` : '';
  return new IssueError('storage_classification', `issue storage is ${storage.status}${migration}`, {
    paths: storage.findings.flatMap((finding) => (finding.path ? [finding.path] : [])),
  });
}

function ensureLocationDirectory(repositoryRoot: string, location: IssueLocation): string {
  const issuesRoot = join(repositoryRoot, '.issues');
  ensureDirectory(issuesRoot);
  if (location === 'active') return issuesRoot;
  const archiveRoot = join(issuesRoot, ARCHIVE_DIRECTORY);
  ensureDirectory(archiveRoot);
  return archiveRoot;
}

function ensureDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { mode: 0o700 });
    fsyncDirectory(dirname(path));
    return;
  }
  if (!isRegularDirectory(path)) throw new IssueError('path_safety', 'managed path is not a safe directory');
}

function assertNoPortableNameCollision(directory: string, name: string, excludedPath?: string): void {
  const comparison = name.normalize('NFKC').toLowerCase();
  if (!existsSync(directory)) return;
  for (const existingName of readdirSync(directory)) {
    const existingPath = join(directory, existingName);
    if (excludedPath && existingPath === excludedPath) continue;
    if (existingName.normalize('NFKC').toLowerCase() === comparison) {
      throw new IssueError('identity_ambiguity', `canonical destination already exists: ${name}`, {
        paths: [portableRelative(dirname(dirname(directory)), existingPath)],
      });
    }
  }
}

function writeExclusiveDurable(path: string, bytes: Uint8Array): void {
  let descriptor: number;
  try {
    descriptor = openSync(path, 'wx', 0o600);
  } catch (error: unknown) {
    throw filesystemError(error, `cannot exclusively create canonical issue: ${path}`);
  }
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error: unknown) {
    rmSync(path, { force: true });
    throw filesystemError(error, `cannot durably write canonical issue: ${path}`);
  } finally {
    closeSync(descriptor);
  }
  fsyncDirectory(dirname(path));
}

function replaceDurable(path: string, bytes: Uint8Array): void {
  assertRegularFile(path);
  const temporary = temporaryPath(path);
  try {
    writeExclusiveDurable(temporary, bytes);
    assertRegularFile(path);
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
  } catch (error: unknown) {
    rmSync(temporary, { force: true });
    if (error instanceof IssueError) throw error;
    throw filesystemError(error, `cannot atomically replace canonical issue: ${path}`);
  }
}

function rewriteThenRename(source: string, destination: string, bytes: Uint8Array): void {
  assertRegularFile(source);
  const reservation = openSync(destination, 'wx', 0o600);
  closeSync(reservation);
  try {
    replaceDurable(source, bytes);
    const destinationStat = lstatSync(destination);
    if (!destinationStat.isFile() || destinationStat.size !== 0) {
      throw new IssueError('identity_ambiguity', 'canonical rename destination changed during mutation');
    }
    renameSync(source, destination);
    fsyncDirectory(dirname(source));
  } catch (error: unknown) {
    rmSync(destination, { force: true });
    if (error instanceof IssueError) throw error;
    throw filesystemError(error, `cannot atomically rename canonical issue: ${source}`);
  }
}

function assertRegularFile(path: string): void {
  if (!existsSync(path)) throw new IssueError('path_safety', 'canonical issue file does not exist');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new IssueError('path_safety', 'canonical issue path must be a regular non-symlink file');
  }
}

function readCreatedCandidate(
  repositoryRoot: string,
  absolutePath: string,
  id: string,
  location: IssueLocation,
  issuePrefix: string,
): IssueStorageCandidate {
  assertContained(repositoryRoot, absolutePath);
  const decoded = decodeIssueDocument(readFileSync(absolutePath), { expectedId: id, issuePrefix });
  return {
    id,
    location,
    path: portableRelative(repositoryRoot, absolutePath),
    absolutePath,
    decoded,
  };
}

function assertContained(root: string, path: string): void {
  const difference = relative(root, path);
  if (difference === '..' || difference.startsWith(`..${sep}`) || resolve(path) === resolve(root)) {
    throw new IssueError('path_safety', 'managed issue path escapes the repository root');
  }
}

function fsyncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function temporaryPath(path: string): string {
  return join(dirname(path), `.${randomBytes(12).toString('hex')}.tmp`);
}

function pathFinding(path: string, message: string): IssueStorageFinding {
  return { category: 'path_safety', message, path };
}

function asIssueError(error: unknown, path: string, id: string): IssueError {
  if (error instanceof IssueError) {
    return new IssueError(error.category, error.message, {
      issueIds: error.issueIds ?? [id],
      paths: error.paths ?? [path],
      limit: error.limit,
      retryable: error.retryable,
    });
  }
  return new IssueError('parse_safety', 'canonical issue could not be read', { issueIds: [id], paths: [path] });
}

function findingCategory(category: IssueError['category']): IssueStorageFinding['category'] {
  if (
    category === 'storage_classification' ||
    category === 'path_safety' ||
    category === 'parse_safety' ||
    category === 'schema' ||
    category === 'canonical_form' ||
    category === 'identity_ambiguity'
  ) {
    return category;
  }
  return 'schema';
}

function filesystemError(error: unknown, message: string): IssueError {
  const retryable = isErrorCode(error, 'EBUSY') || isErrorCode(error, 'EPERM');
  return new IssueError('filesystem_durability', message, { retryable });
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function appendMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
