import { createHash } from 'node:crypto';
import { isAlias, isMap, isScalar, isSeq, parseAllDocuments, type Document, type Node, type Scalar } from 'yaml';
import { isPrefixedIdentity, isUlid } from './identities.js';

export const ISSUE_CONTRACT_VERSION = 1 as const;
export const ISSUE_CONTRACT_LIMITS = Object.freeze({
  fileBytes: 16 * 1024 * 1024,
  bodyBytes: 2 * 1024 * 1024,
  commentBodyBytes: 256 * 1024,
  comments: 10_000,
  scalarBytes: 2 * 1024 * 1024,
  depth: 32,
  nodes: 100_000,
  metadataKeys: 10_000,
  filenameBytes: 180,
});

export type IssueErrorCategory =
  | 'configuration'
  | 'storage_classification'
  | 'path_safety'
  | 'parse_safety'
  | 'schema'
  | 'canonical_form'
  | 'resource_limit'
  | 'identity_ambiguity'
  | 'domain_invariant'
  | 'stale_revision'
  | 'lock_contention'
  | 'filesystem_durability'
  | 'projection_sync';

export class IssueError extends Error {
  public readonly category: IssueErrorCategory;
  public readonly issueIds?: readonly string[];
  public readonly paths?: readonly string[];
  public readonly transactionId?: string;
  public readonly limit?: string;
  public readonly retryable: boolean;

  public constructor(
    category: IssueErrorCategory,
    message: string,
    details: {
      issueIds?: readonly string[];
      paths?: readonly string[];
      transactionId?: string;
      limit?: string;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'IssueError';
    this.category = category;
    this.issueIds = details.issueIds;
    this.paths = details.paths;
    this.transactionId = details.transactionId;
    this.limit = details.limit;
    this.retryable = details.retryable ?? false;
  }
}

export interface IssueContractLimits {
  fileBytes: number;
  bodyBytes: number;
  commentBodyBytes: number;
  comments: number;
  scalarBytes: number;
  depth: number;
  nodes: number;
  metadataKeys: number;
  filenameBytes: number;
}

export type IssueMetadataValue =
  string | boolean | null | number | IssueMetadataValue[] | { [key: string]: IssueMetadataValue };
export type IssueMetadata = Record<string, IssueMetadataValue>;
export type IssueMetadataText = string & { readonly __issueMetadataText: unique symbol };

export const ISSUE_TYPES = ['initiative', 'epic', 'story', 'task', 'bug'] as const;
export type CanonicalIssueType = (typeof ISSUE_TYPES)[number];
export const ISSUE_STATUSES = ['open', 'in_progress', 'done', 'closed'] as const;
export type CanonicalIssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueLocation = 'active' | 'archived';

export interface CanonicalIssueComment {
  id: string;
  created_at: string;
  created_by: string;
  body: string;
}

export interface CanonicalIssueDocument {
  version: typeof ISSUE_CONTRACT_VERSION;
  id: string;
  type: CanonicalIssueType;
  title: string;
  status: CanonicalIssueStatus;
  created_at: string;
  updated_at: string;
  created_by?: string;
  assigned_to?: string;
  parent?: string;
  depends_on?: string[];
  relates_to?: string[];
  duplicates?: string[];
  supersedes?: string[];
  documents?: string[];
  metadata?: IssueMetadata;
  body: string;
  comments: CanonicalIssueComment[];
}

export interface DecodeIssueOptions {
  expectedId?: string;
  issuePrefix?: string;
  limits?: Partial<IssueContractLimits>;
  requireCanonical?: boolean;
}

export interface DecodedIssueDocument {
  issue: CanonicalIssueDocument;
  bytes: Uint8Array;
  revision: string;
  canonical: boolean;
}

const TOP_LEVEL_FIELDS = [
  'version',
  'id',
  'type',
  'title',
  'status',
  'created_at',
  'updated_at',
  'created_by',
  'assigned_to',
  'parent',
  'depends_on',
  'relates_to',
  'duplicates',
  'supersedes',
  'documents',
  'metadata',
  'body',
  'comments',
] as const;
const TOP_LEVEL_FIELD_SET = new Set<string>(TOP_LEVEL_FIELDS);
const OPTIONAL_LIST_FIELDS = ['depends_on', 'relates_to', 'duplicates', 'supersedes', 'documents'] as const;
const UTF8 = new TextEncoder();
const CANONICAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

export function issueMetadataText(value: string): IssueMetadataText {
  return value as IssueMetadataText;
}

export function parseIssueMetadataText(
  text: IssueMetadataText | string,
  limitOverrides: Partial<IssueContractLimits> = {},
): IssueMetadata {
  const limits = resolveLimits(limitOverrides);
  if (UTF8.encode(text).byteLength > limits.fileBytes) throw limitError('fileBytes');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw schemaError('metadata text is not valid JSON');
  }
  if (!isMetadataObject(value)) throw schemaError('metadata JSON root must be an object');
  return normalizeIssueMetadata(value, limits);
}

