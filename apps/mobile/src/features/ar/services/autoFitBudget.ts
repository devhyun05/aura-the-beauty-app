// 자동 δ 안전 예산 — 매핑 엔진(deriveFitDeltas)이 뽑은 부위별 합산 δ에 필드별·
// 방향별 상한을 씌운다. 순수·결정론(RN·토큰·네트워크 무의존 — 계약 러너 실행 가능).
//
// 왜 필요한가(2026-07-25 진단):
//  1) applyFitToLayers의 필드 [min,max] 클램프만으로는 부족하다 — 슬라이더 범위
//     자체가 해부학적 안전선을 넘어선다. 예: 블러셔 배치 슬라이더는 ±0.08인데,
//     언더아이 마스크는 lift 0에서 이미 눈 개구부(캐노니컬 v0.594)에 닿아 있어
//     +0.08이면 마스크 중심이 눈두덩~눈썹 높이(v0.72)까지 올라간다("눈 위 섀도").
//  2) 자동 규칙이 같은 필드에 누적된다 — 판정 소스가 독립인 규칙들은 동시 발동해
//     합산된다(toFitEntries). 예: eyelinerLowerTailTrace는 E-7(둥근 눈 +0.55)과
//     E-K1(작은 눈 +0.4)이 "작고 둥근 눈"에서 함께 터져 0.95(슬라이더 폭의 95%)에
//     달해, 룩이 정한 값을 사실상 삼킨다.
//
// 이 예산은 "자동은 무표시로 얹히므로 보수적으로" 원칙 — 사용자가 슬라이더로
// 직접 올리는 건 WYSIWYG라 여기서 건드리지 않는다(수동 핏은 이 경로를 안 탄다).
// δ '크기'는 문헌 근거가 아니라 실기기 튜닝 대상 — 이 표의 값도 잠정이다.
//
// ⚠ 미해결(후속): (a) 언더아이 등 shape 의존 봉인은 잎의 blushShape를 알아야 하나
// 이 순수 계층은 프로파일만 본다 — 완전한 shape 인지 봉인은 자동 채널 분리(계약
// baseDeltas) 후 apply 층에서. 지금은 up 방향을 강하게 눌러 근사한다. (b) 절대값
// 축(fallback 0)에서 "룩이 이미 값을 정했을 때 δ를 더하지 말고 채우기(fill)"
// 시맨틱도 자동 채널 분리가 전제 — 지금은 스택 상한으로 완화만.

// 방향 비대칭 예산 — 양수(up)와 음수(down)에 다른 상한. 대칭이면 number 하나.
export type FieldBudget = number | {up: number; down: number};

// 필드별 자동 δ 합산 상한(절대값). 규칙 스택의 최악값을 해부학·설계 안전선으로
// 자른다. 값 근거는 Unity 렌더 좌표 계산(FaceMakeup.shader·MaskGenerator·
// IrisRenderer·LowerLid) — 필드 옆 주석에 지배 경계를 남긴다.
export const AUTO_FIT_BUDGET: Record<string, FieldBudget> = {
  // ── 배치 축(캐노니컬 UV 평행이동) — 눈 개구부(v0.594) 침범이 핵심 위험 ──
  // 블러셔 up: 언더아이/고배치 마스크가 눈에 닿아 있어 강하게 봉인. down: 애플존
  // ~광대 여유가 커 조금 더 허용(V-3 저배치가 보이도록).
  blushLift: {up: 0.02, down: 0.05},
  blushSpread: 0.03, // 수평 이동(v 불변) — 콧벽/실루엣 혼입만 soft 제약
  // 하이라이터 up: 광대 존이 눈밴드에 지배적. down은 애플/입 방향 여유 큼.
  highlightLift: {up: 0.03, down: 0.05},
  highlightSpread: 0.05,
  // 컨투어는 하향이 주 — 턱선 존이 턱/목 실루엣을 넘으면 "때"처럼 보임.
  contourLift: {up: 0.05, down: 0.05},
  contourSpread: 0.05,

  // ── 눈 세로 확장(배수, fallback 1) — 눈-눈썹 사이를 넘어 눈썹 침범이 위험 ──
  // eyeshadowHeight는 눈-눈썹 간격 좁은 얼굴(eyeGap low)에서 위험이 커져 게이트로
  // 재차등한다(clampAutoFitEntries의 narrowBrowGap 인자). 아래는 기본(mid/high).
  eyeshadowHeight: 0.2,

  // ── 아이라이너 ──
  // 절대값 축(fallback 0) — 스택 상한으로 0.95→0.55 봉쇄(단일 규칙 효과는 보존).
  eyelinerLowerTailTrace: 0.55,
  eyelinerLowerTailLen: 0.45,
  eyelinerWingLength: 0.2, // 배수 — canthal/openness/scale 3중 스택 상한
  eyelinerThickness: 0.15, // hooded(−)·contrast low(+) 상쇄 후 잔여
  eyeCornerLift: 0.12, // 워프 — EyeWarp.MaxLiftFactor(0.12)와 정합

  // ── 저위험(아래 방향·격리) — 넉넉히, 스택 방지용으로만 ──
  mascaraLength: 0.2,
  aegyoHeight: 0.15,
  browArch: 0.1,
  browLength: 0.1,
  lipOverline: 0.1,
};

// 눈-눈썹 간격이 좁을 때 eyeshadowHeight 자동 상한을 조인다(눈썹 침범 방지).
// 캐노니컬 대비 gap −25%면 밴드 상단이 눈-눈썹 거리의 ~99%까지 차므로 +0.1로 제한.
const EYESHADOW_HEIGHT_NARROW_GAP_BUDGET = 0.1;

type BudgetableEntry = {region: string; rules: Record<string, number>};

export type ClampAutoFitOptions = {
  // 눈-눈썹 간격 밴드가 'low'(좁음)면 eyeshadowHeight 상한을 조인다.
  narrowBrowGap?: boolean;
};

function resolveBudget(budget: FieldBudget, value: number): number {
  const max = typeof budget === 'number' ? budget : value >= 0 ? budget.up : budget.down;
  // 상한은 절대값 — 부호는 보존하고 크기만 자른다.
  return Math.max(-max, Math.min(max, value));
}

/**
 * 부위별 합산 δ(toFitEntries 결과)에 필드별·방향별 예산을 씌운다. 표에 없는 필드는
 * 그대로 통과(의도적으로 무상한인 필드 존중). 예산으로 0이 된 필드는 제거하고,
 * 규칙이 전부 사라진 부위 항목도 떨군다 — applyFitToLayers가 빈 rules를 안 보게.
 */
export function clampAutoFitEntries(
  entries: BudgetableEntry[],
  opts: ClampAutoFitOptions = {},
): BudgetableEntry[] {
  const out: BudgetableEntry[] = [];
  for (const entry of entries) {
    const rules: Record<string, number> = {};
    for (const [key, value] of Object.entries(entry.rules)) {
      if (!Number.isFinite(value)) continue;
      const budget =
        key === 'eyeshadowHeight' && opts.narrowBrowGap
          ? EYESHADOW_HEIGHT_NARROW_GAP_BUDGET
          : AUTO_FIT_BUDGET[key];
      const clamped = budget === undefined ? value : resolveBudget(budget, value);
      if (clamped !== 0) rules[key] = clamped;
    }
    if (Object.keys(rules).length > 0) out.push({region: entry.region, rules});
  }
  return out;
}
