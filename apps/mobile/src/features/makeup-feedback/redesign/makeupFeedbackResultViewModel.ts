import type {
  MakeupFeedbackAnalysisImageSize,
  MakeupFeedbackCorrectionGuide,
  MakeupFeedbackDynamicCriterion,
  MakeupFeedbackEvaluation,
  MakeupFeedbackEvaluationStatus,
  MakeupFeedbackEvidenceRegion,
  MakeupFeedbackEvidenceRegionId,
  MakeupFeedbackResult,
  MakeupFeedbackScoreAxis,
  MakeupFeedbackScoreComponent,
  MakeupFeedbackScoreImpact,
  MakeupFeedbackTopicId,
} from '../types';

export const MAKEUP_FEEDBACK_REDESIGN_TOPIC_ORDER = [
  'foundation',
  'brow',
  'eyeshadow',
  'eyeliner',
  'lash',
  'lens',
  'aegyosal',
  'shading',
  'blush',
  'highlight',
  'lip',
] as const satisfies readonly MakeupFeedbackTopicId[];

export type MakeupFeedbackRedesignRegionId =
  | 'skin'
  | 'brow'
  | 'eye'
  | 'cheek'
  | 'lip';

export type MakeupFeedbackRedesignStatusLabel =
  | '잘한 점'
  | '보완할 점';

type MakeupFeedbackUserVisibleStatus = Extract<
  MakeupFeedbackEvaluationStatus,
  'strength' | 'improvement' | 'optional'
>;

type MakeupFeedbackUserVisibleEvaluation = MakeupFeedbackEvaluation & {
  status: MakeupFeedbackUserVisibleStatus;
};

export type MakeupFeedbackRedesignImpactLabel = '큼' | '중간' | '작음';

export type MakeupFeedbackRedesignGuideRow = {
  id: 'targetArea' | 'coverage' | 'stopCondition';
  label: '위치' | '범위' | '멈춤';
  text: string;
};

export type MakeupFeedbackRedesignGuideChip = {
  id: 'tool' | 'amount';
  label: '도구' | '사용량';
  text: string;
};

export type MakeupFeedbackRedesignGuide = {
  amount: string;
  chips: MakeupFeedbackRedesignGuideChip[];
  coverage: string;
  instructions: string[];
  possibility: string;
  rows: MakeupFeedbackRedesignGuideRow[];
  stopCondition: string;
  targetArea: string;
  tool: string;
  why: string;
};

export type MakeupFeedbackRedesignObservation = {
  claim: string;
  evidenceLocation: string;
  evidenceRegionIds: MakeupFeedbackEvidenceRegionId[];
  evidenceRegions: MakeupFeedbackEvidenceRegion[];
  id: string;
  lightingSensitive: boolean;
  text: string;
};

export type MakeupFeedbackRedesignCrop = {
  imageSize: MakeupFeedbackAnalysisImageSize;
  label: string;
  region: MakeupFeedbackEvidenceRegion;
  source: MakeupFeedbackResult['uploadedImage'];
};

export type MakeupFeedbackRedesignEvaluation = {
  actionSteps: string[];
  confidence: number | null;
  confidenceLabel: string | null;
  confidencePercent: number | null;
  description: string;
  evidenceRegions: MakeupFeedbackEvidenceRegion[];
  guide: MakeupFeedbackRedesignGuide | null;
  goalCriteria: MakeupFeedbackDynamicCriterion[];
  id: string;
  impact: MakeupFeedbackScoreImpact | null;
  impactLabel: MakeupFeedbackRedesignImpactLabel | null;
  index: number;
  number: number;
  observations: MakeupFeedbackRedesignObservation[];
  primaryCrop: MakeupFeedbackRedesignCrop | null;
  primaryEvidenceRegion: MakeupFeedbackEvidenceRegion | null;
  regionId: MakeupFeedbackRedesignRegionId;
  regionLabel: string;
  status: MakeupFeedbackUserVisibleStatus;
  statusLabel: MakeupFeedbackRedesignStatusLabel;
  title: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  visibilityReason: string | null;
};

export type MakeupFeedbackRedesignAxisEvidence = {
  crop: MakeupFeedbackRedesignCrop | null;
  evaluationId: string;
  evaluationIndex: number;
  evaluationNumber: number;
  note: string;
  observation: MakeupFeedbackRedesignObservation;
  possibility: string | null;
  region: MakeupFeedbackEvidenceRegion | null;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
};

export type MakeupFeedbackRedesignScoreComponent = {
  evidenceIds: string[];
  id: MakeupFeedbackScoreComponent['id'];
  label: string;
  maxScore: number;
  percentage: number | null;
  reason: string | null;
  score: number;
};

