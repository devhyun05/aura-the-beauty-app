export type FaceAnalysisCaptureChecklistItem = {
  description: string;
  id:
    | 'light'
    | 'forehead'
    | 'ears'
    | 'accessory'
    | 'expression'
    | 'framing';
  imageAccessibilityLabel: string;
  title: string;
};

/**
 * 얼굴 분석 촬영 전 체크리스트의 단일 소스.
 *
 * 이 항목은 분석 품질을 위한 준비 안내이며, 실시간 카메라의
 * 중앙·정면·거리·정지 greenlight와 동일한 셔터 게이트를 뜻하지 않는다.
 */
export const FACE_ANALYSIS_CAPTURE_CHECKLIST = [
  {
    description:
      '얼굴에 큰 그림자나 색 번짐이 없도록 밝고 고른 빛에서 촬영해 주세요.',
    id: 'light',
    imageAccessibilityLabel:
      '왼쪽은 한쪽 그림자와 색 번짐이 있는 잘못된 예시, 오른쪽은 얼굴에 빛이 고르게 닿는 올바른 예시',
    title: '밝고 고른 빛에서',
  },
  {
    description: '앞머리를 옆으로 넘겨 헤어라인이 모두 보이게 해 주세요.',
    id: 'forehead',
    imageAccessibilityLabel:
      '왼쪽은 앞머리가 헤어라인을 가린 잘못된 예시, 오른쪽은 이마와 헤어라인이 모두 보이는 올바른 예시',
    title: '이마가 보이게',
  },
  {
    description:
      '옆머리를 귀 뒤로 넘겨 양쪽 귀와 얼굴 옆선이 보이게 해 주세요.',
    id: 'ears',
    imageAccessibilityLabel:
      '왼쪽은 옆머리가 귀를 가린 잘못된 예시, 오른쪽은 머리를 넘겨 양쪽 귀가 보이는 올바른 예시',
    title: '양쪽 귀가 보이게',
  },
  {
    description:
      '안경·모자·큰 귀걸이를 빼고 얼굴 경계를 가리지 않게 해 주세요.',
    id: 'accessory',
    imageAccessibilityLabel:
      '왼쪽은 안경과 모자와 큰 귀걸이를 착용한 잘못된 예시, 오른쪽은 액세서리를 모두 뺀 올바른 예시',
    title: '액세서리 없이',
  },
  {
    description:
      '웃거나 입을 벌리지 말고 입술에 힘을 뺀 편안한 표정을 지어 주세요.',
    id: 'expression',
    imageAccessibilityLabel:
      '왼쪽은 입을 벌리고 크게 웃는 잘못된 예시, 오른쪽은 입을 편하게 다문 올바른 예시',
    title: '표정은 편안하게',
  },
  {
    description: '턱끝이 잘리지 않도록 얼굴 전체를 화면 안에 담아 주세요.',
    id: 'framing',
    imageAccessibilityLabel:
      '왼쪽은 얼굴이 아래로 치우쳐 턱끝이 잘린 잘못된 예시, 오른쪽은 얼굴 전체와 턱끝이 화면 중앙에 들어온 올바른 예시',
    title: '턱끝까지 화면 안에',
  },
] as const satisfies readonly FaceAnalysisCaptureChecklistItem[];
