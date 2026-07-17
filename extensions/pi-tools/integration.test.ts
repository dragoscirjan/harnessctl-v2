import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  resolveCliModel,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import { createConfig, readConfig } from '@harnessctl/generic-tools';
import { describe, expect, it } from 'vitest';

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
        writeFileSync(join(cwd, '.harnessctl/config.yaml'), 'issues:\n  prefix: TSK-\n', 'utf8');
        const result = await promptPi(
          cwd,
          'Using the issue_id tool, detect every issue ID in this message: TSK-12345 and TSK-67890. Return the JSON array from the tool.',
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
        );

        expect(result.toolNames).toContain('issue_create');
        expect(existsSync(join(cwd, '.issues/00001/issue.md'))).toBe(true);
        expect(result.text).toContain('00001');
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
        mkdirSync(join(cwd, '.issues/00001'), { recursive: true });
        writeFileSync(
          join(cwd, '.issues/00001/issue.md'),
          '---\nid: "00001"\ntype: task\ntitle: "First task"\nstatus: open\n---\n',
          'utf8',
        );
        mkdirSync(join(cwd, '.issues/00002'), { recursive: true });
        writeFileSync(
          join(cwd, '.issues/00002/issue.md'),
          '---\nid: "00002"\ntype: bug\ntitle: "Second bug"\nstatus: closed\n---\n',
          'utf8',
        );
        const result = await promptPi(
          cwd,
          'Use the issue_list tool with the status filter "closed". Return only the matching issue ID.',
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

  describe.concurrent('issue lifecycle tools', () => {
    it(
      'reads, updates, transitions, comments, and validates an issue',
      async () => {
        const cwd = temporaryDirectory('harnessctl-pi-lifecycle-');

        try {
          createConfig(cwd);
          writeIssueFixture(cwd, '00001', 'Lifecycle task', 'open');
          const result = await promptPi(
            cwd,
            'Use these tools exactly once in order for issue 00001: issue_get, then use its returned revision as expectedRevision for issue_update with title "Updated lifecycle task" and sections JSON {"Summary":"Updated"}, then use the updated revision for issue_transition to done, issue_comment with body "Reviewed" and author "integration", and issue_validate. After all tools succeed, reply with only done.',
          );

          expect(result.toolNames).toEqual([
            'issue_get',
            'issue_update',
            'issue_transition',
            'issue_comment',
            'issue_validate',
          ]);
          expect(result.text.trim()).toMatch(/done/i);
          const issue = readIssueFixture(cwd, '00001');
          expect(issue).toContain('title: Updated lifecycle task');
          expect(issue).toContain('status: done');
          expect(issue).toContain('## Summary');
          expect(existsSync(join(cwd, '.issues/00001/comments/0001.md'))).toBe(true);
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
          writeIssueFixture(cwd, '00001', 'Archive source', 'open');
          writeIssueFixture(cwd, '00002', 'Related target', 'open');
          const result = await promptPi(
            cwd,
            'Use these tools exactly once in order: issue_relate with id 00001, relationship blocks, targetId 00002; issue_unrelate with the same arguments; issue_archive with id 00001. After all tools succeed, reply with only archived.',
          );

          expect(result.toolNames).toEqual(['issue_relate', 'issue_unrelate', 'issue_archive']);
          expect(result.text.trim()).toMatch(/archived/i);
          const archivedIssue = readFileOrEmpty(resolve(cwd, '.issues/archived/00001/issue.md'));
          expect(archivedIssue).toContain('Archive source');
          expect(archivedIssue).not.toContain('blocks:');
          expect(readFileOrEmpty(resolve(cwd, '.issues/00002/issue.md'))).toContain('Related target');
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
          writeIssueFixture(cwd, '00001', 'Documented task', 'open');
          mkdirSync(resolve(cwd, '.harnessctl/tasks/00001'), { recursive: true });
          writeFileSync(resolve(cwd, '.harnessctl/tasks/00001/plan.md'), '# Plan\n', 'utf8');
          const result = await promptPi(
            cwd,
            'Use issue_link_document exactly once with id 00001, path .harnessctl/tasks/00001/plan.md, and kind task. After it succeeds, reply with only linked.',
          );

          expect(result.toolNames).toEqual(['issue_link_document']);
          expect(result.text.trim()).toMatch(/linked/i);
          expect(readIssueFixture(cwd, '00001')).toContain('.harnessctl/tasks/00001/plan.md');
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      },
      piIntegrationTimeout,
    );
  });
});

async function promptPi(cwd: string, prompt: string): Promise<{ text: string; toolNames: string[] }> {
  if (!piModel) {
    throw new Error('PI_TEST_MODEL is required for Pi SDK integration tests.');
  }

  const agentDir = temporaryDirectory('harnessctl-pi-agent-');
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;

  try {
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    registerTestProvider(modelRegistry);
    const resolved = resolveCliModel({ cliModel: piModel, modelRegistry });
    if (!resolved.model || resolved.error) {
      throw new Error(resolved.error ?? `Unable to resolve Pi model: ${piModel}`);
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: [pluginPath],
    });
    await resourceLoader.reload();

    const created = await createAgentSession({
      cwd,
      agentDir,
      authStorage,
      modelRegistry,
      model: resolved.model,
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
      noTools: 'builtin',
    });
    session = created.session;
    const toolNames: string[] = [];
    const text: string[] = [];

    session.subscribe((event) => {
      if (event.type === 'tool_execution_start') toolNames.push(event.toolName);
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        text.push(event.assistantMessageEvent.delta);
      }
    });
    await session.prompt(prompt);
    return { text: text.join(''), toolNames };
  } finally {
    session?.dispose();
    rmSync(agentDir, { recursive: true, force: true });
  }
}

function registerTestProvider(modelRegistry: ModelRegistry): void {
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
  modelRegistry.registerProvider(provider, {
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

function writeIssueFixture(cwd: string, id: string, title: string, status: string): void {
  mkdirSync(resolve(cwd, `.issues/${id}`), { recursive: true });
  writeFileSync(
    resolve(cwd, `.issues/${id}/issue.md`),
    `---\nid: "${id}"\ntype: task\ntitle: "${title}"\nstatus: ${status}\ncreated_at: "2026-01-01T00:00:00.000Z"\nupdated_at: "2026-01-01T00:00:00.000Z"\ncreated_by: "integration"\n---\n\n# ${title}\n`,
    'utf8',
  );
}

function readIssueFixture(cwd: string, id: string): string {
  return readFileSync(resolve(cwd, `.issues/${id}/issue.md`), 'utf8');
}

function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}
