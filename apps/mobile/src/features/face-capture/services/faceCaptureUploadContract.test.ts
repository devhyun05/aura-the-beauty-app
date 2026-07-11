import {
  buildFaceAnalysisRequestPayload,
  buildFaceCaptureCompleteUploadBody,
} from './faceCaptureUploadContract';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const uploadIdBody = buildFaceCaptureCompleteUploadBody(
  {
    bucket: 'media-bucket',
    contentType: 'image/jpeg',
    objectKey: 'uploads/capture/face.jpg',
    uploadId: '11111111-1111-1111-1111-111111111111',
  },
  {
    byteSize: 123,
    contentType: 'image/jpeg',
    mediaKind: 'capture',
    originalFilename: 'face.jpg',
    source: 'camera',
  },
);

expectEqual(
  JSON.stringify(uploadIdBody),
  JSON.stringify({uploadId: '11111111-1111-1111-1111-111111111111'}),
  'current backend completion uses only the server upload id',
);

const legacyBody = buildFaceCaptureCompleteUploadBody(
  {
    bucket: 'media-bucket',
    cdnUrl: 'https://cdn.example.com/uploads/capture/face.jpg',
    contentType: 'image/jpeg',
    objectKey: 'uploads/capture/face.jpg',
  },
  {
    byteSize: 123,
    contentType: 'image/jpeg',
    height: 1600,
    mediaKind: 'capture',
    originalFilename: 'face.jpg',
    source: 'camera',
    width: 1200,
  },
);

if ('uploadId' in legacyBody) {
  throw new Error('legacy completion must not synthesize an upload id');
}

expectEqual(legacyBody.bucket, 'media-bucket', 'legacy completion bucket');
expectEqual(legacyBody.objectKey, 'uploads/capture/face.jpg', 'legacy completion object key');
expectEqual(legacyBody.mediaKind, 'capture', 'legacy completion media kind');
expectEqual(legacyBody.byteSize, 123, 'legacy completion byte size');

const blankUploadIdBody = buildFaceCaptureCompleteUploadBody(
  {
    bucket: 'media-bucket',
    objectKey: 'uploads/capture/blank-id.jpg',
    uploadId: '   ',
  },
  {
    byteSize: 321,
    contentType: 'image/jpeg',
    mediaKind: 'capture',
    originalFilename: 'blank-id.jpg',
    source: 'gallery',
  },
);

if ('uploadId' in blankUploadIdBody) {
  throw new Error('blank upload ids must use the legacy completion contract');
}

expectEqual(
  blankUploadIdBody.objectKey,
  'uploads/capture/blank-id.jpg',
  'blank upload id fallback object key',
);

const faceVerticalThirds = {
  lowerRatio: 0.34,
  middleRatio: 0.33,
  upperRatio: 0.33,
};
const analysisRequestPayload = buildFaceAnalysisRequestPayload(
  {
    bucket: 'media-bucket',
    contentType: 'image/jpeg',
    objectKey: 'uploads/capture/face.jpg',
    source: 'camera',
  },
  faceVerticalThirds,
);

expectEqual(
  analysisRequestPayload.bucket,
  'media-bucket',
  'legacy analysis request includes the uploaded bucket',
);
expectEqual(
  analysisRequestPayload.objectKey,
  'uploads/capture/face.jpg',
  'legacy analysis request includes the uploaded object key',
);
expectEqual(
  analysisRequestPayload.faceVerticalThirds,
  faceVerticalThirds,
  'analysis request preserves on-device face measurements',
);
expectEqual(
  analysisRequestPayload.contentType,
  'image/jpeg',
  'legacy analysis request includes the uploaded content type',
);
expectEqual(
  analysisRequestPayload.task,
  'face_makeup_recommendation_report_v1',
  'analysis request preserves the face analysis task',
);
expectEqual(
  'cdnUrl' in analysisRequestPayload,
  false,
  'analysis request does not need a client-provided CDN URL',
);
expectEqual(
  'imageUrl' in analysisRequestPayload,
  false,
  'analysis request does not need a client-provided image URL',
);
expectEqual(
  'sourceUri' in analysisRequestPayload,
  false,
  'analysis request does not disclose the device-local source URI',
);

const defaultAnalysisRequestPayload = buildFaceAnalysisRequestPayload({
  bucket: 'media-bucket',
  objectKey: 'uploads/capture/defaults.jpg',
});

expectEqual(
  defaultAnalysisRequestPayload.contentType,
  'image/jpeg',
  'analysis request defaults the content type',
);
expectEqual(
  defaultAnalysisRequestPayload.source,
  'camera',
  'analysis request defaults the capture source',
);
