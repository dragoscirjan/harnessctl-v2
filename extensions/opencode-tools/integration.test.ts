import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConfig, readConfig } from '@harnessctl/generic-tools';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { describe, expect, it } from 'vitest';

const opencodeModel = process.env.OPENCODE_TEST_MODEL ?? 'opencode/big-pickle';
const { command: opencodeCommand, prefix: opencodeCommandPrefix } = resolveOpenCodeCommand();
const pluginPath = fileURLToPath(new URL('./index.ts', import.meta.url));

describe('OpenCode SDK integration', () => {
  it('uses the issue_id tool to identify the configured issue ID', async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-integration-'));

    try {
      createConfig(cwd);
      writeFileSync(resolve(cwd, '.harnessctl/config.yaml'), 'issues:\n  prefix: TSK-\n', 'utf8');
      writeOpenCodeProjectConfig(cwd);

      const result = await promptOpenCode(
        cwd,
        'Using the issue_id tool, detect every issue ID in this message: TSK-12345 and TSK-67890. Return the JSON array from the tool.',
      );

      expect(result.toolNames).toContain('issue_id');
      expect(extractIssueIds(result.text)).toEqual(['TSK-12345', 'TSK-67890']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);

  it('uses the config_create tool to create the project configuration', async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-config-create-'));

    try {
      writeOpenCodeProjectConfig(cwd);
      const result = await promptOpenCode(
        cwd,
        'Use the config_create tool to create the project configuration. After it succeeds, reply with only the word created.',
      );

      expect(result.toolNames).toContain('config_create');
      expect(existsSync(resolve(cwd, '.harnessctl/config.yaml'))).toBe(true);
      expect(readConfig(cwd)).toMatchObject({
        version: 1,
        paths: { tasks: '.harnessctl/tasks' },
      });
      expect(result.text.toLowerCase()).toContain('created');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);

  it('uses the config_get tool to read a dotted configuration path', async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-config-get-'));

    try {
      createConfig(cwd);
      writeOpenCodeProjectConfig(cwd);
      const result = await promptOpenCode(
        cwd,
        'Use the config_get tool with the path paths.tasks. Return only the exact value returned by the tool.',
      );

      expect(result.toolNames).toContain('config_get');
      expect(result.text).toMatch(/\.harnessctl\/tasks/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);

  it('uses the issue_create tool to create a local issue', async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-issue-create-'));

    try {
      createConfig(cwd);
      writeOpenCodeProjectConfig(cwd);
      const result = await promptOpenCode(
        cwd,
        'Use the issue_create tool to create a task titled "Document integration coverage". After it succeeds, reply with only the created issue ID.',
      );

      expect(normalizeToolNames(result.toolNames)).toContain('issue_create');
      expect(existsSync(resolve(cwd, '.issues/00001/issue.md'))).toBe(true);
      expect(extractIssueNumbers(result.text)).toEqual(['00001']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);

  it('uses the issue_list tool to list local issues', async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-issue-list-'));

    try {
      mkdirSync(resolve(cwd, '.issues'), { recursive: true });
      mkdirSync(resolve(cwd, '.issues/00001'), { recursive: true });
      writeFileSync(
        resolve(cwd, '.issues/00001/issue.md'),
        '---\nid: "00001"\ntype: task\ntitle: "First task"\nstatus: open\n---\n',
        'utf8',
      );
      mkdirSync(resolve(cwd, '.issues/00002'), { recursive: true });
      writeFileSync(
        resolve(cwd, '.issues/00002/issue.md'),
        '---\nid: "00002"\ntype: bug\ntitle: "Second bug"\nstatus: closed\n---\n',
        'utf8',
      );
      writeOpenCodeProjectConfig(cwd);
      const result = await promptOpenCode(
        cwd,
        'Use the issue_list tool with the status filter "closed". Return only the matching issue ID.',
      );

      expect(normalizeToolNames(result.toolNames)).toContain('issue_list');
      expect(extractIssueNumbers(result.text)).toEqual(['00002']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);

  describe.concurrent('issue lifecycle tools', () => {
    it('reads, updates, transitions, comments, and validates an issue', async () => {
      const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-lifecycle-'));

      try {
        createConfig(cwd);
        writeIssueFixture(cwd, '00001', 'Lifecycle task', 'open');
        writeOpenCodeProjectConfig(cwd);
        const result = await promptOpenCode(
          cwd,
          'Use these tools exactly once in order for issue 00001: issue_get, issue_update with title "Updated lifecycle task" and sections JSON {"Summary":"Updated"}, issue_transition to done, issue_comment with body "Reviewed" and author "integration", then issue_validate. After all tools succeed, reply with only done.',
        );

        expect(normalizeToolNames(result.toolNames)).toEqual(
          expect.arrayContaining(['issue_get', 'issue_update', 'issue_transition', 'issue_comment', 'issue_validate']),
        );
        const issue = readIssueFixture(cwd, '00001');
        expect(issue).toContain('title: Updated lifecycle task');
        expect(issue).toContain('status: done');
        expect(issue).toContain('## Summary');
        expect(existsSync(resolve(cwd, '.issues/00001/comments/0001.md'))).toBe(true);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }, 120_000);

    it('relates, unrelates, and archives an issue', async () => {
      const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-relationships-'));

      try {
        createConfig(cwd);
        writeIssueFixture(cwd, '00001', 'Archive source', 'open');
        writeIssueFixture(cwd, '00002', 'Related target', 'open');
        writeOpenCodeProjectConfig(cwd);
        const result = await promptOpenCode(
          cwd,
          'Use these tools exactly once in order: issue_relate with id 00001, relationship blocks, targetId 00002; issue_unrelate with the same arguments; issue_archive with id 00001. After all tools succeed, reply with only archived.',
        );

        expect(normalizeToolNames(result.toolNames)).toEqual(
          expect.arrayContaining(['issue_relate', 'issue_unrelate', 'issue_archive']),
        );
        expect(existsSync(resolve(cwd, '.issues/archived/00001/issue.md'))).toBe(true);
        expect(existsSync(resolve(cwd, '.issues/00002/issue.md'))).toBe(true);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }, 120_000);

    it('links an allowed task document to an issue', async () => {
      const cwd = mkdtempSync(resolve(tmpdir(), 'harnessctl-opencode-document-link-'));

      try {
        createConfig(cwd);
        writeIssueFixture(cwd, '00001', 'Documented task', 'open');
        mkdirSync(resolve(cwd, '.harnessctl/tasks/00001'), { recursive: true });
        writeFileSync(resolve(cwd, '.harnessctl/tasks/00001/plan.md'), '# Plan\n', 'utf8');
        writeOpenCodeProjectConfig(cwd);
        const result = await promptOpenCode(
          cwd,
          'Use issue_link_document exactly once with id 00001, path .harnessctl/tasks/00001/plan.md, and kind task. After it succeeds, reply with only linked.',
        );

        expect(normalizeToolNames(result.toolNames)).toContain('issue_link_document');
        expect(readIssueFixture(cwd, '00001')).toContain('.harnessctl/tasks/00001/plan.md');
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }, 120_000);
  });
});

function writeOpenCodeProjectConfig(cwd: string): void {
  writeFileSync(
    resolve(cwd, 'opencode.json'),
    JSON.stringify(
      {
        plugin: [pathToFileURL(pluginPath).href],
      },
      null,
      2,
    ),
  );
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

async function promptOpenCode(cwd: string, prompt: string): Promise<{ text: string; toolNames: string[] }> {
  const server = await startOpenCodeServer(cwd);
  try {
    const session = await server.client.session.create({
      body: { title: 'harnessctl integration test' },
      throwOnError: true,
    });
    const response = await server.client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: { providerID: 'opencode', modelID: opencodeModel.replace('opencode/', '') },
        parts: [{ type: 'text', text: prompt }],
      },
      throwOnError: true,
    });
    const messages = await server.client.session.messages({
      path: { id: session.data.id },
      throwOnError: true,
    });

    return {
      text: extractResponseText(response.data.parts),
      toolNames: messages.data.flatMap((message) => extractToolNames(message.parts)),
    };
  } finally {
    await server.close();
  }
}

function extractIssueIds(output: string): string[] {
  return [...output.matchAll(/\b(?:TSK|ABC)-\d+\b|\b\d{6}\b/g)].map(([match]) => match);
}

function extractIssueNumbers(output: string): string[] {
  return [...output.matchAll(/\b\d{5}\b/g)].map(([match]) => match);
}

function normalizeToolNames(toolNames: string[]): string[] {
  return toolNames.map((name) => name.replaceAll('-', '_'));
}

function extractResponseText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n');
}

function extractToolNames(parts: unknown): string[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'tool')
    .flatMap((part) => (typeof part.tool === 'string' ? [part.tool] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveOpenCodeCommand(): { command: string; prefix: string[] } {
  if (process.env.OPENCODE_BIN) {
    return { command: process.env.OPENCODE_BIN, prefix: [] };
  }

  const binaryName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
  const workspaceBinary = fileURLToPath(new URL(`../../../node_modules/.bin/${binaryName}`, import.meta.url));
  if (isExecutable(workspaceBinary)) {
    return { command: workspaceBinary, prefix: [] };
  }

  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = resolve(directory, binaryName);
    if (isExecutable(candidate)) {
      return { command: candidate, prefix: [] };
    }
  }

  throw new Error(
    'OpenCode CLI was not found. Run npm install without --ignore-scripts, or set OPENCODE_BIN to an executable path.',
  );
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  server.close();
  await once(server, 'close');

  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate a local port for the OpenCode server.');
  }

  return address.port;
}

async function startOpenCodeServer(cwd: string): Promise<{
  client: ReturnType<typeof createOpencodeClient>;
  close: () => Promise<void>;
}> {
  const port = await findFreePort();
  const child = spawn(opencodeCommand, [...opencodeCommandPrefix, 'serve', '--hostname=127.0.0.1', `--port=${port}`], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = waitForExit(child);
  let url: string;
  try {
    url = await waitForServerUrl(child);
  } catch (error) {
    child.kill('SIGTERM');
    await exit;
    throw error;
  }

  return {
    client: createOpencodeClient({ baseUrl: url, directory: cwd }),
    close: async () => {
      child.kill('SIGTERM');
      await exit;
    },
  };
}

async function waitForServerUrl(process: ChildProcess): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let output = '';
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = output.match(/opencode server listening on (https?:\/\/\S+)/);
      if (match?.[1]) {
        resolveUrl(match[1]);
      }
    };

    process.stdout?.on('data', onData);
    process.stderr?.on('data', onData);
    process.once('error', reject);
    process.once('exit', (code, signal) => {
      reject(new Error(`OpenCode server exited before startup (code=${code}, signal=${signal}).\n${output}`));
    });
  });
}

async function waitForExit(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) {
    return;
  }

  await once(process, 'exit');
}
