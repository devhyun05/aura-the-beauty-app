import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

export type MakeupFeedbackAgentId = 'tone' | 'color' | 'style' | 'quality';

export type MakeupFeedbackAgentConferenceMessage = {
  id: string;
  agentId: MakeupFeedbackAgentId;
  text: string;
  phase: 'safe' | 'closing';
};

export const MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES = 4;

const validAgentIds = new Set<MakeupFeedbackAgentId>(['tone', 'color', 'style', 'quality']);

function trimText(value?: string | null) {
  return value?.trim() || undefined;
}

function shorten(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function getGoalLabel(selection: MakeupFeedbackPhotoSelection) {
  const goalText = trimText(selection.feedbackContext?.userGoalText);

  if (!goalText) {
    return undefined;
  }

  return shorten(goalText, 18);
}

function getSourceLabel(selection: MakeupFeedbackPhotoSelection) {
  return selection.photoSource === 'gallery' ? '선택한 사진' : '선택한 사진';
}

function getGoalPrefix(selection: MakeupFeedbackPhotoSelection) {
  const goalLabel = getGoalLabel(selection);

  return goalLabel ? `${goalLabel} 기준이면` : '사용 목적 기준이면';
}

function pickVariant<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function shuffle<T>(items: readonly T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function message(
  id: string,
  agentId: MakeupFeedbackAgentId,
  text: string,
  phase: MakeupFeedbackAgentConferenceMessage['phase'] = 'safe',
): MakeupFeedbackAgentConferenceMessage {
  return {id, agentId, phase, text};
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
  const goalPrefix = getGoalPrefix(selection);
  const goalLabel = getGoalLabel(selection);
  const userGoalHint = goalLabel ? `${goalLabel} 느낌` : '원하는 분위기';

  const openingThreads = [
    [
      message('safe-thread-light-tone', 'tone', `${sourceLabel}이라 조명 영향을 먼저 덜어보고 실제 톤 기준을 잡을게요.`),
      message('safe-thread-light-color', 'color', '좋아요. 색감은 립, 치크, 피부 표현이 서로 이어지는지 볼게요.'),
      message('safe-thread-light-style', 'style', `${goalPrefix} 과한 수정보다 바로 좋아지는 순서가 중요하겠어요.`),
    ],
    [
      message('safe-thread-balance-color', 'color', '먼저 전체 색의 온도를 볼게요. 한 부분만 튀면 인상이 달라질 수 있어요.'),
      message('safe-thread-balance-tone', 'tone', '그럼 저는 밝기와 피부 표현이 색 판단을 흔들지 않는지 맞춰볼게요.'),
      message('safe-thread-balance-quality', 'quality', '두 기준이 맞으면 결과 화면에서도 훨씬 설득력 있게 정리돼요.'),
    ],
    [
      message('safe-thread-goal-style', 'style', `${userGoalHint}으로 보이려면 먼저 살릴 포인트부터 정해야겠어요.`),
      message('safe-thread-goal-tone', 'tone', '동의해요. 피부 표현이 그 분위기를 받쳐주는지 먼저 확인할게요.'),
      message('safe-thread-goal-color', 'color', '저는 색이 너무 앞서지 않고 얼굴 전체에 붙는지 같이 볼게요.'),
    ],
    [
      message('safe-thread-report-quality', 'quality', '이번 피드백은 강점과 보완점이 서로 이어져야 자연스럽겠어요.'),
      message('safe-thread-report-tone', 'tone', '좋아요. 톤 기준을 먼저 고정해두면 보완 포인트도 더 정확해져요.'),
      message('safe-thread-report-style', 'style', '마지막에는 사용자가 바로 따라 할 수 있는 말로 바꿔볼게요.'),
    ],
  ] as const;

  const bridgeMessages = [
    message('safe-bridge-tone-detail', 'tone', '사진 속 밝은 영역과 그림자 영역을 나눠서 보고 있어요.'),
    message('safe-bridge-color-detail', 'color', '색은 올리는 방향보다 덜어도 예뻐지는 방향을 같이 비교할게요.'),
    message('safe-bridge-style-detail', 'style', '수정 포인트가 많아 보여도 체감 큰 순서로 줄이면 훨씬 쉬워져요.'),
    message('safe-bridge-quality-detail', 'quality', '강점으로 말할 부분과 보완할 부분이 겹치지 않게 정리할게요.'),
    message('safe-bridge-tone-natural', 'tone', '톤이 안정되면 피부 표현의 장점도 더 잘 보일 수 있어요.'),
    message('safe-bridge-color-natural', 'color', '립과 치크가 같은 방향인지, 일부러 대비를 준 건지도 체크할게요.'),
    message('safe-bridge-style-natural', 'style', `${goalPrefix} 첫 번째 조언은 작고 확실한 변화가 좋겠어요.`),
    message('safe-bridge-quality-natural', 'quality', '좋아요. 결과는 회의 흐름이 보이도록 자연스럽게 묶어볼게요.'),
  ];

  return withSessionIds([
    ...pickVariant(openingThreads),
    ...shuffle(bridgeMessages).slice(0, 4),
  ]);
}

function getPrimaryStrengthTitle(result: MakeupFeedbackResult) {
  return trimText(result.strengths[0]?.title)
    ?? trimText(result.evaluations.find(evaluation => evaluation.status === 'strength')?.title);
}

function getPrimaryImprovementTitle(result: MakeupFeedbackResult) {
  return trimText(result.points[0]?.title)
    ?? trimText(result.evaluations.find(evaluation => evaluation.status === 'improvement')?.title);
}

function getResultGoalLabel(result: MakeupFeedbackResult) {
  const label = trimText(result.interpretedGoal?.label);

  if (!label || label === '목적 맞춤 메이크업') {
    return '사용 목적';
  }

  return `"${shorten(label, 18)}"`;
}

export function buildMakeupFeedbackClosingConferenceMessages(
  result: MakeupFeedbackResult,
): readonly MakeupFeedbackAgentConferenceMessage[] {
  const goalLabel = getResultGoalLabel(result);
  const scoreLabel = Number.isFinite(result.score) ? `${Math.round(result.score)}점` : undefined;
  const strengthTitle = getPrimaryStrengthTitle(result);
  const improvementTitle = getPrimaryImprovementTitle(result);
  const strengthCopy = strengthTitle ? `${strengthTitle}은 살리고` : '잘 맞는 표현은 유지하고';
  const improvementCopy = improvementTitle
    ? `${improvementTitle}부터 부드럽게 보완하는 방향`
    : '바로 따라 하기 쉬운 보완 순서';
  const closingThreads = [
    [
      message(
        'closing-quality-result-a',
        'quality',
        scoreLabel
          ? `${goalLabel} 기준으로 전체 균형은 ${scoreLabel} 수준이에요. 결론을 맞춰볼게요.`
          : `${goalLabel} 기준으로 강점과 보완 포인트가 정리됐어요. 결론을 맞춰볼게요.`,
        'closing',
      ),
      message(
        'closing-color-result-a',
        'color',
        `저는 ${strengthCopy}, ${improvementCopy}이 가장 자연스러워 보여요.`,
        'closing',
      ),
      message(
        'closing-style-result-a',
        'style',
        '좋아요. 결과 화면에서는 바로 따라 할 수 있는 순서로 보여주면 되겠어요.',
        'closing',
      ),
    ],
    [
      message(
        'closing-tone-result-b',
        'tone',
        `${goalLabel} 기준에서는 톤의 장점을 먼저 살리는 쪽이 좋아 보여요.`,
        'closing',
      ),
      message(
        'closing-color-result-b',
        'color',
        `${improvementCopy}으로 잡으면 색감도 더 자연스럽게 이어질 것 같아요.`,
        'closing',
      ),
      message(
        'closing-quality-result-b',
        'quality',
        '좋아요. 강점과 보완 순서가 연결됐으니 결과로 보여줘도 되겠어요.',
        'closing',
      ),
    ],
    [
      message(
        'closing-style-result-c',
        'style',
        `${goalLabel}에 맞춰 첫 조언은 바로 체감되는 변화로 잡는 게 좋겠어요.`,
        'closing',
      ),
      message(
        'closing-tone-result-c',
        'tone',
        `${strengthCopy} 톤이 흐려지는 부분만 가볍게 보완하면 되겠어요.`,
        'closing',
      ),
      message(
        'closing-quality-result-c',
        'quality',
        '그 방향이면 결과 화면에서 이유와 실행법이 자연스럽게 이어져요.',
        'closing',
      ),
    ],
  ] as const;

  return withSessionIds(pickVariant(closingThreads));
}

type BackendConferenceMessage = {
  agentId?: string | null;
  text?: string | null;
};

type BackendConferenceResponse = {
  generationError?: unknown;
  generationStatus?: string;
  messages?: BackendConferenceMessage[];
};

function mapBackendConferenceMessages(
  messages: readonly BackendConferenceMessage[] | undefined,
): MakeupFeedbackAgentConferenceMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((item, index): MakeupFeedbackAgentConferenceMessage | null => {
      const agentId = item.agentId;
      const text = trimText(item.text);

      if (!agentId || !validAgentIds.has(agentId as MakeupFeedbackAgentId) || !text) {
        return null;
      }

      return {
        id: `generated-closing-${index}-${agentId}`,
        agentId: agentId as MakeupFeedbackAgentId,
        phase: 'closing',
        text,
      };
    })
    .filter((item): item is MakeupFeedbackAgentConferenceMessage => Boolean(item));
}

function compactResultForRequest(result: MakeupFeedbackResult) {
  return {
    score: result.score,
    scoreLabel: result.scoreLabel,
    interpretedGoal: result.interpretedGoal,
    summary: result.summary,
    strengths: result.strengths.map(item => ({
      description: item.description,
      title: item.title,
      topicLabel: item.topicLabel,
    })),
    points: result.points.map(item => ({
      description: item.description,
      title: item.title,
      topicLabel: item.topicLabel,
    })),
    evaluations: result.evaluations.map(item => ({
      description: item.description,
      status: item.status,
      title: item.title,
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

export async function requestMakeupFeedbackGeneratedConferenceMessages({
  result,
  selection,
}: {
  result: MakeupFeedbackResult;
  selection: MakeupFeedbackPhotoSelection;
}): Promise<MakeupFeedbackAgentConferenceMessage[]> {
  if (!getBackendApiBaseUrl()) {
    return [];
  }

  const response = await requestBackendJson<BackendConferenceResponse>(
    '/feedback/conference-messages',
    {
      body: {
        requestPayload: buildConferenceRequestPayload(selection),
        result: compactResultForRequest(result),
      },
      method: 'POST',
      timeoutMs: 6500,
    },
  );

  return mapBackendConferenceMessages(response.messages);
}