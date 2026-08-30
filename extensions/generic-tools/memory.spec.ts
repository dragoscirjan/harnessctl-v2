import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument, stringify } from 'yaml';
import {
  MemoryConflictError,
  MemoryError,
  createConfig,
  createIssueRecord,
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
import { decodeIssueDocument, encodeCanonicalIssue } from './issues-contract.js';

const require = createRequire(import.meta.url);

function cacheRow(cwd: string, sql: string): Record<string, unknown> | undefined {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => {
      prepare(statement: string): { get(): Record<string, unknown> | undefined };
      close(): void;
    };
  };
  const database = new DatabaseSync(join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite'));
  try {
    return database.prepare(sql).get();
  } finally {
    database.close();
  }
}

function cacheExec(cwd: string, sql: string): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => { exec(statement: string): void; close(): void };
  };
  const database = new DatabaseSync(join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite'));
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-memory-'));
  createConfig(cwd);
  const path = join(cwd, '.harnessctl', 'config.yaml');
  const config = parseDocument(readFileSync(path, 'utf8'));
  config.setIn(['skills', 'memory', 'enabled'], true);
  writeFileSync(path, config.toString(), 'utf8');
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
  it('rejects disabled local operations before touching repository or cache state', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-memory-disabled-'));
    try {
      createConfig(cwd);
      rmSync(join(cwd, '.harnessctl/memory'), { recursive: true, force: true });
      rmSync(join(cwd, '.harnessctl/cache'), { recursive: true, force: true });

      for (const operation of [
        () => storeMemory(cwd, fact('Blocked memory write.')),
        () => listMemory(cwd),
        () => searchMemory(cwd, { query: 'blocked' }),
        () => exportMemory(cwd),
      ])
        expect(operation).toThrow(/skills\.memory\.enabled=true.*disabled/u);
      expect(validateMemory(cwd)).toEqual(
        expect.objectContaining({
          valid: false,
          errors: [expect.stringMatching(/skills\.memory\.enabled=true.*disabled/u)],
        }),
      );
      expect(importMemory(cwd, '', true)).toEqual(
        expect.objectContaining({
          valid: false,
          errors: [expect.stringMatching(/skills\.memory\.enabled=true.*disabled/u)],
        }),
      );
      expect(existsSync(join(cwd, '.harnessctl/memory'))).toBe(false);
      expect(existsSync(join(cwd, '.harnessctl/cache'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('stores canonical records and retrieves them by ID', () => {
    const cwd = fixture();
    try {
      const stored = storeMemory(cwd, fact('Project uses immutable YAML memory records.'));
      expect(stored.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(getMemory(cwd, stored.id)).toEqual(stored);
      expect(listMemory(cwd)).toEqual([stored]);
      expect(validateMemory(cwd)).toMatchObject({
        valid: true,
        records: 1,
        tombstones: 0,
        cache: { outcome: 'checked', evidence: 'canonical_snapshot_match_verified' },
      });
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

  it('enforces compact mutation boundaries for store and supersede using Unicode characters', () => {
    const cwd = fixture();
    try {
      const boundaryDetails = [...Array.from({ length: 11 }, () => 'x'), 'x'.repeat(1978)].join('\n');
      const accepted = storeMemory(cwd, {
        ...fact('🙂'.repeat(240)),
        details: boundaryDetails,
      });
      expect(accepted.summary).toBe('🙂'.repeat(240));
      expect(Array.from(accepted.details ?? '')).toHaveLength(2000);
      expect(accepted.details?.split('\n')).toHaveLength(12);

      expect(() => storeMemory(cwd, fact('🙂'.repeat(241)))).toThrow(
        /memory_store: summary has 241 Unicode characters; limit is 240/u,
      );
      expect(() => supersedeMemory(cwd, accepted.id, { ...fact('replacement'), details: 'd'.repeat(2001) })).toThrow(
        /memory_supersede: details has 2001 Unicode characters; limit is 2000/u,
      );
      expect(() =>
        supersedeMemory(cwd, accepted.id, {
          ...fact('replacement'),
          details: Array.from({ length: 13 }, () => 'non-empty').join('\n\n'),
        }),
      ).toThrow(/memory_supersede: details has 13 non-empty lines; limit is 12/u);
      expect(listMemory(cwd, { include_superseded: true })).toEqual([accepted]);
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

  it('writes the shared SQLite cache while returning canonical bounded search results', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, { ...fact('Alpha architecture decision'), topic: 'architecture' });
      storeMemory(cwd, { ...fact('Beta test convention'), topic: 'testing' });
      expect(searchMemory(cwd, { query: 'Alpha', topic: 'architecture' })).toHaveLength(1);
      expect(searchMemory(cwd, { query: 'missing' })).toHaveLength(0);
      expect(searchMemory(cwd, { limit: 1 })).toHaveLength(1);

      expect(cacheRow(cwd, 'SELECT count(*) AS count FROM memory_records')).toEqual({ count: 2 });
      expect(existsSync(join(cwd, '.harnessctl', 'cache', 'memory-index.json'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15_000);

  it('rebuilds missing or malformed SQLite bytes without losing canonical records', () => {
    const cwd = fixture();
    try {
      const stored = storeMemory(cwd, fact('Portable cache migration fact'));
      const cachePath = join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite');
      mkdirSync(join(cwd, '.harnessctl', 'cache'), { recursive: true });
      writeFileSync(cachePath, Buffer.from('SQLite format 3\0legacy cache bytes'));

      expect(searchMemory(cwd, { query: 'portable migration' })).toEqual([stored]);
      expect(cacheRow(cwd, 'PRAGMA user_version')).toEqual({ user_version: 4 });
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

  it('returns identical compactness diagnostics for preview and mutating import without partial writes', () => {
    const source = fixture();
    const destination = fixture();
    try {
      const first = storeMemory(source, fact('Compact import candidate'));
      const second = { ...first, id: '01ARZ3NDEKTSV4RRFFQ69G5FAW', summary: 'x'.repeat(241) };
      const content = `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`;

      const preview = importMemory(destination, content, true);
      expect(preview).toMatchObject({ valid: false, records: 0, tombstones: 0 });
      expect(preview.errors[0]).toMatch(
        /memory_import line 2 record 01ARZ3NDEKTSV4RRFFQ69G5FAW: summary has 241 Unicode characters; limit is 240/u,
      );
      expect(() => importMemory(destination, content)).toThrow(preview.errors[0]);
      expect(listMemory(destination)).toEqual([]);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(destination, { recursive: true, force: true });
    }
  });

  it('rejects a disabled preview without creating project, memory, cache, or lock directories', () => {
    const source = fixture();
    const destination = mkdtempSync(join(tmpdir(), 'harnessctl-memory-preview-'));
    try {
      storeMemory(source, fact('Side-effect-free preview'));
      const exported = exportMemory(source);
      expect(existsSync(join(destination, '.harnessctl'))).toBe(false);
      expect(importMemory(destination, exported, true)).toMatchObject({
        valid: false,
        records: 0,
        tombstones: 0,
        errors: [expect.stringMatching(/skills\.memory\.enabled=true.*disabled/u)],
      });
      expect(existsSync(join(destination, '.harnessctl'))).toBe(false);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(destination, { recursive: true, force: true });
    }
  });

  it('loads, validates, retrieves, searches, and exports canonical records at legacy limits', () => {
    const cwd = fixture();
    try {
      const seed = storeMemory(cwd, fact('Seed'));
      const path = join(cwd, '.harnessctl', 'memory', 'facts', `${seed.id}.yaml`);
      const legacy = { ...seed, summary: 's'.repeat(1000), details: 'd'.repeat(12_000) };
      writeFileSync(path, stringify(legacy, { lineWidth: 0 }), 'utf8');

      expect(validateMemory(cwd)).toMatchObject({ valid: true, records: 1 });
      expect(getMemory(cwd, seed.id)).toEqual(legacy);
      expect(searchMemory(cwd, { query: 's'.repeat(100), max_chars: 100_000 })).toEqual([legacy]);
      const exported = exportMemory(cwd);
      expect(exported).toContain('s'.repeat(1000));

      const destination = fixture();
      try {
        const preview = importMemory(destination, exported, true);
        expect(preview.valid).toBe(false);
        expect(preview.errors[0]).toMatch(/summary has 1000 Unicode characters; limit is 240/u);
        expect(() => importMemory(destination, exported)).toThrow(preview.errors[0]);
        expect(listMemory(destination)).toEqual([]);
      } finally {
        rmSync(destination, { recursive: true, force: true });
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ignores retired import journals and reads only canonical YAML', () => {
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
      writeFileSync(join(transaction, 'manifest.json'), '{"retired":true}\n');

      expect(listMemory(destination)).toEqual([record]);
      expect(existsSync(transaction)).toBe(true);
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

  it('repairs a failed write-through transaction before returning success', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, fact('First canonical fact'));
      process.env.HARNESSCTL_TEST_CACHE_FAILURE = 'synchronize';
      storeMemory(cwd, fact('Second canonical fact'));
      delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
      expect(cacheRow(cwd, 'SELECT count(*) AS count FROM memory_records')).toEqual({ count: 2 });
    } finally {
      delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reports a sync error when repair fails and retries from canonical YAML next time', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, fact('First canonical fact'));
      process.env.HARNESSCTL_TEST_CACHE_FAILURE = 'all';
      expect(() => storeMemory(cwd, fact('Committed despite cache fault'))).toThrow(
        /canonical data may already be committed/i,
      );
      delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
      expect(listMemory(cwd, { include_superseded: true })).toHaveLength(2);
      expect(cacheRow(cwd, 'SELECT count(*) AS count FROM memory_records')).toEqual({ count: 2 });
    } finally {
      delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('never lets contradictory cache rows determine memory search results', () => {
    const cwd = fixture();
    try {
      const stored = storeMemory(cwd, fact('Canonical alpha fact'));
      cacheExec(cwd, "UPDATE memory_records SET searchable = 'contradictory beta'");
      expect(searchMemory(cwd, { query: 'alpha' })).toEqual([stored]);
      expect(searchMemory(cwd, { query: 'beta' })).toEqual([]);
      expect(cacheRow(cwd, 'SELECT searchable FROM memory_records')?.searchable).toMatch(/^canonical alpha fact\b/u);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not repair a corrupt cache while canonical validation is invalid', () => {
    const cwd = fixture();
    try {
      const stored = storeMemory(cwd, fact('Initially valid'));
      const cachePath = join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite');
      const memoryPath = join(cwd, '.harnessctl', 'memory', 'facts', `${stored.id}.yaml`);
      writeFileSync(cachePath, 'corrupt-cache');
      writeFileSync(memoryPath, 'summary: [\n');
      expect(validateMemory(cwd)).toMatchObject({
        valid: false,
        records: 0,
        tombstones: 0,
        cache: { outcome: 'skipped', evidence: 'memory_validation_failed' },
      });
      expect(readFileSync(cachePath, 'utf8')).toBe('corrupt-cache');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns verified rebuild evidence only after validation repairs the cache', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, fact('Cache rebuild evidence'));
      const cachePath = join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite');
      writeFileSync(cachePath, 'corrupt-cache');

      expect(validateMemory(cwd).cache).toEqual({
        outcome: 'rebuilt',
        evidence: 'canonical_snapshot_rebuild_verified',
      });
      expect(validateMemory(cwd).cache).toEqual({
        outcome: 'checked',
        evidence: 'canonical_snapshot_match_verified',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reports cache validation as skipped when the canonical issue graph is invalid', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, fact('Canonical memory remains authoritative'));
      const created = createIssueRecord(cwd, { type: 'task', title: 'Invalid dependency' });
      const issuePath = join(cwd, created.path);
      const decoded = decodeIssueDocument(readFileSync(issuePath));
      writeFileSync(issuePath, encodeCanonicalIssue({ ...decoded.issue, depends_on: ['99999'] }));
      const cachePath = join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite');
      const before = readFileSync(cachePath);

      expect(validateMemory(cwd)).toMatchObject({
        valid: false,
        records: 1,
        errors: [expect.stringMatching(/invalid canonical issue graph/i)],
        cache: { outcome: 'skipped', evidence: 'issue_graph_validation_failed' },
      });
      expect(readFileSync(cachePath)).toEqual(before);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rebuilds when required cache tables, provider rows, or projected child rows are missing', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, { ...fact('Tagged canonical fact'), tags: ['required-row'] });

      cacheExec(cwd, 'DROP TABLE issue_comments');
      expect(listMemory(cwd)).toHaveLength(1);
      expect(cacheRow(cwd, "SELECT count(*) AS count FROM sqlite_master WHERE name = 'issue_comments'")).toEqual({
        count: 1,
      });

      cacheExec(cwd, "DELETE FROM provider_generations WHERE provider = 'issues'");
      expect(listMemory(cwd)).toHaveLength(1);
      expect(cacheRow(cwd, 'SELECT count(*) AS count FROM provider_generations')).toEqual({ count: 3 });

      cacheExec(cwd, 'DELETE FROM memory_tags');
      expect(listMemory(cwd)).toHaveLength(1);
      expect(cacheRow(cwd, 'SELECT count(*) AS count FROM memory_tags')).toEqual({ count: 1 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15_000);

  it.each(['before-activate', 'activate'])('cleans failed cache publication at %s and retries safely', (fault) => {
    const cwd = fixture();
    try {
      storeMemory(cwd, fact('Publication fault fact'));
      const cacheDirectory = join(cwd, '.harnessctl', 'cache');
      rmSync(join(cacheDirectory, 'harnessctl.sqlite'));
      process.env.HARNESSCTL_TEST_CACHE_FAILURE = fault;
      expect(() => listMemory(cwd)).toThrow(/unable to rebuild local cache/i);
      delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
      expect(readdirSync(cacheDirectory).filter((name) => name.endsWith('.tmp'))).toEqual([]);
      expect(listMemory(cwd)).toHaveLength(1);
    } finally {
      delete process.env.HARNESSCTL_TEST_CACHE_FAILURE;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects memory cache loading when the canonical issue graph is invalid', () => {
    const cwd = fixture();
    try {
      storeMemory(cwd, fact('Canonical memory remains authoritative'));
      const created = createIssueRecord(cwd, { type: 'task', title: 'Invalid dependency' });
      const issuePath = join(cwd, created.path);
      const decoded = decodeIssueDocument(readFileSync(issuePath));
      writeFileSync(issuePath, encodeCanonicalIssue({ ...decoded.issue, depends_on: ['99999'] }));
      const cachePath = join(cwd, '.harnessctl', 'cache', 'harnessctl.sqlite');
      const before = readFileSync(cachePath);

      expect(() => listMemory(cwd)).toThrow(/invalid canonical issue graph/i);
      expect(readFileSync(cachePath)).toEqual(before);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
