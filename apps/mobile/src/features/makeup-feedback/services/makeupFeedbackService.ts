import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {appAssetUri} from '../../../shared/config/mediaAssets';
import {BackendApiError, getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import type {
  MakeupFeedbackAnalysisOutcome,
  MakeupFeedbackCaptureQuality,
  MakeupFeedbackCompletedResult,
  MakeupFeedbackConfidenceLevel,
  MakeupFeedbackCorrectionPoint,
  MakeupFeedbackDynamicCriterion,
  MakeupFeedbackEvidenceRegion,
  MakeupFeedbackEvidenceRegionId,
  MakeupFeedbackEvaluation,
  MakeupFeedbackEvaluationStatus,
  MakeupFeedbackObservation,
  MakeupFeedbackPhotoSelection,
  MakeupFeedbackRetakeOutcome,
  MakeupFeedbackScoreImpact,
  MakeupFeedbackStrength,
  MakeupFeedbackSummary,
  MakeupFeedbackSummaryBadge,
  MakeupFeedbackTopicId,
  MakeupFeedbackVisibility,
} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import {localizeMakeupFeedbackIntensityTerms} from './makeupFeedbackGoalIntentService';

const FEEDBACK_ANALYSIS_TIMEOUT_MS = 180000;
const FEEDBACK_REPORT_POLL_INTERVAL_MS = 2000;
const FEEDBACK_GOAL_VALIDATION_ERROR_CODES = new Set([
  'FEEDBACK_GOAL_INVALID',
  'FEEDBACK_GOAL_NEEDS_DETAIL',
  'FEEDBACK_GOAL_GUARDRAIL_BLOCKED',
]);

const MAKEUP_FEEDBACK_SERVER_ERROR_MESSAGE =
  '서버에서 사진 분석을 시작하지 못했어요. 잠시 후 다시 시도하거나 다른 사진을 선택해 주세요.';

const topicById = new Map(MAKEUP_FEEDBACK_TOPICS.map(topic => [topic.id, topic]));

export function isMakeupFeedbackGoalValidationError(error: unknown): error is BackendApiError {
  return error instanceof BackendApiError && FEEDBACK_GOAL_VALIDATION_ERROR_CODES.has(error.code ?? '');
}

export type MakeupFeedbackAnalysisErrorAction = 'edit_goal' | 'retry';

export function getMakeupFeedbackAnalysisErrorAction(
  error: unknown,
): MakeupFeedbackAnalysisErrorAction {
  return isMakeupFeedbackGoalValidationError(error) ? 'edit_goal' : 'retry';
}

export function getMakeupFeedbackAnalysisErrorMessage(error: unknown): string {
  if (error instanceof BackendApiError) {
    if (
      error.status >= 500 ||
      error.message.startsWith('Backend request failed with HTTP')
    ) {
      return MAKEUP_FEEDBACK_SERVER_ERROR_MESSAGE;
    }

    return error.message;
  }

  return 'AI 피드백 분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

type BackendFeedbackPayload = {
  analysisStatus?: unknown;
  analysis_status?: unknown;
  error?: {details?: unknown; message?: string | null} | null;
  request?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
} | null;

type BackendFeedbackJob = {
  feedbackPayload?: BackendFeedbackPayload;
  id?: string | null;
  modelVersion?: string | null;
  score?: number | null;
  source?: string | null;
  sourceLabel?: string | null;
  status?: 'cancelled' | 'completed' | 'failed' | 'pending' | 'processing' | null;
};

type CreateFeedbackJobResponse = {
  job: BackendFeedbackJob;
};

export type MakeupFeedbackAnalysisCallbacks = {
  onAnalysisCreated?: (analysisId: string) => void;
};

type GetFeedbackReportResponse = {
  report: BackendFeedbackJob;
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => Boolean(value?.trim()))?.trim();
}

function stringValue(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';

  return normalized || undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTopicId(value: unknown): value is MakeupFeedbackTopicId {
  return typeof value === 'string' && topicById.has(value as MakeupFeedbackTopicId);
}

const evidenceRegionIds = new Set<MakeupFeedbackEvidenceRegionId>([
  'full',
  'left_eye',
  'right_eye',
  'left_cheek',
  'right_cheek',
  'lips',
]);

function isEvidenceRegionId(value: unknown): value is MakeupFeedbackEvidenceRegionId {
  return typeof value === 'string' && evidenceRegionIds.has(value as MakeupFeedbackEvidenceRegionId);
}

function requireUnitCoordinate(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw feedbackContractError(field, field + ' 값은 0~1 사이 숫자여야 합니다.');
  }

  return value;
}

function mapEvidenceRegions(value: unknown): MakeupFeedbackEvidenceRegion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw feedbackContractError('evidenceRegions', '실제 분석 영역이 1~6개 필요합니다.');
  }

  const seenIds = new Set<MakeupFeedbackEvidenceRegionId>();

  return value.map((rawRegion, index) => {
    const field = `evidenceRegions[${index}]`;
    if (!isObject(rawRegion) || !isEvidenceRegionId(rawRegion.id) || !isObject(rawRegion.box)) {
      throw feedbackContractError(field, '분석 영역 형식이 잘못되었습니다.');
    }
    if (seenIds.has(rawRegion.id)) {
      throw feedbackContractError(field + '.id', '분석 영역 id가 중복되었습니다.');
    }
    seenIds.add(rawRegion.id);

    const box = {
      bottom: requireUnitCoordinate(rawRegion.box.bottom, field + '.box.bottom'),
      left: requireUnitCoordinate(rawRegion.box.left, field + '.box.left'),
      right: requireUnitCoordinate(rawRegion.box.right, field + '.box.right'),
      top: requireUnitCoordinate(rawRegion.box.top, field + '.box.top'),
    };
    if (box.left >= box.right || box.top >= box.bottom) {
      throw feedbackContractError(field + '.box', '분석 영역 좌표 순서가 잘못되었습니다.');
    }

    return {box, id: rawRegion.id};
  });
}

