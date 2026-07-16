import {appAssetSource} from '../../../shared/config/mediaAssets';
import type {
  MakeupFeedbackEvaluation,
  MakeupFeedbackPhotoSelection,
  MakeupFeedbackResult,
} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';

const sampleFeedbackImage = appAssetSource('images/analysis/report-retake-20260608.png');

type MockEvaluationCopy = Pick<
  MakeupFeedbackEvaluation,
  'confidence' | 'description' | 'scoreImpact' | 'status' | 'title'
>;

const mockCopyByTopic: Record<MakeupFeedbackEvaluation['topicId'], MockEvaluationCopy> = {
  brow: {
    confidence: 0.86,
    description: '목적에 맞게 눈썹 결이 정리되어 인상이 깔끔해 보여요. 앞머리는 부드럽고 꼬리는 과하지 않아 전체 균형을 잘 잡아줍니다.',
    scoreImpact: 'high',
    status: 'strength',
    title: '인상을 정리한 눈썹',
  },
  lash: {
    confidence: 0.64,
    description: '이번 목적에서는 속눈썹을 더 강조하지 않아도 충분해 보여요. 원한다면 뭉침 없이 결만 살리는 정도가 적당합니다.',
    scoreImpact: 'low',
    status: 'optional',
    title: '선택적으로 조절할 속눈썹',
  },
  lens: {
    confidence: 0.58,
    description: '렌즈는 목적에 따라 선택해도 되는 항목이에요. 자연스러운 기준이라면 현재처럼 눈동자 색감이 과하게 튀지 않는 쪽이 좋습니다.',
    scoreImpact: 'low',
    status: 'optional',
    title: '목적에 따라 선택할 렌즈',
  },
  eyeliner: {
    confidence: 0.74,
    description: '아이라인 끝 각도가 살짝 떠 보여 인상 정리가 덜 선명해질 수 있어요. 점막 가까이 얇게 이어주면 목적에 맞는 깔끔함이 더 살아납니다.',
    scoreImpact: 'medium',
    status: 'improvement',
    title: '라인 끝 정리',
  },
  eyeshadow: {
    confidence: 0.82,
    description: '아이섀도 톤이 과하지 않고 피부 표현과 자연스럽게 이어져요. 눈매에 깊이는 주면서 전체 분위기를 흐트러뜨리지 않는 점이 좋아요.',
    scoreImpact: 'medium',
    status: 'strength',
    title: '자연스러운 음영 연결',
  },
  aegyosal: {
    confidence: 0.55,
    description: '애교살은 이번 목적에서 필수로 강조할 항목은 아니에요. 밝기를 더한다면 눈 밑 중앙에만 아주 얇게 올리는 정도가 안정적입니다.',
    scoreImpact: 'low',
    status: 'optional',
    title: '가볍게 조절할 애교살',
  },
  foundation: {
    confidence: 0.88,
    description: '피부톤이 고르게 정돈되어 사진에서 깔끔한 인상을 줍니다. 목선과의 차이도 크지 않아 목적에 맞는 자연스러운 완성도가 좋아요.',
    scoreImpact: 'high',
    status: 'strength',
    title: '균일한 피부 표현',
  },
  blush: {
    confidence: 0.8,
    description: '블러셔가 얼굴 중앙에 생기를 주면서 과하게 튀지 않아요. 전체 톤과 잘 맞아 부담 없는 포인트로 보입니다.',
    scoreImpact: 'medium',
    status: 'strength',
    title: '부담 없는 생기',
  },
  highlight: {
    confidence: 0.78,
    description: '하이라이터가 필요한 부위에만 은은하게 살아 있어 입체감이 자연스럽습니다. 조명 아래에서도 번들거림보다 정돈된 윤기로 보일 가능성이 높아요.',
    scoreImpact: 'medium',
    status: 'strength',
    title: '은은한 입체감',
  },
  shading: {
    confidence: 0.72,
    description: '섀딩 경계가 조금 더 부드러워지면 얼굴 입체감이 자연스럽게 살아날 수 있어요. 턱선과 코 옆은 브러시에 남은 양으로 가볍게 풀어주세요.',
    scoreImpact: 'medium',
    status: 'improvement',
    title: '경계 블렌딩',
  },
  lip: {
    confidence: 0.77,
    description: '립 중앙의 색감은 잘 살아 있지만 입꼬리 경계를 한 번 정리하면 전체 인상이 더 또렷해져요.',
    scoreImpact: 'medium',
    status: 'improvement',
    title: '입꼬리 경계 정리',
  },
};

