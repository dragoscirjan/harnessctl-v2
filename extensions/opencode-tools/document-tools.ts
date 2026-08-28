import {
  archiveDocument,
  createDocument,
  DOCUMENT_KINDS,
  DOCUMENT_STATUSES,
  getDocument,
  listDocuments,
  parseDocumentId,
  restoreDocument,
  updateDocument,
  validateDocuments,
  versionDocument,
} from '@harnessctl/generic-tools';
import { tool } from '@opencode-ai/plugin';

const schema = tool.schema;
const documentKind = schema.enum(DOCUMENT_KINDS);
const documentStatus = schema.enum(DOCUMENT_STATUSES);
const changes = {
  title: schema.string().describe('New title').optional(),
  kind: documentKind.describe('New kind').optional(),
  status: documentStatus.describe('New stored status').optional(),
  author: schema.string().describe('Creator attribution').optional(),
  body: schema.string().describe('Content below the title H1').optional(),
  metadata: schema.string().describe('Optional JSON metadata object; null clears').optional(),
  expectedRevision: schema.string().describe('Exact revision from document_get'),
};

export function openCodeDocumentTools() {
  const execute = (operation: () => unknown): string => {
    try {
      return JSON.stringify(operation());
    } catch (error: unknown) {
      return `Document error: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  return {
    document_id: tool({
      description: 'Extract one configured document ID from text.',
      args: { text: schema.string().describe('Text containing a document ID') },
      async execute(args, context) {
        return execute(() => parseDocumentId(args.text, context.directory));
      },
    }),
    document_create: tool({
      description: 'Create version 1 of a canonical repository document.',
      args: {
        title: schema.string().describe('Document title'),
        kind: documentKind.describe('Document kind'),
        status: documentStatus.describe('Stored status').optional(),
        author: schema.string().describe('Creator attribution').optional(),
        body: schema.string().describe('Content below the title H1').optional(),
        metadata: schema.string().describe('Optional JSON metadata object').optional(),
      },
      async execute(args, context) {
        return execute(() => {
          const { metadata, ...input } = args;
          return createDocument(context.directory, {
            ...input,
            ...(metadata ? { metadata: parseObject(metadata) } : {}),
          });
        });
      },
    }),
    document_list: tool({
      description: 'List bounded canonical document summaries.',
      args: {
        kind: documentKind.optional(),
        status: documentStatus.optional(),
        location: schema.enum(['active', 'archive']).describe('Canonical location').optional(),
      },
      async execute(args, context) {
        return execute(() => listDocuments(context.directory, args as never));
      },
    }),
    document_get: tool({
      description: 'Read one canonical document version.',
      args: { id: schema.string(), version: schema.number().optional() },
      async execute(args, context) {
        return execute(() => getDocument(context.directory, args.id, args.version));
      },
    }),
    document_update: tool({
      description: 'Update the current document version using exact revision evidence.',
      args: { id: schema.string(), ...changes },
      async execute(args, context) {
        return execute(() => {
          const { id, metadata, ...input } = args;
          return updateDocument(context.directory, id, {
            ...input,
            ...(metadata === undefined ? {} : { metadata: metadata === 'null' ? null : parseObject(metadata) }),
          });
        });
      },
    }),
    document_version: tool({
      description: 'Create an immutable next document version.',
      args: { id: schema.string(), ...changes },
      async execute(args, context) {
        return execute(() => {
          const { id, metadata, ...input } = args;
          return versionDocument(context.directory, id, {
            ...input,
            ...(metadata === undefined ? {} : { metadata: metadata === 'null' ? null : parseObject(metadata) }),
          });
        });
      },
    }),
    document_validate: tool({
      description: 'Validate one document lineage or all canonical documents.',
      args: { id: schema.string().optional() },
      async execute(args, context) {
        return JSON.stringify(validateDocuments(context.directory, args.id));
      },
    }),
    document_archive: tool({
      description: 'Journal and archive a complete document lineage with deterministic recovery.',
      args: { id: schema.string(), expectedRevision: schema.string() },
      async execute(args, context) {
        return execute(() => archiveDocument(context.directory, args.id, args.expectedRevision));
      },
    }),
    document_restore: tool({
      description: 'Journal and restore a complete archived document lineage with deterministic recovery.',
      args: { id: schema.string(), expectedRevision: schema.string() },
      async execute(args, context) {
        return execute(() => restoreDocument(context.directory, args.id, args.expectedRevision));
      },
    }),
  };
}

function parseObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('metadata must be a JSON object');
  return parsed as Record<string, unknown>;
}
