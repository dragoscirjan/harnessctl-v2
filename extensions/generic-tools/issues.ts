import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ConfigError, getConfigValue, readConfig } from './config.js';
import { DOCUMENT_LIMITS, canonicalDocumentFilename, decodeDocument } from './documents-contract.js';
import {
  ISSUE_CONTRACT_VERSION,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  IssueError,
  canonicalIssueFilename,
  computeIssueRevision,
  decodeIssueDocument,
  encodeCanonicalIssue,
  normalizeIssueMetadata,
  parseIssueMetadataText,
  type CanonicalIssueComment,
  type CanonicalIssueDocument,
  type CanonicalIssueStatus,
  type CanonicalIssueType,
  type DecodeIssueOptions,
  type DecodedIssueDocument,
  type IssueLocation,
  type IssueMetadataText,
} from './issues-contract.js';
import {
  applyIssueFileBatch,
  discoverIssueStorage,
  resolveIssueCandidate,
  validateIssueRoot,
  withIssueBarrier,
  type BarrierLease,
  type FileReplacement,
  type IssueStorageCandidate,
  type IssueStorageCatalog,
} from './issues-storage.js';
import {
  ensureLocalCache,
  loadLocalSnapshot,
  LocalPersistenceError,
  readBoundedNoFollowFile,
  synchronizeLocalCache,
  type BoundedNoFollowReadOptions,
  type DocumentSnapshotOverlay,
} from './local-persistence.js';

export { ISSUE_STATUSES, ISSUE_TYPES };
export type IssueType = CanonicalIssueType;
export type IssueStatus = CanonicalIssueStatus;
export type Relationship = 'depends_on' | 'blocks' | 'relates_to' | 'duplicates' | 'supersedes';

export interface CreateIssueOptions {
  type: string;
  title: string;
  status?: string;
  parent?: string;
  depends?: string;
  author?: string;
  assignee?: string;
  metadata?: Record<string, unknown>;
  /** Compatibility boundary for adapters that accept metadata as JSON text. */
  metadataText?: IssueMetadataText;
}

export interface ListIssueOptions {
  status?: string;
  type?: string;
}

export interface Issue {
  id: string;
  path: string;
  metadata: Record<string, unknown>;
  body: string;
  revision: string;
  version: typeof ISSUE_CONTRACT_VERSION;
  comments: CanonicalIssueComment[];
  location: IssueLocation;
}

export interface IssueSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  path: string;
  revision: string;
}

export interface IssueUpdateChanges {
  type?: string;
  title?: string;
  status?: string;
  author?: string;
  assignee?: string;
  parent?: string | null;
  body?: string;
  sections?: Record<string, string>;
  expectedRevision: string;
}

export interface IssueComment {
  id: string;
  issue: string;
  path: string;
  created_at: string;
  created_by: string;
  body: string;
  revision: string;
}

export interface ValidationFinding {
  issue?: string;
  severity: 'error' | 'warning';
  message: string;
  category?: IssueError['category'];
  path?: string;
  field?: string;
  remedy?: string;
  transactionId?: string;
}

export interface ValidationReport {
  valid: boolean;
  findings: ValidationFinding[];
}

export interface ArchiveReport {
  archived: string[];
  skipped: string[];
  location: string;
  revisions?: Record<string, string>;
  transactionId?: string;
}

export interface FilesystemIssueProviderOptions {
  clock?: () => Date;
  lockWaitMs?: number;
  transactionId?: () => string;
  /** Deterministic test seam for canonical document-link descriptor reads. */
  documentReadOptions?: BoundedNoFollowReadOptions;
}

export interface FilesystemIssueProvider {
  parseIds(prompt: string): string[];
  parseId(prompt: string): string;
  create(options: CreateIssueOptions): Issue;
  get(id: string): Issue;
  list(options?: ListIssueOptions): IssueSummary[];
  update(id: string, changes: IssueUpdateChanges): Issue;
  transition(id: string, status: string, expectedRevision: string): Issue;
  appendComment(id: string, body: string, author: string): IssueComment;
  relate(id: string, relationship: string, targetId: string): Issue;
  unrelate(id: string, relationship: string, targetId: string): Issue;
  linkDocument(id: string, documentPath: string, kind?: string): Issue;
  validate(id?: string): ValidationReport;
  archiveTree(id: string): ArchiveReport;
  discover(): IssueStorageCatalog;
  decode(source: string | Uint8Array, options?: Omit<DecodeIssueOptions, 'issuePrefix'>): DecodedIssueDocument;
}

interface Entity {
  issue: CanonicalIssueDocument;
  path: string;
  revision: string;
  location: IssueLocation;
}

interface DerivedReferences {
  children: string[];
  blocks: string[];
  blocked_by: string[];
  relates_to: string[];
  duplicates: string[];
}

const ALLOWED_PARENT_TYPES: Record<IssueType, readonly IssueType[]> = {
  initiative: [],
  epic: ['initiative'],
  story: ['epic', 'initiative'],
  task: ['story', 'epic'],
  bug: ['story', 'task', 'epic'],
};
const RELATIONSHIPS: readonly Relationship[] = ['depends_on', 'blocks', 'relates_to', 'duplicates', 'supersedes'];
const MAX_FINDINGS = 100;

export function createFilesystemIssueProvider(
  cwd: string,
  options: FilesystemIssueProviderOptions = {},
): FilesystemIssueProvider {
  assertLocalIssueProvider(cwd, 'createFilesystemIssueProvider');
  return buildFilesystemIssueProvider(cwd, options);
}

