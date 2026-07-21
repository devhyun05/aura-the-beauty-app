/// <reference types="node" />
import {readFileSync} from 'node:fs';

import type {RealtimeFaceCaptureLandmarkPayload} from '../../face-capture/components/RealtimeFaceCaptureNativeView';
import {
  evaluateMakeupFeedbackRealtimeQuality,
  MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS,
  type MakeupFeedbackRealtimeFailureReason,
} from '../../face-capture/services/makeupFeedbackRealtimeQuality';
import type {MakeupFeedbackPhotoSelection} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import {mapBackendJobToFeedbackOutcome} from './makeupFeedbackService';

type FramePatch = Omit<
  Partial<RealtimeFaceCaptureLandmarkPayload>,
  'cameraStability' | 'imageQuality' | 'mediaPipe'
> & {
  cameraStability?: Partial<NonNullable<RealtimeFaceCaptureLandmarkPayload['cameraStability']>>;
  imageQuality?: Partial<NonNullable<RealtimeFaceCaptureLandmarkPayload['imageQuality']>>;
  mediaPipe?: Partial<NonNullable<RealtimeFaceCaptureLandmarkPayload['mediaPipe']>>;
};

type CrossLayerFixture = {
  camera: {
    blockedCases: Array<{
      category: string;
      expectedReason: MakeupFeedbackRealtimeFailureReason;
      id: string;
      patch: FramePatch;
    }>;
    contractLimits: Record<string, number>;
    guide: {
      centerX: number;
      centerY: number;
      height: number;
      width: number;
    };
    passFrame: RealtimeFaceCaptureLandmarkPayload;
  };
  requestPayload: {
    feedbackContext: {originalGoalText: string};
    source: string;
  };
  selection: MakeupFeedbackPhotoSelection;
};

type BackendJob = Parameters<typeof mapBackendJobToFeedbackOutcome>[0];

function expect(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(label);
  }
}

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function applyFramePatch(
  base: RealtimeFaceCaptureLandmarkPayload,
  patch: FramePatch,
): RealtimeFaceCaptureLandmarkPayload {
  return {
    ...base,
    ...patch,
    cameraStability: {
      ...base.cameraStability,
      ...patch.cameraStability,
    },
    imageQuality: {
      ...base.imageQuality,
      ...patch.imageQuality,
    },
    mediaPipe: {
      ...base.mediaPipe,
      ...patch.mediaPipe,
      screenLandmarks: {
        ...base.mediaPipe?.screenLandmarks,
        ...patch.mediaPipe?.screenLandmarks,
      },
      status: patch.mediaPipe?.status ?? base.mediaPipe?.status ?? 'ok',
    },
  };
}

const [fixturePath, normalizedJobPath] = process.argv.slice(2);
expect(fixturePath, 'fixture path argument is required');
expect(normalizedJobPath, 'normalized backend job path argument is required');

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as CrossLayerFixture;
const normalizedJob = JSON.parse(readFileSync(normalizedJobPath, 'utf8')) as BackendJob;

for (const [key, expectedValue] of Object.entries(fixture.camera.contractLimits)) {
  const actualValue = MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS[
    key as keyof typeof MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS
  ];
  expectEqual(actualValue, expectedValue, `live camera limit ${key}`);
}

const passReport = evaluateMakeupFeedbackRealtimeQuality({
  analyzerAvailable: true,
  frame: fixture.camera.passFrame,
  guide: fixture.camera.guide,
});
expect(passReport.isCaptureEnabled, `PASS fixture blocked: ${passReport.failureReasons.join(', ')}`);
expectEqual(passReport.failureReasons.length, 0, 'PASS fixture failure count');

for (const blockedCase of fixture.camera.blockedCases) {
  const report = evaluateMakeupFeedbackRealtimeQuality({
    analyzerAvailable: true,
    frame: applyFramePatch(fixture.camera.passFrame, blockedCase.patch),
    guide: fixture.camera.guide,
  });

  expect(!report.isCaptureEnabled, `${blockedCase.id} unexpectedly enabled capture`);
  expect(
    report.failureReasons.includes(blockedCase.expectedReason),
    `${blockedCase.id}: expected ${blockedCase.expectedReason}, received ${report.failureReasons.join(', ')}`,
  );
}

