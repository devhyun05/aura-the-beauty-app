import * as FileSystem from 'expo-file-system/legacy';

import {requestBackendJson} from './backendApi';

type Action = {
  resize?: {
    height?: number;
    width?: number;
  };
};

const SaveFormat = {
  JPEG: 'jpeg',
} as const;

async function manipulateAsync(
  uri: string,
  _actions: Action[],
  _options: {compress?: number; format: (typeof SaveFormat)[keyof typeof SaveFormat]},
): Promise<{height?: number; uri: string; width?: number}> {
  return {uri};
}

export type MediaUploadSource = 'camera' | 'gallery' | 'seed' | 'generated';

export type MediaImageNormalization = {
  compress?: number;
  format: 'jpeg';
  maxDimension?: number;
};

export type MediaImageUploadInput = {
  contentType?: string | null;
  fileName?: string | null;
  height?: number | null;
  mediaKind: string;
  normalize?: MediaImageNormalization | null;
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
  thumbnailUrl?: string | null;
};

type PresignedUploadTarget = {
  bucket: string;
  cacheControl?: string | null;
  cdnUrl?: string | null;
  contentType: string;
  expiresIn: number;
  method: 'PUT';
  objectKey: string;
  uploadUrl: string;
};

type PresignedUpload = PresignedUploadTarget & {
  thumbnailUpload?: PresignedUploadTarget | null;
  uploadId: string;
};

type PresignedUploadResponse = {
  upload: PresignedUpload;
};

type CompleteUploadResponse = {
  media: UploadedMediaAsset;
};

type PreparedUploadFile = {
  byteSize: number | null;
  cleanup?: () => Promise<void>;
  fileUri: string;
};

type PreparedJpegUploadFile = PreparedUploadFile & {
  filename: string;
  height: number | null;
  width: number | null;
};

type PreparedThumbnailUpload = {
  cleanup: () => Promise<void>;
  contentType: 'image/jpeg';
  fileUri: string;
  request: {
    byteSize: number;
    contentType: 'image/jpeg';
    height: number | null;
    originalFilename: string;
    width: number | null;
  };
};

const DEFAULT_JPEG_COMPRESS = 0.82;
const DEFAULT_JPEG_MAX_DIMENSION = 1440;
const COMMUNITY_THUMBNAIL_COMPRESS = 0.72;
const COMMUNITY_THUMBNAIL_MAX_DIMENSION = 640;
const MAX_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;

function requireUploadByteSize(byteSize: number | null): number {
  if (!byteSize || byteSize > MAX_MEDIA_UPLOAD_BYTES) {
    throw new Error('Upload file size must be between 1 byte and 50 MiB.');
  }
  return byteSize;
}

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

function getFilenameExtension(filename: string): string {
  const sanitized = filename.split('?')[0];
  const extension = sanitized.includes('.') ? sanitized.slice(sanitized.lastIndexOf('.')) : '';

  return extension && extension.length <= 8 ? extension : '.jpg';
}

function getJpegFilename(filename: string): string {
  const sanitized = filename.split('?')[0].split('/').pop()?.trim() || `media-upload-${Date.now()}`;
  const extensionIndex = sanitized.lastIndexOf('.');
  const stem = extensionIndex > 0 ? sanitized.slice(0, extensionIndex) : sanitized;

  return `${stem || `media-upload-${Date.now()}`}.jpg`;
}

function getThumbnailFilename(filename: string): string {
  const jpegFilename = getJpegFilename(filename);
  const extensionIndex = jpegFilename.lastIndexOf('.');
  const stem = extensionIndex > 0 ? jpegFilename.slice(0, extensionIndex) : jpegFilename;

  return `${stem}-thumb.jpg`;
}

function isDeviceFileUri(uri: string): boolean {
  return uri.startsWith('file:') || uri.startsWith('content:');
}

function shouldCreateCommunityThumbnail(mediaKind: string, contentType: string): boolean {
  return mediaKind === 'community-thread' && contentType.startsWith('image/');
}

async function getFileSize(uri: string): Promise<number | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    return fileInfo.exists && !fileInfo.isDirectory ? fileInfo.size : null;
  } catch {
    return null;
  }
}

async function deleteCacheFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, {idempotent: true});
  } catch {
    // Best-effort cache cleanup only.
  }
}

async function prepareUploadFile(uri: string, originalFilename: string): Promise<PreparedUploadFile> {
  if (isDeviceFileUri(uri)) {
    return {
      byteSize: await getFileSize(uri),
      fileUri: uri,
    };
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('File cache directory is not available for media upload.');
  }

  const fileUri = `${FileSystem.cacheDirectory}media-upload-${Date.now()}${getFilenameExtension(originalFilename)}`;
  const downloaded = await FileSystem.downloadAsync(uri, fileUri);

  return {
    byteSize: await getFileSize(downloaded.uri),
    cleanup: () => deleteCacheFile(downloaded.uri),
    fileUri: downloaded.uri,
  };
}

function getResizeActions(width: number | null, height: number | null, maxDimension: number): Action[] {
  if (!width || !height || maxDimension <= 0) {
    return [];
  }

  const longestSide = Math.max(width, height);

  if (longestSide <= maxDimension) {
    return [];
  }

  return width >= height
    ? [{resize: {width: maxDimension}}]
    : [{resize: {height: maxDimension}}];
}

