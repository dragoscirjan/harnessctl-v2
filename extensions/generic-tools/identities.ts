import { randomBytes } from 'node:crypto';

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_ULID_TIMESTAMP = 0xffff_ffff_ffff;

export type UlidEntropy = () => Uint8Array;

export function createUlid(timestamp = Date.now(), entropy: UlidEntropy = () => randomBytes(10)): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_ULID_TIMESTAMP)
    throw new RangeError('ULID timestamp must be an integer in the unsigned 48-bit range');
  const bytes = entropy();
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 10)
    throw new RangeError('ULID entropy must contain exactly 10 bytes');

  let time = BigInt(timestamp);
  let encodedTime = '';
  for (let index = 0; index < 10; index += 1) {
    encodedTime = CROCKFORD[Number(time & 31n)] + encodedTime;
    time >>= 5n;
  }
  let randomness = 0n;
  for (const byte of bytes) randomness = (randomness << 8n) | BigInt(byte);
  let encodedRandom = '';
  for (let index = 0; index < 16; index += 1) {
    encodedRandom = CROCKFORD[Number(randomness & 31n)] + encodedRandom;
    randomness >>= 5n;
  }
  return encodedTime + encodedRandom;
}

export function isUlid(value: string): boolean {
  return ULID_PATTERN.test(value);
}

export function prefixedIdentityPattern(prefix: string, legacyDigits = 1, flags = 'u'): RegExp {
  if (!Number.isSafeInteger(legacyDigits) || legacyDigits < 1)
    throw new RangeError('legacy identity digit count must be a positive integer');
  return new RegExp(`^${escapeRegex(prefix)}(?:\\d{${legacyDigits},}|[0-9A-HJKMNP-TV-Z]{26})$`, flags);
}

export function isPrefixedIdentity(value: string, prefix: string, legacyDigits = 1): boolean {
  return prefixedIdentityPattern(prefix, legacyDigits).test(value);
}

export function comparePrefixedIdentities(left: string, right: string, prefix: string): number {
  const leftSuffix = left.slice(prefix.length);
  const rightSuffix = right.slice(prefix.length);
  const leftLegacy = /^\d+$/u.test(leftSuffix);
  const rightLegacy = /^\d+$/u.test(rightSuffix);
  if (leftLegacy !== rightLegacy) return leftLegacy ? -1 : 1;
  if (leftLegacy && rightLegacy) {
    const difference = BigInt(leftSuffix) - BigInt(rightSuffix);
    if (difference) return difference < 0 ? -1 : 1;
  }
  return compareCodePoints(left, right);
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return a.length - b.length;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
