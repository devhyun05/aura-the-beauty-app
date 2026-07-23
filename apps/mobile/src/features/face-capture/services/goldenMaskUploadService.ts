import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import {
  GOLDEN_MASK_CONTENT_TYPE,
  GOLDEN_MASK_MEDIA_KIND,
  GOLDEN_MASK_SCHEMA_VERSION,
  parseGoldenMaskCaptureArtifact,
  parseGoldenMaskReportDescriptor,
  type GoldenMaskCaptureArtifact,
  type GoldenMaskReportDescriptor,
} from '../../../shared/contracts/goldenMask';
import {
  BackendApiError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {uploadMediaAsset} from '../../../shared/services/mediaUploadService';
import {
  boundGoldenMaskPendingItems,
  getGoldenMaskRetryDelayMs,
  isGoldenMaskMediaCleanupCompleteStatus,
  isGoldenMaskPendingExpired,
  isGoldenMaskPendingArtifactUri,
  isGoldenMaskQueueOwner,
  shouldRetryGoldenMaskBackendStatus,
} from './goldenMaskUploadPolicy';

const PENDING_STORAGE_PREFIX = 'aura.golden-mask.pending.v1:';
const CLEANUP_STORAGE_PREFIX = 'aura.golden-mask.cleanup.v1:';
const CACHE_FOLDER = 'aura-golden-mask/v1';

type PendingGoldenMaskUpload = GoldenMaskCaptureArtifact & {
  attempts: number;
  localUri: string;
  pendingSourceUri?: string;
  queuedAtUnixMs: number;
  reportId: string;
  uploadedMediaId?: string;
  userId: string;
};

type AttachGoldenMaskResponse = {
  goldenMask: unknown;
};

type DeleteGoldenMaskMediaResponse = {
  alreadyDeleted: boolean;
  deleted: true;
  mediaId: string;
  outboxCount: number;
};

let activeUserId: string | null = null;
type PendingGoldenMaskMediaCleanup = {
  attempts: number;
  mediaId: string;
  queuedAtUnixMs: number;
  userId: string;
};

type GoldenMaskAttachment = {
  descriptor: GoldenMaskReportDescriptor;
  reportId: string;
};

const flushes = new Map<string, Promise<GoldenMaskAttachment[]>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const queueLocks = new Map<string, Promise<void>>();
const cleanupFlushes = new Map<string, Promise<void>>();
const cleanupRetryTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const cleanupLocks = new Map<string, Promise<void>>();

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function queueKey(userId: string): string {
  return `${PENDING_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function cleanupKey(userId: string): string {
  return `${CLEANUP_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function userDirectory(userId: string): string | null {
  return FileSystem.cacheDirectory
    ? `${FileSystem.cacheDirectory}${CACHE_FOLDER}/${safePathPart(userId)}/`
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePendingItem(value: unknown, userId: string): PendingGoldenMaskUpload | null {
  if (!isRecord(value)) {
    return null;
  }

  const artifact = {
    byteSize: value.byteSize,
    captureId: value.captureId,
    createdAtUnixMs: value.createdAtUnixMs,
    schemaVersion: value.schemaVersion,
    topologyFingerprint: value.topologyFingerprint,
    triangleIndexCount: value.triangleIndexCount,
    trueDepthHardware: value.trueDepthHardware,
    uri: value.localUri,
    uvCount: value.uvCount,
    vertexCount: value.vertexCount,
  };
  const reportId =
    typeof value.reportId === 'string' && value.reportId.trim()
      ? value.reportId.trim()
      : null;
  const localUri =
    typeof value.localUri === 'string' && value.localUri.startsWith('file:')
      ? value.localUri
      : null;
  const attempts =
    typeof value.attempts === 'number' &&
    Number.isSafeInteger(value.attempts) &&
    value.attempts >= 0
      ? value.attempts
      : 0;
  const queuedAtUnixMs =
    typeof value.queuedAtUnixMs === 'number' &&
    Number.isSafeInteger(value.queuedAtUnixMs) &&
    value.queuedAtUnixMs > 0
      ? value.queuedAtUnixMs
      : typeof value.createdAtUnixMs === 'number'
        ? value.createdAtUnixMs
        : 0;
  const parsedArtifact = parseGoldenMaskCaptureArtifact(artifact);

  if (
    !parsedArtifact ||
    !reportId ||
    !localUri ||
    !queuedAtUnixMs ||
    !isGoldenMaskQueueOwner(value.userId, userId)
  ) {
    return null;
  }

  const uploadedMediaId =
    typeof value.uploadedMediaId === 'string' && value.uploadedMediaId.trim()
      ? value.uploadedMediaId.trim()
      : undefined;
  const pendingSourceUri = isGoldenMaskPendingArtifactUri(
    value.pendingSourceUri,
  )
    ? value.pendingSourceUri
    : undefined;

  return {
    ...parsedArtifact,
    attempts,
    localUri,
    ...(pendingSourceUri ? {pendingSourceUri} : {}),
    queuedAtUnixMs,
    reportId,
    ...(uploadedMediaId ? {uploadedMediaId} : {}),
    userId,
  };
}

async function readQueue(userId: string): Promise<PendingGoldenMaskUpload[]> {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map(item => parsePendingItem(item, userId))
          .filter((item): item is PendingGoldenMaskUpload => item !== null)
      : [];
  } catch {
    return [];
  }
}

async function writeQueue(
  userId: string,
  items: readonly PendingGoldenMaskUpload[],
): Promise<void> {
  if (!items.length) {
    await AsyncStorage.removeItem(queueKey(userId));
    return;
  }
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(items));
}

function parseCleanupItem(
  value: unknown,
  userId: string,
): PendingGoldenMaskMediaCleanup | null {
  if (!isRecord(value) || !isGoldenMaskQueueOwner(value.userId, userId)) {
    return null;
  }
  const mediaId =
    typeof value.mediaId === 'string' &&
    value.mediaId.trim() &&
    value.mediaId.trim().length <= 200
      ? value.mediaId.trim()
      : null;
  const attempts =
    typeof value.attempts === 'number' &&
    Number.isSafeInteger(value.attempts) &&
    value.attempts >= 0
      ? value.attempts
      : 0;
  const queuedAtUnixMs =
    typeof value.queuedAtUnixMs === 'number' &&
    Number.isSafeInteger(value.queuedAtUnixMs) &&
    value.queuedAtUnixMs > 0
      ? value.queuedAtUnixMs
      : 0;
  return mediaId && queuedAtUnixMs
    ? {attempts, mediaId, queuedAtUnixMs, userId}
    : null;
}

async function readCleanupQueue(
  userId: string,
): Promise<PendingGoldenMaskMediaCleanup[]> {
  const raw = await AsyncStorage.getItem(cleanupKey(userId));
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map(item => parseCleanupItem(item, userId))
          .filter(
            (item): item is PendingGoldenMaskMediaCleanup => item !== null,
          )
      : [];
  } catch {
    return [];
  }
}

async function writeCleanupQueue(
  userId: string,
  items: readonly PendingGoldenMaskMediaCleanup[],
): Promise<void> {
  if (!items.length) {
    await AsyncStorage.removeItem(cleanupKey(userId));
    return;
  }
  await AsyncStorage.setItem(cleanupKey(userId), JSON.stringify(items));
}

async function pruneUserCacheDirectory(
  userId: string,
  items: readonly PendingGoldenMaskUpload[],
): Promise<void> {
  const directory = userDirectory(userId);
  if (!directory) {
    return;
  }
  const retainedNames = new Set(
    items
      .map(item =>
        item.localUri.startsWith(directory)
          ? item.localUri.slice(directory.length)
          : null,
      )
      .filter((name): name is string => Boolean(name)),
  );
  try {
    const names = await FileSystem.readDirectoryAsync(directory);
    await Promise.all(
      names
        .filter(name => name.endsWith('.auragm') && !retainedNames.has(name))
        .map(name =>
          FileSystem.deleteAsync(`${directory}${name}`, {idempotent: true}),
        ),
    );
  } catch {
    // Cache directories may be evicted between reads. The queue's size check
    // drops any missing item on the next flush.
  }
}

async function withQueueLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(userId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  queueLocks.set(userId, chained);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queueLocks.get(userId) === chained) {
      queueLocks.delete(userId);
    }
  }
}

