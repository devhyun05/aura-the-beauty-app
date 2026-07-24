// 5층 매핑 — 1층 특징 프로파일 → AR 핏 델타(골드 축 rules). AR맞춤핏 계약 v0.2
// (docs/faceData_WEI/AR맞춤핏-계약초안-v0.md)의 PersonalFitProfile/PersonalFitEntry.
//
// deriveFitDeltas가 PersonalFitEntry[]를 뽑고, toFitEntries가 basis/provenance를
// strip해 스텐실 FitEntry로 바꿔 applyFitToLayers(layers, state, baseDeltas)의
// baseDeltas로 넣는다(= 측정 자동 시트, 최하위 우선순위·가산·field 범위 클램프).
// RN·토큰 무의존(계약 러너가 plain node로 실행).

export const PERSONAL_FIT_SCHEMA_VERSION = 'aura-personal-fit.v0' as const;
// 매핑 테이블(밴드→축·부호·δ)의 버전. δ 튜닝은 이 버전만 증가(schema와 분리).
// v1: 확장 기획 v0.2 — 세로3분할·얼굴형·꼬막눈·대비·눈썹 규칙 + 카테고리 신설.
export const PERSONAL_FIT_MAPPING_VERSION = 'fit-map-v1-provisional' as const;

// 스타일 레인 — 동일 프로파일에서 세 가지 핏 정책. §4.1.
export type StyleLane = 'balance' | 'youthful' | 'accent';

// 규칙 카테고리(확장 기획 §6) — reshaping은 형태 보정(레인 게이트: accent에서 0),
// clarity는 결점·선명도 보정(레인 무관 적용). accent = "reshaping만 0"의 실체.
export type FitRuleCategory = 'reshaping' | 'clarity';

// 근거 추적(보고서 어조 게이트와 동일 사상) — 어느 밴드에서 왜 나왔나.
export type PersonalFitBasis = {
  // 프로파일 경로(예: 'eye.canthalTilt') 또는 관찰 키.
  source: string;
  // 판정 밴드(예: 'down', 'hooded').
  band: string;
  // 근거 등급(리서치 테이블) A/B/C.
  grade: 'A' | 'B' | 'C';
  // 규칙 카테고리 — 레인 게이트 판정의 키(§6). 구버전 시트엔 없을 수 있어 optional,
  // 부재는 reshaping으로 해석한다(보수적 — accent에서 제외되는 쪽).
  category?: FitRuleCategory;
  mappingVersion: string;
};

// 스텐실 FitEntry의 부분집합(region + rules) + provenance. affine은 v0 미사용.
export type PersonalFitEntry = {
  region: string;
  // 골드 축 델타 — 키는 그 부위 슬라이더의 FilterParams 필드(가산·클램프는 apply에서).
  rules: Record<string, number>;
  provenance: 'measured';
  basis: PersonalFitBasis;
};

export type PersonalFitProfile = {
  schemaVersion: typeof PERSONAL_FIT_SCHEMA_VERSION;
  mappingVersion: string;
  styleLane: StyleLane;
  sourceReportId?: string;
  entries: PersonalFitEntry[];
};

// 스텐실 FitEntry로의 변환 — basis/provenance strip(별도 디코더 불필요, 계약 §3).
export type StripFitEntry = {region: string; rules: Record<string, number>};

export function toFitEntries(profile: PersonalFitProfile): StripFitEntry[] {
  // 같은 부위 여러 행을 하나로 병합(가산) — applyFitToLayers는 부위별 rules를 기대.
  const byRegion = new Map<string, Record<string, number>>();
  for (const entry of profile.entries) {
    const rules = byRegion.get(entry.region) ?? {};
    for (const [key, value] of Object.entries(entry.rules)) {
      if (Number.isFinite(value) && value !== 0) {
        rules[key] = (rules[key] ?? 0) + value;
      }
    }
    if (Object.keys(rules).length > 0) byRegion.set(entry.region, rules);
  }
  return [...byRegion.entries()].map(([region, rules]) => ({region, rules}));
}
