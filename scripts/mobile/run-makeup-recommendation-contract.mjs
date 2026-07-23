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
  'features/makeup-recommendation/services/makeupRecommendationRegionVisuals.test.ts',
  'features/makeup-recommendation/services/toFinalRecommendationResult.test.ts',
  'features/makeup-recommendation/components/result/finalAreaCropLayout.test.ts',
  'features/makeup-recommendation/components/result/finalAreaGuideRecipe.test.ts',
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
const agentConversation = read(
  featureRoot,
  'services/makeupRecommendationAgentConversation.ts',
);
requireIncludes(agentConversation, [
  '원본 얼굴 사진에 자연스럽게 적용한 추천 이미지를 만들고 있어요.',
], 'App-purpose recommendation loading conversation');
if (agentConversation.includes('OpenAI') || agentConversation.includes('이미지 편집')) {
  throw new Error('Recommendation loading copy must describe the app outcome, not its provider or implementation.');
}
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
  'directReportEntry: Boolean(reportId?.trim())',
], 'Makeup recommendation screen');

const editorialTrends = read(featureRoot, 'data/makeupRecommendationEditorialTrends.ts');
requireIncludes(editorialTrends, [
  "id: 'wanghong-glass'",
  "requireScenario('baseball-camera')",
  "requireScenario('trend-my-way')",
  'MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT = 6',
], 'Editorial trend catalog');

const service = read(featureRoot, 'services/makeupRecommendationService.ts');
const historyView = read(featureRoot, 'screens/RecommendationHistoryView.tsx');
requireIncludes(historyView, [
  'getMakeupRecommendationPreviewPresentation(item)',
  'preview.imageUrl ? (',
  'source={{uri: preview.imageUrl}}',
  'preview.statusLabel',
], 'Applied-image recommendation history preview');
if (
  historyView.includes('const preview = item.results[0]')
  || historyView.includes('source={preview.imageSource}')
) {
  throw new Error('Recommendation history must not present a fixture look as a generated preview.');
}

const profileReportHub = read(
  srcRoot,
  'features/profile/services/profileReportHub.ts',
);
requireIncludes(profileReportHub, [
  'mapMakeupRecommendationProfilePreview',
  'getMakeupRecommendationPreviewPresentation(recommendation)',
  'imageSource: preview.imageUrl ? {uri: preview.imageUrl} : undefined',
  'statusLabel: preview.imageUrl ? undefined : preview.statusLabel',
], 'Profile applied-image report preview');
if (profileReportHub.includes('imageSource: recommendation.results[0].imageSource')) {
  throw new Error('Profile must not present a recommendation fixture as the generated report preview.');
}

const profileScreen = read(srcRoot, 'features/profile/screens/ProfileScreen.tsx');
const profileRoutes = read(srcRoot, 'app/navigation/routes/profileRoutes.tsx');
requireIncludes(profileScreen, [
  'onPressMakeupRecommendationReportsList?: () => void;',
  'onPress={onPressMakeupRecommendationReportsList}',
], 'Recommendation report list action');
requireIncludes(profileRoutes, [
  "navigate('MakeupRecommendation', {view: 'history'})",
], 'Profile recommendation list route');
if (
  profileScreen.includes('onPressMakeupRecommendationReport?: (reportId: string) => void;')
  || profileRoutes.includes("navigate('MakeupRecommendation', {reportId})")
) {
  throw new Error('Profile recommendation preview must open history, not the latest report detail.');
}

