import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { toPortableJsonSchema } from './generate-contracts.js';
import { formatSchemaError, memoryDocumentSchema, memoryRecordSchema, memoryTombstoneSchema } from './schemas.js';

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

describe('independent memory record v1 schema', () => {
  it('retains its stable generated identity independently from Config v1', () => {
    const contract = readMemoryContract();
    expect(contract.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(contract.$id).toBe('https://harnessctl.dev/contracts/memory-record-v1.schema.json');
  });

  it('stays synchronized with the canonical memory Zod schema', () => {
    const generated = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://harnessctl.dev/contracts/memory-record-v1.schema.json',
      title: 'harnessctl portable memory record v1',
      ...toPortableJsonSchema(memoryDocumentSchema),
    };
    expect(readMemoryContract()).toEqual(generated);
  });

  it('rejects malformed records with readable paths', () => {
    const result = memoryRecordSchema.safeParse({ schema_version: 1, id: 'invalid' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatSchemaError(result.error)).toContain('id');
    expect(formatSchemaError(result.error)).toContain('memory_type');
  });

  it('retains canonical limits and portable cross-field constraints', () => {
    const boundary = { ...validRecord, summary: 's'.repeat(1000), details: 'd'.repeat(12_000) };
    expect(memoryRecordSchema.safeParse(boundary).success).toBe(true);
    expect(memoryRecordSchema.safeParse({ ...boundary, summary: `${boundary.summary}s` }).success).toBe(false);
    expect(memoryRecordSchema.safeParse({ ...boundary, details: `${boundary.details}d` }).success).toBe(false);

    const validate = memoryContractValidator();
    expect(validate(boundary)).toBe(true);
    expect(validate({ ...validRecord, memory_type: 'episodic' })).toBe(false);
    expect(validate({ ...validRecord, source: { ...validRecord.source, kind: 'discussion' } })).toBe(false);
    expect(validate({ ...validRecord, tags: ['duplicate', 'duplicate'] })).toBe(false);
  });

  it('accepts tombstones through runtime and portable schemas', () => {
    const tombstone = {
      schema_version: 1,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      organization_id: 'local',
      project_id: 'project',
      target_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      reason: 'Retired',
      source: { kind: 'artifact', ref: 'README.md', revision: null },
      created_at: '2026-08-12T00:00:00Z',
      created_by: 'lead-engineer',
    };
    expect(memoryTombstoneSchema.safeParse(tombstone).success).toBe(true);
    expect(memoryContractValidator()(tombstone)).toBe(true);
  });
});

function readMemoryContract(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, 'contracts', 'memory-record-v1.schema.json'), 'utf8'),
  ) as Record<string, unknown>;
}

function memoryContractValidator(): ReturnType<Ajv2020['compile']> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(readMemoryContract());
}