async function withCleanupLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = cleanupLocks.get(userId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  cleanupLocks.set(userId, chained);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (cleanupLocks.get(userId) === chained) {
      cleanupLocks.delete(userId);
    }
  }
}

async function fileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && typeof info.size === 'number'
      ? info.size
      : null;
  } catch {
    return null;
  }
}

export async function deleteGoldenMaskPendingArtifact(
  artifact: Pick<GoldenMaskCaptureArtifact, 'uri'> | null | undefined,
): Promise<void> {
  if (!isGoldenMaskPendingArtifactUri(artifact?.uri)) {
    return;
  }
  await FileSystem.deleteAsync(artifact.uri, {idempotent: true});
}

async function clearPendingSource(
  item: PendingGoldenMaskUpload,
): Promise<PendingGoldenMaskUpload> {
  if (!item.pendingSourceUri) {
    return item;
  }
  try {
    await deleteGoldenMaskPendingArtifact({uri: item.pendingSourceUri});
    const {pendingSourceUri: _removed, ...cleared} = item;
    return cleared;
  } catch {
    return item;
  }
}

async function makeDurableCopy({
  artifact,
  reportId,
  userId,
}: {
  artifact: GoldenMaskCaptureArtifact;
  reportId: string;
  userId: string;
}): Promise<string> {
  const directory = userDirectory(userId);
  if (!directory) {
    throw new Error('Golden Mask retry cache is unavailable.');
  }

  await FileSystem.makeDirectoryAsync(directory, {intermediates: true});
  const destination = `${directory}${safePathPart(reportId)}-${safePathPart(
    artifact.captureId,
  )}.auragm`;

  if (artifact.uri !== destination) {
    // A retry for the same report/capture resolves to the same deterministic
    // cache path. Expo's copy semantics differ by platform when the target
    // already exists, so replace it explicitly while the per-user queue lock
    // is held.
    await FileSystem.deleteAsync(destination, {idempotent: true});
    await FileSystem.copyAsync({from: artifact.uri, to: destination});
  }

  const copiedByteSize = await fileSize(destination);
  if (copiedByteSize !== artifact.byteSize) {
    await FileSystem.deleteAsync(destination, {idempotent: true});
    throw new Error('Golden Mask file size changed before it could be stored.');
  }

  return destination;
}