export type MakeupFeedbackRedesignScoreAxis = {
  components: MakeupFeedbackRedesignScoreComponent[];
  evidence: MakeupFeedbackRedesignAxisEvidence[];
  evidenceIds: string[];
  id: MakeupFeedbackScoreAxis['id'];
  jumpToEvaluationIndex: number | null;
  jumpToEvaluationNumber: number | null;
  label: string;
  maxScore: number;
  percentage: number | null;
  primaryEvidence: MakeupFeedbackRedesignAxisEvidence | null;
  reason: string | null;
  score: number;
  unresolvedEvidenceIds: string[];
};

export type MakeupFeedbackRedesignRegionGroup = {
  evaluations: MakeupFeedbackRedesignEvaluation[];
  id: MakeupFeedbackRedesignRegionId;
  label: string;
};

export type MakeupFeedbackResultViewModel = {
  analysisSource: MakeupFeedbackResult['analysisSource'];
  axes: MakeupFeedbackRedesignScoreAxis[];
  captureQuality: MakeupFeedbackResult['captureQuality'] | null;
  coachingPoints: MakeupFeedbackRedesignEvaluation[];
  evaluations: MakeupFeedbackRedesignEvaluation[];
  goalLabel: string | null;
  goalReason: string | null;
  groups: MakeupFeedbackRedesignRegionGroup[];
  imageSource: MakeupFeedbackResult['uploadedImage'];
  isCompleteTopicSet: boolean;
  missingTopicIds: MakeupFeedbackTopicId[];
  score: number;
  scoreFormula: string | null;
  priorityCorrections: MakeupFeedbackRedesignEvaluation[];
  strengths: MakeupFeedbackRedesignEvaluation[];
  summarySentence: string | null;
};

const regionByTopicId: Record<
  MakeupFeedbackTopicId,
  {id: MakeupFeedbackRedesignRegionId; label: string}
> = {
  aegyosal: {id: 'eye', label: '눈'},
  blush: {id: 'cheek', label: '볼'},
  brow: {id: 'brow', label: '눈썹'},
  eyeliner: {id: 'eye', label: '눈'},
  eyeshadow: {id: 'eye', label: '눈'},
  foundation: {id: 'skin', label: '피부'},
  highlight: {id: 'cheek', label: '볼'},
  lash: {id: 'eye', label: '눈'},
  lens: {id: 'eye', label: '눈'},
  lip: {id: 'lip', label: '립'},
  shading: {id: 'cheek', label: '볼'},
};

const regionOrder: ReadonlyArray<{
  id: MakeupFeedbackRedesignRegionId;
  label: string;
}> = [
  {id: 'skin', label: '피부'},
  {id: 'brow', label: '눈썹'},
  {id: 'eye', label: '눈'},
  {id: 'cheek', label: '볼'},
  {id: 'lip', label: '립'},
];

const statusLabels: Record<
  MakeupFeedbackUserVisibleStatus,
  MakeupFeedbackRedesignStatusLabel
> = {
  improvement: '보완할 점',
  optional: '보완할 점',
  strength: '잘한 점',
};

const impactLabels: Record<
  MakeupFeedbackScoreImpact,
  MakeupFeedbackRedesignImpactLabel
> = {
  high: '큼',
  low: '작음',
  medium: '중간',
};

const impactPriority: Record<MakeupFeedbackScoreImpact, number> = {
  high: 0,
  low: 2,
  medium: 1,
};

function cleanText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function toConfidence(value: number | undefined): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

function toPercentage(score: number, maxScore: number): number | null {
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(maxScore) ||
    maxScore <= 0
  ) {
    return null;
  }

  return Math.round(Math.max(0, Math.min(1, score / maxScore)) * 100);
}

function formatObservationText(
  claim: string,
  evidenceLocation: string,
): string {
  const normalizedClaim = cleanText(claim);
  const normalizedLocation = cleanText(evidenceLocation);

  if (normalizedClaim && normalizedLocation) {
    return `${normalizedClaim} (${normalizedLocation})`;
  }

  return normalizedClaim ?? normalizedLocation ?? '';
}

function getEvidenceRegionLabel(
  regionId: MakeupFeedbackEvidenceRegionId,
  topicId: MakeupFeedbackTopicId,
): string {
  const side = regionId.startsWith('left_') ? '왼쪽' : '오른쪽';

  if (regionId === 'left_eye' || regionId === 'right_eye') {
    const eyeLabelByTopic: Partial<Record<MakeupFeedbackTopicId, string>> = {
      aegyosal: `${side} 눈 아래`,
      brow: `${side} 눈썹`,
      eyeliner: `${side} 아이라인`,
      eyeshadow: `${side} 눈두덩`,
      lash: `${side} 속눈썹`,
      lens: `${side} 눈`,
    };

    return eyeLabelByTopic[topicId] ?? `${side} 눈`;
  }

  return {
    full: '전체 사진',
    left_cheek: '왼쪽 볼',
    lips: '입술',
    right_cheek: '오른쪽 볼',
  }[regionId];
}

