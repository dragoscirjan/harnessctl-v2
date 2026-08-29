import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { ConfigError, readConfig, type ConfigDocument } from './config.js';
import {
  DOCUMENT_LIMITS,
  canonicalDocumentFilename,
  computeDocumentRevision,
  decodeDocument,
  type CanonicalDocumentMetadata,
} from './documents-contract.js';
import { decodeIssueDocument, type CanonicalIssueDocument } from './issues-contract.js';
import {
  memoryRecordSchema,
  memoryTombstoneSchema,
  type ConfigV1,
  type MemoryRecord,
  type MemoryTombstone,
} from './schemas.js';

const require = createRequire(import.meta.url);
const LOCK_PATH = '.harnessctl/cache/local-operations.lock';
const CACHE_PATH = '.harnessctl/cache/harnessctl.sqlite';
const CACHE_IDENTITY = 'harnessctl-local-cache';
const APPLICATION_ID = 0x48524e31;
const SCHEMA_VERSION = 4;
const DEFAULT_WAIT_MS = 5_000;
const MAX_ISSUES = 9_999;
const MAX_MEMORY_FILES = 10_000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const MAX_DOCUMENTS = DOCUMENT_LIMITS.files;
const MAX_ROWS = 1_000_000;
const MAX_TEMP_BYTES = 512 * 1024 * 1024;
const activeRoots = new Set<string>();
const leaseBrand: unique symbol = Symbol('local-barrier-lease');

export class LocalPersistenceError extends Error {
  public constructor(
    public readonly category:
      'configuration' | 'lock_contention' | 'path_safety' | 'resource_limit' | 'synchronization',
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'LocalPersistenceError';
  }
}

export interface BarrierLease {
  readonly repositoryRoot: string;
  readonly [leaseBrand]: true;
}

interface IssueProjection {
  issue: CanonicalIssueDocument;
  path: string;
  location: 'active' | 'archived';
  revision: string;
}

interface MemoryProjection {
  record: MemoryRecord;
  path: string;
  revision: string;
  active: boolean;
}

interface TombstoneProjection {
  tombstone: MemoryTombstone;
  path: string;
  revision: string;
}

interface DocumentProjection {
  metadata: CanonicalDocumentMetadata;
  path: string;
  location: 'active' | 'archive';
  revision: string;
}

export interface LocalSnapshot {
  readonly fingerprint: string;
  readonly issues: readonly IssueProjection[];
  readonly memories: readonly MemoryProjection[];
  readonly tombstones: readonly TombstoneProjection[];
  readonly documents: readonly DocumentProjection[];
}

export type DocumentSnapshotOverlay = ReadonlyMap<string, Uint8Array | undefined>;

export interface CanonicalFileReplacement {
  path: string;
  bytes?: Uint8Array;
  expectedRevision?: string | null;
}

export interface CanonicalBatchOptions {
  interruptAfter?: number;
  preserveOnInterruption?: boolean;
}

export class CanonicalBatchInterruption extends Error {
  public constructor() {
    super('injected interruption after canonical file publication');
    this.name = 'CanonicalBatchInterruption';
  }
}

export const DOCUMENT_PUBLICATION_TEMP_FILENAME_PATTERN = /^\.harnessctl-document-publish-[a-f0-9]{24}\.tmp$/u;

class CanonicalPublishInterruption extends Error {
  public constructor(path: string) {
    super(`injected interruption before canonical file rename: ${path}`);
    this.name = 'CanonicalPublishInterruption';
  }
}

export function applyCanonicalFileBatch(
  lease: BarrierLease,
  replacements: readonly CanonicalFileReplacement[],
  options: CanonicalBatchOptions = {},
): void {
  assertLocalBarrierLease(lease);
  if (!replacements.length || replacements.length > MAX_DOCUMENTS * 2)
    throw new LocalPersistenceError('resource_limit', 'canonical batch path limit exceeded');
  const ordered = [...replacements].sort((a, b) => compare(a.path, b.path));
  const before = new Map<string, Uint8Array | undefined>();
  const seen = new Set<string>();
  for (const replacement of ordered) {
    const key = replacement.path.normalize('NFKC').toLowerCase();
    if (seen.has(key)) throw new LocalPersistenceError('path_safety', 'canonical batch contains duplicate paths');
    seen.add(key);
    const absolute = managedFilePath(lease.repositoryRoot, replacement.path);
    const bytes = existsSync(absolute) ? boundedRead(absolute, replacement.path) : undefined;
    if (replacement.expectedRevision === null && bytes !== undefined)
      throw new LocalPersistenceError('synchronization', `canonical destination already exists: ${replacement.path}`);
    if (
      typeof replacement.expectedRevision === 'string' &&
      (bytes === undefined || computeDocumentRevision(bytes) !== replacement.expectedRevision)
    )
      throw new LocalPersistenceError('synchronization', `canonical file has a stale revision: ${replacement.path}`);
    before.set(replacement.path, bytes);
  }
  const applied: CanonicalFileReplacement[] = [];
  try {
    for (const replacement of ordered) {
      publishCanonicalFile(lease.repositoryRoot, replacement.path, replacement.bytes, {
        bytes: before.get(replacement.path),
      });
      applied.push(replacement);
      if (options.interruptAfter === applied.length) throw new CanonicalBatchInterruption();
    }
  } catch (error: unknown) {
    if (error instanceof CanonicalBatchInterruption && options.preserveOnInterruption) throw error;
    let rollbackError: unknown;
    for (const replacement of applied.reverse()) {
      try {
        publishCanonicalFile(lease.repositoryRoot, replacement.path, before.get(replacement.path));
      } catch (failure: unknown) {
        rollbackError ??= failure;
      }
    }
    if (rollbackError) throw new LocalPersistenceError('synchronization', 'canonical batch and rollback both failed');
    throw error;
  }
}

type LocalCacheValidation =
  | { outcome: 'checked'; evidence: 'canonical_snapshot_match_verified' }
  | { outcome: 'rebuilt'; evidence: 'canonical_snapshot_rebuild_verified' };

interface SqlStatement {
  run(...parameters: unknown[]): unknown;
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
  finalize?: () => void;
}