export function normalizeIssueMetadata(
  value: Record<string, unknown>,
  limitOverrides: Partial<IssueContractLimits> = {},
): IssueMetadata {
  const limits = resolveLimits(limitOverrides);
  let nodes = 0;
  let keys = 0;
  const ancestors = new Set<object>();
  const visit = (input: unknown, depth: number): IssueMetadataValue => {
    if (depth > limits.depth) throw limitError('depth');
    if (++nodes > limits.nodes) throw limitError('nodes');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') {
      if (typeof input === 'string') assertScalar(input, limits);
      return input;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw schemaError('metadata numbers must be finite');
      return Object.is(input, -0) ? 0 : input;
    }
    if (typeof input !== 'object' || input === undefined) throw schemaError('metadata contains an unsupported value');
    if (ancestors.has(input)) throw schemaError('metadata must not contain cycles');
    ancestors.add(input);
    try {
      if (Array.isArray(input)) return input.map((item) => visit(item, depth + 1));
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) {
        throw schemaError('metadata mappings must be plain objects');
      }
      const output: IssueMetadata = Object.create(null) as IssueMetadata;
      const seen = new Set<string>();
      for (const [key, item] of Object.entries(input)) {
        assertScalar(key, limits);
        if (++keys > limits.metadataKeys) throw limitError('metadataKeys');
        assertComparisonKey(key, seen);
        output[key] = visit(item, depth + 1);
      }
      return output;
    } finally {
      ancestors.delete(input);
    }
  };
  const result = visit(value, 1);
  if (!isMetadataObject(result)) throw schemaError('metadata must be an object');
  assertMetadataRootKeys(result);
  return result;
}

export function encodeCanonicalIssue(
  input: CanonicalIssueDocument,
  limitOverrides: Partial<IssueContractLimits> = {},
): Uint8Array {
  const limits = resolveLimits(limitOverrides);
  const issue = validateSemanticIssue(input, limits);
  const lines: string[] = [];
  for (const field of TOP_LEVEL_FIELDS) {
    const value = issue[field as keyof CanonicalIssueDocument];
    if (value === undefined) continue;
    emitProperty(lines, field, value as SafeValue, 0);
  }
  const bytes = UTF8.encode(`${lines.join('\n')}\n`);
  if (bytes.byteLength > limits.fileBytes) throw limitError('fileBytes');
  return bytes;
}

export function encodeCanonicalIssueText(
  input: CanonicalIssueDocument,
  limitOverrides: Partial<IssueContractLimits> = {},
): string {
  return new TextDecoder().decode(encodeCanonicalIssue(input, limitOverrides));
}

