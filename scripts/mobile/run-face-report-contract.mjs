import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-report-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const featuresDir = join(srcRoot, 'features');
const mobileTypeRoots = join(repoRoot, 'apps/mobile/node_modules/@types');

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function requireContract(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireAll(content, snippets, label) {
  for (const snippet of snippets) {
    requireContract(content.includes(snippet), label + ' missing: ' + snippet);
  }
}

const scaffoldSource = source('apps/mobile/src/features/face-report/ReportScreenScaffold.tsx');
const previewSource = source('apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx');
const shareSource = source('apps/mobile/src/features/face-report/services/reportImageShare.ts');
const readinessSource = source('apps/mobile/src/features/face-report/services/reportCaptureReadiness.ts');
const photoSlotSource = source('apps/mobile/src/features/face-report/visuals/PhotoSlot.tsx');

requireAll(scaffoldSource, [
  'useRenderInContext: true',
  'captureRequestId !== null && captureRequestId !== undefined',
  '<FaceReportCaptureDocument',
  'accessibilityElementsHidden',
  'importantForAccessibility="no-hide-descendants"',
  'pointerEvents="none"',
  'countFaceReportCaptureAssets',
  'expectedAssetCount',
  'FaceReportCaptureAssetContext.Provider',
  '<View onLayout={() => setLayoutReady(true)}>',
  '<S1Summary data={data.s1} />',
  '<S2Proportion',
  '<S3Features',
  '<S4PersonalColor',
  '<S5Body',
  '<S6Impression',
  '<S7Styling',
  '<S8Skin',
  '<S9StyleLanes',
], 'face report lazy capture document');

requireAll(scaffoldSource, [
  'GOLDEN_MASK_CAPTURE_IMAGE_SETTLE_TIMEOUT_MS = 10_000',
  'onLoadStart={handlePending}',
  'onLoad={handleLoaded}',
  'onLoadEnd={handleLoadEnd}',
  'onError={handleFailed}',
  "loadOutcomeRef.current = 'failed'",
  "currentState.status === 'loaded'",
  "currentState.status === 'failed'",
  'Golden Mask 이미지를 보고서에 불러오지 못했어요.',
  'requestId !== currentState.requestId',
  'uri !== currentState.uri',
  'await waitForGoldenMaskCaptureImageSettled({',
  'getState: () => goldenMaskCaptureImageStateRef.current',
  'requestId: captureRequestId',
  'uri: posterUri',
  'if (Date.now() >= deadline)',
  'posterUri = await waitForGoldenMaskPoster();',
  'if (posterUri) {',
  'await waitForNextFrame();',
], 'Golden Mask lazy capture image readiness');

requireContract(
  /posterUri = await waitForGoldenMaskPoster\(\);\r?\n {10}}\r?\n {10}if \(posterUri\) \{/.test(
    scaffoldSource,
  ),
  'Existing and newly generated Golden Mask posters must share the Image readiness wait',
);
requireContract(
  (scaffoldSource.match(/await waitForNextFrame\(\);/g) ?? []).length >= 2,
  'Golden Mask capture must wait two layout frames after Image settlement',
);

const captureAssetCountStart = scaffoldSource.indexOf(
  'function countFaceReportCaptureAssets',
);
const captureAssetCountEnd = scaffoldSource.indexOf(
  'function FaceReportCaptureDocument',
  captureAssetCountStart,
);
requireContract(
  captureAssetCountStart >= 0 &&
    captureAssetCountEnd > captureAssetCountStart &&
    !scaffoldSource
      .slice(captureAssetCountStart, captureAssetCountEnd)
      .includes('goldenMask'),
  'Golden Mask readiness must stay separate from the fixed regular asset count',
);

const goldenMaskImageWaitIndex = scaffoldSource.indexOf(
  'await waitForGoldenMaskCaptureImageSettled({',
);
const verticalCaptureIndex = scaffoldSource.indexOf(
  'return await verticalCaptureRef.current?.capture?.()',
  goldenMaskImageWaitIndex,
);
requireContract(
  goldenMaskImageWaitIndex >= 0 &&
    verticalCaptureIndex > goldenMaskImageWaitIndex,
  'Golden Mask Image must settle before the vertical native capture call',
);

requireAll(readinessSource, [
  'assetStates.size !== expectedAssetCount',
  'Array.from(assetStates.values()).every(Boolean)',
], 'face report readiness predicate');

requireAll(photoSlotSource, [
  'captureAssetContext.registerAsset(captureAssetId)',
  'onLoadStart: handleLoadStart',
  'onLoadEnd: handleLoadSettled',
  'onError: handleLoadSettled',
  'const transition = hasCaptureAsset ? 0 : 150',
], 'face report image readiness events');

requireAll(shareSource, [
  'FACE_REPORT_CAPTURE_SETTLE_TIMEOUT_MS = 10_000',
  'if (Date.now() >= deadline)',
  'await waitForFaceReportCaptureAssets(options)',
  'await waitForLayoutFrames(2)',
  'const imageUri = await capture.call(captureTarget)',
], 'face report bounded capture wait');

const timeoutBranchIndex = shareSource.indexOf('if (Date.now() >= deadline)');
const timeoutThrowIndex = shareSource.indexOf('throw new Error(', timeoutBranchIndex);
const captureCallIndex = shareSource.indexOf('const imageUri = await capture.call(captureTarget)');
requireContract(
  timeoutBranchIndex >= 0 && timeoutThrowIndex > timeoutBranchIndex && captureCallIndex > timeoutThrowIndex,
  'timeout must throw before the native capture call',
);

requireAll(previewSource, [
  'shareInFlightRef.current',
  'const operationId = ++shareOperationRef.current',
  'captureRequestIdRef.current = operationId',
  'setCaptureRequestId(operationId)',
  'isReady: () => captureRequestIdRef.current === operationId',
  'shouldContinue: () => isMountedRef.current',
  'shareOperationRef.current += 1',
  'finally {',
  'setCaptureRequestId(null)',
  'setActiveShareTarget(null)',
], 'face report request lifecycle');

const finallyIndex = previewSource.indexOf('      } finally {', previewSource.indexOf('const handleShareAction'));
const lazyUnmountIndex = previewSource.indexOf('setCaptureRequestId(null)', finallyIndex);
requireContract(
  finallyIndex >= 0 && lazyUnmountIndex > finallyIndex,
  'success and failure must both unmount the lazy capture document in finally',
);
// 순수(RN 무의존) 파일만 나열한다.
const entries = [
  'face-report/reportFormat.ts',
  'face-report/reportFormat.test.ts',
  'face-report/reportFeatureAxes.ts',
  'face-report/reportFeatureAxes.test.ts',
  'face-report/services/reportStoryModel.ts',
  'face-report/services/minimumFaceReport.ts',
  'face-report/services/reportStoryModel.test.ts',
  'face-report/services/reportCaptureReadiness.ts',
  'face-report/services/reportCaptureReadiness.test.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts',
  'ar/stencil/src/composer/bodyProfile.ts',
  'ar/stencil/src/composer/bodyProfile.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module', 'commonjs',
  '--target', 'ES2020',
  '--esModuleInterop',
  '--jsx', 'react-jsx',
  '--types', 'node,react',
  '--typeRoots', mobileTypeRoots,
  '--strict',
  '--skipLibCheck',
  '--rootDir', srcRoot,
  '--outDir', outDir,
  ...entries.map(file => join(featuresDir, file)),
  join(srcRoot, 'shared/services/faceAnalysisService.test.ts'),
]);

run(process.execPath, [join(outDir, 'features/face-report/reportFormat.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/reportFeatureAxes.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportStoryModel.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportCaptureReadiness.test.js')]);
run(process.execPath, [join(outDir, 'features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.js')]);
run(process.execPath, [join(outDir, 'features/ar/stencil/src/composer/bodyProfile.test.js')]);
run(process.execPath, [join(outDir, 'shared/services/faceAnalysisService.test.js')]);
