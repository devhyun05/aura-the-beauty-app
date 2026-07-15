/**
 * 체형 프로필 — 사용자가 거울 앞에서 스스로 관찰 가능한 7문항 설문으로
 * ① 실루엣(비율) ② 골격(뼈대·질감)을 진단하고 스타일링 가이드를 돌려주는 순수 로직.
 *
 * 왜 체감 설문인가(체향 프로필과 같은 철학): 사용자는 자기 어깨-골반 비율(cm)이나
 * "웨이브 골격" 같은 용어를 모른다. 그래서 "살이 찌면 어디부터 붙나요?"처럼 스스로
 * 관찰해 본 경험을 물어 내부 유니온 값으로 매핑한다. 답(원자료)을 저장하고 분류는
 * 렌더 시 유도하므로, 분류 규칙을 나중에 튜닝해도 저장 데이터 마이그레이션이 없다.
 *
 * 두 축은 서로 다른 질문에서 나온다:
 * - 실루엣 = 가로 비율(어깨 vs 골반)·허리 굴곡·볼륨 위치 → 결정론적 분기 트리.
 * - 골격 = 뼈·살결의 질감 4문항 → 다수결 투표(동률이면 판별력이 가장 높은
 *   손목 문항의 답이 결정 — 손목 표는 항상 동률 집합 안에 있어 전 케이스 결정론).
 */

// ── 설문 답 유니온(옵션 id = 유니온 값, UI가 그대로 캐스팅) ───────────────────
/** 어깨와 골반 중 어느 쪽이 넓어 보이는가. */
export type FrameWidth = 'shoulder' | 'even' | 'hip';
/** 허리 굴곡 체감. */
export type WaistShape = 'defined' | 'soft' | 'straight';
/** 살이 붙을 때 먼저 붙는 곳. */
export type VolumeSpot = 'upper' | 'lower' | 'spread';
/** 손목 단면·뼈 체감. */
export type WristFeel = 'round' | 'flat' | 'bony';
/** 쇄골이 드러나는 정도. */
export type CollarFeel = 'hidden' | 'subtle' | 'sharp';
/** 살결(피부·근육) 체감. */
export type FleshFeel = 'firm' | 'soft' | 'sinewy';
/** 몸의 볼륨 무게중심 체감. */
export type BodyBalance = 'upperBody' | 'lowerBody' | 'frame';

/** 저장/전달되는 체형 프로필 한 벌 — 분류 결과가 아니라 설문 원답을 저장한다. */
export interface BodyProfile {
  frameWidth: FrameWidth;
  waist: WaistShape;
  volume: VolumeSpot;
  wrist: WristFeel;
  collar: CollarFeel;
  flesh: FleshFeel;
  balance: BodyBalance;
  createdAt: number;
}

/** 설문 답 필드(= createdAt 제외한 프로필 필드). */
export type BodyAnswerKey = Exclude<keyof BodyProfile, 'createdAt'>;

/** 설문 한 문항의 선택지 하나. id는 해당 필드 유니온 값과 정확히 일치. */
export interface BodyOption {
  id: string;
  label: string;
}

/** 설문 한 문항. key는 이 답이 채우는 프로필 필드, group은 UI 섹션 라벨. */
export interface BodyQuestion {
  key: BodyAnswerKey;
  group: '비율' | '골격 질감';
  question: string;
  options: BodyOption[];
}

/**
 * 체감 설문 7문항 — 앞 3문항(비율)이 실루엣을, 뒤 4문항(골격 질감)이 골격을 결정.
 * 각 옵션 id는 반드시 해당 필드의 유니온 값이어야 한다(예: waist는 'defined'|'soft'|'straight').
 */
