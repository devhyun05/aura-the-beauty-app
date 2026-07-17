import {requestBackendJson} from '../../../shared/services/backendApi';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationImageStatus,
} from '../types';

export const MAKEUP_RECOMMENDATION_EVENT_NAMES = [
  'makeup_recommendation_opened',
  'analysis_report_selected',
  'makeup_situation_selected',
  'makeup_keyword_selected',
  'custom_situation_submitted',
  'recommendation_question_answered',
  'recommendation_generation_started',
  'recommendation_text_completed',
  'recommendation_image_completed',
  'recommendation_image_failed',
  'recommendation_area_opened',
  'recommendation_ar_applied',
] as const;

export type MakeupRecommendationEventName = typeof MAKEUP_RECOMMENDATION_EVENT_NAMES[number];

export type MakeupRecommendationEventMetadata = {
  id?: string;
  category?: string;
  modelVersion?: string;
  durationMs?: number;
  status?: string;
};

export type MakeupRecommendationTelemetryEvent = {
  eventName: MakeupRecommendationEventName;
  metadata: MakeupRecommendationEventMetadata;
};

const STRING_LIMITS = {
  id: 160,
  category: 80,
  modelVersion: 80,
  status: 40,
} as const;

function safeMetadataString(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, limit) : undefined;
}

export function sanitizeMakeupRecommendationEventMetadata(
  metadata: Record<string, unknown> = {},
): MakeupRecommendationEventMetadata {
  const durationMs = typeof metadata.durationMs === 'number'
    && Number.isFinite(metadata.durationMs)
    && metadata.durationMs >= 0
    ? Math.round(metadata.durationMs)
    : undefined;
  return {
    id: safeMetadataString(metadata.id, STRING_LIMITS.id),
    category: safeMetadataString(metadata.category, STRING_LIMITS.category),
    modelVersion: safeMetadataString(metadata.modelVersion, STRING_LIMITS.modelVersion),
    durationMs,
    status: safeMetadataString(metadata.status, STRING_LIMITS.status),
  };
}

export function trackMakeupRecommendationEvent(
  eventName: MakeupRecommendationEventName,
  metadata: MakeupRecommendationEventMetadata = {},
  backendRequest: typeof requestBackendJson = requestBackendJson,
): void {
  const safeMetadata = sanitizeMakeupRecommendationEventMetadata(metadata);
  try {
    void backendRequest<unknown>('/makeup-recommendations/events', {
      method: 'POST',
      body: {eventName, metadata: safeMetadata},
    }).catch(() => undefined);
  } catch {
    // Observability must never interrupt the recommendation flow.
  }
}

type ImageStatusInput = {
  contextId: string;
  reportStatus?: MakeupRecommendationImageStatus;
  looks: readonly Pick<MakeupLookRecommendation, 'id' | 'role' | 'imageStatus'>[];
};

function terminalImageEvents({
  contextId,
  reportStatus,
  looks,
}: ImageStatusInput): Array<MakeupRecommendationTelemetryEvent & {dedupeKey: string}> {
  const lookEvents = looks.flatMap(look => {
    const terminalStatus = look.imageStatus === 'completed' || look.imageStatus === 'failed'
      ? look.imageStatus
      : reportStatus === 'completed' || reportStatus === 'failed'
        ? reportStatus
        : undefined;
    if (!terminalStatus) return [];
    const eventName = terminalStatus === 'completed'
      ? 'recommendation_image_completed'
      : 'recommendation_image_failed';
    return [{
      dedupeKey: `${contextId}:${look.id}:${eventName}`,
      eventName,
      metadata: {
        id: `${contextId}:${look.id}`,
        category: look.role,
        status: terminalStatus,
      },
    } satisfies MakeupRecommendationTelemetryEvent & {dedupeKey: string}];
  });
  if (lookEvents.length > 0) return lookEvents;

  if (!['completed', 'failed', 'partial'].includes(reportStatus ?? '')) return [];
  const failed = reportStatus === 'failed' || reportStatus === 'partial';
  const eventName = failed ? 'recommendation_image_failed' : 'recommendation_image_completed';
  return [{
    dedupeKey: `${contextId}:report:${eventName}`,
    eventName,
    metadata: {id: contextId, category: 'report', status: reportStatus},
  }];
}

export function markKnownMakeupRecommendationImageEvents(
  input: ImageStatusInput,
  emittedKeys: Set<string>,
): void {
  terminalImageEvents(input).forEach(event => emittedKeys.add(event.dedupeKey));
}

export function takeNewMakeupRecommendationImageEvents(
  input: ImageStatusInput,
  emittedKeys: Set<string>,
): MakeupRecommendationTelemetryEvent[] {
  const next: MakeupRecommendationTelemetryEvent[] = [];
  terminalImageEvents(input).forEach(({dedupeKey, eventName, metadata}) => {
    if (emittedKeys.has(dedupeKey)) return;
    emittedKeys.add(dedupeKey);
    next.push({eventName, metadata});
  });
  return next;
}
