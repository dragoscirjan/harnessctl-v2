import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { createConfig } from './config.js';
import {
  DOCUMENT_LIMITS,
  canonicalDocumentFilename,
  decodeDocument,
  encodeCanonicalDocument,
  type CanonicalDocumentMetadata,
} from './documents-contract.js';
import {
  DocumentError,
  archiveDocument,
  createDocument,
  createFilesystemDocumentProvider,
  getDocument,
  listDocuments,
  parseDocumentId,
  restoreDocument,
  updateDocument,
  validateDocuments,
  versionDocument,
} from './documents.js';
import { decodeIssueDocument, encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import { createIssueRecord, getIssue, linkDocument } from './issues.js';
import { storeMemory } from './memory.js';

const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-documents-'));
  roots.push(root);
  createConfig(root);
  return root;
}
afterEach(() => {
  delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
  delete process.env.HARNESSCTL_TEST_PUBLICATION_FAILURE_PATH;
  delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
  delete process.env.HARNESSCTL_TEST_DOCUMENT_CLEANUP_INTERRUPT_AFTER;
  delete process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('filesystem documents', () => {
  it('honors a schema-valid custom filesystem root in canonical operations and cache projection', () => {
    const root = repository();
    writeFileSync(
      join(root, '.harnessctl/config.yaml'),
      'version: 1\nskills:\n  documents:\n    root: project/documents\n',
      'utf8',
    );

    const created = createDocument(root, { title: 'Custom authority', kind: 'hld' });

    expect(created.path).toBe(`project/documents/${created.id}-custom-authority-v1.md`);
    expect(getDocument(root, created.id)).toEqual(expect.objectContaining({ revision: created.revision }));
    expect(listDocuments(root)).toEqual([expect.objectContaining({ id: created.id })]);
    expect(existsSync(join(root, created.path))).toBe(true);
    expect(existsSync(join(root, '.harnessctl/documents'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl/cache/harnessctl.sqlite'))).toBe(true);
  });

  it('rejects disabled local operations before touching filesystem or cache state', () => {
    const root = repository();
    const provider = createFilesystemDocumentProvider(root);
    writeFileSync(
      join(root, '.harnessctl/config.yaml'),
      'version: 1\nskills:\n  documents:\n    enabled: false\n',
      'utf8',
    );
    rmSync(join(root, '.harnessctl/documents'), { recursive: true, force: true });
    rmSync(join(root, '.harnessctl/cache'), { recursive: true, force: true });

    for (const operation of [
      () => parseDocumentId('doc-00001', root),
      () => provider.create({ title: 'Blocked provider', kind: 'hld' }),
      () => createDocument(root, { title: 'Blocked', kind: 'hld' }),
      () => listDocuments(root),
    ])
      expect(operation).toThrow(/skills\.documents\.enabled=true.*disabled/u);
    expect(validateDocuments(root)).toEqual({
      valid: false,
      findings: [
        expect.objectContaining({ message: expect.stringMatching(/skills\.documents\.enabled=true.*disabled/u) }),
      ],
    });
    expect(existsSync(join(root, '.harnessctl/documents'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl/cache'))).toBe(false);
  });

  it('rejects a remote authority before touching filesystem or cache state', () => {
    const root = repository();
    writeFileSync(
      join(root, '.harnessctl/config.yaml'),
      'version: 1\nskills:\n  documents:\n    provider:\n      type: github\n      tools: gh\n      url: https://github.com\n      token_env: GH_TOKEN\n',
      'utf8',
    );
    rmSync(join(root, '.harnessctl/documents'), { recursive: true, force: true });
    rmSync(join(root, '.harnessctl/cache'), { recursive: true, force: true });

    expect(() => createDocument(root, { title: 'Blocked', kind: 'hld' })).toThrow(
      /remote document behavior is provider-owned/u,
    );
    expect(existsSync(join(root, '.harnessctl/documents'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl/cache'))).toBe(false);
  });

  it('rejects invalid list locations before touching document or cache state', () => {
    const root = repository();
    rmSync(join(root, '.harnessctl/documents'), { recursive: true, force: true });
    rmSync(join(root, '.harnessctl/cache'), { recursive: true, force: true });

    for (const location of ['archived', 'ACTIVE', ' active ', 'Archive', '', 'x'.repeat(100_000)]) {
      expect(() => listDocuments(root, { location: location as never })).toThrowError(
        expect.objectContaining({
          category: 'schema',
          message: 'invalid document location; expected active or archive',
        }),
      );
    }
    expect(existsSync(join(root, '.harnessctl/documents'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl/cache'))).toBe(false);

    const configPath = join(root, '.harnessctl/config.yaml');
    const configSource = readFileSync(configPath, 'utf8');
    writeFileSync(configPath, 'not: [valid');
    expect(() => listDocuments(root, { location: 'invalid' as never })).toThrowError(
      expect.objectContaining({ category: 'schema', message: 'invalid document location; expected active or archive' }),
    );
    writeFileSync(configPath, configSource);

    expect(listDocuments(root)).toEqual([]);
    expect(listDocuments(root, { location: 'active' })).toEqual([]);
    expect(listDocuments(root, { location: 'archive' })).toEqual([]);
  });

  it('creates, lists, reads, updates, and versions strict canonical Markdown', () => {
    const root = repository();
    const created = createDocument(root, {
      title: 'Architecture decision',
      kind: 'hld',
      author: 'test',
      body: '## Context\n\nInitial.',
      metadata: { issue: 'hrn-00137' },
    });

    expect(created.id).toMatch(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u);
    expect(created.path).toBe(`.harnessctl/documents/${created.id}-architecture-decision-v1.md`);
    expect(created.body).toBe('# Architecture decision\n\n## Context\n\nInitial.\n');
    expect(parseDocumentId('see doc-00001 now', root)).toBe('doc-00001');
    expect(listDocuments(root)).toEqual([
      expect.objectContaining({ id: created.id, version: 1, superseded: false, archived: false }),
    ]);

    const updated = updateDocument(root, created.id, {
      status: 'review',
      body: '## Context\n\nReviewed.',
      expectedRevision: created.revision,
    });
    expect(updated.metadata.status).toBe('review');
    expect(() => updateDocument(root, created.id, { status: 'approved', expectedRevision: created.revision })).toThrow(
      /changed since/u,
    );

    const next = versionDocument(root, created.id, {
      title: 'Approved architecture',
      status: 'approved',
      expectedRevision: updated.revision,
    });
    expect(next.metadata.version).toBe(2);
    expect(getDocument(root, created.id, 1)).toEqual(expect.objectContaining({ superseded: true }));
    expect(readFileSync(join(root, created.path), 'utf8')).toContain('status: review');
    expect(listDocuments(root, { status: 'approved' })).toHaveLength(1);
  });

  it.each(['hld', 'lld', 'design-overview', 'gdd'])('accepts the canonical %s kind', (kind) => {
    const root = repository();
    expect(createDocument(root, { title: `Kind ${kind}`, kind }).metadata.kind).toBe(kind);
  });

  it.each(['task', 'draft', 'document'])('rejects removed kind %s at every mutation and filter boundary', (kind) => {
    const root = repository();
    expect(() => createDocument(root, { title: 'Removed kind', kind })).toThrow(/invalid document kind/u);
    const created = createDocument(root, { title: 'Canonical kind', kind: 'hld' });
    expect(() => updateDocument(root, created.id, { kind, expectedRevision: created.revision })).toThrow(
      /invalid document kind/u,
    );
    expect(() => versionDocument(root, created.id, { kind, expectedRevision: created.revision })).toThrow(
      /invalid document kind/u,
    );
    expect(() => listDocuments(root, { kind })).toThrow(/invalid document kind/u);
    expect(getDocument(root, created.id).revision).toBe(created.revision);
  });

  it('creates collision-safe IDs without reusing legacy numeric gaps', () => {
    const root = repository();
    const first = createDocument(root, { title: 'First', kind: 'hld' });
    const second = createDocument(root, { title: 'Second', kind: 'lld' });
    archiveDocument(root, first.id, first.revision);
    rmSync(join(root, second.path));

    const created = createDocument(root, { title: 'Reuse gap', kind: 'design-overview' });
    expect(created.id).toMatch(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u);
    expect(created.id).not.toBe(second.id);
  });

  it('rejects a generated identity collision before changing canonical authority', () => {
    const root = repository();
    const provider = createFilesystemDocumentProvider(root, {
      generateUlid: () => '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
    const created = provider.create({ title: 'First collision candidate', kind: 'hld' });
    const authorityRoot = join(root, '.harnessctl/documents');
    const before = authoritySnapshot(root);

    expect(() => provider.create({ title: 'Different slug', kind: 'lld' })).toThrow(/duplicate/u);
    expect(authoritySnapshot(root)).toEqual(before);
    expect(provider.get(created.id).metadata.title).toBe('First collision candidate');
    expect(existsSync(authorityRoot)).toBe(true);
  });

  it('operates deterministically across mixed legacy and ULID document lineages', () => {
    const root = repository();
    writeCanonical(root, metadata('doc-00002', 'Legacy lineage', 1), 'Legacy body.');
    const provider = createFilesystemDocumentProvider(root, {
      generateUlid: () => '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
    const ulid = provider.create({ title: 'ULID lineage', kind: 'lld' });

    expect(provider.list().map(({ id }) => id)).toEqual(['doc-00002', ulid.id]);
    const legacy = versionDocument(root, 'doc-00002', {
      body: 'Legacy version two.',
      expectedRevision: getDocument(root, 'doc-00002').revision,
    });
    const archived = archiveDocument(root, legacy.id, legacy.revision);
    restoreDocument(root, legacy.id, archived.documents.at(-1)?.revision ?? '');

    const issue = createIssueRecord(root, { type: 'task', title: 'Mixed document links' });
    linkDocument(root, issue.id, legacy.path, 'document');
    linkDocument(root, issue.id, ulid.path, 'document');
    expect(getIssue(root, issue.id).metadata.documents).toEqual([legacy.path, ulid.path]);
    expect(validateDocuments(root)).toEqual({ valid: true, findings: [] });
  });

  it('rejects proposed file and lineage limits without canonical, cache, journal, or temp mutation', () => {
    const fileRoot = repository();
    for (let index = 1; index <= DOCUMENT_LIMITS.files; index += 1)
      writeCanonical(fileRoot, metadata(`doc-${String(index).padStart(5, '0')}`, `Boundary ${index}`, 1), 'Body.');
    getDocument(fileRoot, 'doc-00001');
    const fileSnapshot = authoritySnapshot(fileRoot);

    expect(() => createDocument(fileRoot, { title: 'File 2001', kind: 'hld' })).toThrow(/file limit/u);
    expect(authoritySnapshot(fileRoot)).toEqual(fileSnapshot);

    const versionRoot = repository();
    for (let version = 1; version <= DOCUMENT_LIMITS.versions; version += 1)
      writeCanonical(versionRoot, metadata('doc-00001', 'Version boundary', version), 'Body.');
    const current = getDocument(versionRoot, 'doc-00001');
    const versionSnapshot = authoritySnapshot(versionRoot);

    expect(() => versionDocument(versionRoot, current.id, { expectedRevision: current.revision })).toThrow(
      /version limit/u,
    );
    expect(authoritySnapshot(versionRoot)).toEqual(versionSnapshot);
  });

  it('rejects an oversized proposed result before publishing canonical or cache state', () => {
    const root = repository();
    const before = authoritySnapshot(root);

    expect(() =>
      createDocument(root, { title: 'Escaped result', kind: 'hld', body: `x\n${'\t'.repeat(700_000)}\ny` }),
    ).toThrow(/result character limit/u);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it('rejects proposed aggregate bytes before publishing canonical or cache state', () => {
    const root = repository();
    for (let index = 1; index <= 9; index += 1)
      writeCanonical(
        root,
        metadata(`doc-${String(index).padStart(5, '0')}`, `Aggregate proposal ${index}`, 1),
        'x'.repeat(index === 1 ? 100_000 : 925_000),
      );
    const current = getDocument(root, 'doc-00001');
    const before = authoritySnapshot(root);

    expect(() =>
      updateDocument(root, current.id, { body: 'x'.repeat(999_900), expectedRevision: current.revision }),
    ).toThrow(/aggregate canonical document byte limit/u);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it('archives and restores complete immutable lineages', () => {
    const root = repository();
    const first = createDocument(root, { title: 'Lineage', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    const archived = archiveDocument(root, first.id, second.revision);

    expect(archived.documents).toHaveLength(2);
    expect(archived.documents.every((record) => record.archived)).toBe(true);
    expect(archived.documents.every((record) => !('body' in record))).toBe(true);
    expect(existsSync(join(root, first.path))).toBe(false);
    const restored = restoreDocument(root, first.id, archived.documents.at(-1)?.revision ?? '');
    expect(restored.documents.every((record) => record.location === 'active')).toBe(true);
    expect(getDocument(root, first.id).metadata.version).toBe(2);
  });

  it('rolls back a partially published lineage batch', () => {
    const root = repository();
    const first = createDocument(root, { title: 'Rollback', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    process.env.HARNESSCTL_TEST_PUBLICATION_FAILURE_PATH = second.path.replace(
      '.harnessctl/documents/',
      '.harnessctl/documents/archive/',
    );

    expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/publication failure/u);
    delete process.env.HARNESSCTL_TEST_PUBLICATION_FAILURE_PATH;
    expect(getDocument(root, first.id).metadata.version).toBe(2);
    expect(existsSync(join(root, first.path.replace('.harnessctl/documents/', '.harnessctl/documents/archive/')))).toBe(
      false,
    );
  });

  it('recovers an interrupted physical lineage move from the durable journal before discovery', () => {
    const root = repository();
    const first = createDocument(root, { title: 'Interrupted', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';

    expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/interruption/u);
    expect(existsSync(join(root, '.harnessctl/documents/.control/transaction.json'))).toBe(true);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;

    expect(getDocument(root, first.id).metadata.version).toBe(2);
    expect(existsSync(join(root, '.harnessctl/documents/.control/transaction.json'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl/documents/archive/doc-00001-interrupted-v1.md'))).toBe(false);
  });

  it('makes every cleanup interruption window recoverable or leaves only harmless backups', () => {
    for (let interruptionPoint = 0; interruptionPoint <= 3; interruptionPoint += 1) {
      const root = repository();
      const first = createDocument(root, { title: `Cleanup ${interruptionPoint}`, kind: 'hld' });
      const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
      process.env.HARNESSCTL_TEST_DOCUMENT_CLEANUP_INTERRUPT_AFTER = String(interruptionPoint);

      expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/interruption/u);
      const journal = join(root, '.harnessctl/documents/.control/transaction.json');
      expect(existsSync(journal)).toBe(interruptionPoint === 0);
      delete process.env.HARNESSCTL_TEST_DOCUMENT_CLEANUP_INTERRUPT_AFTER;

      const recovered = getDocument(root, first.id);
      expect(recovered.archived).toBe(interruptionPoint !== 0);
      expect(existsSync(journal)).toBe(false);
      expect(readdirSync(join(root, '.harnessctl/documents/.control/transaction-files'))).toEqual([]);
    }
  });

  it('recovers an interrupted restore to the complete archived lineage', () => {
    const root = repository();
    const first = createDocument(root, { title: 'Restore interrupted', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    const archived = archiveDocument(root, first.id, second.revision);
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';

    expect(() => restoreDocument(root, first.id, archived.documents.at(-1)?.revision ?? '')).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;

    expect(getDocument(root, first.id)).toEqual(
      expect.objectContaining({ archived: true, metadata: expect.objectContaining({ version: 2 }) }),
    );
    expect(existsSync(join(root, first.path))).toBe(false);
    const restored = restoreDocument(root, first.id, archived.documents.at(-1)?.revision ?? '');
    expect(restored.documents).toHaveLength(2);
  });

  it('removes owned publisher temps after interrupted create and update publication', () => {
    const root = repository();
    const createId = 'doc-00000000000000000000000000';
    const createPath = `.harnessctl/documents/${createId}-temp-create-v1.md`;
    process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH = createPath;
    expect(() =>
      createFilesystemDocumentProvider(root, { generateUlid: () => createId.slice(4) }).create({
        title: 'Temp create',
        kind: 'hld',
      }),
    ).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH;
    expect(listDocuments(root)).toEqual([]);

    const created = createDocument(root, { title: 'Temp update', kind: 'hld', body: 'Original.' });
    process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH = created.path;
    expect(() => updateDocument(root, created.id, { body: 'Changed.', expectedRevision: created.revision })).toThrow(
      /interruption/u,
    );
    delete process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH;
    expect(getDocument(root, created.id).body).toContain('Original.');
    expect(readdirSync(join(root, '.harnessctl/documents')).some((name) => name.includes('document-publish'))).toBe(
      false,
    );
  });

  it('removes owned publisher temps while recovering interrupted archive and restore publication', () => {
    const root = repository();
    const created = createDocument(root, { title: 'Move temp', kind: 'hld' });
    const archivePath = `.harnessctl/documents/archive/${created.path.split('/').at(-1) ?? ''}`;
    process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH = archivePath;
    expect(() => archiveDocument(root, created.id, created.revision)).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH;
    expect(getDocument(root, created.id).archived).toBe(false);

    const archived = archiveDocument(root, created.id, created.revision);
    process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH = created.path;
    expect(() => restoreDocument(root, created.id, archived.documents[0]?.revision ?? '')).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_PRE_RENAME_INTERRUPT_PATH;
    expect(getDocument(root, created.id).archived).toBe(true);
  });

  it('cleans only exact owned temp names across managed directories', () => {
    const root = repository();
    createDocument(root, { title: 'Temp fixtures', kind: 'hld' });
    const documentRoot = join(root, '.harnessctl/documents');
    const directories = [
      documentRoot,
      join(documentRoot, 'archive'),
      join(documentRoot, '.control'),
      join(documentRoot, '.control/transaction-files'),
    ];
    const ownedName = '.harnessctl-document-publish-aaaaaaaaaaaaaaaaaaaaaaaa.tmp';
    for (const directory of directories) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, ownedName), 'publisher temp');
    }
    const nearMatch = `${ownedName}.keep`;
    writeFileSync(join(documentRoot, '.control', nearMatch), 'operator file');

    expect(listDocuments(root)).toHaveLength(1);
    expect(directories.every((directory) => !existsSync(join(directory, ownedName)))).toBe(true);
    expect(existsSync(join(documentRoot, '.control', nearMatch))).toBe(true);

    writeFileSync(join(documentRoot, nearMatch), 'operator file');
    expect(() => listDocuments(root)).toThrow(/unsupported canonical document file/u);
    expect(existsSync(join(documentRoot, nearMatch))).toBe(true);
  });

  it.each([
    ['publisher temp', '.harnessctl/documents/.harnessctl-document-publish-cccccccccccccccccccccccc.tmp'],
    ['orphan backup', '.harnessctl/documents/.control/transaction-files/001.md'],
  ])('preserves a no-journal %s when the current issue graph is invalid', (_artifact, path) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'epic', title: 'Invalid cleanup graph' });
    createDocument(root, { title: 'Cleanup guard', kind: 'hld' });
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), 'cleanup artifact');
    invalidateIssueGraph(root, issue.path, 'missing parent');
    const before = authoritySnapshot(root);

    expect(() => listDocuments(root)).toThrow(/canonical issue graph is invalid/u);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it('rejects rather than removes an exact-name symlink publisher temp', () => {
    const root = repository();
    const documentRoot = join(root, '.harnessctl/documents');
    mkdirSync(documentRoot, { recursive: true });
    const target = join(root, 'operator-owned');
    writeFileSync(target, 'operator file');
    const temp = join(documentRoot, '.harnessctl-document-publish-bbbbbbbbbbbbbbbbbbbbbbbb.tmp');
    symlinkSync(target, temp);

    expect(() => listDocuments(root)).toThrow(/temp path is unsafe/u);
    expect(existsSync(temp)).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('operator file');
  });

  it('serializes concurrent ID allocation without overwrites', async () => {
    const root = repository();
    expect(validateDocuments(root).valid).toBe(true);
    const moduleUrl = new URL('./dist/documents.js', import.meta.url).href;
    const jobs = Array.from(
      { length: 6 },
      (_, index) =>
        new Promise<string>((resolve, reject) => {
          const worker = new Worker(
            `import { parentPort, workerData } from 'node:worker_threads';
           import { createDocument } from ${JSON.stringify(moduleUrl)};
           try { parentPort.postMessage(createDocument(workerData.root, { title: 'Concurrent ' + workerData.index, kind: 'hld' }).id); }
           catch (error) { throw error; }`,
            { eval: true, type: 'module', workerData: { root, index } } as never,
          );
          worker.once('message', resolve);
          worker.once('error', reject);
        }),
    );
    await expect(Promise.all(jobs)).resolves.toEqual([
      expect.stringMatching(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u),
      expect.stringMatching(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u),
      expect.stringMatching(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u),
      expect.stringMatching(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u),
      expect.stringMatching(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u),
      expect.stringMatching(/^doc-[0-9A-HJKMNP-TV-Z]{26}$/u),
    ]);
    expect(new Set(listDocuments(root).map((document) => document.id)).size).toBe(6);
  });

  it('rejects malformed YAML, duplicate keys, H1 violations, gaps, and symlink roots', () => {
    const root = repository();
    const created = createDocument(root, { title: 'Strict', kind: 'hld' });
    const path = join(root, created.path);
    writeFileSync(path, readFileSync(path, 'utf8').replace('title: "Strict"', 'title: "Strict"\ntitle: "Again"'));
    expect(validateDocuments(root)).toEqual(
      expect.objectContaining({ valid: false, findings: [expect.objectContaining({ category: 'parse_safety' })] }),
    );

    const h1Root = repository();
    expect(() => createDocument(h1Root, { title: 'Bad', kind: 'hld', body: '# Extra' })).toThrow(DocumentError);

    const symlinkRoot = repository();
    const outside = mkdtempSync(join(tmpdir(), 'harnessctl-documents-outside-'));
    roots.push(outside);
    symlinkSync(outside, join(symlinkRoot, '.harnessctl', 'documents'));
    expect(() => createDocument(symlinkRoot, { title: 'Unsafe', kind: 'hld' })).toThrow(/non-symlink/u);
  });

  it('rejects gaps, partial lineages, destination collisions, invalid IDs, and exact-byte stale revisions', () => {
    const gapRoot = repository();
    const gapFirst = createDocument(gapRoot, { title: 'Gap', kind: 'hld' });
    versionDocument(gapRoot, gapFirst.id, { body: 'Second.', expectedRevision: gapFirst.revision });
    rmSync(join(gapRoot, gapFirst.path));
    expect(validateDocuments(gapRoot).findings[0]?.message).toMatch(/lineage|version/u);

    const partialRoot = repository();
    const partialFirst = createDocument(partialRoot, { title: 'Partial', kind: 'hld' });
    const partialSecond = versionDocument(partialRoot, partialFirst.id, {
      body: 'Second.',
      expectedRevision: partialFirst.revision,
    });
    mkdirSync(join(partialRoot, '.harnessctl/documents/archive'));
    renameSync(
      join(partialRoot, partialSecond.path),
      join(partialRoot, '.harnessctl/documents/archive', partialSecond.path.split('/').at(-1) ?? ''),
    );
    expect(() => getDocument(partialRoot, partialFirst.id)).toThrow(/lineage|canonical document/u);

    const collisionRoot = repository();
    const collision = createDocument(collisionRoot, { title: 'Collision', kind: 'hld' });
    mkdirSync(join(collisionRoot, '.harnessctl/documents/archive'));
    writeFileSync(
      join(collisionRoot, '.harnessctl/documents/archive', collision.path.split('/').at(-1) ?? ''),
      readFileSync(join(collisionRoot, collision.path)),
    );
    expect(() => archiveDocument(collisionRoot, collision.id, collision.revision)).toThrow(/lineage|duplicate/u);
    expect(existsSync(join(collisionRoot, collision.path))).toBe(true);

    const invalidIdRoot = repository();
    writeCanonical(invalidIdRoot, metadata('doc-invalid', 'Invalid ID', 1), 'Body.');
    expect(validateDocuments(invalidIdRoot).findings[0]?.message).toContain('prefix');

    const staleRoot = repository();
    const stale = createDocument(staleRoot, { title: 'Exact bytes', kind: 'hld' });
    const decoded = decodeDocument(readFileSync(join(staleRoot, stale.path)));
    writeFileSync(
      join(staleRoot, stale.path),
      encodeCanonicalDocument(
        { ...decoded.metadata, status: 'review', updated_at: '2026-08-26T00:00:01.000Z' },
        'Changed.',
      ),
    );
    expect(() => updateDocument(staleRoot, stale.id, { status: 'approved', expectedRevision: stale.revision })).toThrow(
      /changed since/u,
    );
  });

  it('enforces body, aggregate, lineage, list, and result bounds at practical seams', () => {
    const bodyRoot = repository();
    expect(() =>
      createDocument(bodyRoot, {
        title: 'Oversized body',
        kind: 'hld',
        body: 'x'.repeat(DOCUMENT_LIMITS.bodyBytes + 1),
      }),
    ).toThrow(/body byte limit/u);
    const boundedOutput = createDocument(bodyRoot, {
      title: 'Bounded output',
      kind: 'hld',
      body: 'x'.repeat(900_000),
      metadata: { note: 'y'.repeat(60_000) },
    });
    expect(JSON.stringify(boundedOutput).length).toBeLessThanOrEqual(DOCUMENT_LIMITS.resultChars);

    const aggregateRoot = repository();
    for (let index = 1; index <= 9; index += 1)
      writeCanonical(
        aggregateRoot,
        metadata(`doc-${String(index).padStart(5, '0')}`, `Aggregate ${index}`, 1),
        'x'.repeat(940_000),
      );
    expect(validateDocuments(aggregateRoot).findings[0]?.message).toContain('aggregate canonical document byte limit');

    const lineageRoot = repository();
    for (let version = 1; version <= DOCUMENT_LIMITS.versions + 1; version += 1)
      writeCanonical(lineageRoot, metadata('doc-00001', 'Long lineage', version), 'Body.');
    expect(validateDocuments(lineageRoot).findings[0]?.message).toContain('version limit');

    const listRoot = repository();
    for (let index = 1; index <= DOCUMENT_LIMITS.listResults + 1; index += 1)
      writeCanonical(listRoot, metadata(`doc-${String(index).padStart(5, '0')}`, `List ${index}`, 1), 'Body.');
    expect(() => listDocuments(listRoot)).toThrow(/result count limit/u);
  });

  it('rejects BOMs, aliases, anchors, explicit tags, deep or colliding metadata, and malformed journals', () => {
    const unsafeSources = [
      (source: string) => `\uFEFF${source}`,
      (source: string) => source.replace('metadata: {"key":"value"}', 'metadata: &meta {key: value, copy: *meta}'),
      (source: string) => source.replace('kind: hld', 'kind: !!str hld'),
    ];
    for (const transform of unsafeSources) {
      const root = repository();
      const created = createDocument(root, { title: 'Unsafe YAML', kind: 'hld', metadata: { key: 'value' } });
      writeFileSync(join(root, created.path), transform(readFileSync(join(root, created.path), 'utf8')));
      expect(validateDocuments(root).valid).toBe(false);
    }

    const metadataRoot = repository();
    expect(() =>
      createDocument(metadataRoot, { title: 'Collision', kind: 'hld', metadata: { Name: 1, name: 2 } }),
    ).toThrow(/collide/u);
    let deep: Record<string, unknown> = {};
    for (let depth = 0; depth < DOCUMENT_LIMITS.yamlDepth + 2; depth += 1) deep = { nested: deep };
    expect(() => createDocument(metadataRoot, { title: 'Deep', kind: 'hld', metadata: deep })).toThrow(/depth limit/u);

    const journalRoot = repository();
    const first = createDocument(journalRoot, { title: 'Journal', kind: 'hld' });
    const second = versionDocument(journalRoot, first.id, { body: 'Second.', expectedRevision: first.revision });
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';
    expect(() => archiveDocument(journalRoot, first.id, second.revision)).toThrow();
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
    const journalPath = join(journalRoot, '.harnessctl/documents/.control/transaction.json');
    writeFileSync(journalPath, '{"version":1,"version":1}\n');
    expect(() => getDocument(journalRoot, first.id)).toThrow(/journal/u);
  });

  it('keeps canonical publication when cache synchronization and rebuild both fail, then repairs later', () => {
    const root = repository();
    const created = createDocument(root, { title: 'Projection', kind: 'hld' });
    process.env.HARNESSCTL_TEST_CACHE_FAILURE = 'all';

    expect(() =>
      updateDocument(root, created.id, { body: 'Canonical survives.', expectedRevision: created.revision }),
    ).toThrow(/canonical data may already be committed/u);
    delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
    const repaired = getDocument(root, created.id);
    expect(repaired.body).toContain('Canonical survives.');
    expect(validateDocuments(root).valid).toBe(true);
  });

  it.each(
    ['create', 'same-path update', 'path-changing update', 'version', 'archive', 'restore'].flatMap((operation) =>
      ['missing parent', 'missing relationship target'].map((invalidGraph) => [operation, invalidGraph] as const),
    ),
  )('rejects %s before publication when the Issues graph has a %s', (operation, invalidGraph) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Graph preflight' });
    const mutate = prepareDocumentMutation(root, operation);
    invalidateIssueGraph(root, issue.path, invalidGraph);
    const before = authoritySnapshot(root);

    expect(mutate).toThrow(/canonical issue graph is invalid/u);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it.each(
    ['create', 'archive'].flatMap((operation) =>
      ['missing parent', 'missing relationship target'].map((invalidGraph) => [operation, invalidGraph] as const),
    ),
  )('rejects %s before pending journal recovery when the Issues graph has a %s', (operation, invalidGraph) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Journal graph preflight' });
    const first = createDocument(root, { title: 'Interrupted journal', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    const archiveTarget = createDocument(root, { title: 'Blocked archive', kind: 'hld' });
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';
    expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
    invalidateIssueGraph(root, issue.path, invalidGraph);
    const before = authoritySnapshot(root);

    const mutate =
      operation === 'create'
        ? () => createDocument(root, { title: 'Blocked by pending journal', kind: 'hld' })
        : () => archiveDocument(root, archiveTarget.id, archiveTarget.revision);
    expect(mutate).toThrow(/canonical issue graph is invalid/u);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it.each(
    ['get', 'list', 'validate'].flatMap((operation) =>
      ['missing parent', 'missing relationship target'].map((invalidGraph) => [operation, invalidGraph] as const),
    ),
  )('rejects %s before read-triggered recovery when the Issues graph has a %s', (operation, invalidGraph) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Read recovery graph preflight' });
    const first = createDocument(root, { title: 'Interrupted read recovery', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';
    expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
    invalidateIssueGraph(root, issue.path, invalidGraph);
    const before = authoritySnapshot(root);

    const read = documentReadOperation(root, operation, first.id);
    expectInvalidIssueGraphRejection(read, operation);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it.each(
    ['get', 'list', 'validate'].flatMap((operation) =>
      ['missing', 'corrupt'].map((cacheState) => [operation, cacheState] as const),
    ),
  )('rejects %s before repairing a %s cache when the Issues graph is invalid', (operation, cacheState) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Cache repair graph preflight' });
    const created = createDocument(root, { title: 'Blocked cache repair', kind: 'hld' });
    invalidateIssueGraph(root, issue.path, 'missing parent');
    const cache = join(root, '.harnessctl', 'cache', 'harnessctl.sqlite');
    if (cacheState === 'missing') rmSync(cache);
    else writeFileSync(cache, 'not a SQLite database');
    const before = authoritySnapshot(root);

    const read = documentReadOperation(root, operation, created.id);
    expectInvalidIssueGraphRejection(read, operation);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it.each(
    ['get', 'list', 'validate'].flatMap((operation) =>
      ['hierarchy cycle', 'invalid document link'].map((invalidGraph) => [operation, invalidGraph] as const),
    ),
  )('rejects %s before cache repair for a graph containing a %s', (operation, invalidGraph) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'task', title: 'Cross-domain graph preflight' });
    const created = createDocument(root, { title: 'Blocked cross-domain repair', kind: 'hld' });
    if (invalidGraph === 'hierarchy cycle') {
      const peer = createIssueRecord(root, { type: 'task', title: 'Cycle peer' });
      rewriteIssue(root, issue.path, (value) => ({ ...value, parent: peer.id }));
      rewriteIssue(root, peer.path, (value) => ({ ...value, parent: issue.id }));
    } else {
      rewriteIssue(root, issue.path, (value) => ({
        ...value,
        documents: ['.harnessctl/documents/doc-99999-missing-v1.md'],
      }));
    }
    const cache = join(root, '.harnessctl', 'cache', 'harnessctl.sqlite');
    writeFileSync(cache, 'not a SQLite database');
    const before = authoritySnapshot(root);

    const read = documentReadOperation(root, operation, created.id);
    expectInvalidIssueGraphRejection(read, operation);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it.each(['unrelated malformed document', 'broken memory relationship'])(
    'rejects recovery before changing authority when the repository contains an %s',
    (invalidAuthority) => {
      const root = repository();
      let invalidate: () => () => void;
      if (invalidAuthority === 'broken memory relationship') {
        const configPath = join(root, '.harnessctl/config.yaml');
        const config = parseDocument(readFileSync(configPath, 'utf8'));
        config.setIn(['skills', 'memory', 'enabled'], true);
        writeFileSync(configPath, config.toString());
        const record = storeMemory(root, {
          memory_type: 'semantic',
          record_type: 'fact',
          summary: 'Recovery preflight memory',
          source: { kind: 'user-confirmed', ref: null, revision: null },
          created_by: 'test',
          confidence: 'confirmed',
        });
        const path = join(root, '.harnessctl/memory/facts', `${record.id}.yaml`);
        const valid = readFileSync(path, 'utf8');
        invalidate = () => {
          const document = parseDocument(valid);
          document.set('supersedes', ['01ARZ3NDEKTSV4RRFFQ69G5FAV']);
          writeFileSync(path, document.toString());
          return () => writeFileSync(path, valid);
        };
      } else {
        invalidate = () => {
          const path = join(root, '.harnessctl/documents/doc-99999-broken-v1.md');
          writeFileSync(path, 'not canonical Markdown');
          return () => rmSync(path);
        };
      }
      const first = createDocument(root, { title: 'Complete graph recovery', kind: 'hld' });
      const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
      process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';
      expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/interruption/u);
      delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
      const repair = invalidate();
      const before = authoritySnapshot(root);

      expect(() => getDocument(root, first.id)).toThrow();
      expect(authoritySnapshot(root)).toEqual(before);

      repair();
      expect(getDocument(root, first.id).id).toBe(first.id);
      expect(existsSync(join(root, '.harnessctl/documents/.control/transaction.json'))).toBe(false);
    },
  );

  it('rejects restore recovery when its virtual rollback would break an active issue link', () => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'epic', title: 'Recovery link' });
    const first = createDocument(root, { title: 'Linked recovery', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    archiveDocument(root, first.id, second.revision);
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = '1';
    expect(() => restoreDocument(root, first.id, second.revision)).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
    rewriteIssue(root, issue.path, (value) => ({ ...value, documents: [first.path] }));
    const before = authoritySnapshot(root);

    expect(() => getDocument(root, first.id)).toThrow(/canonical issue graph is invalid/u);
    expect(authoritySnapshot(root)).toEqual(before);
  });

  it.each([3, 4])('recovers interrupted archive point %i when rollback restores an active issue link', (point) => {
    const root = repository();
    const issue = createIssueRecord(root, { type: 'epic', title: 'Recoverable link' });
    const first = createDocument(root, { title: 'Recoverable linked archive', kind: 'hld' });
    const second = versionDocument(root, first.id, { body: 'Second.', expectedRevision: first.revision });
    process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER = String(point);
    expect(() => archiveDocument(root, first.id, second.revision)).toThrow(/interruption/u);
    delete process.env.HARNESSCTL_TEST_DOCUMENT_INTERRUPT_AFTER;
    expect(existsSync(join(root, first.path))).toBe(false);
    rewriteIssue(root, issue.path, (value) => ({ ...value, documents: [first.path] }));

    expect(getDocument(root, first.id).id).toBe(first.id);
    expect(existsSync(join(root, first.path))).toBe(true);
    expect(existsSync(join(root, '.harnessctl/documents/.control/transaction.json'))).toBe(false);
  });

  it('rebuilds missing, contradictory, and corrupt disposable cache state from canonical Markdown', () => {
    const root = repository();
    const created = createDocument(root, {
      title: 'Cache repair',
      kind: 'hld',
      metadata: { private_operator_note: 'canonical-only' },
    });
    const cache = join(root, '.harnessctl', 'cache', 'harnessctl.sqlite');
    rmSync(cache);
    expect(getDocument(root, created.id).id).toBe(created.id);

    const require = createRequire(import.meta.url);
    const sqlite = require('node:sqlite') as {
      DatabaseSync: new (path: string) => {
        exec(sql: string): void;
        prepare(sql: string): { all(): Array<Record<string, unknown>>; get(): Record<string, unknown> };
        close(): void;
      };
    };
    const database = new sqlite.DatabaseSync(cache);
    const columns = database
      .prepare('PRAGMA table_info(documents)')
      .all()
      .map((row) => row.name);
    const cachedDocument = database.prepare('SELECT * FROM documents').get();
    const cacheMeta = database.prepare('SELECT document_count, projection_digest FROM cache_meta').get();
    expect(columns).toEqual([
      'id',
      'version',
      'location',
      'canonical_path',
      'byte_revision',
      'title',
      'kind',
      'status',
      'created_at',
      'updated_at',
      'created_by',
    ]);
    expect(JSON.stringify(cachedDocument)).not.toContain('canonical-only');
    expect(cacheMeta).toEqual({ document_count: 1, projection_digest: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    database.exec('DELETE FROM documents');
    database.close();
    expect(getDocument(root, created.id).id).toBe(created.id);

    writeFileSync(cache, 'not a SQLite database');
    expect(getDocument(root, created.id).body).toContain('# Cache repair');
  });

  it('rejects non-filesystem authority before barrier, canonical root, or cache access', () => {
    const root = repository();
    writeFileSync(
      join(root, '.harnessctl', 'config.yaml'),
      'version: 1\nskills:\n  documents:\n    root: .harnessctl/documents\n    prefix: doc-\n    provider:\n      type: github\n      tools: gh\n      url: https://github.com\n      token_env: GH_TOKEN\n',
    );
    expect(() => parseDocumentId('doc-00001', root)).toThrow(/documents/u);
    expect(existsSync(join(root, '.harnessctl', 'documents'))).toBe(false);
    expect(existsSync(join(root, '.harnessctl', 'cache'))).toBe(false);
  });
});

function prepareDocumentMutation(root: string, operation: string): () => unknown {
  if (operation === 'create') return () => createDocument(root, { title: 'Blocked create', kind: 'hld' });
  const created = createDocument(root, { title: 'Blocked mutation', kind: 'hld', body: 'Original.' });
  if (operation === 'same-path update')
    return () => updateDocument(root, created.id, { body: 'Changed.', expectedRevision: created.revision });
  if (operation === 'path-changing update')
    return () => updateDocument(root, created.id, { title: 'Changed title', expectedRevision: created.revision });
  if (operation === 'version') return () => versionDocument(root, created.id, { expectedRevision: created.revision });
  if (operation === 'archive') return () => archiveDocument(root, created.id, created.revision);
  const archived = archiveDocument(root, created.id, created.revision);
  return () => restoreDocument(root, created.id, archived.documents[0]?.revision ?? '');
}

function invalidateIssueGraph(root: string, path: string, invalidGraph: string): void {
  rewriteIssue(root, path, (issue) =>
    invalidGraph === 'missing parent' ? { ...issue, parent: 'hrn-99999' } : { ...issue, relates_to: ['hrn-99999'] },
  );
}

function rewriteIssue(
  root: string,
  path: string,
  change: (issue: CanonicalIssueDocument) => CanonicalIssueDocument,
): void {
  const absolutePath = join(root, path);
  const { issue } = decodeIssueDocument(readFileSync(absolutePath));
  writeFileSync(absolutePath, encodeCanonicalIssue(change(issue)));
}

function documentReadOperation(root: string, operation: string, id: string): () => unknown {
  if (operation === 'get') return () => getDocument(root, id);
  if (operation === 'list') return () => listDocuments(root);
  return () => validateDocuments(root, id);
}

function expectInvalidIssueGraphRejection(operation: () => unknown, name: string): void {
  if (name !== 'validate') {
    expect(operation).toThrow(/canonical issue graph is invalid/u);
    return;
  }
  expect(operation()).toEqual({
    valid: false,
    findings: [expect.objectContaining({ message: expect.stringMatching(/canonical issue graph is invalid/u) })],
  });
}

function metadata(id: string, title: string, version: number): CanonicalDocumentMetadata {
  return {
    id,
    title,
    kind: 'hld',
    status: 'draft',
    version,
    created_at: '2026-08-26T00:00:00.000Z',
    updated_at: '2026-08-26T00:00:00.000Z',
  };
}

function writeCanonical(root: string, value: CanonicalDocumentMetadata, body: string): void {
  const directory = join(root, '.harnessctl/documents');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, canonicalDocumentFilename(value)), encodeCanonicalDocument(value, body));
}

function authoritySnapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (relativePath: string): void => {
    const path = join(root, relativePath);
    if (!existsSync(path) || relativePath.endsWith('.lock')) return;
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(`${relativePath}/${name}`);
      return;
    }
    result[relativePath] = readFileSync(path).toString('base64');
  };
  visit('.harnessctl/documents');
  visit('.harnessctl/cache');
  return result;
}
