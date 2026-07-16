import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

import {
  buildFaceMeasurementCollectionPlan,
  validateFaceMeasurementCollectionPlan,
} from '../face3d/prepare-face-measurement-collection.mjs';
import {
  buildPreparedLabEnvironment,
  FACE_MEASUREMENT_COLLECTION_MODE_ENV,
  FACE_MEASUREMENT_COLLECTION_PLAN_ENV,
  parsePreparedLabArguments,
} from '../face3d/run-face-measurement-validation-lab.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-ratio-phase1-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, ['scripts/face-ratio/test-phase1-replay.mjs']);

const mobilePackage = JSON.parse(
  readFileSync(join(repoRoot, 'apps/mobile/package.json'), 'utf8'),
);
for (const scriptName of [
  'start:face-measurement-validation-lab',
  'ios:face-measurement-validation-lab',
]) {
  if (
    !mobilePackage.scripts?.[scriptName]?.includes(
      'EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_MODE=generic',
    )
  ) {
    throw new Error(`${scriptName} must identify the generic lab explicitly`);
  }
}
const labSource = readFileSync(
  join(repoRoot, 'apps/mobile/src/app/experiments/FaceCaptureLabApp.tsx'),
  'utf8',
);
const unifiedCaptureScreenSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-capture/screens/UnifiedFaceCaptureScreen.tsx',
  ),
  'utf8',
);
if (
  !labSource.includes('pruneExpiredFaceRatioPhase1ReplayArtifacts()') ||
  !labSource.includes('deleteFaceRatioPhase1ReplayArtifact(') ||
  !labSource.includes('preparedExact30Shot!.shotId') ||
  !labSource.includes('result.requestId !== preparedExact30Shot.shotId') ||
  !labSource.includes('setPreparedExact30CompletedShotCount(') ||
  !labSource.includes('setPhase1PruneError(') ||
  !labSource.includes('phase1PrunePending ||') ||
  !labSource.includes('current.shotIndex !== completedShotIndex') ||
  !labSource.includes('completePreparedReplayCleanup') ||
  !labSource.includes('완료된 기기 raw 삭제 및 세션 종료') ||
  !labSource.includes('unifiedLabImageOwnership.take(result.image.uri)') ||
  !labSource.includes('unifiedLabImageOwnership.releaseAll()') ||
  !labSource.includes('preparedCommitCoordinator.run({') ||
  !labSource.includes('onAbandonStarted={invalidatePreparedCommit}') ||
  !labSource.includes('if (!isCurrent() || !labMountedRef.current)') ||
  !labSource.includes(
    'await deleteUnifiedFaceCaptureTempImage(result.image.uri)',
  ) ||
  !labSource.includes(
    'unifiedLabImageOwnership.release(\n          captureToRelease.imageUri',
  )
) {
  throw new Error(
    'Phase 1 lab entry must prune retention artifacts and block collection on prune failure',
  );
}
const closeHandlerStart = unifiedCaptureScreenSource.indexOf(
  'accessibilityLabel="통합 얼굴 촬영 닫기"',
);
const closeAbandonIndex = unifiedCaptureScreenSource.indexOf(
  'callbacksRef.current.onAbandonStarted?.()',
  closeHandlerStart,
);
const closeCancelIndex = unifiedCaptureScreenSource.indexOf(
  "captureState.cancel('user_closed')",
  closeHandlerStart,
);
const closeCleanupIndex = unifiedCaptureScreenSource.indexOf(
  'cleanupUncommittedImage(captureState.completed)',
  closeHandlerStart,
);
if (
  closeHandlerStart < 0 ||
  closeAbandonIndex < closeHandlerStart ||
  closeCancelIndex < closeAbandonIndex ||
  closeCleanupIndex < closeCancelIndex
) {
  throw new Error(
    'Unified capture close must invalidate a prepared commit before cancel and async cleanup',
  );
}
const artifactStoreSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsArtifacts.ts',
  ),
  'utf8',
);
if (
  !artifactStoreSource.includes(
    'const info = await FileSystem.getInfoAsync(directoryUri)',
  ) ||
  !artifactStoreSource.includes(
    'return FileSystem.readDirectoryAsync(directoryUri)',
  ) ||
  artifactStoreSource.includes(
    'try {\n    return await FileSystem.readDirectoryAsync(directoryUri)',
  )
) {
  throw new Error(
    'Phase 1 retention enumeration must distinguish an absent directory from a read failure',
  );
}