interface SqlHandle {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

interface LocalDatabase {
  exec(sql: string): void;
  run(sql: string, parameters?: readonly unknown[]): void;
  get(sql: string, parameters?: readonly unknown[]): Record<string, unknown> | undefined;
  all(sql: string, parameters?: readonly unknown[]): Record<string, unknown>[];
  transaction(operation: () => void): void;
  close(): void;
}

export function withLocalBarrier<T>(
  repositoryRoot: string,
  operation: (lease: BarrierLease) => T,
  waitMs = DEFAULT_WAIT_MS,
): T {
  const root = validateRepositoryRoot(repositoryRoot);
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > DEFAULT_WAIT_MS)
    throw new LocalPersistenceError('configuration', 'local barrier wait duration is invalid');
  if (activeRoots.has(root))
    throw new LocalPersistenceError('lock_contention', 'local operation barrier is non-reentrant', true);
  ensureDirectory(root, '.harnessctl/cache');
  const lock = resolve(root, LOCK_PATH);
  const deadline = Date.now() + waitMs;
  while (true) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error: unknown) {
      if (!hasCode(error, 'EEXIST'))
        throw new LocalPersistenceError('path_safety', 'cannot acquire local operation barrier');
      if (Date.now() >= deadline)
        throw new LocalPersistenceError('lock_contention', 'local operation barrier is busy', true);
      sleep(20);
    }
  }
  activeRoots.add(root);
  const lease = { repositoryRoot: root, [leaseBrand]: true as const };
  try {
    return operation(lease);
  } finally {
    activeRoots.delete(root);
    try {
      rmSync(lock, { recursive: true });
      syncDirectory(dirname(lock));
    } catch {
      // Fail closed: a release failure intentionally leaves the barrier behind.
    }
  }
}

export function assertLocalBarrierLease(lease: BarrierLease): void {
  if (!lease || lease[leaseBrand] !== true || !activeRoots.has(lease.repositoryRoot))
    throw new LocalPersistenceError('lock_contention', 'local operation requires an active barrier lease');
}

export function loadLocalSnapshot(lease: BarrierLease, documentOverlay?: DocumentSnapshotOverlay): LocalSnapshot {
  assertLocalBarrierLease(lease);
  const config = readConfig(lease.repositoryRoot);
  if (config instanceof ConfigError)
    throw new LocalPersistenceError(
      'configuration',
      `unable to read local persistence configuration: ${config.message}`,
    );
  const issues = loadIssues(lease.repositoryRoot, config);
  const memory = loadMemories(lease.repositoryRoot, config);
  const documents = loadDocuments(lease.repositoryRoot, config, documentOverlay);
  const hash = createHash('sha256').update(`${CACHE_IDENTITY}\0${SCHEMA_VERSION}\0`);
  hash.update(
    deterministicJson({
      issues: config.skills.issues,
      memory: config.skills.memory,
      documents: config.skills.documents,
    }),
  );
  for (const entry of [...issues.bytes, ...memory.bytes, ...documents.bytes].sort((left, right) =>
    compare(left.path, right.path),
  ))
    hash.update(entry.path).update('\0').update(entry.bytes).update('\0');
  hash.update(memory.enabled ? 'memory=repository' : 'memory=disabled');
  return {
    fingerprint: hash.digest('hex'),
    issues: issues.projections,
    memories: memory.records,
    tombstones: memory.tombstones,
    documents: documents.projections,
  };
}

function loadDocuments(
  root: string,
  config: ConfigV1,
  overlay: DocumentSnapshotOverlay = new Map(),
): { projections: DocumentProjection[]; bytes: Array<{ path: string; bytes: Uint8Array }> } {
  const documents = mapping(config.skills.documents, 'skills.documents');
  const documentProvider = mapping(documents.provider, 'skills.documents.provider');
  if (documents.enabled !== true || documentProvider.type !== 'filesystem') return { projections: [], bytes: [] };
  const documentRoot = safePath(stringValue(documents.root, 'documents.root'));
  const prefix = stringValue(documents.prefix, 'documents.prefix');
  assertSafeAncestor(root, documentRoot);
  const projections: DocumentProjection[] = [];
  const bytes: Array<{ path: string; bytes: Uint8Array }> = [];
  const overlaidPaths = new Set<string>();
  const identities = new Set<string>();
  let aggregateBytes = 0;
  const addDocument = (path: string, location: 'active' | 'archive', fileBytes: Uint8Array): void => {
    if (projections.length >= MAX_DOCUMENTS)
      throw new LocalPersistenceError('resource_limit', `document file limit exceeded at ${path}`);
    aggregateBytes += fileBytes.byteLength;
    if (aggregateBytes > DOCUMENT_LIMITS.aggregateBytes)
      throw new LocalPersistenceError('resource_limit', `aggregate canonical document byte limit exceeded at ${path}`);
    const decoded = decodeDocument(fileBytes);
    if (!new RegExp(`^${escapeRegex(prefix)}\\d{5,}$`, 'u').test(decoded.metadata.id))
      throw new LocalPersistenceError('path_safety', `document ID is not canonical for the configured prefix: ${path}`);
    if (canonicalDocumentFilename(decoded.metadata) !== path.slice(path.lastIndexOf('/') + 1))
      throw new LocalPersistenceError('path_safety', `document filename does not match metadata: ${path}`);
    const identity = `${decoded.metadata.id}\0${decoded.metadata.version}`;
    if (identities.has(identity)) throw new LocalPersistenceError('path_safety', `duplicate document version: ${path}`);
    identities.add(identity);
    projections.push({ metadata: decoded.metadata, path, location, revision: decoded.revision });
    bytes.push({ path, bytes: fileBytes });
  };
  for (const location of ['active', 'archive'] as const) {
    const directory = location === 'active' ? resolve(root, documentRoot) : resolve(root, documentRoot, 'archive');
    if (!existsSync(directory)) continue;
    assertDirectory(directory, `document ${location} root`);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (location === 'active' && (entry.name === 'archive' || entry.name === '.control')) continue;
      const path = portableRelative(root, join(directory, entry.name));
      if (overlay.has(path)) {
        overlaidPaths.add(path);
        const replacement = overlay.get(path);
        if (replacement !== undefined) addDocument(path, location, replacement);
        continue;
      }
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new LocalPersistenceError('path_safety', `unexpected canonical document entry: ${path}`);
      if (!entry.name.endsWith('.md'))
        throw new LocalPersistenceError('path_safety', `unsupported canonical document file: ${path}`);
      const fileBytes = boundedRead(join(directory, entry.name), path);
      addDocument(path, location, fileBytes);
    }
  }
  for (const [path, fileBytes] of overlay) {
    if (fileBytes === undefined || overlaidPaths.has(path)) continue;
    const activePrefix = `${documentRoot}/`;
    const archivePrefix = `${documentRoot}/archive/`;
    const location = path.startsWith(archivePrefix) ? 'archive' : path.startsWith(activePrefix) ? 'active' : undefined;
    if (!location || path.slice(location === 'archive' ? archivePrefix.length : activePrefix.length).includes('/'))
      throw new LocalPersistenceError('path_safety', `document overlay path is not canonical: ${path}`);
    addDocument(path, location, fileBytes);
  }
  const lineages = new Map<string, DocumentProjection[]>();
  for (const projection of projections) {
    const lineage = lineages.get(projection.metadata.id) ?? [];
    lineage.push(projection);
    lineages.set(projection.metadata.id, lineage);
  }
  for (const [id, lineage] of lineages) {
    if (lineage.length > DOCUMENT_LIMITS.versions)
      throw new LocalPersistenceError('resource_limit', `document lineage version limit exceeded: ${id}`);
    lineage.sort((a, b) => a.metadata.version - b.metadata.version);
    if (
      new Set(lineage.map((value) => value.location)).size !== 1 ||
      lineage.some((value, index) => value.metadata.version !== index + 1) ||
      lineage.some((value) => value.metadata.created_at !== lineage[0]?.metadata.created_at)
    )
      throw new LocalPersistenceError('path_safety', `invalid canonical document lineage: ${id}`);
  }
  return { projections, bytes };
}

