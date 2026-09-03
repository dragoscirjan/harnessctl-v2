import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { ConfigError, readConfig } from './config.js';
import {
  DOCUMENT_KINDS,
  DOCUMENT_LIMITS,
  DOCUMENT_STATUSES,
  DocumentError,
  canonicalDocumentFilename,
  computeDocumentRevision,
  decodeDocument,
  encodeCanonicalDocument,
  type CanonicalDocumentMetadata,
  type DocumentKind,
  type DocumentLocation,
  type DocumentStatus,
} from './documents-contract.js';
import { comparePrefixedIdentities, createUlid, prefixedIdentityPattern } from './identities.js';
import { assertNoCanonicalIssueDocumentReferences, validateCanonicalIssueGraph } from './issues.js';
import {
  applyCanonicalFileBatch,
  CanonicalBatchInterruption,
  DOCUMENT_PUBLICATION_TEMP_FILENAME_PATTERN,
  ensureLocalCache,
  loadLocalSnapshot,
  LocalPersistenceError,
  readBoundedNoFollowFile,
  synchronizeLocalCache,
  withLocalBarrier,
  type BarrierLease,
  type CanonicalFileReplacement,
} from './local-persistence.js';

export { DOCUMENT_KINDS, DOCUMENT_STATUSES, DocumentError };
export type { DocumentKind, DocumentStatus, DocumentLocation };

