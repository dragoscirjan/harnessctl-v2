import {
  ConfigError,
  archiveIssueReport,
  commentIssue,
  createConfig,
  createIssueRecord,
  encodeIssueToolResult,
  getIssue,
  getConfigValue,
  deleteMemory,
  exportMemory,
  getMemory,
  importMemory,
  listMemory,
  searchMemory,
  storeMemory,
  supersedeMemory,
  validateMemory,
  linkDocument,
  listIssueSummaries,
  parseIssueIds,
  relateIssue,
  transitionIssue,
  unrelateIssue,
  updateIssue,
  validateIssues,
  issueMetadataText,
} from '@harnessctl/generic-tools';
import { tool, type Plugin } from '@opencode-ai/plugin';

export const CustomToolsPlugin: Plugin = async () => ({
  tool: {
    config_create: tool({
      description: 'Create .harnessctl/config.yaml with neutral defaults if absent.',
      args: {},
      async execute(_args, context) {
        try {
          return `Configuration ready: ${createConfig(context.directory)}`;
        } catch (error: unknown) {
          return formatError(error);
        }
      },
    }),
    config_get: tool({
      description: 'Read a value from .harnessctl/config.yaml using a dotted path.',
      args: {
        path: tool.schema.string().describe('Dotted configuration path, such as paths.tasks'),
      },
      async execute(args, context) {
        const value = getConfigValue(context.directory, args.path);
        return value instanceof ConfigError ? formatError(value) : JSON.stringify(value);
      },
    }),
    memory_search: tool({
      description: 'Search bounded active project memory using repository-backed cache.',
      args: {
        query: tool.schema.string().describe('Optional text query').optional(),
        topic: tool.schema.string().describe('Optional exact topic').optional(),
        memory_type: tool.schema.string().describe('semantic, episodic, or procedural').optional(),
        limit: tool.schema.number().describe('Maximum records, 1-100').optional(),
        max_chars: tool.schema.number().describe('Maximum serialized result characters').optional(),
        include_superseded: tool.schema.boolean().describe('Include inactive history').optional(),
      },
      async execute(args, context) {
        try {
          return JSON.stringify(searchMemory(context.directory, normalizedSearch(args)));
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_list: tool({
      description: 'List bounded project memory records with optional filters.',
      args: {
        topic: tool.schema.string().describe('Optional exact topic').optional(),
        memory_type: tool.schema.string().describe('semantic, episodic, or procedural').optional(),
        limit: tool.schema.number().describe('Maximum records, 1-100').optional(),
        include_superseded: tool.schema.boolean().describe('Include inactive history').optional(),
      },
      async execute(args, context) {
        try {
          return JSON.stringify(listMemory(context.directory, normalizedSearch(args)));
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_get: tool({
      description: 'Read one project memory record or tombstone by ULID.',
      args: { id: tool.schema.string().describe('Memory record ULID') },
      async execute(args, context) {
        try {
          return JSON.stringify(getMemory(context.directory, args.id));
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_store: tool({
      description: 'Create one immutable, validated, secret-screened memory record.',
      args: memoryWriteArguments(),
      async execute(args, context) {
        try {
          return JSON.stringify(storeMemory(context.directory, normalizedWrite(args)));
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_supersede: tool({
      description: 'Create a validated replacement for one active memory record.',
      args: { target_id: tool.schema.string().describe('Active record ULID'), ...memoryWriteArguments() },
      async execute(args, context) {
        try {
          const { target_id, ...write } = args;
          return JSON.stringify(supersedeMemory(context.directory, target_id, normalizedWrite(write)));
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_delete: tool({
      description: 'Create a tombstone for one active memory record.',
      args: {
        target_id: tool.schema.string().describe('Active record ULID'),
        reason: tool.schema.string().describe('Why record is removed'),
        source_kind: tool.schema.string().describe('Source kind'),
        source_ref: tool.schema.string().describe('Optional source reference').optional(),
        source_revision: tool.schema.string().describe('Optional source revision').optional(),
        created_by: tool.schema.string().describe('Developer or agent identifier'),
      },
      async execute(args, context) {
        try {
          return JSON.stringify(
            deleteMemory(context.directory, args.target_id, args.reason, normalizedSource(args), args.created_by),
          );
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_validate: tool({
      description: 'Validate all repository memory records without mutation.',
      args: {},
      async execute(_args, context) {
        return JSON.stringify(validateMemory(context.directory));
      },
    }),
    memory_export: tool({
      description: 'Export secret-screened canonical memory as JSONL.',
      args: {},
      async execute(_args, context) {
        try {
          return exportMemory(context.directory);
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    memory_import: tool({
      description: 'Validate, preview, or import canonical memory JSONL.',
      args: {
        content: tool.schema.string().describe('Canonical JSONL content'),
        preview: tool.schema.boolean().describe('Validate without mutation').optional(),
      },
      async execute(args, context) {
        try {
          return JSON.stringify(importMemory(context.directory, args.content, args.preview ?? false));
        } catch (error: unknown) {
          return formatMemoryError(error);
        }
      },
    }),
    issue_id: tool({
      description: 'Extract an issue ID from text using the project configuration.',
      args: {
        prompt: tool.schema.string().describe('Text containing an issue ID'),
      },
      async execute(args, context) {
        return encodeIssueToolResult(parseIssueIds(args.prompt, context.directory));
      },
    }),
    issue_create: tool({
      description: 'Create a canonical local issue YAML file in the project .issues/ directory.',
      args: {
        type: tool.schema.string().describe('Issue type: initiative, epic, story, task, or bug'),
        title: tool.schema.string().describe('Human-readable issue title'),
        status: tool.schema.string().describe('Issue status: open, in_progress, done, closed').optional(),
        parent: tool.schema.string().describe('Parent issue ID, such as 00001').optional(),
        depends: tool.schema.string().describe('Comma-separated blocking issue IDs').optional(),
        author: tool.schema.string().describe('Agent or user attribution').optional(),
        assignee: tool.schema.string().describe('Agent or user assignee').optional(),
        metadata: tool.schema.string().describe('Optional JSON object with additional metadata').optional(),
      },
      async execute(args, context) {
        try {
          const { metadata, ...fields } = args;
          return encodeIssueToolResult(
            createIssueRecord(context.directory, {
              ...fields,
              ...(metadata === undefined ? {} : { metadataText: issueMetadataText(metadata) }),
            }),
          );
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_list: tool({
      description: 'List local issue files from the project .issues/ directory.',
      args: {
        status: tool.schema.string().describe('Filter by status').optional(),
        type: tool.schema.string().describe('Filter by issue type').optional(),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(listIssueSummaries(context.directory, args));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_get: tool({
      description: 'Read one local issue and return its metadata and body.',
      args: { id: tool.schema.string().describe('Issue ID') },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(getIssue(context.directory, args.id));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_update: tool({
      description: 'Apply focused metadata or body changes to a local issue.',
      args: {
        id: tool.schema.string().describe('Issue ID'),
        type: tool.schema.string().describe('Issue type').optional(),
        title: tool.schema.string().describe('Issue title').optional(),
        status: tool.schema.string().describe('Issue status').optional(),
        author: tool.schema.string().describe('Creator attribution').optional(),
        assignee: tool.schema.string().describe('Assignee').optional(),
        parent: tool.schema.string().describe('Parent issue ID; empty removes the parent').optional(),
        body: tool.schema.string().describe('Complete issue body').optional(),
        sections: tool.schema.string().describe('Optional JSON object mapping section names to content').optional(),
        expectedRevision: tool.schema.string().describe('Expected revision token from issue_get'),
      },
      async execute(args, context) {
        try {
          const { id, sections, ...changes } = args;
          return encodeIssueToolResult(
            updateIssue(context.directory, id, {
              ...changes,
              sections: sections ? (parseJsonObject(sections) as Record<string, string>) : undefined,
            }),
          );
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_transition: tool({
      description: 'Change an issue status through the issue manager.',
      args: {
        id: tool.schema.string().describe('Issue ID'),
        status: tool.schema.string().describe('New issue status'),
        expectedRevision: tool.schema.string().describe('Expected revision token from issue_get'),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(transitionIssue(context.directory, args.id, args.status, args.expectedRevision));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_comment: tool({
      description: 'Append an immutable comment to a local issue.',
      args: {
        id: tool.schema.string().describe('Issue ID'),
        body: tool.schema.string().describe('Comment text'),
        author: tool.schema.string().describe('Comment author'),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(commentIssue(context.directory, args.id, args.body, args.author));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_relate: tool({
      description: 'Add a relationship between two issues.',
      args: {
        id: tool.schema.string().describe('Source issue ID'),
        relationship: tool.schema.string().describe('Relationship kind'),
        targetId: tool.schema.string().describe('Target issue ID'),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(relateIssue(context.directory, args.id, args.relationship, args.targetId));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_unrelate: tool({
      description: 'Remove a relationship between two issues.',
      args: {
        id: tool.schema.string().describe('Source issue ID'),
        relationship: tool.schema.string().describe('Relationship kind'),
        targetId: tool.schema.string().describe('Target issue ID'),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(unrelateIssue(context.directory, args.id, args.relationship, args.targetId));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_link_document: tool({
      description: 'Link a repository-relative task or design document to an issue.',
      args: {
        id: tool.schema.string().describe('Issue ID'),
        path: tool.schema.string().describe('Path under .harnessctl/tasks/ or .specs/'),
        kind: tool.schema.string().describe('Optional document kind: task or design').optional(),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(linkDocument(context.directory, args.id, args.path, args.kind));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_validate: tool({
      description: 'Validate one issue or all active local issues without mutating them.',
      args: { id: tool.schema.string().describe('Optional issue ID').optional() },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(validateIssues(context.directory, args.id));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
    issue_archive: tool({
      description: 'Move an issue and its active descendants to .issues/archived/.',
      args: {
        id: tool.schema.string().describe('Issue ID to archive'),
      },
      async execute(args, context) {
        try {
          return encodeIssueToolResult(archiveIssueReport(context.directory, args.id));
        } catch (error: unknown) {
          return formatIssueError(error);
        }
      },
    }),
  },
});

function formatError(error: unknown): string {
  return error instanceof Error ? `Configuration error: ${error.message}` : `Configuration error: ${String(error)}`;
}

function formatIssueError(error: unknown): string {
  return error instanceof Error ? `Issue error: ${error.message}` : `Issue error: ${String(error)}`;
}

function formatMemoryError(error: unknown): string {
  return error instanceof Error ? `Memory error: ${error.message}` : `Memory error: ${String(error)}`;
}

function memoryWriteArguments() {
  return {
    memory_type: tool.schema.string().describe('semantic, episodic, or procedural'),
    record_type: tool.schema.string().describe('fact, decision, event, or lesson'),
    topic: tool.schema.string().describe('Memory topic; defaults to project setting').optional(),
    summary: tool.schema.string().describe('One concise reusable item'),
    details: tool.schema.string().describe('Optional bounded details').optional(),
    source_kind: tool.schema.string().describe('artifact, user-confirmed, discussion, or tool-observation'),
    source_ref: tool.schema.string().describe('Optional source reference').optional(),
    source_revision: tool.schema.string().describe('Optional source revision').optional(),
    created_by: tool.schema.string().describe('Developer or agent identifier'),
    confidence: tool.schema.string().describe('confirmed or verified'),
    tags: tool.schema.string().describe('Optional comma-separated tags').optional(),
  };
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

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('value must be a JSON object');
  return parsed as Record<string, unknown>;
}
