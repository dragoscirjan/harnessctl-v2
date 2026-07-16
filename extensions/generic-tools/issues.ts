import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { ConfigError, getConfigValue } from './config.js';

export const ISSUE_TYPES = ['initiative', 'epic', 'story', 'task', 'bug'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export const ISSUE_STATUSES = ['open', 'in_progress', 'done', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
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
}

export interface IssueSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  path: string;
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
}

export interface ValidationFinding {
  issue?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  findings: ValidationFinding[];
}

export interface ArchiveReport {
  archived: string[];
  skipped: string[];
  location: string;
}

const ALLOWED_PARENT_TYPES: Record<IssueType, readonly IssueType[]> = {
  initiative: [],
  epic: ['initiative'],
  story: ['epic', 'initiative'],
  task: ['story', 'epic'],
  bug: ['story', 'task', 'epic'],
};
const RELATIONSHIPS: readonly Relationship[] = ['depends_on', 'blocks', 'relates_to', 'duplicates', 'supersedes'];
const RESERVED_METADATA_KEYS = new Set([
  'id',
  'type',
  'title',
  'status',
  'created_at',
  'updated_at',
  'created_by',
  'assigned_to',
  'parent',
  'children',
  'depends_on',
  'blocks',
  'blocked_by',
  'relates_to',
  'duplicates',
  'supersedes',
  'documents',
]);

