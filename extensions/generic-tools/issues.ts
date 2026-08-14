import { createHash } from 'node:crypto';
import { existsSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ConfigError, getConfigValue } from './config.js';
import {
  ISSUE_CONTRACT_VERSION,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  IssueError,
  canonicalIssueFilename,
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
  discoverIssueStorage,
  projectIssueCandidate,
  resolveIssueCandidate,
  type IssueProjectionRecord,
  type IssueStorageCandidate,
  type IssueStorageCatalog,
} from './issues-storage.js';
import {
  inspectIssueTransactionEvidence,
  recoverIssueTransactions,
  withIssueMutationLock,
  type IssueMutationContext,
  type IssueTransactionActionPlan,
  type IssueTransactionOptions,
} from './issues-transactions.js';

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

export interface FilesystemIssueProviderOptions extends IssueTransactionOptions {
  clock?: () => Date;
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
  recover(): readonly string[];
  discover(): IssueStorageCatalog;
  project(id: string): IssueProjectionRecord;
  projectAll(): readonly IssueProjectionRecord[];
  decode(source: string | Uint8Array, options?: Omit<DecodeIssueOptions, 'issuePrefix'>): DecodedIssueDocument;
}

const ALLOWED_PARENT_TYPES: Record<IssueType, readonly IssueType[]> = {
  initiative: [],
  epic: ['initiative'],
  story: ['epic', 'initiative'],
  task: ['story', 'epic'],
  bug: ['story', 'task', 'epic'],
};
const RELATIONSHIPS: readonly Relationship[] = ['depends_on', 'blocks', 'relates_to', 'duplicates', 'supersedes'];
type ReferenceField =
  'children' | 'depends_on' | 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'supersedes' | 'documents';

export function createFilesystemIssueProvider(
  cwd: string,
  options: FilesystemIssueProviderOptions = {},
): FilesystemIssueProvider {
  const prefix = getIssuePrefix(cwd);
  const transactionOptions: IssueTransactionOptions = {
    ...options,
    issuePrefix: prefix,
    now: options.clock ?? options.now,
  };
  const clock = options.clock ?? options.now ?? (() => new Date());
  const locked = <T>(operation: (context: IssueMutationContext) => T): T =>
    withIssueMutationLock(cwd, operation, transactionOptions);

  return {
    parseIds: (prompt) => parseIdsWithPrefix(prompt, prefix),
    parseId: (prompt) => parseIdsWithPrefix(prompt, prefix)[0] ?? '',
    create: (createOptions) => locked((context) => createUnlocked(cwd, prefix, clock, context, createOptions)),
    get: (id) => locked(() => issueFromCandidate(resolveActiveOrArchived(cwd, prefix, id))),
    list: (listOptions = {}) => locked(() => listUnlocked(cwd, prefix, listOptions)),
    update: (id, changes) => locked((context) => updateUnlocked(cwd, prefix, clock, context, id, changes)),
    transition: (id, status, expectedRevision) =>
      locked((context) => updateUnlocked(cwd, prefix, clock, context, id, { status, expectedRevision })),
    appendComment: (id, body, author) =>
      locked((context) => commentUnlocked(cwd, prefix, clock, context, id, body, author)),
    relate: (id, relationship, targetId) =>
      locked((context) => relationshipUnlocked(cwd, prefix, clock, context, id, relationship, targetId, true)),
    unrelate: (id, relationship, targetId) =>
      locked((context) => relationshipUnlocked(cwd, prefix, clock, context, id, relationship, targetId, false)),
    linkDocument: (id, documentPath, kind) =>
      locked((context) => linkUnlocked(cwd, prefix, clock, context, id, documentPath, kind)),
    validate: (id) => locked(() => validateUnlocked(cwd, prefix, id)),
    archiveTree: (id) => locked((context) => archiveUnlocked(cwd, prefix, clock, context, id)),
    recover: () => recoverIssueTransactions(cwd, transactionOptions),
    discover: () => locked(() => discoverCanonical(cwd, prefix)),
    project: (id) => locked(() => projectIssueCandidate(resolveActiveOrArchived(cwd, prefix, id))),
    projectAll: () =>
      locked(() =>
        [...discoverCanonical(cwd, prefix).candidates]
          .sort((left, right) => compareCandidatesById(left, right) || compareCodePoints(left.location, right.location))
          .map(projectIssueCandidate),
      ),
    decode: (source, decodeOptions = {}) => decodeIssueDocument(source, { ...decodeOptions, issuePrefix: prefix }),
  };
}

export function parseIssueIds(prompt: string, cwd: string = process.cwd()): string[] {
  const prefix = readIssuePrefix(cwd);
  return prefix === undefined ? [] : parseIdsWithPrefix(prompt, prefix);
}

export function parseIssueId(prompt: string, cwd: string = process.cwd()): string {
  return parseIssueIds(prompt, cwd)[0] ?? '';
}

export function createIssue(cwd: string, options: CreateIssueOptions): Issue {
  return createIssueRecord(cwd, options);
}

