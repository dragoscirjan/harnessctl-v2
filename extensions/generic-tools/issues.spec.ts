import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import {
  IssueError,
  decodeIssueDocument,
  encodeCanonicalIssue,
  issueMetadataText,
  type CanonicalIssueDocument,
} from './issues-contract.js';
import type { IssueProjectionChangeSet } from './issues-storage.js';
import {
  archiveIssueReport,
  commentIssue,
  createFilesystemIssueProvider,
  createIssue,
  getIssue,
  linkDocument,
  listIssues,
  parseIssueId,
  parseIssueIds,
  relateIssue,
  transitionIssue,
  type IssueUpdateChanges,
  unrelateIssue,
  updateIssue,
  validateIssues,
} from './issues.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function repository(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-issues-'));
  directories.push(cwd);
  createConfig(cwd);
  return cwd;
}

function rewriteCanonicalIssue(cwd: string, id: string, mutate: (issue: CanonicalIssueDocument) => void): void {
  const current = getIssue(cwd, id);
  const decoded = decodeIssueDocument(readFileSync(join(cwd, current.path)));
  mutate(decoded.issue);
  writeFileSync(join(cwd, current.path), encodeCanonicalIssue(decoded.issue));
}

describe('issue ID parsing', () => {
  it('returns unique configured IDs in first-appearance order', () => {
    const cwd = repository();
    expect(parseIssueIds('See 00042, then 00007, then 00042.', cwd)).toEqual(['00042', '00007']);
    expect(parseIssueId('See 00042 and 00007.', cwd)).toBe('00042');

    writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'issues:\n  prefix: TASK-\n', 'utf8');
    expect(parseIssueIds('TASK-123 and 123 and TASK-123.', cwd)).toEqual(['TASK-123']);
  });
});

