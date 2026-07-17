import {
  ConfigError,
  archiveIssueReport,
  commentIssue,
  createConfig,
  createIssueRecord,
  getIssue,
  getConfigValue,
  linkDocument,
  listIssueSummaries,
  parseIssueIds,
  relateIssue,
  transitionIssue,
  unrelateIssue,
  updateIssue,
  validateIssues,
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
    issue_id: tool({
      description: 'Extract an issue ID from text using the project configuration.',
      args: {
        prompt: tool.schema.string().describe('Text containing an issue ID'),
      },
      async execute(args, context) {
        return JSON.stringify(parseIssueIds(args.prompt, context.directory));
      },
    }),
    issue_create: tool({
      description: 'Create a local issue file in the project .issues/ directory.',
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
          return JSON.stringify(
            createIssueRecord(context.directory, {
              ...fields,
              metadata: metadata ? parseJsonObject(metadata) : undefined,
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
          return JSON.stringify(listIssueSummaries(context.directory, args));
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
          return JSON.stringify(getIssue(context.directory, args.id));
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
          return JSON.stringify(
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
          return JSON.stringify(transitionIssue(context.directory, args.id, args.status, args.expectedRevision));
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
          return JSON.stringify(commentIssue(context.directory, args.id, args.body, args.author));
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
          return JSON.stringify(relateIssue(context.directory, args.id, args.relationship, args.targetId));
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
          return JSON.stringify(unrelateIssue(context.directory, args.id, args.relationship, args.targetId));
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
          return JSON.stringify(linkDocument(context.directory, args.id, args.path, args.kind));
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
          return JSON.stringify(validateIssues(context.directory, args.id));
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
          return JSON.stringify(archiveIssueReport(context.directory, args.id));
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

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('value must be a JSON object');
  return parsed as Record<string, unknown>;
}
