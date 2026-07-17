import {existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-makeup-recommendation-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const typeRoots = join(repoRoot, 'apps/mobile/node_modules/@types');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const featureRoot = join(srcRoot, 'features/makeup-recommendation');
const tests = [
  'features/makeup-recommendation/services/makeupRecommendationCustomSituationValidation.test.ts',
  'features/makeup-recommendation/services/makeupRecommendationService.test.ts',
  'features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts',
  'features/ar/services/recommendedMakeupEditService.test.ts',
  'features/ar/services/savedArLookService.test.ts',
  'app/navigation/routes/makeupRecommendationRouteActions.test.ts',
  'app/navigation/routes/arRouteActions.test.ts',
];

function read(...segments) {
  return readFileSync(join(...segments), 'utf8');
}

function requireIncludes(source, contracts, label) {
  for (const contract of contracts) {
    if (!source.includes(contract)) {
      throw new Error(label + ' is missing its V2 contract: ' + contract);
    }
  }
}

function validateSituationWebP(assetPath) {
  const bytes = readFileSync(assetPath);
  if (bytes.length > 150 * 1024) throw new Error('Situation image exceeds 150 KiB: ' + assetPath);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Situation image is not WebP: ' + assetPath);
  }
  if (bytes.toString('ascii', 12, 16) !== 'VP8 ') {
    throw new Error('Situation image must be lossy RGB WebP without alpha: ' + assetPath);
  }
  const width = bytes.readUInt16LE(26) & 0x3fff;
  const height = bytes.readUInt16LE(28) & 0x3fff;
  if (width !== 768 || height !== 768) {
    throw new Error(`Situation image must be 768x768, got ${width}x${height}: ${assetPath}`);
  }
}

const situationKeys = [
  ['daily', 'daily.webp'],
  ['formal_event', 'formal-event.webp'],
  ['camera_content', 'camera-content.webp'],
  ['festival_performance', 'festival-performance.webp'],
];
const assetRegistry = read(featureRoot, 'data/situations/makeupRecommendationSituationAssets.ts');
for (const [key, filename] of situationKeys) {
  requireIncludes(assetRegistry, [key + ': require(', '/situations/' + filename], 'Situation asset registry');
  const assetPath = join(srcRoot, 'assets/images/makeup-recommendation/situations', filename);
  if (!existsSync(assetPath)) throw new Error('Situation image is missing: ' + assetPath);
  validateSituationWebP(assetPath);
}
if (assetRegistry.includes('-source.png')) {
  throw new Error('Metro registry must reference optimized WebP assets only.');
}

const catalog = read(featureRoot, 'data/makeupRecommendationV2Catalog.ts');
for (const [key] of situationKeys) {
  requireIncludes(catalog, ["situation('" + key + "'"], 'Situation catalog');
}
requireIncludes(catalog, ['TREND_K_BEAUTY_2026', 'TREND_GLOBAL_SS26', 'STEADY', 'CURATED'], 'Trend badge catalog');

const grid = read(featureRoot, 'components/SituationCardGrid.tsx');
requireIncludes(grid, ['horizontal', 'snapToInterval', 'decelerationRate="fast"', 'width * 0.42'], 'Responsive situation carousel');
const situationCard = read(featureRoot, 'components/SituationCard.tsx');
if (situationCard.includes('scrim') || situationCard.includes('rgba(17')) {
  throw new Error('Situation card must keep its photo free of dark overlays.');
}

const discovery = read(featureRoot, 'screens/ScenarioDiscoveryView.tsx');
requireIncludes(discovery, [
  'AnalysisReportSelectorCard',
  'AnalysisReportPickerSheet',
  'SituationCardGrid',
  'SituationKeywordSheet',
  'EditorialTrendSection',
  'CustomSituationComposer',
  'onStartFaceAnalysis',
  '선택한 보고서 기반으로 추천메이크업이 생성됩니다',
], 'Discovery hierarchy');
if (discovery.includes('TrendKeywordPanel') || discovery.includes('accessibilityRole="checkbox"')) {
  throw new Error('Discovery must not inline situation keywords or show a personalized-image checkbox.');
}

const customComposer = read(featureRoot, 'components/CustomSituationComposer.tsx');
requireIncludes(customComposer, [
  '<Modal',
  'KeyboardAvoidingView',
  "Platform.OS === 'ios' ? 'padding' : 'height'",
  'backgroundColor: colors.background',
  'autoFocus',
], 'Keyboard-aware custom situation sheet');

