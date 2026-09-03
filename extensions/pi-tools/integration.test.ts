import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  resolveCliModel,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import { createConfig, getIssue, readConfig } from '@harnessctl/generic-tools';
import { describe, expect, it } from 'vitest';
import {
  canonicalIssueFilename,
  encodeCanonicalIssue,
  type CanonicalIssueDocument,
} from '../generic-tools/issues-contract.js';

const piModel = process.env.PI_TEST_MODEL;
const pluginPath = fileURLToPath(new URL('./index.ts', import.meta.url));
const piTestBaseUrl = process.env.PI_TEST_BASE_URL;
const piTestApiKey = process.env.PI_TEST_API_KEY;
const piIntegrationTimeout = Number(process.env.PI_TEST_TIMEOUT_MS ?? 300_000);

describe.skipIf(!piModel)('Pi SDK integration', () => {
  it(
    'uses the issue_id tool to identify every configured issue ID',
    async () => {
      const cwd = temporaryDirectory('harnessctl-pi-issue-id-');

      try {
        createConfig(cwd);
        writeFileSync(
          join(cwd, '.harnessctl/config.yaml'),
          'version: 1\nskills:\n  issues:\n    prefix: TSK-\n',
          'utf8',
        );
        const result = await promptPi(
          cwd,
          'Using the issue_id tool, detect every issue ID in this message: TSK-12345 and TSK-67890. Return the JSON array from the tool.',
          ['issue_id'],
        );

        expect(result.toolNames).toEqual(['issue_id']);
        expect(result.text).toContain('TSK-12345');
        expect(result.text).toContain('TSK-67890');
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    piIntegrationTimeout,
  );

  it(
    'uses the config_create tool to create the project configuration',
    async () => {
      const cwd = temporaryDirectory('harnessctl-pi-config-create-');

      try {
        const result = await promptPi(
          cwd,
          'Use the config_create tool to create the project configuration. After it succeeds, reply with only the word created.',
          ['config_create'],
        );

        expect(result.toolNames).toEqual(['config_create']);
        expect(existsSync(join(cwd, '.harnessctl/config.yaml'))).toBe(true);
        expect(readConfig(cwd)).toMatchObject({
          version: 1,
          paths: { tasks: '.harnessctl/tasks' },
        });
        expect(result.text.toLowerCase()).toContain('created');
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    piIntegrationTimeout,
  );

  it(
    'uses the config_get tool to read a dotted configuration path',
    async () => {
      const cwd = temporaryDirectory('harnessctl-pi-config-get-');

      try {
        createConfig(cwd);
        const result = await promptPi(
          cwd,
          'Use the config_get tool with the path paths.tasks. Return only the exact value returned by the tool.',
          ['config_get'],
        );

        expect(result.toolNames).toEqual(['config_get']);
        expect(result.text).toMatch(/\.harnessctl\/tasks/);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    piIntegrationTimeout,
  );

  it(
    'uses the issue_create tool to create a local issue',
    async () => {
      const cwd = temporaryDirectory('harnessctl-pi-issue-create-');

      try {
        createConfig(cwd);
        const result = await promptPi(
          cwd,
          'Use the issue_create tool to create a task titled "Document integration coverage". After it succeeds, reply with only the created issue ID.',
          ['issue_create'],
        );

        expect(result.toolNames).toContain('issue_create');
        const [filename] = readdirSync(join(cwd, '.harnessctl/issues'));
        const id = filename?.match(/^(hrn-[0-9A-HJKMNP-TV-Z]{26})-/u)?.[1];
        expect(id).toMatch(/^hrn-[0-9A-HJKMNP-TV-Z]{26}$/u);
        expect(result.text).toContain(id);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    piIntegrationTimeout,
  );

  it(
    'uses the issue_list tool to list local issues',
    async () => {
      const cwd = temporaryDirectory('harnessctl-pi-issue-list-');

      try {
        writeIssueFixture(cwd, 'hrn-00001', 'First task', 'open');
        writeIssueFixture(cwd, 'hrn-00002', 'Second bug', 'closed', 'bug');
        const result = await promptPi(
          cwd,
          'Use the issue_list tool with the status filter "closed". Return only the matching issue ID.',
          ['issue_list'],
        );

        expect(result.toolNames).toEqual(['issue_list']);
        expect(result.text).toContain('00002');
        expect(result.text).not.toContain('00001');
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    piIntegrationTimeout,
  );

  it(
    'uses workspace_status in a real Git repository with spaces',
    async () => {
      const fixture = writeWorkspaceRepository('harnessctl pi workspace ');

      try {
        const result = await promptPi(
          fixture.root,
          'Use workspace_status exactly once for Epic hrn-00009. Return only the JSON from the tool.',
          ['workspace_status'],
        );

        expect(result.toolNames).toEqual(['workspace_status']);
        expect(parseJsonReply(result.text)).toMatchObject({
          epic_id: 'hrn-00009',
          primary_path: fixture.root,
          state: 'absent',
        });
      } finally {
        rmSync(fixture.container, { recursive: true, force: true });
      }
    },
    piIntegrationTimeout,
  );

  describe('issue lifecycle tools', () => {
    it(
      'reads, updates, transitions, comments, and validates an issue',
      async () => {
        const cwd = temporaryDirectory('harnessctl-pi-lifecycle-');

        try {
          createConfig(cwd);
          writeIssueFixture(cwd, 'hrn-00001', 'Lifecycle task', 'open');
          const result = await promptPi(
            cwd,
            'Use these tools exactly once in order for issue hrn-00001: issue_get, then use its returned revision as expectedRevision for issue_update with title "Updated lifecycle task" and sections JSON {"Summary":"Updated"}, then use the updated revision for issue_transition to done, issue_comment with body "Reviewed" and author "integration", and issue_validate. After all tools succeed, reply with only done.',
            ['issue_get', 'issue_update', 'issue_transition', 'issue_comment', 'issue_validate'],
          );

          expect(result.toolNames).toEqual([
            'issue_get',
            'issue_update',
            'issue_transition',
            'issue_comment',
            'issue_validate',
          ]);
          expect(result.text.trim()).toMatch(/done/i);
          const issue = getIssue(cwd, 'hrn-00001');
          expect(issue.metadata).toMatchObject({ title: 'Updated lifecycle task', status: 'done' });
          expect(issue.body).toContain('## Summary');
          expect(issue.comments).toEqual([expect.objectContaining({ body: 'Reviewed', created_by: 'integration' })]);
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      },
      piIntegrationTimeout,
    );

    it(
      'relates, unrelates, and archives an issue',
      async () => {
        const cwd = temporaryDirectory('harnessctl-pi-relationships-');

        try {
          createConfig(cwd);
          writeIssueFixture(cwd, 'hrn-00001', 'Archive source', 'open');
          writeIssueFixture(cwd, 'hrn-00002', 'Related target', 'open');
          const result = await promptPi(
            cwd,
            'Use these tools exactly once in order: issue_relate with id hrn-00001, relationship blocks, targetId hrn-00002; issue_unrelate with the same arguments; issue_archive with id hrn-00001. After all tools succeed, reply with only archived.',
            ['issue_relate', 'issue_unrelate', 'issue_archive'],
          );

          expect(result.toolNames).toEqual(['issue_relate', 'issue_unrelate', 'issue_archive']);
          expect(result.text.trim()).toMatch(/archived/i);
          const archivedIssue = readIssueFixture(cwd, 'hrn-00001');
          expect(archivedIssue).toContain('Archive source');
          expect(archivedIssue).not.toContain('blocks:');
          expect(getIssue(cwd, 'hrn-00001').location).toBe('archived');
          expect(readIssueFixture(cwd, 'hrn-00002')).toContain('Related target');
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      },
      piIntegrationTimeout,
    );

    it(
      'links an allowed task document to an issue',
      async () => {
        const cwd = temporaryDirectory('harnessctl-pi-document-link-');

        try {
          createConfig(cwd);
          writeIssueFixture(cwd, 'hrn-00001', 'Documented task', 'open');
          mkdirSync(resolve(cwd, '.harnessctl/tasks/00001'), { recursive: true });
          writeFileSync(resolve(cwd, '.harnessctl/tasks/00001/plan.md'), '# Plan\n', 'utf8');
          const result = await promptPi(
            cwd,
            'Use issue_link_document exactly once with id hrn-00001, path .harnessctl/tasks/00001/plan.md, and kind task. After it succeeds, reply with only linked.',
            ['issue_link_document'],
          );

          expect(result.toolNames).toEqual(['issue_link_document']);
          expect(result.text.trim()).toMatch(/linked/i);
          expect(readIssueFixture(cwd, 'hrn-00001')).toContain('.harnessctl/tasks/00001/plan.md');
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      },
      piIntegrationTimeout,
    );
  });
});

async function promptPi(
  cwd: string,
  prompt: string,
  allowedToolNames: string[],
): Promise<{ text: string; toolNames: string[] }> {
  if (!piModel) {
    throw new Error('PI_TEST_MODEL is required for Pi SDK integration tests.');
  }

  const agentDir = temporaryDirectory('harnessctl-pi-agent-');
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;

  try {
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, 'auth.json'),
      modelsPath: null,
      allowModelNetwork: false,
    });
    registerTestProvider(modelRuntime);
    const resolved = resolveCliModel({ cliModel: piModel, modelRuntime });
    if (!resolved.model || resolved.error) {
      throw new Error(resolved.error ?? `Unable to resolve Pi model: ${piModel}`);
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: [pluginPath],
      systemPromptOverride: () => 'Use the requested tools exactly as instructed.',
    });
    await resourceLoader.reload();

    const created = await createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      model: resolved.model,
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
      noTools: 'builtin',
    });
    session = created.session;
    session.setActiveToolsByName(allowedToolNames);
    const toolNames: string[] = [];
    const text: string[] = [];
    let assistantError: string | undefined;

    session.subscribe((event) => {
      if (event.type === 'tool_execution_start') toolNames.push(event.toolName);
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        text.push(event.assistantMessageEvent.delta);
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        assistantError = event.message.errorMessage;
      }
    });
    await session.prompt(prompt);
    if (assistantError) {
      throw new Error(`Pi model request failed after tools [${toolNames.join(', ')}]: ${assistantError}`);
    }
    return { text: text.join(''), toolNames };
  } finally {
    session?.dispose();
    rmSync(agentDir, { recursive: true, force: true });
  }
}

function parseJsonReply(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`assistant response did not contain JSON: ${text}`);
  return JSON.parse(text.slice(start, end + 1));
}

function registerTestProvider(modelRuntime: ModelRuntime): void {
  if (!piModel) return;
  if (!piTestBaseUrl) {
    throw new Error('PI_TEST_BASE_URL is required when running Pi integration tests.');
  }

  const separator = piModel.indexOf('/');
  if (separator <= 0 || separator === piModel.length - 1) {
    throw new Error('PI_TEST_MODEL must use the provider/model-id format.');
  }

  const provider = piModel.slice(0, separator);
  const modelId = piModel.slice(separator + 1);
  modelRuntime.registerProvider(provider, {
    name: provider,
    baseUrl: piTestBaseUrl,
    apiKey: piTestApiKey ?? 'local-test-key',
    api: 'openai-completions',
    authHeader: Boolean(piTestApiKey),
    models: [
      {
        id: modelId,
        name: modelId,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32_768,
        maxTokens: 4_096,
      },
    ],
  });
}

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeIssueFixture(cwd: string, id: string, title: string, status: string, type = 'task'): void {
  createConfig(cwd);
  const issueRoot = resolve(cwd, '.harnessctl/issues');
  mkdirSync(issueRoot, { recursive: true });
  const timestamp = '2026-01-01T00:00:00.000Z';
  const issue: CanonicalIssueDocument = {
    version: 1,
    id,
    type: type as CanonicalIssueDocument['type'],
    title,
    status: status as CanonicalIssueDocument['status'],
    created_at: timestamp,
    updated_at: timestamp,
    created_by: 'integration',
    body: `## Summary\n\n${title}\n`,
    comments: [],
  };
  writeFileSync(resolve(issueRoot, canonicalIssueFilename(id, title)), encodeCanonicalIssue(issue));
}

function writeWorkspaceRepository(prefix: string): { container: string; root: string } {
  const container = temporaryDirectory(prefix);
  const root = resolve(container, 'primary repo');
  mkdirSync(root);
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Harnessctl Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  writeIssueFixture(root, 'hrn-00009', 'Workspace integration Epic', 'in_progress', 'epic');
  writeFileSync(
    resolve(root, '.harnessctl/config.yaml'),
    'version: 1\nskills:\n  cvs:\n    workspaces: true\n  issues:\n    prefix: hrn-\n',
    'utf8',
  );
  execFileSync('git', ['add', '.harnessctl'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'Add workspace fixture'], { cwd: root });
  return { container, root };
}

function readIssueFixture(cwd: string, id: string): string {
  return readFileSync(resolve(cwd, getIssue(cwd, id).path), 'utf8');
}
