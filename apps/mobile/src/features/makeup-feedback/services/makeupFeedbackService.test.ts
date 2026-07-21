import {readFileSync} from 'node:fs';

import {BackendApiError} from '../../../shared/services/backendApi';
import type {MakeupFeedbackPhotoSelection} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import {
  getPriorityMakeupFeedbackEvaluation,
  getPriorityMakeupFeedbackPoint,
} from './makeupFeedbackResultPresentation';
import {
  assertCreatedFeedbackJobJourneyContext,
  buildMakeupFeedbackJobCreateBody,
  getMakeupFeedbackAnalysisErrorAction,
  getMakeupFeedbackAnalysisErrorMessage,
  mapBackendReportsToFeedbackResults,
  mapBackendJobToFeedbackOutcome as mapBackendJobToFeedbackResult,
} from './makeupFeedbackService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getMakeupFeedbackAnalysisErrorMessage(
    new BackendApiError('Backend request failed with HTTP 500.', 500),
  ),
  '서버에서 사진 분석을 시작하지 못했어요. 잠시 후 다시 시도하거나 다른 사진을 선택해 주세요.',
  'generic backend 500 is hidden from the user',
);

expectEqual(
  getMakeupFeedbackAnalysisErrorMessage(
    new BackendApiError('입력한 메이크업 목적을 조금 더 구체적으로 적어 주세요.', 400),
  ),
  '입력한 메이크업 목적을 조금 더 구체적으로 적어 주세요.',
  'actionable backend validation message is preserved',
);

for (const code of [
  'FEEDBACK_GOAL_INVALID',
  'FEEDBACK_GOAL_NEEDS_DETAIL',
  'FEEDBACK_GOAL_GUARDRAIL_BLOCKED',
]) {
  expectEqual(
    getMakeupFeedbackAnalysisErrorAction(
      new BackendApiError('메이크업 목적을 다시 확인해 주세요.', 400, code),
    ),
    'edit_goal',
    `${code} opens goal editing`,
  );
}

expectEqual(
  getMakeupFeedbackAnalysisErrorAction(
    new BackendApiError('Backend request failed with HTTP 500.', 500),
  ),
  'retry',
  'server errors remain retryable',
);

expectEqual(
  getMakeupFeedbackAnalysisErrorAction(new Error('Network request failed')),
  'retry',
  'network errors remain retryable',
);

function expectBackendError(
  action: () => void,
  code: string,
  label: string,
  expectedField?: string,
) {
  try {
    action();
  } catch (error) {
    if (error instanceof BackendApiError && error.code === code) {
      if (expectedField) {
        expectEqual(error.details?.field, expectedField, `${label} field`);
      }
      return;
    }

    throw error;
  }

  throw new Error(`${label}: expected ${code}`);
}

const selection = {
  imageUri: 'file:///makeup-feedback.jpg',
  photoSource: 'camera',
} satisfies MakeupFeedbackPhotoSelection;