function mapAnalysisImageSize(value: unknown) {
  if (
    !isObject(value)
    || typeof value.width !== 'number'
    || !Number.isInteger(value.width)
    || value.width <= 0
    || typeof value.height !== 'number'
    || !Number.isInteger(value.height)
    || value.height <= 0
  ) {
    throw feedbackContractError('analysisImageSize', '분석 이미지 크기가 올바르지 않습니다.');
  }

  return {height: value.height, width: value.width};
}

function isScoreImpact(value: unknown): value is MakeupFeedbackScoreImpact {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isConfidenceLevel(value: unknown): value is MakeupFeedbackConfidenceLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

function mapScoreConfidence(value: unknown): MakeupFeedbackConfidenceLevel {
  if (isConfidenceLevel(value)) {
    return value;
  }

  const confidence = requireConfidence(value, 'scoreConfidence');

  if (confidence >= 0.75) {
    return 'high';
  }

  if (confidence >= 0.5) {
    return 'medium';
  }

  return 'low';
}


function isEvaluationStatus(value: unknown): value is MakeupFeedbackEvaluationStatus {
  return (
    value === 'strength' ||
    value === 'improvement' ||
    value === 'optional' ||
    value === 'not_assessable' ||
    value === 'not_applicable'
  );
}

function isVisibility(value: unknown): value is MakeupFeedbackVisibility {
  return value === 'clear' || value === 'partial' || value === 'not_visible';
}

function feedbackContractError(field: string, message: string): BackendApiError {
  return new BackendApiError(
    `AI 피드백 응답이 올바르지 않아요. ${message}`,
    502,
    'FEEDBACK_REPORT_CONTRACT_INVALID',
    {field},
  );
}

function requireText(value: unknown, field: string): string {
  const text = stringValue(value);

  if (!text) {
    throw feedbackContractError(field, `${field} 값이 필요합니다.`);
  }

  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw feedbackContractError(field, `${field} 값은 boolean이어야 합니다.`);
  }

  return value;
}

function requireConfidence(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw feedbackContractError(field, `${field} 값은 0~1 사이 숫자여야 합니다.`);
  }

  return value;
}

function requireTextList(
  value: unknown,
  field: string,
  {
    maxItems,
    minItems = 0,
    unique = false,
  }: {
    maxItems: number;
    minItems?: number;
    unique?: boolean;
  },
): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw feedbackContractError(
      field,
      `${field} 값은 ${minItems}~${maxItems}개의 문자열 배열이어야 합니다.`,
    );
  }

  const values = value.map((item, index) =>
    requireText(item, `${field}[${index}]`),
  );

  if (unique && new Set(values).size !== values.length) {
    throw feedbackContractError(field, `${field} 값이 중복되었습니다.`);
  }

  return values;
}

function requireNullableText(
  source: Record<string, unknown>,
  key: string,
  field: string,
): string | null {
  if (!(key in source)) {
    throw feedbackContractError(field, `${field} 값이 필요합니다.`);
  }

  if (source[key] === null) {
    return null;
  }

  return requireText(source[key], field);
}

function mapDynamicCriteria(value: unknown): MakeupFeedbackDynamicCriterion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw feedbackContractError(
      'interpretedGoal.dynamicCriteria',
      '동적 평가 기준은 1~6개여야 합니다.',
    );
  }

  const seenIds = new Set<string>();

  return value.map((item, index) => {
    const field = `interpretedGoal.dynamicCriteria[${index}]`;

    if (!isObject(item)) {
      throw feedbackContractError(field, '동적 평가 기준 형식이 잘못되었습니다.');
    }

    const id = requireText(item.id, `${field}.id`);

    if (seenIds.has(id)) {
      throw feedbackContractError(`${field}.id`, '동적 평가 기준 id가 중복되었습니다.');
    }

    seenIds.add(id);

    return {
      criterion: requireText(item.criterion, `${field}.criterion`),
      derivedFrom: requireText(item.derivedFrom, `${field}.derivedFrom`),
      id,
    };
  });
}

