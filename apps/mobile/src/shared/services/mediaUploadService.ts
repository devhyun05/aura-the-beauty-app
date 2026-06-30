import {requestBackendJson} from './backendApi';

export type MediaUploadSource = 'camera' | 'gallery' | 'seed' | 'generated';

export type MediaImageUploadInput = {
  contentType?: string | null;
  fileName?: string | null;
  height?: number | null;
  mediaKind: string;
  source: MediaUploadSource;
  uri: string;
  width?: number | null;
};

export type UploadedMediaAsset = {
  bucket: string;
  cdnUrl?: string | null;
  contentType?: string | null;
  id: string;
  objectKey: string;
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

type CompleteUploadResponse = {
  media: UploadedMediaAsset;
};

export function inferImageContentType(uri: string, fallback?: string | null): string {
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

export function getMediaFilename(uri: string, fallback?: string | null): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  const withoutQuery = uri.split('?')[0];
  const filename = withoutQuery.split('/').pop();

  return filename?.includes('.') ? filename : `media-upload-${Date.now()}.jpg`;
}

function readImageBlobWithXhr(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('GET', uri);
    request.responseType = 'blob';
    request.onload = () => {
      const isLocalFileRead = request.status === 0;
      const isHttpSuccess = request.status >= 200 && request.status < 300;

      if (!isLocalFileRead && !isHttpSuccess) {
        reject(new Error(`Failed to read image file with HTTP ${request.status}.`));
        return;
      }

      if (!(request.response instanceof Blob)) {
        reject(new Error('Failed to read image file as a blob.'));
        return;
      }

      resolve(request.response);
    };
    request.onerror = () => reject(new Error('Failed to read image file from the device.'));
    request.send();
  });
}

async function readImageBlob(uri: string): Promise<Blob> {
  const isDeviceFileUri = uri.startsWith('file:') || uri.startsWith('content:');

  if (isDeviceFileUri) {
    return readImageBlobWithXhr(uri);
  }

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Failed to read image file with HTTP ${response.status}.`);
  }

  return response.blob();
}

export async function uploadMediaAsset({
  contentType: providedContentType,
  fileName,
  height,
  mediaKind,
  source,
  uri,
  width,
}: MediaImageUploadInput): Promise<UploadedMediaAsset> {
  const contentType = inferImageContentType(uri, providedContentType);
  const originalFilename = getMediaFilename(uri, fileName);
  const imageBlob = await readImageBlob(uri);
  const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
    body: {
      contentType,
      height,
      mediaKind,
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

  const {media} = await requestBackendJson<CompleteUploadResponse>('/media/complete-upload', {
    body: {
      bucket: upload.bucket,
      byteSize: imageBlob.size,
      cdnUrl: upload.cdnUrl || null,
      contentType,
      height,
      mediaKind,
      objectKey: upload.objectKey,
      originalFilename,
      source,
      width,
    },
    method: 'POST',
  });

  return media;
}