export function parseIssueIds(prompt: string, cwd: string = process.cwd()): string[] {
  const prefix = readIssuePrefix(cwd);
  if (prefix === undefined) return [];
  const expression = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(prefix)}\\d+(?![A-Za-z0-9_-])`, 'g');
  return [...new Set([...prompt.matchAll(expression)].map((match) => match[0]))];
}

export function parseIssueId(prompt: string, cwd: string = process.cwd()): string {
  return parseIssueIds(prompt, cwd)[0] ?? '';
}

export function createIssue(cwd: string, options: CreateIssueOptions): Issue {
  return createIssueRecord(cwd, options);
}

export function createIssueRecord(cwd: string, options: CreateIssueOptions): Issue {
  const type = normalizeChoice(options.type, ISSUE_TYPES, 'type');
  const title = options.title.trim();
  if (!title) throw new Error('title is required');
  const status = normalizeChoice(options.status ?? 'open', ISSUE_STATUSES, 'status');
  const prefix = getIssuePrefix(cwd);
  for (const key of Object.keys(options.metadata ?? {})) {
    if (RESERVED_METADATA_KEYS.has(key)) throw new Error(`metadata field is managed by the issue tool: ${key}`);
  }
  const parent = normalizeIssueId(options.parent, prefix, 'parent');
  const depends = parseReferences(options.depends, prefix, 'depends');
  const issuesDir = join(cwd, '.issues');
  mkdirSync(issuesDir, { recursive: true });
  let parentRevision: string | undefined;
  if (parent) {
    const parentIssue = readIssue(cwd, parent);
    validateParentType(parentIssue, type);
    parentRevision = revision(parentIssue);
  }
  for (const dependency of depends) readIssue(cwd, dependency);

  const timestamp = new Date().toISOString();
  const metadata: Record<string, unknown> = {
    ...(options.metadata ?? {}),
    id: '',
    type,
    title,
    status,
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (parent) metadata.parent = parent;
  if (depends.length > 0) metadata.depends_on = depends;
  if (options.author?.trim()) metadata.created_by = options.author.trim();
  if (options.assignee?.trim()) metadata.assigned_to = options.assignee.trim();

  const issue = writeNewIssue(issuesDir, prefix, metadata, defaultBody(title));
  if (parent) {
    try {
      updateReference(cwd, parent, 'children', issue.id, true, parentRevision);
    } catch (error: unknown) {
      rmSync(join(issuesDir, issue.id), { recursive: true, force: true });
      throw error;
    }
  }
  return issue;
}

export function getIssue(cwd: string, id: string): Issue {
  return readIssue(cwd, id);
}

export function listIssueSummaries(cwd: string, options: ListIssueOptions = {}): IssueSummary[] {
  const status = normalizeFilter(options.status);
  const type = normalizeFilter(options.type);
  return activeIssuePaths(cwd)
    .map((path) => parseIssueFile(cwd, path))
    .filter((issue) => !status || stringValue(issue.metadata.status)?.toLowerCase() === status)
    .filter((issue) => !type || stringValue(issue.metadata.type)?.toLowerCase() === type)
    .map((issue) => ({
      id: issue.id,
      type: stringValue(issue.metadata.type) ?? 'unknown',
      title: stringValue(issue.metadata.title) ?? '',
      status: stringValue(issue.metadata.status) ?? 'unknown',
      path: issue.path,
    }));
}

export function listIssues(cwd: string, options: ListIssueOptions = {}): IssueSummary[] {
  return listIssueSummaries(cwd, options);
}

export function updateIssue(cwd: string, id: string, changes: IssueUpdateChanges): Issue {
  const prefix = getIssuePrefix(cwd);
  assertIssueId(id, prefix, 'issue');
  if (!changes.expectedRevision) throw new Error('expected revision is required');
  return withIssueLock(cwd, id, () => updateIssueUnlocked(cwd, id, changes));
}

function updateIssueUnlocked(cwd: string, id: string, changes: IssueUpdateChanges): Issue {
  const issue = readIssue(cwd, id);
  if (changes.expectedRevision && changes.expectedRevision !== revision(issue)) {
    throw new Error(`issue ${id} changed since the expected revision was calculated`);
  }
  const metadata = { ...issue.metadata };
  if (changes.type !== undefined) metadata.type = normalizeChoice(changes.type, ISSUE_TYPES, 'type');
  if (changes.title !== undefined) {
    if (!changes.title.trim()) throw new Error('title is required');
    metadata.title = changes.title.trim();
  }
  if (changes.status !== undefined) metadata.status = normalizeChoice(changes.status, ISSUE_STATUSES, 'status');
  if (changes.author !== undefined) metadata.created_by = changes.author.trim();
  if (changes.assignee !== undefined) metadata.assigned_to = changes.assignee.trim();
  const currentParent = stringValue(metadata.parent);
  const nextParent = changes.parent === undefined ? currentParent : cleanOptional(changes.parent ?? undefined);
  const prefix = getIssuePrefix(cwd);
  const parentRevisions = new Map<string, string>();
  for (const parentId of new Set([currentParent, nextParent])) {
    if (parentId && parentId !== id) {
      assertIssueId(parentId, prefix, 'parent');
      parentRevisions.set(parentId, revision(readIssue(cwd, parentId)));
    }
  }
  if (nextParent) {
    assertIssueId(nextParent, prefix, 'parent');
    const parent = readIssue(cwd, nextParent);
    validateParentType(parent, stringValue(metadata.type) as IssueType);
    if (nextParent === id) throw new Error('an issue cannot be its own parent');
    metadata.parent = nextParent;
  } else {
    delete metadata.parent;
  }
  if (changes.type !== undefined && metadata.type !== issue.metadata.type) {
    for (const child of referenceList(issue.metadata.children)) {
      const childIssue = readIssue(cwd, child);
      const childType = stringValue(childIssue.metadata.type);
      if (!childType || !ISSUE_TYPES.includes(childType as IssueType))
        throw new Error(`child issue "${child}" has an invalid type`);
      validateParentType({ ...issue, metadata: { ...metadata } }, childType as IssueType);
    }
  }
  metadata.updated_at = new Date().toISOString();
  const body = changes.sections ? updateSections(issue.body, changes.sections) : (changes.body ?? issue.body);
  writeIssue(join(cwd, issue.path), metadata, body);
  if (nextParent !== currentParent) {
    let oldParentRemoved = false;
    let newParentAdded = false;
    let oldParentRevision: string | undefined;
    let newParentRevision: string | undefined;
    try {
      if (currentParent) {
        oldParentRevision = updateReference(
          cwd,
          currentParent,
          'children',
          id,
          false,
          parentRevisions.get(currentParent),
        );
        oldParentRemoved = true;
      }
      if (nextParent) {
        newParentRevision = updateReference(cwd, nextParent, 'children', id, true, parentRevisions.get(nextParent));
        newParentAdded = true;
      }
    } catch (error: unknown) {
      try {
        if (newParentAdded && nextParent) updateReference(cwd, nextParent, 'children', id, false, newParentRevision);
        if (oldParentRemoved && currentParent)
          updateReference(cwd, currentParent, 'children', id, true, oldParentRevision);
      } catch (rollbackError: unknown) {
        throw new Error(
          `parent update failed and rollback was incomplete: ${errorMessage(error)}; ${errorMessage(rollbackError)}`,
        );
      }
      writeIssue(join(cwd, issue.path), issue.metadata, issue.body);
      throw error;
    }
  }
  return readIssue(cwd, id);
}

export function transitionIssue(cwd: string, id: string, status: string, expectedRevision: string): Issue {
  return updateIssue(cwd, id, { status, expectedRevision });
}

export function commentIssue(cwd: string, id: string, body: string, author: string): IssueComment {
  const issue = readIssue(cwd, id);
  if (!body.trim()) throw new Error('comment body is required');
  if (!author.trim()) throw new Error('comment author is required');
  const commentsDir = join(cwd, '.issues', id, 'comments');
  mkdirSync(commentsDir, { recursive: true });
  let next = nextCommentNumber(commentsDir);
  while (true) {
    const commentId = `${id}-C${String(next).padStart(4, '0')}`;
    const timestamp = new Date().toISOString();
    const commentPath = join(commentsDir, `${String(next).padStart(4, '0')}.md`);
    try {
      writeFileSync(
        commentPath,
        `---\nid: ${JSON.stringify(commentId)}\nissue: ${JSON.stringify(id)}\ncreated_at: ${JSON.stringify(timestamp)}\ncreated_by: ${JSON.stringify(author.trim())}\n---\n\n${body.trim()}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      try {
        updateIssue(cwd, id, { expectedRevision: revision(issue) });
      } catch (error: unknown) {
        rmSync(commentPath, { force: true });
        throw error;
      }
      return {
        id: commentId,
        issue: id,
        path: relativePath(cwd, commentPath),
        created_at: timestamp,
        created_by: author.trim(),
        body: body.trim(),
      };
    } catch (error: unknown) {
      if (isAlreadyExistsError(error)) {
        next += 1;
        continue;
      }
      throw error;
    }
  }
}

