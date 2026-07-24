// Adapter: real FaceAnalysisReport + on-device measurements → the numeric-free
// ReportData the S1–S7 UI (ported from the report redesign design bundle)
// consumes. S1/S2/S4/S5 are built from deterministic on-device
// measurements/survey answers. S3/S6/S7 are built from `regionNotes` /
// `impressionNotes` / `stylingLooks` — text the backend's existing Bedrock
// analysis call now also generates alongside faceShape/recommendedMood/etc
// (services/backend/app/services/openai_analysis.py). S3 region crops + guide
// lines and S6 impression-axis positions now come from real per-user
// measurements (regionVisuals / impressionNotes.axes) when present. Missing AI
// fields hide their sections; this adapter never invents analysis copy or
// neutral positions.

import type {
  FaceAnalysisImpressionNotes,
  FaceAnalysisReport,
  FaceAnalysisRegionNotes,
  FaceAnalysisSkinPerception,
  FaceAnalysisSkinPerceptionAspect,
  FaceAnalysisStylingLookRowCategory,
  FaceAnalysisStylingLooks,
} from '../../../shared/types/faceAnalysis';
import {formatReportCreatedAtLabel} from '../../../shared/utils/reportDate';
import {getFaceAnalysisReportSummaryItems} from '../../face-analysis/services/faceAnalysisReportDetailModel';
import type {
  FaceAnalysisDerivedResult,
  FaceAnalysisMeasurementInterpretation,
} from '../../face-analysis/services/faceAnalysisV2';
import type {MeasuredPersonalColorView} from '../../face-analysis/services/faceAnalysisMeasurements';
import type {Face3DMetricKey, Face3DProfile} from '../../face-3d/types';
import type {
  Face3DPhotoEvidence,
  Face3DPhotoEvidenceRegionKey,
} from '../../face-3d/services/face3DPhotoEvidence';
import type {FaceVerticalThirdsResult, VerticalThirdsDominantPart} from '../../face-ratio/types';
import type {RegionVisuals} from '../../face-geometry/services/faceGeometryCore/regionVisualsBuilder';
import {ALL_12_TYPES, TYPE_LABEL_KO} from '../../personal-color/services/personalColorCore/constants';
import {getColorFamilyReference} from '../../personal-color/services/personalColorCore/palette';
import {describeFaceLength, type FaceShapeGender} from '../reportFormat';
import {buildRegionFeatureAxes, type RegionAxesKey} from '../reportFeatureAxes';
import {buildRegionFeatureDescriptors} from '../regionFeatureDescriptors';
import {buildVisualWeightPresentation} from '../visualWeightPresentation';
import {buildStyleLaneRecommendations} from '../styleLaneRecommendations';
import {formatDepthMeasurementValues} from './faceDepthPresentation';
import {buildFaceFeatureProfile} from '../../face-analysis/services/faceFeatureProfileBuilder';
import {buildVisualWeightMap} from '../../face-analysis/services/visualWeightMap';
import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {AxisName, PaletteItem} from '../../personal-color/services/personalColorCore/contracts';
import {analyzeBody, resolveStyleGender} from '../../ar/stencil/src/composer/bodyProfile';
import type {BodyProfile} from '../../ar/stencil/src/composer/bodyProfile';
import type {
  LookCardData,
  ReportData,
  RegionMeasurementItemData,
  RegionMeasurementValueData,
  S1Data,
  S2Data,
  S3Data,
  S4Data,
  S5Data,
  S6Data,
  S7Data,
  S8Data,
  SpectrumAxisData,
  SwatchData,
  ToneMapPoint,
  ToneProbabilityData,
} from '../reportTypes';

export type FaceReportAdapterInput = {
  report: FaceAnalysisReport;
  heroImageUri?: string;
  verticalThirds?: FaceVerticalThirdsResult | null;
  personalColor?: MeasuredPersonalColorView | null;
  bodyProfile?: BodyProfile | null;
  // Restored per-region crop rect + real landmark polyline guide (S3 cards).
  // Absent/null for legacy reports — buildS3 falls back to the fixed
  // S3_REGION_META guide + full photo, never fabricating a crop/polyline.
  regionVisuals?: RegionVisuals | null;
  // 사용자 프로필 성별('남성'|'여성'|'선택 안 함'|null) — 길이비 참고선(S2)·
  // 체형 문구(S5) 성별 분기에 쓰인다. 측정이 아니라 프로필 값.
  gender?: string | null;
  // 2D 얼굴 기하 실측치 — S3 자기참조 축·서술의 결정론적 근거. 없으면 축은 판정 보류.
  geometryMetrics?: FaceGeometryMetrics | null;
  // Same-frame ARKit mesh projection evidence. Optional for legacy reports;
  // never synthesize it from an aggregated profile.
  face3dPhotoEvidence?: Face3DPhotoEvidence | null;
  face3d?: Face3DProfile | null;
};

function resolveHeroUri(report: FaceAnalysisReport, heroImageUri?: string): string | undefined {
  if (heroImageUri) {
    return heroImageUri;
  }
  const source = report.imageSource;
  return typeof source === 'object' && source !== null && 'uri' in source && typeof source.uri === 'string'
    ? source.uri
    : undefined;
}

function buildSafeReportSummary(report: FaceAnalysisReport): string {
  const generated = (report.shortSummary || report.summary).trim();
  const derived = report.faceAnalysisV2?.derived;
  if (!derived) {
    return generated;
  }
  const verticalLabel = derived.verticalBalance?.label ?? '';
  const contradictsVerticalBalance =
    verticalLabel.includes('우세') && generated.includes('균형');
  const containsRawNumber = /\d/.test(generated);
  if (generated && !contradictsVerticalBalance && !containsRawNumber) {
    return generated;
  }
  return [
    derived.faceShape?.description,
    derived.verticalBalance?.description,
    derived.eyeBrow?.description,
  ].filter((text): text is string => Boolean(text?.trim())).join(' ');
}

function buildS1(
  report: FaceAnalysisReport,
  heroUri: string | undefined,
  personalColor: MeasuredPersonalColorView | null,
  verticalThirds: FaceVerticalThirdsResult | null,
): S1Data {
  return {
    photo: heroUri ? {uri: heroUri, placeholderLabel: '분석 셀피'} : {placeholderLabel: '분석 셀피'},
    dateLine: formatReportCreatedAtLabel(
      report.createdAt ?? report.analyzedAt,
      {includeTime: true},
    ),
    headline: report.recommendedMood,
    body: buildSafeReportSummary(report),
    legacyReport: !report.measurements,
    legacyBadge: '이 판정은 이전 기준으로 측정된 결과예요',
    cards: buildS1SummaryCards(report, personalColor, verticalThirds),
  };
}

function buildS1SummaryCards(
  report: FaceAnalysisReport,
  personalColor: MeasuredPersonalColorView | null,
  verticalThirds: FaceVerticalThirdsResult | null,
): S1Data['cards'] {
  const baseCards = getFaceAnalysisReportSummaryItems(report, personalColor);
  const faceShape = baseCards[1]?.value ?? '측정값 없음';
  const ratio = summarizeVerticalThirds(verticalThirds);
  return [
    baseCards[0] ?? {label: '퍼스널 컬러', value: '측정값 없음'},
    {label: '얼굴형 · 비율', value: `${faceShape} · ${ratio}`},
    {label: '피부 타입', value: report.skinType?.trim() || '측정값 없음'},
    baseCards[3] ?? {label: '톤 요약', value: '측정값 없음'},
  ];
}

