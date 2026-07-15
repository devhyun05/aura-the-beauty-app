/**
 * 사진→룩 추출(#1) 번역 레이어 — Unity가 온디바이스로 뽑은 색 "측정치"
 * (LookMeasurement)를 컴포저가 이해하는 룩 재료(FilterParams 부분집합 + 렌즈 레이어)로
 * 옮긴다. 측정(=숫자)은 Unity, 해석(=룩 번역)은 RN 원칙(설계: 온디바이스 전용, AI 없음).
 *
 * 순수 함수 — 부작용 없음, RN 컴포넌트 무의존. 강도는 각 부위 색을 맨피부(skinBase)와
 * 비교한 색차(chromaDelta) 기반 휴리스틱이라 실제 제품 강도와 오차가 있고, 상수를 export해
 * 실기기 튜닝을 전제한다. 마감·위치·랜드마크 형태는 높은 신뢰도에서만 선택적으로 반영하고,
 * 글리터처럼 단일 사진에서 안정적으로 추정하기 어려운 재질은 BARE 기본을 유지한다.
 *
 * 파운데이션·컨실러는 "그 사람 피부색"이라 룩이 아니어서 v1에서 제외한다.
 */
import type {FilterParams, LensLayer, LookMeasurement} from '../bridge/types';
import {hexToHsv, hsvToHex} from './color';

/**
 * 추출 튜닝 상수 — 실기기에서 조명·피부톤 실사진으로 조정하는 대상. k_*는 색차→강도
 * 게인, floor/ceil은 강도 클램프, gate는 "그 부위가 원본에 사실상 없다"고 볼 색차 하한
 * (이하면 초안에 포함하지 않음 → 오탐 완화). w*는 chromaDelta 채널 가중.
 */
export const EXTRACT_K = {
  lip: 1.4,
  blush: 1.7,
  eyeshadow: 1.3,
  brow: 0.25, // 눈썹은 색만 신뢰 — 강도는 보수적 고정값
  iris: 0.4, // 컬러렌즈 강도(원래 눈색 비치게 낮게)
  floor: 0.1,
  ceil: 0.7,
  gate: 0.05, // 색차 하한 — 이하면 부위 끔(0)
  // ── 기본 농도 스케일(A) ─────────────────────────────────────────────────
  // 실기기서 기본 게인 1의 추출이 사진 대비 ~1/6로 옅어, 게인 슬라이더를 ~6에 둬야
  // 사진처럼 진했다. 그 배율을 기본값에 굽는다 — 모든 최종 intensity에 곱하는 기본
  // 스케일. 게인 슬라이더는 이 위의 미세조정(기본 1)으로 남는다. 게인과 같은 지점에
  // 곱하므로 floor/ceil(base 대역)은 그대로 두고, 최종 [0,1] 클램프가 상한을 맡는다
  // (별도로 ceil까지 올리면 이중 계상). 실기기 재튜닝 1순위 상수.
  scale: 5.5,
  // 립 그라데 기본값 0 = 끔(B). lipColor2 대입은 유지하되 gradient 0이면 무효 —
  // 사용자가 원치 않는 어두운 그라데(안쪽 색 lipLine이 입 틈 그림자를 물어 시커멓게
  // 되는 오탐)를 기본 차단. 향후 켤 때만 값을 올린다.
  lipGradient: 0,
  wSat: 1.0,
  wHue: 0.9,
  wVal: 0.5,
  // 컬러렌즈 게이팅 — 자연 눈색(갈색/앰버)을 렌즈로 오생성하지 않게. 채도·색상·신뢰도 3중.
  irisConfMin: 0.5,
  irisSatMin: 0.18,
};

/**
 * 형태 번역 튜닝 상수 — 오탐이 기본값 유지보다 나쁘므로 부위별 신뢰도 문턱을 높게 둔다.
 * 범위는 composer/regions.ts의 UI 축과 일치하며, 사진 측정 노이즈가 범위를 넘지 않게 막는다.
 */
