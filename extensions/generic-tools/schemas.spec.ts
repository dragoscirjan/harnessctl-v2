import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import {
  configV2Schema,
  FILESYSTEM_ISSUE_TOOLS,
  formatSchemaError,
  memoryRecordSchema,
  memoryTombstoneSchema,
} from './schemas.js';

const validConfig = {
  version: 2,
  issues: {
    root: '.harnessctl/issues',
    prefix: 'hrn-',
    type: 'filesystem',
    tools: FILESYSTEM_ISSUE_TOOLS,
  },
  communication: { caveman: { enabled: true, mode: 'strict' } },
  memory: {
    enabled: true,
    backend: 'repository',
    namespace: { organization_id: 'local', project_id: 'project', default_topic: 'general' },
    retrieval: { limit: 8, max_chars: 12_000, include_superseded: false },
    repository: { root: '.harnessctl/memory' },
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
      issues: validConfig.issues,
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

  it('rejects unsafe canonical roots and tolerates the retired cache key', () => {
    for (const repository of [{ root: '../memory' }, { root: '..\\memory' }, { root: '.harnessctl/memory/' }]) {
      expect(configV2Schema.safeParse({ ...validConfig, memory: { ...validConfig.memory, repository } }).success).toBe(
        false,
      );
    }
    expect(
      configV2Schema.safeParse({
        ...validConfig,
        memory: { ...validConfig.memory, repository: { root: '.harnessctl/memory', cache: 'legacy/cache.json' } },
      }).success,
    ).toBe(true);
  });

  it('enforces the memory-to-caveman invariant at runtime and in the generated contract', () => {
    const invalid = {
      ...validConfig,
      communication: { caveman: { enabled: false, mode: 'strict' } },
    };
    const runtime = configV2Schema.safeParse(invalid);
    expect(runtime.success).toBe(false);
    const runtimeMessage = runtime.success ? '' : formatSchemaError(runtime.error);
    expect(runtimeMessage).toContain('memory.enabled requires communication.caveman.enabled to be true');

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const contract = JSON.parse(
      readFileSync(join(import.meta.dirname, 'contracts', 'config-v2.schema.json'), 'utf8'),
    ) as object;
    const validate = ajv.compile(contract);
    expect(validate(invalid)).toBe(false);
    expect(validate({ ...invalid, memory: { ...invalid.memory, enabled: false } })).toBe(true);
  });

  it('retains canonical memory record limits in runtime and generated schemas', () => {
    const boundary = { ...validRecord, summary: 's'.repeat(1000), details: 'd'.repeat(12_000) };
    expect(memoryRecordSchema.safeParse(boundary).success).toBe(true);
    expect(memoryRecordSchema.safeParse({ ...boundary, summary: `${boundary.summary}s` }).success).toBe(false);
    expect(memoryRecordSchema.safeParse({ ...boundary, details: `${boundary.details}d` }).success).toBe(false);

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const contract = JSON.parse(
      readFileSync(join(import.meta.dirname, 'contracts', 'memory-record-v1.schema.json'), 'utf8'),
    ) as object;
    const validate = ajv.compile(contract);
    expect(validate(boundary)).toBe(true);
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
        memory: { ...validConfig.memory, repository: { root: '../memory' } },
      }),
    ).toBe(false);
    expect(validateMemory({ ...validRecord, memory_type: 'episodic' })).toBe(false);
    expect(validateMemory({ ...validRecord, source: { ...validRecord.source, kind: 'discussion' } })).toBe(false);
    expect(validateMemory({ ...validRecord, tags: ['duplicate', 'duplicate'] })).toBe(false);
  });

  it.each([
    ['filesystem', FILESYSTEM_ISSUE_TOOLS],
    ['github', 'gh'],
    ['gitlab', 'glab'],
    ['gitea', 'tea'],
    ['forgejo', 'forgejo-cli'],
  ])('accepts exact %s tooling in runtime and portable schemas', (type, tools) => {
    const document = { ...validConfig, issues: { ...validConfig.issues, type, tools } };
    expect(configV2Schema.safeParse(document).success).toBe(true);
    expect(configContractValidator()(document)).toBe(true);
  });

  it.each([
    ['github', 'glab'],
    ['gitlab', 'gh'],
    ['gitea', 'gh'],
    ['forgejo', 'tea,gh'],
    ['forgejo', 'gh --token secret'],
    ['filesystem', 'issue_id'],
  ])('rejects invalid %s tooling %s in runtime and portable schemas', (type, tools) => {
    const document = { ...validConfig, issues: { ...validConfig.issues, type, tools } };
    expect(configV2Schema.safeParse(document).success).toBe(false);
    expect(configContractValidator()(document)).toBe(false);
  });

  it.each(['libsql', 'mem0', 'graphiti', 'custom'])('continues rejecting future memory backend %s', (backend) => {
    const document = { ...validConfig, memory: { ...validConfig.memory, backend } };
    expect(configV2Schema.safeParse(document).success).toBe(false);
    expect(configContractValidator()(document)).toBe(false);
  });
});

function configContractValidator(): ReturnType<Ajv2020['compile']> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const contract = JSON.parse(
    readFileSync(join(import.meta.dirname, 'contracts', 'config-v2.schema.json'), 'utf8'),
  ) as object;
  return ajv.compile(contract);
}
