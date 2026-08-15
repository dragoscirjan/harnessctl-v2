import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { ConfigError, readConfig, type ConfigDocument } from './config.js';
import { validateCanonicalIssueGraph } from './issues.js';
import {
  LocalPersistenceError,
  ensureLocalCache,
  loadLocalSnapshot,
  synchronizeLocalCache,
  withLocalBarrier,
  type BarrierLease,
} from './local-persistence.js';
import {
  formatSchemaError,
  memoryRecordSchema,
  memoryTombstoneSchema,
  type Confidence,
  type MemoryRecord,
  type MemorySource,
  type MemoryTombstone,
  type MemoryType,
  type RecordType,
  type SourceKind,
} from './schemas.js';

export type { Confidence, MemoryRecord, MemorySource, MemoryTombstone, MemoryType, RecordType, SourceKind };

export interface StoreMemoryInput {
  memory_type: MemoryType;
  record_type: RecordType;
  topic?: string;
  summary: string;
  details?: string | null;
  source: MemorySource;
  created_by: string;
  confidence: Confidence;
  tags?: string[];
}

export interface SearchMemoryInput {
  query?: string;
  topic?: string;
  memory_type?: MemoryType;
  limit?: number;
  max_chars?: number;
  include_superseded?: boolean;
}

export interface MemoryValidationReport {
  valid: boolean;
  records: number;
  tombstones: number;
  errors: string[];
}

export class MemoryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MemoryError';
  }
}

export class MemoryConflictError extends MemoryError {
  public constructor(message: string) {
    super(message);
    this.name = 'MemoryConflictError';
  }
}

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
const FOLDERS: Record<RecordType, string> = {
  fact: 'facts',
  decision: 'decisions',
  event: 'events',
  lesson: 'lessons',
};
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\b(?:sk|rk)-(?:live|test)-[A-Za-z0-9_-]{16,}\b/u,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/iu,
];
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_MEMORY_FILES = 10_000;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
const MAX_QUERY_BYTES = 16 * 1024;
const MAX_BATCH_PATHS = 10_000;
const MAX_BEFORE_BYTES = 256 * 1024 * 1024;
const MAX_ERRORS = 100;
const MUTATION_SUMMARY_CHARACTERS = 240;
const MUTATION_DETAILS_CHARACTERS = 2_000;
const MUTATION_DETAILS_LINES = 12;

interface MemorySettings {
  organizationId: string;
  projectId: string;
  defaultTopic: string;
  root: string;
  limit: number;
  maxChars: number;
  includeSuperseded: boolean;
}

interface MemoryState {
  records: MemoryRecord[];
  tombstones: MemoryTombstone[];
  activeIds: Set<string>;
}

interface Replacement {
  path: string;
  bytes?: Uint8Array;
  exclusive?: boolean;
}

interface ImportCandidate {
  value: unknown;
  line: number;
}

interface ValidatedImport {
  records: MemoryRecord[];
  tombstones: MemoryTombstone[];
}

export function storeMemory(cwd: string, input: StoreMemoryInput): MemoryRecord {
  validateMutationCompactness(input, 'memory_store');
  return execute(cwd, true, (settings, state, lease) => {
    const record = makeRecord(settings, input, []);
    validateRecord(record, settings);
    assertUniqueId(state, record.id);
    applyBatch(lease, [{ path: recordPath(settings, record), bytes: encode(record), exclusive: true }]);
    return record;
  });
}

export function supersedeMemory(cwd: string, targetId: string, input: StoreMemoryInput): MemoryRecord {
  validateMutationCompactness(input, 'memory_supersede');
  return execute(cwd, true, (settings, state, lease) => {
    requireActiveTarget(state, targetId);
    const record = makeRecord(settings, input, [targetId]);
    validateRecord(record, settings);
    assertUniqueId(state, record.id);
    applyBatch(lease, [{ path: recordPath(settings, record), bytes: encode(record), exclusive: true }]);
    return record;
  });
}