export function ensureLocalCache(lease: BarrierLease, snapshot: LocalSnapshot): LocalCacheValidation {
  assertLocalBarrierLease(lease);
  const path = resolve(lease.repositoryRoot, CACHE_PATH);
  if (cacheIsHealthy(path, snapshot)) {
    return { outcome: 'checked', evidence: 'canonical_snapshot_match_verified' };
  }
  rebuildLocalCache(lease, snapshot);
  return { outcome: 'rebuilt', evidence: 'canonical_snapshot_rebuild_verified' };
}

export function synchronizeLocalCache(lease: BarrierLease, snapshot: LocalSnapshot, reload: () => LocalSnapshot): void {
  assertLocalBarrierLease(lease);
  const path = resolve(lease.repositoryRoot, CACHE_PATH);
  let database: LocalDatabase | undefined;
  try {
    if (
      process.env.HARNESSCTL_TEST_CACHE_FAILURE === 'synchronize' ||
      process.env.HARNESSCTL_TEST_CACHE_FAILURE === 'all'
    )
      throw new Error('injected cache synchronization failure');
    database = openDatabase(path);
    replaceSnapshot(database, snapshot);
    database.close();
    database = undefined;
    if (!cacheIsHealthy(path, snapshot)) throw new Error('cache failed post-synchronization verification');
    return;
  } catch {
    database?.close();
  }
  try {
    const fresh = reload();
    rebuildLocalCache(lease, fresh);
  } catch (error: unknown) {
    throw new LocalPersistenceError(
      'synchronization',
      `canonical data may already be committed; local cache repair failed and the next initialization will retry: ${safeMessage(error)}`,
    );
  }
}

function loadIssues(
  root: string,
  config: ConfigV1,
): {
  projections: IssueProjection[];
  bytes: Array<{ path: string; bytes: Uint8Array }>;
} {
  const issues = mapping(config.skills.issues, 'skills.issues');
  const provider = mapping(issues.provider, 'skills.issues.provider');
  if (issues.enabled !== true || provider.type !== 'filesystem') return { projections: [], bytes: [] };
  const issueRoot = safePath(stringValue(issues.root, 'issues.root'));
  const prefix = typeof issues.prefix === 'string' ? issues.prefix : undefined;
  if (prefix === undefined) throw new LocalPersistenceError('configuration', 'issues.prefix must be a string');
  const absoluteRoot = resolve(root, issueRoot);
  assertSafeAncestor(root, issueRoot);
  const projections: IssueProjection[] = [];
  const bytes: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const location of ['active', 'archived'] as const) {
    const directory = location === 'active' ? absoluteRoot : join(absoluteRoot, 'archived');
    if (!existsSync(directory)) continue;
    assertDirectory(directory, `issue ${location} root`);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (location === 'active' && (entry.name === 'archived' || entry.name === '.control')) continue;
      const path = portableRelative(root, join(directory, entry.name));
      if (!entry.isFile() || entry.isSymbolicLink()) {
        if (entry.name.endsWith('.yml'))
          throw new LocalPersistenceError('path_safety', `unsafe canonical issue path: ${path}`);
        continue;
      }
      if (!entry.name.endsWith('.yml')) continue;
      if (projections.length >= MAX_ISSUES)
        throw new LocalPersistenceError('resource_limit', `issue file limit exceeded at ${path}`);
      const fileBytes = boundedRead(join(directory, entry.name), path);
      const expectedId = new RegExp(`^(${escapeRegex(prefix)}\\d+)-`, 'u').exec(entry.name)?.[1];
      if (!expectedId) throw new LocalPersistenceError('path_safety', `malformed canonical issue filename: ${path}`);
      const decoded = decodeIssueDocument(fileBytes, { expectedId, issuePrefix: prefix });
      projections.push({ issue: decoded.issue, path, location, revision: decoded.revision });
      bytes.push({ path, bytes: fileBytes });
    }
  }
  const ids = new Set<string>();
  for (const projection of projections) {
    if (ids.has(projection.issue.id))
      throw new LocalPersistenceError('path_safety', `duplicate canonical issue ID: ${projection.issue.id}`);
    ids.add(projection.issue.id);
  }
  return { projections, bytes };
}

