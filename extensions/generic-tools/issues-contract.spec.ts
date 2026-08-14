import { describe, expect, it } from 'vitest';
import {
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
    depends_on: ['00006'],
    relates_to: ['00010'],
    duplicates: ['00011'],
    supersedes: ['00012'],
    documents: ['.specs/hld-00004.yml'],
    metadata: { z: 9_007_199_254_740_992, fraction: 0.0123, nested: { beta: true, alpha: null } },
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
  it('writes deterministic fields, metadata, and one final newline', () => {
    const text = encodeCanonicalIssueText(issue());
    expect(text).toContain('"version": 1\n"id": "00007"\n"type": "task"');
    expect(text).toContain('"fraction": 0.0123');
    expect(text).toContain('"nested":\n    "alpha": null\n    "beta": true');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('accepts safe non-canonical presentation and revisions exact source bytes', () => {
    const source = encodeCanonicalIssueText(issue())
      .replace('"version": 1', '# harmless comment\nversion: 01')
      .replace('"title": "Canonical codec"', "title: 'Canonical codec'");
    const decoded = decodeIssueDocument(source);
    expect(decoded.canonical).toBe(false);
    expect(decoded.issue.version).toBe(1);
    expect(decoded.revision).toBe(computeIssueRevision(new TextEncoder().encode(source)));
    expect(() => decodeIssueDocument(source, { requireCanonical: true })).toThrowError(
      expect.objectContaining({ category: 'canonical_form' }),
    );
  });

  it.each([
    ['malformed YAML', '"version": ['],
    ['duplicate keys', '"version": 1\n"version": 1\n'],
    ['alias', '"version": &v 1\n"id": *v\n'],
    ['explicit tag', '"version": !!int 1\n'],
    ['multiple documents', '"version": 1\n---\n"version": 1\n'],
    ['non-finite number', '"version": .inf\n'],
  ])('rejects unsafe %s', (_name, yaml) => {
    expect(() => decodeIssueDocument(yaml)).toThrowError(expect.objectContaining({ category: 'parse_safety' }));
  });

  it('rejects persisted inverse fields and unknown fields', () => {
    expect(() => encodeCanonicalIssue({ ...issue(), children: ['00008'] } as CanonicalIssueDocument)).toThrowError(
      expect.objectContaining({ category: 'schema' }),
    );
  });

  it('enforces named resource and UTF-8 limits', () => {
    expect(() => encodeCanonicalIssue(issue({ body: '12345' }), { bodyBytes: 4 })).toThrowError(
      expect.objectContaining({ category: 'resource_limit', limit: 'bodyBytes' }),
    );
    expect(() => decodeIssueDocument(new Uint8Array([0xff]))).toThrowError(
      expect.objectContaining({ category: 'parse_safety' }),
    );
  });
});

describe('standard JSON metadata', () => {
  it('uses JavaScript number semantics and deterministic JSON serialization', () => {
    const metadata = parseIssueMetadataText('{"huge":9007199254740993,"fraction":1.2300e-2,"safe":42}');
    expect(metadata).toEqual({ huge: 9_007_199_254_740_992, fraction: 0.0123, safe: 42 });
    expect(encodeIssueToolResult({ metadata })).toBe(
      '{"metadata":{"huge":9007199254740992,"fraction":0.0123,"safe":42}}',
    );
  });

  it('rejects invalid, cyclic, non-finite, and portable-colliding metadata', () => {
    expect(() => parseIssueMetadataText('[]')).toThrowError(expect.objectContaining({ category: 'schema' }));
    expect(() => normalizeIssueMetadata({ value: Number.NaN })).toThrowError(
      expect.objectContaining({ category: 'schema' }),
    );
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
  });
});
