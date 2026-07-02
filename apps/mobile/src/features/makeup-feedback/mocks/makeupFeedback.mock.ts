import {appAssetSource} from '../../../shared/config/mediaAssets';
import type {
  MakeupFeedbackEvaluation,
  MakeupFeedbackPhotoSelection,
  MakeupFeedbackResult,
} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';

const sampleFeedbackImage = appAssetSource('images/analysis/report-retake-20260608.png');

const improvementCopy: Partial<Record<MakeupFeedbackEvaluation['topicId'], string>> = {
  eyeliner: '눈꼬리 끝 각도가 양쪽에서 살짝 달라 보여요. 끝점 높이를 먼저 맞춘 뒤 얇게 연결하면 인상이 더 안정적으로 정리돼요.',
  blush: '블러셔가 광대 아래로 조금 내려와 보여요. 광대 중심보다 반 마디 위에서 바깥쪽으로 퍼뜨리면 얼굴이 더 또렷해져요.',
  shading: '섀딩 경계가 살짝 강하게 남아 있어요. 턱선과 코 옆은 브러시에 남은 양으로만 쓸어 주면 입체감이 자연스러워져요.',
  lash: '속눈썹 중앙 볼륨은 좋지만 바깥쪽 컬이 조금 처져 보여요. 끝부분만 한 번 더 집어 올리면 눈매가 더 선명해져요.',
};

const strengthCopy: Partial<Record<MakeupFeedbackEvaluation['topicId'], string>> = {
  brow: '눈썹 결이 얼굴형과 잘 맞게 정리돼 있어요. 앞머리는 부드럽고 꼬리는 깔끔해서 전체 인상이 또렷해 보여요.',
  lens: '렌즈 직경과 컬러가 메이크업 톤을 방해하지 않고 자연스럽게 어울려요. 눈동자 선명도도 잘 살아나요.',
  eyeshadow: '아이섀도 음영이 과하지 않고 눈두덩에 자연스럽게 깔려 있어요. 데일리 무드와 깊이감이 균형 있게 잡혔어요.',
  aegyosal: '애교살 밝기가 과하지 않아 눈 밑이 깨끗해 보여요. 하이라이트가 필요한 부분에만 잘 올라가 있어요.',
  foundation: '파운데이션 톤과 피부 표현이 안정적이에요. 목선과의 차이가 크지 않고 베이스가 얇게 밀착돼 보여요.',
  highlight: '하이라이터 위치가 좋아요. 콧대와 앞광대에 필요한 만큼만 빛이 올라와 얼굴 윤곽이 맑게 살아나요.',
};

function buildMockEvaluations(): MakeupFeedbackEvaluation[] {
  return MAKEUP_FEEDBACK_TOPICS.map((topic) => {
    const improvementDescription = improvementCopy[topic.id];
    const isImprovement = Boolean(improvementDescription);

    return {
      id: `${topic.id}-${isImprovement ? 'improvement' : 'strength'}`,
      topicId: topic.id,
      topicLabel: topic.label,
      status: isImprovement ? 'improvement' : 'strength',
      title: topic.label,
      description:
        improvementDescription ??
        strengthCopy[topic.id] ??
        `${topic.label} 표현이 전체 메이크업 톤과 자연스럽게 연결돼 있어요.`,
      kind: topic.kind,
      confidence: isImprovement ? 0.76 : 0.86,
    };
  });
}

export const createMockMakeupFeedback = (
  selection: MakeupFeedbackPhotoSelection,
): MakeupFeedbackResult => {
  const evaluations = buildMockEvaluations();
  const points = evaluations
    .filter((evaluation) => evaluation.status === 'improvement')
    .map((evaluation) => ({
      id: `${evaluation.topicId}-point`,
      topicId: evaluation.topicId,
      topicLabel: evaluation.topicLabel,
      title: evaluation.title,
      description: evaluation.description,
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
      icon: index % 2 === 0 ? 'sparkle' : 'heart',
      kind: evaluation.kind,
    }));

  return {
    id: `mock-feedback-${selection.photoSource}`,
    uploadedImage: selection.imageUri ? {uri: selection.imageUri} : sampleFeedbackImage,
    photoSource: selection.photoSource,
    photoSourceLabel: selection.photoSource === 'camera' ? '촬영 사진' : '갤러리 사진',
    score: 84,
    summaryBadges: [
      {
        id: 'strength-count',
        label: `잘한 항목 ${strengths.length}개`,
      },
      {
        id: 'improvement-count',
        label: `보완 항목 ${points.length}개`,
      },
      {
        id: 'topic-count',
        label: '10개 항목 분석',
      },
    ],
    annotations: [],
    evaluations,
    points,
    strengths,
  };
};