async function createJpegFile({
  baseFileUri,
  filename,
  height,
  normalization,
  width,
}: {
  baseFileUri: string;
  filename: string;
  height?: number | null;
  normalization: MediaImageNormalization;
  width?: number | null;
}): Promise<PreparedJpegUploadFile> {
  const result = await manipulateAsync(
    baseFileUri,
    getResizeActions(width ?? null, height ?? null, normalization.maxDimension ?? DEFAULT_JPEG_MAX_DIMENSION),
    {
      compress: normalization.compress ?? DEFAULT_JPEG_COMPRESS,
      format: SaveFormat.JPEG,
    },
  );

  return {
    byteSize: await getFileSize(result.uri),
    cleanup: () => deleteCacheFile(result.uri),
    fileUri: result.uri,
    filename,
    height: result.height ?? height ?? null,
    width: result.width ?? width ?? null,
  };
}

async function normalizeUploadFileToJpeg({
  file,
  filename,
  height,
  normalization,
  width,
}: {
  file: PreparedUploadFile;
  filename: string;
  height?: number | null;
  normalization: MediaImageNormalization;
  width?: number | null;
}): Promise<PreparedJpegUploadFile> {
  const normalized = await createJpegFile({
    baseFileUri: file.fileUri,
    filename: getJpegFilename(filename),
    height,
    normalization,
    width,
  });

  return {
    ...normalized,
    cleanup: async () => {
      if (normalized.fileUri !== file.fileUri) {
        await normalized.cleanup?.();
      }
      await file.cleanup?.();
    },
  };
}

async function uploadFileToPresignedUrl(
  upload: PresignedUploadTarget,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const uploadResult = await FileSystem.uploadAsync(upload.uploadUrl, fileUri, {
    headers: {
      ...(upload.cacheControl ? {'Cache-Control': upload.cacheControl} : {}),
      'Content-Type': contentType,
    },
    httpMethod: upload.method,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`S3 upload failed with HTTP ${uploadResult.status}.`);
  }
}

async function prepareCommunityThumbnail({
  filename,
  height,
  uploadFileUri,
  width,
}: {
  filename: string;
  height: number | null;
  uploadFileUri: string;
  width: number | null;
}): Promise<PreparedThumbnailUpload> {
  const thumbnail = await createJpegFile({
    baseFileUri: uploadFileUri,
    filename: getThumbnailFilename(filename),
    height,
    normalization: {
      compress: COMMUNITY_THUMBNAIL_COMPRESS,
      format: 'jpeg',
      maxDimension: COMMUNITY_THUMBNAIL_MAX_DIMENSION,
    },
    width,
  });
  return {
    cleanup: async () => {
      await thumbnail.cleanup?.();
    },
    contentType: 'image/jpeg',
    fileUri: thumbnail.fileUri,
    request: {
      byteSize: requireUploadByteSize(thumbnail.byteSize),
      contentType: 'image/jpeg',
      height: thumbnail.height,
      originalFilename: thumbnail.filename,
      width: thumbnail.width,
    },
  };
}

export async function uploadMediaAsset({
  contentType: providedContentType,
  fileName,
  height,
  mediaKind,
  normalize,
  source,
  uri,
  width,
}: MediaImageUploadInput): Promise<UploadedMediaAsset> {
  let contentType = inferImageContentType(uri, providedContentType);
  let originalFilename = getMediaFilename(uri, fileName);
  let uploadHeight = height ?? null;
  let uploadWidth = width ?? null;
  let uploadFile = await prepareUploadFile(uri, originalFilename);
  let thumbnail: PreparedThumbnailUpload | undefined;

  try {
    if (normalize?.format === 'jpeg') {
      const normalizedFile = await normalizeUploadFileToJpeg({
        file: uploadFile,
        filename: originalFilename,
        height: uploadHeight,
        normalization: normalize,
        width: uploadWidth,
      });

      contentType = 'image/jpeg';
      originalFilename = normalizedFile.filename;
      uploadFile = normalizedFile;
      uploadHeight = normalizedFile.height;
      uploadWidth = normalizedFile.width;
    }

    if (shouldCreateCommunityThumbnail(mediaKind, contentType)) {
      thumbnail = await prepareCommunityThumbnail({
        filename: originalFilename,
        height: uploadHeight,
        uploadFileUri: uploadFile.fileUri,
        width: uploadWidth,
      });
    }

    const uploadByteSize = requireUploadByteSize(uploadFile.byteSize);
    const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
      body: {
        byteSize: uploadByteSize,
        contentType,
        height: uploadHeight,
        mediaKind,
        originalFilename,
        source,
        thumbnail: thumbnail?.request,
        width: uploadWidth,
      },
      method: 'POST',
    });

    await uploadFileToPresignedUrl(upload, uploadFile.fileUri, contentType);
    if (thumbnail) {
      if (!upload.thumbnailUpload) {
        throw new Error('Backend did not issue the requested thumbnail upload target.');
      }
      await uploadFileToPresignedUrl(upload.thumbnailUpload, thumbnail.fileUri, thumbnail.contentType);
    }

    const {media} = await requestBackendJson<CompleteUploadResponse>('/media/complete-upload', {
      body: {uploadId: upload.uploadId},
      method: 'POST',
    });

    return media;
  } finally {
    await thumbnail?.cleanup();
    await uploadFile.cleanup?.();
  }
}
