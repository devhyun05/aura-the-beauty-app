import type {ImageSourcePropType} from 'react-native';

import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

const sampleFeedbackImage = require('../../../assets/images/analysis/report-retake-20260608.png') as ImageSourcePropType;

export const createMockMakeupFeedback = (
  selection: MakeupFeedbackPhotoSelection,
): MakeupFeedbackResult => ({
  id: `mock-feedback-${selection.photoSource}`,
  uploadedImage: selection.imageUri ? {uri: selection.imageUri} : sampleFeedbackImage,
  photoSource: selection.photoSource,
  photoSourceLabel: selection.photoSource === 'camera' ? '촬영한 사진' : '갤러리 사진',
  score: 82,
  summaryBadges: [
    {
      id: 'tone',
      label: '톤 조화 좋음',
    },
    {
      id: 'lip',
      label: '립 컬러 잘 어울림',
    },
  ],
  annotations: [
    {
      id: 'eyeline',
      label: '아이라인 좌우 각도 차이',
      top: 88,
      left: 22,
      lineTop: 184,
      lineLeft: 154,
      lineWidth: 78,
      rotate: '-8deg',
    },
    {
      id: 'blusher',
      label: '블러셔 위치가 조금 낮아요',
      top: 130,
      left: 250,
      lineTop: 208,
      lineLeft: 238,
      lineWidth: 58,
      rotate: '10deg',
    },
    {
      id: 'lipline',
      label: '립 경계 정리가 필요해요',
      top: 188,
      left: 42,
      lineTop: 286,
      lineLeft: 182,
      lineWidth: 78,
      rotate: '-22deg',
    },
  ],
  points: [
    {
      id: 'eyeline-point',
      title: '아이라인',
      description: '오른쪽 꼬리가 왼쪽보다 조금 더 올라가 있어요',
      actionLabel: '수정팁',
      kind: 'eye',
    },
    {
      id: 'blusher-point',
      title: '블러셔',
      description: '광대보다 살짝 위로 올리면 얼굴이 더 짧아 보여요',
      actionLabel: '수정팁',
      kind: 'cheek',
    },
    {
      id: 'lip-point',
      title: '립',
      description: '입꼬리 라인을 정리하면 더 또렷한 인상이 돼요',
      actionLabel: '수정팁',
      kind: 'lip',
    },
  ],
  strengths: [
    {
      id: 'shadow',
      title: '아이섀도우 톤',
      description:
        '브라운 계열 음영이 피부 톤과 잘 맞아서 눈매가 과하게 진하지 않고 자연스럽게 또렷해 보여요. 눈두덩이 중앙은 밝게 살아 있고, 외곽 음영만 부드럽게 잡혀 전체 균형이 좋아요.',
      icon: 'sparkle',
    },
    {
      id: 'mood',
      title: '전체무드',
      description:
        '베이스, 아이, 립 컬러의 채도가 비슷하게 맞아서 얼굴 전체가 차분하고 깨끗해 보여요. 한 부분만 튀지 않고 데일리 메이크업처럼 자연스러운 분위기가 잘 살아났어요.',
      icon: 'heart',
    },
  ],
});