function mapActionSteps(value: unknown, index: number): string[] {
  return requireTextList(value, `evaluations[${index}].actionSteps`, {
    maxItems: 3,
  });
}

function mapInterpretedGoal(
  value: unknown,
): MakeupFeedbackCompletedResult['interpretedGoal'] {
  if (!isObject(value)) {
    throw feedbackContractError('interpretedGoal', '분석 목적 형식이 잘못되었습니다.');
  }

  const intensity = value.intensity;

  if (intensity !== 'light' && intensity !== 'medium' && intensity !== 'bold') {
    throw feedbackContractError('interpretedGoal.intensity', '분석 목적 강도가 잘못되었습니다.');
  }

  return {
    assumptions: requireTextList(value.assumptions, 'interpretedGoal.assumptions', {
      maxItems: 4,
    }),
    dynamicCriteria: mapDynamicCriteria(value.dynamicCriteria),
    explicitFacts: requireTextList(value.explicitFacts, 'interpretedGoal.explicitFacts', {
      maxItems: 6,
      minItems: 1,
    }),
    intensity,
    label: localizeMakeupFeedbackIntensityTerms(
      requireText(value.label, 'interpretedGoal.label'),
    ),
    reason: localizeMakeupFeedbackIntensityTerms(
      requireText(value.reason, 'interpretedGoal.reason'),
    ),
    unknowns: requireTextList(value.unknowns, 'interpretedGoal.unknowns', {
      maxItems: 6,
    }),
  };
}

function mapCaptureQuality(value: unknown): MakeupFeedbackCaptureQuality {
  if (!isObject(value)) {
    throw feedbackContractError('captureQuality', '촬영 품질 형식이 잘못되었습니다.');
  }

  if (!isConfidenceLevel(value.colorConfidence)) {
    throw feedbackContractError(
      'captureQuality.colorConfidence',
      '색상 신뢰도 값이 잘못되었습니다.',
    );
  }

  if (!Array.isArray(value.issues) || value.issues.length > 6) {
    throw feedbackContractError(
      'captureQuality.issues',
      '촬영 품질 이슈는 최대 6개 배열이어야 합니다.',
    );
  }

  const seenCodes = new Set<string>();
  const issues = value.issues.map((issue, index) => {
    const field = `captureQuality.issues[${index}]`;

    if (!isObject(issue)) {
      throw feedbackContractError(field, '촬영 품질 이슈 형식이 잘못되었습니다.');
    }

    const code = requireText(issue.code, `${field}.code`);

    if (seenCodes.has(code)) {
      throw feedbackContractError(`${field}.code`, '촬영 품질 이슈 코드가 중복되었습니다.');
    }

    seenCodes.add(code);
    const affectedTopicIds = requireTextList(
      issue.affectedTopicIds,
      `${field}.affectedTopicIds`,
      {maxItems: MAKEUP_FEEDBACK_TOPICS.length, unique: true},
    );

    affectedTopicIds.forEach((topicId, topicIndex) => {
      if (!isTopicId(topicId)) {
        throw feedbackContractError(
          `${field}.affectedTopicIds[${topicIndex}]`,
          `알 수 없는 평가 부위입니다: ${topicId}`,
        );
      }
    });

    return {
      affectedTopicIds: affectedTopicIds as MakeupFeedbackTopicId[],
      code,
      message: requireText(issue.message, `${field}.message`),
    };
  });

  return {
    colorConfidence: value.colorConfidence,
    detectorAvailable: requireBoolean(
      value.detectorAvailable,
      'captureQuality.detectorAvailable',
    ),
    issues,
    usable: requireBoolean(value.usable, 'captureQuality.usable'),
  };
}

function mapObservations(value: unknown, index: number): MakeupFeedbackObservation[] {
  const field = `evaluations[${index}].observations`;

  if (!Array.isArray(value) || value.length > 3) {
    throw feedbackContractError(field, '관찰 근거는 최대 3개 배열이어야 합니다.');
  }

  const seenIds = new Set<string>();

  return value.map((observation, observationIndex) => {
    const observationField = `${field}[${observationIndex}]`;

    if (!isObject(observation)) {
      throw feedbackContractError(observationField, '관찰 근거 형식이 잘못되었습니다.');
    }

    const id = requireText(observation.id, `${observationField}.id`);

    if (seenIds.has(id)) {
      throw feedbackContractError(`${observationField}.id`, '관찰 근거 id가 중복되었습니다.');
    }

    seenIds.add(id);

    const regionIds = observation.evidenceRegionIds == null
      ? []
      : requireTextList(
          observation.evidenceRegionIds,
          `${observationField}.evidenceRegionIds`,
          {maxItems: 2, minItems: 1, unique: true},
        );

    regionIds.forEach((regionId, regionIndex) => {
      if (!isEvidenceRegionId(regionId)) {
        throw feedbackContractError(
          `${observationField}.evidenceRegionIds[${regionIndex}]`,
          '알 수 없는 분석 영역입니다: ' + regionId,
        );
      }
    });

    return {
      claim: requireText(observation.claim, `${observationField}.claim`),
      evidenceLocation: requireText(
        observation.evidenceLocation,
        `${observationField}.evidenceLocation`,
      ),
      evidenceRegionIds: regionIds as MakeupFeedbackEvidenceRegionId[],
      id,
      lightingSensitive: requireBoolean(
        observation.lightingSensitive,
        `${observationField}.lightingSensitive`,
      ),
    };
  });
}