export interface CreateDocumentOptions {
  title: string;
  kind: string;
  status?: string;
  author?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentChanges {
  title?: string;
  kind?: string;
  status?: string;
  author?: string;
  body?: string;
  metadata?: Record<string, unknown> | null;
  expectedRevision: string;
}

export interface DocumentRecord {
  id: string;
  path: string;
  metadata: CanonicalDocumentMetadata;
  body: string;
  revision: string;
  location: DocumentLocation;
  superseded: boolean;
  archived: boolean;
}

export interface DocumentSummary extends Omit<DocumentRecord, 'body' | 'metadata'> {
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  version: number;
}

export interface ListDocumentOptions {
  kind?: string;
  status?: string;
  location?: DocumentLocation;
}

export interface DocumentValidationReport {
  valid: boolean;
  findings: Array<{ document?: string; path?: string; category: string; message: string }>;
}

export interface FilesystemDocumentProviderOptions {
  clock?: () => Date;
  /** Deterministic test seam; production uses a timestamped cryptographic ULID. */
  generateUlid?: (timestamp: number) => string;
  lockWaitMs?: number;
}

export interface FilesystemDocumentProvider {
  parseId(text: string): string;
  create(options: CreateDocumentOptions): DocumentRecord;
  list(options?: ListDocumentOptions): DocumentSummary[];
  get(id: string, version?: number): DocumentRecord;
  update(id: string, changes: DocumentChanges): DocumentRecord;
  version(id: string, changes: DocumentChanges): DocumentRecord;
  validate(id?: string): DocumentValidationReport;
  archive(id: string, expectedRevision: string): DocumentOperationReport;
  restore(id: string, expectedRevision: string): DocumentOperationReport;
}

export interface DocumentOperationReport {
  id: string;
  location: DocumentLocation;
  documents: DocumentSummary[];
}

interface Entity {
  decoded: ReturnType<typeof decodeDocument>;
  path: string;
  absolutePath: string;
  location: DocumentLocation;
}

interface Catalog {
  entities: Entity[];
  byId: Map<string, Entity[]>;
}

const MAX_DOCUMENTS = DOCUMENT_LIMITS.files;
const JOURNAL_PATH = '.control/transaction.json';
const BACKUP_ROOT = '.control/transaction-files';

export function createFilesystemDocumentProvider(
  cwd: string,
  options: FilesystemDocumentProviderOptions = {},
): FilesystemDocumentProvider {
  const config = localDocumentConfig(cwd, 'createFilesystemDocumentProvider');
  const clock = options.clock ?? (() => new Date());
  const generateUlid = options.generateUlid ?? createUlid;
  const locked = <T>(name: string, operation: (lease: BarrierLease) => T, mutation = false): T => {
    assertLocalDocumentCapability(cwd, name);
    return withLocalBarrier(
      cwd,
      (lease) => {
        recoverDocumentTransaction(cwd, config, lease);
        const snapshot = loadLocalSnapshot(lease);
        if (!mutation) ensureLocalCache(lease, snapshot);
        const result = operation(lease);
        if (mutation) synchronizeLocalCache(lease, loadLocalSnapshot(lease), () => loadLocalSnapshot(lease));
        return result;
      },
      options.lockWaitMs,
    );
  };
  const moveLocked = (
    name: string,
    id: string,
    revision: string,
    destination: DocumentLocation,
  ): DocumentOperationReport => {
    assertLocalDocumentCapability(cwd, name);
    return withLocalBarrier(
      cwd,
      (lease) => {
        recoverDocumentTransaction(cwd, config, lease);
        loadLocalSnapshot(lease);
        const result = moveLineage(cwd, config, lease, id, revision, destination);
        synchronizeLocalCache(lease, loadLocalSnapshot(lease), () => loadLocalSnapshot(lease));
        return result;
      },
      options.lockWaitMs,
    );
  };
  return {
    parseId: (text) => {
      assertLocalDocumentCapability(cwd, 'parseDocumentId');
      return parseDocumentIdWithPrefix(text, config.prefix);
    },
    create: (input) =>
      locked('createDocument', (lease) => createUnlocked(cwd, config, clock, generateUlid, lease, input), true),
    list: (input = {}) => {
      const normalized = normalizeListOptions(input);
      return locked('listDocuments', () => listUnlocked(cwd, config, normalized));
    },
    get: (id, version) => locked('getDocument', () => getUnlocked(cwd, config, id, version)),
    update: (id, changes) =>
      locked('updateDocument', (lease) => updateUnlocked(cwd, config, clock, lease, id, changes), true),
    version: (id, changes) =>
      locked('versionDocument', (lease) => versionUnlocked(cwd, config, clock, lease, id, changes), true),
    validate: (id) =>
      locked('validateDocuments', (lease) => {
        const report = validateUnlocked(cwd, config, id);
        if (report.valid) ensureLocalCache(lease, loadLocalSnapshot(lease));
        return report;
      }),
    archive: (id, revision) => moveLocked('archiveDocument', id, revision, 'archive'),
    restore: (id, revision) => moveLocked('restoreDocument', id, revision, 'active'),
  };
}

function assertCanonicalIssueGraph(cwd: string, documentOverlay?: ReadonlyMap<string, Uint8Array | undefined>): void {
  if (!validateCanonicalIssueGraph(cwd, documentOverlay).valid)
    throw new DocumentError('synchronization', 'cannot access documents while the canonical issue graph is invalid');
}

export function parseDocumentId(text: string, cwd = process.cwd()): string {
  const { prefix } = localDocumentConfig(cwd, 'parseDocumentId');
  return parseDocumentIdWithPrefix(text, prefix);
}
export function createDocument(cwd: string, input: CreateDocumentOptions): DocumentRecord {
  return createFilesystemDocumentProvider(cwd).create(input);
}
export function listDocuments(cwd: string, input: ListDocumentOptions = {}): DocumentSummary[] {
  const normalized = normalizeListOptions(input);
  return createFilesystemDocumentProvider(cwd).list(normalized);
}
export function getDocument(cwd: string, id: string, version?: number): DocumentRecord {
  return createFilesystemDocumentProvider(cwd).get(id, version);
}
export function updateDocument(cwd: string, id: string, changes: DocumentChanges): DocumentRecord {
  return createFilesystemDocumentProvider(cwd).update(id, changes);
}
export function versionDocument(cwd: string, id: string, changes: DocumentChanges): DocumentRecord {
  return createFilesystemDocumentProvider(cwd).version(id, changes);
}
export function validateDocuments(cwd: string, id?: string): DocumentValidationReport {
  try {
    return createFilesystemDocumentProvider(cwd).validate(id);
  } catch (error: unknown) {
    return { valid: false, findings: [finding(error, id)] };
  }
}
export function archiveDocument(cwd: string, id: string, expectedRevision: string): DocumentOperationReport {
  return createFilesystemDocumentProvider(cwd).archive(id, expectedRevision);
}
export function restoreDocument(cwd: string, id: string, expectedRevision: string): DocumentOperationReport {
  return createFilesystemDocumentProvider(cwd).restore(id, expectedRevision);
}

function createUnlocked(
  cwd: string,
  config: StorageConfig,
  clock: () => Date,
  generateUlid: (timestamp: number) => string,
  lease: BarrierLease,
  input: CreateDocumentOptions,
): DocumentRecord {
  const catalog = discover(cwd, config);
  const now = clock();
  const id = `${config.prefix}${generateUlid(now.getTime())}`;
  assertId(id, config.prefix);
  const timestamp = canonicalTimestamp(now);
  const metadata: CanonicalDocumentMetadata = {
    id,
    title: required(input.title, 'title'),
    kind: choice(input.kind, DOCUMENT_KINDS, 'kind'),
    status: choice(input.status ?? 'draft', DOCUMENT_STATUSES, 'status'),
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    ...(optional(input.author) ? { created_by: optional(input.author) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const bytes = encodeCanonicalDocument(metadata, input.body ?? '');
  const path = documentPath(config.root, 'active', metadata);
  const replacements = [{ path, bytes, expectedRevision: null }] as const;
  const proposed = proposeCatalog(cwd, config, catalog, replacements);
  const result = record(requireProposedEntity(proposed, path), proposed.byId.get(id) ?? []);
  applyCanonicalFileBatch(lease, replacements);
  return result;
}

function listUnlocked(cwd: string, config: StorageConfig, input: ListDocumentOptions): DocumentSummary[] {
  const catalog = discover(cwd, config);
  const results = catalog.entities
    .filter((entity) => !input.kind || entity.decoded.metadata.kind === choice(input.kind, DOCUMENT_KINDS, 'kind'))
    .filter(
      (entity) => !input.status || entity.decoded.metadata.status === choice(input.status, DOCUMENT_STATUSES, 'status'),
    )
    .filter((entity) => !input.location || entity.location === input.location)
    .sort((left, right) => compareEntity(left, right, config.prefix))
    .map((entity) => summary(entity, catalog.byId.get(entity.decoded.metadata.id) ?? []));
  return boundedSummaries(results, 'document list');
}

function normalizeListOptions(input: ListDocumentOptions): ListDocumentOptions {
  const location = input.location;
  if (location !== undefined && location !== 'active' && location !== 'archive')
    throw new DocumentError('schema', 'invalid document location; expected active or archive');
  return {
    ...(input.kind === undefined ? {} : { kind: choice(input.kind, DOCUMENT_KINDS, 'kind') }),
    ...(input.status === undefined ? {} : { status: choice(input.status, DOCUMENT_STATUSES, 'status') }),
    ...(location === undefined ? {} : { location }),
  };
}

function getUnlocked(cwd: string, config: StorageConfig, id: string, version?: number): DocumentRecord {
  assertId(id, config.prefix);
  const catalog = discover(cwd, config);
  const lineage = catalog.byId.get(id);
  if (!lineage?.length) throw new DocumentError('schema', `canonical document was not found: ${id}`);
  const target =
    version === undefined ? lineage.at(-1) : lineage.find((entity) => entity.decoded.metadata.version === version);
  if (!target) throw new DocumentError('schema', `document version was not found: ${id} v${String(version)}`);
  return record(target, lineage);
}

function updateUnlocked(
  cwd: string,
  config: StorageConfig,
  clock: () => Date,
  lease: BarrierLease,
  id: string,
  changes: DocumentChanges,
): DocumentRecord {
  const current = currentActive(cwd, config, id, changes.expectedRevision);
  const next = changedMetadata(current.decoded.metadata, changes, clock, false);
  const nextContent = changes.body ?? documentContent(current);
  const bytes = encodeCanonicalDocument(next, nextContent);
  const destination = documentPath(config.root, 'active', next);
  if (destination !== current.path) assertNoCanonicalIssueDocumentReferences(cwd, [current.path]);
  const replacements: CanonicalFileReplacement[] = [
    { path: destination, bytes, expectedRevision: destination === current.path ? current.decoded.revision : null },
  ];
  if (destination !== current.path)
    replacements.push({ path: current.path, expectedRevision: current.decoded.revision });
  const proposed = proposeCatalog(cwd, config, discover(cwd, config), replacements);
  const result = record(requireProposedEntity(proposed, destination), proposed.byId.get(id) ?? []);
  applyCanonicalFileBatch(lease, replacements);
  return result;
}

function versionUnlocked(
  cwd: string,
  config: StorageConfig,
  clock: () => Date,
  lease: BarrierLease,
  id: string,
  changes: DocumentChanges,
): DocumentRecord {
  const current = currentActive(cwd, config, id, changes.expectedRevision);
  const next = changedMetadata(current.decoded.metadata, changes, clock, true);
  const bytes = encodeCanonicalDocument(next, changes.body ?? documentContent(current));
  const path = documentPath(config.root, 'active', next);
  const replacements = [{ path, bytes, expectedRevision: null }] as const;
  const proposed = proposeCatalog(cwd, config, discover(cwd, config), replacements);
  const result = record(requireProposedEntity(proposed, path), proposed.byId.get(id) ?? []);
  applyCanonicalFileBatch(lease, replacements);
  return result;
}

function moveLineage(
  cwd: string,
  config: StorageConfig,
  lease: BarrierLease,
  id: string,
  expectedRevision: string,
  destination: DocumentLocation,
): DocumentOperationReport {
  const source: DocumentLocation = destination === 'archive' ? 'active' : 'archive';
  const lineage = requireCompleteLineage(cwd, config, id, expectedRevision, source);
  if (destination === 'archive')
    assertNoCanonicalIssueDocumentReferences(
      cwd,
      lineage.map((entity) => entity.path),
    );
  const replacements: CanonicalFileReplacement[] = [];
  for (const entity of lineage) {
    const target = documentPath(config.root, destination, entity.decoded.metadata);
    replacements.push({ path: target, bytes: entity.decoded.bytes, expectedRevision: null });
    replacements.push({ path: entity.path, expectedRevision: entity.decoded.revision });
  }
  const proposed = proposeCatalog(cwd, config, discover(cwd, config), replacements);
  const result: DocumentOperationReport = {
    id,
    location: destination,
    documents: boundedSummaries(
      (proposed.byId.get(id) ?? []).map((entity) => summary(entity, proposed.byId.get(id) ?? [])),
      'move',
    ),
  };
  assertBoundedResult(result, 'move');
  const journal = startMoveJournal(cwd, config, lease, id, source, destination, lineage);
  try {
    applyCanonicalFileBatch(lease, replacements, {
      interruptAfter: injectedInterruptionPoint(replacements.length),
      preserveOnInterruption: true,
    });
  } catch (error: unknown) {
    if (error instanceof CanonicalBatchInterruption) throw error;
    cleanupMoveJournal(cwd, config, lease, journal);
    throw error;
  }
  cleanupMoveJournal(cwd, config, lease, journal);
  return result;
}

function requireCompleteLineage(
  cwd: string,
  config: StorageConfig,
  id: string,
  expectedRevision: string,
  source: DocumentLocation,
): Entity[] {
  assertId(id, config.prefix);
  const lineage = discover(cwd, config).byId.get(id);
  if (!lineage?.length) throw new DocumentError('schema', `canonical document was not found: ${id}`);
  if (lineage.some((entity) => entity.location !== source))
    throw new DocumentError('identity_ambiguity', `document lineage is not completely ${source}`);
  const current = lineage.at(-1);
  if (!current || current.decoded.revision !== expectedRevision)
    throw new DocumentError('stale_revision', `document ${id} changed since the expected revision was calculated`);
  return lineage;
}

function currentActive(cwd: string, config: StorageConfig, id: string, expectedRevision: string): Entity {
  if (!expectedRevision) throw new DocumentError('stale_revision', 'expected revision is required');
  assertId(id, config.prefix);
  const lineage = discover(cwd, config).byId.get(id);
  if (!lineage?.length || lineage.some((entity) => entity.location !== 'active'))
    throw new DocumentError('schema', `active canonical document was not found: ${id}`);
  const current = lineage.at(-1);
  if (!current || current.decoded.revision !== expectedRevision)
    throw new DocumentError('stale_revision', `document ${id} changed since the expected revision was calculated`);
  return current;
}

function validateUnlocked(cwd: string, config: StorageConfig, id?: string): DocumentValidationReport {
  try {
    if (id) assertId(id, config.prefix);
    const catalog = discover(cwd, config);
    if (id && !catalog.byId.has(id)) throw new DocumentError('schema', `canonical document was not found: ${id}`);
    return { valid: true, findings: [] };
  } catch (error: unknown) {
    return { valid: false, findings: [finding(error, id)] };
  }
}

function discover(cwd: string, config: StorageConfig): Catalog {
  const root = resolve(cwd, config.root);
  assertSafeAncestors(cwd, config.root);
  const entities: Entity[] = [];
  let aggregateBytes = 0;
  for (const location of ['active', 'archive'] as const) {
    const directory = location === 'active' ? root : join(root, 'archive');
    if (!existsSync(directory)) continue;
    assertDirectory(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (location === 'active' && (entry.name === 'archive' || entry.name === '.control')) continue;
      const absolutePath = join(directory, entry.name);
      const path = portableRelative(cwd, absolutePath);
      if (entry.isSymbolicLink()) throw new DocumentError('path_safety', 'symlinks are not permitted', [path]);
      if (!entry.isFile()) throw new DocumentError('path_safety', 'unexpected document storage entry', [path]);
      if (!entry.name.endsWith('.md'))
        throw new DocumentError('path_safety', 'unsupported document storage file', [path]);
      if (entities.length >= MAX_DOCUMENTS)
        throw new DocumentError('resource_limit', 'document file limit exceeded', [path]);
      const bytes = readDocumentFile(absolutePath, path, DOCUMENT_LIMITS.fileBytes);
      aggregateBytes += bytes.byteLength;
      if (aggregateBytes > DOCUMENT_LIMITS.aggregateBytes)
        throw new DocumentError('resource_limit', 'aggregate canonical document byte limit exceeded', [path]);
      const decoded = decodeDocument(bytes);
      assertId(decoded.metadata.id, config.prefix);
      if (canonicalDocumentFilename(decoded.metadata) !== entry.name)
        throw new DocumentError('canonical_form', 'document filename does not match metadata', [path]);
      entities.push({ decoded, path, absolutePath, location });
    }
  }
  return catalogFromEntities(entities, config.prefix);
}

function catalogFromEntities(entities: Entity[], prefix: string): Catalog {
  if (entities.length > DOCUMENT_LIMITS.files)
    throw new DocumentError('resource_limit', 'document file limit exceeded');
  let aggregateBytes = 0;
  const paths = new Set<string>();
  for (const entity of entities) {
    aggregateBytes += entity.decoded.bytes.byteLength;
    if (aggregateBytes > DOCUMENT_LIMITS.aggregateBytes)
      throw new DocumentError('resource_limit', 'aggregate canonical document byte limit exceeded', [entity.path]);
    const pathKey = entity.path.normalize('NFKC').toLocaleLowerCase('en-US');
    if (paths.has(pathKey))
      throw new DocumentError('identity_ambiguity', 'document paths collide under portable comparison', [entity.path]);
    paths.add(pathKey);
  }
  entities.sort((left, right) => compareEntity(left, right, prefix));
  const byId = new Map<string, Entity[]>();
  for (const entity of entities) {
    const values = byId.get(entity.decoded.metadata.id) ?? [];
    values.push(entity);
    byId.set(entity.decoded.metadata.id, values);
  }
  for (const [id, lineage] of byId) validateLineage(id, lineage);
  return { entities, byId };
}

function proposeCatalog(
  cwd: string,
  config: StorageConfig,
  current: Catalog,
  replacements: readonly CanonicalFileReplacement[],
): Catalog {
  const byPath = new Map(current.entities.map((entity) => [entity.path, entity]));
  const portablePaths = new Set(current.entities.map((entity) => portablePathKey(entity.path)));
  for (const replacement of replacements) {
    const existing = byPath.get(replacement.path);
    if (replacement.expectedRevision === null && existing)
      throw new DocumentError('identity_ambiguity', `canonical destination already exists: ${replacement.path}`);
    if (
      typeof replacement.expectedRevision === 'string' &&
      (!existing || existing.decoded.revision !== replacement.expectedRevision)
    )
      throw new DocumentError('stale_revision', `canonical file has a stale revision: ${replacement.path}`);
    if (replacement.bytes === undefined) {
      if (existing) {
        byPath.delete(replacement.path);
        portablePaths.delete(portablePathKey(replacement.path));
      }
      continue;
    }
    const decoded = decodeDocument(replacement.bytes);
    assertId(decoded.metadata.id, config.prefix);
    const activePath = documentPath(config.root, 'active', decoded.metadata);
    const archivePath = documentPath(config.root, 'archive', decoded.metadata);
    const location =
      replacement.path === activePath ? 'active' : replacement.path === archivePath ? 'archive' : undefined;
    if (!location)
      throw new DocumentError('path_safety', 'proposed document path does not match canonical metadata', [
        replacement.path,
      ]);
    const key = portablePathKey(replacement.path);
    if (!existing && portablePaths.has(key))
      throw new DocumentError('identity_ambiguity', 'proposed document path collides under portable comparison', [
        replacement.path,
      ]);
    portablePaths.add(key);
    byPath.set(replacement.path, {
      decoded,
      path: replacement.path,
      absolutePath: safeManagedPath(cwd, replacement.path),
      location,
    });
  }
  return catalogFromEntities([...byPath.values()], config.prefix);
}

function requireProposedEntity(catalog: Catalog, path: string): Entity {
  const entity = catalog.entities.find((candidate) => candidate.path === path);
  if (!entity) throw new DocumentError('identity_ambiguity', `proposed document is missing: ${path}`);
  return entity;
}

function portablePathKey(path: string): string {
  return path.normalize('NFKC').toLocaleLowerCase('en-US');
}

function validateLineage(id: string, lineage: Entity[]): void {
  if (lineage.length > DOCUMENT_LIMITS.versions)
    throw new DocumentError('resource_limit', `document lineage version limit exceeded: ${id}`);
  const locations = new Set(lineage.map((entity) => entity.location));
  if (locations.size !== 1)
    throw new DocumentError('identity_ambiguity', `document lineage spans active and archive: ${id}`);
  const versions = lineage.map((entity) => entity.decoded.metadata.version);
  if (new Set(versions).size !== versions.length || versions.some((version, index) => version !== index + 1))
    throw new DocumentError('identity_ambiguity', `document lineage has duplicate or missing versions: ${id}`);
  const createdAt = lineage[0]?.decoded.metadata.created_at;
  if (lineage.some((entity) => entity.decoded.metadata.created_at !== createdAt))
    throw new DocumentError('schema', `document lineage created_at is inconsistent: ${id}`);
}

function changedMetadata(
  current: CanonicalDocumentMetadata,
  changes: DocumentChanges,
  clock: () => Date,
  newVersion: boolean,
): CanonicalDocumentMetadata {
  return {
    ...current,
    title: changes.title === undefined ? current.title : required(changes.title, 'title'),
    kind: changes.kind === undefined ? current.kind : choice(changes.kind, DOCUMENT_KINDS, 'kind'),
    status: changes.status === undefined ? current.status : choice(changes.status, DOCUMENT_STATUSES, 'status'),
    version: newVersion ? current.version + 1 : current.version,
    updated_at: canonicalTimestamp(clock()),
    ...(changes.author === undefined
      ? {}
      : optional(changes.author)
        ? { created_by: optional(changes.author) }
        : { created_by: undefined }),
    ...(changes.metadata === undefined ? {} : { metadata: changes.metadata ?? undefined }),
  };
}

function record(entity: Entity, lineage: readonly Entity[]): DocumentRecord {
  const current = lineage.at(-1)?.decoded.metadata.version ?? entity.decoded.metadata.version;
  const result: DocumentRecord = {
    id: entity.decoded.metadata.id,
    path: entity.path,
    metadata: structuredClone(entity.decoded.metadata),
    body: entity.decoded.body,
    revision: entity.decoded.revision,
    location: entity.location,
    superseded: entity.decoded.metadata.version < current,
    archived: entity.location === 'archive',
  };
  assertBoundedResult(result, 'document');
  return result;
}

function summary(entity: Entity, lineage: readonly Entity[]): DocumentSummary {
  const current = lineage.at(-1)?.decoded.metadata.version ?? entity.decoded.metadata.version;
  return {
    id: entity.decoded.metadata.id,
    path: entity.path,
    revision: entity.decoded.revision,
    location: entity.location,
    superseded: entity.decoded.metadata.version < current,
    archived: entity.location === 'archive',
    title: entity.decoded.metadata.title,
    kind: entity.decoded.metadata.kind,
    status: entity.decoded.metadata.status,
    version: entity.decoded.metadata.version,
  };
}

interface MoveJournalEntry {
  source: string;
  destination: string;
  backup: string;
  revision: string;
}

interface MoveJournal {
  version: 1;
  id: string;
  source: DocumentLocation;
  destination: DocumentLocation;
  entries: MoveJournalEntry[];
  revision: string;
}

function startMoveJournal(
  cwd: string,
  config: StorageConfig,
  lease: BarrierLease,
  id: string,
  source: DocumentLocation,
  destination: DocumentLocation,
  lineage: readonly Entity[],
): MoveJournal {
  cleanupOrphanBackups(cwd, config, lease);
  const entries = lineage.map((entity, index) => ({
    source: entity.path,
    destination: documentPath(config.root, destination, entity.decoded.metadata),
    backup: `${config.root}/${BACKUP_ROOT}/${String(index + 1).padStart(3, '0')}.md`,
    revision: entity.decoded.revision,
  }));
  const value = { version: 1 as const, id, source, destination, entries };
  const bytes = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  if (bytes.byteLength > DOCUMENT_LIMITS.journalBytes)
    throw new DocumentError('resource_limit', 'document transaction journal byte limit exceeded');
  applyCanonicalFileBatch(
    lease,
    entries.map((entry, index) => ({
      path: entry.backup,
      bytes: lineage[index]?.decoded.bytes,
      expectedRevision: null,
    })),
  );
  const path = `${config.root}/${JOURNAL_PATH}`;
  try {
    applyCanonicalFileBatch(lease, [{ path, bytes, expectedRevision: null }]);
  } catch (error: unknown) {
    cleanupBackupEntries(lease, entries);
    throw error;
  }
  return { ...value, revision: computeDocumentRevision(bytes) };
}

function recoverDocumentTransaction(cwd: string, config: StorageConfig, lease: BarrierLease): void {
  const temporaryFiles = documentPublicationTempReplacements(cwd, config);
  const path = `${config.root}/${JOURNAL_PATH}`;
  const absolute = resolve(cwd, path);
  const overlay = new Map<string, Uint8Array | undefined>(
    temporaryFiles.map((replacement) => [replacement.path, undefined]),
  );
  if (!existsSync(absolute)) {
    const orphanBackups = orphanBackupReplacements(cwd, config);
    assertCanonicalIssueGraph(cwd, overlay);
    if (!temporaryFiles.length && !orphanBackups.length) return;
    loadLocalSnapshot(lease, overlay);
    if (temporaryFiles.length) applyCanonicalFileBatch(lease, temporaryFiles);
    if (orphanBackups.length) applyCanonicalFileBatch(lease, orphanBackups);
    return;
  }
  const bytes = readBoundedManagedFile(cwd, path, DOCUMENT_LIMITS.journalBytes);
  const journal = decodeMoveJournal(bytes, config);
  const replacements: CanonicalFileReplacement[] = [];
  for (const entry of journal.entries) {
    const backup = readBoundedManagedFile(cwd, entry.backup, DOCUMENT_LIMITS.fileBytes);
    const decoded = decodeDocument(backup);
    if (decoded.metadata.id !== journal.id || decoded.revision !== entry.revision)
      throw new DocumentError('filesystem_durability', 'document transaction backup does not match journal');
    if (
      entry.source !== documentPath(config.root, journal.source, decoded.metadata) ||
      entry.destination !== documentPath(config.root, journal.destination, decoded.metadata)
    )
      throw new DocumentError('path_safety', 'document transaction journal contains mismatched paths');
    const sourceRevision = optionalFileRevision(cwd, entry.source);
    if (sourceRevision !== undefined && sourceRevision !== entry.revision)
      throw new DocumentError('filesystem_durability', 'document transaction source changed during recovery');
    const destinationRevision = optionalFileRevision(cwd, entry.destination);
    if (destinationRevision !== undefined && destinationRevision !== entry.revision)
      throw new DocumentError('filesystem_durability', 'document transaction destination changed during recovery');
    replacements.push({
      path: entry.source,
      bytes: backup,
      expectedRevision: sourceRevision ?? null,
    });
    overlay.set(entry.source, backup);
    if (destinationRevision !== undefined)
      replacements.push({ path: entry.destination, expectedRevision: destinationRevision });
    overlay.set(entry.destination, undefined);
  }
  assertCanonicalIssueGraph(cwd, overlay);
  loadLocalSnapshot(lease, overlay);
  if (temporaryFiles.length) applyCanonicalFileBatch(lease, temporaryFiles);
  applyCanonicalFileBatch(lease, replacements);
  cleanupMoveJournal(cwd, config, lease, journal);
}

function documentPublicationTempReplacements(cwd: string, config: StorageConfig): CanonicalFileReplacement[] {
  const directories = [
    config.root,
    `${config.root}/archive`,
    `${config.root}/.control`,
    `${config.root}/${BACKUP_ROOT}`,
  ];
  const replacements: CanonicalFileReplacement[] = [];
  let scannedEntries = 0;
  for (const directory of directories) {
    const absolute = safeManagedPath(cwd, directory);
    if (!existsSync(absolute)) continue;
    assertDirectory(absolute);
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      scannedEntries += 1;
      if (scannedEntries > DOCUMENT_LIMITS.files + DOCUMENT_LIMITS.versions + 32)
        throw new DocumentError('resource_limit', 'document publication temp scan limit exceeded');
      if (!DOCUMENT_PUBLICATION_TEMP_FILENAME_PATTERN.test(entry.name)) continue;
      const path = `${directory}/${entry.name}`;
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new DocumentError('path_safety', 'document publication temp path is unsafe', [path]);
      if (replacements.length >= DOCUMENT_LIMITS.versions + 4)
        throw new DocumentError('resource_limit', 'document publication temp file limit exceeded');
      const bytes = readBoundedManagedFile(cwd, path, DOCUMENT_LIMITS.fileBytes);
      replacements.push({ path, expectedRevision: computeDocumentRevision(bytes) });
    }
  }
  return replacements;
}

function decodeMoveJournal(bytes: Uint8Array, config: StorageConfig): MoveJournal {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentError('parse_safety', 'document transaction journal must be UTF-8');
  }
  const document = parseDocument(text, { uniqueKeys: true, strict: true });
  if (document.errors.length || document.warnings.length)
    throw new DocumentError('parse_safety', 'document transaction journal is malformed');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new DocumentError('parse_safety', 'document transaction journal must be strict JSON');
  }
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'id', 'source', 'destination', 'entries']))
    throw new DocumentError('schema', 'document transaction journal has invalid fields');
  assertId(String(value.id), config.prefix);
  if (value.version !== 1 || !['active', 'archive'].includes(String(value.source)))
    throw new DocumentError('schema', 'document transaction journal has invalid identity');
  if (!['active', 'archive'].includes(String(value.destination)) || value.source === value.destination)
    throw new DocumentError('schema', 'document transaction journal has invalid locations');
  if (!Array.isArray(value.entries) || !value.entries.length || value.entries.length > DOCUMENT_LIMITS.versions)
    throw new DocumentError('resource_limit', 'document transaction journal entry limit exceeded');
  const entries = value.entries.map((item, index): MoveJournalEntry => {
    if (!isRecord(item) || !hasExactKeys(item, ['source', 'destination', 'backup', 'revision']))
      throw new DocumentError('schema', 'document transaction journal entry is invalid');
    for (const key of ['source', 'destination', 'backup', 'revision'] as const)
      if (typeof item[key] !== 'string')
        throw new DocumentError('schema', 'document transaction journal value is invalid');
    const backup = `${config.root}/${BACKUP_ROOT}/${String(index + 1).padStart(3, '0')}.md`;
    if (item.backup !== backup || !/^v1:[a-f0-9]{64}$/u.test(item.revision as string))
      throw new DocumentError('path_safety', 'document transaction journal backup is invalid');
    assertPathUnderDocumentRoot(config.root, item.source as string);
    assertPathUnderDocumentRoot(config.root, item.destination as string);
    return item as unknown as MoveJournalEntry;
  });
  const result: MoveJournal = {
    version: 1,
    id: value.id as string,
    source: value.source as DocumentLocation,
    destination: value.destination as DocumentLocation,
    entries,
    revision: computeDocumentRevision(bytes),
  };
  const canonical = { ...result } as Record<string, unknown>;
  delete canonical.revision;
  if (text !== `${JSON.stringify(canonical)}\n`)
    throw new DocumentError('canonical_form', 'document transaction journal is not canonical');
  return result;
}