export function deleteMemory(
  cwd: string,
  targetId: string,
  reason: string,
  source: MemorySource,
  createdBy: string,
): MemoryTombstone {
  return execute(cwd, true, (settings, state, lease) => {
    requireActiveTarget(state, targetId);
    const tombstone: MemoryTombstone = {
      schema_version: 1,
      id: createUlid(),
      organization_id: settings.organizationId,
      project_id: settings.projectId,
      target_id: targetId,
      reason,
      source,
      created_at: new Date().toISOString(),
      created_by: createdBy,
    };
    validateTombstone(tombstone, settings);
    assertUniqueId(state, tombstone.id);
    applyBatch(lease, [
      { path: `${settings.root}/tombstones/${tombstone.id}.yaml`, bytes: encode(tombstone), exclusive: true },
    ]);
    return tombstone;
  });
}

export function getMemory(cwd: string, id: string): MemoryRecord | MemoryTombstone {
  assertUlid(id, 'id');
  return execute(cwd, false, (_settings, state) => {
    const result = [...state.records, ...state.tombstones].find((item) => item.id === id);
    if (!result) throw new MemoryError(`Memory record not found: ${id}`);
    return result;
  });
}

export function listMemory(cwd: string, input: SearchMemoryInput = {}): MemoryRecord[] {
  return execute(cwd, false, (settings, state) => {
    const includeSuperseded = input.include_superseded ?? settings.includeSuperseded;
    const limit = bounded(input.limit ?? settings.limit, 1, 100, 'limit');
    return state.records
      .filter((record) => includeSuperseded || state.activeIds.has(record.id))
      .filter((record) => !input.topic || record.topic === input.topic)
      .filter((record) => !input.memory_type || record.memory_type === input.memory_type)
      .sort(newestFirst)
      .slice(0, limit);
  });
}

export function searchMemory(cwd: string, input: SearchMemoryInput = {}): MemoryRecord[] {
  if (Buffer.byteLength(input.query ?? '', 'utf8') > MAX_QUERY_BYTES)
    throw new MemoryError('query exceeds the 16 KiB memory search limit.');
  return execute(cwd, false, (settings, state) => {
    const limit = bounded(input.limit ?? settings.limit, 1, 100, 'limit');
    const maxChars = bounded(input.max_chars ?? settings.maxChars, 256, 100_000, 'max_chars');
    const terms = searchTerms(input.query);
    const includeSuperseded = input.include_superseded ?? settings.includeSuperseded;
    const matches = state.records
      .filter((record) => includeSuperseded || state.activeIds.has(record.id))
      .filter((record) => terms.every((term) => searchableText(record).includes(term)))
      .filter((record) => !input.topic || record.topic === input.topic)
      .filter((record) => !input.memory_type || record.memory_type === input.memory_type)
      .sort(newestFirst);
    const results: MemoryRecord[] = [];
    let used = 0;
    for (const match of matches) {
      if (results.length >= limit) break;
      const size = JSON.stringify(match).length;
      if (used + size > maxChars) break;
      results.push(match);
      used += size;
    }
    return results;
  });
}

export function validateMemory(cwd: string): MemoryValidationReport {
  let settings: MemorySettings;
  try {
    settings = settingsFor(cwd);
  } catch (error: unknown) {
    return invalidReport(error);
  }
  try {
    return withLocalBarrier(cwd, (lease) => {
      let state: MemoryState;
      try {
        state = loadState(cwd, settings);
      } catch (error: unknown) {
        return invalidReport(error);
      }
      const report = { valid: true, records: state.records.length, tombstones: state.tombstones.length, errors: [] };
      let snapshot;
      try {
        assertCanonicalIssueGraph(cwd);
        snapshot = loadLocalSnapshot(lease);
      } catch {
        return report;
      }
      ensureLocalCache(lease, snapshot);
      return report;
    });
  } catch (error: unknown) {
    if (error instanceof LocalPersistenceError && error.category === 'synchronization') throw asMemoryError(error);
    return invalidReport(error);
  }
}