function selectPrimaryRegion(
  regions: readonly MakeupFeedbackEvidenceRegion[],
  sideHint?: string | null,
): MakeupFeedbackEvidenceRegion | null {
  const specificRegions = regions.filter(region => region.id !== 'full');
  const normalizedHint = sideHint?.toLowerCase() ?? '';
  const mentionsRight = /오른쪽|우측|right/.test(normalizedHint);
  const mentionsLeft = /왼쪽|좌측|left/.test(normalizedHint);
  const preferredSide = mentionsRight === mentionsLeft
    ? null
    : mentionsRight
      ? 'right_'
      : 'left_';

  if (preferredSide) {
    const matchingRegion = specificRegions.find(region =>
      region.id.startsWith(preferredSide),
    );

    if (matchingRegion) {
      return matchingRegion;
    }
  }

  const representedSides = new Set(
    specificRegions.flatMap(region =>
      region.id.startsWith('left_')
        ? ['left']
        : region.id.startsWith('right_')
          ? ['right']
          : [],
    ),
  );

  if (representedSides.size > 1) {
    return null;
  }

  return specificRegions[0] ?? regions[0] ?? null;
}

function buildCrop(
  result: MakeupFeedbackResult,
  region: MakeupFeedbackEvidenceRegion | null,
  topicId: MakeupFeedbackTopicId,
): MakeupFeedbackRedesignCrop | null {
  if (!region || !result.analysisImageSize) {
    return null;
  }

  return {
    imageSize: result.analysisImageSize,
    label: getEvidenceRegionLabel(region.id, topicId),
    region,
    source: result.uploadedImage,
  };
}

function mapGuide(
  guide: MakeupFeedbackCorrectionGuide | undefined,
): MakeupFeedbackRedesignGuide | null {
  if (!guide) {
    return null;
  }

  return {
    amount: guide.amount,
    chips: [
      {id: 'tool', label: '도구', text: guide.tool},
      {id: 'amount', label: '사용량', text: guide.amount},
    ],
    coverage: guide.coverage,
    instructions: [...guide.steps],
    possibility: guide.why,
    rows: [
      {id: 'targetArea', label: '위치', text: guide.targetArea},
      {id: 'coverage', label: '범위', text: guide.coverage},
      {id: 'stopCondition', label: '멈춤', text: guide.stopCondition},
    ],
    stopCondition: guide.stopCondition,
    targetArea: guide.targetArea,
    tool: guide.tool,
    why: guide.why,
  };
}

function mapObservations(
  evaluation: MakeupFeedbackEvaluation,
  evidenceRegionById: ReadonlyMap<
    MakeupFeedbackEvidenceRegionId,
    MakeupFeedbackEvidenceRegion
  >,
): MakeupFeedbackRedesignObservation[] {
  return (evaluation.observations ?? []).map(observation => {
    const evidenceRegionIds = Array.isArray(observation.evidenceRegionIds)
      ? [...observation.evidenceRegionIds]
      : [];

    return {
      claim: observation.claim,
      evidenceLocation: observation.evidenceLocation,
      evidenceRegionIds,
      evidenceRegions: evidenceRegionIds.flatMap(regionId => {
        const region = evidenceRegionById.get(regionId);
        return region ? [region] : [];
      }),
      id: observation.id,
      lightingSensitive: observation.lightingSensitive,
      text: formatObservationText(
        observation.claim,
        observation.evidenceLocation,
      ),
    };
  });
}

