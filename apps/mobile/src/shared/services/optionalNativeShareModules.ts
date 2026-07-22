import * as MediaLibraryLegacy from 'expo-media-library/legacy';
import * as ExpoSharing from 'expo-sharing';

type PhotoPermissionResponse = {
  granted: boolean;
};

type ShareOptions = {
  dialogTitle?: string;
  mimeType?: string;
  UTI?: string;
};

export type OptionalMediaLibraryModule = {
  createAssetAsync: (localUri: string) => Promise<unknown>;
  getPermissionsAsync: (
    writeOnly?: boolean,
    granularPermissions?: string[],
  ) => Promise<PhotoPermissionResponse>;
  requestPermissionsAsync: (
    writeOnly?: boolean,
    granularPermissions?: string[],
  ) => Promise<PhotoPermissionResponse>;
  saveToLibraryAsync: (localUri: string) => Promise<void>;
};

export type OptionalSharingModule = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (url: string, options?: ShareOptions) => Promise<void>;
};

function isOptionalMediaLibraryModule(
  value: unknown,
): value is OptionalMediaLibraryModule {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OptionalMediaLibraryModule>;

  return (
    typeof candidate.createAssetAsync === 'function' &&
    typeof candidate.getPermissionsAsync === 'function' &&
    typeof candidate.requestPermissionsAsync === 'function' &&
    typeof candidate.saveToLibraryAsync === 'function'
  );
}

function isOptionalSharingModule(value: unknown): value is OptionalSharingModule {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OptionalSharingModule>;

  return (
    typeof candidate.isAvailableAsync === 'function' &&
    typeof candidate.shareAsync === 'function'
  );
}

export function loadOptionalMediaLibraryModule() {
  // These packages are normal app dependencies and are linked in the Release
  // target. Keeping them behind a runtime `require()` made Metro treat the
  // module as optional, so every photo-save entry point could report a missing
  // module even though the native pod was present. A static legacy import also
  // keeps the removed procedural APIs (saveToLibraryAsync/createAssetAsync)
  // away from Expo 56's new class-based root entry point.
  return isOptionalMediaLibraryModule(MediaLibraryLegacy)
    ? MediaLibraryLegacy
    : null;
}

export function loadOptionalSharingModule() {
  return isOptionalSharingModule(ExpoSharing) ? ExpoSharing : null;
}