export function exportMemory(cwd: string): string {
  return execute(cwd, false, (_settings, state) => {
    const result = `${[...state.records, ...state.tombstones].map((item) => JSON.stringify(item)).join('\n')}\n`;
    if (Buffer.byteLength(result, 'utf8') > MAX_PAYLOAD_BYTES)
      throw new MemoryError('memory export exceeds the 64 MiB payload limit.');
    return result;
  });
}

export function importMemory(cwd: string, content: string, preview = false): MemoryValidationReport {
  let validated: ValidatedImport;
  try {
    if (Buffer.byteLength(content, 'utf8') > MAX_PAYLOAD_BYTES)
      throw new MemoryError('memory import exceeds the 64 MiB payload limit.');
    const settings = settingsFor(cwd);
    const state = loadState(cwd, settings);
    assertCanonicalIssueGraph(cwd);
    validated = validateImportBatch(parseImportCandidates(content), settings, state);
  } catch (error: unknown) {
    if (preview) return invalidReport(error);
    throw asMemoryError(error);
  }
  if (preview)
    return { valid: true, records: validated.records.length, tombstones: validated.tombstones.length, errors: [] };

  return execute(cwd, true, (settings, state, lease) => {
    const current = validateImportBatch(parseImportCandidates(content), settings, state);
    const replacements: Replacement[] = [
      ...current.records.map((record) => ({
        path: recordPath(settings, record),
        bytes: encode(record),
        exclusive: true,
      })),
      ...current.tombstones.map((value) => ({
        path: `${settings.root}/tombstones/${value.id}.yaml`,
        bytes: encode(value),
        exclusive: true,
      })),
    ];
    if (replacements.length) applyBatch(lease, replacements);
    return { valid: true, records: current.records.length, tombstones: current.tombstones.length, errors: [] };
  });
}

function parseImportCandidates(content: string): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      candidates.push({ value: JSON.parse(line) as unknown, line: index + 1 });
    } catch (error: unknown) {
      throw new MemoryError(`Invalid JSONL at line ${index + 1}: ${errorMessage(error)}`);
    }
  }
  return candidates;
}

function validateImportBatch(
  candidates: readonly ImportCandidate[],
  settings: MemorySettings,
  state: MemoryState,
): ValidatedImport {
  const records: MemoryRecord[] = [];
  const tombstones: MemoryTombstone[] = [];
  const ids = new Set([...state.records, ...state.tombstones].map((item) => item.id));
  for (const candidate of candidates) {
    const item = candidate.value;
    if (isTombstone(item)) {
      validateTombstone(item, settings);
      if (ids.has(item.id)) throw new MemoryConflictError(`Memory ID already exists: ${item.id}`);
      ids.add(item.id);
      tombstones.push(item);
      continue;
    }
    validateRecord(item, settings);
    validateMutationCompactness(item, 'memory_import', candidate.line, item.id);
    if (ids.has(item.id)) throw new MemoryConflictError(`Memory ID already exists: ${item.id}`);
    ids.add(item.id);
    records.push(item);
  }
  assertImportRelationships(state, records, tombstones);
  return { records, tombstones };
}

function execute<T>(
  cwd: string,
  mutation: boolean,
  operation: (settings: MemorySettings, state: MemoryState, lease: BarrierLease) => T,
): T {
  const settings = settingsFor(cwd);
  try {
    return withLocalBarrier(cwd, (lease) => {
      const state = loadState(cwd, settings);
      assertCanonicalIssueGraph(cwd);
      const snapshot = loadLocalSnapshot(lease);
      ensureLocalCache(lease, snapshot);
      const result = operation(settings, state, lease);
      if (mutation) {
        loadState(cwd, settings);
        assertCanonicalIssueGraph(cwd);
        synchronizeLocalCache(lease, loadLocalSnapshot(lease), () => loadLocalSnapshot(lease));
      }
      return result;
    });
  } catch (error: unknown) {
    throw asMemoryError(error);
  }
}

function assertCanonicalIssueGraph(cwd: string): void {
  const report = validateCanonicalIssueGraph(cwd);
  if (!report.valid) throw new MemoryError('Cannot project an invalid canonical issue graph.');
}

