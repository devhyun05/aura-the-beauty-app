import {MAKEUP_RECIPE_REGIONS, type MakeupRecipeRegion} from './fullFaceMakeupRecipe';

export type FullFaceCaptureShotKind =
  | 'neutral'
  | 'mouthOpen'
  | 'mouthClosed'
  | 'smile'
  | 'pucker'
  | 'yawLeft'
  | 'yawRight';

export type UnitySynchronizedCaptureRequest = {
  capturePairId: string;
  captureSetId: string;
  captureShotKind: FullFaceCaptureShotKind;
  requestedAtMs: number;
  requestedBy: 'aura-full-face';
  purpose: string;
};

export type UnitySynchronizedCaptureEvent = {
  type: 'e7_reference_capture';
  status: 'requested' | 'busy' | 'exported' | 'failed' | string;
  capturePairId: string;
  captureSetId?: string;
  captureShotKind?: FullFaceCaptureShotKind | string;
  relativeDirectory?: string;
  framePreviewUri?: string;
  detail?: string;
  meshVertexCount?: number;
  meshIndexCount?: number;
  meshUvCount?: number;
  frameWidth?: number;
  coordinateSpaceValidated?: boolean;
  coordinateSpaceValidationStatus?: string;
};

export type FullFaceCaptureBundle = {
  capturePairId: string;
  captureSetId: string;
  captureShotKind: FullFaceCaptureShotKind;
  relativeDirectory: string;
  framePath: string;
  arFaceExportPath: string;
  captureSummaryPath: string;
  framePreviewUri?: string;
};

export type FullFaceMakeupSourceInput = {
  capture: FullFaceCaptureBundle;
  regions: readonly MakeupRecipeRegion[];
  privacy: {
    localOnly: true;
    offDeviceUpload: false;
    longTermRawFrameStored: false;
  };
};

const CAPTURE_ROOT_RELATIVE_DIRECTORY = 'Documents/e7-reference-atlas/capture_pairs';

export function buildUnitySynchronizedCaptureRequest({
  capturePairId,
  captureSetId,
  captureShotKind = 'neutral',
  requestedAtMs = Date.now(),
}: {
  capturePairId?: string;
  captureSetId?: string;
  captureShotKind?: FullFaceCaptureShotKind;
  requestedAtMs?: number;
} = {}): UnitySynchronizedCaptureRequest {
  const resolvedCaptureSetId = captureSetId ?? `full-face-capture-set-${requestedAtMs}`;
  const resolvedCapturePairId =
    capturePairId ?? `pair_face_full_face_${requestedAtMs}`;

  return {
    capturePairId: resolvedCapturePairId,
    captureSetId: resolvedCaptureSetId,
    captureShotKind,
    requestedAtMs,
    requestedBy: 'aura-full-face',
    purpose: `full_face_makeup_capture_${captureShotKind}`,
  };
}

export function buildFullFaceCaptureBundleFromRequest(
  request: UnitySynchronizedCaptureRequest,
): FullFaceCaptureBundle {
  return buildFullFaceCaptureBundle({
    capturePairId: request.capturePairId,
    captureSetId: request.captureSetId,
    captureShotKind: request.captureShotKind,
    relativeDirectory: `${CAPTURE_ROOT_RELATIVE_DIRECTORY}/${request.capturePairId}`,
  });
}

export function buildFullFaceCaptureBundleFromEvent(
  event: UnitySynchronizedCaptureEvent,
): FullFaceCaptureBundle | null {
  if (
    event.status !== 'exported' ||
    !event.capturePairId ||
    !event.captureSetId ||
    !event.relativeDirectory
  ) {
    return null;
  }

  return buildFullFaceCaptureBundle({
    capturePairId: event.capturePairId,
    captureSetId: event.captureSetId,
    captureShotKind: normalizeCaptureShotKind(event.captureShotKind),
    framePreviewUri: event.framePreviewUri,
    relativeDirectory: event.relativeDirectory,
  });
}

export function buildFullFaceMakeupSourceInput(
  capture: FullFaceCaptureBundle,
): FullFaceMakeupSourceInput {
  return {
    capture,
    regions: MAKEUP_RECIPE_REGIONS,
    privacy: {
      localOnly: true,
      offDeviceUpload: false,
      longTermRawFrameStored: false,
    },
  };
}

function buildFullFaceCaptureBundle({
  capturePairId,
  captureSetId,
  captureShotKind,
  framePreviewUri,
  relativeDirectory,
}: {
  capturePairId: string;
  captureSetId: string;
  captureShotKind: FullFaceCaptureShotKind;
  framePreviewUri?: string;
  relativeDirectory: string;
}): FullFaceCaptureBundle {
  return {
    capturePairId,
    captureSetId,
    captureShotKind,
    relativeDirectory,
    framePath: `${relativeDirectory}/frame.png`,
    arFaceExportPath: `${relativeDirectory}/arface_export.json`,
    captureSummaryPath: `${relativeDirectory}/capture_summary.json`,
    framePreviewUri,
  };
}

function normalizeCaptureShotKind(
  value: FullFaceCaptureShotKind | string | undefined,
): FullFaceCaptureShotKind {
  switch (value) {
    case 'mouthOpen':
    case 'mouthClosed':
    case 'smile':
    case 'pucker':
    case 'yawLeft':
    case 'yawRight':
      return value;
    default:
      return 'neutral';
  }
}
