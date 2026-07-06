import type {CommunityThreadDetail, CommunityThreadSummary} from '../types';

const fallbackImage = require('../../../assets/images/makeup-filters/filter-lovely-pink-actress.png');
// 비포애프터 데모용 — 동일 인물의 채도 낮춘 "민낯 톤" 버전.
const fallbackBeforeImage = require('../../../assets/images/makeup-filters/filter-lovely-pink-actress-before.png');
// 카테고리 무드별 커버 (베이스 사진의 컬러 그레이딩 변형 — 피드에 다양성 부여).
const lookbookRoseImage = require('../../../assets/images/makeup-filters/community-lookbook-rose.png');
const comboMutedImage = require('../../../assets/images/makeup-filters/community-combo-muted.png');
const questionSmokyImage = require('../../../assets/images/makeup-filters/community-question-smoky.png');
const comboLipImage = require('../../../assets/images/makeup-filters/community-combo-lip.png');

const mockImageByMediaId: Record<string, ReturnType<typeof require>> = {
  'mock-media-1': lookbookRoseImage,
  'mock-media-2': comboMutedImage,
  'mock-media-3': fallbackImage, // before_after cover = AFTER original
  'mock-media-4': questionSmokyImage,
  'mock-media-5': comboLipImage,
  // Bedrock recommendation QA seed media ids. Each id maps to a different local asset.
  'ecbe137e-8a05-58e1-a878-7e2cb789e6ac': lookbookRoseImage,
  'f7d8c487-aa3a-5b1a-81c9-2706c9a42fbb': comboMutedImage,
  '738f1112-2daa-503a-9cd9-14561057beb0': fallbackImage,
  '1cbf6ebb-841d-506e-8c7b-d4bfd7d1a3f6': questionSmokyImage,
  'f345f881-081e-5cad-bae4-ed9046b93e0c': comboLipImage,
  'bc588ddd-385f-5448-a3b4-41571bb3fb5d': fallbackBeforeImage,
};

export const communityMockThreads: CommunityThreadSummary[] = [
  {
    author: {id: 'user-glow', nickname: 'glow.archive'},
    category: 'lookbook',
    counts: {likes: 482, replies: 3, saves: 214, views: 4200},
    coverMedia: {id: 'mock-media-1', imageUrl: undefined},
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    difficulty: 'easy',
    durationMinutes: 9,
    id: 'mock-thread-glass-skin-rose',
    moodTags: ['글로우', '로즈', '클린베이스'],
    situationTags: ['출근', '데이트'],
    title: '속광만 남긴 로즈 글래스 스킨',
    viewerState: {liked: false, saved: true},
  },
  {
    author: {id: 'user-mute', nickname: 'mute.palette'},
    category: 'product_combo',
    counts: {likes: 336, replies: 2, saves: 176, views: 3100},
    coverMedia: {id: 'mock-media-2', imageUrl: undefined},
    createdAt: new Date(Date.now() - 1000 * 60 * 64).toISOString(),
    // 제품조합 작성 양식에는 난이도·소요시간 입력이 없다 — 항상 null.
    difficulty: null,
    durationMinutes: null,
    id: 'mock-thread-muted-rose-combo',
    moodTags: ['뮤트핑크', '말린장미', '톤온톤'],
    situationTags: ['하객', '데일리'],
    title: '립이랑 치크 톤 맞춘 뮤트 로즈 조합',
    viewerState: {liked: true, saved: false},
  },
  {
    author: {id: 'user-after', nickname: 'soft.after'},
    category: 'before_after',
    counts: {likes: 589, replies: 3, saves: 241, views: 6800},
    coverMedia: {id: 'mock-media-3', imageUrl: undefined},
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    difficulty: 'easy',
    durationMinutes: 8,
    id: 'mock-thread-clean-base-shift',
    moodTags: ['클린걸', '물광', '얇은베이스'],
    situationTags: ['증명사진', '데일리'],
    title: '피부 표현만 바꿔도 분위기가 달라져요',
    viewerState: {liked: false, saved: false},
  },
  {
    author: {id: 'user-smoke', nickname: 'soft.smoke'},
    category: 'question',
    counts: {likes: 149, replies: 3, saves: 63, views: 1900},
    coverMedia: {id: 'mock-media-4', imageUrl: undefined},
    createdAt: new Date(Date.now() - 1000 * 60 * 260).toISOString(),
    // 질문 글은 레시피 값이 없는 게 일반적 — 카드에서 "답변 n개" 변형이 노출된다.
    difficulty: null,
    durationMinutes: null,
    id: 'mock-thread-soft-smoky-question',
    moodTags: ['소프트스모키', '브라운', '음영'],
    situationTags: ['저녁약속', '겨울'],
    title: '스모키가 세 보이지 않게 빼는 법 있을까요',
    viewerState: {liked: false, saved: false},
  },
  {
    author: {id: 'user-lip', nickname: 'lip.layer'},
    category: 'product_combo',
    counts: {likes: 271, replies: 1, saves: 139, views: 2450},
    coverMedia: {id: 'mock-media-5', imageUrl: undefined},
    createdAt: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    // 제품조합 작성 양식에는 난이도·소요시간 입력이 없다 — 항상 null.
    difficulty: null,
    durationMinutes: null,
    id: 'mock-thread-lip-layering',
    moodTags: ['오버립', '시럽광', '쿨핑크'],
    situationTags: ['셀카', '주말'],
    title: '틴트 하나로 입술 볼륨감 만드는 레이어링',
    viewerState: {liked: true, saved: true},
  },
];

