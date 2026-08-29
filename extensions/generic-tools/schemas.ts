import * as z from 'zod';

const nonemptyString = z.string().min(1).regex(/\S/, 'must not be blank');
const safeProjectPath = nonemptyString.regex(
  // eslint-disable-next-line no-control-regex -- config paths must reject control characters before prompt rendering
  /^(?!\/)(?![A-Za-z]:)(?!.*[\u0000-\u001F\u007F-\u009F\u2028\u2029])(?!.*\\)(?!.*`)(?!.*\/\/)(?!.*\/$)(?!.*(?:^|\/)\.{1,2}(?:\/|$)).+$/,
  'must stay inside project root',
);

export const FILESYSTEM_ISSUE_TOOLS =
  'issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive';
export const FILESYSTEM_DOCUMENT_TOOLS =
  'document_id,document_create,document_list,document_get,document_update,document_version,document_validate,document_archive,document_restore';
const safeTokenEnvironmentName = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'must be an uppercase environment variable name, not a token value');
const validHttpsPort = '(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])';
const httpsAuthority = `(?:\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::${validHttpsPort})?`;
const httpsSafetyPrefix = '(?![^/\\s]*@)(?!.*[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029`${}])';
const httpsInstanceUrlPattern = new RegExp(`^https://${httpsSafetyPrefix}${httpsAuthority}(?:/[^\\s?#]*)?$`);
const httpsServiceUrlPattern = new RegExp(`^https://${httpsSafetyPrefix}${httpsAuthority}(?:[/?#]\\S*)?$`);
const httpsInstanceUrl = z
  .url()
  .regex(
    httpsInstanceUrlPattern,
    'must be an absolute HTTPS URL without credentials, interpolation, whitespace, backticks, query, or fragment',
  )
  .meta({ format: 'uri' });

export const cvsLocalSchema = z.enum(['git', 'jj']);
export const remoteProviderSchema = z.enum(['github', 'gitlab', 'gitea', 'forgejo', 'bitbucket']);
export const mcpOutputLimitModeSchema = z.enum(['bounded-guidance', 'hard']);
const mcpNamePattern = /^(?=.{1,64}$)[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const mcpNameSchema = z
  .string()
  .regex(
    mcpNamePattern,
    'must be 1-64 lowercase ASCII letters, digits, underscores, or hyphens and start and end alphanumeric',
  );
const environmentReferenceSchema = safeTokenEnvironmentName.meta({
  description: 'Name of an environment variable whose value is resolved by the host adapter.',
});
const environmentNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be an environment variable name');
const headerNameSchema = z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, 'must be an HTTP header name');
const headerTemplateSchema = z.string().regex(
  // eslint-disable-next-line no-control-regex -- HTTP values must not permit header injection
  /^(?:[^\u0000-\u001F\u007F-\u009F\u2028\u2029{}]|\{env:[A-Z][A-Z0-9_]*\})*$/,
  'must contain only static text and well-formed {env:NAME} references without control characters',
);
const printableStringSchema = z.string().regex(
  // eslint-disable-next-line no-control-regex -- projected process values must remain printable
  /^[^\u0000-\u001F\u007F-\u009F\u2028\u2029]*$/,
  'must not contain control characters',
);
const jsonObjectKeySchema = z.string().regex(
  // eslint-disable-next-line no-control-regex -- host-native setting names must be safe JSON object keys
  /^[^\u0000-\u001F\u007F-\u009F\u2028\u2029]*$/,
  'must not contain control characters',
);
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonObjectKeySchema, jsonValueSchema),
  ]),
);
const forbiddenOverrideField = z.never().optional();

function hostOverrideSchema(protectedKeys: readonly string[]) {
  const protectedShape = Object.fromEntries(protectedKeys.map((key) => [key, forbiddenOverrideField]));
  return z.record(jsonObjectKeySchema, jsonValueSchema).and(z.object(protectedShape).catchall(jsonValueSchema)).meta({
    description: 'JSON-compatible host-native settings that do not replace adapter-owned connection fields.',
  });
}