function mapSummary(value: unknown): MakeupFeedbackSummary {
  if (!isObject(value)) {
    throw feedbackContractError('summary', '요약 형식이 잘못되었습니다.');
  }

  return {
    improvementSummary: requireText(
      value.improvementSummary,
      'summary.improvementSummary',
    ),
    strengthSummary: requireText(
      value.strengthSummary,
      'summary.strengthSummary',
    ),
  };
}

function mapEvaluations(
  value: unknown,
  criterionIds: ReadonlySet<string>,
): MakeupFeedbackEvaluation[] {
  if (!Array.isArray(value) || value.length !== MAKEUP_FEEDBACK_TOPICS.length) {
    throw feedbackContractError(
      'evaluations',
      `${MAKEUP_FEEDBACK_TOPICS.length}개 평가가 정확히 필요합니다.`,
    );
  }

  const seenTopicIds = new Set<MakeupFeedbackTopicId>();
  const seenObservationIds = new Set<string>();
  const mappedByTopic = new Map<MakeupFeedbackTopicId, MakeupFeedbackEvaluation>();

  value.forEach((item, index) => {
    const field = `evaluations[${index}]`;

    if (!isObject(item)) {
      throw feedbackContractError(field, '평가 항목 형식이 잘못되었습니다.');
    }

    const rawTopicId = item.topicId;

    if (!isTopicId(rawTopicId)) {
      throw feedbackContractError(
        `${field}.topicId`,
        `알 수 없는 평가 부위입니다: ${String(rawTopicId)}`,
      );
    }

    if (seenTopicIds.has(rawTopicId)) {
      throw feedbackContractError(
        `${field}.topicId`,
        `${rawTopicId} 평가가 중복되었습니다.`,
      );
    }

    const topic = topicById.get(rawTopicId);

    if (!topic) {
      throw feedbackContractError(`${field}.topicId`, '평가 부위 정의를 찾지 못했습니다.');
    }

    if (requireText(item.topicLabel, `${field}.topicLabel`) !== topic.label) {
      throw feedbackContractError(
        `${field}.topicLabel`,
        `${rawTopicId} 부위 이름이 앱 정의와 일치하지 않습니다.`,
      );
    }

    if (!isEvaluationStatus(item.status)) {
      throw feedbackContractError(
        `${field}.status`,
        `${rawTopicId} 평가 상태가 잘못되었습니다.`,
      );
    }

    if (!isVisibility(item.visibility)) {
      throw feedbackContractError(
        `${field}.visibility`,
        `${rawTopicId} 가시성 값이 잘못되었습니다.`,
      );
    }

    if (!isScoreImpact(item.scoreImpact)) {
      throw feedbackContractError(
        `${field}.scoreImpact`,
        `${rawTopicId} 점수 영향도 값이 잘못되었습니다.`,
      );
    }

    const actionSteps = mapActionSteps(item.actionSteps, index);
    const goalCriterionIds = requireTextList(
      item.goalCriterionIds,
      `${field}.goalCriterionIds`,
      {maxItems: 6, unique: true},
    );
    const observations = mapObservations(item.observations, index);
    const visibilityReason = requireNullableText(
      item,
      'visibilityReason',
      `${field}.visibilityReason`,
    );
    const isAssessable =
      item.status === 'strength' ||
      item.status === 'improvement' ||
      item.status === 'optional';

    if (item.visibility === 'clear' && visibilityReason !== null) {
      throw feedbackContractError(
        `${field}.visibilityReason`,
        'clear 가시성에는 사유가 없어야 합니다.',
      );
    }

    if (item.visibility !== 'clear' && visibilityReason === null) {
      throw feedbackContractError(
        `${field}.visibilityReason`,
        '부분 또는 비노출 가시성에는 사유가 필요합니다.',
      );
    }

    if (isAssessable) {
      if (item.visibility === 'not_visible') {
        throw feedbackContractError(
          `${field}.visibility`,
          '평가 가능한 항목은 not_visible일 수 없습니다.',
        );
      }

      if (observations.length === 0 || goalCriterionIds.length === 0) {
        throw feedbackContractError(
          field,
          '평가 가능한 항목에는 관찰 근거와 목적 기준이 필요합니다.',
        );
      }
    } else if (
      observations.length > 0 ||
      goalCriterionIds.length > 0 ||
      actionSteps.length > 0
    ) {
      throw feedbackContractError(
        field,
        '판단 불가/비적용 항목에는 근거·기준·추천 단계를 넣을 수 없습니다.',
      );
    }

    if (item.status === 'not_assessable' && item.visibility === 'clear') {
      throw feedbackContractError(
        `${field}.visibility`,
        '판단 불가 항목은 partial 또는 not_visible이어야 합니다.',
      );
    }

    const unknownCriterionIds = goalCriterionIds.filter(id => !criterionIds.has(id));

    if (unknownCriterionIds.length > 0) {
      throw feedbackContractError(
        `${field}.goalCriterionIds`,
        `알 수 없는 목적 기준 id입니다: ${unknownCriterionIds.join(', ')}`,
      );
    }

    observations.forEach(observation => {
      if (seenObservationIds.has(observation.id)) {
        throw feedbackContractError(
          `${field}.observations`,
          `관찰 근거 id가 중복되었습니다: ${observation.id}`,
        );
      }

      seenObservationIds.add(observation.id);
    });

    seenTopicIds.add(rawTopicId);
    mappedByTopic.set(rawTopicId, {
      actionSteps,
      confidence: requireConfidence(item.confidence, `${field}.confidence`),
      description: requireText(item.description, `${field}.description`),
      goalCriterionIds,
      id:
        firstText(stringValue(item.id), `${rawTopicId}-${item.status}`) ??
        `${rawTopicId}-${item.status}`,
      kind: topic.kind,
      observations,
      scoreImpact: item.scoreImpact,
      status: item.status,
      title: requireText(item.title, `${field}.title`),
      topicId: rawTopicId,
      topicLabel: topic.label,
      visibility: item.visibility,
      visibilityReason,
    });
  });

  const missingTopicIds = MAKEUP_FEEDBACK_TOPICS
    .filter(topic => !seenTopicIds.has(topic.id))
    .map(topic => topic.id);

  if (missingTopicIds.length > 0) {
    throw feedbackContractError(
      'evaluations',
      `누락된 평가 부위가 있습니다: ${missingTopicIds.join(', ')}`,
    );
  }

  return MAKEUP_FEEDBACK_TOPICS.map(topic => mappedByTopic.get(topic.id)!);
}

