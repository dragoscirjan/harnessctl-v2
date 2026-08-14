import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import {
  createCanonicalIssueFile,
  discoverIssueStorage,
  resolveIssueCandidate,
  rewriteCanonicalIssueFile,
} from './issues-storage.js';

const roots: string[] = [];

function temporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-issues-storage-'));
  roots.push(root);
  return root;
}

function issue(overrides: Partial<CanonicalIssueDocument> = {}): CanonicalIssueDocument {
  return {
    version: 1,
    id: '00008',
    type: 'task',
    title: 'Safe discovery',
    status: 'in_progress',
    created_at: '2026-08-14T13:43:41.772Z',
    updated_at: '2026-08-14T13:54:07.849Z',
    parent: '00004',
    body: '# Safe discovery\n',
    comments: [],
    ...overrides,
  };
}

function writeIssue(root: string, document: CanonicalIssueDocument, archived = false): string {
  const directory = join(root, '.issues', ...(archived ? ['archived'] : []));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${document.id}-${document.title.toLowerCase().replaceAll(' ', '-')}.yml`);
  writeFileSync(path, encodeCanonicalIssue(document));
  return path;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical issue discovery', () => {
  it('discovers and resolves active and archived issues by stable ID', () => {
    const root = temporaryRepository();
    writeIssue(root, issue());
    writeIssue(root, issue({ id: '00009', title: 'Archived issue' }), true);

    const storage = discoverIssueStorage(root);

    expect(storage.status).toBe('canonical');
    expect(storage.active.map((candidate) => candidate.id)).toEqual(['00008']);
    expect(storage.archived.map((candidate) => candidate.id)).toEqual(['00009']);
    expect(resolveIssueCandidate(storage, '00009').location).toBe('archived');
  });

  it('reports malformed documents while reserving their IDs', () => {
    const root = temporaryRepository();
    mkdirSync(join(root, '.issues'));
    writeFileSync(join(root, '.issues', '00012-broken.yml'), '"version": [\n');

    const storage = discoverIssueStorage(root);

    expect(storage.status).toBe('invalid');
    expect(storage.reservedIds.has('00012')).toBe(true);
    expect(storage.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'parse_safety', issueId: '00012' })]),
    );
  });

  it('fails closed for duplicate IDs across active and archived roots', () => {
    const root = temporaryRepository();
    writeIssue(root, issue());
    writeIssue(root, issue(), true);

    const storage = discoverIssueStorage(root);

    expect(storage.status).toBe('invalid');
    expect(storage.findings.filter((finding) => finding.category === 'identity_ambiguity')).toHaveLength(2);
    expect(() => resolveIssueCandidate(storage, '00008')).toThrowError(
      expect.objectContaining({ category: 'identity_ambiguity' }),
    );
  });

  it('rejects symlinks, unsupported extensions, and malformed names', () => {
    const root = temporaryRepository();
    mkdirSync(join(root, '.issues'));
    const outside = join(root, 'outside.yml');
    writeFileSync(outside, encodeCanonicalIssue(issue()));
    symlinkSync(outside, join(root, '.issues', '00008-safe-discovery.yml'));
    writeFileSync(join(root, '.issues', '00009-wrong.yaml'), 'not canonical');
    writeFileSync(join(root, '.issues', 'not-an-id.yml'), 'not canonical');

    const storage = discoverIssueStorage(root);

    expect(storage.status).toBe('invalid');
    expect(storage.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('symlinks'),
        expect.stringContaining('unsupported or malformed'),
      ]),
    );
  });

  it('rejects legacy and mixed representations with migration guidance', () => {
    const legacy = temporaryRepository();
    mkdirSync(join(legacy, '.issues', '00001'), { recursive: true });
    writeFileSync(join(legacy, '.issues', '00001', 'issue.md'), '---\nid: "00001"\n---\n');
    expect(discoverIssueStorage(legacy)).toEqual(
      expect.objectContaining({
        status: 'legacy',
        findings: expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('migration') })]),
      }),
    );

    writeIssue(legacy, issue());
    const mixed = discoverIssueStorage(legacy);
    expect(mixed.status).toBe('mixed');
    expect(() => createCanonicalIssueFile(legacy, issue({ id: '00010' }))).toThrowError(
      expect.objectContaining({ category: 'storage_classification', message: expect.stringContaining('migration') }),
    );
  });

  it('does not accept traversal paths for rewrites', () => {
    const root = temporaryRepository();
    writeIssue(root, issue());
    expect(() => rewriteCanonicalIssueFile(root, '../outside.yml', issue())).toThrowError(
      expect.objectContaining({ category: 'path_safety' }),
    );
  });
});

describe('canonical issue mutation primitives', () => {
  it('creates exactly one exclusive canonical issue file', () => {
    const root = temporaryRepository();
    const created = createCanonicalIssueFile(root, issue());

    expect(created.path).toBe('.issues/00008-safe-discovery.yml');
    expect(discoverIssueStorage(root).candidates).toHaveLength(1);
    expect(() => createCanonicalIssueFile(root, issue())).toThrowError(
      expect.objectContaining({ category: 'identity_ambiguity' }),
    );
  });

  it('atomically rewrites content at the same canonical path', () => {
    const root = temporaryRepository();
    const created = createCanonicalIssueFile(root, issue());
    const updated = issue({ status: 'done', updated_at: '2026-08-14T14:00:00.000Z' });

    rewriteCanonicalIssueFile(root, created.path, updated);

    expect(resolveIssueCandidate(discoverIssueStorage(root), '00008').decoded?.issue.status).toBe('done');
    expect(readFileSync(join(root, created.path))).toEqual(Buffer.from(encodeCanonicalIssue(updated)));
  });

  it('renames for a title change without overwriting a destination', () => {
    const root = temporaryRepository();
    const created = createCanonicalIssueFile(root, issue());
    const renamed = issue({ title: 'Renamed safely', updated_at: '2026-08-14T14:00:00.000Z' });

    const result = rewriteCanonicalIssueFile(root, created.path, renamed);

    expect(result.path).toBe('.issues/00008-renamed-safely.yml');
    expect(existsSync(join(root, created.path))).toBe(false);
    expect(result.decoded?.issue.id).toBe('00008');

    writeFileSync(join(root, '.issues', '00008-collision.yml'), 'sentinel');
    expect(() =>
      rewriteCanonicalIssueFile(
        root,
        result.path,
        issue({ title: 'Collision', updated_at: '2026-08-14T14:01:00.000Z' }),
      ),
    ).toThrowError(expect.objectContaining({ category: 'storage_classification' }));
    expect(readFileSync(join(root, '.issues', '00008-collision.yml'), 'utf8')).toBe('sentinel');
  });
});
