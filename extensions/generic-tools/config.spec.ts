import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, createConfig, getConfigValue, readConfig } from './index.js';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'harnessctl-config-'));
}

describe('configuration tools', () => {
  it('creates the neutral default configuration', () => {
    const cwd = temporaryDirectory();
    try {
      const path = createConfig(cwd);

      expect(path).toBe(join(cwd, '.harnessctl', 'config.yaml'));
      expect(readConfig(cwd)).toEqual({
        version: 1,
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
        workflow: { default_task_type: 'bug' },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing configuration', () => {
    const cwd = temporaryDirectory();
    try {
      const path = join(cwd, '.harnessctl', 'config.yaml');
      createConfig(cwd);
      writeFileSync(path, 'version: 9\n', 'utf8');

      createConfig(cwd);

      expect(readFileSync(path, 'utf8')).toBe('version: 9\n');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('resolves nested, scalar, mapping, and null values', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      const path = join(cwd, '.harnessctl', 'config.yaml');
      writeFileSync(path, 'version: 1\npaths:\n  tasks: .tasks\nempty: null\n', 'utf8');

      expect(getConfigValue(cwd, 'paths.tasks')).toBe('.tasks');
      expect(getConfigValue(cwd, 'paths')).toEqual({ tasks: '.tasks' });
      expect(getConfigValue(cwd, 'empty')).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reports missing files, keys, empty paths, and malformed YAML', () => {
    const cwd = temporaryDirectory();
    try {
      expect(readConfig(cwd)).toBeInstanceOf(ConfigError);
      expect(getConfigValue(cwd, 'paths.tasks')).toBeInstanceOf(ConfigError);

      createConfig(cwd);
      expect(getConfigValue(cwd, '')).toBeInstanceOf(ConfigError);
      expect(getConfigValue(cwd, 'missing.key')).toBeInstanceOf(ConfigError);

      writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'version: [unterminated\n', 'utf8');
      expect(readConfig(cwd)).toBeInstanceOf(ConfigError);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