function buildPointsFromEvaluations(evaluations: MakeupFeedbackEvaluation[]): MakeupFeedbackCorrectionPoint[] {
  return evaluations
    .filter(
      evaluation =>
        evaluation.status === 'improvement' || evaluation.status === 'optional',
    )
    .map(evaluation => ({
      id: `${evaluation.topicId}-point`,
      topicId: evaluation.topicId,
      topicLabel: evaluation.topicLabel,
      title: evaluation.title,
      description: evaluation.description,
      actionSteps: evaluation.actionSteps,
      actionLabel: '보완 포인트',
      kind: evaluation.kind,
    }));
}

function buildStrengthsFromEvaluations(evaluations: MakeupFeedbackEvaluation[]): MakeupFeedbackStrength[] {
  return evaluations
    .filter(evaluation => evaluation.status === 'strength')
    .map((evaluation, index) => ({
      id: `${evaluation.topicId}-strength`,
      topicId: evaluation.topicId,
      topicLabel: evaluation.topicLabel,
      title: evaluation.title,
      description: evaluation.description,
      actionSteps: evaluation.actionSteps,
      icon: (index % 2 === 0 ? 'sparkle' : 'heart') as MakeupFeedbackStrength['icon'],
      kind: evaluation.kind,
    }));
}

function getFeedbackContext(selection: MakeupFeedbackPhotoSelection) {
  const userGoalText = selection.feedbackContext?.userGoalText?.trim() ?? '';
  const originalGoalText = selection.feedbackContext?.originalGoalText?.trim() || userGoalText;
  const normalizedGoalText = selection.feedbackContext?.normalizedGoalText?.trim() || userGoalText;

  return {
    goalIntentType: selection.feedbackContext?.goalIntentType ?? 'valid_context',
    normalizedGoalText,
    originalGoalText,
    profileGender: selection.feedbackContext?.profileGender ?? null,
    userGoalText: normalizedGoalText,
  };
}