export function summarizeFace3DProfile(face3d: Face3DProfile | null): string {
  if (!face3d) {
    return '측정값 없음';
  }
  const validFrames = Number.isFinite(face3d.validFrameCount) ? face3d.validFrameCount : 0;
  const targetFrames = Number.isFinite(face3d.targetFrameCount) ? face3d.targetFrameCount : 0;

  if (validFrames <= 0) {
    return '프레임 부족';
  }
  return targetFrames > 0 ? `완료 · ${validFrames}/${targetFrames}프레임` : `완료 · ${validFrames}프레임`;
}

export function summarizeVerticalThirds(verticalThirds: FaceVerticalThirdsResult | null): string {
  if (!verticalThirds) {
    return '측정값 없음';
  }
  if (verticalThirds.status === 'blocked') {
    return verticalThirds.statusReason ? '기준점 부족' : '측정 보류';
  }
  if (verticalThirds.status === 'failed') {
    return '분석 오류';
  }
  return summarizeDominantPart(verticalThirds.interpretation?.dominantPart) ?? '측정 완료';
}

function summarizeDominantPart(part: VerticalThirdsDominantPart | undefined): string | null {
  switch (part) {
    case 'upper':
      return '상안부 참고';
    case 'middle':
      return '중안부 강조';
    case 'lower':
      return '하안부 강조';
    case 'balanced':
      return '균형에 가까움';
    case 'unknown':
      return '판정 보류';
    default:
      return null;
  }
}

export function summarizeRegionMeasurements(
  regionVisuals: RegionVisuals | null,
  geometryMetrics: FaceGeometryMetrics | null,
): string {
  const visualCount = regionVisuals ? Object.keys(regionVisuals).length : 0;
  if (visualCount > 0) {
    return `${visualCount}/4개 표시`;
  }
  if (geometryMetrics) {
    return '수치만 있음';
  }
  return '측정값 없음';
}

// Mirrors FaceAnalysisReportDetailScreen.tsx's VERTICAL_THIRDS_BLOCKED_MESSAGES
// copy (kept local — this adapter must not import from a screen component).
const S2_HAIRLINE_MISSING_NOTICE = {
  title: '헤어라인 기준점을 측정하지 못했어요',
  body: '이번 보고서는 미간·코밑·턱끝 세 지점만 측정했어요.',
  cta: '다시 측정하기 ›',
};

const S2_BAND_COPY = {
  upper: {
    pillLabel: '상안부',
    title: '상안부',
    desc: '이마 · 눈썹 · 눈 — 또렷한 눈매가 시작되는 구획이에요',
  },
  mid: {pillLabel: '중안부', title: '중안부', desc: '코 · 인중 · 볼 — 완만한 곡선이 이어지는 구획이에요'},
  lower: {pillLabel: '하안부', title: '하안부', desc: '입술 · E라인 — 시선이 잠시 머무는 구획이에요'},
} as const;

// Vertical-thirds keypoints (VerticalThirdsOverlay.tsx) are pixel coordinates in
// the roll-corrected source image, matched 1:1 to sourceImage.width/height — NOT
// pre-normalized. GuidePhotoOverlay needs 0..1 fractions, so we divide by the
// real image dimensions here rather than trusting any embedded normalization.
export function buildFaceProportionSection(
  vt: FaceVerticalThirdsResult | null | undefined,
  gender: string | null | undefined,
  derived: FaceAnalysisDerivedResult | null = null,
): S2Data | null {
  if (!vt || (vt.status !== 'full_success' && vt.status !== 'partial_success')) {
    return null;
  }
  const {sourceImage, keypoints} = vt;
  if (!sourceImage.uri || sourceImage.width <= 0 || sourceImage.height <= 0) {
    return null;
  }
  const {G, H, Me, Sn} = keypoints;
  if (!G || !Sn || !Me) {
    return null;
  }

  const lowConfidence = (vt.verticalThirds?.confidence ?? 1) < 0.5;
  const faceShapeGender: FaceShapeGender =
    gender === '남성' ? 'men' : gender === '여성' ? 'women' : 'neutral';

  const imgH = sourceImage.height;
  const browY = G.y / imgH;
  const noseBaseY = Sn.y / imgH;
  const chinY = Me.y / imgH;
  const hairlineEligible =
    vt.measurementMode === 'full_vertical_thirds' && vt.hairlineAnalysis.analysisEligible && H !== null;
  const hairlineY = hairlineEligible && H ? H.y / imgH : null;

  const upperPillY =
    hairlineY === null ? null : hairlineY + Math.max(0, browY - hairlineY) / 2;
  const midPillY = browY + (noseBaseY - browY) / 2;
  const lowerPillY = noseBaseY + (chinY - noseBaseY) / 2;
  const bands: S2Data['bands'] = [
    ...(hairlineY !== null && upperPillY !== null
      ? [{
          key: 'upper' as const,
          top: hairlineY,
          height: Math.max(0, browY - hairlineY),
          pillLabel: S2_BAND_COPY.upper.pillLabel,
          pillY: upperPillY,
          pillCentered: true,
          title: S2_BAND_COPY.upper.title,
          desc: S2_BAND_COPY.upper.desc,
        }]
      : []),
    {
      key: 'mid',
      top: browY,
      height: noseBaseY - browY,
      pillLabel: S2_BAND_COPY.mid.pillLabel,
      pillY: midPillY,
      pillCentered: true,
      restingTint: true,
      title: S2_BAND_COPY.mid.title,
      desc: S2_BAND_COPY.mid.desc,
    },
    {
      key: 'lower',
      top: noseBaseY,
      height: chinY - noseBaseY,
      pillLabel: S2_BAND_COPY.lower.pillLabel,
      pillY: lowerPillY,
      pillCentered: true,
      title: S2_BAND_COPY.lower.title,
      desc: S2_BAND_COPY.lower.desc,
    },
  ];

  return {
    eyebrow: 'PROPORTION',
    title: '얼굴의 구획부터 볼게요',
    sub: '세로 구획을 보면 얼굴에서 어느 부위가 상대적으로 강조되는지 알 수 있어요.',
    photo: {
      uri: sourceImage.uri,
      placeholderLabel: '얼굴 전체 정면 컷',
      sourceHeight: sourceImage.height,
      sourceWidth: sourceImage.width,
    },
    hairlineMissing: hairlineY === null,
    hairlineY,
    browY,
    noseBaseY,
    chinY,
    lineLabels: {hairline: '헤어라인', brow: '미간', noseBase: '코밑', chin: '턱끝'},
    bands,
    missingNotice: S2_HAIRLINE_MISSING_NOTICE,
    viewCardLabel: '카드 보기 ›',
    ratioNumbers:
      vt.verticalThirds && !lowConfidence
        ? {
            upper: hairlineY === null ? null : vt.verticalThirds.displayRatio.upper,
            middle: vt.verticalThirds.displayRatio.middle,
            lower: vt.verticalThirds.displayRatio.lower,
          }
        : undefined,
    // 얼굴형(성별 참고선 기준 방향 카테고리). 판정이 없거나 저신뢰도면 숨긴다 —
    // 가짜 '평균 밴드'를 참칭하지 않는다(정직화).
    faceShape:
      vt.faceLengthJudgment &&
      vt.faceLengthJudgment.verdict !== 'indeterminate' &&
      !lowConfidence
        ? describeFaceLength(vt.faceLength?.ratio ?? null, faceShapeGender)
        : null,
    insightLabel:
      derived?.verticalBalance?.label
      ?? vt.interpretation.title
      ?? summarizeDominantPart(vt.interpretation.dominantPart)
      ?? undefined,
    insightDescription:
      derived?.verticalBalance?.description
      ?? vt.interpretation.summary
      ?? undefined,
    paragraph: vt.interpretation.summary || vt.interpretation.title || '측정 결과를 요약하지 못했어요.',
  };
}