export function relateIssue(cwd: string, id: string, relationship: string, targetId: string): Issue {
  assertRelationship(relationship);
  const sourceIssue = readIssue(cwd, id);
  const targetIssue = readIssue(cwd, targetId);
  if (id === targetId) throw new Error('an issue cannot reference itself');
  const prefix = getIssuePrefix(cwd);
  assertIssueId(targetId, prefix, 'target');
  if (relationship === 'depends_on' && hasDependencyPath(cwd, targetId, id))
    throw new Error('dependency cycle detected');
  const sourceHadReference = referenceList(sourceIssue.metadata[relationship]).includes(targetId);
  const inverseField = inverseRelationship(relationship);
  const targetHadReference = inverseField ? referenceList(targetIssue.metadata[inverseField]).includes(id) : false;
  const sourceRevision = updateReference(cwd, id, relationship, targetId, true, revision(sourceIssue));
  let targetRevision: string | undefined;
  try {
    if (relationship === 'blocks')
      targetRevision = updateReference(cwd, targetId, 'blocked_by', id, true, revision(targetIssue));
    if (relationship === 'duplicates')
      targetRevision = updateReference(cwd, targetId, relationship, id, true, revision(targetIssue));
  } catch (error: unknown) {
    try {
      if (targetRevision)
        updateReference(cwd, targetId, inverseField ?? relationship, id, targetHadReference, targetRevision);
      updateReference(cwd, id, relationship, targetId, sourceHadReference, sourceRevision);
    } catch (rollbackError: unknown) {
      throw new Error(
        `relationship update failed and rollback was incomplete: ${errorMessage(error)}; ${errorMessage(rollbackError)}`,
      );
    }
    throw error;
  }
  return readIssue(cwd, id);
}

