import {
  DEFAULT_LIP_ADJUSTMENT,
  ExpressionAssistMode,
  LipAdjustment,
  LipGenerateResult,
  LipGenerateStatus,
  LipMaskProvider,
} from './contracts';

export type LipGenerateState = {
  provider: LipMaskProvider;
  expressionMode: ExpressionAssistMode;
  adjustment: LipAdjustment;
  status: LipGenerateStatus;
  selectedFixtureId?: string;
  generatedMaskId?: string;
  warnings: string[];
  lastResult?: LipGenerateResult;
};

export type LipGenerateAction =
  | { type: 'selectProvider'; provider: LipMaskProvider }
  | { type: 'selectExpressionMode'; expressionMode: ExpressionAssistMode }
  | { type: 'selectFixture'; fixtureId: string }
  | {
      type: 'setAdjustment';
      key: keyof LipAdjustment;
      value: number;
    }
  | { type: 'startGenerate' }
  | { type: 'completeGenerate'; result: LipGenerateResult }
  | { type: 'blockGenerate'; blockedReason: string }
  | { type: 'reset' };

export const INITIAL_LIP_GENERATE_STATE: LipGenerateState = {
  provider: 'vision',
  expressionMode: 'uvOnly',
  adjustment: DEFAULT_LIP_ADJUSTMENT,
  status: 'ready',
  selectedFixtureId: 'pair_face_20260622T143334Z_03',
  warnings: [],
};

function clampAdjustment(value: number): number {
  return Math.max(-1, Math.min(1, Number(value.toFixed(2))));
}

export function lipGenerateReducer(
  state: LipGenerateState,
  action: LipGenerateAction,
): LipGenerateState {
  switch (action.type) {
    case 'selectProvider':
      return { ...state, provider: action.provider, warnings: [] };
    case 'selectExpressionMode':
      return { ...state, expressionMode: action.expressionMode, warnings: [] };
    case 'selectFixture':
      return { ...state, selectedFixtureId: action.fixtureId, warnings: [] };
    case 'setAdjustment':
      return {
        ...state,
        adjustment: {
          ...state.adjustment,
          [action.key]: clampAdjustment(action.value),
        },
      };
    case 'startGenerate':
      return {
        ...state,
        status: 'partial',
        generatedMaskId: undefined,
        warnings: ['generation_in_progress'],
      };
    case 'completeGenerate':
      return {
        ...state,
        status: action.result.status,
        generatedMaskId: action.result.generatedMaskId,
        warnings: action.result.warnings,
        lastResult: action.result,
      };
    case 'blockGenerate':
      return {
        ...state,
        status: 'blocked',
        warnings: [action.blockedReason],
      };
    case 'reset':
      return INITIAL_LIP_GENERATE_STATE;
    default:
      return state;
  }
}
