import type { BeardSurveyAnswers } from './types';

/**
 * Pure validation for the survey CTA (disabled until the current step is complete).
 * Extracted so the disabled-state matrix is unit-testable without rendering.
 *
 * step 0: a1 chosen
 * step 1: 면도 상태 chosen AND ≥1 부위 selected
 * step 2: all three of freq / cover / plan chosen
 */
export function canAdvanceSurvey(step: number, a: BeardSurveyAnswers): boolean {
  if (step === 0) return a.a1 != null;
  if (step === 1) return a.shave != null && a.areas.length > 0;
  return a.freq != null && a.cover != null && a.plan != null;
}
