import * as FileSystem from 'expo-file-system/legacy';

import {BackendApiError, requestBackendJson} from '../../../shared/services/backendApi';
import {
  buildFaceCaptureCompleteUploadBody,
  getBase64DecodedByteSize,
} from './faceCaptureUploadContract';

export type FaceCaptureImageSource = 'camera' | 'gallery';

export type FaceCaptureUploadCaptureType =
  | 'face_analysis'
  | 'makeup_feedback'
  | 'filter_extraction'
  | 'ar_try_on'
  | 'personal_color'
  | 'hair_analysis';

// 셔터 시점 카메라 메타데이터(기기 로컬 분석 전용 — 백엔드 업로드에는 싣지 않는다).
// RealtimeCameraStabilityPayload / NativeCameraCaptureMetadata와 구조 호환(전부 optional).
export type FaceCaptureCameraMetadata = {
  iso?: number;
  exposureDurationMs?: number;
  whiteBalanceGains?: {red?: number; green?: number; blue?: number};
  adjustingWhiteBalance?: boolean;
  adjustingExposure?: boolean;
  adjustingFocus?: boolean;
  isStable?: boolean | number;
};

export type FaceCaptureImageInput = {
  // 셔터 시점 카메라 메타(WB gains 등) — 퍼스널 컬러 조명 보정(A/B)용 pass-through.
  cameraMetadata?: FaceCaptureCameraMetadata | null;
  captureType?: FaceCaptureUploadCaptureType;
  contentType?: string | null;
  fileName?: string | null;
  height?: number | null;
  mediaKind?: string;
  // Apple semantic matte(hair/skin) 임베드 여부 — RealtimeCameraCaptureResult.semanticMattes를
  // 그대로 실어 얼굴 세로 비율 분석까지 전달한다. 업로드에는 사용하지 않는다.
  semanticMattes?: {hair: boolean; requested: boolean; skin: boolean};
  source: FaceCaptureImageSource;
  uri: string;
  width?: number | null;
};

export type FaceCaptureUploadResult = {
  bucket: string;
  cameraMetadata?: FaceCaptureCameraMetadata | null;
  cdnUrl?: string | null;
  contentType?: string | null;
  fileName?: string | null;
  height?: number | null;
  imageUri: string;
  mediaId: string;
  objectKey: string;
  photoCaptureId: string;
  semanticMattes?: {hair: boolean; requested: boolean; skin: boolean};
  source: FaceCaptureImageSource;
  width?: number | null;
};

type PresignedUpload = {
  bucket: string;
  cacheControl?: string | null;
  cdnUrl?: string | null;
  contentType: string;
  expiresIn: number;
  headers?: Record<string, string> | null;
  method: 'PUT';
  objectKey: string;
  uploadId?: string | null;
  uploadUrl: string;
};

type PresignedUploadResponse = {
  upload: PresignedUpload;
};

type MediaAsset = {
  bucket: string;
  cdnUrl?: string | null;
  id: string;
  objectKey: string;
};

type CompleteUploadResponse = {
  media: MediaAsset;
};

type PhotoCapture = {
  id: string;
};

type PhotoCaptureResponse = {
  photoCapture: PhotoCapture;
};

const MAX_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;

export function inferFaceCaptureContentType(uri: string, fallback?: string | null): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  const normalizedUri = uri.split('?')[0].toLowerCase();

  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

export function getFaceCaptureFilename(uri: string, fallback?: string | null): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  const withoutQuery = uri.split('?')[0];
  const filename = withoutQuery.split('/').pop();

  return filename?.includes('.') ? filename : `face-capture-${Date.now()}.jpg`;
}

type PreparedFaceCaptureFile = {
  byteSize: number;
  cleanup?: () => Promise<void>;
  fileUri: string;
};

function isDeviceFileUri(uri: string): boolean {
  return uri.startsWith('file:') || uri.startsWith('content:');
}

function getFilenameExtension(filename: string): string {
  const sanitized = filename.split('?')[0];
  const extension = sanitized.includes('.') ? sanitized.slice(sanitized.lastIndexOf('.')) : '';

  return extension && extension.length <= 8 ? extension : '.jpg';
}

async function getRequiredFileSize(uri: string): Promise<number> {
  // iOS의 네이티브 캡처 파일은 getInfoAsync/Blob.size 값과 실제 전송 바이트가
  // 다를 수 있다. 파일 내용을 base64로 읽어 디코딩 바이트 수를 직접 계산한다.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const byteSize = getBase64DecodedByteSize(base64);

  if (!byteSize || byteSize > MAX_MEDIA_UPLOAD_BYTES) {
    throw new Error('Upload file size must be between 1 byte and 50 MiB.');
  }

  return byteSize;
}

async function deleteCacheFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, {idempotent: true});
  } catch {
    // Best-effort cache cleanup only.
  }
}

async function prepareFaceCaptureFile(
  uri: string,
  originalFilename: string,
): Promise<PreparedFaceCaptureFile> {
  if (isDeviceFileUri(uri)) {
    return {
      byteSize: await getRequiredFileSize(uri),
      fileUri: uri,
    };
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('File cache directory is not available for media upload.');
  }

  const fileUri = `${FileSystem.cacheDirectory}face-capture-${Date.now()}${getFilenameExtension(originalFilename)}`;
  const downloaded = await FileSystem.downloadAsync(uri, fileUri);

  return {
    byteSize: await getRequiredFileSize(downloaded.uri),
    cleanup: () => deleteCacheFile(downloaded.uri),
    fileUri: downloaded.uri,
  };
}

