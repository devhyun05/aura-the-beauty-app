/**
 * Contracts for the beard-simulation feature.
 *
 * These types are the drop-in boundary for the real backend (레이저제모_보완계획서 Stage 2).
 * The mock service (`mockBeardSimulationService`) and the real service must both satisfy
 * `BeardSimulationService`. Screens/components consume ONLY this interface — never the mock
 * directly — so swapping in the real implementation is a one-line change at the provider.
 */

/** Which entry the user chose on the purpose screen. */
export type BeardPath = 'analysis' | 'photo';

export interface BeardAnalysisCell {
  k: string;
  v: string;
}

export interface BeardAnalysis {
  /** Sentence-first summary shown above the definition grid (2 sentences). */
  summarySentences: string[];
  /** 2-column definition grid rows. */
  cells: BeardAnalysisCell[];
  /** Copy-able consult prompts. */
  consults: string[];
  /** Management tips (dot list). */
  tips: string[];
}

export interface BeardGuard {
  /** True when the result preserves the original face and is safe to show. */
  passed: boolean;
  /** Populated when `passed` is false — drives the failure screen problem chips. */
  blockedReason?: string;
}

export type BeardResultStatus = 'ready' | 'blocked' | 'failed';

export interface BeardSimulationResult {
  status: BeardResultStatus;
  inputImageUri: string;
  /** The single fully beard-removed result image. Present when status === 'ready', else null. */
  resultImageUri: string | null;
  /** Present only for the 수염 분석 path. */
  analysis?: BeardAnalysis;
  guard: BeardGuard;
}

/** Survey answers — persisted across back navigation, cleared only on delete / new photo. */
export interface BeardSurveyAnswers {
  a1: number | null; // 가장 궁금한 변화 (single)
  shave: number | null; // 면도 상태 (single)
  areas: number[]; // 신경 쓰이는 부위 (multi)
  freq: number | null; // 면도 빈도 (single)
  cover: number | null; // 메이크업 커버 (single)
  plan: number | null; // 상담 계획 (single)
}

export interface SimulateInput {
  imageUri: string;
  path: BeardPath;
  survey?: BeardSurveyAnswers;
}

export interface BeardSimulationService {
  simulate(input: SimulateInput): Promise<BeardSimulationResult>;
  saveResultToLibrary(uri: string): Promise<void>;
}
