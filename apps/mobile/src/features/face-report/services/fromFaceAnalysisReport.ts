// Adapter: real FaceAnalysisReport + on-device measurements → the numeric-free
// ReportData the S1–S7 UI (ported from the report redesign design bundle)
// consumes. S1/S2/S4/S5 are built from deterministic on-device
// measurements/survey answers. S3/S6/S7 are built from `regionNotes` /
// `impressionNotes` / `stylingLooks` — text the backend's existing Bedrock
// analysis call now also generates alongside faceShape/recommendedMood/etc
// (services/backend/app/services/openai_analysis.py) — combined with a FIXED,
// non-personalized diagram template for the parts that would otherwise need
// per-user pixel coordinates we don't have (region photo-guide markers, gaze
// diagram geometry). The template is the same for every report, same
// rationale as S5's generic silhouette illustration; only the wording is
// per-user. Reports created before this field existed simply won't have
// regionNotes/impressionNotes/stylingLooks, so those sections stay hidden for
// them (never fabricated, but never withheld once the backend can generate
// them either) — see reportTypes.ts's ReportData doc comment.

import type {
  FaceAnalysisImpressionNotes,
  FaceAnalysisReport,
  FaceAnalysisRegionNotes,
  FaceAnalysisStylingLookRowCategory,
  FaceAnalysisStylingLooks,
} from '../../../shared/types/faceAnalysis';
import {getFaceAnalysisReportSummaryItems} from '../../face-analysis/services/faceAnalysisReportDetailModel';
import type {MeasuredPersonalColorView} from '../../face-analysis/services/faceAnalysisMeasurements';
import type {FaceVerticalThirdsResult} from '../../face-ratio/types';
import {TYPE_LABEL_KO} from '../../personal-color/services/personalColorCore/constants';
import type {AxisName, ColorFamily, PaletteItem} from '../../personal-color/services/personalColorCore/contracts';
import {analyzeBody} from '../../ar/stencil/src/composer/bodyProfile';
import type {BodyProfile} from '../../ar/stencil/src/composer/bodyProfile';
import {color} from '../reportTokens';
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
  SpectrumAxisData,
  SwatchData,
} from '../reportTypes';

