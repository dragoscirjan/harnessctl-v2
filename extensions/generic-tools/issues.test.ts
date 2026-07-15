import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
    createConfig(cwd);

    expect(parseIssueId('Please fix issue 00042', cwd)).toBe('00042');
  });

  it('uses a configured pattern prefix', () => {
    const cwd = temporaryDirectory();
    mkdirSync(join(cwd, '.harnessctl'), { recursive: true });
    writeFileSync(join(cwd, '.harnessctl', 'config.yaml'), 'issues:\n  pattern: TASK-*\n', 'utf8');

    expect(parseIssueId('Review TASK-123 before merging', cwd)).toBe('TASK-123');
  });

  it('returns an empty string when no issue ID matches', () => {
    const cwd = temporaryDirectory();
    createConfig(cwd);

    expect(parseIssueId('There is no issue identifier here', cwd)).toBe('');
  });

  it('returns an empty string when configuration is unavailable or invalid', () => {
    const missingConfigDirectory = temporaryDirectory();
    expect(parseIssueId('Issue 123', missingConfigDirectory)).toBe('');

    const invalidConfigDirectory = temporaryDirectory();
    mkdirSync(join(invalidConfigDirectory, '.harnessctl'), { recursive: true });
    writeFileSync(
      join(invalidConfigDirectory, '.harnessctl', 'config.yaml'),
      "issues:\n  pattern: '[invalid'\n",
      'utf8',
    );

    expect(parseIssueId('Issue 123', invalidConfigDirectory)).toBe('');
  });
});
