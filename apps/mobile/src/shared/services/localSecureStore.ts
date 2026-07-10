import * as FileSystem from 'expo-file-system/legacy';
import * as NativeSecureStore from 'expo-secure-store';

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY =
  NativeSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

type Store = Record<string, string>;
type SetItemOptions = NativeSecureStore.SecureStoreOptions;

const LEGACY_STORE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}aiar-secure-store-fallback.json`
  : null;

let legacyMigrationPromise: Promise<void> | null = null;

function secureStoreOptions(options?: SetItemOptions): SetItemOptions {
  return {
    ...options,
    keychainAccessible:
      options?.keychainAccessible ?? WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
}

function parseLegacyStore(raw: string): Store {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

async function migrateLegacyStore(): Promise<void> {
  if (!LEGACY_STORE_FILE_URI) {
    return;
  }

  if (!legacyMigrationPromise) {
    legacyMigrationPromise = (async () => {
      const info = await FileSystem.getInfoAsync(LEGACY_STORE_FILE_URI);

      if (!info.exists || info.isDirectory) {
        return;
      }

      try {
        const legacyStore = parseLegacyStore(
          await FileSystem.readAsStringAsync(LEGACY_STORE_FILE_URI),
        );

        for (const [key, value] of Object.entries(legacyStore)) {
          const existingValue = await NativeSecureStore.getItemAsync(key);

          if (existingValue === null) {
            await NativeSecureStore.setItemAsync(
              key,
              value,
              secureStoreOptions(),
            );
          }
        }
      } finally {
        await FileSystem.deleteAsync(LEGACY_STORE_FILE_URI, {idempotent: true});
      }
    })();
  }

  await legacyMigrationPromise;
}

export async function getItemAsync(key: string): Promise<string | null> {
  await migrateLegacyStore();
  return NativeSecureStore.getItemAsync(key);
}

export async function setItemAsync(
  key: string,
  value: string,
  options?: SetItemOptions,
): Promise<void> {
  await migrateLegacyStore();
  await NativeSecureStore.setItemAsync(key, value, secureStoreOptions(options));
}

export async function deleteItemAsync(key: string): Promise<void> {
  await migrateLegacyStore();
  await NativeSecureStore.deleteItemAsync(key);
}