function buildFilesystemIssueProvider(
  cwd: string,
  options: FilesystemIssueProviderOptions = {},
): FilesystemIssueProvider {
  const { prefix, issueRoot } = getIssueStorageConfig(cwd);
  const clock = options.clock ?? (() => new Date());
  const locked = <T>(name: string, operation: (lease: BarrierLease) => T, mutation = false): T => {
    assertLocalIssueProvider(cwd, name);
    return withIssueBarrier(
      cwd,
      (lease) => {
        assertValidForMutation(cwd, prefix, issueRoot, options.documentReadOptions);
        const snapshot = loadLocalSnapshot(lease);
        ensureLocalCache(lease, snapshot);
        const result = operation(lease);
        if (mutation) synchronizeLocalCache(lease, loadLocalSnapshot(lease), () => loadLocalSnapshot(lease));
        return result;
      },
      options.lockWaitMs,
    );
  };
  const token = options.transactionId ?? (() => randomBytes(16).toString('hex'));
  return {
    parseIds: (prompt) => parseIdsWithPrefix(prompt, prefix),
    parseId: (prompt) => parseIdsWithPrefix(prompt, prefix)[0] ?? '',
    create: (input) =>
      locked('createIssueRecord', (lease) => createUnlocked(cwd, prefix, issueRoot, clock, lease, input), true),
    get: (id) => locked('getIssue', () => getUnlocked(cwd, prefix, issueRoot, id)),
    list: (input = {}) => locked('listIssueSummaries', () => listUnlocked(cwd, prefix, issueRoot, input)),
    update: (id, changes) =>
      locked('updateIssue', (lease) => updateUnlocked(cwd, prefix, issueRoot, clock, lease, id, changes), true),
    transition: (id, status, expectedRevision) =>
      locked(
        'transitionIssue',
        (lease) => updateUnlocked(cwd, prefix, issueRoot, clock, lease, id, { status, expectedRevision }),
        true,
      ),
    appendComment: (id, body, author) =>
      locked('commentIssue', (lease) => commentUnlocked(cwd, prefix, issueRoot, clock, lease, id, body, author), true),
    relate: (id, relationship, targetId) =>
      locked(
        'relateIssue',
        (lease) => relationshipUnlocked(cwd, prefix, issueRoot, clock, lease, id, relationship, targetId, true),
        true,
      ),
    unrelate: (id, relationship, targetId) =>
      locked(
        'unrelateIssue',
        (lease) => relationshipUnlocked(cwd, prefix, issueRoot, clock, lease, id, relationship, targetId, false),
        true,
      ),
    linkDocument: (id, path, kind) =>
      locked(
        'linkDocument',
        (lease) => linkUnlocked(cwd, prefix, issueRoot, clock, lease, id, path, kind, options.documentReadOptions),
        true,
      ),
    validate: (id) =>
      locked('validateIssues', (lease) => {
        const report = validateUnlocked(cwd, prefix, issueRoot, id, options.documentReadOptions);
        if (!report.valid) return report;
        let snapshot;
        try {
          snapshot = loadLocalSnapshot(lease);
        } catch {
          return report;
        }
        ensureLocalCache(lease, snapshot);
        return report;
      }),
    archiveTree: (id) =>
      locked('archiveIssueReport', (lease) => archiveUnlocked(cwd, prefix, issueRoot, lease, id, token()), true),
    discover: () => locked('discoverIssues', () => discoverCanonical(cwd, prefix, issueRoot)),
    decode: (source, decodeOptions = {}) => decodeIssueDocument(source, { ...decodeOptions, issuePrefix: prefix }),
  };
}

export function parseIssueIds(prompt: string, cwd = process.cwd()): string[] {
  assertLocalIssueProvider(cwd, 'parseIssueIds');
  const prefix = readIssuePrefix(cwd);
  return prefix === undefined ? [] : parseIdsWithPrefix(prompt, prefix);
}

export function parseIssueId(prompt: string, cwd = process.cwd()): string {
  assertLocalIssueProvider(cwd, 'parseIssueId');
  const prefix = readIssuePrefix(cwd);
  return prefix === undefined ? '' : (parseIdsWithPrefix(prompt, prefix)[0] ?? '');
}

export function createIssueRecord(cwd: string, options: CreateIssueOptions): Issue {
  assertLocalIssueProvider(cwd, 'createIssueRecord');
  return buildFilesystemIssueProvider(cwd).create(options);
}

export function getIssue(cwd: string, id: string): Issue {
  assertLocalIssueProvider(cwd, 'getIssue');
  return buildFilesystemIssueProvider(cwd).get(id);
}

export function listIssueSummaries(cwd: string, options: ListIssueOptions = {}): IssueSummary[] {
  assertLocalIssueProvider(cwd, 'listIssueSummaries');
  return buildFilesystemIssueProvider(cwd).list(options);
}

export function updateIssue(cwd: string, id: string, changes: IssueUpdateChanges): Issue {
  assertLocalIssueProvider(cwd, 'updateIssue');
  return buildFilesystemIssueProvider(cwd).update(id, changes);
}

export function transitionIssue(cwd: string, id: string, status: string, expectedRevision: string): Issue {
  assertLocalIssueProvider(cwd, 'transitionIssue');
  return buildFilesystemIssueProvider(cwd).transition(id, status, expectedRevision);
}

export function commentIssue(cwd: string, id: string, body: string, author: string): IssueComment {
  assertLocalIssueProvider(cwd, 'commentIssue');
  return buildFilesystemIssueProvider(cwd).appendComment(id, body, author);
}

export function relateIssue(cwd: string, id: string, relationship: string, targetId: string): Issue {
  assertLocalIssueProvider(cwd, 'relateIssue');
  return buildFilesystemIssueProvider(cwd).relate(id, relationship, targetId);
}

export function unrelateIssue(cwd: string, id: string, relationship: string, targetId: string): Issue {
  assertLocalIssueProvider(cwd, 'unrelateIssue');
  return buildFilesystemIssueProvider(cwd).unrelate(id, relationship, targetId);
}

export function linkDocument(cwd: string, id: string, documentPath: string, kind?: string): Issue {
  assertLocalIssueProvider(cwd, 'linkDocument');
  return buildFilesystemIssueProvider(cwd).linkDocument(id, documentPath, kind);
}

export function validateIssues(cwd: string, id?: string): ValidationReport {
  try {
    assertLocalIssueProvider(cwd, 'validateIssues');
    return buildFilesystemIssueProvider(cwd).validate(id);
  } catch (error: unknown) {
    return { valid: false, findings: [findingFromError(error, id)] };
  }
}

