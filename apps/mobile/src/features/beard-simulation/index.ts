/**
 * Public entry for the beard-simulation feature.
 *
 * Register `BeardSimulationNavigator` behind the existing "수염 제거" entry in the app navigator.
 * Everything else (screens, state, service) is internal to the feature and consumed via the
 * exported contracts + service interface only.
 */
export { BeardSimulationNavigator } from './BeardSimulationNavigator';

export type {
  BeardPath,
  BeardAnalysis,
  BeardAnalysisCell,
  BeardGuard,
  BeardResultStatus,
  BeardSimulationResult,
  BeardSurveyAnswers,
  SimulateInput,
  BeardSimulationService,
} from './contracts/types';

export {
  mockBeardSimulationService,
  createMockBeardSimulationService,
  demoReadyResult,
} from './services/mockBeardSimulationService';
// Production wiring: the real backend-connected service + flow-entry prewarm.
export {
  realBeardSimulationService,
  prewarmBeardSimulation,
} from './services/realBeardSimulationService';
export { canAdvanceSurvey } from './contracts/surveyRules';
export type { MockConfig } from './services/mockBeardSimulationService';

export type { BeardStackParamList } from './navigation/types';
