import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseDocument, stringify } from 'yaml';
import { ConfigError, readConfig, type ConfigDocument } from './config.js';
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

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const FOLDERS: Record<RecordType, string> = {
  fact: 'facts',
  decision: 'decisions',
  event: 'events',
  lesson: 'lessons',
};
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\b(?:sk|rk)-(?:live|test)-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,
];
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

interface MemorySettings {
  organizationId: string;
  projectId: string;
  defaultTopic: string;
  root: string;
  cache: string;
  limit: number;
  maxChars: number;
  includeSuperseded: boolean;
}

interface MemoryState {
  records: MemoryRecord[];
  tombstones: MemoryTombstone[];
  activeIds: Set<string>;
}

interface ImportManifestItem {
  staged: string;
  target: string;
  sha256: string;
}

interface ImportManifest {
  version: 1;
  state: 'prepared';
  items: ImportManifestItem[];
}

export function storeMemory(cwd: string, input: StoreMemoryInput): MemoryRecord {
  const settings = settingsFor(cwd);
  return withMutationLock(cwd, settings, () => {
    const record = makeRecord(settings, input, []);
    validateRecord(record, settings);
    writeRecordExclusive(cwd, settings, record);
    return record;
  });
}

export function supersedeMemory(cwd: string, targetId: string, input: StoreMemoryInput): MemoryRecord {
  const settings = settingsFor(cwd);
  return withMutationLock(cwd, settings, () => {
    const state = loadState(cwd, settings);
    requireActiveTarget(state, targetId);
    const record = makeRecord(settings, input, [targetId]);
    validateRecord(record, settings);
    writeRecordExclusive(cwd, settings, record);
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
  const settings = settingsFor(cwd);
  return withMutationLock(cwd, settings, () => {
    const state = loadState(cwd, settings);
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
    writeCanonicalExclusive(join(resolve(cwd, settings.root), 'tombstones', `${tombstone.id}.yaml`), tombstone);
    return tombstone;
  });
}

export function getMemory(cwd: string, id: string): MemoryRecord | MemoryTombstone {
  assertUlid(id, 'id');
  const settings = settingsFor(cwd);
  return withMutationLock(cwd, settings, () => {
    const state = loadState(cwd, settings);
    const result = [...state.records, ...state.tombstones].find((item) => item.id === id);
    if (!result) throw new MemoryError(`Memory record not found: ${id}`);
    return result;
  });
}

export function listMemory(cwd: string, input: SearchMemoryInput = {}): MemoryRecord[] {
  const settings = settingsFor(cwd);
  return withMutationLock(cwd, settings, () => {
    const state = loadState(cwd, settings);
    const includeSuperseded = input.include_superseded ?? settings.includeSuperseded;
    const limit = bounded(input.limit ?? settings.limit, 1, 100, 'limit');
    return state.records
      .filter((record) => includeSuperseded || state.activeIds.has(record.id))
      .filter((record) => !input.topic || record.topic === input.topic)
      .filter((record) => !input.memory_type || record.memory_type === input.memory_type)
      .slice(0, limit);
  });
}

export function searchMemory(cwd: string, input: SearchMemoryInput = {}): MemoryRecord[] {
  const settings = settingsFor(cwd);
  const limit = bounded(input.limit ?? settings.limit, 1, 100, 'limit');
  const maxChars = bounded(input.max_chars ?? settings.maxChars, 256, 100_000, 'max_chars');
  return withMutationLock(cwd, settings, () => {
    const state = loadState(cwd, settings);
    ensureCache(cwd, settings, state);
    const database = new DatabaseSync(resolve(cwd, settings.cache), { readOnly: true });
    try {
      const clauses = ['1 = 1'];
      const values: Array<string | number> = [];
      if (input.query?.trim()) {
        clauses.push('id IN (SELECT id FROM memory_fts WHERE memory_fts MATCH ?)');
        values.push(ftsQuery(input.query));
      }
      if (input.topic) {
        clauses.push('topic = ?');
        values.push(input.topic);
      }
      if (input.memory_type) {
        clauses.push('memory_type = ?');
        values.push(input.memory_type);
      }
      if (!(input.include_superseded ?? settings.includeSuperseded)) clauses.push('active = 1');
      values.push(limit);
      const rows = database
        .prepare(`SELECT payload FROM memory WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`)
        .all(...values) as Array<{ payload: string }>;
      const results: MemoryRecord[] = [];
      let used = 0;
      for (const row of rows) {
        if (used + row.payload.length > maxChars) break;
        results.push(JSON.parse(row.payload) as MemoryRecord);
        used += row.payload.length;
      }
      return results;
    } finally {
      database.close();
    }
  });
}

export function validateMemory(cwd: string): MemoryValidationReport {
  try {
    const settings = settingsFor(cwd);
    const state = withMutationLock(cwd, settings, () => loadState(cwd, settings));
    return { valid: true, records: state.records.length, tombstones: state.tombstones.length, errors: [] };
  } catch (error: unknown) {
    return { valid: false, records: 0, tombstones: 0, errors: [errorMessage(error)] };
  }
}

export function exportMemory(cwd: string): string {
  const settings = settingsFor(cwd);
  const state = withMutationLock(cwd, settings, () => loadState(cwd, settings));
  for (const item of [...state.records, ...state.tombstones]) scanSecrets(item);
  return [...state.records, ...state.tombstones].map((item) => JSON.stringify(item)).join('\n') + '\n';
}

export function importMemory(cwd: string, content: string, preview = false): MemoryValidationReport {
  const settings = settingsFor(cwd);
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const items = lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error: unknown) {
      throw new MemoryError(`Invalid JSONL at line ${index + 1}: ${errorMessage(error)}`);
    }
  });
  const records: MemoryRecord[] = [];
  const tombstones: MemoryTombstone[] = [];
  for (const item of items) {
    if (isTombstone(item)) {
      validateTombstone(item, settings);
      tombstones.push(item);
    } else {
      validateRecord(item, settings);
      records.push(item);
    }
  }
  if (!preview) {
    withMutationLock(cwd, settings, () => {
      const state = loadState(cwd, settings);
      const existing = new Set([...state.records, ...state.tombstones].map((item) => item.id));
      for (const item of [...records, ...tombstones]) {
        if (existing.has(item.id)) throw new MemoryConflictError(`Memory ID already exists: ${item.id}`);
        existing.add(item.id);
      }
      assertImportRelationships(state, records, tombstones);
      prepareImportTransaction(cwd, settings, records, tombstones);
    });
  }
  return { valid: true, records: records.length, tombstones: tombstones.length, errors: [] };
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
    cache: safeProjectPath(stringValue(repository.cache, 'memory.repository.cache')),
    limit: bounded(retrieval.limit, 1, 100, 'memory.retrieval.limit'),
    maxChars: bounded(retrieval.max_chars, 256, 100_000, 'memory.retrieval.max_chars'),
    includeSuperseded: booleanValue(retrieval.include_superseded, 'memory.retrieval.include_superseded'),
  };
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
    tags: input.tags ?? [],
  };
}