/** Internal cross-domain validation used before a shared local-cache projection. */
export function validateCanonicalIssueGraph(cwd: string, documentOverlay?: DocumentSnapshotOverlay): ValidationReport {
  try {
    const config = readConfig(cwd);
    if (config instanceof ConfigError) throw config;
    if (
      config.skills.issues === null ||
      typeof config.skills.issues !== 'object' ||
      Array.isArray(config.skills.issues) ||
      !isFilesystemIssueConfig(config.skills.issues)
    )
      return { valid: true, findings: [] };
    const { prefix, issueRoot } = getIssueStorageConfig(cwd);
    return validateUnlocked(cwd, prefix, issueRoot, undefined, undefined, documentOverlay);
  } catch (error: unknown) {
    return { valid: false, findings: [findingFromError(error)] };
  }
}

/** Rejects a document mutation while any active or archived canonical issue links a blocked path. */
export function assertNoCanonicalIssueDocumentReferences(cwd: string, blockedPaths: readonly string[]): void {
  const config = readConfig(cwd);
  if (config instanceof ConfigError) throw config;
  if (!isFilesystemIssueConfig(config.skills.issues)) return;
  const { prefix, issueRoot } = getIssueStorageConfig(cwd);
  const report = validateUnlocked(cwd, prefix, issueRoot);
  if (!report.valid)
    throw new IssueError('domain_invariant', 'cannot mutate a document while the canonical issue graph is invalid');
  const blocked = new Set(blockedPaths);
  const references: Array<{ issue: string; path: string }> = [];
  for (const entity of orderedEntities(globalEntityMap(discoverCanonical(cwd, prefix, issueRoot))))
    for (const path of entity.issue.documents ?? [])
      if (blocked.has(path)) references.push({ issue: entity.issue.id, path });
  if (references.length)
    throw new IssueError(
      'domain_invariant',
      `document path is linked by canonical issue(s): ${sortedUnique(references.map(({ issue }) => issue)).join(', ')}`,
      {
        issueIds: sortedUnique(references.map(({ issue }) => issue)),
        paths: sortedUnique(references.map(({ path }) => path)),
      },
    );
}

export function archiveIssueReport(cwd: string, id: string): ArchiveReport {
  assertLocalIssueProvider(cwd, 'archiveIssueReport');
  return buildFilesystemIssueProvider(cwd).archiveTree(id);
}

function createUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  clock: () => Date,
  lease: BarrierLease,
  options: CreateIssueOptions,
): Issue {
  const storage = discoverCanonical(cwd, prefix, issueRoot, true);
  assertValidForMutation(cwd, prefix, issueRoot);
  const type = normalizeChoice(options.type, ISSUE_TYPES, 'type');
  const title = requireTrimmed(options.title, 'title');
  const status = normalizeChoice(options.status ?? 'open', ISSUE_STATUSES, 'status');
  if (options.metadata !== undefined && options.metadataText !== undefined)
    throw new IssueError('schema', 'metadata and metadataText cannot both be supplied');
  const metadata =
    options.metadataText !== undefined
      ? parseIssueMetadataText(options.metadataText)
      : options.metadata !== undefined
        ? normalizeIssueMetadata(options.metadata)
        : undefined;
  const parent = normalizeIssueId(options.parent, prefix, 'parent');
  const dependencies = parseReferences(options.depends, prefix, 'depends');
  const entities = activeEntityMap(storage);
  for (const dependency of dependencies) requireActiveEntity(entities, dependency);
  if (parent) validateParentType(requireActiveEntity(entities, parent), type);
  const id = allocateIssueId(storage, prefix);
  const timestamp = canonicalTimestamp(clock());
  const issue: CanonicalIssueDocument = {
    version: ISSUE_CONTRACT_VERSION,
    id,
    type,
    title,
    status,
    created_at: timestamp,
    updated_at: timestamp,
    ...(cleanOptional(options.author) ? { created_by: cleanOptional(options.author) } : {}),
    ...(cleanOptional(options.assignee) ? { assigned_to: cleanOptional(options.assignee) } : {}),
    ...(parent ? { parent } : {}),
    ...(dependencies.length ? { depends_on: dependencies } : {}),
    ...(metadata && Object.keys(metadata).length ? { metadata } : {}),
    body: defaultBody(title),
    comments: [],
  };
  const path = activePath(issueRoot, issue);
  applyIssueFileBatch(lease, [{ path, bytes: encodeCanonicalIssue(issue), expectedRevision: null }]);
  return getUnlocked(cwd, prefix, issueRoot, id);
}

function getUnlocked(cwd: string, prefix: string, issueRoot: string, id: string): Issue {
  assertIssueId(id, prefix, 'issue');
  const entities = globalEntityMap(discoverCanonical(cwd, prefix, issueRoot));
  const entity = entities.get(id);
  if (!entity) throw new IssueError('schema', `canonical issue was not found: ${id}`, { issueIds: [id] });
  return issueFromEntity(entity, entities);
}

function listUnlocked(cwd: string, prefix: string, issueRoot: string, options: ListIssueOptions): IssueSummary[] {
  const status = cleanOptional(options.status)?.toLowerCase();
  const type = cleanOptional(options.type)?.toLowerCase();
  return discoverCanonical(cwd, prefix, issueRoot)
    .active.map(entityFromCandidate)
    .filter((entity) => !status || entity.issue.status === status)
    .filter((entity) => !type || entity.issue.type === type)
    .sort(compareEntities)
    .map((entity) => ({
      id: entity.issue.id,
      type: entity.issue.type,
      title: entity.issue.title,
      status: entity.issue.status,
      path: entity.path,
      revision: entity.revision,
    }));
}

function updateUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  clock: () => Date,
  lease: BarrierLease,
  id: string,
  changes: IssueUpdateChanges,
): Issue {
  assertIssueId(id, prefix, 'issue');
  if (!changes.expectedRevision)
    throw new IssueError('stale_revision', 'expected revision is required', { issueIds: [id] });
  assertValidForMutation(cwd, prefix, issueRoot);
  const entities = activeEntityMap(discoverCanonical(cwd, prefix, issueRoot));
  const current = requireActiveEntity(entities, id);
  if (current.revision !== changes.expectedRevision)
    throw new IssueError('stale_revision', `issue ${id} changed since the expected revision was calculated`, {
      issueIds: [id],
    });
  const next: CanonicalIssueDocument = {
    ...current.issue,
    comments: current.issue.comments.map((comment) => ({ ...comment })),
  };
  if (changes.type !== undefined) next.type = normalizeChoice(changes.type, ISSUE_TYPES, 'type');
  if (changes.title !== undefined) next.title = requireTrimmed(changes.title, 'title');
  if (changes.status !== undefined) next.status = normalizeChoice(changes.status, ISSUE_STATUSES, 'status');
  setOptional(next, 'created_by', changes.author);
  setOptional(next, 'assigned_to', changes.assignee);
  if (changes.body !== undefined && changes.sections !== undefined)
    throw new IssueError('schema', 'body and sections cannot both be supplied');
  if (changes.body !== undefined) next.body = changes.body;
  if (changes.sections !== undefined) next.body = updateSections(next.body, changes.sections);
  const nextParent = changes.parent === undefined ? current.issue.parent : cleanOptional(changes.parent ?? undefined);
  if (nextParent) {
    assertIssueId(nextParent, prefix, 'parent');
    if (nextParent === id) throw invariant('an issue cannot be its own parent');
    validateParentType(requireActiveEntity(entities, nextParent), next.type);
    if (hasHierarchyCycle(entities, id, nextParent)) throw invariant('hierarchy cycle detected');
    next.parent = nextParent;
  } else delete next.parent;
  for (const child of derivedReferences(current, entities).children)
    validateParentType({ ...current, issue: next }, requireActiveEntity(entities, child).issue.type);
  next.updated_at = canonicalTimestamp(clock());
  const destination = activePath(issueRoot, next);
  const replacements: FileReplacement[] = [
    {
      path: destination,
      bytes: encodeCanonicalIssue(next),
      expectedRevision: destination === current.path ? current.revision : null,
    },
  ];
  if (destination !== current.path) replacements.push({ path: current.path, expectedRevision: current.revision });
  applyIssueFileBatch(lease, replacements);
  return getUnlocked(cwd, prefix, issueRoot, id);
}

function commentUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  clock: () => Date,
  lease: BarrierLease,
  id: string,
  body: string,
  author: string,
): IssueComment {
  assertValidForMutation(cwd, prefix, issueRoot);
  const entity = requireActiveEntity(activeEntityMap(discoverCanonical(cwd, prefix, issueRoot)), id);
  const sequence =
    entity.issue.comments.reduce((maximum, comment) => {
      const value = /-C(\d+)$/u.exec(comment.id)?.[1];
      return value && BigInt(value) > maximum ? BigInt(value) : maximum;
    }, 0n) + 1n;
  const comment: CanonicalIssueComment = {
    id: `${id}-C${sequence.toString().padStart(4, '0')}`,
    created_at: canonicalTimestamp(clock()),
    created_by: requireTrimmed(author, 'comment author'),
    body: requireTrimmed(body, 'comment body'),
  };
  const next = { ...entity.issue, updated_at: comment.created_at, comments: [...entity.issue.comments, comment] };
  rewriteEntity(lease, entity, next);
  const issue = getUnlocked(cwd, prefix, issueRoot, id);
  return { ...comment, issue: id, path: issue.path, revision: issue.revision };
}

function relationshipUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  clock: () => Date,
  lease: BarrierLease,
  id: string,
  relationship: string,
  targetId: string,
  add: boolean,
): Issue {
  assertRelationship(relationship);
  if (id === targetId) throw invariant('an issue cannot reference itself');
  assertValidForMutation(cwd, prefix, issueRoot);
  const entities = activeEntityMap(discoverCanonical(cwd, prefix, issueRoot));
  const source = requireActiveEntity(entities, id);
  requireActiveEntity(entities, targetId);
  const timestamp = canonicalTimestamp(clock());
  if (relationship === 'blocks') {
    const target = requireActiveEntity(entities, targetId);
    const present = (target.issue.depends_on ?? []).includes(id);
    if (present === add) return issueFromEntity(source, entities);
    rewriteEntity(lease, target, setReference(target.issue, 'depends_on', id, add, timestamp));
  } else if (relationship === 'relates_to' || relationship === 'duplicates') {
    const [ownerId, otherId] = [id, targetId].sort(compareCodePoints) as [string, string];
    const owner = requireActiveEntity(entities, ownerId);
    const present = (owner.issue[relationship] ?? []).includes(otherId);
    if (present === add) return issueFromEntity(source, entities);
    rewriteEntity(lease, owner, setReference(owner.issue, relationship, otherId, add, timestamp));
  } else {
    const present = (source.issue[relationship] ?? []).includes(targetId);
    if (present === add) return issueFromEntity(source, entities);
    if (add && relationship === 'depends_on' && hasDependencyPath(entities, targetId, id))
      throw invariant('dependency cycle detected');
    rewriteEntity(lease, source, setReference(source.issue, relationship, targetId, add, timestamp));
  }
  return getUnlocked(cwd, prefix, issueRoot, id);
}

function linkUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  clock: () => Date,
  lease: BarrierLease,
  id: string,
  documentPath: string,
  kind?: string,
  readOptions?: BoundedNoFollowReadOptions,
): Issue {
  assertValidForMutation(cwd, prefix, issueRoot);
  const entity = requireActiveEntity(activeEntityMap(discoverCanonical(cwd, prefix, issueRoot)), id);
  const path = validateDocumentPath(cwd, documentPath, kind, readOptions);
  if ((entity.issue.documents ?? []).includes(path)) return issueFromEntity(entity, new Map([[id, entity]]));
  rewriteEntity(lease, entity, setReference(entity.issue, 'documents', path, true, canonicalTimestamp(clock())));
  return getUnlocked(cwd, prefix, issueRoot, id);
}

function archiveUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  lease: BarrierLease,
  id: string,
  transactionId: string,
): ArchiveReport {
  assertIssueId(id, prefix, 'issue');
  const storage = discoverCanonical(cwd, prefix, issueRoot);
  const root = resolveIssueCandidate(storage, id);
  if (root.location === 'archived')
    return {
      archived: [],
      skipped: [id],
      location: `${issueRoot}/archived/`,
      revisions: { [id]: root.decoded?.revision ?? '' },
    };
  assertValidForMutation(cwd, prefix, issueRoot);
  const entities = globalEntityMap(storage);
  const archived: string[] = [];
  const visit = (issueId: string): void => {
    const entity = entities.get(issueId);
    if (!entity) throw invariant(`archive descendant does not resolve: ${issueId}`);
    if (entity.location === 'active') archived.push(issueId);
    for (const child of derivedReferences(entity, entities).children) visit(child);
  };
  visit(id);
  const unique = sortedUnique(archived);
  const set = new Set(unique);
  const replacements: FileReplacement[] = [];
  const revisions: Record<string, string> = {};
  for (const issueId of unique) {
    const entity = entities.get(issueId);
    if (!entity) throw invariant(`archive issue does not resolve: ${issueId}`);
    const next = { ...entity.issue, comments: [...entity.issue.comments] };
    if (next.parent && !set.has(next.parent)) delete next.parent;
    const bytes = encodeCanonicalIssue(next);
    const destination = archivedPath(issueRoot, next);
    replacements.push({ path: destination, bytes, expectedRevision: null });
    replacements.push({ path: entity.path, expectedRevision: entity.revision });
    revisions[issueId] = revisionForBytes(bytes);
  }
  applyIssueFileBatch(lease, replacements);
  return { archived: unique, skipped: [], location: `${issueRoot}/archived/`, revisions, transactionId };
}

function validateUnlocked(
  cwd: string,
  prefix: string,
  issueRoot: string,
  id?: string,
  readOptions?: BoundedNoFollowReadOptions,
  documentOverlay?: DocumentSnapshotOverlay,
): ValidationReport {
  if (id !== undefined) assertIssueId(id, prefix, 'issue');
  let storage: IssueStorageCatalog;
  try {
    storage = discoverIssueStorage(cwd, { issuePrefix: prefix, issueRoot });
  } catch (error: unknown) {
    return { valid: false, findings: [findingFromError(error, id)] };
  }
  const findings: ValidationFinding[] = storage.findings.map((finding) => ({
    ...(finding.issueId ? { issue: finding.issueId } : {}),
    severity: 'error',
    category: finding.category,
    ...(finding.path ? { path: finding.path } : {}),
    message: finding.message,
    remedy: storageRemedy(finding.category),
  }));
  if (id !== undefined && !storage.byId.has(id))
    findings.push({
      issue: id,
      severity: 'error',
      category: 'schema',
      message: `canonical issue was not found: ${id}`,
      remedy: 'create the issue or correct the reference',
    });
  const entities = globalEntityMap(storage);
  const add = (
    owner: Entity,
    field: string,
    message: string,
    category: IssueError['category'] = 'domain_invariant',
  ): void => {
    if (findings.length <= MAX_FINDINGS)
      findings.push({
        issue: owner.issue.id,
        severity: 'error',
        category,
        path: owner.path,
        field,
        message,
        remedy: 'correct the canonical issue reference',
      });
  };
  for (const owner of orderedEntities(entities)) {
    if (owner.issue.parent) {
      const parent = entities.get(owner.issue.parent);
      if (!parent) add(owner, 'parent', `reference ${owner.issue.parent} in parent does not resolve`, 'schema');
      else if (!ALLOWED_PARENT_TYPES[owner.issue.type].includes(parent.issue.type))
        add(owner, 'parent', `invalid parent type "${parent.issue.type}" for ${owner.issue.type}`);
    }
    for (const field of ['depends_on', 'relates_to', 'duplicates', 'supersedes'] as const) {
      for (const target of owner.issue[field] ?? []) {
        if (target === owner.issue.id) add(owner, field, `self-reference in ${field}`);
        else if (!entities.has(target)) add(owner, field, `reference ${target} in ${field} does not resolve`, 'schema');
        if ((field === 'relates_to' || field === 'duplicates') && compareCodePoints(owner.issue.id, target) >= 0)
          add(owner, field, `${field} edge is not stored by its deterministic owner`);
      }
    }
    for (const document of owner.issue.documents ?? []) {
      try {
        validateDocumentPath(cwd, document, undefined, readOptions, documentOverlay);
      } catch (error: unknown) {
        add(owner, 'documents', errorMessage(error), error instanceof IssueError ? error.category : 'schema');
      }
    }
  }
  addCycleFindings(entities, 'parent', (entity) => (entity.issue.parent ? [entity.issue.parent] : []), findings);
  addCycleFindings(entities, 'depends_on', (entity) => entity.issue.depends_on ?? [], findings);
  let selected =
    id === undefined ? findings : findings.filter((finding) => finding.issue === undefined || finding.issue === id);
  selected.sort(compareValidationFindings);
  if (selected.length > MAX_FINDINGS)
    selected = [
      ...selected.slice(0, MAX_FINDINGS),
      {
        severity: 'error',
        category: 'resource_limit',
        message: 'validation finding limit exceeded',
        remedy: 'correct reported findings and validate again',
      },
    ];
  return { valid: selected.length === 0, findings: selected };
}

function derivedReferences(entity: Entity, entities: ReadonlyMap<string, Entity>): DerivedReferences {
  const children: string[] = [];
  const blocks: string[] = [];
  const relates = new Set(entity.issue.relates_to ?? []);
  const duplicates = new Set(entity.issue.duplicates ?? []);
  for (const candidate of entities.values()) {
    if (candidate.issue.parent === entity.issue.id) children.push(candidate.issue.id);
    if ((candidate.issue.depends_on ?? []).includes(entity.issue.id)) blocks.push(candidate.issue.id);
    if ((candidate.issue.relates_to ?? []).includes(entity.issue.id)) relates.add(candidate.issue.id);
    if ((candidate.issue.duplicates ?? []).includes(entity.issue.id)) duplicates.add(candidate.issue.id);
  }
  return {
    children: sortedUnique(children),
    blocks: sortedUnique(blocks),
    blocked_by: sortedUnique(entity.issue.depends_on ?? []),
    relates_to: sortedUnique([...relates]),
    duplicates: sortedUnique([...duplicates]),
  };
}

function issueFromEntity(entity: Entity, entities: ReadonlyMap<string, Entity>): Issue {
  const { version, body, comments, metadata: customMetadata, ...stored } = entity.issue;
  const derived = derivedReferences(entity, entities);
  const metadata: Record<string, unknown> = { ...stored };
  for (const [field, values] of Object.entries(derived)) if (values.length) metadata[field] = values;
  if (customMetadata) metadata.metadata = customMetadata;
  return {
    id: entity.issue.id,
    path: entity.path,
    metadata,
    body,
    revision: entity.revision,
    version,
    comments: comments.map((comment) => ({ ...comment })),
    location: entity.location,
  };
}

