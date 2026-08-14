import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeIssueRevision, encodeCanonicalIssue, type CanonicalIssueDocument } from './issues-contract.js';
import type { IssueProjectionChangeSet } from './issues-storage.js';
import {
  commitIssueTransaction,
  recoverIssueTransactions,
  withIssueMutationLock,
  type IssueTransactionFaultBoundary,
} from './issues-transactions.js';
import { validateIssues } from './issues.js';

const roots: string[] = [];

function temporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'harnessctl-issue-transactions-'));
  roots.push(root);
  return root;
}

function issue(overrides: Partial<CanonicalIssueDocument> = {}): CanonicalIssueDocument {
  return {
    version: 1,
    id: '00009',
    type: 'task',
    title: 'Recover safely',
    status: 'in_progress',
    created_at: '2026-08-14T13:43:48.382Z',
    updated_at: '2026-08-14T14:00:01.661Z',
    body: '# Recover safely\n',
    comments: [],
    ...overrides,
  };
}

function bytes(document: CanonicalIssueDocument = issue()): Uint8Array {
  return encodeCanonicalIssue(document);
}

function digest(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function transactionOptions(id: string, faultAt?: IssueTransactionFaultBoundary) {
  return {
    transactionId: () => id,
    fault: faultAt
      ? ({ boundary }: { boundary: IssueTransactionFaultBoundary }) => {
          if (boundary === faultAt) throw new Error(`fault:${boundary}`);
        }
      : undefined,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('project issue mutation lock', () => {
  it('serializes all project issue operations and retains a live owner lock', () => {
    const root = temporaryRepository();

    withIssueMutationLock(
      root,
      () => {
        expect(() => withIssueMutationLock(root, () => undefined, { lockWaitMs: 0 })).toThrowError(
          expect.objectContaining({ category: 'lock_contention', retryable: true }),
        );
      },
      { lockWaitMs: 0 },
    );

    expect(existsSync(join(root, '.issues'))).toBe(false);
  });

  it('does not remove a lock with corrupt ownership evidence', () => {
    const root = temporaryRepository();
    const lock = join(root, '.issues', '.control', 'mutation.lock');
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, 'owner.json'), '{broken');

    expect(() => withIssueMutationLock(root, () => undefined, { lockWaitMs: 0 })).toThrowError(
      expect.objectContaining({ category: 'lock_contention' }),
    );
    expect(readFileSync(join(lock, 'owner.json'), 'utf8')).toBe('{broken');
  });
});

describe('durable issue transaction recovery', () => {
  it('recovers a durable manifest before allowing storage classification', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions('tx-before-classification', 'manifest-publish'),
      ),
    ).toThrowError();
    expect(existsSync(join(root, target))).toBe(false);

    withIssueMutationLock(root, () => {
      expect(readFileSync(join(root, target))).toEqual(Buffer.from(bytes()));
    });
    expect(existsSync(join(root, '.issues', '.control', 'transactions', 'tx-before-classification'))).toBe(false);
  });

  it('rolls a partially published move forward exactly once', () => {
    const root = temporaryRepository();
    const source = '.issues/00009-recover-safely.yml';
    const destination = '.issues/archived/00009-recover-safely.yml';
    mkdirSync(join(root, '.issues'));
    writeFileSync(join(root, source), bytes());

    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'archive',
          actions: [
            {
              issueId: '00009',
              kind: 'move',
              source,
              destination,
              expectedBeforeDigest: digest(bytes()),
            },
          ],
        },
        transactionOptions('tx-partial-move', 'canonical-apply'),
      ),
    ).toThrowError();
    expect(existsSync(join(root, source))).toBe(true);
    expect(readFileSync(join(root, destination))).toEqual(Buffer.from(bytes()));

    expect(recoverIssueTransactions(root)).toEqual(['tx-partial-move']);
    expect(existsSync(join(root, source))).toBe(false);
    expect(readFileSync(join(root, destination))).toEqual(Buffer.from(bytes()));
    expect(recoverIssueTransactions(root)).toEqual([]);
  });

  it('rejects stale before-state without preparing control evidence', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    mkdirSync(join(root, '.issues'));
    writeFileSync(join(root, target), bytes());
    const updated = bytes(issue({ status: 'done', updated_at: '2026-08-14T15:00:00.000Z' }));

    expect(() =>
      commitIssueTransaction(root, {
        operation: 'rewrite',
        actions: [
          {
            issueId: '00009',
            kind: 'rewrite',
            source: target,
            destination: target,
            afterBytes: updated,
            expectedBeforeDigest: '0'.repeat(64),
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ category: 'stale_revision' }));
    expect(readFileSync(join(root, target))).toEqual(Buffer.from(bytes()));
    expect(existsSync(join(root, '.issues', '.control'))).toBe(false);
  });

  it('revalidates all destination after-states and preserves an external edit as a hard conflict', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    const external = Buffer.from('external edit\n');

    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        {
          transactionId: () => 'tx-final-gate',
          fault: ({ boundary }) => {
            if (boundary === 'before-commit-gate') writeFileSync(join(root, target), external);
          },
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        category: 'transaction_recovery',
        transactionId: 'tx-final-gate',
        paths: [target],
        retryable: false,
      }),
    );
    expect(readFileSync(join(root, target))).toEqual(external);
    expect(existsSync(join(root, '.issues', '.control', 'transactions', 'tx-final-gate', 'manifest.json'))).toBe(true);
    expect(existsSync(join(root, '.issues', '.control', 'transactions', 'tx-final-gate', 'committed'))).toBe(false);
    expect(() => recoverIssueTransactions(root)).toThrowError(
      expect.objectContaining({ category: 'transaction_recovery', paths: [target] }),
    );
    expect(readFileSync(join(root, target))).toEqual(external);
  });

  it('detects a concurrent mutation of an earlier action before committing a multi-file transaction', () => {
    const root = temporaryRepository();
    const first = '.issues/00009-recover-safely.yml';
    const second = '.issues/00010-second-action.yml';
    const secondBytes = bytes(issue({ id: '00010', title: 'Second action' }));
    const external = Buffer.from('concurrent external edit\n');

    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'relationship',
          actions: [
            { issueId: '00009', kind: 'create', destination: first, afterBytes: bytes() },
            { issueId: '00010', kind: 'create', destination: second, afterBytes: secondBytes },
          ],
        },
        {
          transactionId: () => 'tx-concurrent-mutation',
          fault: ({ boundary, actionIndex }) => {
            if (boundary === 'canonical-apply' && actionIndex === 1) writeFileSync(join(root, first), external);
          },
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        category: 'transaction_recovery',
        transactionId: 'tx-concurrent-mutation',
        paths: [first],
      }),
    );
    expect(readFileSync(join(root, first))).toEqual(external);
    expect(readFileSync(join(root, second))).toEqual(Buffer.from(secondBytes));
    expect(() => recoverIssueTransactions(root)).toThrowError(expect.objectContaining({ paths: [first] }));
  });

  it('rejects staged after-image tampering and retains recovery evidence', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions('tx-tampered-stage', 'manifest-publish'),
      ),
    ).toThrowError();
    const staged = join(root, '.issues', '.control', 'transactions', 'tx-tampered-stage', 'staged', '000000.bin');
    writeFileSync(staged, 'tampered');

    expect(() => recoverIssueTransactions(root)).toThrowError(
      expect.objectContaining({ category: 'transaction_recovery', transactionId: 'tx-tampered-stage' }),
    );
    expect(readFileSync(staged, 'utf8')).toBe('tampered');
    expect(existsSync(join(root, target))).toBe(false);
  });

  it('rejects a symlinked staging ancestor without reading or deleting its target', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions('tx-symlinked-stage', 'manifest-publish'),
      ),
    ).toThrowError();
    const transaction = join(root, '.issues', '.control', 'transactions', 'tx-symlinked-stage');
    const stagedRoot = join(transaction, 'staged');
    const external = join(root, 'external-stage');
    rmSync(stagedRoot, { recursive: true });
    mkdirSync(external);
    writeFileSync(join(external, '000000.bin'), bytes());
    symlinkSync(external, stagedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => recoverIssueTransactions(root)).toThrowError(
      expect.objectContaining({ category: 'transaction_recovery', transactionId: 'tx-symlinked-stage' }),
    );
    expect(readFileSync(join(external, '000000.bin'))).toEqual(Buffer.from(bytes()));
    expect(existsSync(join(root, target))).toBe(false);
  });

  it('rejects a symlinked staged file without publishing its target bytes', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions('tx-symlinked-file', 'manifest-publish'),
      ),
    ).toThrowError();
    const staged = join(root, '.issues', '.control', 'transactions', 'tx-symlinked-file', 'staged', '000000.bin');
    const external = join(root, 'external-after-image.yml');
    writeFileSync(external, bytes());
    rmSync(staged);
    symlinkSync(external, staged, 'file');

    expect(() => recoverIssueTransactions(root)).toThrowError(
      expect.objectContaining({ category: 'transaction_recovery', transactionId: 'tx-symlinked-file' }),
    );
    expect(readFileSync(external)).toEqual(Buffer.from(bytes()));
    expect(existsSync(join(root, target))).toBe(false);
  });

  it('canonical-decodes and re-encodes staged images even when tampered manifest digests agree', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions('tx-noncanonical-stage', 'manifest-publish'),
      ),
    ).toThrowError();
    const transaction = join(root, '.issues', '.control', 'transactions', 'tx-noncanonical-stage');
    const stagedPath = join(transaction, 'staged', '000000.bin');
    const manifestPath = join(transaction, 'manifest.json');
    const noncanonical = Buffer.from(readFileSync(stagedPath, 'utf8').replaceAll('\n', '\r\n'));
    writeFileSync(stagedPath, noncanonical);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      totalStagedBytes: number;
      actions: Array<{ afterDestination: { digest: string }; afterSource: { digest?: string } }>;
    };
    manifest.totalStagedBytes = noncanonical.byteLength;
    manifest.actions[0]!.afterDestination.digest = digest(noncanonical);
    manifest.actions[0]!.afterSource.digest = digest(noncanonical);
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

    expect(() => recoverIssueTransactions(root)).toThrowError(
      expect.objectContaining({ category: 'transaction_recovery', transactionId: 'tx-noncanonical-stage' }),
    );
    expect(existsSync(join(root, target))).toBe(false);
    expect(readFileSync(stagedPath)).toEqual(noncanonical);
  });

  it('cleans an already committed transaction idempotently after a cleanup fault', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions('tx-committed', 'cleanup'),
      ),
    ).toThrowError();
    expect(existsSync(join(root, target))).toBe(true);
    expect(existsSync(join(root, '.issues', '.control', 'transactions', 'tx-committed', 'committed'))).toBe(true);

    expect(recoverIssueTransactions(root)).toEqual(['tx-committed']);
    expect(readFileSync(join(root, target))).toEqual(Buffer.from(bytes()));
  });

  it('retains committed work and retries an atomic projection notification', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    const projected: IssueProjectionChangeSet[] = [];
    const content = bytes();

    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [
            {
              issueId: '00009',
              kind: 'create',
              destination: target,
              afterBytes: content,
              resultingRevision: computeIssueRevision(content),
            },
          ],
        },
        {
          transactionId: () => 'tx-projection-retry',
          now: () => new Date('2026-08-14T15:00:00.000Z'),
          projectionSink: {
            apply: () => {
              throw new Error('cache unavailable');
            },
          },
        },
      ),
    ).toThrowError(expect.objectContaining({ category: 'projection_sync', transactionId: 'tx-projection-retry' }));

    expect(readFileSync(join(root, target))).toEqual(Buffer.from(content));
    expect(existsSync(join(root, '.issues', '.control', 'projection-dirty.json'))).toBe(true);
    expect(
      recoverIssueTransactions(root, { projectionSink: { apply: (changeSet) => projected.push(changeSet) } }),
    ).toEqual(['tx-projection-retry']);
    expect(projected).toEqual([
      expect.objectContaining({
        transactionId: 'tx-projection-retry',
        committedAt: '2026-08-14T15:00:00.000Z',
        changes: [expect.objectContaining({ kind: 'upsert', id: '00009' })],
      }),
    ]);
    expect(existsSync(join(root, '.issues', '.control', 'projection-dirty.json'))).toBe(false);
  });

  it('retains failed-projection evidence when a read recovers without a projection sink', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        {
          transactionId: () => 'tx-read-without-sink',
          projectionSink: {
            apply: () => {
              throw new Error('cache unavailable');
            },
          },
        },
      ),
    ).toThrowError(expect.objectContaining({ category: 'projection_sync' }));

    withIssueMutationLock(root, () => expect(readFileSync(join(root, target))).toEqual(Buffer.from(bytes())));

    expect(existsSync(join(root, '.issues', '.control', 'projection-dirty.json'))).toBe(true);
    expect(existsSync(join(root, '.issues', '.control', 'transactions', 'tx-read-without-sink'))).toBe(true);

    expect(validateIssues(root).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'projection_sync',
          path: '.issues/.control/projection-dirty.json',
          transactionId: 'tx-read-without-sink',
        }),
        expect.objectContaining({
          category: 'transaction_recovery',
          path: '.issues/.control/transactions/tx-read-without-sink',
          transactionId: 'tx-read-without-sink',
        }),
      ]),
    );
  });

  it.each<IssueTransactionFaultBoundary>([
    'manifest-publish',
    'canonical-apply',
    'directory-flush',
    'committed-marker',
    'cleanup',
  ])('recovers platform-neutral durable fault boundary %s', (boundary) => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions(`tx-fault-${boundary}`, boundary),
      ),
    ).toThrowError();

    expect(recoverIssueTransactions(root)).toEqual([`tx-fault-${boundary}`]);
    expect(readFileSync(join(root, target))).toEqual(Buffer.from(bytes()));
  });

  it.each<IssueTransactionFaultBoundary>([
    'staged-write',
    'staged-flush',
    'manifest-temporary-write',
    'manifest-temporary-flush',
  ])('leaves no canonical or recovery state at pre-publication fault boundary %s', (boundary) => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        transactionOptions(`tx-fault-${boundary}`, boundary),
      ),
    ).toThrowError();

    expect(existsSync(join(root, target))).toBe(false);
    expect(recoverIssueTransactions(root)).toEqual([]);
  });

  it.each(['projection-apply', 'projection-dirty-marker'] as const)(
    'retains and retries committed work at projection fault boundary %s',
    (boundary) => {
      const root = temporaryRepository();
      const target = '.issues/00009-recover-safely.yml';
      expect(() =>
        commitIssueTransaction(
          root,
          {
            operation: 'create',
            actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
          },
          {
            ...transactionOptions(`tx-fault-${boundary}`, boundary),
            projectionSink: {
              apply: () => {
                if (boundary === 'projection-dirty-marker') throw new Error('projection unavailable');
              },
            },
          },
        ),
      ).toThrowError();

      expect(readFileSync(join(root, target))).toEqual(Buffer.from(bytes()));
      expect(recoverIssueTransactions(root, { projectionSink: { apply: () => undefined } })).toEqual([
        `tx-fault-${boundary}`,
      ]);
    },
  );

  it('rejects a tampered manifest projection revision during recovery', () => {
    const root = temporaryRepository();
    const target = '.issues/00009-recover-safely.yml';
    expect(() =>
      commitIssueTransaction(
        root,
        {
          operation: 'create',
          actions: [{ issueId: '00009', kind: 'create', destination: target, afterBytes: bytes() }],
        },
        {
          transactionId: () => 'tx-tampered-revision',
          projectionSink: {
            apply: () => {
              throw new Error('cache unavailable');
            },
          },
        },
      ),
    ).toThrowError(expect.objectContaining({ category: 'projection_sync' }));
    const transaction = join(root, '.issues', '.control', 'transactions', 'tx-tampered-revision');
    const manifestPath = join(transaction, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      actions: Array<{ resultingRevision: string }>;
    };
    manifest.actions[0]!.resultingRevision = `sha256:${'0'.repeat(64)}`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const projected: IssueProjectionChangeSet[] = [];

    expect(() =>
      recoverIssueTransactions(root, { projectionSink: { apply: (changeSet) => projected.push(changeSet) } }),
    ).toThrowError(
      expect.objectContaining({ category: 'transaction_recovery', transactionId: 'tx-tampered-revision' }),
    );
    expect(projected).toEqual([]);
    expect(existsSync(transaction)).toBe(true);
  });
});
