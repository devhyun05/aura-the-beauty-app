import {
  analyzeBody,
  resolveStyleGender,
  SILHOUETTE_STYLES_BY_GENDER,
  FRAME_STYLES_BY_GENDER,
} from './bodyProfile';
import type {BodyProfile, Silhouette, Frame} from './bodyProfile';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
}

// 남성 세트에 절대 나오면 안 되는 여성복 품목(리뷰 금칙어).
const BANNED = ['스커트', '원피스', '퍼프', '엠파이어', '리본', '셔링', '프릴'];

// ── resolveStyleGender: 프로필 성별 원문 → 스타일 성별 축 ──────────────────────
assert(resolveStyleGender('남성') === 'men', "resolveStyleGender('남성') -> men");
assert(resolveStyleGender('여성') === 'women', "resolveStyleGender('여성') -> women");
assert(resolveStyleGender('선택 안 함') === 'neutral', "resolveStyleGender('선택 안 함') -> neutral");
assert(resolveStyleGender(undefined) === 'neutral', 'resolveStyleGender(undefined) -> neutral');
assert(resolveStyleGender(null) === 'neutral', 'resolveStyleGender(null) -> neutral');

// ── 남성 세트 전체에 금칙어가 하나도 없어야 한다 ──────────────────────────────
{
  const menText: string[] = [];
  (Object.keys(SILHOUETTE_STYLES_BY_GENDER.men) as Silhouette[]).forEach(k => {
    const s = SILHOUETTE_STYLES_BY_GENDER.men[k];
    menText.push(...s.points, ...s.avoid);
  });
  (Object.keys(FRAME_STYLES_BY_GENDER.men) as Frame[]).forEach(k => {
    const s = FRAME_STYLES_BY_GENDER.men[k];
    menText.push(...s.points, ...s.avoid);
  });
  const joined = menText.join(' ');
  BANNED.forEach(word => {
    assert(!joined.includes(word), `men set must not contain banned word: ${word}`);
  });
}

// 어깨가 넓은 프로필 → inverted(역삼각형). 여성 세트라면 'A라인 스커트'가 들어가지만
// 남성 세트에는 '스커트'가 없어야 한다.
const invertedProfile: BodyProfile = {
  frameWidth: 'shoulder',
  waist: 'soft',
  volume: 'upper',
  wrist: 'round',
  collar: 'hidden',
  flesh: 'firm',
  balance: 'upperBody',
  createdAt: 0,
};

// ── 남성 프로필: silhouetteStyle.points에 '스커트' 없음 ────────────────────────
{
  const r = analyzeBody(invertedProfile, 'men');
  assert(r.silhouette === 'inverted', 'shoulder-wide -> inverted');
  assert(
    !r.silhouetteStyle.points.some(p => p.includes('스커트')),
    "men inverted silhouetteStyle.points must not contain '스커트'",
  );
}

// ── 무인자 호출은 neutral로 동작해야 한다(기존 호출 호환) ──────────────────────
{
  const r = analyzeBody(invertedProfile);
  assert(r.silhouetteStyle.label === SILHOUETTE_STYLES_BY_GENDER.neutral.inverted.label, 'no-arg analyzeBody -> neutral');
  assert(r.silhouetteStyle.points.length > 0, 'neutral silhouette has points');
  assert(!r.silhouetteStyle.points.join(' ').includes('스커트'), 'neutral inverted has no 스커트');
}

console.log('bodyProfile.test.ts OK');
