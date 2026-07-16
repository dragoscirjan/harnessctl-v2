import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import {
  archiveIssue,
  commentIssue,
  createIssue,
  getIssue,
  linkDocument,
  listIssues,
  parseIssueId,
  parseIssueIds,
  relateIssue,
  transitionIssue,
  unrelateIssue,
  updateIssue,
  validateIssues,
} from './issues.js';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'harnessctl-issues-'));
}

describe('issue ID parsing', () => {
  it('returns all unique IDs in first-appearance order', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      expect(parseIssueIds('See 00042, then 00007, then 00042 again.', cwd)).toEqual(['00042', '00007']);
      expect(parseIssueId('See 00042 and 00007.', cwd)).toBe('00042');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses the configured prefix and permits an empty prefix', () => {
    const cwd = temporaryDirectory();
    try {
      mkdirSync(join(cwd, '.harnessctl'), { recursive: true });
      writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'issues:\n  prefix: TASK-\n', 'utf8');
      expect(parseIssueIds('TASK-123 and 456 and TASK-123 again.', cwd)).toEqual(['TASK-123']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns no IDs when configuration is unavailable or invalid', () => {
    const missing = temporaryDirectory();
    const invalid = temporaryDirectory();
    try {
      expect(parseIssueIds('Issue 123', missing)).toEqual([]);
      mkdirSync(join(invalid, '.harnessctl'), { recursive: true });
      writeFileSync(join(invalid, '.harnessctl', 'config.yaml'), 'issues:\n  prefix: "bad/prefix"\n', 'utf8');
      expect(parseIssueIds('Issue bad/prefix123', invalid)).toEqual([]);
    } finally {
      rmSync(missing, { recursive: true, force: true });
      rmSync(invalid, { recursive: true, force: true });
    }
  });
});