export const OPENCODE_MCP_OVERRIDE_PROTECTED_KEYS = [
  'type',
  'url',
  'command',
  'headers',
  'environment',
  'cwd',
  'auth',
  'oauth',
] as const;
export const PI_MCP_OVERRIDE_PROTECTED_KEYS = [
  'url',
  'command',
  'args',
  'headers',
  'env',
  'cwd',
  'lifecycle',
  'auth',
  'oauth',
] as const;
const opencodeMcpOverrideSchema = hostOverrideSchema(OPENCODE_MCP_OVERRIDE_PROTECTED_KEYS);
const piMcpOverrideSchema = hostOverrideSchema(PI_MCP_OVERRIDE_PROTECTED_KEYS);
const hostOverrideFields = {
  opencode: opencodeMcpOverrideSchema.optional(),
  pi: piMcpOverrideSchema.optional(),
};
const httpsServiceUrlSchema = z
  .url()
  .regex(
    httpsServiceUrlPattern,
    'must be an absolute HTTPS URL without credentials, interpolation, whitespace, backticks, or control characters',
  )
  .meta({ format: 'uri' });

export const genericMcpServerSchema = z.union([
  z
    .object({
      url: httpsServiceUrlSchema,
      headers: z.record(headerNameSchema, headerTemplateSchema).optional(),
      ...hostOverrideFields,
    })
    .strict(),
  z
    .object({
      command: printableStringSchema.min(1).regex(/\S/, 'must not be blank'),
      args: z.array(printableStringSchema).optional(),
      environment: z.record(environmentNameSchema, environmentReferenceSchema).optional(),
      cwd: safeProjectPath.optional(),
      ...hostOverrideFields,
    })
    .strict(),
]);

const mcpServersInputSchema = z
  .unknown()
  .superRefine((value, context) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(value)) {
      const result = mcpNameSchema.safeParse(key);
      if (!result.success)
        context.addIssue({
          code: 'custom',
          path: [key],
          message: result.error.issues[0]?.message ?? 'must be a valid MCP server name',
        });
    }
  })
  .meta({ 'x-harnessctl-zod-refinements': ['mcp-server-own-key-validation'] });
const mcpServersSchema = mcpServersInputSchema.pipe(z.object({}).catchall(genericMcpServerSchema)).meta({
  description:
    'Explicit MCP compiler registry. Each map key is the required server identity and each value must contain exactly one portable connection core: url or command.',
  propertyNames: { type: 'string', pattern: mcpNamePattern.source },
});

const PROVIDER_CONTRACTS = {
  github: { tools: 'gh', url: z.literal('https://github.com') },
  gitlab: { tools: 'glab', url: z.literal('https://gitlab.com') },
  gitea: { tools: 'tea', url: httpsInstanceUrl },
  forgejo: { tools: 'forgejo-cli', url: httpsInstanceUrl },
  bitbucket: { tools: 'git', url: z.literal('https://bitbucket.org') },
} as const;
type Provider = keyof typeof PROVIDER_CONTRACTS;

function remoteFields(provider: Provider) {
  const contract = PROVIDER_CONTRACTS[provider];
  return {
    url: contract.url,
    token_env: safeTokenEnvironmentName,
  };
}

function gitProviderSchema(provider: Provider) {
  return z
    .object({
      type: z.literal(provider),
      tools: z.literal(PROVIDER_CONTRACTS[provider].tools),
      mcpName: mcpNameSchema.optional(),
      ...remoteFields(provider),
    })
    .strict();
}