expectEqual(fixture.selection.photoSource, 'camera', 'selection photo source');
expectEqual(fixture.requestPayload.source, 'camera', 'backend request source');
expectEqual(
  fixture.selection.feedbackContext?.originalGoalText,
  fixture.requestPayload.feedbackContext.originalGoalText,
  'selection/backend original goal',
);

const completed = mapBackendJobToFeedbackOutcome(normalizedJob, fixture.selection);
expectEqual(completed.analysisDecision, 'completed', 'mobile result decision');
if (completed.analysisDecision !== 'completed') {
  throw new Error('normalized backend job unexpectedly mapped to a retake');
}

expectEqual(completed.analysisSource, 'ai', 'mobile analysis source');
expectEqual(completed.analysisStatus, 'bedrock_completed', 'mobile analysis status');
expectEqual(
  completed.modelVersion,
  'makeup-feedback:bedrock-v10-expert-analytic-rubric',
  'model version',
);
expectEqual(completed.analysisId, 'makeup-feedback-cross-layer-job', 'canonical analysis id');
expectEqual(completed.analysisImageSize?.width, 1080, 'analysis image width');
expectEqual(completed.evidenceRegions?.length, 6, 'selected evidence region count');
expectEqual(
  completed.evaluations[0]?.observations?.[0]?.evidenceRegionIds?.join(','),
  'full,left_eye,right_eye',
  'eye observation evidence regions',
);
expectEqual(completed.score, 89, 'mobile score');
expectEqual(completed.scoreBreakdown?.axes.length, 4, 'four score axes');
expectEqual(
  completed.scoreBreakdown?.axes.flatMap(axis => axis.components ?? []).length,
  13,
  'thirteen analytic score components',
);
expectEqual(
  completed.scoreBreakdown?.formula.endsWith('= 89/100'),
  true,
  'explainable score formula',
);
expectEqual(completed.scoreConfidence, 'medium', '0.74 score confidence maps to medium');
expectEqual(completed.scoreEvidenceIds.length, 9, 'all score evidence ids survive mapping');
expectEqual(
  completed.points[0]?.correctionGuide?.tool,
  'Clean spoolie',
  'first improvement correction guide',
);
expectEqual(completed.captureQuality.usable, true, 'mobile capture quality');
expectEqual(completed.evaluations.length, MAKEUP_FEEDBACK_TOPICS.length, 'mobile topic count');
expectEqual(completed.evaluations.length, 11, '11-topic result count');
expectEqual(completed.evaluations.at(-1)?.topicId, 'lip', 'last mobile topic');
expectEqual(completed.photoSource, 'camera', 'completed photo source');
const statusByObservationId = new Map(
  completed.evaluations.flatMap(evaluation =>
    (evaluation.observations ?? []).map(
      observation => [observation.id, evaluation.status] as const,
    ),
  ),
);
for (const evidenceId of completed.scoreEvidenceIds) {
  const status = statusByObservationId.get(evidenceId);
  expect(
    status === 'strength' || status === 'improvement',
    `score evidence ${evidenceId} belongs to disallowed status ${String(status)}`,
  );
}
const expectedPointTopicIds = completed.evaluations
  .filter(
    evaluation =>
      evaluation.status === 'improvement' || evaluation.status === 'optional',
  )
  .map(evaluation => evaluation.topicId);
expectEqual(
  completed.points.map(point => point.topicId).join(','),
  expectedPointTopicIds.join(','),
  'coaching points merge improvement and optional statuses',
);
expectEqual(completed.summaryBadges.length, 2, 'two user-facing coaching summary counts');

const resultScreenSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackResultScreen.tsx',
  'utf8',
);
const redesignHomeSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/MakeupFeedbackRedesignHomeScreen.tsx',
  'utf8',
);
const redesignSlidesSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/MakeupFeedbackRedesignSlidesScreen.tsx',
  'utf8',
);
const redesignViewModelSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/makeupFeedbackResultViewModel.ts',
  'utf8',
);
const redesignAxisSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/FeedbackScoreAxisAccordion.tsx',
  'utf8',
);
const redesignHapticsSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/feedbackHaptics.ts',
  'utf8',
);
const feedbackRoutesSource = readFileSync(
  'apps/mobile/src/app/navigation/routes/makeupFeedbackRoutes.tsx',
  'utf8',
);
for (const hiddenCopy of [
  '선택 조정 포인트',
  '판단 불가 (',
  '비적용 (',
  '판단 어려움',
  '이번 목적과 무관',
]) {
  expect(
    !`${redesignHomeSource}${redesignSlidesSource}`.includes(hiddenCopy),
    `result screen exposes hidden copy: ${hiddenCopy}`,
  );
}
for (const hiddenScoreCopy of ['근거 범위', '점수 신뢰도']) {
  expect(
    !redesignHomeSource.includes(hiddenScoreCopy),
    `result screen exposes internal score metadata: ${hiddenScoreCopy}`,
  );
}
expect(
  !`${resultScreenSource}${redesignHomeSource}${redesignSlidesSource}`.includes(
    'modelVersion',
  ),
  'result screen exposes raw model version',
);
expect(
  resultScreenSource.includes('useMakeupFeedbackRedesignController') &&
    resultScreenSource.includes('<MakeupFeedbackRedesignHomeScreen') &&
    resultScreenSource.includes('<MakeupFeedbackRedesignSlidesScreen'),
  'all report entries must render through the redesign controller',
);
expect(
  redesignAxisSource.includes('axis.primaryEvidence') &&
    redesignAxisSource.includes('<FeedbackEvidenceImage') &&
    redesignAxisSource.includes('axis.jumpToEvaluationIndex') === false &&
    redesignAxisSource.includes('evidence.evaluationNumber'),
  'score axes must render resolved evidence and dynamic card targets',
);
expect(
  redesignHomeSource.includes('{axis.reason}') === false &&
    redesignAxisSource.includes('{axis.reason}') &&
    redesignAxisSource.includes('{item.note}'),
  'score axis reason and linked photo observation are missing',
);
expect(
  redesignAxisSource.includes('세부 점수') &&
    redesignAxisSource.includes('axis.components.map') &&
    redesignAxisSource.includes('component.reason'),
  'analytic component scores are missing from the expanded score axis',
);
expect(
  redesignViewModelSource.includes('isUserVisibleEvaluation') &&
    redesignViewModelSource.includes("evaluation.status === 'strength'") &&
    redesignViewModelSource.includes("evaluation.status === 'improvement'") &&
    redesignViewModelSource.includes("evaluation.status === 'optional'") &&
    !`${redesignHomeSource}${redesignSlidesSource}`.includes('not_assessable') &&
    !`${redesignHomeSource}${redesignSlidesSource}`.includes('not_applicable'),
  'redesign must keep audit-only statuses out of user-facing cards',
);
expect(
  redesignViewModelSource.includes('axis.evidenceIds.flatMap') &&
    redesignViewModelSource.includes('observationById.get(evidenceId)') &&
    redesignViewModelSource.includes('jumpToEvaluationIndex'),
  'redesign bypasses the grounded axis evidence join',
);
expect(
  resultScreenSource.includes('onHeaderShareActionChange?.(handleOpenShareOptions)') &&
    redesignHomeSource.includes('<OptionalViewShot') &&
    redesignHomeSource.includes('ref={captureRef}') &&
    redesignHomeSource.includes('displayedScore = isShareBusy ? vm.score') &&
    redesignHomeSource.includes('visibleGroups = isShareBusy ? vm.groups') &&
    redesignHomeSource.includes("selectedTab = isShareBusy ? 'all'") &&
    resultScreenSource.includes('onOpenRecord={onOpenMakeupJourney}'),
  'header sharing, report capture, or makeup journey navigation was disconnected',
);
expect(
  redesignHomeSource.indexOf('<OptionalViewShot') <
      redesignHomeSource.indexOf('</OptionalViewShot>') &&
    redesignHomeSource.indexOf('</OptionalViewShot>') <
      redesignHomeSource.indexOf('<View style={styles.actionSection}>') &&
    redesignHomeSource.includes('pointerEvents={isShareBusy ? \'none\' : \'auto\'}'),
  'share capture must contain the complete report while keeping live actions outside the image',
);
expect(
  redesignHomeSource.includes('accessibilityLabel="분석에 사용한 메이크업 사진"'),
  'feedback photo accessibility label is missing',
);
expect(
  redesignSlidesSource.includes("evaluation.status === 'strength'") &&
    redesignSlidesSource.includes("evaluation.status === 'optional'") &&
    redesignSlidesSource.includes('evaluation.visibilityReason'),
  'detail cards do not preserve strengths, optional notes, and assessment limits',
);
expect(
  redesignSlidesSource.includes('evaluation.confidence < 0.6') &&
    redesignSlidesSource.includes('판독 신뢰도 낮음') &&
    redesignSlidesSource.includes('가볍게 참고해 주세요') &&
    redesignAxisSource.includes('이 점수는 특정 확대 부위와 연결되지 않았어요'),
  'low-confidence and no-evidence states are not represented safely',
);
expect(
  redesignSlidesSource.includes('guide.chips.map') &&
    redesignSlidesSource.includes('guide.rows.map') &&
    redesignSlidesSource.includes('guide.instructions.map'),
  'correction guide fields are not fully rendered',
);
expect(
  redesignViewModelSource.includes('goalCriterionById') &&
    redesignSlidesSource.includes('evaluation.goalCriteria.map') &&
    redesignHomeSource.includes('{vm.scoreFormula}') &&
    redesignAxisSource.includes('axis.evidence.map'),
  'redesign dropped goal criteria, score formula, or multi-evidence explanations',
);
expect(
  redesignAxisSource.includes('withTiming(isOpen ? 1 : 0') &&
    redesignAxisSource.includes('reduceMotion') &&
    redesignAxisSource.includes('chevronAnimatedStyle') &&
    redesignAxisSource.includes('bodyAnimatedStyle'),
  'redesign dropped the reduce-motion-aware accordion and chevron animation',
);
expect(
  redesignHapticsSource.includes('NotificationFeedbackType.Success') &&
    redesignHapticsSource.includes('NotificationFeedbackType.Error') &&
    resultScreenSource.includes('feedbackHaptics.success()') &&
    resultScreenSource.includes('feedbackHaptics.error()'),
  'share and save outcomes do not provide the handoff notification feedback',
);
expect(
  /headerButton:\s*\{[\s\S]*?minHeight:\s*44/.test(redesignAxisSource) &&
    /jumpButton:\s*\{[\s\S]*?minHeight:\s*44/.test(redesignAxisSource) &&
    /summaryLinkButton:\s*\{[\s\S]*?minHeight:\s*44/.test(redesignHomeSource) &&
    /tab:\s*\{[\s\S]*?minHeight:\s*44/.test(redesignHomeSource) &&
    /regionChipHitArea:\s*\{[\s\S]*?minHeight:\s*44/.test(redesignSlidesSource) &&
    /summaryIconAction:\s*\{[\s\S]*?height:\s*44[\s\S]*?width:\s*44/.test(
      redesignSlidesSource,
    ),
  'redesign interaction targets must remain at least 44 points',
);
expect(
  feedbackRoutesSource.includes("actionLabel={reportLoadError ? '다시 시도' : undefined}") &&
    feedbackRoutesSource.includes('handleRetryReportLoad') &&
    feedbackRoutesSource.includes('reportLoadRevision'),
  'stored report loading errors do not expose a retry action',
);
expect(
  !resultScreenSource.includes('mockMakeupFeedbackResultService') &&
    !resultScreenSource.includes('placehold.co'),
  'production report screen still defaults to mock data',
);
expect(redesignHomeSource.includes('잘한 점'), 'result screen is missing the strength takeaway');
expect(redesignHomeSource.includes('먼저 보완할 점'), 'result screen is missing the correction takeaway');

console.log(
  `Makeup feedback cross-layer contract verified: PASS + ${fixture.camera.blockedCases.length} blocked camera fixtures -> normalized 11-topic mobile result.`,
);