export function unrelateIssue(cwd: string, id: string, relationship: string, targetId: string): Issue {
  assertRelationship(relationship);
  const sourceIssue = readIssue(cwd, id);
  const targetIssue = readIssue(cwd, targetId);
  const sourceHadReference = referenceList(sourceIssue.metadata[relationship]).includes(targetId);
  const inverseField = inverseRelationship(relationship);
  const targetHadReference = inverseField ? referenceList(targetIssue.metadata[inverseField]).includes(id) : false;
  const sourceRevision = updateReference(cwd, id, relationship, targetId, false, revision(sourceIssue));
  let targetRevision: string | undefined;
  try {
    if (relationship === 'blocks')
      targetRevision = updateReference(cwd, targetId, 'blocked_by', id, false, revision(targetIssue));
    if (relationship === 'duplicates')
      targetRevision = updateReference(cwd, targetId, relationship, id, false, revision(targetIssue));
  } catch (error: unknown) {
    try {
      if (targetRevision)
        updateReference(cwd, targetId, inverseField ?? relationship, id, targetHadReference, targetRevision);
      updateReference(cwd, id, relationship, targetId, sourceHadReference, sourceRevision);
    } catch (rollbackError: unknown) {
      throw new Error(
        `relationship update failed and rollback was incomplete: ${errorMessage(error)}; ${errorMessage(rollbackError)}`,
      );
    }
    throw error;
  }
  return readIssue(cwd, id);
}

export function linkDocument(cwd: string, id: string, documentPath: string, kind?: string): Issue {
  const issue = readIssue(cwd, id);
  const normalizedPath = validateDocumentPath(cwd, documentPath);
  if (kind && !['task', 'design'].includes(kind)) throw new Error(`invalid document kind: ${kind}`);
  const taskRoot = configuredTaskRoot(cwd);
  if (kind === 'task' && !isUnderRoot(normalizedPath, taskRoot))
    throw new Error(`task documents must be under ${taskRoot}/`);
  if (kind === 'design' && !normalizedPath.startsWith('.specs/'))
    throw new Error('design documents must be under .specs/');
  if (!existsSync(join(cwd, normalizedPath))) throw new Error(`linked document does not exist: ${normalizedPath}`);
  updateReference(cwd, id, 'documents', normalizedPath, true, revision(issue));
  return readIssue(cwd, issue.id);
}

export function validateIssues(cwd: string, id?: string): ValidationReport {
  let paths: string[];
  if (id) {
    try {
      assertIssueId(id, getIssuePrefix(cwd), 'issue');
      paths = [join(cwd, '.issues', id, 'issue.md')];
    } catch (error: unknown) {
      return { valid: false, findings: [{ issue: id, severity: 'error', message: errorMessage(error) }] };
    }
  } else {
    paths = activeIssuePaths(cwd);
  }
  const findings: ValidationFinding[] = [];
  for (const path of paths) {
    let issue: Issue;
    try {
      issue = parseIssueFile(cwd, path);
    } catch (error: unknown) {
      findings.push({ issue: id, severity: 'error', message: errorMessage(error) });
      continue;
    }
    const add = (message: string, severity: ValidationFinding['severity'] = 'error'): void => {
      findings.push({ issue: issue.id, severity, message });
    };
    const prefix = readIssuePrefix(cwd);
    const directoryId = path.split(sep).at(-2);
    if (directoryId !== issue.id || prefix === undefined || !new RegExp(`^${escapeRegex(prefix)}\\d+$`).test(issue.id))
      add('invalid issue ID or filename');
    for (const required of ['id', 'type', 'title', 'status', 'created_at', 'updated_at']) {
      if (issue.metadata[required] === undefined || issue.metadata[required] === '')
        add(`missing required metadata: ${required}`);
    }
    const type = stringValue(issue.metadata.type);
    const status = stringValue(issue.metadata.status);
    if (!type || !ISSUE_TYPES.includes(type as IssueType)) add('invalid type');
    if (!status || !ISSUE_STATUSES.includes(status as IssueStatus)) add('invalid status');
    const parent = stringValue(issue.metadata.parent);
    if (parent) {
      if (parent === issue.id) add('self-reference in parent');
      try {
        const parentIssue = readIssue(cwd, parent);
        if (type && ISSUE_TYPES.includes(type as IssueType)) validateParentType(parentIssue, type as IssueType);
        if (!referenceList(parentIssue.metadata.children).includes(issue.id))
          add(`parent ${parent} does not list this issue as a child`);
      } catch (error: unknown) {
        add(errorMessage(error));
      }
    }
    for (const child of referenceList(issue.metadata.children)) {
      if (child === issue.id) add('self-reference in children');
      try {
        const childIssue = readIssue(cwd, child);
        if (stringValue(childIssue.metadata.parent) !== issue.id)
          add(`child ${child} does not reference this issue as parent`);
      } catch (error: unknown) {
        add(errorMessage(error));
      }
    }
    for (const key of ['depends_on', 'blocks', 'relates_to', 'duplicates', 'supersedes', 'blocked_by', 'documents']) {
      for (const reference of referenceList(issue.metadata[key])) {
        if (reference === issue.id) add(`self-reference in ${key}`);
        if (key === 'documents') {
          try {
            validateDocumentPath(cwd, reference);
            if (!existsSync(join(cwd, reference))) add(`linked document does not exist: ${reference}`);
          } catch (error: unknown) {
            add(errorMessage(error));
          }
        } else {
          try {
            readIssue(cwd, reference);
          } catch (error: unknown) {
            add(errorMessage(error));
          }
        }
      }
    }
    try {
      if (referenceList(issue.metadata.depends_on).some((dependency) => hasDependencyPath(cwd, dependency, issue.id)))
        add('dependency cycle detected');
    } catch (error: unknown) {
      add(errorMessage(error));
    }
  }
  return { valid: findings.every((finding) => finding.severity !== 'error'), findings };
}

