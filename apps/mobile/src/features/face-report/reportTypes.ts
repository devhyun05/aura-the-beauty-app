// reportTypes.ts — typed props/DTO model for the face-analysis report.
// Hard rule: no raw measurements anywhere. Numbers exist only as normalized 0..1 geometry.

export interface PhotoSlotData { uri?: string; placeholderLabel: string }

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
  paragraph: string;
}

// ---------- S3 ----------
export type FeatureGuide =
  | { kind: 'slantLine'; from: { x: number; y: number }; length: number; angleDeg: number; marker: { x: number; y: number } }
  | { kind: 'dashedVertical'; x: number; top: number; height: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; dashed: boolean };

export interface RegionCardData {
  key: string;
  regionChip: string;
  regionTitle: string;
  photo: PhotoSlotData;
  guide: FeatureGuide;
  guideLabel: string;
  guideLabelX: number;                  // normalized offset of the label pill
  guideLabelAlign?: 'left' | 'right';
  blend?: BlendData;                    // jaw card: rendered before the axes
  axes: SpectrumAxisData[];
  whatIf?: { axisIndex: number; config: WhatIfConfig };
  paragraph: string;
}
export interface S3Data { eyebrow: string; title: string; sub: string; cards: RegionCardData[] }

// ---------- S4 ----------
export interface SwatchData { name: string; color: string }
export interface S4Data {
  eyebrow: string; title: string;
  season: { headline: string; blend: BlendData };
  axes: SpectrumAxisData[];
  drape: {
    title: string; sub: string;
    photo: PhotoSlotData;
    goodTag: string; badTag: string;
    goodCaption: string; badCaption: string;
    dial: { heading: string; warm: string; cool: string; warmCaption: string; neutralCaption: string; coolCaption: string };
    goodTitle: string; badTitle: string;
    goodSwatches: SwatchData[]; badSwatches: SwatchData[];
    initialSwatch: { name: string; color: string; good: boolean };
    disclaimer: string;
  };
}

// ---------- S5 ----------
export interface S5Data {
  eyebrow: string; title: string;
  silhouettePlaceholder: string;   // multi-line placeholder label
  silhouetteLabel: string; silhouetteValue: string;
  skeletonLabel: string; skeletonValue: string;
  surveyNote: string; surveyLink: string;
  doTitle: string; doItems: string[];
  avoidTitle: string; avoidItems: string[];
}

// ---------- S6 ----------
export interface GazeRing {
  left: number; right: number; top: number; height: number; // normalized in the 112×146 face box
  dashed: boolean; color: string; restFill: string; activeFill: string;
}
export interface GazeMarker { n: number; right: number; top: number; color: string }
export interface S6Data {
  eyebrow: string; title: string;
  diagramTitle: string; playLabel: string; playingLabel: string;
  rings: GazeRing[]; markers: GazeMarker[];
  faceGuides: number[];            // dashed guide-line ys, normalized
  items: { n: number; color: string; text: string }[];
  stepMs: number[];                // hold duration per ring, in play order
  keywords: string[];
  paragraph: string;
}

// ---------- S7 ----------
export interface LookRowData { category: string; title: string; evidence: EvidenceKind; evidenceLabel: string; why: string }
export interface LookCardData { chip: string; variant: 'natural' | 'glam'; title: string; sub: string; rows: LookRowData[] }
export interface NotePart { text: string; color?: string; bold?: boolean }
export interface S7Data {
  eyebrow: string; title: string;
  noteParts: NotePart[];
  naturalLabel: string; glamLabel: string;
  mixZones: { nearNatural: string; middle: string; nearGlam: string }; // thresholds .35 / .65
  lookSummary: { natural: { title: string; desc: string }; glam: { title: string; desc: string } }; // switches at .5
  naturalCard: LookCardData;
  glamCard: LookCardData;
}

// ---------- screen ----------
// Only s1 (built from fields every successfully-created report already has)
// and s5 (has its own internal "설문 전" empty state — no coordinates/guides to
// fabricate) are guaranteed. s2/s4 depend on on-device measurements that can
// fail or come back "insufficient" for a given photo — rendering them from a
// failed measurement would mean fabricating guide-line pixel positions or
// color axes that were never actually measured. s3/s6/s7's real data sources
// (region bbox storage, AI perception parsing, natural/glam split generation)
// aren't wired on the backend at all yet (see
// docs/superpowers/plans/2026-07-16-face-report-redesign-plan.md §1). In every
// null case the scaffold hides the section rather than guessing — same
// "조용한 실패 금지, 조용한 생성 금지" posture as the rest of the report.
export interface ReportData {
  topBarTitle: string;
  s1: S1Data; s2: S2Data | null; s3: S3Data | null; s4: S4Data | null; s5: S5Data;
  s6: S6Data | null; s7: S7Data | null;
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
  // Wraps the report body so the screen can capture it as an image
  // (공유/이미지 저장). Must sit inside the ScrollView to capture full content.
  captureRef?: React.Ref<any>;
}