function cleanupMoveJournal(_cwd: string, config: StorageConfig, lease: BarrierLease, journal: MoveJournal): void {
  const interruptionPoint = injectedCleanupInterruptionPoint(journal.entries.length + 1);
  if (interruptionPoint === 0) throw new CanonicalBatchInterruption();
  applyCanonicalFileBatch(lease, [{ path: `${config.root}/${JOURNAL_PATH}`, expectedRevision: journal.revision }], {
    interruptAfter: interruptionPoint === 1 ? 1 : undefined,
    preserveOnInterruption: true,
  });
  applyCanonicalFileBatch(
    lease,
    journal.entries.map((entry) => ({ path: entry.backup, expectedRevision: entry.revision })),
    {
      interruptAfter: interruptionPoint !== undefined && interruptionPoint > 1 ? interruptionPoint - 1 : undefined,
      preserveOnInterruption: true,
    },
  );
}

function cleanupOrphanBackups(cwd: string, config: StorageConfig, lease: BarrierLease): void {
  const replacements = orphanBackupReplacements(cwd, config);
  if (replacements.length) applyCanonicalFileBatch(lease, replacements);
}

function orphanBackupReplacements(cwd: string, config: StorageConfig): CanonicalFileReplacement[] {
  const root = `${config.root}/${BACKUP_ROOT}`;
  const absolute = resolve(cwd, root);
  if (!existsSync(absolute)) return [];
  assertDirectory(absolute);
  const entries = readdirSync(absolute).sort(compare);
  if (entries.length > DOCUMENT_LIMITS.versions)
    throw new DocumentError('resource_limit', 'orphan document transaction backup limit exceeded');
  return entries
    .filter((name) => !DOCUMENT_PUBLICATION_TEMP_FILENAME_PATTERN.test(name))
    .map((name) => {
      if (!/^\d{3}\.md$/u.test(name))
        throw new DocumentError('path_safety', 'unexpected document transaction backup path');
      const path = `${root}/${name}`;
      const bytes = readBoundedManagedFile(cwd, path, DOCUMENT_LIMITS.fileBytes);
      return { path, expectedRevision: computeDocumentRevision(bytes) };
    });
}

