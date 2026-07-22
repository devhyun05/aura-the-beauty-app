// 매핑 엔진 — 1층 특징 프로파일 → AR 핏 델타. 순수·결정론(LLM·네트워크 무관).
// RN·토큰 무의존(계약 러너가 plain node로 실행).
//
// 방향 규칙은 리서치 테이블(docs/faceData_WEI/AURA_MAKEUP_TECHNIQUE_TABLE_KO_v0.md)의
// B등급 이상 교차검증 행에서만 가져온다. δ '크기'는 전부 잠정 —
// AR맞춤핏 계약 D-5대로 자동 적용은 기본 OFF(deltaScale=0)이고, 실기기 슬라이더
// 실험으로 non-zero δ를 승인한 축부터 deltaScale을 올려 켠다. 문헌 근거는
// 방향·부호까지만, 크기는 자체 튜닝(계약 §5·§7).
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
  eyeshadowHeight: 0.1,
  aegyoHeight: 0.1,
  blushLift: 0.1,
  lipOverline: 0.08, // 얇은 입술용 국소 오버립(L-1: 코너까지 확장 금지 — 은은하게)
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
): PersonalFitBasis {
  return {source, band, grade, mappingVersion: PERSONAL_FIT_MAPPING_VERSION};
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
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(rules)) scaled[k] = v * scale;
    entries.push({region, rules: scaled, provenance: 'measured', basis: b});
  };

  // accent 레인: 형태 보정을 하지 않는다(개성 보존). 빈 프로파일 반환.
  if (styleLane !== 'accent') {
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
    } else if (openness === 'low') {
      push('eyeshadow', {eyeshadowHeight: BASE_DELTA.eyeshadowHeight}, basis('eye.openness', 'low', 'B'));
    }

    // 애교살 있음 → 애교 강조(기존 부위 살림).
    if (profile.eye.aegyoSal?.value === 'present') {
      push('aegyo', {aegyoHeight: BASE_DELTA.aegyoHeight}, basis('eye.aegyoSal', 'present', 'C'));
    }

    // C-1/C-2 중안부 김 → 블러셔 고배치(B). youthful은 계수 강화.
    if (profile.contour.verticalBalance.band === 'middle' && midGain > 0) {
      push('blush', {blushLift: BASE_DELTA.blushLift * midGain}, basis('contour.verticalBalance', 'middle', 'B'));
    }

    // L-1 얇은 입술 → 국소 오버립(B). 과한 오버라이닝은 입꼬리 처짐 역효과(L-2)라 은은하게.
    if (profile.lip.fullness?.value === 'thin') {
      push('lip', {lipOverline: BASE_DELTA.lipOverline}, basis('lip.fullness', 'thin', 'B'));
    }
  }

  return {
    schemaVersion: PERSONAL_FIT_SCHEMA_VERSION,
    mappingVersion: PERSONAL_FIT_MAPPING_VERSION,
    styleLane,
    ...(opts.sourceReportId ? {sourceReportId: opts.sourceReportId} : {}),
    entries,
  };
}