export function mapBackendJobToFeedbackOutcome(
  job: BackendFeedbackJob,
  selection: MakeupFeedbackPhotoSelection,
): MakeupFeedbackAnalysisOutcome {
  const backendResult = job.feedbackPayload?.result;

  if (!selection.imageUri) {
    throw feedbackContractError('selection.imageUri', '분석한 사진 URI가 필요합니다.');
  }

  if (!isObject(backendResult)) {
    throw feedbackContractError('result', '분석 결과 객체가 필요합니다.');
  }

  if (
    backendResult.analysisDecision !== 'completed' &&
    backendResult.analysisDecision !== 'retake_required'
  ) {
    throw feedbackContractError(
      'analysisDecision',
      'analysisDecision 값은 completed 또는 retake_required여야 합니다.',
    );
  }

  const captureQuality = mapCaptureQuality(backendResult.captureQuality);
  const rawAnalysisStatus =
    job.feedbackPayload?.analysisStatus ?? job.feedbackPayload?.analysis_status;
  const analysisStatus =
    rawAnalysisStatus == null
      ? undefined
      : requireText(rawAnalysisStatus, 'analysisStatus');


  const rawModelVersion = backendResult.modelVersion ?? job.modelVersion;
  const modelVersion =
    rawModelVersion == null
      ? undefined
      : requireText(rawModelVersion, 'modelVersion');
  const photoSourceLabel =
    firstText(stringValue(backendResult.photoSourceLabel), job.sourceLabel) ??
    '선택한 사진';
  const analysisId = requireText(job.id, 'job.id');
  const sharedOutcome = {
    analysisId,
    analysisStatus,
    captureQuality,
    id: analysisId,
    modelVersion,
    photoSource: selection.photoSource,
    photoSourceLabel,
    uploadedImage: {uri: selection.imageUri},
  };

  if (backendResult.analysisDecision === 'retake_required') {
    if (
      analysisStatus &&
      analysisStatus !== 'vision_retake_required' &&
      analysisStatus !== 'bedrock_completed'
    ) {
      throw feedbackContractError(
        'analysisStatus',
        '재촬영 결과의 분석 상태가 올바르지 않습니다.',
      );
    }

    if (captureQuality.usable || captureQuality.issues.length === 0) {
      throw feedbackContractError(
        'captureQuality',
        '재촬영 결과는 usable=false이고 한 개 이상의 품질 이슈가 필요합니다.',
      );
    }

    return {
      ...sharedOutcome,
      analysisDecision: 'retake_required',
    } satisfies MakeupFeedbackRetakeOutcome;
  }

  if (!captureQuality.usable) {
    throw feedbackContractError(
      'captureQuality.usable',
      '완료 결과는 분석 가능한 사진이어야 합니다.',
    );
  }

  if (analysisStatus !== 'bedrock_completed') {
    throw new BackendApiError(
      'AI 실분석이 완료되지 않았어요. 잠시 후 다시 시도해 주세요.',
      503,
      'FEEDBACK_REAL_AI_REQUIRED',
      {analysisStatus},
    );
  }

  const completedAnalysisStatus = analysisStatus;
  const completedModelVersion = requireText(modelVersion, 'modelVersion');

  if (
    typeof backendResult.score !== 'number' ||
    !Number.isFinite(backendResult.score) ||
    !Number.isInteger(backendResult.score) ||
    backendResult.score < 0 ||
    backendResult.score > 100
  ) {
    throw feedbackContractError('score', '0~100 사이의 정수 점수가 필요합니다.');
  }

  if (
    !Array.isArray(backendResult.scoreRange) ||
    backendResult.scoreRange.length !== 2 ||
    backendResult.scoreRange.some(
      score =>
        typeof score !== 'number' ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > 100,
    )
  ) {
    throw feedbackContractError('scoreRange', '0~100 정수 두 개의 점수 범위가 필요합니다.');
  }

  const scoreRange: [number, number] = [
    backendResult.scoreRange[0] as number,
    backendResult.scoreRange[1] as number,
  ];

  if (
    scoreRange[0] > scoreRange[1] ||
    backendResult.score < scoreRange[0] ||
    backendResult.score > scoreRange[1]
  ) {
    throw feedbackContractError('scoreRange', '점수 범위는 종합 점수를 포함해야 합니다.');
  }

  const scoreConfidence = mapScoreConfidence(backendResult.scoreConfidence);
  const hasAnalysisImageSize = backendResult.analysisImageSize != null;
  const hasEvidenceRegions = backendResult.evidenceRegions != null;
  if (hasAnalysisImageSize !== hasEvidenceRegions) {
    throw feedbackContractError(
      'evidenceRegions',
      '분석 이미지 크기와 영역 좌표는 함께 제공되어야 합니다.',
    );
  }
  const analysisImageSize = hasAnalysisImageSize
    ? mapAnalysisImageSize(backendResult.analysisImageSize)
    : undefined;
  const evidenceRegions = hasEvidenceRegions
    ? mapEvidenceRegions(backendResult.evidenceRegions)
    : [];
  const availableEvidenceRegionIds = new Set(evidenceRegions.map(region => region.id));

  const interpretedGoal = mapInterpretedGoal(backendResult.interpretedGoal);
  const criterionIds = new Set(
    interpretedGoal.dynamicCriteria.map(criterion => criterion.id),
  );
  const evaluations = mapEvaluations(backendResult.evaluations, criterionIds);
  const evaluationStatusByObservationId = new Map<string, MakeupFeedbackEvaluationStatus>(
    evaluations.flatMap(evaluation =>
      (evaluation.observations ?? []).map(
        observation => [observation.id, evaluation.status] as const,
      ),
    ),
  );
  const observationIds = new Set(evaluationStatusByObservationId.keys());
  const unknownObservationRegionIds = evaluations.flatMap(evaluation =>
    (evaluation.observations ?? []).flatMap(observation =>
      (observation.evidenceRegionIds ?? []).filter(
        regionId => !availableEvidenceRegionIds.has(regionId),
      ),
    ),
  );
  if (unknownObservationRegionIds.length > 0) {
    throw feedbackContractError(
      'evaluations.observations.evidenceRegionIds',
      '응답에 없는 분석 영역이 관찰 근거에 연결되었습니다.',
    );
  }

  const scoreEvidenceIds = requireTextList(
    backendResult.scoreEvidenceIds,
    'scoreEvidenceIds',
    {maxItems: 16, minItems: 1, unique: true},
  );
  const unknownEvidenceIds = scoreEvidenceIds.filter(id => !observationIds.has(id));

  if (unknownEvidenceIds.length > 0) {
    throw feedbackContractError(
      'scoreEvidenceIds',
      `알 수 없는 관찰 근거 id입니다: ${unknownEvidenceIds.join(', ')}`,
    );
  }

  const disallowedEvidenceIds = scoreEvidenceIds.filter(id => {
    const status = evaluationStatusByObservationId.get(id);

    return status !== 'strength' && status !== 'improvement';
  });

  if (disallowedEvidenceIds.length > 0) {
    throw feedbackContractError(
      'scoreEvidenceIds',
      `점수 근거는 잘한 점 또는 보완할 점의 관찰 ID만 사용할 수 있습니다: ${disallowedEvidenceIds.join(', ')}`,
    );
  }

  const points = buildPointsFromEvaluations(evaluations);
  const strengths = buildStrengthsFromEvaluations(evaluations);
  const summaryBadges: MakeupFeedbackSummaryBadge[] = [
    {id: 'strength-count', label: `잘한 항목 ${strengths.length}개`},
    {id: 'improvement-count', label: `보완 항목 ${points.length}개`},
  ];

  return {
    ...sharedOutcome,
    analysisDecision: 'completed',
    analysisSource: 'ai',
    analysisStatus: completedAnalysisStatus,
    analysisImageSize,
    annotations: [],
    evaluations,
    evidenceRegions,
    interpretedGoal,
    modelVersion: completedModelVersion,
    points,
    score: backendResult.score,
    scoreConfidence,
    scoreEvidenceIds,
    scoreLabel:
      firstText(stringValue(backendResult.scoreLabel)) ?? '종합 점수',
    scoreRange,
    scoreReason: requireText(backendResult.scoreReason, 'scoreReason'),
    strengths,
    summary: mapSummary(backendResult.summary),
    summaryBadges,
  } satisfies MakeupFeedbackCompletedResult;
}

