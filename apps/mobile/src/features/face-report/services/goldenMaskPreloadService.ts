import type {
  GoldenMaskCaptureArtifact,
  GoldenMaskReportDescriptor,
} from '../../../shared/contracts/goldenMask';
import {
  GOLDEN_MASK_CONTENT_TYPE,
} from '../../../shared/contracts/goldenMask';
import {
  addUnityGoldenMaskEventListener,
  ensureUnityMakeupRunningForStillAnalysis,
  isUnityMakeupFrameworkAvailable,
  loadUnityGoldenMask,
  releaseUnityMakeupHiddenRunLease,
  unloadUnityGoldenMask,
} from '../../ar/services/unityMakeupBridge';
import {downloadGoldenMaskForReport} from './goldenMaskReportService';

const LOAD_TIMEOUT_MS = 4_000;

export type GoldenMaskPreparedResult = {
  ready: boolean;
  reportId: string;
  requestId: string;
  topologyFingerprint: string;
};

type GoldenMaskPreparedSession = GoldenMaskPreparedResult & {
  promise: Promise<GoldenMaskPreparedResult>;
  status: 'loading' | 'ready' | 'error';
};

let currentSession: GoldenMaskPreparedSession | null = null;

export function buildLocalGoldenMaskDescriptor(
  artifact: GoldenMaskCaptureArtifact,
): GoldenMaskReportDescriptor {
  return {
    ...artifact,
    available: true,
    contentType: GOLDEN_MASK_CONTENT_TYPE,
    createdAt: new Date(artifact.createdAtUnixMs).toISOString(),
    indexCount: artifact.triangleIndexCount,
    mediaId: `local:${artifact.captureId}`,
    source: 'arkit_face_mesh',
  };
}

function createRequestId(reportId: string): string {
  return `golden-mask:${reportId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function matchesCurrent(reportId: string, topologyFingerprint: string): boolean {
  return (
    currentSession?.reportId === reportId &&
    currentSession.topologyFingerprint === topologyFingerprint
  );
}

function canReuseCurrent(reportId: string, topologyFingerprint: string): boolean {
  return (
    matchesCurrent(reportId, topologyFingerprint) &&
    currentSession?.status !== 'error'
  );
}

async function loadPreparedSession({
  fileUri,
  reportId,
  requestId,
  topologyFingerprint,
}: {
  fileUri: string;
  reportId: string;
  requestId: string;
  topologyFingerprint: string;
}): Promise<GoldenMaskPreparedResult> {
  const startedAt = Date.now();
  const leaseId = `golden-mask-preload:${requestId}`;

  if (!isUnityMakeupFrameworkAvailable()) {
    throw new Error('Golden Mask Unity runtime is unavailable.');
  }

  const ready = await ensureUnityMakeupRunningForStillAnalysis({
    leaseId,
    timeoutMs: LOAD_TIMEOUT_MS,
  });
  if (!ready) {
    releaseUnityMakeupHiddenRunLease(leaseId);
    throw new Error('Golden Mask Unity runtime did not become ready.');
  }

  try {
    const loaded = await new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        resolve(value);
      };
      const subscription = addUnityGoldenMaskEventListener(event => {
        if (event.requestId !== requestId) {
          return;
        }
        if (event.type === 'golden_mask_ready') {
          finish(true);
        } else if (event.type === 'golden_mask_failed') {
          finish(false);
        }
      });
      const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);

      if (!loadUnityGoldenMask({fileUri, requestId})) {
        finish(false);
      }
    });

    if (!loaded) {
      throw new Error('Golden Mask mesh did not finish loading.');
    }

    console.info('[aura:golden-mask] preload:ready', {
      elapsedMs: Date.now() - startedAt,
      reportId,
      requestId,
    });
    return {ready: true, reportId, requestId, topologyFingerprint};
  } finally {
    releaseUnityMakeupHiddenRunLease(leaseId);
  }
}

function startPreparedSession({
  fileUri,
  reportId,
  topologyFingerprint,
}: {
  fileUri: string;
  reportId: string;
  topologyFingerprint: string;
}): Promise<GoldenMaskPreparedResult> {
  if (canReuseCurrent(reportId, topologyFingerprint) && currentSession) {
    console.info('[aura:golden-mask] preload:reuse', {
      reportId,
      status: currentSession.status,
    });
    return currentSession.promise;
  }

  if (currentSession) {
    unloadUnityGoldenMask(currentSession.requestId);
  }

  const requestId = createRequestId(reportId);
  const session = {
    promise: Promise.resolve({
      ready: false,
      reportId,
      requestId,
      topologyFingerprint,
    }),
    ready: false,
    reportId,
    requestId,
    status: 'loading' as const,
    topologyFingerprint,
  };
  currentSession = session;
  console.info('[aura:golden-mask] preload:start', {reportId, requestId});

  session.promise = loadPreparedSession({
    fileUri,
    reportId,
    requestId,
    topologyFingerprint,
  })
    .then(result => {
      if (currentSession === session) {
        currentSession = {...session, ...result, status: 'ready'};
      }
      return result;
    })
    .catch(error => {
      console.info('[aura:golden-mask] preload:error', {
        errorType: error instanceof Error ? error.name : typeof error,
        reportId,
        requestId,
      });
      unloadUnityGoldenMask(requestId);
      const result = {
        ready: false,
        reportId,
        requestId,
        topologyFingerprint,
      };
      if (currentSession === session) {
        currentSession = {...session, ...result, status: 'error'};
      }
      return result;
    });

  return session.promise;
}

export function preloadGoldenMaskFromCapture(
  reportId: string,
  artifact: GoldenMaskCaptureArtifact,
): Promise<GoldenMaskPreparedResult> {
  return startPreparedSession({
    fileUri: artifact.uri,
    reportId,
    topologyFingerprint: artifact.topologyFingerprint,
  });
}

export async function preloadGoldenMaskForReport(
  reportId: string,
  descriptor: GoldenMaskReportDescriptor,
): Promise<GoldenMaskPreparedResult> {
  if (
    canReuseCurrent(reportId, descriptor.topologyFingerprint) &&
    currentSession
  ) {
    return currentSession.promise;
  }
  const {fileUri} = await downloadGoldenMaskForReport(reportId, descriptor);
  return startPreparedSession({
    fileUri,
    reportId,
    topologyFingerprint: descriptor.topologyFingerprint,
  });
}

export function getPreparedGoldenMask(
  reportId: string,
  topologyFingerprint: string,
): GoldenMaskPreparedResult | null {
  if (
    !matchesCurrent(reportId, topologyFingerprint) ||
    currentSession?.status !== 'ready'
  ) {
    return null;
  }
  return {
    ready: true,
    reportId,
    requestId: currentSession.requestId,
    topologyFingerprint,
  };
}

export function disposePreparedGoldenMask(reportId: string): void {
  if (currentSession?.reportId !== reportId) {
    return;
  }
  unloadUnityGoldenMask(currentSession.requestId);
  currentSession = null;
}