async function uploadPendingItem(item: PendingGoldenMaskUpload): Promise<string> {
  return (
    await uploadMediaAsset({
      contentType: GOLDEN_MASK_CONTENT_TYPE,
      fileName: `golden-mask-${safePathPart(item.captureId)}.auragm`,
      mediaKind: GOLDEN_MASK_MEDIA_KIND,
      source: 'generated',
      uri: item.localUri,
    })
  ).id;
}

async function tryDeleteUnattachedMedia(
  userId: string,
  mediaId: string,
): Promise<boolean> {
  try {
    await requestBackendJson<DeleteGoldenMaskMediaResponse>(
      `/analysis/golden-mask-media/${encodeURIComponent(mediaId)}`,
      {method: 'DELETE'},
    );
    return true;
  } catch (error) {
    if (activeUserId !== userId) {
      return false;
    }
    return (
      error instanceof BackendApiError &&
      isGoldenMaskMediaCleanupCompleteStatus(error.status)
    );
  }
}

function scheduleMediaCleanupRetry(userId: string, attempts: number): void {
  if (
    activeUserId !== userId ||
    cleanupRetryTimers.has(userId)
  ) {
    return;
  }
  const timer = setTimeout(() => {
    cleanupRetryTimers.delete(userId);
    void flushGoldenMaskMediaCleanup(userId);
  }, getGoldenMaskRetryDelayMs(attempts));
  cleanupRetryTimers.set(userId, timer);
}

export async function flushGoldenMaskMediaCleanup(
  userId: string,
): Promise<void> {
  if (activeUserId !== userId) {
    return;
  }
  const existing = cleanupFlushes.get(userId);
  if (existing) {
    return existing;
  }
  const flush = withCleanupLock(userId, async () => {
    const items = await readCleanupQueue(userId);
    const remaining: PendingGoldenMaskMediaCleanup[] = [];
    for (const item of items) {
      if (
        activeUserId !== userId ||
        !(await tryDeleteUnattachedMedia(userId, item.mediaId))
      ) {
        remaining.push({...item, attempts: item.attempts + 1});
      }
    }
    await writeCleanupQueue(userId, remaining);
    if (remaining.length) {
      scheduleMediaCleanupRetry(
        userId,
        Math.min(...remaining.map(item => item.attempts)),
      );
    }
  }).finally(() => {
    cleanupFlushes.delete(userId);
  });
  cleanupFlushes.set(userId, flush);
  return flush;
}

