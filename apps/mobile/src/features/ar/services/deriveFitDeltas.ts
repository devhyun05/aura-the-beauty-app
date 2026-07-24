// 매핑 엔진 — 1층 특징 프로파일 → AR 핏 델타. 순수·결정론(LLM·네트워크 무관).
// RN·토큰 무의존(계약 러너가 plain node로 실행).
//
// 방향 규칙은 리서치 테이블(docs/faceData_WEI/AURA_MAKEUP_TECHNIQUE_TABLE_KO_v0.md)
// 의 B등급 이상 교차검증 행 + 확장 기획 v0.2(AURA_PERSONAL_FIT_EXPANSION_PLAN)의
// 승인 행에서만 가져온다. δ '크기'는 전부 잠정 — 문헌 근거는 방향·부호까지만,
// 크기는 실기기 슬라이더 실험으로 자체 튜닝(계약 §5·§7).
//
// 카테고리(확장 기획 §6): reshaping(형태 보정)은 accent 레인에서 0(개성 보존),
// clarity(결점·선명도)는 레인 무관 적용 — accent가 "핏 끔"과 구분되는 실체.
//
// 최종 [min,max] 클램프는 applyFitToLayers가 field 범위로 한 번 더 하므로(=base+δ가
// 범위를 넘지 않음) 여기서는 방향·상대 크기만 책임진다.

import type {
  FaceFeatureProfile,
  MagnitudeBand,
} from '../../../shared/contracts/faceFeatureProfile';
import {
  PERSONAL_FIT_MAPPING_VERSION,
  PERSONAL_FIT_SCHEMA_VERSION,
  type FitRuleCategory,
  type PersonalFitBasis,
  type PersonalFitEntry,
  type PersonalFitProfile,
  type StyleLane,
} from '../../../shared/contracts/personalFitProfile';

// 부위별 기준 δ(잠정, deltaScale로 스케일). 방향(부호)만 문헌 근거, 크기는 튜닝 대상.
const BASE_DELTA = {
  eyeCornerLift: 0.1,
  eyelinerWingLength: 0.1,
  eyelinerThinning: -0.1, // hooded용 라인 얇게
  eyelinerThickening: 0.1, // W-3′ 대비 상향(래시라인 두께 프록시 — intensity 축은 비-gold)
  eyeshadowHeight: 0.1,
  aegyoHeight: 0.1,
  blushLift: 0.1,
  blushDrop: -0.1, // V-3 중안부 짧음 → 저배치(전통 능선, C-1 조건 분기)
  blushHeartDrop: -0.08, // C-5 하트형 → 사선 금기·발색 하향(각도·마스크는 레시피 몫)
  contourDrop: -0.1, // V-4 하안부 김·F-2 긴형 → 광대 아래 셰이딩(위치 하향)
  contourSpread: 0.1, // F-1/F-3 둥근·각진 → 바깥 폭 셰이딩 강화
  highlightDrop: -0.1, // V-5 하안부 짧음 → 턱끝 방향 하이라이트(위치 하향)
  highlightFocus: -0.08, // F-1 둥근 → 세로축 하이라이트 집중(퍼짐 축소)
  lipOverline: 0.08, // 얇은 입술용 국소 오버립(L-1: 코너까지 확장 금지 — 은은하게)
  browArch: 0.08, // E-1′ 처진 눈꼬리 → 눈썹 꼬리 재작도(리프트 지지)
  browLength: 0.08, // E-1′ → 꼬리 방향 연장(눈썹머리 고정 축이라 방향 안전)
  mascaraLength: 0.15, // E-K1 보조(C급)
  // 눈꼬리 연장 테크닉(E-7 확장) — 아래 라인을 삼각존 하단으로 내려(디태치)
  // 눈꼬리 밖까지 그려 가로 확장. 절대값 슬라이더(fallback 0)라 δ가 곧 값.
  lowerTailTrace: 0.55,
  lowerTailLen: 0.45,
  // E-K1 꼬막눈 — E-7보다 완화된 연장(가로·세로 동시 확장의 일부라 보수적으로).
  smallEyeTailTrace: 0.4,
  smallEyeTailLen: 0.35,
} as const;

// youthful 레인은 중안부 축소 계열을 강조(계수 상향), balance는 기본.
const LANE_MIDFACE_GAIN: Record<StyleLane, number> = {
  balance: 1,
  youthful: 1.6,
  accent: 0, // accent는 형태 보정 δ=0(개성 보존) — 강조는 recipe intensity 몫.
};

export type DeriveFitDeltasOptions = {
  // 자동 적용 스케일 — 기본 0(OFF, 계약 D-4/D-5). 실기기 승인 축부터 >0으로 켠다.
  // 테스트는 방향 검증을 위해 1을 넘긴다.
  deltaScale?: number;
  sourceReportId?: string;
};

function basis(
  source: string,
  band: string,
  grade: 'A' | 'B' | 'C',
  category: FitRuleCategory = 'reshaping',
): PersonalFitBasis {
  return {source, band, grade, category, mappingVersion: PERSONAL_FIT_MAPPING_VERSION};
}

