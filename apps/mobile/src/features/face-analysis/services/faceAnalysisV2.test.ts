import {hasRenderableCameraReport, parseFaceAnalysisV2} from './faceAnalysisV2';

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
};
const stage = {status: 'pending', cacheHit: false};
const fixture = {
  schemaVersion: 'aura-face-analysis-v2',
  coverage: {authoritativeKeys: ['face3d.noseTipProjection'], missingObservableKeys: [], outOfScopeKeys: [], blockedKeys: []},
  aiMeasurements: {}, faceProfile: {'face3d.noseTipProjection': metric}, derived,
  perception: null, consulting: null,
  pipeline: {aiMeasurement: stage, aiPerception: stage, aiConsulting: stage, overall: 'processing'},
};

if (!parseFaceAnalysisV2(fixture)) throw new Error('valid V2 fixture must parse');
if (!hasRenderableCameraReport(fixture)) throw new Error('camera metric must render early report');
if (parseFaceAnalysisV2({...fixture, schemaVersion: 'old'})) throw new Error('old schema must fail');
if (hasRenderableCameraReport({...fixture, faceProfile: {}})) throw new Error('empty profile must not render');
