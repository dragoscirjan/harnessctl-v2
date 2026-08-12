import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { configV2Schema, formatSchemaError, memoryRecordSchema, memoryTombstoneSchema } from './schemas.js';

const validConfig = {
  version: 2,
  communication: { caveman: { enabled: true, mode: 'strict' } },
  memory: {
    enabled: true,
    backend: 'repository',
    namespace: { organization_id: 'local', project_id: 'project', default_topic: 'general' },
    retrieval: { limit: 8, max_chars: 12_000, include_superseded: false },
    repository: { root: '.harnessctl/memory', cache: '.harnessctl/cache/memory.db' },
  },
};

const addFormats = addFormatsModule as unknown as FormatsPlugin;

const validRecord = {
  schema_version: 1,
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  memory_type: 'semantic',
  record_type: 'fact',
  organization_id: 'local',
  project_id: 'project',
  topic: 'general',
  summary: 'Validated memory',
  details: null,
  source: { kind: 'artifact', ref: 'README.md', revision: null },
  created_at: '2026-08-12T00:00:00Z',
  created_by: 'lead-engineer',
  confidence: 'verified',
  status: 'active',
  supersedes: [],
  tags: ['config'],
};

describe('canonical Zod schemas', () => {
  it('produces readable configuration errors with field paths', () => {
    const result = configV2Schema.safeParse({
      version: 2,
      communication: { caveman: { enabled: true, mode: 'verbose' } },
      memory: {
        enabled: false,
        backend: 'repository',
        namespace: { organization_id: 'local', project_id: 'project', default_topic: 'general' },
        retrieval: { limit: 0, max_chars: 12_000, include_superseded: false },
        repository: { root: '.harnessctl/memory', cache: '.harnessctl/memory/cache.db' },
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const message = formatSchemaError(result.error);
    expect(message).toContain('communication.caveman.mode');
    expect(message).toContain('memory.retrieval.limit');
    const crossFieldResult = configV2Schema.safeParse({
      version: 2,
      communication: { caveman: { enabled: true, mode: 'strict' } },
      memory: {
        enabled: false,
        backend: 'repository',
        namespace: { organization_id: 'local', project_id: 'project', default_topic: 'general' },
        retrieval: { limit: 8, max_chars: 12_000, include_superseded: false },
        repository: { root: '.harnessctl/memory', cache: '.harnessctl/memory/cache.db' },
      },
    });
    expect(crossFieldResult.success).toBe(false);
    const crossFieldMessage = crossFieldResult.success ? '' : formatSchemaError(crossFieldResult.error);
    expect(crossFieldMessage).toContain('memory.repository.cache');
  });

  it('uses generated portable contracts with stable identities', () => {
    for (const [name, id] of [
      ['config-v2.schema.json', 'https://harnessctl.dev/contracts/config-v2.schema.json'],
      ['memory-record-v1.schema.json', 'https://harnessctl.dev/contracts/memory-record-v1.schema.json'],
    ] as const) {
      const contract = JSON.parse(readFileSync(join(import.meta.dirname, 'contracts', name), 'utf8')) as Record<
        string,
        unknown
      >;
      expect(contract.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(contract.$id).toBe(id);
    }
  });

  it('keeps generated contracts synchronized with canonical Zod schemas', () => {
    for (const [name, schema, id, title] of [
      [
        'config-v2.schema.json',
        configV2Schema,
        'https://harnessctl.dev/contracts/config-v2.schema.json',
        'harnessctl project configuration v2',
      ],
      [
        'memory-record-v1.schema.json',
        memoryRecordSchema.or(memoryTombstoneSchema),
        'https://harnessctl.dev/contracts/memory-record-v1.schema.json',
        'harnessctl portable memory record v1',
      ],
    ] as const) {
      const generated = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: id,
        title,
        ...z.toJSONSchema(schema, { target: 'draft-2020-12' }),
      };
      const committed = JSON.parse(readFileSync(join(import.meta.dirname, 'contracts', name), 'utf8')) as unknown;
      expect(committed).toEqual(generated);
    }
  });

  it('rejects malformed portable memory records coherently', () => {
    const result = memoryRecordSchema.safeParse({ schema_version: 1, id: 'invalid' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatSchemaError(result.error)).toContain('id');
    expect(formatSchemaError(result.error)).toContain('memory_type');
  });

  it('rejects unsafe and canonically nested repository paths', () => {
    for (const repository of [
      { root: '.harnessctl/memory', cache: 'C:outside.db' },
      { root: '.harnessctl/memory', cache: '..\\outside.db' },
      { root: '.harnessctl/memory/', cache: '.harnessctl/./memory/cache.db' },
    ]) {
      expect(configV2Schema.safeParse({ ...validConfig, memory: { ...validConfig.memory, repository } }).success).toBe(
        false,
      );
    }
  });

  it('makes generated contracts reject expressible invalid values', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const configContract = JSON.parse(
      readFileSync(join(import.meta.dirname, 'contracts', 'config-v2.schema.json'), 'utf8'),
    ) as object;
    const memoryContract = JSON.parse(
      readFileSync(join(import.meta.dirname, 'contracts', 'memory-record-v1.schema.json'), 'utf8'),
    ) as object;
    const validateConfig = ajv.compile(configContract);
    const validateMemory = ajv.compile(memoryContract);

    expect(
      validateConfig({
        ...validConfig,
        memory: { ...validConfig.memory, repository: { root: '.harnessctl/memory', cache: 'C:outside.db' } },
      }),
    ).toBe(false);
    expect(validateMemory({ ...validRecord, memory_type: 'episodic' })).toBe(false);
    expect(validateMemory({ ...validRecord, source: { ...validRecord.source, kind: 'discussion' } })).toBe(false);
    expect(validateMemory({ ...validRecord, tags: ['duplicate', 'duplicate'] })).toBe(false);
  });
});