export function archiveIssue(cwd: string, id: string): ArchiveReport {
  return archiveIssueReport(cwd, id);
}

export function archiveIssueReport(cwd: string, id: string): ArchiveReport {
  const prefix = getIssuePrefix(cwd);
  assertIssueId(id, prefix, 'issue');
  const issuesDir = join(cwd, '.issues');
  const archiveDir = join(issuesDir, 'archived');
  const rootPath = join(issuesDir, id);
  if (!existsSync(rootPath)) {
    if (existsSync(join(archiveDir, id))) return { archived: [], skipped: [id], location: '.issues/archived/' };
    throw new Error(`issue ${id} does not exist in .issues/`);
  }
  const candidates = collectIssueTree(issuesDir, id, prefix);
  mkdirSync(archiveDir, { recursive: true });
  const archived: string[] = [];
  const skipped: string[] = [];
  const detached: Array<{ parent: string; children: string[]; revision: string }> = [];
  const conflicts: string[] = [];
  for (const issueId of candidates) {
    const source = join(issuesDir, issueId);
    const destination = join(archiveDir, issueId);
    if (existsSync(source) && existsSync(destination)) conflicts.push(issueId);
    else if (!existsSync(source) && existsSync(destination)) skipped.push(issueId);
  }
  if (conflicts.length > 0)
    throw new Error(`cannot archive issue tree because destinations already exist: ${conflicts.join(', ')}`);
  try {
    const childrenByParent = new Map<string, string[]>();
    for (const issueId of candidates) {
      const issuePath = join(issuesDir, issueId, 'issue.md');
      if (!existsSync(issuePath)) continue;
      const parent = stringValue(readFrontmatter(readFileSync(issuePath, 'utf8')).parent);
      if (parent) assertIssueId(parent, prefix, 'parent');
      if (parent && !candidates.includes(parent) && existsSync(join(issuesDir, parent, 'issue.md'))) {
        childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), issueId]);
      }
    }
    for (const [parent, children] of childrenByParent) {
      const parentIssue = readIssue(cwd, parent);
      const parentRevision = updateReferences(cwd, parent, 'children', children, false, revision(parentIssue));
      detached.push({ parent, children, revision: parentRevision });
    }
    for (const issueId of candidates) {
      const source = join(issuesDir, issueId);
      const destination = join(archiveDir, issueId);
      if (existsSync(source)) {
        renameSync(source, destination);
        archived.push(issueId);
      }
    }
  } catch (error: unknown) {
    rollbackArchive(issuesDir, archiveDir, archived, detached, error);
    throw error;
  }
  return { archived, skipped, location: '.issues/archived/' };
}

