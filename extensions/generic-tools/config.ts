import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { parseDocument, stringify } from 'yaml';

export type ConfigDocument = Record<string, unknown>;

export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CONFIG_PATH = join('.harnessctl', 'config.yaml');
export const DEFAULT_CONFIG: ConfigDocument = {
  version: 2,
  issues: {
    prefix: '',
    type: 'filesystem',
    tools: 'issue-create,issue-read,issue-delete,issue-comment',
  },
  paths: {
    root: '.harnessctl',
    tasks: '.harnessctl/tasks',
    reports: '.harnessctl/reports',
  },
  workflow: {
    default_task_type: 'bug',
  },
  communication: {
    caveman: { enabled: true, mode: 'strict' },
  },
  memory: {
    enabled: false,
    backend: 'repository',
    namespace: {
      organization_id: 'local',
      project_id: 'project',
      default_topic: 'general',
    },
    retrieval: { limit: 8, max_chars: 12_000, include_superseded: false },
    repository: {
      root: '.harnessctl/memory',
      cache: '.harnessctl/cache/memory.db',
    },
  },
};

function configPath(cwd: string): string {
  return join(cwd, CONFIG_PATH);
}

function assertConfigDocument(value: unknown): ConfigDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError('Configuration root must be a YAML mapping.');
  }

  return value as ConfigDocument;
}

export function parseConfig(content: string): ConfigDocument {
  const document = parseDocument(content);
  if (document.errors.length > 0) {
    throw new ConfigError(`Malformed YAML: ${document.errors[0]?.message}`);
  }

  return validateAndMigrateConfig(assertConfigDocument(document.toJS()));
}

export function validateAndMigrateConfig(value: ConfigDocument): ConfigDocument {
  const version = value.version;
  if (version !== undefined && version !== 1 && version !== 2)
    throw new ConfigError(`Unsupported configuration version: ${String(version)}`);

  const config = version === 2 ? value : deepMerge(DEFAULT_CONFIG, value);
  config.version = 2;
  const caveman = requireMapping(requireMapping(config, 'communication'), 'caveman');
  if (typeof caveman.enabled !== 'boolean') throw new ConfigError('communication.caveman.enabled must be boolean.');
  if (caveman.mode !== 'strict' && caveman.mode !== 'balanced')
    throw new ConfigError('communication.caveman.mode must be strict or balanced.');

  const memory = requireMapping(config, 'memory');
  if (typeof memory.enabled !== 'boolean') throw new ConfigError('memory.enabled must be boolean.');
  if (memory.backend !== 'repository') throw new ConfigError('memory.backend must be repository in config v2.');
  const namespace = requireMapping(memory, 'namespace');
  for (const key of ['organization_id', 'project_id', 'default_topic'])
    requireNonemptyString(namespace, key, `memory.namespace.${key}`);
  const retrieval = requireMapping(memory, 'retrieval');
  requireInteger(retrieval, 'limit', 1, 100);
  requireInteger(retrieval, 'max_chars', 256, 100_000);
  if (typeof retrieval.include_superseded !== 'boolean')
    throw new ConfigError('memory.retrieval.include_superseded must be boolean.');
  const repository = requireMapping(memory, 'repository');
  const root = requireSafeRelativePath(repository, 'root');
  const cache = requireSafeRelativePath(repository, 'cache');
  if (cache === root || cache.startsWith(`${root}/`))
    throw new ConfigError('memory.repository.cache must be outside memory.repository.root.');
  return config;
}

function deepMerge(base: ConfigDocument, override: ConfigDocument): ConfigDocument {
  const result: ConfigDocument = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isMapping(current) && isMapping(value) ? deepMerge(current, value) : structuredClone(value);
  }
  return result;
}

function isMapping(value: unknown): value is ConfigDocument {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireMapping(parent: ConfigDocument, key: string): ConfigDocument {
  const value = parent[key];
  if (!isMapping(value)) throw new ConfigError(`${key} must be a mapping.`);
  return value;
}

function requireNonemptyString(parent: ConfigDocument, key: string, path: string): string {
  const value = parent[key];
  if (typeof value !== 'string' || value.trim() === '') throw new ConfigError(`${path} must be a non-empty string.`);
  return value;
}

function requireInteger(parent: ConfigDocument, key: string, minimum: number, maximum: number): number {
  const value = parent[key];
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new ConfigError(`memory.retrieval.${key} must be an integer from ${minimum} to ${maximum}.`);
  return value as number;
}

function requireSafeRelativePath(parent: ConfigDocument, key: string): string {
  const value = requireNonemptyString(parent, key, `memory.repository.${key}`);
  const normalized = normalize(value).replaceAll('\\', '/');
  if (
    isAbsolute(value) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    relative('.', normalized).startsWith('..')
  )
    throw new ConfigError(`memory.repository.${key} must stay inside project root.`);
  return normalized.replace(/^\.\//, '');
}

export function createConfig(cwd: string): string {
  const path = configPath(cwd);
  try {
    readFileSync(path);
  } catch (error: unknown) {
    if (!isMissingFileError(error)) {
      throw new ConfigError(`Unable to inspect ${path}: ${errorMessage(error)}`);
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stringify(DEFAULT_CONFIG), 'utf8');
  }

  return path;
}

export function readConfig(cwd: string): ConfigDocument | ConfigError {
  const path = configPath(cwd);
  try {
    return parseConfig(readFileSync(path, 'utf8'));
  } catch (error: unknown) {
    return toConfigError(`Unable to read ${path}`, error);
  }
}

export function getConfigValue(cwd: string, path: string): unknown | ConfigError {
  if (path.trim() === '') {
    return new ConfigError('Configuration path must not be empty.');
  }

  const config = readConfig(cwd);
  if (config instanceof ConfigError) {
    return config;
  }

  let current: unknown = config;
  for (const segment of path.split('.')) {
    if (segment === '' || current === null || typeof current !== 'object' || Array.isArray(current)) {
      return new ConfigError(`Configuration key not found: ${path}`);
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return new ConfigError(`Configuration key not found: ${path}`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toConfigError(prefix: string, error: unknown): ConfigError {
  if (error instanceof ConfigError) {
    return error;
  }

  if (isMissingFileError(error)) {
    return new ConfigError(`${prefix}: configuration file does not exist.`);
  }

  return new ConfigError(`${prefix}: ${errorMessage(error)}`);
}