export const BODY_QUESTIONS: BodyQuestion[] = [
  {
    key: 'frameWidth',
    group: '비율',
    question: '거울을 정면으로 봤을 때, 어깨와 골반 중 어디가 더 넓어 보이나요?',
    options: [
      {id: 'shoulder', label: '어깨가 더 넓어요'},
      {id: 'even', label: '비슷해요'},
      {id: 'hip', label: '골반이 더 넓어요'},
    ],
  },
  {
    key: 'waist',
    group: '비율',
    question: '허리 라인은 어떤 편인가요?',
    options: [
      {id: 'defined', label: '눈에 띄게 잘록해요'},
      {id: 'soft', label: '살짝 들어가요'},
      {id: 'straight', label: '거의 일자예요'},
    ],
  },
  {
    key: 'volume',
    group: '비율',
    question: '살이 찌면 어디부터 붙는 편인가요?',
    options: [
      {id: 'upper', label: '배·팔 등 상체부터'},
      {id: 'lower', label: '골반·허벅지 등 하체부터'},
      {id: 'spread', label: '전체적으로 고르게'},
    ],
  },
  {
    key: 'wrist',
    group: '골격 질감',
    question: '손목을 만져 보면?',
    options: [
      {id: 'round', label: '단면이 둥글고 뼈가 잘 안 만져져요'},
      {id: 'flat', label: '납작하고 가늘어요'},
      {id: 'bony', label: '뼈가 크고 도드라져요'},
    ],
  },
  {
    key: 'collar',
    group: '골격 질감',
    question: '쇄골은 어떻게 드러나나요?',
    options: [
      {id: 'hidden', label: '거의 안 보여요'},
      {id: 'subtle', label: '가늘게 보여요'},
      {id: 'sharp', label: '크고 뚜렷해요'},
    ],
  },
  {
    key: 'flesh',
    group: '골격 질감',
    question: '몸의 살결을 만졌을 때 느낌은?',
    options: [
      {id: 'firm', label: '탄력 있고 탱탱해요'},
      {id: 'soft', label: '부드럽고 말랑해요'},
      {id: 'sinewy', label: '단단하고 뼈·힘줄이 느껴져요'},
    ],
  },
  {
    key: 'balance',
    group: '골격 질감',
    question: '몸 전체의 존재감(볼륨)은 어디에 있나요?',
    options: [
      {id: 'upperBody', label: '가슴·상체 쪽에 볼륨이 있어요'},
      {id: 'lowerBody', label: '하체 중심이고 상체는 얇아요'},
      {id: 'frame', label: '뼈대 자체가 커서 프레임이 살아요'},
    ],
  },
];

// ── 분류 ──────────────────────────────────────────────────────────────────
export type Silhouette = 'hourglass' | 'inverted' | 'pear' | 'apple' | 'rect';
export type Frame = 'straight' | 'wave' | 'natural';

/**
 * 실루엣 분류 — 결정론적 분기 트리(전 27조합 총망라).
 * 가로 비율이 기울면 그쪽이 우선(역삼각/삼각), 균형이면 허리 굴곡으로 모래시계,
 * 일자 허리 + 상체 볼륨이면 라운드, 나머지는 직사각.
 */
export const classifySilhouette = (
  frameWidth: FrameWidth,
  waist: WaistShape,
  volume: VolumeSpot,
): Silhouette => {
  if (frameWidth === 'shoulder') return 'inverted';
  if (frameWidth === 'hip') return 'pear';
  if (waist === 'defined') return 'hourglass';
  if (waist === 'straight' && volume === 'upper') return 'apple';
  return 'rect';
};

// 골격 투표 — 각 문항의 옵션이 어느 골격에 1표를 주는지(옵션 순서와 무관한 명시 매핑).
const WRIST_VOTE: Record<WristFeel, Frame> = {round: 'straight', flat: 'wave', bony: 'natural'};
const COLLAR_VOTE: Record<CollarFeel, Frame> = {hidden: 'straight', subtle: 'wave', sharp: 'natural'};
const FLESH_VOTE: Record<FleshFeel, Frame> = {firm: 'straight', soft: 'wave', sinewy: 'natural'};
const BALANCE_VOTE: Record<BodyBalance, Frame> = {upperBody: 'straight', lowerBody: 'wave', frame: 'natural'};

/**
 * 골격 분류 — 4문항 다수결. 4표를 3종에 나누므로 동률은 2-2뿐이고, 손목 표는
 * 항상 그 동률 집합 안에 있으므로(자기 골격에 1표를 줬으니 0표 골격일 수 없다)
 * 동률이면 손목 답의 골격을 택한다 → 전 케이스 결정론.
 */
