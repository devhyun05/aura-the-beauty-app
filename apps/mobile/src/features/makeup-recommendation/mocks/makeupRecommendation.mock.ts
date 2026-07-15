import {makeupFilterAssetSource} from '../../../shared/config/mediaAssets';
import type {
  MakeupLookRecommendation,
  MakeupQuestionDimension,
  MakeupRecommendationProduct,
  MakeupRecommendationQuestion,
  MakeupScenarioCopyStyle,
  MakeupScenarioPalette,
  MakeupScenarioPrompt,
  MakeupScenarioSource,
  MakeupScenarioTone,
} from '../types';

const scenario = (
  id: string,
  displayText: string,
  seedPrompt: string,
  intentTags: string[],
  knownDimensions: MakeupQuestionDimension[],
  tone: MakeupScenarioTone,
  source: MakeupScenarioSource = 'curated',
): MakeupScenarioPrompt => {
  const editorial = new Set(['trend-my-way', 'camera-first', 'neon-two-am', 'hip-point', 'bookstore-owner', 'film-senior', 'gallery-weekend']);
  const scene = new Set(['baseball-camera', 'light-photo', 'concert-encore', 'festival-sunset', 'saved-look', 'commute-runway']);
  const monologue = new Set(['must-look-beautiful', 'ai-story', 'not-a-blind-date', 'ai-pick', 'reunion']);
  const character = new Set(['art-student', 'music-heiress', 'well-rested', 'well-dressed']);
  const hero = new Set(['must-look-beautiful', 'trend-my-way', 'neon-two-am', 'ai-pick']);
  const featured = new Set(['art-student', 'well-rested', 'camera-first', 'one-lip', 'hip-point', 'saved-look', 'gallery-weekend']);
  const whisper = new Set(['commute-crush', 'not-a-blind-date', 'festival-sunset', 'quiet-luxury', 'bookstore-owner', 'music-heiress', 'concert-encore']);
  const compact = new Set(['ex-wedding', 'wedding-balance', 'light-photo', 'second-date', 'natural-balance', 'one-spoon-bold', 'commute-runway', 'well-dressed']);
  const copyStyle: MakeupScenarioCopyStyle = editorial.has(id)
    ? 'editorial'
    : scene.has(id)
      ? 'scene'
      : monologue.has(id)
        ? 'monologue'
        : character.has(id)
          ? 'character'
          : 'narrative';
  const accentIds = new Set(['ex-wedding', 'baseball-camera', 'saved-look', 'drama-comeback', 'hip-point']);
  const inkIds = new Set(['music-heiress', 'neon-two-am', 'film-senior', 'commute-runway', 'ai-story']);
  const midIds = new Set(['commute-crush', 'art-student', 'well-rested', 'light-photo', 'second-date', 'natural-balance', 'bookstore-owner', 'gallery-weekend']);
  const softIds = new Set(['most-beautiful-self', 'five-minute-polished', 'unfamiliar-me', 'wedding-balance', 'no-plans', 'quiet-luxury', 'one-lip']);
  const palette: MakeupScenarioPalette = accentIds.has(id)
    ? 'accent'
    : inkIds.has(id)
      ? 'ink'
      : midIds.has(id)
        ? 'mid'
        : softIds.has(id)
          ? 'soft'
      : tone === 'premium'
        ? 'paper'
        : 'muted';
  const visualEmphasis = hero.has(id)
    ? 'hero'
    : featured.has(id)
      ? 'featured'
      : whisper.has(id)
      ? 'whisper'
      : compact.has(id)
      ? 'compact'
      : 'standard';
  const preferredColumnSpan = Math.min(8, Math.max(3, 3 + (displayText.length % 6))) as 3 | 4 | 5 | 6 | 7 | 8;
  return {id, displayText, seedPrompt, intentTags, knownDimensions, tone, source, copyStyle, visualEmphasis, palette, preferredColumnSpan};
};