function settingsFor(cwd: string): MemorySettings {
  const config = readConfig(cwd);
  if (config instanceof ConfigError) throw new MemoryError(config.message);
  const memory = mapping(config.memory, 'memory');
  if (memory.backend !== 'repository') throw new MemoryError('Repository memory backend is not configured.');
  const namespace = mapping(memory.namespace, 'memory.namespace');
  const retrieval = mapping(memory.retrieval, 'memory.retrieval');
  const repository = mapping(memory.repository, 'memory.repository');
  return {
    organizationId: stringValue(namespace.organization_id, 'memory.namespace.organization_id'),
    projectId: stringValue(namespace.project_id, 'memory.namespace.project_id'),
    defaultTopic: stringValue(namespace.default_topic, 'memory.namespace.default_topic'),
    root: safeProjectPath(stringValue(repository.root, 'memory.repository.root')),
    limit: bounded(retrieval.limit, 1, 100, 'memory.retrieval.limit'),
    maxChars: bounded(retrieval.max_chars, 256, 100_000, 'memory.retrieval.max_chars'),
    includeSuperseded: booleanValue(retrieval.include_superseded, 'memory.retrieval.include_superseded'),
  };
}

function loadState(cwd: string, settings: MemorySettings): MemoryState {
  const root = resolve(cwd, settings.root);
  assertSafeRoot(cwd, settings.root);
  const records: MemoryRecord[] = [];
  const tombstones: MemoryTombstone[] = [];
  const ids = new Set<string>();
  let files = 0;
  let bytes = 0;
  for (const [recordType, folder] of Object.entries(FOLDERS) as Array<[RecordType, string]>) {
    for (const path of yamlFiles(join(root, folder))) {
      ({ files, bytes } = addResourceUsage(path, files, bytes));
      const record = parseCanonical(path);
      validateRecord(record, settings);
      if (record.record_type !== recordType)
        throw new MemoryError(`Record type does not match folder: ${relative(cwd, path)}`);
      if (ids.has(record.id)) throw new MemoryError(`Duplicate memory ID: ${record.id}`);
      ids.add(record.id);
      records.push(record);
    }
  }
  for (const path of yamlFiles(join(root, 'tombstones'))) {
    ({ files, bytes } = addResourceUsage(path, files, bytes));
    const tombstone = parseCanonical(path);
    validateTombstone(tombstone, settings);
    if (ids.has(tombstone.id)) throw new MemoryError(`Duplicate memory ID: ${tombstone.id}`);
    ids.add(tombstone.id);
    tombstones.push(tombstone);
  }
  const recordIds = new Set(records.map((record) => record.id));
  for (const record of records)
    for (const target of record.supersedes)
      if (!recordIds.has(target)) throw new MemoryError(`Broken supersedes reference: ${target}`);
  for (const tombstone of tombstones)
    if (!recordIds.has(tombstone.target_id))
      throw new MemoryError(`Broken tombstone reference: ${tombstone.target_id}`);
  assertAcyclic(records);
  records.sort(newestFirst);
  tombstones.sort((left, right) => newestFirst(left, right));
  const inactive = new Set(records.flatMap((record) => record.supersedes));
  tombstones.forEach((item) => inactive.add(item.target_id));
  return {
    records,
    tombstones,
    activeIds: new Set(records.filter((record) => !inactive.has(record.id)).map((record) => record.id)),
  };
}

function parseCanonical(path: string): unknown {
  const bytes = readFileSync(path);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new MemoryError(`Malformed UTF-8 memory YAML: ${path}`);
  }
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length || document.warnings.length)
    throw new MemoryError(
      `Malformed memory YAML ${path}: ${document.errors[0]?.message ?? document.warnings[0]?.message}`,
    );
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error: unknown) {
    throw new MemoryError(`Unsafe memory YAML ${path}: ${errorMessage(error)}`);
  }
}

