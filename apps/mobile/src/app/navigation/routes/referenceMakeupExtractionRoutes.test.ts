import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {mapFaceCaptureResultToReferenceMakeupPhoto} from './referenceMakeupExtractionRoutes';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const baseCaptureResult: FaceCaptureUploadResult = {
  bucket: 'local',
  cdnUrl: null,
  contentType: 'image/jpeg',
  imageUri: 'file:///reference-camera.jpg',
  mediaId: 'media-reference',
  objectKey: 'file:///reference-camera.jpg',
  photoCaptureId: 'capture-reference',
  source: 'camera',
};

const cameraPhoto = mapFaceCaptureResultToReferenceMakeupPhoto(baseCaptureResult);
const albumPhoto = mapFaceCaptureResultToReferenceMakeupPhoto({
  ...baseCaptureResult,
  imageUri: 'file:///reference-album.jpg',
  mediaId: 'media-album',
  objectKey: 'file:///reference-album.jpg',
  photoCaptureId: 'capture-album',
  source: 'gallery',
});
const missingPhoto = mapFaceCaptureResultToReferenceMakeupPhoto(undefined);

function getImageSourceUri(photo: ReturnType<typeof mapFaceCaptureResultToReferenceMakeupPhoto>) {
  const imageSource = photo?.imageSource;

  return typeof imageSource === 'object' && imageSource !== null && 'uri' in imageSource
    ? imageSource.uri
    : null;
}

expectEqual(cameraPhoto?.referenceSource, 'camera', 'camera source maps to reference camera');
expectEqual(getImageSourceUri(cameraPhoto), baseCaptureResult.imageUri, 'camera photo preserves uri');
expectEqual(cameraPhoto?.title, '촬영한 참고 사진', 'camera photo title');
expectEqual(albumPhoto?.referenceSource, 'album', 'gallery source maps to reference album');
expectEqual(getImageSourceUri(albumPhoto), 'file:///reference-album.jpg', 'album photo preserves uri');
expectEqual(albumPhoto?.title, '업로드한 참고 사진', 'album photo title');
expectEqual(missingPhoto, null, 'missing capture result maps to null');