async function enqueueMediaCleanup(
  userId: string,
  mediaIds: readonly (string | undefined)[],
): Promise<void> {
  const uniqueMediaIds = [
    ...new Set(
      mediaIds.filter(
        (mediaId): mediaId is string =>
          typeof mediaId === 'string' && Boolean(mediaId.trim()),
      ),
    ),
  ];
  if (!uniqueMediaIds.length) {
    return;
  }
  await withCleanupLock(userId, async () => {
    const items = await readCleanupQueue(userId);
    const existingIds = new Set(items.map(item => item.mediaId));
    const now = Date.now();
    await writeCleanupQueue(userId, [
      ...items,
      ...uniqueMediaIds
        .filter(mediaId => !existingIds.has(mediaId))
        .map(mediaId => ({
          attempts: 0,
          mediaId,
          queuedAtUnixMs: now,
          userId,
        })),
    ]);
  });
  await flushGoldenMaskMediaCleanup(userId);
}

async function discardPendingItem(item: PendingGoldenMaskUpload): Promise<void> {
  await FileSystem.deleteAsync(item.localUri, {idempotent: true});
  if (item.pendingSourceUri) {
    await deleteGoldenMaskPendingArtifact({uri: item.pendingSourceUri}).catch(
      () => undefined,
    );
  }
  await enqueueMediaCleanup(item.userId, [item.uploadedMediaId]);
}

async function attachPendingItem(
  item: PendingGoldenMaskUpload,
  mediaId: string,
): Promise<GoldenMaskReportDescriptor> {
  const response = await requestBackendJson<AttachGoldenMaskResponse>(
    `/analysis/reports/${item.reportId}/golden-mask`,
    {
      body: {
        byteSize: item.byteSize,
        captureId: item.captureId,
        createdAt: new Date(item.createdAtUnixMs).toISOString(),
        indexCount: item.triangleIndexCount,
        mediaId,
        schemaVersion: GOLDEN_MASK_SCHEMA_VERSION,
        topologyFingerprint: item.topologyFingerprint,
        trueDepthHardware: item.trueDepthHardware,
        uvCount: item.uvCount,
        vertexCount: item.vertexCount,
      },
      method: 'POST',
    },
  );

  const descriptor = parseGoldenMaskReportDescriptor(response.goldenMask);
  if (!descriptor) {
    throw new Error('Backend returned an invalid Golden Mask descriptor.');
  }
  return descriptor;
}

function scheduleRetry(userId: string, attempts: number): void {
  if (activeUserId !== userId || retryTimers.has(userId)) {
    return;
  }
  const timer = setTimeout(() => {
    retryTimers.delete(userId);
    void flushPendingGoldenMaskUploads(userId);
  }, getGoldenMaskRetryDelayMs(attempts));
  retryTimers.set(userId, timer);
}

export async function flushPendingGoldenMaskUploads(
  userId: string,
): Promise<GoldenMaskAttachment[]> {
  if (activeUserId !== userId) {
    return [];
  }
  const existing = flushes.get(userId);
  if (existing) {
    return existing;
  }

  const flush = withQueueLock(userId, async () => {
    const items = await readQueue(userId);
    const attached: GoldenMaskAttachment[] = [];
    const remaining: PendingGoldenMaskUpload[] = [];

    for (let index = 0; index < items.length; index += 1) {
      let item = await clearPendingSource(items[index]!);
      if (item !== items[index]) {
        items[index] = item;
        await writeQueue(userId, items);
      }
      if (item.pendingSourceUri) {
        const nextItem = {...item, attempts: item.attempts + 1};
        if (isGoldenMaskPendingExpired(nextItem, Date.now())) {
          await discardPendingItem(nextItem);
        } else {
          remaining.push(nextItem);
        }
        continue;
      }
      if (
        activeUserId !== userId ||
        isGoldenMaskPendingExpired(item, Date.now()) ||
        (await fileSize(item.localUri)) !== item.byteSize
      ) {
        if (activeUserId === userId) {
          await discardPendingItem(item);
        } else {
          remaining.push(item);
        }
        continue;
      }
      try {
        if (!item.uploadedMediaId) {
          item = {
            ...item,
            uploadedMediaId: await uploadPendingItem(item),
          };
          // If the app stops between upload completion and report attachment,
          // the next run reuses this private media object instead of orphaning
          // another upload.
          items[index] = item;
          await writeQueue(userId, items);
        }
        if (activeUserId !== userId) {
          remaining.push(item);
          continue;
        }
        const uploadedMediaId = item.uploadedMediaId;
        if (!uploadedMediaId) {
          throw new Error('Golden Mask media upload did not return an id.');
        }
        const descriptor = await attachPendingItem(item, uploadedMediaId);
        attached.push({descriptor, reportId: item.reportId});
        await FileSystem.deleteAsync(item.localUri, {idempotent: true});
      } catch (error) {
        const nextItem = {...item, attempts: item.attempts + 1};
        const shouldRetry =
          !(error instanceof BackendApiError) ||
          shouldRetryGoldenMaskBackendStatus(error.status);
        if (!shouldRetry || isGoldenMaskPendingExpired(nextItem, Date.now())) {
          await discardPendingItem(item);
          continue;
        }
        remaining.push(nextItem);
      }
    }

    await writeQueue(userId, remaining);
    await pruneUserCacheDirectory(userId, remaining);
    if (remaining.length) {
      scheduleRetry(
        userId,
        Math.min(...remaining.map(item => item.attempts)),
      );
    }
    return attached;
  }).finally(() => {
    flushes.delete(userId);
  });

  flushes.set(userId, flush);
  return flush;
}

