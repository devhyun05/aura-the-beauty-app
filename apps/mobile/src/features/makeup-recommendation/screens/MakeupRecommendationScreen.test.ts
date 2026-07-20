import {readFileSync} from 'node:fs';

import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {
  MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT,
  MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS,
  getMakeupRecommendationEditorialTrends,
} from '../data/makeupRecommendationEditorialTrends';
import {MAKEUP_SITUATION_FIXTURES} from '../data/makeupRecommendationV2Catalog';
import {getMakeupRecommendationAgentMessage} from '../services/makeupRecommendationAgentConversation';
import {
  initialMakeupRecommendationDiscoveryState,
  makeupRecommendationDiscoveryReducer,
} from '../state/makeupRecommendationDiscoveryReducer';
import {
  filterMakeupRecommendationReportsByDiscovery,
  formatMakeupRecommendationHistoryDate,
  isMakeupRecommendationReportAllowedByDiscovery,
  getInitialMakeupRecommendationScreenPhase,
  getQuestionActionMode,
  getQuestionProgressSegments,
  makeupRecommendationDiscoveryCopy,
  makeupRecommendationHistoryCopy,
  shouldHandleMakeupRecommendationBack,
} from './makeupRecommendationViewContracts';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

expectEqual(makeupRecommendationDiscoveryCopy.title, '어떤 상황을 위한 메이크업인가요?', 'v2 discovery title');
expectEqual(makeupRecommendationDiscoveryCopy.eyebrow, 'AI MAKEUP RECOMMENDATION', 'v2 discovery eyebrow');
expectEqual(MAKEUP_SITUATION_FIXTURES.length, 4, 'four broad parent situations');
expectEqual(MAKEUP_SITUATION_FIXTURES.every(item => item.keywords.length === 5), true, 'five concrete situations per parent');
expectEqual(MAKEUP_SITUATION_FIXTURES.map(item => item.label).join(','), '일상,특별한 날,촬영,독특한 날', 'broad parent labels');
expectEqual(MAKEUP_SITUATION_FIXTURES.flatMap(item => item.keywords).every(item => item.kind === 'curated'), true, 'child options are situations rather than makeup styles');
expectEqual(MAKEUP_SITUATION_FIXTURES.flatMap(item => item.keywords).some(item => /메이크업|립|블러시|매트|글로우/.test(item.label)), false, 'makeup style names are removed from situation keywords');
expectEqual(new Set(MAKEUP_SITUATION_FIXTURES.map(item => item.key)).size, 4, 'situation keys are unique');
expectEqual(MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS.length, 12, 'twelve curated trend seeds');
expectEqual(MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT, 6, 'six editorial trends before more');
expectEqual(new Set(MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS.map(item => item.id)).size, 12, 'editorial trend ids are unique');
expectEqual(MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS[0]?.id, 'baseball-camera', 'baseball editorial trend leads');
expectEqual(MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS[1]?.id, 'wanghong-glass', 'wanghong editorial trend is restored');
const mixedTrends = getMakeupRecommendationEditorialTrends({
  generatedAt: '2026-07-17T00:00:00Z',
  source: 'fixture',
  situations: [...MAKEUP_SITUATION_FIXTURES],
});
expectEqual(mixedTrends.some(item => item.displayText === '출근·등교'), true, 'daily situation keyword can also appear as a user trend');
expectEqual(mixedTrends.some(item => item.displayText === '소개팅·데이트'), true, 'special-day situation keyword can also appear as a user trend');
expectEqual(mixedTrends.slice(0, 6).filter(item => item.keyword && item.situation).length, 4, 'initial trends mix four situation keywords with their parent context');
expectEqual(
  MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS.some(item => item.displayText.includes('SNS에 저장만 해둔')),
  true,
  'sentence-style editorial trend is available',
);
const selectedSituationState = makeupRecommendationDiscoveryReducer(
  {
    ...initialMakeupRecommendationDiscoveryState,
    selectedReportId: 'report-1',
    selectedKeywordId: 'old-keyword',
    customOpen: true,
    customSituationText: '이전 입력',
  },
  {type: 'situation/selected', situationId: 'fixture-formal_event'},
);
expectEqual(selectedSituationState.selectedReportId, 'report-1', 'report selection is preserved');
expectEqual(selectedSituationState.selectedKeywordId, null, 'changing parent clears child keyword');
expectEqual(selectedSituationState.customOpen, false, 'choosing parent closes custom composer');
expectEqual(selectedSituationState.customSituationText, '', 'choosing parent clears stale custom text');

