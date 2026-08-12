import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  deleteMemory,
  exportMemory,
  getMemory,
  importMemory,
  listMemory,
  searchMemory,
  storeMemory,
  supersedeMemory,
  validateMemory,
} from '@harnessctl/generic-tools';
import { Type } from 'typebox';

export function registerMemoryTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'memory_search',
    label: 'Memory Search',
    description: 'Search bounded active project memory using the repository-backed cache.',
    parameters: memorySearchParameters(true),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() => searchMemory(context.cwd, normalizedSearch(params)));
    },
  });

  pi.registerTool({
    name: 'memory_list',
    label: 'Memory List',
    description: 'List bounded project memory records with optional filters.',
    parameters: memorySearchParameters(false),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() => listMemory(context.cwd, normalizedSearch(params)));
    },
  });

  pi.registerTool({
    name: 'memory_get',
    label: 'Memory Get',
    description: 'Read one project memory record or tombstone by ULID.',
    parameters: Type.Object({ id: Type.String({ description: 'Memory record ULID' }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() => getMemory(context.cwd, params.id));
    },
  });

  pi.registerTool({
    name: 'memory_store',
    label: 'Memory Store',
    description: 'Create one immutable, validated, secret-screened memory record.',
    parameters: memoryWriteParameters(),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() => storeMemory(context.cwd, normalizedWrite(params)));
    },
  });

  pi.registerTool({
    name: 'memory_supersede',
    label: 'Memory Supersede',
    description: 'Create a validated replacement for one active memory record.',
    parameters: Type.Intersect([
      Type.Object({ target_id: Type.String({ description: 'Active record ULID' }) }),
      memoryWriteParameters(),
    ]),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() => supersedeMemory(context.cwd, params.target_id, normalizedWrite(params)));
    },
  });

  pi.registerTool({
    name: 'memory_delete',
    label: 'Memory Delete',
    description: 'Create a tombstone for one active memory record.',
    parameters: Type.Object({
      target_id: Type.String({ description: 'Active record ULID' }),
      reason: Type.String({ description: 'Why the record is removed' }),
      source_kind: Type.String({ description: 'Source kind' }),
      source_ref: Type.Optional(Type.String({ description: 'Optional source reference' })),
      source_revision: Type.Optional(Type.String({ description: 'Optional source revision' })),
      created_by: Type.String({ description: 'Developer or agent identifier' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() =>
        deleteMemory(context.cwd, params.target_id, params.reason, normalizedSource(params), params.created_by),
      );
    },
  });

  pi.registerTool({
    name: 'memory_validate',
    label: 'Memory Validate',
    description: 'Validate all repository memory records without mutation.',
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, context) {
      return memoryResult(() => validateMemory(context.cwd));
    },
  });

  pi.registerTool({
    name: 'memory_export',
    label: 'Memory Export',
    description: 'Export secret-screened canonical memory as JSONL.',
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, context) {
      try {
        return textResult(exportMemory(context.cwd));
      } catch (error: unknown) {
        return memoryError(error);
      }
    },
  });

  pi.registerTool({
    name: 'memory_import',
    label: 'Memory Import',
    description: 'Validate, preview, or import canonical memory JSONL.',
    parameters: Type.Object({
      content: Type.String({ description: 'Canonical JSONL content' }),
      preview: Type.Optional(Type.Boolean({ description: 'Validate without mutation' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return memoryResult(() => importMemory(context.cwd, params.content, params.preview ?? false));
    },
  });
}

function memorySearchParameters(includeQuery: boolean) {
  return Type.Object({
    ...(includeQuery ? { query: Type.Optional(Type.String({ description: 'Optional text query' })) } : {}),
    topic: Type.Optional(Type.String({ description: 'Optional exact topic' })),
    memory_type: Type.Optional(Type.String({ description: 'semantic, episodic, or procedural' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum records, 1-100' })),
    max_chars: Type.Optional(Type.Number({ description: 'Maximum serialized result characters' })),
    include_superseded: Type.Optional(Type.Boolean({ description: 'Include inactive history' })),
  });
}

function memoryWriteParameters() {
  return Type.Object({
    memory_type: Type.String({ description: 'semantic, episodic, or procedural' }),
    record_type: Type.String({ description: 'fact, decision, event, or lesson' }),
    topic: Type.Optional(Type.String({ description: 'Memory topic; defaults to project setting' })),
    summary: Type.String({ description: 'One concise reusable item' }),
    details: Type.Optional(Type.String({ description: 'Optional bounded details' })),
    source_kind: Type.String({ description: 'artifact, user-confirmed, discussion, or tool-observation' }),
    source_ref: Type.Optional(Type.String({ description: 'Optional source reference' })),
    source_revision: Type.Optional(Type.String({ description: 'Optional source revision' })),
    created_by: Type.String({ description: 'Developer or agent identifier' }),
    confidence: Type.String({ description: 'confirmed or verified' }),
    tags: Type.Optional(Type.String({ description: 'Optional comma-separated tags' })),
  });
}

function normalizedWrite(args: Record<string, unknown>) {
  return {
    memory_type: args.memory_type as 'semantic' | 'episodic' | 'procedural',
    record_type: args.record_type as 'fact' | 'decision' | 'event' | 'lesson',
    topic: args.topic as string | undefined,
    summary: String(args.summary),
    details: args.details as string | undefined,
    source: normalizedSource(args),
    created_by: String(args.created_by),
    confidence: args.confidence as 'confirmed' | 'verified',
    tags:
      typeof args.tags === 'string'
        ? args.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
  };
}

function normalizedSource(args: Record<string, unknown>) {
  return {
    kind: args.source_kind as 'artifact' | 'user-confirmed' | 'discussion' | 'tool-observation',
    ref: typeof args.source_ref === 'string' ? args.source_ref : null,
    revision: typeof args.source_revision === 'string' ? args.source_revision : null,
  };
}

function normalizedSearch(args: Record<string, unknown>) {
  return {
    query: args.query as string | undefined,
    topic: args.topic as string | undefined,
    memory_type: args.memory_type as 'semantic' | 'episodic' | 'procedural' | undefined,
    limit: args.limit as number | undefined,
    max_chars: args.max_chars as number | undefined,
    include_superseded: args.include_superseded as boolean | undefined,
  };
}

function memoryResult(operation: () => unknown): ReturnType<typeof textResult> {
  try {
    return textResult(JSON.stringify(operation()));
  } catch (error: unknown) {
    return memoryError(error);
  }
}

function memoryError(error: unknown): ReturnType<typeof textResult> {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(`Memory error: ${message}`);
}

function textResult(text: string): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  return { content: [{ type: 'text', text }], details: {} };
}