// 업로드 세션과 S3 객체 검증이 일시적으로 어긋난 경우에만 새 세션으로 1회 재시도한다.
function isRetryableUploadMismatch(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    error.status === 409 &&
    (error.code === 'UPLOAD_SIZE_MISMATCH' || error.code === 'UPLOAD_CONTENT_TYPE_MISMATCH')
  );
}

type UploadedMediaObject = {
  media: CompleteUploadResponse['media'];
  byteSize: number;
};

async function uploadImageObjectOnce({
  contentType,
  height,
  mediaKind,
  originalFilename,
  source,
  uri,
  width,
}: {
  contentType: string;
  height?: number | null;
  mediaKind: string;
  originalFilename: string;
  source: FaceCaptureImageSource;
  uri: string;
  width?: number | null;
}): Promise<UploadedMediaObject> {
  const readStartedAt = Date.now();
  const uploadFile = await prepareFaceCaptureFile(uri, originalFilename);

  console.info('[aura:capture-upload] image-read:success', {
    byteSize: uploadFile.byteSize,
    durationMs: Date.now() - readStartedAt,
  });

  try {
    console.info('[aura:capture-upload] presigned-upload:start');
    const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
      body: {
        byteSize: uploadFile.byteSize,
        contentType,
        height,
        mediaKind,
        originalFilename,
        source,
        width,
      },
      method: 'POST',
    });

    console.info('[aura:capture-upload] presigned-upload:success', {
      expiresIn: upload.expiresIn,
      hasCdnUrl: Boolean(upload.cdnUrl),
      hasUploadId: Boolean(upload.uploadId?.trim()),
    });

    const s3StartedAt = Date.now();
    console.info('[aura:capture-upload] s3-put:start');
    const uploadResult = await FileSystem.uploadAsync(upload.uploadUrl, uploadFile.fileUri, {
      // Presigned PUT headers are part of the S3 signature. Replay the server-provided
      // values exactly (including encryption requirements) when they are present.
      headers:
        upload.headers && Object.keys(upload.headers).length > 0
          ? upload.headers
          : {
              ...(upload.cacheControl ? {'Cache-Control': upload.cacheControl} : {}),
              'Content-Type': contentType,
            },
      httpMethod: upload.method,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      console.info('[aura:capture-upload] s3-put:fail', {
        durationMs: Date.now() - s3StartedAt,
        status: uploadResult.status,
      });

      throw new Error(`S3 upload failed with HTTP ${uploadResult.status}.`);
    }

    console.info('[aura:capture-upload] s3-put:success', {
      durationMs: Date.now() - s3StartedAt,
      status: uploadResult.status,
    });

    console.info('[aura:capture-upload] media-complete:start');
    const {media} = await requestBackendJson<CompleteUploadResponse>('/media/complete-upload', {
      body: buildFaceCaptureCompleteUploadBody(upload, {
        byteSize: uploadFile.byteSize,
        contentType,
        height,
        mediaKind,
        originalFilename,
        source,
        width,
      }),
      method: 'POST',
    });

    console.info('[aura:capture-upload] media-complete:success', {
      hasCdnUrl: Boolean(media.cdnUrl),
      mediaId: media.id,
    });

    return {media, byteSize: uploadFile.byteSize};
  } finally {
    await uploadFile.cleanup?.();
  }
}

export async function uploadFaceCaptureImage({
  cameraMetadata,
  captureType = 'face_analysis',
  contentType: providedContentType,
  fileName,
  height,
  mediaKind = 'capture',
  semanticMattes,
  source,
  uri,
  width,
}: FaceCaptureImageInput): Promise<FaceCaptureUploadResult> {
  const startedAt = Date.now();
  const contentType = inferFaceCaptureContentType(uri, providedContentType);
  const originalFilename = getFaceCaptureFilename(uri, fileName);

  console.info('[aura:capture-upload] start', {
    contentType,
    height: height ?? null,
    hasLocalUri: Boolean(uri),
    source,
    width: width ?? null,
  });

  let uploadedObject: UploadedMediaObject;

  try {
    uploadedObject = await uploadImageObjectOnce({
      contentType,
      height,
      mediaKind,
      originalFilename,
      source,
      uri,
      width,
    });
  } catch (error) {
    if (!isRetryableUploadMismatch(error)) {
      throw error;
    }

    console.info('[aura:capture-upload] mismatch-retry', {
      code: (error as BackendApiError).code ?? null,
    });
    uploadedObject = await uploadImageObjectOnce({
      contentType,
      height,
      mediaKind,
      originalFilename,
      source,
      uri,
      width,
    });
  }

  const {media} = uploadedObject;

  console.info('[aura:capture-upload] photo-capture:start');
  const {photoCapture} = await requestBackendJson<PhotoCaptureResponse>('/photo-captures', {
    body: {
      captureType,
      devicePayload: {
        height,
        originalFilename,
        sourceUri: uri,
        width,
      },
      mediaId: media.id,
      source,
    },
    method: 'POST',
  });

  console.info('[aura:capture-upload] photo-capture:success', {
    durationMs: Date.now() - startedAt,
    mediaId: media.id,
    photoCaptureId: photoCapture.id,
  });

  return {
    bucket: media.bucket,
    // 기기 로컬 분석용 pass-through — 백엔드 요청 바디에는 싣지 않는다.
    cameraMetadata,
    cdnUrl: media.cdnUrl ?? null,
    contentType,
    fileName: originalFilename,
    height: height ?? null,
    imageUri: uri,
    mediaId: media.id,
    objectKey: media.objectKey,
    photoCaptureId: photoCapture.id,
    semanticMattes,
    source,
    width: width ?? null,
  };
}