requireIncludes(service, [
  '/makeup-recommendations/discovery',
  "'/makeup-recommendations/sessions'",
  '/answers',
  '/generate',
  '/image/retry',
  'Idempotency-Key',
  'editorialPresetId',
  'mapBackendCropRegions',
  "'makeup-face-crops-v1'",
  'look.imageAsset?.provenance?.cropMetadata',
  'anchorPreviewImageUrl: previewImageUrl',
  'const complete = requireCompleteBackendLook(validatedLook, resolvedImageStatus);',
  "|| (resolvedImageStatus === 'completed' && !imageUrl)",
  "requireClaudeGeneration && generationSource !== 'claude'",
  'throw incompleteMakeupRecommendationError();',
  'const previewImageUrl = normalizeOptionalBackendText(report.previewImageUrl);',
  "look.role !== 'anchor' || !previewImageUrl",
  'imageSource: {uri: previewImageUrl}',
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

for (const removedResultFile of [
  'screens/RecommendationResultsScreen.tsx',
  'screens/RecommendationResultsViewLegacy.tsx',
  'config/makeupResultRedesignFlag.ts',
  'components/RecommendedAreaGuideSection.tsx',
  'components/RecommendationContextSummary.tsx',
]) {
  if (existsSync(join(featureRoot, removedResultFile))) {
    throw new Error('Removed recommendation result variant still exists: ' + removedResultFile);
  }
}

const results = read(featureRoot, 'screens/RecommendationResultsView.tsx');
if (service.includes("generationMode === 'localFallback'") || results.includes("generationMode === 'localFallback'")) {
  throw new Error('Backend AI failures must be surfaced instead of shown as successful fixture recommendations.');
}
requireIncludes(service, [
  'mapBackendGenerationSource',
  'mapBackendLookMap',
  'mapBackendFitAssessment',
  'mapBackendMatchAssessment',
  'generationSource: mapBackendGenerationSource(parsed.generationSource)',
  'lookMap: mapBackendLookMap(look.lookMap)',
  'fitAssessment: mapBackendFitAssessment(look.fitAssessment)',
  'matchAssessment: mapBackendMatchAssessment(parsed.matchAssessment)',
  "matchAssessment: role === 'anchor' ? matchAssessment : undefined",
], 'Persisted recommendation metadata mapping');

requireIncludes(results, [
  'return <RecommendationResultsFinalScreen {...props} />;',
], 'Final-only recommendation result');

if (
  results.includes('RecommendationResultVariant')
  || results.includes('RESULT_VARIANTS')
  || results.includes('RecommendationResultsViewLegacy')
  || results.includes('RecommendationResultsViewRedesign')
  || results.includes('accessibilityRole="tab"')
  || results.includes('accessibilityRole="tablist"')
) {
  throw new Error('Production recommendation results must not expose legacy/redesign comparison tabs.');
}

const finalScreen = read(featureRoot, 'screens/RecommendationResultsFinalScreen.tsx');
requireIncludes(finalScreen, [
  "import {FinalGeneratedMakeupHero} from '../components/result/FinalGeneratedMakeupHero';",
  "import {FinalAreaGuideSection} from '../components/result/FinalAreaGuideSection';",
  "import {FinalSingleLookMap} from '../components/result/FinalSingleLookMap';",
  '<FinalGeneratedMakeupHero',
  '<FinalAreaGuideSection',
  '<FinalSingleLookMap',
  'accessibilityLabel="추천 제품 페이지로 이동"',
  'onPress={onOpenRecommendedProducts}',
  "const generatedReady = Boolean(model) && resolvedImageStatus === 'completed';",
  'generatedReady={generatedReady}',
  'onReadyChange={captureReadyHandlers.hero}',
  'onCropSettledChange={captureReadyHandlers.crop}',
  'onProductImageSettledChange={captureReadyHandlers.product}',
  'onPointSettledChange={captureReadyHandlers.map}',
  '<RecommendationReportHeader',
  'accessibilityLabel="추천 메이크업 보고서 더보기"',
  "Alert.alert('추천 메이크업 보고서'",
  '<OptionalViewShot',
  'captureRecommendationResult(captureRef)',
  "handleShareAction('save-image')",
  "handleShareAction('share-result')",
  '추천 제품',
  'AR로 적용하기',
  'onRetry={() => onRetryImages()}',
  'hitSlop={6}',
  'floatingActionClearance: {height: 116}',
], 'Final recommendation result composition');
if (
  finalScreen.includes('FinalRecommendationContextReceipt')
  || finalScreen.includes('이번 추천에 반영했어요')
  || finalScreen.includes('recommendedProductRef')
  || finalScreen.includes('handleScrollToRecommendedProduct')
) {
  throw new Error('Final result must remove the recommendation receipt and stale in-page product scrolling.');
}
if (
  finalScreen.includes('FinalMatchReasonSection')
  || finalScreen.includes('추천 메이크업 매칭률')
) {
  throw new Error('Final recommendation result must not render the removed makeup match-rate section.');
}
if (finalScreen.includes('setCaptureReadiness({...INITIAL_CAPTURE_READINESS})')) {
  throw new Error('Final capture readiness must not reset already-settled report/product images on generation status changes.');
}
if (
  finalScreen.includes('저장과 공유하기')
  || finalScreen.includes('shareTitle')
  || finalScreen.includes('shareButtonLabel')
  || finalScreen.includes('<Download')
  || finalScreen.includes('<Share2')
  || finalScreen.includes('styles.shareSection')
) {
  throw new Error('Final save/share controls must live only in the report-header overflow menu.');
}

const detailHeaderChrome = read(srcRoot, 'app/navigation/detailHeaderChrome.tsx');
const makeupRecommendationRoutes = read(srcRoot, 'app/navigation/routes/makeupRecommendationRoutes.tsx');
requireIncludes(detailHeaderChrome, [
  'headerHidden?: boolean;',
  'isOverlayHeader || headerHidden ? null : header',
  'isOverlayHeader && !headerHidden ? header : null',
], 'Recommendation result route-header suppression');
requireIncludes(makeupRecommendationRoutes, [
  'const [isResultsVisible, setIsResultsVisible] = React.useState(false);',
  'headerHidden={isResultsVisible}',
  'onResultsVisibilityChange={setIsResultsVisible}',
], 'Recommendation result report-header routing');
requireIncludes(screen, [
  "onResultsVisibilityChange?.(phase === 'results');",
  'onBack={onBack}',
], 'Recommendation result report-header handoff');


const finalShareService = read(featureRoot, 'services/recommendationResultShare.ts');
requireIncludes(finalShareService, [
  'getPermissionsAsync(true, [])',
  'requestPermissionsAsync(true, [])',
  'saveToLibraryAsync(imageUri)',
  'createAssetAsync(imageUri)',
  'sharingModule.shareAsync(imageUri',
], 'Final recommendation result share service');
if (finalShareService.includes("['photo']")) {
  throw new Error('Final result save must not request granular media permissions in Android Expo Go.');
}

if (
  finalScreen.includes('FINAL MAKEUP RESULT') ||
  finalScreen.includes('당신을 위한 한 가지 룩')
) {
  throw new Error('Final recommendation result removed copy is still present.');
}

const finalMatchMapper = read(featureRoot, 'services/toFinalRecommendationResult.ts');
requireIncludes(finalMatchMapper, [
  'id: string;',
  'rows.push({id: question.id, questionLabel, answerLabel});',
  'const assessment = sourceLook.matchAssessment;',
  "source: 'legacy-unavailable'",
  'if (assessment.score === null)',
  "source: 'insufficient-evidence'",
  'value: clampFinalLookMapCoordinate(assessment.score)',
  "source: 'server-match'",
], 'Server-owned recommendation match score');
if (
  finalMatchMapper.includes('recommendationMatchCorpus')
  || finalMatchMapper.includes('evidenceMatchStrength')
  || finalMatchMapper.includes('normalizeMatchText')
  || finalMatchMapper.includes('sourceLook.fitAssessment')
  || finalMatchMapper.includes('assessment.overallScore')
  || finalMatchMapper.includes('Math.min(74')
  || finalMatchMapper.includes('FIT_EVIDENCE_LABELS')
  || finalMatchMapper.includes('generationSource')
) {
  throw new Error('Final match score must use only matchAssessment without inferred, capped, or source-based fallbacks.');
}

requireIncludes(screen, [
  '<RecommendationResultsView',
  'onOpenRecommendedProducts={() => onOpenRecommendedProducts?.(session.sourceAnalysisReportId)}',
  'onOpenRecommendedProducts?: (sourceAnalysisReportId?: string) => void;',
  'reportImageUri,',
  'reportSummary: sourceReport',
  'questions: session.questions',
  'answers: session.answers',
  'additionalConstraints: session.additionalConstraints',
  'export const MIN_AGENT_CONVERSATION_MS = 6_000;',
  'await waitForMinimumAgentConversation(loadingStartedAt, signal);'
], 'Final recommendation result context wiring');
if (screen.includes("imageStatus: 'failed', imageError: '이미지 상태 확인 실패'")) {
  throw new Error('Transient image polling failures must not become a terminal image failure.');
}


const makeupRecommendationRoute = read(
  srcRoot,
  'app/navigation/routes/makeupRecommendationRoutes.tsx',
);
requireIncludes(makeupRecommendationRoute, [
  'onOpenRecommendedProducts={sourceAnalysisReportId =>',
  "navigation.navigate('ProductRecommendation', {",
  "initialSection: 'personalized',",
  '...(sourceAnalysisReportId ? {reportId: sourceAnalysisReportId} : {})',
], 'Recommendation result product hub route');

const finalHero = read(featureRoot, 'components/result/FinalGeneratedMakeupHero.tsx');
const alignedHeroImageLayer = read(featureRoot, 'components/result/AlignedHeroImageLayer.tsx');
const finalImageAlignment = read(featureRoot, 'services/finalMakeupImageAlignment.ts');
requireIncludes(finalImageAlignment, [
  'referenceFrame: MakeupRecommendationImageAlignmentFrame | undefined = frame',
  'const containScale = Math.min(',
  'const requestedScale = measuredReference.span / measuredFrame.span;',
  'rotationDeg: measuredReference.rollDeg - measuredFrame.rollDeg',
], 'Captured-frame-relative final image alignment');
requireIncludes(finalHero, [
  "const AURA_LETTERS = ['A', 'U', 'R', 'A'] as const;",
  'alignmentMetadata?: MakeupRecommendationImageAlignmentMetadata;',
  'beforeImageUri?: string;',
  'afterImage: ImageSourcePropType;',
  'title?: string;',
  'source={{uri: beforeImageUri}}',
  'source={afterImage}',
  'const sourceFrame = alignmentMetadata?.source;',
  'alignmentFrame={sourceFrame}',
  'alignmentFrame={alignmentMetadata?.generated}',
  'referenceFrame={sourceFrame}',
  'const heroAspectRatio = sourceImageWidth > 0 && sourceImageHeight > 0',
  'style={[styles.hero, heroAspectRatio ? {aspectRatio: heroAspectRatio} : null]}',
  'key={afterLoadEpochKey}',
  'recyclingKey={afterLoadEpochKey}',
  'afterLoadEpochKeyRef.current !== afterLoadEpochKey',
  "imageStatus === 'completed' ? (",
  'PanResponder.create({',
  'accessibilityRole="adjustable"',
  'comparePosition.setValue(',
  'onPanResponderRelease: () => {',
  "backgroundColor: 'rgba(229,237,233,0.96)'",
  "color: '#788A80'",
  '<View pointerEvents="none" style={styles.titleOverlay}>',
  '<Text numberOfLines={2} style={styles.titleText}>{displayTitle}</Text>',
], 'Final generated makeup hero');
const completedAfterGateIndex = finalHero.indexOf("imageStatus === 'completed' ? (");
const afterImageIndex = finalHero.indexOf('source={afterImage}');
if (completedAfterGateIndex < 0 || afterImageIndex < completedAfterGateIndex) {
  throw new Error('Final hero must render its distinct after image only after generation completes.');
}
if ((finalHero.match(/source=\{afterImage\}/g) ?? []).length !== 1) {
  throw new Error('Final hero must have exactly one generated after-image render path.');
}
requireIncludes(alignedHeroImageLayer, [
  'computeFinalMakeupImageTransform(',
  'referenceFrame?: MakeupRecommendationImageAlignmentFrame;',
  'contentFit="cover"',
  'contentFit="contain"',
  'contentFit="fill"',
  'alignmentStyles.outer',
  'alignmentStyles.scaleAndRotate',
  'alignmentStyles.inner',
  '`${recyclingKey}:background`',
  'const hasMeasuredViewport = viewportWidth > 0 && viewportHeight > 0;',
  'const fullCanvasStyle = useMemo(',
  'width: viewportWidth',
  'height: viewportHeight',
  ': StyleSheet.absoluteFill',
], 'Aligned final hero image layer');
requireIncludes(finalScreen, [
  'alignmentMetadata={model.sourceLook.imageAlignmentMetadata}',
  'title={context?.keywordLabel?.trim()',
  '|| context?.situationLabel?.trim()',
  '|| model.look.name}',
], 'Final hero alignment and title wiring');
const afterClipIndex = finalHero.indexOf('<Animated.View style={[styles.afterClip');
const afterClipEndIndex = finalHero.indexOf('</Animated.View>', afterClipIndex);
const fixedTitleIndex = finalHero.indexOf('<View pointerEvents="none" style={styles.titleOverlay}>');
if (
  afterClipIndex < 0
  || afterClipEndIndex < 0
  || fixedTitleIndex <= afterClipEndIndex
) {
  throw new Error('The situation keyword must stay outside the divider-clipped after-image layer.');
}
if (
  finalHero.includes('RECOMMENDED MAKEUP')
  || finalHero.includes('titleEyebrow')
  || finalHero.includes('titleOverlayLayout')
) {
  throw new Error('The hero must show only the fixed situation keyword title.');
}
if ((finalHero.match(/referenceFrame=\{sourceFrame\}/g) ?? []).length !== 2) {
  throw new Error('Both photos must align against the captured source frame.');
}
if ((alignedHeroImageLayer.match(/style=\{fullCanvasStyle\}/g) ?? []).length !== 2) {
  throw new Error('Both aligned and fallback after images must keep the full hero canvas while the divider clips them.');
}
if (
  finalHero.includes('loadingTitle')
  || finalHero.includes('loadingBody')
  || finalHero.includes('추천 메이크업을 그리고 있어요')
) {
  throw new Error('Final generated-image loading state must show only the sage-gray AURA wordmark.');
}


const finalSingleLookMap = read(featureRoot, 'components/result/FinalSingleLookMap.tsx');
requireIncludes(finalSingleLookMap, [
  'generatedReady: boolean;',
  'look: Look;',
  'LOOK MAP',
  '{generatedReady && !pointImageFailed ? (',
  'source={look.image}',
  'style={styles.pointImage}',
], 'Final single-look map');
if (
  finalSingleLookMap.includes('looks.map')
  || finalSingleLookMap.includes('pointText}>1')
  || finalSingleLookMap.includes('look.time')
) {
  throw new Error('Final look map must render one generated-image point without duration copy.');
}
if (finalSingleLookMap.includes('look.match') || finalSingleLookMap.includes('% 매치')) {
  throw new Error('LOOK MAP must not render the removed recommendation match score.');
}
if (
  finalSingleLookMap.includes('한 가지 룩, 한눈에 보기') ||
  finalSingleLookMap.includes('이번 결과는 한 가지 추천 포지션')
) {
  throw new Error('Final look map must keep LOOK MAP as its only section title.');
}

const finalAreaGuide = read(featureRoot, 'components/result/FinalAreaGuideSection.tsx');
const finalAreaCrop = read(featureRoot, 'components/result/FinalAreaCropPreview.tsx');
const regionVisualResolver = read(featureRoot, 'services/makeupRecommendationRegionVisuals.ts');
requireIncludes(finalAreaGuide, [
  'generatedReady: boolean;',
  '<FinalAreaCropPreview',
  'cropRegions={sourceLook.imageCropRegions}',
  'generatedImage={look.image}',
  'buildFinalAreaRecipes(sourceLook.areaGuides, look.parts)',
  "() => recipes[0]?.area ?? 'base'",
  'const activeArea = recipes[activeIndex]?.area',
  'const [pageHeights, setPageHeights]',
  'const [settledPagerArea, setSettledPagerArea]',
  'const activePageHeight = pageHeights[settledPagerArea]',
  'onPress={() => handleSelectArea(index)}',
  'setSettledPagerArea(nextArea)',
  'pagerRef.current?.scrollTo',
  'contentContainerStyle={styles.pagerContent}',
  'onScroll={handlePagerScroll}',
  'onMomentumScrollEnd={handlePagerMomentumEnd}',
  'const settledIndex = indexFromOffset(',
  'pagingEnabled',
  'style={[styles.pager, activePagerHeightStyle]}',
  'onLayout={event => handlePageLayout(recipe.area, event)}',
  "pagerContent: {alignItems: 'flex-start'}",
  '<FinalAreaRecipePage',
  '메이크업 순서',
  'recipe.displayOrder',
  'contentContainerStyle={styles.sequenceContent}',
  'ref={sequenceRef}',
  'centerSequenceTab(activeArea)',
  'styles.sequenceItemWrap',
  'AREA_SEQUENCE_COLORS[recipe.area]',
  'style={styles.areaTitleRow}',
  'recipe.summaryColors.length > 0',
  'recipe.summaryColors.map(color => (',
  'style={styles.areaColorSwatches}',
  'styles.areaColorSwatch',
  'backgroundColor: SUMMARY_HEX_COLOR.test(color.hex)',
  '<FinalMakeupRecipeStepCard',
  'recipe.goal',
  'recipe.texture',
  'recipe.steps.map',
  'const [activeStepIndex, setActiveStepIndex]',
  'accessibilityLabel="메이크업 단계 타임라인"',
  'setActiveStepIndex(index)',
  'accessibilityLabel="이전 메이크업 단계"',
  'accessibilityLabel="다음 메이크업 단계"',
  'expanded',
  'recipe.completionCriteria.map',
  '이전 결과 요약',
  '새 추천을 생성하면 상세 메이크업 레시피를 받을 수 있어요.',
  '<FinalRecommendedProductCard',
  'product={sourceProduct}',
], 'Swipeable ordered makeup area recipe guide');
if (
  finalAreaGuide.includes('SHOP ROUTINE') ||
  finalAreaGuide.includes('전체 시술 순서') ||
  finalAreaGuide.includes('단계별 샵 레시피') ||
  finalAreaGuide.includes('recipe.estimatedMinutes') ||
  finalAreaGuide.includes('<Clock3') ||
  finalAreaGuide.includes('sectionSubtitle') ||
  finalAreaGuide.includes('selectedRecipe')
) {
  throw new Error('Final area guide still renders removed subtitle/shop copy or the pre-pager selected recipe UI.');
}
if (
  finalAreaGuide.includes('styles.sequenceAreaColumn')
  || finalAreaGuide.includes('styles.sequencePaletteColumn')
  || finalAreaGuide.includes('styles.sequenceColorName')
) {
  throw new Error('Makeup order must keep the original compact horizontal tabs without color-name rows.');
}
const areaTitleRowIndex = finalAreaGuide.indexOf('style={styles.areaTitleRow}');
const areaGoalIndex = finalAreaGuide.indexOf('{recipe.goal ? (', areaTitleRowIndex);
if (areaTitleRowIndex < 0 || areaGoalIndex <= areaTitleRowIndex) {
  throw new Error('Area color swatches must render beside the area name and above the area goal.');
}
if (/<Text[^>]*>\s*\{color\.(?:name|hex)(?:\.toUpperCase\(\))?\}\s*<\/Text>/.test(finalAreaGuide)) {
  throw new Error('Area-header swatches must not render color names or HEX values as text.');
}

const finalRecipeStepCard = read(featureRoot, 'components/result/FinalMakeupRecipeStepCard.tsx');
requireIncludes(finalRecipeStepCard, [
  '사용 색상 · {step.colors.length}개',
  '{color.role}',
  '{color.name}',
  'key={`${color.role}:${color.name}:${color.hex}`}',
  '{backgroundColor: HEX_COLOR.test(color.hex) ? color.hex : colors.heroPlaceholder},',
  "{label: '도구', value: step.tool}",
  "{label: '사용량', value: step.amount}",
  "{label: '바르는 범위', value: step.placement}",
  '바르는 방법',
  'step.blending',
  '이 단계의 완료 기준',
  'step.finishCheck',
], 'Detailed application recipe step card');
if (/<Text[^>]*>\s*\{color\.hex(?:\.toUpperCase\(\))?\}\s*<\/Text>/.test(finalRecipeStepCard)) {
  throw new Error('Detailed application recipe cards must keep HEX values out of user-visible text.');
}
const finalRecipeMapper = read(featureRoot, 'services/makeupRecommendationMappers.ts');
requireIncludes(finalRecipeMapper, [
  "value?.recipeVersion !== 'makeup-application-v1'",
  'rawSteps.length < APPLICATION_MIN_STEPS[area]',
  'seenOrders.has(order)',
  '!APPLICATION_COLOR_HEX.test(color.hex)',
  "area === 'base'",
  "area === 'eye'",
  "area === 'lip'",
  'distinctColors.size >= 3',
  'distinctColors.size >= 2',
], 'Strict mobile application recipe normalization');
const finalProductCard = read(featureRoot, 'components/result/FinalRecommendedProductCard.tsx');
const finalLookMapper = read(featureRoot, 'services/toRecommendationResultLooks.ts');
requireIncludes(finalProductCard, [
  'normalizePurchaseUrl',
  'Linking.canOpenURL(url)',
  'Linking.openURL(url)',
  'const productImageKey = normalizePurchaseUrl(product?.imageUrl)',
  'const hasCatalogProduct = Boolean(product && productName && purchaseUrl && productImageKey);',
  'const showProduct = hasCatalogProduct && !productImageFailed;',
  'productLinkEpochKeyRef.current !== productLinkEpochKey',
  'key={productLoadEpochKey}',
  'recyclingKey={productLoadEpochKey}',
  '구매 링크와 이미지가 확인된 실제 카탈로그 제품만 표시해요.',
], 'Verified recommendation product purchase card');
if (finalProductCard.includes('fallback:') || finalAreaGuide.includes('fallback={{')) {
  throw new Error('Final product card must not render fixture or view-model fallback products.');
}
if (finalLookMapper.includes('MAKEUP_LOOK_FIXTURES')) {
  throw new Error('Final result product mapper must use backend catalog products only.');
}
requireIncludes(finalLookMapper, [
  'const matchAssessment = look.matchAssessment;',
  'const matchScore = matchAssessment?.score ?? null;',
  'match: matchScore,',
  'lookMap?.naturalityToPersonality ?? 50',
  'lookMap?.casualToGlam ?? 50',
  'lookMap?.rationale',
], 'Data-driven final match and LOOK MAP view model');
if (
  finalLookMapper.includes('ROLE_COORDS')
  || finalLookMapper.includes('ROLE_MATCH_FALLBACK')
  || finalLookMapper.includes('deriveMatch(')
  || finalLookMapper.includes('look.fitAssessment?.overallScore')
  || finalLookMapper.includes('match: 50')
  || finalLookMapper.includes('matchScore ?? 50')
) {
  throw new Error('Final match and LOOK MAP must not use role, product, or fake-score placeholders.');
}
requireIncludes(finalAreaCrop, [
  'computeRegionImageLayout',
  'computeRegionFrameHeight',
  'resolveMakeupRecommendationAreaCropAsset',
  'sourceRegionVisuals',
  "cropAsset.coordinateSpace === 'source-analysis-image'",
  'projectRegionGuidePoints',
  'isMakeupRecommendationCropRenderReady',
  "cropAsset.coordinateSpace === 'full-image' ? 'contain' : 'fill'",
  'source={cropAsset.imageSource}',
  'loadEpochKey',
  'isCurrentEpoch',
  'current.epochKey === loadEpochKey',
  'loadEpochKeyRef.current !== loadEpochKey',
  'current.epochKey !== loadEpochKey',
  'key={`${loadEpochKey}:${index}`}',
  'recyclingKey={`${loadEpochKey}:${index}`}',
], 'Coordinate-space-safe landmark area crops');
requireIncludes(regionVisualResolver, [
  'input.generatedCropRegions?.[input.area]',
  "coordinateSpace: 'generated-image'",
  "coordinateSpace: 'source-analysis-image'",
  "coordinateSpace: 'full-image'",
  'boxes: [FULL_IMAGE_BOX]',
  'imageSource: input.generatedImage',
  'imageSource: {uri: input.sourceImageUri.trim()}',
  'isMakeupRecommendationCropRenderReady',
  'mapAnalysisRegionVisualsToSourceCrops',
  'Source coordinates are never paired with the generated AFTER image.',
], 'Generated-first regionVisual fallback resolver');
if (finalAreaCrop.includes('source={generatedImage}')) {
  throw new Error('Source-analysis coordinates must never be rendered on the generated image.');
}
const finalAreaCropLayout = read(featureRoot, 'components/result/finalAreaCropLayout.ts');
requireIncludes(finalAreaCropLayout, [
  '(box.right - box.left) * sourceWidth',
  '(box.bottom - box.top) * sourceHeight',
  'Math.min(frameWidth / crop.width, frameHeight / crop.height)',
  'CROP_VERTICAL_PLACEMENT[area]',
  'brow: 0.88',
], 'Aspect-aware MediaPipe crop layout');
if (finalAreaCropLayout.includes('Math.max(frameWidth / crop.width, frameHeight / crop.height)')) {
  throw new Error('Area crop layout must contain the full landmark box instead of cover-cropping it.');
}
if (finalAreaCrop.includes('FINAL_PART_CROP_POSITIONS')) {
  throw new Error('Final area crops must not fall back to fixed portrait percentages.');
}
if (
  finalAreaGuide.includes('AREA GUIDE') ||
  finalAreaGuide.includes('부위 참고') ||
  finalAreaGuide.includes('완성 이미지에서') ||
  finalAreaGuide.includes('이 선택의 이유')
) {
  throw new Error('Final area guide still contains copy that should be removed.');
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
