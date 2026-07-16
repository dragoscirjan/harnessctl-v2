import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import { parseIssueId } from './issues.js';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'harnessctl-issues-'));
}

describe('parseIssueId', () => {
  it('extracts an incremental numeric issue ID from the default pattern', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);

      expect(parseIssueId('Please fix issue 00042', cwd)).toBe('00042');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses a configured pattern prefix', () => {
    const cwd = temporaryDirectory();
    try {
      mkdirSync(join(cwd, '.harnessctl'), { recursive: true });
      writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'issues:\n  pattern: TASK-*\n', 'utf8');

      expect(parseIssueId('Review TASK-123 before merging', cwd)).toBe('TASK-123');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns an empty string when no issue ID matches', () => {
    const cwd = temporaryDirectory();
    try {
      createConfig(cwd);

      expect(parseIssueId('There is no issue identifier here', cwd)).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns an empty string when configuration is unavailable or invalid', () => {
    const missingConfigDirectory = temporaryDirectory();
    const invalidConfigDirectory = temporaryDirectory();
    try {
      expect(parseIssueId('Issue 123', missingConfigDirectory)).toBe('');

      mkdirSync(join(invalidConfigDirectory, '.harnessctl'), { recursive: true });
      writeFileSync(
        join(invalidConfigDirectory, '.harnessctl', 'config.yaml'),
        "issues:\n  pattern: '[invalid'\n",
        'utf8',
      );

      expect(parseIssueId('Issue 123', invalidConfigDirectory)).toBe('');
    } finally {
      rmSync(missingConfigDirectory, { recursive: true, force: true });
      rmSync(invalidConfigDirectory, { recursive: true, force: true });
    }
  });
});
