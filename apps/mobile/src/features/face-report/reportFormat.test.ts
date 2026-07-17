import {formatSeasonConfidence, formatThirdsRatio, resolveFaceLengthBand} from './reportFormat';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// formatThirdsRatio — 소수 둘째자리, 이상 기준 병기
{
  const v = formatThirdsRatio({upper: 1.05, middle: 1.0, lower: 0.95});
  assert(v.upperLabel === '1.05', 'upper 1.05');
  assert(v.middleLabel === '1.00', 'middle 1.00');
  assert(v.lowerLabel === '0.95', 'lower 0.95');
  assert(v.idealLabel.includes('1 : 1 : 1'), 'ideal label has 1:1:1');
}
// formatThirdsRatio — 상안부 결측(헤어라인 미확인)은 대시
{
  const v = formatThirdsRatio({upper: null, middle: 1.0, lower: 0.9});
  assert(v.upperLabel === '—', 'upper missing -> dash');
  assert(v.lowerLabel === '0.90', 'lower 0.90');
}
// resolveFaceLengthBand — 평균 범위 안
{
  const v = resolveFaceLengthBand({ratio: 1.4, band: {lo: 1.3, hi: 1.5}, verdict: 'average', confidence: 0.9});
  assert(v.kind === 'band', 'average -> band');
  if (v.kind === 'band') {
    assert(v.inBand === true, 'inBand true');
    assert(v.position > 0 && v.position < 1, 'position in (0,1)');
    assert(v.loFrac < v.hiFrac, 'loFrac < hiFrac');
    assert(v.verdictLabel === '평균 범위', 'verdict label average');
  }
}
// resolveFaceLengthBand — 세로로 긴 편(밴드 밖)
{
  const v = resolveFaceLengthBand({ratio: 1.9, band: {lo: 1.3, hi: 1.5}, verdict: 'long', confidence: 0.9});
  assert(v.kind === 'band' && v.inBand === false, 'long -> out of band');
}
// resolveFaceLengthBand — indeterminate는 보류
{
  const v = resolveFaceLengthBand({ratio: 1.4, band: null, verdict: 'indeterminate', confidence: 0.9});
  assert(v.kind === 'withheld', 'indeterminate -> withheld');
}
// resolveFaceLengthBand — 저신뢰도는 보류
{
  const v = resolveFaceLengthBand({ratio: 1.4, band: {lo: 1.3, hi: 1.5}, verdict: 'average', confidence: 0.2});
  assert(v.kind === 'withheld', 'low confidence -> withheld');
}
// formatSeasonConfidence — 확신도 %, 2순위 라벨
{
  const v = formatSeasonConfidence({topLabel: '봄 라이트', secondaryLabel: '가을 뮤트', typeScore: 0.82});
  assert(v.percentLabel === '봄 라이트 82%', 'percent label 82');
  assert(v.gapLabel === '2순위 가을 뮤트', 'gap label secondary');
}
// formatSeasonConfidence — 1.0 초과 클램프, 2순위 없음
{
  const v = formatSeasonConfidence({topLabel: '봄 라이트', secondaryLabel: null, typeScore: 1.2});
  assert(v.percentLabel === '봄 라이트 100%', 'clamp to 100');
  assert(v.gapLabel === null, 'no secondary -> null gap');
}

// eslint-disable-next-line no-console
console.log('reportFormat.test.ts (Task 1) OK');
