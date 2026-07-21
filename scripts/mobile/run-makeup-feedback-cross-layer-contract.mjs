import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const mobileSourceRoot = join(repositoryRoot, 'apps/mobile/src');
const outputDirectory = mkdtempSync(join(tmpdir(), 'aura-makeup-cross-layer-'));
const fixturePath = join(
  repositoryRoot,
  'contracts/makeup-feedback/camera-server-quality-v1.json',
);
const emitterPath = join(
  repositoryRoot,
  'scripts/contracts/emit-makeup-feedback-cross-layer-job.py',
);
const crossLayerTestPath = join(
  mobileSourceRoot,
  'features/makeup-feedback/services/makeupFeedbackCrossLayerContract.test.ts',
);
const conferenceTestPath = join(
  mobileSourceRoot,
  'features/makeup-feedback/services/makeupFeedbackAgentConferenceService.test.ts',
);
const resultPresentationTestPath = join(
  mobileSourceRoot,
  'features/makeup-feedback/services/makeupFeedbackResultPresentation.test.ts',
);
const feedbackServiceTestPath = join(
  mobileSourceRoot,
  'features/makeup-feedback/services/makeupFeedbackService.test.ts',
);
const redesignViewModelTestPath = join(
  mobileSourceRoot,
  'features/makeup-feedback/redesign/makeupFeedbackResultViewModel.test.ts',
);
const tscPath = join(repositoryRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const mobileTypeRoots = join(repositoryRoot, 'apps/mobile/node_modules/@types');
const pythonCandidates = [
  join(repositoryRoot, 'services/backend/.venv/Scripts/python.exe'),
  join(repositoryRoot, 'services/backend/.venv/bin/python'),
];
const pythonPath = pythonCandidates.find(candidate => existsSync(candidate)) ?? 'python';
const normalizedJobPath = join(outputDirectory, 'normalized-backend-job.json');
const runtimeShimPath = join(outputDirectory, 'runtime-shim.cjs');

writeFileSync(
  runtimeShimPath,
  `const Module = require('node:module');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'expo-file-system/legacy') {
    return {
      EncodingType: {Base64: 'base64'},
      FileSystemUploadType: {BINARY_CONTENT: 0},
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};
`,
  'utf8',
);

function run(command, args, echoStdout = true) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  if (echoStdout && result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

const normalizedJob = run(pythonPath, [emitterPath, fixturePath], false);
writeFileSync(normalizedJobPath, normalizedJob, 'utf8');

run(process.execPath, [
  tscPath,
  '--module',
  'commonjs',
  '--target',
  'ES2022',
  '--jsx',
  'react',
  '--esModuleInterop',
  '--skipLibCheck',
  '--types',
  'node',
  '--typeRoots',
  mobileTypeRoots,
  '--rootDir',
  mobileSourceRoot,
  '--outDir',
  outputDirectory,
  crossLayerTestPath,
  conferenceTestPath,
  resultPresentationTestPath,
  feedbackServiceTestPath,
  redesignViewModelTestPath,
]);

run(process.execPath, [
  '--require',
  runtimeShimPath,
  join(
    outputDirectory,
    'features/makeup-feedback/services/makeupFeedbackCrossLayerContract.test.js',
  ),
  fixturePath,
  normalizedJobPath,
]);

run(process.execPath, [
  '--require',
  runtimeShimPath,
  join(
    outputDirectory,
    'features/makeup-feedback/services/makeupFeedbackAgentConferenceService.test.js',
  ),
]);

run(process.execPath, [
  '--require',
  runtimeShimPath,
  join(
    outputDirectory,
    'features/makeup-feedback/redesign/makeupFeedbackResultViewModel.test.js',
  ),
]);

run(process.execPath, [
  '--require',
  runtimeShimPath,
  join(
    outputDirectory,
    'features/makeup-feedback/services/makeupFeedbackService.test.js',
  ),
]);

run(process.execPath, [
  '--require',
  runtimeShimPath,
  join(
    outputDirectory,
    'features/makeup-feedback/services/makeupFeedbackResultPresentation.test.js',
  ),
]);
