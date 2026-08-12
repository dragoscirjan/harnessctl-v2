import * as z from 'zod';

const nonemptyString = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, { error: 'must not be blank' });
const safeProjectPath = nonemptyString.refine(
  (value) => {
    const normalized = value.replaceAll('\\', '/');
    return !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
  },
  { error: 'must stay inside project root' },
);

export const configV2Schema = z
  .object({
    version: z.literal(2),
    communication: z
      .object({
        caveman: z.object({ enabled: z.boolean(), mode: z.enum(['strict', 'balanced']) }).strict(),
      })
      .strict(),
    memory: z
      .object({
        enabled: z.boolean(),
        backend: z.literal('repository'),
        namespace: z
          .object({
            organization_id: nonemptyString,
            project_id: nonemptyString,
            default_topic: nonemptyString,
          })
          .strict(),
        retrieval: z
          .object({
            limit: z.int().min(1).max(100),
            max_chars: z.int().min(256).max(100_000),
            include_superseded: z.boolean(),
          })
          .strict(),
        repository: z.object({ root: safeProjectPath, cache: safeProjectPath }).strict(),
      })
      .strict(),
  })
  .passthrough()
  .superRefine((config, context) => {
    const root = config.memory.repository.root.replaceAll('\\', '/').replace(/^\.\//, '');
    const cache = config.memory.repository.cache.replaceAll('\\', '/').replace(/^\.\//, '');
    if (cache === root || cache.startsWith(`${root}/`)) {
      context.addIssue({
        code: 'custom',
        path: ['memory', 'repository', 'cache'],
        message: 'must be outside memory.repository.root',
      });
    }
  });

export type ConfigV2 = z.infer<typeof configV2Schema>;

export const memoryTypeSchema = z.enum(['semantic', 'episodic', 'procedural']);
export const recordTypeSchema = z.enum(['fact', 'decision', 'event', 'lesson']);
export const sourceKindSchema = z.enum(['artifact', 'user-confirmed', 'discussion', 'tool-observation']);
export const confidenceSchema = z.enum(['confirmed', 'verified']);

const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const memorySourceSchema = z
  .object({
    kind: sourceKindSchema,
    ref: z.string().nullable(),
    revision: z.string().nullable(),
  })
  .strict();

export const memoryRecordSchema = z
  .object({
    schema_version: z.literal(1),
    id: ulidSchema,
    memory_type: memoryTypeSchema,
    record_type: recordTypeSchema,
    organization_id: nonemptyString,
    project_id: nonemptyString,
    topic: nonemptyString,
    summary: z.string().min(1).max(1000),
    details: z.string().max(12_000).nullable(),
    source: memorySourceSchema,
    created_at: z.iso.datetime(),
    created_by: nonemptyString,
    confidence: confidenceSchema,
    status: z.literal('active'),
    supersedes: z.array(ulidSchema),
    tags: z.array(nonemptyString),
  })
  .strict()
  .superRefine((record, context) => {
    const validPair =
      (record.memory_type === 'semantic' && record.record_type === 'fact') ||
      (record.memory_type === 'episodic' && ['decision', 'event'].includes(record.record_type)) ||
      (record.memory_type === 'procedural' && record.record_type === 'lesson');
    if (!validPair)
      context.addIssue({
        code: 'custom',
        path: ['record_type'],
        message: `is incompatible with memory_type ${record.memory_type}`,
      });
    if (record.confidence === 'verified' && !['artifact', 'tool-observation'].includes(record.source.kind))
      context.addIssue({
        code: 'custom',
        path: ['source', 'kind'],
        message: 'must be artifact or tool-observation when confidence is verified',
      });
    if (record.supersedes.includes(record.id))
      context.addIssue({ code: 'custom', path: ['supersedes'], message: 'must not contain record id' });
    addDuplicateIssue(record.supersedes, ['supersedes'], context);
    addDuplicateIssue(record.tags, ['tags'], context);
  });

export const memoryTombstoneSchema = z
  .object({
    schema_version: z.literal(1),
    id: ulidSchema,
    organization_id: nonemptyString,
    project_id: nonemptyString,
    target_id: ulidSchema,
    reason: z.string().min(1).max(1000),
    source: memorySourceSchema,
    created_at: z.iso.datetime(),
    created_by: nonemptyString,
  })
  .strict();

export const memoryDocumentSchema = z.union([memoryRecordSchema, memoryTombstoneSchema]);

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type RecordType = z.infer<typeof recordTypeSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryTombstone = z.infer<typeof memoryTombstoneSchema>;

export function formatSchemaError(error: z.ZodError): string {
  return z.prettifyError(error);
}

function addDuplicateIssue(values: string[], path: string[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length)
    context.addIssue({ code: 'custom', path, message: 'must contain unique values' });
}
