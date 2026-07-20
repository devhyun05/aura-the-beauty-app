import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type {
  BeardPath,
  BeardSimulationResult,
  BeardSurveyAnswers,
} from '../contracts/types';

/**
 * Shared flow state for beard-simulation, held above the navigator so it survives back
 * navigation between screens (survey answers, divider position, result).
 * Cleared only on explicit delete (`resetAll`) or "새 사진으로 다시 시작" (`resetForNewPhoto`).
 */

const emptySurvey: BeardSurveyAnswers = {
  a1: null,
  shave: null,
  areas: [],
  freq: null,
  cover: null,
  plan: null,
};

export interface BeardFlowState {
  path: BeardPath | null;
  survey: BeardSurveyAnswers;
  inputImageUri: string | null;
  result: BeardSimulationResult | null;
  /** Result-screen compare divider %. Range 8–92. */
  divider: number;
  /** Report-screen compare divider % (independent). */
  reportDivider: number;
  savedOnce: boolean;
  /** Result-screen intro hint toast shown once per flow. */
  resultHintShown: boolean;
}

const initialState: BeardFlowState = {
  path: null,
  survey: emptySurvey,
  inputImageUri: null,
  result: null,
  divider: 50,
  reportDivider: 50,
  savedOnce: false,
  resultHintShown: false,
};

type Action =
  | { type: 'setPath'; path: BeardPath }
  | { type: 'patchSurvey'; patch: Partial<BeardSurveyAnswers> }
  | { type: 'setInputImage'; uri: string }
  | { type: 'setResult'; result: BeardSimulationResult }
  | { type: 'setDivider'; value: number }
  | { type: 'setReportDivider'; value: number }
  | { type: 'setSavedOnce'; value: boolean }
  | { type: 'markResultHintShown' }
  | { type: 'resetForNewPhoto' } // keep path + survey, drop result/divider
  | { type: 'resetAll' }; // full wipe (delete)

function reducer(state: BeardFlowState, action: Action): BeardFlowState {
  switch (action.type) {
    case 'setPath':
      return { ...state, path: action.path };
    case 'patchSurvey':
      return { ...state, survey: { ...state.survey, ...action.patch } };
    case 'setInputImage':
      return { ...state, inputImageUri: action.uri };
    case 'setResult':
      return { ...state, result: action.result };
    case 'setDivider':
      return { ...state, divider: action.value };
    case 'setReportDivider':
      return { ...state, reportDivider: action.value };
    case 'setSavedOnce':
      return { ...state, savedOnce: action.value };
    case 'markResultHintShown':
      return { ...state, resultHintShown: true };
    case 'resetForNewPhoto':
      return {
        ...state,
        result: null,
        divider: 50,
        reportDivider: 50,
        savedOnce: false,
        resultHintShown: false,
      };
    case 'resetAll':
      return { ...initialState, survey: emptySurvey };
    default:
      return state;
  }
}

export interface BeardFlowContextValue extends BeardFlowState {
  setPath(path: BeardPath): void;
  patchSurvey(patch: Partial<BeardSurveyAnswers>): void;
  setInputImage(uri: string): void;
  setResult(result: BeardSimulationResult): void;
  setDivider(value: number): void;
  setReportDivider(value: number): void;
  setSavedOnce(value: boolean): void;
  markResultHintShown(): void;
  resetForNewPhoto(): void;
  resetAll(): void;
}

const BeardFlowContext = createContext<BeardFlowContextValue | null>(null);

export function BeardFlowProvider({
  initial,
  children,
}: {
  initial?: Partial<BeardFlowState>;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...initial });

  const value = useMemo<BeardFlowContextValue>(
    () => ({
      ...state,
      setPath: (path) => dispatch({ type: 'setPath', path }),
      patchSurvey: (patch) => dispatch({ type: 'patchSurvey', patch }),
      setInputImage: (uri) => dispatch({ type: 'setInputImage', uri }),
      setResult: (result) => dispatch({ type: 'setResult', result }),
      setDivider: (value) => dispatch({ type: 'setDivider', value }),
      setReportDivider: (value) => dispatch({ type: 'setReportDivider', value }),
      setSavedOnce: (value) => dispatch({ type: 'setSavedOnce', value }),
      markResultHintShown: () => dispatch({ type: 'markResultHintShown' }),
      resetForNewPhoto: () => dispatch({ type: 'resetForNewPhoto' }),
      resetAll: () => dispatch({ type: 'resetAll' }),
    }),
    [state],
  );

  return <BeardFlowContext.Provider value={value}>{children}</BeardFlowContext.Provider>;
}

export function useBeardFlow(): BeardFlowContextValue {
  const ctx = useContext(BeardFlowContext);
  if (!ctx) throw new Error('useBeardFlow must be used within <BeardFlowProvider>');
  return ctx;
}

export { emptySurvey };
