import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

export type MakeupFeedbackAgentId = 'photo' | 'goal' | 'detail' | 'coach';

export const MAKEUP_FEEDBACK_REVIEW_CREW_LABELS = {
  photo: {name: '루미', role: '사진 상태'},
  goal: {name: '모아', role: '목적 해석'},
  detail: {name: '루페', role: '부위별 관찰'},
  coach: {name: '다듬', role: '실행 코칭'},
} as const satisfies Record<MakeupFeedbackAgentId, {name: string; role: string}>;

export type MakeupFeedbackAgentConferenceMessage = {
  id: string;
  agentId: MakeupFeedbackAgentId;
  text: string;
  phase: 'safe' | 'preview' | 'closing';
  /** Grounding traces are validated by the backend and intentionally not rendered. */
  contextRefs?: readonly string[];
  evidenceRefs?: readonly string[];
};

export type MakeupFeedbackConferencePreviewContext = {
  messages: Array<Pick<MakeupFeedbackAgentConferenceMessage, 'agentId' | 'text'>>;
  summary?: string;
  lastSpeaker?: MakeupFeedbackAgentId;
};

export type MakeupFeedbackConferencePreview = {
  messages: MakeupFeedbackAgentConferenceMessage[];
  summary?: string;
  lastSpeaker?: MakeupFeedbackAgentId;
  generationStatus?: string;
};

export type MakeupFeedbackConferenceConversationSeed = Pick<
  MakeupFeedbackAgentConferenceMessage,
  'agentId' | 'text'
>;

export const MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES = 4;

function clampUnitInterval(value: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0.5, 0), 1);
}

export function getMakeupFeedbackTypingDelayMs(randomValue = Math.random()) {
  return Math.round(800 + clampUnitInterval(randomValue) * 600);
}

export function getMakeupFeedbackInitialTypingDelayMs(randomValue = Math.random()) {
  return Math.round(500 + clampUnitInterval(randomValue) * 400);
}

export function getMakeupFeedbackMessageExposureDelayMs(
  text: string,
  randomValue = Math.random(),
) {
  const length = text.trim().length;
  const [minimum, maximum] = length <= 45
    ? [1800, 2400]
    : length <= 90
      ? [2500, 3200]
      : [3200, 4200];

  return Math.round(minimum + clampUnitInterval(randomValue) * (maximum - minimum));
}

const validAgentIds = new Set<MakeupFeedbackAgentId>([
  'photo',
  'goal',
  'detail',
  'coach',
]);

const legacyAgentIds = new Set(['tone', 'color', 'style', 'quality']);


function trimText(value?: string | null) {
  return value?.trim() || undefined;
}