describe('canonical issue operations', () => {
  it('creates one YAML file, allocates stable IDs, and lists active summaries', () => {
    const cwd = repository();
    const first = createIssue(cwd, { type: 'task', title: 'Add issue list tool' });
    const second = createIssue(cwd, { type: 'bug', title: 'Fix parser', status: 'closed' });

    expect(first).toMatchObject({
      id: '00001',
      path: '.issues/00001-add-issue-list-tool.yml',
      version: 1,
      location: 'active',
      comments: [],
    });
    expect(second.id).toBe('00002');
    expect(readdirSync(join(cwd, '.issues')).sort()).toEqual(['00001-add-issue-list-tool.yml', '00002-fix-parser.yml']);
    expect(readFileSync(join(cwd, first.path), 'utf8')).toContain('"comments": []');
    expect(listIssues(cwd, { status: 'CLOSED' })).toEqual([
      expect.objectContaining({ id: '00002', status: 'closed', revision: second.revision }),
    ]);
  });

  it('creates reciprocal hierarchy state atomically and validates prefixed references', () => {
    const cwd = repository();
    writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'issues:\n  prefix: TASK-\n', 'utf8');
    createIssue(cwd, { type: 'epic', title: 'Parent' });
    const child = createIssue(cwd, { type: 'task', title: 'Child', parent: 'TASK-00001' });

    expect(child.id).toBe('TASK-00002');
    expect(child.metadata.parent).toBe('TASK-00001');
    expect(getIssue(cwd, 'TASK-00001').metadata.children).toEqual(['TASK-00002']);
    expect(() => createIssue(cwd, { type: 'task', title: 'Wrong prefix', parent: '00001' })).toThrow(/invalid parent/);
  });

  it('retries ID allocation when an external creator wins the destination race', () => {
    const cwd = repository();
    let raced = false;
    const external = encodeCanonicalIssue({
      version: 1,
      id: '00001',
      type: 'task',
      title: 'Raced create',
      status: 'open',
      created_at: '2026-08-14T12:00:00.000Z',
      updated_at: '2026-08-14T12:00:00.000Z',
      body: 'external winner',
      comments: [],
    });
    const provider = createFilesystemIssueProvider(cwd, {
      transactionId: (() => {
        let sequence = 0;
        return () => `allocation-race-${++sequence}`;
      })(),
      fault: ({ boundary }) => {
        if (!raced && boundary === 'staged-write') {
          raced = true;
          writeFileSync(join(cwd, '.issues', '00001-raced-create.yml'), external);
        }
      },
    });

    const created = provider.create({ type: 'task', title: 'Raced create' });

    expect(created.id).toBe('00002');
    expect(readFileSync(join(cwd, '.issues', '00001-raced-create.yml'))).toEqual(Buffer.from(external));
    expect(getIssue(cwd, '00001').body).toBe('external winner');
  });

  it('exposes standalone canonical decoding through the provider', () => {
    const cwd = repository();
    const provider = createFilesystemIssueProvider(cwd);
    const bytes = encodeCanonicalIssue({
      version: 1,
      id: '00042',
      type: 'task',
      title: 'Standalone decode',
      status: 'open',
      created_at: '2026-08-14T12:00:00.000Z',
      updated_at: '2026-08-14T12:00:00.000Z',
      body: '',
      comments: [],
    });

    expect(provider.decode(bytes)).toMatchObject({
      issue: { id: '00042', title: 'Standalone decode' },
      canonical: true,
    });
    expect(existsSync(join(cwd, '.issues'))).toBe(false);
  });

  it('renames on title update while preserving custom metadata, comments, links, and relationships', () => {
    const cwd = repository();
    mkdirSync(join(cwd, '.specs'), { recursive: true });
    writeFileSync(join(cwd, '.specs', 'design.md'), '# Design\n', 'utf8');
    const original = createIssue(cwd, {
      type: 'task',
      title: 'Original',
      metadata: { nested: { unknown: 'keep' }, count: 7 },
    });
    createIssue(cwd, { type: 'task', title: 'Target' });
    commentIssue(cwd, original.id, 'First comment', 'tester');
    relateIssue(cwd, original.id, 'supersedes', '00002');
    const linked = linkDocument(cwd, original.id, '.specs/design.md', 'design');

    const updated = updateIssue(cwd, original.id, {
      title: 'Renamed issue',
      body: '# Replacement body',
      expectedRevision: linked.revision,
    });

    expect(updated.path).toBe('.issues/00001-renamed-issue.yml');
    expect(existsSync(join(cwd, original.path))).toBe(false);
    expect(updated.metadata).toMatchObject({
      supersedes: ['00002'],
      documents: ['.specs/design.md'],
      metadata: { nested: { unknown: 'keep' }, count: 7 },
    });
    expect(updated.comments.map((comment) => comment.id)).toEqual(['00001-C0001']);
    expect(updated.body).toBe('# Replacement body');
    expect(getIssue(cwd, '00002').metadata.supersedes).toBeUndefined();
  });

  it('enforces optimistic revisions for update and transition', () => {
    const cwd = repository();
    const original = createIssue(cwd, { type: 'task', title: 'Revision' });
    const transitioned = transitionIssue(cwd, original.id, 'done', original.revision);

    expect(transitioned.metadata.status).toBe('done');
    expect(transitioned.revision).not.toBe(original.revision);
    expect(() => updateIssue(cwd, original.id, { expectedRevision: original.revision })).toThrowError(
      expect.objectContaining({ category: 'stale_revision' }),
    );
    expect(() => updateIssue(cwd, original.id, { title: 'Missing' } as IssueUpdateChanges)).toThrow(
      /expected revision is required/,
    );
  });

  it('appends embedded comments with stable identity without overwriting prior comments', () => {
    const cwd = repository();
    createIssue(cwd, { type: 'task', title: 'Discuss' });
    const first = commentIssue(cwd, '00001', 'First', 'alice');
    const second = commentIssue(cwd, '00001', 'Second', 'bob');
    const issue = getIssue(cwd, '00001');

    expect(first).toMatchObject({ id: '00001-C0001', issue: '00001', path: issue.path });
    expect(second).toMatchObject({ id: '00001-C0002', revision: issue.revision });
    expect(issue.comments).toEqual([
      expect.objectContaining({ id: '00001-C0001', created_by: 'alice', body: 'First' }),
      expect.objectContaining({ id: '00001-C0002', created_by: 'bob', body: 'Second' }),
    ]);
    expect(readdirSync(join(cwd, '.issues'))).toEqual(['00001-discuss.yml']);
  });

  it('maintains inverse relationships and preserves revisions for no-op removals and links', () => {
    const cwd = repository();
    createIssue(cwd, { type: 'task', title: 'Source' });
    createIssue(cwd, { type: 'task', title: 'Target' });
    const related = relateIssue(cwd, '00001', 'blocks', '00002');

    expect(related.metadata.blocks).toEqual(['00002']);
    expect(getIssue(cwd, '00002').metadata.blocked_by).toEqual(['00001']);
    const unrelated = unrelateIssue(cwd, '00001', 'blocks', '00002');
    expect(unrelated.metadata.blocks).toBeUndefined();
    expect(getIssue(cwd, '00002').metadata.blocked_by).toBeUndefined();
    expect(unrelateIssue(cwd, '00001', 'blocks', '00002').revision).toBe(unrelated.revision);

    mkdirSync(join(cwd, '.harnessctl', 'tasks', '00001'), { recursive: true });
    writeFileSync(join(cwd, '.harnessctl', 'tasks', '00001', 'plan.md'), '# Plan\n', 'utf8');
    const linked = linkDocument(cwd, '00001', '.harnessctl/tasks/00001/plan.md');
    expect(linkDocument(cwd, '00001', '.harnessctl/tasks/00001/plan.md').revision).toBe(linked.revision);
  });

  it('accepts lossless metadata text and preserves it through mutations', () => {
    const cwd = repository();
    const provider = createFilesystemIssueProvider(cwd, {
      clock: () => new Date('2026-08-14T12:00:00.000Z'),
      transactionId: (() => {
        let sequence = 0;
        return () => `test-${++sequence}`;
      })(),
    });
    const issue = provider.create({
      type: 'task',
      title: 'Exact metadata',
      metadataText: issueMetadataText('{"large":9007199254740993,"decimal":1.2500}'),
    });
    const updated = provider.update(issue.id, { status: 'done', expectedRevision: issue.revision });
    const yaml = readFileSync(join(cwd, updated.path), 'utf8');

    expect(yaml).toContain('"large": 9007199254740993');
    expect(yaml).toContain('"decimal": 1.25');
    expect(updated.metadata.metadata).toEqual(issue.metadata.metadata);
    expect(() =>
      provider.create({
        type: 'task',
        title: 'Conflicting metadata',
        metadata: {},
        metadataText: issueMetadataText('{}'),
      }),
    ).toThrowError(IssueError);
  });

  it('projects deterministic entities and acknowledges every committed mutation', () => {
    const cwd = repository();
    const notifications: IssueProjectionChangeSet[] = [];
    let sequence = 0;
    const provider = createFilesystemIssueProvider(cwd, {
      clock: () => new Date('2026-08-14T12:00:00.000Z'),
      transactionId: () => `projection-${++sequence}`,
      projectionSink: { apply: (changeSet) => notifications.push(changeSet) },
    });
    mkdirSync(join(cwd, '.specs'));
    writeFileSync(join(cwd, '.specs', 'projection.md'), '# Projection\n');

    const source = provider.create({ type: 'task', title: 'Projection source', metadata: { retained: true } });
    provider.create({ type: 'task', title: 'Projection target' });
    const updated = provider.update(source.id, { title: 'Projected source', expectedRevision: source.revision });
    provider.transition(source.id, 'in_progress', updated.revision);
    provider.appendComment(source.id, 'Projected comment', 'tester');
    provider.relate(source.id, 'relates_to', '00002');
    provider.unrelate(source.id, 'relates_to', '00002');
    provider.linkDocument(source.id, '.specs/projection.md', 'design');
    provider.archiveTree(source.id);

    expect(notifications).toHaveLength(9);
    expect(notifications.map((notification) => notification.transactionId)).toEqual(
      Array.from({ length: 9 }, (_, index) => `projection-${index + 1}`),
    );
    expect(notifications.every((notification) => notification.version === 1)).toBe(true);
    expect(notifications.at(-1)?.changes).toEqual([
      expect.objectContaining({ kind: 'location', id: '00001', from: 'active', to: 'archived' }),
    ]);
    expect(provider.project('00001')).toMatchObject({
      id: '00001',
      location: 'archived',
      path: '.issues/archived/00001-projected-source.yml',
      metadata: { retained: true },
      comments: [expect.objectContaining({ id: '00001-C0001' })],
    });
    expect(provider.projectAll().map((record) => record.id)).toEqual(['00001', '00002']);
  });

  it('validates canonical storage, hierarchy, relationships, links, broken references, and cycles without mutation', () => {
    const cwd = repository();
    mkdirSync(join(cwd, '.specs'), { recursive: true });
    writeFileSync(join(cwd, '.specs', 'design.md'), '# Design\n');
    createIssue(cwd, { type: 'epic', title: 'Root' });
    createIssue(cwd, { type: 'task', title: 'Child', parent: '00001' });
    createIssue(cwd, { type: 'task', title: 'Peer' });
    relateIssue(cwd, '00002', 'blocks', '00003');
    linkDocument(cwd, '00002', '.specs/design.md');
    expect(validateIssues(cwd)).toEqual({ valid: true, findings: [] });

    rewriteCanonicalIssue(cwd, '00002', (issue) => {
      issue.parent = '00999';
      issue.depends_on = ['00003'];
    });
    rewriteCanonicalIssue(cwd, '00003', (issue) => {
      issue.depends_on = ['00002'];
      delete issue.blocked_by;
    });
    rmSync(join(cwd, '.specs', 'design.md'));
    const before = readdirSync(join(cwd, '.issues')).map((name) => [name, readFileSync(join(cwd, '.issues', name))]);
    const report = validateIssues(cwd);
    const after = readdirSync(join(cwd, '.issues')).map((name) => [name, readFileSync(join(cwd, '.issues', name))]);

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.message).join('\n')).toMatch(
      /does not resolve|dependency cycle|reciprocal blocked_by|does not exist/,
    );
    expect(report.findings.some((finding) => finding.message.includes('dependency cycle'))).toBe(true);
    expect(report.findings.some((finding) => finding.field === 'documents')).toBe(true);
    expect(after).toEqual(before);
  });

  it.each([
    [
      'create',
      (provider: ReturnType<typeof createFilesystemIssueProvider>) =>
        provider.create({ type: 'task', title: 'Blocked' }),
    ],
    [
      'update',
      (provider: ReturnType<typeof createFilesystemIssueProvider>) => {
        const issue = provider.get('00002');
        return provider.update('00002', { title: 'Blocked', expectedRevision: issue.revision });
      },
    ],
    [
      'comment',
      (provider: ReturnType<typeof createFilesystemIssueProvider>) =>
        provider.appendComment('00002', 'Blocked', 'tester'),
    ],
    [
      'relate',
      (provider: ReturnType<typeof createFilesystemIssueProvider>) => provider.relate('00001', 'relates_to', '00002'),
    ],
    [
      'unrelate',
      (provider: ReturnType<typeof createFilesystemIssueProvider>) => provider.unrelate('00001', 'relates_to', '00002'),
    ],
    [
      'link',
      (provider: ReturnType<typeof createFilesystemIssueProvider>) =>
        provider.linkDocument('00002', '.specs/available.md', 'design'),
    ],
    ['archive', (provider: ReturnType<typeof createFilesystemIssueProvider>) => provider.archiveTree('00002')],
  ])('prevalidates the global graph before %s mutations', (_name, mutate) => {
    const cwd = repository();
    mkdirSync(join(cwd, '.specs'));
    writeFileSync(join(cwd, '.specs', 'missing.md'), '# Missing later\n');
    writeFileSync(join(cwd, '.specs', 'available.md'), '# Available\n');
    createIssue(cwd, { type: 'task', title: 'Invalid unrelated issue' });
    createIssue(cwd, { type: 'task', title: 'Mutation target' });
    linkDocument(cwd, '00001', '.specs/missing.md', 'design');
    rmSync(join(cwd, '.specs', 'missing.md'));
    const before = readdirSync(join(cwd, '.issues')).map((name) => [name, readFileSync(join(cwd, '.issues', name))]);
    const provider = createFilesystemIssueProvider(cwd);

    expect(() => mutate(provider)).toThrowError(expect.objectContaining({ category: 'domain_invariant' }));
    const after = readdirSync(join(cwd, '.issues')).map((name) => [name, readFileSync(join(cwd, '.issues', name))]);
    expect(after).toEqual(before);
  });

  it('archives active descendants transactionally, detaches external parents, and leaves unrelated issues untouched', () => {
    const cwd = repository();
    createIssue(cwd, { type: 'initiative', title: 'External parent' });
    createIssue(cwd, { type: 'epic', title: 'Archive root', parent: '00001' });
    createIssue(cwd, { type: 'story', title: 'Descendant', parent: '00002' });
    createIssue(cwd, { type: 'task', title: 'Grandchild', parent: '00003' });
    const unrelated = createIssue(cwd, { type: 'bug', title: 'Unrelated' });

    const report = archiveIssueReport(cwd, '00002');

    expect(report.archived).toEqual(['00002', '00003', '00004']);
    expect(report.skipped).toEqual([]);
    expect(report.location).toBe('.issues/archived/');
    expect(report.transactionId).toBeTruthy();
    expect(getIssue(cwd, '00002').location).toBe('archived');
    expect(getIssue(cwd, '00002').metadata.parent).toBeUndefined();
    expect(getIssue(cwd, '00004').location).toBe('archived');
    expect(getIssue(cwd, '00001').metadata.children).toBeUndefined();
    expect(validateIssues(cwd)).toEqual({ valid: true, findings: [] });
    expect(getIssue(cwd, unrelated.id)).toMatchObject({ location: 'active', revision: unrelated.revision });
    expect(archiveIssueReport(cwd, '00002')).toMatchObject({ archived: [], skipped: ['00002'] });
  });

  it('recovers a partially applied recursive archive and reports the deterministic already-archived result', () => {
    const cwd = repository();
    let injectFault = false;
    let faulted = false;
    const provider = createFilesystemIssueProvider(cwd, {
      transactionId: (() => {
        let sequence = 0;
        return () => `archive-test-${++sequence}`;
      })(),
      fault: (event) => {
        if (injectFault && !faulted && event.boundary === 'canonical-apply') {
          faulted = true;
          throw new Error('simulated interruption');
        }
      },
    });
    provider.create({ type: 'epic', title: 'Interrupted root' });
    provider.create({ type: 'task', title: 'Interrupted child', parent: '00001' });
    injectFault = true;

    expect(() => provider.archiveTree('00001')).toThrowError();
    expect(provider.archiveTree('00001')).toMatchObject({ archived: [], skipped: ['00001'] });
    expect(provider.get('00001').location).toBe('archived');
    expect(provider.get('00002').location).toBe('archived');
  });
});
