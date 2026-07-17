import {BackendApiError} from '../../../shared/services/backendApi';
import type {MakeupFeedbackPhotoSelection} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import {
  assertCreatedFeedbackJobJourneyContext,
  buildMakeupFeedbackJobCreateBody,
  getMakeupFeedbackAnalysisErrorAction,
  getMakeupFeedbackAnalysisErrorMessage,
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


expectEqual(mappedResult.analysisSource, 'ai', 'analysis source');
expectEqual(mappedResult.analysisStatus, 'bedrock_completed', 'analysis status');
expectEqual(mappedResult.modelVersion, 'bedrock:model-v1', 'model version');
expectEqual(mappedResult.score, 91, 'score');
expectEqual(mappedResult.interpretedGoal.intensity, 'medium', 'intensity enum remains unchanged');
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
