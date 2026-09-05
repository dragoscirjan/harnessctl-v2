import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import {
  OperationError,
  SEMANTIC_OPERATION_REGISTRY,
  buildExceptionalCommand,
  buildTaskOperation,
  executeRegisteredTaskOperation,
  executeTaskOperation,
  nextBootstrapOperation,
} from './operations.js';
import { CONFIG_V1_DEFAULTS } from './schemas.js';

function fixture(runner: 'auto' | 'mise' = 'mise'): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-operations-'));
  mkdirSync(join(root, '.harnessctl'), { recursive: true });
  writeFileSync(
    join(root, '.harnessctl', 'config.yaml'),
    stringify({
      ...CONFIG_V1_DEFAULTS,
      automation: { runner, tasks: { 'repository.test': 'test', 'bootstrap.install': 'install-prompts' } },
    }),
  );
  writeFileSync(join(root, 'mise.toml'), '[tasks.test]\nrun = "true"\n');
  return root;
}

describe('typed operation registry', () => {
  it('builds an immutable descriptor from reviewed configuration', () => {
    const root = fixture();
    const descriptor = buildTaskOperation(root, 'opencode', undefined, 'repository.test');
    expect(descriptor).toMatchObject({
      operation_id: 'repository.test',
      registry_version: 1,
      operation_class: 'project',
      legal_workspace_states: ['active', 'cleanup_ready', 'disabled'],
      approval_class: 'local_mutation',
      cwd_policy: 'execution_root',
      runner: 'mise',
      task_target: 'test',
      executable: 'mise',
      argv: ['run', 'test'],
      cwd: root,
      workspace_id: null,
      binding_generation: null,
      workspace_generation: null,
      state_transition: 'none',
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.argv)).toBe(true);
    expect(Object.isFrozen(descriptor.legal_workspace_states)).toBe(true);
    expect(SEMANTIC_OPERATION_REGISTRY).toHaveProperty('workspace.allocate_provisional');
    expect(SEMANTIC_OPERATION_REGISTRY).toHaveProperty('session.release');
  });

  it('requires descriptor-bound consent and emits hashed bounded evidence', () => {
    const descriptor = buildTaskOperation(fixture(), 'pi', undefined, 'repository.test');
    const spawn = vi.fn(() => ({
      pid: 123,
      output: [null, 'ok', ''],
      stdout: 'ok',
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    })) as unknown as typeof import('node:child_process').spawnSync;
    expect(() => executeTaskOperation(descriptor, undefined, { spawn })).toThrowError(OperationError);
    const evidence = executeTaskOperation(descriptor, descriptor.digest, {
      spawn,
      environment: { PATH: '/bin', SECRET: 'not-forwarded' },
      clock: (() => {
        const values = [10, 15];
        return () => values.shift() ?? 15;
      })(),
    });
    expect(evidence).toMatchObject({
      schema_version: 1,
      outcome: 'succeeded',
      exit_code: 0,
      duration_ms: 5,
      input_digest: descriptor.input_digest,
      before_binding_generation: null,
      after_binding_generation: null,
    });
    expect(spawn).toHaveBeenCalledWith(
      'mise',
      ['run', 'test'],
      expect.objectContaining({ cwd: descriptor.cwd, env: { PATH: '/bin' }, shell: false }),
    );
  });

  it('rejects a descriptor changed after consent', () => {
    const descriptor = buildTaskOperation(fixture(), 'pi', undefined, 'repository.test');
    const changed = { ...descriptor, argv: ['run', 'quality'] };
    expect(() => executeTaskOperation(changed, descriptor.digest)).toThrowError(/descriptor digest is invalid/);
  });

  it('binds exceptional argv and execution root to separate consent', () => {
    const descriptor = buildExceptionalCommand(fixture(), 'opencode', undefined, 'git', ['status', '--short']);
    const spawn = vi.fn(() => ({
      pid: 123,
      output: [null, '', ''],
      stdout: '',
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    })) as unknown as typeof import('node:child_process').spawnSync;

    expect(descriptor).toMatchObject({
      operation_id: 'command.exceptional',
      executable: 'git',
      argv: ['status', '--short'],
      approval_class: 'exceptional_command',
      cwd_policy: 'execution_root',
    });
    expect(() => executeTaskOperation(descriptor, undefined, { spawn })).toThrow(/consent does not match/u);
    executeTaskOperation(descriptor, descriptor.digest, { spawn });
    expect(spawn).toHaveBeenCalledWith(
      'git',
      ['status', '--short'],
      expect.objectContaining({ cwd: descriptor.cwd, shell: false }),
    );
    expect(() => buildExceptionalCommand(fixture(), 'pi', undefined, 'git\0evil', [])).toThrow(
      /executable is invalid/u,
    );
  });

  it('rebuilds registered operations before accepting consent', () => {
    const root = fixture();
    const descriptor = buildTaskOperation(root, 'pi', undefined, 'repository.test');
    writeFileSync(
      join(root, '.harnessctl', 'config.yaml'),
      stringify({
        ...CONFIG_V1_DEFAULTS,
        automation: { runner: 'mise', tasks: { 'repository.test': 'changed' } },
      }),
    );
    expect(() =>
      executeRegisteredTaskOperation(root, 'pi', undefined, 'repository.test', descriptor.digest),
    ).toThrowError(/consent does not match/u);
  });

  it('fails closed for missing and ambiguous task runners', () => {
    const missing = fixture('auto');
    writeFileSync(join(missing, 'package.json'), '{}');
    expect(() => buildTaskOperation(missing, 'pi', undefined, 'repository.test')).toThrowError(/ambiguous/);

    const unconfigured = fixture();
    expect(() => buildTaskOperation(unconfigured, 'pi', undefined, 'repository.quality')).toThrowError(
      /is not configured/,
    );
  });

  it('returns only the legal next bootstrap operation', () => {
    expect(nextBootstrapOperation({ stage: 'unbound' })).toBe('workspace.allocate_provisional');
    expect(nextBootstrapOperation({ stage: 'workspace_bound', binding_generation: 1, workspace_generation: 2 })).toBe(
      'authority.create',
    );
    expect(
      nextBootstrapOperation({
        stage: 'authority_created',
        binding_generation: 2,
        workspace_generation: 2,
        epic_id: 'hrn-00210',
      }),
    ).toBe('workspace.attach_epic');
    expect(
      nextBootstrapOperation({
        stage: 'epic_attached',
        binding_generation: 3,
        workspace_generation: 3,
        epic_id: 'hrn-00210',
      }),
    ).toBe('bootstrap.install');
    expect(
      nextBootstrapOperation({
        stage: 'complete',
        binding_generation: 3,
        workspace_generation: 3,
        epic_id: 'hrn-00210',
      }),
    ).toBeNull();
  });

  it('rejects stale bootstrap generations', () => {
    expect(() =>
      nextBootstrapOperation({ stage: 'workspace_bound', binding_generation: 0, workspace_generation: 1 }),
    ).toThrowError(/binding generation/);
  });
});
