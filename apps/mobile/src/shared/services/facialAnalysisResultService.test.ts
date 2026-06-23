import {
  getMockFacialAnalysisResult,
  getPrimaryMakeupDirection,
} from './facialAnalysisResultService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const facialAnalysisResult = getMockFacialAnalysisResult();
const primaryDirection = getPrimaryMakeupDirection(facialAnalysisResult);

expectEqual(facialAnalysisResult.analysis.skinTone.label, '밝은 뉴트럴 톤', 'skin tone label');
expectEqual(facialAnalysisResult.makeupDirections.length, 3, 'makeup direction count');
expectEqual(primaryDirection.id, 'clean-glow-neutral', 'primary makeup direction id');
