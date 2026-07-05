import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {mapFaceCaptureResultToMakeupFeedbackPhotoSelection} from './makeupFeedbackRoutes';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const galleryCaptureResult: FaceCaptureUploadResult = {
  bucket: 'local',
  cdnUrl: null,
  contentType: 'image/jpeg',
  imageUri: 'file:///reference-gallery.jpg',
  mediaId: 'media-gallery',
  objectKey: 'file:///reference-gallery.jpg',
  photoCaptureId: 'capture-gallery',
  source: 'gallery',
};

const cameraCaptureResult: FaceCaptureUploadResult = {
  ...galleryCaptureResult,
  imageUri: 'file:///makeup-camera.jpg',
  mediaId: 'media-camera',
  objectKey: 'file:///makeup-camera.jpg',
  photoCaptureId: 'capture-camera',
  source: 'camera',
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
