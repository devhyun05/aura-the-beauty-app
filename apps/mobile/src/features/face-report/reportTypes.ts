// reportTypes.ts — typed props/DTO model for the face-analysis report.
// 원칙(2026-07-18 완화): 원측정(mm)·모집단 백분위·confidence %는 계속 비노출.
// 세로 3분할의 정규화 비율은 노출 허용, 얼굴형은 성별 참고선 기준 방향 카테고리로만
// (가짜 '평균 밴드'는 폐기 — 2026-07-18 정직화).
import type {FaceShapeView} from './reportFormat';
import type {Silhouette, StyleGender} from '../ar/stencil/src/composer/bodyProfile';
import type {PersonalColor12Type} from '../personal-color/services/personalColorCore/contracts';
import type {VisualWeightPresentation} from './visualWeightPresentation';
export type {VisualWeightPresentation} from './visualWeightPresentation';
import type {StyleLaneCard} from './styleLaneRecommendations';
import type {GoldenMaskReportDescriptor} from '../../shared/contracts/goldenMask';
export type {StyleLaneCard, StyleLaneMove, StyleLaneKey} from './styleLaneRecommendations';

export interface PhotoSlotData {
  uri?: string;
  placeholderLabel: string;
  // S3 region cards: normalized (0..1) sub-rect of the full photo to crop the
  // display to. Absent for the legacy fixed-guide fallback (full photo).
  cropRect?: { x: number; y: number; w: number; h: number };
}

export type EvidenceKind = 'measured' | 'artist';

export type RailState =
  | { kind: 'point'; position: number }              // 0..1
  | { kind: 'band'; start: number; width: number }   // 0..1
  | { kind: 'withheld' };

export interface SpectrumAxisData {
  leftLabel: string;
  rightLabel: string;
  axisLabel?: string;   // centered label (S4: 온도/명도/채도/청탁/대비)
  state: RailState;
  statusChip?: string;  // '경계 유보' | '판정 보류'
  caption?: string;
}

export interface WhatIfZone { upTo: number; text: string } // applies while position < upTo
export interface WhatIfConfig {
  zones: WhatIfZone[];  // ordered ascending; last upTo should be 1
  idleCaption: string;
  prefix: string;       // '만약 여기라면'
  resetLabel: string;   // '원래대로'
  min?: number;         // clamp, default 0.04
  max?: number;         // clamp, default 0.96
}

export interface BlendData {
  label?: string;
  dominantLabel: string;
  secondaryLabel: string;
  dominantRatio: number; // 0..1
  caption?: string;
}

// ---------- S1 ----------
export interface S1Data {
  photo: PhotoSlotData;
  dateLine: string;
  headline: string;
  body: string;
  legacyReport: boolean;
  legacyBadge: string;
  cards: { label: string; value: string }[];
}

// ---------- S2 ----------
export type BandKey = 'upper' | 'mid' | 'lower';
export interface S2BandData {
  key: BandKey;
  top: number; height: number;        // normalized band rect (hairline-missing geometry for upper)
  pillLabel: string; pillY: number;   // right-side cyan pill
  pillCentered: boolean;              // translateY(-50%) in the HTML
  restingTint?: boolean;              // mid band shows a resting tint
  title: string; desc: string;        // region-lens copy
  descMissing?: string;               // upper variant when hairline is missing
}
export interface S2Data {
  eyebrow: string; title: string; sub: string;
  photo: PhotoSlotData;
  // Real photo width/height ratio. GuidePhotoOverlay's guide lines are normalized
  // fractions of the ORIGINAL image; without this the fixed-4:5 frame's cover-crop
  // shifts them off the real hairline/brow/nose/chin position for non-4:5 photos.
  // Defaults to 4/5 (the demo fixture's assumed ratio) when omitted.
  photoAspectRatio?: number;
  hairlineMissing: boolean;
  hairlineY: number; browY: number; noseBaseY: number; chinY: number;
  lineLabels: { hairline: string; brow: string; noseBase: string; chin: string };
  hairlineMissingPill: string;
  hairlineHatchHeight: number;               // 0.38
  upperBandOk: { top: number; height: number };
  bands: S2BandData[];
  missingNotice: { title: string; body: string; cta: string };
  viewCardLabel: string;
  // 세로 3분할 정규화 비율(중안부=1.0 기준). 상안부는 헤어라인 미확인 시 null.
  ratioNumbers?: { upper: number | null; middle: number; lower: number };
  // 얼굴형 — 성별 문헌 참고선 기준 방향 카테고리(가로/균형/세로). '평균 밴드' 폐기.
  faceShape?: FaceShapeView | null;
  paragraph: string;
}

