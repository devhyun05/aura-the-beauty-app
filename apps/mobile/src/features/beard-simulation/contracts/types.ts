/**
 * Beard laser-removal simulation contracts (v1).
 *
 * Mirrored by tools/beard-simulation-lab/engine/contracts.py — both sides are
 * validated against the shared fixtures in ./fixtures. Changing any shape here
 * requires updating the Python mirror and the fixtures together
 * (guard: scripts/mobile/run-beard-simulation-contract.mjs).
 *
 * Policy constraints baked into this schema:
 * - Stage labels carry no session counts ("회차") — UI copy derives from stage id only.
 * - Survey must not contain health information (skin irritation etc.); the
 *   validator rejects unknown keys so such fields cannot be added silently.
 * - `sideburn` is not a region in MVP; masks for it are never produced.
 * - softBlend is derived from hardHair/beardShadow minus protect — never authored.
 */

export type BeardSimulationStage = 'mild' | 'medium' | 'strong';

export type BeardRegion = 'mustache' | 'chin' | 'mouth_side' | 'jaw';

export type ShavingState = 'clean' | 'stubble' | 'short' | 'dense';

export type BeardGoal =
  | 'shadow_reduction'
  | 'density_reduction'
  | 'full_visualization';

/** 6-question survey. Only shavingState feeds the image pipeline; the rest
 * feed consult-question templates and the analysis card copy. */
export interface BeardSurvey {
  shavingState: ShavingState;
  goal: BeardGoal;
  concernRegions: BeardRegion[];
  shavingFrequencyPerWeek: number; // 0..21
  makeupCoverUsed: boolean;
  consultPlanned: boolean;
}

export interface BeardSimulationRequest {
  requestId: string;
  photoRef: string;
  survey: BeardSurvey;
  stages: BeardSimulationStage[];
}

export type MaskEncoding = 'png-gray8';

export interface BeardMaskPackage {
  imageWidth: number;
  imageHeight: number;
  encoding: MaskEncoding;
  masks: {
    hardHair: string;
    beardShadow: string;
    protect: string;
    /** Derived artifact: feather(max(hardHair, beardShadow) − protect). */
    softBlend: string;
  };
  regions: BeardRegion[];
  regionCoverage: Partial<Record<BeardRegion, number>>;
  stats: {
    hardHairMean: number;
    beardShadowMean: number;
    /** Fraction of protect-mask area intersected by hair/shadow confidence —
     * the pipeline pre-rejects above threshold before any correction runs. */
    protectOverlapRatio: number;
  };
}

export type GuardCheckId =
  | 'mask_protect_overlap'
  | 'landmark_drift'
  | 'jawline_iou'
  | 'identity_distance'
  | 'seam_score';

export interface GuardCheck {
  id: GuardCheckId;
  passed: boolean;
  value: number;
  threshold: number;
}

export interface GuardReport {
  passed: boolean;
  checks: GuardCheck[];
  mitigationsApplied: string[];
  rejectReason?: string;
}

export interface BeardStageResult {
  stage: BeardSimulationStage;
  imageRef: string;
  guard: GuardReport;
  paramsUsed: Record<string, number | boolean | string>;
}

export type BeardType = 'shadow_dominant' | 'stubble' | 'patchy' | 'dense';

export interface BeardAnalysisCard {
  beardType: BeardType;
  densityScore: number; // 0..1
  shadowScore: number; // 0..1
  regionCoverage: Partial<Record<BeardRegion, number>>;
}

export interface BeardStageFailure {
  stage: BeardSimulationStage;
  reason: string;
}

export interface BeardSimulationResult {
  requestId: string;
  createdAt: string;
  analysis: BeardAnalysisCard;
  maskPackage: BeardMaskPackage;
  stages: BeardStageResult[];
  failures: BeardStageFailure[];
  /** Template-generated questions the user can bring to a consult. Must never
   * contain device/procedure recommendations — validator enforces. */
  consultQuestions: string[];
  /** Always-visible reference-image disclaimers; must be non-empty. */
  disclaimers: string[];
}

export const BEARD_STAGES: readonly BeardSimulationStage[] = [
  'mild',
  'medium',
  'strong',
] as const;

export const BEARD_REGIONS: readonly BeardRegion[] = [
  'mustache',
  'chin',
  'mouth_side',
  'jaw',
] as const;

export const SHAVING_STATES: readonly ShavingState[] = [
  'clean',
  'stubble',
  'short',
  'dense',
] as const;

export const BEARD_GOALS: readonly BeardGoal[] = [
  'shadow_reduction',
  'density_reduction',
  'full_visualization',
] as const;

/** Max tolerated hair/shadow intrusion into the protect mask before pre-reject. */
export const PROTECT_OVERLAP_REJECT_RATIO = 0.02;
