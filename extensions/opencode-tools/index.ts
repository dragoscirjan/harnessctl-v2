import {
  ConfigError,
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
  resolveContextPath,
  resolveProjectRoot,
  workspaceCleanup,
  workspaceEnsure,
  workspaceMarkCleanupReady,
  workspaceStatus,
  type SemanticTaskOperationId,
} from '@harnessctl/generic-tools';
import { tool, type Plugin, type ToolContext } from '@opencode-ai/plugin';
import { openCodeDocumentTools } from './document-tools.js';

const CUSTOM_TOOL_NAMES = new Set([
  'config_create',
  'config_get',
  'document_id',
  'document_create',
  'document_list',
  'document_get',
  'document_update',
  'document_version',
  'document_validate',
  'document_archive',
  'document_restore',
  'memory_search',
  'memory_list',
  'memory_get',
  'memory_store',
  'memory_supersede',
  'memory_delete',
  'memory_validate',
  'memory_export',
  'memory_import',
  'issue_id',
  'issue_create',
  'issue_list',
  'issue_get',
  'issue_update',
  'issue_transition',
  'issue_comment',
  'issue_relate',
  'issue_unrelate',
  'issue_link_document',
  'issue_validate',
  'issue_archive',
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

const SESSION_ONLY_TOOL_NAMES = new Set([
  'compress',
  'detect_language',
  'list_subagents',
  'question',
  'skill',
  'todoread',
  'todowrite',
]);

const ROUTED_PATH_TOOL_NAMES = new Set(['glob', 'grep', 'read']);
const PATCH_FILE_HEADERS = ['Add File', 'Update File', 'Delete File', 'Move to'] as const;
type PatchFileHeader = (typeof PATCH_FILE_HEADERS)[number];

export const CustomToolsPlugin: Plugin = async (input) => {
  if (!input || typeof input.directory !== 'string' || input.directory.length === 0)
    throw new Error('OpenCode compatibility error: PluginInput.directory is required for workspace routing');
  const projectRoot = (context: ToolContext): string =>
    resolveProjectRoot(context.directory, 'opencode', context.sessionID).root;

  return {
    tool: {
      config_create: tool({
        description: 'Create .harnessctl/config.yaml with neutral defaults if absent.',
        args: {},
        async execute(_args, context) {
          try {
            return `Configuration ready: ${createConfig(projectRoot(context))}`;
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
          const value = getConfigValue(projectRoot(context), args.path);
          return value instanceof ConfigError ? formatError(value) : JSON.stringify(value);
        },
      }),
      ...openCodeDocumentTools(projectRoot),
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
            return JSON.stringify(searchMemory(projectRoot(context), normalizedSearch(args)));
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
            return JSON.stringify(listMemory(projectRoot(context), normalizedSearch(args)));
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
            return JSON.stringify(getMemory(projectRoot(context), args.id));
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
            return JSON.stringify(storeMemory(projectRoot(context), normalizedWrite(args)));
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
            return JSON.stringify(supersedeMemory(projectRoot(context), target_id, normalizedWrite(write)));
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
              deleteMemory(projectRoot(context), args.target_id, args.reason, normalizedSource(args), args.created_by),
            );
          } catch (error: unknown) {
            return formatMemoryError(error);
          }
        },
      }),
      memory_validate: tool({
        description: 'Validate repository memory and report evidence-backed local cache status.',
        args: {},
        async execute(_args, context) {
          return JSON.stringify(validateMemory(projectRoot(context)));
        },
      }),
      memory_export: tool({
        description: 'Export secret-screened canonical memory as JSONL.',
        args: {},
        async execute(_args, context) {
          try {
            return exportMemory(projectRoot(context));
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
            return JSON.stringify(importMemory(projectRoot(context), args.content, args.preview ?? false));
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
          return encodeIssueToolResult(parseIssueIds(args.prompt, projectRoot(context)));
        },
      }),
      issue_create: tool({
        description: 'Create a canonical local issue YAML file under the configured issues.root directory.',
        args: {
          type: tool.schema.string().describe('Issue type: initiative, epic, story, task, or bug'),
          title: tool.schema.string().describe('Human-readable issue title'),
          status: tool.schema.string().describe('Issue status: open, in_progress, done, closed').optional(),
          parent: tool.schema.string().describe('Parent issue ID, such as hrn-00001').optional(),
          depends: tool.schema.string().describe('Comma-separated blocking issue IDs').optional(),
          author: tool.schema.string().describe('Agent or user attribution').optional(),
          assignee: tool.schema.string().describe('Agent or user assignee').optional(),
          metadata: tool.schema.string().describe('Optional JSON object with additional metadata').optional(),
        },
        async execute(args, context) {
          try {
            const { metadata, ...fields } = args;
            return encodeIssueToolResult(
              createIssueRecord(projectRoot(context), {
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
        description: 'List local issue files from the configured issues.root directory.',
        args: {
          status: tool.schema.string().describe('Filter by status').optional(),
          type: tool.schema.string().describe('Filter by issue type').optional(),
        },
        async execute(args, context) {
          try {
            return encodeIssueToolResult(listIssueSummaries(projectRoot(context), args));
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
            return encodeIssueToolResult(getIssue(projectRoot(context), args.id));
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
              updateIssue(projectRoot(context), id, {
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
            return encodeIssueToolResult(
              transitionIssue(projectRoot(context), args.id, args.status, args.expectedRevision),
            );
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
            return encodeIssueToolResult(commentIssue(projectRoot(context), args.id, args.body, args.author));
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
            return encodeIssueToolResult(relateIssue(projectRoot(context), args.id, args.relationship, args.targetId));
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
            return encodeIssueToolResult(
              unrelateIssue(projectRoot(context), args.id, args.relationship, args.targetId),
            );
          } catch (error: unknown) {
            return formatIssueError(error);
          }
        },
      }),
      issue_link_document: tool({
        description: 'Link a repository-relative task or active canonical document to an issue.',
        args: {
          id: tool.schema.string().describe('Issue ID'),
          path: tool.schema
            .string()
            .describe('Path under the configured tasks root or the fixed active .harnessctl/documents authority'),
          kind: tool.schema
            .string()
            .describe('Optional document kind: task, design, or document (preferred)')
            .optional(),
        },
        async execute(args, context) {
          try {
            return encodeIssueToolResult(linkDocument(projectRoot(context), args.id, args.path, args.kind));
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
            return encodeIssueToolResult(validateIssues(projectRoot(context), args.id));
          } catch (error: unknown) {
            return formatIssueError(error);
          }
        },
      }),
      issue_archive: tool({
        description: 'Move an issue and its active descendants under the configured issues.root archive.',
        args: {
          id: tool.schema.string().describe('Issue ID to archive'),
        },
        async execute(args, context) {
          try {
            return encodeIssueToolResult(archiveIssueReport(projectRoot(context), args.id));
          } catch (error: unknown) {
            return formatIssueError(error);
          }
        },
      }),
      workspace_ensure: workspaceTool(
        'Create or return the deterministic Git workspace for one canonical Epic.',
        workspaceEnsure,
      ),
      workspace_status: workspaceTool(
        'Inspect the deterministic Git workspace for one canonical Epic without mutation.',
        workspaceStatus,
      ),
      workspace_mark_cleanup_ready: workspaceTool(
        'Mark the matching clean Epic workspace ready for cleanup.',
        workspaceMarkCleanupReady,
      ),
      workspace_cleanup: workspaceTool(
        'Remove the matching clean ready Epic workspace while retaining its branch.',
        workspaceCleanup,
      ),
      workspace_session_allocate: tool({
        description: 'Allocate and bind a provisional execution workspace for this OpenCode session.',
        args: {},
        async execute(_args, context) {
          return executionControlResult(() =>
            createExecutionContextProvider(context.directory).allocateProvisional('opencode', context.sessionID),
          );
        },
      }),
      workspace_session_attach_epic: tool({
        description: 'Attach the bound provisional workspace to a canonical Epic without renaming it.',
        args: {
          epic_id: tool.schema.string().describe('Canonical Epic issue ID'),
          expected_binding_generation: tool.schema.number().describe('Exact current binding generation'),
          expected_workspace_generation: tool.schema.number().describe('Exact current workspace generation'),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            createExecutionContextProvider(context.directory).attachEpic(
              'opencode',
              context.sessionID,
              args.epic_id,
              args.expected_binding_generation,
              args.expected_workspace_generation,
            ),
          );
        },
      }),
      workspace_session_adopt: tool({
        description: 'Adopt an exact legacy Epic workspace into this OpenCode session without rewriting it.',
        args: { epic_id: tool.schema.string().describe('Canonical Epic issue ID') },
        async execute(args, context) {
          return executionControlResult(() =>
            createExecutionContextProvider(context.directory).adoptV1('opencode', context.sessionID, args.epic_id),
          );
        },
      }),
      workspace_session_bind: tool({
        description: 'Bind this OpenCode session to an existing execution workspace.',
        args: {
          workspace_id: tool.schema.string().describe('Execution workspace ID'),
          expected_binding_generation: tool.schema
            .number()
            .describe('Exact current generation when rebinding')
            .optional(),
          expected_workspace_generation: tool.schema.number().describe('Exact target workspace generation'),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            createExecutionContextProvider(context.directory).bind(
              'opencode',
              context.sessionID,
              args.workspace_id,
              args.expected_binding_generation,
              args.expected_workspace_generation,
            ),
          );
        },
      }),
      workspace_session_status: tool({
        description: 'Resolve and validate this OpenCode session execution workspace.',
        args: {
          expected_binding_generation: tool.schema.number().describe('Optional exact binding generation').optional(),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            createExecutionContextProvider(context.directory).resolve(
              'opencode',
              context.sessionID,
              args.expected_binding_generation,
            ),
          );
        },
      }),
      workspace_session_release: tool({
        description: 'Release this OpenCode session binding without deleting its workspace.',
        args: {
          expected_binding_generation: tool.schema.number().describe('Exact current binding generation'),
        },
        async execute(args, context) {
          return executionControlResult(() => {
            createExecutionContextProvider(context.directory).release(
              'opencode',
              context.sessionID,
              args.expected_binding_generation,
            );
            return { released: true };
          });
        },
      }),
      operation_prepare: tool({
        description: 'Prepare an immutable registered task operation for review and consent.',
        args: {
          operation_id: tool.schema.string().describe('Registered semantic operation ID'),
          expected_binding_generation: tool.schema.number().describe('Optional exact binding generation').optional(),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            buildTaskOperation(
              context.directory,
              'opencode',
              context.sessionID,
              args.operation_id as SemanticTaskOperationId,
              args.expected_binding_generation,
            ),
          );
        },
      }),
      operation_execute: tool({
        description: 'Execute a freshly rebuilt registered task operation with descriptor-bound consent.',
        args: {
          operation_id: tool.schema.string().describe('Registered semantic operation ID'),
          consent_digest: tool.schema.string().describe('Digest from the reviewed prepared descriptor'),
          expected_binding_generation: tool.schema.number().describe('Optional exact binding generation').optional(),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            executeRegisteredTaskOperation(
              context.directory,
              'opencode',
              context.sessionID,
              args.operation_id as SemanticTaskOperationId,
              args.consent_digest,
              args.expected_binding_generation,
            ),
          );
        },
      }),
      operation_prepare_command: tool({
        description: 'Prepare an immutable exceptional command for separate immediate consent.',
        args: {
          executable: tool.schema.string().describe('Executable name or path, without shell syntax'),
          argv: tool.schema.array(tool.schema.string()).describe('Exact argument vector'),
          expected_binding_generation: tool.schema.number().describe('Optional exact binding generation').optional(),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            buildExceptionalCommand(
              context.directory,
              'opencode',
              context.sessionID,
              args.executable,
              args.argv,
              args.expected_binding_generation,
            ),
          );
        },
      }),
      operation_execute_command: tool({
        description: 'Execute a freshly rebuilt exceptional command with descriptor-bound immediate consent.',
        args: {
          executable: tool.schema.string().describe('Executable from the reviewed descriptor'),
          argv: tool.schema.array(tool.schema.string()).describe('Exact argument vector from the reviewed descriptor'),
          consent_digest: tool.schema.string().describe('Digest from the reviewed exceptional command descriptor'),
          expected_binding_generation: tool.schema.number().describe('Optional exact binding generation').optional(),
        },
        async execute(args, context) {
          return executionControlResult(() =>
            executeRegisteredExceptionalCommand(
              context.directory,
              'opencode',
              context.sessionID,
              args.executable,
              args.argv,
              args.consent_digest,
              args.expected_binding_generation,
            ),
          );
        },
      }),
    },
    'tool.execute.before': createToolRoutingHook(input.directory),
  };
};