const initialJobBody = buildMakeupFeedbackJobCreateBody(
  {...selection, entryDate: '2026-07-17'},
  {mediaId: 'media-1', photoCaptureId: 'capture-1'},
);
expectEqual(initialJobBody.entryDate, '2026-07-17', 'initial job entry date');
expectEqual(initialJobBody.feedbackKind, 'initial', 'initial job kind default');
expectEqual(initialJobBody.parentFeedbackReportId, null, 'initial job has no parent');
assertCreatedFeedbackJobJourneyContext(
  {
    entryDate: initialJobBody.entryDate,
    feedbackKind: initialJobBody.feedbackKind,
    parentFeedbackReportId: initialJobBody.parentFeedbackReportId,
  },
  initialJobBody,
);
expectBackendError(
  () => assertCreatedFeedbackJobJourneyContext(
    {
      entryDate: initialJobBody.entryDate,
      feedbackKind: initialJobBody.feedbackKind,
    },
    initialJobBody,
  ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'initial create response requires an explicit null parent',
  'job.parentFeedbackReportId',
);

const correctionJobBody = buildMakeupFeedbackJobCreateBody(
  {
    ...selection,
    entryDate: '2026-07-12',
    feedbackContext: {userGoalText: '차분한 데일리 메이크업'},
    feedbackKind: 'correction',
    parentFeedbackReportId: 'report-parent',
  },
  {mediaId: 'media-2', photoCaptureId: 'capture-2'},
);
expectEqual(correctionJobBody.entryDate, '2026-07-12', 'correction entry date');
expectEqual(correctionJobBody.feedbackKind, 'correction', 'correction job kind');
expectEqual(
  correctionJobBody.parentFeedbackReportId,
  'report-parent',
  'correction parent report',
);
expectEqual(
  correctionJobBody.requestPayload.feedbackContext.userGoalText,
  '차분한 데일리 메이크업',
  'correction inherited goal context',
);
assertCreatedFeedbackJobJourneyContext(
  {
    entryDate: correctionJobBody.entryDate,
    feedbackKind: correctionJobBody.feedbackKind,
    parentFeedbackReportId: correctionJobBody.parentFeedbackReportId,
  },
  correctionJobBody,
);
expectBackendError(
  () => assertCreatedFeedbackJobJourneyContext(
    {
      entryDate: correctionJobBody.entryDate,
      feedbackKind: 'initial',
      parentFeedbackReportId: null,
    },
    correctionJobBody,
  ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'create response preserves journey contract',
  'job.feedbackKind',
);

const evaluations = MAKEUP_FEEDBACK_TOPICS.map((topic, index) => ({
  actionSteps:
    index === 7
      ? []
      : [`Apply ${topic.id} step one.`, `Apply ${topic.id} step two.`],
  confidence: 0.9,
  description: `${topic.id} description`,
  goalCriterionIds: ['goal-1'],
  id: `${topic.id}-evaluation`,
  observations: [
    {
      claim: `${topic.id} is visible.`,
      evidenceLocation: `${topic.id} area`,
      id: `${topic.id}-observation-1`,
      lightingSensitive: false,
    },
  ],
  scoreImpact: index < 2 ? 'high' : 'medium',
  status: index < 3 ? 'improvement' : index < 8 ? 'strength' : 'optional',
  title: `${topic.id} title`,
  topicId: topic.id,
  topicLabel: topic.label,
  visibility: 'clear',
  visibilityReason: null,
}));

const validJob = {
  entryDate: '2026-07-17',
  feedbackPayload: {
    analysisStatus: 'bedrock_completed',
    result: {
      analysisDecision: 'completed',
      captureQuality: {
        colorConfidence: 'high',
        detectorAvailable: true,
        issues: [],
        usable: true,
      },
      evaluations,
      interpretedGoal: {
        assumptions: [],
        dynamicCriteria: [
          {
            criterion: 'Match the requested balanced daily look.',
            derivedFrom: 'Balanced everyday makeup',
            id: 'goal-1',
            sourceType: 'explicit_user_goal',
          },
        ],
        explicitFacts: ['The user requested balanced everyday makeup.'],
        intensity: 'medium',
        label: 'Daily makeup',
        reason: '사진에서 표현이 관찰되어 medium으로 요약했습니다.',
        unknowns: [],
      },
      modelVersion: 'bedrock:model-v1',
      score: 91,
      scoreConfidence: 0.75,
      scoreEvidenceIds: ['brow-observation-1'],
      scoreRange: [88, 94],
      scoreReason: 'The base and color balance are consistent.',
      summary: {
        improvementSummary: 'Refine three areas.',
        strengthSummary: 'Five areas are balanced.',
      },
    },
  },
  id: 'feedback-job-1',
  sourceLabel: 'Captured photo',
  status: 'completed',
} satisfies Parameters<typeof mapBackendJobToFeedbackResult>[0];

const mappedResult = mapBackendJobToFeedbackResult(validJob, selection);
if (mappedResult.analysisDecision !== 'completed') {
  throw new Error('valid completed result was mapped as retake');
}

expectEqual(
  getPriorityMakeupFeedbackEvaluation(mappedResult.evaluations)?.topicId,
  'brow',
  'first high-impact improvement is the immediate correction',
);
expectEqual(
  getPriorityMakeupFeedbackEvaluation(
    mappedResult.evaluations.map(evaluation => ({
      ...evaluation,
      scoreImpact: evaluation.topicId === 'lens' ? 'high' : 'low',
    })),
  )?.topicId,
  'lens',
  'higher-impact item wins within the improvement group',
);
expectEqual(
  getPriorityMakeupFeedbackPoint(mappedResult.evaluations, mappedResult.points)?.evaluationId,
  mappedResult.evaluations[0]?.id,
  'priority point uses the exact evaluation id',
);


expectEqual(mappedResult.analysisSource, 'ai', 'analysis source');
expectEqual(mappedResult.analysisStatus, 'bedrock_completed', 'analysis status');
expectEqual(mappedResult.entryDate, '2026-07-17', 'completed result preserves its journey date');
expectEqual(mappedResult.modelVersion, 'bedrock:model-v1', 'model version');
expectEqual(mappedResult.score, 91, 'score');
expectEqual(mappedResult.interpretedGoal.intensity, 'medium', 'intensity enum remains unchanged');
expectEqual(
  mappedResult.interpretedGoal.dynamicCriteria[0]?.sourceType,
  'explicit_user_goal',
  'server-owned criterion source type is preserved',
);
expectEqual(
  mappedResult.interpretedGoal.reason,
  '사진에서 표현이 관찰되어 적당한 강도로 요약했습니다.',
  'user-facing intensity is localized',
);
expectEqual(mappedResult.scoreReason, validJob.feedbackPayload.result.scoreReason, 'score reason');
expectEqual(mappedResult.evaluations.length, MAKEUP_FEEDBACK_TOPICS.length, 'topic count');
expectEqual(mappedResult.evaluations.at(-1)?.topicId, 'lip', 'lip topic');
expectEqual(mappedResult.evaluations[0]?.actionSteps.length, 2, 'action step count');
expectEqual(mappedResult.evaluations[7]?.actionSteps.length, 0, 'empty action steps accepted');
expectEqual(mappedResult.scoreConfidence, 'high', '0.75 confidence maps to high');
expectEqual(mappedResult.points.length, 6, 'improvements and optional refinements merge into points');
expectEqual(
  mappedResult.points[0]?.evaluationId,
  mappedResult.evaluations[0]?.id,
  'coaching point preserves its evaluation id for exact priority matching',
);
expectEqual(mappedResult.scoreBreakdown, undefined, 'legacy result omits score breakdown');
expectEqual(
  mappedResult.points[0]?.correctionGuide,
  undefined,
  'legacy coaching point omits correction guide',
);
expectEqual(
  mappedResult.points.some(point => point.topicId === 'lip'),
  true,
  'optional topic is exposed through coaching points',
);
expectEqual(mappedResult.summaryBadges.length, 2, 'only two user-facing summary badges');
expectEqual(
  mappedResult.summaryBadges.some(badge =>
    ['optional-count', 'not-assessable-count', 'not-applicable-count'].includes(badge.id),
  ),
  false,
  'internal statuses are omitted from user-facing badges',
);

const correctionGuide = {
  amount: '브러시 끝에 한 번 가볍게 묻힌 양',
  coverage: '눈꼬리에서 바깥쪽 3분의 1 범위',
  steps: ['브러시에 남은 양을 손등에 한 번 덜어냅니다.', '눈꼬리부터 짧게 연결합니다.'],
  stopCondition: '정면에서 라인 끝이 속눈썹 방향과 자연스럽게 이어질 때 멈춥니다.',
  targetArea: '오른쪽 눈꼬리와 왼쪽 눈꼬리 끝',
  tool: '납작한 아이라인 브러시',
  why: '양쪽 라인의 끝 방향을 맞추면 얼굴 전체의 시선 흐름이 정돈됩니다.',
};
const v2Evaluations = evaluations.map(evaluation =>
  evaluation.status === 'improvement' || evaluation.status === 'optional'
    ? {...evaluation, correctionGuide}
    : evaluation,
);
const v2ScoreBreakdown = {
  axes: [
    {
      evidenceIds: ['foundation-observation-1'],
      id: 'application-finish',
      label: '적용 완성도',
      maxScore: 30,
      reason: '경계와 피부 표현이 대부분 정돈됐어요.',
      score: 28,
    },
    {
      evidenceIds: ['brow-observation-1'],
      id: 'placement-balance',
      label: '배치·형태 균형',
      maxScore: 25,
      reason: '주요 선과 면의 위치가 얼굴 구조에 안정적으로 놓였어요.',
      score: 23,
    },
    {
      evidenceIds: ['eyeliner-observation-1'],
      id: 'color-value-harmony',
      label: '색·명암 조화',
      maxScore: 20,
      reason: '색과 명암의 연결이 자연스러워요.',
      score: 18,
    },
    {
      evidenceIds: ['eyeshadow-observation-1'],
      id: 'overall-goal-fit',
      label: '전체 조화·목표 적합도',
      maxScore: 25,
      reason: '요청한 분위기와 전체 인상이 잘 맞아요.',
      score: 22,
    },
  ],
  formula: '적용 완성도 28/30 + 배치·형태 균형 23/25 + 색·명암 조화 18/20 + 전체 조화·목표 적합도 22/25 = 91/100',
  maxScore: 100,
};
const analyticComponentsByAxis = [
  [
    {
      evidenceIds: ['foundation-observation-1'],
      id: 'base-finish',
      label: '베이스 도포·균일도',
      maxScore: 8,
      reason: '베이스가 대체로 균일하게 표현됐어요.',
      score: 8,
    },
    {
      evidenceIds: ['foundation-observation-1'],
      id: 'brow-eye-finish',
      label: '눈썹·아이 정교함',
      maxScore: 9,
      reason: '눈썹과 아이 메이크업 경계가 정돈됐어요.',
      score: 8,
    },
    {
      evidenceIds: ['foundation-observation-1'],
      id: 'cheek-finish',
      label: '치크·윤곽 블렌딩',
      maxScore: 7,
      reason: '치크와 윤곽 경계가 자연스럽게 연결돼요.',
      score: 6,
    },
    {
      evidenceIds: ['foundation-observation-1'],
      id: 'lip-finish',
      label: '립 라인·채움·마감',
      maxScore: 6,
      reason: '립 라인과 채움이 안정적이에요.',
      score: 6,
    },
  ],
  [
    {
      evidenceIds: ['brow-observation-1'],
      id: 'bilateral-balance',
      label: '좌우 대칭·균형',
      maxScore: 10,
      reason: '좌우 형태가 비교적 균형을 이뤄요.',
      score: 10,
    },
    {
      evidenceIds: ['brow-observation-1'],
      id: 'landmark-placement',
      label: '랜드마크 기준 배치',
      maxScore: 10,
      reason: '주요 표현이 얼굴 구조에 맞게 배치됐어요.',
      score: 9,
    },
    {
      evidenceIds: ['brow-observation-1'],
      id: 'visual-weight',
      label: '부위 간 시각적 비중',
      maxScore: 5,
      reason: '부위별 시각적 비중이 과도하게 쏠리지 않았어요.',
      score: 4,
    },
  ],
  [
    {
      evidenceIds: ['eyeliner-observation-1'],
      id: 'relative-contrast',
      label: '상대 채도·명도·대비',
      maxScore: 8,
      reason: '부위 간 대비가 안정적이에요.',
      score: 7,
    },
    {
      evidenceIds: ['eyeliner-observation-1'],
      id: 'color-continuity',
      label: '피부·치크·립 색 연결',
      maxScore: 7,
      reason: '피부와 색조의 연결이 자연스러워요.',
      score: 6,
    },
    {
      evidenceIds: ['eyeliner-observation-1'],
      id: 'finish-coherence',
      label: '마감·질감 일관성',
      maxScore: 5,
      reason: '부위별 마감 질감이 일관돼요.',
      score: 5,
    },
  ],
  [
    {
      evidenceIds: ['eyeshadow-observation-1'],
      id: 'full-face-coherence',
      label: '얼굴 전체 내부 조화',
      maxScore: 10,
      reason: '얼굴 전체 표현이 하나의 방향으로 연결돼요.',
      score: 9,
    },
    {
      evidenceIds: ['eyeshadow-observation-1'],
      id: 'focal-hierarchy',
      label: '시각적 중심·위계',
      maxScore: 7,
      reason: '시각적 중심이 명확하게 형성됐어요.',
      score: 6,
    },
    {
      evidenceIds: ['eyeshadow-observation-1'],
      id: 'explicit-goal-fit',
      label: '명시 목표 적합도',
      maxScore: 8,
      reason: '사용자가 명시한 목적에 부합해요.',
      score: 7,
    },
  ],
];
const v10ScoreBreakdown = {
  ...v2ScoreBreakdown,
  axes: v2ScoreBreakdown.axes.map((axis, index) => ({
    ...axis,
    components: analyticComponentsByAxis[index],
  })),
};

const v2Outcome = mapBackendJobToFeedbackResult(
  {
    ...validJob,
    feedbackPayload: {
      ...validJob.feedbackPayload,
      result: {
        ...validJob.feedbackPayload.result,
        evaluations: v2Evaluations,
        scoreBreakdown: v2ScoreBreakdown,
      },
    },
  },
  selection,
);
if (v2Outcome.analysisDecision !== 'completed') {
  throw new Error('v2 result unexpectedly requested a retake');
}
expectEqual(v2Outcome.scoreBreakdown?.axes.length, 4, 'v2 score axis count');
expectEqual(v2Outcome.scoreBreakdown?.axes[0]?.score, 28, 'v2 axis earned score');
expectEqual(v2Outcome.scoreBreakdown?.axes[0]?.maxScore, 30, 'v2 axis max score');
expectEqual(v2Outcome.scoreBreakdown?.formula, v2ScoreBreakdown.formula, 'v2 formula');
expectEqual(
  v2Outcome.points[0]?.correctionGuide?.tool,
  correctionGuide.tool,
  'v2 correction guide is copied to coaching point',
);

const explainableModelVersion = 'makeup-feedback:bedrock-v9-explainable-coaching';
const v9Job = {
  ...validJob,
  feedbackPayload: {
    ...validJob.feedbackPayload,
    result: {
      ...validJob.feedbackPayload.result,
      evaluations: v2Evaluations,
      modelVersion: explainableModelVersion,
      scoreBreakdown: v2ScoreBreakdown,
    },
  },
};
const v9Outcome = mapBackendJobToFeedbackResult(v9Job, selection);
if (v9Outcome.analysisDecision !== 'completed') {
  throw new Error('v9 result unexpectedly requested a retake');
}
expectEqual(v9Outcome.modelVersion, explainableModelVersion, 'v9 model version');
expectEqual(v9Outcome.scoreBreakdown?.axes.length, 4, 'stored v9 score breakdown');
expectEqual(
  v9Outcome.points[0]?.correctionGuide?.stopCondition,
  correctionGuide.stopCondition,
  'stored v9 correction guide survives detail mapping',
);

const analyticRubricModelVersion =
  'makeup-feedback:bedrock-v10-expert-analytic-rubric';
const v10Job = {
  ...v9Job,
  modelVersion: analyticRubricModelVersion,
  feedbackPayload: {
    ...v9Job.feedbackPayload,
    result: {
      ...v9Job.feedbackPayload.result,
      modelVersion: analyticRubricModelVersion,
      scoreBreakdown: v10ScoreBreakdown,
    },
  },
};
const v10Outcome = mapBackendJobToFeedbackResult(v10Job, selection);
if (v10Outcome.analysisDecision !== 'completed') {
  throw new Error('v10 result unexpectedly requested a retake');
}
expectEqual(
  v10Outcome.modelVersion,
  analyticRubricModelVersion,
  'v10 model version',
);
expectEqual(v10Outcome.scoreBreakdown?.axes.length, 4, 'stored v10 score breakdown');
expectEqual(
  v10Outcome.scoreBreakdown?.axes.flatMap(axis => axis.components ?? []).length,
  13,
  'v10 maps all analytic score components',
);
expectEqual(
  v10Outcome.scoreBreakdown?.axes[0]?.components?.[0]?.label,
  '베이스 도포·균일도',
  'v10 maps the exact component contract',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...v10Job,
        feedbackPayload: {
          ...v10Job.feedbackPayload,
          result: {
            ...v10Job.feedbackPayload.result,
            scoreBreakdown: v2ScoreBreakdown,
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'v10 requires analytic components while v9 remains compatible without them',
  'scoreBreakdown.axes[0].components',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...v10Job,
        feedbackPayload: {
          ...v10Job.feedbackPayload,
          result: {
            ...v10Job.feedbackPayload.result,
            scoreBreakdown: {
              ...v10ScoreBreakdown,
              axes: v10ScoreBreakdown.axes.map((axis, axisIndex) => ({
                ...axis,
                components: (axis.components ?? []).map(
                  (component, componentIndex) =>
                    axisIndex === 0 && componentIndex === 0
                      ? {...component, score: component.score - 1}
                      : component,
                ),
              })),
            },
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'v10 component scores must sum to the axis score',
  'scoreBreakdown.axes[0].components',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...v10Job,
        feedbackPayload: {
          ...v10Job.feedbackPayload,
          result: {
            ...v10Job.feedbackPayload.result,
            scoreBreakdown: {
              ...v10ScoreBreakdown,
              axes: v10ScoreBreakdown.axes.map((axis, axisIndex) => ({
                ...axis,
                components: (axis.components ?? []).map(
                  (component, componentIndex) =>
                    axisIndex === 0 && componentIndex === 0
                      ? {...component, id: 'unexpected-component'}
                      : component,
                ),
              })),
            },
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'v10 component order and ids are exact',
  'scoreBreakdown.axes[0].components[0].id',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...v9Job,
        feedbackPayload: {
          ...v9Job.feedbackPayload,
          result: {
            ...v9Job.feedbackPayload.result,
            scoreBreakdown: undefined,
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'v9 requires score breakdown',
  'scoreBreakdown',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...v9Job,
        feedbackPayload: {
          ...v9Job.feedbackPayload,
          result: {
            ...v9Job.feedbackPayload.result,
            evaluations: v2Evaluations.map((evaluation, index) =>
              index === 0 ? {...evaluation, correctionGuide: undefined} : evaluation,
            ),
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'v9 improvement requires correction guide',
  'evaluations[0].correctionGuide',
);

const storedV9Job = {
  ...v9Job,
  createdAt: '2026-07-22T06:01:00Z',
  feedbackPayload: {
    ...v9Job.feedbackPayload,
    request: {sourceUrl: 'https://example.com/makeup-feedback.jpg'},
  },
};
const storedV9Results = mapBackendReportsToFeedbackResults([storedV9Job]);
expectEqual(storedV9Results.length, 1, 'stored v9 report remains in list mapping');
expectEqual(
  storedV9Results[0]?.createdAt,
  '2026-07-22T06:01:00Z',
  'stored report keeps its database creation date',
);
expectEqual(
  storedV9Results[0]?.points[0]?.correctionGuide?.tool,
  correctionGuide.tool,
  'stored list and detail use the same correction guide mapping',
);
expectBackendError(
  () =>
    mapBackendReportsToFeedbackResults([
      {
        ...storedV9Job,
        feedbackPayload: {
          ...storedV9Job.feedbackPayload,
          request: {},
        },
      },
    ]),
  'FEEDBACK_REPORT_IMAGE_REQUIRED',
  'stored report requires its grounded analysis image',
);
expectEqual(
  mapBackendReportsToFeedbackResults([
    {
      ...validJob,
      feedbackPayload: {
        ...validJob.feedbackPayload,
        request: {sourceUrl: 'https://example.com/legacy.jpg'},
        result: {...validJob.feedbackPayload.result, score: undefined},
      },
    },
  ]).length,
  0,
  'legacy malformed stored report keeps the existing filtered-list policy',
);
expectBackendError(
  () =>
    mapBackendReportsToFeedbackResults([
      {
        ...storedV9Job,
        feedbackPayload: {
          ...storedV9Job.feedbackPayload,
          result: {...storedV9Job.feedbackPayload.result, scoreBreakdown: undefined},
        },
      },
    ]),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'malformed stored v9 report is surfaced from list mapping',
  'scoreBreakdown',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          result: {
            ...validJob.feedbackPayload.result,
            evaluations: v2Evaluations,
            scoreBreakdown: {
              ...v2ScoreBreakdown,
              axes: v2ScoreBreakdown.axes.map((axis, index) =>
                index === 0 ? {...axis, score: 27} : axis,
              ),
            },
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'v2 score axis sum must match total score',
  'scoreBreakdown.axes',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          result: {
            ...validJob.feedbackPayload.result,
            evaluations: v2Evaluations.map((evaluation, index) =>
              index === 0
                ? {...evaluation, correctionGuide: {...correctionGuide, stopCondition: ''}}
                : evaluation,
            ),
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'incomplete correction guide is rejected',
  'evaluations[0].correctionGuide.stopCondition',
);


expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          analysisStatus: 'bedrock_failed_fallback',
        },
      },
      selection,
    ),
  'FEEDBACK_REAL_AI_REQUIRED',
  'fallback result rejection',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          result: {
            ...validJob.feedbackPayload.result,
            evaluations: evaluations.map((evaluation, index) =>
              index === 0
                ? {
                    ...evaluation,
                    actionSteps: ['Step one', 'Step two', 'Step three', 'Step four'],
                  }
                : evaluation,
            ),
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'too many action steps rejection',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          result: {
            ...validJob.feedbackPayload.result,
            evaluations: evaluations.filter(evaluation => evaluation.topicId !== 'lip'),
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'missing topic rejection',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          result: {
            ...validJob.feedbackPayload.result,
            score: undefined,
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'missing score rejection',
);

function mapConfidence(scoreConfidence: number | 'low' | 'medium' | 'high') {
  const outcome = mapBackendJobToFeedbackResult(
    {
      ...validJob,
      feedbackPayload: {
        ...validJob.feedbackPayload,
        result: {
          ...validJob.feedbackPayload.result,
          scoreConfidence,
        },
      },
    },
    selection,
  );

  if (outcome.analysisDecision !== 'completed') {
    throw new Error('confidence fixture unexpectedly requested a retake');
  }

  return outcome.scoreConfidence;
}

expectEqual(mapConfidence(0.749), 'medium', '0.749 confidence maps to medium');
expectEqual(mapConfidence(0.5), 'medium', '0.5 confidence maps to medium');
expectEqual(mapConfidence(0.499), 'low', '0.499 confidence maps to low');
expectEqual(mapConfidence('high'), 'high', 'legacy confidence string remains supported');

const retakeOutcome = mapBackendJobToFeedbackResult(
  {
    feedbackPayload: {
      analysisStatus: 'vision_retake_required',
      result: {
        analysisDecision: 'retake_required',
        captureQuality: {
          colorConfidence: 'low',
          detectorAvailable: false,
          issues: [
            {
              affectedTopicIds: ['foundation', 'blush'],
              code: 'face_too_dark',
              message: '얼굴이 어두워 피부와 색조를 정확히 확인하기 어려워요.',
            },
          ],
          usable: false,
        },
      },
    },
    id: 'feedback-retake-1',
    sourceLabel: 'Gallery photo',
    status: 'completed',
  },
  {...selection, photoSource: 'gallery'},
);

expectEqual(retakeOutcome.analysisDecision, 'retake_required', 'retake decision');
if (retakeOutcome.analysisDecision !== 'retake_required') {
  throw new Error('retake fixture unexpectedly produced a completed result');
}
expectEqual(retakeOutcome.analysisStatus, 'vision_retake_required', 'vision retake status');
expectEqual(retakeOutcome.photoSource, 'gallery', 'retake source');
expectEqual(retakeOutcome.captureQuality.issues[0]?.code, 'face_too_dark', 'retake issue');


const fiveStatusEvaluations = evaluations.map((evaluation, index) => {
  if (index === 9) {
    return {
      ...evaluation,
      actionSteps: [],
      goalCriterionIds: [],
      observations: [],
      scoreImpact: 'low',
      status: 'not_assessable',
      visibility: 'partial',
      visibilityReason: '입술 일부가 가려져 경계를 확인하기 어려워요.',
    };
  }

  if (index === 10) {
    return {
      ...evaluation,
      actionSteps: [],
      goalCriterionIds: [],
      observations: [],
      scoreImpact: 'low',
      status: 'not_applicable',
      visibility: 'clear',
      visibilityReason: null,
    };
  }

  return evaluation;
});

const fiveStatusOutcome = mapBackendJobToFeedbackResult(
  {
    ...validJob,
    feedbackPayload: {
      ...validJob.feedbackPayload,
      result: {
        ...validJob.feedbackPayload.result,
        evaluations: fiveStatusEvaluations,
      },
    },
  },
  selection,
);

if (fiveStatusOutcome.analysisDecision !== 'completed') {
  throw new Error('five-status fixture unexpectedly requested a retake');
}
expectEqual(
  fiveStatusOutcome.evaluations[9]?.status,
  'not_assessable',
  'not assessable live status',
);
expectEqual(
  fiveStatusOutcome.evaluations[10]?.status,
  'not_applicable',
  'not applicable live status',
);
expectEqual(fiveStatusOutcome.points.length, 4, 'hidden statuses are excluded from points');
expectEqual(
  fiveStatusOutcome.points.some(point => point.topicId === 'shading'),
  false,
  'not assessable topic is hidden from points',
);
expectEqual(
  fiveStatusOutcome.points.some(point => point.topicId === 'lip'),
  false,
  'not applicable topic is hidden from points',
);
expectEqual(
  fiveStatusOutcome.points.some(point => point.topicId === 'highlight'),
  true,
  'remaining optional refinement stays visible as a point',
);

const resultScreenSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackResultScreen.tsx',
  'utf8',
);
const scoreCardSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/FeedbackScoreAxisAccordion.tsx',
  'utf8',
);
const correctionCardSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/MakeupFeedbackRedesignSlidesScreen.tsx',
  'utf8',
);
const evidencePreviewSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/redesign/FeedbackEvidenceImage.tsx',
  'utf8',
);
expectEqual(
  resultScreenSource.includes('useMakeupFeedbackRedesignController') &&
    resultScreenSource.includes('<MakeupFeedbackRedesignHomeScreen') &&
    resultScreenSource.includes('<MakeupFeedbackRedesignSlidesScreen'),
  true,
  'all reports are rendered through the redesign while keeping the route contract',
);
expectEqual(
  scoreCardSource.includes('axis.primaryEvidence') &&
    scoreCardSource.includes('accessibilityRole="progressbar"') &&
    scoreCardSource.includes('점수 판단') &&
    scoreCardSource.includes('사진에서 확인한 점') &&
    scoreCardSource.includes('<FeedbackEvidenceImage') &&
    scoreCardSource.includes('accessibilityState={{expanded: isOpen}}'),
  true,
  'score breakdown connects each axis to grounded observations and accessible disclosure',
);
expectEqual(
  correctionCardSource.includes('guide.chips.map') &&
    correctionCardSource.includes('guide.rows.map') &&
    correctionCardSource.includes('guide.instructions.map') &&
    correctionCardSource.includes('guide.possibility'),
  true,
  'redesign detail card renders the complete correction guide contract',
);
expectEqual(
  evidencePreviewSource.includes('addCropPadding') &&
    evidencePreviewSource.includes('region.box') &&
    evidencePreviewSource.includes('imageSize.width') &&
    evidencePreviewSource.includes('imageSize.height') &&
    evidencePreviewSource.includes("region.id !== 'full'") &&
    !evidencePreviewSource.includes('react-native-svg') &&
    !evidencePreviewSource.includes('CorrectionGuideOverlay'),
  true,
  'evidence preview crops the real report image from normalized backend coordinates',
);
const feedbackServiceSource = readFileSync(
  'apps/mobile/src/features/makeup-feedback/services/makeupFeedbackService.ts',
  'utf8',
);
expectEqual(
  feedbackServiceSource.includes('if (isExplainableCoachingReport(report))') &&
    feedbackServiceSource.includes('throw error;'),
  true,
  'v9 list mapping surfaces contract errors instead of silently dropping reports',
);


const strengthEvidenceOutcome = mapBackendJobToFeedbackResult(
  {
    ...validJob,
    feedbackPayload: {
      ...validJob.feedbackPayload,
      result: {
        ...validJob.feedbackPayload.result,
        scoreEvidenceIds: ['eyeliner-observation-1'],
      },
    },
  },
  selection,
);
if (strengthEvidenceOutcome.analysisDecision !== 'completed') {
  throw new Error('strength score evidence unexpectedly requested a retake');
}
expectEqual(
  strengthEvidenceOutcome.scoreEvidenceIds[0],
  'eyeliner-observation-1',
  'strength observation remains valid score evidence',
);

expectBackendError(
  () =>
    mapBackendJobToFeedbackResult(
      {
        ...validJob,
        feedbackPayload: {
          ...validJob.feedbackPayload,
          result: {
            ...validJob.feedbackPayload.result,
            scoreEvidenceIds: ['highlight-observation-1'],
          },
        },
      },
      selection,
    ),
  'FEEDBACK_REPORT_CONTRACT_INVALID',
  'optional score evidence rejection',
  'scoreEvidenceIds',
);
