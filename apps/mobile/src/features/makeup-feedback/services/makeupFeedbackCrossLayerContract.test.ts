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
expectEqual(completed.modelVersion, 'makeup-feedback:bedrock-v7-korean-goal-copy', 'model version');
expectEqual(completed.analysisId, 'makeup-feedback-cross-layer-job', 'canonical analysis id');
expectEqual(completed.analysisImageSize?.width, 1080, 'analysis image width');
expectEqual(completed.evidenceRegions?.length, 6, 'selected evidence region count');
expectEqual(
  completed.evaluations[0]?.observations?.[0]?.evidenceRegionIds?.join(','),
  'left_eye,right_eye',
  'eye observation evidence regions',
);
expectEqual(completed.score, 89, 'mobile score');
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
for (const hiddenCopy of ['예상 범위', '선택 조정 포인트', '판단 불가 (', '비적용 (']) {
  expect(
    !resultScreenSource.includes(hiddenCopy),
    `result screen exposes hidden copy: ${hiddenCopy}`,
  );
}
expect(
  !resultScreenSource.includes('모델 {result.modelVersion}'),
  'result screen exposes raw model version',
);
expect(
  resultScreenSource.includes('<Text style={styles.overallJudgmentLabel}>종합 판단</Text>'),
  'score reason is missing its single overall judgment label',
);
expect(
  resultScreenSource.includes('AI가 함께 확인한 영역') &&
    resultScreenSource.includes('<EvidenceRegionStrip'),
  'result screen is missing the evidence region crop UI',
);
expect(
  resultScreenSource.includes('{result.scoreReason}'),
  'score reason is missing from the overall judgment block',
);
for (const hiddenSummarySource of [
  'AI 요약',
  'result.summary.strengthSummary',
  'result.summary.improvementSummary',
  'result.interpretedGoal.reason',
  'criterion.derivedFrom',
]) {
  expect(
    !resultScreenSource.includes(hiddenSummarySource),
    `result screen exposes duplicate or raw analysis summary: ${hiddenSummarySource}`,
  );
}
for (const localizedIntensity of ['은은한 표현', '균형 잡힌 표현', '또렷한 표현']) {
  expect(
    resultScreenSource.includes(localizedIntensity),
    `result screen is missing localized intensity: ${localizedIntensity}`,
  );
}
expect(
  resultScreenSource.includes('getGoalIntensityLabel(result.interpretedGoal.intensity)'),
  'result screen bypasses the localized goal intensity label',
);
expect(
  !resultScreenSource.includes('>{result.interpretedGoal.intensity}<'),
  'result screen exposes a raw goal intensity enum',
);
expectEqual(
  resultScreenSource.match(/useState<Set<string>>\(/g)?.length ?? 0,
  2,
  'strength and improvement accordions use independent Set state',
);
expect(!resultScreenSource.includes('firstStrengthId'), 'strength accordion opens by default');
expect(!resultScreenSource.includes('firstPointId'), 'improvement accordion opens by default');
expect(
  resultScreenSource.includes('setOpenStrengthIds(new Set<string>());') &&
    resultScreenSource.includes('setOpenPointIds(new Set<string>());'),
  'accordion state is not reset when the result changes',
);
expect(
  resultScreenSource.includes('nextIds.add(strength.id)') &&
    resultScreenSource.includes('nextIds.delete(strength.id)'),
  'strength items cannot be independently toggled',
);
expect(
  resultScreenSource.includes('nextIds.add(point.id)') &&
    resultScreenSource.includes('nextIds.delete(point.id)'),
  'improvement items cannot be independently toggled',
);
expectEqual(
  resultScreenSource.match(/accessibilityState=\{\{expanded: isOpen\}\}/g)?.length ?? 0,
  2,
  'both accordion item types expose their expanded accessibility state',
);
expect(
  resultScreenSource.includes('accessibilityLabel="분석에 사용한 메이크업 사진"'),
  'feedback photo accessibility label is missing',
);
expect(
  resultScreenSource.includes('accessibilityState={{busy: isActive, disabled: isDisabled}}'),
  'share action accessibility state is missing',
);
expect(
  !resultScreenSource.includes('getScoreConfidenceLabel'),
  'capture color confidence is mislabeled as score confidence',
);
expect(resultScreenSource.includes('잘한 점'), 'result screen is missing strengths section');
expect(resultScreenSource.includes('보완할 점'), 'result screen is missing improvement section');

console.log(
  `Makeup feedback cross-layer contract verified: PASS + ${fixture.camera.blockedCases.length} blocked camera fixtures -> normalized 11-topic mobile result.`,
);
