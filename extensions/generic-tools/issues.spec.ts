import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import { decodeIssueDocument, encodeCanonicalIssue, issueMetadataText } from './issues-contract.js';
import {
  archiveIssueReport,
  commentIssue,
  createFilesystemIssueProvider,
  createIssueRecord,
  getIssue,
  linkDocument,
  listIssueSummaries,
  parseIssueId,
  parseIssueIds,
  relateIssue,
  transitionIssue,
  unrelateIssue,
  updateIssue,
  validateIssues,
} from './issues.js';

const roots: string[] = [];
const require = createRequire(import.meta.url);

function issueCacheCount(root: string): number {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => {
      prepare(sql: string): { get(): { count: number } };
      close(): void;
    };
  };
  const database = new DatabaseSync(join(root, '.harnessctl/cache/harnessctl.sqlite'));
  try {
    return database.prepare('SELECT count(*) AS count FROM issues').get().count;
  } finally {
    database.close();
  }
}
function repository(prefix = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-issues-'));
  roots.push(root);
  createConfig(root);
  writeFileSync(join(root, '.harnessctl/config.yaml'), `issues:\n  prefix: "${prefix}"\n`, 'utf8');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('issue public operations', () => {
  it('preserves configured IDs, filenames, summaries, and provider config snapshot', () => {
    const root = repository('TASK-');
    const provider = createFilesystemIssueProvider(root);
    writeFileSync(join(root, '.harnessctl/config.yaml'), 'issues:\n  root: other/issues\n  prefix: X-\n');
    const created = provider.create({ type: 'task', title: 'Stable issue' });
    expect(created).toMatchObject({
      id: 'TASK-00001',
      path: '.harnessctl/issues/TASK-00001-stable-issue.yml',
      location: 'active',
    });
    expect(provider.list()).toEqual([expect.objectContaining({ id: created.id, revision: created.revision })]);
    writeFileSync(join(root, '.harnessctl/config.yaml'), 'issues:\n  prefix: "TASK-"\n');
    expect(parseIssueIds('TASK-00001 and TASK-00002 and TASK-00001', root)).toEqual(['TASK-00001', 'TASK-00002']);
    expect(parseIssueId('see TASK-00001', root)).toBe('TASK-00001');
  });

  it('derives hierarchy and dependency inverse views without persisting them', () => {
    const root = repository();
    createIssueRecord(root, { type: 'epic', title: 'Parent' });
    const child = createIssueRecord(root, { type: 'task', title: 'Child', parent: '00001' });
    createIssueRecord(root, { type: 'task', title: 'Blocked' });
    relateIssue(root, child.id, 'depends_on', '00003');
    expect(getIssue(root, '00001').metadata.children).toEqual(['00002']);
    expect(getIssue(root, '00002').metadata.blocked_by).toEqual(['00003']);
    expect(getIssue(root, '00003').metadata.blocks).toEqual(['00002']);
    const parentYaml = readFileSync(join(root, getIssue(root, '00001').path), 'utf8');
    expect(parentYaml).not.toContain('children');
    expect(parentYaml).not.toContain('blocks');
    expect(parentYaml).not.toContain('blocked_by');
  });

  it('stores symmetric relationships once under the smaller ID and removes from either endpoint', () => {
    const root = repository();
    createIssueRecord(root, { type: 'task', title: 'First' });
    createIssueRecord(root, { type: 'task', title: 'Second' });
    relateIssue(root, '00002', 'relates_to', '00001');
    expect(getIssue(root, '00001').metadata.relates_to).toEqual(['00002']);
    expect(getIssue(root, '00002').metadata.relates_to).toEqual(['00001']);
    expect(readFileSync(join(root, getIssue(root, '00002').path), 'utf8')).not.toContain('relates_to');
    unrelateIssue(root, '00002', 'relates_to', '00001');
    expect(getIssue(root, '00001').metadata.relates_to).toBeUndefined();
  });

  it('uses standard JSON metadata and deterministic rewrites with optimistic revisions', () => {
    const root = repository();
    const created = createFilesystemIssueProvider(root, {
      clock: () => new Date('2026-08-14T12:00:00.000Z'),
    }).create({
      type: 'task',
      title: 'Metadata',
      metadataText: issueMetadataText('{"fraction":1.25,"large":9007199254740993}'),
    });
    const updated = updateIssue(root, created.id, {
      title: 'Renamed metadata',
      expectedRevision: created.revision,
    });
    expect(updated.metadata.metadata).toEqual({ fraction: 1.25, large: 9_007_199_254_740_992 });
    expect(updated.path).toContain('renamed-metadata.yml');
    expect(existsSync(join(root, created.path))).toBe(false);
    expect(() => transitionIssue(root, created.id, 'done', created.revision)).toThrowError(
      expect.objectContaining({ category: 'stale_revision' }),
    );
  });

  it('supports comments, links, summaries, and expected transition revisions', () => {
    const root = repository();
    mkdirSync(join(root, '.specs'));
    writeFileSync(join(root, '.specs/design.md'), '# Design\n');
    const created = createIssueRecord(root, { type: 'task', title: 'Operations' });
    const comment = commentIssue(root, created.id, 'Reviewed', 'tester');
    const linked = linkDocument(root, created.id, '.specs/design.md', 'design');
    const transitioned = transitionIssue(root, created.id, 'done', linked.revision);
    expect(comment.id).toBe('00001-C0001');
    expect(transitioned.metadata.status).toBe('done');
    expect(listIssueSummaries(root, { status: 'DONE' })).toHaveLength(1);
  });

  it('archives derived descendants and retains the compatibility operation token', () => {
    const root = repository();
    createIssueRecord(root, { type: 'epic', title: 'Root' });
    createIssueRecord(root, { type: 'task', title: 'Child', parent: '00001' });
    const report = archiveIssueReport(root, '00001');
    expect(report).toMatchObject({ archived: ['00001', '00002'], skipped: [] });
    expect(report.transactionId).toBeTruthy();
    expect(getIssue(root, '00002').location).toBe('archived');
    expect(archiveIssueReport(root, '00001')).toMatchObject({ archived: [], skipped: ['00001'] });
  });

  it('returns bounded validation findings for malformed canonical state without rewriting it', () => {
    const root = repository();
    const created = createIssueRecord(root, { type: 'task', title: 'Malformed' });
    const path = join(root, created.path);
    writeFileSync(path, 'version: [\n');
    const before = readFileSync(path);
    const report = validateIssues(root);
    expect(report).toMatchObject({ valid: false, findings: [expect.objectContaining({ severity: 'error' })] });
    expect(readFileSync(path)).toEqual(before);
  });

  it('accepts safe manually formatted YAML and normalizes it on write', () => {
    const root = repository();
    const created = createIssueRecord(root, { type: 'task', title: 'Manual' });
    const path = join(root, created.path);
    const source = readFileSync(path, 'utf8').replace('"version": 1', '# comment\nversion: 01');
    writeFileSync(path, source);
    const manual = getIssue(root, created.id);
    const updated = updateIssue(root, created.id, { status: 'done', expectedRevision: manual.revision });
    expect(decodeIssueDocument(readFileSync(join(root, updated.path)), { requireCanonical: true }).canonical).toBe(
      true,
    );
    expect(readFileSync(join(root, updated.path))).toEqual(
      Buffer.from(encodeCanonicalIssue(decodeIssueDocument(readFileSync(join(root, updated.path))).issue)),
    );
  });

  it('writes issue mutations through to the shared SQLite cache and rebuilds corruption', () => {
    const root = repository();
    createIssueRecord(root, { type: 'task', title: 'First' });
    createIssueRecord(root, { type: 'task', title: 'Second' });
    expect(issueCacheCount(root)).toBe(2);
    writeFileSync(join(root, '.harnessctl/cache/harnessctl.sqlite'), 'corrupt');
    expect(listIssueSummaries(root)).toHaveLength(2);
    expect(issueCacheCount(root)).toBe(2);
  });
});
