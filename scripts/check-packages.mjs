import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

const packages = [
  ['@harnessctl/generic-tools', 'extensions/generic-tools'],
  ['@harnessctl/opencode-tools', 'extensions/opencode-tools'],
  ['@harnessctl/pi-tools', 'extensions/pi-tools'],
];
const requiredMetadata = ['license', 'repository', 'homepage', 'bugs', 'engines', 'publishConfig'];
const retiredDocumentsIdentity = /sdlc-documents|sdlc_documents_(?:custom|github|gitlab|gitea|forgejo)/u;
const retiredMigrationIdentity =
  /(?:harnessctl[-_])?specs[-_]migrate|migrate[-_]?specs|specs[-_]?migration|specs-to-documents|streaming[-_]?transaction/iu;
const historyFiles = new Set(['CHANGELOG.md']);

function unreleasedSection(path) {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('## Unreleased');
  if (start < 0) throw new Error(`${path}: missing Unreleased section`);
  const end = source.indexOf('\n## ', start + 3);
  return source.slice(start, end < 0 ? source.length : end);
}

function decodeTarText(bytes) {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end < 0 ? bytes.length : end).toString('utf8');
}

function tarNumber(bytes) {
  const text = decodeTarText(bytes).trim();
  return text ? Number.parseInt(text, 8) : 0;
}

function paxPath(bytes) {
  let offset = 0;
  let path;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space < 0) throw new Error('packed tar has malformed PAX metadata');
    const length = Number.parseInt(bytes.subarray(offset, space).toString('ascii'), 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > bytes.length)
      throw new Error('packed tar has invalid PAX record length');
    const record = bytes.subarray(space + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (record.slice(0, equals) === 'path') path = record.slice(equals + 1);
    offset += length;
  }
  return path;
}

function safeTarPath(root, name) {
  const normalized = name.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..'))
    throw new Error(`packed tar has unsafe path: ${name}`);
  const destination = resolve(root, ...normalized.split('/'));
  if (!destination.startsWith(`${resolve(root)}${sep}`)) throw new Error(`packed tar path escaped: ${name}`);
  return destination;
}

function extractNpmTarball(tarball, destination) {
  const archive = gunzipSync(readFileSync(tarball));
  let offset = 0;
  let pendingPaxPath;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return;
    const size = tarNumber(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 0x30);
    const name = decodeTarText(header.subarray(0, 100));
    const prefix = decodeTarText(header.subarray(345, 500));
    const body = archive.subarray(offset + 512, offset + 512 + size);
    if (body.length !== size) throw new Error('packed tar is truncated');
    if (type === 'x') {
      pendingPaxPath = paxPath(body);
    } else {
      const archivePath = pendingPaxPath ?? (prefix ? `${prefix}/${name}` : name);
      pendingPaxPath = undefined;
      const output = safeTarPath(destination, archivePath);
      if (type === '5') mkdirSync(output, { recursive: true });
      else if (type === '0' || type === '\0') {
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, body);
      } else {
        throw new Error(`packed tar contains unsupported entry type ${JSON.stringify(type)}: ${archivePath}`);
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('packed tar has no end marker');
}

function activeSourceFiles(directory) {
  const pending = [resolve(directory)];
  const files = [];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['dist', 'node_modules'].includes(entry.name)) pending.push(path);
      } else if (
        entry.isFile() &&
        /\.(?:js|mjs|cjs|ts|json|md)$/u.test(entry.name) &&
        !historyFiles.has(entry.name) &&
        !/\.(?:spec|test)\.[cm]?[jt]s$/u.test(entry.name)
      ) {
        files.push(path);
      }
    }
  }
  return files;
}

function rejectRetiredDocumentsIdentities(name, files) {
  for (const path of files) {
    if (retiredDocumentsIdentity.test(readFileSync(path, 'utf8')))
      throw new Error(`${name}: active/packed file retains retired Documents identity: ${path}`);
  }
}

function rejectRetiredMigrationIdentities(name, files) {
  for (const path of files) {
    if (retiredMigrationIdentity.test(path) || retiredMigrationIdentity.test(readFileSync(path, 'utf8')))
      throw new Error(`${name}: active/packed file retains retired migration identity: ${path}`);
  }
}

if (retiredMigrationIdentity.test(unreleasedSection(resolve('CHANGELOG.md'))))
  throw new Error('root Unreleased changelog retains retired migration identity');

for (const [name, directory] of packages) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  if (manifest.name !== name) throw new Error(`${directory}: unexpected package name`);
  for (const field of requiredMetadata) if (!manifest[field]) throw new Error(`${name}: missing ${field}`);
  if (manifest.publishConfig.access !== 'public') throw new Error(`${name}: package must be public`);
  const sourceFiles = activeSourceFiles(directory);
  rejectRetiredDocumentsIdentities(name, sourceFiles);
  rejectRetiredMigrationIdentities(name, sourceFiles);
  if (retiredMigrationIdentity.test(unreleasedSection(resolve(directory, 'CHANGELOG.md'))))
    throw new Error(`${name}: Unreleased changelog retains retired migration identity`);

  const temporary = mkdtempSync(join(tmpdir(), 'harnessctl-package-check-'));
  try {
    const output = execFileSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary, '--workspace', name],
      { encoding: 'utf8' },
    );
    const [packed] = JSON.parse(output);
    if (!packed?.filename) throw new Error(`${name}: npm pack returned no tarball`);
    const paths = packed.files.map((file) => file.path);
    for (const entrypoint of [manifest.main, manifest.types]) {
      if (!entrypoint || !paths.includes(entrypoint.replace(/^\.\//u, '')))
        throw new Error(`${name}: packed output misses ${entrypoint}`);
    }
    const unexpected = paths.filter((path) => /(^|\/)(coverage|node_modules|.*\.(spec|test)\.[cm]?[jt]s)$/u.test(path));
    if (unexpected.length) throw new Error(`${name}: unexpected packed files: ${unexpected.join(', ')}`);

    const extracted = join(temporary, 'extracted');
    mkdirSync(extracted);
    extractNpmTarball(join(temporary, packed.filename), extracted);
    const packageRoot = join(extracted, 'package');
    const packedFiles = paths.map((path) => join(packageRoot, path));
    rejectRetiredDocumentsIdentities(name, packedFiles);
    rejectRetiredMigrationIdentities(name, packedFiles);
    for (const path of packedFiles.filter((path) => path.endsWith('.js'))) {
      const source = readFileSync(path, 'utf8');
      const staticSqliteImport = source.match(/(?:from\s*|import\s*\(\s*)['"](?:node|bun):sqlite/gu);
      if (staticSqliteImport)
        throw new Error(`${name}: packed runtime statically imports host-specific ${staticSqliteImport[0]}`);
    }
    console.log(`${name}@${manifest.version}: ${paths.length} packed files verified`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
