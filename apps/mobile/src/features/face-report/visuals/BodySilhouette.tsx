import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { color } from '../reportTokens';
import type { Silhouette, StyleGender } from '../../ar/stencil/src/composer/bodyProfile';

// 이 컴포넌트가 그리는 건 **유저 개인의 몸이 아니라 체형 "타입 다이어그램"**이다.
// 설문은 cm(어깨/골반 실측)를 재지 않으므로, 각 카테고리를 대표하는 고정 비율의
// 라인아트를 그린다 — SILHOUETTE_STYLES의 고정 문구가 개인 측정이 아닌 것과 같은
// 취지의 정직한 카테고리 일러스트다. 어깨:허리:골반 폭 비율만 다르게 해 5개 타입을 구분한다.

const VW = 96; // viewBox 폭 (S5 카드의 96x128 프레임 기준)
const VH = 128; // viewBox 높이
const CX = VW / 2;
const HEAD_Y = 13;
const HEAD_R = 8.5;
const NECK_HALF = 3.5;
const SHOULDER_Y = 33;
const WAIST_Y = 66;
const HIP_Y = 92;
const LEG_BOTTOM_Y = 120;

// 타입별 어깨(s)·허리(w)·골반(h) 반폭(viewBox 단위). 비율 차이가 타입을 구분한다.
const BASE_WIDTHS: Record<Silhouette, { s: number; w: number; h: number }> = {
  hourglass: { s: 26, w: 14, h: 26 }, // 모래시계: 어깨≈골반, 허리 잘록
  inverted: { s: 30, w: 19, h: 18 }, //  역삼각: 어깨 넓고 골반 좁음
  pear: { s: 18, w: 19, h: 30 }, //       삼각: 골반 넓고 어깨 좁음
  apple: { s: 24, w: 27, h: 23 }, //      라운드: 허리(몸 중심)가 가장 넓음
  rect: { s: 23, w: 21, h: 23 }, //       직사각: 어깨≈허리≈골반 일자
};

// 성별은 외형만 살짝 바꾼다(분류 결과와는 무관). 남성=어깨를 넓히고 허리 굴곡을
// 완만하게+각진 라인, 여성=허리 굴곡을 강조+곡선. neutral=기본이자 성별 미상의 기본값.
const GENDER_DELTA: Record<StyleGender, { s: number; w: number; h: number }> = {
  men: { s: 2, w: 2, h: -1 },
  women: { s: -1, w: -2, h: 1 },
  neutral: { s: 0, w: 0, h: 0 },
};

const clamp = (n: number): number => Math.max(12, Math.min(32, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * 몸통 외곽선(어깨→허리→골반)을 닫힌 path로. angular=true면 각진 직선(남성),
 * 아니면 중점 스무딩으로 곡선(여성/중립) — 원본 꼭짓점을 2차 베지어 제어점으로 삼아
 * 연속한 두 점의 중점을 지나는 부드러운 닫힌 곡선을 만든다.
 */
function torsoPath(s: number, w: number, h: number, angular: boolean): string {
  // 오른쪽 어깨에서 시계방향으로 6개 꼭짓점.
  const pts = [
    { x: CX + s, y: SHOULDER_Y },
    { x: CX + w, y: WAIST_Y },
    { x: CX + h, y: HIP_Y },
    { x: CX - h, y: HIP_Y },
    { x: CX - w, y: WAIST_Y },
    { x: CX - s, y: SHOULDER_Y },
  ];
  if (angular) {
    return (
      `M ${round1(pts[0].x)} ${round1(pts[0].y)}` +
      pts
        .slice(1)
        .map(p => ` L ${round1(p.x)} ${round1(p.y)}`)
        .join('') +
      ' Z'
    );
  }
  const n = pts.length;
  const mid = (i: number) => ({
    x: (pts[i].x + pts[(i + 1) % n].x) / 2,
    y: (pts[i].y + pts[(i + 1) % n].y) / 2,
  });
  const start = mid(n - 1);
  let d = `M ${round1(start.x)} ${round1(start.y)}`;
  for (let i = 0; i < n; i++) {
    const e = mid(i);
    d += ` Q ${round1(pts[i].x)} ${round1(pts[i].y)} ${round1(e.x)} ${round1(e.y)}`;
  }
  return d + ' Z';
}

interface Props {
  kind: Silhouette;
  gender: StyleGender;
  size?: number; // 렌더 폭(px). 높이는 viewBox 비율(128/96)로 자동. 기본은 카드 프레임 폭.
}

/**
 * 체형 타입 다이어그램 — 5개 실루엣 카테고리를 어깨:허리:골반 비율이 다른
 * 단순 라인아트로 보여준다. (개인 신체 렌더가 아니라 타입 그림이므로 정직성 OK.)
 */
export function BodySilhouette({ kind, gender, size = VW }: Props) {
  const base = BASE_WIDTHS[kind];
  const d = GENDER_DELTA[gender];
  const s = clamp(base.s + d.s);
  const w = clamp(base.w + d.w);
  const h = clamp(base.h + d.h);
  const angular = gender === 'men';
  const legSpread = h * 0.5;
  const stroke = color.accent;
  return (
    <Svg width={size} height={(size * VH) / VW} viewBox={`0 0 ${VW} ${VH}`}>
      {/* 머리 */}
      <Circle cx={CX} cy={HEAD_Y} r={HEAD_R} stroke={stroke} strokeWidth={2} fill="none" />
      {/* 목 */}
      <Line x1={CX - NECK_HALF} y1={HEAD_Y + HEAD_R - 1} x2={CX - NECK_HALF} y2={SHOULDER_Y} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <Line x1={CX + NECK_HALF} y1={HEAD_Y + HEAD_R - 1} x2={CX + NECK_HALF} y2={SHOULDER_Y} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      {/* 몸통 (어깨→허리→골반 비율이 타입을 구분) */}
      <Path d={torsoPath(s, w, h, angular)} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin={angular ? 'miter' : 'round'} strokeLinecap="round" />
      {/* 다리 */}
      <Line x1={CX - legSpread} y1={HIP_Y} x2={CX - legSpread * 0.7} y2={LEG_BOTTOM_Y} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <Line x1={CX + legSpread} y1={HIP_Y} x2={CX + legSpread * 0.7} y2={LEG_BOTTOM_Y} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