export function decodeIssueDocument(
  source: string | Uint8Array,
  options: DecodeIssueOptions = {},
): DecodedIssueDocument {
  const limits = resolveLimits(options.limits ?? {});
  const sourceBytes = decodeSourceBytes(source, limits);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  assertYamlPreamble(text);
  const documents = parseAllDocuments(text, {
    version: '1.2',
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
    keepSourceTokens: true,
    prettyErrors: false,
  });
  if (documents.length !== 1)
    throw new IssueError('parse_safety', 'canonical issue must contain exactly one YAML document');
  const document = documents[0];
  if (!document) throw new IssueError('parse_safety', 'canonical issue document is missing');
  if (document.errors.length > 0) {
    throw new IssueError('parse_safety', `invalid YAML (${document.errors[0]?.code ?? 'parse error'})`);
  }
  if (document.warnings.length > 0) throw new IssueError('parse_safety', 'YAML parser warnings are not permitted');
  assertNoDocumentPresentation(document);
  const state: WalkState = { nodes: 0, metadataKeys: 0, limits };
  const root = yamlNodeToValue(document.contents, 1, state, false);
  if (!isMetadataObject(root)) throw schemaError('issue document root must be a mapping');
  const issue = issueFromMapping(root, options, limits);
  const bytes = encodeCanonicalIssue(issue, limits);
  const canonical = bytesEqual(sourceBytes, bytes);
  if (!canonical && options.requireCanonical === true) {
    throw new IssueError('canonical_form', 'issue YAML is valid but is not in canonical form');
  }
  return { issue, bytes: sourceBytes, revision: computeIssueRevision(sourceBytes), canonical };
}

export const decodeCanonicalIssue = decodeIssueDocument;
export const canonicalizeIssueDocument = encodeCanonicalIssue;

export class IssueToolResultEncoder {
  public encode(value: unknown): string {
    return encodeToolJson(value, new Set<object>());
  }

  public static stringify(value: unknown): string {
    return new IssueToolResultEncoder().encode(value);
  }
}

export function encodeIssueToolResult(value: unknown): string {
  return IssueToolResultEncoder.stringify(value);
}

