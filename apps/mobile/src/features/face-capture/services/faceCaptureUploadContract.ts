export type FaceCaptureUploadSource = 'camera' | 'gallery';

export type FaceCapturePresignedUpload = {
  bucket: string;
  cdnUrl?: string | null;
  contentType?: string | null;
  objectKey: string;
  uploadId?: string | null;
};

export type FaceCaptureCompletionMetadata = {
  byteSize: number;
  contentType: string;
  height?: number | null;
  mediaKind: string;
  originalFilename: string;
  source: FaceCaptureUploadSource;
  width?: number | null;
};

export type FaceAnalysisCaptureRequestInput = {
  bucket?: string | null;
  contentType?: string | null;
  objectKey?: string | null;
  source?: string | null;
};

export type FaceCaptureCompleteUploadBody =
  | {uploadId: string}
  | {
      bucket: string;
      byteSize: number;
      cdnUrl: string | null;
      contentType: string;
      height: number | null;
      mediaKind: string;
      objectKey: string;
      originalFilename: string;
      source: FaceCaptureUploadSource;
      width: number | null;
    };

export function buildFaceCaptureCompleteUploadBody(
  upload: FaceCapturePresignedUpload,
  metadata: FaceCaptureCompletionMetadata,
): FaceCaptureCompleteUploadBody {
  const uploadId = upload.uploadId?.trim();

  if (uploadId) {
    return {uploadId};
  }

  // 구버전 백엔드 호환 경로. 최신 백엔드는 이 위치를 그대로 신뢰하지 않고
  // 현재 사용자에게 서버가 발급한 pending upload session과 다시 대조한다.
  return {
    bucket: upload.bucket,
    byteSize: metadata.byteSize,
    cdnUrl: upload.cdnUrl || null,
    contentType: metadata.contentType,
    height: metadata.height ?? null,
    mediaKind: metadata.mediaKind,
    objectKey: upload.objectKey,
    originalFilename: metadata.originalFilename,
    source: metadata.source,
    width: metadata.width ?? null,
  };
}

export function buildFaceAnalysisRequestPayload<
  TFaceVerticalThirds,
  TFace3D = never,
  TFaceGeometry2d = never,
>(
  capture: FaceAnalysisCaptureRequestInput,
  faceVerticalThirds?: TFaceVerticalThirds,
  face3d?: TFace3D,
  faceGeometry2d?: TFaceGeometry2d,
) {
  // 구버전 백엔드는 분석 입력 이미지를 requestPayload에서 읽는다. 최신 백엔드는
  // 아래 위치 필드를 제거한 뒤 소유권이 확인된 DB 미디어 값으로 다시 채운다.
  return {
    bucket: capture.bucket ?? null,
    contentType: capture.contentType ?? 'image/jpeg',
    // ARKit 3D 측정 프로필(정규화 5지표, <1KB) — 있으면 AI 요약 입력에 함께 실린다.
    ...(face3d ? {face3d} : {}),
    // 2D 얼굴 기하 압축 요약(무차원 비율/도, <1KB) — 있으면 함께 실린다.
    ...(faceGeometry2d ? {faceGeometry2d} : {}),
    ...(faceVerticalThirds ? {faceVerticalThirds} : {}),
    objectKey: capture.objectKey ?? null,
    source: capture.source ?? 'camera',
    task: 'face_makeup_recommendation_report_v1' as const,
  };
}
