export type MakeupGuidelineCategory = 'all' | 'eye' | 'brow' | 'lip' | 'cheek' | 'base';

export type MakeupCorrectionGuideSection = {
  id: Exclude<MakeupGuidelineCategory, 'all'>;
  title: string;
  subtitle: string;
  items: Array<{
    label: string;
    value: string;
  }>;
};

export type MakeupCorrectionGuideIconName = 'brush' | 'eye' | 'heart' | 'palette';

const guideTabs: Array<{id: MakeupGuidelineCategory; label: string}> = [
  {id: 'all', label: '전체'},
  {id: 'eye', label: '눈'},
  {id: 'brow', label: '눈썹'},
  {id: 'lip', label: '입술'},
  {id: 'cheek', label: '블러셔'},
  {id: 'base', label: '베이스'},
];

const guideSections: MakeupCorrectionGuideSection[] = [
  {
    id: 'eye',
    title: '눈 메이크업',
    subtitle: '아이라인 각도와 음영 범위를 정리해 눈매 균형을 맞춰요.',
    items: [
      {label: '아이섀도우', value: '쌍꺼풀 라인 위 2mm까지만 부드러운 브라운 음영'},
      {label: '아이라이너', value: '오른쪽 꼬리는 3도 낮춰 수평에 가깝게 연결'},
      {label: '마스카라', value: '중앙은 세우고 꼬리 쪽은 바깥 방향으로 얇게'},
    ],
  },
  {
    id: 'brow',
    title: '눈썹 정리',
    subtitle: '눈썹 산과 꼬리 높이를 맞추면 인상이 더 또렷해져요.',
    items: [
      {label: '눈썹 산', value: '검은자 바깥쪽 위에 산을 두고 각도는 낮게'},
      {label: '눈썹 꼬리', value: '눈꼬리보다 살짝 길게, 아래로 처지지 않게'},
      {label: '빈 곳 채움', value: '앞머리는 연하게, 중간부터 꼬리만 한 톤 진하게'},
    ],
  },
  {
    id: 'lip',
    title: '입술 메이크업',
    subtitle: '입꼬리 경계와 중앙 볼륨을 정리해 선명도를 올려요.',
    items: [
      {label: '립 컬러', value: '중앙은 한 번 더 얹고 바깥은 손가락으로 얇게 블렌딩'},
      {label: '립 포인트', value: '아랫입술 중앙 광택만 살려 볼륨감 추가'},
      {label: '립 엣지', value: '입꼬리 바깥 번짐은 컨실러 브러시로 정리'},
    ],
  },
  {
    id: 'cheek',
    title: '블러셔',
    subtitle: '블러셔 위치를 위로 올리면 얼굴 중심이 자연스럽게 리프팅돼요.',
    items: [
      {label: '시작 위치', value: '코끝보다 아래로 내려오지 않게 광대 위쪽에서 시작'},
      {label: '방향', value: '관자놀이 방향으로 짧게 쓸어 올려 사선감 만들기'},
      {label: '농도', value: '볼 중앙은 연하게, 바깥쪽으로 갈수록 더 옅게'},
    ],
  },
  {
    id: 'base',
    title: '베이스',
    subtitle: '중앙 광은 남기고 외곽은 보송하게 잡아 얼굴 윤곽을 정돈해요.',
    items: [
      {label: 'T존', value: '이마와 콧대 중앙만 얇게 밝혀 입체감 유지'},
      {label: '외곽', value: '헤어라인과 턱선은 파우더로 번들거림 정리'},
      {label: '마무리', value: '코 옆과 입가만 한 번 더 눌러 지속력 높이기'},
    ],
  },
];

export function getMakeupCorrectionGuideTabs() {
  return guideTabs;
}

export function getMakeupCorrectionGuideSections() {
  return guideSections;
}

export function getMakeupCorrectionGuideIconName(
  id: MakeupCorrectionGuideSection['id'],
): MakeupCorrectionGuideIconName {
  if (id === 'eye' || id === 'brow') {
    return 'eye';
  }

  if (id === 'lip') {
    return 'heart';
  }

  if (id === 'cheek') {
    return 'brush';
  }

  return 'palette';
}
