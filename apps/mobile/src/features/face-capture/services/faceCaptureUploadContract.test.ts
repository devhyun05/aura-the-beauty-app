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
expectEqual(
  'face3d' in defaultAnalysisRequestPayload,
  false,
  'analysis request omits face3d when the 3D measurement is absent',
);

// ARKit 3D 측정 프로필이 있으면 페이로드에 그대로 실린다(faceVerticalThirds와 동일 패턴).
const face3dProfile = {
  gateVersion: 'face3d-gate-v1',
  metrics: {},
  schemaVersion: 'aura.face3d-profile.v1',
  source: 'arkit_face_mesh',
  targetFrameCount: 30,
  topologyFingerprint: 'synthetic-v8-i12-uv8',
  validFrameCount: 30,
  warnings: [],
};
const analysisRequestPayloadWithFace3d = buildFaceAnalysisRequestPayload(
  {
    bucket: 'media-bucket',
    objectKey: 'uploads/capture/face.jpg',
    source: 'camera',
  },
  faceVerticalThirds,
  face3dProfile,
);

expectEqual(
  analysisRequestPayloadWithFace3d.face3d,
  face3dProfile,
  'analysis request preserves the on-device face3d profile',
);
expectEqual(
  analysisRequestPayloadWithFace3d.faceVerticalThirds,
  faceVerticalThirds,
  'face3d does not displace the vertical-thirds payload',
);
expectEqual(
  'faceGeometry2d' in analysisRequestPayloadWithFace3d,
  false,
  'analysis request omits faceGeometry2d when the 2D geometry is absent',
);

// 2D 기하 압축 요약이 있으면 페이로드에 그대로 실린다(face3d와 동일 패턴).
const faceGeometry2dPayload = {
  metrics: {
    canthalTiltLeftDeg: {unit: 'deg', value: 5.2},
    mouthWidthRatio: {unit: 'ratio', value: 0.35},
  },
  rollCorrectionApplied: true,
  status: 'full_success',
};
const analysisRequestPayloadWithGeometry = buildFaceAnalysisRequestPayload(
  {
    bucket: 'media-bucket',
    objectKey: 'uploads/capture/face.jpg',
    source: 'camera',
  },
  faceVerticalThirds,
  face3dProfile,
  faceGeometry2dPayload,
);

expectEqual(
  analysisRequestPayloadWithGeometry.faceGeometry2d,
  faceGeometry2dPayload,
  'analysis request preserves the on-device 2D geometry payload',
);
expectEqual(
  analysisRequestPayloadWithGeometry.face3d,
  face3dProfile,
  'faceGeometry2d does not displace the face3d payload',
);
expectEqual(
  analysisRequestPayloadWithGeometry.faceVerticalThirds,
  faceVerticalThirds,
  'faceGeometry2d does not displace the vertical-thirds payload',
);
expectEqual(
  'measuredPersonalColor' in analysisRequestPayloadWithGeometry,
  false,
  'analysis request omits measuredPersonalColor when absent',
);
expectEqual(
  'measurements' in analysisRequestPayloadWithGeometry,
  false,
  'analysis request omits measurements when absent',
);

// 측정 데이터 3-반영 규칙: 실측 퍼스널 컬러 요약과 측정 원본 4축이 함께 실린다.
const measuredPersonalColorPayload = {
  measurementConfidence: 0.72,
  status: 'definitive',
  tone: {top: 'autumn_muted'},
};
const measurementsPayload = {
  captureId: 'capture-1',
  faceGeometry2d: {status: 'partial_success'},
  schemaVersion: 'aura-face-analysis-measurements-v1',
};
const analysisRequestPayloadWithMeasurements = buildFaceAnalysisRequestPayload(
  {
    bucket: 'media-bucket',
    objectKey: 'uploads/capture/face.jpg',
    source: 'camera',
  },
  faceVerticalThirds,
  face3dProfile,
  faceGeometry2dPayload,
  measuredPersonalColorPayload,
  measurementsPayload,
);

expectEqual(
  analysisRequestPayloadWithMeasurements.measuredPersonalColor,
  measuredPersonalColorPayload,
  'analysis request preserves measuredPersonalColor',
);
expectEqual(
  analysisRequestPayloadWithMeasurements.measurements,
  measurementsPayload,
  'analysis request preserves the measurements payload',
);
expectEqual(
  analysisRequestPayloadWithMeasurements.faceGeometry2d,
  faceGeometry2dPayload,
  'measurements do not displace the 2D geometry payload',
);