const SHAPE_EXTRACT_K = {
  // 립 광택: 양끝만 매트/글로시로 확정하고 중간 대역은 baseline 새틴으로 둔다.
  lipGlossConfMin: 0.55,
  lipMatteMax: 0.35,
  lipGlossyMin: 0.65,
  lipFinishSatin: 0,
  lipFinishMatte: 1,
  lipFinishGlossy: 2,
  // 블러셔 centroid 오프셋은 현재 UI 핏 축의 보수적 공통 범위로 제한한다.
  blushPositionConfMin: 0.6,
  blushOffsetMin: -0.08,
  blushOffsetMax: 0.08,
  // 눈썹 연속축 범위. thickness=1은 실측 밴드 그대로이며 별도 +1 보정하지 않는다.
  browShapeConfMin: 0.6,
  browShapeMin: 0,
  browShapeMax: 5,
  browArchMin: 0,
  browArchMax: 0.7,
  browThicknessMin: 0.5,
  browThicknessMax: 1.8,
  // 픽셀 trace 오탐을 줄이기 위해 아이라인은 가장 높은 신뢰도 문턱을 사용한다.
  eyelinerWingConfMin: 0.8,
  eyelinerStyleMin: 0,
  eyelinerStyleMax: 2,
  eyelinerWingLengthMin: 0.2,
  eyelinerWingLengthMax: 2,
  // 고신뢰 trace도 기본 아이라인 강도보다 보수적으로 켜는 leaf 활성화 seed.
  eyelinerIntensitySeed: 0.06,
} as const;

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** 색상환 위 두 색상(H, [0,1] 순환)의 최단 거리 0..0.5. */
function hueDist(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

/** '#RRGGBB' 6자리 hex인지(선행 # 선택). 빈 문자열/undefined = false. */
function validHex(hex: string | undefined): boolean {
  return typeof hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hex.trim());
}

/**
 * 부위 색이 맨피부와 얼마나 "메이크업스럽게" 다른지 0..~1.5. 채도 증가(makeup은 색을
 * 얹음)·색상 이동(피부보다 붉거나 다른 색)·명도 차(섀도는 어두움)를 가중 합산.
 * 색상항은 makeup/skin 중 유채색이 있을 때만 의미가 있어 채도로 스케일한다.
 */
export function chromaDelta(colorHex: string, skinHex: string): number {
  const c = hexToHsv(colorHex);
  const s = hexToHsv(skinHex);
  const dSat = Math.max(0, c.s - s.s);
  const dHue = hueDist(c.h, s.h) * 2 * Math.max(c.s, s.s); // 0..1
  const dVal = Math.abs(c.v - s.v);
  return dSat * EXTRACT_K.wSat + dHue * EXTRACT_K.wHue + dVal * EXTRACT_K.wVal;
}

/**
 * 색차·신뢰도 → 부위 강도 0..ceil. 색차가 gate 이하면 0(부위 끔)이라
 * decomposeToTree가 그 부위를 초안에 시드하지 않는다.
 * 주의: 조명 신뢰도(lightingConf) 하향은 Unity(LookExtractController)가 이미 각 부위
 * conf에 접어넣어 전달하므로 여기서 다시 곱하지 않는다(이중 곱 → 제곱 → 전 부위 과소 강도).
 */
function estimateIntensity(
  colorHex: string,
  skinHex: string,
  k: number,
  conf: number,
): number {
  const d = chromaDelta(colorHex, skinHex);
  if (d < EXTRACT_K.gate) return 0;
  const base = clamp(k * d, EXTRACT_K.floor, EXTRACT_K.ceil);
  return round3(base * conf);
}

/** 립 안쪽(입 라인) 진한 색 파생 — 명도를 낮추고 채도를 살짝 올린다. */
function darken(hex: string, amount: number): string {
  const {h, s, v} = hexToHsv(hex);
  return hsvToHex(h, Math.min(1, s + amount * 0.3), v * (1 - amount));
}

/** 자연 눈색(갈색/앰버/적갈색)이 아닌 뚜렷한 색(파랑·초록·회청)인지 — 컬러렌즈 게이팅. */
function isColoredLens(m: LookMeasurement): boolean {
  if (m.irisConf < EXTRACT_K.irisConfMin) return false;
  if (!validHex(m.iris)) return false;
  const {h, s} = hexToHsv(m.iris);
  if (s < EXTRACT_K.irisSatMin) return false; // 채도 낮으면 자연 눈색/그림자로 취급
  // 갈색·앰버·적갈색 계열은 색상환 0(빨강) 근방으로 감김 → 자연 눈색으로 배제.
  const brownish = h < 0.11 || h > 0.92;
  return !brownish;
}