const plan = validateFaceMeasurementCollectionPlan(
  buildFaceMeasurementCollectionPlan({
    cohortId: 'cohort_phase1_contract',
    subjectContextId: 'subj_phase1_contract',
    sessionId: 'session_phase1_contract',
    exact30Repeats: 3,
    rawLandmarkDirectory: join(outDir, 'raw'),
    evidenceDirectory: join(outDir, 'evidence'),
    retentionDays: 7,
    now: new Date('2026-07-17T00:00:00.000Z'),
  }),
);
const alternatePlan = validateFaceMeasurementCollectionPlan(
  buildFaceMeasurementCollectionPlan({
    cohortId: 'cohort_phase1_contract',
    subjectContextId: 'subj_phase1_contract',
    sessionId: 'session_phase1_contract_alternate',
    exact30Repeats: 3,
    rawLandmarkDirectory: join(outDir, 'raw-alternate'),
    evidenceDirectory: join(outDir, 'evidence-alternate'),
    retentionDays: 7,
    now: new Date('2026-07-17T00:00:00.000Z'),
  }),
);
if (
  plan.phase2.shots.some(
    (shot, index) =>
      shot.shotId === alternatePlan.phase2.shots[index].shotId,
  )
) {
  throw new Error(
    'prepared exact-30 request IDs must be unique to the plan session context',
  );
}
const preparedEnvironment = buildPreparedLabEnvironment(plan);
if (
  preparedEnvironment[FACE_MEASUREMENT_COLLECTION_MODE_ENV] !== 'prepared'
) {
  throw new Error('prepared lab wrapper must set prepared collection mode');
}
const encodedPlan =
  preparedEnvironment[FACE_MEASUREMENT_COLLECTION_PLAN_ENV];
if (
  typeof encodedPlan !== 'string' ||
  JSON.stringify(
    JSON.parse(Buffer.from(encodedPlan, 'base64').toString('utf8')),
  ) !== JSON.stringify(plan)
) {
  throw new Error(
    'prepared lab wrapper must hand the validated plan to the app without mutation',
  );
}
const parsedIosArguments = parsePreparedLabArguments([
  '--target',
  'ios',
  '--plan',
  join(outDir, 'session-plan.json'),
  '--',
  '--device',
  'test-device-udid',
]);
if (
  parsedIosArguments.target !== 'ios' ||
  parsedIosArguments.forwardedArgs.join('|') !==
    '--device|test-device-udid'
) {
  throw new Error(
    'prepared lab wrapper must keep its plan argument separate from Expo device arguments',
  );
}
const testPath =
  'features/face-ratio/services/faceRatioPhase1CollectionPlan.test.ts';
const tempImageOwnershipTestPath =
  'features/face-capture/services/faceCaptureLabTempImageOwnership.test.ts';
const preparedCommitCoordinatorTestPath =
  'features/face-capture/services/faceCaptureLabPreparedCommitCoordinator.test.ts';

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--skipLibCheck',
  '--rootDir',
  srcRoot,
  '--outDir',
  outDir,
  join(srcRoot, testPath),
  join(srcRoot, tempImageOwnershipTestPath),
  join(srcRoot, preparedCommitCoordinatorTestPath),
]);
run(process.execPath, [
  join(outDir, testPath.replace(/\.ts$/, '.js')),
  encodedPlan,
]);
run(process.execPath, [
  join(outDir, tempImageOwnershipTestPath.replace(/\.ts$/, '.js')),
]);
run(process.execPath, [
  join(outDir, preparedCommitCoordinatorTestPath.replace(/\.ts$/, '.js')),
]);