export function createIssueRecord(cwd: string, options: CreateIssueOptions): Issue {
  return createFilesystemIssueProvider(cwd).create(options);
}

export function getIssue(cwd: string, id: string): Issue {
  return createFilesystemIssueProvider(cwd).get(id);
}

export function listIssueSummaries(cwd: string, options: ListIssueOptions = {}): IssueSummary[] {
  return createFilesystemIssueProvider(cwd).list(options);
}

export function listIssues(cwd: string, options: ListIssueOptions = {}): IssueSummary[] {
  return listIssueSummaries(cwd, options);
}

export function updateIssue(cwd: string, id: string, changes: IssueUpdateChanges): Issue {
  return createFilesystemIssueProvider(cwd).update(id, changes);
}

export function transitionIssue(cwd: string, id: string, status: string, expectedRevision: string): Issue {
  return createFilesystemIssueProvider(cwd).transition(id, status, expectedRevision);
}

export function commentIssue(cwd: string, id: string, body: string, author: string): IssueComment {
  return createFilesystemIssueProvider(cwd).appendComment(id, body, author);
}

export function relateIssue(cwd: string, id: string, relationship: string, targetId: string): Issue {
  return createFilesystemIssueProvider(cwd).relate(id, relationship, targetId);
}

export function unrelateIssue(cwd: string, id: string, relationship: string, targetId: string): Issue {
  return createFilesystemIssueProvider(cwd).unrelate(id, relationship, targetId);
}

export function linkDocument(cwd: string, id: string, documentPath: string, kind?: string): Issue {
  return createFilesystemIssueProvider(cwd).linkDocument(id, documentPath, kind);
}

export function validateIssues(cwd: string, id?: string): ValidationReport {
  try {
    return createFilesystemIssueProvider(cwd).validate(id);
  } catch (error: unknown) {
    return { valid: false, findings: [findingFromError(error, id)] };
  }
}

export function archiveIssue(cwd: string, id: string): ArchiveReport {
  return archiveIssueReport(cwd, id);
}

export function archiveIssueReport(cwd: string, id: string): ArchiveReport {
  return createFilesystemIssueProvider(cwd).archiveTree(id);
}

function createUnlocked(
  cwd: string,
  prefix: string,
  clock: () => Date,
  context: IssueMutationContext,
  options: CreateIssueOptions,
): Issue {
  const storage = discoverCanonical(cwd, prefix, true);
  assertGloballyValidForMutation(cwd, prefix);
  const type = normalizeChoice(options.type, ISSUE_TYPES, 'type');
  const title = requireTrimmed(options.title, 'title');
  const status = normalizeChoice(options.status ?? 'open', ISSUE_STATUSES, 'status');
  if (options.metadata !== undefined && options.metadataText !== undefined) {
    throw new IssueError('schema', 'metadata and metadataText cannot both be supplied');
  }
  const metadata = options.metadataText
    ? parseIssueMetadataText(options.metadataText)
    : options.metadata
      ? normalizeIssueMetadata(options.metadata)
      : undefined;
  const parent = normalizeIssueId(options.parent, prefix, 'parent');
  const dependencies = parseReferences(options.depends, prefix, 'depends');
  const entities = activeEntityMap(storage);
  for (const dependency of dependencies) requireActiveEntity(entities, dependency);
  if (parent) validateParentType(requireActiveEntity(entities, parent), type);

  let currentStorage = storage;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = allocateIssueId(currentStorage, prefix);
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
      ...(dependencies.length > 0 ? { depends_on: sortedUnique(dependencies) } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
      body: defaultBody(title),
      comments: [],
    };
    const destination = activePath(issue);
    const actions: IssueTransactionActionPlan[] = [createAction(issue, destination)];
    if (parent) {
      const parentEntity = requireActiveEntity(entities, parent);
      const nextParent = setReference(parentEntity.issue, 'children', id, true, timestamp);
      actions.push(rewriteAction(parentEntity, nextParent));
    }
    try {
      context.commit({ operation: 'create', actions });
      return issueFromCandidate(resolveActive(cwd, prefix, id));
    } catch (error: unknown) {
      if (!isCreateDestinationRace(error, destination) || attempt === 4) throw error;
      currentStorage = discoverCanonical(cwd, prefix, true);
      assertGloballyValidForMutation(cwd, prefix);
    }
  }
  throw new IssueError('filesystem_durability', 'issue ID allocation retry limit exceeded', { retryable: true });
}

function listUnlocked(cwd: string, prefix: string, options: ListIssueOptions): IssueSummary[] {
  const status = cleanOptional(options.status)?.toLowerCase();
  const type = cleanOptional(options.type)?.toLowerCase();
  const storage = discoverCanonical(cwd, prefix);
  return storage.active
    .map(requireDecoded)
    .filter((candidate) => !status || candidate.decoded?.issue.status === status)
    .filter((candidate) => !type || candidate.decoded?.issue.type === type)
    .sort(compareCandidatesById)
    .map((candidate) => {
      const decoded = requireDecoded(candidate).decoded;
      if (!decoded) throw new IssueError('schema', 'canonical issue was not decoded');
      return {
        id: decoded.issue.id,
        type: decoded.issue.type,
        title: decoded.issue.title,
        status: decoded.issue.status,
        path: candidate.path,
        revision: decoded.revision,
      };
    });
}