export const MAKEUP_SCENARIOS: readonly MakeupScenarioPrompt[] = [
  scenario('must-look-beautiful', '중요한 날 잘 나오기', '중요한 날 가장 아름답고 자신 있어 보이는 메이크업', ['important', 'polished'], [], 'playful'),
  scenario('most-beautiful-self', '조용한 프리미엄', '나의 장점을 살린 균형 있고 아름다운 메이크업', ['balanced', 'premium'], [], 'premium'),
  scenario('everyday-balance', '매일의 나를 조금 더 또렷하게', '매일 부담 없이 나에게 잘 어울리는 균형 잡힌 메이크업', ['daily', 'balanced'], ['occasion'], 'narrative'),
  scenario('easy-pretty', '힘 빼고 예쁘게', '과하지 않지만 생기와 정돈감이 느껴지는 메이크업', ['natural', 'fresh'], ['mood'], 'playful'),
  scenario('my-basics', '나에게 맞는 기본기', '피부와 이목구비의 장점을 살리는 기본 메이크업', ['basic', 'personal'], ['occasion'], 'premium'),
  scenario('new-mood', '새로운 분위기', '익숙한 인상에 작은 변화를 더하는 메이크업', ['change', 'mood'], ['boldness'], 'playful'),
  scenario('clear-today', '오늘은 맑게', '맑고 가벼운 인상을 만드는 메이크업', ['fresh'], ['mood'], 'playful'),
  scenario('more-defined', '조금 더 또렷하게', '눈매와 윤곽을 한 단계 또렷하게 살리는 메이크업', ['defined'], ['boldness'], 'narrative'),
  scenario('take-it-easy', '힘을 빼고', '힘을 뺀 피부와 자연스러운 색감의 메이크업', ['natural'], ['mood'], 'premium'),
  scenario('one-notch', '한 끗만 더', '평소 메이크업에 작은 포인트 하나를 더하는 메이크업', ['point'], ['boldness'], 'playful'),
  scenario('new-color', '낯선 색 하나', '익숙한 메이크업에 새로운 색 하나를 가볍게 더하는 메이크업', ['color'], ['boldness'], 'premium'),
  scenario('just-me', '나답게 정돈', '나의 장점을 살려 단정하게 정돈하는 메이크업', ['personal'], ['occasion'], 'narrative'),
  scenario('commute-crush', '출근길에 번따', '출근길에 자연스럽지만 평소보다 매력적으로 보이는 메이크업', ['commute', 'romance'], ['occasion'], 'narrative'),
  scenario('five-minute-polished', '5분 만에 완성한 정교한 인상', '5분 안에 완성하지만 정교해 보이는 메이크업', ['quick', 'polished'], ['timeSkill'], 'playful'),
  scenario('trend-my-way', 'SNS에 저장만 해둔 그 메이크업, 이번엔 직접', '최근 메이크업 무드를 나에게 자연스럽게 적용한 메이크업', ['trend', 'personal'], ['mood'], 'premium', 'trend'),
  scenario('ex-wedding', '전 애인 결혼식, 말없이 완승', '결혼식 하객 예절을 지키면서 우아하고 여유로워 보이는 메이크업', ['wedding', 'elegant'], ['occasion', 'mood'], 'narrative'),
  scenario('baseball-camera', '야구장 전광판에 잡히고 싶은 날', '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업', ['baseball', 'camera'], ['occasion'], 'narrative', 'trend'),
  scenario('art-student', '느낌 좋은 미대생 전시 오프닝 메이크업', '색감과 질감에 취향이 느껴지는 힘 뺀 메이크업', ['art', 'effortless'], ['mood'], 'playful'),
  scenario('music-heiress', '부잣집 막내 음대생 메이크업', '단정한 클래식에 우아한 여유가 느껴지는 메이크업', ['classic', 'elegant'], ['mood'], 'narrative'),
  scenario('drama-comeback', '점 하나 찍고 컴백', '이전과 확실히 달라 보이는 세련되고 선명한 메이크업', ['transformation', 'dramatic'], ['boldness'], 'narrative'),
  scenario('camera-first', '공항 출국 레전드', '사진과 조명에서 이목구비가 선명하게 살아나는 메이크업', ['photo', 'defined'], ['occasion'], 'playful'),
  scenario('id-photo', '증명사진 잘 나오기', '증명사진 조명에서 피부와 이목구비가 깔끔하고 신뢰감 있게 보이는 메이크업', ['photo', 'polished'], ['occasion'], 'narrative'),
  scenario('profile-photo', '나다운 프로필 사진', '프로필 사진에서 나의 분위기와 개성이 자연스럽게 드러나는 메이크업', ['photo', 'personal'], ['occasion', 'mood'], 'premium'),
  scenario('well-rested', '밤샘의 흔적만 지우고 출근', '피곤함을 덜어 보이고 맑은 생기를 주는 출근 메이크업', ['commute', 'fresh'], ['occasion'], 'playful'),
  scenario('well-dressed', '꾸안꾸 졸업, 잘꾸 입학', '정성 들여 꾸민 티가 나는 완성도 높은 메이크업', ['polished', 'visible'], ['boldness'], 'playful'),
  scenario('neon-two-am', '을지로 새벽 네온을 닮은 메이크업', '네온 조명에서 색과 광택이 매력적으로 보이는 메이크업', ['night', 'neon'], ['occasion', 'mood'], 'premium'),
  scenario('ai-story', 'AI가 골라주는 예상 밖의 서사', '평소 취향에서 벗어난 이야기 있는 메이크업을 자유롭게 추천', ['wildcard', 'story'], [], 'playful', 'wildcard'),
  scenario('face-story-drop', '내 얼굴에 서사 한 방울', '내 얼굴의 분위기에 작은 이야기와 여운을 더하는 메이크업', ['story', 'personal'], ['mood'], 'premium', 'personalized'),
  scenario('unfamiliar-me', '낯설지만 나다운 변화', '본래 인상은 살리면서 새롭게 느껴지는 메이크업', ['change', 'personal'], ['boldness'], 'premium'),
  scenario('wedding-balance', '예식장 조명까지 계산한 하객 메이크업', '격식 있는 자리에서 화사하고 균형 잡힌 메이크업', ['special', 'balanced'], ['occasion'], 'premium'),
  scenario('light-photo', '자연광과 플래시에 모두 강한 메이크업', '자연광과 사진에서 피부 표현과 색조가 조화로운 메이크업', ['light', 'photo'], ['occasion'], 'premium'),
  scenario('glasses-eyes', '안경 너머로도 살아나는 눈매', '안경테에 가리지 않고 또렷해 보이는 아이 메이크업', ['glasses', 'eye'], ['occasion'], 'playful'),
  scenario('concert-encore', '앵콜까지 살아남는 콘서트 메이크업', '열기와 긴 시간에도 포인트가 유지되는 콘서트 메이크업', ['concert', 'lasting'], ['occasion'], 'narrative'),
  scenario('festival-sunset', '새벽까지 살아남는 페스티벌 헤드라이너 메이크업', '낮부터 노을과 밤 조명까지 어울리는 페스티벌 메이크업', ['festival', 'sunset'], ['occasion'], 'narrative', 'trend'),
  scenario('second-date', '두 번째 만남, 조금 더 선명한 인상', '편안함과 설렘이 함께 느껴지는 두 번째 데이트 메이크업', ['date', 'romance'], ['occasion'], 'narrative'),
  scenario('not-a-blind-date', '소개팅은 아니지만 첫인상은 중요하니까', '과하지 않지만 첫인상이 좋은 약속 메이크업', ['meeting', 'first-impression'], ['occasion'], 'playful'),
  scenario('one-lip', '립 하나로 약속 있는 사람 되기', '립을 중심으로 최소 단계로 분위기를 완성하는 메이크업', ['lip', 'quick'], ['timeSkill'], 'playful'),
  scenario('no-plans', '약속 없이도 특별한 기분', '일상에서 부담 없이 기분을 바꾸는 특별한 메이크업', ['daily', 'special'], ['occasion'], 'premium'),
  scenario('natural-balance', '힘을 뺄수록 또렷해지는 밸런스', '얼굴의 장점을 해치지 않는 자연스럽고 균형 잡힌 메이크업', ['natural', 'balanced'], ['mood'], 'premium'),
  scenario('quiet-luxury', '말하지 않아도 느껴지는 조용한 럭셔리', '과한 색보다 정돈된 피부와 섬세한 음영이 돋보이는 메이크업', ['elegant', 'quiet'], ['mood'], 'premium'),
  scenario('hip-point', '성수동 느좋 감성', '전체는 정돈하고 한 부위에 감각적인 포인트를 준 메이크업', ['hip', 'point'], ['mood'], 'playful'),
  scenario('one-spoon-bold', '평소보다 한 단계 대담하게', '평소 스타일을 기반으로 색이나 라인을 조금 더 과감하게 쓴 메이크업', ['bold', 'personal'], ['boldness'], 'playful'),
  scenario('ai-pick', '취향의 빈칸은 AI에게 맡기기', '상황과 분석 결과를 참고해 오늘의 메이크업을 자유롭게 추천', ['ai', 'wildcard'], [], 'premium', 'wildcard'),
  scenario('saved-look', '음악프로그램 무대 접수 아이돌 메이크업', '온라인에서 저장하던 트렌디한 메이크업을 현실적으로 적용한 메이크업', ['saved', 'trend'], ['mood'], 'narrative', 'trend'),
  scenario('commute-runway', '첫 출근인데 이미 에이스', '업무 환경을 지키면서 실루엣이 또렷한 출근 메이크업', ['commute', 'fashion'], ['occasion'], 'playful'),
  scenario('reunion', '오랜만이라는 말 뒤에 한 번 더 돌아보게', '과거보다 세련되고 여유로워 보이는 동창회 메이크업', ['reunion', 'transformation'], ['occasion'], 'narrative'),
  scenario('bookstore-owner', '연남동 독립서점 단골 메이크업', '차분한 색과 지적인 분위기가 느껴지는 메이크업', ['bookstore', 'calm'], ['mood'], 'narrative'),
  scenario('film-senior', '홍대 4번 출구 서브컬처 메이크업', '절제된 색감과 깊은 눈매가 인상적인 메이크업', ['cinema', 'moody'], ['mood'], 'narrative'),
  scenario('gallery-weekend', '이태원 해방촌 힙스터 메이크업', '힘을 뺀 피부와 감각적인 색 포인트의 주말 메이크업', ['gallery', 'weekend'], ['occasion', 'mood'], 'premium'),
];

