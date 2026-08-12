import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packages = [
  ['@harnessctl/generic-tools', 'extensions/generic-tools'],
  ['@harnessctl/opencode-tools', 'extensions/opencode-tools'],
  ['@harnessctl/pi-tools', 'extensions/pi-tools'],
];

const requiredMetadata = ['license', 'repository', 'homepage', 'bugs', 'engines', 'publishConfig'];

for (const [name, directory] of packages) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  if (manifest.name !== name) throw new Error(`${directory}: unexpected package name`);
  for (const field of requiredMetadata) {
    if (!manifest[field]) throw new Error(`${name}: missing ${field}`);
  }
  if (manifest.publishConfig.access !== 'public') throw new Error(`${name}: package must be public`);

  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--workspace', name], {
    encoding: 'utf8',
  });
  const [packed] = JSON.parse(output);
  if (!packed) throw new Error(`${name}: npm pack returned no result`);
  const paths = packed.files.map((file) => file.path);
  for (const entrypoint of [manifest.main, manifest.types]) {
    if (!entrypoint || !paths.includes(entrypoint.replace(/^\.\//, ''))) {
      throw new Error(`${name}: packed output misses ${entrypoint}`);
    }
  }
  const unexpected = paths.filter((path) => /(^|\/)(coverage|node_modules|.*\.(spec|test)\.[cm]?[jt]s)$/.test(path));
  if (unexpected.length) throw new Error(`${name}: unexpected packed files: ${unexpected.join(', ')}`);
  console.log(`${name}@${manifest.version}: ${paths.length} files verified`);
}
