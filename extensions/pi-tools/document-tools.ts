import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  archiveDocument,
  createDocument,
  DOCUMENT_KINDS,
  DOCUMENT_STATUSES,
  getDocument,
  listDocuments,
  parseDocumentId,
  restoreDocument,
  updateDocument,
  validateDocuments,
  versionDocument,
} from '@harnessctl/generic-tools';
import { Type } from 'typebox';

const OptionalString = () => Type.Optional(Type.String());
const DocumentKind = () => Type.Union(DOCUMENT_KINDS.map((kind) => Type.Literal(kind)));
const DocumentStatus = () => Type.Union(DOCUMENT_STATUSES.map((status) => Type.Literal(status)));
const changeProperties = () => ({
  title: OptionalString(),
  kind: Type.Optional(DocumentKind()),
  status: Type.Optional(DocumentStatus()),
  author: OptionalString(),
  body: OptionalString(),
  metadata: OptionalString(),
  expectedRevision: Type.String(),
});

export function registerDocumentTools(pi: ExtensionAPI): void {
  register(pi, 'document_id', 'Document ID', Type.Object({ text: Type.String() }), (params, cwd) =>
    parseDocumentId(String(params.text), cwd),
  );
  register(
    pi,
    'document_create',
    'Document Create',
    Type.Object({
      title: Type.String(),
      kind: DocumentKind(),
      status: Type.Optional(DocumentStatus()),
      author: OptionalString(),
      body: OptionalString(),
      metadata: OptionalString(),
    }),
    (params, cwd) => {
      const { metadata, ...input } = params;
      return createDocument(cwd, {
        title: String(input.title),
        kind: String(input.kind),
        status: input.status as string | undefined,
        author: input.author as string | undefined,
        body: input.body as string | undefined,
        ...(typeof metadata === 'string' && metadata ? { metadata: parseObject(metadata) } : {}),
      });
    },
  );
  register(
    pi,
    'document_list',
    'Document List',
    Type.Object({
      kind: Type.Optional(DocumentKind()),
      status: Type.Optional(DocumentStatus()),
      location: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('archive')])),
    }),
    (params, cwd) => listDocuments(cwd, params as never),
  );
  register(
    pi,
    'document_get',
    'Document Get',
    Type.Object({ id: Type.String(), version: Type.Optional(Type.Number()) }),
    (params, cwd) => getDocument(cwd, String(params.id), params.version as number | undefined),
  );
  for (const [name, label, operation] of [
    ['document_update', 'Document Update', updateDocument],
    ['document_version', 'Document Version', versionDocument],
  ] as const) {
    register(pi, name, label, Type.Object({ id: Type.String(), ...changeProperties() }), (params, cwd) => {
      const { id, metadata, ...changes } = params;
      return operation(cwd, String(id), {
        title: changes.title as string | undefined,
        kind: changes.kind as string | undefined,
        status: changes.status as string | undefined,
        author: changes.author as string | undefined,
        body: changes.body as string | undefined,
        expectedRevision: String(changes.expectedRevision),
        ...(metadata === undefined ? {} : { metadata: metadata === 'null' ? null : parseObject(String(metadata)) }),
      });
    });
  }
  register(pi, 'document_validate', 'Document Validate', Type.Object({ id: OptionalString() }), (params, cwd) =>
    validateDocuments(cwd, params.id as string | undefined),
  );
  for (const [name, label, operation] of [
    ['document_archive', 'Document Archive', archiveDocument],
    ['document_restore', 'Document Restore', restoreDocument],
  ] as const)
    register(pi, name, label, Type.Object({ id: Type.String(), expectedRevision: Type.String() }), (params, cwd) =>
      operation(cwd, String(params.id), String(params.expectedRevision)),
    );
}

function register(
  pi: ExtensionAPI,
  name: string,
  label: string,
  parameters: ReturnType<typeof Type.Object>,
  operation: (params: Record<string, unknown>, cwd: string) => unknown,
): void {
  pi.registerTool({
    name,
    label,
    description: `${label} for canonical repository documents.`,
    parameters,
    async execute(_id, params, _signal, _update, context) {
      try {
        return text(JSON.stringify(operation(params as Record<string, unknown>, context.cwd)));
      } catch (error: unknown) {
        return text(`Document error: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  });
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }], details: {} };
}

function parseObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('metadata must be a JSON object');
  return parsed as Record<string, unknown>;
}
