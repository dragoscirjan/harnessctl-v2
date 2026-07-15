import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseDocument, stringify } from 'yaml';

export type ConfigDocument = Record<string, unknown>;

export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CONFIG_PATH = join('.harnessctl', 'config.yaml');
const DEFAULT_CONFIG: ConfigDocument = {
  version: 1,
  issues: {
    pattern: '*', // * means an incremental number.
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

  return assertConfigDocument(document.toJS());
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