function updateUnlocked(
  cwd: string,
  prefix: string,
  clock: () => Date,
  context: IssueMutationContext,
  id: string,
  changes: IssueUpdateChanges,
): Issue {
  assertIssueId(id, prefix, 'issue');
  if (!changes.expectedRevision)
    throw new IssueError('stale_revision', 'expected revision is required', { issueIds: [id] });
  assertGloballyValidForMutation(cwd, prefix);
  const storage = discoverCanonical(cwd, prefix);
  const entities = activeEntityMap(storage);
  const current = requireActiveEntity(entities, id);
  if (current.revision !== changes.expectedRevision) {
    throw new IssueError('stale_revision', `issue ${id} changed since the expected revision was calculated`, {
      issueIds: [id],
    });
  }
  const timestamp = canonicalTimestamp(clock());
  const next: CanonicalIssueDocument = { ...current.issue, comments: [...current.issue.comments] };
  if (changes.type !== undefined) next.type = normalizeChoice(changes.type, ISSUE_TYPES, 'type');
  if (changes.title !== undefined) next.title = requireTrimmed(changes.title, 'title');
  if (changes.status !== undefined) next.status = normalizeChoice(changes.status, ISSUE_STATUSES, 'status');
  setOptional(next, 'created_by', changes.author);
  setOptional(next, 'assigned_to', changes.assignee);
  if (changes.body !== undefined && changes.sections !== undefined) {
    throw new IssueError('schema', 'body and sections cannot both be supplied');
  }
  if (changes.body !== undefined) next.body = changes.body;
  if (changes.sections !== undefined) next.body = updateSections(next.body, changes.sections);

  const currentParent = current.issue.parent;
  const nextParent = changes.parent === undefined ? currentParent : cleanOptional(changes.parent ?? undefined);
  if (nextParent) {
    assertIssueId(nextParent, prefix, 'parent');
    if (nextParent === id) throw invariant('an issue cannot be its own parent');
    validateParentType(requireActiveEntity(entities, nextParent), next.type);
    if (hasHierarchyPath(entities, id, nextParent)) throw invariant('hierarchy cycle detected');
    next.parent = nextParent;
  } else delete next.parent;
  for (const childId of next.children ?? [])
    validateParentType(
      { ...requireActiveEntity(entities, childId), issue: next },
      requireActiveEntity(entities, childId).issue.type,
    );
  next.updated_at = timestamp;

  const actions: IssueTransactionActionPlan[] = [];
  const destination = activePath(next);
  actions.push(destination === current.path ? rewriteAction(current, next) : moveAction(current, next, destination));
  if (currentParent !== nextParent) {
    if (currentParent) {
      const oldParent = requireActiveEntity(entities, currentParent);
      actions.push(rewriteAction(oldParent, setReference(oldParent.issue, 'children', id, false, timestamp)));
    }
    if (nextParent) {
      const newParent = requireActiveEntity(entities, nextParent);
      actions.push(rewriteAction(newParent, setReference(newParent.issue, 'children', id, true, timestamp)));
    }
  }
  context.commit({ operation: 'update', actions });
  return issueFromCandidate(resolveActive(cwd, prefix, id));
}

function commentUnlocked(
  cwd: string,
  prefix: string,
  clock: () => Date,
  context: IssueMutationContext,
  id: string,
  body: string,
  author: string,
): IssueComment {
  const trimmedBody = requireTrimmed(body, 'comment body');
  const trimmedAuthor = requireTrimmed(author, 'comment author');
  assertGloballyValidForMutation(cwd, prefix);
  const entity = requireActiveEntity(activeEntityMap(discoverCanonical(cwd, prefix)), id);
  const maximum = entity.issue.comments.reduce((value, comment) => {
    const sequence = /-C(\d+)$/u.exec(comment.id)?.[1];
    return sequence ? (BigInt(sequence) > value ? BigInt(sequence) : value) : value;
  }, 0n);
  const sequence = maximum + 1n;
  const timestamp = canonicalTimestamp(clock());
  const comment: CanonicalIssueComment = {
    id: `${id}-C${sequence.toString().padStart(4, '0')}`,
    created_at: timestamp,
    created_by: trimmedAuthor,
    body: trimmedBody,
  };
  const next: CanonicalIssueDocument = {
    ...entity.issue,
    updated_at: timestamp,
    comments: [...entity.issue.comments, comment],
  };
  context.commit({ operation: 'comment', actions: [rewriteAction(entity, next)] });
  const result = issueFromCandidate(resolveActive(cwd, prefix, id));
  return { ...comment, issue: id, path: result.path, revision: result.revision };
}