function filesystemProviderSchema(tools: string) {
  return z
    .object({ type: z.literal('filesystem'), tools: z.literal(tools), mcpName: mcpNameSchema.optional() })
    .strict();
}
export const gitProviderConfigSchema = z.discriminatedUnion('type', [
  gitProviderSchema('github'),
  gitProviderSchema('gitlab'),
  gitProviderSchema('gitea'),
  gitProviderSchema('forgejo'),
  gitProviderSchema('bitbucket'),
]);
export const providerConfigSchema = z.union([
  filesystemProviderSchema(FILESYSTEM_ISSUE_TOOLS),
  filesystemProviderSchema(FILESYSTEM_DOCUMENT_TOOLS),
  gitProviderConfigSchema,
]);
export const remoteServiceSchema = gitProviderConfigSchema;
const genericSkillFields = { enabled: z.boolean() };
const genericRepositorySkillFields = { ...genericSkillFields, root: safeProjectPath };
const issuesSchema = z
  .object({
    ...genericRepositorySkillFields,
    prefix: z.string().regex(/^[A-Za-z0-9_-]*$/, 'must contain only ASCII letters, digits, underscores, or hyphens'),
    provider: z.union([filesystemProviderSchema(FILESYSTEM_ISSUE_TOOLS), gitProviderConfigSchema]),
  })
  .strict();
const documentsSchema = z
  .object({
    ...genericRepositorySkillFields,
    prefix: z.literal('doc-'),
    provider: z.union([filesystemProviderSchema(FILESYSTEM_DOCUMENT_TOOLS), gitProviderConfigSchema]),
  })
  .strict();

const cavemanSchema = z.object({ enabled: z.boolean(), mode: z.enum(['strict', 'balanced']) }).strict();
const memorySchema = z
  .object({
    enabled: z.boolean(),
    root: safeProjectPath,
    backend: z.literal('repository'),
    namespace: z
      .object({
        organization_id: nonemptyString,
        project_id: nonemptyString,
        default_topic: nonemptyString,
      })
      .strict(),
    retrieval: z
      .object({
        limit: z.int().min(1).max(100),
        max_chars: z.int().min(256).max(100_000),
        include_superseded: z.boolean(),
      })
      .strict(),
  })
  .strict();

const memoryRequiresCavemanContract = {
  if: {
    properties: {
      skills: {
        type: 'object',
        properties: {
          memory: { type: 'object', properties: { enabled: { const: true } }, required: ['enabled'] },
        },
        required: ['memory'],
      },
    },
    required: ['skills'],
  },
  then: {
    properties: {
      skills: {
        type: 'object',
        properties: {
          caveman: { type: 'object', properties: { enabled: { const: true } }, required: ['enabled'] },
        },
        required: ['caveman'],
      },
    },
    required: ['skills'],
  },
} as const;

