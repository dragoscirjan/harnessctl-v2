import { createHash } from 'node:crypto';
import { isAlias, isMap, isScalar, isSeq, parseDocument, type Node, type Scalar } from 'yaml';

export const DOCUMENT_ROOT = '.harnessctl/documents';
export const DOCUMENT_ID_PREFIX = 'doc-';
export const DOCUMENT_KINDS = ['hld', 'lld', 'design-overview', 'gdd'] as const;
export const DOCUMENT_STATUSES = ['draft', 'review', 'approved'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type DocumentLocation = 'active' | 'archive';

export type DocumentErrorCategory =
  | 'configuration'
  | 'path_safety'
  | 'parse_safety'
  | 'schema'
  | 'canonical_form'
  | 'identity_ambiguity'
  | 'resource_limit'
  | 'stale_revision'
  | 'filesystem_durability'
  | 'synchronization';

export class DocumentError extends Error {
  public constructor(
    public readonly category: DocumentErrorCategory,
    message: string,
    public readonly paths?: readonly string[],
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

export interface CanonicalDocumentMetadata {
  id: string;
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
}

export interface DecodedDocument {
  metadata: CanonicalDocumentMetadata;
  body: string;
  bytes: Uint8Array;
  revision: string;
}

const KEYS = new Set([
  'id',
  'title',
  'kind',
  'status',
  'version',
  'created_at',
  'updated_at',
  'created_by',
  'metadata',
]);
export const DOCUMENT_LIMITS = Object.freeze({
  files: 2_000,
  fileBytes: 1_100_000,
  bodyBytes: 1_000_000,
  aggregateBytes: 8 * 1024 * 1024,
  versions: 100,
  listResults: 200,
  resultChars: 1_200_000,
  frontmatterBytes: 131_072,
  yamlNodes: 2_048,
  yamlDepth: 16,
  scalarChars: 65_536,
  metadataKeys: 256,
  journalBytes: 65_536,
});

export function computeDocumentRevision(bytes: Uint8Array): string {
  return `v1:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function canonicalDocumentFilename(
  metadata: Pick<CanonicalDocumentMetadata, 'id' | 'title' | 'version'>,
): string {
  return `${metadata.id}-${slug(metadata.title)}-v${metadata.version}.md`;
}

export function encodeCanonicalDocument(metadata: CanonicalDocumentMetadata, content = ''): Uint8Array {
  validateMetadata(metadata);
  const body = canonicalBody(metadata.title, content);
  validateBody(metadata.title, body);
  const lines = [
    '---',
    `id: ${yamlString(metadata.id)}`,
    `title: ${yamlString(metadata.title)}`,
    `kind: ${metadata.kind}`,
    `status: ${metadata.status}`,
    `version: ${metadata.version}`,
    `created_at: ${yamlString(metadata.created_at)}`,
    `updated_at: ${yamlString(metadata.updated_at)}`,
    ...(metadata.created_by ? [`created_by: ${yamlString(metadata.created_by)}`] : []),
    ...(metadata.metadata ? [`metadata: ${JSON.stringify(metadata.metadata)}`] : []),
    '---',
    '',
    body,
  ];
  const text = lines.join('\n');
  const bytes = new TextEncoder().encode(text.endsWith('\n') ? text : `${text}\n`);
  if (bytes.byteLength > DOCUMENT_LIMITS.fileBytes)
    throw new DocumentError('resource_limit', 'document file byte limit exceeded');
  return bytes;
}

export function decodeDocument(source: string | Uint8Array): DecodedDocument {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  if (bytes.byteLength > DOCUMENT_LIMITS.fileBytes)
    throw new DocumentError('resource_limit', 'document file byte limit exceeded');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw new DocumentError('parse_safety', 'UTF-8 byte-order marks are not permitted');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentError('parse_safety', 'document must be valid UTF-8');
  }
  if (text.includes('\r')) throw new DocumentError('canonical_form', 'document must use LF line endings');
  assertUnicodeScalarString(text, 'document source');
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/u.exec(text);
  if (!match) throw new DocumentError('parse_safety', 'document must contain strict YAML frontmatter');
  const frontmatter = match[1] ?? '';
  if (new TextEncoder().encode(frontmatter).byteLength > DOCUMENT_LIMITS.frontmatterBytes)
    throw new DocumentError('resource_limit', 'document frontmatter byte limit exceeded');
  if (frontmatter.trimStart().startsWith('%'))
    throw new DocumentError('parse_safety', 'YAML directives are not permitted');
  const yaml = parseDocument(frontmatter, { uniqueKeys: true, strict: true });
  if (yaml.errors.length || yaml.warnings.length)
    throw new DocumentError('parse_safety', 'document frontmatter is malformed or ambiguous');
  const state: WalkState = { nodes: 0, metadataKeys: 0 };
  const value: unknown = yamlNodeToValue(yaml.contents as Node | null, 0, state, false);
  if (!isRecord(value)) throw new DocumentError('schema', 'document frontmatter must be a mapping');
  for (const key of Object.keys(value))
    if (!KEYS.has(key)) throw new DocumentError('schema', `unsupported document field: ${key}`);
  const metadata = value as unknown as CanonicalDocumentMetadata;
  validateMetadata(metadata);
  const body = match[2] ?? '';
  validateBody(metadata.title, body);
  const canonical = encodeCanonicalDocument(metadata, contentAfterTitle(metadata.title, body));
  if (!Buffer.from(canonical).equals(Buffer.from(bytes)))
    throw new DocumentError('canonical_form', 'document is not in canonical form');
  return { metadata, body, bytes, revision: computeDocumentRevision(bytes) };
}

export function validateBody(title: string, body: string): void {
  assertUnicodeScalarString(body, 'document body');
  // eslint-disable-next-line no-control-regex -- canonical Markdown rejects non-text control ranges
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(body))
    throw new DocumentError('parse_safety', 'document body contains unsupported control characters');
  if (new TextEncoder().encode(body).byteLength > DOCUMENT_LIMITS.bodyBytes)
    throw new DocumentError('resource_limit', 'document body byte limit exceeded');
  const lines = body.replace(/\n$/u, '').split('\n');
  if (lines[0] !== `# ${title}` || lines[1] !== '')
    throw new DocumentError(
      'canonical_form',
      'document body must begin with exactly one matching H1 followed by a blank line',
    );
  if (lines.slice(2).some((line) => /^#(?:\s|$)/u.test(line)))
    throw new DocumentError('canonical_form', 'additional level-one headings are not allowed');
}

export function canonicalBody(title: string, content: string): string {
  assertUnicodeScalarString(content, 'document content');
  const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (normalized.split('\n').some((line) => /^#(?:\s|$)/u.test(line)))
    throw new DocumentError('canonical_form', 'document content must not contain a level-one heading');
  return `# ${title}\n\n${normalized}`;
}

function contentAfterTitle(title: string, body: string): string {
  return body.slice(`# ${title}\n\n`.length).trimEnd();
}

function validateMetadata(value: CanonicalDocumentMetadata): void {
  if (!isRecord(value)) throw new DocumentError('schema', 'document metadata must be a mapping');
  requireString(value.id, 'id', 128);
  requireString(value.title, 'title', 200);
  if (!DOCUMENT_KINDS.includes(value.kind)) throw new DocumentError('schema', 'invalid document kind');
  if (!DOCUMENT_STATUSES.includes(value.status)) throw new DocumentError('schema', 'invalid document status');
  if (!Number.isSafeInteger(value.version) || value.version < 1)
    throw new DocumentError('schema', 'invalid document version');
  timestamp(value.created_at, 'created_at');
  timestamp(value.updated_at, 'updated_at');
  if (value.created_by !== undefined) requireString(value.created_by, 'created_by', 200);
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) throw new DocumentError('schema', 'metadata must be a mapping');
    validateJsonMetadata(value.metadata);
    if (new TextEncoder().encode(JSON.stringify(value.metadata)).byteLength > DOCUMENT_LIMITS.scalarChars)
      throw new DocumentError('resource_limit', 'document metadata byte limit exceeded');
  }
}

function timestamp(value: unknown, field: string): void {
  requireString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value)
    throw new DocumentError('schema', `${field} must be a canonical UTC timestamp`);
}

function requireString(
  value: unknown,
  field: string,
  maximum: number = DOCUMENT_LIMITS.scalarChars,
): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.includes('\0'))
    throw new DocumentError('schema', `${field} must be a non-empty trimmed string`);
  assertUnicodeScalarString(value, field);
  if (value.length > maximum) throw new DocumentError('resource_limit', `${field} scalar limit exceeded`);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function slug(value: string): string {
  const result = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
    .replace(/-+$/u, '');
  return result || 'document';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type SafeValue = string | number | boolean | null | SafeValue[] | { [key: string]: SafeValue };
interface WalkState {
  nodes: number;
  metadataKeys: number;
}

function yamlNodeToValue(node: Node | null, depth: number, state: WalkState, metadata: boolean): SafeValue {
  if (!node) throw new DocumentError('schema', 'YAML node is missing');
  if (depth > DOCUMENT_LIMITS.yamlDepth) throw new DocumentError('resource_limit', 'YAML depth limit exceeded');
  if (++state.nodes > DOCUMENT_LIMITS.yamlNodes) throw new DocumentError('resource_limit', 'YAML node limit exceeded');
  assertNodeSafety(node);
  if (isAlias(node)) throw new DocumentError('parse_safety', 'YAML aliases are not permitted');
  if (isScalar(node)) return scalarValue(node);
  if (isSeq(node)) return node.items.map((item) => yamlNodeToValue(item as Node | null, depth + 1, state, metadata));
  if (!isMap(node)) throw new DocumentError('schema', 'unsupported YAML node');
  const result: Record<string, SafeValue> = Object.create(null) as Record<string, SafeValue>;
  const compared = new Set<string>();
  for (const pair of node.items) {
    if (++state.nodes > DOCUMENT_LIMITS.yamlNodes)
      throw new DocumentError('resource_limit', 'YAML node limit exceeded');
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
      throw new DocumentError('parse_safety', 'YAML mapping keys must be strings');
    assertNodeSafety(pair.key);
    const key = pair.key.value;
    requireString(key, 'mapping key');
    const comparison = portableKey(key);
    if (compared.has(comparison)) throw new DocumentError('schema', 'mapping keys collide under portable comparison');
    compared.add(comparison);
    if (metadata && ++state.metadataKeys > DOCUMENT_LIMITS.metadataKeys)
      throw new DocumentError('resource_limit', 'metadata key limit exceeded');
    result[key] = yamlNodeToValue(pair.value as Node | null, depth + 1, state, metadata || key === 'metadata');
  }
  return result;
}

function assertNodeSafety(node: Node): void {
  if ('anchor' in node && node.anchor) throw new DocumentError('parse_safety', 'YAML anchors are not permitted');
  if (node.tag) throw new DocumentError('parse_safety', 'explicit YAML tags are not permitted');
}

function scalarValue(node: Scalar): SafeValue {
  const source = node.source ?? String(node.value);
  if (source.length > DOCUMENT_LIMITS.scalarChars)
    throw new DocumentError('resource_limit', 'YAML scalar limit exceeded');
  if (typeof node.value === 'number') {
    if (!Number.isFinite(node.value)) throw new DocumentError('parse_safety', 'only finite numbers are permitted');
    return Object.is(node.value, -0) ? 0 : node.value;
  }
  if (typeof node.value === 'bigint') {
    const number = Number(node.value);
    if (!Number.isFinite(number)) throw new DocumentError('parse_safety', 'only finite numbers are permitted');
    return number;
  }
  if (typeof node.value === 'string' || typeof node.value === 'boolean' || node.value === null) {
    if (typeof node.value === 'string') assertUnicodeScalarString(node.value, 'YAML scalar');
    return node.value;
  }
  throw new DocumentError('parse_safety', 'unsupported YAML scalar type');
}

function validateJsonMetadata(
  value: unknown,
  depth = 0,
  state = { nodes: 0, keys: 0 },
  seen = new Set<object>(),
): void {
  if (depth > DOCUMENT_LIMITS.yamlDepth) throw new DocumentError('resource_limit', 'metadata depth limit exceeded');
  if (++state.nodes > DOCUMENT_LIMITS.yamlNodes)
    throw new DocumentError('resource_limit', 'metadata node limit exceeded');
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, 'metadata scalar');
    if (value.length > DOCUMENT_LIMITS.scalarChars)
      throw new DocumentError('resource_limit', 'metadata scalar limit exceeded');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DocumentError('schema', 'metadata numbers must be finite');
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value !== 'object') throw new DocumentError('schema', 'metadata must contain JSON values');
  if (seen.has(value)) throw new DocumentError('schema', 'metadata must not contain cycles');
  seen.add(value);
  if (Array.isArray(value)) for (const item of value) validateJsonMetadata(item, depth + 1, state, seen);
  else {
    const compared = new Set<string>();
    for (const [key, item] of Object.entries(value)) {
      if (++state.keys > DOCUMENT_LIMITS.metadataKeys)
        throw new DocumentError('resource_limit', 'metadata key limit exceeded');
      requireString(key, 'metadata key');
      const comparison = portableKey(key);
      if (compared.has(comparison))
        throw new DocumentError('schema', 'metadata keys collide under portable comparison');
      compared.add(comparison);
      validateJsonMetadata(item, depth + 1, state, seen);
    }
  }
  seen.delete(value);
}

function portableKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

function assertUnicodeScalarString(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new DocumentError('parse_safety', `${label} contains invalid Unicode`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new DocumentError('parse_safety', `${label} contains invalid Unicode`);
    }
  }
}