function relationshipUnlocked(
  cwd: string,
  prefix: string,
  clock: () => Date,
  context: IssueMutationContext,
  id: string,
  relationship: string,
  targetId: string,
  add: boolean,
): Issue {
  assertRelationship(relationship);
  if (id === targetId) throw invariant('an issue cannot reference itself');
  assertGloballyValidForMutation(cwd, prefix);
  const entities = activeEntityMap(discoverCanonical(cwd, prefix));
  const source = requireActiveEntity(entities, id);
  const target = requireActiveEntity(entities, targetId);
  const alreadyPresent = (source.issue[relationship] ?? []).includes(targetId);
  const inverse = relationship === 'blocks' ? 'blocked_by' : relationship === 'duplicates' ? 'duplicates' : undefined;
  const inversePresent = inverse ? (target.issue[inverse] ?? []).includes(id) : true;
  if ((add && alreadyPresent && inversePresent) || (!add && !alreadyPresent && (inverse ? !inversePresent : true))) {
    return issueFromEntity(source);
  }
  if (add && relationship === 'depends_on' && hasDependencyPath(entities, targetId, id)) {
    throw invariant('dependency cycle detected');
  }
  const timestamp = canonicalTimestamp(clock());
  const actions = [rewriteAction(source, setReference(source.issue, relationship, targetId, add, timestamp))];
  if (inverse) actions.push(rewriteAction(target, setReference(target.issue, inverse, id, add, timestamp)));
  context.commit({ operation: add ? 'relate' : 'unrelate', actions });
  return issueFromCandidate(resolveActive(cwd, prefix, id));
}

function linkUnlocked(
  cwd: string,
  prefix: string,
  clock: () => Date,
  context: IssueMutationContext,
  id: string,
  documentPath: string,
  kind?: string,
): Issue {
  assertGloballyValidForMutation(cwd, prefix);
  const entity = requireActiveEntity(activeEntityMap(discoverCanonical(cwd, prefix)), id);
  const normalized = validateDocumentPath(cwd, documentPath, kind);
  if ((entity.issue.documents ?? []).includes(normalized)) return issueFromEntity(entity);
  const next = setReference(entity.issue, 'documents', normalized, true, canonicalTimestamp(clock()));
  context.commit({ operation: 'link', actions: [rewriteAction(entity, next)] });
  return issueFromCandidate(resolveActive(cwd, prefix, id));
}

function validateUnlocked(cwd: string, prefix: string, id?: string): ValidationReport {
  if (id !== undefined) assertIssueId(id, prefix, 'issue');
  const storage = discoverIssueStorage(cwd, { issuePrefix: prefix });
  const findings: ValidationFinding[] = storage.findings.map((finding) => ({
    ...(finding.issueId ? { issue: finding.issueId } : {}),
    severity: 'error',
    category: finding.category,
    ...(finding.path ? { path: finding.path } : {}),
    message: finding.message,
    remedy: storageRemedy(finding.category),
  }));
  for (const evidence of inspectIssueTransactionEvidence(cwd)) {
    findings.push(findingFromError(evidence));
  }
  if (id !== undefined && !storage.byId.has(id)) {
    findings.push({
      issue: id,
      severity: 'error',
      category: 'schema',
      message: `canonical issue was not found: ${id}`,
      remedy: 'create the issue or correct the reference',
    });
  }

  const entities = globalEntityMap(storage);
  const add = (
    owner: Entity,
    field: string,
    message: string,
    category: IssueError['category'] = 'domain_invariant',
  ): void => {
    findings.push({
      issue: owner.issue.id,
      severity: 'error',
      category,
      path: owner.path,
      field,
      message,
      remedy: 'correct the reference and restore canonical reciprocal graph state',
    });
  };
  const resolveReference = (owner: Entity, field: string, targetId: string): Entity | undefined => {
    if (targetId === owner.issue.id) {
      add(owner, field, `self-reference in ${field}`);
      return undefined;
    }
    const candidates = storage.byId.get(targetId) ?? [];
    if (candidates.length !== 1 || !entities.has(targetId)) {
      add(
        owner,
        field,
        candidates.length > 1
          ? `reference ${targetId} in ${field} is ambiguous`
          : `reference ${targetId} in ${field} does not resolve`,
        candidates.length > 1 ? 'identity_ambiguity' : 'schema',
      );
      return undefined;
    }
    return entities.get(targetId);
  };

  for (const owner of orderedEntities(entities)) {
    const parentId = owner.issue.parent;
    if (parentId) {
      const parent = resolveReference(owner, 'parent', parentId);
      if (parent) {
        if (!(parent.issue.children ?? []).includes(owner.issue.id)) {
          add(owner, 'parent', `parent ${parentId} does not list ${owner.issue.id} as a child`);
        }
        if (!ALLOWED_PARENT_TYPES[owner.issue.type].includes(parent.issue.type)) {
          add(owner, 'parent', `invalid parent type "${parent.issue.type}" for ${owner.issue.type}`);
        }
      }
    }
    for (const childId of owner.issue.children ?? []) {
      const child = resolveReference(owner, 'children', childId);
      if (child && child.issue.parent !== owner.issue.id) {
        add(owner, 'children', `child ${childId} does not reference ${owner.issue.id} as parent`);
      }
    }
    for (const field of ['depends_on', 'blocks', 'blocked_by', 'relates_to', 'duplicates', 'supersedes'] as const) {
      for (const targetId of owner.issue[field] ?? []) {
        const target = resolveReference(owner, field, targetId);
        if (!target) continue;
        if (field === 'blocks' && !(target.issue.blocked_by ?? []).includes(owner.issue.id)) {
          add(owner, field, `blocks reference to ${targetId} has no reciprocal blocked_by reference`);
        }
        if (field === 'blocked_by' && !(target.issue.blocks ?? []).includes(owner.issue.id)) {
          add(owner, field, `blocked_by reference to ${targetId} has no reciprocal blocks reference`);
        }
        if (field === 'duplicates' && !(target.issue.duplicates ?? []).includes(owner.issue.id)) {
          add(owner, field, `duplicate reference to ${targetId} is not symmetric`);
        }
      }
    }
    for (const document of owner.issue.documents ?? []) {
      try {
        validateDocumentPath(cwd, document);
      } catch (error: unknown) {
        add(owner, 'documents', errorMessage(error), error instanceof IssueError ? error.category : 'schema');
      }
    }
  }

  addCycleFindings(entities, 'children', (entity) => entity.issue.children ?? [], findings);
  addCycleFindings(entities, 'depends_on', (entity) => entity.issue.depends_on ?? [], findings);
  const selected =
    id === undefined ? findings : findings.filter((finding) => finding.issue === undefined || finding.issue === id);
  selected.sort(compareValidationFindings);
  return { valid: selected.length === 0, findings: selected };
}