const AXIS_META: Record<AxisName, {axisLabel: string; leftLabel: string; rightLabel: string}> = {
  // left/right follow the same low→high direction already shown in the
  // shipped PersonalColorTypeCard (AXIS_LABELS) — not re-invented here.
  temperature: {axisLabel: '온도', leftLabel: '차가운 톤(쿨)', rightLabel: '따뜻한 톤(웜)'},
  value: {axisLabel: '명도', leftLabel: '밝은 색(라이트)', rightLabel: '어두운 색(딥)'},
  chroma: {axisLabel: '채도', leftLabel: '은은한 색(저채도)', rightLabel: '선명한 색(고채도)'},
  clarity: {axisLabel: '청탁', leftLabel: '부드러운 색(뮤트)', rightLabel: '맑은 색(클리어)'},
  contrast: {axisLabel: '대비', leftLabel: '저대비', rightLabel: '고대비'},
};
const AXIS_ORDER: AxisName[] = ['temperature', 'value', 'chroma', 'clarity', 'contrast'];

function normalizeAxisPosition(value: number | null): number {
  if (value === null) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, (value + 1) / 2));
}

function hasRegion(personalColor: MeasuredPersonalColorView, region: 'skin' | 'hair' | 'lip'): boolean {
  return personalColor.regions.some(item => item.region === region);
}

function regionConfidence(personalColor: MeasuredPersonalColorView, region: 'skin' | 'hair' | 'lip'): number | null {
  return personalColor.regions.find(item => item.region === region)?.qEff ?? null;
}

function hasLightingWarning(personalColor: MeasuredPersonalColorView): boolean {
  return personalColor.warnings.some(warning =>
    warning.includes('overexposed') ||
    warning.includes('underexposed') ||
    warning.includes('color_cast') ||
    warning.includes('too_bright') ||
    warning.includes('too_dark'),
  );
}

function withheldAxisCaption(axisName: AxisName, personalColor: MeasuredPersonalColorView): string {
  if (axisName === 'contrast') {
    if (!hasRegion(personalColor, 'hair') || personalColor.relations.dL_skinHair == null || personalColor.relations.dE00_skinHair == null) {
      return '머리카락 영역이 충분히 잡히지 않아 피부와 머리카락의 명도·색 차이를 안전하게 비교하지 못했어요.';
    }
    const skinQ = regionConfidence(personalColor, 'skin');
    const hairQ = regionConfidence(personalColor, 'hair');
    if ((skinQ != null && skinQ < 0.35) || (hairQ != null && hairQ < 0.35)) {
      return '피부나 머리카락 샘플 신뢰도가 낮아 대비값을 보류했어요.';
    }
    if (hasLightingWarning(personalColor)) {
      return '노출이나 조명 영향이 커서 대비값을 보류했어요.';
    }
    return '피부와 머리카락의 상대 차이가 안정적으로 잡히지 않아 대비값을 보류했어요.';
  }

  if (!hasRegion(personalColor, 'skin')) {
    return '피부 영역이 충분히 잡히지 않아 이 축의 값을 보류했어요.';
  }
  if (hasLightingWarning(personalColor)) {
    return '노출이나 조명 영향이 커서 이 축의 값을 보류했어요.';
  }
  return '측정 신호가 기준보다 약해 이 축의 값을 보류했어요.';
}

function toSwatch(item: PaletteItem): SwatchData {
  const reference = getColorFamilyReference(item.family);
  // 표준 27개 계열은 최신 완성표를 사용하고, 알 수 없는 과거 계열은 helper가
  // payload의 exemplars를 보존해 돌려준다.
  const examples = [...reference.exemplars];
  const reasons = Array.from(new Set(
    (Array.isArray(item.reasons) ? item.reasons : [])
      .map(reason => reason?.noteKo?.trim())
      .filter((reason): reason is string => Boolean(reason)),
  ));

  return {
    color: reference.hex,
    examples,
    familyLabel: item.family.labelKo,
    name: examples[0] ?? item.family.labelKo,
    note: item.noteKo?.trim() || undefined,
    reasons,
  };
}

