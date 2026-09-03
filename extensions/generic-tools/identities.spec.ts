import { describe, expect, it } from 'vitest';
import {
  comparePrefixedIdentities,
  createUlid,
  isPrefixedIdentity,
  isUlid,
  prefixedIdentityPattern,
} from './identities.js';

describe('canonical identities', () => {
  it('creates deterministic ULIDs from a clock and 80 bits of entropy', () => {
    const value = createUlid(0, () => Uint8Array.from({ length: 10 }, (_, index) => index));

    expect(value).toBe('0000000000000G40R40M30E209');
    expect(isUlid(value)).toBe(true);
    expect(() => createUlid(-1)).toThrow(/unsigned 48-bit/u);
    expect(() => createUlid(0, () => new Uint8Array(9))).toThrow(/exactly 10 bytes/u);
  });

  it('recognizes only legacy decimal or uppercase Crockford suffixes with escaped prefixes', () => {
    const pattern = prefixedIdentityPattern('x.+-', 5);

    expect(pattern.test('x.+-00001')).toBe(true);
    expect(isPrefixedIdentity('x.+-00000000000000000000000000', 'x.+-', 5)).toBe(true);
    expect(isPrefixedIdentity('x.+-0000', 'x.+-', 5)).toBe(false);
    expect(isPrefixedIdentity('x.+-0000000000000000000000000I', 'x.+-', 5)).toBe(false);
    expect(isPrefixedIdentity('x.+-0000000000000000000000000a', 'x.+-', 5)).toBe(false);
  });

  it('orders legacy numbers first numerically, then ULIDs lexicographically', () => {
    const ids = ['doc-0000000000000000000000000B', 'doc-10', 'doc-2', 'doc-0000000000000000000000000A'];

    expect(ids.sort((left, right) => comparePrefixedIdentities(left, right, 'doc-'))).toEqual([
      'doc-2',
      'doc-10',
      'doc-0000000000000000000000000A',
      'doc-0000000000000000000000000B',
    ]);
  });
});