function mapEvaluation(
  result: MakeupFeedbackResult,
  evaluation: MakeupFeedbackUserVisibleEvaluation,
  index: number,
  evidenceRegionById: ReadonlyMap<
    MakeupFeedbackEvidenceRegionId,
    MakeupFeedbackEvidenceRegion
  >,
  goalCriterionById: ReadonlyMap<string, MakeupFeedbackDynamicCriterion>,
): MakeupFeedbackRedesignEvaluation {
  const confidence = toConfidence(evaluation.confidence);
  const confidencePercent =
    confidence == null ? null : Math.round(confidence * 100);
  const observations = mapObservations(evaluation, evidenceRegionById);
  const evidenceRegions = observations
    .flatMap(observation => observation.evidenceRegions)
    .filter(
      (region, regionIndex, allRegions) =>
        allRegions.findIndex(candidate => candidate.id === region.id) ===
        regionIndex,
    );
  const primaryEvidenceRegion = selectPrimaryRegion(
    evidenceRegions,
    [
      ...observations.map(observation => observation.evidenceLocation),
      evaluation.correctionGuide?.targetArea,
      evaluation.correctionGuide?.coverage,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' '),
  );
  const region = regionByTopicId[evaluation.topicId];

  return {
    actionSteps: [...evaluation.actionSteps],
    confidence,
    confidenceLabel:
      confidencePercent == null
        ? null
        : confidence !== null && confidence < 0.6
          ? `판독 신뢰도 낮음 · ${confidencePercent}%`
          : `판독 신뢰도 ${confidencePercent}%`,
    confidencePercent,
    description: evaluation.description,
    evidenceRegions,
    guide: mapGuide(evaluation.correctionGuide),
    goalCriteria: (evaluation.goalCriterionIds ?? []).flatMap(criterionId => {
      const criterion = goalCriterionById.get(criterionId);
      return criterion ? [criterion] : [];
    }),
    id: evaluation.id,
    impact: evaluation.scoreImpact ?? null,
    impactLabel: evaluation.scoreImpact
      ? impactLabels[evaluation.scoreImpact]
      : null,
    index,
    number: index + 1,
    observations,
    primaryCrop: buildCrop(
      result,
      primaryEvidenceRegion,
      evaluation.topicId,
    ),
    primaryEvidenceRegion,
    regionId: region.id,
    regionLabel: region.label,
    status: evaluation.status,
    statusLabel: statusLabels[evaluation.status],
    title: evaluation.title,
    topicId: evaluation.topicId,
    topicLabel: evaluation.topicLabel,
    visibilityReason: cleanText(evaluation.visibilityReason),
  };
}

function axisEvidencePriority(
  evidence: MakeupFeedbackRedesignAxisEvidence,
  evaluationById: ReadonlyMap<string, MakeupFeedbackRedesignEvaluation>,
): number {
  const evaluation = evaluationById.get(evidence.evaluationId);
  const isImprovement = evaluation?.status === 'improvement';
  const hasSpecificRegion = Boolean(
    evidence.region && evidence.region.id !== 'full',
  );

  if (isImprovement && hasSpecificRegion) return 0;
  if (isImprovement) return 1;
  if (hasSpecificRegion) return 2;
  return 3;
}

function mapAxes(
  result: MakeupFeedbackResult,
  evaluations: readonly MakeupFeedbackRedesignEvaluation[],
): MakeupFeedbackRedesignScoreAxis[] {
  const rawAxes = result.scoreBreakdown?.axes;

  if (!Array.isArray(rawAxes)) {
    return [];
  }

  const evaluationById = new Map(
    evaluations.map(evaluation => [evaluation.id, evaluation]),
  );
  const observationById = new Map<
    string,
    {
      evaluation: MakeupFeedbackRedesignEvaluation;
      observation: MakeupFeedbackRedesignObservation;
    }
  >();

  evaluations.forEach(evaluation => {
    evaluation.observations.forEach(observation => {
      if (!observationById.has(observation.id)) {
        observationById.set(observation.id, {evaluation, observation});
      }
    });
  });

  return rawAxes.map(axis => {
    const evidence = axis.evidenceIds.flatMap(
      (evidenceId): MakeupFeedbackRedesignAxisEvidence[] => {
        const resolved = observationById.get(evidenceId);

        if (!resolved) {
          return [];
        }

        const region = selectPrimaryRegion(
          resolved.observation.evidenceRegions,
          resolved.observation.evidenceLocation,
        ) ?? resolved.evaluation.primaryEvidenceRegion;

        return [
          {
            crop: buildCrop(result, region, resolved.evaluation.topicId),
            evaluationId: resolved.evaluation.id,
            evaluationIndex: resolved.evaluation.index,
            evaluationNumber: resolved.evaluation.number,
            note: resolved.observation.text,
            observation: resolved.observation,
            possibility: resolved.evaluation.guide?.possibility ?? null,
            region,
            topicId: resolved.evaluation.topicId,
            topicLabel: resolved.evaluation.topicLabel,
          },
        ];
      },
    );
    const primaryEvidence = [...evidence].sort(
      (left, right) =>
        axisEvidencePriority(left, evaluationById) -
        axisEvidencePriority(right, evaluationById),
    )[0] ?? null;
    const resolvedEvidenceIds = new Set(
      evidence.map(item => item.observation.id),
    );

    return {
      components: (axis.components ?? []).map(component => ({
        evidenceIds: [...component.evidenceIds],
        id: component.id,
        label: component.label,
        maxScore: component.maxScore,
        percentage: toPercentage(component.score, component.maxScore),
        reason: cleanText(component.reason),
        score: component.score,
      })),
      evidence,
      evidenceIds: [...axis.evidenceIds],
      id: axis.id,
      jumpToEvaluationIndex: primaryEvidence?.evaluationIndex ?? null,
      jumpToEvaluationNumber: primaryEvidence?.evaluationNumber ?? null,
      label: axis.label,
      maxScore: axis.maxScore,
      percentage: toPercentage(axis.score, axis.maxScore),
      primaryEvidence,
      reason: cleanText(axis.reason),
      score: axis.score,
      unresolvedEvidenceIds: axis.evidenceIds.filter(
        evidenceId => !resolvedEvidenceIds.has(evidenceId),
      ),
    };
  });
}