// derived faceShape 라벨(긴 타원형/둥근형/각진형/타원형) + 레거시 문자열을
// 규칙 키로 정규화. '타원형' 단독(균형)·미지 라벨은 null(규칙 미발동).
// '긴 타원형'이 '타원' 검사보다 먼저 걸리도록 순서 고정.
function faceShapeKey(
  label: string | null,
): 'round' | 'square' | 'long' | 'heart' | null {
  if (!label) return null;
  if (label.includes('하트')) return 'heart';
  if (label.includes('둥근')) return 'round';
  if (label.includes('각진')) return 'square';
  if (label.includes('긴')) return 'long';
  return null;
}

/**
 * 프로파일 + 스타일 레인 → PersonalFitEntry[]. deltaScale=0(기본)이면 구조만
 * 산출되고 실제 δ는 0(자동 적용 OFF). 신뢰 밴드가 없으면 그 행은 생략(δ=0 아님).
 */
export function deriveFitDeltas(
  profile: FaceFeatureProfile,
  styleLane: StyleLane,
  opts: DeriveFitDeltasOptions = {},
): PersonalFitProfile {
  const scale = opts.deltaScale ?? 0;
  const midGain = LANE_MIDFACE_GAIN[styleLane];
  const entries: PersonalFitEntry[] = [];

  const push = (
    region: string,
    rules: Record<string, number>,
    b: PersonalFitBasis,
  ) => {
    // 카테고리 게이트(§6): accent 레인은 reshaping을 통째로 생략(개성 보존).
    // clarity(결점·선명도)는 전 레인 적용 — accent가 "핏 끔"과 다른 이유.
    if (styleLane === 'accent' && (b.category ?? 'reshaping') === 'reshaping') {
      return;
    }
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(rules)) scaled[k] = v * scale;
    entries.push({region, rules: scaled, provenance: 'measured', basis: b});
  };

  // ── 눈 ────────────────────────────────────────────────────────────────────
  // E-1 처진 눈꼬리 → 윙·눈꼬리 리프트(B). [테이블 §1 E-1]
  if (profile.eye.canthalTilt.band === 'down') {
    push(
      'eyelinerUpper',
      {
        eyeCornerLift: BASE_DELTA.eyeCornerLift,
        eyelinerWingLength: BASE_DELTA.eyelinerWingLength,
      },
      basis('eye.canthalTilt', 'down', 'B'),
    );
    // E-1′ 눈썹 δ(E-1 행의 미구현 부분): 꼬리 재작도 + 꼬리 방향 연장으로
    // 리프트 라인 지지. [확장 기획 §3-3]
    push(
      'brow',
      {browArch: BASE_DELTA.browArch, browLength: BASE_DELTA.browLength},
      basis('eye.canthalTilt', 'down', 'B'),
    );
  }

  // E-3 hooded / 상안검 처짐 → 가짜 크리스 높게 + 라인 얇게(B). [§1 E-3]
  const hooded =
    profile.eye.doubleEyelid?.value === 'hooded' ||
    profile.eye.upperLidHooding?.value === 'pronounced';
  if (hooded) {
    push('eyeshadow', {eyeshadowHeight: BASE_DELTA.eyeshadowHeight}, basis('eye.hooding', 'hooded', 'B'));
    push('eyelinerUpper', {eyelinerThickness: BASE_DELTA.eyelinerThinning}, basis('eye.hooding', 'hooded', 'B'));
  }

  // E-4 무쌍 → floating liner 바깥 연장(B). [§1 E-4]
  if (profile.eye.doubleEyelid?.value === 'monolid') {
    push('eyelinerUpper', {eyelinerWingLength: BASE_DELTA.eyelinerWingLength}, basis('eye.doubleEyelid', 'monolid', 'B'));
  }

  // E-7/E-8 눈 세로:가로 → 확장 방향 반대(B). round=가로 연장, narrow=세로 리프트.
  const openness: MagnitudeBand | null = profile.eye.openness.band;
  if (openness === 'high') {
    push('eyelinerUpper', {eyelinerWingLength: BASE_DELTA.eyelinerWingLength}, basis('eye.openness', 'high', 'B'));
    // E-7 확장(둥근·짧은 눈): 아래 라인을 삼각존 하단 트레이스로 디태치하고
    // 눈꼬리 밖 연장 캔버스까지 그려 가로 확장을 아래에서도 받친다(B).
    push(
      'eyelinerLower',
      {
        eyelinerLowerTailTrace: BASE_DELTA.lowerTailTrace,
        eyelinerLowerTailLen: BASE_DELTA.lowerTailLen,
      },
      basis('eye.openness', 'high', 'B'),
    );
  } else if (openness === 'low') {
    push('eyeshadow', {eyeshadowHeight: BASE_DELTA.eyeshadowHeight}, basis('eye.openness', 'low', 'B'));
  }

  // E-K1 꼬막눈(자기 얼굴 대비 작은 눈) → 가로·세로 동시 확장. W-3(A급, 이목구비
  // 크기 증폭 기제) 기반, δ는 Milady 눈모양 교정표 대조로 확정 예정. [확장 기획 §3-2]
  if (profile.eye.scale.band === 'low') {
    push('eyelinerUpper', {eyelinerWingLength: BASE_DELTA.eyelinerWingLength}, basis('eye.scale', 'low', 'B'));
    push(
      'eyelinerLower',
      {
        eyelinerLowerTailTrace: BASE_DELTA.smallEyeTailTrace,
        eyelinerLowerTailLen: BASE_DELTA.smallEyeTailLen,
      },
      basis('eye.scale', 'low', 'B'),
    );
    push('eyeshadow', {eyeshadowHeight: BASE_DELTA.eyeshadowHeight}, basis('eye.scale', 'low', 'B'));
    push('mascara', {mascaraLength: BASE_DELTA.mascaraLength}, basis('eye.scale', 'low', 'C'));
  }

  // 애교살 있음 → 애교 강조(기존 부위 살림).
  if (profile.eye.aegyoSal?.value === 'present') {
    push('aegyo', {aegyoHeight: BASE_DELTA.aegyoHeight}, basis('eye.aegyoSal', 'present', 'C'));
  }

  // W-3′ 눈매 대비 낮음 → 래시라인 대비 상향(A — 테이블 §2 W-3). clarity라
  // accent에서도 유지. intensity 축이 비-gold라 두께를 대비 프록시로 쓴다(§3-2 각주).
  if (profile.eye.contrast?.value === 'low') {
    push(
      'eyelinerUpper',
      {eyelinerThickness: BASE_DELTA.eyelinerThickening},
      basis('eye.contrast', 'low', 'A', 'clarity'),
    );
  }

  // ── 세로3분할 — bands-v1 부위별 밴드 기반 ─────────────────────────────────
  const thirds = profile.contour.thirds;

  // C-1 중안부 김 → 블러셔 고배치(B). youthful은 밴드 무관 활성 + 계수 강화(테이블).
  const midfaceLong = thirds.middle.band === 'high';
  if ((midfaceLong || styleLane === 'youthful') && midGain > 0) {
    push(
      'blush',
      {blushLift: BASE_DELTA.blushLift * midGain},
      basis('contour.thirds.middle', midfaceLong ? 'high' : 'lane:youthful', 'B'),
    );
  }

  // V-3 중안부 짧음 → 블러셔 저배치(전통 능선 — C-1 조건 분기, B/C).
  // youthful 레인은 고배치 정책이라 저배치를 내리지 않는다(상충 방지).
  if (thirds.middle.band === 'low' && styleLane !== 'youthful') {
    push('blush', {blushLift: BASE_DELTA.blushDrop}, basis('contour.thirds.middle', 'low', 'B'));
  }

  // V-4 하안부 김 → 광대 아래 셰이딩(위치 하향). F-2(A) 방향의 축 사상 — 외삽이라 B.
  if (thirds.lower.band === 'high') {
    push('contour', {contourLift: BASE_DELTA.contourDrop}, basis('contour.thirds.lower', 'high', 'B'));
  }

  // V-5 하안부 짧음 → 턱끝 방향 하이라이트(F-2 반전 외삽 — B).
  if (thirds.lower.band === 'low') {
    push('highlighter', {highlightLift: BASE_DELTA.highlightDrop}, basis('contour.thirds.lower', 'low', 'B'));
  }

  // ── 얼굴형 F-1~4·C-3~5 — 위치·퍼짐 성분만. 각도·마스크 선택은 절대 목표라
  // δ 도메인과 부정합 → 레시피 층 몫(확장 기획 §3-1 정정). 긴형은 V-4와 겹칠 수
  // 있으나 가산 후 field 클램프가 상한을 잡는다.
  const shape = faceShapeKey(profile.contour.faceShape);
  if (shape === 'round') {
    push('contour', {contourSpread: BASE_DELTA.contourSpread}, basis('contour.faceShape', 'round', 'A'));
    push('highlighter', {highlightSpread: BASE_DELTA.highlightFocus}, basis('contour.faceShape', 'round', 'A'));
  } else if (shape === 'square') {
    push('contour', {contourSpread: BASE_DELTA.contourSpread}, basis('contour.faceShape', 'square', 'A'));
  } else if (shape === 'long') {
    push('contour', {contourLift: BASE_DELTA.contourDrop}, basis('contour.faceShape', 'long', 'A'));
  } else if (shape === 'heart') {
    push('blush', {blushLift: BASE_DELTA.blushHeartDrop}, basis('contour.faceShape', 'heart', 'B'));
  }

  // ── 입 ───────────────────────────────────────────────────────────────────
  // L-1 얇은 입술 → 국소 오버립(B). 과한 오버라이닝은 입꼬리 처짐 역효과(L-2)라 은은하게.
  if (profile.lip.fullness?.value === 'thin') {
    push('lip', {lipOverline: BASE_DELTA.lipOverline}, basis('lip.fullness', 'thin', 'B'));
  }

  return {
    schemaVersion: PERSONAL_FIT_SCHEMA_VERSION,
    mappingVersion: PERSONAL_FIT_MAPPING_VERSION,
    styleLane,
    ...(opts.sourceReportId ? {sourceReportId: opts.sourceReportId} : {}),
    entries,
  };
}
