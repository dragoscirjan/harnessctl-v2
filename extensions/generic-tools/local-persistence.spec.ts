import { describe, expect, it } from 'vitest';
import { LocalPersistenceError, selectSqliteRuntime } from './local-persistence.js';

describe('local SQLite runtime selection', () => {
  it('supports the minimum runtimes and documents the pinned CI runtimes', () => {
    expect(selectSqliteRuntime({ node: '22.13.0' })).toBe('node');
    expect(selectSqliteRuntime({ node: '24.15.0' })).toBe('node');
    expect(selectSqliteRuntime({ node: '25.0.0' })).toBe('node');
    expect(selectSqliteRuntime({ bun: '1.3.13', node: '24.15.0' })).toBe('bun');
    expect(selectSqliteRuntime({ bun: '1.4.0', node: '24.15.0' })).toBe('bun');
  });

  it('rejects unsupported versions before selecting a SQLite built-in', () => {
    expect(() => selectSqliteRuntime({ node: '22.12.9' })).toThrow(LocalPersistenceError);
    expect(() => selectSqliteRuntime({ node: '23.0.0' })).toThrow(LocalPersistenceError);
    expect(() => selectSqliteRuntime({ bun: '1.3.12', node: '24.15.0' })).toThrow(/Bun 1\.3\.12.*unsupported/u);
    expect(() => selectSqliteRuntime({})).toThrow(/unsupported runtime/u);
  });
});