export async function queueGoldenMaskUploadForReport({
  artifact,
  reportId,
  userId,
}: {
  artifact: GoldenMaskCaptureArtifact;
  reportId: string;
  userId: string;
}): Promise<GoldenMaskReportDescriptor | null> {
  if (activeUserId && activeUserId !== userId) {
    throw new Error('Golden Mask owner no longer matches the active account.');
  }
  await withQueueLock(userId, async () => {
    const localUri = await makeDurableCopy({artifact, reportId, userId});
    const items = await readQueue(userId);
    const previous = items.find(item => item.reportId === reportId);
    if (previous && previous.localUri !== localUri) {
      await discardPendingItem(previous);
    }
    const next: PendingGoldenMaskUpload = {
      ...artifact,
      attempts: 0,
      localUri,
      ...(isGoldenMaskPendingArtifactUri(artifact.uri) &&
      artifact.uri !== localUri
        ? {pendingSourceUri: artifact.uri}
        : {}),
      queuedAtUnixMs: Date.now(),
      reportId,
      uri: localUri,
      ...(previous?.captureId === artifact.captureId &&
      previous.uploadedMediaId
        ? {uploadedMediaId: previous.uploadedMediaId}
        : {}),
      userId,
    };
    const bounded = boundGoldenMaskPendingItems([
      ...items.filter(item => item.reportId !== reportId),
      next,
    ]);
    await writeQueue(userId, bounded.kept);
    for (const dropped of bounded.dropped) {
      await discardPendingItem(dropped);
    }
    await pruneUserCacheDirectory(userId, bounded.kept);
    if (next.pendingSourceUri) {
      const cleared = await clearPendingSource(next);
      if (cleared !== next) {
        await writeQueue(
          userId,
          bounded.kept.map(item => (item.reportId === reportId ? cleared : item)),
        );
      }
    }
  });

  const attachments = await flushPendingGoldenMaskUploads(userId);
  return (
    attachments.find(attachment => attachment.reportId === reportId)
      ?.descriptor ?? null
  );
}

export async function clearGoldenMaskPendingUploadsForUser(
  userId: string,
): Promise<void> {
  const timer = retryTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(userId);
  }

  await withQueueLock(userId, async () => {
    const directory = userDirectory(userId);
    const items = await readQueue(userId);
    await Promise.all(
      items.map(item =>
        item.pendingSourceUri
          ? deleteGoldenMaskPendingArtifact({uri: item.pendingSourceUri}).catch(
              () => undefined,
            )
          : Promise.resolve(),
      ),
    );
    await AsyncStorage.removeItem(queueKey(userId));
    if (directory) {
      await FileSystem.deleteAsync(directory, {idempotent: true});
    }
    await enqueueMediaCleanup(
      userId,
      items.map(item => item.uploadedMediaId),
    );
  });
}

export async function clearGoldenMaskCleanupTombstonesForUser(
  userId: string,
): Promise<void> {
  const timer = cleanupRetryTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    cleanupRetryTimers.delete(userId);
  }
  await withCleanupLock(userId, () =>
    AsyncStorage.removeItem(cleanupKey(userId)),
  );
}

export async function handleGoldenMaskAuthUserChanged(
  previousUserId: string | null,
  nextUserId: string | null,
): Promise<void> {
  activeUserId = nextUserId;
  if (previousUserId && previousUserId !== nextUserId) {
    await clearGoldenMaskPendingUploadsForUser(previousUserId);
  }
  if (nextUserId) {
    await flushGoldenMaskMediaCleanup(nextUserId);
    await flushPendingGoldenMaskUploads(nextUserId);
  }
}