function cleanupBackupEntries(lease: BarrierLease, entries: readonly MoveJournalEntry[]): void {
  applyCanonicalFileBatch(
    lease,
    entries.map((entry) => ({ path: entry.backup, expectedRevision: entry.revision })),
  );
}

function readBoundedManagedFile(cwd: string, path: string, limit: number): Uint8Array {
  const absolute = safeManagedPath(cwd, path);
  if (!existsSync(absolute))
    throw new DocumentError('filesystem_durability', `managed transaction file is missing: ${path}`);
  return readDocumentFile(absolute, path, limit);
}

function readDocumentFile(absolute: string, path: string, limit: number): Uint8Array {
  try {
    return readBoundedNoFollowFile(absolute, path, limit);
  } catch (error: unknown) {
    if (!(error instanceof LocalPersistenceError)) throw error;
    const category = error.category === 'resource_limit' ? 'resource_limit' : 'path_safety';
    throw new DocumentError(category, error.message, [path]);
  }
}

function optionalFileRevision(cwd: string, path: string): string | undefined {
  const absolute = safeManagedPath(cwd, path);
  if (!existsSync(absolute)) return undefined;
  return computeDocumentRevision(readBoundedManagedFile(cwd, path, DOCUMENT_LIMITS.fileBytes));
}

