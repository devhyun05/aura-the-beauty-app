import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {mapFaceCaptureResultToMakeupFeedbackPhotoSelection} from './makeupFeedbackRoutes';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const galleryCaptureResult: FaceCaptureUploadResult = {
  bucket: 'local',
  cameraMetadata: null,
  cdnUrl: null,
  contentType: 'image/jpeg',
  fileName: 'reference-gallery.jpg',
  height: 1920,
  imageUri: 'file:///reference-gallery.jpg',
  mediaId: 'media-gallery',
  objectKey: 'file:///reference-gallery.jpg',
  photoCaptureId: 'capture-gallery',
  source: 'gallery',
  width: 1080,
};

const cameraCaptureResult: FaceCaptureUploadResult = {
  ...galleryCaptureResult,
  imageUri: 'file:///makeup-camera.jpg',
  cameraMetadata: {
    exposureDurationMs: 8,
    iso: 80,
    isStable: true,
    whiteBalanceGains: {blue: 1.1, green: 1, red: 1.2},
  },
  fileName: 'makeup-camera.jpg',
  mediaId: 'media-camera',
  objectKey: 'file:///makeup-camera.jpg',
  height: 2048,
  photoCaptureId: 'capture-camera',
  source: 'camera',
  width: 1536,
};

const gallerySelection =
  mapFaceCaptureResultToMakeupFeedbackPhotoSelection(galleryCaptureResult);
const cameraSelection =
  mapFaceCaptureResultToMakeupFeedbackPhotoSelection(cameraCaptureResult);

expectEqual(gallerySelection.photoSource, 'gallery', 'gallery source maps to feedback gallery');
expectEqual(
  gallerySelection.imageUri,
  galleryCaptureResult.imageUri,
  'gallery source preserves image uri',
);
expectEqual(cameraSelection.photoSource, 'camera', 'camera source maps to feedback camera');
expectEqual(
  cameraSelection.imageUri,
  cameraCaptureResult.imageUri,
  'camera source preserves image uri',
);
expectEqual(cameraSelection.imageWidth, cameraCaptureResult.width, 'camera width is preserved');
expectEqual(cameraSelection.imageHeight, cameraCaptureResult.height, 'camera height is preserved');
expectEqual(
  cameraSelection.contentType,
  cameraCaptureResult.contentType,
  'camera content type is preserved',
);
expectEqual(cameraSelection.fileName, cameraCaptureResult.fileName, 'camera file name is preserved');
expectEqual(
  cameraSelection.cameraMetadata,
  cameraCaptureResult.cameraMetadata,
  'camera metadata is preserved',
);
