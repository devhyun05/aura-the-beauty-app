import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {shouldCreateFaceAnalysisReportFromCapture} from './faceAnalysisRoutes';

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
