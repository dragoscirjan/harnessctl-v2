import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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
import { Type } from 'typebox';

export default function harnessctlTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'config_create',
    label: 'Config Create',
    description: 'Create .harnessctl/config.yaml with neutral defaults if absent.',
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, context) {
      try {
        return {
          content: [
            {
              type: 'text',
              text: `Configuration ready: ${createConfig(context.cwd)}`,
            },
          ],
          details: {},
        };
      } catch (error: unknown) {
        return configurationError(error);
      }
    },
  });

  pi.registerTool({
    name: 'config_get',
    label: 'Config Get',
    description: 'Read a value from .harnessctl/config.yaml using a dotted path.',
    parameters: Type.Object({
      path: Type.String({ description: 'Dotted path, such as paths.tasks' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      const value = getConfigValue(context.cwd, params.path);
      return value instanceof ConfigError
        ? configurationError(value)
        : {
            content: [{ type: 'text', text: JSON.stringify(value) }],
            details: {},
          };
    },
  });

  pi.registerTool({
    name: 'issue_id',
    label: 'Issue ID',
    description: 'Extract an issue ID from text using the project configuration.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'Text containing an issue ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(parseIssueIds(params.prompt, context.cwd)),
          },
        ],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: 'issue_create',
    label: 'Issue Create',
    description: 'Create a local issue file in the project .issues/ directory.',
    parameters: Type.Object({
      type: Type.String({ description: 'Issue type: initiative, epic, story, task, or bug' }),
      title: Type.String({ description: 'Human-readable issue title' }),
      status: Type.Optional(Type.String({ description: 'Issue status: open, in_progress, done, closed' })),
      parent: Type.Optional(Type.String({ description: 'Parent issue ID, such as 00001' })),
      depends: Type.Optional(Type.String({ description: 'Comma-separated blocking issue IDs' })),
      author: Type.Optional(Type.String({ description: 'Agent or user attribution' })),
      assignee: Type.Optional(Type.String({ description: 'Agent or user assignee' })),
      metadata: Type.Optional(Type.String({ description: 'Optional JSON object with additional metadata' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        const { metadata, ...fields } = params;
        return textResult(
          JSON.stringify(
            createIssueRecord(context.cwd, { ...fields, metadata: metadata ? parseJsonObject(metadata) : undefined }),
          ),
        );
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_list',
    label: 'Issue List',
    description: 'List local issue files from the project .issues/ directory.',
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: 'Filter by status' })),
      type: Type.Optional(Type.String({ description: 'Filter by issue type' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return textResult(JSON.stringify(listIssueSummaries(context.cwd, params)));
    },
  });

  pi.registerTool({
    name: 'issue_archive',
    label: 'Issue Archive',
    description: 'Move an issue and its active descendants to .issues/archived/.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID to archive' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(JSON.stringify(archiveIssueReport(context.cwd, params.id)));
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_get',
    label: 'Issue Get',
    description: 'Read one local issue and return its metadata and body.',
    parameters: Type.Object({ id: Type.String({ description: 'Issue ID' }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(JSON.stringify(getIssue(context.cwd, params.id)));
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_update',
    label: 'Issue Update',
    description: 'Apply focused metadata or body changes to a local issue.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID' }),
      type: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      author: Type.Optional(Type.String()),
      assignee: Type.Optional(Type.String()),
      parent: Type.Optional(Type.String()),
      body: Type.Optional(Type.String()),
      sections: Type.Optional(Type.String({ description: 'Optional JSON object mapping section names to content' })),
      expectedRevision: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        const { id, sections, ...changes } = params;
        return textResult(
          JSON.stringify(
            updateIssue(context.cwd, id, {
              ...changes,
              sections: sections ? (parseJsonObject(sections) as Record<string, string>) : undefined,
            }),
          ),
        );
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_transition',
    label: 'Issue Transition',
    description: 'Change an issue status through the issue manager.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID' }),
      status: Type.String({ description: 'New issue status' }),
      expectedRevision: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(
          JSON.stringify(transitionIssue(context.cwd, params.id, params.status, params.expectedRevision)),
        );
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_comment',
    label: 'Issue Comment',
    description: 'Append an immutable comment to a local issue.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID' }),
      body: Type.String({ description: 'Comment text' }),
      author: Type.String({ description: 'Comment author' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(JSON.stringify(commentIssue(context.cwd, params.id, params.body, params.author)));
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  for (const [name, label, operation] of [
    ['issue_relate', 'Issue Relate', relateIssue],
    ['issue_unrelate', 'Issue Unrelate', unrelateIssue],
  ] as const) {
    pi.registerTool({
      name,
      label,
      description: `${label} between two local issues.`,
      parameters: Type.Object({
        id: Type.String({ description: 'Source issue ID' }),
        relationship: Type.String({ description: 'Relationship kind' }),
        targetId: Type.String({ description: 'Target issue ID' }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, context) {
        try {
          return textResult(JSON.stringify(operation(context.cwd, params.id, params.relationship, params.targetId)));
        } catch (error: unknown) {
          return issueError(error);
        }
      },
    });
  }

  pi.registerTool({
    name: 'issue_link_document',
    label: 'Issue Link Document',
    description: 'Link a repository-relative task or design document to an issue.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID' }),
      path: Type.String({ description: 'Path under .harnessctl/tasks/ or .specs/' }),
      kind: Type.Optional(Type.String({ description: 'Optional document kind: task or design' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(JSON.stringify(linkDocument(context.cwd, params.id, params.path, params.kind)));
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_validate',
    label: 'Issue Validate',
    description: 'Validate one issue or all active local issues without mutating them.',
    parameters: Type.Object({ id: Type.Optional(Type.String({ description: 'Optional issue ID' })) }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return textResult(JSON.stringify(validateIssues(context.cwd, params.id)));
    },
  });
}

function textResult(text: string): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  return { content: [{ type: 'text', text }], details: {} };
}

function configurationError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Configuration error: ${message}` }],
    details: {},
  };
}

function issueError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(`Issue error: ${message}`);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('metadata must be a JSON object');
  return parsed as Record<string, unknown>;
}