function rewriteEntity(lease: BarrierLease, entity: Entity, issue: CanonicalIssueDocument): void {
  applyIssueFileBatch(lease, [
    { path: entity.path, bytes: encodeCanonicalIssue(issue), expectedRevision: entity.revision },
  ]);
}

function discoverCanonical(cwd: string, prefix: string, issueRoot: string, mutable = false): IssueStorageCatalog {
  const storage = discoverIssueStorage(cwd, { issuePrefix: prefix, issueRoot });
  if (
    storage.status === 'canonical' ||
    (mutable && storage.status === 'empty') ||
    (!mutable && storage.status === 'empty')
  )
    return storage;
  throw new IssueError('storage_classification', `issue storage is ${storage.status}`, {
    paths: storage.findings.flatMap((finding) => (finding.path ? [finding.path] : [])),
  });
}

function activeEntityMap(storage: IssueStorageCatalog): Map<string, Entity> {
  return new Map(
    storage.active.map((candidate) => {
      const entity = entityFromCandidate(candidate);
      return [entity.issue.id, entity];
    }),
  );
}

function globalEntityMap(storage: IssueStorageCatalog): Map<string, Entity> {
  const result = new Map<string, Entity>();
  for (const [id, candidates] of storage.byId)
    if (candidates.length === 1 && candidates[0]?.decoded && !candidates[0].error)
      result.set(id, entityFromCandidate(candidates[0]));
  return result;
}

function entityFromCandidate(candidate: IssueStorageCandidate): Entity {
  if (candidate.error) throw candidate.error;
  if (!candidate.decoded)
    throw new IssueError('schema', 'canonical issue candidate was not decoded', { paths: [candidate.path] });
  return {
    issue: candidate.decoded.issue,
    path: candidate.path,
    revision: candidate.decoded.revision,
    location: candidate.location,
  };
}

function requireActiveEntity(entities: ReadonlyMap<string, Entity>, id: string): Entity {
  const entity = entities.get(id);
  if (!entity) throw new IssueError('schema', `active canonical issue was not found: ${id}`, { issueIds: [id] });
  return entity;
}

function setReference(
  issue: CanonicalIssueDocument,
  field: 'depends_on' | 'relates_to' | 'duplicates' | 'supersedes' | 'documents',
  value: string,
  add: boolean,
  timestamp: string,
): CanonicalIssueDocument {
  const current = issue[field] ?? [];
  const next = add ? sortedUnique([...current, value]) : current.filter((entry) => entry !== value);
  const result = { ...issue, comments: [...issue.comments], updated_at: timestamp };
  if (next.length) result[field] = next;
  else delete result[field];
  return result;
}

function assertValidForMutation(
  cwd: string,
  prefix: string,
  issueRoot: string,
  readOptions?: BoundedNoFollowReadOptions,
): void {
  const report = validateUnlocked(cwd, prefix, issueRoot, undefined, readOptions);
  if (!report.valid)
    throw new IssueError('domain_invariant', 'cannot mutate an invalid canonical issue graph', {
      issueIds: sortedUnique(report.findings.flatMap((finding) => (finding.issue ? [finding.issue] : []))),
      paths: sortedUnique(report.findings.flatMap((finding) => (finding.path ? [finding.path] : []))),
    });
}

function validateParentType(parent: Entity, childType: IssueType): void {
  if (!ALLOWED_PARENT_TYPES[childType].includes(parent.issue.type))
    throw invariant(`invalid parent type "${parent.issue.type}" for ${childType}`);
}

function hasHierarchyCycle(entities: ReadonlyMap<string, Entity>, child: string, parent: string): boolean {
  let current: string | undefined = parent;
  const seen = new Set<string>();
  while (current) {
    if (current === child || seen.has(current)) return true;
    seen.add(current);
    current = entities.get(current)?.issue.parent;
  }
  return false;
}

function hasDependencyPath(
  entities: ReadonlyMap<string, Entity>,
  from: string,
  target: string,
  seen = new Set<string>(),
): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (requireActiveEntity(entities, from).issue.depends_on ?? []).some((dependency) =>
    hasDependencyPath(entities, dependency, target, seen),
  );
}

function addCycleFindings(
  entities: Map<string, Entity>,
  field: 'parent' | 'depends_on',
  edges: (entity: Entity) => readonly string[],
  findings: ValidationFinding[],
): void {
  const states = new Map<string, 'visiting' | 'visited'>();
  const visit = (id: string): void => {
    if (states.get(id) === 'visited') return;
    if (states.get(id) === 'visiting') {
      const owner = entities.get(id);
      if (owner && findings.length <= MAX_FINDINGS)
        findings.push({
          issue: id,
          severity: 'error',
          category: 'domain_invariant',
          path: owner.path,
          field,
          message: `${field === 'parent' ? 'hierarchy' : 'dependency'} cycle detected`,
          remedy: 'remove an edge from the cycle',
        });
      return;
    }
    states.set(id, 'visiting');
    const entity = entities.get(id);
    for (const target of entity ? edges(entity) : []) if (entities.has(target)) visit(target);
    states.set(id, 'visited');
  };
  for (const entity of orderedEntities(entities)) visit(entity.issue.id);
}

function activePath(root: string, issue: CanonicalIssueDocument): string {
  return `${root}/${canonicalIssueFilename(issue.id, issue.title)}`;
}
function archivedPath(root: string, issue: CanonicalIssueDocument): string {
  return `${root}/archived/${canonicalIssueFilename(issue.id, issue.title)}`;
}

function allocateIssueId(storage: IssueStorageCatalog, prefix: string): string {
  const expression = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, 'u');
  let maximum = 0n;
  for (const id of storage.reservedIds) {
    const digits = expression.exec(id)?.[1];
    if (digits && BigInt(digits) > maximum) maximum = BigInt(digits);
  }
  return `${prefix}${(maximum + 1n).toString().padStart(5, '0')}`;
}

