import {
  GOLDEN_MASK_MAX_ATTEMPTS,
  GOLDEN_MASK_MAX_PENDING_AGE_MS,
  GOLDEN_MASK_MAX_PENDING_ITEMS,
  boundGoldenMaskPendingItems,
  getGoldenMaskRetryDelayMs,
  isGoldenMaskQueueOwner,
  isGoldenMaskPendingExpired,
  isGoldenMaskPendingArtifactUri,
  isGoldenMaskMediaCleanupCompleteStatus,
  shouldRetryGoldenMaskBackendStatus,
} from './goldenMaskUploadPolicy';

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(`goldenMask upload policy: ${label}`);
  }
}

assert(getGoldenMaskRetryDelayMs(0) === 20_000, 'retry starts at 20 seconds');
assert(getGoldenMaskRetryDelayMs(4) === 300_000, 'retry caps at five minutes');
assert(getGoldenMaskRetryDelayMs(40) === 300_000, 'retry remains capped');
assert(!shouldRetryGoldenMaskBackendStatus(404), 'missing report is terminal');
assert(
  !shouldRetryGoldenMaskBackendStatus(409),
  'attachment conflict is terminal',
);
assert(
  isGoldenMaskMediaCleanupCompleteStatus(404),
  'already missing cleanup media completes its tombstone',
);
assert(
  isGoldenMaskMediaCleanupCompleteStatus(409),
  'already referenced cleanup media completes its tombstone',
);
assert(
  !isGoldenMaskMediaCleanupCompleteStatus(503),
  'cleanup tombstone survives a server failure',
);
assert(shouldRetryGoldenMaskBackendStatus(503), 'server failure retries');
assert(!shouldRetryGoldenMaskBackendStatus(400), 'invalid request is terminal');
assert(isGoldenMaskQueueOwner('user-a', 'user-a'), 'same account owns its queue');
assert(
  !isGoldenMaskQueueOwner('user-a', 'user-b'),
  'another account cannot consume the queue',
);
assert(
  isGoldenMaskPendingArtifactUri(
    'file:///app/Library/Application%20Support/golden-mask/pending/capture.auragm',
  ),
  'Unity pending artifact path is deletable',
);
assert(
  !isGoldenMaskPendingArtifactUri(
    'file:///app/Library/Application%20Support/golden-mask/pending/../private.auragm',
  ),
  'path traversal is rejected',
);
assert(
  !isGoldenMaskPendingArtifactUri('file:///app/Documents/private.auragm'),
  'unrelated auragm files are rejected',
);

const now = 10_000_000_000;
assert(
  isGoldenMaskPendingExpired(
    {attempts: GOLDEN_MASK_MAX_ATTEMPTS, queuedAtUnixMs: now},
    now,
  ),
  'attempt bound expires an item',
);
assert(
  isGoldenMaskPendingExpired(
    {
      attempts: 0,
      queuedAtUnixMs: now - GOLDEN_MASK_MAX_PENDING_AGE_MS - 1,
    },
    now,
  ),
  'age bound expires an item',
);

const bounded = boundGoldenMaskPendingItems(
  Array.from({length: GOLDEN_MASK_MAX_PENDING_ITEMS + 2}, (_, index) => ({
    attempts: 0,
    id: index,
    queuedAtUnixMs: index,
  })),
);
assert(bounded.kept.length === GOLDEN_MASK_MAX_PENDING_ITEMS, 'queue is bounded');
assert(
  bounded.dropped.map(item => item.id).join(',') === '0,1',
  'oldest pending private files are pruned first',
);

console.info('goldenMask upload policy passed');
