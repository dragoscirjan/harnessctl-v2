import {
  VERSION as PI_VERSION,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  ConfigError,
  ExecutionContextError,
  buildExceptionalCommand,
  buildTaskOperation,
  createExecutionContextProvider,
  executeRegisteredExceptionalCommand,
  executeRegisteredTaskOperation,
  archiveIssueReport,
  commentIssue,
  createConfig,
  createIssueRecord,
  encodeIssueToolResult,
  getIssue,
  getConfigValue,
  linkDocument,
  listIssueSummaries,
  parseIssueIds,
  resolveContextPath,
  resolveProjectRoot,
  relateIssue,
  transitionIssue,
  unrelateIssue,
  updateIssue,
  validateIssues,
  issueMetadataText,
  workspaceCleanup,
  workspaceEnsure,
  workspaceMarkCleanupReady,
  workspaceStatus,
  type SemanticTaskOperationId,
} from '@harnessctl/generic-tools';
import { Type } from 'typebox';
import { registerDocumentTools } from './document-tools.js';
import { registerMemoryTools } from './memory-tools.js';

export default function harnessctlTools(pi: ExtensionAPI): void {
  assertPiCapabilities(pi);
  const projectRoot = (context: ExtensionContext): string =>
    resolveProjectRoot(context.cwd, 'pi', context.sessionManager?.getSessionId()).root;

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
              text: `Configuration ready: ${createConfig(projectRoot(context))}`,
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
      const value = getConfigValue(projectRoot(context), params.path);
      return value instanceof ConfigError
        ? configurationError(value)
        : {
            content: [{ type: 'text', text: JSON.stringify(value) }],
            details: {},
          };
    },
  });

  registerMemoryTools(pi, projectRoot);
  registerDocumentTools(pi, projectRoot);

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
            text: encodeIssueToolResult(parseIssueIds(params.prompt, projectRoot(context))),
          },
        ],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: 'issue_create',
    label: 'Issue Create',
    description: 'Create a canonical local issue YAML file under the configured issues.root directory.',
    parameters: Type.Object({
      type: Type.String({ description: 'Issue type: initiative, epic, story, task, or bug' }),
      title: Type.String({ description: 'Human-readable issue title' }),
      status: Type.Optional(Type.String({ description: 'Issue status: open, in_progress, done, closed' })),
      parent: Type.Optional(Type.String({ description: 'Parent issue ID, such as hrn-00001' })),
      depends: Type.Optional(Type.String({ description: 'Comma-separated blocking issue IDs' })),
      author: Type.Optional(Type.String({ description: 'Agent or user attribution' })),
      assignee: Type.Optional(Type.String({ description: 'Agent or user assignee' })),
      metadata: Type.Optional(Type.String({ description: 'Optional JSON object with additional metadata' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        const { metadata, ...fields } = params;
        return textResult(
          encodeIssueToolResult(
            createIssueRecord(projectRoot(context), {
              ...fields,
              ...(metadata === undefined ? {} : { metadataText: issueMetadataText(metadata) }),
            }),
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
    description: 'List local issue files from the configured issues.root directory.',
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: 'Filter by status' })),
      type: Type.Optional(Type.String({ description: 'Filter by issue type' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(encodeIssueToolResult(listIssueSummaries(projectRoot(context), params)));
      } catch (error: unknown) {
        return issueError(error);
      }
    },
  });

  pi.registerTool({
    name: 'issue_archive',
    label: 'Issue Archive',
    description: 'Move an issue and its active descendants under the configured issues.root archive.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID to archive' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(encodeIssueToolResult(archiveIssueReport(projectRoot(context), params.id)));
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
        return textResult(encodeIssueToolResult(getIssue(projectRoot(context), params.id)));
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
      expectedRevision: Type.String({ description: 'Expected revision token from issue_get' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        const { id, sections, ...changes } = params;
        return textResult(
          encodeIssueToolResult(
            updateIssue(projectRoot(context), id, {
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
      expectedRevision: Type.String({ description: 'Expected revision token from issue_get' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(
          encodeIssueToolResult(
            transitionIssue(projectRoot(context), params.id, params.status, params.expectedRevision),
          ),
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
        return textResult(
          encodeIssueToolResult(commentIssue(projectRoot(context), params.id, params.body, params.author)),
        );
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
          return textResult(
            encodeIssueToolResult(operation(projectRoot(context), params.id, params.relationship, params.targetId)),
          );
        } catch (error: unknown) {
          return issueError(error);
        }
      },
    });
  }

  pi.registerTool({
    name: 'issue_link_document',
    label: 'Issue Link Document',
    description: 'Link a repository-relative task or active canonical document to an issue.',
    parameters: Type.Object({
      id: Type.String({ description: 'Issue ID' }),
      path: Type.String({
        description: 'Path under the configured tasks root or the fixed active .harnessctl/documents authority',
      }),
      kind: Type.Optional(
        Type.String({ description: 'Optional document kind: task, design, or document (preferred)' }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      try {
        return textResult(
          encodeIssueToolResult(linkDocument(projectRoot(context), params.id, params.path, params.kind)),
        );
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
      return textResult(encodeIssueToolResult(validateIssues(projectRoot(context), params.id)));
    },
  });

  for (const [name, label, description, operation] of [
    [
      'workspace_ensure',
      'Workspace Ensure',
      'Create or return the deterministic Git workspace for one canonical Epic.',
      workspaceEnsure,
    ],
    [
      'workspace_status',
      'Workspace Status',
      'Inspect the deterministic Git workspace for one canonical Epic without mutation.',
      workspaceStatus,
    ],
    [
      'workspace_mark_cleanup_ready',
      'Workspace Mark Cleanup Ready',
      'Mark the matching clean Epic workspace ready for cleanup.',
      workspaceMarkCleanupReady,
    ],
    [
      'workspace_cleanup',
      'Workspace Cleanup',
      'Remove the matching clean ready Epic workspace while retaining its branch.',
      workspaceCleanup,
    ],
  ] as const) {
    pi.registerTool({
      name,
      label,
      description,
      parameters: Type.Object({ epic_id: Type.String({ description: 'Canonical Epic issue ID' }) }),
      async execute(_toolCallId, params, _signal, _onUpdate, context) {
        try {
          return textResult(JSON.stringify(operation(context.cwd, params.epic_id)));
        } catch (error: unknown) {
          return workspaceError(error);
        }
      },
    });
  }

  registerExecutionControlTools(pi);
  registerSessionRouting(pi);
}

const HARNESSCTL_TOOL_NAMES = new Set([
  'config_create',
  'config_get',
  'memory_search',
  'memory_list',
  'memory_get',
  'memory_store',
  'memory_supersede',
  'memory_delete',
  'memory_validate',
  'memory_export',
  'memory_import',
  'document_id',
  'document_create',
  'document_list',
  'document_get',
  'document_update',
  'document_version',
  'document_validate',
  'document_archive',
  'document_restore',
  'issue_id',
  'issue_create',
  'issue_list',
  'issue_archive',
  'issue_get',
  'issue_update',
  'issue_transition',
  'issue_comment',
  'issue_relate',
  'issue_unrelate',
  'issue_link_document',
  'issue_validate',
  'workspace_ensure',
  'workspace_status',
  'workspace_mark_cleanup_ready',
  'workspace_cleanup',
  'workspace_session_allocate',
  'workspace_session_attach_epic',
  'workspace_session_adopt',
  'workspace_session_bind',
  'workspace_session_status',
  'workspace_session_release',
  'operation_prepare',
  'operation_execute',
  'operation_prepare_command',
  'operation_execute_command',
]);

const ROUTED_FILE_TOOL_NAMES = new Set(['read', 'write', 'edit', 'grep', 'find', 'ls']);

function registerExecutionControlTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'workspace_session_allocate',
    label: 'Workspace Session Allocate',
    description: 'Allocate and bind a provisional execution workspace for this Pi session.',
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, context) {
      return executionControlResult(() => {
        const result = createExecutionContextProvider(context.cwd).allocateProvisional(
          'pi',
          requirePiSessionId(context),
        );
        appendBindingEntry(pi, result);
        return result;
      });
    },
  });
  pi.registerTool({
    name: 'workspace_session_attach_epic',
    label: 'Workspace Session Attach Epic',
    description: 'Attach the bound provisional workspace to a canonical Epic without renaming it.',
    parameters: Type.Object({
      epic_id: Type.String({ description: 'Canonical Epic issue ID' }),
      expected_binding_generation: Type.Number({ description: 'Exact current binding generation' }),
      expected_workspace_generation: Type.Number({ description: 'Exact current workspace generation' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() => {
        const result = createExecutionContextProvider(context.cwd).attachEpic(
          'pi',
          requirePiSessionId(context),
          params.epic_id,
          params.expected_binding_generation,
          params.expected_workspace_generation,
        );
        appendBindingEntry(pi, result);
        return result;
      });
    },
  });
  pi.registerTool({
    name: 'workspace_session_adopt',
    label: 'Workspace Session Adopt',
    description: 'Adopt an exact legacy Epic workspace into this Pi session without rewriting it.',
    parameters: Type.Object({ epic_id: Type.String({ description: 'Canonical Epic issue ID' }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() => {
        const result = createExecutionContextProvider(context.cwd).adoptV1(
          'pi',
          requirePiSessionId(context),
          params.epic_id,
        );
        appendBindingEntry(pi, result);
        return result;
      });
    },
  });
  pi.registerTool({
    name: 'workspace_session_bind',
    label: 'Workspace Session Bind',
    description: 'Bind this Pi session to an existing execution workspace.',
    parameters: Type.Object({
      workspace_id: Type.String({ description: 'Execution workspace ID' }),
      expected_binding_generation: Type.Optional(
        Type.Number({ description: 'Exact current generation when rebinding' }),
      ),
      expected_workspace_generation: Type.Number({ description: 'Exact target workspace generation' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() => {
        const result = createExecutionContextProvider(context.cwd).bind(
          'pi',
          requirePiSessionId(context),
          params.workspace_id,
          params.expected_binding_generation,
          params.expected_workspace_generation,
        );
        appendBindingEntry(pi, result);
        return result;
      });
    },
  });
  pi.registerTool({
    name: 'workspace_session_status',
    label: 'Workspace Session Status',
    description: 'Resolve and validate this Pi session execution workspace.',
    parameters: Type.Object({
      expected_binding_generation: Type.Optional(Type.Number({ description: 'Optional exact binding generation' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() =>
        createExecutionContextProvider(context.cwd).resolve(
          'pi',
          requirePiSessionId(context),
          params.expected_binding_generation,
        ),
      );
    },
  });
  pi.registerTool({
    name: 'workspace_session_release',
    label: 'Workspace Session Release',
    description: 'Release this Pi session binding without deleting its workspace.',
    parameters: Type.Object({
      expected_binding_generation: Type.Number({ description: 'Exact current binding generation' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() => {
        const sessionId = requirePiSessionId(context);
        const provider = createExecutionContextProvider(context.cwd);
        const current = provider.resolve('pi', sessionId, params.expected_binding_generation);
        provider.release('pi', sessionId, params.expected_binding_generation);
        pi.appendEntry('harnessctl.workspace-binding', {
          schema_version: 1,
          status: 'released',
          repository_id: current.repository_id,
          workspace_id: current.workspace_id,
          epic_id: current.epic_id,
          generation: current.binding_generation + 1,
        });
        return { released: true };
      });
    },
  });
  pi.registerTool({
    name: 'operation_prepare',
    label: 'Operation Prepare',
    description: 'Prepare an immutable registered task operation for review and consent.',
    parameters: Type.Object({
      operation_id: Type.String({ description: 'Registered semantic operation ID' }),
      expected_binding_generation: Type.Optional(Type.Number({ description: 'Optional exact binding generation' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() =>
        buildTaskOperation(
          context.cwd,
          'pi',
          requirePiSessionId(context),
          params.operation_id as SemanticTaskOperationId,
          params.expected_binding_generation,
        ),
      );
    },
  });
  pi.registerTool({
    name: 'operation_execute',
    label: 'Operation Execute',
    description: 'Execute a freshly rebuilt registered task operation with descriptor-bound consent.',
    parameters: Type.Object({
      operation_id: Type.String({ description: 'Registered semantic operation ID' }),
      consent_digest: Type.String({ description: 'Digest from the reviewed prepared descriptor' }),
      expected_binding_generation: Type.Optional(Type.Number({ description: 'Optional exact binding generation' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() =>
        executeRegisteredTaskOperation(
          context.cwd,
          'pi',
          requirePiSessionId(context),
          params.operation_id as SemanticTaskOperationId,
          params.consent_digest,
          params.expected_binding_generation,
        ),
      );
    },
  });
  pi.registerTool({
    name: 'operation_prepare_command',
    label: 'Operation Prepare Command',
    description: 'Prepare an immutable exceptional command for separate immediate consent.',
    parameters: Type.Object({
      executable: Type.String({ description: 'Executable name or path, without shell syntax' }),
      argv: Type.Array(Type.String(), { description: 'Exact argument vector' }),
      expected_binding_generation: Type.Optional(Type.Number({ description: 'Optional exact binding generation' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() =>
        buildExceptionalCommand(
          context.cwd,
          'pi',
          requirePiSessionId(context),
          params.executable,
          params.argv,
          params.expected_binding_generation,
        ),
      );
    },
  });
  pi.registerTool({
    name: 'operation_execute_command',
    label: 'Operation Execute Command',
    description: 'Execute a freshly rebuilt exceptional command with descriptor-bound immediate consent.',
    parameters: Type.Object({
      executable: Type.String({ description: 'Executable from the reviewed descriptor' }),
      argv: Type.Array(Type.String(), { description: 'Exact argument vector from the reviewed descriptor' }),
      consent_digest: Type.String({ description: 'Digest from the reviewed exceptional command descriptor' }),
      expected_binding_generation: Type.Optional(Type.Number({ description: 'Optional exact binding generation' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return executionControlResult(() =>
        executeRegisteredExceptionalCommand(
          context.cwd,
          'pi',
          requirePiSessionId(context),
          params.executable,
          params.argv,
          params.consent_digest,
          params.expected_binding_generation,
        ),
      );
    },
  });
}

function registerSessionRouting(pi: ExtensionAPI): void {
  registerRoutedFileTools(pi);
  pi.on('session_start', (_event, context) => recordSessionRecovery(pi, context));
  pi.on('session_compact', (_event, context) => recordSessionRecovery(pi, context));

  pi.on('tool_call', (event, context) => routePiToolCall(event, context));
}

function recordSessionRecovery(pi: ExtensionAPI, context: ExtensionContext): void {
  assertPiSessionCapabilities(pi, context);
  let resolution: ReturnType<typeof piProjectResolution>;
  try {
    resolution = piProjectResolution(context);
  } catch (error: unknown) {
    if (isMissingSessionBinding(error)) {
      pi.appendEntry('harnessctl.workspace-binding', {
        schema_version: 1,
        status: 'unbound',
        reason: error.message,
      });
      return;
    }
    throw error;
  }
  if (!resolution.enabled) return;
  appendBindingEntry(pi, resolution.context!);
}

function appendBindingEntry(
  pi: ExtensionAPI,
  context: {
    repository_id: string;
    workspace_id: string;
    epic_id: string | null;
    binding_generation: number;
  },
): void {
  if (typeof pi.appendEntry !== 'function')
    throw new ExecutionContextError(
      'unsupported',
      `Pi ${PI_VERSION} is missing required recovery capability: appendEntry`,
    );
  pi.appendEntry('harnessctl.workspace-binding', {
    schema_version: 1,
    repository_id: context.repository_id,
    workspace_id: context.workspace_id,
    epic_id: context.epic_id,
    generation: context.binding_generation,
  });
}

function routePiToolCall(
  event: ToolCallEvent,
  context: ExtensionContext,
): { block: boolean; reason: string } | undefined {
  if (HARNESSCTL_TOOL_NAMES.has(event.toolName)) return undefined;
  let resolution: ReturnType<typeof piProjectResolution>;
  try {
    resolution = piProjectResolution(context);
  } catch (error: unknown) {
    return { block: true, reason: routingMessage(error) };
  }
  if (!resolution.enabled) return undefined;
  if (event.toolName === 'bash') {
    return {
      block: true,
      reason: 'Bound sessions require registered semantic operations; model-authored bash is not routable.',
    };
  }
  if (!ROUTED_FILE_TOOL_NAMES.has(event.toolName)) {
    return { block: true, reason: `Tool ${event.toolName} is not supported in a bound Harnessctl session.` };
  }

  try {
    const input: Record<string, unknown> = event.input;
    const path = typeof input.path === 'string' ? input.path : '.';
    const routedPath = resolveContextPath(resolution.context!, path);
    if ('path' in input || ['grep', 'find', 'ls'].includes(event.toolName)) input.path = routedPath;
  } catch (error: unknown) {
    return { block: true, reason: routingMessage(error) };
  }
  return undefined;
}

function registerRoutedFileTools(pi: ExtensionAPI): void {
  for (const factory of [
    createReadToolDefinition,
    createWriteToolDefinition,
    createEditToolDefinition,
    createGrepToolDefinition,
    createFindToolDefinition,
    createLsToolDefinition,
    createBashToolDefinition,
  ]) {
    const initial = factory(process.cwd()) as ToolDefinition;
    pi.registerTool({
      ...initial,
      async execute(toolCallId, params, signal, onUpdate, context) {
        const root = piProjectResolution(context).root;
        const current = factory(root) as ToolDefinition;
        return current.execute(toolCallId, params, signal, onUpdate, context);
      },
    });
  }
}

function assertPiCapabilities(pi: ExtensionAPI): void {
  if (typeof pi.registerTool !== 'function' || typeof pi.on !== 'function')
    throw new ExecutionContextError(
      'unsupported',
      `Pi ${PI_VERSION} is missing required extension capabilities: registerTool and on`,
    );
}

function assertPiSessionCapabilities(pi: ExtensionAPI, context: ExtensionContext): void {
  if (typeof context.sessionManager?.getSessionId !== 'function')
    throw new ExecutionContextError(
      'unsupported',
      `Pi ${PI_VERSION} is missing required session capability: sessionManager.getSessionId`,
    );
  if (typeof pi.appendEntry !== 'function')
    throw new ExecutionContextError(
      'unsupported',
      `Pi ${PI_VERSION} is missing required recovery capability: appendEntry`,
    );
}

function piProjectResolution(context: ExtensionContext) {
  return resolveProjectRoot(context.cwd, 'pi', context.sessionManager?.getSessionId());
}

function routingMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingSessionBinding(error: unknown): error is ExecutionContextError {
  return (
    error instanceof ExecutionContextError &&
    error.category === 'unsafe_state' &&
    error.message === 'host session has no execution workspace binding'
  );
}

function requirePiSessionId(context: ExtensionContext): string {
  const sessionId = context.sessionManager?.getSessionId();
  if (!sessionId) throw new ExecutionContextError('unsafe_state', 'Pi session identity is unavailable');
  return sessionId;
}

function executionControlResult(operation: () => unknown): ReturnType<typeof textResult> {
  try {
    return textResult(JSON.stringify(operation()));
  } catch (error: unknown) {
    return workspaceError(error);
  }
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

function workspaceError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(`Workspace error: ${message}`);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('value must be a JSON object');
  return parsed as Record<string, unknown>;
}
