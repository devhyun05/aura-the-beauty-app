export type {
  BeardAnalysisCard,
  BeardGoal,
  BeardMaskPackage,
  BeardRegion,
  BeardSimulationRequest,
  BeardSimulationResult,
  BeardSimulationStage,
  BeardStageFailure,
  BeardStageResult,
  BeardSurvey,
  BeardType,
  GuardCheck,
  GuardCheckId,
  GuardReport,
  ShavingState,
} from './contracts/types';

export {
  BEARD_GOALS,
  BEARD_REGIONS,
  BEARD_STAGES,
  SHAVING_STATES,
} from './contracts/types';

/** Input photo handed to the simulation service. */
export interface BeardSimulationPhoto {
  uri: string;
  fileName?: string;
  mimeType?: string;
}

export type BeardSimulationFlowStep = 'input' | 'loading' | 'result' | 'failure';