function validateRecord(value: unknown, settings: MemorySettings): asserts value is MemoryRecord {
  const result = memoryRecordSchema.safeParse(value);
  if (!result.success) throw new MemoryError(`Invalid memory record:\n${formatSchemaError(result.error)}`);
  const record = result.data;
  assertScope(record, settings);
  scanSecrets(record);
}

function validateTombstone(value: unknown, settings: MemorySettings): asserts value is MemoryTombstone {
  const result = memoryTombstoneSchema.safeParse(value);
  if (!result.success) throw new MemoryError(`Invalid memory tombstone:\n${formatSchemaError(result.error)}`);
  const tombstone = result.data;
  assertScope(tombstone, settings);
  scanSecrets(tombstone);
}

function assertScope(value: { organization_id: string; project_id: string }, settings: MemorySettings): void {
  if (value.organization_id !== settings.organizationId || value.project_id !== settings.projectId)
    throw new MemoryError('Memory record scope does not match configured project namespace.');
}

function scanSecrets(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value)) || looksHighEntropy(value))
      throw new MemoryError(`Suspected secret at ${path}; memory write rejected.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, `${path}[${index}]`));
    return;
  }
  if (isMapping(value)) for (const [key, item] of Object.entries(value)) scanSecrets(item, `${path}.${key}`);
}

function looksHighEntropy(value: string): boolean {
  if (
    value.length < 32 ||
    ULID_PATTERN.test(value) ||
    /^[a-f0-9]{40,64}$/i.test(value) ||
    /\s/.test(value) ||
    !/[A-Za-z]/.test(value) ||
    !/\d/.test(value)
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

function loadState(cwd: string, settings: MemorySettings): MemoryState {
  const root = resolve(cwd, settings.root);
  const records: MemoryRecord[] = [];
  const tombstones: MemoryTombstone[] = [];
  const ids = new Set<string>();
  for (const [folder, recordType] of Object.entries({
    facts: 'fact',
    decisions: 'decision',
    events: 'event',
    lessons: 'lesson',
  })) {
    for (const path of yamlFiles(join(root, folder))) {
      const record = parseCanonical(path);
      validateRecord(record, settings);
      if (record.record_type !== recordType) throw new MemoryError(`Record type does not match folder: ${path}`);
      if (ids.has(record.id)) throw new MemoryError(`Duplicate memory ID: ${record.id}`);
      ids.add(record.id);
      records.push(record);
    }
  }
  for (const path of yamlFiles(join(root, 'tombstones'))) {
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
  const inactive = new Set(records.flatMap((record) => record.supersedes));
  tombstones.forEach((item) => inactive.add(item.target_id));
  return {
    records,
    tombstones,
    activeIds: new Set(records.filter((record) => !inactive.has(record.id)).map((record) => record.id)),
  };
}

function parseCanonical(path: string): unknown {
  const document = parseDocument(readFileSync(path, 'utf8'), { uniqueKeys: true });
  if (document.errors.length) throw new MemoryError(`Malformed memory YAML ${path}: ${document.errors[0]?.message}`);
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error: unknown) {
    throw new MemoryError(`Unsafe memory YAML ${path}: ${errorMessage(error)}`);
  }
}

function writeRecordExclusive(cwd: string, settings: MemorySettings, record: MemoryRecord): void {
  const path = join(resolve(cwd, settings.root), FOLDERS[record.record_type], `${record.id}.yaml`);
  writeCanonicalExclusive(path, record);
}

function writeCanonicalExclusive(path: string, value: MemoryRecord | MemoryTombstone): void {
  writeBytesExclusive(path, Buffer.from(stringify(value, { lineWidth: 0 }), 'utf8'));
}

function writeBytesExclusive(path: string, content: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
  } catch (error: unknown) {
    rmSync(path, { force: true });
    throw error;
  } finally {
    closeSync(descriptor);
  }
  fsyncDirectory(dirname(path));
}

function assertImportRelationships(state: MemoryState, records: MemoryRecord[], tombstones: MemoryTombstone[]): void {
  const combinedRecords = [...state.records, ...records];
  const recordIds = new Set(combinedRecords.map((record) => record.id));
  for (const record of records)
    for (const target of record.supersedes)
      if (!recordIds.has(target)) throw new MemoryError(`Broken supersedes reference: ${target}`);
  for (const tombstone of tombstones)
    if (!recordIds.has(tombstone.target_id))
      throw new MemoryError(`Broken tombstone reference: ${tombstone.target_id}`);
  assertAcyclic(combinedRecords);
}

function prepareImportTransaction(
  cwd: string,
  settings: MemorySettings,
  records: MemoryRecord[],
  tombstones: MemoryTombstone[],
): void {
  const transactionRoot = resolve(cwd, dirname(settings.cache), 'memory-transactions');
  const transaction = join(transactionRoot, `${Date.now()}-${process.pid}-${randomBytes(4).toString('hex')}`);
  const stagedRoot = join(transaction, 'staged');
  mkdirSync(stagedRoot, { recursive: true });
  const items: ImportManifestItem[] = [];
  const values: Array<MemoryRecord | MemoryTombstone> = [...records, ...tombstones];
  values.forEach((value, index) => {
    const staged = `staged/${String(index).padStart(6, '0')}.yaml`;
    const target = isTombstone(value)
      ? join(settings.root, 'tombstones', `${value.id}.yaml`)
      : join(settings.root, FOLDERS[value.record_type], `${value.id}.yaml`);
    const content = Buffer.from(stringify(value, { lineWidth: 0 }), 'utf8');
    writeBytesExclusive(join(transaction, staged), content);
    items.push({ staged, target, sha256: createHash('sha256').update(content).digest('hex') });
  });
  fsyncDirectory(stagedRoot);
  const manifest: ImportManifest = { version: 1, state: 'prepared', items };
  const temporaryManifest = join(transaction, 'manifest.json.tmp');
  const preparedManifest = join(transaction, 'manifest.json');
  writeBytesExclusive(temporaryManifest, Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'));
  renameSync(temporaryManifest, preparedManifest);
  fsyncDirectory(transaction);
  rollForwardImport(cwd, settings, transaction, manifest);
}

function recoverImportTransactions(cwd: string, settings: MemorySettings): void {
  const root = resolve(cwd, dirname(settings.cache), 'memory-transactions');
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const transaction = join(root, entry.name);
    if (existsSync(join(transaction, 'committed'))) {
      rmSync(transaction, { recursive: true, force: true });
      continue;
    }
    const manifestPath = join(transaction, 'manifest.json');
    if (!existsSync(manifestPath)) {
      rmSync(transaction, { recursive: true, force: true });
      continue;
    }
    const manifest = parseImportManifest(readFileSync(manifestPath, 'utf8'));
    rollForwardImport(cwd, settings, transaction, manifest);
  }
}

function parseImportManifest(content: string): ImportManifest {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error: unknown) {
    throw new MemoryError(`Malformed prepared memory import manifest: ${errorMessage(error)}`);
  }
  if (!isMapping(value) || value.version !== 1 || value.state !== 'prepared' || !Array.isArray(value.items))
    throw new MemoryError('Malformed prepared memory import manifest.');
  const items = value.items.map((item): ImportManifestItem => {
    if (
      !isMapping(item) ||
      typeof item.staged !== 'string' ||
      typeof item.target !== 'string' ||
      typeof item.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new MemoryError('Malformed prepared memory import item.');
    safeProjectPath(item.staged);
    safeProjectPath(item.target);
    return { staged: item.staged, target: item.target, sha256: item.sha256 };
  });
  return { version: 1, state: 'prepared', items };
}

function rollForwardImport(cwd: string, settings: MemorySettings, transaction: string, manifest: ImportManifest): void {
  const canonicalRoot = resolve(cwd, settings.root);
  for (const item of manifest.items) {
    const stagedPath = resolve(transaction, item.staged);
    const targetPath = resolve(cwd, item.target);
    if (!isInside(resolve(transaction, 'staged'), stagedPath) || !isInside(canonicalRoot, targetPath))
      throw new MemoryError('Prepared memory import path escapes its allowed root.');
    const content = readFileSync(stagedPath);
    if (createHash('sha256').update(content).digest('hex') !== item.sha256)
      throw new MemoryError(`Prepared memory import checksum mismatch: ${item.staged}`);
    if (existsSync(targetPath)) {
      const existingHash = createHash('sha256').update(readFileSync(targetPath)).digest('hex');
      if (existingHash !== item.sha256)
        throw new MemoryConflictError(`Prepared memory import target differs: ${item.target}`);
      continue;
    }
    writeBytesExclusive(targetPath, content);
  }
  writeBytesExclusive(join(transaction, 'committed'), Buffer.from('committed\n', 'utf8'));
  fsyncDirectory(transaction);
  rmSync(transaction, { recursive: true, force: true });
  const transactionRoot = dirname(transaction);
  if (existsSync(transactionRoot) && readdirSync(transactionRoot).length === 0)
    rmSync(transactionRoot, { recursive: true, force: true });
}

function withMutationLock<T>(cwd: string, settings: MemorySettings, operation: () => T): T {
  const lock = resolve(cwd, dirname(settings.cache), 'memory-mutation.lock');
  return withDirectoryLock(lock, 'mutation', () => {
    recoverImportTransactions(cwd, settings);
    return operation();
  });
}

function ensureCache(cwd: string, settings: MemorySettings, state: MemoryState): void {
  const cachePath = resolve(cwd, settings.cache);
  const manifest = createManifest(cwd, settings);
  if (cacheMatches(cachePath, manifest)) return;
  const lock = resolve(cwd, dirname(settings.cache), 'memory-cache.lock');
  withDirectoryLock(lock, 'cache', () => {
    if (cacheMatches(cachePath, manifest)) return;
    mkdirSync(dirname(cachePath), { recursive: true });
    const temporary = `${cachePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      const database = new DatabaseSync(temporary);
      try {
        database.exec(
          'CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);' +
            'CREATE TABLE memory (id TEXT PRIMARY KEY, topic TEXT, memory_type TEXT, summary TEXT, details TEXT, created_at TEXT, active INTEGER, payload TEXT);' +
            'CREATE VIRTUAL TABLE memory_fts USING fts5(id UNINDEXED, summary, details, topic);',
        );
        const insert = database.prepare(
          'INSERT INTO memory (id, topic, memory_type, summary, details, created_at, active, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const insertFts = database.prepare('INSERT INTO memory_fts (id, summary, details, topic) VALUES (?, ?, ?, ?)');
        for (const record of state.records) {
          insert.run(
            record.id,
            record.topic,
            record.memory_type,
            record.summary,
            record.details ?? '',
            record.created_at,
            state.activeIds.has(record.id) ? 1 : 0,
            JSON.stringify(record),
          );
          insertFts.run(record.id, record.summary, record.details ?? '', record.topic);
        }
        database.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('manifest', manifest);
      } finally {
        database.close();
      }
      fsyncFile(temporary);
      renameSync(temporary, cachePath);
      fsyncDirectory(dirname(cachePath));
    } catch (error: unknown) {
      rmSync(temporary, { force: true });
      throw error;
    }
  });
}

