import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import { encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import {
  applyIssueFileBatch,
  discoverIssueStorage,
  resolveIssueCandidate,
  validateIssueRoot,
  withIssueBarrier,
} from './issues-storage.js';
import { listMemory } from './memory.js';

const roots: string[] = [];
const repository = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-issues-storage-'));
  roots.push(root);
  return root;
};

function issue(id = '00008', title = 'Safe discovery'): CanonicalIssueDocument {
  return {
    version: 1,
    id,
    type: 'task',
    title,
    status: 'open',
    created_at: '2026-08-14T13:43:41.772Z',
    updated_at: '2026-08-14T13:43:41.772Z',
    body: '',
    comments: [],
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('issue filesystem', () => {
  it('discovers active and archived canonical files and accepts manual YAML presentation', () => {
    const root = repository();
    mkdirSync(join(root, '.harnessctl/issues/archived'), { recursive: true });
    writeFileSync(join(root, '.harnessctl/issues/00008-safe-discovery.yml'), encodeCanonicalIssue(issue()));
    writeFileSync(
      join(root, '.harnessctl/issues/archived/00009-archived.yml'),
      new TextDecoder().decode(encodeCanonicalIssue(issue('00009', 'Archived'))).replace('"version": 1', 'version: 01'),
    );
    const storage = discoverIssueStorage(root);
    expect(storage.status).toBe('canonical');
    expect(resolveIssueCandidate(storage, '00009').decoded?.canonical).toBe(false);
  });

  it('diagnoses malformed files, duplicates, symlinks, and unsafe roots', () => {
    const root = repository();
    mkdirSync(join(root, '.harnessctl/issues/archived'), { recursive: true });
    writeFileSync(join(root, '.harnessctl/issues/00008-safe-discovery.yml'), encodeCanonicalIssue(issue()));
    writeFileSync(join(root, '.harnessctl/issues/archived/00008-safe-discovery.yml'), encodeCanonicalIssue(issue()));
    symlinkSync(
      join(root, '.harnessctl/issues/00008-safe-discovery.yml'),
      join(root, '.harnessctl/issues/00009-link.yml'),
    );
    expect(discoverIssueStorage(root).status).toBe('invalid');
    expect(() => validateIssueRoot('../issues')).toThrowError(expect.objectContaining({ category: 'configuration' }));
  });

  it('serializes with a non-reentrant project barrier and atomically publishes files', () => {
    const root = repository();
    const bytes = encodeCanonicalIssue(issue());
    withIssueBarrier(root, (lease) => {
      applyIssueFileBatch(lease, [
        { path: '.harnessctl/issues/00008-safe-discovery.yml', bytes, expectedRevision: null },
      ]);
      expect(() => withIssueBarrier(root, () => undefined, 0)).toThrowError(
        expect.objectContaining({ category: 'lock_contention' }),
      );
    });
    expect(readFileSync(join(root, '.harnessctl/issues/00008-safe-discovery.yml'))).toEqual(Buffer.from(bytes));
  });

  it('fails with bounded contention when another process owns the barrier path', () => {
    const root = repository();
    mkdirSync(join(root, '.harnessctl/cache/local-operations.lock'), { recursive: true });
    expect(() => withIssueBarrier(root, () => undefined, 0)).toThrowError(
      expect.objectContaining({ category: 'lock_contention', retryable: true }),
    );
  });

  it('uses the same non-reentrant barrier for issues and repository memory', () => {
    const root = repository();
    createConfig(root);
    withIssueBarrier(root, () => {
      expect(() => listMemory(root)).toThrow(/non-reentrant/i);
    });
  });

  it('restores in-memory before-images when a later publication fails', () => {
    const root = repository();
    const original = encodeCanonicalIssue(issue());
    mkdirSync(join(root, '.harnessctl/issues'), { recursive: true });
    const firstPath = join(root, '.harnessctl/issues/00008-safe-discovery.yml');
    writeFileSync(firstPath, original);
    withIssueBarrier(root, (lease) => {
      expect(() =>
        applyIssueFileBatch(lease, [
          {
            path: '.harnessctl/issues/00008-safe-discovery.yml',
            bytes: encodeCanonicalIssue(issue('00008', 'Changed')),
          },
          {
            path: '.harnessctl/issues/00009-invalid.yml',
            bytes: {} as Uint8Array,
            expectedRevision: null,
          },
        ]),
      ).toThrowError(expect.objectContaining({ category: 'filesystem_durability' }));
    });
    expect(readFileSync(firstPath)).toEqual(Buffer.from(original));
  });

  it('enforces the fixed 9,999-file discovery boundary', () => {
    const root = repository();
    mkdirSync(join(root, '.harnessctl/issues'), { recursive: true });
    for (let index = 1; index <= 10_000; index += 1) {
      const id = String(index).padStart(5, '0');
      writeFileSync(join(root, `.harnessctl/issues/${id}-issue.yml`), encodeCanonicalIssue(issue(id, 'Issue')));
    }
    expect(() => discoverIssueStorage(root)).toThrowError(
      expect.objectContaining({ category: 'resource_limit', limit: 'candidates' }),
    );
  }, 30_000);

  it('accepts exactly 16 MiB and rejects one byte more before reading an issue file', () => {
    const root = repository();
    mkdirSync(join(root, '.harnessctl/issues'), { recursive: true });
    const limit = 16 * 1024 * 1024;
    const exact = encodeCanonicalIssue(issue('00010', 'Boundary'));
    writeFileSync(
      join(root, '.harnessctl/issues/00010-boundary.yml'),
      Buffer.concat([Buffer.from(exact), Buffer.alloc(limit - exact.byteLength, 0x20)]),
    );
    expect(discoverIssueStorage(root).status).toBe('canonical');

    const over = encodeCanonicalIssue(issue('00011', 'One over'));
    writeFileSync(
      join(root, '.harnessctl/issues/00011-one-over.yml'),
      Buffer.concat([Buffer.from(over), Buffer.alloc(limit + 1 - over.byteLength, 0x20)]),
    );
    const storage = discoverIssueStorage(root);
    expect(storage.status).toBe('invalid');
    expect(storage.findings).toContainEqual(expect.objectContaining({ category: 'resource_limit', issueId: '00011' }));
  });
});