function safeManagedPath(root: string, value: string): string {
  safePath(value);
  const absolute = resolve(root, value);
  portableRelative(root, absolute);
  let current = resolve(root);
  for (const part of value.split('/').slice(0, -1)) {
    current = join(current, part);
    if (existsSync(current)) assertDirectory(current);
  }
  return absolute;
}

function assertPathUnderDocumentRoot(root: string, value: string): void {
  safePath(value);
  if (!value.startsWith(`${root}/`) || value.startsWith(`${root}/.control/`))
    throw new DocumentError('path_safety', 'document transaction path is outside canonical records');
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort(compare).join('\0') === [...keys].sort(compare).join('\0');
}

function injectedInterruptionPoint(maximum: number): number | undefined {
  const value = process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
  if (value === undefined) return undefined;
  const point = Number(value);
  if (!Number.isInteger(point) || point < 1 || point > maximum)
    throw new DocumentError('configuration', 'injected document interruption point is invalid');
  return point;
}

function injectedCleanupInterruptionPoint(maximum: number): number | undefined {
  const value = process.env.HARNESSCTL_TEST_DOCUMENT_CLEANUP_INTERRUPT_AFTER;
  if (value === undefined) return undefined;
  const point = Number(value);
  if (!Number.isInteger(point) || point < 0 || point > maximum)
    throw new DocumentError('configuration', 'injected document cleanup interruption point is invalid');
  return point;
}

