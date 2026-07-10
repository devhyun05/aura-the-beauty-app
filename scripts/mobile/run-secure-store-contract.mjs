import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const secureStorePath = resolve(
  repositoryRoot,
  'apps/mobile/src/shared/services/localSecureStore.ts',
);
const source = await readFile(secureStorePath, 'utf8');

const requiredPatterns = [
  {
    pattern: /from ['"]expo-secure-store['"]/,
    message: 'The storage wrapper must use expo-secure-store.',
  },
  {
    pattern: /NativeSecureStore\.getItemAsync\(/,
    message: 'Reads must delegate to the native secure store.',
  },
  {
    pattern: /NativeSecureStore\.setItemAsync\(/,
    message: 'Writes must delegate to the native secure store.',
  },
  {
    pattern: /NativeSecureStore\.deleteItemAsync\(/,
    message: 'Deletes must delegate to the native secure store.',
  },
  {
    pattern: /WHEN_UNLOCKED_THIS_DEVICE_ONLY/,
    message: 'Keychain entries must be device-bound and available only when unlocked.',
  },
  {
    pattern: /FileSystem\.deleteAsync\(LEGACY_STORE_FILE_URI, \{idempotent: true\}\)/,
    message: 'The legacy plaintext file must be deleted after migration.',
  },
];

for (const {pattern, message} of requiredPatterns) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

const forbiddenPatterns = [
  {
    pattern: /FileSystem\.writeAsStringAsync\(/,
    message: 'Secure values must never be written to the filesystem as plaintext.',
  },
  {
    pattern: /const memoryStore\s*:/,
    message: 'Secure values must not fall back to process memory.',
  },
];

for (const {pattern, message} of forbiddenPatterns) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

const migrationAwaitCount = (
  source.match(/await migrateLegacyStore\(\);/g) ?? []
).length;

if (migrationAwaitCount !== 3) {
  throw new Error(
    `All three storage operations must await legacy migration; received ${migrationAwaitCount}.`,
  );
}

console.log(
  'Secure store contract verified: native Keychain/Keystore delegation and plaintext cleanup are enforced.',
);