function applyBatch(lease: BarrierLease, replacements: readonly Replacement[]): void {
  if (replacements.length > MAX_BATCH_PATHS) throw new MemoryError('Memory batch path limit exceeded.');
  const ordered = [...replacements].sort((left, right) => left.path.localeCompare(right.path));
  const before = new Map<string, Uint8Array | undefined>();
  const seen = new Set<string>();
  let retained = 0;
  for (const replacement of ordered) {
    const absolute = managedPath(lease.repositoryRoot, replacement.path);
    const key = replacement.path.normalize('NFKC').toLowerCase();
    if (seen.has(key)) throw new MemoryError('Memory batch contains duplicate paths.');
    seen.add(key);
    const previous = existsSync(absolute) ? readRegular(absolute) : undefined;
    if (replacement.exclusive && previous)
      throw new MemoryConflictError(`Memory path already exists: ${replacement.path}`);
    retained += previous?.byteLength ?? 0;
    if (retained > MAX_BEFORE_BYTES) throw new MemoryError('Memory batch before-image limit exceeded.');
    before.set(replacement.path, previous);
  }
  const applied: Replacement[] = [];
  try {
    for (const replacement of ordered) {
      applied.push(replacement);
      publish(lease.repositoryRoot, replacement.path, replacement.bytes);
    }
  } catch (error: unknown) {
    let rollbackFailed = false;
    for (const replacement of applied.reverse()) {
      try {
        publish(lease.repositoryRoot, replacement.path, before.get(replacement.path));
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) throw new MemoryError('Memory batch rollback failed; canonical state may be inconsistent.');
    throw error;
  }
}

function publish(root: string, path: string, bytes: Uint8Array | undefined): void {
  const absolute = managedPath(root, path);
  ensureSafeDirectories(root, relative(root, dirname(absolute)).split(sep).join('/'));
  if (!bytes) {
    if (existsSync(absolute)) unlinkSync(absolute);
    syncDirectory(dirname(absolute));
    return;
  }
  const temporary = join(dirname(absolute), `.${randomBytes(12).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, absolute);
    syncDirectory(dirname(absolute));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

function encode(value: MemoryRecord | MemoryTombstone): Uint8Array {
  return Buffer.from(stringify(value, { lineWidth: 0 }), 'utf8');
}

function makeRecord(settings: MemorySettings, input: StoreMemoryInput, supersedes: string[]): MemoryRecord {
  return {
    schema_version: 1,
    id: createUlid(),
    memory_type: input.memory_type,
    record_type: input.record_type,
    organization_id: settings.organizationId,
    project_id: settings.projectId,
    topic: input.topic ?? settings.defaultTopic,
    summary: input.summary,
    details: input.details ?? null,
    source: input.source,
    created_at: new Date().toISOString(),
    created_by: input.created_by,
    confidence: input.confidence,
    status: 'active',
    supersedes,
    tags: [...new Set(input.tags ?? [])].sort(),
  };
}

function validateRecord(value: unknown, settings: MemorySettings): asserts value is MemoryRecord {
  const result = memoryRecordSchema.safeParse(value);
  if (!result.success) throw new MemoryError(`Invalid memory record:\n${formatSchemaError(result.error)}`);
  assertScope(result.data, settings);
  scanSecrets(result.data);
}

function validateMutationCompactness(
  value: Pick<StoreMemoryInput, 'summary' | 'details'>,
  operation: 'memory_store' | 'memory_supersede' | 'memory_import',
  line?: number,
  recordId?: string,
): void {
  const context = [
    operation,
    line === undefined ? undefined : `line ${line}`,
    recordId ? `record ${recordId}` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ');
  const summaryCharacters = unicodeCharacters(value.summary);
  if (summaryCharacters > MUTATION_SUMMARY_CHARACTERS)
    throw new MemoryError(
      `${context}: summary has ${summaryCharacters} Unicode characters; limit is ${MUTATION_SUMMARY_CHARACTERS}.`,
    );
  if (value.details === undefined || value.details === null) return;
  const detailCharacters = unicodeCharacters(value.details);
  if (detailCharacters > MUTATION_DETAILS_CHARACTERS)
    throw new MemoryError(
      `${context}: details has ${detailCharacters} Unicode characters; limit is ${MUTATION_DETAILS_CHARACTERS}.`,
    );
  const nonEmptyLines = value.details.split(/\r\n|[\n\r\u2028\u2029]/u).filter((lineValue) => lineValue.trim()).length;
  if (nonEmptyLines > MUTATION_DETAILS_LINES)
    throw new MemoryError(
      `${context}: details has ${nonEmptyLines} non-empty lines; limit is ${MUTATION_DETAILS_LINES}.`,
    );
}

function unicodeCharacters(value: string): number {
  return Array.from(value).length;
}

function validateTombstone(value: unknown, settings: MemorySettings): asserts value is MemoryTombstone {
  const result = memoryTombstoneSchema.safeParse(value);
  if (!result.success) throw new MemoryError(`Invalid memory tombstone:\n${formatSchemaError(result.error)}`);
  assertScope(result.data, settings);
  scanSecrets(result.data);
}

function assertScope(value: { organization_id: string; project_id: string }, settings: MemorySettings): void {
  if (value.organization_id !== settings.organizationId || value.project_id !== settings.projectId)
    throw new MemoryError('Memory record scope does not match configured project namespace.');
}

function scanSecrets(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value)) || looksHighEntropy(value))
      throw new MemoryError(`Suspected secret at ${path}; memory write rejected.`);
  } else if (Array.isArray(value)) value.forEach((item, index) => scanSecrets(item, `${path}[${index}]`));
  else if (isMapping(value)) for (const [key, item] of Object.entries(value)) scanSecrets(item, `${path}.${key}`);
}

function looksHighEntropy(value: string): boolean {
  if (
    value.length < 32 ||
    ULID_PATTERN.test(value) ||
    /^[a-f0-9]{40,64}$/iu.test(value) ||
    /\s/u.test(value) ||
    !/[A-Za-z]/u.test(value) ||
    !/\d/u.test(value)
  )
    return false;
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy >= 4.2;
}

function assertImportRelationships(state: MemoryState, records: MemoryRecord[], tombstones: MemoryTombstone[]): void {
  const combined = [...state.records, ...records];
  const ids = new Set(combined.map((record) => record.id));
  for (const record of records)
    for (const target of record.supersedes)
      if (!ids.has(target)) throw new MemoryError(`Broken supersedes reference: ${target}`);
  for (const tombstone of tombstones)
    if (!ids.has(tombstone.target_id)) throw new MemoryError(`Broken tombstone reference: ${tombstone.target_id}`);
  assertAcyclic(combined);
}

function requireActiveTarget(state: MemoryState, targetId: string): void {
  assertUlid(targetId, 'target_id');
  if (!state.records.some((record) => record.id === targetId))
    throw new MemoryError(`Memory record not found: ${targetId}`);
  if (!state.activeIds.has(targetId)) throw new MemoryConflictError(`Memory record is not active: ${targetId}`);
}

function assertUniqueId(state: MemoryState, id: string): void {
  if ([...state.records, ...state.tombstones].some((item) => item.id === id))
    throw new MemoryConflictError(`Memory ID already exists: ${id}`);
}

function assertAcyclic(records: MemoryRecord[]): void {
  const edges = new Map(records.map((record) => [record.id, record.supersedes]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new MemoryError(`Cyclic supersession at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of edges.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  records.forEach((record) => visit(record.id));
}

function createUlid(now = Date.now()): string {
  let timestamp = BigInt(now);
  let encodedTime = '';
  for (let index = 0; index < 10; index += 1) {
    encodedTime = CROCKFORD[Number(timestamp & 31n)] + encodedTime;
    timestamp >>= 5n;
  }
  let randomness = BigInt(`0x${randomBytes(10).toString('hex')}`);
  let encodedRandom = '';
  for (let index = 0; index < 16; index += 1) {
    encodedRandom = CROCKFORD[Number(randomness & 31n)] + encodedRandom;
    randomness >>= 5n;
  }
  return encodedTime + encodedRandom;
}

function yamlFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new MemoryError(`Unsafe memory directory: ${directory}`);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.yaml'))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new MemoryError(`Unsafe memory file: ${join(directory, entry.name)}`);
      return join(directory, entry.name);
    })
    .sort();
}