export function computeIssueRevision(source: CanonicalIssueDocument | Uint8Array): string {
  const bytes = source instanceof Uint8Array ? source : encodeCanonicalIssue(source);
  return `v1:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function slugifyIssueTitle(title: string): string {
  assertUnicodeScalarString(title, 'title');
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'issue';
}

export const createIssueSlug = slugifyIssueTitle;

export function canonicalIssueFilename(
  id: string,
  title: string,
  filenameByteLimit: number = ISSUE_CONTRACT_LIMITS.filenameBytes,
): string {
  if (!isSafeIssueId(id)) throw new IssueError('path_safety', 'issue ID is unsafe for a canonical filename');
  if (
    !Number.isInteger(filenameByteLimit) ||
    filenameByteLimit <= 0 ||
    filenameByteLimit > ISSUE_CONTRACT_LIMITS.filenameBytes
  ) {
    throw new IssueError('configuration', 'filename byte limit is invalid', { limit: 'filenameBytes' });
  }
  const suffix = '.yml';
  const fixedBytes = UTF8.encode(`${id}-${suffix}`).byteLength;
  const available = filenameByteLimit - fixedBytes;
  if (available < UTF8.encode('issue').byteLength) throw limitError('filenameBytes');
  let slug = slugifyIssueTitle(title);
  while (UTF8.encode(slug).byteLength > available) slug = slug.slice(0, -1);
  slug = slug.replace(/-+$/g, '');
  if (!slug) throw limitError('filenameBytes');
  return `${id}-${slug}${suffix}`;
}

export const createCanonicalIssueFilename = canonicalIssueFilename;

type SafeValue = string | boolean | null | number | SafeValue[] | { [key: string]: SafeValue };
interface WalkState {
  nodes: number;
  metadataKeys: number;
  limits: IssueContractLimits;
}

function resolveLimits(overrides: Partial<IssueContractLimits>): IssueContractLimits {
  const limits = { ...ISSUE_CONTRACT_LIMITS, ...overrides };
  for (const key of Object.keys(ISSUE_CONTRACT_LIMITS) as (keyof IssueContractLimits)[]) {
    const value = limits[key];
    if (!Number.isInteger(value) || value <= 0 || value > ISSUE_CONTRACT_LIMITS[key]) {
      throw new IssueError('configuration', `issue contract limit ${key} is invalid`, { limit: key });
    }
  }
  return limits;
}

function decodeSourceBytes(source: string | Uint8Array, limits: IssueContractLimits): Uint8Array {
  let bytes: Uint8Array;
  if (typeof source === 'string') {
    assertUnicodeScalarString(source, 'YAML source');
    bytes = UTF8.encode(source);
  } else {
    bytes = source;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new IssueError('parse_safety', 'issue file is not valid UTF-8');
    }
  }
  if (bytes.byteLength > limits.fileBytes) throw limitError('fileBytes');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new IssueError('parse_safety', 'UTF-8 byte-order marks are not permitted');
  }
  return bytes;
}

function assertYamlPreamble(text: string): void {
  if (text.trimStart().startsWith('%')) throw new IssueError('parse_safety', 'YAML directives are not permitted');
}

function assertNoDocumentPresentation(_document: Document.Parsed): void {}

function yamlNodeToValue(node: Node | null, depth: number, state: WalkState, metadata: boolean): SafeValue {
  if (!node) throw schemaError('YAML node is missing');
  if (depth > state.limits.depth) throw limitError('depth');
  if (++state.nodes > state.limits.nodes) throw limitError('nodes');
  assertNodeSafety(node);
  if (isAlias(node)) throw new IssueError('parse_safety', 'YAML aliases are not permitted');
  if (isScalar(node)) return scalarNodeValue(node, state.limits);
  if (isSeq(node)) return node.items.map((item) => yamlNodeToValue(item as Node | null, depth + 1, state, metadata));
  if (!isMap(node)) throw schemaError('unsupported YAML node');
  const result: Record<string, SafeValue> = Object.create(null) as Record<string, SafeValue>;
  const compared = new Set<string>();
  for (const pair of node.items) {
    if (++state.nodes > state.limits.nodes) throw limitError('nodes');
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
      throw new IssueError('parse_safety', 'YAML mapping keys must be strings');
    }
    assertNodeSafety(pair.key);
    const key = pair.key.value;
    assertScalar(key, state.limits);
    assertComparisonKey(key, compared);
    if (metadata && ++state.metadataKeys > state.limits.metadataKeys) throw limitError('metadataKeys');
    result[key] = yamlNodeToValue(pair.value as Node | null, depth + 1, state, metadata || key === 'metadata');
  }
  return result;
}

function assertNodeSafety(node: Node): void {
  if ('anchor' in node && node.anchor) throw new IssueError('parse_safety', 'YAML anchors are not permitted');
  if (node.tag) throw new IssueError('parse_safety', 'explicit YAML tags are not permitted');
}

function scalarNodeValue(node: Scalar, limits: IssueContractLimits): SafeValue {
  const source = node.source ?? String(node.value);
  assertScalar(source, limits);
  if (typeof node.value === 'number') {
    if (!Number.isFinite(node.value)) throw new IssueError('parse_safety', 'only finite numbers are permitted');
    return Object.is(node.value, -0) ? 0 : node.value;
  }
  if (typeof node.value === 'bigint') {
    const value = Number(node.value);
    if (!Number.isFinite(value)) throw new IssueError('parse_safety', 'only finite numbers are permitted');
    return value;
  }
  if (typeof node.value === 'string' || typeof node.value === 'boolean' || node.value === null) {
    if (typeof node.value === 'string') assertUnicodeScalarString(node.value, 'YAML scalar');
    return node.value;
  }
  throw new IssueError('parse_safety', 'unsupported YAML scalar type');
}

function issueFromMapping(
  source: IssueMetadata,
  options: DecodeIssueOptions,
  limits: IssueContractLimits,
): CanonicalIssueDocument {
  for (const key of Object.keys(source))
    if (!TOP_LEVEL_FIELD_SET.has(key)) throw schemaError(`unknown top-level field: ${key}`);
  if (!('version' in source)) throw schemaError('required field is missing: version');
  if (source.version !== 1) {
    if (typeof source.version === 'number') {
      throw schemaError(`unsupported issue contract version: ${String(source.version)}`);
    }
    throw schemaError('version must be the integer 1');
  }
  for (const required of ['id', 'type', 'title', 'status', 'created_at', 'updated_at', 'body', 'comments']) {
    if (!(required in source)) throw schemaError(`required field is missing: ${required}`);
  }
  const issue = source as unknown as CanonicalIssueDocument;
  return validateSemanticIssue(issue, limits, options);
}

function validateSemanticIssue(
  source: CanonicalIssueDocument,
  limits: IssueContractLimits,
  options: DecodeIssueOptions = {},
): CanonicalIssueDocument {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw schemaError('issue must be a mapping');
  for (const key of Object.keys(source))
    if (!TOP_LEVEL_FIELD_SET.has(key)) throw schemaError(`unknown top-level field: ${key}`);
  if (source.version !== ISSUE_CONTRACT_VERSION) throw schemaError('unsupported issue contract version');
  const id = requireString(source.id, 'id', limits);
  validateIssueId(id, options.issuePrefix);
  if (options.expectedId !== undefined && id !== options.expectedId)
    throw schemaError('issue ID does not match its filename');
  if (!ISSUE_TYPES.includes(source.type)) throw schemaError('type is invalid');
  const title = requireString(source.title, 'title', limits);
  if (title.length === 0) throw schemaError('title must not be empty');
  if (!ISSUE_STATUSES.includes(source.status)) throw schemaError('status is invalid');
  const createdAt = requireString(source.created_at, 'created_at', limits);
  const updatedAt = requireString(source.updated_at, 'updated_at', limits);
  assertCanonicalTimestamp(createdAt, 'created_at');
  assertCanonicalTimestamp(updatedAt, 'updated_at');
  const optionalScalars = ['created_by', 'assigned_to', 'parent'] as const;
  for (const field of optionalScalars) {
    const value = source[field];
    if (value !== undefined) {
      requireString(value, field, limits);
      if (value.length === 0) throw schemaError(`${field} must not be empty`);
      if (field === 'parent') validateIssueId(value, options.issuePrefix);
    }
  }
  for (const field of OPTIONAL_LIST_FIELDS) {
    const value = source[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length === 0) throw schemaError(`${field} must be omitted when empty`);
    const seen = new Set<string>();
    for (const entry of value) {
      requireString(entry, field, limits);
      if (field !== 'documents') validateIssueId(entry, options.issuePrefix);
      if (seen.has(entry)) throw schemaError(`${field} must contain unique values`);
      seen.add(entry);
    }
  }
  const body = requireString(source.body, 'body', limits);
  if (UTF8.encode(body).byteLength > limits.bodyBytes) throw limitError('bodyBytes');
  if (!Array.isArray(source.comments)) throw schemaError('comments must be a sequence');
  if (source.comments.length > limits.comments) throw limitError('comments');
  validateComments(source.comments, id, limits);
  let metadata: IssueMetadata | undefined;
  if (source.metadata !== undefined) {
    if (!isMetadataObject(source.metadata) || Object.keys(source.metadata).length === 0) {
      throw schemaError('metadata must be a non-empty mapping when present');
    }
    metadata = normalizeIssueMetadata(source.metadata, limits);
  }
  const normalizedLists = Object.fromEntries(
    OPTIONAL_LIST_FIELDS.flatMap((field) => {
      const values = source[field];
      return values === undefined ? [] : [[field, [...values].sort(compareCodePoints)]];
    }),
  );
  return {
    ...source,
    ...normalizedLists,
    id,
    title,
    created_at: createdAt,
    updated_at: updatedAt,
    body,
    ...(metadata ? { metadata } : {}),
  };
}

function validateComments(comments: CanonicalIssueComment[], issueId: string, limits: IssueContractLimits): void {
  let previous = 0n;
  const expression = new RegExp(`^${escapeRegex(issueId)}-C(\\d{4,})$`);
  const ids = new Set<string>();
  for (const comment of comments) {
    if (!comment || typeof comment !== 'object' || Array.isArray(comment))
      throw schemaError('comment must be a mapping');
    const keys = Object.keys(comment);
    if (keys.length !== 4 || keys.some((key) => !['id', 'created_at', 'created_by', 'body'].includes(key))) {
      throw schemaError('comment contains unknown or missing fields');
    }
    const id = requireString(comment.id, 'comments.id', limits);
    const match = expression.exec(id);
    if (!match?.[1]) throw schemaError('comment ID is invalid');
    const sequence = BigInt(match[1]);
    if (sequence <= previous || ids.has(id)) throw schemaError('comment IDs must be unique and strictly increasing');
    previous = sequence;
    ids.add(id);
    assertCanonicalTimestamp(requireString(comment.created_at, 'comments.created_at', limits), 'comments.created_at');
    if (!requireString(comment.created_by, 'comments.created_by', limits))
      throw schemaError('comment author must not be empty');
    const body = requireString(comment.body, 'comments.body', limits);
    if (!body.trim()) throw schemaError('comment body must not be empty');
    if (UTF8.encode(body).byteLength > limits.commentBodyBytes) throw limitError('commentBodyBytes');
  }
}

function requireString(value: unknown, field: string, limits: IssueContractLimits): string {
  if (typeof value !== 'string') throw schemaError(`${field} must be a string`);
  assertScalar(value, limits);
  return value;
}

function validateIssueId(id: string, prefix?: string): void {
  if (prefix === undefined ? !isSafeIssueId(id) : !isPrefixedIdentity(id, prefix)) {
    throw schemaError('issue ID does not use the configured prefix');
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSafeIssueId(id: string): boolean {
  return (
    id.length > 0 &&
    (/\d$/u.test(id) || (id.length >= 26 && isUlid(id.slice(-26)))) &&
    !/[\s/\\]/u.test(id) &&
    !Array.from(id).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    }) &&
    !/[<>:"|?*]/u.test(id) &&
    id !== '.' &&
    id !== '..'
  );
}

function assertCanonicalTimestamp(value: string, field: string): void {
  const match = CANONICAL_TIMESTAMP.exec(value);
  if (!match) throw schemaError(`${field} must be a canonical UTC millisecond timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw schemaError(`${field} is not a valid calendar timestamp`);
  }
}

