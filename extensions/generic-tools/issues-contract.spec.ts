import { describe, expect, it } from 'vitest';
import {
  ExactDecimalValue,
  canonicalIssueFilename,
  computeIssueRevision,
  decodeIssueDocument,
  encodeCanonicalIssue,
  encodeCanonicalIssueText,
  encodeIssueToolResult,
  normalizeIssueMetadata,
  parseIssueMetadataText,
  slugifyIssueTitle,
  type CanonicalIssueDocument,
} from './issues-contract.js';

function issue(overrides: Partial<CanonicalIssueDocument> = {}): CanonicalIssueDocument {
  return {
    version: 1,
    id: '00007',
    type: 'task',
    title: 'Canonical codec',
    status: 'in_progress',
    created_at: '2026-08-14T13:43:36.998Z',
    updated_at: '2026-08-14T13:44:55.251Z',
    created_by: 'lead-engineer',
    assigned_to: 'backend-dev',
    parent: '00004',
    children: ['00008'],
    depends_on: ['00006'],
    blocks: ['00009'],
    blocked_by: ['00003'],
    relates_to: ['00010'],
    duplicates: ['00011'],
    supersedes: ['00012'],
    documents: ['.specs/hld-00004.yml'],
    metadata: {
      z: new ExactDecimalValue('9.007199254740993e15'),
      nested: { beta: true, alpha: null },
    },
    body: '# Canonical codec\n\nBody 😀\n',
    comments: [
      {
        id: '00007-C0001',
        created_at: '2026-08-14T13:45:00.000Z',
        created_by: 'reviewer',
        body: 'Preserve this comment.',
      },
    ],
    ...overrides,
  };
}

describe('canonical issue codec', () => {
  it('encodes all managed state in fixed order with exact scalars', () => {
    const text = encodeCanonicalIssueText(issue());
    expect(text).toContain('"version": 1\n"id": "00007"\n"type": "task"');
    expect(text).toContain('"metadata":\n  "nested":\n    "alpha": null\n    "beta": true\n  "z": 9007199254740993');
    expect(text).toContain('"body": "# Canonical codec\\n\\nBody 😀\\n"');
    expect(text).toContain('"comments":\n  - "id": "00007-C0001"');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('is byte-stable across canonical decode and re-encode', () => {
    const bytes = encodeCanonicalIssue(issue());
    const decoded = decodeIssueDocument(bytes, { expectedId: '00007', issuePrefix: '' });
    expect(decoded.canonical).toBe(true);
    expect(encodeCanonicalIssue(decoded.issue)).toEqual(bytes);
    expect(decoded.revision).toBe(computeIssueRevision(bytes));
    expect(decoded.issue.comments).toEqual(issue().comments);
  });

  it('reports valid non-canonical YAML without rewriting it', () => {
    const canonical = encodeCanonicalIssueText(issue());
    const nonCanonical = canonical.replace('"version": 1', 'version: 01');
    expect(() => decodeIssueDocument(nonCanonical)).toThrowError(
      expect.objectContaining({ category: 'canonical_form' }),
    );
    const decoded = decodeIssueDocument(nonCanonical, { requireCanonical: false });
    expect(decoded.canonical).toBe(false);
    expect(decoded.issue.version).toBe(1);
  });

  it.each([
    ['malformed YAML', '"version": [', 'parse_safety'],
    ['duplicate keys', '"version": 1\n"version": 1\n', 'parse_safety'],
    ['alias', '"version": &v 1\n"id": *v\n', 'parse_safety'],
    ['explicit tag', '"version": !!int 1\n', 'parse_safety'],
    ['source comment', '# secret\n"version": 1\n', 'parse_safety'],
    ['multiple documents', '"version": 1\n---\n"version": 1\n', 'parse_safety'],
    ['non-finite number', '"version": .inf\n', 'parse_safety'],
  ])('rejects unsafe %s', (_name, yaml, expectedCategory) => {
    expect(() => decodeIssueDocument(yaml)).toThrowError(expect.objectContaining({ category: expectedCategory }));
  });

  it('rejects unknown fields and managed metadata shadowing', () => {
    expect(() => encodeCanonicalIssue({ ...issue(), surprise: true } as CanonicalIssueDocument)).toThrowError(
      expect.objectContaining({ category: 'schema' }),
    );
    expect(() => encodeCanonicalIssue(issue({ metadata: { title: 'shadow' } }))).toThrowError(
      expect.objectContaining({ category: 'schema' }),
    );
  });

  it.each([
    '2026-08-14T13:44:55Z',
    '2026-08-14T13:44:55.25Z',
    '2026-08-14T13:44:55.2510Z',
    '2026-08-14T15:44:55.251+02:00',
    '2026-02-30T13:44:55.251Z',
    '2026-08-14t13:44:55.251z',
  ])('rejects non-canonical or invalid timestamp %s', (timestamp) => {
    expect(() => encodeCanonicalIssue(issue({ updated_at: timestamp }))).toThrowError(
      expect.objectContaining({ category: 'schema' }),
    );
  });

  it('enforces named resource limits', () => {
    expect(() => encodeCanonicalIssue(issue({ body: '12345' }), { bodyBytes: 4 })).toThrowError(
      expect.objectContaining({ category: 'resource_limit', limit: 'bodyBytes' }),
    );
    expect(() => decodeIssueDocument(new Uint8Array([0xff]))).toThrowError(
      expect.objectContaining({ category: 'parse_safety' }),
    );
  });
});

describe('lossless metadata boundary', () => {
  it('parses strict JSON without binary-number coercion', () => {
    const metadata = parseIssueMetadataText(
      '{"huge":9007199254740993,"fraction":1.2300e-2,"negativeZero":-0,"safe":42}',
    );
    expect(metadata.huge).toEqual(new ExactDecimalValue('9007199254740993'));
    expect(metadata.fraction).toEqual(new ExactDecimalValue('0.0123'));
    expect(metadata.negativeZero).toBe(0);
    expect(metadata.safe).toBe(42);
    expect(encodeIssueToolResult({ metadata })).toBe(
      '{"metadata":{"huge":9007199254740993,"fraction":0.0123,"negativeZero":0,"safe":42}}',
    );
  });

  it.each(['{"a":1,"a":2}', '[]', '{"a":NaN}', '{"a":1,}', '{"a":1} trailing'])(
    'rejects invalid metadata %s',
    (text) => {
      expect(() => parseIssueMetadataText(text)).toThrowError(expect.objectContaining({ category: 'schema' }));
    },
  );

  it('rejects lossy runtime numbers and portable key collisions', () => {
    expect(() => normalizeIssueMetadata({ value: 1.5 })).toThrowError(expect.objectContaining({ category: 'schema' }));
    expect(() => normalizeIssueMetadata({ Key: 1, key: 2 })).toThrowError(
      expect.objectContaining({ category: 'schema' }),
    );
  });
});

describe('canonical naming', () => {
  it.each([
    ['Résumé / TEST', 'resume-test'],
    ['東京', 'issue'],
    ['  A---B  ', 'a-b'],
  ])('slugifies %s deterministically', (title, expected) => {
    expect(slugifyIssueTitle(title)).toBe(expected);
  });

  it('honors the complete UTF-8 filename byte budget', () => {
    const filename = canonicalIssueFilename('00007', 'a'.repeat(300));
    expect(new TextEncoder().encode(filename).byteLength).toBe(180);
    expect(filename).toMatch(/^00007-a+\.yml$/u);
  });
});