const reports = [{id: 'latest'}, {id: 'route-report'}] as FaceAnalysisReport[];
const reportsState = makeupRecommendationDiscoveryReducer(
  initialMakeupRecommendationDiscoveryState,
  {type: 'reports/loaded', reports, preferredReportId: 'route-report'},
);
expectEqual(reportsState.selectedReportId, 'route-report', 'route report has selection priority');
const detailedRouteReport = {
  id: 'route-report',
  measurements: {
    captureId: 'capture-route',
    regionVisuals: {
      upper: {
        cropRect: {x: 0.3, y: 0.3, w: 0.4, h: 0.15},
        guide: {
          label: 'eye line',
          points: [{x: 0.4, y: 0.4}, {x: 0.6, y: 0.4}],
        },
      },
    },
    schemaVersion: 'aura-face-analysis-measurements-v1',
  },
} as FaceAnalysisReport;
const detailHydratedReportsState = makeupRecommendationDiscoveryReducer(
  reportsState,
  {type: 'report/detailLoaded', report: detailedRouteReport},
);
expectEqual(detailHydratedReportsState.reports[0]?.id, 'latest', 'detail hydration keeps list order');
expectEqual(detailHydratedReportsState.reports[1], detailedRouteReport, 'list item replaced by detail');
expectEqual(detailHydratedReportsState.selectedReportId, 'route-report', 'detail hydration keeps selection');
expectEqual(
  detailHydratedReportsState.reports[1]?.measurements?.regionVisuals?.upper?.guide.points.length,
  2,
  'list-to-detail hydration exposes region visuals',
);
const discoveryIndependentReports = [{id: 'report-a'}, {id: 'report-b'}] as FaceAnalysisReport[];
expectEqual(
  filterMakeupRecommendationReportsByDiscovery(discoveryIndependentReports).length,
  2,
  'catalog failure does not hide successfully loaded reports',
);
expectEqual(
  filterMakeupRecommendationReportsByDiscovery(discoveryIndependentReports, {
    source: 'fixture',
    sourceReportIds: [],
  }).length,
  2,
  'fixture discovery does not filter report API results',
);
const safelyFilteredReports = filterMakeupRecommendationReportsByDiscovery(discoveryIndependentReports, {
  source: 'api',
  sourceReportIds: ['report-b'],
});
expectEqual(safelyFilteredReports.length, 1, 'successful api discovery applies the ownership filter');
expectEqual(safelyFilteredReports[0]?.id, 'report-b', 'api discovery keeps only an allowed report');
expectEqual(
  isMakeupRecommendationReportAllowedByDiscovery('route-report'),
  true,
  'catalog failure does not block a route report lookup',
);
expectEqual(
  isMakeupRecommendationReportAllowedByDiscovery('route-report', {source: 'api', sourceReportIds: []}),
  false,
  'successful api discovery blocks a route report outside its safe list',
);

const customState = makeupRecommendationDiscoveryReducer(
  {...selectedSituationState, selectedKeywordId: 'date-keyword'},
  {type: 'custom/opened'},
);
expectEqual(customState.selectedSituationId, null, 'custom and parent situation are mutually exclusive');
expectEqual(customState.selectedKeywordId, null, 'custom and keyword are mutually exclusive');