function addResourceUsage(path: string, files: number, bytes: number): { files: number; bytes: number } {
  const size = lstatSync(path).size;
  if (size > MAX_FILE_BYTES) throw new MemoryError(`Memory file exceeds 16 MiB: ${path}`);
  const result = { files: files + 1, bytes: bytes + size };
  if (result.files > MAX_MEMORY_FILES) throw new MemoryError('Memory file limit exceeded.');
  if (result.bytes > MAX_MEMORY_BYTES) throw new MemoryError('Aggregate memory byte limit exceeded.');
  return result;
}

function recordPath(settings: MemorySettings, record: MemoryRecord): string {
  return `${settings.root}/${FOLDERS[record.record_type]}/${record.id}.yaml`;
}

function managedPath(root: string, path: string): string {
  const safe = safeProjectPath(path);
  const absolute = resolve(root, safe);
  const nested = relative(root, absolute);
  if (!nested || isAbsolute(nested) || nested === '..' || nested.startsWith(`..${sep}`))
    throw new MemoryError('Memory path escapes project root.');
  assertSafeRoot(root, dirname(safe).split(sep).join('/'));
  return absolute;
}

function assertSafeRoot(root: string, path: string): void {
  let current = resolve(root);
  for (const component of path.split(/[\\/]/u).filter(Boolean)) {
    current = join(current, component);
    if (!existsSync(current)) return;
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new MemoryError(`Unsafe memory path ancestor: ${path}`);
  }
}

