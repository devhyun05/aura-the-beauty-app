import type {
  MakeupRecommendationDiscovery,
  MakeupSituation,
  MakeupSituationKey,
  MakeupTrendBadge,
  MakeupTrendKeyword,
} from '../types';

const AS_OF = '2026-07-16T00:00:00Z';

const keyword = (
  situation: MakeupSituationKey,
  slug: string,
  label: string,
  badge: MakeupTrendBadge,
  seedPrompt: string,
  tags: string[],
): MakeupTrendKeyword => ({
  id: `fixture-${situation}-${slug}`,
  label,
  kind: badge === 'STEADY' ? 'steady' : badge === 'CURATED' ? 'curated' : 'trend',
  badge,
  marketScope: badge === 'TREND_K_BEAUTY_2026' ? 'ko-KR' : badge === 'TREND_GLOBAL_SS26' ? 'global' : undefined,
  seedPrompt,
  tags: [situation, ...tags],
  asOf: AS_OF,
  ...(badge === 'TREND_K_BEAUTY_2026'
    ? {
        sourceName: 'K-Beauty 2026 editorial research',
        sourcePublishedAt: '2026-01-16T00:00:00Z',
        expiresAt: '2026-10-14T00:00:00Z',
        confidence: 'B' as const,
      }
    : badge === 'TREND_GLOBAL_SS26'
      ? {
          sourceName: 'Global SS26 beauty editorial research',
          sourcePublishedAt: '2026-05-20T00:00:00Z',
          expiresAt: '2026-09-30T00:00:00Z',
          confidence: 'B' as const,
        }
      : {}),
});

const situation = (
  key: MakeupSituationKey,
  label: string,
  description: string,
  sortOrder: number,
  keywords: MakeupTrendKeyword[],
): MakeupSituation => ({
  id: `fixture-${key}`,
  key,
  label,
  description,
  imageAssetKey: key,
  sortOrder,
  keywords,
});

export const MAKEUP_SITUATION_FIXTURES: readonly MakeupSituation[] = [
  situation('daily', '일상', '출근, 등교, 가벼운 약속과 주말 외출', 10, [
    keyword('daily', 'commute-school', '출근·등교', 'CURATED', '평일 아침 출근이나 등교를 준비하는 상황', ['commute', 'school']),
    keyword('daily', 'cafe-brunch', '카페·브런치', 'CURATED', '낮 시간 카페나 브런치 약속이 있는 상황', ['cafe', 'brunch']),
    keyword('daily', 'casual-meetup', '가벼운 약속', 'CURATED', '친구와 부담 없이 만나는 가벼운 약속 상황', ['casual', 'meetup']),
    keyword('daily', 'after-work', '퇴근 후 약속', 'CURATED', '퇴근 뒤 바로 저녁 약속으로 이동하는 상황', ['after-work', 'evening']),
    keyword('daily', 'weekend-outing', '주말 나들이', 'CURATED', '주말에 산책하거나 가까운 곳으로 외출하는 상황', ['weekend', 'outing']),
  ]),
  situation('formal_event', '특별한 날', '데이트, 중요한 일정과 기념일', 20, [
    keyword('formal_event', 'first-date', '소개팅·데이트', 'CURATED', '소개팅이나 데이트를 앞둔 특별한 약속 상황', ['date', 'romance']),
    keyword('formal_event', 'wedding-guest', '결혼식 하객', 'CURATED', '결혼식에 하객으로 참석하는 상황', ['wedding', 'guest']),
    keyword('formal_event', 'interview-presentation', '면접·중요한 발표', 'CURATED', '면접이나 중요한 발표로 신뢰감이 필요한 상황', ['interview', 'presentation']),
    keyword('formal_event', 'anniversary-birthday', '기념일·생일', 'CURATED', '기념일 저녁이나 생일 모임을 즐기는 상황', ['anniversary', 'birthday']),
    keyword('formal_event', 'graduation-family', '졸업식·가족 행사', 'CURATED', '졸업식이나 가족 행사에 참석하는 상황', ['graduation', 'family']),
  ]),
  situation('camera_content', '촬영', '증명사진부터 프로필과 영상까지', 30, [
    keyword('camera_content', 'id-photo', '증명사진', 'CURATED', '신분증이나 지원서에 사용할 증명사진을 촬영하는 상황', ['id-photo', 'document']),
    keyword('camera_content', 'profile-shoot', '프로필 촬영', 'CURATED', '개인 프로필이나 포트폴리오 사진을 촬영하는 상황', ['profile', 'studio']),
    keyword('camera_content', 'social-selfie', 'SNS 셀카', 'CURATED', 'SNS에 올릴 셀카와 짧은 콘텐츠를 촬영하는 상황', ['social', 'selfie']),
    keyword('camera_content', 'video-live', '영상·라이브', 'CURATED', '영상 콘텐츠나 라이브 방송에 출연하는 상황', ['video', 'live']),
    keyword('camera_content', 'baseball-screen', '야구장 전광판', 'CURATED', '야외 야구장에서 전광판 카메라에 잡힐 수 있는 상황', ['baseball', 'screen']),
  ]),
  situation('festival_performance', '독특한 날', '공연, 테마 파티와 색다른 이벤트', 40, [
    keyword('festival_performance', 'concert-festival', '콘서트·페스티벌', 'CURATED', '콘서트나 야외 페스티벌을 오래 즐기는 상황', ['concert', 'festival']),
    keyword('festival_performance', 'club-night', '클럽·야간 파티', 'CURATED', '어두운 조명 아래 클럽이나 야간 파티를 즐기는 상황', ['club', 'night']),
    keyword('festival_performance', 'theme-costume', '테마 파티·코스프레', 'CURATED', '정해진 테마나 캐릭터가 있는 파티에 참여하는 상황', ['theme', 'costume']),
    keyword('festival_performance', 'stage-performance', '무대 공연', 'CURATED', '관객과 조명 앞에서 무대 공연을 하는 상황', ['stage', 'performance']),
    keyword('festival_performance', 'fashion-art-event', '패션 행사·전시 오프닝', 'CURATED', '패션 행사나 전시 오프닝에 참석하는 색다른 상황', ['fashion', 'art-event']),
    keyword('festival_performance', 'romantic-fantasy-heroine', '로판 여주', 'CURATED', '로맨스 판타지 여주인공처럼 우아하고 몽환적이되 실제로 재현 가능한 메이크업 상황', ['romantic-fantasy', 'heroine']),
  ]),
];

export function getMakeupRecommendationFixtureDiscovery(): MakeupRecommendationDiscovery {
  return {
    generatedAt: AS_OF,
    source: 'fixture',
    situations: MAKEUP_SITUATION_FIXTURES.map(item => ({
      ...item,
      keywords: item.keywords.map(value => ({
        ...value,
        badge: value.kind === 'steady' ? 'STEADY' : 'CURATED',
        kind: value.kind === 'steady' ? 'steady' : 'curated',
      })),
    })),
  };
}
