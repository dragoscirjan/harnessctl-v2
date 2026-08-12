import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  MemoryConflictError,
  MemoryError,
  createConfig,
  deleteMemory,
  exportMemory,
  getMemory,
  importMemory,
  listMemory,
  searchMemory,
  storeMemory,
  supersedeMemory,
  validateMemory,
  type StoreMemoryInput,
} from './index.js';

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-memory-'));
  createConfig(cwd);
  const path = join(cwd, '.harnessctl', 'config.yaml');
  const config = readFileSync(path, 'utf8').replace('enabled: false', 'enabled: true');
  writeFileSync(path, config, 'utf8');
  return cwd;
}

function fact(summary: string): StoreMemoryInput {
  return {
    memory_type: 'semantic',
    record_type: 'fact',
    summary,
    source: { kind: 'user-confirmed', ref: null, revision: null },
    created_by: 'test-user',
    confidence: 'confirmed',
  };
}

describe('repository memory', () => {
  it('stores canonical records and retrieves them by ID', () => {
    const cwd = fixture();
    try {
      const stored = storeMemory(cwd, fact('Project uses immutable YAML memory records.'));
      expect(stored.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(getMemory(cwd, stored.id)).toEqual(stored);
      expect(listMemory(cwd)).toEqual([stored]);
      expect(validateMemory(cwd)).toMatchObject({ valid: true, records: 1, tombstones: 0 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects invalid type pairs, unverified sources, and secrets before mutation', () => {
    const cwd = fixture();
    try {
      expect(() => storeMemory(cwd, { ...fact('Bad pair'), record_type: 'lesson' })).toThrow(MemoryError);
      expect(() => storeMemory(cwd, { ...fact('Unverified'), confidence: 'verified' })).toThrow(MemoryError);
      expect(() => storeMemory(cwd, fact('token=ghp_012345678901234567890123456789'))).toThrow(/secret/i);
      expect(listMemory(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supersedes and tombstones without overwriting history', () => {
    const cwd = fixture();
    try {
      const first = storeMemory(cwd, fact('Old fact'));
      const second = supersedeMemory(cwd, first.id, fact('Corrected fact'));
      expect(listMemory(cwd)).toEqual([second]);
      expect(listMemory(cwd, { include_superseded: true })).toHaveLength(2);
      expect(() => supersedeMemory(cwd, first.id, fact('Competing correction'))).toThrow(MemoryConflictError);
      const tombstone = deleteMemory(
        cwd,
        second.id,
        'No longer applicable',
        { kind: 'user-confirmed', ref: null, revision: null },
        'test-user',
      );
      expect(getMemory(cwd, tombstone.id)).toEqual(tombstone);
      expect(listMemory(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('builds a disposable cache and returns bounded scoped search results', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, { ...fact('Alpha architecture decision'), topic: 'architecture' });
      storeMemory(cwd, { ...fact('Beta test convention'), topic: 'testing' });
      expect(searchMemory(cwd, { query: 'Alpha', topic: 'architecture' })).toHaveLength(1);
      expect(searchMemory(cwd, { query: 'missing' })).toHaveLength(0);
      expect(searchMemory(cwd, { limit: 1 })).toHaveLength(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15_000);

  it('exports portable JSONL and validates imports without mutation in preview', () => {
    const cwd = fixture();
    const destination = fixture();
    try {
      const stored = storeMemory(cwd, fact('Portable fact'));
      const exported = exportMemory(cwd);
      expect(exported).toContain(stored.id);
      expect(importMemory(destination, exported, true)).toMatchObject({ valid: true, records: 1 });
      expect(listMemory(destination)).toHaveLength(0);
      expect(importMemory(destination, exported)).toMatchObject({ valid: true, records: 1 });
      expect(listMemory(destination)).toHaveLength(1);
      expect(() => importMemory(destination, exported)).toThrow(MemoryConflictError);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(destination, { recursive: true, force: true });
    }
  });

  it('idempotently rolls forward a prepared import after a partial write', () => {
    const source = fixture();
    const destination = fixture();
    try {
      const record = storeMemory(source, fact('Recovered import fact'));
      const content = stringify(record, { lineWidth: 0 });
      const transaction = join(destination, '.harnessctl', 'cache', 'memory-transactions', 'prepared-test');
      const staged = join(transaction, 'staged', '000000.yaml');
      const target = join(destination, '.harnessctl', 'memory', 'facts', `${record.id}.yaml`);
      mkdirSync(join(transaction, 'staged'), { recursive: true });
      mkdirSync(join(destination, '.harnessctl', 'memory', 'facts'), { recursive: true });
      writeFileSync(staged, content);
      writeFileSync(target, content);
      writeFileSync(
        join(transaction, 'manifest.json'),
        JSON.stringify({
          version: 1,
          state: 'prepared',
          items: [
            {
              staged: 'staged/000000.yaml',
              target: `.harnessctl/memory/facts/${record.id}.yaml`,
              sha256: createHash('sha256').update(content).digest('hex'),
            },
          ],
        }),
      );

      expect(listMemory(destination)).toEqual([record]);
      expect(existsSync(transaction)).toBe(false);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(destination, { recursive: true, force: true });
    }
  });

  it('rejects duplicate YAML keys in manually added records', () => {
    const cwd = fixture();
    try {
      const record = storeMemory(cwd, fact('Valid first'));
      const path = join(cwd, '.harnessctl', 'memory', 'facts', `${record.id}.yaml`);
      writeFileSync(path, `${stringify(record)}summary: duplicate\n`, 'utf8');
      expect(validateMemory(cwd)).toMatchObject({ valid: false });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