function readIssue(cwd: string, id: string): Issue {
  const prefix = getIssuePrefix(cwd);
  assertIssueId(id, prefix, 'issue');
  const path = join(cwd, '.issues', id, 'issue.md');
  if (!existsSync(path)) throw new Error(`issue ${id} does not exist`);
  return parseIssueFile(cwd, path);
}

function withIssueLock<T>(cwd: string, id: string, operation: () => T): T {
  const locksDir = join(cwd, '.issues', '.locks');
  const lockPath = join(locksDir, `${id}.lock`);
  mkdirSync(locksDir, { recursive: true });
  try {
    mkdirSync(lockPath);
  } catch (error: unknown) {
    if (isAlreadyExistsError(error)) throw new Error(`issue ${id} is currently locked`);
    throw error;
  }
  try {
    return operation();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function parseIssueFile(cwd: string, path: string): Issue {
  const content = readFileSync(path, 'utf8');
  const boundary = content.indexOf('\n---', 4);
  if (!content.startsWith('---\n') || boundary < 0) throw new Error(`invalid frontmatter: ${relativePath(cwd, path)}`);
  const source = content.slice(4, boundary);
  const document = parseDocument(source);
  if (document.errors.length > 0) throw new Error(`invalid frontmatter: ${document.errors[0]?.message}`);
  const value = document.toJS();
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`invalid frontmatter: ${relativePath(cwd, path)}`);
  const metadata = value as Record<string, unknown>;
  const id = stringValue(metadata.id);
  if (!id) throw new Error(`issue file has no id: ${relativePath(cwd, path)}`);
  const issue = { id, path: relativePath(cwd, path), metadata, body: content.slice(boundary + 4).replace(/^\n/, '') };
  return { ...issue, revision: revision(issue) };
}

function writeIssue(path: string, metadata: Record<string, unknown>, body: string): void {
  const absolute = path.startsWith(sep) ? path : path;
  const content = `---\n${stringify(metadata).trimEnd()}\n---\n${body.startsWith('\n') ? body : `\n${body}`}`;
  const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporary, absolute);
}

function writeNewIssue(issuesDir: string, prefix: string, metadata: Record<string, unknown>, body: string): Issue {
  let sequence = nextIssueSequence(issuesDir, prefix);
  while (true) {
    const id = `${prefix}${String(sequence).padStart(5, '0')}`;
    const directory = join(issuesDir, id);
    try {
      mkdirSync(directory);
      metadata.id = id;
      const path = join(directory, 'issue.md');
      writeIssue(path, metadata, body);
      const issue = {
        id,
        path: relativePath(issuesDir.slice(0, issuesDir.length - '.issues'.length), path),
        metadata: { ...metadata },
        body,
      };
      return { ...issue, revision: revision(issue) };
    } catch (error: unknown) {
      if (!isAlreadyExistsError(error)) throw error;
      sequence += 1;
    }
  }
}

function updateReference(
  cwd: string,
  id: string,
  field: string,
  value: string,
  add: boolean,
  expectedRevision?: string,
): string {
  return updateReferences(cwd, id, field, [value], add, expectedRevision);
}

function updateReferences(
  cwd: string,
  id: string,
  field: string,
  values: string[],
  add: boolean,
  expectedRevision?: string,
): string {
  const issue = readIssue(cwd, id);
  if (expectedRevision && expectedRevision !== revision(issue))
    throw new Error(`issue ${id} changed before reference update`);
  const references = referenceList(issue.metadata[field]);
  const next = add ? [...new Set([...references, ...values])] : references.filter((item) => !values.includes(item));
  const metadata = { ...issue.metadata };
  if (next.length > 0) metadata[field] = next;
  else delete metadata[field];
  metadata.updated_at = new Date().toISOString();
  writeIssue(join(cwd, issue.path), metadata, issue.body);
  return revision(readIssue(cwd, id));
}