function cacheMatches(cachePath: string, manifest: string): boolean {
  if (!existsSync(cachePath)) return false;
  const database = new DatabaseSync(cachePath);
  try {
    const row = database.prepare('SELECT value FROM metadata WHERE key = ?').get('manifest') as
      { value: string } | undefined;
    return row?.value === manifest;
  } catch {
    return false;
  } finally {
    database.close();
  }
}

function withDirectoryLock<T>(lock: string, kind: string, operation: () => T): T {
  mkdirSync(dirname(lock), { recursive: true });
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      mkdirSync(lock);
      break;
    } catch (error: unknown) {
      if (!isCode(error, 'EEXIST') || Date.now() >= deadline)
        throw new MemoryError(`Unable to acquire memory ${kind} lock: ${errorMessage(error)}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return operation();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function fsyncFile(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(path: string): void {
  // Windows does not support flushing directory handles. File contents are
  // already flushed before each rename; directory fsync adds POSIX durability.
  if (process.platform === 'win32') return;
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function createManifest(cwd: string, settings: MemorySettings): string {
  const root = resolve(cwd, settings.root);
  const hash = createHash('sha256').update('record-schema=1\nindex-schema=1\n');
  const paths = Object.keys(FOLDERS)
    .map((type) => FOLDERS[type as RecordType])
    .concat('tombstones')
    .flatMap((folder) => yamlFiles(join(root, folder)))
    .sort();
  for (const path of paths) hash.update(relative(root, path)).update('\0').update(readFileSync(path)).update('\0');
  return hash.digest('hex');
}

function ftsQuery(value: string): string {
  const terms = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`);
  if (terms.length === 0) throw new MemoryError('query must contain searchable text.');
  return terms.join(' AND ');
}

function requireActiveTarget(state: MemoryState, targetId: string): void {
  assertUlid(targetId, 'target_id');
  if (!state.records.some((record) => record.id === targetId))
    throw new MemoryError(`Memory record not found: ${targetId}`);
  if (!state.activeIds.has(targetId)) throw new MemoryConflictError(`Memory record is not active: ${targetId}`);
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
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => join(directory, entry.name));
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
  if (typeof value !== 'string' || value.trim() === '') throw new MemoryError(`${path} must be a non-empty string.`);
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
  if (value.startsWith('/') || value.split(/[\\/]/).includes('..'))
    throw new MemoryError('Memory path escapes project root.');
  return value;
}

function isInside(root: string, candidate: string): boolean {
  const nested = relative(root, candidate);
  return nested !== '' && !isAbsolute(nested) && nested.split(/[\\/]/)[0] !== '..';
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
