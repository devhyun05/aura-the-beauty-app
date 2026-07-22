import {
  buildAnalysisFitSheet,
  buildPersonalFitBaseDeltas,
  ANALYSIS_FIT_SHEET_ID,
  PERSONAL_FIT_DELTA_SCALE,
  type PersonalFitReportInput,
} from './personalFitService';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceGeometryMetrics} from '../../face-geometry/types';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

function metrics(overrides: Record<string, number>): FaceGeometryMetrics {
  const base = {} as Record<string, {unit: string; value: number | null; warnings: string[]}>;
  for (const k of FACE_GEOMETRY_METRIC_KEYS) {
    base[k] = {unit: k.endsWith('Deg') ? 'deg' : 'ratio', value: k in overrides ? overrides[k] : null, warnings: []};
  }
  return base as unknown as FaceGeometryMetrics;
}

const DOWNTURNED_REPORT: PersonalFitReportInput = {
  id: 'r-1',
  analyzedAt: '2026-07-21T00:00:00.000Z',
  featureObservations: {
    eyelidType: {value: 'hooded', confidence: 0.9, evidence: 'x'},
  },
  measurements: {
    faceGeometry2d: {
      metrics: metrics({canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10}),
    },
  },
};

// ── 레거시 baseDeltas 경로: 명시적 scale 0이면 OFF(δ 0), 1이면 흐른다 ────────
{
  const off = buildPersonalFitBaseDeltas(DOWNTURNED_REPORT, 'balance', 0);
  assert(off.length === 0, 'explicit scale 0 -> no non-zero deltas');
  assert(PERSONAL_FIT_DELTA_SCALE === 0, 'legacy global gate stays OFF (sheet path replaces it)');
  const on = buildPersonalFitBaseDeltas(DOWNTURNED_REPORT, 'balance', 1);
  assert(on.length > 0, 'explicit scale 1 -> deltas flow (downturned canthal fires)');
}

// ── 게이트 열면(scale>0) 방향 규칙이 흐른다 ────────────────────────────────
{
  const deltas = buildPersonalFitBaseDeltas(DOWNTURNED_REPORT, 'balance', 1);
  assert(deltas.length > 0, 'scale 1 -> deltas flow');
  const eyeliner = deltas.find(d => d.region === 'eyelinerUpper');
  assert(eyeliner != null, 'eyelinerUpper present');
  assert((eyeliner!.rules.eyeCornerLift ?? 0) > 0, 'downturned -> eyeCornerLift +');
  assert((eyeliner!.rules.eyelinerThickness ?? 0) < 0, 'hooded -> thinner liner');
  assert(deltas.some(d => d.region === 'eyeshadow'), 'hooded -> eyeshadow row');
}

// ── null/빈 보고서 → 빈 배열(AR 불변) ──────────────────────────────────────
{
  assert(buildPersonalFitBaseDeltas(null, 'balance', 1).length === 0, 'null report -> []');
  const empty: PersonalFitReportInput = {id: 'r-2', analyzedAt: '2026-07-21T00:00:00.000Z'};
  assert(buildPersonalFitBaseDeltas(empty, 'balance', 1).length === 0, 'no measurements/obs -> []');
}

// ── accent 레인 → 형태 보정 없음 ───────────────────────────────────────────
{
  const deltas = buildPersonalFitBaseDeltas(DOWNTURNED_REPORT, 'accent', 1);
  assert(deltas.length === 0, 'accent lane -> no shape deltas');
}

// ── 세로3분할 경로: 중안부 김 → 블러셔 고배치 ──────────────────────────────
{
  const report: PersonalFitReportInput = {
    id: 'r-3',
    analyzedAt: '2026-07-21T00:00:00.000Z',
    measurements: {
      faceVerticalThirds: {
        verticalThirds: {displayRatio: {upper: 1.0, middle: 1.3, lower: 1.0}},
      },
    },
  };
  const deltas = buildPersonalFitBaseDeltas(report, 'youthful', 1);
  const blush = deltas.find(d => d.region === 'blush');
  assert(blush != null && (blush.rules.blushLift ?? 0) > 0, 'long midface via report -> blushLift +');
}

// ── 분석 맞춤 핏 시트 ────────────────────────────────────────────────────
{
  // 발동 규칙 있는 리포트 → 시트 생성(id 고정, 실제 δ scale=1)
  const sheet = buildAnalysisFitSheet(DOWNTURNED_REPORT, 'balance');
  assert(sheet != null, 'fit sheet built when rules fire');
  assert(sheet!.id === ANALYSIS_FIT_SHEET_ID, 'stable sheet id');
  assert(sheet!.entries.length > 0, 'sheet has entries');
  assert(
    sheet!.entries.some(e => e.region === 'eyelinerUpper' && (e.rules.eyeCornerLift ?? 0) > 0),
    'sheet carries real (non-zero) deltas at scale 1',
  );
}
{
  // 근거 없으면 시트 안 만듦(빈 시트 방지)
  const empty: PersonalFitReportInput = {id: 'r-x', analyzedAt: '2026-07-21T00:00:00.000Z'};
  assert(buildAnalysisFitSheet(empty, 'balance') === null, 'no rules -> no sheet');
  assert(buildAnalysisFitSheet(null, 'balance') === null, 'null report -> no sheet');
}
{
  // accent 레인은 형태 보정 없음 → 시트 없음
  assert(buildAnalysisFitSheet(DOWNTURNED_REPORT, 'accent') === null, 'accent -> no shape sheet');
}

console.log('personalFitService: all assertions passed');