export const configV1Schema = z
  .object({
    version: z.literal(1),
    paths: z
      .object({
        root: safeProjectPath,
        tasks: safeProjectPath,
        reports: safeProjectPath,
      })
      .strict(),
    workflow: z
      .object({
        default_task_type: z.enum(['initiative', 'epic', 'story', 'task', 'bug']),
      })
      .strict(),
    mcp: z.object({ output_limit_mode: mcpOutputLimitModeSchema }).strict(),
    mcpServers: mcpServersSchema,
    skills: z
      .object({
        issues: issuesSchema,
        documents: documentsSchema,
        cvs: z.object({ enabled: z.boolean(), local: cvsLocalSchema, provider: gitProviderConfigSchema }).strict(),
        caveman: cavemanSchema,
        tdd: z.object(genericSkillFields).strict(),
        codeIndex: z.object({ enabled: z.boolean(), mcpName: mcpNameSchema }).strict(),
        memory: memorySchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.skills.memory.enabled && !config.skills.caveman.enabled)
      context.addIssue({
        code: 'custom',
        path: ['skills', 'caveman', 'enabled'],
        message: 'skills.memory.enabled requires skills.caveman.enabled to be true',
      });
    const references: Array<{ readonly enabled: boolean; readonly mcpName?: string; readonly path: string[] }> = [
      {
        enabled: config.skills.cvs.enabled,
        mcpName: config.skills.cvs.provider.mcpName,
        path: ['skills', 'cvs', 'provider', 'mcpName'],
      },
      {
        enabled: config.skills.issues.enabled && config.skills.issues.provider.type !== 'filesystem',
        mcpName: config.skills.issues.provider.mcpName,
        path: ['skills', 'issues', 'provider', 'mcpName'],
      },
      {
        enabled: config.skills.documents.enabled && config.skills.documents.provider.type !== 'filesystem',
        mcpName: config.skills.documents.provider.mcpName,
        path: ['skills', 'documents', 'provider', 'mcpName'],
      },
      {
        enabled: config.skills.codeIndex.enabled,
        mcpName: config.skills.codeIndex.mcpName,
        path: ['skills', 'codeIndex', 'mcpName'],
      },
    ];
    for (const reference of references) {
      if (
        reference.enabled &&
        reference.mcpName !== undefined &&
        !Object.prototype.hasOwnProperty.call(config.mcpServers, reference.mcpName)
      )
        context.addIssue({
          code: 'custom',
          path: reference.path,
          message: `references missing mcpServers.${reference.mcpName}`,
        });
    }
  })
  .meta({
    description: 'Capability-oriented harnessctl project configuration v1.',
    allOf: [memoryRequiresCavemanContract],
    'x-harnessctl-zod-refinements': ['memory-requires-caveman', 'enabled-mcp-references-exist'],
    'x-harnessctl-config-refinements': ['enabled-mcp-references-exist'],
  });

export type ConfigV1 = z.infer<typeof configV1Schema>;

export const CONFIG_V1_DEFAULTS = {
  version: 1,
  paths: { root: '.harnessctl', tasks: '.harnessctl/tasks', reports: '.harnessctl/reports' },
  workflow: { default_task_type: 'bug' },
  mcp: { output_limit_mode: 'bounded-guidance' },
  mcpServers: {
    sdlc_cvs_github: {
      url: 'https://api.githubcopilot.com/mcp/',
      headers: {
        Authorization: 'Bearer {env:GH_TOKEN}',
        'X-MCP-Toolsets': 'repos,issues,pull_requests,actions,git',
      },
    },
    sdlc_code_index: { command: 'cgc', args: ['mcp', 'start'] },
    webcrawl_searchable: {
      command: 'npx',
      args: ['-y', '@dragoscirjan/mcp-searchable@latest'],
    },
  },
  skills: {
    issues: {
      enabled: true,
      root: '.harnessctl/issues',
      prefix: 'hrn-',
      provider: { type: 'filesystem', tools: FILESYSTEM_ISSUE_TOOLS },
    },
    documents: {
      enabled: true,
      root: '.harnessctl/documents',
      prefix: 'doc-',
      provider: { type: 'filesystem', tools: FILESYSTEM_DOCUMENT_TOOLS },
    },
    cvs: {
      enabled: true,
      local: 'git',
      provider: {
        type: 'github',
        tools: 'gh',
        mcpName: 'sdlc_cvs_github',
        url: 'https://github.com',
        token_env: 'GH_TOKEN',
      },
    },
    caveman: { enabled: true, mode: 'strict' },
    tdd: { enabled: false },
    codeIndex: { enabled: false, mcpName: 'sdlc_code_index' },
    memory: {
      enabled: false,
      root: '.harnessctl/memory',
      backend: 'repository',
      namespace: { organization_id: 'local', project_id: 'project', default_topic: 'general' },
      retrieval: { limit: 8, max_chars: 12_000, include_superseded: false },
    },
  },
} as const satisfies ConfigV1;
export type CvsLocal = z.infer<typeof cvsLocalSchema>;
export type RemoteProvider = z.infer<typeof remoteProviderSchema>;
export type RemoteService = z.infer<typeof remoteServiceSchema>;
export type McpOutputLimitMode = z.infer<typeof mcpOutputLimitModeSchema>;

export const memoryTypeSchema = z.enum(['semantic', 'episodic', 'procedural']);
export const recordTypeSchema = z.enum(['fact', 'decision', 'event', 'lesson']);
export const sourceKindSchema = z.enum(['artifact', 'user-confirmed', 'discussion', 'tool-observation']);
export const confidenceSchema = z.enum(['confirmed', 'verified']);

const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const memorySourceSchema = z
  .object({
    kind: sourceKindSchema,
    ref: z.string().nullable(),
    revision: z.string().nullable(),
  })
  .strict();

export const memoryRecordSchema = z
  .object({
    schema_version: z.literal(1),
    id: ulidSchema,
    memory_type: memoryTypeSchema,
    record_type: recordTypeSchema,
    organization_id: nonemptyString,
    project_id: nonemptyString,
    topic: nonemptyString,
    summary: z.string().min(1).max(1000),
    details: z.string().max(12_000).nullable(),
    source: memorySourceSchema,
    created_at: z.iso.datetime(),
    created_by: nonemptyString,
    confidence: confidenceSchema,
    status: z.literal('active'),
    supersedes: z.array(ulidSchema).meta({ uniqueItems: true }),
    tags: z.array(nonemptyString).meta({ uniqueItems: true }),
  })
  .strict()
  .superRefine((record, context) => {
    const validPair =
      (record.memory_type === 'semantic' && record.record_type === 'fact') ||
      (record.memory_type === 'episodic' && ['decision', 'event'].includes(record.record_type)) ||
      (record.memory_type === 'procedural' && record.record_type === 'lesson');
    if (!validPair)
      context.addIssue({
        code: 'custom',
        path: ['record_type'],
        message: `is incompatible with memory_type ${record.memory_type}`,
      });
    if (record.confidence === 'verified' && !['artifact', 'tool-observation'].includes(record.source.kind))
      context.addIssue({
        code: 'custom',
        path: ['source', 'kind'],
        message: 'must be artifact or tool-observation when confidence is verified',
      });
    if (record.supersedes.includes(record.id))
      context.addIssue({ code: 'custom', path: ['supersedes'], message: 'must not contain record id' });
    addDuplicateIssue(record.supersedes, ['supersedes'], context);
    addDuplicateIssue(record.tags, ['tags'], context);
  })
  .meta({
    description:
      'Classification and verified-source combinations are constrained below. Self-supersession remains runtime-only because standard JSON Schema cannot compare an array item with a sibling property.',
    allOf: [
      {
        if: { properties: { memory_type: { const: 'semantic' } }, required: ['memory_type'] },
        then: { properties: { record_type: { const: 'fact' } } },
      },
      {
        if: { properties: { memory_type: { const: 'episodic' } }, required: ['memory_type'] },
        then: { properties: { record_type: { enum: ['decision', 'event'] } } },
      },
      {
        if: { properties: { memory_type: { const: 'procedural' } }, required: ['memory_type'] },
        then: { properties: { record_type: { const: 'lesson' } } },
      },
      {
        if: { properties: { confidence: { const: 'verified' } }, required: ['confidence'] },
        then: {
          properties: {
            source: {
              type: 'object',
              properties: { kind: { enum: ['artifact', 'tool-observation'] } },
              required: ['kind'],
            },
          },
        },
      },
    ],
    'x-harnessctl-zod-refinements': [
      'memory-type-record-type-compatibility',
      'verified-source-kind',
      'self-supersession-runtime-only',
      'array-uniqueness',
    ],
  });

export const memoryTombstoneSchema = z
  .object({
    schema_version: z.literal(1),
    id: ulidSchema,
    organization_id: nonemptyString,
    project_id: nonemptyString,
    target_id: ulidSchema,
    reason: z.string().min(1).max(1000),
    source: memorySourceSchema,
    created_at: z.iso.datetime(),
    created_by: nonemptyString,
  })
  .strict();

export const memoryDocumentSchema = z.union([memoryRecordSchema, memoryTombstoneSchema]);

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type RecordType = z.infer<typeof recordTypeSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryTombstone = z.infer<typeof memoryTombstoneSchema>;

export function formatSchemaError(error: z.ZodError): string {
  return z.prettifyError(error);
}

function addDuplicateIssue(values: string[], path: string[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length)
    context.addIssue({ code: 'custom', path, message: 'must contain unique values' });
}
