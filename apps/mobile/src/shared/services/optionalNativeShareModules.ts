declare const require: (moduleName: string) => unknown;

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
  try {
    const mediaLibraryModule = require('expo-media-library/legacy');

    return isOptionalMediaLibraryModule(mediaLibraryModule)
      ? mediaLibraryModule
      : null;
  } catch {
    return null;
  }
}

export function loadOptionalSharingModule() {
  try {
    const sharingModule = require('expo-sharing');

    return isOptionalSharingModule(sharingModule) ? sharingModule : null;
  } catch {
    return null;
  }
}
