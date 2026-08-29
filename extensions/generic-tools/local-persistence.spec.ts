import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import {
  DOCUMENT_LIMITS,
  canonicalDocumentFilename,
  encodeCanonicalDocument,
  type CanonicalDocumentMetadata,
} from './documents-contract.js';
import { canonicalIssueFilename, encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import {
  ensureLocalCache,
  LocalPersistenceError,
  loadLocalSnapshot,
  readBoundedNoFollowFile,
  selectSqliteRuntime,
  withLocalBarrier,
} from './local-persistence.js';

describe('local SQLite runtime selection', () => {
  it('does not read disabled local authorities into a shared snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-disabled-snapshot-'));
    try {
      createConfig(root);
      writeFileSync(
        join(root, '.harnessctl/config.yaml'),
        'version: 1\nskills:\n  issues:\n    enabled: false\n  documents:\n    enabled: false\n  memory:\n    enabled: false\n',
      );
      mkdirSync(join(root, '.harnessctl/issues'), { recursive: true });
      mkdirSync(join(root, '.harnessctl/documents'), { recursive: true });
      mkdirSync(join(root, '.harnessctl/memory/facts'), { recursive: true });
      writeFileSync(join(root, '.harnessctl/issues/broken.yml'), 'not: canonical');
      writeFileSync(join(root, '.harnessctl/documents/broken.md'), 'not canonical');
      writeFileSync(join(root, '.harnessctl/memory/facts/broken.yaml'), 'not: canonical');

      const snapshot = withLocalBarrier(root, (lease) => loadLocalSnapshot(lease));

      expect(snapshot.issues).toEqual([]);
      expect(snapshot.documents).toEqual([]);
      expect(snapshot.memories).toEqual([]);
      expect(snapshot.tombstones).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('supports the minimum runtimes and documents the pinned CI runtimes', () => {
    expect(selectSqliteRuntime({ node: '22.13.0' })).toBe('node');
    expect(selectSqliteRuntime({ node: '24.15.0' })).toBe('node');
    expect(selectSqliteRuntime({ node: '25.0.0' })).toBe('node');
    expect(selectSqliteRuntime({ bun: '1.3.13', node: '24.15.0' })).toBe('bun');
    expect(selectSqliteRuntime({ bun: '1.4.0', node: '24.15.0' })).toBe('bun');
  });

  it('rejects unsupported versions before selecting a SQLite built-in', () => {
    expect(() => selectSqliteRuntime({ node: '22.12.9' })).toThrow(LocalPersistenceError);
    expect(() => selectSqliteRuntime({ node: '23.0.0' })).toThrow(LocalPersistenceError);
    expect(() => selectSqliteRuntime({ bun: '1.3.12', node: '24.15.0' })).toThrow(/Bun 1\.3\.12.*unsupported/u);
    expect(() => selectSqliteRuntime({})).toThrow(/unsupported runtime/u);
  });

  it('rejects an oversized document lineage before producing a cache snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-local-persistence-'));
    try {
      createConfig(root);
      const directory = join(root, '.harnessctl/documents');
      mkdirSync(directory, { recursive: true });
      for (let version = 1; version <= DOCUMENT_LIMITS.versions + 1; version += 1) {
        const metadata: CanonicalDocumentMetadata = {
          id: 'doc-00001',
          title: 'Oversized lineage',
          kind: 'hld',
          status: 'draft',
          version,
          created_at: '2026-08-26T00:00:00.000Z',
          updated_at: '2026-08-26T00:00:00.000Z',
        };
        writeFileSync(join(directory, canonicalDocumentFilename(metadata)), encodeCanonicalDocument(metadata, 'Body.'));
      }

      expect(() => withLocalBarrier(root, (lease) => loadLocalSnapshot(lease))).toThrow(/version limit/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rebuilds a valid cache when a child issue sorts before its parent', () => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-local-persistence-'));
    try {
      createConfig(root);
      const directory = join(root, '.harnessctl/issues');
      mkdirSync(directory, { recursive: true });
      const base: Omit<CanonicalIssueDocument, 'id' | 'title'> = {
        version: 1,
        type: 'task',
        status: 'open',
        created_at: '2026-08-27T00:00:00.000Z',
        updated_at: '2026-08-27T00:00:00.000Z',
        body: '',
        comments: [],
      };
      const child: CanonicalIssueDocument = {
        ...base,
        id: 'hrn-00001',
        title: 'Child',
        parent: 'hrn-00002',
      };
      const parent: CanonicalIssueDocument = { ...base, id: 'hrn-00002', title: 'Parent' };
      writeFileSync(join(directory, canonicalIssueFilename(child.id, child.title)), encodeCanonicalIssue(child));
      writeFileSync(join(directory, canonicalIssueFilename(parent.id, parent.title)), encodeCanonicalIssue(parent));

      const validation = withLocalBarrier(root, (lease) => {
        const snapshot = loadLocalSnapshot(lease);
        expect(snapshot.issues.map(({ issue }) => issue.id)).toEqual(['hrn-00001', 'hrn-00002']);
        return ensureLocalCache(lease, snapshot);
      });

      expect(validation).toEqual({ outcome: 'rebuilt', evidence: 'canonical_snapshot_rebuild_verified' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['canonical document', '.harnessctl/documents/doc-00001-race-v1.md', false],
    ['transaction journal', '.harnessctl/documents/.control/transaction.json', false],
    ['transaction backup fallback', '.harnessctl/documents/.control/transaction-files/001.md', true],
  ])('rejects a deterministic %s identity race', (_label, relativePath, forceFallback) => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-bounded-read-'));
    try {
      const path = join(root, relativePath);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, 'trusted');
      const replacement = `${path}.replacement`;
      writeFileSync(replacement, 'attacker');

      expect(() =>
        readBoundedNoFollowFile(path, relativePath, 64, {
          forceFallback,
          beforeOpen: () => {
            renameSync(path, `${path}.original`);
            renameSync(replacement, path);
          },
        }),
      ).toThrow(/changed while reading/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['unsupported file', 'notes.txt', false],
    ['unexpected directory', 'nested', true],
  ])('rejects an %s in the Documents authority', (_label, name, directory) => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-local-persistence-'));
    try {
      createConfig(root);
      const documents = join(root, '.harnessctl/documents');
      mkdirSync(documents, { recursive: true });
      if (directory) mkdirSync(join(documents, name));
      else writeFileSync(join(documents, name), 'unexpected');

      expect(() => withLocalBarrier(root, (lease) => loadLocalSnapshot(lease))).toThrow(/canonical document/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('enforces the same five-digit canonical document ID minimum as the Documents provider', () => {
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-local-persistence-'));
    try {
      createConfig(root);
      const documents = join(root, '.harnessctl/documents');
      mkdirSync(documents, { recursive: true });
      const metadata: CanonicalDocumentMetadata = {
        id: 'doc-1',
        title: 'Short ID',
        kind: 'hld',
        status: 'draft',
        version: 1,
        created_at: '2026-08-26T00:00:00.000Z',
        updated_at: '2026-08-26T00:00:00.000Z',
      };
      writeFileSync(join(documents, canonicalDocumentFilename(metadata)), encodeCanonicalDocument(metadata, 'Body.'));

      expect(() => withLocalBarrier(root, (lease) => loadLocalSnapshot(lease))).toThrow(/ID is not canonical/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
