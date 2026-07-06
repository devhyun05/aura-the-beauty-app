// AURADIN — soap-bubble glass palette, ported 1:1 from the CSS custom
// properties in "AppScreen copy copy.dc.html" (--holo-rim, --film-bands,
// sheen, inner wall) via the AuradinRN 2 design export.
//
// Scope guard: feature-local like auradinTokens — never move into shared/theme
// (npm run test:auradin-theme-scope).
import { vec } from '@shopify/react-native-skia';

/** thin-film interference rim — two spectral orders around the perimeter */
export const HOLO_RIM = {
  colors: [
    'rgba(255,255,255,0.95)', 'rgba(186,215,255,0.85)', 'rgba(130,208,250,0.75)',
    'rgba(150,235,214,0.62)', 'rgba(255,255,255,0.90)', 'rgba(255,206,160,0.50)',
    'rgba(255,170,220,0.78)', 'rgba(216,150,245,0.72)', 'rgba(255,255,255,0.92)',
    'rgba(150,214,255,0.68)', 'rgba(150,235,220,0.55)', 'rgba(255,214,170,0.45)',
    'rgba(255,178,225,0.72)', 'rgba(202,186,250,0.82)', 'rgba(255,255,255,0.95)',
  ],
  positions: [0, 0.06, 0.13, 0.21, 0.3, 0.37, 0.45, 0.52, 0.6, 0.68, 0.75, 0.82, 0.9, 0.95, 1],
  fromDeg: 210,
};

/** static interference bands laid diagonally across membranes */
export const FILM_BANDS = {
  colors: [
    'rgba(255,170,220,0)', 'rgba(255,170,220,0.14)', 'rgba(202,186,250,0.13)',
    'rgba(130,208,250,0.12)', 'rgba(151,235,215,0.11)', 'rgba(255,255,255,0)',
    'rgba(255,196,232,0.10)', 'rgba(186,214,255,0.11)', 'rgba(151,235,215,0)',
  ],
  positions: [0.06, 0.16, 0.26, 0.36, 0.45, 0.56, 0.7, 0.82, 0.92],
  deg: 115,
};

/** rotating liquid sheen inside the sheet membrane */
export const SHEEN_COLORS = [
  'rgba(255,170,220,0.14)', 'rgba(202,186,250,0.13)', 'rgba(130,208,250,0.13)',
  'rgba(151,235,215,0.11)', 'rgba(255,222,180,0.09)', 'rgba(255,170,220,0.14)',
];

/** second membrane wall just inside the sheet rim */
export const INNERWALL_COLORS = [
  'rgba(255,255,255,0.6)', 'rgba(255,178,222,0.32)', 'rgba(202,186,250,0.38)',
  'rgba(151,235,215,0.26)', 'rgba(186,214,255,0.34)', 'rgba(255,255,255,0.6)',
];

/** CSS linear-gradient(<deg>) → Skia start/end points across a rect */
export function cssLinear(deg: number, x: number, y: number, w: number, h: number) {
  const rad = ((deg - 90) * Math.PI) / 180; // CSS 0deg points up
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return { start: vec(cx - dx * half, cy - dy * half), end: vec(cx + dx * half, cy + dy * half) };
}

/** CSS conic-gradient(from <deg>) → Skia SweepGradient rotation (radians) */
export const sweepFrom = (fromDeg: number): number => ((fromDeg - 90) * Math.PI) / 180;
