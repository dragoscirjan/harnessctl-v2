import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { ConfigError, validateConfig } from './config.js';
import { generateContracts, renderContracts, toPortableJsonSchema } from './generate-contracts.js';
import {
  CONFIG_V1_DEFAULTS,
  configV1Schema,
  OPENCODE_MCP_OVERRIDE_PROTECTED_KEYS,
  PI_MCP_OVERRIDE_PROTECTED_KEYS,
} from './schemas.js';

const addFormats = addFormatsModule as unknown as FormatsPlugin;
const packageRoot = import.meta.dirname;
const pythonContractsRoot = resolve(packageRoot, '../../src/harnessctl/contracts');
const require = createRequire(import.meta.url);

describe('Config v1 contract authority', () => {
  it('defines explicit version 1 and complete capability-oriented defaults under skills', () => {
    expect(configV1Schema.parse(CONFIG_V1_DEFAULTS)).toEqual(CONFIG_V1_DEFAULTS);
    expect(CONFIG_V1_DEFAULTS.version).toBe(1);
    expect(configV1Schema.safeParse({ ...CONFIG_V1_DEFAULTS, version: 2 }).success).toBe(false);
    expect(Object.keys(CONFIG_V1_DEFAULTS.skills).sort()).toEqual([
      'caveman',
      'codeIndex',
      'cvs',
      'documents',
      'issues',
      'memory',
      'tdd',
      'webRetrieval',
    ]);
    expect(CONFIG_V1_DEFAULTS).toHaveProperty('paths');
    expect(CONFIG_V1_DEFAULTS).toHaveProperty('workflow');
    expect(CONFIG_V1_DEFAULTS).toHaveProperty('mcp');
    expect(CONFIG_V1_DEFAULTS).toHaveProperty('mcpServers');
    expect(CONFIG_V1_DEFAULTS.mcpServers).toEqual({
      sdlc_cvs_github: {
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: 'Bearer {env:GH_TOKEN}',
          'X-MCP-Toolsets': 'repos,issues,pull_requests,actions,git',
        },
      },
      sdlc_code_index: { command: 'cgc', args: ['mcp', 'start'] },
      sdlc_web_crawl: {
        command: 'npx',
        args: ['-y', '@dragoscirjan/mcp-searchable@latest'],
      },
    });
    expect(CONFIG_V1_DEFAULTS.workflow).toEqual({ default_task_type: 'bug' });
    expect(CONFIG_V1_DEFAULTS.skills.tdd).toEqual({ enabled: false });
    expect(CONFIG_V1_DEFAULTS.skills.cvs.workspaces).toBe(false);
    expect(CONFIG_V1_DEFAULTS.skills.webRetrieval).toEqual({
      enabled: false,
      mcpName: 'sdlc_web_crawl',
    });
    expect(
      configV1Schema.safeParse({ ...CONFIG_V1_DEFAULTS, workflow: { default_task_type: 'bug', tdd: {} } }).success,
    ).toBe(false);
  });

  it('uses discriminator-free URL and command MCP declarations', () => {
    const validServers = [
      { url: 'https://mcp.example.test/api', headers: { Authorization: 'Bearer {env:MCP_TOKEN}' } },
      {
        command: 'npx',
        args: ['-y', '@example/mcp'],
        environment: { API_TOKEN: 'MCP_TOKEN' },
        cwd: 'tools/mcp',
      },
    ];
    for (const server of validServers) {
      const result = configV1Schema.safeParse({
        ...CONFIG_V1_DEFAULTS,
        mcpServers: { ...CONFIG_V1_DEFAULTS.mcpServers, custom: server },
      });
      expect(result.success).toBe(true);
    }

    for (const discriminator of ['type', 'transport', 'http', 'stdio', 'html', 'cli']) {
      const result = configV1Schema.safeParse({
        ...CONFIG_V1_DEFAULTS,
        mcpServers: {
          ...CONFIG_V1_DEFAULTS.mcpServers,
          custom: { url: 'https://mcp.example.test', [discriminator]: 'http' },
        },
      });
      expect(result.success).toBe(false);
    }
  });

  it('requires a valid map-key identity and exactly one portable connection core', () => {
    for (const [name, server] of [
      ['Invalid Name', { command: 'example-mcp' }],
      ['custom', {}],
      ['custom', { url: 'https://mcp.example.test', command: 'example-mcp' }],
    ] as const) {
      const input = {
        ...CONFIG_V1_DEFAULTS,
        mcpServers: { ...CONFIG_V1_DEFAULTS.mcpServers, [name]: server },
      };
      expect(configV1Schema.safeParse(input).success).toBe(false);
      expect(configContractValidator()(input)).toBe(false);
    }
  });

  it('accepts dangerous-looking own names without consulting or mutating the prototype chain', () => {
    const ownNames = JSON.parse(
      '{"constructor":{"command":"constructor-mcp"},"prototype":{"command":"prototype-mcp"}}',
    ) as Record<string, unknown>;
    const parsed = configV1Schema.parse({
      ...CONFIG_V1_DEFAULTS,
      mcpServers: { ...CONFIG_V1_DEFAULTS.mcpServers, ...ownNames },
      skills: {
        ...CONFIG_V1_DEFAULTS.skills,
        codeIndex: { enabled: true, mcpName: 'constructor' },
      },
    });
    expect(Object.hasOwn(parsed.mcpServers, 'constructor')).toBe(true);
    expect(Object.hasOwn(parsed.mcpServers, 'prototype')).toBe(true);
    expect(Object.getPrototypeOf(parsed.mcpServers)).toBe(Object.prototype);

    const protoKey = JSON.parse('{"__proto__":{"command":"unsafe-mcp"}}') as Record<string, unknown>;
    const rejected = configV1Schema.safeParse({ ...CONFIG_V1_DEFAULTS, mcpServers: protoKey });
    expect(rejected.success).toBe(false);
    expect(Object.getPrototypeOf(protoKey)).toBe(Object.prototype);
  });

  it('accepts and preserves nested JSON host overrides on both connection cores', () => {
    const overrides = {
      opencode: { enabled: false, native: { labels: ['one', 2, null], flags: { strict: true } } },
      pi: { timeout: 5000, native: { weights: [1, 2.5] } },
    };
    for (const core of [{ url: 'https://mcp.example.test/api' }, { command: 'example-mcp', args: ['serve'] }]) {
      const input = {
        ...CONFIG_V1_DEFAULTS,
        mcpServers: { ...CONFIG_V1_DEFAULTS.mcpServers, custom: { ...core, ...overrides } },
      };
      expect(configV1Schema.parse(input).mcpServers.custom).toEqual({ ...core, ...overrides });
      expect(configContractValidator()(input)).toBe(true);
    }
  });

  it.each([
    ['opencode', OPENCODE_MCP_OVERRIDE_PROTECTED_KEYS],
    ['pi', PI_MCP_OVERRIDE_PROTECTED_KEYS],
  ] as const)('rejects every adapter-owned %s override key at its exact path', (host, protectedKeys) => {
    for (const key of protectedKeys) {
      const input = {
        ...CONFIG_V1_DEFAULTS,
        mcpServers: {
          ...CONFIG_V1_DEFAULTS.mcpServers,
          custom: { url: 'https://mcp.example.test', [host]: { [key]: 'replacement' } },
        },
      };
      const result = configV1Schema.safeParse(input);
      expect(result.success).toBe(false);
      expect(validationPaths(input)).toEqual([`mcpServers.custom.${host}.${key}`]);
      expect(configContractValidator()(input)).toBe(false);
    }
  });

  it.each([
    ['undefined', undefined],
    ['non-finite number', Number.POSITIVE_INFINITY],
    ['date object', new Date('2026-08-30T00:00:00Z')],
    ['function', () => undefined],
    ['bigint', 1n],
  ])('rejects non-JSON host override value %s', (_label, value) => {
    const input = {
      ...CONFIG_V1_DEFAULTS,
      mcpServers: {
        ...CONFIG_V1_DEFAULTS.mcpServers,
        custom: { command: 'example-mcp', opencode: { native: value } },
      },
    };
    const result = configV1Schema.safeParse(input);
    expect(result.success).toBe(false);
    expect(validationPaths(input)).toEqual(['mcpServers.custom.opencode.native']);
  });

  it('rejects cyclic host overrides without recursing indefinitely', () => {
    const override: Record<string, unknown> = {};
    override.self = override;
    const input = {
      ...CONFIG_V1_DEFAULTS,
      mcpServers: {
        ...CONFIG_V1_DEFAULTS.mcpServers,
        custom: { command: 'example-mcp', opencode: override },
      },
    };
    expect(validationPaths(input)).toEqual(['mcpServers.custom.opencode.self']);
  });

  it('rejects control characters in nested host override setting names', () => {
    const input = {
      ...CONFIG_V1_DEFAULTS,
      mcpServers: {
        ...CONFIG_V1_DEFAULTS.mcpServers,
        custom: { command: 'example-mcp', pi: { native: { 'bad\nkey': true } } },
      },
    };
    expect(configV1Schema.safeParse(input).success).toBe(false);
    expect(configContractValidator()(input)).toBe(false);
  });

  it('rejects blank commands and invalid URL ports in runtime and portable contracts', () => {
    for (const server of [
      { command: '   ' },
      { url: 'https://mcp.example.test:0/api' },
      { url: 'https://mcp.example.test:65536/api' },
    ]) {
      const invalid = { ...CONFIG_V1_DEFAULTS, mcpServers: { ...CONFIG_V1_DEFAULTS.mcpServers, custom: server } };
      expect(configV1Schema.safeParse(invalid).success).toBe(false);
      expect(configContractValidator()(invalid)).toBe(false);
    }
  });

  it('keeps runtime and portable cross-field constraints aligned', () => {
    const invalid = {
      ...CONFIG_V1_DEFAULTS,
      skills: {
        ...CONFIG_V1_DEFAULTS.skills,
        caveman: { ...CONFIG_V1_DEFAULTS.skills.caveman, enabled: false },
        memory: { ...CONFIG_V1_DEFAULTS.skills.memory, enabled: true },
      },
    };
    expect(configV1Schema.safeParse(invalid).success).toBe(false);
    expect(configContractValidator()(invalid)).toBe(false);
  });

  it('allows workspaces only for enabled Git CVS', () => {
    const enabled = {
      ...CONFIG_V1_DEFAULTS,
      skills: {
        ...CONFIG_V1_DEFAULTS.skills,
        cvs: { ...CONFIG_V1_DEFAULTS.skills.cvs, workspaces: true },
      },
    };
    expect(configV1Schema.safeParse(enabled).success).toBe(true);

    for (const cvs of [
      { ...enabled.skills.cvs, enabled: false },
      { ...enabled.skills.cvs, local: 'jj' as const },
    ]) {
      const invalid = { ...enabled, skills: { ...enabled.skills, cvs } };
      expect(configV1Schema.safeParse(invalid).success).toBe(false);
      expect(validationPaths(invalid)).toEqual(['skills.cvs.workspaces']);
    }
  });

  it('treats Bitbucket MCP names as references to generic declarations', () => {
    const provider = {
      type: 'bitbucket',
      tools: 'git',
      url: 'https://bitbucket.org',
      token_env: 'BITBUCKET_TOKEN',
    } as const;
    const withoutReference = {
      ...CONFIG_V1_DEFAULTS,
      skills: {
        ...CONFIG_V1_DEFAULTS.skills,
        cvs: { ...CONFIG_V1_DEFAULTS.skills.cvs, provider },
      },
    };
    expect(configV1Schema.safeParse(withoutReference).success).toBe(true);
    expect(configContractValidator()(withoutReference)).toBe(true);

    const valid = {
      ...withoutReference,
      mcpServers: { bitbucket: { command: 'operator-bitbucket-mcp' } },
      skills: {
        ...withoutReference.skills,
        cvs: { ...withoutReference.skills.cvs, provider: { ...provider, mcpName: 'bitbucket' } },
      },
    };
    expect(configV1Schema.safeParse(valid).success).toBe(true);
    expect(configContractValidator()(valid)).toBe(true);
  });

  it('requires the canonical web declaration when web retrieval is enabled', () => {
    const invalid = {
      ...CONFIG_V1_DEFAULTS,
      mcpServers: {},
      skills: {
        ...CONFIG_V1_DEFAULTS.skills,
        cvs: { ...CONFIG_V1_DEFAULTS.skills.cvs, enabled: false },
        webRetrieval: { enabled: true, mcpName: 'sdlc_web_crawl' },
      },
    };

    expect(configV1Schema.safeParse(invalid).success).toBe(false);
  });

  it.each(['Bearer {env:}', 'Bearer ${TOKEN}', 'Bearer {env:lower}', 'safe\nInjected: value', '{literal}'])(
    'rejects malformed or unsafe header template %s',
    (header) => {
      const invalid = {
        ...CONFIG_V1_DEFAULTS,
        mcpServers: {
          ...CONFIG_V1_DEFAULTS.mcpServers,
          custom: { url: 'https://mcp.example.test', headers: { Authorization: header } },
        },
      };
      expect(configV1Schema.safeParse(invalid).success).toBe(false);
      expect(configContractValidator()(invalid)).toBe(false);
    },
  );

  it('generates deterministic artifacts and reports stale files without rewriting them', async () => {
    expect(await renderContracts()).toEqual(await renderContracts());
    const root = mkdtempSync(join(tmpdir(), 'harnessctl-contracts-'));
    const npmRoot = join(root, 'npm');
    const pythonRoot = join(root, 'python');
    await generateContracts({ npmRoot, pythonRoot });
    await expect(generateContracts({ check: true, npmRoot, pythonRoot })).resolves.toBeUndefined();

    const defaultsPath = join(npmRoot, 'config-v1.defaults.json');
    writeFileSync(defaultsPath, '{}\n', 'utf8');
    await expect(generateContracts({ check: true, npmRoot, pythonRoot })).rejects.toThrow(/config-v1\.defaults\.json/u);
    expect(readFileSync(defaultsPath, 'utf8')).toBe('{}\n');
  });

  it('fails generation for unannotated Zod refinements', () => {
    expect(() => toPortableJsonSchema(z.string().refine(() => true))).toThrow(/Unsupported Zod refinement/u);
    expect(() => toPortableJsonSchema(z.object({ native: z.date() }))).toThrow(/cannot be represented/u);
  });

  it('preserves runtime cross-field refinements in the generated schema', () => {
    expect(toPortableJsonSchema(configV1Schema)['x-harnessctl-config-refinements']).toEqual([
      'workspace-requires-enabled-git',
      'enabled-mcp-references-exist',
    ]);
  });

  it('ships matching source fingerprints in npm and Python layouts', () => {
    const fingerprints = JSON.parse(
      readFileSync(join(packageRoot, 'contracts/config-v1.fingerprints.json'), 'utf8'),
    ) as Fingerprints;
    expect(fingerprints).toMatchObject({ version: 1, algorithm: 'sha256' });

    for (const name of ['config-v1.schema.json', 'config-v1.defaults.json'] as const) {
      const npmPath = require.resolve(`@harnessctl/generic-tools/contracts/${name}`);
      const npmContent = readFileSync(npmPath, 'utf8');
      const pythonContent = readFileSync(join(pythonContractsRoot, name), 'utf8');
      expect(pythonContent).toBe(npmContent);
      expect(sha256(npmContent)).toBe(fingerprints.artifacts[name]);
    }
    expect(readFileSync(join(pythonContractsRoot, 'config-v1.fingerprints.json'), 'utf8')).toBe(
      readFileSync(join(packageRoot, 'contracts/config-v1.fingerprints.json'), 'utf8'),
    );
  });

  it('includes only Config v1 and independent memory v1 artifacts in the npm package', () => {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    const [packed] = JSON.parse(output) as [{ files: Array<{ path: string }> }];
    const paths = new Set(packed.files.map((entry) => entry.path));
    for (const name of [
      'contracts/config-v1.schema.json',
      'contracts/config-v1.defaults.json',
      'contracts/config-v1.fingerprints.json',
      'contracts/memory-record-v1.schema.json',
    ])
      expect(paths).toContain(name);
    expect([...paths].some((path) => /contracts\/config-v[23]\./u.test(path))).toBe(false);
  });
});

interface Fingerprints {
  readonly version: 1;
  readonly algorithm: 'sha256';
  readonly artifacts: Readonly<Record<'config-v1.schema.json' | 'config-v1.defaults.json', string>>;
}

function configContractValidator(): ReturnType<Ajv2020['compile']> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addKeyword('x-harnessctl-config-refinements');
  addFormats(ajv);
  const contract = JSON.parse(readFileSync(join(packageRoot, 'contracts/config-v1.schema.json'), 'utf8')) as object;
  return ajv.compile(contract);
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function validationPaths(input: Record<string, unknown>): readonly string[] {
  try {
    validateConfig(input);
  } catch (error: unknown) {
    if (error instanceof ConfigError) return error.validationPaths;
    throw error;
  }
  throw new Error('Expected Config v1 validation to fail.');
}