export type FaceReportAdapterInput = {
  report: FaceAnalysisReport;
  heroImageUri?: string;
  verticalThirds?: FaceVerticalThirdsResult | null;
  personalColor?: MeasuredPersonalColorView | null;
  bodyProfile?: BodyProfile | null;
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

function formatDateLine(analyzedAt: string): string {
  const date = new Date(analyzedAt);
  if (Number.isNaN(date.getTime())) {
    return '분석 결과';
  }
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 분석 결과`;
}

function buildS1(
  report: FaceAnalysisReport,
  heroUri: string | undefined,
  personalColor: MeasuredPersonalColorView | null,
): S1Data {
  return {
    photo: heroUri ? {uri: heroUri, placeholderLabel: '분석 셀피'} : {placeholderLabel: '분석 셀피'},
    dateLine: formatDateLine(report.analyzedAt),
    headline: report.recommendedMood,
    body: report.shortSummary || report.summary,
    legacyReport: !report.measurements,
    legacyBadge: '이 판정은 이전 기준으로 측정된 결과예요',
    cards: getFaceAnalysisReportSummaryItems(report, personalColor),
  };
}

// Mirrors FaceAnalysisReportDetailScreen.tsx's VERTICAL_THIRDS_BLOCKED_MESSAGES
// copy (kept local — this adapter must not import from a screen component).
const S2_HAIRLINE_MISSING_NOTICE = {
  title: '헤어라인이 확인되지 않았어요',
  body: '앞머리에 가려 이마선을 찾지 못해, 이번 보고서는 미간·코밑·턱끝 세 지점으로만 구획했어요.',
  cta: '이마가 보이게 다시 찍기 ›',
};

const S2_BAND_COPY = {
  upper: {
    pillLabel: '상안부',
    title: '상안부',
    desc: '이마 · 눈썹 · 눈 — 또렷한 눈매가 시작되는 구획이에요',
    descMissing:
      '이마선 미확인으로 이번 회차에는 구획하지 못했어요 — 눈썹·눈 분석은 아래 카드에서 볼 수 있어요',
  },
  mid: {pillLabel: '중안부', title: '중안부', desc: '코 · 인중 · 볼 — 완만한 곡선이 이어지는 구획이에요'},
  lower: {pillLabel: '하안부', title: '하안부', desc: '입술 · E라인 — 시선이 잠시 머무는 구획이에요'},
} as const;

// Vertical-thirds keypoints (VerticalThirdsOverlay.tsx) are pixel coordinates in
// the roll-corrected source image, matched 1:1 to sourceImage.width/height — NOT
// pre-normalized. GuidePhotoOverlay needs 0..1 fractions, so we divide by the
// real image dimensions here rather than trusting any embedded normalization.
function buildS2(vt: FaceVerticalThirdsResult | null | undefined): S2Data | null {
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
    sub: '사진 위 가늠선은 실제 측정 위치를 그대로 옮긴 거예요.',
    photo: {uri: sourceImage.uri, placeholderLabel: '얼굴 전체 정면 컷'},
    photoAspectRatio: sourceImage.width / sourceImage.height,
    hairlineMissing: !hairlineEligible,
    hairlineY,
    browY,
    noseBaseY,
    chinY,
    lineLabels: {hairline: '이마선', brow: '미간', noseBase: '코밑', chin: '턱끝'},
    hairlineMissingPill: '이마선 미확인',
    hairlineHatchHeight: browY,
    upperBandOk,
    bands: [
      {
        key: 'upper',
        top: 0,
        height: browY,
        pillLabel: S2_BAND_COPY.upper.pillLabel,
        pillY: upperPillY,
        pillCentered: false,
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
    ratioNumbers: vt.verticalThirds
      ? {
          upper: vt.verticalThirds.displayRatio.upper,
          middle: vt.verticalThirds.displayRatio.middle,
          lower: vt.verticalThirds.displayRatio.lower,
        }
      : undefined,
    // 길이비 판정 스냅샷이 있을 때만 밴드 섹션을 채운다 — 판정 자체가 없는
    // 보고서에 "얼굴 길이비 · 판정 보류"가 상시 노출되는 소음을 막는다.
    faceLength: vt.faceLengthJudgment
      ? {
          ratio: vt.faceLength?.ratio ?? null,
          band: vt.faceLengthJudgment.band ?? null,
          verdict: vt.faceLengthJudgment.verdict ?? null,
          confidence: vt.verticalThirds?.confidence ?? null,
        }
      : undefined,
    paragraph: vt.interpretation.summary || vt.interpretation.title || '측정 결과를 요약하지 못했어요.',
  };
}

const AXIS_META: Record<AxisName, {axisLabel: string; leftLabel: string; rightLabel: string}> = {
  // left/right follow the same low→high direction already shown in the
  // shipped PersonalColorTypeCard (AXIS_LABELS) — not re-invented here.
  temperature: {axisLabel: '온도', leftLabel: '차가운 톤', rightLabel: '따뜻한 톤'},
  value: {axisLabel: '명도', leftLabel: '밝은 편', rightLabel: '어두운 편'},
  chroma: {axisLabel: '채도', leftLabel: '은은한 채도', rightLabel: '선명한 채도'},
  clarity: {axisLabel: '청탁', leftLabel: '부드럽게 섞인', rightLabel: '맑게 트인'},
  contrast: {axisLabel: '대비', leftLabel: '저대비', rightLabel: '고대비'},
};
const AXIS_ORDER: AxisName[] = ['temperature', 'value', 'chroma', 'clarity', 'contrast'];

function normalizeAxisPosition(value: number | null): number {
  if (value === null) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, (value + 1) / 2));
}

// Deterministic categorical→hex swatch for a color family. NOT a per-user
// color-matched value — palette.ts only carries undertone/valueBand/chromaBand
// labels, no measured hex, so any swatch chip is necessarily a fixed reference
// color for that category (same kind of static lookup as SILHOUETTE_STYLES).
const UNDERTONE_HUE: Record<ColorFamily['undertone'], number> = {warm: 32, neutral: 350, cool: 220};
const VALUE_LIGHTNESS: Record<ColorFamily['valueBand'], number> = {light: 74, mid: 56, deep: 36};
const CHROMA_SATURATION: Record<ColorFamily['chromaBand'], number> = {soft: 28, clear: 48, vivid: 68};

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r0, g0, b0] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r0)}${toHex(g0)}${toHex(b0)}`;
}

function colorFamilySwatchHex(family: ColorFamily): string {
  return hslToHex(UNDERTONE_HUE[family.undertone], CHROMA_SATURATION[family.chromaBand], VALUE_LIGHTNESS[family.valueBand]);
}

function toSwatch(item: PaletteItem): SwatchData {
  return {name: item.family.labelKo, color: colorFamilySwatchHex(item.family)};
}

function buildS4(personalColor: MeasuredPersonalColorView | null | undefined, heroUri: string | undefined): S4Data | null {
  if (!personalColor || personalColor.status === 'insufficient' || !personalColor.tone) {
    return null;
  }
  const {tone, axes, palette} = personalColor;

  const axesData: SpectrumAxisData[] = AXIS_ORDER.map(name => {
    const axis = axes[name];
    const meta = AXIS_META[name];
    return {
      leftLabel: meta.leftLabel,
      rightLabel: meta.rightLabel,
      axisLabel: meta.axisLabel,
      state: axis.value === null ? {kind: 'withheld'} : {kind: 'point', position: normalizeAxisPosition(axis.value)},
    };
  });

  const goodSwatches = palette.best.map(toSwatch);
  const badSwatches = palette.worst.map(toSwatch);
  const initialSwatch = goodSwatches[0]
    ? {...goodSwatches[0], good: true}
    : {name: '기준 색', color: '#C9C2B8', good: true};

  return {
    eyebrow: 'PERSONAL COLOR',
    title: '색은 이렇게 어울려요',
    season: {
      headline: tone.secondary
        ? `${TYPE_LABEL_KO[tone.top]} 중심, ${TYPE_LABEL_KO[tone.secondary]}에 걸쳐요`
        : `${TYPE_LABEL_KO[tone.top]} 중심이에요`,
      blend: {
        dominantLabel: TYPE_LABEL_KO[tone.top],
        secondaryLabel: tone.secondary ? TYPE_LABEL_KO[tone.secondary] : '단일 톤',
        dominantRatio: Math.min(1, Math.max(0, tone.typeScore)),
      },
    },
    seasonConfidence: {
      topLabel: TYPE_LABEL_KO[tone.top],
      secondaryLabel: tone.secondary ? TYPE_LABEL_KO[tone.secondary] : null,
      typeScore: Math.min(1, Math.max(0, tone.typeScore)),
    },
    axes: axesData,
    drape: {
      title: '어울리는 색, 나란히 대보기',
      sub: '잘 어울리는 색과 피할 색을 얼굴 옆에 나란히 대보면 차이가 바로 보여요 · 슬라이더로 조명도 바꿔 보세요',
      photo: heroUri ? {uri: heroUri, placeholderLabel: '셀피'} : {placeholderLabel: '셀피'},
      goodTag: '잘 어울리는 색',
      badTag: '피할 색',
      goodCaption: '얼굴 주변이 정돈되고 피부 결이 고르게 살아나요',
      badCaption: '색이 얼굴보다 먼저 읽혀서 인상이 살짝 가라앉아 보여요',
      dial: {
        heading: '조명',
        warm: '웜',
        cool: '쿨',
        warmCaption: '따뜻한 조명 — 웜하게 보여요',
        neutralCaption: '기준 조명 (진단 기준)',
        coolCaption: '차가운 조명 — 쿨하게 보여요',
      },
      goodTitle: '잘 어울리는 색',
      badTitle: '피하면 좋은 색',
      goodSwatches,
      badSwatches,
      initialSwatch,
      disclaimer: '이 결과는 촬영 조명 기준의 상대 진단이에요. 조명이 크게 다르면 결과가 달라질 수 있어요.',
    },
  };
}

function buildS5(bodyProfile: BodyProfile | null | undefined): S5Data {
  const base = {
    eyebrow: 'BODY TYPE',
    title: '체형은 설문으로 봤어요',
    silhouettePlaceholder: '실루엣\n일러스트',
    silhouetteLabel: '실루엣 타입',
    skeletonLabel: '골격 타입',
  };

  if (!bodyProfile) {
    return {
      ...base,
      silhouetteValue: '아직 답변하지 않았어요',
      skeletonValue: '아직 답변하지 않았어요',
      surveyNote: '체감 설문 7문항에 답하면 바로 볼 수 있어요 · ',
      surveyLink: '설문 시작하기',
      doTitle: '설문에 답하면 스타일링 가이드를 볼 수 있어요',
      doItems: [],
      avoidTitle: '',
      avoidItems: [],
    };
  }

  const analyzed = analyzeBody(bodyProfile);
  return {
    ...base,
    silhouetteValue: analyzed.silhouetteStyle.label,
    skeletonValue: analyzed.frameStyle.label,
    surveyNote: '체감 설문 기반 · ',
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
    guide: {kind: 'ellipse', cx: 0.5, cy: 0.42, rx: 0.22, ry: 0.1, dashed: true},
    guideLabel: '눈가',
    guideLabelX: 0.14,
  },
  mid: {
    chip: '중안부',
    title: '코 · 인중 · 볼',
    guide: {kind: 'dashedVertical', x: 0.5, top: 0.2, height: 0.5},
    guideLabel: '콧대 중심선',
    guideLabelX: 0.5,
  },
  lower: {
    chip: '하안부',
    title: '입술',
    guide: {kind: 'ellipse', cx: 0.5, cy: 0.6, rx: 0.2, ry: 0.07, dashed: false},
    guideLabel: '입술 라인',
    guideLabelX: 0.28,
  },
  jaw: {
    chip: '외곽 라인',
    title: '광대 · 턱',
    guide: {kind: 'ellipse', cx: 0.5, cy: 0.85, rx: 0.3, ry: 0.5, dashed: true},
    guideLabel: '턱 곡선 가이드',
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

function buildS3(regionNotes: FaceAnalysisRegionNotes | undefined, photo: S1Data['photo']): S3Data | null {
  if (!regionNotes) {
    return null;
  }

  const cards = (['upper', 'mid', 'lower', 'jaw'] as const).map(key => {
    const meta = S3_REGION_META[key];
    return {
      key,
      regionChip: meta.chip,
      regionTitle: meta.title,
      photo,
      guide: meta.guide,
      guideLabel: meta.guideLabel,
      guideLabelX: meta.guideLabelX,
      axes: [],
      ...(() => {
        const note = normalizeRegionNote(regionNotes[key]);
        return {
          insight: note.insight,
          evidence: note.evidence,
          recommendation: note.recommendation,
          paragraph: note.insight, // 폴백/구컨슈머 호환
        };
      })(),
    };
  });

  return {
    eyebrow: 'FEATURES',
    title: '이목구비, 하나씩 설명할게요',
    sub: 'AI가 실측 지표를 근거로 부위별 인상을 풀어 설명해요.',
    cards,
  };
}

// Same 2-point gaze-order diagram geometry for every report (generic
// illustration — real per-user gaze data doesn't exist). The wording (items,
// keywords, paragraph) is real AI-generated content from impressionNotes.
function buildS6(
  regionNotes: FaceAnalysisRegionNotes | undefined,
  impressionNotes: FaceAnalysisImpressionNotes | undefined,
): S6Data | null {
  if (!regionNotes || !impressionNotes) {
    return null;
  }

  return {
    eyebrow: 'IMPRESSION',
    title: '모아 보면 이런 인상이에요',
    diagramTitle: '시선이 머무는 순서',
    playLabel: '순서 재생',
    playingLabel: '재생 중…',
    rings: [
      {
        left: 0.16,
        right: 0.16,
        top: 0.27,
        height: 0.19,
        dashed: true,
        color: color.magenta,
        restFill: 'rgba(255,11,131,0.09)',
        activeFill: 'rgba(255,11,131,0.3)',
      },
      {
        left: 0.28,
        right: 0.28,
        top: 0.66,
        height: 0.15,
        dashed: false,
        color: color.accentLight,
        restFill: 'rgba(110,203,232,0.14)',
        activeFill: 'rgba(110,203,232,0.4)',
      },
    ],
    markers: [
      {n: 1, right: 0.02, top: 0.22, color: color.magenta},
      {n: 2, right: 0.12, top: 0.63, color: color.accent},
    ],
    faceGuides: [0.36, 0.64],
    items: [
      {n: 1, color: color.magenta, text: `눈가 — ${normalizeRegionNote(regionNotes.upper).insight}`},
      {n: 2, color: color.accent, text: `입가 — ${normalizeRegionNote(regionNotes.lower).insight}`},
    ],
    stepMs: [950, 1150],
    keywords: impressionNotes.keywords,
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
    sub: look.description,
    rows: look.rows.map(row => ({
      category: STYLING_ROW_CATEGORY_LABEL_KO[row.category],
      title: row.note,
      // AI가 실측 컨텍스트를 참고해 생성한 제안이지 특정 축의 값을 그대로
      // 옮긴 것이 아니므로 'measured'가 아니라 'artist'로 정직하게 표기한다.
      evidence: 'artist',
      evidenceLabel: 'AI 제안',
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
    noteParts: [{text: '두 룩 모두 같은 분석 결과를 강도만 다르게 풀어낸 AI 제안이에요.'}],
    naturalLabel: '내추럴',
    glamLabel: '글램',
    mixZones: {
      nearNatural: '지금 보기 — 내추럴에 가까움',
      middle: '지금 보기 — 두 무드의 중간',
      nearGlam: '지금 보기 — 글램에 가까움',
    },
    lookSummary: {
      natural: {title: stylingLooks.natural.title, desc: stylingLooks.natural.description},
      glam: {title: stylingLooks.glam.title, desc: stylingLooks.glam.description},
    },
    naturalCard: toLookCard('natural', '내추럴', stylingLooks.natural),
    glamCard: toLookCard('glam', '글램', stylingLooks.glam),
  };
}

export function buildReportDataFromFaceAnalysisReport(input: FaceReportAdapterInput): ReportData {
  const {report, bodyProfile, personalColor, verticalThirds} = input;
  const heroUri = resolveHeroUri(report, input.heroImageUri);
  const featurePhoto: S1Data['photo'] = heroUri
    ? {uri: heroUri, placeholderLabel: '얼굴 확대 컷'}
    : {placeholderLabel: '얼굴 확대 컷'};

  return {
    topBarTitle: report.reportTitle || '맞춤 분석 보고서',
    s1: buildS1(report, heroUri, personalColor ?? null),
    s2: buildS2(verticalThirds),
    s3: buildS3(report.regionNotes, featurePhoto),
    s4: buildS4(personalColor, heroUri),
    s5: buildS5(bodyProfile),
    s6: buildS6(report.regionNotes, report.impressionNotes),
    s7: buildS7(report.stylingLooks),
    footer: {
      disclaimer: '분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.',
      cta: '메이크업 추천 보러가기',
    },
  };
}
