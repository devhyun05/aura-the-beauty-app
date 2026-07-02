import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import type {
  MakeupFeedbackCorrectionPoint,
  MakeupFeedbackCorrectionPointKind,
  MakeupFeedbackEvaluation,
  MakeupFeedbackEvaluationStatus,
  MakeupFeedbackPhotoSelection,
  MakeupFeedbackResult,
  MakeupFeedbackStrength,
  MakeupFeedbackSummaryBadge,
  MakeupFeedbackTopicId,
} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';

const MOCK_ANALYSIS_DELAY_MS = 1400;
const FEEDBACK_ANALYSIS_TIMEOUT_MS = 120000;

const topicById = new Map(MAKEUP_FEEDBACK_TOPICS.map(topic => [topic.id, topic]));

type BackendFeedbackPayload = {
  result?: {
    evaluations?: unknown;
    photoSourceLabel?: string | null;
    points?: unknown;
    score?: number | null;
    strengths?: unknown;
    summaryBadges?: MakeupFeedbackSummaryBadge[] | null;
  } | null;
} | null;

type BackendFeedbackJob = {
  feedbackPayload?: BackendFeedbackPayload;
  id?: string | null;
  score?: number | null;
  sourceLabel?: string | null;
};

type CreateFeedbackJobResponse = {
  job: BackendFeedbackJob;
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => Boolean(value?.trim()))?.trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTopicId(value: unknown): value is MakeupFeedbackTopicId {
  return typeof value === 'string' && topicById.has(value as MakeupFeedbackTopicId);
}

function normalizeKind(value: unknown, topicId: MakeupFeedbackTopicId): MakeupFeedbackCorrectionPointKind {
  if (value === 'eye' || value === 'cheek' || value === 'lip') {
    return value;
  }

  return topicById.get(topicId)?.kind ?? 'cheek';
}

function normalizeStatus(value: unknown): MakeupFeedbackEvaluationStatus {
  return value === 'strength' ? 'strength' : 'improvement';
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
    const description = typeof item.description === 'string' ? item.description : undefined;

    return {
      id: firstText(String(item.id ?? ''), `${topicId}-${status}`) ?? `${topicId}-${status}`,
      topicId,
      topicLabel: firstText(String(item.topicLabel ?? ''), topic?.label) ?? topicId,
      status,
      title: firstText(String(item.title ?? ''), topic?.label) ?? topicId,
      description: firstText(description, fallbackEvaluation?.description) ?? `${topic?.label ?? topicId} 항목을 분석했어요.`,
      kind: normalizeKind(item.kind, topicId),
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
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
    photoSourceLabel:
      firstText(backendResult?.photoSourceLabel, job.sourceLabel, fallback.photoSourceLabel) ??
      fallback.photoSourceLabel,
    score:
      typeof backendResult?.score === 'number'
        ? backendResult.score
        : typeof job.score === 'number'
          ? job.score
          : fallback.score,
    summaryBadges,
    annotations: [],
    evaluations,
    points,
    strengths,
  };
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

  const {job} = await requestBackendJson<CreateFeedbackJobResponse>('/feedback/jobs', {
    body: {
      photoCaptureId: uploadedPhoto.photoCaptureId,
      uploadedMediaId: uploadedPhoto.mediaId,
      requestPayload: {
        bucket: uploadedPhoto.bucket,
        cdnUrl: uploadedPhoto.cdnUrl ?? null,
        contentType: uploadedPhoto.contentType ?? 'image/jpeg',
        imageUrl: uploadedPhoto.cdnUrl ?? null,
        objectKey: uploadedPhoto.objectKey,
        source: selection.photoSource,
        sourceUri: selection.imageUri,
        task: 'makeup_feedback_report_v1',
        topics: MAKEUP_FEEDBACK_TOPICS.map(topic => ({id: topic.id, label: topic.label})),
      },
      runImmediately: true,
      source: selection.photoSource,
      sourceLabel: selection.photoTitle ?? (selection.photoSource === 'gallery' ? '앨범 사진' : '촬영 사진'),
    },
    method: 'POST',
    timeoutMs: FEEDBACK_ANALYSIS_TIMEOUT_MS,
  });

  return mapBackendJobToFeedbackResult(job, selection);
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
    console.info('[aura:makeup-feedback] backend-analysis:fallback', {
      message: error instanceof Error ? error.message : String(error),
      source: selection.photoSource,
    });
    await delay(420);
    return createMockMakeupFeedback(selection);
  }
}