function buildSummarySentence(result: MakeupFeedbackResult): string | null {
  const summaryParts = [
    cleanText(result.summary?.strengthSummary),
    cleanText(result.summary?.improvementSummary),
  ].filter((part): part is string => Boolean(part));

  if (summaryParts.length > 0) {
    return summaryParts.join(' ');
  }

  return cleanText(result.scoreReason);
}

export function mapMakeupFeedbackResultToViewModel(
  result: MakeupFeedbackResult,
): MakeupFeedbackResultViewModel {
  const evidenceRegionById = new Map(
    (result.evidenceRegions ?? []).map(region => [region.id, region]),
  );
  const evaluationByTopicId = new Map<
    MakeupFeedbackTopicId,
    MakeupFeedbackEvaluation
  >();
  const goalCriterionById = new Map(
    (result.interpretedGoal?.dynamicCriteria ?? []).map(criterion => [
      criterion.id,
      criterion,
    ]),
  );

  (result.evaluations ?? []).forEach(evaluation => {
    if (!evaluationByTopicId.has(evaluation.topicId)) {
      evaluationByTopicId.set(evaluation.topicId, evaluation);
    }
  });

  const missingTopicIds = MAKEUP_FEEDBACK_REDESIGN_TOPIC_ORDER.filter(
    topicId => !evaluationByTopicId.has(topicId),
  );
  const evaluations = MAKEUP_FEEDBACK_REDESIGN_TOPIC_ORDER.flatMap(
    (topicId): MakeupFeedbackRedesignEvaluation[] => {
      const evaluation = evaluationByTopicId.get(topicId);

      return evaluation && isUserVisibleEvaluation(evaluation)
        ? [
            mapEvaluation(
              result,
              evaluation,
              MAKEUP_FEEDBACK_REDESIGN_TOPIC_ORDER.indexOf(topicId),
              evidenceRegionById,
              goalCriterionById,
            ),
          ]
        : [];
    },
  ).map((evaluation, index) => ({
    ...evaluation,
    index,
    number: index + 1,
  }));

  return {
    analysisSource: result.analysisSource,
    axes: mapAxes(result, evaluations),
    captureQuality: result.captureQuality ?? null,
    coachingPoints: evaluations.filter(
      evaluation =>
        evaluation.status === 'improvement' ||
        evaluation.status === 'optional',
    ),
    evaluations,
    goalLabel: cleanText(result.interpretedGoal?.label),
    goalReason: cleanText(result.interpretedGoal?.reason),
    groups: regionOrder
      .map(region => ({
        ...region,
        evaluations: evaluations.filter(
          evaluation => evaluation.regionId === region.id,
        ),
      }))
      .filter(group => group.evaluations.length > 0),
    imageSource: result.uploadedImage,
    isCompleteTopicSet: missingTopicIds.length === 0,
    missingTopicIds,
    priorityCorrections: evaluations
      .filter(evaluation => evaluation.status === 'improvement')
      .sort((left, right) => {
        const impactDifference =
          impactPriority[left.impact ?? 'low'] -
          impactPriority[right.impact ?? 'low'];
        return impactDifference || left.index - right.index;
      }),
    score: result.score,
    scoreFormula: cleanText(result.scoreBreakdown?.formula),
    strengths: evaluations.filter(
      evaluation => evaluation.status === 'strength',
    ),
    summarySentence: buildSummarySentence(result),
  };
}

function isUserVisibleEvaluation(
  evaluation: MakeupFeedbackEvaluation,
): evaluation is MakeupFeedbackUserVisibleEvaluation {
  return evaluation.status === 'strength' ||
    evaluation.status === 'improvement' ||
    evaluation.status === 'optional';
}