function archiveUnlocked(
  cwd: string,
  prefix: string,
  clock: () => Date,
  context: IssueMutationContext,
  id: string,
): ArchiveReport {
  assertIssueId(id, prefix, 'issue');
  const storage = discoverCanonical(cwd, prefix);
  const root = resolveIssueCandidate(storage, id);
  if (root.location === 'archived') {
    return {
      archived: [],
      skipped: [id],
      location: '.issues/archived/',
      revisions: { [id]: requireDecoded(root).decoded?.revision ?? '' },
    };
  }
  assertGloballyValidForMutation(cwd, prefix);
  const entities = globalEntityMap(storage);
  const archived: string[] = [];
  const skipped: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (issueId: string): void => {
    if (visiting.has(issueId)) throw invariant('hierarchy cycle detected while planning recursive archive');
    if (visited.has(issueId)) return;
    const entity = entities.get(issueId);
    if (!entity) throw invariant(`archive descendant does not resolve: ${issueId}`);
    visiting.add(issueId);
    if (entity.location === 'active') archived.push(issueId);
    else skipped.push(issueId);
    for (const childId of [...(entity.issue.children ?? [])].sort(compareCodePoints)) visit(childId);
    visiting.delete(issueId);
    visited.add(issueId);
    if (visited.size > 10_000) {
      throw new IssueError('resource_limit', 'recursive archive issue limit exceeded', { limit: 'archiveIssues' });
    }
  };
  visit(id);
  archived.sort(compareCodePoints);
  skipped.sort(compareCodePoints);

  const archiveSet = new Set(archived);
  const timestamp = canonicalTimestamp(clock());
  const actions: IssueTransactionActionPlan[] = archived.map((issueId) => {
    const entity = entities.get(issueId);
    if (!entity) throw invariant(`archive issue does not resolve: ${issueId}`);
    const parentId = entity.issue.parent;
    const parent = parentId ? entities.get(parentId) : undefined;
    if (!parent || parent.location !== 'active' || archiveSet.has(parentId as string)) {
      return moveAction(entity, entity.issue, archivedPath(entity.issue));
    }
    const detached: CanonicalIssueDocument = { ...entity.issue, updated_at: timestamp };
    delete detached.parent;
    return moveAction(entity, detached, archivedPath(detached));
  });
  const detachedByParent = new Map<string, string[]>();
  for (const issueId of archived) {
    const parentId = entities.get(issueId)?.issue.parent;
    const parent = parentId ? entities.get(parentId) : undefined;
    if (parent && parent.location === 'active' && !archiveSet.has(parentId as string)) {
      const children = detachedByParent.get(parent.issue.id) ?? [];
      children.push(issueId);
      detachedByParent.set(parent.issue.id, children);
    }
  }
  const revisions: Record<string, string> = {};
  for (const action of actions) {
    if (action.resultingRevision) revisions[action.issueId] = action.resultingRevision;
  }
  for (const [parentId, children] of [...detachedByParent].sort(([left], [right]) => compareCodePoints(left, right))) {
    const parent = entities.get(parentId);
    if (!parent) throw invariant(`archive parent does not resolve: ${parentId}`);
    const next = removeReferences(parent.issue, 'children', children, timestamp);
    const action = rewriteAction(parent, next);
    actions.push(action);
    if (action.resultingRevision) revisions[parentId] = action.resultingRevision;
  }
  const result = context.commit({ operation: 'archive', actions });
  return {
    archived,
    skipped,
    location: '.issues/archived/',
    revisions,
    transactionId: result.transactionId,
  };
}

