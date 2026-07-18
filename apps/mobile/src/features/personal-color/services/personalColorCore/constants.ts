// 5축·12톤 상수 — 전부 INSTRUMENTED / calibration target.
// Phase 2 재현성 캡처 전까지 게이트로 승격 금지. 값 변경은 Xcode 리빌드 불필요(JS).

import type { AxisName, PersonalColor12Type, PersonalColorSeason } from './contracts';

export const FIXED_REFS_VERSION = 'aura-pc-refs-v0.1' as const;

// 고정 population reference (calibration target)
export const REFS = {
  // Value: D = 1 - L*/100
  // F2 재센터(2026-07-18): 종전 dRefSkin=0.45(L*≈55 기준)는 실제 셀피 피부 분포
  // (L*≈60~88)보다 훨씬 어두워, 중간~밝은 피부가 전부 -1(라이트)로 포화 →
  // 헤어 매트 부재 시 "전원 봄/여름 라이트" 계통 오분류의 정량적 뿌리였다.
  // 기준을 L*≈70(전형 셀피)로 올리고 scale을 넓혀 L*60~85가 (-1,+1)에 고르게
  // 펴지도록 한다. 합성 프로브 기반 prior — 실측 raw L* 로그로 재보정 대상.
  dRefSkin: 0.3,
  dScaleSkin: 0.18,
  dRefHair: 0.75,
  dScaleHair: 0.2,
  dRefLip: 0.55,
  dScaleLip: 0.18,
  // Chroma: C* = sqrt(a*²+b*²)
  cRefSkin: 20,
  cScaleSkin: 12,
  cRefLip: 45,
  cScaleLip: 25,
  // Undertone: U = b* - a*
  // F3 완화(2026-07-18): 조명 캐스트는 곱셈성이라 U(=b*-a*)를 크게 흔든다 — 약한
  // 웜광 하나로 U가 +9 이상 이동해 종전 scale(8)로는 개인 언더톤 차(±4)가 캐스트에
  // 파묻히고 temp가 ±1로 포화됐다. scale을 넓혀 포화를 늦추고 개인차를 남긴다.
  // 캐스트의 '제거'는 흰자 기반 조명 보정(illuminationCorrection)이 담당하며, 보정
  // 미적용 캡처는 illumination_uncorrected 경고로 신뢰도를 낮춘다. calibration target.
  uRefSkin: 6,
  uScaleSkin: 14,
  uRefLip: -17,
  uScaleLip: 22,
  uRefHair: 3,
  uScaleHair: 6,
  // Variance: σ(8-bit)
  sigmaRef: 18,
} as const;

// 부위 유효 confidence 계산용. areaRatio는 matte-gated coverage 비율(0..1, scale-free).
// 네이티브가 ROI별 (gated 픽셀 / 샘플 픽셀)로 보고하는 값과 동일 의미.
export const AREA_MIN = { skin: 0.3, hair: 0.2, lip: 0.35 } as const;
export const EXPOSURE_TOLERANCE = 0.1; // over/under 이 값 초과분에 페널티

// q 재정규화 floor (aggregate)
export const AXIS_Q_FLOOR = 0.35;

// 부위 가중치 (Σ=1 per axis; hair는 Chroma에서 제외)
export const AXIS_WEIGHTS = {
  temperature: { skin: 0.6, hair: 0.1, lip: 0.3 },
  value: { skin: 0.55, hair: 0.35, lip: 0.1 },
  chroma: { skin: 0.45, hair: 0.0, lip: 0.55 },
} as const;

// Contrast — pair별 물리 기준으로 센터링(prior). 한국인 검은 머리 + 밝은 피부를
// "보통 대비 ≈ 0"에 두어, 이전 모델이 검은 머리 명도차(~45 > vcScale 35) 때문에
// 모두를 고대비(+1)로 클램프하던 구조적 pinning을 해소한다.
// 전부 calibration target — raw ΔL*·ΔE00 로그 수집 후 재보정.
export const CONTRAST = {
  // skin↔hair: 검은 머리라 명도·색차가 크다(인구 중앙 추정).
  lRefSkinHair: 50, // |ΔL*| — 피부 L*≈63, 검은 머리 L*≈12 → ΔL≈51 근방을 0으로.
  lScaleSkinHair: 16,
  eRefSkinHair: 48, // ΔE00 (skin↔black hair는 ΔL 지배라 ΔE00≈ΔL)
  eScaleSkinHair: 16,
  // skin↔lip: 작다.
  lRefSkinLip: 14,
  lScaleSkinLip: 10,
  eRefSkinLip: 20,
  eScaleSkinLip: 12,
  // pair 결합 가중 (hair 없으면 lip pair만으로 재정규화).
  pairWeightSkinHair: 0.7,
  pairWeightSkinLip: 0.3,
  // 명도대비 vs 색대비 결합.
  weightLum: 0.6,
  weightColor: 0.4,
} as const;