export const classifyFrame = (
  wrist: WristFeel,
  collar: CollarFeel,
  flesh: FleshFeel,
  balance: BodyBalance,
): Frame => {
  const votes: Record<Frame, number> = {straight: 0, wave: 0, natural: 0};
  votes[WRIST_VOTE[wrist]] += 1;
  votes[COLLAR_VOTE[collar]] += 1;
  votes[FLESH_VOTE[flesh]] += 1;
  votes[BALANCE_VOTE[balance]] += 1;
  const max = Math.max(votes.straight, votes.wave, votes.natural);
  const top = (Object.keys(votes) as Frame[]).filter(f => votes[f] === max);
  return top.length === 1 ? top[0] : WRIST_VOTE[wrist];
};

// ── 타입별 라벨·스타일링 콘텐츠 ─────────────────────────────────────────────
/** 타입 하나의 표시 콘텐츠 — 라벨·한 줄 특징·추천·피할 것. */
export interface TypeStyle {
  label: string;
  tagline: string;
  points: string[];
  avoid: string[];
}

export const SILHOUETTE_STYLES: Record<Silhouette, TypeStyle> = {
  hourglass: {
    label: '모래시계형',
    tagline: '어깨·골반이 균형 잡히고 허리가 잘록한 곡선 비율',
    points: [
      '허리 라인을 살리는 핏(랩 원피스·벨티드 재킷)이 최고의 무기예요',
      '몸의 곡선을 따라가는 소재가 비율을 그대로 보여줘요',
      '하이웨이스트 하의로 다리 라인까지 길어 보여요',
    ],
    avoid: ['허리가 묻히는 박시한 일자 핏', '과한 오버사이즈 레이어링'],
  },
  inverted: {
    label: '역삼각형',
    tagline: '어깨가 골반보다 넓어 상체 존재감이 큰 비율',
    points: [
      'V넥·U넥으로 시선을 세로로 풀어 어깨를 부드럽게 보여요',
      'A라인 스커트·와이드 팬츠로 하체에 볼륨을 더해 균형을 맞춰요',
      '하의에 밝은 색·패턴을 두면 시선이 아래로 분산돼요',
    ],
    avoid: ['어깨 패드·퍼프 소매 등 어깨를 키우는 디테일', '보트넥·오프숄더'],
  },
  pear: {
    label: '삼각형(하체 볼륨)',
    tagline: '골반이 어깨보다 넓어 하체에 볼륨이 실리는 비율',
    points: [
      '상체에 포인트(밝은 색·디테일·액세서리)를 두면 시선이 위로 올라와요',
      '어깨선이 살아 있는 상의(보트넥·구조적 재킷)로 상하 균형을 맞춰요',
      'A라인·세미 와이드 하의가 골반 라인을 자연스럽게 흘려보내요',
    ],
    avoid: ['스키니 하의 + 짧은 상의 조합', '골반에 걸치는 로우라이즈'],
  },
  apple: {
    label: '라운드형(상체 볼륨)',
    tagline: '허리 굴곡이 완만하고 볼륨이 몸 중심에 모이는 비율',
    points: [
      '세로 라인(긴 카디건·롱 셔츠·V넥)이 몸 중심을 시원하게 나눠줘요',
      '가슴 아래에서 흐르는 엠파이어 라인이 허리 대신 비율을 만들어요',
      '팔·다리 등 슬림한 부위를 드러내면 전체가 가벼워 보여요',
    ],
    avoid: ['허리를 조이는 벨트 강조', '몸 중심에 붙는 얇은 저지 소재'],
  },
  rect: {
    label: '직사각형',
    tagline: '어깨·허리·골반 폭이 비슷한 일자 비율',
    points: [
      '페플럼·벨트·랩 디테일로 허리 라인을 만들어 주면 곡선이 살아나요',
      '상하의 대비(볼륨 상의 + 슬림 하의)로 실루엣에 리듬을 줘요',
      '레이어링이 잘 받는 몸이라 재킷·셔츠 겹쳐 입기가 유리해요',
    ],
    avoid: ['어깨부터 밑단까지 통짜로 떨어지는 박시 핏 단독 착장'],
  },
};