interface Entity {
  issue: CanonicalIssueDocument;
  path: string;
  revision: string;
  location: IssueLocation;
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
  const entities = new Map<string, Entity>();
  for (const [id, candidates] of storage.byId) {
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (candidate?.decoded && !candidate.error) entities.set(id, entityFromCandidate(candidate));
  }
  return entities;
}

function orderedEntities(entities: Map<string, Entity>): Entity[] {
  return [...entities.values()].sort((left, right) => compareCodePoints(left.issue.id, right.issue.id));
}

function addCycleFindings(
  entities: Map<string, Entity>,
  field: 'children' | 'depends_on',
  edges: (entity: Entity) => readonly string[],
  findings: ValidationFinding[],
): void {
  const states = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    if (states.get(id) === 'visited') return;
    if (states.get(id) === 'visiting') {
      const start = stack.indexOf(id);
      const cycle = stack.slice(start).sort(compareCodePoints);
      const key = cycle.join('\0');
      const owner = entities.get(cycle[0] ?? '');
      if (owner && !reported.has(key)) {
        reported.add(key);
        findings.push({
          issue: owner.issue.id,
          severity: 'error',
          category: 'domain_invariant',
          path: owner.path,
          field,
          message: `${field === 'children' ? 'hierarchy' : 'dependency'} cycle detected: ${cycle.join(', ')}`,
          remedy: `remove an edge from the ${field === 'children' ? 'hierarchy' : 'dependency'} cycle`,
        });
      }
      return;
    }
    states.set(id, 'visiting');
    stack.push(id);
    const entity = entities.get(id);
    for (const target of entity ? [...edges(entity)].sort(compareCodePoints) : []) {
      if (entities.has(target)) visit(target);
    }
    stack.pop();
    states.set(id, 'visited');
  };
  for (const entity of orderedEntities(entities)) visit(entity.issue.id);
}

function entityFromCandidate(candidate: IssueStorageCandidate): Entity {
  const decoded = requireDecoded(candidate).decoded;
  if (!decoded) throw new IssueError('schema', 'canonical issue was not decoded');
  return { issue: decoded.issue, path: candidate.path, revision: decoded.revision, location: candidate.location };
}

function requireActiveEntity(entities: Map<string, Entity>, id: string): Entity {
  const entity = entities.get(id);
  if (!entity) throw new IssueError('schema', `active canonical issue was not found: ${id}`, { issueIds: [id] });
  return entity;
}

function resolveActive(cwd: string, prefix: string, id: string): IssueStorageCandidate {
  assertIssueId(id, prefix, 'issue');
  return resolveIssueCandidate(discoverCanonical(cwd, prefix), id, 'active');
}

function resolveActiveOrArchived(cwd: string, prefix: string, id: string): IssueStorageCandidate {
  assertIssueId(id, prefix, 'issue');
  return resolveIssueCandidate(discoverCanonical(cwd, prefix), id);
}

function issueFromCandidate(candidate: IssueStorageCandidate): Issue {
  return issueFromEntity(entityFromCandidate(candidate));
}

function issueFromEntity(entity: Entity): Issue {
  const { version, body, comments, metadata: customMetadata, ...managed } = entity.issue;
  return {
    id: entity.issue.id,
    path: entity.path,
    metadata: { ...managed, ...(customMetadata ? { metadata: customMetadata } : {}) },
    body,
    revision: entity.revision,
    version,
    comments: comments.map((comment) => ({ ...comment })),
    location: entity.location,
  };
}

function discoverCanonical(cwd: string, prefix: string, mutable = false): IssueStorageCatalog {
  const storage = discoverIssueStorage(cwd, { issuePrefix: prefix });
  if (storage.status === 'empty' && mutable) return storage;
  if (storage.status === 'empty' || storage.status === 'canonical') return storage;
  throw new IssueError('storage_classification', `issue storage is ${storage.status}`, {
    paths: storage.findings.flatMap((finding) => (finding.path ? [finding.path] : [])),
  });
}

function createAction(issue: CanonicalIssueDocument, destination: string): IssueTransactionActionPlan {
  const bytes = encodeCanonicalIssue(issue);
  return {
    issueId: issue.id,
    kind: 'create',
    destination,
    afterBytes: bytes,
    resultingRevision: revisionForBytes(bytes),
  };
}