// 12톤 프로토타입 좌표 [Temp, Value, Chroma, Clarity, Contrast]
// 전부 교육적 시작값 = Phase 2 calibration target(prior).
export const PROTOTYPE_ORDER: AxisName[] = [
  'temperature',
  'value',
  'chroma',
  'clarity',
  'contrast',
];

export const PROTOTYPES: Record<PersonalColor12Type, [number, number, number, number, number]> = {
  spring_light: [0.55, -0.75, 0.25, 0.3, -0.35],
  spring_bright: [0.45, -0.3, 0.85, 0.85, 0.45],
  spring_true: [0.85, -0.35, 0.6, 0.55, 0.1],
  summer_light: [-0.5, -0.7, -0.25, -0.25, -0.55],
  summer_true: [-0.85, -0.3, -0.35, -0.35, -0.25],
  summer_muted: [-0.55, -0.1, -0.7, -0.8, -0.6],
  autumn_muted: [0.55, 0.35, -0.55, -0.7, -0.2],
  autumn_true: [0.9, 0.45, 0.2, -0.35, 0.15],
  autumn_deep: [0.65, 0.85, 0.3, -0.05, 0.55],
  winter_bright: [-0.55, 0.35, 0.85, 0.9, 0.85],
  winter_true: [-0.9, 0.45, 0.55, 0.7, 0.7],
  winter_deep: [-0.6, 0.9, 0.5, 0.55, 0.9],
};

export const TYPE_TO_SEASON: Record<PersonalColor12Type, PersonalColorSeason> = {
  spring_light: 'spring',
  spring_bright: 'spring',
  spring_true: 'spring',
  summer_light: 'summer',
  summer_true: 'summer',
  summer_muted: 'summer',
  autumn_muted: 'autumn',
  autumn_true: 'autumn',
  autumn_deep: 'autumn',
  winter_bright: 'winter',
  winter_true: 'winter',
  winter_deep: 'winter',
};

export const ALL_12_TYPES = Object.keys(PROTOTYPES) as PersonalColor12Type[];

// 축별 분류 신뢰도 가중치. contrast·clarity를 down-weight한다:
// - 검은 머리 인구에서 contrast(피부↔머리 명도차)는 사실상 skin 밝기=value와 collinear(r≈−0.78)라
//   value를 이중 계산 + 조명 의존. 약한 tie-breaker로만 사용.
// - clarity는 chroma와 거의 collinear(corr≈0.93)라 독립 정보 적음.
// (적대 검증 수렴 처방. 실측 raw 로그로 재보정 대상.)
export const AXIS_RELIABILITY: Record<AxisName, number> = {
  temperature: 1.0,
  value: 1.0,
  chroma: 0.6,
  clarity: 0.4,
  // F6 축소(2026-07-18): contrast(피부↔머리 명도차)는 검은 머리 인구에서 밝은 피부일수록
  // +1로 고정되고 value(피부 밝기)와 강하게 공선(r≈-0.78)이라 독립 정보가 거의 없다.
  // value를 이중 계산하며 winter/bright 쪽으로 노이즈를 주입하므로 약한 tie-breaker로만.
  contrast: 0.2,
};

// softmax + 앵커 임계값 (확률공간, 스케일 안정) — calibration target
export const CLASSIFIER = {
  tau0: 0.3,
  mixedGap: 0.12,
  secondaryMin: 0.2,
  neutralMin: 0.28,
} as const;

// measurementConfidence 게이팅 임계값
export const MC_GATE = {
  definitive: 0.7,
  usable: 0.45,
} as const;

// F9 립 메이크업 자문 임계 — lip C*(=√(a²+b²))가 이 값을 넘으면 립스틱 의심.
// 주의: 비비드한 입술은 winter 의 자연 특징이라(고채도 쿨 립) 채도만으로 립스틱과
// 구분되지 않는다. 그래서 축을 조용히 바꾸지 않고(정당한 winter 를 summer 로 오분류할
// 위험) advisory 경고(lip_makeup_suspected)만 남겨, 소비처(보고서·AI)가 temp/chroma 를
// 신중히 해석하도록 한다. 저채도 다크 립·파운데이션은 검출 못함. calibration target.
export const LIP_MAKEUP_CHROMA_MAX = 60;

// 한국어 시즌 표시명 — F7 확신도 게이지는 타입("봄 라이트")이 아니라 시즌("봄")
// 단위로 % 를 보여준다(seasonScore). 12타입 typeScore는 정중앙에도 ~50%라 낮게 보임.
export const SEASON_LABEL_KO: Record<PersonalColorSeason, string> = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
};

// 한국어 타입 표시명
export const TYPE_LABEL_KO: Record<PersonalColor12Type, string> = {
  spring_light: '봄 라이트',
  spring_bright: '봄 브라이트',
  spring_true: '봄 웜 트루',
  summer_light: '여름 라이트',
  summer_true: '여름 쿨 트루',
  summer_muted: '여름 뮤트',
  autumn_muted: '가을 뮤트',
  autumn_true: '가을 웜 트루',
  autumn_deep: '가을 딥',
  winter_bright: '겨울 브라이트',
  winter_true: '겨울 쿨 트루',
  winter_deep: '겨울 딥',
};
