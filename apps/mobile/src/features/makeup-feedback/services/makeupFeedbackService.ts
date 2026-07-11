import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {BackendApiError, getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import type {
  MakeupFeedbackCorrectionPoint,
  MakeupFeedbackCorrectionPointKind,
  MakeupFeedbackEvaluation,
  MakeupFeedbackEvaluationStatus,
  MakeupFeedbackInterpretedGoal,
  MakeupFeedbackPhotoSelection,
  MakeupFeedbackResult,
  MakeupFeedbackScoreImpact,
  MakeupFeedbackStrength,
  MakeupFeedbackSummary,
  MakeupFeedbackSummaryBadge,
  MakeupFeedbackTopicId,
} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';

const MOCK_ANALYSIS_DELAY_MS = 1400;
const FEEDBACK_ANALYSIS_TIMEOUT_MS = 120000;
const FEEDBACK_REPORT_POLL_INTERVAL_MS = 2000;
const FEEDBACK_GOAL_VALIDATION_ERROR_CODES = new Set([
  'FEEDBACK_GOAL_INVALID',
  'FEEDBACK_GOAL_NEEDS_DETAIL',
  'FEEDBACK_GOAL_GUARDRAIL_BLOCKED',
]);

const topicById = new Map(MAKEUP_FEEDBACK_TOPICS.map(topic => [topic.id, topic]));

export function isMakeupFeedbackGoalValidationError(error: unknown): error is BackendApiError {
  return error instanceof BackendApiError && FEEDBACK_GOAL_VALIDATION_ERROR_CODES.has(error.code ?? '');
}

export function getMakeupFeedbackAnalysisErrorMessage(error: unknown): string {
  if (isMakeupFeedbackGoalValidationError(error)) {
    return error.message;
  }

  return '피드백 분석을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

type BackendFeedbackPayload = {
  error?: {details?: unknown; message?: string | null} | null;
  result?: {
    evaluations?: unknown;
    interpretedGoal?: MakeupFeedbackInterpretedGoal | null;
    photoSourceLabel?: string | null;
    points?: unknown;
    score?: number | null;
    scoreLabel?: string | null;
    strengths?: unknown;
    summary?: MakeupFeedbackSummary | null;
    summaryBadges?: MakeupFeedbackSummaryBadge[] | null;
  } | null;
} | null;

type BackendFeedbackJob = {
  feedbackPayload?: BackendFeedbackPayload;
  id?: string | null;
  score?: number | null;
  sourceLabel?: string | null;
  status?: 'cancelled' | 'completed' | 'failed' | 'pending' | 'processing' | null;
};

type CreateFeedbackJobResponse = {
  job: BackendFeedbackJob;
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
  return typeof value === 'string' ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTopicId(value: unknown): value is MakeupFeedbackTopicId {
  return typeof value === 'string' && topicById.has(value as MakeupFeedbackTopicId);
}

function isScoreImpact(value: unknown): value is MakeupFeedbackScoreImpact {
  return value === 'high' || value === 'medium' || value === 'low';
}

function normalizeKind(value: unknown, topicId: MakeupFeedbackTopicId): MakeupFeedbackCorrectionPointKind {
  if (value === 'eye' || value === 'cheek' || value === 'lip') {
    return value;
  }

  return topicById.get(topicId)?.kind ?? 'cheek';
}

function normalizeStatus(value: unknown): MakeupFeedbackEvaluationStatus {
  if (value === 'strength' || value === 'optional') {
    return value;
  }

  return 'improvement';
}

function mapEvaluations(value: unknown, fallback: MakeupFeedbackResult): MakeupFeedbackEvaluation[] {
  if (!Array.isArray(value)) {
    return fallback.evaluations;
  }

  const mapped = value.map((item, index): MakeupFeedbackEvaluation | null => {
    if (!isObject(item)) {
      return null;
    }

    const fallbackEvaluation = fallback.evaluations[index];
    const topicId = isTopicId(item.topicId) ? item.topicId : fallbackEvaluation?.topicId;

    if (!topicId) {
      return null;
    }

    const topic = topicById.get(topicId);
    const status = normalizeStatus(item.status);
    const description = stringValue(item.description);

    return {
      id: firstText(stringValue(item.id), `${topicId}-${status}`) ?? `${topicId}-${status}`,
      topicId,
      topicLabel: firstText(stringValue(item.topicLabel), topic?.label) ?? topicId,
      status,
      title: firstText(stringValue(item.title), topic?.label) ?? topicId,
      description: firstText(description, fallbackEvaluation?.description) ?? `${topic?.label ?? topicId} 피드백을 준비했어요.`,
      kind: normalizeKind(item.kind, topicId),
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
      scoreImpact: isScoreImpact(item.scoreImpact) ? item.scoreImpact : undefined,
    };
  });

  return mapped.filter((item): item is MakeupFeedbackEvaluation => Boolean(item));
}

function buildPointsFromEvaluations(evaluations: MakeupFeedbackEvaluation[]): MakeupFeedbackCorrectionPoint[] {
  return evaluations
    .filter(evaluation => evaluation.status === 'improvement')
    .map(evaluation => ({
      id: `${evaluation.topicId}-point`,
      topicId: evaluation.topicId,
      topicLabel: evaluation.topicLabel,
      title: evaluation.title,
      description: evaluation.description,
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

function mapBackendJobToFeedbackResult(
  job: BackendFeedbackJob,
  selection: MakeupFeedbackPhotoSelection,
): MakeupFeedbackResult {
  const fallback = createMockMakeupFeedback(selection);
  const backendResult = job.feedbackPayload?.result;
  const evaluations = mapEvaluations(backendResult?.evaluations, fallback);
  const points = buildPointsFromEvaluations(evaluations);
  const strengths = buildStrengthsFromEvaluations(evaluations);
  const summaryBadges = Array.isArray(backendResult?.summaryBadges) && backendResult.summaryBadges.length > 0
    ? backendResult.summaryBadges
    : [
        {id: 'strength-count', label: `잘한 항목 ${strengths.length}개`},
        {id: 'improvement-count', label: `보완 항목 ${points.length}개`},
        {id: 'topic-count', label: '10개 항목 분석'},
      ];

  return {
    ...fallback,
    id: firstText(job.id, fallback.id) ?? fallback.id,
    interpretedGoal: backendResult?.interpretedGoal ?? fallback.interpretedGoal,
    photoSourceLabel:
      firstText(backendResult?.photoSourceLabel, job.sourceLabel, fallback.photoSourceLabel) ??
      fallback.photoSourceLabel,
    score:
      typeof backendResult?.score === 'number'
        ? backendResult.score
        : typeof job.score === 'number'
          ? job.score
          : fallback.score,
    scoreLabel: firstText(backendResult?.scoreLabel, fallback.scoreLabel),
    summary: backendResult?.summary ?? fallback.summary,
    summaryBadges,
    annotations: [],
    evaluations,
    points,
    strengths,
  };
}

async function waitForCompleteFeedbackJob(
  initialJob: BackendFeedbackJob,
  selection: MakeupFeedbackPhotoSelection,
  startedAt: number,
): Promise<MakeupFeedbackResult> {
  let currentJob = initialJob;

  while (true) {
    if (currentJob.feedbackPayload?.result) {
      console.info('[aura:makeup-feedback] report:ready', {
        durationMs: Date.now() - startedAt,
        jobId: currentJob.id ?? null,
        status: currentJob.status ?? null,
      });
      return mapBackendJobToFeedbackResult(currentJob, selection);
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
): Promise<MakeupFeedbackResult> {
  if (!selection.imageUri) {
    return createMockMakeupFeedback(selection);
  }

  const uploadedPhoto = await uploadFaceCaptureImage({
    captureType: 'makeup_feedback',
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

  return waitForCompleteFeedbackJob(job, selection, startedAt);
}

export async function analyzeMakeupForFeedback(
  selection: MakeupFeedbackPhotoSelection,
): Promise<MakeupFeedbackResult> {
  if (!getBackendApiBaseUrl()) {
    await delay(MOCK_ANALYSIS_DELAY_MS);
    return createMockMakeupFeedback(selection);
  }

  try {
    return await createBackendMakeupFeedback(selection);
  } catch (error) {
    if (isMakeupFeedbackGoalValidationError(error)) {
      throw error;
    }

    console.info('[aura:makeup-feedback] backend-analysis:fallback', {
      message: error instanceof Error ? error.message : String(error),
      source: selection.photoSource,
    });
    await delay(420);
    return createMockMakeupFeedback(selection);
  }
}
