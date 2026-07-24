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
const featuresDir = join(repoRoot, 'apps/mobile/src/features');

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
    requireContract(content.includes(snippet), `${label} missing: ${snippet}`);
  }
}

const shareSheetSource = source(
  'apps/mobile/src/features/face-report/components/FaceReportShareSheet.tsx',
);
const shareSource = source(
  'apps/mobile/src/features/face-report/services/reportImageShare.ts',
);
const scaffoldSource = source(
  'apps/mobile/src/features/face-report/ReportScreenScaffold.tsx',
);
const previewSource = source(
  'apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx',
);
const minimumReportSource = source(
  'apps/mobile/src/features/face-report/services/minimumFaceReport.ts',
);
const routesSource = source(
  'apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx',
);
const loadingSource = source(
  'apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.tsx',
);

requireAll(shareSheetSource, [
  'type ReportSaveScope,',
  'controller.capturePage(',
  'requestReportImageSavePermission()',
  'saveReportImageToLibrary(imageUri)',
  'controller.restorePage(originalPageId)',
  '현재 카드',
  '전체 보고서',
  'exportInFlightRef.current',
  'const operationId = ++exportOperationRef.current',
], 'actual face-report capture lifecycle');
requireContract(
  !shareSheetSource.includes('ReportShareCard') &&
    !shareSheetSource.includes('OptionalViewShot'),
  'share sheet must not render synthetic report cards for saving',
);

requireAll(shareSource, [
  'FACE_REPORT_CAPTURE_SETTLE_TIMEOUT_MS = 10_000',
  'if (Date.now() >= deadline)',
  'await waitForFaceReportCaptureAssets(options)',
  'await waitForLayoutFrames(3)',
  'viewShot.captureRef(target',
  'snapshotContentContainer',
  'assertCaptureStillActive(options.shouldContinue)',
], 'face report full-content bounded capture wait');

requireAll(scaffoldSource, [
  'function ReportCompletionIndicator(',
  'function reportStageStatePresentation(',
  'status.stages.map(stage =>',
  '완성된 내용부터 볼 수 있어요',
  '기본 내용 제공',
  '생성 실패',
  '보고서 생성 완료',
  'const capturePage = React.useCallback(',
  'prepareGoldenMaskForCapture',
  'dataRef.current.s1.photo.uri ?? null',
  'getExportSnapshot: () => ({',
  'restorePage: pageId =>',
  'scrollRef.current?.scrollTo({animated: false, y: 0})',
  'entryResetKey',
], 'report scaffold progress, capture, restore, and scroll reset');
requireContract(
  !scaffoldSource.includes('function ReportCompletionStepper('),
  'report progress must use the compact non-spinner status treatment',
);
requireAll(previewSource, [
  'const recommendationReportId =',
  'report?.id ??',
  'minimumPreview?.reportId',
  'onPressProducts(recommendationReportId)',
], 'progressive report recommendation CTA');
requireAll(minimumReportSource, [
  "preview.reportId && !preview.errorMessage",
  "'메이크업 추천 받으러 가기'",
  "'메이크업 추천 준비 중'",
], 'minimum report recommendation CTA label');
requireAll(scaffoldSource, [
  'accessibilityState={{disabled: !onPress}}',
  'disabled={!onPress}',
], 'recommendation CTA disabled semantics');
const goldenMaskSource = source(
  'apps/mobile/src/features/face-report/components/GoldenMaskCard.tsx',
);
const goldenMaskPreloadSource = source(
  'apps/mobile/src/features/face-report/services/goldenMaskPreloadService.ts',
);
requireAll(goldenMaskSource, [
  'captureMode && capturePosterUri',
  'captureUnityGoldenMaskPoster(requestIdRef.current)',
  'onPosterUnavailable?.()',
], 'native Golden Mask poster capture with a safe fallback');
requireAll(goldenMaskPreloadSource, [
  "currentSession?.status !== 'error'",
  'canReuseCurrent(reportId, topologyFingerprint)',
  'canReuseCurrent(reportId, descriptor.topologyFingerprint)',
], 'failed Golden Mask preload sessions must remain retryable');
requireContract(
  !scaffoldSource.includes('setMaskLayoutY(Number.POSITIVE_INFINITY);'),
  'report entry must not erase the measured Golden Mask layout after mount',
);
requireContract(
  !scaffoldSource.includes('MeasurementDebug') &&
    !previewSource.includes('measurementDebug'),
  'production report must not expose development measurement data',
);
requireContract(
  !routesSource.includes('기하검증'),
  'production face-report route must not expose geometry validation',
);
requireAll(routesSource, [
  'routeName="FaceAnalysisLoading"',
  'headerHidden',
  'entryResetKey={route.key}',
], 'loading chrome and report entry reset');
requireAll(loadingSource, [
  "import {BlurView} from 'expo-blur'",
  'isReduceTransparencyEnabled',
  'reduceTransparencyChanged',
  'accessibilityLabel="얼굴 분석 닫기"',
], 'glass loading-screen overlay back button');