// ---------- S3 ----------
export type FeatureGuide =
  | { kind: 'none' }
  | { kind: 'slantLine'; from: { x: number; y: number }; length: number; angleDeg: number; marker: { x: number; y: number } }
  | { kind: 'dashedVertical'; x: number; top: number; height: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; dashed: boolean }
  // Real landmark polyline (restored regionVisuals), re-normalized to the
  // crop frame by buildS3 — points are already 0..1 in the CROPPED view, not
  // the full original image.
  | { kind: 'polyline'; points: { x: number; y: number }[] };

export interface RegionCardData {
  key: string;
  regionChip: string;
  regionTitle: string;
  photo: PhotoSlotData;
  // Same crop sub-rect as photo.cropRect (kept alongside photo for callers
  // that need the rect without unpacking photo). Absent = legacy fallback.
  cropRect?: { x: number; y: number; w: number; h: number };
  guide: FeatureGuide;
  guideLabel: string;
  guideLabelX: number;                  // normalized offset of the label pill
  guideLabelAlign?: 'left' | 'right';
  blend?: BlendData;                    // jaw card: rendered before the axes
  axes: SpectrumAxisData[];
  whatIf?: { axisIndex: number; config: WhatIfConfig };
  // 부위 근거·인사이트·조언(P2). 값이 없으면 컴포넌트가 paragraph로 폴백.
  insight?: string;
  evidence?: string;
  recommendation?: string;
  paragraph: string;
  // 1층 사진 판정(VLM) 상세 구절(쌍꺼풀 유형·안검 처짐·애교살 등). 판정된 것만.
  // 비어 있으면 컴포넌트가 상세 칩 블록을 숨긴다.
  featureDescriptors?: string[];
}
export interface S3Data { eyebrow: string; title: string; sub: string; cards: RegionCardData[] }

