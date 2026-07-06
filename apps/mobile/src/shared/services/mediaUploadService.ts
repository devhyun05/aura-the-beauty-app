import * as FileSystem from 'expo-file-system/legacy';
import {manipulateAsync, SaveFormat, type Action} from 'expo-image-manipulator';

import {requestBackendJson} from './backendApi';

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

type ThumbnailCompletionPayload = {
  thumbnailBucket: string;
  thumbnailByteSize: number | null;
  thumbnailCdnUrl: string | null;
  thumbnailContentType: string;
  thumbnailHeight: number | null;
  thumbnailObjectKey: string;
  thumbnailWidth: number | null;
};

const DEFAULT_JPEG_COMPRESS = 0.82;
const DEFAULT_JPEG_MAX_DIMENSION = 1440;
const COMMUNITY_THUMBNAIL_COMPRESS = 0.72;
const COMMUNITY_THUMBNAIL_MAX_DIMENSION = 640;

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
  upload: PresignedUpload,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const uploadResult = await FileSystem.uploadAsync(upload.uploadUrl, fileUri, {
    headers: {'Content-Type': contentType},
    httpMethod: upload.method,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`S3 upload failed with HTTP ${uploadResult.status}.`);
  }
}

async function uploadCommunityThumbnail({
  filename,
  height,
  mediaKind,
  source,
  uploadFileUri,
  width,
}: {
  filename: string;
  height: number | null;
  mediaKind: string;
  source: MediaUploadSource;
  uploadFileUri: string;
  width: number | null;
}): Promise<{cleanup: () => Promise<void>; payload: ThumbnailCompletionPayload}> {
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
  const contentType = 'image/jpeg';

  const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
    body: {
      byteSize: thumbnail.byteSize,
      contentType,
      height: thumbnail.height,
      mediaKind: `${mediaKind}-thumbnail`,
      originalFilename: thumbnail.filename,
      source,
      width: thumbnail.width,
    },
    method: 'POST',
  });

  await uploadFileToPresignedUrl(upload, thumbnail.fileUri, contentType);

  return {
    cleanup: async () => {
      await thumbnail.cleanup?.();
    },
    payload: {
      thumbnailBucket: upload.bucket,
      thumbnailByteSize: thumbnail.byteSize,
      thumbnailCdnUrl: upload.cdnUrl || null,
      thumbnailContentType: contentType,
      thumbnailHeight: thumbnail.height,
      thumbnailObjectKey: upload.objectKey,
      thumbnailWidth: thumbnail.width,
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
  let thumbnailCleanup: (() => Promise<void>) | undefined;
  let thumbnailPayload: ThumbnailCompletionPayload | undefined;

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
      const thumbnail = await uploadCommunityThumbnail({
        filename: originalFilename,
        height: uploadHeight,
        mediaKind,
        source,
        uploadFileUri: uploadFile.fileUri,
        width: uploadWidth,
      });
      thumbnailCleanup = thumbnail.cleanup;
      thumbnailPayload = thumbnail.payload;
    }

    const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
      body: {
        contentType,
        height: uploadHeight,
        mediaKind,
        originalFilename,
        source,
        width: uploadWidth,
      },
      method: 'POST',
    });

    await uploadFileToPresignedUrl(upload, uploadFile.fileUri, contentType);

    const {media} = await requestBackendJson<CompleteUploadResponse>('/media/complete-upload', {
      body: {
        bucket: upload.bucket,
        byteSize: uploadFile.byteSize,
        cdnUrl: upload.cdnUrl || null,
        contentType,
        height: uploadHeight,
        mediaKind,
        objectKey: upload.objectKey,
        originalFilename,
        source,
        width: uploadWidth,
        ...thumbnailPayload,
      },
      method: 'POST',
    });

    return media;
  } finally {
    await thumbnailCleanup?.();
    await uploadFile.cleanup?.();
  }
}