function emitProperty(lines: string[], key: string, value: SafeValue, indent: number): void {
  const prefix = `${' '.repeat(indent)}${quoteYamlString(key)}:`;
  if (isInlineValue(value)) {
    lines.push(`${prefix} ${emitInline(value)}`);
    return;
  }
  lines.push(prefix);
  if (key === 'comments' && Array.isArray(value)) {
    emitComments(lines, value, indent + 2);
    return;
  }
  emitNested(lines, value as SafeValue[] | { [key: string]: SafeValue }, indent + 2);
}

function emitComments(lines: string[], comments: SafeValue[], indent: number): void {
  const fields = ['id', 'created_at', 'created_by', 'body'];
  for (const value of comments) {
    const comment = value as { [key: string]: SafeValue };
    fields.forEach((field, index) => {
      const prefix = index === 0 ? `${' '.repeat(indent)}- ` : ' '.repeat(indent + 2);
      lines.push(`${prefix}${quoteYamlString(field)}: ${emitInline(comment[field] as SafeValue)}`);
    });
  }
}

function emitNested(lines: string[], value: SafeValue[] | { [key: string]: SafeValue }, indent: number): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      const prefix = `${' '.repeat(indent)}-`;
      if (isInlineValue(item)) lines.push(`${prefix} ${emitInline(item)}`);
      else if (Array.isArray(item)) {
        lines.push(prefix);
        emitNested(lines, item, indent + 2);
      } else {
        const entries = sortedEntries(item as { [key: string]: SafeValue });
        const [first, ...rest] = entries;
        if (!first) {
          lines.push(`${prefix} {}`);
          continue;
        }
        const [firstKey, firstValue] = first;
        if (isInlineValue(firstValue)) lines.push(`${prefix} ${quoteYamlString(firstKey)}: ${emitInline(firstValue)}`);
        else {
          lines.push(`${prefix} ${quoteYamlString(firstKey)}:`);
          emitNested(lines, firstValue as SafeValue[] | { [key: string]: SafeValue }, indent + 4);
        }
        for (const [key, child] of rest) emitProperty(lines, key, child, indent + 2);
      }
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of sortedEntries(value)) emitProperty(lines, key, child, indent);
  }
}