// 순수(RN 무의존) 파일만 나열한다.
const entries = [
  'face-report/reportFormat.ts',
  'face-report/reportFormat.test.ts',
  'face-report/reportFeatureAxes.ts',
  'face-report/reportFeatureAxes.test.ts',
  'face-report/services/reportStoryModel.ts',
  'face-report/services/minimumFaceReport.ts',
  'face-report/services/reportStoryModel.test.ts',
  'face-report/services/reportContentUpgrade.ts',
  'face-report/services/reportContentUpgrade.test.ts',
  'face-report/services/reportCompletionStatus.ts',
  'face-report/services/reportCompletionStatus.test.ts',
  'face-report/services/goldenMaskInteraction.ts',
  'face-report/services/goldenMaskInteraction.test.ts',
  'face-report/services/faceDepthPresentation.ts',
  'face-report/services/faceDepthPresentation.test.ts',
  'face-report/services/reportCaptureReadiness.ts',
  'face-report/services/reportCaptureReadiness.test.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts',
  'ar/stencil/src/composer/bodyProfile.ts',
  'ar/stencil/src/composer/bodyProfile.test.ts',
  'face-analysis/services/faceAnalysisReportGate.ts',
  'face-analysis/services/faceAnalysisReportGate.test.ts',
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
  '--strict',
  '--skipLibCheck',
  '--types', 'node,react',
  '--typeRoots', join(repoRoot, 'apps/mobile/node_modules/@types'),
  '--rootDir', srcRoot,
  '--outDir', outDir,
  ...entries.map(file => join(featuresDir, file)),
  join(srcRoot, 'shared/ui/storyReportPagerGesture.ts'),
  join(srcRoot, 'shared/ui/storyReportPagerGesture.test.ts'),
  join(srcRoot, 'shared/services/faceAnalysisService.test.ts'),
]);

run(process.execPath, [join(outDir, 'features/face-report/reportFormat.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/reportFeatureAxes.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportStoryModel.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportContentUpgrade.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportCompletionStatus.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/goldenMaskInteraction.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/faceDepthPresentation.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportCaptureReadiness.test.js')]);
run(process.execPath, [join(outDir, 'features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.js')]);
run(process.execPath, [join(outDir, 'features/ar/stencil/src/composer/bodyProfile.test.js')]);
run(process.execPath, [join(outDir, 'features/face-analysis/services/faceAnalysisReportGate.test.js')]);
run(process.execPath, [join(outDir, 'shared/ui/storyReportPagerGesture.test.js')]);
run(process.execPath, [join(outDir, 'shared/services/faceAnalysisService.test.js')]);

const regionCardSource = readFileSync(
  join(featuresDir, 'face-report/sections/S3Features.tsx'),
  'utf8',
);
if (regionCardSource.includes('이 부위의 결론')) {
  throw new Error('Region report must not render the removed conclusion label.');
}
for (const required of [
  '<ReportGlassSurface',
  'cropRect: undefined',
  'accessibilityState={{expanded: selected, selected}}',
]) {
  if (!regionCardSource.includes(required)) {
    throw new Error(`Region report progressive disclosure contract missing: ${required}`);
  }
}
console.log('region report visual hierarchy contract passed');

const personalColorSource = readFileSync(
  join(featuresDir, 'face-report/sections/S4PersonalColor.tsx'),
  'utf8',
);
requireContract(
  personalColorSource.includes('slot={{...photo, cropRect: undefined}}'),
  'personal-color drape portraits must preserve the source face aspect ratio',
);
const goodSwatchesIndex = personalColorSource.indexOf(
  '<SwatchRow swatches={d.goodSwatches}',
);
const badTitleIndex = personalColorSource.indexOf('{d.badTitle}');
const badSwatchesIndex = personalColorSource.indexOf(
  '<SwatchRow swatches={d.badSwatches}',
);
const bestDetailIndex = personalColorSource.indexOf(
  '<SelectedColorDetail swatch={best}',
);
requireContract(
  goodSwatchesIndex >= 0 &&
    badTitleIndex > goodSwatchesIndex &&
    badSwatchesIndex > badTitleIndex &&
    bestDetailIndex > badSwatchesIndex,
  'personal-color good and avoid swatches must stay together directly below the drape photos',
);
console.log('personal-color drape layout contract passed');
