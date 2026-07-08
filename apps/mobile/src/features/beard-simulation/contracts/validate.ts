import {
  BEARD_GOALS,
  BEARD_REGIONS,
  BEARD_STAGES,
  PROTECT_OVERLAP_REJECT_RATIO,
  SHAVING_STATES,
} from './types';
import type {
  BeardMaskPackage,
  BeardSimulationRequest,
  BeardSimulationResult,
  BeardSurvey,
} from './types';

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

const SURVEY_ALLOWED_KEYS = new Set([
  'shavingState',
  'goal',
  'concernRegions',
  'shavingFrequencyPerWeek',
  'makeupCoverUsed',
  'consultPlanned',
]);

/** Health-adjacent terms that must never appear as survey keys (data policy:
 * no sensitive health information in this schema). */
const FORBIDDEN_KEY_PATTERNS = [
  /irritat/i,
  /trouble/i,
  /allerg/i,
  /sensitiv/i,
  /skin.?condition/i,
  /medical/i,
];

/** Consult questions are user-voiced questions for a clinician; the app must
 * never phrase recommendations of devices/procedures. */
const FORBIDDEN_CONSULT_PATTERNS = [
  /추천(합니다|드립니다|해\s*드)/,
  /효과가?\s*(확실|보장)/,
  /보장/,
  /가장\s*좋은\s*(레이저|기기|시술)\s*(은|는)\s*[^?]*(입니다|예요|이에요)/,
];

/** Stage-facing copy must not smuggle session counts back in. */
const FORBIDDEN_STAGE_COPY = /\d+\s*[~-]?\s*\d*\s*회/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inUnitRange(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

export function validateSurvey(input: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return {valid: false, errors: ['survey must be an object']};
  }

  for (const key of Object.keys(input)) {
    if (!SURVEY_ALLOWED_KEYS.has(key)) {
      errors.push(`survey has unknown key "${key}" (schema is closed)`);
    }
    if (FORBIDDEN_KEY_PATTERNS.some(pattern => pattern.test(key))) {
      errors.push(`survey key "${key}" looks like health data — forbidden`);
    }
  }

  const survey = input as Partial<BeardSurvey>;
  if (!SHAVING_STATES.includes(survey.shavingState as never)) {
    errors.push(`invalid shavingState: ${String(survey.shavingState)}`);
  }
  if (!BEARD_GOALS.includes(survey.goal as never)) {
    errors.push(`invalid goal: ${String(survey.goal)}`);
  }
  if (!Array.isArray(survey.concernRegions)) {
    errors.push('concernRegions must be an array');
  } else {
    for (const region of survey.concernRegions) {
      if (!BEARD_REGIONS.includes(region as never)) {
        errors.push(`invalid concernRegion: ${String(region)}`);
      }
    }
  }
  if (
    !isFiniteNumber(survey.shavingFrequencyPerWeek) ||
    survey.shavingFrequencyPerWeek < 0 ||
    survey.shavingFrequencyPerWeek > 21
  ) {
    errors.push('shavingFrequencyPerWeek must be a number in [0, 21]');
  }
  if (typeof survey.makeupCoverUsed !== 'boolean') {
    errors.push('makeupCoverUsed must be boolean');
  }
  if (typeof survey.consultPlanned !== 'boolean') {
    errors.push('consultPlanned must be boolean');
  }

  return {valid: errors.length === 0, errors};
}

export function validateRequest(input: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return {valid: false, errors: ['request must be an object']};
  }
  const request = input as Partial<BeardSimulationRequest>;
  if (typeof request.requestId !== 'string' || request.requestId.length === 0) {
    errors.push('requestId must be a non-empty string');
  }
  if (typeof request.photoRef !== 'string' || request.photoRef.length === 0) {
    errors.push('photoRef must be a non-empty string');
  }
  if (!Array.isArray(request.stages) || request.stages.length === 0) {
    errors.push('stages must be a non-empty array');
  } else {
    for (const stage of request.stages) {
      if (!BEARD_STAGES.includes(stage as never)) {
        errors.push(`invalid stage: ${String(stage)}`);
      }
    }
  }
  const surveyOutcome = validateSurvey(request.survey);
  errors.push(...surveyOutcome.errors);
  return {valid: errors.length === 0, errors};
}