const mockActionStepsByTopic: Record<MakeupFeedbackEvaluation['topicId'], string[]> = {
  brow: ['스크루 브러시로 결을 먼저 세운 뒤 빈 부분만 가볍게 채워요.'],
  lash: ['마스카라 양을 덜어낸 뒤 뿌리부터 한 번만 빗어 올려요.'],
  lens: ['렌즈를 사용한다면 원래 눈동자와 명도 차이가 작은 색을 골라요.'],
  eyeliner: ['면봉으로 꼬리 끝을 정리한 뒤 점막 가까이 얇게 다시 연결해요.'],
  eyeshadow: ['경계가 보이지 않도록 깨끗한 브러시로 바깥쪽만 한 번 더 풀어요.'],
  aegyosal: ['눈 밑 중앙에만 밝은 색을 소량 얹고 양끝은 비워 둬요.'],
  foundation: ['얇은 퍼프로 코 옆과 입가만 눌러 피부 표현을 정돈해요.'],
  blush: ['광대 위쪽에서 관자놀이 방향으로 남은 양을 짧게 쓸어 올려요.'],
  highlight: ['빛을 받는 콧대와 광대 중앙에만 소량을 얹어요.'],
  shading: ['깨끗한 브러시로 턱선과 코 옆 경계를 바깥 방향으로 풀어요.'],
  lip: ['작은 브러시로 입꼬리 바깥 번짐을 정리하고 중앙 컬러만 한 번 덧발라요.'],
};

function buildMockEvaluations(): MakeupFeedbackEvaluation[] {
  return MAKEUP_FEEDBACK_TOPICS.map((topic) => {
    const copy = mockCopyByTopic[topic.id];

    return {
      id: `${topic.id}-${copy.status}`,
      topicId: topic.id,
      topicLabel: topic.label,
      status: copy.status,
      title: copy.title,
      description: copy.description,
      actionSteps: mockActionStepsByTopic[topic.id],
      kind: topic.kind,
      confidence: copy.confidence,
      scoreImpact: copy.scoreImpact,
    };
  });
}

export const createMockMakeupFeedback = (
  selection: MakeupFeedbackPhotoSelection,
): MakeupFeedbackResult => {
  const evaluations = buildMockEvaluations();
  const points = evaluations
    .filter(
      (evaluation) =>
        evaluation.status === 'improvement' || evaluation.status === 'optional',
    )
    .map((evaluation) => ({
      id: `${evaluation.topicId}-point`,
      topicId: evaluation.topicId,
      topicLabel: evaluation.topicLabel,
      title: evaluation.title,
      description: evaluation.description,
      actionSteps: evaluation.actionSteps,
      actionLabel: '보완 포인트',
      kind: evaluation.kind,
    }));
  const strengths: MakeupFeedbackResult['strengths'] = evaluations
    .filter((evaluation) => evaluation.status === 'strength')
    .map((evaluation, index) => ({
      id: `${evaluation.topicId}-strength`,
      topicId: evaluation.topicId,
      topicLabel: evaluation.topicLabel,
      title: evaluation.title,
      description: evaluation.description,
      actionSteps: evaluation.actionSteps,
      icon: index % 2 === 0 ? 'sparkle' : 'heart',
      kind: evaluation.kind,
    }));
  const userGoalText = selection.feedbackContext?.userGoalText?.trim();

  return {
    id: `mock-feedback-${selection.photoSource}`,
    analysisSource: 'mock',
    analysisStatus: 'mock',
    modelVersion: 'makeup-feedback:demo-v1',
    uploadedImage: selection.imageUri ? {uri: selection.imageUri} : sampleFeedbackImage,
    photoSource: selection.photoSource,
    photoSourceLabel: selection.photoSource === 'camera' ? '선택한 사진' : '선택한 사진',
    score: 84,
    scoreLabel: '종합 점수',
    scoreReason: '데모 화면용 예시 점수이며 실제 사진을 AI로 분석한 결과가 아니에요.',
    interpretedGoal: {
      intensity: 'medium',
      label: userGoalText ? userGoalText.slice(0, 28) : '목적 맞춤 메이크업',
      reason: '사용자가 입력한 상황과 사진에서 보이는 표현 강도를 함께 참고했어요.',
    },
    summary: {
      strengthSummary: '피부 표현과 전체 톤 균형이 목적에 잘 맞아요.',
      improvementSummary: '라인과 섀딩 경계만 조금 더 정리하면 완성도가 올라갑니다.',
    },
    summaryBadges: [
      {
        id: 'strength-count',
        label: `잘한 항목 ${strengths.length}개`,
      },
      {
        id: 'improvement-count',
        label: `보완 항목 ${points.length}개`,
      },
    ],
    annotations: [],
    evaluations,
    points,
    strengths,
  };
};
