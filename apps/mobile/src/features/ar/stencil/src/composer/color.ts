/**
 * HSV ↔ hex 순수 유틸 + 색상환 좌표 역산.
 *
 * 색상환 이미지(src/assets/color-wheel.png) 규약:
 *  - 중심 기준 각도 = 색상 H. H=0 은 오른쪽(3시, dx>0,dy=0)=빨강.
 *  - 각도 = atan2(dy, dx) (dy 는 화면/이미지 좌표계라 아래가 양수).
 *    → 시계방향(아래로)으로 H 증가: 아래=연두/초록, 왼쪽=시안, 위=파랑/보라.
 *  - 반경 = 채도 S (0 중심 ~ 1 가장자리), 명도 V=1.
 * RN 터치 좌표(locationY 아래 양수)가 이미지 좌표계와 같으므로
 * posToHS 는 이미지 생성 규약과 그대로 일치한다.
 *
 * h, s, v 는 모두 [0,1] 정규화 스칼라.
 */

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** HSV(각 [0,1]) → RGB(각 [0,255] 정수). */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  h = ((h % 1) + 1) % 1; // wrap into [0,1)
  s = clamp01(s);
  v = clamp01(v);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default: // 5
      r = v;
      g = p;
      b = q;
      break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

const hex2 = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** HSV(각 [0,1]) → '#rrggbb'. */
export function hsvToHex(h: number, s: number, v: number): string {
  const {r, g, b} = hsvToRgb(h, s, v);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** '#rgb' | '#rrggbb'(선행 # 선택) → RGB(각 [0,255]). 파싱 불가 시 검정. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    return {r: 0, g: 0, b: 0};
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** RGB(각 [0,255]) → HSV(각 [0,1]). 무채색이면 s=0, h=0. */
export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return {h, s, v};
}

/** '#rrggbb' → HSV(각 [0,1]). */
export function hexToHsv(hex: string): HSV {
  const {r, g, b} = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

/**
 * 색상환 위 탭 위치(중심 기준 dx,dy; dy 아래 양수) → {h, s}.
 * radius = 휠 반경(px). 원 밖이면 S=1 로 클램프.
 */
export function posToHS(
  dx: number,
  dy: number,
  radius: number,
): {h: number; s: number} {
  let angle = Math.atan2(dy, dx); // [-π, π], dy 아래 양수
  if (angle < 0) angle += Math.PI * 2;
  const h = angle / (Math.PI * 2);
  const s = radius <= 0 ? 0 : Math.min(1, Math.hypot(dx, dy) / radius);
  return {h, s};
}

/**
 * {h, s} → 중심 기준 오프셋 좌표 {x, y}(y 아래 양수). posToHS 의 역.
 * 크로스헤어 배치용.
 */
export function hsToPos(
  h: number,
  s: number,
  radius: number,
): {x: number; y: number} {
  const angle = ((h % 1) + 1) % 1 * (Math.PI * 2);
  const r = clamp01(s) * radius;
  return {x: Math.cos(angle) * r, y: Math.sin(angle) * r};
}
