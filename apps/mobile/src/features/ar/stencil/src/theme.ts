// 앱 전역 색 토큰. 소비처는 로컬 색 상수를 재선언하지 말고 여기서 import한다.

// 강조색 (구 핑크 ROSE 계열 대체 — 더스티 블루)
export const ACCENT = '#9FB6D4'; // 구 #FF7E9D
export const ACCENT_LIGHT = '#B3C6DE'; // 구 #FF9EB5
export const ACCENT_PALE = '#D8E3F0'; // 구 #FFCFDD
export const accentAlpha = (a: number) => `rgba(159,182,212,${a})`; // 구 rgba(255,126,157,*)

// 골드 (워프/핏/구조 의미색 — 유지)
export const GOLD = '#C9A15E';
export const GOLD_LIGHT = '#E4CF9E';
export const GOLD_CTA = '#E6C687';

// 패널 배경 (어두운 중성 회색 반투명)
export const PANEL_BG = 'rgba(46,44,42,0.6)';

// 무채색 보조 텍스트 (구 라벤더톤 회색 대체)
export const TEXT_SUB = '#C4C4C4'; // 구 #C9BFC6
export const TEXT_HINT = '#868686'; // 구 #8B7E8C

// 무채색 강조 (보정 레인 전용 — 골드 대체. 슬라이더 트랙/썸 등 활성 표시용)
export const NEUTRAL_ACCENT = '#D6D6D6';

// ── 카드 라벨 텍스트 대비 판정 (세 모드 카드 공용) ──────────────────────────
// GuideMode의 ZONE_TEXT(부위색 위 흰/검 텍스트 분기)·BasicMode의 스와치 카드
// 라벨이 함께 쓰는 헬퍼. 그림자로 가독성을 억지로 확보하는 대신, 배경 밝기에
// 맞춰 텍스트 자체를 밝게/어둡게 전환한다.

/** hex(#RRGGBB) → [r,g,b] 0..255. no-bitwise 린트 회피를 위해 2자리씩 substring 파싱. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** hex(#RRGGBB) → sRGB 감마보정 상대휘도(WCAG 2.x 공식). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const lin = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// '#151515'급 어두운 텍스트의 근사 상대휘도(거의 0) — WCAG 대비비 계산의 검정 기준.
const DARK_TEXT_L = 0.0075;

/**
 * 배경색(hex) 위에서 WCAG 대비비가 더 높은 텍스트 색을 고른다(흰 `#FFFFFF` ↔
 * 어두운 `#151515`). GuideMode의 ZONE_COLORS·BasicMode의 defSwatchColor처럼
 * 배경이 임의색(파스텔~어두운 톤 전부 가능)일 때 텍스트 밝기를 자동 분기한다.
 */
export function labelTextOn(bgHex: string): string {
  const l = relativeLuminance(bgHex);
  const crWhite = 1.05 / (l + 0.05);
  const crDark = (l + 0.05) / (DARK_TEXT_L + 0.05);
  return crDark >= crWhite ? '#151515' : '#FFFFFF';
}

/**
 * 배경(hex) 위에 흰색을 alpha 비율로 얹은 합성색 — 반투명 라벨 바(예: 카드
 * 배경 위 `rgba(255,255,255,0.1)` 스크림)처럼 실제 보이는 색이 배경+오버레이의
 * 알파 합성인 경우, 합성 후 색을 기준으로 대비를 판정하기 위해 쓴다.
 */
export function compositeOverWhite(bgHex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(bgHex);
  const mix = (c: number) => Math.round(c * (1 - alpha) + 255 * alpha);
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
