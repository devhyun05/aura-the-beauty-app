import {File, Paths} from 'expo-file-system';

import type {CommunityThreadSummary} from '../types';

/**
 * 관심사 프로필 v2 — 유저 행동을 태그별 점수로 로컬에 누적한다.
 *
 * 신호 세트 (대형 서비스 벤치마크를 우리 규모에 맞게 축소):
 * - 저장 3 · 답글 2.5 · 좋아요 2 · 검색 2 · 정독(dwell) 1.5 · 재방문 1 · 슬라이더 1 · 조회 0.8
 * - 비클릭 노출(impression) -0.3 — "보여줘도 안 누르는 태그"는 점점 가라앉는다 (에이블리식 부정 신호)
 * - 조회는 seenThreads 기록으로 첫 조회(view)와 재방문(revisit)을 자동 구분한다.
 *
 * 서버 이벤트 수집(community_events)이 붙으면 이 로컬 프로필은 오프라인 폴백으로 강등된다.
 */

export type InterestAction =
  | 'dwell'
  | 'impression'
  | 'like'
  | 'reply'
  | 'revisit'
  | 'save'
  | 'slider'
  | 'view';

export type InterestProfile = {
  seenThreads: Record<string, number>;
  tagScores: Record<string, number>;
  updatedAt: string;
};

const PROFILE_FILE_NAME = 'community-interest-profile.json';

const actionWeights: Record<InterestAction, number> = {
  dwell: 1.5,
  impression: -0.3,
  like: 2,
  reply: 2.5,
  revisit: 1,
  save: 3,
  slider: 1,
  view: 0.8,
};

const SEARCH_TOKEN_WEIGHT = 2;
const MAX_SEARCH_TOKENS = 5;

// 태그 하나가 피드를 독점하거나(상한) 영구 매장되지 않게(하한) 범위를 둔다.
const TAG_SCORE_CAP = 60;
const TAG_SCORE_FLOOR = -12;

// 상세 화면에서 이 시간 이상 머물면 정독(dwell)으로 본다.
export const DWELL_THRESHOLD_MS = 12_000;

const emptyProfile = (): InterestProfile => ({
  seenThreads: {},
  tagScores: {},
  updatedAt: new Date(0).toISOString(),
});

let cachedProfile: InterestProfile | null = null;

function getProfileFile() {
  return new File(Paths.document, PROFILE_FILE_NAME);
}

export function loadInterestProfile(): InterestProfile {
  if (cachedProfile) {
    return cachedProfile;
  }

  try {
    const profileFile = getProfileFile();

    if (profileFile.exists) {
      const parsed = JSON.parse(profileFile.textSync()) as InterestProfile;

      if (parsed && typeof parsed === 'object' && parsed.tagScores) {
        // v1 프로필(seenThreads 없음)과의 하위호환.
        cachedProfile = {...parsed, seenThreads: parsed.seenThreads ?? {}};
        return cachedProfile;
      }
    }
  } catch {
    // 손상된 프로필은 새로 시작한다.
  }

  cachedProfile = emptyProfile();
  return cachedProfile;
}

function persistProfile(profile: InterestProfile) {
  cachedProfile = profile;

  try {
    getProfileFile().write(JSON.stringify(profile));
  } catch {
    // 저장 실패해도 메모리 캐시로 세션 내 개인화는 유지된다.
  }
}

function collectThreadTags(thread: CommunityThreadSummary): string[] {
  return [...thread.moodTags, ...thread.situationTags, thread.category];
}

function applyTagDelta(tagScores: Record<string, number>, tags: string[], weight: number) {
  tags.forEach(tag => {
    const nextScore = (tagScores[tag] ?? 0) + weight;
    tagScores[tag] = Math.min(TAG_SCORE_CAP, Math.max(TAG_SCORE_FLOOR, nextScore));
  });
}

/**
 * 스레드 단위 행동 신호를 기록한다.
 * 'view'는 seenThreads 기록에 따라 자동으로 revisit으로 승격된다.
 */
export function recordThreadSignal(
  action: Exclude<InterestAction, 'revisit'>,
  thread: CommunityThreadSummary,
) {
  const profile = loadInterestProfile();
  const tagScores = {...profile.tagScores};
  const seenThreads = {...profile.seenThreads};
  let resolvedAction: InterestAction = action;

  if (action === 'view') {
    const seenCount = seenThreads[thread.id] ?? 0;
    resolvedAction = seenCount > 0 ? 'revisit' : 'view';
    seenThreads[thread.id] = seenCount + 1;
  }

  applyTagDelta(tagScores, collectThreadTags(thread), actionWeights[resolvedAction]);
  persistProfile({seenThreads, tagScores, updatedAt: new Date().toISOString()});
  return resolvedAction;
}

/** 검색어 토큰을 관심사 신호로 기록한다 (명시적 의도 = 높은 가중치). */
export function recordSearchInterest(query: string) {
  const tokens = query
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .slice(0, MAX_SEARCH_TOKENS);

  if (tokens.length === 0) {
    return;
  }

  const profile = loadInterestProfile();
  const tagScores = {...profile.tagScores};
  applyTagDelta(tagScores, tokens, SEARCH_TOKEN_WEIGHT);
  persistProfile({...profile, tagScores, updatedAt: new Date().toISOString()});
}

/**
 * 스레드의 관심사 원점수.
 * 검색어 토큰("하객")과 태그("하객룩")가 이어지도록 부분 문자열 양방향 매칭을 쓴다.
 */
export function scoreThreadInterest(
  profile: InterestProfile,
  thread: CommunityThreadSummary,
): number {
  const profileEntries = Object.entries(profile.tagScores);

  if (profileEntries.length === 0) {
    return 0;
  }

  return collectThreadTags(thread).reduce((total, tag) => {
    let tagScore = 0;

    for (const [key, score] of profileEntries) {
      if (tag === key) {
        tagScore += score;
      } else if (tag.includes(key) || key.includes(tag)) {
        tagScore += score * 0.7;
      }
    }

    return total + tagScore;
  }, 0);
}

/** 관심사 원점수(대략 0~30+)를 0~100 스케일로 정규화. */
export function normalizeInterestScore(rawScore: number): number {
  return Math.min(100, Math.max(0, Math.round(rawScore * 3)));
}

/**
 * 내 스타일 % — 리포트 톤 매칭과 행동 관심사를 결합한 종합 점수.
 * 리포트가 없으면 관심사만으로 계산한다(콜드스타트 대응).
 */
export function computeStylePercent(
  profile: InterestProfile,
  toneMatchPercent: number | null,
  thread: CommunityThreadSummary,
): number {
  const interestPercent = normalizeInterestScore(scoreThreadInterest(profile, thread));

  if (toneMatchPercent == null) {
    return interestPercent;
  }

  return Math.round(toneMatchPercent * 0.5 + interestPercent * 0.5);
}

// 추천 탭에서 "내 스타일 n%" 배지를 노출하는 최소 점수.
export const STYLE_BADGE_THRESHOLD = 50;

export function hasInterestSignals(profile: InterestProfile): boolean {
  return Object.keys(profile.tagScores).length > 0;
}