function shorten(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function getGoalLabel(selection: MakeupFeedbackPhotoSelection) {
  const goalText = trimText(selection.feedbackContext?.userGoalText);

  return goalText ? shorten(goalText, 28) : undefined;
}

function getSourceLabel(selection: MakeupFeedbackPhotoSelection) {
  return selection.photoSource === 'gallery' ? '앨범에서 고른 사진' : '방금 촬영한 사진';
}

function pickVariant<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function message(
  id: string,
  agentId: MakeupFeedbackAgentId,
  text: string,
  phase: MakeupFeedbackAgentConferenceMessage['phase'] = 'safe',
  evidenceRefs?: readonly string[],
): MakeupFeedbackAgentConferenceMessage {
  return {id, agentId, phase, text, ...(evidenceRefs ? {evidenceRefs} : {})};
}

function withSessionIds(
  messages: readonly MakeupFeedbackAgentConferenceMessage[],
): MakeupFeedbackAgentConferenceMessage[] {
  const sessionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return messages.map((item, index) => ({
    ...item,
    id: `${item.id}-${sessionId}-${index}`,
  }));
}

export function buildMakeupFeedbackSafeConferenceMessages(
  selection: MakeupFeedbackPhotoSelection,
): readonly MakeupFeedbackAgentConferenceMessage[] {
  const sourceLabel = getSourceLabel(selection);
  const goalLabel = getGoalLabel(selection)
    ?.replace(/[.!?。！？]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const seedCopy = goalLabel
    ? `“${goalLabel}” 목적에 맞춰 ${sourceLabel}에서 무엇을 확인할지 먼저 기준을 잡아볼게요.`
    : `${sourceLabel}에서 요청하신 피드백에 필요한 확인 기준부터 먼저 잡아볼게요.`;

  const fallbackTails = [
    [
      message(
        'safe-photo-context-a',
        'photo',
        `${sourceLabel}의 조명과 선명도가 판단에 주는 영향부터 나눠볼게요.`,
      ),
      message(
        'safe-detail-context-a',
        'detail',
        '그 기준을 받으면 사진에서 확인되는 부위만 근거로 연결해볼게요.',
      ),
      message(
        'safe-coach-context-a',
        'coach',
        '두 기준이 잡히면 잘한 점과 보완할 점을 실행하기 쉬운 순서로 묶어드릴게요.',
      ),
    ],
    [
      message(
        'safe-photo-context-b',
        'photo',
        `그 전에 ${sourceLabel}의 촬영 조건이 색과 경계를 흐리지 않는지 살펴볼게요.`,
      ),
      message(
        'safe-detail-context-b',
        'detail',
        '좋아요. 확인되지 않은 부분은 추측하지 않고, 보이는 근거끼리만 이어볼게요.',
      ),
      message(
        'safe-coach-context-b',
        'coach',
        '확인 범위가 정리되면 유지할 점과 바꿀 점을 바로 적용하기 쉬운 순서로 이어볼게요.',
      ),
    ],
    [
      message(
        'safe-photo-context-c',
        'photo',
        `${sourceLabel}부터 볼게요. 지금은 결과를 단정하지 않고 분석 가능한 조건인지 확인 중이에요.`,
      ),
      message(
        'safe-detail-context-c',
        'detail',
        '그다음 잘한 점과 보완할 점이 같은 관찰에서 자연스럽게 이어지도록 묶어볼게요.',
      ),
      message(
        'safe-coach-context-c',
        'coach',
        '그 흐름대로 확인이 끝나면 핵심 변화부터 짧고 분명하게 정리해드릴게요.',
      ),
    ],
  ] as const;

  return withSessionIds([
    message('safe-goal-seed', 'goal', seedCopy),
    ...pickVariant(fallbackTails),
  ]);
}

function normalizeEvidenceText(value?: string | null) {
  return trimText(value)?.replace(/\s+/g, ' ');
}

function toEvidenceToken(value: string | undefined, fallback: string) {
  const normalized = normalizeEvidenceText(value)?.toLowerCase() ?? '';
  const token = normalized.replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  const shortened = (token.slice(0, 48) || fallback).replace(/^[-_]+|[-_]+$/g, '');

  return shortened || fallback;
}

type FallbackVisibleItem =
  | MakeupFeedbackResult['strengths'][number]
  | MakeupFeedbackResult['points'][number];

type FallbackActionEvidence = {
  ref: string;
  text: string;
};

function getPrimaryActionEvidence(
  result: MakeupFeedbackResult,
  target: FallbackVisibleItem,
): FallbackActionEvidence | undefined {
  const actionsByTopic = new Map<string, Map<string, FallbackActionEvidence>>();
  let targetEvidence: FallbackActionEvidence | undefined;
  const visibleItems: FallbackVisibleItem[] = [
    ...result.strengths.slice(0, 4),
    ...result.points.slice(0, 4),
  ];

  for (const item of visibleItems) {
    const topicToken = toEvidenceToken(item.topicId, 'item-1');
    const topicActions = actionsByTopic.get(topicToken) ?? new Map();

    if (!actionsByTopic.has(topicToken)) {
      actionsByTopic.set(topicToken, topicActions);
    }

    for (const rawAction of item.actionSteps.slice(0, 3)) {
      const action = normalizeEvidenceText(rawAction);

      if (!action) {
        continue;
      }

      const actionKey = action.toLowerCase();
      let evidence = topicActions.get(actionKey);

      if (!evidence) {
        evidence = {
          ref: `action:${topicToken}:${topicActions.size + 1}`,
          text: action,
        };
        topicActions.set(actionKey, evidence);
      }

      if (item === target && !targetEvidence) {
        targetEvidence = evidence;
      }
    }
  }

  return targetEvidence;
}

function getResultGoalLabel(result: MakeupFeedbackResult) {
  const label = trimText(result.interpretedGoal?.label);

  return !label || label === '목적 맞춤 메이크업' ? '사용 목적' : `“${shorten(label, 26)}”`;
}

export function buildMakeupFeedbackClosingConferenceMessages(
  result: MakeupFeedbackResult,
  previousAgentId?: MakeupFeedbackAgentId,
): readonly MakeupFeedbackAgentConferenceMessage[] {
  const messages: MakeupFeedbackAgentConferenceMessage[] = [];
  const interpretedGoalLabel = trimText(result.interpretedGoal?.label);
  const goalLabel = getResultGoalLabel(result);
  const primaryCriterion = result.interpretedGoal?.dynamicCriteria?.[0];
  const captureQuality = result.captureQuality;
  const captureIssue = captureQuality?.issues[0];
  const strength = result.strengths[0];
  const point = result.points[0];
  const strengthTitles = result.strengths
    .map(item => trimText(item.title))
    .filter((title): title is string => Boolean(title));
  const pointTitles = result.points
    .map(item => trimText(item.title))
    .filter((title): title is string => Boolean(title));
  const hasPhotoMessage = Boolean(captureQuality);

  if (captureQuality) {
    if (captureIssue) {
      messages.push(
        message(
          'closing-photo-issue',
          'photo',
          `사진 상태부터 보면 “${shorten(captureIssue.message, 86)}”을 감안해야 해요. 이 범위를 넘어서 단정하지 않을게요.`,
          'closing',
          [`capture:${toEvidenceToken(captureIssue.code, 'issue-1')}`],
        ),
      );
    } else {
      messages.push(
        message(
          'closing-photo-usable',
          'photo',
          captureQuality.usable
            ? '사진은 메이크업 피드백에 사용할 수 있는 상태로 확인됐어요. 이제 보이는 관찰만 이어갈게요.'
            : '사진 품질 조건에 보완이 필요한 항목이 있어요. 확인 가능한 범위만 이어갈게요.',
          'closing',
          ['capture:usable'],
        ),
      );
    }
  }

  if (primaryCriterion) {
    messages.push(
      message(
        'closing-goal-criterion',
        'goal',
        `${hasPhotoMessage ? '루미가 짚은 사진 조건을 감안하고, ' : '먼저 '}${goalLabel}에서는 “${shorten(primaryCriterion.criterion, 82)}”을 중심 기준으로 볼게요.`,
        'closing',
        [`goal:${toEvidenceToken(primaryCriterion.id, 'criterion-1')}`],
      ),
    );
  } else if (interpretedGoalLabel) {
    messages.push(
      message(
        'closing-goal-summary',
        'goal',
        `${hasPhotoMessage ? '그 사진 조건을 감안하면, ' : ''}이번 목적은 ${goalLabel}로 해석됐어요. 이 기준에 맞춰 관찰을 이어볼게요.`,
        'closing',
        ['goal:summary'],
      ),
    );
  } else {
    messages.push(
      message(
        'closing-goal-neutral',
        'goal',
        `${hasPhotoMessage ? '그 사진 조건을 감안하고, ' : ''}사용 목적에 맞춰 확인 가능한 내용만 이어볼게요.`,
        'closing',
        [],
      ),
    );
  }

  const detailLines: string[] = [];
  const detailRefs: string[] = [
    ...result.strengths.map(item =>
      `strength:${toEvidenceToken(item.id, toEvidenceToken(item.topicId, 'item-1'))}`,
    ),
    ...result.points.map(item =>
      `point:${toEvidenceToken(item.id, toEvidenceToken(item.topicId, 'item-1'))}`,
    ),
  ];

  if (strengthTitles.length > 0) {
    detailLines.push(`잘한 점은 ${strengthTitles.join(' · ')}예요.`);
  }

  if (pointTitles.length > 0) {
    detailLines.push(`보완할 점은 ${pointTitles.join(' · ')}예요.`);
  }

  const detailText = detailLines.length > 0
    ? detailLines.join('\n')
    : '그럼 확인되지 않은 부위는 새로 단정하지 않고 넘어갈게요.';

  messages.push(message('closing-detail', 'detail', detailText, 'closing', detailRefs));

  let actionOwner: FallbackVisibleItem | undefined;

  if (point?.actionSteps.some(action => Boolean(normalizeEvidenceText(action)))) {
    actionOwner = point;
  } else if (strength?.actionSteps.some(action => Boolean(normalizeEvidenceText(action)))) {
    actionOwner = strength;
  }

  if (actionOwner) {
    const actionEvidence = getPrimaryActionEvidence(result, actionOwner);

    if (actionEvidence) {
      messages.push(
        message(
          'closing-coach-action',
          'coach',
          `루페가 짚은 내용을 바로 적용하려면 첫 단계는 “${shorten(actionEvidence.text, 98)}”예요.`,
          'closing',
          [actionEvidence.ref],
        ),
      );
    }
  }

  const scoreReason = trimText(result.scoreReason);

  if (scoreReason) {
    messages.push(
      message(
        'closing-goal-score',
        'goal',
        Number.isFinite(result.score)
          ? `앞의 목적 기준과 관찰을 종합하면 ${Math.round(result.score)}점이에요. ${shorten(scoreReason, 116)}`
          : `앞의 목적 기준과 관찰을 종합하면 ${shorten(scoreReason, 136)}`,
        'closing',
        ['score-reason'],
      ),
    );
  }

  messages.push(
    message(
      'closing-coach-ready',
      'coach',
      '좋아요. 이제 결과에서 근거와 실행 순서를 함께 확인해볼까요?',
      'closing',
      [],
    ),
  );

  const alignedMessages = messages.slice(0, 6).map(item => ({...item}));

  if (previousAgentId && alignedMessages[0]) {
    if (alignedMessages[0].agentId === previousAgentId) {
      const handoffAgentId: MakeupFeedbackAgentId =
        previousAgentId === 'goal' ? 'photo' : 'goal';
      const handoffText = handoffAgentId === 'photo'
        ? '그 기준을 이어서, 먼저 사진에서 판단 가능한 범위를 확인한 뒤 목적 기준과 연결할게요.'
        : '그 기준을 이어서, 이제 확인된 목적과 실제 분석 근거를 차례로 맞춰볼게요.';

      alignedMessages.unshift(
        message('closing-preview-handoff', handoffAgentId, handoffText, 'closing', []),
      );
    } else {
      alignedMessages[0].text = '그 기준을 이어서, ' + alignedMessages[0].text;
    }
  }

  return withSessionIds(alignedMessages);
}

type BackendConferenceMessage = {
  agentId?: string | null;
  text?: string | null;
  contextRefs?: unknown;
  evidenceRefs?: unknown;
};

type BackendConferenceResponse = {
  generationError?: unknown;
  generationStatus?: string;
  messages?: BackendConferenceMessage[];
};

type BackendConferencePreviewResponse = BackendConferenceResponse & {
  summary?: unknown;
  previewSummary?: unknown;
  lastSpeaker?: unknown;
};

function normalizeAgentId(agentId?: string | null): MakeupFeedbackAgentId | undefined {
  return agentId && validAgentIds.has(agentId as MakeupFeedbackAgentId)
    ? (agentId as MakeupFeedbackAgentId)
    : undefined;
}

function normalizeEvidenceRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const refs = value
    .map(item => (typeof item === 'string' ? trimText(item) : undefined))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);

  return refs.length > 0 ? refs : undefined;
}

