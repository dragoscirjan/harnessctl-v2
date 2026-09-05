import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { ConfigError, readConfig } from './config.js';
import {
  createExecutionContextProvider,
  ExecutionContextError,
  type ExecutionContext,
  type ExecutionHost,
} from './execution-context.js';

export type ExecutionOperationClass = 'control' | 'project';

export interface ProjectRootResolution {
  enabled: boolean;
  root: string;
  context?: ExecutionContext;
}

export function resolveProjectRoot(
  controlRoot: string,
  host: ExecutionHost,
  sessionId?: string,
  expectedBindingGeneration?: number,
): ProjectRootResolution {
  const config = readConfig(controlRoot);
  if (config instanceof ConfigError) throw new ExecutionContextError('configuration', config.message);
  if (!config.skills.cvs.workspaces) {
    if (sessionId && createExecutionContextProvider(controlRoot).hasBinding(host, sessionId))
      throw new ExecutionContextError(
        'configuration',
        'workspace routing is disabled while this host session still has an execution workspace binding',
      );
    return { enabled: false, root: controlRoot };
  }
  if (!sessionId)
    throw new ExecutionContextError('configuration', 'host session identity is required for workspace routing');
  const context = createExecutionContextProvider(controlRoot).resolve(host, sessionId, expectedBindingGeneration);
  return { enabled: true, root: context.execution_root, context };
}

export function resolveContextPath(
  context: ExecutionContext,
  requestedPath: string,
  operationClass: ExecutionOperationClass = 'project',
): string {
  if (!requestedPath || requestedPath.includes('\0'))
    throw new ExecutionContextError('unsafe_state', 'requested path is invalid');
  const root = canonicalDirectory(operationClass === 'control' ? context.primary_root : context.execution_root);
  const candidate = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(root, requestedPath);
  const canonical = canonicalProspectivePath(candidate);
  if (!isWithin(root, canonical)) {
    const boundary = operationClass === 'control' ? 'control root' : 'execution root';
    throw new ExecutionContextError('unsafe_state', `requested path escapes the ${boundary}`);
  }
  return canonical;
}

function canonicalProspectivePath(path: string): string {
  let ancestor = path;
  const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new ExecutionContextError('unsafe_state', 'requested path has no existing ancestor');
    suffix.unshift(relative(parent, ancestor));
    ancestor = parent;
  }
  const canonicalAncestor = realpathSync(ancestor);
  const stat = lstatSync(canonicalAncestor);
  if (suffix.length > 0 && !stat.isDirectory())
    throw new ExecutionContextError('unsafe_state', 'requested path descends through a non-directory');
  return resolve(canonicalAncestor, ...suffix);
}

function canonicalDirectory(path: string): string {
  try {
    const canonical = realpathSync(resolve(path));
    const stat = lstatSync(canonical);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new ExecutionContextError('unsafe_state', 'execution boundary must be a non-symlink directory');
    return canonical;
  } catch (error: unknown) {
    if (error instanceof ExecutionContextError) throw error;
    throw new ExecutionContextError('unsafe_state', 'execution boundary is unavailable');
  }
}

function isWithin(parent: string, child: string): boolean {
  const offset = relative(parent, child);
  return offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset));
}