function collectIssueTree(issuesDir: string, rootId: string, prefix: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    result.push(id);
    const activePath = join(issuesDir, id, 'issue.md');
    const archivedPath = join(issuesDir, 'archived', id, 'issue.md');
    const path = existsSync(activePath) ? activePath : archivedPath;
    if (!existsSync(path)) return;
    for (const child of referenceList(readFrontmatter(readFileSync(path, 'utf8')).children)) {
      assertIssueId(child, prefix, 'child');
      if (existsSync(join(issuesDir, child, 'issue.md')) || existsSync(join(issuesDir, 'archived', child, 'issue.md')))
        visit(child);
    }
  };
  visit(rootId);
  return result;
}

function rollbackArchive(
  issuesDir: string,
  archiveDir: string,
  moved: string[],
  detached: Array<{ parent: string; children: string[]; revision: string }>,
  original: unknown,
): void {
  const failures: string[] = [];
  for (const id of [...moved].reverse()) {
    try {
      if (existsSync(join(archiveDir, id)) && !existsSync(join(issuesDir, id)))
        renameSync(join(archiveDir, id), join(issuesDir, id));
    } catch (error: unknown) {
      failures.push(`${id}: ${errorMessage(error)}`);
    }
  }
  for (const { parent, children, revision: detachedRevision } of detached.reverse()) {
    try {
      updateReferences(
        issuesDir.slice(0, issuesDir.length - '.issues'.length),
        parent,
        'children',
        children,
        true,
        detachedRevision,
      );
    } catch (error: unknown) {
      failures.push(`${parent}/${children.join(',')}: ${errorMessage(error)}`);
    }
  }
  if (failures.length > 0)
    throw new Error(`archive failed and rollback was incomplete: ${errorMessage(original)}; ${failures.join('; ')}`);
}

function nextIssueSequence(issuesDir: string, prefix: string): number {
  const expression = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  return (
    Math.max(
      0,
      ...allIssueDirectoryNames(issuesDir).flatMap((id) => {
        const match = id.match(expression);
        return match?.[1] ? [Number.parseInt(match[1], 10)] : [];
      }),
    ) + 1
  );
}