function boundedSummaries(values: DocumentSummary[], operation: string): DocumentSummary[] {
  if (values.length > DOCUMENT_LIMITS.listResults)
    throw new DocumentError('resource_limit', `${operation} result count limit exceeded`);
  if (JSON.stringify(values).length > DOCUMENT_LIMITS.resultChars)
    throw new DocumentError('resource_limit', `${operation} result character limit exceeded`);
  return values;
}

function assertBoundedResult(value: unknown, operation: string): void {
  if (JSON.stringify(value).length > DOCUMENT_LIMITS.resultChars)
    throw new DocumentError('resource_limit', `${operation} result character limit exceeded`);
}

interface StorageConfig {
  root: string;
  prefix: string;
}

function localDocumentConfig(cwd: string, operation: string): StorageConfig {
  const config = readConfig(cwd);
  if (config instanceof ConfigError) throw new DocumentError('configuration', config.message);
  if (!isRecord(config.skills.documents))
    throw new DocumentError('configuration', 'documents configuration must be a mapping');
  const documents = config.skills.documents;
  if (documents.enabled !== true)
    throw new DocumentError(
      'configuration',
      `${operation} requires skills.documents.enabled=true; the local Documents capability is disabled.`,
    );
  if (documents.provider.type !== 'filesystem')
    throw new DocumentError(
      'configuration',
      `${operation} cannot use harnessctl local document tools with skills.documents.provider.type=${documents.provider.type}; remote document behavior is provider-owned.`,
    );
  if (typeof documents.root !== 'string' || typeof documents.prefix !== 'string')
    throw new DocumentError('configuration', 'filesystem Documents root and prefix are required');
  return { root: documents.root, prefix: documents.prefix };
}

