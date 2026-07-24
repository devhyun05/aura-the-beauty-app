import {AUTO_FIT_BUDGET, clampAutoFitEntries} from './autoFitBudget';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// ── 방향 비대칭 예산: 블러셔 up은 강하게, down은 완화 ────────────────────────
{
  const up = clampAutoFitEntries([{region: 'blush', rules: {blushLift: 0.1}}]);
  assert(up[0].rules.blushLift === 0.02, 'blushLift up capped to 0.02 (undereye 침범 방지)');
  const down = clampAutoFitEntries([{region: 'blush', rules: {blushLift: -0.1}}]);
  assert(down[0].rules.blushLift === -0.05, 'blushLift down capped to -0.05 (저배치 보임)');
}

// ── 절대값 축 스택 상한: E-7(0.55)+E-K1(0.4)=0.95 → 0.55로 봉인 ──────────────
{
  const stacked = clampAutoFitEntries([
    {region: 'eyelinerLower', rules: {eyelinerLowerTailTrace: 0.95, eyelinerLowerTailLen: 0.8}},
  ]);
  assert(
    stacked[0].rules.eyelinerLowerTailTrace === 0.55,
    'tailTrace stack 0.95 -> 0.55 (룩 삼킴 방지)',
  );
  assert(stacked[0].rules.eyelinerLowerTailLen === 0.45, 'tailLen stack 0.8 -> 0.45');
}

// ── 단일 규칙이 예산 이하면 그대로 통과(효과 보존) ──────────────────────────
{
  const single = clampAutoFitEntries([
    {region: 'eyelinerLower', rules: {eyelinerLowerTailTrace: 0.55}},
  ]);
  assert(single[0].rules.eyelinerLowerTailTrace === 0.55, '단일 0.55는 상한과 같아 보존');
}

// ── eyeshadowHeight 눈-눈썹 간격 게이트: 좁으면 0.1로 재차등 ─────────────────
{
  const wide = clampAutoFitEntries([{region: 'eyeshadow', rules: {eyeshadowHeight: 0.3}}]);
  assert(wide[0].rules.eyeshadowHeight === 0.2, 'gap 정상: eyeshadowHeight 0.3 -> 0.2');
  const narrow = clampAutoFitEntries(
    [{region: 'eyeshadow', rules: {eyeshadowHeight: 0.3}}],
    {narrowBrowGap: true},
  );
  assert(
    narrow[0].rules.eyeshadowHeight === 0.1,
    'gap 좁음: eyeshadowHeight 0.3 -> 0.1 (눈썹 침범 방지)',
  );
}

// ── 표에 없는 필드는 무상한 통과(의도적 미상한 존중) ────────────────────────
{
  const unlisted = clampAutoFitEntries([{region: 'x', rules: {someUnknownAxis: 5}}]);
  assert(unlisted[0].rules.someUnknownAxis === 5, '미등록 필드는 그대로 통과');
  assert(AUTO_FIT_BUDGET.someUnknownAxis === undefined, '미등록 필드는 예산표에 없음');
}

// ── 예산으로 0이 되면 필드 제거, 규칙이 비면 부위 항목도 제거 ────────────────
{
  const zeroed = clampAutoFitEntries([{region: 'blush', rules: {blushLift: 0}}]);
  assert(zeroed.length === 0, '0 필드만 있으면 부위 항목 제거(빈 rules 방지)');
}

// ── NaN/무한대 방어 ─────────────────────────────────────────────────────────
{
  const bad = clampAutoFitEntries([
    {region: 'blush', rules: {blushLift: Number.NaN, blushSpread: 0.01}},
  ]);
  assert(bad[0].rules.blushLift === undefined, 'NaN 필드는 버림');
  assert(bad[0].rules.blushSpread === 0.01, '유효 필드는 유지');
}

console.log('autoFitBudget.test.ts: OK');
