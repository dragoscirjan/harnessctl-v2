import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import { archiveDocument, createDocument, getDocument, updateDocument, versionDocument } from './documents.js';
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
  validateCanonicalIssueGraph,
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

function remoteRepository(type: string, tools: string): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-remote-issues-'));
  roots.push(root);
  mkdirSync(join(root, '.harnessctl'));
  const remote = {
    github: { url: 'https://github.com', token_env: 'GH_TOKEN' },
    gitlab: { url: 'https://gitlab.com', token_env: 'GITLAB_TOKEN' },
    gitea: { url: 'https://gitea.example.test', token_env: 'GITEA_TOKEN' },
    forgejo: { url: 'https://forgejo.example.test', token_env: 'FORGEJO_TOKEN' },
  }[type];
  if (remote === undefined) throw new Error(`Unsupported test issue provider: ${type}`);
  writeFileSync(
    join(root, '.harnessctl/config.yaml'),
    `version: 2\nissues:\n  root: dormant/issues\n  prefix: hrn-\n  type: ${type}\n  tools: ${tools}\n  remote:\n    url: ${remote.url}\n    token_env: ${remote.token_env}\n`,
    'utf8',
  );
  return root;
}

function treeManifest(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, encoding: 'utf8' })
      .sort()
      .map((path) => {
        const absolute = join(root, path);
        return [path, lstatSync(absolute).isDirectory() ? 'directory' : readFileSync(absolute).toString('base64')];
      }),
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('issue public operations', () => {
  it.each([
    ['github', 'gh'],
    ['gitlab', 'glab'],
    ['gitea', 'tea'],
    ['forgejo', 'forgejo-cli'],
  ])('rejects every local operation without state mutation for remote %s', (type, tools) => {
    const root = remoteRepository(type, tools);
    const before = treeManifest(root);
    const operations: Array<[string, () => unknown]> = [
      ['parseIssueIds', () => parseIssueIds('hrn-00001', root)],
      ['parseIssueId', () => parseIssueId('hrn-00001', root)],
      ['createFilesystemIssueProvider', () => createFilesystemIssueProvider(root)],
      ['createIssueRecord', () => createIssueRecord(root, { type: 'task', title: 'No write' })],
      ['getIssue', () => getIssue(root, 'hrn-00001')],
      ['listIssueSummaries', () => listIssueSummaries(root)],
      ['updateIssue', () => updateIssue(root, 'hrn-00001', { title: 'No write', expectedRevision: 'revision' })],
      ['transitionIssue', () => transitionIssue(root, 'hrn-00001', 'done', 'revision')],
      ['commentIssue', () => commentIssue(root, 'hrn-00001', 'No write', 'tester')],
      ['relateIssue', () => relateIssue(root, 'hrn-00001', 'depends_on', 'hrn-00002')],
      ['unrelateIssue', () => unrelateIssue(root, 'hrn-00001', 'depends_on', 'hrn-00002')],
      ['linkDocument', () => linkDocument(root, 'hrn-00001', '.specs/design.md')],
      ['archiveIssueReport', () => archiveIssueReport(root, 'hrn-00001')],
    ];
    for (const [name, operation] of operations) {
      expect(operation).toThrow(new RegExp(`${name}.*issues\\.type=${type}.*${tools}.*issues\\.type=filesystem`, 'u'));
      expect(treeManifest(root)).toEqual(before);
    }
    expect(validateIssues(root)).toEqual({
      valid: false,
      findings: [
        expect.objectContaining({
          severity: 'error',
          category: 'configuration',
          message: expect.stringMatching(
            new RegExp(`validateIssues.*issues\\.type=${type}.*${tools}.*issues\\.type=filesystem`, 'u'),
          ),
        }),
      ],
    });
    expect(validateCanonicalIssueGraph(root)).toEqual({ valid: true, findings: [] });
    expect(treeManifest(root)).toEqual(before);
    expect(existsSync(join(root, 'dormant/issues'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl/cache'))).toBe(false);
  });

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
    mkdirSync(join(root, '.harnessctl/tasks'));
    writeFileSync(join(root, '.harnessctl/tasks/design.md'), '# Design\n');
    const created = createIssueRecord(root, { type: 'task', title: 'Operations' });
    const comment = commentIssue(root, created.id, 'Reviewed', 'tester');
    const linked = linkDocument(root, created.id, '.harnessctl/tasks/design.md', 'task');
    const transitioned = transitionIssue(root, created.id, 'done', linked.revision);
    expect(comment.id).toBe('00001-C0001');
    expect(transitioned.metadata.status).toBe('done');
    expect(listIssueSummaries(root, { status: 'DONE' })).toHaveLength(1);
  });

  it('retires live .specs and .ai.tmp link recognition', () => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Retired links' });
    const draftRoot = join(root, '.ai.tmp');
    mkdirSync(draftRoot);
    writeFileSync(join(draftRoot, 'draft.md'), '# Draft\n');
    mkdirSync(join(root, '.specs'));
    writeFileSync(join(root, '.specs/design.md'), '# Design\n');

    expect(() => linkDocument(root, issue.id, '.ai.tmp/draft.md')).toThrow(/retired/u);
    expect(() => linkDocument(root, issue.id, '.specs/design.md', 'design')).toThrow(/retired/u);
    expect(getIssue(root, issue.id).metadata.documents).toBeUndefined();
  });

  it('links only active canonical filesystem Documents with compatible kinds', () => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Document links' });
    const document = createDocument(root, { title: 'Canonical link', kind: 'hld' });

    const linked = linkDocument(root, issue.id, document.path, 'document');
    expect(linked.metadata.documents).toEqual([document.path]);
    expect(() => linkDocument(root, issue.id, document.path, 'task')).toThrow(/task documents must be under/u);

    writeFileSync(join(root, '.harnessctl/documents/doc-99999-not-canonical-v1.md'), '# Invalid\n');
    expect(() =>
      linkDocument(root, issue.id, '.harnessctl/documents/doc-99999-not-canonical-v1.md', 'document'),
    ).toThrow(/strict YAML frontmatter|valid canonical Markdown/u);
    rmSync(join(root, '.harnessctl/documents/doc-99999-not-canonical-v1.md'));

    const oversizedPath = '.harnessctl/documents/doc-99999-oversized-v1.md';
    writeFileSync(join(root, oversizedPath), Buffer.alloc(1_100_001));
    expect(() => linkDocument(root, issue.id, oversizedPath, 'document')).toThrowError(
      expect.objectContaining({ category: 'resource_limit' }),
    );
    rmSync(join(root, oversizedPath));

    const archivedDocument = createDocument(root, { title: 'Archived link', kind: 'hld' });
    archiveDocument(root, archivedDocument.id, archivedDocument.revision);
    const archived = archivedDocument.path.replace('.harnessctl/documents/', '.harnessctl/documents/archive/');
    expect(() => linkDocument(root, issue.id, archived, 'document')).toThrow(/active canonical document/u);
  });

  it('reads canonical issue links through the bounded no-follow descriptor primitive', () => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Race-safe link' });
    const document = createDocument(root, { title: 'Race-safe target', kind: 'hld' });
    const original = join(root, document.path);
    const canonical = readFileSync(original);
    const provider = createFilesystemIssueProvider(root, {
      documentReadOptions: {
        beforeOpen: () => {
          writeFileSync(original, '# raced\n');
        },
      },
    });

    expect(() => provider.linkDocument(issue.id, document.path, 'document')).toThrowError(
      expect.objectContaining({ category: 'path_safety' }),
    );
    writeFileSync(original, canonical);
    expect(getIssue(root, issue.id).metadata.documents).toBeUndefined();
  });

  it.each(['active', 'archived'] as const)(
    'blocks document archive for references from %s canonical issues without mutating either authority',
    (issueLocation) => {
      const root = repository();
      const issue = createIssueRecord(root, { type: 'task', title: `${issueLocation} reference` });
      const document = createDocument(root, { title: 'Referenced lineage', kind: 'hld' });
      linkDocument(root, issue.id, document.path, 'document');
      if (issueLocation === 'archived') archiveIssueReport(root, issue.id);
      const current = versionDocument(root, document.id, {
        body: 'The issue still references version one.',
        expectedRevision: document.revision,
      });
      const before = treeManifest(root);

      expect(() => archiveDocument(root, document.id, current.revision)).toThrow(/linked by canonical issue/u);
      expect(treeManifest(root)).toEqual(before);
      expect(getDocument(root, document.id)).toEqual(expect.objectContaining({ location: 'active' }));
      expect(getIssue(root, issue.id).metadata.documents).toEqual([document.path]);
    },
  );

  it.each(['active', 'archived'] as const)(
    'blocks a path-changing document update for references from %s canonical issues without mutating either authority',
    (issueLocation) => {
      const root = repository();
      const issue = createIssueRecord(root, { type: 'task', title: `${issueLocation} update reference` });
      const document = createDocument(root, { title: 'Linked title', kind: 'hld' });
      linkDocument(root, issue.id, document.path, 'document');
      if (issueLocation === 'archived') archiveIssueReport(root, issue.id);
      const documentsBefore = treeManifest(join(root, '.harnessctl/documents'));
      const issuesBefore = treeManifest(join(root, '.harnessctl/issues'));
      const cachePath = join(root, '.harnessctl/cache/harnessctl.sqlite');
      const cacheBefore = readFileSync(cachePath);

      expect(() =>
        updateDocument(root, document.id, { title: 'Renamed title', expectedRevision: document.revision }),
      ).toThrow(/linked by canonical issue/u);
      expect(treeManifest(join(root, '.harnessctl/documents'))).toEqual(documentsBefore);
      expect(treeManifest(join(root, '.harnessctl/issues'))).toEqual(issuesBefore);
      expect(readFileSync(cachePath)).toEqual(cacheBefore);
      expect(getIssue(root, issue.id).metadata.documents).toEqual([document.path]);

      const unchangedPath = updateDocument(root, document.id, {
        status: 'review',
        expectedRevision: document.revision,
      });
      expect(unchangedPath.path).toBe(document.path);
      expect(unchangedPath.metadata.status).toBe('review');
      const mutableIssue = createIssueRecord(root, { type: 'task', title: 'Supported mutation' });
      expect(
        updateIssue(root, mutableIssue.id, {
          title: 'Issue remains mutable',
          expectedRevision: mutableIssue.revision,
        }),
      ).toEqual(expect.objectContaining({ metadata: expect.objectContaining({ title: 'Issue remains mutable' }) }));
    },
  );

  it('keeps issue reads and supported mutations valid after archive rejection without inventing unlink', () => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Referenced issue' });
    const document = createDocument(root, { title: 'Still active', kind: 'hld' });
    linkDocument(root, issue.id, document.path, 'document');
    expect(() => archiveDocument(root, document.id, document.revision)).toThrow(/linked by canonical issue/u);

    expect('unlinkDocument' in createFilesystemIssueProvider(root)).toBe(false);
    const created = createIssueRecord(root, { type: 'task', title: 'Mutation remains valid' });
    expect(created.id).toBe('00002');
    const linked = linkDocument(root, created.id, document.path, 'document');
    expect(linked.metadata.documents).toEqual([document.path]);
    expect(
      updateIssue(root, issue.id, { title: 'Still mutable', expectedRevision: getIssue(root, issue.id).revision }),
    ).toEqual(expect.objectContaining({ metadata: expect.objectContaining({ title: 'Still mutable' }) }));
  });

  it('rejects dormant local document paths when Documents authority is remote', () => {
    const root = repository();
    writeFileSync(
      join(root, '.harnessctl/config.yaml'),
      'version: 2\ndocuments:\n  type: github\n  tools: gh\n  remote:\n    repository: owner/repo\n    url: https://github.com\n    token_env: GH_TOKEN\n',
      'utf8',
    );
    mkdirSync(join(root, '.harnessctl/documents'), { recursive: true });
    writeFileSync(join(root, '.harnessctl/documents/doc-00001-dormant-v1.md'), '# Dormant\n');
    expect(() => createIssueRecord(root, { type: 'task', title: 'Remote documents' })).toThrow(
      /remote Documents providers/u,
    );
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