async function waitForCompleteFeedbackJob(
  initialJob: BackendFeedbackJob,
  selection: MakeupFeedbackPhotoSelection,
  startedAt: number,
): Promise<MakeupFeedbackAnalysisOutcome> {
  let currentJob = initialJob;

  while (true) {
    if (currentJob.feedbackPayload?.result) {
      console.info('[aura:makeup-feedback] report:ready', {
        durationMs: Date.now() - startedAt,
        jobId: currentJob.id ?? null,
        status: currentJob.status ?? null,
      });
      return mapBackendJobToFeedbackOutcome(currentJob, selection);
    }

    if (currentJob.status === 'failed') {
      throw new BackendApiError(
        currentJob.feedbackPayload?.error?.message ??
          '\uba54\uc774\ud06c\uc5c5 \ud53c\ub4dc\ubc31 \ubd84\uc11d \uc791\uc5c5\uc774 \uc2e4\ud328\ud588\uc5b4\uc694.',
        502,
        'FEEDBACK_JOB_FAILED',
        {jobId: currentJob.id ?? null},
      );
    }

    if (currentJob.status === 'completed') {
      throw new BackendApiError(
        '\ud53c\ub4dc\ubc31 \ubcf4\uace0\uc11c \uacb0\uacfc\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc5b4\uc694.',
        502,
        'FEEDBACK_REPORT_RESULT_REQUIRED',
        {jobId: currentJob.id ?? null},
      );
    }

    if (!currentJob.id) {
      throw new Error('Feedback job did not return a report id.');
    }

    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= FEEDBACK_ANALYSIS_TIMEOUT_MS) {
      throw new BackendApiError(
        '\ud53c\ub4dc\ubc31 \ubd84\uc11d\uc774 \uc544\uc9c1 \uc644\ub8cc\ub418\uc9c0 \uc54a\uc558\uc5b4\uc694. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.',
        504,
        'FEEDBACK_REPORT_TIMEOUT',
        {
          jobId: currentJob.id,
          status: currentJob.status ?? null,
        },
      );
    }

    console.info('[aura:makeup-feedback] report:poll', {
      elapsedMs,
      jobId: currentJob.id,
      nextPollMs: FEEDBACK_REPORT_POLL_INTERVAL_MS,
      status: currentJob.status ?? null,
    });

    await delay(Math.min(FEEDBACK_REPORT_POLL_INTERVAL_MS, FEEDBACK_ANALYSIS_TIMEOUT_MS - elapsedMs));

    const {report} = await requestBackendJson<GetFeedbackReportResponse>(
      '/feedback/reports/' + currentJob.id,
    );
    currentJob = report;
  }
}