export const MAKEUP_QUESTIONS: Record<MakeupQuestionDimension, MakeupRecommendationQuestion> = {
  occasion: {
    id: 'question-occasion', dimension: 'occasion', title: '어디에서 어떻게 보이고 싶어요?',
    options: [{id: 'daily', label: '일상에서 자연스럽게'}, {id: 'date', label: '약속에서 매력적으로'}, {id: 'camera', label: '사진에서 또렷하게'}, {id: 'ai-pick', label: 'AI가 골라줘'}],
  },
  mood: {
    id: 'question-mood', dimension: 'mood', title: '어떤 분위기가 끌리나요?',
    options: [{id: 'fresh', label: '맑고 생기 있게'}, {id: 'elegant', label: '우아하고 차분하게'}, {id: 'moody', label: '감각적이고 깊게'}, {id: 'ai-pick', label: 'AI가 골라줘'}],
  },
  boldness: {
    id: 'question-boldness', dimension: 'boldness', title: '평소보다 얼마나 과감해질까요?',
    options: [{id: 'soft', label: '자연스럽게'}, {id: 'point', label: '한 스푼만'}, {id: 'bold', label: '확실하게'}, {id: 'ai-pick', label: 'AI가 골라줘'}],
  },
  timeSkill: {
    id: 'question-time-skill', dimension: 'timeSkill', title: '시간과 난이도는 어느 정도가 좋아요?',
    options: [{id: 'quick', label: '5분 커트'}, {id: 'steady', label: '15분 차분히'}, {id: 'detailed', label: '시간을 들여 정교하게'}, {id: 'ai-pick', label: 'AI가 골라줘'}],
  },
};

