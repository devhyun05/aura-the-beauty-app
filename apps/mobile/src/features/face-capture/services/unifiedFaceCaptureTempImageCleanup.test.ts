import {
  deleteUnifiedFaceCaptureTempImage,
  isUnifiedFaceCaptureTempImageUri,
} from './unifiedFaceCaptureTempImageCleanup';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const cacheDirectory =
  'file:///var/mobile/Containers/Data/Application/app-id/Library/Caches/';
const validUri =
  `${cacheDirectory}aura_unified_face_1720000000000_42.jpg`;

expectEqual(
  isUnifiedFaceCaptureTempImageUri(validUri, cacheDirectory),
  true,
  'Unity temporary JPEG is accepted',
);
expectEqual(
  isUnifiedFaceCaptureTempImageUri(
    `${cacheDirectory}other-feature-cache.jpg`,
    cacheDirectory,
  ),
  false,
  'unrelated cache file is rejected',
);
expectEqual(
  isUnifiedFaceCaptureTempImageUri(
    'file:///var/mobile/Containers/Data/Application/app-id/Documents/aura_unified_face_1_2.jpg',
    cacheDirectory,
  ),
  false,
  'document file is rejected',
);
expectEqual(
  isUnifiedFaceCaptureTempImageUri(
    `${cacheDirectory}%2E%2E/Documents/aura_unified_face_1_2.jpg`,
    cacheDirectory,
  ),
  false,
  'encoded traversal is rejected',
);
expectEqual(
  isUnifiedFaceCaptureTempImageUri(
    'https://cdn.example.com/aura_unified_face_1_2.jpg',
    cacheDirectory,
  ),
  false,
  'https URI is rejected',
);
expectEqual(
  isUnifiedFaceCaptureTempImageUri(
    'content://media/external/images/aura_unified_face_1_2.jpg',
    cacheDirectory,
  ),
  false,
  'content URI is rejected',
);

const deletedUris: string[] = [];
const fakeFileSystem = {
  cacheDirectory,
  deleteAsync: async (
    uri: string,
    options?: {idempotent?: boolean},
  ): Promise<void> => {
    expectEqual(options?.idempotent, true, 'delete is idempotent');
    deletedUris.push(uri);
  },
};

async function run() {
  expectEqual(
    await deleteUnifiedFaceCaptureTempImage(validUri, fakeFileSystem),
    true,
    'valid temporary image is deleted',
  );
  expectEqual(
    await deleteUnifiedFaceCaptureTempImage(validUri, fakeFileSystem),
    true,
    'repeated cleanup remains safe',
  );
  expectEqual(deletedUris.length, 2, 'both idempotent deletions are attempted');

  expectEqual(
    await deleteUnifiedFaceCaptureTempImage(
      'file:///var/mobile/Containers/Data/Application/app-id/Documents/aura_unified_face_1_2.jpg',
      fakeFileSystem,
    ),
    false,
    'document cleanup is skipped',
  );
  expectEqual(deletedUris.length, 2, 'unsafe URI never reaches deleteAsync');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
