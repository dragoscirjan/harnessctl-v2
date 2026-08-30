import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_V1_REWRITE_GUIDANCE,
  ConfigError,
  createConfig,
  getConfigValue,
  parseConfig,
  readConfig,
} from './config.js';
import { CONFIG_V1_DEFAULTS } from './schemas.js';

interface ConformanceCase {
  readonly id: string;
  readonly valid: boolean;
  readonly input: Record<string, unknown>;
  readonly expected?: Record<string, unknown>;
  readonly error_paths?: string[];
}

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../tests/fixtures/config-v1-conformance.json'), 'utf8'),
) as { cases: ConformanceCase[] };
const validCases = fixture.cases.filter((testCase) => testCase.valid);
const invalidCases = fixture.cases.filter((testCase) => !testCase.valid);

describe('Config v1 loader', () => {
  it('returns canonical defaults when no config file exists', () => {
    expect(readConfig(mkdtempSync(join(tmpdir(), 'harnessctl-config-')))).toEqual(CONFIG_V1_DEFAULTS);
  });

  it('creates an explicit Config v1 document without replacing an existing file', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-config-'));
    const path = createConfig(cwd);
    expect(parseConfig(readFileSync(path, 'utf8'))).toEqual(CONFIG_V1_DEFAULTS);
    writeFileSync(path, 'version: 1\n', 'utf8');
    expect(createConfig(cwd)).toBe(path);
    expect(readFileSync(path, 'utf8')).toBe('version: 1\n');
  });

  it.each([{}, { version: 2 }, { version: 3 }, { version: '1' }])(
    'rejects missing and non-v1 versions with manual rewrite guidance',
    (input) => {
      expect(() => parseConfig(JSON.stringify(input))).toThrow(CONFIG_V1_REWRITE_GUIDANCE);
    },
  );

  it('preserves safe YAML parsing protections', () => {
    expect(() => parseConfig('version: 1\nversion: 1\n')).toThrow(/DUPLICATE_KEY/u);
    expect(() => parseConfig('version: 1\n1: invalid\n')).toThrow(/mapping keys must be strings/u);
    expect(() => parseConfig('[')).toThrow(/Malformed YAML/u);
  });

  it('deep-merges partial nested capability settings and rejects unknown keys', () => {
    expect(parseConfig('version: 1\nskills:\n  memory:\n    retrieval:\n      limit: 5\n')).toMatchObject({
      skills: { memory: { enabled: false, retrieval: { limit: 5, max_chars: 12_000 } } },
    });
    expect(() => parseConfig('version: 1\ncommunication: {}\n')).toThrow(/Unrecognized key/u);
  });

  it('reads normalized capability values by Config v1 path', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'harnessctl-config-'));
    createConfig(cwd);
    expect(getConfigValue(cwd, 'skills.issues.root')).toBe('.harnessctl/issues');
    expect(getConfigValue(cwd, 'skills.codeIndex.enabled')).toBe(false);
    expect(getConfigValue(cwd, 'skills.issues.provider.type')).toBe('filesystem');
    expect(getConfigValue(cwd, 'issues.root')).toBeInstanceOf(ConfigError);
  });

  it.each(validCases)('accepts shared conformance case $id', ({ input, expected }) => {
    expect(parseConfig(JSON.stringify(input))).toEqual(expected);
  });

  it.each(invalidCases)('rejects shared conformance case $id with exact full paths', ({ input, error_paths }) => {
    let thrown: unknown;
    try {
      parseConfig(JSON.stringify(input));
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).validationPaths).toEqual(error_paths);
  });
});