function rewriteAction(entity: Entity, issue: CanonicalIssueDocument): IssueTransactionActionPlan {
  const bytes = encodeCanonicalIssue(issue);
  return {
    issueId: issue.id,
    kind: 'rewrite',
    source: entity.path,
    destination: entity.path,
    afterBytes: bytes,
    expectedBeforeDigest: digestFromRevision(entity.revision),
    resultingRevision: revisionForBytes(bytes),
  };
}

function moveAction(entity: Entity, issue: CanonicalIssueDocument, destination: string): IssueTransactionActionPlan {
  const bytes = encodeCanonicalIssue(issue);
  return {
    issueId: issue.id,
    kind: 'move',
    source: entity.path,
    destination,
    afterBytes: bytes,
    expectedBeforeDigest: digestFromRevision(entity.revision),
    resultingRevision: revisionForBytes(bytes),
  };
}

function activePath(issue: CanonicalIssueDocument): string {
  return `.issues/${canonicalIssueFilename(issue.id, issue.title)}`;
}

function archivedPath(issue: CanonicalIssueDocument): string {
  return `.issues/archived/${canonicalIssueFilename(issue.id, issue.title)}`;
}

function setReference(
  issue: CanonicalIssueDocument,
  field: ReferenceField | Relationship,
  value: string,
  add: boolean,
  timestamp: string,
): CanonicalIssueDocument {
  const current = [...((issue[field as keyof CanonicalIssueDocument] as string[] | undefined) ?? [])];
  const next = add ? sortedUnique([...current, value]) : current.filter((entry) => entry !== value);
  const result: CanonicalIssueDocument = { ...issue, comments: [...issue.comments], updated_at: timestamp };
  if (next.length > 0) (result as unknown as Record<string, unknown>)[field] = next;
  else delete (result as unknown as Record<string, unknown>)[field];
  return result;
}

function removeReferences(
  issue: CanonicalIssueDocument,
  field: ReferenceField,
  values: readonly string[],
  timestamp: string,
): CanonicalIssueDocument {
  const removed = new Set(values);
  const next = ((issue[field] as string[] | undefined) ?? []).filter((entry) => !removed.has(entry));
  const result: CanonicalIssueDocument = { ...issue, comments: [...issue.comments], updated_at: timestamp };
  if (next.length > 0) (result as unknown as Record<string, unknown>)[field] = next;
  else delete (result as unknown as Record<string, unknown>)[field];
  return result;
}

function validateParentType(parent: Entity, childType: IssueType): void {
  if (!ALLOWED_PARENT_TYPES[childType].includes(parent.issue.type)) {
    throw invariant(`invalid parent type "${parent.issue.type}" for ${childType}`);
  }
}

function hasHierarchyPath(entities: Map<string, Entity>, from: string, target: string): boolean {
  let current: string | undefined = target;
  const seen = new Set<string>();
  while (current) {
    if (current === from) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = entities.get(current)?.issue.parent;
  }
  return false;
}

function hasDependencyPath(
  entities: Map<string, Entity>,
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

function allocateIssueId(storage: IssueStorageCatalog, prefix: string): string {
  const expression = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, 'u');
  let maximum = 0n;
  for (const id of storage.reservedIds) {
    const digits = expression.exec(id)?.[1];
    if (digits && BigInt(digits) > maximum) maximum = BigInt(digits);
  }
  const sequence = maximum + 1n;
  return `${prefix}${sequence.toString().padStart(5, '0')}`;
}

function assertGloballyValidForMutation(cwd: string, prefix: string): void {
  const validation = validateUnlocked(cwd, prefix);
  if (validation.valid) return;
  throw new IssueError('domain_invariant', 'cannot mutate an invalid canonical issue graph', {
    issueIds: sortedUnique(validation.findings.flatMap((finding) => (finding.issue ? [finding.issue] : []))),
    paths: sortedUnique(validation.findings.flatMap((finding) => (finding.path ? [finding.path] : []))),
  });
}

function isCreateDestinationRace(error: unknown, destination: string): boolean {
  return (
    error instanceof IssueError && error.category === 'stale_revision' && error.paths?.includes(destination) === true
  );
}

function compareCandidatesById(left: IssueStorageCandidate, right: IssueStorageCandidate): number {
  const leftSequence = /([0-9]+)$/u.exec(left.id)?.[1];
  const rightSequence = /([0-9]+)$/u.exec(right.id)?.[1];
  if (leftSequence && rightSequence) {
    const difference = BigInt(leftSequence) - BigInt(rightSequence);
    if (difference !== 0n) return difference < 0n ? -1 : 1;
  }
  return compareCodePoints(left.id, right.id);
}

function requireDecoded(candidate: IssueStorageCandidate): IssueStorageCandidate {
  if (candidate.error) throw candidate.error;
  if (!candidate.decoded)
    throw new IssueError('schema', 'canonical issue candidate was not decoded', { paths: [candidate.path] });
  return candidate;
}