describe('createIssue', () => {
  it('creates an issue directory whose name contains only prefix and number', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      const result = createIssue(cwd, { type: 'task', title: 'Add issue list tool' });
      expect(result).toContain('Created: .issues/00001/issue.md');
      expect(readFileSync(join(cwd, '.issues', '00001', 'issue.md'), 'utf8')).toContain('id: "00001"');
      expect(listIssues(cwd)).toContain('File: .issues/00001/issue.md');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses issues.prefix and validates references against it', () => {
    const cwd = temporaryDirectory();
    try {
      mkdirSync(join(cwd, '.harnessctl'), { recursive: true });
      writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'issues:\n  prefix: TASK-\n', 'utf8');
      createIssue(cwd, { type: 'epic', title: 'Parent' });
      const result = createIssue(cwd, { type: 'bug', title: 'Prefixed bug', parent: 'TASK-00001' });
      expect(result).toContain('Created: .issues/TASK-00002/issue.md');
      expect(getIssue(cwd, 'TASK-00002').metadata.parent).toBe('TASK-00001');
      expect(getIssue(cwd, 'TASK-00001').metadata.children).toEqual(['TASK-00002']);
      expect(() => createIssue(cwd, { type: 'task', title: 'Invalid', parent: '00001' })).toThrow(/invalid parent/);
      expect(() => createIssue(cwd, { type: 'initiative', title: 'Invalid hierarchy', parent: 'TASK-00001' })).toThrow(
        /invalid parent type/,
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('issue amendments', () => {
  it('gets, updates, transitions, and preserves unknown issue metadata', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      createIssue(cwd, { type: 'task', title: 'Original' });
      const issuePath = join(cwd, '.issues', '00001', 'issue.md');
      writeFileSync(
        issuePath,
        `${readFileSync(issuePath, 'utf8').replace('status: open', 'status: open\ncustom: keep')}\n`,
        'utf8',
      );

      const updated = updateIssue(cwd, '00001', { title: 'Updated', body: '# Updated\n\n## Summary\nDetails' });
      expect(updated.metadata.title).toBe('Updated');
      expect(updated.metadata.custom).toBe('keep');
      expect(updated.body).toContain('Details');
      expect(transitionIssue(cwd, '00001', 'done').metadata.status).toBe('done');
      expect(() => updateIssue(cwd, '00001', { expectedRevision: 'stale' })).toThrow(/changed since/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('appends comments and maintains relationships', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      createIssue(cwd, { type: 'task', title: 'First' });
      createIssue(cwd, { type: 'task', title: 'Second' });
      const comment = commentIssue(cwd, '00001', 'Needs review', 'tester');
      expect(comment.id).toBe('00001-C0001');
      expect(readFileSync(join(cwd, '.issues', '00001', 'comments', '0001.md'), 'utf8')).toContain('Needs review');

      relateIssue(cwd, '00001', 'blocks', '00002');
      expect(getIssue(cwd, '00001').metadata.blocks).toEqual(['00002']);
      expect(getIssue(cwd, '00002').metadata.blocked_by).toEqual(['00001']);
      unrelateIssue(cwd, '00001', 'blocks', '00002');
      expect(getIssue(cwd, '00001').metadata.blocks).toBeUndefined();
      expect(getIssue(cwd, '00002').metadata.blocked_by).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('links allowed documents and validates without mutating malformed relationships', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      createIssue(cwd, { type: 'task', title: 'Documented' });
      mkdirSync(join(cwd, '.harnessctl', 'tasks', '00001'), { recursive: true });
      writeFileSync(join(cwd, '.harnessctl', 'tasks', '00001', 'plan.md'), '# Plan\n', 'utf8');
      const linked = linkDocument(cwd, '00001', '.harnessctl/tasks/00001/plan.md');
      expect(linked.metadata.documents).toEqual(['.harnessctl/tasks/00001/plan.md']);
      expect(() => linkDocument(cwd, '00001', 'README.md')).toThrow(/must be under/);
      expect(validateIssues(cwd)).toEqual({ valid: true, findings: [] });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('archiveIssue', () => {
  it('moves an issue and all active descendants while leaving unrelated issues active', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      createIssue(cwd, { type: 'epic', title: 'Parent' });
      createIssue(cwd, { type: 'task', title: 'Child' });
      createIssue(cwd, { type: 'bug', title: 'Grandchild' });
      createIssue(cwd, { type: 'task', title: 'Unrelated' });
      writeFileSync(join(cwd, '.issues', '00001', 'issue.md'), frontmatter('00001', ['00002']), 'utf8');
      writeFileSync(join(cwd, '.issues', '00002', 'issue.md'), frontmatter('00002', ['00003']), 'utf8');

      const result = archiveIssue(cwd, '00001');
      expect(result).toContain('Archived: 00001, 00002, 00003');
      expect(readFileSync(join(cwd, '.issues', 'archived', '00003', 'issue.md'), 'utf8')).toContain('id: "00003"');
      expect(listIssues(cwd)).toContain('ID: 00004');
      expect(listIssues(cwd)).not.toContain('ID: 00001');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not create archive state when the requested issue is missing', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      expect(() => archiveIssue(cwd, '00001')).toThrow(/does not exist/);
      expect(existsSync(join(cwd, '.issues'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('listIssues', () => {
  it('applies status and type filters', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);
      createIssue(cwd, { type: 'task', title: 'Open task' });
      createIssue(cwd, { type: 'bug', title: 'Closed bug', status: 'closed' });
      expect(listIssues(cwd)).toContain('ID: 00001 | Type: task | Status: open');
      expect(listIssues(cwd, { status: 'CLOSED' })).toContain('ID: 00002 | Type: bug | Status: closed');
      expect(listIssues(cwd, { type: 'story' })).toBe('No issues match the filters.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function frontmatter(id: string, children: string[]): string {
  return `---\nid: "${id}"\ntype: task\ntitle: Issue ${id}\nstatus: open\nchildren: [${children.map((child) => `"${child}"`).join(', ')}]\n---\n`;
}
