import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createExecutionContextProvider } from './execution-context.js';
import { resolveContextPath, resolveProjectRoot } from './execution-routing.js';

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function repository(workspaces: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl routing '));
  roots.push(root);
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Harnessctl Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(root, '.harnessctl'), { recursive: true });
  writeFileSync(
    join(root, '.harnessctl', 'config.yaml'),
    `version: 1\nskills:\n  cvs:\n    workspaces: ${workspaces}\n`,
    'utf8',
  );
  git(root, 'add', '.harnessctl/config.yaml');
  git(root, 'commit', '-m', 'Configure repository');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('execution-root routing', () => {
  it('preserves the host root and requires no session identity when disabled', () => {
    const root = repository(false);

    expect(resolveProjectRoot(root, 'opencode')).toEqual({ enabled: false, root });
  });

  it('does not fall back to primary when routing is disabled for a bound session', () => {
    const root = repository(true);
    createExecutionContextProvider(root, { ulid: () => ULID }).allocateProvisional('opencode', 'session');
    writeFileSync(
      join(root, '.harnessctl', 'config.yaml'),
      'version: 1\nskills:\n  cvs:\n    workspaces: false\n',
      'utf8',
    );

    expect(() => resolveProjectRoot(root, 'opencode', 'session')).toThrow(/still has an execution workspace binding/u);
    expect(resolveProjectRoot(root, 'opencode', 'other-session')).toEqual({ enabled: false, root });
  });

  it('resolves a fresh session binding without changing the host root', () => {
    const root = repository(true);
    const context = createExecutionContextProvider(root, { ulid: () => ULID }).allocateProvisional(
      'opencode',
      'session',
    );

    expect(resolveProjectRoot(root, 'opencode', 'session')).toEqual({
      enabled: true,
      root: context.execution_root,
      context,
    });
    expect(process.cwd()).not.toBe(context.execution_root);
  });

  it('contains existing and prospective project paths under the execution root', () => {
    const root = repository(true);
    const context = createExecutionContextProvider(root, { ulid: () => ULID }).allocateProvisional('pi', 'session');
    mkdirSync(join(context.execution_root, 'nested'));

    expect(resolveContextPath(context, 'nested/new/file.txt')).toBe(
      join(context.execution_root, 'nested', 'new', 'file.txt'),
    );
    expect(() => resolveContextPath(context, context.primary_root)).toThrow(/escapes the execution root/u);
  });

  it('rejects traversal, absolute primary access, and symlink escape for project operations', () => {
    const root = repository(true);
    const context = createExecutionContextProvider(root, { ulid: () => ULID }).allocateProvisional(
      'opencode',
      'session',
    );
    const outside = mkdtempSync(join(tmpdir(), 'harnessctl routing outside '));
    roots.push(outside);
    symlinkSync(outside, join(context.execution_root, 'escape'));

    expect(() => resolveContextPath(context, '../outside')).toThrow(/escapes the execution root/u);
    expect(() => resolveContextPath(context, join(context.primary_root, '.harnessctl'))).toThrow(
      /escapes the execution root/u,
    );
    expect(() => resolveContextPath(context, 'escape/file.txt')).toThrow(/escapes the execution root/u);
    expect(resolveContextPath(context, '.harnessctl', 'control')).toBe(join(context.primary_root, '.harnessctl'));
  });

  it('rejects stale generation and branch drift during fresh resolution', () => {
    const root = repository(true);
    const provider = createExecutionContextProvider(root, { ulid: () => ULID });
    const context = provider.allocateProvisional('pi', 'session');

    expect(() => resolveProjectRoot(root, 'pi', 'session', context.binding_generation + 1)).toThrow(
      /generation is stale/u,
    );
    git(context.execution_root, 'checkout', '--detach');
    expect(() => resolveProjectRoot(root, 'pi', 'session')).toThrow(/branch is detached or mismatched/u);
  });
});
