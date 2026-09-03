import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import * as z from 'zod';
import {
  CONFIG_V1_DEFAULTS,
  configV1Schema,
  memoryDocumentSchema,
  OPENCODE_MCP_OVERRIDE_PROTECTED_KEYS,
  PI_MCP_OVERRIDE_PROTECTED_KEYS,
} from './schemas.js';

type JsonDocument = Record<string, unknown>;

interface GeneratedContract {
  readonly name: string;
  readonly content: string;
  readonly python: boolean;
}

interface GenerateContractsOptions {
  readonly check?: boolean;
  readonly npmRoot?: string;
  readonly pythonRoot?: string;
}

const packageRoot = dirname(fileURLToPath(import.meta.url));
const defaultNpmRoot = join(packageRoot, 'contracts');
const defaultPythonRoot = resolve(packageRoot, '../../src/harnessctl/contracts');
const configRuntimeRefinements = ['workspace-requires-enabled-git', 'enabled-mcp-references-exist'] as const;

const schemaContracts = [
  {
    name: 'config-v1.schema.json',
    schema: configV1Schema,
    id: 'https://harnessctl.dev/contracts/config-v1.schema.json',
    title: 'harnessctl project configuration v1',
    python: true,
  },
  {
    name: 'memory-record-v1.schema.json',
    schema: memoryDocumentSchema,
    id: 'https://harnessctl.dev/contracts/memory-record-v1.schema.json',
    title: 'harnessctl portable memory record v1',
    python: false,
  },
] as const;

export function toPortableJsonSchema(schema: z.ZodType): JsonDocument {
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
    override: ({ zodSchema, jsonSchema, path }) => {
      const checks = zodSchema._zod.def.checks ?? [];
      const hasCustomCheck = checks.some((check) => check._zod.def.check === 'custom');
      const metadata = jsonSchema as JsonDocument;
      const declaredRefinements = metadata['x-harnessctl-zod-refinements'];
      delete metadata['x-harnessctl-zod-refinements'];
      if (hasCustomCheck && !Array.isArray(declaredRefinements)) {
        const location = path.length === 0 ? '<root>' : path.join('.');
        throw new Error(`Unsupported Zod refinement at ${location}; add an explicit portable contract annotation.`);
      }
    },
  }) as JsonDocument;
}

export async function renderContracts(): Promise<readonly GeneratedContract[]> {
  const generated = await Promise.all(
    schemaContracts.map(async (contract) => {
      const portableSchema = toPortableJsonSchema(contract.schema);
      if (contract.name === 'config-v1.schema.json') {
        assertConfigRuntimeRefinements(portableSchema);
        assertMcpHostOverrideContracts(portableSchema);
      }
      const document = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: contract.id,
        title: contract.title,
        ...portableSchema,
      };
      return { name: contract.name, content: await serialize(document), python: contract.python };
    }),
  );
  const defaults = configV1Schema.parse(structuredClone(CONFIG_V1_DEFAULTS));
  const defaultsContract = {
    name: 'config-v1.defaults.json',
    content: await serialize(defaults),
    python: true,
  } as const;
  const configSchemaContract = generated.find((contract) => contract.name === 'config-v1.schema.json');
  if (configSchemaContract === undefined) throw new Error('Config v1 schema contract was not rendered.');
  const fingerprints = {
    version: 1,
    algorithm: 'sha256',
    artifacts: {
      [configSchemaContract.name]: fingerprint(configSchemaContract.content),
      [defaultsContract.name]: fingerprint(defaultsContract.content),
    },
  };
  return [
    ...generated,
    defaultsContract,
    { name: 'config-v1.fingerprints.json', content: await serialize(fingerprints), python: true },
  ];
}

function assertConfigRuntimeRefinements(schema: JsonDocument): void {
  const refinements = schema['x-harnessctl-config-refinements'];
  if (
    !Array.isArray(refinements) ||
    refinements.length !== configRuntimeRefinements.length ||
    refinements.some((value, index) => value !== configRuntimeRefinements[index])
  )
    throw new Error('Config v1 runtime refinements are missing or unsupported; refusing contract generation.');
}

function assertMcpHostOverrideContracts(schema: JsonDocument): void {
  const rootProperties = objectAt(schema, 'properties');
  const mcpServers = objectAt(rootProperties, 'mcpServers');
  const declarations = objectAt(mcpServers, 'additionalProperties');
  const variants = declarations.anyOf;
  if (!Array.isArray(variants) || variants.length !== 2)
    throw new Error('Config v1 MCP URL/command union is not representable; refusing contract generation.');

  for (const [host, protectedKeys] of [
    ['opencode', OPENCODE_MCP_OVERRIDE_PROTECTED_KEYS],
    ['pi', PI_MCP_OVERRIDE_PROTECTED_KEYS],
  ] as const) {
    for (const [index, variantValue] of variants.entries()) {
      const variant = expectObject(variantValue, `mcpServers variant ${index}`);
      const override = objectAt(objectAt(variant, 'properties'), host);
      const components = override.allOf;
      if (!Array.isArray(components))
        throw new Error(`Config v1 ${host} override JSON semantics are not representable.`);
      const ownership = components
        .map((component, componentIndex) => expectObject(component, `${host}.allOf.${componentIndex}`))
        .find((component) => {
          const properties = component.properties;
          return isObject(properties) && protectedKeys.every((key) => key in properties);
        });
      if (ownership === undefined)
        throw new Error(`Config v1 ${host} protected keys are missing from the generated contract.`);
      const properties = objectAt(ownership, 'properties');
      for (const key of protectedKeys) {
        const rejection = objectAt(properties, key);
        const notSchema = rejection.not;
        if (
          notSchema === null ||
          typeof notSchema !== 'object' ||
          Array.isArray(notSchema) ||
          Object.keys(notSchema).length
        )
          throw new Error(`Config v1 ${host}.${key} protection is not representable.`);
      }
    }
  }
}

function objectAt(value: JsonDocument, key: string): JsonDocument {
  return expectObject(value[key], key);
}

function expectObject(value: unknown, location: string): JsonDocument {
  if (!isObject(value)) throw new Error(`Generated Config v1 contract is missing object ${location}.`);
  return value;
}

function isObject(value: unknown): value is JsonDocument {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function generateContracts(options: GenerateContractsOptions = {}): Promise<void> {
  const npmRoot = options.npmRoot ?? defaultNpmRoot;
  const pythonRoot = options.pythonRoot ?? defaultPythonRoot;
  const stale: string[] = [];

  for (const contract of await renderContracts()) {
    for (const root of contract.python ? [npmRoot, pythonRoot] : [npmRoot]) {
      const path = join(root, contract.name);
      if (options.check) {
        if (!existsSync(path) || readFileSync(path, 'utf8') !== contract.content) stale.push(path);
        continue;
      }
      mkdirSync(root, { recursive: true });
      writeFileSync(path, contract.content, 'utf8');
    }
  }

  if (stale.length > 0)
    throw new Error(`Generated contracts are stale or missing:\n${stale.map((path) => `- ${path}`).join('\n')}`);
}

async function serialize(value: unknown): Promise<string> {
  const config = (await resolveConfig(packageRoot)) ?? {};
  return format(JSON.stringify(value, null, 2), { ...config, parser: 'json' });
}

function fingerprint(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--check')) throw new Error(`Unknown argument: ${args.join(' ')}`);
    await generateContracts({ check: args.includes('--check') });
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