const TONE_MAP_POINTS: Record<ToneMapPoint['type'], {x: number; y: number}> = {
  spring_light: {x: 0.62, y: 0.22},
  spring_bright: {x: 0.78, y: 0.38},
  spring_true: {x: 0.68, y: 0.46},
  summer_light: {x: 0.36, y: 0.22},
  summer_true: {x: 0.28, y: 0.44},
  summer_muted: {x: 0.2, y: 0.54},
  autumn_muted: {x: 0.28, y: 0.68},
  autumn_true: {x: 0.56, y: 0.68},
  autumn_deep: {x: 0.66, y: 0.84},
  winter_bright: {x: 0.86, y: 0.54},
  winter_true: {x: 0.76, y: 0.66},
  winter_deep: {x: 0.8, y: 0.86},
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function buildToneProbabilities(tone: MeasuredPersonalColorView['tone']): ToneProbabilityData[] {
  if (!tone) {
    return [];
  }

  return ALL_12_TYPES
    .map(type => ({
      type,
      label: TYPE_LABEL_KO[type],
      ratio: clamp01(tone.probabilities[type] ?? 0),
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

function buildToneMap(probabilities: ToneProbabilityData[]) {
  const active = probabilities.slice(0, 4);
  const activeTypes = new Set(active.map(item => item.type));
  const points = ALL_12_TYPES.map(type => ({
    type,
    label: TYPE_LABEL_KO[type],
    x: TONE_MAP_POINTS[type].x,
    y: TONE_MAP_POINTS[type].y,
    weight: probabilities.find(item => item.type === type)?.ratio ?? 0,
    active: activeTypes.has(type),
  }));

  if (active.length === 0) {
    return {
      caption: '12가지 세부 톤 중 어디에 가까운지 보여주는 상대 위치예요.',
      area: {x: 0.44, y: 0.44, w: 0.12, h: 0.12},
      points,
    };
  }

  const xs = active.map(item => TONE_MAP_POINTS[item.type].x);
  const ys = active.map(item => TONE_MAP_POINTS[item.type].y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 0.08;

  return {
    caption: '12가지 세부 톤 중 가까운 위치를 보여줘요. 굵은 영역은 현재 결과가 걸쳐 있는 톤 범위예요.',
    area: {
      x: clamp01(minX - pad),
      y: clamp01(minY - pad),
      w: Math.min(1, maxX - minX + pad * 2),
      h: Math.min(1, maxY - minY + pad * 2),
    },
    points,
  };
}

export function buildPersonalColorSection(
  personalColor: MeasuredPersonalColorView | null | undefined,
  heroUri: string | undefined,
): S4Data | null {
  if (!personalColor || personalColor.status === 'insufficient' || !personalColor.tone) {
    return null;
  }
  const {tone, axes, palette} = personalColor;

  const axesData: SpectrumAxisData[] = AXIS_ORDER.map(name => {
    const axis = axes[name];
    const meta = AXIS_META[name];
    const withheld = axis.value === null;
    return {
      leftLabel: meta.leftLabel,
      rightLabel: meta.rightLabel,
      axisLabel: meta.axisLabel,
      state: withheld ? {kind: 'withheld'} : {kind: 'point', position: normalizeAxisPosition(axis.value)},
      ...(withheld
        ? {
            statusChip: '측정 보류',
            caption: withheldAxisCaption(name, personalColor),
          }
        : {}),
    };
  });

  const goodSwatches = palette.best.slice(0, 4).map(toSwatch);
  const badSwatches = palette.worst.map(toSwatch);
  const toneProbabilities = buildToneProbabilities(tone);
  const toneMap = buildToneMap(toneProbabilities);
  const initialSwatch = goodSwatches[0]
    ? {...goodSwatches[0], good: true}
    : {name: '기준 색', color: '#C9C2B8', good: true};

  return {
    eyebrow: 'PERSONAL COLOR',
    title: '색은 이렇게 어울려요',
    sub: '피부와 이목구비의 색 관계를 보면 얼굴을 맑게 살리는 색을 찾을 수 있어요.',
    season: {
      headline: tone.secondary
        ? `${TYPE_LABEL_KO[tone.top]} 중심, ${TYPE_LABEL_KO[tone.secondary]}에 걸쳐요`
        : `${TYPE_LABEL_KO[tone.top]} 중심이에요`,
    },
    seasonConfidence: {
      topLabel: TYPE_LABEL_KO[tone.top],
      secondaryLabel: tone.secondary ? TYPE_LABEL_KO[tone.secondary] : null,
      typeScore: Math.min(1, Math.max(0, tone.typeScore)),
    },
    toneProbabilities,
    toneMap,
    axes: axesData,
    drape: {
      title: '어울리는 색, 나란히 대보기',
      sub: '잘 어울리는 색과 피할 색을 얼굴에 나란히 대보면 차이가 바로 보여요',
      photo: heroUri
        ? {uri: heroUri, placeholderLabel: '셀피', cropRect: {x: 0.29, y: 0.12, w: 0.42, h: 0.7}}
        : {placeholderLabel: '셀피'},
      goodTag: '잘 어울리는 색',
      badTag: '피할 색',
      goodCaption: '얼굴 주변이 정돈되고 피부 결이 고르게 살아나요',
      badCaption: '색이 얼굴보다 먼저 읽혀서 인상이 살짝 가라앉아 보여요',
      goodTitle: '잘 어울리는 색',
      badTitle: '피하면 좋은 색',
      goodSwatches,
      badSwatches: badSwatches.slice(0, 4),
      initialSwatch,
      disclaimer: '촬영 조명 기준 상대 진단이에요. 조명이 다르면 결과가 달라질 수 있어요.',
    },
  };
}

function buildS5(bodyProfile: BodyProfile | null | undefined, gender: string | null | undefined): S5Data {
  const base = {
    eyebrow: 'BODY TYPE',
    title: '체형은 설문으로 봤어요',
    sub: '체형 특성을 알면 옷의 핏과 비율을 더 자연스럽게 고를 수 있어요.',
    silhouettePlaceholder: '실루엣\n일러스트',
    silhouetteLabel: '실루엣 타입',
    skeletonLabel: '골격 타입',
  };

  if (!bodyProfile) {
    return {
      ...base,
      silhouetteValue: '아직 답변하지 않았어요',
      skeletonValue: '아직 답변하지 않았어요',
      surveyNote: '체형 설문에 답하면 바로 볼 수 있어요',
      surveyLink: '설문 시작하기',
      doTitle: '설문에 답하면 스타일링 가이드를 볼 수 있어요',
      doItems: [],
      avoidTitle: '',
      avoidItems: [],
    };
  }

  const styleGender = resolveStyleGender(gender);
  const analyzed = analyzeBody(bodyProfile, styleGender);
  return {
    ...base,
    // 실루엣 타입 다이어그램 배선(설문 답변이 있는 분기에서만). 미답변 분기는
    // 이 필드들을 설정하지 않아 undefined로 남고, S5Body가 빈 상태 플레이스홀더를 유지한다.
    silhouetteKind: analyzed.silhouette,
    styleGender,
    silhouetteValue: analyzed.silhouetteStyle.label,
    skeletonValue: analyzed.frameStyle.label,
    surveyNote: '체형 설문 기반 · ',
    surveyLink: '다시 답하기',
    doTitle: '이렇게 입어보세요',
    doItems: [...analyzed.silhouetteStyle.points, ...analyzed.frameStyle.points],
    avoidTitle: '이건 피해도 좋아요',
    avoidItems: [...analyzed.silhouetteStyle.avoid, ...analyzed.frameStyle.avoid],
  };
}

// Fixed, non-personalized region-guide markers per region key — same rationale
// as S5's generic silhouette illustration. Real per-user crop coordinates need
// backend bbox storage (redesign plan §4.1) that doesn't exist yet; these are
// illustrative pointers, not a claimed measurement.
const S3_REGION_META: Record<
  'upper' | 'mid' | 'lower' | 'jaw',
  {chip: string; title: string; guide: S3Data['cards'][number]['guide']; guideLabel: string; guideLabelX: number}
> = {
  upper: {
    chip: '상안부',
    title: '눈썹 · 눈',
    guide: {kind: 'none'},
    guideLabel: '',
    guideLabelX: 0.14,
  },
  mid: {
    chip: '중안부',
    title: '코 · 볼 · 중앙부',
    guide: {kind: 'none'},
    guideLabel: '',
    guideLabelX: 0.5,
  },
  lower: {
    chip: '하안부',
    title: '입술',
    guide: {kind: 'none'},
    guideLabel: '',
    guideLabelX: 0.28,
  },
  jaw: {
    chip: '외곽 라인',
    title: '턱 · 얼굴 외곽',
    // 실제 regionVisuals 턱 polyline이 없을 때는 곡선을 그리지 않는다.
    // 고정 타원은 얼굴 크롭/포즈가 조금만 달라도 턱선이 아닌 목·배경을 감싸
    // "AI가 턱을 잘못 인식한 선"처럼 보이므로 숨기는 편이 정직하다.
    guide: {kind: 'none'},
    guideLabel: '',
    guideLabelX: 0.18,
  },
};

// 구버전 보고서는 regionNotes 값이 string일 수 있고 신버전은
// {insight, evidence, recommendation} 객체다. 어댑터 경계에서 둘을 흡수한다.
function normalizeRegionNote(
  raw: unknown,
): {insight: string; evidence: string; recommendation: string} {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      insight: typeof o.insight === 'string' ? o.insight : '',
      evidence: typeof o.evidence === 'string' ? o.evidence : '',
      recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
    };
  }
  if (typeof raw === 'string') {
    return {insight: raw, evidence: '', recommendation: ''};
  }
  return {insight: '', evidence: '', recommendation: ''};
}

function hasGeometryMetric(
  metrics: FaceGeometryMetrics | null,
  keys: (keyof FaceGeometryMetrics)[],
): boolean {
  return Boolean(metrics && keys.some(key => metrics[key]?.value != null));
}

function face3dMetric(
  profile: Face3DProfile | null,
  key: keyof Face3DProfile['metrics'],
) {
  const metric = profile?.metrics[key];
  return metric?.value != null && Number.isFinite(metric.value) ? metric : null;
}

function confidenceLabel(
  profile: Face3DProfile | null,
  keys: (keyof Face3DProfile['metrics'])[],
): string | undefined {
  const confidences = keys
    .map(key => face3dMetric(profile, key)?.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (confidences.length === 0) return undefined;
  const percent = Math.round(
    (confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100,
  );
  return `측정 신뢰도 ${Math.max(0, Math.min(100, percent))}%`;
}

const LOCAL_MEASUREMENT_COPY: Record<
  string,
  {resultLabel: string; interpretation: string}
> = {
  interCanthalDistance: {
    resultLabel: '얼굴 폭 대비 눈 사이 간격',
    interpretation: '두 눈 사이의 여백이 얼굴 전체에서 차지하는 관계예요.',
  },
  eyeWidth: {
    resultLabel: '좌우 눈 너비를 각각 확인',
    interpretation: '같은 얼굴 폭 기준으로 양쪽 눈의 가로 길이를 비교했어요.',
  },
  eyeOpenness: {
    resultLabel: '좌우 눈 뜨임을 각각 확인',
    interpretation: '눈 너비에 비해 위아래로 열린 정도를 좌우로 나눠 봤어요.',
  },
  canthalTilt: {
    resultLabel: '눈 앞머리에서 눈꼬리로 이어지는 방향',
    interpretation: '수평선에 비해 눈꼬리가 향하는 흐름을 보여줘요.',
  },
  browFlow: {
    resultLabel: '눈썹 기울기와 산 위치를 함께 확인',
    interpretation: '눈썹의 방향과 눈썹 산이 놓인 위치를 함께 본 결과예요.',
  },
  noseTipProjection: {
    resultLabel: '코끝의 전방 입체감',
    interpretation: '코끝이 양 볼 기준면보다 앞으로 놓이는 정도예요.',
  },
  noseLength: {
    resultLabel: '얼굴 크기 대비 코의 세로 길이',
    interpretation: '미간 기준점부터 코끝까지 이어지는 길이 관계예요.',
  },
  nasalBridge: {
    resultLabel: '콧대 중심선의 흐름',
    interpretation: '콧대의 직선감과 얼굴 중앙선에 대한 방향을 함께 봤어요.',
  },
  alarWidth: {
    resultLabel: '얼굴 크기 대비 콧볼 폭',
    interpretation: '양쪽 콧볼 바깥점 사이의 폭 관계예요.',
  },
  centralProjectionScore: {
    resultLabel: '중앙부와 양 볼의 전후 관계',
    interpretation: '얼굴 중앙 영역이 양 볼 기준면보다 앞으로 놓이는 정도예요.',
  },
  malarProjection: {
    resultLabel: '양쪽 광대 부근의 전방 입체감',
    interpretation: '좌우 볼 표면의 돌출 정도를 각각 확인한 결과예요.',
  },
  mouthWidth: {
    resultLabel: '얼굴 폭 대비 입의 가로 길이',
    interpretation: '양쪽 입꼬리 사이가 얼굴 폭에서 차지하는 관계예요.',
  },
  lipThickness: {
    resultLabel: '입 너비 대비 입술의 세로 볼륨',
    interpretation: '입의 가로 길이에 비해 위아래 입술이 차지하는 두께 관계예요.',
  },
  lipProjection: {
    resultLabel: 'E-line 기준 입술의 전후 위치',
    interpretation: '코끝과 턱끝을 잇는 선을 기준으로 입술이 놓인 위치예요.',
  },
  jawWidth: {
    resultLabel: '얼굴 폭 대비 턱 모서리 폭',
    interpretation: '좌우 턱 모서리가 얼굴 전체 폭에서 차지하는 관계예요.',
  },
  lowerJawWidth: {
    resultLabel: '얼굴 폭 대비 아래턱 폭',
    interpretation: '좌우 아래턱 윤곽점 사이를 얼굴 전체 폭과 비교했어요.',
  },
  chinProjection: {
    resultLabel: '중안부 기준면 대비 턱끝의 위치',
    interpretation: '턱끝이 얼굴 기준면보다 앞으로 놓이는 정도예요.',
  },
};

function measurementNumber(
  key: string,
  geometryMetrics: FaceGeometryMetrics | null,
  face3d: Face3DProfile | null,
): number | null {
  const geometryValue = (
    geometryMetrics as unknown as Record<string, {value?: unknown}> | null
  )?.[key]?.value;
  if (typeof geometryValue === 'number' && Number.isFinite(geometryValue)) {
    return geometryValue;
  }
  const depthValue = (
    face3d?.metrics as unknown as Record<string, {value?: unknown}> | undefined
  )?.[key]?.value;
  return typeof depthValue === 'number' && Number.isFinite(depthValue)
    ? depthValue
    : null;
}

function measurementDisplayValue(
  metricKeys: string[],
  geometryMetrics: FaceGeometryMetrics | null,
  face3d: Face3DProfile | null,
): string | undefined {
  const values = metricKeys
    .map(metricKey => ({
      key: metricKey,
      value: measurementNumber(metricKey, geometryMetrics, face3d),
    }))
    .filter((entry): entry is {key: string; value: number} => entry.value !== null);
  if (values.length === 0) return undefined;
  const paired = values.length === 2;
  return values.map((entry, index) => {
    const prefix = paired ? `${index === 0 ? '좌' : '우'} ` : '';
    if (entry.key.endsWith('Deg')) {
      return `${prefix}${entry.value.toFixed(1)}°`;
    }
    const fromGeometry = Boolean(
      (geometryMetrics as unknown as Record<string, unknown> | null)?.[entry.key],
    );
    return fromGeometry
      ? `${prefix}${(entry.value * 100).toFixed(1)}%`
      : `${prefix}상대값 ${entry.value.toFixed(2)}`;
  }).join(' · ');
}

const DEPTH_VALUE_LABELS: Partial<Record<Face3DMetricKey, string>> = {
  noseTipProjection: '코끝',
  centralProjectionScore: '중앙부',
  malarProjectionLeft: '왼쪽 광대',
  malarProjectionRight: '오른쪽 광대',
  upperLipToELine: '윗입술',
  lowerLipToELine: '아랫입술',
  chinProjection: '턱끝',
};

function measurementDepthValues(
  metricKeys: string[],
  face3d: Face3DProfile | null,
): RegionMeasurementValueData[] {
  return metricKeys.flatMap(metricKey => {
    const label = DEPTH_VALUE_LABELS[metricKey as Face3DMetricKey];
    const metric = face3dMetric(
      face3d,
      metricKey as keyof Face3DProfile['metrics'],
    );
    return label && metric
      ? [{
          label,
          metricKey,
          normalizedValue: metric.value as number,
        }]
      : [];
  });
}

function buildRegionMeasurementItems(
  key: RegionAxesKey,
  geometryMetrics: FaceGeometryMetrics | null,
  face3d: Face3DProfile | null,
  interpretations: Record<string, FaceAnalysisMeasurementInterpretation> = {},
): RegionMeasurementItemData[] {
  const item = (
    config: Omit<
      RegionMeasurementItemData,
      'confidenceLabel' | 'displayValue' | 'interpretation' | 'resultLabel' | 'values'
    > & {
      confidenceKeys?: (keyof Face3DProfile['metrics'])[];
    },
  ): RegionMeasurementItemData => {
    const {confidenceKeys, ...rest} = config;
    const server = interpretations[config.key];
    const local = LOCAL_MEASUREMENT_COPY[config.key] ?? {
      resultLabel: '측정 결과를 확인했어요',
      interpretation: '표시된 기준선과 측정값을 함께 봐 주세요.',
    };
    const confidence = confidenceKeys
      ? confidenceLabel(face3d, confidenceKeys)
      : undefined;
    const values =
      config.visualType === 'depth' || config.visualType === 'line-and-depth'
        ? measurementDepthValues(config.metricKeys, face3d)
        : [];
    const displayValue =
      values.length > 0
        ? formatDepthMeasurementValues(values)
        : server?.displayValue
          ?? measurementDisplayValue(config.metricKeys, geometryMetrics, face3d);
    return {
      ...rest,
      resultLabel: server?.resultLabel ?? local.resultLabel,
      interpretation: server?.description ?? local.interpretation,
      ...(displayValue ? {displayValue} : {}),
      ...(values.length > 0 ? {values} : {}),
      ...(confidence ? {confidenceLabel: confidence} : {}),
    };
  };

  if (key === 'upper') {
    const result: RegionMeasurementItemData[] = [];
    if (hasGeometryMetric(geometryMetrics, ['interCanthalRatio'])) {
      result.push(item({
        key: 'interCanthalDistance',
        label: '눈 사이 거리',
        detail: '양쪽 눈의 실제 내안각을 잇는 거리와 얼굴 폭의 관계예요.',
        metricKeys: ['interCanthalRatio'],
        visualType: 'line',
      }));
    }
    if (hasGeometryMetric(geometryMetrics, ['eyeWidthRatioLeft', 'eyeWidthRatioRight'])) {
      result.push(item({
        key: 'eyeWidth',
        label: '좌우 눈 너비',
        detail: '각 눈의 내안각과 외안각 사이를 좌우로 나누어 측정했어요.',
        metricKeys: ['eyeWidthRatioLeft', 'eyeWidthRatioRight'],
        visualType: 'line',
      }));
    }
    if (hasGeometryMetric(geometryMetrics, ['eyeOpennessLeft', 'eyeOpennessRight'])) {
      result.push(item({
        key: 'eyeOpenness',
        label: '눈 개방도',
        detail: '좌우 눈의 위·아래 눈꺼풀 중앙점 사이 관계를 확인했어요.',
        metricKeys: ['eyeOpennessLeft', 'eyeOpennessRight'],
        visualType: 'line',
      }));
    }
    if (hasGeometryMetric(geometryMetrics, ['canthalTiltLeftDeg', 'canthalTiltRightDeg'])) {
      result.push(item({
        key: 'canthalTilt',
        label: '눈꼬리 기울기',
        detail: '내안각에서 외안각으로 향하는 선을 수평 기준과 비교했어요.',
        metricKeys: ['canthalTiltLeftDeg', 'canthalTiltRightDeg'],
        visualType: 'line',
      }));
    }
    if (hasGeometryMetric(geometryMetrics, ['browSlopeLeftDeg', 'browSlopeRightDeg', 'browApexRatioLeft', 'browApexRatioRight'])) {
      result.push(item({
        key: 'browFlow',
        label: '눈썹 흐름',
        detail: '실제 눈썹 코어 랜드마크로 기울기와 눈썹 산의 위치를 확인했어요.',
        metricKeys: ['browSlopeLeftDeg', 'browSlopeRightDeg', 'browApexRatioLeft', 'browApexRatioRight'],
        visualType: 'line',
      }));
    }
    return result;
  }

  if (key === 'mid') {
    const result: RegionMeasurementItemData[] = [];
    if (face3dMetric(face3d, 'noseTipProjection')) {
      result.push(item({
        key: 'noseTipProjection',
        groupLabel: '코',
        label: '코끝 돌출',
        detail: '코끝과 양 볼 기준면의 전후 관계를 대표 측정 프레임에서 확인했어요.',
        metricKeys: ['noseTipProjection'],
        visualType: 'depth',
        confidenceKeys: ['noseTipProjection'],
      }));
    }
    if (face3dMetric(face3d, 'noseLength')) {
      result.push(item({
        key: 'noseLength',
        groupLabel: '코',
        label: '코 길이',
        detail: '미간 기준점부터 코끝까지의 3D 길이 관계예요.',
        metricKeys: ['noseLength'],
        visualType: 'line',
        confidenceKeys: ['noseLength'],
      }));
    }
    if (face3dMetric(face3d, 'nasalBridgeStraightness') || face3dMetric(face3d, 'nasalAxisDeviation')) {
      result.push(item({
        key: 'nasalBridge',
        groupLabel: '코',
        label: '콧대와 코축',
        detail: '콧대 중심선의 직선 흐름과 얼굴 중앙선 대비 방향을 확인했어요.',
        metricKeys: ['nasalBridgeStraightness', 'nasalAxisDeviation'],
        visualType: 'line',
        confidenceKeys: ['nasalBridgeStraightness', 'nasalAxisDeviation'],
      }));
    }
    if (face3dMetric(face3d, 'alarWidth')) {
      result.push(item({
        key: 'alarWidth',
        groupLabel: '코',
        label: '콧볼 너비',
        detail: '좌우 콧볼의 해부학적 최외측점 사이를 측정했어요.',
        metricKeys: ['alarWidth'],
        visualType: 'line',
        confidenceKeys: ['alarWidth'],
      }));
    }
    if (face3dMetric(face3d, 'centralProjectionScore')) {
      result.push(item({
        key: 'centralProjectionScore',
        groupLabel: '볼 · 중앙부',
        label: '중앙부와 볼의 관계',
        detail: '얼굴 중앙 영역과 양 볼 기준면의 전후 관계를 확인했어요.',
        metricKeys: ['centralProjectionScore'],
        visualType: 'depth',
        confidenceKeys: ['centralProjectionScore'],
      }));
    }
    if (face3dMetric(face3d, 'malarProjectionLeft') || face3dMetric(face3d, 'malarProjectionRight')) {
      result.push(item({
        key: 'malarProjection',
        groupLabel: '볼 · 중앙부',
        label: '좌우 볼 돌출',
        detail: '좌우 광대 부근 표면의 전방 돌출을 각각 측정했어요.',
        metricKeys: ['malarProjectionLeft', 'malarProjectionRight'],
        visualType: 'depth',
        confidenceKeys: ['malarProjectionLeft', 'malarProjectionRight'],
      }));
    }
    return result;
  }

  if (key === 'lower') {
    const result: RegionMeasurementItemData[] = [];
    if (hasGeometryMetric(geometryMetrics, ['mouthWidthRatio'])) {
      result.push(item({
        key: 'mouthWidth',
        label: '입 너비',
        detail: '양쪽 입꼬리 랜드마크 사이와 얼굴 폭의 관계를 측정했어요.',
        metricKeys: ['mouthWidthRatio', 'mouthCornerAsymmetry'],
        visualType: 'line',
      }));
    }
    if (hasGeometryMetric(geometryMetrics, ['lipThicknessRatio'])) {
      result.push(item({
        key: 'lipThickness',
        label: '위아래 입술 두께',
        detail: '입술 중앙의 위·아래 경계점으로 두께 관계를 확인했어요.',
        metricKeys: ['lipThicknessRatio'],
        visualType: 'line',
      }));
    }
    const lipDepthKeys = (['upperLipToELine', 'lowerLipToELine'] as const)
      .filter(metricKey => face3dMetric(face3d, metricKey));
    if (lipDepthKeys.length > 0) {
      result.push(item({
        key: 'lipProjection',
        label: '입술 돌출',
        detail: '코끝과 턱끝을 잇는 기준선에 대한 위·아래 입술의 전후 관계예요.',
        metricKeys: [...lipDepthKeys],
        visualType: 'depth',
        confidenceKeys: [...lipDepthKeys],
      }));
    }
    return result;
  }

  const result: RegionMeasurementItemData[] = [];
  if (hasGeometryMetric(geometryMetrics, ['jawWidthRatio'])) {
    result.push(item({
      key: 'jawWidth',
      label: '턱 너비',
      detail: '좌우 턱 모서리 랜드마크 사이와 얼굴 폭의 관계를 측정했어요.',
      metricKeys: ['jawWidthRatio'],
      visualType: 'line',
    }));
  }
  if (hasGeometryMetric(geometryMetrics, ['lowerJawWidthRatio'])) {
    result.push(item({
      key: 'lowerJawWidth',
      label: '아래턱 너비',
      detail: '좌우 아래턱 윤곽점 사이의 폭 관계를 확인했어요.',
      metricKeys: ['lowerJawWidthRatio'],
      visualType: 'line',
    }));
  }
  if (face3dMetric(face3d, 'chinProjection')) {
    result.push(item({
      key: 'chinProjection',
      label: '턱끝 돌출',
      detail: '턱끝과 중안부 기준면의 전후 관계를 대표 측정 프레임에서 확인했어요.',
      metricKeys: ['chinProjection'],
      visualType: 'depth',
      confidenceKeys: ['chinProjection'],
    }));
  }
  return result;
}

function cropFromPhotoEvidence(
  evidence: Face3DPhotoEvidence | null,
  regionKeys: Face3DPhotoEvidenceRegionKey[],
): {x: number; y: number; w: number; h: number} | null {
  if (!evidence) return null;
  const points = regionKeys.flatMap(key => {
    const region = evidence.regions[key];
    return region ? [...region.hull, region.pin] : [];
  });
  if (points.length === 0) return null;
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0.005) || !(height > 0.005)) return null;
  const x = Math.max(0, minX - width * 0.3);
  const y = Math.max(0, minY - height * 0.3);
  const x2 = Math.min(1, maxX + width * 0.3);
  const y2 = Math.min(1, maxY + height * 0.3);
  return {x, y, w: x2 - x, h: y2 - y};
}

function buildS3(
  regionNotes: FaceAnalysisRegionNotes | undefined,
  photo: S1Data['photo'],
  regionVisuals: RegionVisuals | null,
  geometryMetrics: FaceGeometryMetrics | null,
  featureDescriptors: Record<RegionAxesKey, string[]> | null,
  face3d: Face3DProfile | null,
  face3dPhotoEvidence: Face3DPhotoEvidence | null,
  derived: FaceAnalysisDerivedResult | null,
): S3Data | null {
  // 자기참조 축(위치=실측 결정론적). 지표 없으면 null → 각 축 판정 보류/미표시.
  const regionAxes = geometryMetrics ? buildRegionFeatureAxes(geometryMetrics) : null;

  const cards = (['upper', 'mid', 'lower', 'jaw'] as const).flatMap(key => {
    const meta = S3_REGION_META[key];
    const rvRaw = regionVisuals?.[key];
    const rv = rvRaw && rvRaw.cropRect.w > 0 && rvRaw.cropRect.h > 0 ? rvRaw : undefined;
    const evidenceRegionKeys: Record<RegionAxesKey, Face3DPhotoEvidenceRegionKey[]> = {
      upper: [],
      mid: ['nose', 'central', 'malarLeft', 'malarRight'],
      lower: ['upperLip', 'lowerLip'],
      jaw: ['chin'],
    };
    const evidenceCrop = cropFromPhotoEvidence(
      face3dPhotoEvidence,
      evidenceRegionKeys[key],
    );
    const cropRect = rv?.cropRect ?? evidenceCrop ?? undefined;
    const sourceImage =
      rv?.sourceImage
      ?? (face3dPhotoEvidence
        ? {
            width: face3dPhotoEvidence.image.width,
            height: face3dPhotoEvidence.image.height,
          }
        : undefined);
    const measurementItems = buildRegionMeasurementItems(
      key,
      geometryMetrics,
      face3d,
      derived?.measurementInterpretations,
    );
    const itemMetricKeys = new Set(
      measurementItems.flatMap(itemData => itemData.metricKeys),
    );
    const reframe = (point: {x: number; y: number}) =>
      cropRect
        ? {
            x: (point.x - cropRect.x) / cropRect.w,
            y: (point.y - cropRect.y) / cropRect.h,
          }
        : point;
    const regionGuides = rv
      ? (rv.guides ?? [rv.guide]).map((regionGuide, index) => ({
          kind: 'measurement' as const,
          key: regionGuide.key ?? `${key}-guide-${index}`,
          label: regionGuide.label,
          measurementKind: regionGuide.kind ?? 'contour' as const,
          metricKeys: regionGuide.metricKeys ?? [],
          points: regionGuide.points.map(reframe),
        }))
      : [];
    const face3dGuides = face3dPhotoEvidence?.guides
      .filter(evidenceGuide =>
        evidenceGuide.metricKeys.some(metricKey => itemMetricKeys.has(metricKey)),
      )
      .map(evidenceGuide => ({
        kind: 'measurement' as const,
        key: evidenceGuide.key,
        label: evidenceGuide.label,
        measurementKind: evidenceGuide.kind,
        metricKeys: [...evidenceGuide.metricKeys],
        points: evidenceGuide.points.map(reframe),
      })) ?? [];
    const guides = [...face3dGuides, ...regionGuides];
    const note = normalizeRegionNote(regionNotes?.[key]);
    const derivedInsight = {
      upper: derived?.eyeBrow,
      mid: derived?.cheekboneAndEline ?? derived?.nosePhiltrumLips,
      lower: derived?.nosePhiltrumLips,
      jaw: derived?.faceShape,
    }[key];
    const insight = note.insight || derivedInsight?.label || '';
    const evidence = note.evidence || derivedInsight?.description || '';
    const descriptors = featureDescriptors ? featureDescriptors[key] : [];
    const hasNarrative = Boolean(
      insight || evidence || note.recommendation || descriptors.length,
    );
    if (measurementItems.length === 0 && !hasNarrative) {
      return [];
    }
    const featAxes = regionAxes ? regionAxes[key] : [];
    const axes = featAxes.flatMap(a =>
      a.position == null
        ? []
        : [{
            leftLabel: a.leftLabel,
            rightLabel: a.rightLabel,
            state: {kind: 'point' as const, position: a.position},
          }],
    );
    const visualAspectRatio =
      cropRect && sourceImage
        ? (cropRect.w * sourceImage.width) / (cropRect.h * sourceImage.height)
        : undefined;
    return [{
      key,
      regionChip: meta.chip,
      regionTitle: meta.title,
      photo: {
        ...photo,
        ...(cropRect ? {cropRect} : {}),
        ...(sourceImage
          ? {sourceWidth: sourceImage.width, sourceHeight: sourceImage.height}
          : {}),
      },
      ...(cropRect ? {cropRect} : {}),
      guide: guides[0] ?? meta.guide,
      ...(guides.length > 0 ? {guides} : {}),
      guideLabel: guides[0]?.label ?? meta.guideLabel,
      guideLabelX: meta.guideLabelX,
      axes,
      insight,
      evidence,
      recommendation: note.recommendation,
      paragraph: insight || evidence,
      ...(descriptors.length > 0 ? {featureDescriptors: descriptors} : {}),
      ...(measurementItems.length > 0 ? {measurementItems} : {}),
      ...(face3dPhotoEvidence && evidenceRegionKeys[key].length > 0
        ? {photoEvidence: face3dPhotoEvidence}
        : {}),
      ...(visualAspectRatio && Number.isFinite(visualAspectRatio)
        ? {visualAspectRatio}
        : {}),
    }];
  });

  if (cards.length === 0) return null;

  return {
    eyebrow: 'FEATURES',
    title: '이목구비, 하나씩 설명할게요',
    sub: '실제 랜드마크 선과 대표 프레임의 3D 메시 측정점을 측정 방식에 맞게 표시해요.',
    cards,
  };
}

export function buildCoreFeatureSection({
  photoUri,
  regionVisuals,
  geometryMetrics,
  face3d,
  face3dPhotoEvidence,
  derived,
}: {
  photoUri: string;
  regionVisuals?: RegionVisuals | null;
  geometryMetrics?: FaceGeometryMetrics | null;
  face3d?: Face3DProfile | null;
  face3dPhotoEvidence?: Face3DPhotoEvidence | null;
  derived?: FaceAnalysisDerivedResult | null;
}): S3Data | null {
  const featureProfile = buildFaceFeatureProfile({
    metrics: geometryMetrics ?? null,
    verticalThirds: null,
    faceShapeLabel: derived?.faceShape?.label ?? null,
    observations: null,
    measuredAt: '',
  });
  return buildS3(
    undefined,
    {uri: photoUri, placeholderLabel: '얼굴 확대 컷'},
    regionVisuals ?? null,
    geometryMetrics ?? null,
    buildRegionFeatureDescriptors(featureProfile),
    face3d ?? null,
    face3dPhotoEvidence ?? null,
    derived ?? null,
  );
}

function buildS6(
  impressionNotes: FaceAnalysisImpressionNotes | undefined,
  visualWeight: S6Data['visualWeight'],
): S6Data | null {
  if (!impressionNotes) {
    return null;
  }
  return {
    eyebrow: 'IMPRESSION',
    title: '모아 보면 이런 인상이에요',
    sub: '이목구비와 윤곽을 함께 보면 얼굴에서 먼저 느껴지는 분위기를 알 수 있어요.',
    axes: impressionNotes.axes ?? [],
    keywords: impressionNotes.keywords,
    visualWeight,
    paragraph: impressionNotes.paragraph,
  };
}

const STYLING_ROW_CATEGORY_LABEL_KO: Record<FaceAnalysisStylingLookRowCategory, string> = {
  base: '베이스',
  brow: '눈썹',
  eyeshadow: '아이섀도',
  eyeliner: '아이라인',
  blush: '블러셔',
  lip: '립',
};

function toLookCard(
  variant: 'natural' | 'glam',
  chip: string,
  look: FaceAnalysisStylingLooks['natural'],
): LookCardData {
  return {
    chip,
    variant,
    title: look.title,
    rows: look.rows.map(row => ({
      category: STYLING_ROW_CATEGORY_LABEL_KO[row.category],
      title: row.note,
      evidence: 'artist',
      evidenceLabel: '',
      why: row.why,
    })),
  };
}

function buildS7(stylingLooks: FaceAnalysisStylingLooks | undefined): S7Data | null {
  if (!stylingLooks) {
    return null;
  }

  return {
    eyebrow: 'STYLING',
    title: '같은 얼굴, 두 가지 방향',
    naturalCard: toLookCard('natural', '내추럴', stylingLooks.natural),
    glamCard: toLookCard('glam', '글램', stylingLooks.glam),
  };
}

const SKIN_ASPECT_HEADING_KO: Record<FaceAnalysisSkinPerceptionAspect, string> = {
  texture: '피부결',
  pores: '모공',
  sebumDryness: '유수분',
  shineDistribution: '유분 분포',
  shineType: '광 타입',
  pigmentation: '색소',
  redness: '붉은기',
  darkCircles: '다크서클',
  toneUniformity: '톤 균일감',
};

const SKIN_ASPECT_ORDER: readonly FaceAnalysisSkinPerceptionAspect[] = [
  'texture', 'pores', 'sebumDryness', 'shineDistribution', 'shineType',
  'pigmentation', 'redness', 'darkCircles', 'toneUniformity',
];

function buildS8(skinPerception: FaceAnalysisSkinPerception | undefined): S8Data | null {
  if (!skinPerception) {
    return null;
  }
  return {
    eyebrow: 'SKIN',
    title: '피부는 이렇게 보여요',
    sub: '사진에서 관찰 가능한 피부 특징을 항목별로 정리했어요.',
    aspects: SKIN_ASPECT_ORDER.map(key => ({
      key,
      heading: SKIN_ASPECT_HEADING_KO[key],
      label: skinPerception[key].label,
      description: skinPerception[key].description,
    })),
  };
}

export function buildReportDataFromFaceAnalysisReport(input: FaceReportAdapterInput): ReportData {
  const {
    report,
    bodyProfile,
    personalColor,
    verticalThirds,
    regionVisuals,
    gender,
    geometryMetrics,
    face3d,
    face3dPhotoEvidence,
  } = input;
  const heroUri = resolveHeroUri(report, input.heroImageUri);
  const featurePhoto: S1Data['photo'] = heroUri
    ? {uri: heroUri, placeholderLabel: '얼굴 확대 컷'}
    : {placeholderLabel: '얼굴 확대 컷'};

  // 1층 프로파일 + 2층 시각 무게 지도 → S6 인상 섹션 주입. 측정·사진 근거가 없으면
  // 프레젠터가 null을 돌려 섹션이 블록을 숨긴다(조용한 생성 금지).
  const displayRatio = verticalThirds?.verticalThirds?.displayRatio;
  const featureProfile = buildFaceFeatureProfile({
    metrics: geometryMetrics ?? null,
    verticalThirds: displayRatio
      ? {upper: displayRatio.upper, middle: displayRatio.middle, lower: displayRatio.lower}
      : null,
    faceShapeLabel: report.faceAnalysisV2?.derived.faceShape?.label ?? report.faceShape ?? null,
    observations: report.featureObservations ?? null,
    measuredAt: report.analyzedAt,
  });
  const weightMap = buildVisualWeightMap(featureProfile);
  const visualWeight = buildVisualWeightPresentation(weightMap);
  const regionDescriptors = buildRegionFeatureDescriptors(featureProfile);
  const styleLanes = buildStyleLaneRecommendations(featureProfile, weightMap);
  const derived = report.faceAnalysisV2?.derived ?? null;
  const s2 = buildFaceProportionSection(verticalThirds, gender, derived);
  const stylingStatus = report.contentStatus?.stylingStatus;
  const stylingSettled =
    !stylingStatus ||
    stylingStatus === 'completed' ||
    stylingStatus === 'failed' ||
    stylingStatus === 'partial';

  return {
    reportId: report.id,
    ...(!stylingSettled ? {generationStatus: 'loading' as const} : {}),
    contentRevision: report.contentRevision ?? 1,
    ...(report.contentStatus
      ? {
          contentStatus: {
            ...(report.contentStatus.coreReadyAt
              ? {coreReadyAt: report.contentStatus.coreReadyAt}
              : {}),
            ...(report.contentStatus.narrativeStatus
              ? {narrativeStatus: report.contentStatus.narrativeStatus}
              : {}),
            ...(report.contentStatus.stylingStatus
              ? {stylingStatus: report.contentStatus.stylingStatus}
              : {}),
            ...(report.contentStatus.sources
              ? {sources: report.contentStatus.sources}
              : {}),
          },
        }
      : {}),
    ...(report.goldenMask ? {goldenMask: report.goldenMask} : {}),
    topBarTitle: report.reportTitle || '맞춤 분석 보고서',
    s1: buildS1(
      report,
      heroUri,
      personalColor ?? null,
      verticalThirds ?? null,
    ),
    s2,
    s3: buildS3(
      report.regionNotes,
      featurePhoto,
      regionVisuals ?? null,
      geometryMetrics ?? null,
      regionDescriptors,
      face3d ?? null,
      face3dPhotoEvidence ?? null,
      derived,
    ),
    s4: buildPersonalColorSection(personalColor, heroUri),
    s5: buildS5(bodyProfile, gender),
    s6: buildS6(report.impressionNotes, visualWeight),
    s7: stylingSettled ? buildS7(report.stylingLooks) : null,
    s8: buildS8(report.skinPerception),
    s9: {
      eyebrow: 'STYLE',
      title: '세 가지 방향으로 스타일을 추천해요',
      sub: '같은 얼굴도 전략에 따라 달라져요 — 균형·동안·개성 강조 중 취향에 맞게 골라 보세요.',
      lanes: styleLanes,
    },
    footer: {
      disclaimer: '분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.',
      cta: '메이크업 추천 보러가기',
    },
  };
}
