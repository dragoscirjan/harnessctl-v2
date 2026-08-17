import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, createConfig, getConfigValue, readConfig } from './index.js';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'harnessctl-config-'));
}

const PROVIDERS = [
  ['github', 'gh', 'https://github.com', 'GH_TOKEN'],
  ['gitlab', 'glab', 'https://gitlab.com', 'GITLAB_TOKEN'],
  ['gitea', 'tea', 'https://gitea.example.test', 'GITEA_TOKEN'],
  ['forgejo', 'forgejo-cli', 'https://forgejo.example.test', 'FORGEJO_TOKEN'],
] as const;

describe('configuration tools', () => {
  it('creates the neutral default configuration', () => {
    const cwd = temporaryDirectory();
    try {
      const path = createConfig(cwd);

      expect(path).toBe(join(cwd, '.harnessctl', 'config.yaml'));
      expect(readConfig(cwd)).toEqual({
        version: 2,
        issues: {
          root: '.harnessctl/issues',
          prefix: 'hrn-',
          type: 'filesystem',
          tools:
            'issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive',
        },
        cvs: {
          local: 'git',
          remote: {
            provider: 'github',
            transport: 'auto',
            tools: 'gh',
            url: 'https://github.com',
            token_env: 'GH_TOKEN',
          },
        },
        mcp: { output_limit_mode: 'bounded-guidance' },
        paths: {
          root: '.harnessctl',
          tasks: '.harnessctl/tasks',
          reports: '.harnessctl/reports',
        },
        workflow: { default_task_type: 'bug' },
        communication: { caveman: { enabled: true, mode: 'strict' } },
        memory: {
          enabled: false,
          backend: 'repository',
          namespace: { organization_id: 'local', project_id: 'project', default_topic: 'general' },
          retrieval: { limit: 8, max_chars: 12_000, include_superseded: false },
          repository: { root: '.harnessctl/memory' },
        },
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
      expect(getConfigValue(cwd, 'paths')).toEqual({
        root: '.harnessctl',
        tasks: '.tasks',
        reports: '.harnessctl/reports',
      });
      expect(getConfigValue(cwd, 'empty')).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('serves fresh defaults when the configuration file is absent', () => {
    const cwd = temporaryDirectory();
    try {
      expect(getConfigValue(cwd, 'paths.tasks')).toBe('.harnessctl/tasks');
      expect(getConfigValue(cwd, 'issues.root')).toBe('.harnessctl/issues');
      expect(getConfigValue(cwd, 'issues.prefix')).toBe('hrn-');
      const first = readConfig(cwd);
      if (first instanceof ConfigError) throw first;
      (first.paths as Record<string, unknown>).tasks = 'mutated';
      expect(getConfigValue(cwd, 'paths.tasks')).toBe('.harnessctl/tasks');
      expect(existsSync(join(cwd, '.harnessctl', 'config.yaml'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('deep-merges partial version 2 configuration over defaults', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      writeFileSync(
        join(cwd, '.harnessctl', 'config.yaml'),
        'version: 2\nmemory:\n  enabled: true\n  retrieval:\n    limit: 3\n',
        'utf8',
      );

      expect(readConfig(cwd)).toMatchObject({
        version: 2,
        issues: { root: '.harnessctl/issues', prefix: 'hrn-' },
        paths: { tasks: '.harnessctl/tasks' },
        communication: { caveman: { enabled: true, mode: 'strict' } },
        memory: {
          enabled: true,
          backend: 'repository',
          retrieval: { limit: 3, max_chars: 12_000, include_superseded: false },
          repository: { root: '.harnessctl/memory' },
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    ['github', ' gh ', 'gh', 'https://github.com', 'GH_TOKEN'],
    ['gitlab', ' glab ', 'glab', 'https://gitlab.com', 'GITLAB_TOKEN'],
    ['gitea', ' tea ', 'tea', 'https://gitea.example.test', 'GITEA_TOKEN'],
    ['forgejo', ' forgejo-cli ', 'forgejo-cli', 'https://forgejo.example.test:3000', 'FORGEJO_TOKEN'],
  ])(
    'normalizes explicit %s tooling and retains filesystem-only overlay defaults',
    (type, tools, normalized, url, tokenEnv) => {
      const config = readConfigFromText(
        `version: 2\nissues:\n  type: ${type}\n  tools: "${tools}"\n  remote:\n    url: ${url}\n    token_env: ${tokenEnv}\n`,
      );
      expect(config).toMatchObject({
        issues: {
          root: '.harnessctl/issues',
          prefix: 'hrn-',
          type,
          tools: normalized,
          remote: { transport: 'auto', url, token_env: tokenEnv },
        },
      });
    },
  );

  it('keeps create and get tools operational for remote configuration', () => {
    const cwd = temporaryDirectory();
    try {
      const path = createConfig(cwd);
      writeFileSync(
        path,
        'version: 2\nissues:\n  type: github\n  tools: gh\n  remote:\n    url: https://github.com\n    token_env: GH_TOKEN\n',
        'utf8',
      );
      expect(getConfigValue(cwd, 'issues.type')).toBe('github');
      expect(getConfigValue(cwd, 'issues.tools')).toBe('gh');
      createConfig(cwd);
      expect(readFileSync(path, 'utf8')).toContain('type: github');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('normalizes the complete filesystem tool set to canonical order', () => {
    const canonical = (readConfigFromText('version: 2\n').issues as Record<string, unknown>).tools as string;
    const reordered = canonical.split(',').reverse().join(' , ');
    expect(readConfigFromText(`version: 2\nissues:\n  tools: "${reordered}"\n`)).toMatchObject({
      issues: { type: 'filesystem', tools: canonical },
    });
  });

  it.each(['github', 'gitlab', 'gitea', 'forgejo'])('requires explicit tools for remote type %s', (type) => {
    expect(() => readConfigFromText(`version: 2\nissues:\n  type: ${type}\n`)).toThrow(
      new RegExp(`issues\\.type=${type} requires issues\\.tools`, 'u'),
    );
  });

  it.each([
    ['github', 'gh', 'https://github.com', 'GH_TOKEN'],
    ['gitlab', 'glab', 'https://gitlab.com', 'GITLAB_TOKEN'],
    ['gitea', 'tea', 'https://gitea.example.test', 'GITEA_TOKEN'],
    ['forgejo', 'forgejo-cli', 'https://forgejo.example.test', 'FORGEJO_TOKEN'],
  ])('requires remote connection configuration for %s', (type, tools, url, tokenEnv) => {
    expect(() => readConfigFromText(`version: 2\nissues:\n  type: ${type}\n  tools: ${tools}\n`)).toThrow(/remote/u);
    expect(() =>
      readConfigFromText(
        `version: 2\nissues:\n  type: ${type}\n  tools: ${tools}\n  remote:\n    url: ${url}\n    token_env: ${tokenEnv}\n`,
      ),
    ).not.toThrow();
  });

  it('rejects remote configuration for filesystem issues', () => {
    expect(() =>
      readConfigFromText('version: 2\nissues:\n  remote:\n    url: https://github.com\n    token_env: GH_TOKEN\n'),
    ).toThrow(/remote/u);
  });

  it.each([
    ['github', 'gh', 'https://github.example.test', 'GH_TOKEN'],
    ['gitlab', 'glab', 'https://gitlab.com/', 'GITLAB_TOKEN'],
    ['gitea', 'tea', 'gitea.example.test', 'GITEA_TOKEN'],
    ['gitea', 'tea', 'https://user:secret@gitea.example.test', 'GITEA_TOKEN'],
    ['gitea', 'tea', 'https://gitea.example.test/`injected`', 'GITEA_TOKEN'],
    ['gitea', 'tea', 'https://gitea.example.test/${TOKEN}', 'GITEA_TOKEN'],
    ['gitea', 'tea', 'https://gitea.example.test?owner=project', 'GITEA_TOKEN'],
    ['gitea', 'tea', 'https://gitea.example.test#project', 'GITEA_TOKEN'],
    ['forgejo', 'forgejo-cli', 'ssh://forgejo.example.test', 'FORGEJO_TOKEN'],
    ['github', 'gh', 'https://github.com', 'secret-value'],
  ])('rejects invalid %s remote connection %s %s', (type, tools, url, tokenEnv) => {
    expect(() =>
      readConfigFromText(
        `version: 2\nissues:\n  type: ${type}\n  tools: ${tools}\n  remote:\n    url: ${url}\n    token_env: ${tokenEnv}\n`,
      ),
    ).toThrow(/remote/u);
  });

  it.each(['git', 'jj'])('accepts %s with every CVS provider and transport', (local) => {
    for (const [provider, tools, url, tokenEnv] of PROVIDERS) {
      for (const transport of ['auto', 'cli', 'mcp']) {
        expect(
          readConfigFromText(
            `version: 2\ncvs:\n  local: ${local}\n  remote:\n    provider: ${provider}\n    transport: ${transport}\n    tools: ${tools}\n    url: ${url}\n    token_env: ${tokenEnv}\n`,
          ),
        ).toMatchObject({ cvs: { local, remote: { provider, transport, tools, url, token_env: tokenEnv } } });
      }
    }
  });

  it('keeps CVS and Issues transports independent and migrates only remote Issues', () => {
    const config = readConfigFromText(
      'version: 1\ncvs:\n  remote:\n    transport: cli\nissues:\n  type: github\n  tools: gh\n  remote:\n    url: https://github.com\n    token_env: ISSUE_TOKEN\n',
    );
    expect(config).toMatchObject({
      cvs: { remote: { provider: 'github', transport: 'cli', token_env: 'GH_TOKEN' } },
      issues: { type: 'github', remote: { transport: 'auto', token_env: 'ISSUE_TOKEN' } },
      mcp: { output_limit_mode: 'bounded-guidance' },
    });
  });

  it.each(['auto', 'cli', 'mcp'])('accepts independent remote Issues transport %s', (transport) => {
    expect(
      readConfigFromText(
        `version: 2\nissues:\n  type: gitlab\n  tools: glab\n  remote:\n    transport: ${transport}\n    url: https://gitlab.com\n    token_env: ISSUE_TOKEN\n`,
      ),
    ).toMatchObject({ issues: { type: 'gitlab', remote: { transport, token_env: 'ISSUE_TOKEN' } } });
  });

  it.each(PROVIDERS.slice(1))('requires a complete explicit CVS override for %s', (provider) => {
    expect(() => readConfigFromText(`version: 2\ncvs:\n  remote:\n    provider: ${provider}\n`)).toThrow(
      /cvs\.remote\.(tools|url|token_env)/u,
    );
  });

  it.each([
    ['cvs.local', 'cvs:\n  local: svn'],
    ['cvs.remote.transport', 'cvs:\n  remote:\n    transport: magic'],
    ['cvs.remote.tools', 'cvs:\n  remote:\n    tools: glab'],
    ['cvs.remote.url', 'cvs:\n  remote:\n    url: https://github.example.test'],
    ['cvs.remote.token_env', 'cvs:\n  remote:\n    token_env: ghp_secret'],
    ['mcp.output_limit_mode', 'mcp:\n  output_limit_mode: unlimited'],
  ])('rejects unsafe or unsupported %s', (_field, yaml) => {
    expect(() => readConfigFromText(`version: 2\n${yaml}\n`)).toThrow(ConfigError);
  });

  it.each([
    'issues:\n  unexpected: true',
    'issues:\n  type: github\n  tools: gh\n  remote:\n    url: https://github.com\n    token_env: GH_TOKEN\n    unexpected: true',
    'cvs:\n  unexpected: true',
    'cvs:\n  remote:\n    mcp_id: cvs_github',
    'mcp:\n  servers:\n    id: cvs_github',
  ])('rejects unknown nested configuration without making fixed MCP IDs configurable', (yaml) => {
    expect(() => readConfigFromText(`version: 2\n${yaml}\n`)).toThrow(ConfigError);
  });

  it('accepts hard output limiting as a host-neutral configuration policy', () => {
    expect(readConfigFromText('version: 2\nmcp:\n  output_limit_mode: hard\n')).toMatchObject({
      mcp: { output_limit_mode: 'hard' },
    });
  });

  it.each([
    ['github', 'glab'],
    ['gitlab', 'gh'],
    ['gitea', 'gh'],
    ['forgejo', 'tea,gh'],
  ])('rejects provider/tool mismatch %s with %s', (type, tools) => {
    const connection = PROVIDERS.find(([provider]) => provider === type);
    expect(connection).toBeDefined();
    const [, , url, tokenEnv] = connection!;
    expect(() =>
      readConfigFromText(
        `version: 2\nissues:\n  type: ${type}\n  tools: "${tools}"\n  remote:\n    url: ${url}\n    token_env: ${tokenEnv}\n`,
      ),
    ).toThrow(/issues\.tools/u);
  });

  it.each(['gh --token secret', '../gh', 'TOKEN=value', 'gh;rm', 'gh,', ''])('rejects unsafe tool text %j', (tools) => {
    expect(() =>
      readConfigFromText(
        `version: 2\nissues:\n  type: forgejo\n  tools: "${tools}"\n  remote:\n    url: https://forgejo.example.test\n    token_env: FORGEJO_TOKEN\n`,
      ),
    ).toThrow(/issues\.tools/u);
  });

  it('rejects incomplete, extended, and duplicate filesystem tool sets', () => {
    const canonical = (readConfigFromText('version: 2\n').issues as Record<string, unknown>).tools as string;
    for (const tools of [canonical.split(',').slice(1).join(','), `${canonical},extra`, `${canonical},issue_id`])
      expect(() => readConfigFromText(`version: 2\nissues:\n  tools: "${tools}"\n`)).toThrow(/must be exactly/u);
  });

  it('requires caveman communication when memory is enabled', () => {
    expect(() =>
      readConfigFromText('version: 2\ncommunication:\n  caveman:\n    enabled: false\nmemory:\n  enabled: true\n'),
    ).toThrow(/memory\.enabled requires communication\.caveman\.enabled/u);

    expect(
      readConfigFromText('version: 2\ncommunication:\n  caveman:\n    enabled: false\nmemory:\n  enabled: false\n'),
    ).toMatchObject({
      communication: { caveman: { enabled: false, mode: 'strict' } },
      memory: { enabled: false },
    });
    expect(readConfigFromText('version: 1\nmemory:\n  enabled: true\n')).toMatchObject({
      version: 2,
      communication: { caveman: { enabled: true, mode: 'strict' } },
      memory: { enabled: true },
    });
  });

  it('reports missing keys, empty paths, and malformed YAML', () => {
    const cwd = temporaryDirectory();
    try {
      expect(getConfigValue(cwd, '')).toBeInstanceOf(ConfigError);
      expect(getConfigValue(cwd, 'missing.key')).toBeInstanceOf(ConfigError);

      createConfig(cwd);
      writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'version: [unterminated\n', 'utf8');
      expect(readConfig(cwd)).toBeInstanceOf(ConfigError);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects unsupported memory backends and unsafe repository paths', () => {
    const base = readConfigFromText('version: 1\n');
    const memory = base.memory as Record<string, unknown>;
    memory.backend = 'graphiti';
    expect(() => readConfigFromText(stringifyConfig(base))).toThrow(ConfigError);
    memory.backend = 'repository';
    (memory.repository as Record<string, unknown>).root = '../memory';
    expect(() => readConfigFromText(stringifyConfig(base))).toThrow(ConfigError);
  });

  it('tolerates but does not operationally require the retired memory cache key', () => {
    const config = readConfigFromText(
      'version: 2\nmemory:\n  repository:\n    root: .harnessctl/memory\n    cache: legacy/cache.json\n',
    );
    expect(config).toMatchObject({ memory: { repository: { root: '.harnessctl/memory' } } });
  });

  it('rejects unsafe issue roots and prefixes', () => {
    const base = readConfigFromText('version: 2\n');
    const issues = base.issues as Record<string, unknown>;
    for (const root of [
      '../issues',
      '.',
      'nested//issues',
      '.harnessctl/issues/',
      '.harnessctl/`issues',
      '.harnessctl/\0issues',
      '.harnessctl/\nissues',
    ]) {
      issues.root = root;
      expect(() => readConfigFromText(stringifyConfig(base))).toThrow(ConfigError);
    }
    issues.root = '.harnessctl/issues';
    issues.prefix = 'hrn/';
    expect(() => readConfigFromText(stringifyConfig(base))).toThrow(ConfigError);
  });
});

function readConfigFromText(content: string): Record<string, unknown> {
  const cwd = temporaryDirectory();
  try {
    const path = join(cwd, '.harnessctl', 'config.yaml');
    createConfig(cwd);
    writeFileSync(path, content, 'utf8');
    const result = readConfig(cwd);
    if (result instanceof ConfigError) throw result;
    return result;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function stringifyConfig(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}