function createToolRoutingHook(controlRoot: string) {
  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown },
  ): Promise<void> => {
    if (isCustomTool(input.tool)) return;
    let resolution;
    try {
      resolution = resolveProjectRoot(controlRoot, 'opencode', input.sessionID);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenCode workspace routing failed for ${JSON.stringify(input.tool)}: ${reason}`);
    }
    if (!resolution.enabled) return;
    if (!resolution.context) throw new Error('OpenCode workspace routing failed: execution context is unavailable');
    if (isSessionOnlyTool(input.tool)) return;
    if (input.tool === 'apply_patch') {
      routeApplyPatch(output, resolution.context);
      return;
    }
    if (!ROUTED_PATH_TOOL_NAMES.has(input.tool)) {
      throw new Error(`OpenCode workspace routing rejected unsupported tool: ${input.tool}`);
    }
    if (output.args === null || typeof output.args !== 'object' || Array.isArray(output.args)) {
      throw new Error(`OpenCode workspace routing rejected invalid ${input.tool} arguments`);
    }
    const args = output.args as Record<string, unknown>;
    const pathKey = input.tool === 'read' ? 'filePath' : 'path';
    const requested = args[pathKey];
    if (requested !== undefined && typeof requested !== 'string') {
      throw new Error(`OpenCode workspace routing rejected invalid ${input.tool}.${pathKey}`);
    }
    args[pathKey] = resolveContextPath(resolution.context, requested ?? '.');
  };
}

function isCustomTool(name: string): boolean {
  return CUSTOM_TOOL_NAMES.has(name.replaceAll('-', '_'));
}

function isSessionOnlyTool(name: string): boolean {
  return SESSION_ONLY_TOOL_NAMES.has(name.replaceAll('-', '_'));
}

function routeApplyPatch(output: { args: unknown }, context: Parameters<typeof resolveContextPath>[0]): void {
  if (output.args === null || typeof output.args !== 'object' || Array.isArray(output.args)) {
    throw new Error('OpenCode workspace routing rejected invalid apply_patch arguments');
  }
  const args = output.args as Record<string, unknown>;
  if (Object.keys(args).length !== 1 || typeof args.patchText !== 'string') {
    throw new Error('OpenCode workspace routing rejected invalid apply_patch arguments');
  }
  args.patchText = routePatchText(args.patchText, context);
}

function routePatchText(patchText: string, context: Parameters<typeof resolveContextPath>[0]): string {
  const lines = patchText.split('\n');
  const lastLine = lines.at(-1) === '' ? lines.length - 2 : lines.length - 1;
  if (stripCarriageReturn(lines[0]) !== '*** Begin Patch' || stripCarriageReturn(lines[lastLine]) !== '*** End Patch') {
    throw new Error('OpenCode workspace routing rejected malformed apply_patch.patchText');
  }

  let currentOperation: PatchFileHeader | undefined;
  let hasFileHeader = false;
  let hasMoveTarget = false;
  for (let index = 1; index < lastLine; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = stripCarriageReturn(rawLine);
    const header = parsePatchFileHeader(line);
    if (!header) {
      if (line.startsWith('*** ')) {
        throw new Error('OpenCode workspace routing rejected malformed apply_patch.patchText');
      }
      continue;
    }

    const [kind, requestedPath] = header;
    if (kind === 'Move to') {
      if (currentOperation !== 'Update File' || hasMoveTarget) {
        throw new Error('OpenCode workspace routing rejected malformed apply_patch move target');
      }
      hasMoveTarget = true;
    } else {
      currentOperation = kind;
      hasMoveTarget = false;
      hasFileHeader = true;
    }
    lines[index] = preserveCarriageReturn(rawLine, `*** ${kind}: ${routePatchPath(requestedPath, context)}`);
  }
  if (!hasFileHeader) throw new Error('OpenCode workspace routing rejected malformed apply_patch.patchText');
  return lines.join('\n');
}

function parsePatchFileHeader(line: string): readonly [PatchFileHeader, string] | undefined {
  for (const header of PATCH_FILE_HEADERS) {
    const prefix = `*** ${header}: `;
    if (line.startsWith(prefix)) return [header, line.slice(prefix.length)];
    if (line.startsWith(`*** ${header}`)) {
      throw new Error(`OpenCode workspace routing rejected malformed apply_patch ${header.toLowerCase()}`);
    }
  }
  return undefined;
}

function routePatchPath(requestedPath: string, context: Parameters<typeof resolveContextPath>[0]): string {
  if (
    requestedPath.length === 0 ||
    requestedPath.trim() !== requestedPath ||
    requestedPath.split(/[\\/]/u).includes('..')
  ) {
    throw new Error('OpenCode workspace routing rejected unsafe apply_patch path');
  }
  return resolveContextPath(context, requestedPath);
}

function stripCarriageReturn(line: string | undefined): string {
  return (line ?? '').endsWith('\r') ? (line ?? '').slice(0, -1) : (line ?? '');
}

function preserveCarriageReturn(original: string, replacement: string): string {
  return original.endsWith('\r') ? `${replacement}\r` : replacement;
}

function workspaceTool(
  description: string,
  operation: (cwd: string, epicId: string) => unknown,
): ReturnType<typeof tool> {
  return tool({
    description,
    args: { epic_id: tool.schema.string().describe('Canonical Epic issue ID') },
    async execute(args, context) {
      try {
        return JSON.stringify(operation(context.directory, args.epic_id));
      } catch (error: unknown) {
        return formatWorkspaceError(error);
      }
    },
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? `Configuration error: ${error.message}` : `Configuration error: ${String(error)}`;
}

function formatIssueError(error: unknown): string {
  return error instanceof Error ? `Issue error: ${error.message}` : `Issue error: ${String(error)}`;
}

function formatMemoryError(error: unknown): string {
  return error instanceof Error ? `Memory error: ${error.message}` : `Memory error: ${String(error)}`;
}

function formatWorkspaceError(error: unknown): string {
  return error instanceof Error ? `Workspace error: ${error.message}` : `Workspace error: ${String(error)}`;
}

function executionControlResult(operation: () => unknown): string {
  try {
    return JSON.stringify(operation());
  } catch (error: unknown) {
    return formatWorkspaceError(error);
  }
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
