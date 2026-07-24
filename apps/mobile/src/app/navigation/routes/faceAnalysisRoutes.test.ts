import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  getFaceAnalysisReportFooterHostHeight,
  getFaceAnalysisReportFooterReservedHeight,
  resolveStillAnalysisCapture,
  shouldCreateFaceAnalysisReportFromCapture,
} from './faceAnalysisRoutes';
import type {UnifiedFaceCaptureCompletedEvent} from '../../../features/face-capture/services/unifiedFaceCaptureContract';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const captureResult: FaceCaptureUploadResult = {
  bucket: 'local',
  cdnUrl: null,
  contentType: 'image/jpeg',
  imageUri: 'file:///face-analysis.jpg',
  mediaId: 'media-face-analysis',
  objectKey: 'file:///face-analysis.jpg',
  photoCaptureId: 'capture-face-analysis',
  source: 'camera',
};

expectEqual(
  shouldCreateFaceAnalysisReportFromCapture(null),
  false,
  'face analysis loading skips missing capture',
);
expectEqual(
  shouldCreateFaceAnalysisReportFromCapture(captureResult),
  true,
  'face analysis loading starts with capture',
);
expectEqual(
  getFaceAnalysisReportFooterReservedHeight(18),
  86,
  'face analysis report reserves the floating footer below content',
);
expectEqual(
  getFaceAnalysisReportFooterHostHeight(874, 18),
  874,
  'face analysis report footer host covers screen for outside taps',
);
expectEqual(
  getFaceAnalysisReportFooterHostHeight(220, 18),
  264,
  'face analysis report footer host keeps room for quick action arc',
);

const pendingStillCapture = resolveStillAnalysisCapture(
  {
    cameraMetadata: {
      exposureDurationMs: 8,
      iso: 64,
      provider: 'arfoundation',
      whiteBalanceAvailable: true,
    },
    captureId: 'pending-capture',
    image: {
      format: 'jpg',
      height: 1600,
      mirrored: false,
      orientation: 'upright',
      uri: 'file:///pending-face.jpg',
      width: 1200,
    },
  } as UnifiedFaceCaptureCompletedEvent,
  null,
);

expectEqual(
  pendingStillCapture?.imageUri,
  'file:///pending-face.jpg',
  'still analysis can start from the local capture before upload completion',
);
expectEqual(
  pendingStillCapture?.photoCaptureId,
  'pending-capture',
  'pre-upload still analysis keeps a stable capture key',
);
expectEqual(
  pendingStillCapture?.semanticMattes?.requested,
  false,
  'unified JPEG skips the unavailable embedded semantic-matte path',
);
expectEqual(
  resolveStillAnalysisCapture(null, captureResult)?.photoCaptureId,
  captureResult.photoCaptureId,
  'legacy uploaded capture remains the fallback still-analysis source',
);
