import type {
  MakeupQuestionDimension,
  MakeupRecommendationRefinement,
} from '../types';

export type MakeupRecommendationAgentId =
  | 'brief'
  | 'mood'
  | 'balance'
  | 'routine'
  | 'artist'
  | 'image'
  | 'quality';

export type MakeupRecommendationAnswerKeyword = {
  dimension: MakeupQuestionDimension;
  label: string;
};

export type MakeupRecommendationLoadingContext = {
  additionalConstraints?: string;
  answerKeywords: MakeupRecommendationAnswerKeyword[];
  personalColor?: string;
  prompt: string;
  refinement?: MakeupRecommendationRefinement;
  useProfile: boolean;
};

export type MakeupRecommendationAgentMessage = {
  agentId: MakeupRecommendationAgentId;
  text: string;
};

const refinementLabels: Record<MakeupRecommendationRefinement, string> = {
  natural: '더 자연스럽게',
  hip: '더 힙하게',
  differentColor: '다른 색으로',
  replaceProducts: '제품만 바꾸기',
};

const dimensionAgents: Record<MakeupQuestionDimension, MakeupRecommendationAgentId> = {
  occasion: 'brief',
  mood: 'mood',
  boldness: 'balance',
  timeSkill: 'routine',
};

function shorten(value: string, maxLength: number) {
  const normalized = value.trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}…`
    : normalized;
}

function keywordFor(
  context: MakeupRecommendationLoadingContext,
  dimension: MakeupQuestionDimension,
) {
  return context.answerKeywords.find(keyword => keyword.dimension === dimension)?.label;
}

function initialMessages(
  context: MakeupRecommendationLoadingContext,
): MakeupRecommendationAgentMessage[] {
  const messages: MakeupRecommendationAgentMessage[] = [
    {
      agentId: 'brief',
      text: `“${shorten(context.prompt, 36)}” 요청을 기준으로 가장 잘 어울리는 한 가지를 찾을게요.`,
    },
  ];

  context.answerKeywords.forEach(keyword => {
    const copy: Record<MakeupQuestionDimension, string> = {
      occasion: `상황 키워드는 “${keyword.label}”이네요. 조명과 지속력까지 이 장면에 맞춰볼게요.`,
      mood: `원하는 무드는 “${keyword.label}”이에요. 색과 질감이 그 인상에서 벗어나지 않게 볼게요.`,
      boldness: `표현 강도는 “${keyword.label}” 기준으로 잡을게요. 이목구비가 묻히거나 과해지지 않게 조절해볼게요.`,
      timeSkill: `완성 조건은 “${keyword.label}”이네요. 실제로 따라 할 수 있는 단계 수로 줄여볼게요.`,
    };

    messages.push({agentId: dimensionAgents[keyword.dimension], text: copy[keyword.dimension]});
  });

  if (context.additionalConstraints?.trim()) {
    messages.push({
      agentId: 'routine',
      text: `추가 요청 “${shorten(context.additionalConstraints, 42)}”도 최종 설계에서 빠지지 않게 확인할게요.`,
    });
  }

  if (context.useProfile) {
    messages.push({
      agentId: 'balance',
      text: context.personalColor
        ? `얼굴 분석과 ${context.personalColor} 정보도 함께 반영해서 피부에서 색이 따로 뜨지 않게 맞출게요.`
        : '저장된 얼굴 분석 결과도 함께 반영해서 얼굴형과 피부 표현에 맞는 균형을 잡을게요.',
    });
  }

  if (context.refinement) {
    messages.push({
      agentId: 'artist',
      text: `기존 결과에서 “${refinementLabels[context.refinement]}” 요청만 정확히 바꿔 새 버전을 만들게요.`,
    });
  }

  messages.push(
    {
      agentId: 'artist',
      text: '베이스·브로우·아이·치크·립이 한 무드로 이어지도록 최적의 조합 한 가지로 좁히고 있어요.',
    },
    {
      agentId: 'image',
      text: '선택한 메이크업 설계안을 원본 얼굴 사진에 적용해 OpenAI 이미지 편집 결과를 생성하고 있어요.',
    },
  );

  return messages;
}

function continuingMessages(
  context: MakeupRecommendationLoadingContext,
): MakeupRecommendationAgentMessage[] {
  const occasion = keywordFor(context, 'occasion') ?? '선택한 상황';
  const mood = keywordFor(context, 'mood') ?? '원하는 무드';
  const boldness = keywordFor(context, 'boldness') ?? '선택한 표현 강도';
  const timeSkill = keywordFor(context, 'timeSkill') ?? '가능한 준비 시간';
  const keywordSummary = context.answerKeywords.map(keyword => keyword.label).join(' · ');

  return [
    {
      agentId: 'brief',
      text: `${occasion}에서 자연스럽게 보이도록 피부 표현과 포인트 색의 우선순위를 다시 맞춰볼게요.`,
    },
    {
      agentId: 'mood',
      text: `${mood} 인상은 유지하면서 아이와 립 중 어느 쪽을 중심으로 둘지 비교하고 있어요.`,
    },
    {
      agentId: 'balance',
      text: `${boldness} 기준에서 블러셔와 음영이 얼굴 윤곽을 무겁게 만들지 않는지 확인할게요.`,
    },
    {
      agentId: 'routine',
      text: `${timeSkill} 안에 재현할 수 있도록 효과가 큰 단계부터 남기고 있어요.`,
    },
    {
      agentId: 'artist',
      text: keywordSummary
        ? `${keywordSummary} 조건이 한 얼굴에서 서로 충돌하지 않도록 색과 질감을 다시 조율하고 있어요.`
        : '요청한 상황과 분위기가 한 얼굴에서 자연스럽게 이어지도록 색과 질감을 다시 조율하고 있어요.',
    },
    {
      agentId: 'image',
      text: '원래 얼굴 특징과 피부 결은 유지하고, 메이크업 변화만 자연스럽게 보이도록 이미지 결과를 기다리고 있어요.',
    },
    {
      agentId: 'quality',
      text: '생성 결과가 요청 키워드와 일치하는지, 얼굴이 다른 사람처럼 변하지 않았는지 함께 확인할게요.',
    },
    {
      agentId: 'mood',
      text: `${mood}가 색 이름만이 아니라 전체 인상에서도 느껴지는지 한 번 더 맞춰보고 있어요.`,
    },
    {
      agentId: 'quality',
      text: '추천 설명과 이미지가 같은 방향인지 확인하고 있어요. 완료되는 즉시 가장 잘 어울리는 한 장을 보여드릴게요.',
    },
  ];
}

export function getMakeupRecommendationAgentMessage(
  context: MakeupRecommendationLoadingContext,
  messageIndex: number,
): MakeupRecommendationAgentMessage {
  const initial = initialMessages(context);

  if (messageIndex < initial.length) {
    return initial[messageIndex];
  }

  const continuing = continuingMessages(context);
  return continuing[(messageIndex - initial.length) % continuing.length];
}