/**
 * 측정치 → 컴포저 초안(FilterParams 부분집합 + 렌즈 레이어). 얼굴 미검출이면 빈 결과.
 * decomposeToTree({...BARE, ...params}, [], name, lensLayers, [])로 트리에 얹혀,
 * intensity>0인 부위만 컴포저 상세뷰에 나타난다(사용자가 수정·삭제하는 초안 성격).
 *
 * gain은 실기기 튜닝용 전역 농도 배율(기본 1). 산출한 모든 최종 intensity에 기본
 * 스케일(EXTRACT_K.scale)과 함께 곱한 뒤 [0,1]로 클램프한다 — 기본 스케일이 실기기서
 * 확인된 "게인 6 수준" 농도를 기본 게인 1에 굽고, gain 슬라이더는 그 위 미세조정으로
 * 남는다(빌드 없이 농도 확정 통로). lipGradient 같은 혼합 비율은 농도가 아니므로
 * 곱하지 않는다. gate로 이미 0이 된 부위는 곱해도 0이라 되살아나지 않는다.
 */
export function measurementToLook(
  m: LookMeasurement,
  gain = 1,
): {
  params: Partial<FilterParams>;
  lensLayers: LensLayer[];
} {
  if (!m || !m.hasFace) return {params: {}, lensLayers: []};

  // 최종 intensity = base × 기본 스케일 × 게인, 유효 대역[0,1]로 클램프(셰이더 과입력 방어).
  const g = (v: number): number =>
    round3(clamp(v * EXTRACT_K.scale * gain, 0, 1));

  const params: Partial<FilterParams> = {};

  // 립 — 색 + 강도. 그라데는 기본 끔(B: EXTRACT_K.lipGradient=0). lipColor2(안쪽 색)는
  // 계속 대입해 두되 gradient 0이면 렌더에 무효 — 향후 그라데를 켤 때 스톱B로 쓰인다.
  const lipIntensity = estimateIntensity(
    m.lip,
    m.skinBase,
    EXTRACT_K.lip,
    m.lipConf,
  );
  if (lipIntensity > 0 && validHex(m.lip)) {
    params.lipColor = m.lip;
    params.lipIntensity = g(lipIntensity);
    params.lipColor2 = validHex(m.lipLine) ? m.lipLine : darken(m.lip, 0.2);
    params.lipGradient = EXTRACT_K.lipGradient;
  }

  // 립 마감 — 명확한 저/고 광택만 매트/글로시, 경계 사이는 baseline 새틴으로 번역한다.
  if (
    isFiniteNumber(m.lipGloss) &&
    isFiniteNumber(m.lipGlossConf) &&
    m.lipGlossConf >= SHAPE_EXTRACT_K.lipGlossConfMin
  ) {
    const gloss = clamp(m.lipGloss, 0, 1);
    params.lipFinish =
      gloss <= SHAPE_EXTRACT_K.lipMatteMax
        ? SHAPE_EXTRACT_K.lipFinishMatte
        : gloss >= SHAPE_EXTRACT_K.lipGlossyMin
          ? SHAPE_EXTRACT_K.lipFinishGlossy
          : SHAPE_EXTRACT_K.lipFinishSatin;
  }

  // 블러셔.
  const blushIntensity = estimateIntensity(
    m.blush,
    m.skinBase,
    EXTRACT_K.blush,
    m.blushConf,
  );
  if (blushIntensity > 0 && validHex(m.blush)) {
    params.blushColor = m.blush;
    params.blushIntensity = g(blushIntensity);
  }

  // 블러셔 위치 — Unity가 기본 광대 UV 대비로 정규화한 centroid 오프셋을 그대로 쓴다.
  if (
    isFiniteNumber(m.blushLiftHint) &&
    isFiniteNumber(m.blushSpreadHint) &&
    isFiniteNumber(m.blushPositionConf) &&
    m.blushPositionConf >= SHAPE_EXTRACT_K.blushPositionConfMin
  ) {
    params.blushLift = round3(
      clamp(
        m.blushLiftHint,
        SHAPE_EXTRACT_K.blushOffsetMin,
        SHAPE_EXTRACT_K.blushOffsetMax,
      ),
    );
    params.blushSpread = round3(
      clamp(
        m.blushSpreadHint,
        SHAPE_EXTRACT_K.blushOffsetMin,
        SHAPE_EXTRACT_K.blushOffsetMax,
      ),
    );
  }

  // 아이섀도(눈두덩 리드~크리스 밴드).
  const eyeshadowIntensity = estimateIntensity(
    m.eyeshadow,
    m.skinBase,
    EXTRACT_K.eyeshadow,
    m.eyeshadowConf,
  );
  if (eyeshadowIntensity > 0 && validHex(m.eyeshadow)) {
    params.eyeshadowColor = m.eyeshadow;
    params.eyeshadowIntensity = g(eyeshadowIntensity);
  }

  // 눈썹 — 색만 신뢰, 강도는 보수적 고정값을 신뢰도로만 스케일.
  if (validHex(m.brow) && m.browConf > EXTRACT_K.gate) {
    const browIntensity = round3(EXTRACT_K.brow * m.browConf);
    if (browIntensity > 0) {
      params.browColor = m.brow;
      params.browPowderColor = m.brow;
      params.browIntensity = g(browIntensity);
      params.browPowderIntensity = g(browIntensity);
    }
  }

  // 눈썹 형태 — 세 값이 모두 유효할 때만 하나의 기하 측정 묶음으로 반영한다.
  if (
    isFiniteNumber(m.browShape) &&
    isFiniteNumber(m.browArch) &&
    isFiniteNumber(m.browThickness) &&
    isFiniteNumber(m.browShapeConf) &&
    m.browShapeConf >= SHAPE_EXTRACT_K.browShapeConfMin
  ) {
    params.browShape = clamp(
      Math.round(m.browShape),
      SHAPE_EXTRACT_K.browShapeMin,
      SHAPE_EXTRACT_K.browShapeMax,
    );
    params.browArch = round3(
      clamp(
        m.browArch,
        SHAPE_EXTRACT_K.browArchMin,
        SHAPE_EXTRACT_K.browArchMax,
      ),
    );
    params.browThickness = round3(
      clamp(
        m.browThickness,
        SHAPE_EXTRACT_K.browThicknessMin,
        SHAPE_EXTRACT_K.browThicknessMax,
      ),
    );
  }

  // 아이라인 윙 — 보수적 trace 문턱을 넘고 style/length가 모두 유효할 때만 leaf를 켠다.
  if (
    isFiniteNumber(m.eyelinerStyle) &&
    isFiniteNumber(m.eyelinerWingLength) &&
    isFiniteNumber(m.eyelinerWingConf) &&
    m.eyelinerWingConf >= SHAPE_EXTRACT_K.eyelinerWingConfMin
  ) {
    const wingConf = clamp(m.eyelinerWingConf, 0, 1);
    params.eyelinerStyle = clamp(
      Math.round(m.eyelinerStyle),
      SHAPE_EXTRACT_K.eyelinerStyleMin,
      SHAPE_EXTRACT_K.eyelinerStyleMax,
    );
    params.eyelinerWingLength = round3(
      clamp(
        m.eyelinerWingLength,
        SHAPE_EXTRACT_K.eyelinerWingLengthMin,
        SHAPE_EXTRACT_K.eyelinerWingLengthMax,
      ),
    );
    params.eyelinerIntensity = g(
      SHAPE_EXTRACT_K.eyelinerIntensitySeed * wingConf,
    );
  }

  // 홍채 — 뚜렷한 색(파랑/초록/회청) + 높은 신뢰도일 때만 컬러렌즈 1장. 아니면 없음.
  const lensLayers: LensLayer[] = [];
  if (isColoredLens(m)) {
    lensLayers.push({
      part: 0, // 베이스(전체 홍채)
      color: m.iris,
      blendMode: 1, // 멀티플라이 — 원래 눈색 비침
      intensity: g(EXTRACT_K.iris * m.irisConf),
      inner: 0,
      outer: 0.92,
      designPath: '',
    });
  }

  return {params, lensLayers};
}