function sortedEntries(value: { [key: string]: SafeValue }): [string, SafeValue][] {
  return Object.entries(value).sort(([left], [right]) => compareCodePoints(left, right));
}

function isInlineValue(value: SafeValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value === null || typeof value !== 'object' || Object.keys(value).length === 0;
}

function emitInline(value: SafeValue): string {
  if (typeof value === 'string') return quoteYamlString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw schemaError('runtime numbers must be finite');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return '[]';
  return '{}';
}

function quoteYamlString(value: string): string {
  assertUnicodeScalarString(value, 'string');
  let result = '"';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '"' || character === '\\') result += `\\${character}`;
    else if (code === 0x08) result += '\\b';
    else if (code === 0x09) result += '\\t';
    else if (code === 0x0a) result += '\\n';
    else if (code === 0x0c) result += '\\f';
    else if (code === 0x0d) result += '\\r';
    else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      result += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
    } else result += character;
  }
  return `${result}"`;
}

function assertMetadataRootKeys(metadata: IssueMetadata): void {
  for (const key of Object.keys(metadata)) {
    if (TOP_LEVEL_FIELD_SET.has(key)) throw schemaError(`metadata field shadows managed field: ${key}`);
  }
}

function assertComparisonKey(key: string, seen: Set<string>): void {
  const comparison = key.normalize('NFKC').toLowerCase();
  if (seen.has(comparison)) throw schemaError('mapping keys collide under portable comparison');
  seen.add(comparison);
}

function assertScalar(value: string, limits: IssueContractLimits): void {
  assertUnicodeScalarString(value, 'scalar');
  if (UTF8.encode(value).byteLength > limits.scalarBytes) throw limitError('scalarBytes');
}

function assertUnicodeScalarString(value: string, field: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw schemaError(`${field} contains an unpaired surrogate`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw schemaError(`${field} contains an unpaired surrogate`);
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function isMetadataObject(value: unknown): value is IssueMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function schemaError(message: string): IssueError {
  return new IssueError('schema', message);
}

function limitError(limit: keyof IssueContractLimits): IssueError {
  return new IssueError('resource_limit', `issue contract resource limit exceeded: ${limit}`, { limit });
}

function encodeToolJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw schemaError('tool result contains a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw schemaError('tool result contains an unsupported value');
  if (ancestors.has(value)) throw schemaError('tool result must not contain cycles');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => (item === undefined ? 'null' : encodeToolJson(item, ancestors))).join(',')}]`;
    }
    const fields: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue;
      fields.push(`${JSON.stringify(key)}:${encodeToolJson(child, ancestors)}`);
    }
    return `{${fields.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}
