import * as FileSystem from 'expo-file-system/legacy';

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';

type Store = Record<string, string>;
type SetItemOptions = {
  keychainAccessible?: string;
};

const STORE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}aiar-secure-store-fallback.json`
  : null;

let cachePromise: Promise<Store> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const memoryStore: Store = {};

async function loadStore(): Promise<Store> {
  if (!STORE_FILE_URI) {
    return memoryStore;
  }

  if (!cachePromise) {
    cachePromise = (async () => {
      try {
        const info = await FileSystem.getInfoAsync(STORE_FILE_URI);

        if (!info.exists || info.isDirectory) {
          return {};
        }

        const raw = await FileSystem.readAsStringAsync(STORE_FILE_URI);
        const parsed = JSON.parse(raw) as unknown;

        return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
      } catch {
        return {};
      }
    })();
  }

  return cachePromise;
}

async function persistStore(store: Store): Promise<void> {
  if (!STORE_FILE_URI) {
    return;
  }

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => FileSystem.writeAsStringAsync(STORE_FILE_URI, JSON.stringify(store)));

  await writeQueue;
}

export async function getItemAsync(key: string): Promise<string | null> {
  const store = await loadStore();

  return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
}

export async function setItemAsync(
  key: string,
  value: string,
  _options?: SetItemOptions,
): Promise<void> {
  const store = await loadStore();
  store[key] = value;
  await persistStore(store);
}

export async function deleteItemAsync(key: string): Promise<void> {
  const store = await loadStore();
  delete store[key];
  await persistStore(store);
}
