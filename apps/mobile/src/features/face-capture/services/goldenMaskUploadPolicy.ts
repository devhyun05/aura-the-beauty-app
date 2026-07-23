export const GOLDEN_MASK_RETRY_BASE_DELAY_MS = 20_000;
export const GOLDEN_MASK_RETRY_MAX_DELAY_MS = 5 * 60_000;
export const GOLDEN_MASK_MAX_ATTEMPTS = 48;
export const GOLDEN_MASK_MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60_000;
export const GOLDEN_MASK_MAX_PENDING_ITEMS = 8;

type PendingQueueItem = {
  attempts: number;
  queuedAtUnixMs: number;
};

export function isGoldenMaskQueueOwner(
  storedUserId: unknown,
  activeUserId: string,
): boolean {
  return (
    typeof storedUserId === 'string' &&
    storedUserId.length > 0 &&
    storedUserId === activeUserId
  );
}

export function isGoldenMaskPendingArtifactUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return false;
  }
  const segments = decoded.slice('file://'.length).split('/');
  const fileName = segments[segments.length - 1];
  if (
    segments.some(segment => segment === '.' || segment === '..') ||
    fileName?.endsWith('.auragm') !== true
  ) {
    return false;
  }
  return segments.some(
    (segment, index) =>
      segment === 'golden-mask' && segments[index + 1] === 'pending',
  );
}

export function getGoldenMaskRetryDelayMs(attempts: number): number {
  const boundedAttempts = Math.max(0, Math.min(Math.floor(attempts), 4));
  return Math.min(
    GOLDEN_MASK_RETRY_BASE_DELAY_MS * 2 ** boundedAttempts,
    GOLDEN_MASK_RETRY_MAX_DELAY_MS,
  );
}

export function shouldRetryGoldenMaskBackendStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export function isGoldenMaskMediaCleanupCompleteStatus(
  status: number,
): boolean {
  return status === 404 || status === 409;
}

export function isGoldenMaskPendingExpired(
  item: PendingQueueItem,
  nowUnixMs: number,
): boolean {
  return (
    item.attempts >= GOLDEN_MASK_MAX_ATTEMPTS ||
    nowUnixMs - item.queuedAtUnixMs > GOLDEN_MASK_MAX_PENDING_AGE_MS
  );
}

export function boundGoldenMaskPendingItems<T extends PendingQueueItem>(
  items: readonly T[],
): {dropped: T[]; kept: T[]} {
  if (items.length <= GOLDEN_MASK_MAX_PENDING_ITEMS) {
    return {dropped: [], kept: [...items]};
  }
  const sorted = [...items].sort(
    (left, right) => left.queuedAtUnixMs - right.queuedAtUnixMs,
  );
  const dropCount = sorted.length - GOLDEN_MASK_MAX_PENDING_ITEMS;
  return {
    dropped: sorted.slice(0, dropCount),
    kept: sorted.slice(dropCount),
  };
}
