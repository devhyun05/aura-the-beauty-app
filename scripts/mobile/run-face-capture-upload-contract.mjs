import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const outputDirectory = mkdtempSync(join(tmpdir(), 'aura-face-upload-contract-'));
const tscPath = join(repositoryRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const contractPath = join(
  repositoryRoot,
  'apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.ts',
);
const testPath = join(
  repositoryRoot,
  'apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.test.ts',
);
const uploadServicePath = join(
  repositoryRoot,
  'apps/mobile/src/features/face-capture/services/faceCaptureUploadService.ts',
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--skipLibCheck',
  '--outDir',
  outputDirectory,
  testPath,
  contractPath,
]);

run(process.execPath, [join(outputDirectory, 'faceCaptureUploadContract.test.js')]);

const uploadServiceSource = readFileSync(uploadServicePath, 'utf8');
const requiredNativeUploadFragments = [
  "from 'expo-file-system/legacy'",
  'FileSystem.readAsStringAsync',
  'FileSystem.EncodingType.Base64',
  'FileSystem.uploadAsync',
  'FileSystem.FileSystemUploadType.BINARY_CONTENT',
  'upload.headers && Object.keys(upload.headers).length > 0',
];

for (const fragment of requiredNativeUploadFragments) {
  if (!uploadServiceSource.includes(fragment)) {
    throw new Error(`Face capture upload must use the native file upload path: missing ${fragment}`);
  }
}

if (uploadServiceSource.includes('imageBlob.size')) {
  throw new Error('Face capture upload must not trust React Native Blob.size for upload sessions.');
}

if (uploadServiceSource.includes('FileSystem.getInfoAsync')) {
  throw new Error('Face capture upload must not trust native file metadata for upload byte size.');
}

console.log(
  'Face request contract verified: upload completion and analysis media references are valid.',
);