async function createBackendMakeupFeedback(
  selection: MakeupFeedbackPhotoSelection,
  callbacks?: MakeupFeedbackAnalysisCallbacks,
): Promise<MakeupFeedbackAnalysisOutcome> {
  if (!selection.imageUri) {
    throw new BackendApiError(
      '분석할 메이크업 사진을 찾지 못했어요. 사진을 다시 선택해 주세요.',
      400,
      'FEEDBACK_IMAGE_REQUIRED',
    );
  }

  const uploadedPhoto = await uploadFaceCaptureImage({
    cameraMetadata: selection.cameraMetadata,
    captureType: 'makeup_feedback',
    contentType: selection.contentType,
    fileName: selection.fileName,
    height: selection.imageHeight ?? undefined,
    mediaKind: 'makeup_feedback',
    source: selection.photoSource,
    uri: selection.imageUri,
    width: selection.imageWidth ?? undefined,
  });
  const feedbackContext = getFeedbackContext(selection);
  const startedAt = Date.now();

  const {job} = await requestBackendJson<CreateFeedbackJobResponse>('/feedback/jobs', {
    body: {
      photoCaptureId: uploadedPhoto.photoCaptureId,
      uploadedMediaId: uploadedPhoto.mediaId,
      requestPayload: {
        feedbackContext,
        source: selection.photoSource,
        task: 'makeup_feedback_report_v2',
        topics: MAKEUP_FEEDBACK_TOPICS.map(topic => ({id: topic.id, label: topic.label})),
      },
      runImmediately: true,
      source: selection.photoSource,
      sourceLabel: selection.photoTitle ?? null,
    },
    method: 'POST',
    timeoutMs: FEEDBACK_ANALYSIS_TIMEOUT_MS,
  });

  if (!job.id) {
    throw new Error('Feedback job did not return a report id.');
  }
  callbacks?.onAnalysisCreated?.(job.id);

  return waitForCompleteFeedbackJob(job, selection, startedAt);
}

export async function analyzeMakeupForFeedback(
  selection: MakeupFeedbackPhotoSelection,
  callbacks?: MakeupFeedbackAnalysisCallbacks,
): Promise<MakeupFeedbackAnalysisOutcome> {
  if (!getBackendApiBaseUrl()) {
    throw new BackendApiError(
      'AI 피드백 서버 주소가 설정되지 않았어요.',
      503,
      'FEEDBACK_API_NOT_CONFIGURED',
    );
  }

  return createBackendMakeupFeedback(selection, callbacks);
}

export async function fetchMakeupFeedbackReport(
  reportId: string,
): Promise<MakeupFeedbackCompletedResult> {
  const {report} = await requestBackendJson<GetFeedbackReportResponse>(
    '/feedback/reports/' + encodeURIComponent(reportId),
  );
  const request = report.feedbackPayload?.request;
  const fallbackImageUri = appAssetUri('images/analysis/report-retake-20260608.png');
  const imageUri =
    stringValue(request?.cdnUrl) ??
    stringValue(request?.sourceUrl) ??
    fallbackImageUri;

  if (!imageUri) {
    throw new BackendApiError(
      '피드백 보고서 사진을 불러오지 못했어요.',
      502,
      'FEEDBACK_REPORT_IMAGE_REQUIRED',
      {reportId},
    );
  }

  const outcome = mapBackendJobToFeedbackOutcome(report, {
    imageUri,
    photoSource: report.source === 'camera' ? 'camera' : 'gallery',
    photoTitle: report.sourceLabel ?? undefined,
  });

  if (outcome.analysisDecision !== 'completed') {
    throw new BackendApiError(
      '완료된 메이크업 피드백 보고서가 아니에요.',
      409,
      'FEEDBACK_REPORT_NOT_COMPLETED',
      {reportId},
    );
  }

  return outcome;
}