// ---------- S4 ----------
export interface SwatchData {
  name: string;
  color: string;
  familyLabel?: string;
  examples?: string[];
  note?: string;
  reasons?: string[];
}
export interface ToneProbabilityData {
  type: PersonalColor12Type;
  label: string;
  ratio: number;
}
export interface ToneMapPoint {
  type: PersonalColor12Type;
  label: string;
  x: number;
  y: number;
  weight: number;
  active: boolean;
}
export interface ToneMapArea {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface S4Data {
  eyebrow: string; title: string; sub: string;
  season: { headline: string };
  // 봄 라이트 확신도 게이지용(typeScore 0..1).
  seasonConfidence?: { topLabel: string; secondaryLabel: string | null; typeScore: number };
  toneProbabilities: ToneProbabilityData[];
  toneMap: {
    caption: string;
    area: ToneMapArea;
    points: ToneMapPoint[];
  };
  axes: SpectrumAxisData[];
  drape: {
    title: string; sub: string;
    photo: PhotoSlotData;
    goodTag: string; badTag: string;
    goodCaption: string; badCaption: string;
    goodTitle: string; badTitle: string;
    goodSwatches: SwatchData[]; badSwatches: SwatchData[];
    initialSwatch: SwatchData & { good: boolean };
    disclaimer: string;
  };
}

// ---------- S5 ----------
export interface S5Data {
  eyebrow: string; title: string; sub: string;
  silhouettePlaceholder: string;   // multi-line placeholder label (설문 전 빈 상태에서만 사용)
  // 실루엣 타입 다이어그램용. 설문 답변이 있을 때만 채워진다(미답변이면 undefined →
  // S5Body가 기존 빗금 플레이스홀더를 유지). styleGender는 다이어그램 외형 분기용.
  silhouetteKind?: Silhouette;
  styleGender?: StyleGender;
  silhouetteLabel: string; silhouetteValue: string;
  skeletonLabel: string; skeletonValue: string;
  surveyNote: string; surveyLink: string;
  doTitle: string; doItems: string[];
  avoidTitle: string; avoidItems: string[];
}

// ---------- S6 ----------
export interface ImpressionAxis { key: string; leftLabel: string; rightLabel: string; value: number }
// 2층 시각 무게 지도의 프레젠테이션 타입은 순수 파일(visualWeightPresentation)에
// 정의하고 상단에서 재수출한다 — 소비처가 reportTypes만 보게 하면서, reportTypes의
// RN(React) 전이 의존이 계약 러너로 새지 않게 한다.
export interface S6Data {
  eyebrow: string; title: string; sub: string;
  axes: ImpressionAxis[];   // AI가 반환한 축만 사용. 없으면 빈 배열.
  keywords: string[];
  paragraph: string;
  // 시각 무게 지도(2층). 근거 부족이면 null → 컴포넌트가 블록 숨김.
  visualWeight?: VisualWeightPresentation | null;
}

// ---------- S7 ----------
export interface LookRowData { category: string; title: string; evidence: EvidenceKind; evidenceLabel: string; why: string }
export interface LookCardData { chip: string; variant: 'natural' | 'glam'; title: string; rows: LookRowData[] }
export interface NotePart { text: string; color?: string; bold?: boolean }
export interface S7Data {
  eyebrow: string; title: string;
  naturalCard: LookCardData;
  glamCard: LookCardData;
}

// ---------- S8 (구조화 피부 9부면) ----------
export interface SkinAspectData { label: string; description: string }
export interface S8Data {
  eyebrow: string; title: string; sub: string;
  aspects: { key: string; heading: string; label: string; description: string }[];
}

// ---------- S9 (3 스타일 레인 추천) ----------
export interface S9Data {
  eyebrow: string; title: string; sub: string;
  lanes: StyleLaneCard[];   // 균형·동안·개성강조 3장. 항상 3장.
}

// ---------- screen ----------
// Completed reports guarantee s1 and s5 (which has its own internal "설문 전"
// empty state). The transient minimum report intentionally supplies only s1
// while the remaining sections are generated. s2/s4 depend on on-device measurements that can
// fail or come back "insufficient" for a given photo — rendering them from a
// failed measurement would mean fabricating guide-line pixel positions or
// color axes that were never actually measured. s3/s6/s7's real data sources
// (region bbox storage, AI perception parsing, natural/glam split generation)
// aren't wired on the backend at all yet (see
// docs/superpowers/plans/2026-07-16-face-report-redesign-plan.md §1). In every
// null case the scaffold hides the section rather than guessing — same
// "조용한 실패 금지, 조용한 생성 금지" posture as the rest of the report.
export interface ReportData {
  reportId: string;
  goldenMask?: GoldenMaskReportDescriptor;
  generationStatus?: 'loading' | 'failed';
  generationError?: string;
  initialPageId?: string;
  topBarTitle: string;
  s1: S1Data; s2: S2Data | null; s3: S3Data | null; s4: S4Data | null; s5: S5Data | null;
  s6: S6Data | null; s7: S7Data | null; s8: S8Data | null;
  s9: S9Data | null;
  footer: { disclaimer: string; cta: string };
}

export interface ReportScreenProps {
  data: ReportData;
  entryAnimation?: boolean; // rise-in on scroll into view (default true)
  onBack?: () => void;
  onMore?: () => void;
  onRetake?: () => void;    // S2 재촬영 링크 (헤어라인 미확인 안내)
  onResurvey?: () => void;  // S5 다시 답하기
  // Footer CTA. Separate from onRetake: the CTA is labelled with
  // `data.footer.cta` (메이크업 추천), so wiring it to retake would fire
  // 재촬영 from a button that promises makeup recommendations.
  onPressCta?: () => void;
  // Points at the separate expanded vertical document used for 공유/이미지 저장.
  // Story covers, pager chrome and CTA are intentionally outside this target.
  captureRef?: React.Ref<any>;
  // The expanded S1-S9 document exists only while this save/share request is active.
  captureRequestId?: number | null;
  onCaptureDocumentSettledChange?: (requestId: number, settled: boolean) => void;
  // 개발 단계 QA용: 보고서 맨 아래에서 저장/세션 측정값 원본을 접어서 확인한다.
  measurementDebugPayload?: unknown;
  measurementDebugSummary?: {label: string; value: string}[];
}