function loadMemories(
  root: string,
  config: ConfigV1,
): {
  enabled: boolean;
  records: MemoryProjection[];
  tombstones: TombstoneProjection[];
  bytes: Array<{ path: string; bytes: Uint8Array }>;
} {
  const memory = mapping(config.skills.memory, 'skills.memory');
  if (memory.enabled !== true || memory.backend !== 'repository')
    return { enabled: false, records: [], tombstones: [], bytes: [] };
  const namespace = mapping(memory.namespace, 'memory.namespace');
  const memoryRoot = safePath(stringValue(memory.root, 'memory.root'));
  assertSafeAncestor(root, memoryRoot);
  const absoluteRoot = resolve(root, memoryRoot);
  const records: MemoryProjection[] = [];
  const tombstones: TombstoneProjection[] = [];
  const bytes: Array<{ path: string; bytes: Uint8Array }> = [];
  let aggregate = 0;
  const ids = new Set<string>();
  for (const [folder, expectedType] of [
    ['facts', 'fact'],
    ['decisions', 'decision'],
    ['events', 'event'],
    ['lessons', 'lesson'],
    ['tombstones', 'tombstone'],
  ] as const) {
    const directory = join(absoluteRoot, folder);
    if (!existsSync(directory)) continue;
    assertDirectory(directory, `memory ${folder} root`);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (!entry.name.endsWith('.yaml')) continue;
      const path = portableRelative(root, join(directory, entry.name));
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new LocalPersistenceError('path_safety', `unsafe canonical memory path: ${path}`);
      if (records.length + tombstones.length >= MAX_MEMORY_FILES)
        throw new LocalPersistenceError('resource_limit', `memory file limit exceeded at ${path}`);
      const fileBytes = boundedRead(join(directory, entry.name), path);
      aggregate += fileBytes.byteLength;
      if (aggregate > MAX_MEMORY_BYTES)
        throw new LocalPersistenceError('resource_limit', `aggregate memory byte limit exceeded at ${path}`);
      const value = parseYaml(fileBytes, path);
      const revision = createHash('sha256').update(fileBytes).digest('hex');
      if (expectedType === 'tombstone') {
        const parsed = memoryTombstoneSchema.safeParse(value);
        if (!parsed.success) throw new Error(`invalid canonical memory tombstone: ${path}`);
        assertNamespace(parsed.data, namespace, path);
        if (ids.has(parsed.data.id)) throw new Error(`duplicate memory ID: ${parsed.data.id}`);
        ids.add(parsed.data.id);
        tombstones.push({ tombstone: parsed.data, path, revision });
      } else {
        const parsed = memoryRecordSchema.safeParse(value);
        if (!parsed.success || parsed.data.record_type !== expectedType)
          throw new Error(`invalid canonical memory record: ${path}`);
        assertNamespace(parsed.data, namespace, path);
        if (ids.has(parsed.data.id)) throw new Error(`duplicate memory ID: ${parsed.data.id}`);
        ids.add(parsed.data.id);
        records.push({ record: parsed.data, path, revision, active: true });
      }
      bytes.push({ path, bytes: fileBytes });
    }
  }
  const recordIds = new Set(records.map(({ record }) => record.id));
  const inactive = new Set<string>();
  for (const projection of records)
    for (const target of projection.record.supersedes) {
      if (!recordIds.has(target)) throw new Error(`broken supersedes reference: ${target}`);
      inactive.add(target);
    }
  for (const projection of tombstones) {
    if (!recordIds.has(projection.tombstone.target_id))
      throw new Error(`broken tombstone reference: ${projection.tombstone.target_id}`);
    inactive.add(projection.tombstone.target_id);
  }
  for (const projection of records) projection.active = !inactive.has(projection.record.id);
  assertMemoryAcyclic(records);
  return { enabled: true, records, tombstones, bytes };
}

function cacheIsHealthy(path: string, snapshot: LocalSnapshot): boolean {
  if (!existsSync(path)) return false;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const database = openDatabase(path);
    try {
      const integrity = database.get('PRAGMA integrity_check');
      const foreignKeys = database.get('PRAGMA foreign_key_check');
      const applicationId = numericValue(database.get('PRAGMA application_id'));
      const userVersion = numericValue(database.get('PRAGMA user_version'));
      const meta = database.get(
        'SELECT application_identity, schema_version, canonical_fingerprint, projection_digest, issue_count, memory_record_count, tombstone_count, document_count FROM cache_meta WHERE singleton_key = 1',
      );
      const tables = new Set(
        database
          .all("SELECT name FROM sqlite_master WHERE type = 'table'")
          .map((row) => row.name)
          .filter((name): name is string => typeof name === 'string'),
      );
      const requiredTables = [
        'cache_meta',
        'provider_generations',
        'issues',
        'issue_relationships',
        'issue_documents',
        'issue_comments',
        'memory_records',
        'memory_supersedes',
        'memory_tags',
        'memory_tombstones',
        'documents',
      ] as const;
      if (!requiredTables.every((table) => tables.has(table))) return false;
      const actualCounts = requiredTables.map((table) => numericValue(database.get(`SELECT count(*) FROM ${table}`)));
      const expectedCounts = expectedTableCounts(snapshot);
      const providerCount = actualCounts[1];
      const issueGeneration = database.get("SELECT generation FROM provider_generations WHERE provider = 'issues'");
      const memoryGeneration = database.get("SELECT generation FROM provider_generations WHERE provider = 'memory'");
      const documentGeneration = database.get(
        "SELECT generation FROM provider_generations WHERE provider = 'documents'",
      );
      return (
        firstValue(integrity) === 'ok' &&
        (foreignKeys === undefined || foreignKeys === null) &&
        applicationId === APPLICATION_ID &&
        userVersion === SCHEMA_VERSION &&
        meta?.application_identity === CACHE_IDENTITY &&
        meta.schema_version === SCHEMA_VERSION &&
        meta.canonical_fingerprint === snapshot.fingerprint &&
        meta.projection_digest === databaseProjectionDigest(database) &&
        meta.issue_count === snapshot.issues.length &&
        meta.memory_record_count === snapshot.memories.length &&
        meta.tombstone_count === snapshot.tombstones.length &&
        meta.document_count === snapshot.documents.length &&
        providerCount === 3 &&
        issueGeneration?.generation === snapshot.fingerprint &&
        memoryGeneration?.generation === snapshot.fingerprint &&
        documentGeneration?.generation === snapshot.fingerprint &&
        actualCounts.every(
          (count, index) => count !== undefined && count >= 0 && count <= MAX_ROWS && count === expectedCounts[index],
        ) &&
        actualCounts.reduce<number>((sum, count) => sum + (count ?? MAX_ROWS + 1), 0) === countRows(snapshot)
      );
    } finally {
      database.close();
    }
  } catch {
    return false;
  }
}

