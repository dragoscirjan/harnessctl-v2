import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import { configV2Schema, memoryDocumentSchema } from './schemas.js';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const contractsRoot = join(packageRoot, 'contracts');
const contracts = [
  {
    name: 'config-v2.schema.json',
    schema: configV2Schema,
    id: 'https://harnessctl.dev/contracts/config-v2.schema.json',
    title: 'harnessctl project configuration v2',
  },
  {
    name: 'memory-record-v1.schema.json',
    schema: memoryDocumentSchema,
    id: 'https://harnessctl.dev/contracts/memory-record-v1.schema.json',
    title: 'harnessctl portable memory record v1',
  },
] as const;

mkdirSync(contractsRoot, { recursive: true });
for (const contract of contracts) {
  const schema = z.toJSONSchema(contract.schema, { target: 'draft-2020-12' });
  const document = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: contract.id,
    title: contract.title,
    ...schema,
  };
  writeFileSync(join(contractsRoot, contract.name), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}