export function mapMakeupFeedbackBackendConferenceMessages(
  messages: readonly BackendConferenceMessage[] | undefined,
  phase: MakeupFeedbackAgentConferenceMessage['phase'] = 'closing',
): MakeupFeedbackAgentConferenceMessage[] {
  if (
    !Array.isArray(messages) ||
    messages.some(item => item.agentId && legacyAgentIds.has(item.agentId))
  ) {
    return [];
  }

  return messages
    .slice(0, phase === 'preview' ? 6 : 7)
    .map((item, index): MakeupFeedbackAgentConferenceMessage | null => {
      const agentId = normalizeAgentId(item.agentId);
      const text = trimText(item.text);

      if (!agentId || !text) {
        return null;
      }

      const contextRefs = normalizeEvidenceRefs(item.contextRefs);
      const evidenceRefs = normalizeEvidenceRefs(item.evidenceRefs);

      return {
        id: `generated-${phase}-${index}-${agentId}`,
        agentId,
        phase,
        text,
        ...(contextRefs ? {contextRefs} : {}),
        ...(evidenceRefs ? {evidenceRefs} : {}),
      };
    })
    .filter((item): item is MakeupFeedbackAgentConferenceMessage => Boolean(item));
}

export function buildMakeupFeedbackConferencePreviewContext({
  lastSpeaker,
  messages,
  summary,
}: {
  lastSpeaker?: MakeupFeedbackAgentId;
  messages: readonly MakeupFeedbackAgentConferenceMessage[];
  summary?: string;
}): MakeupFeedbackConferencePreviewContext | null {
  const previewMessages = messages
    .filter(message => message.phase === 'preview' || message.phase === 'safe')
    .slice(-3)
    .map(message => ({agentId: message.agentId, text: message.text}));
  const normalizedSummary = trimText(summary);
  const latestMessage = previewMessages[previewMessages.length - 1];
  const resolvedLastSpeaker = latestMessage?.agentId ?? lastSpeaker;

  if (previewMessages.length === 0 && !normalizedSummary) {
    return null;
  }

  return {
    messages: previewMessages,
    ...(normalizedSummary ? {summary: normalizedSummary} : {}),
    ...(resolvedLastSpeaker ? {lastSpeaker: resolvedLastSpeaker} : {}),
  };
}