// 카테고리별 작성 양식대로 채운 상세 콘텐츠 — 룩북=레시피형, 질문=고민+답변, 제품조합=조합 순서, BA=변화 설명.
type MockDetailContent = Pick<CommunityThreadDetail, 'body' | 'productUsage' | 'replies'>;

function makeReply(
  threadId: string,
  n: number,
  author: {id: string; nickname: string},
  body: string,
  minutesAgo: number,
  children: Array<{author: {id: string; nickname: string}; body: string; minutesAgo: number}> = [],
) {
  return {
    author,
    body,
    createdAt: new Date(Date.now() - 1000 * 60 * minutesAgo).toISOString(),
    id: `${threadId}-reply-${n}`,
    likeCount: Math.max(0, 9 - n * 3),
    parentReplyId: null,
    replies: children.map((child, index) => ({
      author: child.author,
      body: child.body,
      createdAt: new Date(Date.now() - 1000 * 60 * child.minutesAgo).toISOString(),
      id: `${threadId}-reply-${n}-${index + 1}`,
      likeCount: 1,
      parentReplyId: `${threadId}-reply-${n}`,
    })),
  };
}

const emptyUsage = {base: [], cheek: [], eye: [], lip: []};

const mockDetailContentByThreadId: Record<string, MockDetailContent> = {
  'mock-thread-glass-skin-rose': {
    body: '결혼식 하객룩으로 준비한 물광 베이스예요. 순서는 ①수분 프라이머 얇게 ②리퀴드 파운데이션을 브러시로 두 번 나눠 올리기 ③T존만 파우더. 하이라이터 없이 쿠션 광만 남기는 게 포인트! 로즈 립·치크를 같은 온도로 맞추면 정돈돼 보여요.',
    productUsage: {
      base: [{name: '라네즈 워터뱅크 프라이머'}, {name: '에스쁘아 프로테일러 비글로우', shade: '21호'}],
      cheek: [{name: '롬앤 베터댄치크', shade: '피치스노우'}],
      eye: [{name: '데이지크 섀도우팔레트', shade: '프렌치로즈'}],
      lip: [{name: '페리페라 잉크무드글로이', shade: '3호 로지드'}],
    },
    replies: [
      makeReply('mock-thread-glass-skin-rose', 1, {id: 'reply-user-1', nickname: 'tone.finder'},
        '따라해봤어요! 프라이머 덕인지 물광이 오후까지 가요. 쿨톤도 이 립 괜찮을까요?', 42, [
          {author: {id: 'user-glow', nickname: 'glow.archive'}, body: '쿨톤이면 같은 라인 5호가 더 맑게 떠요!', minutesAgo: 30},
        ]),
      makeReply('mock-thread-glass-skin-rose', 2, {id: 'reply-user-2', nickname: 'wed.guest'},
        '하객룩 고민이었는데 저장했어요. 소요시간 15분 진짜인가요?', 20),
    ],
  },
  'mock-thread-muted-rose-combo': {
    body: '립+치크 톤 맞춘 조합이에요. 순서: 치크를 광대 안쪽에만 얇게 → 립은 겉면을 티슈로 한 번 눌러 뮤트하게. 채도는 낮추고 질감은 맑게가 핵심입니다.',
    productUsage: {
      base: [],
      cheek: [{name: '클리오 프로블러셔', shade: '말린장미'}],
      eye: [],
      lip: [{name: '3CE 무드레시피', shade: '뮤트 로즈'}, {name: '무지 립밤', shade: '베이스용'}],
    },
    replies: [
      makeReply('mock-thread-muted-rose-combo', 1, {id: 'reply-user-3', nickname: 'muted.day'},
        '이 조합 데일리로도 무겁지 않나요?', 50, [
          {author: {id: 'user-mute', nickname: 'mute.palette'}, body: '치크를 한 겹만 하면 데일리도 충분해요!', minutesAgo: 44},
        ]),
    ],
  },
  'mock-thread-clean-base-shift': {
    body: '비포는 쿠션 두 번 올린 풀커버, 애프터는 컨실러로 붉은 기만 잡고 광을 남긴 버전이에요. 바꾼 건 딱 두 가지 — 파우더를 코 옆·턱에만 쓰고, 나머지는 그대로 두기. 슬라이더 밀어서 비교해 보세요!',
    productUsage: {
      base: [{name: '헤라 글로우 래스팅 파운데이션', shade: '21N1'}, {name: '더샘 커버 퍼펙션 컨실러', shade: '1.5'}],
      cheek: [],
      eye: [],
      lip: [],
    },
    replies: [
      makeReply('mock-thread-clean-base-shift', 1, {id: 'reply-user-4', nickname: 'base.study'},
        '와 슬라이더로 보니까 차이가 확실하네요. 저도 풀커버 버릇 고쳐야겠어요.', 66),
      makeReply('mock-thread-clean-base-shift', 2, {id: 'reply-user-5', nickname: 'oily.skin'},
        '지성인데 파우더 부위만 줄여도 안 무너질까요?', 31, [
          {author: {id: 'user-after', nickname: 'soft.after'}, body: '지성이면 미간까지만 추가하면 돼요!', minutesAgo: 25},
        ]),
    ],
  },
  'mock-thread-soft-smoky-question': {
    body: '저녁 약속용으로 브라운 스모키를 했는데 사진처럼 자꾸 세 보인다는 말을 들어요. 언더 음영을 빼야 할까요, 아이라인 길이를 줄여야 할까요? 겨울 쿨톤이고 눈매는 무쌍입니다.',
    productUsage: emptyUsage,
    replies: [
      makeReply('mock-thread-soft-smoky-question', 1, {id: 'reply-user-6', nickname: 'eye.pro'},
        '무쌍이면 언더는 눈꼬리 1/3만 남기고 지워보세요. 라인은 점막만 채워도 충분해요.', 90, [
          {author: {id: 'user-smoke', nickname: 'soft.smoke'}, body: '오늘 바로 해볼게요, 감사합니다!', minutesAgo: 80},
        ]),
      makeReply('mock-thread-soft-smoky-question', 2, {id: 'reply-user-7', nickname: 'cool.winter'},
        '겨울쿨은 브라운보다 그레이 브라운이 덜 부담스러워요.', 60),
    ],
  },
  'mock-thread-lip-layering': {
    body: '틴트 하나로 볼륨 립 만드는 레이어링이에요. ①립밤으로 결 정리 ②틴트를 안쪽에만 콕콕 ③중앙에 한 번 더 올려 광 포인트 ④입꼬리는 컨실러로 정리. 오버립인데도 자연스러워요.',
    productUsage: {
      base: [],
      cheek: [],
      eye: [],
      lip: [{name: '롬앤 쥬시 래스팅 틴트', shade: '9호 리플핑크'}, {name: '립밤', shade: '베이스'}, {name: '더샘 컨실러', shade: '입꼬리 정리'}],
    },
    replies: [
      makeReply('mock-thread-lip-layering', 1, {id: 'reply-user-8', nickname: 'lip.only'},
        '컨실러로 입꼬리 정리하는 거 꿀팁이네요. 번짐은 없나요?', 15),
    ],
  },
};

export const communityMockDetails: CommunityThreadDetail[] = communityMockThreads.map(thread => {
  const content = mockDetailContentByThreadId[thread.id];

  return {
    ...thread,
    body: content?.body ?? '',
    // 비포애프터 글은 슬라이더용 2장 — media[0]=before(민낯 톤), media[1]=after(커버와 동일).
    media: thread.category === 'before_after'
      ? [{id: `${thread.id}-before`}, thread.coverMedia]
      : [thread.coverMedia],
    productUsage: content?.productUsage ?? emptyUsage,
    replies: content?.replies ?? [],
  };
});

export function getCommunityMockImageSource(mediaId?: string) {
  if (mediaId?.includes('-before')) {
    return fallbackBeforeImage;
  }

  if (mediaId && mockImageByMediaId[mediaId]) {
    return mockImageByMediaId[mediaId];
  }

  return fallbackImage;
}