function validateDocumentPath(cwd: string, value: string, kind?: string): string {
  if (kind !== undefined && kind !== 'task' && kind !== 'design')
    throw new IssueError('schema', `invalid document kind: ${kind}`);
  const normalized = value.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new IssueError('path_safety', 'invalid repository-relative document path');
  }
  const taskRoot = configuredTaskRoot(cwd);
  const inTaskRoot = isUnderRoot(normalized, taskRoot);
  const inDesignRoot = isUnderRoot(normalized, '.specs');
  if (!inTaskRoot && !inDesignRoot)
    throw new IssueError('path_safety', `document path must be under ${taskRoot}/ or .specs/`);
  if (kind === 'task' && !inTaskRoot) throw new IssueError('path_safety', `task documents must be under ${taskRoot}/`);
  if (kind === 'design' && !inDesignRoot) throw new IssueError('path_safety', 'design documents must be under .specs/');
  const absolute = join(cwd, normalized);
  const difference = relative(cwd, absolute);
  if (!difference || difference === '..' || difference.startsWith(`..${sep}`))
    throw new IssueError('path_safety', 'document path escapes repository');
  let cursor = cwd;
  for (const part of normalized.split('/')) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink())
      throw new IssueError('path_safety', 'symlink document paths are not allowed');
  }
  if (!existsSync(absolute) || !lstatSync(absolute).isFile())
    throw new IssueError('schema', `linked document does not exist: ${normalized}`);
  return normalized;
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

function parseIdsWithPrefix(prompt: string, prefix: string): string[] {
  const expression = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(prefix)}\\d+(?![A-Za-z0-9_-])`, 'gu');
  return [...new Set([...prompt.matchAll(expression)].map((match) => match[0]))];
}

function parseReferences(value: string | undefined, prefix: string, field: string): string[] {
  const values =
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  for (const entry of values) assertIssueId(entry, prefix, field);
  return sortedUnique(values);
}

function normalizeIssueId(value: string | undefined, prefix: string, field: string): string | undefined {
  const normalized = cleanOptional(value);
  if (normalized) assertIssueId(normalized, prefix, field);
  return normalized;
}

function assertIssueId(id: string, prefix: string, field: string): void {
  if (!new RegExp(`^${escapeRegex(prefix)}\\d+$`, 'u').test(id)) {
    throw new IssueError('schema', `invalid ${field} "${id}". It must match the configured issue prefix and a number.`);
  }
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
  const normalized = value.trim();
  if (!normalized) throw new IssueError('schema', `${field} is required`);
  return normalized;
}

function cleanOptional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function getIssuePrefix(cwd: string): string {
  const prefix = readIssuePrefix(cwd);
  if (prefix !== undefined) return prefix;
  const value = getConfigValue(cwd, 'issues.prefix');
  if (value instanceof ConfigError)
    throw new IssueError('configuration', `unable to read issue prefix: ${value.message}`);
  throw new IssueError('configuration', 'issue prefix must be a safe string');
}

function readIssuePrefix(cwd: string): string | undefined {
  const value = getConfigValue(cwd, 'issues.prefix');
  return typeof value === 'string' && /^[A-Za-z0-9_-]*$/u.test(value) ? value : undefined;
}

function canonicalTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new IssueError('configuration', 'issue clock is invalid');
  return value.toISOString();
}

function digestFromRevision(revision: string): string {
  if (!/^v1:[a-f0-9]{64}$/u.test(revision)) throw new IssueError('schema', 'canonical issue revision is malformed');
  return revision.slice(3);
}

function revisionForBytes(bytes: Uint8Array): string {
  return `v1:${createHash('sha256').update(bytes).digest('hex')}`;
}

function defaultBody(title: string): string {
  return `\n# ${title}\n\n## Summary\n\n\n## Comments\n`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodePoints);
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

function isUnderRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function invariant(message: string): IssueError {
  return new IssueError('domain_invariant', message);
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
          remedy:
            error.category === 'projection_sync'
              ? 'rebuild the projection successfully, then retry validation'
              : error.category === 'transaction_recovery'
                ? 'retain the transaction evidence, resolve reported conflicts, and retry recovery'
                : storageRemedy(error.category),
        }
      : {}),
    message: errorMessage(error),
  };
}

function storageRemedy(category: IssueError['category']): string {
  if (category === 'canonical_form') return 'rewrite the document using the canonical YAML encoder';
  if (category === 'identity_ambiguity') return 'remove duplicate or portable-colliding issue representations';
  if (category === 'path_safety') return 'replace the unsafe entry with a regular canonical file or directory';
  if (category === 'storage_classification') return 'migrate legacy storage before using canonical issue operations';
  return 'correct the canonical issue document and run validation again';
}

function compareValidationFindings(left: ValidationFinding, right: ValidationFinding): number {
  return (
    compareCodePoints(left.issue ?? '', right.issue ?? '') ||
    compareCodePoints(left.path ?? '', right.path ?? '') ||
    compareCodePoints(left.field ?? '', right.field ?? '') ||
    compareCodePoints(left.message, right.message)
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