function rebuildLocalCache(lease: BarrierLease, snapshot: LocalSnapshot): void {
  if (process.env.HARNESSCTL_TEST_CACHE_FAILURE === 'rebuild' || process.env.HARNESSCTL_TEST_CACHE_FAILURE === 'all')
    throw new LocalPersistenceError('synchronization', 'injected local cache rebuild failure');
  const cachePath = resolve(lease.repositoryRoot, CACHE_PATH);
  ensureDirectory(lease.repositoryRoot, '.harnessctl/cache');
  const temporary = join(dirname(cachePath), `.harnessctl.sqlite.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let database: LocalDatabase | undefined;
  try {
    database = openDatabase(temporary);
    createSchema(database);
    replaceSnapshot(database, snapshot);
    database.exec('PRAGMA optimize');
    database.close();
    database = undefined;
    if (process.env.HARNESSCTL_TEST_CACHE_FAILURE === 'before-activate')
      throw new Error('injected cache failure before activation');
    const descriptor = openSync(temporary, 'r+');
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (lstatSync(temporary).size > MAX_TEMP_BYTES)
      throw new LocalPersistenceError('resource_limit', 'local cache temporary byte limit exceeded');
    if (process.env.HARNESSCTL_TEST_CACHE_FAILURE === 'activate') throw new Error('injected cache activation failure');
    renameSync(temporary, cachePath);
    syncDirectory(dirname(cachePath));
    if (!cacheIsHealthy(cachePath, snapshot)) throw new Error('rebuilt cache failed verification');
  } catch (error: unknown) {
    database?.close();
    rmSync(temporary, { force: true });
    if (error instanceof LocalPersistenceError) throw error;
    throw new LocalPersistenceError('synchronization', `unable to rebuild local cache: ${safeMessage(error)}`);
  }
}

function createSchema(database: LocalDatabase): void {
  database.exec(`
    PRAGMA application_id = ${APPLICATION_ID};
    PRAGMA user_version = ${SCHEMA_VERSION};
    PRAGMA foreign_keys = ON;
    CREATE TABLE cache_meta (
      singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
      application_identity TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      canonical_fingerprint TEXT NOT NULL,
      projection_digest TEXT NOT NULL,
      issue_count INTEGER NOT NULL,
      memory_record_count INTEGER NOT NULL,
      tombstone_count INTEGER NOT NULL,
      document_count INTEGER NOT NULL,
      rebuilt_at TEXT NOT NULL
    );
    CREATE TABLE provider_generations (
      provider TEXT PRIMARY KEY CHECK (provider IN ('issues', 'memory', 'documents')),
      generation TEXT NOT NULL
    );
    CREATE TABLE issues (
      id TEXT PRIMARY KEY, location TEXT NOT NULL CHECK (location IN ('active','archived')),
      canonical_path TEXT NOT NULL UNIQUE, byte_revision TEXT NOT NULL, contract_version INTEGER NOT NULL,
      type TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, created_by TEXT, assigned_to TEXT, parent_id TEXT REFERENCES issues(id),
      body TEXT NOT NULL, metadata_json TEXT NOT NULL
    );
    CREATE TABLE issue_relationships (
      source_id TEXT NOT NULL REFERENCES issues(id), target_id TEXT NOT NULL REFERENCES issues(id),
      kind TEXT NOT NULL CHECK (kind IN ('depends_on','relates_to','duplicates','supersedes')),
      PRIMARY KEY (source_id, target_id, kind), CHECK (source_id <> target_id)
    );
    CREATE TABLE issue_documents (issue_id TEXT NOT NULL REFERENCES issues(id), ordinal INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY(issue_id, ordinal), UNIQUE(issue_id, path));
    CREATE TABLE issue_comments (issue_id TEXT NOT NULL REFERENCES issues(id), ordinal INTEGER NOT NULL, comment_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, created_by TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(issue_id, ordinal));
    CREATE TABLE memory_records (
      id TEXT PRIMARY KEY, canonical_path TEXT NOT NULL UNIQUE, byte_revision TEXT NOT NULL,
      memory_type TEXT NOT NULL, record_type TEXT NOT NULL, organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL, topic TEXT NOT NULL, summary TEXT NOT NULL, details TEXT,
      source_kind TEXT NOT NULL, source_ref TEXT, source_revision TEXT, created_at TEXT NOT NULL,
      created_by TEXT NOT NULL, confidence TEXT NOT NULL, status TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)), searchable TEXT NOT NULL
    );
    CREATE TABLE memory_supersedes (source_id TEXT NOT NULL REFERENCES memory_records(id), target_id TEXT NOT NULL REFERENCES memory_records(id), PRIMARY KEY(source_id,target_id), CHECK(source_id <> target_id));
    CREATE TABLE memory_tags (record_id TEXT NOT NULL REFERENCES memory_records(id), ordinal INTEGER NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(record_id,ordinal), UNIQUE(record_id,tag));
    CREATE TABLE memory_tombstones (
      id TEXT PRIMARY KEY, canonical_path TEXT NOT NULL UNIQUE, byte_revision TEXT NOT NULL,
      target_id TEXT NOT NULL REFERENCES memory_records(id), organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL, reason TEXT NOT NULL, source_kind TEXT NOT NULL, source_ref TEXT,
      source_revision TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL
    );
    CREATE TABLE documents (
      id TEXT NOT NULL, version INTEGER NOT NULL, location TEXT NOT NULL CHECK(location IN ('active','archive')),
      canonical_path TEXT NOT NULL UNIQUE, byte_revision TEXT NOT NULL, title TEXT NOT NULL,
      kind TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_by TEXT, PRIMARY KEY(id,version)
    );
    CREATE INDEX issues_location_id ON issues(location,id);
    CREATE INDEX issues_status_id ON issues(status,id);
    CREATE INDEX issues_type_id ON issues(type,id);
    CREATE INDEX issues_parent_id ON issues(parent_id);
    CREATE INDEX issue_relationship_reverse ON issue_relationships(kind,target_id,source_id);
    CREATE INDEX memory_active_created ON memory_records(active,created_at DESC);
    CREATE INDEX memory_topic_active_created ON memory_records(topic,active,created_at DESC);
    CREATE INDEX memory_type_active_created ON memory_records(memory_type,active,created_at DESC);
    CREATE INDEX memory_tombstone_target ON memory_tombstones(target_id);
    CREATE INDEX documents_location_id_version ON documents(location,id,version);
    CREATE INDEX documents_kind_status ON documents(kind,status,id,version);
  `);
}

function replaceSnapshot(database: LocalDatabase, snapshot: LocalSnapshot): void {
  const rows = countRows(snapshot);
  if (rows > MAX_ROWS) throw new LocalPersistenceError('resource_limit', 'local cache projection row limit exceeded');
  database.transaction(() => {
    database.exec('PRAGMA defer_foreign_keys = ON;');
    database.exec(`
      DELETE FROM issue_comments; DELETE FROM issue_documents; DELETE FROM issue_relationships; DELETE FROM issues;
      DELETE FROM memory_tombstones; DELETE FROM memory_tags; DELETE FROM memory_supersedes; DELETE FROM memory_records;
      DELETE FROM documents;
      DELETE FROM provider_generations; DELETE FROM cache_meta;
    `);
    for (const projection of snapshot.issues) {
      const issue = projection.issue;
      database.run('INSERT INTO issues VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        issue.id,
        projection.location,
        projection.path,
        projection.revision,
        issue.version,
        issue.type,
        issue.title,
        issue.status,
        issue.created_at,
        issue.updated_at,
        issue.created_by ?? null,
        issue.assigned_to ?? null,
        issue.parent ?? null,
        issue.body,
        deterministicJson(issue.metadata ?? {}),
      ]);
    }
    for (const projection of snapshot.issues) {
      const issue = projection.issue;
      for (const kind of ['depends_on', 'relates_to', 'duplicates', 'supersedes'] as const)
        for (const target of issue[kind] ?? [])
          database.run('INSERT INTO issue_relationships VALUES (?,?,?)', [issue.id, target, kind]);
      for (const [ordinal, path] of (issue.documents ?? []).entries())
        database.run('INSERT INTO issue_documents VALUES (?,?,?)', [issue.id, ordinal, path]);
      for (const [ordinal, comment] of issue.comments.entries())
        database.run('INSERT INTO issue_comments VALUES (?,?,?,?,?,?)', [
          issue.id,
          ordinal,
          comment.id,
          comment.created_at,
          comment.created_by,
          comment.body,
        ]);
    }
    for (const projection of snapshot.memories) {
      const record = projection.record;
      database.run('INSERT INTO memory_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        record.id,
        projection.path,
        projection.revision,
        record.memory_type,
        record.record_type,
        record.organization_id,
        record.project_id,
        record.topic,
        record.summary,
        record.details,
        record.source.kind,
        record.source.ref,
        record.source.revision,
        record.created_at,
        record.created_by,
        record.confidence,
        record.status,
        projection.active ? 1 : 0,
        searchable(record),
      ]);
    }
    for (const projection of snapshot.memories) {
      for (const target of projection.record.supersedes)
        database.run('INSERT INTO memory_supersedes VALUES (?,?)', [projection.record.id, target]);
      for (const [ordinal, tag] of projection.record.tags.entries())
        database.run('INSERT INTO memory_tags VALUES (?,?,?)', [projection.record.id, ordinal, tag]);
    }
    for (const projection of snapshot.tombstones) {
      const value = projection.tombstone;
      database.run('INSERT INTO memory_tombstones VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
        value.id,
        projection.path,
        projection.revision,
        value.target_id,
        value.organization_id,
        value.project_id,
        value.reason,
        value.source.kind,
        value.source.ref,
        value.source.revision,
        value.created_at,
        value.created_by,
      ]);
    }
    for (const projection of snapshot.documents) {
      const value = projection.metadata;
      database.run('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
        value.id,
        value.version,
        projection.location,
        projection.path,
        projection.revision,
        value.title,
        value.kind,
        value.status,
        value.created_at,
        value.updated_at,
        value.created_by ?? null,
      ]);
    }
    database.run('INSERT INTO provider_generations VALUES (?,?), (?,?), (?,?)', [
      'issues',
      snapshot.fingerprint,
      'memory',
      snapshot.fingerprint,
      'documents',
      snapshot.fingerprint,
    ]);
    database.run('INSERT INTO cache_meta VALUES (1,?,?,?,?,?,?,?,?,?)', [
      CACHE_IDENTITY,
      SCHEMA_VERSION,
      snapshot.fingerprint,
      databaseProjectionDigest(database),
      snapshot.issues.length,
      snapshot.memories.length,
      snapshot.tombstones.length,
      snapshot.documents.length,
      new Date().toISOString(),
    ]);
  });
}

function databaseProjectionDigest(database: LocalDatabase): string {
  const rows = {
    providers: database.all('SELECT provider, generation FROM provider_generations ORDER BY provider'),
    issues: database.all('SELECT * FROM issues ORDER BY id'),
    issueRelationships: database.all('SELECT * FROM issue_relationships ORDER BY source_id, target_id, kind'),
    issueDocuments: database.all('SELECT * FROM issue_documents ORDER BY issue_id, ordinal'),
    issueComments: database.all('SELECT * FROM issue_comments ORDER BY issue_id, ordinal'),
    memoryRecords: database.all('SELECT * FROM memory_records ORDER BY id'),
    memorySupersedes: database.all('SELECT * FROM memory_supersedes ORDER BY source_id, target_id'),
    memoryTags: database.all('SELECT * FROM memory_tags ORDER BY record_id, ordinal'),
    memoryTombstones: database.all('SELECT * FROM memory_tombstones ORDER BY id'),
    documents: database.all('SELECT * FROM documents ORDER BY id, version'),
  };
  return createHash('sha256').update(deterministicJson(rows)).digest('hex');
}

function openDatabase(path: string): LocalDatabase {
  try {
    const runtime = selectSqliteRuntime(process.versions);
    let handle: SqlHandle;
    if (runtime === 'bun') {
      const module = require('bun:sqlite') as {
        Database: new (path: string, options?: { create?: boolean; strict?: boolean }) => SqlHandle;
      };
      handle = new module.Database(path, { create: true, strict: true });
    } else {
      const module = require('node:sqlite') as {
        DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqlHandle;
      };
      handle = new module.DatabaseSync(path, {
        allowExtension: false,
        enableForeignKeyConstraints: true,
        timeout: 0,
      });
    }
    return wrapDatabase(handle);
  } catch (error: unknown) {
    throw new LocalPersistenceError(
      'synchronization',
      `unable to load ${process.versions.bun ? 'Bun' : 'Node'} SQLite runtime: ${safeMessage(error)}`,
    );
  }
}

function wrapDatabase(handle: SqlHandle): LocalDatabase {
  const statement = <T>(sql: string, parameters: readonly unknown[], action: (value: SqlStatement) => T): T => {
    const prepared = handle.prepare(sql);
    try {
      return action(prepared);
    } finally {
      prepared.finalize?.();
    }
  };
  return {
    exec: (sql) => handle.exec(sql),
    run: (sql, parameters = []) => statement(sql, parameters, (prepared) => void prepared.run(...parameters)),
    get: (sql, parameters = []) =>
      statement(sql, parameters, (prepared) => prepared.get(...parameters) as Record<string, unknown> | undefined),
    all: (sql, parameters = []) =>
      statement(sql, parameters, (prepared) => prepared.all(...parameters) as Record<string, unknown>[]),
    transaction: (operation) => {
      handle.exec('BEGIN IMMEDIATE');
      try {
        operation();
        handle.exec('COMMIT');
      } catch (error: unknown) {
        try {
          handle.exec('ROLLBACK');
        } catch {
          // Preserve the original transaction failure.
        }
        throw error;
      }
    },
    close: () => handle.close(),
  };
}

function countRows(snapshot: LocalSnapshot): number {
  let rows =
    4 + snapshot.issues.length + snapshot.memories.length + snapshot.tombstones.length + snapshot.documents.length;
  for (const { issue } of snapshot.issues)
    rows +=
      issue.comments.length +
      (issue.documents?.length ?? 0) +
      ['depends_on', 'relates_to', 'duplicates', 'supersedes'].reduce(
        (sum, key) =>
          sum + ((issue[key as keyof CanonicalIssueDocument] as readonly unknown[] | undefined)?.length ?? 0),
        0,
      );
  for (const { record } of snapshot.memories) rows += record.supersedes.length + record.tags.length;
  return rows;
}

function expectedTableCounts(snapshot: LocalSnapshot): number[] {
  let relationships = 0;
  let documents = 0;
  let comments = 0;
  let supersedes = 0;
  let tags = 0;
  for (const { issue } of snapshot.issues) {
    comments += issue.comments.length;
    documents += issue.documents?.length ?? 0;
    for (const key of ['depends_on', 'relates_to', 'duplicates', 'supersedes'] as const)
      relationships += issue[key]?.length ?? 0;
  }
  for (const { record } of snapshot.memories) {
    supersedes += record.supersedes.length;
    tags += record.tags.length;
  }
  return [
    1,
    3,
    snapshot.issues.length,
    relationships,
    documents,
    comments,
    snapshot.memories.length,
    supersedes,
    tags,
    snapshot.tombstones.length,
    snapshot.documents.length,
  ];
}

function managedFilePath(root: string, value: string): string {
  const path = safePath(value);
  const absolute = resolve(root, path);
  portableRelative(root, absolute);
  const parent = portableRelative(root, dirname(absolute));
  assertSafeAncestor(root, parent);
  return absolute;
}

function publishCanonicalFile(
  root: string,
  path: string,
  bytes: Uint8Array | undefined,
  expectedCurrent?: { readonly bytes: Uint8Array | undefined },
): void {
  const absolute = managedFilePath(root, path);
  if (process.env.HARNESSCTL_TEST_PUBLICATION_FAILURE_PATH === path)
    throw new LocalPersistenceError('synchronization', `injected canonical publication failure: ${path}`);
  ensureDirectory(root, portableRelative(root, dirname(absolute)));
  if (bytes === undefined) {
    if (expectedCurrent) assertCanonicalPathUnchanged(root, path, expectedCurrent.bytes);
    if (existsSync(absolute)) {
      boundedRead(absolute, path);
      unlinkSync(absolute);
      syncDirectory(dirname(absolute));
    }
    return;
  }
  if (existsSync(absolute)) boundedRead(absolute, path);
  const temporary = join(dirname(absolute), `.harnessctl-document-publish-${randomBytes(12).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH === path)
      throw new CanonicalPublishInterruption(path);
    // The barrier coordinates harnessctl writers. This final recheck narrows
    // external races; closing the syscall window requires platform openat APIs.
    if (expectedCurrent) assertCanonicalPathUnchanged(root, path, expectedCurrent.bytes);
    if (managedFilePath(root, path) !== absolute)
      throw new LocalPersistenceError('path_safety', `managed canonical path changed: ${path}`);
    renameSync(temporary, absolute);
    syncDirectory(dirname(absolute));
  } catch (error: unknown) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof CanonicalPublishInterruption) throw error;
    rmSync(temporary, { force: true });
    throw new LocalPersistenceError('synchronization', `cannot publish canonical path ${path}: ${safeMessage(error)}`);
  }
}

