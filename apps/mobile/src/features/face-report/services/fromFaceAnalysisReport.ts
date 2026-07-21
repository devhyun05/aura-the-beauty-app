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
import type {MeasuredPersonalColorView} from '../../face-analysis/services/faceAnalysisMeasurements';
import type {Face3DProfile} from '../../face-3d/types';
import type {FaceVerticalThirdsResult, VerticalThirdsDominantPart} from '../../face-ratio/types';
import type {RegionVisuals} from '../../face-geometry/services/faceGeometryCore/regionVisualsBuilder';
import {ALL_12_TYPES, TYPE_LABEL_KO} from '../../personal-color/services/personalColorCore/constants';
import {getColorFamilyReference} from '../../personal-color/services/personalColorCore/palette';
import {describeFaceLength, type FaceShapeGender} from '../reportFormat';
import {buildRegionFeatureAxes, type RegionAxesKey} from '../reportFeatureAxes';
import {buildRegionFeatureDescriptors} from '../regionFeatureDescriptors';
import {buildVisualWeightPresentation} from '../visualWeightPresentation';
import {buildFaceFeatureProfile} from '../../face-analysis/services/faceFeatureProfileBuilder';
import {buildVisualWeightMap} from '../../face-analysis/services/visualWeightMap';
import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {AxisName, PaletteItem} from '../../personal-color/services/personalColorCore/contracts';
import {analyzeBody, resolveStyleGender} from '../../ar/stencil/src/composer/bodyProfile';
import type {BodyProfile} from '../../ar/stencil/src/composer/bodyProfile';
import type {
  LookCardData,
  ReportData,
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
    // V2의 consulting.shortSummary는 AI 자유 서술이라 얼굴형과 세로 구획을
    // 모순되게 엮은 과거 결과가 있다. 사용자 요약에는 검증 가능한 카드만 두고,
    // 구버전 보고서에만 기존 설명을 유지한다.
    body: report.faceAnalysisV2 ? '' : report.shortSummary || report.summary,
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

function summarizeVerticalThirds(verticalThirds: FaceVerticalThirdsResult | null): string {
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
  title: '헤어라인이 확인되지 않았어요',
  body: '앞머리에 가려 헤어라인을 찾지 못해, 이번 보고서는 미간·코밑·턱끝 세 지점으로만 구획했어요.',
  cta: '이마가 보이게 다시 찍기 ›',
};

const S2_BAND_COPY = {
  upper: {
    pillLabel: '상안부',
    title: '상안부',
    desc: '이마 · 눈썹 · 눈 — 또렷한 눈매가 시작되는 구획이에요',
    descMissing:
      '헤어라인 미확인으로 이번 회차에는 구획하지 못했어요 — 눈썹·눈 분석은 아래 카드에서 볼 수 있어요',
  },
  mid: {pillLabel: '중안부', title: '중안부', desc: '코 · 인중 · 볼 — 완만한 곡선이 이어지는 구획이에요'},
  lower: {pillLabel: '하안부', title: '하안부', desc: '입술 · E라인 — 시선이 잠시 머무는 구획이에요'},
} as const;

// Vertical-thirds keypoints (VerticalThirdsOverlay.tsx) are pixel coordinates in
// the roll-corrected source image, matched 1:1 to sourceImage.width/height — NOT
// pre-normalized. GuidePhotoOverlay needs 0..1 fractions, so we divide by the
// real image dimensions here rather than trusting any embedded normalization.
function buildS2(
  vt: FaceVerticalThirdsResult | null | undefined,
  gender: string | null | undefined,
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
  // No real hairline: still need a plausible y to anchor the "미확인" pill inside
  // the hatched region (0..browY) — not presented as a measurement (see
  // hairlineMissing below, which swaps the line for the hatch+pill instead).
  const hairlineY = hairlineEligible && H ? H.y / imgH : browY * 0.42;

  const upperBandOk = {top: hairlineY, height: Math.max(0, browY - hairlineY)};
  const upperPillY = hairlineY + upperBandOk.height / 2;
  const midPillY = browY + (noseBaseY - browY) / 2;
  const lowerPillY = noseBaseY + (chinY - noseBaseY) / 2;

  return {
    eyebrow: 'PROPORTION',
    title: '얼굴의 구획부터 볼게요',
    sub: '세로 구획을 보면 얼굴에서 어느 부위가 상대적으로 강조되는지 알 수 있어요.',
    photo: {uri: sourceImage.uri, placeholderLabel: '얼굴 전체 정면 컷'},
    photoAspectRatio: sourceImage.width / sourceImage.height,
    hairlineMissing: !hairlineEligible,
    hairlineY,
    browY,
    noseBaseY,
    chinY,
    lineLabels: {hairline: '헤어라인', brow: '미간', noseBase: '코밑', chin: '턱끝'},
    hairlineMissingPill: '헤어라인 미확인',
    hairlineHatchHeight: browY,
    upperBandOk,
    bands: [
      {
        key: 'upper',
        top: 0,
        height: browY,
        pillLabel: S2_BAND_COPY.upper.pillLabel,
        pillY: upperPillY,
        pillCentered: true,
        title: S2_BAND_COPY.upper.title,
        desc: S2_BAND_COPY.upper.desc,
        descMissing: S2_BAND_COPY.upper.descMissing,
      },
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
    ],
    missingNotice: S2_HAIRLINE_MISSING_NOTICE,
    viewCardLabel: '카드 보기 ›',
    ratioNumbers:
      vt.verticalThirds && !lowConfidence
        ? {
            upper: vt.verticalThirds.displayRatio.upper,
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
      caption: '12타입 중 어디에 가까운지 보여주는 상대 위치예요.',
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
    caption: '12타입 prototype과의 가까움이에요. 굵은 영역이 현재 결과가 걸쳐 있는 톤 범위예요.',
    area: {
      x: clamp01(minX - pad),
      y: clamp01(minY - pad),
      w: Math.min(1, maxX - minX + pad * 2),
      h: Math.min(1, maxY - minY + pad * 2),
    },
    points,
  };
}

function buildS4(personalColor: MeasuredPersonalColorView | null | undefined, heroUri: string | undefined): S4Data | null {
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
    title: '이마 · 눈썹 · 눈',
    guide: {kind: 'none'},
    guideLabel: '',
    guideLabelX: 0.14,
  },
  mid: {
    chip: '중안부',
    title: '코 · 인중 · 볼',
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
    title: '광대 · 턱',
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

function buildS3(
  regionNotes: FaceAnalysisRegionNotes | undefined,
  photo: S1Data['photo'],
  regionVisuals: RegionVisuals | null,
  geometryMetrics: FaceGeometryMetrics | null,
  featureDescriptors: Record<RegionAxesKey, string[]> | null,
): S3Data | null {
  if (!regionNotes) {
    return null;
  }

  // 자기참조 축(위치=실측 결정론적). 지표 없으면 null → 각 축 판정 보류/미표시.
  const regionAxes = geometryMetrics ? buildRegionFeatureAxes(geometryMetrics) : null;

  const cards = (['upper', 'mid', 'lower', 'jaw'] as const).map(key => {
    const meta = S3_REGION_META[key];
    // Real per-user crop + landmark polyline, when available (regionVisuals
    // is only produced by an on-device geometry pass — legacy reports and
    // degenerate crops never have it). Falls back to the fixed illustrative
    // S3_REGION_META guide + full (uncropped) photo — same "조용한 생성 금지"
    // posture as the rest of this adapter.
    const rvRaw = regionVisuals?.[key];
    // Guard against a degenerate persisted cropRect (w/h === 0, e.g. from a
    // decoder default on missing/non-numeric crop fields): dividing by a
    // zero width/height below would produce Infinity/NaN polyline points and
    // a broken <Polyline> render. Treat it exactly like "no regionVisuals for
    // this key" and fall back to the fixed guide + full photo.
    const rv = rvRaw && rvRaw.cropRect.w > 0 && rvRaw.cropRect.h > 0 ? rvRaw : undefined;
    const visual = rv
      ? {
          photo: {...photo, cropRect: rv.cropRect},
          cropRect: rv.cropRect,
          // Guide points are normalized to the FULL source image; the card
          // shows only the crop sub-rect, so re-normalize each point into the
          // crop's own 0..1 frame before GuideOverlay multiplies by its
          // measured render size.
          guide: {
            kind: 'polyline' as const,
            points: rv.guide.points.map(p => ({
              x: (p.x - rv.cropRect.x) / rv.cropRect.w,
              y: (p.y - rv.cropRect.y) / rv.cropRect.h,
            })),
          },
          guideLabel: rv.guide.label,
        }
      : {
          photo,
          guide: meta.guide,
          guideLabel: meta.guideLabel,
        };
    return {
      key,
      regionChip: meta.chip,
      regionTitle: meta.title,
      ...visual,
      guideLabelX: meta.guideLabelX,
      ...(() => {
        const featAxes = regionAxes ? regionAxes[key] : [];
        // 측정된 축만 렌더(위치=실측). 지표 없는 축은 조용히 생략 — 허위 강도 대신 침묵.
        const axes = featAxes.flatMap(a =>
          a.position == null
            ? []
            : [{leftLabel: a.leftLabel, rightLabel: a.rightLabel, state: {kind: 'point' as const, position: a.position}}],
        );
        const note = normalizeRegionNote(regionNotes[key]);
        const descriptors = featureDescriptors ? featureDescriptors[key] : [];
        return {
          axes,
          insight: note.insight,
          evidence: note.evidence,
          recommendation: note.recommendation,
          paragraph: note.insight,
          ...(descriptors.length > 0 ? {featureDescriptors: descriptors} : {}),
        };
      })(),
    };
  });

  return {
    eyebrow: 'FEATURES',
    title: '이목구비, 하나씩 설명할게요',
    sub: '눈매·눈썹·입술·턱선의 방향을 보면 전체 인상과 어울리는 메이크업 균형을 알 수 있어요.',
    cards,
  };
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
    sub: '사진에서 관찰 가능한 피부 부면을 항목별로 정리했어요.',
    aspects: SKIN_ASPECT_ORDER.map(key => ({
      key,
      heading: SKIN_ASPECT_HEADING_KO[key],
      label: skinPerception[key].label,
      description: skinPerception[key].description,
    })),
  };
}

export function buildReportDataFromFaceAnalysisReport(input: FaceReportAdapterInput): ReportData {
  const {report, bodyProfile, personalColor, verticalThirds, regionVisuals, gender, geometryMetrics} = input;
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
  const visualWeight = buildVisualWeightPresentation(buildVisualWeightMap(featureProfile));
  const regionDescriptors = buildRegionFeatureDescriptors(featureProfile);

  return {
    topBarTitle: report.reportTitle || '맞춤 분석 보고서',
    s1: buildS1(
      report,
      heroUri,
      personalColor ?? null,
      verticalThirds ?? null,
    ),
    s2: buildS2(verticalThirds, gender),
    s3: buildS3(report.regionNotes, featurePhoto, regionVisuals ?? null, geometryMetrics ?? null, regionDescriptors),
    s4: buildS4(personalColor, heroUri),
    s5: buildS5(bodyProfile, gender),
    s6: buildS6(report.impressionNotes, visualWeight),
    s7: buildS7(report.stylingLooks),
    s8: buildS8(report.skinPerception),
    footer: {
      disclaimer: '분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.',
      cta: '메이크업 추천 보러가기',
    },
  };
}