function validateDocumentPath(
  cwd: string,
  value: string,
  kind?: string,
  readOptions?: BoundedNoFollowReadOptions,
  documentOverlay?: DocumentSnapshotOverlay,
): string {
  if (kind !== undefined && kind !== 'task' && kind !== 'design' && kind !== 'document')
    throw new IssueError('schema', `invalid document kind: ${kind}`);
  const normalized = value.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new IssueError('path_safety', 'invalid repository-relative document path');
  const taskRoot = configuredTaskRoot(cwd);
  const documentConfig = configuredDocumentRoot(cwd);
  const inTaskRoot = isUnderRoot(normalized, taskRoot);
  const inRetiredRoot = isUnderRoot(normalized, '.specs') || isUnderRoot(normalized, '.ai.tmp');
  const inDocumentRoot = documentConfig !== undefined && isUnderRoot(normalized, documentConfig.root);
  if (inRetiredRoot) throw new IssueError('path_safety', 'structured .specs and .ai.tmp links are retired');
  if (!inTaskRoot && !inDocumentRoot)
    throw new IssueError(
      'path_safety',
      `document path must be under ${taskRoot}/ or the active canonical Documents root`,
    );
  if (kind === 'task' && !inTaskRoot) throw new IssueError('path_safety', `task documents must be under ${taskRoot}/`);
  if (kind === 'design') throw new IssueError('schema', 'legacy design links are retired; use kind=document');
  if (kind === 'document' && !inDocumentRoot)
    throw new IssueError('path_safety', 'document links require an active file under filesystem documents.root');
  if (inDocumentRoot && documentConfig) {
    const suffix = normalized.slice(documentConfig.root.length + 1);
    if (suffix.startsWith('archive/') || suffix.includes('/'))
      throw new IssueError('path_safety', 'document links require an active canonical document, not an archive path');
    const canonicalName = new RegExp(`^${escapeRegex(documentConfig.prefix)}\\d+-.+-v\\d+\\.md$`, 'u');
    if (!canonicalName.test(suffix))
      throw new IssueError('schema', 'document link is not a canonical document filename');
  }
  const absolute = join(cwd, normalized);
  const difference = relative(cwd, absolute);
  if (!difference || difference === '..' || difference.startsWith(`..${sep}`))
    throw new IssueError('path_safety', 'document path escapes repository');
  let cursor = cwd;
  for (const part of normalized.split('/').slice(0, -1)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink())
      throw new IssueError('path_safety', 'symlink document paths are not allowed');
  }
  const hasDocumentOverlay = inDocumentRoot && documentOverlay?.has(normalized) === true;
  if (!hasDocumentOverlay && !existsSync(absolute))
    throw new IssueError('schema', `linked document does not exist: ${normalized}`);
  if (inDocumentRoot && documentConfig) {
    try {
      const bytes = hasDocumentOverlay
        ? documentOverlay?.get(normalized)
        : readBoundedNoFollowFile(absolute, normalized, DOCUMENT_LIMITS.fileBytes, readOptions);
      if (bytes === undefined) throw new IssueError('schema', `linked document does not exist: ${normalized}`);
      const decoded = decodeDocument(bytes);
      const suffix = normalized.slice(documentConfig.root.length + 1);
      if (suffix !== canonicalDocumentFilename(decoded.metadata))
        throw new IssueError('schema', 'document filename does not match canonical metadata');
    } catch (error: unknown) {
      if (error instanceof IssueError) throw error;
      if (error instanceof LocalPersistenceError)
        throw new IssueError(error.category === 'resource_limit' ? 'resource_limit' : 'path_safety', error.message, {
          paths: [normalized],
        });
      throw new IssueError('schema', 'linked document is not valid canonical Markdown');
    }
  } else {
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new IssueError('path_safety', 'linked document must be a regular non-symlink file');
  }
  return normalized;
}

function isFilesystemIssueConfig(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const provider = (value as Record<string, unknown>).provider;
  return (
    (value as Record<string, unknown>).enabled === true &&
    provider !== null &&
    typeof provider === 'object' &&
    !Array.isArray(provider) &&
    (provider as Record<string, unknown>).type === 'filesystem'
  );
}

function configuredDocumentRoot(cwd: string): { root: string; prefix: string } | undefined {
  const config = readConfig(cwd);
  if (config instanceof ConfigError) throw new IssueError('configuration', config.message);
  const documents = config.skills.documents;
  if (documents === null || typeof documents !== 'object' || Array.isArray(documents))
    throw new IssueError('configuration', 'documents configuration must be a mapping');
  const record = documents as Record<string, unknown>;
  if (record.enabled !== true) return undefined;
  const provider = record.provider;
  if (provider === null || typeof provider !== 'object' || Array.isArray(provider))
    throw new IssueError('configuration', 'documents provider must be a mapping');
  if ((provider as Record<string, unknown>).type !== 'filesystem') return undefined;
  if (typeof record.root !== 'string' || typeof record.prefix !== 'string')
    throw new IssueError('configuration', 'filesystem Documents root and prefix are required');
  return { root: record.root, prefix: record.prefix };
}

function configuredTaskRoot(cwd: string): string {
  const value = getConfigValue(cwd, 'paths.tasks');
  if (value instanceof ConfigError || typeof value !== 'string' || !value.trim()) return '.harnessctl/tasks';
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/$/u, '');
  return !normalized || normalized.startsWith('/') || normalized.split('/').includes('..')
    ? '.harnessctl/tasks'
    : normalized;
}

function updateSections(body: string, sections: Record<string, string>): string {
  let result = body;
  for (const [name, value] of Object.entries(sections)) {
    if (typeof value !== 'string') throw new IssueError('schema', `section "${name}" must contain string content`);
    const heading = `## ${name}`;
    const expression = new RegExp(`(^|\\n)${escapeRegex(heading)}\\n[\\s\\S]*?(?=\\n## |$)`, 'u');
    const replacement = `\n${heading}\n\n${value.trim()}\n`;
    result = expression.test(result) ? result.replace(expression, replacement) : `${result.trimEnd()}\n${replacement}`;
  }
  return result;
}

function setOptional(
  issue: CanonicalIssueDocument,
  field: 'created_by' | 'assigned_to',
  value: string | undefined,
): void {
  if (value === undefined) return;
  const normalized = cleanOptional(value);
  if (normalized) issue[field] = normalized;
  else delete issue[field];
}