export function selectSqliteRuntime(versions: { readonly bun?: string; readonly node?: string }): 'bun' | 'node' {
  if (versions.bun !== undefined) {
    assertMinimumRuntimeVersion('Bun', versions.bun, [1, 3, 13]);
    return 'bun';
  }
  if (versions.node !== undefined) {
    const actual = parseRuntimeVersion('Node', versions.node);
    if ((actual[0] === 22 && compareVersion(actual, [22, 13, 0]) >= 0) || actual[0] >= 24) return 'node';
    throw new LocalPersistenceError(
      'synchronization',
      `Node ${versions.node} is unsupported for local SQLite; requires 22.13.0 through 22.x, or 24.0.0 and newer`,
    );
  }
  throw new LocalPersistenceError('synchronization', 'unsupported runtime for local SQLite');
}

function assertMinimumRuntimeVersion(runtime: string, value: string, minimum: readonly [number, number, number]): void {
  const actual = parseRuntimeVersion(runtime, value);
  if (compareVersion(actual, minimum) < 0)
    throw new LocalPersistenceError(
      'synchronization',
      `${runtime} ${value || 'unknown'} is unsupported for local SQLite; requires ${minimum.join('.')} or newer`,
    );
}

function parseRuntimeVersion(runtime: string, value: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(value);
  if (!match)
    throw new LocalPersistenceError(
      'synchronization',
      `${runtime} ${value || 'unknown'} is unsupported for local SQLite`,
    );
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseYaml(bytes: Uint8Array, path: string): unknown {
  const document = parseDocument(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new Error(`malformed canonical memory YAML: ${path}`);
  return document.toJS({ maxAliasCount: 0 });
}

export interface BoundedNoFollowReadOptions {
  /** Test seam used to replace a path deterministically between validation and open. */
  beforeOpen?: () => void;
  /** Test seam for the cross-platform identity-validation fallback. */
  forceFallback?: boolean;
}

export function readBoundedNoFollowFile(
  path: string,
  relativePath: string,
  limit: number,
  options: BoundedNoFollowReadOptions = {},
): Uint8Array {
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new LocalPersistenceError('resource_limit', `managed file byte limit is invalid at ${relativePath}`);
  const before = checkedRegularFile(path, relativePath, limit);
  options.beforeOpen?.();
  let descriptor: number | undefined;
  try {
    descriptor = openReadDescriptor(path, options.forceFallback === true);
    const opened = fstatSync(descriptor);
    assertStableFile(before, opened, relativePath, limit);
    const bytes = readExactDescriptor(descriptor, opened.size, relativePath);
    assertStableFile(opened, fstatSync(descriptor), relativePath, limit);
    assertStableFile(opened, checkedRegularFile(path, relativePath, limit), relativePath, limit);
    // A final path syscall remains inherently racy without portable openat-style APIs.
    return bytes;
  } catch (error: unknown) {
    if (error instanceof LocalPersistenceError) throw error;
    throw new LocalPersistenceError(
      'path_safety',
      `cannot safely read managed path ${relativePath}: ${safeMessage(error)}`,
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function boundedRead(path: string, relativePath: string): Uint8Array {
  return readBoundedNoFollowFile(path, relativePath, MAX_FILE_BYTES);
}

function openReadDescriptor(path: string, forceFallback: boolean): number {
  const noFollow = constants.O_NOFOLLOW;
  if (!forceFallback && process.platform !== 'win32' && typeof noFollow === 'number') {
    try {
      return openSync(path, constants.O_RDONLY | noFollow);
    } catch (error: unknown) {
      if (!hasCode(error, 'EINVAL') && !hasCode(error, 'ENOTSUP')) throw error;
      // Some platforms expose O_NOFOLLOW but reject it. The caller still validates
      // descriptor identity against lstat before consuming any bytes.
    }
  }
  return openSync(path, constants.O_RDONLY);
}

function checkedRegularFile(path: string, relativePath: string, limit: number): Stats {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new LocalPersistenceError('path_safety', `managed path is not a regular file: ${relativePath}`);
  if (stat.size > limit)
    throw new LocalPersistenceError('resource_limit', `managed file byte limit exceeded at ${relativePath}`);
  return stat;
}

function assertStableFile(before: Stats, after: Stats, relativePath: string, limit: number): void {
  if (
    !after.isFile() ||
    after.isSymbolicLink() ||
    after.size > limit ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  )
    throw new LocalPersistenceError('path_safety', `managed path changed while reading: ${relativePath}`);
}

function readExactDescriptor(descriptor: number, size: number, relativePath: string): Uint8Array {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(descriptor, bytes, offset, size - offset, offset);
    if (count === 0)
      throw new LocalPersistenceError('path_safety', `managed path changed while reading: ${relativePath}`);
    offset += count;
  }
  if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0)
    throw new LocalPersistenceError('path_safety', `managed path changed while reading: ${relativePath}`);
  return bytes;
}

function assertCanonicalPathUnchanged(root: string, path: string, expected: Uint8Array | undefined): void {
  const absolute = managedFilePath(root, path);
  const current = existsSync(absolute) ? boundedRead(absolute, path) : undefined;
  if (
    (expected === undefined) !== (current === undefined) ||
    (expected !== undefined &&
      current !== undefined &&
      computeDocumentRevision(expected) !== computeDocumentRevision(current))
  )
    throw new LocalPersistenceError('synchronization', `canonical path changed during publication: ${path}`);
}

function ensureDirectory(root: string, path: string): void {
  let current = root;
  for (const component of path.split('/')) {
    current = join(current, component);
    if (existsSync(current)) {
      assertDirectory(current, 'managed directory');
      continue;
    }
    mkdirSync(current, { mode: 0o700 });
    syncDirectory(dirname(current));
  }
}

function assertSafeAncestor(root: string, path: string): void {
  let current = root;
  for (const component of path.split('/')) {
    current = join(current, component);
    if (!existsSync(current)) return;
    assertDirectory(current, 'managed root');
  }
}

function validateRepositoryRoot(value: string): string {
  if (!value || value.includes('\0')) throw new LocalPersistenceError('configuration', 'repository root is invalid');
  const root = resolve(value);
  assertDirectory(root, 'repository root');
  return root;
}

function assertDirectory(path: string, label: string): void {
  if (!existsSync(path)) throw new LocalPersistenceError('path_safety', `${label} does not exist`);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new LocalPersistenceError('path_safety', `${label} must be a non-symlink directory`);
}

function safePath(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new LocalPersistenceError('configuration', 'managed root must be a safe project-relative path');
  return value;
}

function mapping(value: unknown, path: string): ConfigDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new LocalPersistenceError('configuration', `${path} must be a mapping`);
  return value as ConfigDocument;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new LocalPersistenceError('configuration', `${path} must be a non-empty string`);
  return value;
}

function assertNamespace(
  value: { organization_id: string; project_id: string },
  namespace: ConfigDocument,
  path: string,
): void {
  if (value.organization_id !== namespace.organization_id || value.project_id !== namespace.project_id)
    throw new Error(`memory namespace mismatch: ${path}`);
}

function deterministicJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(deterministicJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${deterministicJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function assertMemoryAcyclic(records: readonly MemoryProjection[]): void {
  const edges = new Map(records.map(({ record }) => [record.id, record.supersedes]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`cyclic memory supersession at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of edges.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of edges.keys()) visit(id);
}

function searchable(record: MemoryRecord): string {
  return [record.summary, record.details ?? '', record.topic, ...record.tags].join('\n').toLocaleLowerCase();
}

function numericValue(row: Record<string, unknown> | undefined): number | undefined {
  const value = firstValue(row);
  return typeof value === 'number' ? value : undefined;
}

function firstValue(row: Record<string, unknown> | undefined): unknown {
  return row ? Object.values(row)[0] : undefined;
}

function syncDirectory(path: string): void {
  if (process.platform === 'win32' || !existsSync(path)) return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error: unknown) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EBADF'].some((code) => hasCode(error, code))) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function portableRelative(root: string, path: string): string {
  const value = relative(root, path);
  if (!value || value === '..' || value.startsWith(`..${sep}`))
    throw new LocalPersistenceError('path_safety', 'managed path escapes repository root');
  return value.split(sep).join('/');
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown synchronization failure';
}