export function validateMaskPackage(input: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return {valid: false, errors: ['maskPackage must be an object']};
  }
  const pkg = input as Partial<BeardMaskPackage>;
  if (!isFiniteNumber(pkg.imageWidth) || pkg.imageWidth <= 0) {
    errors.push('imageWidth must be a positive number');
  }
  if (!isFiniteNumber(pkg.imageHeight) || pkg.imageHeight <= 0) {
    errors.push('imageHeight must be a positive number');
  }
  if (pkg.encoding !== 'png-gray8') {
    errors.push(`encoding must be "png-gray8", got ${String(pkg.encoding)}`);
  }
  if (!isRecord(pkg.masks)) {
    errors.push('masks must be an object');
  } else {
    for (const key of ['hardHair', 'beardShadow', 'protect', 'softBlend']) {
      const ref = (pkg.masks as Record<string, unknown>)[key];
      if (typeof ref !== 'string' || ref.length === 0) {
        errors.push(`masks.${key} must be a non-empty artifact ref`);
      }
    }
  }
  if (!Array.isArray(pkg.regions)) {
    errors.push('regions must be an array');
  } else {
    for (const region of pkg.regions) {
      if (!BEARD_REGIONS.includes(region as never)) {
        errors.push(
          `invalid region "${String(region)}" (sideburn is excluded from MVP)`,
        );
      }
    }
  }
  if (!isRecord(pkg.stats)) {
    errors.push('stats must be an object');
  } else {
    if (!inUnitRange(pkg.stats.hardHairMean)) {
      errors.push('stats.hardHairMean must be in [0, 1]');
    }
    if (!inUnitRange(pkg.stats.beardShadowMean)) {
      errors.push('stats.beardShadowMean must be in [0, 1]');
    }
    if (!inUnitRange(pkg.stats.protectOverlapRatio)) {
      errors.push('stats.protectOverlapRatio must be in [0, 1]');
    } else if (pkg.stats.protectOverlapRatio > PROTECT_OVERLAP_REJECT_RATIO) {
      errors.push(
        `protectOverlapRatio ${pkg.stats.protectOverlapRatio} exceeds reject ` +
          `threshold ${PROTECT_OVERLAP_REJECT_RATIO} — package must be rejected upstream`,
      );
    }
  }
  return {valid: errors.length === 0, errors};
}

export function validateConsultQuestions(input: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!Array.isArray(input)) {
    return {valid: false, errors: ['consultQuestions must be an array']};
  }
  for (const question of input) {
    if (typeof question !== 'string' || question.trim().length === 0) {
      errors.push('consult question must be a non-empty string');
      continue;
    }
    if (!question.trimEnd().endsWith('?')) {
      errors.push(`consult question must be a question: "${question}"`);
    }
    for (const pattern of FORBIDDEN_CONSULT_PATTERNS) {
      if (pattern.test(question)) {
        errors.push(
          `consult question contains recommendation/guarantee phrasing: "${question}"`,
        );
      }
    }
  }
  return {valid: errors.length === 0, errors};
}

export function validateResult(input: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return {valid: false, errors: ['result must be an object']};
  }
  const result = input as Partial<BeardSimulationResult>;
  if (typeof result.requestId !== 'string' || result.requestId.length === 0) {
    errors.push('requestId must be a non-empty string');
  }
  if (typeof result.createdAt !== 'string' || result.createdAt.length === 0) {
    errors.push('createdAt must be a non-empty ISO string');
  }
  if (!isRecord(result.analysis)) {
    errors.push('analysis must be an object');
  } else {
    if (!inUnitRange(result.analysis.densityScore)) {
      errors.push('analysis.densityScore must be in [0, 1]');
    }
    if (!inUnitRange(result.analysis.shadowScore)) {
      errors.push('analysis.shadowScore must be in [0, 1]');
    }
  }
  errors.push(...validateMaskPackage(result.maskPackage).errors);
  if (!Array.isArray(result.stages)) {
    errors.push('stages must be an array');
  } else {
    for (const stageResult of result.stages) {
      if (!isRecord(stageResult)) {
        errors.push('stage result must be an object');
        continue;
      }
      if (!BEARD_STAGES.includes(stageResult.stage as never)) {
        errors.push(`invalid stage: ${String(stageResult.stage)}`);
      }
      if (
        !isRecord(stageResult.guard) ||
        typeof stageResult.guard.passed !== 'boolean'
      ) {
        errors.push('stage result must carry a guard report');
      } else if (stageResult.guard.passed !== true) {
        errors.push(
          'stages[] may only contain guard-passed results; failures belong in failures[]',
        );
      }
      if (FORBIDDEN_STAGE_COPY.test(String(stageResult.stage))) {
        errors.push('stage id must not contain session counts');
      }
    }
  }
  if (!Array.isArray(result.failures)) {
    errors.push('failures must be an array');
  }
  errors.push(...validateConsultQuestions(result.consultQuestions).errors);
  if (!Array.isArray(result.disclaimers) || result.disclaimers.length === 0) {
    errors.push('disclaimers must be a non-empty array');
  }
  return {valid: errors.length === 0, errors};
}