function getIssueStorageConfig(cwd: string): { prefix: string; issueRoot: string } {
  const config = readConfig(cwd);
  if (config instanceof ConfigError)
    throw new IssueError('configuration', `unable to read issue configuration: ${config.message}`);
  const issues = config.skills.issues;
  if (issues === null || typeof issues !== 'object' || Array.isArray(issues))
    throw new IssueError('configuration', 'issue configuration must be a mapping');
  const { prefix, root } = issues as Record<string, unknown>;
  if (typeof prefix !== 'string' || !/^[A-Za-z0-9_-]*$/u.test(prefix))
    throw new IssueError('configuration', 'issue prefix must be a safe string');
  if (typeof root !== 'string') throw new IssueError('configuration', 'issue root must be a safe string');
  return { prefix, issueRoot: validateIssueRoot(root) };
}

function assertLocalIssueProvider(cwd: string, operation: string): void {
  const config = readConfig(cwd);
  if (config instanceof ConfigError)
    throw new IssueError('configuration', `unable to read issue configuration: ${config.message}`);
  const issues = config.skills.issues;
  if (issues === null || typeof issues !== 'object' || Array.isArray(issues))
    throw new IssueError('configuration', 'issue configuration must be a mapping');
  if ((issues as Record<string, unknown>).enabled !== true)
    throw new IssueError(
      'configuration',
      `${operation} requires skills.issues.enabled=true; the local Issues capability is disabled.`,
    );
  const provider = (issues as Record<string, unknown>).provider;
  if (provider === null || typeof provider !== 'object' || Array.isArray(provider))
    throw new IssueError('configuration', 'issue provider must be a mapping');
  const { type, tools } = provider as Record<string, unknown>;
  if (type === 'filesystem') return;
  throw new IssueError(
    'configuration',
    `${operation} cannot use harnessctl local issue tools with issues.provider.type=${String(type)} and configured executable ${String(tools)}; harnessctl local issue tools are available only for issues.provider.type=filesystem.`,
  );
}

function readIssuePrefix(cwd: string): string | undefined {
  const value = getConfigValue(cwd, 'skills.issues.prefix');
  return typeof value === 'string' && /^[A-Za-z0-9_-]*$/u.test(value) ? value : undefined;
}

function parseIdsWithPrefix(prompt: string, prefix: string): string[] {
  return [
    ...new Set(
      [...prompt.matchAll(new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(prefix)}\\d+(?![A-Za-z0-9_-])`, 'gu'))].map(
        (match) => match[0],
      ),
    ),
  ];
}
function parseReferences(value: string | undefined, prefix: string, field: string): string[] {
  const result =
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  for (const id of result) assertIssueId(id, prefix, field);
  return sortedUnique(result);
}
function normalizeIssueId(value: string | undefined, prefix: string, field: string): string | undefined {
  const result = cleanOptional(value);
  if (result) assertIssueId(result, prefix, field);
  return result;
}
function assertIssueId(id: string, prefix: string, field: string): void {
  if (!new RegExp(`^${escapeRegex(prefix)}\\d+$`, 'u').test(id))
    throw new IssueError('schema', `invalid ${field} "${id}". It must match the configured issue prefix and a number.`);
}
function assertRelationship(value: string): asserts value is Relationship {
  if (!RELATIONSHIPS.includes(value as Relationship)) throw new IssueError('schema', `invalid relationship "${value}"`);
}
function normalizeChoice<T extends readonly string[]>(value: string, choices: T, field: string): T[number] {
  const normalized = value.trim().toLowerCase();
  if (!choices.includes(normalized))
    throw new IssueError('schema', `invalid ${field} "${value}". Must be one of: ${choices.join(', ')}`);
  return normalized as T[number];
}
function requireTrimmed(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new IssueError('schema', `${field} is required`);
  return result;
}
function cleanOptional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
function canonicalTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new IssueError('configuration', 'issue clock is invalid');
  return value.toISOString();
}
function defaultBody(title: string): string {
  return `\n# ${title}\n\n## Summary\n\n\n## Comments\n`;
}
function revisionForBytes(bytes: Uint8Array): string {
  return computeIssueRevision(bytes);
}
function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodePoints);
}
function orderedEntities(entities: ReadonlyMap<string, Entity>): Entity[] {
  return [...entities.values()].sort(compareEntities);
}
function compareEntities(left: Entity, right: Entity): number {
  return compareIssueIds(left.issue.id, right.issue.id);
}
function compareIssueIds(left: string, right: string): number {
  const leftDigits = /(\d+)$/u.exec(left)?.[1];
  const rightDigits = /(\d+)$/u.exec(right)?.[1];
  if (leftDigits && rightDigits) {
    const difference = BigInt(leftDigits) - BigInt(rightDigits);
    if (difference) return difference < 0 ? -1 : 1;
  }
  return compareCodePoints(left, right);
}
function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return a.length - b.length;
}
function compareValidationFindings(left: ValidationFinding, right: ValidationFinding): number {
  return (
    compareCodePoints(left.issue ?? '', right.issue ?? '') ||
    compareCodePoints(left.path ?? '', right.path ?? '') ||
    compareCodePoints(left.field ?? '', right.field ?? '') ||
    compareCodePoints(left.message, right.message)
  );
}
function isUnderRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}
function invariant(message: string): IssueError {
  return new IssueError('domain_invariant', message);
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findingFromError(error: unknown, issue?: string): ValidationFinding {
  return {
    ...(issue ? { issue } : {}),
    severity: 'error',
    ...(error instanceof IssueError
      ? {
          category: error.category,
          ...(error.paths?.[0] ? { path: error.paths[0] } : {}),
          ...(error.transactionId ? { transactionId: error.transactionId } : {}),
          remedy: storageRemedy(error.category),
        }
      : {}),
    message: errorMessage(error),
  };
}

function storageRemedy(category: IssueError['category']): string {
  if (category === 'identity_ambiguity') return 'remove duplicate or portable-colliding issue representations';
  if (category === 'path_safety') return 'replace the unsafe entry with a regular canonical file or directory';
  if (category === 'storage_classification') return 'replace unsupported legacy storage with canonical issue YAML';
  return 'correct the canonical issue document and run validation again';
}
