// 색 변환 유틸 (greenfield). sRGB(8-bit,D65) → linear → XYZ → Lab/LCh, ΔE00.
//
// device-relative demotion: 카메라 AWB-lock 이후이므로 여기서 나오는 D65 Lab는
// 진짜 colorimetric 측정이 아니라 device·scene-relative다. 하위 축은 within-frame
// 상대(부위 간 관계·고정 ref 대비 형태)만 소비해야 하며, 세션 간 절대 Lab 비교 금지.

import type { Lab, Lch, Rgb } from './contracts';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

// D65 white point
const Xn = 0.95047;
const Yn = 1.0;
const Zn = 1.08883;

// CIELAB f() 상수
const DELTA = 6 / 29;
const DELTA_CUBED = DELTA * DELTA * DELTA; // 0.008856...
const THREE_DELTA_SQ = 3 * DELTA * DELTA; // 0.128419...

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// sRGB 8-bit 채널 → 선형 (IEC 61966-2-1)
export function srgb8ToLinear(channel8: number): number {
  const s = clamp(channel8, 0, 255) / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  return [X, Y, Z];
}

function labF(t: number): number {
  return t > DELTA_CUBED ? Math.cbrt(t) : t / THREE_DELTA_SQ + 4 / 29;
}

export function xyzToLab(X: number, Y: number, Z: number): Lab {
  const fx = labF(X / Xn);
  const fy = labF(Y / Yn);
  const fz = labF(Z / Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

// sRGB 8-bit → Lab (전체 파이프라인)
export function rgb8ToLab(rgb: Rgb): Lab {
  const r = srgb8ToLinear(rgb.r);
  const g = srgb8ToLinear(rgb.g);
  const b = srgb8ToLinear(rgb.b);
  const [X, Y, Z] = linearRgbToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}

export function labToLch(lab: Lab): Lch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = Math.atan2(lab.b, lab.a) * DEG;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

// ΔE00 (CIEDE2000), kL=kC=kH=1
export function deltaE00(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = hueDeg(b1, a1p);
  const h2p = hueDeg(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * RAD) +
    0.24 * Math.cos(2 * hbarp * RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * RAD) -
    0.2 * Math.cos((4 * hbarp - 63) * RAD);

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));

  const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * Rc;

  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}

function hueDeg(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  let h = Math.atan2(b, ap) * DEG;
  if (h < 0) h += 360;
  return h;
}