export const FRAME_STYLES: Record<Frame, TypeStyle> = {
  straight: {
    label: '스트레이트 골격',
    tagline: '몸에 탄력·두께감이 있어 심플한 정핏이 고급스러워 보이는 골격',
    points: [
      '군더더기 없는 베이식·클래식(셔츠·테일러드 재킷)이 가장 잘 받아요',
      '몸의 두께를 그대로 살리는 I라인 실루엣이 세련돼 보여요',
      '두께감 있는 고밀도 소재(울·코튼 트윌)가 몸과 어울려요',
    ],
    avoid: ['과한 프릴·러플 등 잔장식', '목을 덮는 하이넥(답답해 보일 수 있어요)'],
  },
  wave: {
    label: '웨이브 골격',
    tagline: '뼈대가 가늘고 살결이 부드러워 흐르는 소재가 어울리는 골격',
    points: [
      '부드럽게 떨어지는 소재(쉬폰·니트)가 몸의 곡선을 살려줘요',
      '하이웨이스트로 무게중심을 올리면 비율이 확 좋아져요',
      '리본·셔링·프릴 같은 곡선 디테일이 얼굴까지 화사하게 해줘요',
    ],
    avoid: ['빳빳하고 큰 오버사이즈(옷에 몸이 잡아먹혀요)', '로우라이즈 하의'],
  },
  natural: {
    label: '내추럴 골격',
    tagline: '뼈대·관절의 프레임이 살아 있어 여유 있는 핏이 멋스러운 골격',
    points: [
      '오버사이즈·루즈핏을 소화하는 몸 — 여유 있는 실루엣이 오히려 스타일이 돼요',
      '마·린넨·워싱 코튼 같은 자연스러운 질감의 소재가 잘 받아요',
      '래글런·드롭숄더 등 어깨선을 흘리는 디자인이 편안하고 멋져요',
    ],
    avoid: ['몸에 딱 붙는 타이트 핏(뼈대가 도드라져 보여요)', '섬세한 잔무늬 소품'],
  },
};

// ── 리포트 ──────────────────────────────────────────────────────────────────
/** 진단 결과 한 벌 — 두 축의 타입·콘텐츠와 한계 고지. */
export interface BodyReport {
  silhouette: Silhouette;
  frame: Frame;
  silhouetteStyle: TypeStyle;
  frameStyle: TypeStyle;
  caveat: string;
}

const CAVEAT =
  '체감 설문 기반의 참고용 진단이에요. 실제 어울림은 키·취향·상황에 따라 달라지니, 스타일링 제안은 시작점으로만 활용하세요.';

/** 프로필(설문 원답)로부터 진단 리포트를 유도한다. 결정론적 순수 함수. */
export const analyzeBody = (p: BodyProfile): BodyReport => {
  const silhouette = classifySilhouette(p.frameWidth, p.waist, p.volume);
  const frame = classifyFrame(p.wrist, p.collar, p.flesh, p.balance);
  return {
    silhouette,
    frame,
    silhouetteStyle: SILHOUETTE_STYLES[silhouette],
    frameStyle: FRAME_STYLES[frame],
    caveat: CAVEAT,
  };
};

/** 프로필을 한 줄 요약으로. 예: "모래시계형 · 웨이브 골격". */
export const summarizeBody = (p: BodyProfile): string => {
  const r = analyzeBody(p);
  return `${SILHOUETTE_STYLES[r.silhouette].label} · ${FRAME_STYLES[r.frame].label}`;
};

// 유니온 값 화이트리스트 — 손상 데이터 판별과 옵션 검증의 단일 출처.
export const VALID_ANSWERS: Record<BodyAnswerKey, string[]> = {
  frameWidth: ['shoulder', 'even', 'hip'],
  waist: ['defined', 'soft', 'straight'],
  volume: ['upper', 'lower', 'spread'],
  wrist: ['round', 'flat', 'bony'],
  collar: ['hidden', 'subtle', 'sharp'],
  flesh: ['firm', 'soft', 'sinewy'],
  balance: ['upperBody', 'lowerBody', 'frame'],
};

/** 저장소에서 읽은 임의 값이 온전한 BodyProfile인지 판별(손상 데이터 방어). */
export const isBodyProfile = (v: unknown): v is BodyProfile => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    (Object.keys(VALID_ANSWERS) as BodyAnswerKey[]).every(k =>
      VALID_ANSWERS[k].includes(o[k] as string),
    ) && typeof o.createdAt === 'number'
  );
};