const products = (prefix: string, accent: string): MakeupRecommendationProduct[] => [
  {id: `${prefix}-base`, area: 'base', brandName: '루미에르', productName: '라이트 핏 쿠션', shadeName: '21N', reason: '얇고 균일한 피부 표현'},
  {id: `${prefix}-eye`, area: 'eye', brandName: '벨루어', productName: '음영 팔레트', shadeName: accent, reason: '메이크업의 주조색을 연결'},
  {id: `${prefix}-brow`, area: 'brow', brandName: '아티에', productName: '슬림 브로우', shadeName: '내추럴 브라운', reason: '눈매와 자연스럽게 조율'},
  {id: `${prefix}-cheek`, area: 'cheek', brandName: '루네라', productName: '에어리 블러셔', shadeName: accent, reason: '아이와 립 색감을 중간에서 연결'},
  {id: `${prefix}-lip`, area: 'lip', brandName: '로제드', productName: '세럼 틴트', shadeName: accent, reason: '전체 메이크업의 포인트를 완성'},
];

const steps = (eye: string, lip: string) => [
  {area: 'base' as const, instruction: '얇게 밀착시켜 피부 톤을 균일하게 정리해요.', order: 1},
  {area: 'brow' as const, instruction: '빈 곳만 채워 부드러운 결을 만들어요.', order: 2},
  {area: 'eye' as const, instruction: eye, order: 3},
  {area: 'cheek' as const, instruction: '눈 아래부터 광대를 감싸듯 엷게 발라요.', order: 4},
  {area: 'lip' as const, instruction: lip, order: 5},
];