function assertLocalDocumentCapability(cwd: string, operation: string): void {
  localDocumentConfig(cwd, operation);
}

function documentPath(root: string, location: DocumentLocation, metadata: CanonicalDocumentMetadata): string {
  return `${root}/${location === 'archive' ? 'archive/' : ''}${canonicalDocumentFilename(metadata)}`;
}
function documentContent(entity: Entity): string {
  return entity.decoded.body.slice(`# ${entity.decoded.metadata.title}\n\n`.length).trimEnd();
}
function parseDocumentIdWithPrefix(text: string, prefix: string): string {
  const identity = prefixedIdentityPattern(prefix, 5).source.slice(1, -1);
  const matches = [...text.matchAll(new RegExp(`(?<![A-Za-z0-9_-])${identity}(?![A-Za-z0-9_-])`, 'gu'))];
  const ids = new Set(matches.map((match) => match[0]));
  if (ids.size !== 1)
    throw new DocumentError(
      'identity_ambiguity',
      ids.size === 0 ? 'text does not contain a canonical document ID' : 'text contains multiple document IDs',
    );
  return [...ids][0] ?? '';
}
function assertId(id: string, prefix: string): void {
  if (!prefixedIdentityPattern(prefix, 5).test(id))
    throw new DocumentError('schema', 'document ID must match the fixed prefix and a legacy numeric or ULID suffix');
}
function choice<T extends readonly string[]>(value: string, values: T, field: string): T[number] {
  const normalized = value.trim().toLowerCase();
  if (!values.includes(normalized)) throw new DocumentError('schema', `invalid document ${field}: ${value}`);
  return normalized as T[number];
}
function required(value: string, field: string): string {
  const result = value.trim();
  if (!result || result.includes('\0') || result.includes('\n'))
    throw new DocumentError('schema', `${field} is invalid`);
  return result;
}
function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
function canonicalTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new DocumentError('configuration', 'document clock is invalid');
  return value.toISOString();
}
function safePath(value: string): void {
  if (
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new DocumentError('configuration', 'document root must be a safe project-relative path');
}
function assertSafeAncestors(cwd: string, value: string): void {
  let current = resolve(cwd);
  for (const part of value.split('/')) {
    current = join(current, part);
    if (existsSync(current)) assertDirectory(current);
  }
}
function assertDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new DocumentError('path_safety', 'document root must use non-symlink directories');
}
function portableRelative(root: string, path: string): string {
  const result = relative(resolve(root), path);
  if (!result || result === '..' || result.startsWith(`..${sep}`))
    throw new DocumentError('path_safety', 'document path escapes repository');
  return result.split(sep).join('/');
}
function compareEntity(left: Entity, right: Entity, prefix: string): number {
  return (
    comparePrefixedIdentities(left.decoded.metadata.id, right.decoded.metadata.id, prefix) ||
    left.decoded.metadata.version - right.decoded.metadata.version
  );
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function finding(error: unknown, id?: string): DocumentValidationReport['findings'][number] {
  return {
    ...(id ? { document: id } : {}),
    ...(error instanceof DocumentError && error.paths?.[0] ? { path: error.paths[0] } : {}),
    category: error instanceof DocumentError ? error.category : 'parse_safety',
    message: error instanceof Error ? error.message : String(error),
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