expectEqual(getQuestionActionMode({currentQuestionIndex: 0, questionCount: 2}), 'advance', 'early question advances');
expectEqual(getQuestionActionMode({currentQuestionIndex: 1, questionCount: 2}), 'complete', 'last question completes');
expectEqual(getQuestionProgressSegments({currentQuestionIndex: 1, questionCount: 3}).join(','), 'complete,complete,pending', 'question progress');
expectEqual(makeupRecommendationHistoryCopy.title, '지난 추천', 'history title');
expectEqual(formatMakeupRecommendationHistoryDate('2026-07-14T12:34:56Z'), '2026. 07. 14.', 'history date');
expectEqual(shouldHandleMakeupRecommendationBack('discovery'), false, 'discovery back exits route');
expectEqual(shouldHandleMakeupRecommendationBack('question'), true, 'question back is handled');
expectEqual(shouldHandleMakeupRecommendationBack('results'), true, 'results back is handled');
expectEqual(shouldHandleMakeupRecommendationBack('history'), true, 'history back is handled');
expectEqual(
  getInitialMakeupRecommendationScreenPhase({initialView: 'discovery', reportId: 'report-9'}),
  'reportLoading',
  'direct saved report starts in neutral report loading',
);
expectEqual(
  getInitialMakeupRecommendationScreenPhase({initialView: 'history'}),
  'history',
  'history list preserves its requested initial view',
);
expectEqual(
  getInitialMakeupRecommendationScreenPhase({initialView: 'discovery', reportId: '   '}),
  'discovery',
  'blank report id does not enter report loading',
);
expectEqual(
  shouldHandleMakeupRecommendationBack('reportLoading', {directReportEntry: true}),
  false,
  'direct report loading back exits the native route',
);
expectEqual(
  shouldHandleMakeupRecommendationBack('results', {directReportEntry: true}),
  false,
  'direct report result back exits the native route',
);
expectEqual(
  shouldHandleMakeupRecommendationBack('results', {directReportEntry: false}),
  true,
  'history-selected report result back stays inside the recommendation flow',
);

const loadingContext = {
  answerKeywords: [
    {dimension: 'occasion' as const, label: '출근할 때'},
    {dimension: 'mood' as const, label: '맑고 단정하게'},
    {dimension: 'boldness' as const, label: '자연스럽게'},
    {dimension: 'timeSkill' as const, label: '10분 안에'},
  ],
  personalColor: '여름 쿨톤',
  prompt: '회사에서 자연스러운 메이크업',
  useProfile: true,
};
const loadingMessages = Array.from({length: 40}, (_, index) => getMakeupRecommendationAgentMessage(loadingContext, index));
expectEqual(loadingMessages.some(message => message.text.includes('맑고 단정하게')), true, 'loading includes mood answer');
expectEqual(loadingMessages.some(message => message.text.includes('10분 안에')), true, 'loading includes routine answer');
expectEqual(loadingMessages[39].text.length > 0, true, 'loading messages continue');

const screenSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx',
  'utf8',
);
const discoverySource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx',
  'utf8',
);
const editorialTrendSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/components/EditorialTrendSection.tsx',
  'utf8',
);
const situationCardSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/components/SituationCard.tsx',
  'utf8',
);
const situationCarouselSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/components/SituationCardGrid.tsx',
  'utf8',
);
const situationKeywordSheetSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/components/SituationKeywordSheet.tsx',
  'utf8',
);
const customSituationComposerSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/components/CustomSituationComposer.tsx',
  'utf8',
);
const analysisReportPickerSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/components/AnalysisReportPickerSheet.tsx',
  'utf8',
);
const loadingViewSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/screens/RecommendationAgentLoadingView.tsx',
  'utf8',
);
const reportLoadingViewSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/screens/RecommendationReportLoadingView.tsx',
  'utf8',
);
const recommendationServiceSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts',
  'utf8',
);
const backendApiSource = readFileSync(
  'apps/mobile/src/shared/services/backendApi.ts',
  'utf8',
);
expectEqual(
  discoverySource.includes('선택한 보고서 기반으로 추천메이크업이 생성됩니다'),
  true,
  'report helper copy is visible',
);
expectEqual(discoverySource.includes('>보고서 선택</Text>'), false, 'report section title is removed');
expectEqual(discoverySource.includes('>지난 추천</Text>'), false, 'history action is removed from discovery');
expectEqual(discoverySource.includes('>상황 선택</Text>'), true, 'situation section uses the concise title');
expectEqual(discoverySource.includes('사진을 넘겨보고, 지금 필요한 장면을 골라주세요.'), false, 'situation subtitle is removed');
expectEqual(discoverySource.includes('내 얼굴 기반 미리보기 생성'), false, 'personalized image checkbox copy is removed');
expectEqual(discoverySource.includes('accessibilityRole="checkbox"'), false, 'personalized image checkbox control is removed');
expectEqual(discoverySource.includes('<SituationKeywordSheet'), true, 'situation keyword selection uses a sheet');
expectEqual(discoverySource.includes('<TrendKeywordPanel'), false, 'situation keywords are not expanded inline');
expectEqual(discoverySource.includes('<EditorialTrendSection'), true, 'user trend pool stays on the main page');
expectEqual(editorialTrendSource.includes('>트렌드 메이크업</Text>'), true, 'trend section uses the requested title');
expectEqual(editorialTrendSource.includes('상황과 상관없이 끌리는 무드가 있다면 바로 골라보세요.'), false, 'trend section subtitle is removed');
expectEqual(situationCardSource.includes('scrim'), false, 'situation image has no black scrim');
expectEqual(situationCardSource.includes('rgba(17'), false, 'situation card has no dark overlay');
expectEqual(situationCarouselSource.includes('horizontal'), true, 'situations use a horizontal carousel');
expectEqual(situationCarouselSource.includes('snapToInterval'), true, 'situation carousel snaps by card');
expectEqual(situationCarouselSource.includes('width * 0.42'), true, 'situation cards use a compact carousel width');
expectEqual(situationCardSource.includes('aspectRatio: 1'), true, 'situation imagery uses a compact square frame');
expectEqual(situationKeywordSheetSource.includes('animationType="slide"'), true, 'situation keywords open in a sliding sheet');
expectEqual(situationKeywordSheetSource.includes('SITUATION MOOD'), false, 'situation sheet removes the English eyebrow');
expectEqual(situationKeywordSheetSource.includes('원하는 무드를 고르면'), false, 'situation sheet removes helper copy');
expectEqual(situationKeywordSheetSource.includes("flexWrap: 'wrap'"), true, 'situation options use wrapping chips');
expectEqual(situationKeywordSheetSource.includes('badgeLabels'), false, 'situation chips remove trend badges');
expectEqual(situationKeywordSheetSource.includes("rgba(17, 17, 17, 0.16)"), false, 'situation sheet has no dim backdrop');
expectEqual(situationKeywordSheetSource.includes("minHeight: '44%'"), true, 'situation sheet opens at a clearly visible height');
expectEqual(situationKeywordSheetSource.includes('backgroundColor: colors.background'), true, 'situation sheet uses an opaque surface');
expectEqual(situationKeywordSheetSource.includes('backgroundColor: colors.surfaceMuted'), true, 'situation options match editorial trend chips');
expectEqual(situationKeywordSheetSource.includes('borderColor: colors.borderStrong'), true, 'situation chips match editorial trend borders');
expectEqual(screenSource.includes("imageMode: 'personalized'"), true, 'recommendations always request a personalized image');
expectEqual(screenSource.includes('discovery.imageMode'), false, 'removed image toggle state cannot affect generation');
expectEqual(screenSource.includes('editorialPresetId: trend.id'), true, 'editorial trend uses a trusted reviewed preset id');
expectEqual(screenSource.includes('editorialPresetLabel: trend.displayText'), true, 'editorial trend keeps its display label');
expectEqual(screenSource.includes('editorialPresetPrompt: trend.seedPrompt'), true, 'editorial prompt remains recommendation context');
expectEqual(screenSource.includes('customSituationText: trend.seedPrompt'), false, 'editorial trend never masquerades as free-form user input');
expectEqual(screenSource.includes('keyword: trend.keyword'), true, 'overlapping trend keeps the original situation keyword');
expectEqual(screenSource.includes('situation: trend.situation'), true, 'overlapping trend keeps its parent situation');
expectEqual(screenSource.includes("forceFixture: discovery.catalog?.source === 'fixture'"), false, 'fixture catalog changes request provenance without forcing mock recommendation results');
expectEqual(screenSource.includes('discoverySource: discovery.catalog?.source'), true, 'selection requests carry explicit discovery provenance');
expectEqual(screenSource.includes('getMakeupRecommendationErrorDiagnostic'), false, 'backend validation codes are not rendered in user error copy');
expectEqual(screenSource.includes('providerCode'), false, 'provider diagnostics are not rendered in user error copy');
expectEqual(screenSource.includes('const isFinalQuestion = session.currentQuestionIndex >= session.questions.length - 1'), true, 'question flow detects the final answer');
expectEqual(screenSource.includes('if (isFinalQuestion) {'), true, 'intermediate answers do not replace the question with the full loading screen');
expectEqual(screenSource.includes('answerRequestInFlight.current'), true, 'question answers are guarded against duplicate taps');
expectEqual(screenSource.includes("setIsStarting(true);\n    setLoadingContext"), false, 'question preparation does not open the full agent loading view');
expectEqual(discoverySource.includes('맞춤 질문 준비 중'), false, 'question preparation removes the generic status copy');
expectEqual(discoverySource.includes('AURA_LETTERS'), true, 'AI custom question preparation reveals the AURA wordmark one letter at a time');
expectEqual(discoverySource.includes('showAuraLoading ? <AuraQuestionLoadingOverlay /> : null'), true, 'reviewed trend and keyword taps do not open the full AURA loader');
expectEqual(screenSource.includes("Boolean(lastStartInput.current?.customSituationText?.trim())"), true, 'only direct custom AI input opts into AURA preparation');
expectEqual(customSituationComposerSource.includes('<Modal'), true, 'custom situation uses a dedicated modal sheet');
expectEqual(customSituationComposerSource.includes("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"), true, 'custom sheet stays above iOS and Android keyboards');
expectEqual(customSituationComposerSource.includes('backgroundColor: colors.background'), true, 'custom sheet uses an opaque surface');
expectEqual(customSituationComposerSource.includes("rgba(17, 17, 17, 0.08)"), false, 'custom sheet has no dim backdrop');
expectEqual(analysisReportPickerSource.includes("rgba(17,17,17,0.42)"), false, 'report picker has no dim backdrop');
expectEqual(customSituationComposerSource.includes('autoFocus'), true, 'custom sheet focuses its visible input');
expectEqual(loadingViewSource.includes('const MESSAGE_INTERVAL_MS = 1500;'), true, 'short loading flow still advances through specialist messages');
expectEqual(screenSource.includes('export const MIN_AGENT_CONVERSATION_MS = 6_000;'), true, 'agent conversation has a short minimum without delaying completed results');
expectEqual(screenSource.includes('await waitForMinimumAgentConversation(loadingStartedAt, signal);'), true, 'result navigation waits for the minimum agent conversation');
expectEqual(screenSource.includes("imageStatus: 'failed', imageError: '이미지 상태 확인 실패'"), false, 'transient polling errors do not become terminal image failures');
expectEqual(loadingViewSource.includes('<Text style={styles.liveStatusText}>AURA 메이크업 크루</Text>'), false, 'final generation removes the status subtitle');
expectEqual(loadingViewSource.includes('선택한 답변과 얼굴 분석 사진을 함께 보며'), false, 'final generation removes the explanatory subtitle');
expectEqual(recommendationServiceSource.includes('export const MAKEUP_RECOMMENDATION_GENERATION_TIMEOUT_MS = 45_000;'), true, 'generation timeout is bounded above the backend fast-fallback budget');
expectEqual(recommendationServiceSource.includes('timeoutMs: MAKEUP_RECOMMENDATION_GENERATION_TIMEOUT_MS'), true, 'V2 generation uses the bounded timeout');
expectEqual(recommendationServiceSource.includes('timeoutMs: 90000'), false, 'obsolete ninety-second cutoff is removed');
expectEqual(screenSource.includes('isBackendTimeoutError'), true, 'generation timeout is treated as a resumable server-side operation');
expectEqual(screenSource.includes('isMakeupRecommendationGenerationRecoverable'), true, 'timeout and in-flight conflicts share session recovery');
expectEqual(backendApiSource.includes('export class BackendTimeoutError extends Error'), true, 'request timeout has a distinct recoverable error type');
expectEqual(backendApiSource.includes('throw new BackendTimeoutError(timeoutMs);'), true, 'request timeout preserves its cause for session recovery');
expectEqual(screenSource.includes('Promise.allSettled(['), true, 'catalog and reports load independently');
expectEqual(screenSource.includes('fetchMakeupRecommendationDiscovery(),'), true, 'catalog request participates in independent loading');
expectEqual(screenSource.includes('getFaceAnalysisReports({limit: 50}),'), true, 'report request always participates in independent loading');
expectEqual(screenSource.includes('getFaceAnalysisReportById(reportIdToHydrate)'), true, 'selected list report hydrates from detail API');
expectEqual(screenSource.includes("type: 'report/detailLoaded'"), true, 'hydrated detail replaces list summary');
expectEqual(screenSource.includes('reportRegionVisuals: sourceReport?.measurements?.regionVisuals'), true, 'result context receives region visuals');
expectEqual(screenSource.includes("setPhase('reportLoading')"), true, 'direct report fetch uses neutral loading');
expectEqual(screenSource.includes('<RecommendationReportLoadingView />'), true, 'neutral report loading renders separately');
expectEqual(
  screenSource.includes("prompt: '완성된 추천 메이크업 보고서를 불러오는 중이에요.'"),
  false,
  'saved report hydration never creates an analysis conversation context',
);
expectEqual(reportLoadingViewSource.includes('RecommendationAgentLoadingView'), false, 'neutral report loading cannot render the analysis conversation');
const showHydratedHistoryReportStart = screenSource.indexOf('const showHydratedHistoryReport');
const openHistoryReportStart = screenSource.indexOf('const openHistoryReport');
const directReportEffectStart = screenSource.indexOf('  useEffect(() => {', openHistoryReportStart);
const showHydratedHistoryReportSource = screenSource.slice(
  showHydratedHistoryReportStart,
  openHistoryReportStart,
);
const openHistoryReportSource = screenSource.slice(
  openHistoryReportStart,
  directReportEffectStart,
);
const directReportEffectSource = screenSource.slice(
  directReportEffectStart,
  screenSource.indexOf('const handleRefine'),
);
expectEqual(openHistoryReportSource.includes('refreshGeneratedMakeupRecommendation'), false, 'opening a fetched report does not immediately fetch it a second time');
expectEqual(openHistoryReportSource.includes('fetchGeneratedMakeupRecommendationReport('), true, 'history list item hydrates its omitted image metadata with one detail request');
expectEqual(openHistoryReportSource.includes("setPhase('loading')"), false, 'history list selection never opens the generation analysis loader');
expectEqual(
  directReportEffectSource.match(/fetchGeneratedMakeupRecommendationReport\(/g)?.length ?? 0,
  1,
  'direct report entry performs exactly one recommendation detail request',
);
expectEqual(directReportEffectSource.includes('getFaceAnalysisReportById(requestedReport.sourceAnalysisReportId)'), true, 'direct entry preloads the source photo before results');
expectEqual(directReportEffectSource.includes('.catch(() => null)'), true, 'source photo preload fails gracefully');
expectEqual(
  directReportEffectSource.includes('showHydratedHistoryReport(requestedReport, operation, preloadedSourceReport)'),
  true,
  'direct entry reuses both fetched detail payloads',
);
const preloadedSourceApplyIndex = showHydratedHistoryReportSource.indexOf(
  'if (preloadedSourceReport) applySourceReport(preloadedSourceReport)',
);
expectEqual(
  preloadedSourceApplyIndex >= 0
    && preloadedSourceApplyIndex < showHydratedHistoryReportSource.indexOf("setPhase('results')"),
  true,
  'preloaded source photo enters state before direct results render',
);
expectEqual(
  /if \(reportId\?\.trim\(\)\) return;\r?\n\s+void loadDiscoveryData\(\);/.test(screenSource),
  true,
  'direct saved report skips the unrelated discovery bootstrap',
);
expectEqual(
  showHydratedHistoryReportSource.includes('hydratedReportDetailIds.current.add(restored.sourceAnalysisReportId)'),
  true,
  'saved report source analysis detail is guarded against duplicate hydration',
);
expectEqual(
  screenSource.includes("if (reportId?.trim() || initialView === 'history') return undefined;"),
  true,
  'history list cannot be replaced by resumable generation session restoration',
);
expectEqual(screenSource.includes('completedReportIds'), false, 'catalog failure cannot mark reports unavailable');
expectEqual(screenSource.includes('.then(loadReports)'), false, 'reports are not chained after catalog loading');
const resultsSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsFinalScreen.tsx',
  'utf8',
);
const persistenceSource = readFileSync(
  'apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationSessionPersistence.ts',
  'utf8',
);[
  'makeup_recommendation_opened',
  'analysis_report_selected',
  'makeup_situation_selected',
  'makeup_keyword_selected',
  'custom_situation_submitted',
  'recommendation_question_answered',
  'recommendation_generation_started',
  'recommendation_text_completed',
  'recommendation_area_opened',
  'recommendation_ar_applied',
].forEach(eventName => {
  expectEqual(screenSource.includes(eventName), true, `${eventName} is wired to a screen action`);
});
expectEqual(
  screenSource.includes('takeNewMakeupRecommendationImageEvents'),
  true,
  'image completion and failure transitions are wired through the dedupe helper',
);
expectEqual(
  resultsSource.includes('onAreaOpened={area => onAreaOpened(area, model.sourceLook)}'),
  true,
  'area opening is wired from the final result guide',
);
[
  'readCurrentMakeupRecommendationSessionId',
  'fetchGeneratedMakeupRecommendationSessionV2',
  "restored.status === 'generating'",
  'waitForSessionRestorePoll',
  'pollGeneratingSession',
  'MAKEUP_SESSION_GENERATING',
  'MAKEUP_SESSION_STATE_CHANGED',
  'isBackendTimeoutError',
  'getMakeupRecommendationSessionRestoreDestination',
  "destination === 'retry'",
  '답변은 그대로 유지했으니 다시 시도해 주세요.',
  'saveCurrentMakeupRecommendationSessionId',
  'clearCurrentMakeupRecommendationSessionId',
].forEach(contract => {
  expectEqual(screenSource.includes(contract), true, `${contract} is wired into restart restoration`);
});
expectEqual(persistenceSource.includes('JSON.stringify'), false, 'session persistence never serializes context or answers');
expectEqual(persistenceSource.includes('setItem(MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, normalized)'), true, 'session persistence writes the opaque id only');
expectEqual(persistenceSource.includes("error.code === 'MAKEUP_SESSION_GENERATING'"), true, 'in-flight generation conflict preserves the resumable session id');
