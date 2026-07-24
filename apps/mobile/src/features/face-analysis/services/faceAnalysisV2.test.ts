import {parseFaceAnalysisV2} from './faceAnalysisV2';

function insight(label: string) {
  return {label, description: '설명', confidence: 0.8, rationaleMetricKeys: [], sensitivity: 1};
}

const metric = {
  value: 0.14, unit: 'ratio', confidence: 0.9, source: 'depth', status: 'measured',
  shots: ['FACE3D'], sensitivity: 1, warnings: [], derivedFrom: [],
};
const derived = {
  rulesVersion: 's1-l1-v1', asymmetry: insight('보류'), cheekboneAndEline: insight('입체감'),
  colorAxes: insight('뉴트럴'), eyeBrow: insight('수평'), faceShape: insight('타원형'),
  irisExposure: insight('보류'), nosePhiltrumLips: insight('완만'), skinColor: insight('균일'),
  verticalBalance: insight('균형'),
  measurementInterpretations: {
    noseTipProjection: {
      title: '코끝 돌출',
      resultLabel: '코끝 입체감이 또렷한 편',
      description: '볼 기준면보다 앞으로 놓이는 정도예요.',
      displayValue: '상대값 0.21',
      confidence: 0.9,
      rationaleMetricKeys: ['face3d.noseTipProjection'],
      sensitivity: 1,
    },
  },
};
const stage = {
  status: 'completed',
  cacheHit: false,
  durationMs: 125,
  durationSource: 'server_monotonic',
  inputTokens: 120,
  outputTokens: 45,
  totalTokens: 165,
  providerCallCount: 1,
  validationRetryCount: 0,
};
const fixture = {
  schemaVersion: 'aura-face-analysis-v2',
  coverage: {authoritativeKeys: ['face3d.noseTipProjection'], missingObservableKeys: [], outOfScopeKeys: [], blockedKeys: []},
  aiMeasurements: {}, faceProfile: {'face3d.noseTipProjection': metric}, derived,
  perception: null, consulting: null,
  pipeline: {aiMeasurement: stage, aiPerception: stage, aiConsulting: stage, overall: 'processing'},
};

const parsed = parseFaceAnalysisV2(fixture);
if (!parsed) throw new Error('valid V2 fixture must parse');
if (parsed.pipeline.aiMeasurement.totalTokens !== 165) {
  throw new Error('stage token observability must parse');
}
if (parseFaceAnalysisV2({...fixture, schemaVersion: 'old'})) throw new Error('old schema must fail');
if (parseFaceAnalysisV2({
  ...fixture,
  derived: {
    ...derived,
    measurementInterpretations: {
      noseTipProjection: {...derived.measurementInterpretations.noseTipProjection, confidence: 'high'},
    },
  },
})) throw new Error('invalid measurement interpretation must fail');
if (parseFaceAnalysisV2({
  ...fixture,
  pipeline: {
    ...fixture.pipeline,
    aiMeasurement: {...stage, durationMs: -1},
  },
})) throw new Error('negative stage duration must fail');
