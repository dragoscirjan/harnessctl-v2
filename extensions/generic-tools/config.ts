import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import type { ZodIssue } from 'zod';
import { CONFIG_V1_DEFAULTS, configV1Schema, formatSchemaError, type ConfigV1 } from './schemas.js';

export type ConfigDocument = Record<string, unknown>;

export class ConfigError extends Error {
  public constructor(
    message: string,
    public readonly validationPaths: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CONFIG_PATH = join('.harnessctl', 'config.yaml');
export const CONFIG_V1_REWRITE_GUIDANCE =
  'Config v1 requires explicit version: 1. Manually rewrite .harnessctl/config.yaml using docs/configuration.md; automatic migration is not supported.';
export const DEFAULT_CONFIG: ConfigV1 = structuredClone(CONFIG_V1_DEFAULTS);

function configPath(cwd: string): string {
  return join(cwd, CONFIG_PATH);
}

function assertConfigDocument(value: unknown): ConfigDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError('Configuration root must be a YAML mapping.');
  }
  return value as ConfigDocument;
}

function assertStringMappingKeys(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, nested] of value) {
      if (typeof key !== 'string') throw new ConfigError('Malformed YAML: mapping keys must be strings.');
      assertStringMappingKeys(nested, seen);
    }
    return;
  }
  if (Array.isArray(value)) for (const nested of value) assertStringMappingKeys(nested, seen);
}

export function parseConfig(content: string): ConfigV1 {
  const document = parseDocument(content, { uniqueKeys: true });
  if (document.errors.length > 0) {
    const error = document.errors[0];
    const position = error?.linePos?.[0];
    const location = position === undefined ? '' : ` at line ${position.line}, column ${position.col}`;
    throw new ConfigError(`Malformed YAML: ${error?.code ?? 'PARSE_ERROR'}${location}.`);
  }
  assertStringMappingKeys(document.toJS({ mapAsMap: true }));
  return validateConfig(assertConfigDocument(document.toJS()));
}

export function validateConfig(value: ConfigDocument): ConfigV1 {
  if (value.version !== 1) throw new ConfigError(CONFIG_V1_REWRITE_GUIDANCE, ['version']);
  validateHostOverrides(value);
  const merged = deepMerge(DEFAULT_CONFIG, value);
  if (Object.prototype.hasOwnProperty.call(value, 'mcpServers')) merged.mcpServers = structuredClone(value.mcpServers);
  const result = configV1Schema.safeParse(merged);
  if (!result.success)
    throw new ConfigError(
      `Invalid Config v1:\n${formatSchemaError(result.error)}`,
      [
        ...new Set(
          result.error.issues.flatMap((issue) =>
            deepestValidationPaths(issue).map((path) => formatValidationPath(path)),
          ),
        ),
      ].sort(),
    );
  return result.data;
}

function deepMerge(base: ConfigDocument, override: ConfigDocument): ConfigDocument {
  if (typeof base.type === 'string' && typeof override.type === 'string' && base.type !== override.type)
    return structuredClone(override);
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

function validateHostOverrides(config: ConfigDocument): void {
  if (!isMapping(config.mcpServers)) return;
  for (const [serverId, declaration] of Object.entries(config.mcpServers)) {
    if (!isMapping(declaration)) continue;
    for (const host of ['opencode', 'pi'] as const) {
      if (Object.prototype.hasOwnProperty.call(declaration, host))
        validateJsonValue(declaration[host], ['mcpServers', serverId, host], new Set<object>());
    }
  }
}

function validateJsonValue(value: unknown, path: PropertyKey[], ancestors: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new ConfigError('Invalid Config v1: host override numbers must be finite.', [formatValidationPath(path)]);
  }
  if (Array.isArray(value)) {
    enterJsonContainer(value, path, ancestors);
    value.forEach((item, index) => validateJsonValue(item, [...path, index], ancestors));
    ancestors.delete(value);
    return;
  }
  if (
    isMapping(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    enterJsonContainer(value, path, ancestors);
    for (const [key, item] of Object.entries(value)) {
      const keyPath = [...path, key];
      // eslint-disable-next-line no-control-regex -- host-native setting names must be safe JSON object keys
      if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u.test(key))
        throw new ConfigError('Invalid Config v1: host override keys must not contain control characters.', [
          formatValidationPath(keyPath),
        ]);
      validateJsonValue(item, keyPath, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  throw new ConfigError('Invalid Config v1: host override values must be JSON-compatible.', [
    formatValidationPath(path),
  ]);
}

function enterJsonContainer(value: object, path: PropertyKey[], ancestors: Set<object>): void {
  if (ancestors.has(value))
    throw new ConfigError('Invalid Config v1: host override values must not contain cycles.', [
      formatValidationPath(path),
    ]);
  ancestors.add(value);
}

function formatValidationPath(path: PropertyKey[]): string {
  return path.length === 0 ? '<root>' : path.map(String).join('.');
}

function deepestValidationPaths(issue: ZodIssue, prefix: PropertyKey[] = []): PropertyKey[][] {
  const path = [...prefix, ...issue.path];
  if (issue.code !== 'invalid_union') return [path];
  const minimumIssues = Math.min(...issue.errors.map((branch) => branch.length));
  const candidates = issue.errors
    .filter((branch) => branch.length === minimumIssues)
    .flatMap((branch) => branch.flatMap((nested) => deepestValidationPaths(nested, path)));
  const maximumDepth = Math.max(...candidates.map((candidate) => candidate.length));
  return candidates.filter((candidate) => candidate.length === maximumDepth);
}

export function createConfig(cwd: string): string {
  const path = configPath(cwd);
  try {
    readFileSync(path);
  } catch (error: unknown) {
    if (!isMissingFileError(error)) throw new ConfigError(`Unable to inspect ${path}: ${errorMessage(error)}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stringify(DEFAULT_CONFIG), 'utf8');
  }
  return path;
}

export function readConfig(cwd: string): ConfigV1 | ConfigError {
  const path = configPath(cwd);
  try {
    return parseConfig(readFileSync(path, 'utf8'));
  } catch (error: unknown) {
    if (isMissingFileError(error)) return structuredClone(DEFAULT_CONFIG);
    return toConfigError(`Unable to read ${path}`, error);
  }
}

export function getConfigValue(cwd: string, path: string): unknown | ConfigError {
  if (path.trim() === '') return new ConfigError('Configuration path must not be empty.');
  const config = readConfig(cwd);
  if (config instanceof ConfigError) return config;

  let current: unknown = config;
  for (const segment of path.split('.')) {
    if (segment === '' || current === null || typeof current !== 'object' || Array.isArray(current))
      return new ConfigError(`Configuration key not found: ${path}`);
    if (!Object.prototype.hasOwnProperty.call(current, segment))
      return new ConfigError(`Configuration key not found: ${path}`);
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
  if (error instanceof ConfigError) return error;
  return new ConfigError(`${prefix}: ${errorMessage(error)}`);
}
