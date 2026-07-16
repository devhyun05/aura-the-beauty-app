type LegacyFileSystem = Pick<
  typeof import('expo-file-system/legacy'),
  'cacheDirectory' | 'deleteAsync'
>;

const UNIFIED_CAPTURE_TEMP_FILE_PATTERN =
  /^aura_unified_face_\d+_\d+\.jpg$/;

function normalizeFileUriPath(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (
      parsed.protocol !== 'file:' ||
      (parsed.hostname && parsed.hostname !== 'localhost') ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    const decodedPath = decodeURIComponent(parsed.pathname);
    const normalizedSegments: string[] = [];

    for (const segment of decodedPath.split('/')) {
      if (!segment || segment === '.') {
        continue;
      }
      if (segment === '..') {
        if (normalizedSegments.length === 0) {
          return null;
        }
        normalizedSegments.pop();
        continue;
      }
      normalizedSegments.push(segment);
    }

    return `/${normalizedSegments.join('/')}`;
  } catch {
    return null;
  }
}

export function isUnifiedFaceCaptureTempImageUri(
  uri: string,
  cacheDirectory: string | null,
): boolean {
  if (!cacheDirectory) {
    return false;
  }

  const imagePath = normalizeFileUriPath(uri);
  const cachePath = normalizeFileUriPath(cacheDirectory);
  if (!imagePath || !cachePath) {
    return false;
  }

  const separatorIndex = imagePath.lastIndexOf('/');
  if (separatorIndex < 0 || imagePath.slice(0, separatorIndex) !== cachePath) {
    return false;
  }

  return UNIFIED_CAPTURE_TEMP_FILE_PATTERN.test(
    imagePath.slice(separatorIndex + 1),
  );
}

/**
 * Unity 통합 촬영이 앱 캐시에 만든 임시 JPEG만 best-effort로 정리한다.
 * 원격 URI, content URI, Documents 파일, 다른 캐시 파일은 삭제하지 않는다.
 */
export async function deleteUnifiedFaceCaptureTempImage(
  uri: string | null | undefined,
  providedFileSystem?: LegacyFileSystem,
): Promise<boolean> {
  if (!uri) {
    return false;
  }

  try {
    const fileSystem =
      providedFileSystem ?? (await import('expo-file-system/legacy'));
    if (!isUnifiedFaceCaptureTempImageUri(uri, fileSystem.cacheDirectory)) {
      return false;
    }

    await fileSystem.deleteAsync(uri, {idempotent: true});
    return true;
  } catch {
    return false;
  }
}