const reducer = read(featureRoot, 'state/makeupRecommendationDiscoveryReducer.ts');
requireIncludes(reducer, [
  "type: 'report/selected'",
  "type: 'situation/selected'",
  "type: 'keyword/selected'",
  "type: 'custom/opened'",
], 'Discovery reducer');
if (reducer.includes('imageMode')) {
  throw new Error('Discovery reducer must not retain the removed personalized-image toggle.');
}

const screen = read(featureRoot, 'screens/MakeupRecommendationScreen.tsx');
requireIncludes(screen, [
  'reportId?: string;',
  'fetchMakeupRecommendationDiscovery',
  'startGeneratedMakeupRecommendationV2',
  'answerGeneratedMakeupRecommendationQuestionV2',
  'generateMakeupRecommendationV2',
  'scenarioLabel={session.scenarioLabel}',
  "imageMode: 'personalized'",
  'editorialPresetId: trend.id',
  'editorialPresetLabel: trend.displayText',
  'editorialPresetPrompt: trend.seedPrompt',
  'pollGeneratingSession',
  'MAKEUP_SESSION_GENERATING',
  'MAKEUP_SESSION_STATE_CHANGED',
], 'Makeup recommendation screen');

const editorialTrends = read(featureRoot, 'data/makeupRecommendationEditorialTrends.ts');
requireIncludes(editorialTrends, [
  "id: 'wanghong-glass'",
  "requireScenario('baseball-camera')",
  "requireScenario('trend-my-way')",
  'MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT = 6',
], 'Editorial trend catalog');

const service = read(featureRoot, 'services/makeupRecommendationService.ts');
requireIncludes(service, [
  '/makeup-recommendations/discovery',
  "'/makeup-recommendations/sessions'",
  '/answers',
  '/generate',
  '/image/retry',
  'Idempotency-Key',
  'editorialPresetId',
], 'Makeup recommendation service');

const notificationCoordinator = read(
  srcRoot,
  'features/notifications/components/NotificationCoordinator.tsx',
);
const notificationService = read(
  srcRoot,
  'features/notifications/services/notificationService.ts',
);
const runtimeNotificationImport = /^\s*import(?!\s+type\b).*['"]expo-notifications['"]/m;
if (
  runtimeNotificationImport.test(notificationCoordinator) ||
  runtimeNotificationImport.test(notificationService)
) {
  throw new Error(
    'Expo Go boot path must not statically import the expo-notifications runtime.',
  );
}
requireIncludes(notificationService, [
  "import {isRunningInExpoGo} from 'expo';",
  "Platform.OS === 'android' && isRunningInExpoGo()",
  "import('expo-notifications')",
], 'Expo Go notification guard');
if (
  notificationService.indexOf("Platform.OS === 'android' && isRunningInExpoGo()") >
  notificationService.indexOf("import('expo-notifications')")
) {
  throw new Error('Expo Go guard must run before loading expo-notifications.');
}
requireIncludes(
  notificationCoordinator,
  ['getExpoNotificationsModule()', 'if (!isActive || !Notifications)'],
  'Expo Go notification coordinator',
);

const results = read(featureRoot, 'screens/RecommendationResultsView.tsx');
if (service.includes("generationMode === 'localFallback'") || results.includes("generationMode === 'localFallback'")) {
  throw new Error('Backend AI failures must be surfaced instead of shown as successful fixture recommendations.');
}

const routeTypes = read(srcRoot, 'app/navigation/routeTypes.ts');
const routeScreen = read(srcRoot, 'app/navigation/routes/makeupRecommendationRoutes.tsx');
const faceRoutes = read(srcRoot, 'app/navigation/routes/faceAnalysisRoutes.tsx');
requireIncludes(routeTypes, ['MakeupRecommendation:', "{analysisReportId?: string; reportId?: string; view?: 'history'}"], 'Recommendation route params');
requireIncludes(routeScreen, ['analysisReportId={analysisReportId}', 'reportId={route.params?.reportId}', 'onStartFaceAnalysis', "navigate('FaceAnalysisIntro')"], 'Recommendation route wiring');
requireIncludes(faceRoutes, ["navigate('MakeupRecommendation', {analysisReportId: currentReportId})"], 'Face report recommendation CTA');

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module', 'commonjs',
  '--target', 'ES2023',
  '--lib', 'ES2023,DOM',
  '--types', 'node',
  '--typeRoots', typeRoots,
  '--esModuleInterop',
  '--skipLibCheck',
  '--rootDir', srcRoot,
  '--outDir', outDir,
  ...tests.map(test => join(srcRoot, test)),
]);
for (const test of tests) run(process.execPath, [join(outDir, test.replace(/\.ts$/, '.js'))]);