import {requestBackendJson} from '../../../shared/services/backendApi';

export type FaceCaptureImageSource = 'camera' | 'gallery';

export type FaceCaptureImageInput = {
  contentType?: string | null;
  fileName?: string | null;
  height?: number | null;
  source: FaceCaptureImageSource;
  uri: string;
  width?: number | null;
};

export type FaceCaptureUploadResult = {
  bucket: string;
  cdnUrl?: string | null;
  imageUri: string;
  mediaId: string;
  objectKey: string;
  photoCaptureId: string;
  source: FaceCaptureImageSource;
};

type PresignedUpload = {
  bucket: string;
  cdnUrl?: string | null;
  contentType: string;
  expiresIn: number;
  method: 'PUT';
  objectKey: string;
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

async function readImageBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Failed to read image file with HTTP ${response.status}.`);
  }

  return response.blob();
}

export async function uploadFaceCaptureImage({
  contentType: providedContentType,
  fileName,
  height,
  source,
  uri,
  width,
}: FaceCaptureImageInput): Promise<FaceCaptureUploadResult> {
  const contentType = inferFaceCaptureContentType(uri, providedContentType);
  const originalFilename = getFaceCaptureFilename(uri, fileName);
  const imageBlob = await readImageBlob(uri);

  const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
    body: {
      contentType,
      height,
      mediaKind: 'capture',
      originalFilename,
      source,
      width,
    },
    method: 'POST',
  });

  const uploadResponse = await fetch(upload.uploadUrl, {
    body: imageBlob,
    headers: {
      'Content-Type': contentType,
    },
    method: upload.method,
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed with HTTP ${uploadResponse.status}.`);
  }

  const byteSize = imageBlob.size;
  const {media} = await requestBackendJson<CompleteUploadResponse>('/media/complete-upload', {
    body: {
      bucket: upload.bucket,
      byteSize,
      cdnUrl: upload.cdnUrl || null,
      contentType,
      height,
      mediaKind: 'capture',
      objectKey: upload.objectKey,
      originalFilename,
      source,
      width,
    },
    method: 'POST',
  });

  const {photoCapture} = await requestBackendJson<PhotoCaptureResponse>('/photo-captures', {
    body: {
      captureType: 'face_analysis',
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

  return {
    bucket: media.bucket,
    cdnUrl: media.cdnUrl ?? null,
    imageUri: uri,
    mediaId: media.id,
    objectKey: media.objectKey,
    photoCaptureId: photoCapture.id,
    source,
  };
}
