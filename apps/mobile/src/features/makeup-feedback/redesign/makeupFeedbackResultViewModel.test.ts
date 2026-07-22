import type {
  MakeupFeedbackCorrectionGuide,
  MakeupFeedbackEvaluation,
  MakeupFeedbackResult,
} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import {
  MAKEUP_FEEDBACK_REDESIGN_TOPIC_ORDER,
  mapMakeupFeedbackResultToViewModel,
} from './makeupFeedbackResultViewModel';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function expectDeepEqual(actual: unknown, expected: unknown, label: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, received ${actualJson}`);
  }
}

const correctionGuide: MakeupFeedbackCorrectionGuide = {
  amount: '브러시 한쪽 면의 약 1/3만 묻힌 양',
  coverage: '속눈썹 뿌리 바로 위 한 겹',
  steps: ['브러시에 양을 덜어냅니다.', '속눈썹 사이를 짧게 채웁니다.'],
  stopCondition: '빈틈이 끊겨 보이지 않을 때 멈추세요.',
  targetArea: '오른쪽 속눈썹 중앙부터 눈꼬리까지',
  tool: '작은 납작 브러시',
  why: '속눈썹 경계를 연결하면 배치 균형이 더 안정적으로 보여요.',
};

const statusByTopic = {
  brow: 'strength',
  eyeliner: 'not_assessable',
  eyeshadow: 'not_applicable',
  lash: 'improvement',
  lens: 'optional',
} as const;

const evaluations: MakeupFeedbackEvaluation[] = MAKEUP_FEEDBACK_TOPICS.map(
  topic => {
    const status = statusByTopic[topic.id as keyof typeof statusByTopic] ?? 'strength';
    const isAssessable =
      status === 'strength' ||
      status === 'improvement' ||
      status === 'optional';
    const evidenceRegionIds = topic.kind === 'eye'
      ? (['right_eye'] as const)
      : topic.kind === 'lip'
        ? (['lips'] as const)
        : (['right_cheek'] as const);

    return {
      actionSteps: isAssessable ? [`${topic.label} 실행 단계`] : [],
      confidence: topic.id === 'foundation' ? 0.81 : topic.id === 'lash' ? 0.55 : undefined,
      correctionGuide: topic.id === 'lash' ? correctionGuide : undefined,
      description: `${topic.label} 설명`,
      goalCriterionIds: isAssessable ? ['goal-1'] : [],
      id: `${topic.id}-evaluation`,
      kind: topic.kind,
      observations: isAssessable
        ? [
            {
              claim: `${topic.label} 관찰 사실`,
              evidenceLocation: `${topic.label} 위치`,
              evidenceRegionIds: [...evidenceRegionIds],
              id: `${topic.id}-observation`,
              lightingSensitive: false,
            },
          ]
        : [],
      scoreImpact: topic.id === 'lash' ? 'high' : topic.id === 'lens' ? 'low' : undefined,
      status,
      title: `${topic.label} 제목`,
      topicId: topic.id,
      topicLabel: topic.label,
      visibility: status === 'not_assessable' ? 'partial' : 'clear',
      visibilityReason:
        status === 'not_assessable' ? '일부가 가려져 있어요.' : null,
    };
  },
);

const result: MakeupFeedbackResult = {
  analysisImageSize: {height: 1440, width: 1080},
  analysisSource: 'ai',
  annotations: [],
  evaluations,
  evidenceRegions: [
    {box: {bottom: 1, left: 0, right: 1, top: 0}, id: 'full'},
    {box: {bottom: 0.45, left: 0.08, right: 0.48, top: 0.12}, id: 'left_eye'},
    {box: {bottom: 0.45, left: 0.52, right: 0.92, top: 0.12}, id: 'right_eye'},
    {box: {bottom: 0.78, left: 0.5, right: 0.96, top: 0.42}, id: 'right_cheek'},
    {box: {bottom: 0.86, left: 0.34, right: 0.66, top: 0.7}, id: 'lips'},
  ],
  id: 'report-1',
  interpretedGoal: {
    dynamicCriteria: [
      {
        criterion: '요청한 또렷한 눈매와 자연스럽게 연결되는지',
        derivedFrom: '사용자 입력',
        id: 'goal-1',
      },
    ],
    intensity: 'medium',
    label: '또렷한 데일리 메이크업',
    reason: '사용자가 입력한 목적을 기준으로 분석했어요.',
  },
  photoSource: 'camera',
  photoSourceLabel: '카메라로 촬영한 사진',
  points: [],
  score: 84,
  scoreBreakdown: {
    axes: [
      {
        components: [
          {
            evidenceIds: ['brow-observation'],
            id: 'base-finish',
            label: '베이스 도포·균일도',
            maxScore: 8,
            reason: '베이스 표현이 대체로 균일해요.',
            score: 7,
          },
          {
            evidenceIds: ['lash-observation'],
            id: 'brow-eye-finish',
            label: '눈썹·아이 정교함',
            maxScore: 9,
            reason: '속눈썹 경계를 더 정돈할 여지가 있어요.',
            score: 7,
          },
          {
            evidenceIds: ['brow-observation'],
            id: 'cheek-finish',
            label: '치크·윤곽 블렌딩',
            maxScore: 7,
            reason: '치크와 윤곽 경계가 자연스러워요.',
            score: 6,
          },
          {
            evidenceIds: ['brow-observation'],
            id: 'lip-finish',
            label: '립 라인·채움·마감',
            maxScore: 6,
            reason: '립 마감이 안정적이에요.',
            score: 5,
          },
        ],
        evidenceIds: ['brow-observation', 'lash-observation'],
        id: 'application-finish',
        label: '적용 완성도',
        maxScore: 30,
        reason: '속눈썹 경계에 보완할 부분이 있어요.',
        score: 25,
      },
      {
        evidenceIds: ['missing-observation'],
        id: 'placement-balance',
        label: '배치·형태 균형',
        maxScore: 25,
        reason: '배치 근거',
        score: 20,
      },
    ],
    formula: '적용 완성도 25/30 + 배치·형태 균형 20/25 = 45/55',
    maxScore: 100,
  },
  scoreReason: '저장된 종합 판단입니다.',
  strengths: [],
  summary: {
    improvementSummary: '속눈썹 경계를 먼저 정리해 보세요.',
    strengthSummary: '피부 표현이 안정적이에요.',
  },
  summaryBadges: [],
  uploadedImage: {uri: 'https://example.com/report.jpg'},
};

const viewModel = mapMakeupFeedbackResultToViewModel(result);
const expectedVisibleOrder = MAKEUP_FEEDBACK_REDESIGN_TOPIC_ORDER.filter(
  topicId => topicId !== 'eyeshadow' && topicId !== 'eyeliner',
);

expectDeepEqual(
  viewModel.evaluations.map(evaluation => evaluation.topicId),
  expectedVisibleOrder,
  'user-visible evaluations use presentation order and hide audit-only statuses',
);
expectDeepEqual(
  viewModel.evaluations.map(evaluation => evaluation.number),
  expectedVisibleOrder.map((_, index) => index + 1),
  'presentation card numbers are stable',
);
expectDeepEqual(
  viewModel.evaluations.slice(0, 3).map(evaluation => evaluation.regionLabel),
  ['피부', '눈썹', '눈'],
  'topic ids map to redesign regions',
);

const statusLabels = new Map(
  viewModel.evaluations.map(evaluation => [evaluation.status, evaluation.statusLabel]),
);
expectEqual(statusLabels.get('strength'), '잘한 점', 'strength label');
expectEqual(statusLabels.get('improvement'), '보완할 점', 'improvement label');
expectEqual(
  statusLabels.get('optional'),
  '보완할 점',
  'optional joins the user-facing coaching category',
);
expectEqual(
  viewModel.evaluations.some(
    evaluation => evaluation.topicId === 'eyeliner' || evaluation.topicId === 'eyeshadow',
  ),
  false,
  'audit-only not assessable and not applicable items stay out of user cards',
);
expectDeepEqual(
  viewModel.priorityCorrections.map(evaluation => evaluation.topicId),
  ['lash'],
  'first-fix corrections include improvement items only',
);
expectDeepEqual(
  viewModel.coachingPoints.map(evaluation => evaluation.topicId),
  expectedVisibleOrder.filter(topicId => topicId === 'lash' || topicId === 'lens'),
  'coaching points merge improvement and optional items',
);
expectEqual(
  viewModel.evaluations.some(
    evaluation => evaluation.topicId === 'lens' && evaluation.status === 'optional',
  ),
  true,
  'optional item remains available in the full card list',
);

const prioritizedViewModel = mapMakeupFeedbackResultToViewModel({
  ...result,
  evaluations: result.evaluations.map(evaluation =>
    evaluation.topicId === 'brow'
      ? { ...evaluation, scoreImpact: 'low', status: 'improvement' }
      : evaluation,
  ),
});
expectEqual(
  prioritizedViewModel.priorityCorrections[0]?.topicId,
  'lash',
  'high-impact improvement becomes the first correction shortcut',
);

const foundation = viewModel.evaluations.find(
  evaluation => evaluation.topicId === 'foundation',
)!;
const lash = viewModel.evaluations.find(
  evaluation => evaluation.topicId === 'lash',
)!;
expectEqual(foundation.confidencePercent, 81, 'confidence percentage');
expectEqual(foundation.confidenceLabel, '판독 신뢰도 81%', 'confidence label');
expectEqual(lash.confidenceLabel, '판독 신뢰도 낮음 · 55%', 'low confidence label');
expectEqual(lash.impactLabel, '큼', 'impact label');
expectEqual(
  lash.observations[0]?.text,
  '속눈썹 관찰 사실 (속눈썹 위치)',
  'observation keeps claim and location',
);
expectEqual(lash.guide?.chips[0]?.text, correctionGuide.tool, 'guide tool chip');
expectEqual(lash.guide?.rows[2]?.text, correctionGuide.stopCondition, 'guide stop row');
expectDeepEqual(lash.guide?.instructions, correctionGuide.steps, 'guide instructions');
expectEqual(
  lash.goalCriteria[0]?.criterion,
  result.interpretedGoal?.dynamicCriteria?.[0]?.criterion,
  'evaluation keeps its linked user goal criterion',
);

const applicationAxis = viewModel.axes[0]!;
expectEqual(applicationAxis.components.length, 4, 'axis maps analytic component count');
expectEqual(
  applicationAxis.components[0]?.label,
  '베이스 도포·균일도',
  'axis maps analytic component label',
);
expectEqual(applicationAxis.components[0]?.percentage, 88, 'component percentage is rounded');
expectEqual(
  applicationAxis.components[1]?.reason,
  '속눈썹 경계를 더 정돈할 여지가 있어요.',
  'component reason remains available to the accordion',
);
expectEqual(applicationAxis.evidence.length, 2, 'axis resolves all known evidence ids');
expectEqual(
  applicationAxis.primaryEvidence?.topicId,
  'lash',
  'improvement evidence is the dynamic primary target',
);
expectEqual(applicationAxis.jumpToEvaluationIndex, lash.index, 'dynamic jump index');
expectEqual(applicationAxis.jumpToEvaluationNumber, lash.number, 'dynamic jump card number');
expectEqual(applicationAxis.primaryEvidence?.region?.id, 'right_eye', 'axis region');
expectEqual(applicationAxis.primaryEvidence?.crop?.label, '오른쪽 속눈썹', 'axis crop label');
expectEqual(applicationAxis.primaryEvidence?.crop?.source, result.uploadedImage, 'crop reuses real source');
expectEqual(
  applicationAxis.primaryEvidence?.possibility,
  correctionGuide.why,
  'axis possibility comes from the real guide',
);

const unresolvedAxis = viewModel.axes[1]!;
expectDeepEqual(unresolvedAxis.components, [], 'stored v9 axis without components remains compatible');
expectDeepEqual(
  unresolvedAxis.unresolvedEvidenceIds,
  ['missing-observation'],
  'unresolved evidence remains explicit',
);
expectEqual(unresolvedAxis.primaryEvidence, null, 'unresolved axis has no fabricated evidence');
expectEqual(unresolvedAxis.jumpToEvaluationIndex, null, 'unresolved axis has no fabricated jump');
expectEqual(viewModel.summarySentence, '피부 표현이 안정적이에요. 속눈썹 경계를 먼저 정리해 보세요.', 'summary composition');
expectEqual(
  viewModel.scoreFormula,
  result.scoreBreakdown?.formula ?? null,
  'explainable score formula remains available to the redesigned report',
);
expectEqual(viewModel.isCompleteTopicSet, true, 'complete topic set');

const sideAwareViewModel = mapMakeupFeedbackResultToViewModel({
  ...result,
  evaluations: result.evaluations.map(evaluation =>
    evaluation.topicId === 'brow'
      ? {
          ...evaluation,
          observations: (evaluation.observations ?? []).map(observation => ({
            ...observation,
            evidenceLocation: '오른쪽 눈썹 꼬리',
            evidenceRegionIds: ['left_eye', 'right_eye'],
          })),
        }
      : evaluation,
  ),
});
expectEqual(
  sideAwareViewModel.evaluations.find(evaluation => evaluation.topicId === 'brow')
    ?.primaryEvidenceRegion?.id,
  'right_eye',
  'bilateral evidence uses the side named by the grounded observation',
);

const ambiguousSideViewModel = mapMakeupFeedbackResultToViewModel({
  ...result,
  evaluations: result.evaluations.map(evaluation =>
    evaluation.topicId === 'brow'
      ? {
          ...evaluation,
          observations: (evaluation.observations ?? []).map(observation => ({
            ...observation,
            evidenceLocation: '양쪽 눈썹',
            evidenceRegionIds: ['left_eye', 'right_eye'],
          })),
        }
      : evaluation,
  ),
});
expectEqual(
  ambiguousSideViewModel.evaluations.find(
    evaluation => evaluation.topicId === 'brow',
  )?.primaryEvidenceRegion,
  null,
  'ambiguous bilateral evidence falls back to the original photo instead of guessing a side',
);

const legacyEvaluations = result.evaluations.map(evaluation => ({
  ...evaluation,
  confidence: undefined,
  observations: (evaluation.observations ?? []).map(observation => ({
    ...observation,
    evidenceRegionIds: undefined,
  })),
  scoreImpact: undefined,
}));
const legacyViewModel = mapMakeupFeedbackResultToViewModel({
  ...result,
  analysisImageSize: undefined,
  evaluations: legacyEvaluations,
  evidenceRegions: undefined,
  scoreBreakdown: undefined,
  summary: undefined,
});

expectDeepEqual(legacyViewModel.axes, [], 'legacy result does not fabricate score axes');
expectEqual(legacyViewModel.summarySentence, result.scoreReason, 'legacy summary uses stored score reason');
expectEqual(legacyViewModel.evaluations[0]?.confidence, null, 'legacy confidence stays unknown');
expectEqual(legacyViewModel.evaluations[0]?.impactLabel, null, 'legacy impact stays unknown');
expectEqual(legacyViewModel.evaluations[0]?.primaryCrop, null, 'legacy result does not fabricate crop');

const incompleteViewModel = mapMakeupFeedbackResultToViewModel({
  ...result,
  evaluations: result.evaluations.filter(evaluation => evaluation.topicId !== 'lip'),
});
expectDeepEqual(incompleteViewModel.missingTopicIds, ['lip'], 'missing topics stay explicit');
expectEqual(incompleteViewModel.isCompleteTopicSet, false, 'incomplete topic set is flagged');
expectEqual(
  incompleteViewModel.evaluations.length,
  viewModel.evaluations.length - 1,
  'missing topic is not fabricated',
);
