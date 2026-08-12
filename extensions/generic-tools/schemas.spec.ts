import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { configV2Schema, formatSchemaError, memoryRecordSchema, memoryTombstoneSchema } from './schemas.js';

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
});
