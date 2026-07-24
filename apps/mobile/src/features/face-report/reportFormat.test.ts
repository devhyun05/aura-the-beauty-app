import {describeFaceLength, describeImpressionExploration, describeThirdsInternally, formatSeasonConfidence, formatThirdsRatio} from './reportFormat';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// formatThirdsRatio — 소수 둘째자리, 정직화된 교육 맥락 라벨('이상 기준' 아님)
{
  const v = formatThirdsRatio({upper: 1.05, middle: 1.0, lower: 0.95});
  assert(v.upperLabel === '1.05', 'upper 1.05');
  assert(v.middleLabel === '1.00', 'middle 1.00');
  assert(v.lowerLabel === '0.95', 'lower 0.95');
  assert(v.contextLabel.includes('고전') && !v.contextLabel.includes('이상 기준'), 'context label educational, not ideal-target');
}
// describeThirdsInternally — 자기 내부 비교(중안부 기준)로 가장 두드러진 편차 서술
{
  const short = describeThirdsInternally({upper: 0.75, middle: 1.0, lower: 0.98});
  assert(short.includes('상안부') && short.includes('25%') && short.includes('짧'), 'upper 25% shorter');
  const balanced = describeThirdsInternally({upper: 1.02, middle: 1.0, lower: 0.98});
  assert(balanced.includes('균형'), 'all within threshold -> balanced');
  const longLower = describeThirdsInternally({upper: null, middle: 1.0, lower: 1.15});
  assert(longLower.includes('하안부') && longLower.includes('15%') && longLower.includes('길'), 'null upper, lower 15% longer');
  const balancedWithoutUpper = describeThirdsInternally({upper: null, middle: 1.0, lower: 1.02});
  assert(
    balancedWithoutUpper.includes('측정된 중안부와 하안부') &&
      !balancedWithoutUpper.includes('세 구획'),
    'null upper must describe only measured middle/lower regions',
  );
}
// formatThirdsRatio — 상안부 결측(헤어라인 미확인)은 대시
{
  const v = formatThirdsRatio({upper: null, middle: 1.0, lower: 0.9});
  assert(v.upperLabel === '—', 'upper missing -> dash');
  assert(v.lowerLabel === '0.90', 'lower 0.90');
}
// describeFaceLength — 성별 참고선 기준 방향 카테고리('평균' 어휘 없음)
{
  const wide = describeFaceLength(1.20, 'men'); // < 1.35-0.07
  assert(!!wide && wide.categoryLabel.includes('가로형'), 'men 1.20 -> wide');
  const long = describeFaceLength(1.50, 'men'); // > 1.35+0.07
  assert(!!long && long.categoryLabel.includes('세로'), 'men 1.50 -> long');
  const bal = describeFaceLength(1.35, 'men');
  assert(!!bal && bal.categoryLabel.includes('균형'), 'men 1.35 -> balance');
  // 성별이 경계를 바꾼다: ratio 1.40 → 남(균형) vs 여(세로)
  const men140 = describeFaceLength(1.40, 'men');
  const women140 = describeFaceLength(1.40, 'women');
  assert(!!men140 && men140.categoryLabel.includes('균형'), 'men 1.40 -> balance');
  assert(!!women140 && women140.categoryLabel.includes('세로'), 'women 1.40 -> long (gender shifts boundary)');
  assert(describeFaceLength(null, 'men') === null, 'null ratio -> null');
  assert(!!bal && !bal.sentence.includes('평균'), 'no 평균 wording');
  assert(!!bal && bal.referenceNote.includes('황금비'), 'reference note mentions golden-ratio myth');
}
// describeImpressionExploration — 드래그 좌표를 축 라벨로 해석
{
  const AX = [
    {leftLabel: '내추럴', rightLabel: '세련됨', value: 0, key: 'x'},
    {leftLabel: '부드러움', rightLabel: '또렷함', value: 0, key: 'y'},
  ];
  assert(describeImpressionExploration(AX, 0.9, 0.1) === "이 위치라면 '세련됨 + 또렷함'에 가까운 인상", 'upper-right quadrant');
  assert(describeImpressionExploration(AX, 0.1, 0.9) === "이 위치라면 '내추럴 + 부드러움'에 가까운 인상", 'lower-left quadrant');
  assert(describeImpressionExploration(AX, 0.5, 0.5) === '중앙 — 어느 쪽으로도 치우치지 않은 균형 인상', 'center balanced');
  assert(describeImpressionExploration([], 0.5, 0.5) === '', 'empty axes -> empty');
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
