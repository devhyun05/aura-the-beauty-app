import type {
  LabRunResult,
  LabRunnerMode,
  LabStage,
} from '../api/reportLabClient';

export type LabDraft = {
  fixtureId: string;
  stage: LabStage;
  runner: LabRunnerMode;
  promptDeveloper: string;
  promptUser: string;
  promptVersion: string;
  model: string;
  maxTokens: string;
  temperature: string;
  repeatCount: string;
};

export type LabState = {
  draft: LabDraft;
  requestStatus: 'idle' | 'running' | 'success' | 'error';
  requestError: string | null;
  sessionId: string | null;
  runs: LabRunResult[];
  selectedRunId: string | null;
  leftRunId: string | null;
  rightRunId: string | null;
  bookmarkedRunIds: string[];
};

export type LabAction =
  | {type: 'draft'; patch: Partial<LabDraft>}
  | {type: 'session-set'; sessionId: string}
  | {type: 'session-clear'}
  | {type: 'run-start'}
  | {type: 'run-success'; runs: LabRunResult[]}
  | {type: 'run-error'; message: string}
  | {type: 'select-run'; runId: string}
  | {type: 'compare-left'; runId: string | null}
  | {type: 'compare-right'; runId: string | null}
  | {type: 'toggle-bookmark'; runId: string};

function shortStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildPromptVersion(promptDeveloper: string, promptUser: string): string {
  return `report-lab-${shortStableHash(`${promptDeveloper}\u0000${promptUser}`)}`;
}

const INITIAL_DEVELOPER_PROMPT = '수치 대신 경향, 판정 상태, 시각 근거를 자연스러운 한국어로 설명해.';
const INITIAL_USER_PROMPT = '이 fixture의 일곱 섹션 보고서를 생성해.';

export const initialLabState: LabState = {
  draft: {
    fixtureId: 'synthetic-balanced-v1',
    stage: 'consult',
    runner: 'fixture',
    promptDeveloper: INITIAL_DEVELOPER_PROMPT,
    promptUser: INITIAL_USER_PROMPT,
    promptVersion: buildPromptVersion(INITIAL_DEVELOPER_PROMPT, INITIAL_USER_PROMPT),
    model: 'deterministic-fixture',
    maxTokens: 'disabled',
    temperature: 'disabled',
    repeatCount: '2',
  },
  requestStatus: 'idle',
  requestError: null,
  sessionId: null,
  runs: [],
  selectedRunId: null,
  leftRunId: null,
  rightRunId: null,
  bookmarkedRunIds: [],
};

export function labReducer(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case 'draft': {
      const draft = {...state.draft, ...action.patch};
      if (
        Object.hasOwn(action.patch, 'promptDeveloper') ||
        Object.hasOwn(action.patch, 'promptUser')
      ) {
        draft.promptVersion = buildPromptVersion(draft.promptDeveloper, draft.promptUser);
      }
      return {...state, draft};
    }
    case 'session-set':
      return {...state, sessionId: action.sessionId};
    case 'session-clear':
      return {...state, sessionId: null};
    case 'run-start':
      return {...state, requestStatus: 'running', requestError: null};
    case 'run-success': {
      const incomingIds = new Set(action.runs.map(run => run.runId));
      const runs = [
        ...action.runs,
        ...state.runs.filter(run => !incomingIds.has(run.runId)),
      ].slice(0, 30);
      const [newest, secondNewest] = action.runs;
      const serverSessionId = action.runs.find(run => run.sessionId !== null)?.sessionId ?? null;
      return {
        ...state,
        requestStatus: 'success',
        requestError: null,
        sessionId: serverSessionId ?? state.sessionId,
        runs,
        selectedRunId: newest?.runId ?? state.selectedRunId,
        leftRunId: newest?.runId ?? state.leftRunId,
        rightRunId: secondNewest?.runId ?? state.rightRunId,
      };
    }
    case 'run-error':
      return {...state, requestStatus: 'error', requestError: action.message};
    case 'select-run':
      return {...state, selectedRunId: action.runId};
    case 'compare-left':
      return {...state, leftRunId: action.runId};
    case 'compare-right':
      return {...state, rightRunId: action.runId};
    case 'toggle-bookmark':
      return {
        ...state,
        bookmarkedRunIds: state.bookmarkedRunIds.includes(action.runId)
          ? state.bookmarkedRunIds.filter(item => item !== action.runId)
          : [...state.bookmarkedRunIds, action.runId],
      };
  }
}

export function clampRepeatCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(3, parsed)) : 1;
}

export type NormalizedOutputDiff = {
  path: string;
  left: string;
  right: string;
};

function displayValue(value: unknown): string {
  if (value === undefined) return '없음';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function diffNormalizedOutputs(left: unknown, right: unknown): NormalizedOutputDiff[] {
  const differences: NormalizedOutputDiff[] = [];
  const visit = (leftValue: unknown, rightValue: unknown, path: string) => {
    if (Object.is(leftValue, rightValue)) return;
    const leftIsObject = leftValue !== null && typeof leftValue === 'object';
    const rightIsObject = rightValue !== null && typeof rightValue === 'object';
    if (leftIsObject && rightIsObject) {
      const leftRecord = leftValue as Record<string, unknown>;
      const rightRecord = rightValue as Record<string, unknown>;
      const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
      for (const key of [...keys].sort()) {
        visit(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    differences.push({
      path: path || '$',
      left: displayValue(leftValue),
      right: displayValue(rightValue),
    });
  };
  visit(left, right, '');
  return differences;
}