export function mergeMakeupFeedbackPreviewMessages(
  displayedMessages: readonly MakeupFeedbackAgentConferenceMessage[],
  incomingMessages: readonly MakeupFeedbackAgentConferenceMessage[],
  maximumMessages = 8,
): MakeupFeedbackAgentConferenceMessage[] {
  const merged = displayedMessages.slice(0, maximumMessages);
  const seenText = new Set(
    merged.map(item => item.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
  );

  for (const item of incomingMessages) {
    if (merged.length >= maximumMessages) {
      break;
    }

    const normalizedText = item.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const previousMessage = merged[merged.length - 1];

    if (
      !normalizedText ||
      seenText.has(normalizedText) ||
      previousMessage?.agentId === item.agentId
    ) {
      continue;
    }

    merged.push(item);
    seenText.add(normalizedText);
  }

  return merged;
}

export function getNextMakeupFeedbackConferenceMessage({
  analysisReady,
  closingMessages,
  displayedMessages,
  previewGenerationSettled,
  previewMessages,
}: {
  analysisReady: boolean;
  closingMessages: readonly MakeupFeedbackAgentConferenceMessage[];
  displayedMessages: readonly MakeupFeedbackAgentConferenceMessage[];
  previewGenerationSettled: boolean;
  previewMessages: readonly MakeupFeedbackAgentConferenceMessage[];
}): MakeupFeedbackAgentConferenceMessage | undefined {
  const previewMessageCount = displayedMessages.filter(
    message => message.phase === 'preview' || message.phase === 'safe',
  ).length;
  const nextPreviewMessage = previewMessages[previewMessageCount];

  if (nextPreviewMessage) {
    return nextPreviewMessage;
  }

  if (!previewGenerationSettled || !analysisReady) {
    return undefined;
  }

  const closingMessageCount = displayedMessages.filter(
    message => message.phase === 'closing',
  ).length;

  return closingMessages[closingMessageCount];
}

export function canCommitMakeupFeedbackConferenceMessage({
  activeAnalysisRunId,
  scheduledAnalysisRunId,
}: {
  activeAnalysisRunId: number;
  scheduledAnalysisRunId: number;
}) {
  return activeAnalysisRunId === scheduledAnalysisRunId;
}

export function buildMakeupFeedbackConferenceResultPayload(
  result: MakeupFeedbackResult,
) {
  const interpretedGoal = result.interpretedGoal
    ? {
        label: result.interpretedGoal.label,
        intensity: result.interpretedGoal.intensity,
        dynamicCriteria: (result.interpretedGoal.dynamicCriteria ?? []).map(item => ({
          criterion: item.criterion,
          id: item.id,
        })),
      }
    : null;
  const captureQuality = result.captureQuality
    ? {
        colorConfidence: result.captureQuality.colorConfidence,
        issues: result.captureQuality.issues.map(issue => ({
          affectedTopicIds: issue.affectedTopicIds,
          code: issue.code,
          message: issue.message,
        })),
        usable: result.captureQuality.usable,
      }
    : null;
  const visiblePointByTopicId = new Map(
    result.points.map(point => [point.topicId, point] as const),
  );
  const conferenceEvaluations = result.evaluations.flatMap(item => {
    const promotedPoint =
      item.status === 'optional' ? visiblePointByTopicId.get(item.topicId) : undefined;

    if (
      item.status !== 'strength' &&
      item.status !== 'improvement' &&
      !promotedPoint
    ) {
      return [];
    }

    const presentation = promotedPoint ?? item;

    return [{
      actionSteps: presentation.actionSteps,
      description: presentation.description,
      goalCriterionIds: item.goalCriterionIds ?? [],
      id: presentation.id,
      observations: (item.observations ?? []).map(observation => ({
        claim: observation.claim,
        evidenceLocation: observation.evidenceLocation,
        id: observation.id,
        lightingSensitive: observation.lightingSensitive,
      })),
      status: item.status === 'strength' ? 'strength' : 'improvement',
      title: presentation.title,
      topicId: presentation.topicId,
      topicLabel: presentation.topicLabel,
      visibility: item.visibility ?? null,
      visibilityReason: item.visibilityReason ?? null,
    }];
  });

  return {
    score: result.score,
    scoreLabel: result.scoreLabel,
    scoreReason: result.scoreReason,
    interpretedGoal,
    captureQuality,
    evaluations: conferenceEvaluations,

    strengths: result.strengths.map(item => ({
      actionSteps: item.actionSteps,
      description: item.description,
      id: item.id,
      title: item.title,
      topicId: item.topicId,
      topicLabel: item.topicLabel,
    })),
    points: result.points.map(item => ({
      actionSteps: item.actionSteps,
      description: item.description,
      id: item.id,
      title: item.title,
      topicId: item.topicId,
      topicLabel: item.topicLabel,
    })),
  };
}

function buildConferenceRequestPayload(selection: MakeupFeedbackPhotoSelection) {
  return {
    feedbackContext: selection.feedbackContext ?? null,
    source: selection.photoSource,
    sourceLabel: selection.photoTitle ?? getSourceLabel(selection),
  };
}

export function buildPreviewConferenceRequestPayload(
  selection: MakeupFeedbackPhotoSelection,
  conversationSeed?: MakeupFeedbackConferenceConversationSeed,
) {
  const feedbackContext = selection.feedbackContext;

  return {
    ...(conversationSeed ? {conversationSeed} : {}),
    feedbackContext: feedbackContext
      ? {
          originalGoalText: feedbackContext.originalGoalText,
          userGoalText: feedbackContext.userGoalText,
        }
      : null,
    photoMetadata: {
      contentType: selection.contentType ?? null,
      height: selection.imageHeight ?? null,
      width: selection.imageWidth ?? null,
    },
    source: selection.photoSource,
  };
}

export function buildMakeupFeedbackConferencePreviewRequestBody({
  analysisId,
  conversationSeed,
  selection,
}: {
  analysisId?: string;
  conversationSeed?: MakeupFeedbackConferenceConversationSeed;
  selection: MakeupFeedbackPhotoSelection;
}) {
  return {
    ...(analysisId ? {reportId: analysisId} : {}),
    requestPayload: buildPreviewConferenceRequestPayload(selection, conversationSeed),
  };
}

export async function requestMakeupFeedbackGeneratedPreviewMessages({
  analysisId,
  conversationSeed,
  selection,
  signal,
}: {
  analysisId?: string;
  conversationSeed?: MakeupFeedbackConferenceConversationSeed;
  selection: MakeupFeedbackPhotoSelection;
  signal?: AbortSignal;
}): Promise<MakeupFeedbackConferencePreview> {
  if (!getBackendApiBaseUrl()) {
    return {messages: [], generationStatus: 'unavailable'};
  }

  const response = await requestBackendJson<BackendConferencePreviewResponse>(
    '/feedback/conference-preview-messages',
    {
      body: buildMakeupFeedbackConferencePreviewRequestBody({
        analysisId,
        conversationSeed,
        selection,
      }),
      method: 'POST',
      signal,
      timeoutMs: 13000,
    },
  );
  const messages = mapMakeupFeedbackBackendConferenceMessages(response.messages, 'preview');
  const summaryValue = response.summary ?? response.previewSummary;
  const summary = messages.length > 0 && typeof summaryValue === 'string'
    ? trimText(summaryValue)
    : undefined;
  const responseLastSpeaker =
    messages.length > 0 && typeof response.lastSpeaker === 'string'
      ? normalizeAgentId(response.lastSpeaker)
      : undefined;
  const lastMessage = messages[messages.length - 1];

  return {
    messages,
    ...(summary ? {summary} : {}),
    ...(responseLastSpeaker || lastMessage
      ? {lastSpeaker: responseLastSpeaker ?? lastMessage?.agentId}
      : {}),
    ...(response.generationStatus ? {generationStatus: response.generationStatus} : {}),
  };
}

export async function requestMakeupFeedbackGeneratedConferenceMessages({
  previewContext,
  result,
  selection,
  signal,
}: {
  previewContext?: MakeupFeedbackConferencePreviewContext | null;
  result: MakeupFeedbackResult;
  selection: MakeupFeedbackPhotoSelection;
  signal?: AbortSignal;
}): Promise<MakeupFeedbackAgentConferenceMessage[]> {
  if (!getBackendApiBaseUrl()) {
    return [];
  }

  const response = await requestBackendJson<BackendConferenceResponse>(
    '/feedback/conference-messages',
    {
      body: {
        reportId: result.analysisId ?? result.id,
        requestPayload: buildConferenceRequestPayload(selection),
        result: buildMakeupFeedbackConferenceResultPayload(result),
        ...(previewContext ? {previewContext} : {}),
      },
      method: 'POST',
      signal,
      timeoutMs: 8500,
    },
  );

  return mapMakeupFeedbackBackendConferenceMessages(response.messages);
}