function ensureSafeDirectories(root: string, path: string): void {
  let current = resolve(root);
  for (const component of path.split('/').filter(Boolean)) {
    current = join(current, component);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new MemoryError('Unsafe memory directory ancestor.');
    } else mkdirSync(current, { mode: 0o700 });
  }
}

function readRegular(path: string): Uint8Array {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new MemoryError('Managed memory path is not a regular file.');
  return readFileSync(path);
}

function syncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error: unknown) {
    if (!isCode(error, 'EINVAL') && !isCode(error, 'ENOTSUP') && !isCode(error, 'EISDIR')) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function searchableText(record: MemoryRecord): string {
  return [record.summary, record.details ?? '', record.topic, ...record.tags].join('\n').toLocaleLowerCase();
}

function searchTerms(value: string | undefined): string[] {
  if (value === undefined || value === '') return [];
  const terms = value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => term.toLocaleLowerCase());
  if (!terms.length) throw new MemoryError('query must contain searchable text.');
  return terms;
}

function newestFirst(left: { created_at: string }, right: { created_at: string }): number {
  return right.created_at.localeCompare(left.created_at);
}

function invalidReport(error: unknown): MemoryValidationReport {
  return { valid: false, records: 0, tombstones: 0, errors: [errorMessage(error)].slice(0, MAX_ERRORS + 1) };
}

function asMemoryError(error: unknown): Error {
  if (error instanceof MemoryError) return error;
  if (error instanceof LocalPersistenceError) return new MemoryError(error.message);
  return error instanceof Error ? error : new MemoryError(String(error));
}

function isTombstone(value: unknown): value is MemoryTombstone {
  return isMapping(value) && 'target_id' in value;
}

function isMapping(value: unknown): value is ConfigDocument {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mapping(value: unknown, path: string): ConfigDocument {
  if (!isMapping(value)) throw new MemoryError(`${path} must be a mapping.`);
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new MemoryError(`${path} must be a non-empty string.`);
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new MemoryError(`${path} must be boolean.`);
  return value;
}

function bounded(value: unknown, low: number, high: number, path: string): number {
  if (!Number.isInteger(value) || (value as number) < low || (value as number) > high)
    throw new MemoryError(`${path} must be an integer from ${low} to ${high}.`);
  return value as number;
}

function safeProjectPath(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    value.split(/[\\/]/u).some((part) => !part || part === '.' || part === '..')
  )
    throw new MemoryError('Memory path escapes project root.');
  return value;
}

function assertUlid(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !ULID_PATTERN.test(value))
    throw new MemoryError(`${path} must be a Crockford ULID.`);
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