export const MAKEUP_LOOK_FIXTURES: readonly MakeupLookRecommendation[] = [
  {
    id: 'look-anchor-rose', arFilterId: 'filter-milky-strawberry-pink', role: 'anchor', title: '로지 밸런스', summary: '낯익은 로즈 톤을 정돈해 가장 안정적으로 어울리는 메이크업',
    imageSource: makeupFilterAssetSource('community-lookbook-rose.png'), reasons: ['피부와 색조의 균형', '일상부터 약속까지 활용'], appliedConditions: [], durationMinutes: 15, difficulty: 'easy',
    steps: steps('로즈 브라운을 눈두덩에 엷게 펼쳐요.', '로즈 틴트를 안쪽부터 부드럽게 퍼뜨려요.'), products: products('anchor', '로즈 베일'),
  },
  {
    id: 'look-bold-smoky', arFilterId: 'filter-clean-smoky-city', role: 'bold', title: '클린 스모키', summary: '깊은 눈매와 절제된 색조로 확실한 인상을 남기는 메이크업',
    imageSource: makeupFilterAssetSource('community-question-smoky.png'), reasons: ['눈매를 또렷하게 강조', '조명에서 선명한 음영'], appliedConditions: [], durationMinutes: 25, difficulty: 'advanced',
    steps: steps('차콜 브라운을 눈꼬리 방향으로 층층이 쌓아요.', '저채도 베리 립으로 눈매의 깊이를 받쳐요.'), products: products('bold', '모피 버건디'),
  },
  {
    id: 'look-discovery-muted', arFilterId: 'filter-plum-syrup-gloss', role: 'discovery', title: '뮤티드 라일락', summary: '낯선 라일락과 뮤티드 질감으로 새로운 취향을 제안하는 메이크업',
    imageSource: makeupFilterAssetSource('community-combo-muted.png'), reasons: ['기존 취향을 해치지 않는 변화', '절제된 색 포인트'], appliedConditions: [], durationMinutes: 20, difficulty: 'medium',
    steps: steps('뮤티드 라일락을 눈두덩 중앙에 엷게 올려요.', '누드 모브를 입술 전체에 얇게 발라요.'), products: products('discovery', '뮤티드 라일락'),
  },
];
