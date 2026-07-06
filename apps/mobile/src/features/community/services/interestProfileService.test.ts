import type {CommunityThreadSummary} from '../types';
import {
  STYLE_BADGE_THRESHOLD,
  computeStylePercent,
  normalizeInterestScore,
  scoreThreadInterest,
  type InterestProfile,
} from './interestProfileService';

function expectTrue(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`${label}: expected true`);
  }
}

const glowThread = {
  category: 'lookbook',
  moodTags: ['글로우', '코랄'],
  situationTags: ['하객룩'],
} as CommunityThreadSummary;

const emptyProfile: InterestProfile = {
  seenThreads: {},
  tagScores: {},
  updatedAt: new Date(0).toISOString(),
};

const glowLoverProfile: InterestProfile = {
  seenThreads: {},
  tagScores: {글로우: 12, 하객: 6, 스모키: -6},
  updatedAt: new Date(0).toISOString(),
};

expectTrue(
  scoreThreadInterest(emptyProfile, glowThread) === 0,
  'empty profile scores zero',
);

const glowScore = scoreThreadInterest(glowLoverProfile, glowThread);

// 정확 매칭(글로우 12) + 부분 매칭(하객 ⊂ 하객룩 → 6 * 0.7)
expectTrue(
  Math.abs(glowScore - (12 + 6 * 0.7)) < 0.001,
  `substring matching combines exact and partial scores (got ${glowScore})`,
);

const smokyThread = {
  category: 'lookbook',
  moodTags: ['스모키'],
  situationTags: [],
} as unknown as CommunityThreadSummary;

expectTrue(
  scoreThreadInterest(glowLoverProfile, smokyThread) < 0,
  'negative signals push disliked tags below zero',
);

expectTrue(
  normalizeInterestScore(-5) === 0 && normalizeInterestScore(50) === 100,
  'normalized interest clamps to 0~100',
);

const styleWithReport = computeStylePercent(glowLoverProfile, 80, glowThread);
const styleWithoutReport = computeStylePercent(glowLoverProfile, null, glowThread);

expectTrue(
  styleWithReport === Math.round(80 * 0.5 + normalizeInterestScore(glowScore) * 0.5),
  `style percent blends tone and interest 50/50 (got ${styleWithReport})`,
);

expectTrue(
  styleWithoutReport === normalizeInterestScore(glowScore),
  'without a report, style percent falls back to interest only',
);

expectTrue(
  STYLE_BADGE_THRESHOLD === 50,
  'badge threshold stays in sync with the backend design doc',
);