function allIssueDirectoryNames(issuesDir: string): string[] {
  if (!existsSync(issuesDir)) return [];
  const active = readdirSync(issuesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archived')
    .map((entry) => entry.name);
  const archivedDir = join(issuesDir, 'archived');
  if (!existsSync(archivedDir)) return active;
  return active.concat(
    readdirSync(archivedDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

function activeIssuePaths(cwd: string): string[] {
  const issuesDir = join(cwd, '.issues');
  if (!existsSync(issuesDir)) return [];
  return readdirSync(issuesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name !== 'archived' && existsSync(join(issuesDir, entry.name, 'issue.md')),
    )
    .map((entry) => join(issuesDir, entry.name, 'issue.md'))
    .sort();
}

function validateParentType(parent: Issue, childType: IssueType): void {
  const parentType = stringValue(parent.metadata.type);
  if (!parentType || !ISSUE_TYPES.includes(parentType as IssueType))
    throw new Error(`parent issue "${parent.id}" has an invalid type`);
  if (!ALLOWED_PARENT_TYPES[childType].includes(parentType as IssueType))
    throw new Error(`invalid parent type "${parentType}" for ${childType}`);
}

function hasDependencyPath(cwd: string, from: string, target: string, visited = new Set<string>()): boolean {
  if (from === target) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  const issue = readIssue(cwd, from);
  return referenceList(issue.metadata.depends_on).some((dependency) =>
    hasDependencyPath(cwd, dependency, target, visited),
  );
}

function updateSections(body: string, sections: Record<string, string>): string {
  let result = body;
  for (const [name, value] of Object.entries(sections)) {
    if (typeof value !== 'string') throw new Error(`section "${name}" must contain string content`);
    const heading = `## ${name}`;
    const expression = new RegExp(`(^|\\n)${escapeRegex(heading)}\\n[\\s\\S]*?(?=\\n## |$)`);
    const replacement = `\n${heading}\n\n${value.trim()}\n`;
    result = expression.test(result) ? result.replace(expression, replacement) : `${result.trimEnd()}\n${replacement}`;
  }
  return result;
}

function validateDocumentPath(cwd: string, path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.includes(',') ||
    normalized.split('/').includes('..')
  )
    throw new Error(`invalid repository-relative document path: ${path}`);
  const taskRoot = configuredTaskRoot(cwd);
  if (!isUnderRoot(normalized, taskRoot) && !isUnderRoot(normalized, '.specs'))
    throw new Error(`document path must be under .harnessctl/tasks/ or .specs/: ${path}`);
  if (relative(cwd, join(cwd, normalized)).startsWith(`..${sep}`))
    throw new Error(`document path escapes repository: ${path}`);
  let target = cwd;
  for (const component of normalized.split('/')) {
    target = join(target, component);
    if (existsSync(target) && lstatSync(target).isSymbolicLink())
      throw new Error(`symlink document paths are not allowed: ${path}`);
  }
  return normalized;
}

function configuredTaskRoot(cwd: string): string {
  const value = getConfigValue(cwd, 'paths.tasks');
  if (value instanceof ConfigError || typeof value !== 'string' || !value.trim()) return '.harnessctl/tasks';
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/$/, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  )
    return '.harnessctl/tasks';
  return normalized;
}

function isUnderRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function assertRelationship(value: string): asserts value is Relationship {
  if (!RELATIONSHIPS.includes(value as Relationship)) throw new Error(`invalid relationship "${value}"`);
}

function inverseRelationship(value: string): string | undefined {
  if (value === 'blocks') return 'blocked_by';
  if (value === 'duplicates') return value;
  return undefined;
}

function readFrontmatter(content: string): Record<string, unknown> {
  const end = content.indexOf('\n---', 4);
  if (!content.startsWith('---\n') || end < 0) return {};
  const value = parseDocument(content.slice(4, end)).toJS();
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function referenceList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function parseReferences(value: string | undefined, prefix: string, field: string): string[] {
  const references =
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  for (const reference of references) assertIssueId(reference, prefix, field);
  return references;
}

function normalizeIssueId(value: string | undefined, prefix: string, field: string): string | undefined {
  const normalized = cleanOptional(value);
  if (normalized) assertIssueId(normalized, prefix, field);
  return normalized;
}

function assertIssueId(id: string, prefix: string, field: string): void {
  if (!new RegExp(`^${escapeRegex(prefix)}\\d+$`).test(id))
    throw new Error(`invalid ${field} "${id}". It must match the configured issue prefix and a number.`);
}

function getIssuePrefix(cwd: string): string {
  const prefix = readIssuePrefix(cwd);
  if (prefix !== undefined) return prefix;
  const value = getConfigValue(cwd, 'issues.prefix');
  if (value instanceof ConfigError) throw new Error(`unable to read issue prefix: ${value.message}`);
  throw new Error('issue prefix must be a safe string');
}

function readIssuePrefix(cwd: string): string | undefined {
  const value = getConfigValue(cwd, 'issues.prefix');
  return !value || typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)
    ? value === ''
      ? ''
      : undefined
    : value;
}

function normalizeChoice<T extends readonly string[]>(value: string, choices: T, field: string): T[number] {
  const normalized = value.trim().toLowerCase();
  if (!choices.includes(normalized))
    throw new Error(`invalid ${field} "${value}". Must be one of: ${choices.join(', ')}`);
  return normalized as T[number];
}

function normalizeFilter(value: string | undefined): string | undefined {
  return cleanOptional(value)?.toLowerCase();
}

function cleanOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function defaultBody(title: string): string {
  return `\n# ${title}\n\n## Summary\n\n\n## Comments\n`;
}

function nextCommentNumber(directory: string): number {
  return (
    Math.max(
      0,
      ...readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const match = entry.name.match(/^(\d+)\.md$/);
        return match?.[1] ? [Number.parseInt(match[1], 10)] : [];
      }),
    ) + 1
  );
}

function revision(issue: Pick<Issue, 'metadata' | 'body'>): string {
  return `${issue.metadata.updated_at ?? ''}:${issue.body}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function relativePath(cwd: string, path: string): string {
  return relative(cwd, path).replaceAll('\\', '/');
}
