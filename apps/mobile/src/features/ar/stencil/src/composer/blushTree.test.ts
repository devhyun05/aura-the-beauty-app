import {
  AR_BLUSH_COLORS,
  AR_BLUSH_MAX_INTENSITY,
  AR_BLUSH_REFERENCE_SHAPES,
  AR_BLUSH_SHAPES,
  arBlushIntensityFromSlider,
  normalizeArBlushIntensity,
} from '../../../../../shared/contracts/arBlushCatalog';
import {
  patchBlushTree,
  readBlushTree,
  removeBlushTree,
} from './blushTree';
import {buildVariantLibrary} from './lookVariants';
import {
  buildSystemLibrary,
  defSwatchColor,
  faceLookIdForPreset,
  findNode,
  instantiate,
  isLeaf,
  updateLeaf,
} from './lookTree';
import type {LookNode} from './lookTree';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function readBlushFit(root: LookNode | null): {lift: number; spread: number} {
  const leafId = readBlushTree(root).leafId;
  const leaf = leafId ? findNode(root, leafId) : null;
  return leaf && isLeaf(leaf)
    ? {
        lift: leaf.params.blushLift ?? 0,
        spread: leaf.params.blushSpread ?? 0,
      }
    : {lift: 0, spread: 0};
}

expectEqual(AR_BLUSH_SHAPES.length, 8, '블러셔 모양은 stable value 0..7 전체를 제공한다');
expectEqual(
  AR_BLUSH_SHAPES.map(shape => shape.value).join(','),
  '0,1,2,3,4,5,6,7',
  '블러셔 모양 value는 연속된 저장 계약이다',
);
expectEqual(AR_BLUSH_REFERENCE_SHAPES.length, 5, '레퍼런스 마스크 5종을 제공한다');
expect(
  AR_BLUSH_REFERENCE_SHAPES.every(
    shape => Boolean(shape.candidateId) && Boolean(shape.maskTextureId),
  ),
  '레퍼런스 모양은 FullFace candidate/mask ID를 모두 가진다',
);
expectEqual(AR_BLUSH_COLORS.length, 8, '중복을 줄인 블러셔 팔레트 8색을 제공한다');
expectEqual(
  AR_BLUSH_COLORS.map(color => color.label).join(','),
  '살구 코랄,피치 베이지,테라코타,로즈,소프트 레드,클리어 핑크,라일락 모브,베리',
  '화면 색 이름에는 톤 접두사를 노출하지 않는다',
);
expectEqual(
  new Set(AR_BLUSH_COLORS.map(color => color.hex.toUpperCase())).size,
  AR_BLUSH_COLORS.length,
  '블러셔 팔레트 hex는 중복되지 않는다',
);
for (const undertone of ['warm', 'neutral', 'cool'] as const) {
  expect(
    AR_BLUSH_COLORS.some(color => color.undertone === undertone),
    `${undertone} 블러셔가 최소 한 색 있어야 한다`,
  );
}
expectEqual(arBlushIntensityFromSlider(0), 0, '농도 0은 안료 강도 0이다');
expectEqual(arBlushIntensityFromSlider(0.5), 0.6, '농도 50은 안료 강도 0.6이다');
expectEqual(
  arBlushIntensityFromSlider(1),
  AR_BLUSH_MAX_INTENSITY,
  '농도 100은 최대 안료 강도 1.2다',
);
expectEqual(
  normalizeArBlushIntensity(AR_BLUSH_MAX_INTENSITY),
  1,
  '최대 안료 강도는 화면 농도 100으로 표시한다',
);

const library = {...buildSystemLibrary(), ...buildVariantLibrary()};
const glamTree = instantiate(library, faceLookIdForPreset('glam'));
expect(glamTree !== null, '글램 전체 룩을 트리로 만들 수 있어야 한다');

const initial = readBlushTree(glamTree);
expect(initial.enabled, '글램 룩은 블러셔 잎을 가진다');

const liftedTree = patchBlushTree(glamTree, library, {shapeValue: 2});
const liftedLeafId = readBlushTree(liftedTree).leafId;
expect(liftedLeafId !== null, '핏 보존 테스트용 블러셔 잎을 찾는다');
const treeWithLegacyFit = liftedLeafId && liftedTree
  ? updateLeaf(liftedTree, liftedLeafId, {
      params: {blushLift: 0.08, blushSpread: -0.06},
    })
  : liftedTree;

const shapePatched = patchBlushTree(treeWithLegacyFit, library, {shapeValue: 7});
const afterShape = readBlushTree(shapePatched);
expectEqual(afterShape.shapeValue, 7, '모양 패치는 선택한 shape value만 적용한다');
expectEqual(afterShape.color, initial.color, '모양 변경은 색을 보존한다');
expectEqual(afterShape.intensity, initial.intensity, '모양 변경은 농도를 보존한다');
expectEqual(
  readBlushFit(shapePatched).lift,
  0,
  '모양 변경은 이전 룩의 blushLift를 새 모양 기본값으로 초기화한다',
);
expectEqual(
  readBlushFit(shapePatched).spread,
  0,
  '모양 변경은 이전 룩의 blushSpread를 새 모양 기본값으로 초기화한다',
);

const nextColor = AR_BLUSH_COLORS[0].hex;
const shapeLeafId = readBlushTree(shapePatched).leafId;
const treeWithCurrentFit = shapeLeafId && shapePatched
  ? updateLeaf(shapePatched, shapeLeafId, {
      params: {blushLift: 0.04, blushSpread: -0.03},
    })
  : shapePatched;
const colorPatched = patchBlushTree(treeWithCurrentFit, library, {color: nextColor});
const afterColor = readBlushTree(colorPatched);
expectEqual(afterColor.color, nextColor, '색 패치는 선택한 색만 적용한다');
expectEqual(afterColor.shapeValue, 7, '색 변경은 모양을 보존한다');
expectEqual(afterColor.intensity, initial.intensity, '색 변경은 농도를 보존한다');
expectEqual(readBlushFit(colorPatched).lift, 0.04, '색 변경은 현재 lift를 보존한다');
expectEqual(readBlushFit(colorPatched).spread, -0.03, '색 변경은 현재 spread를 보존한다');

const intensityPatched = patchBlushTree(colorPatched, library, {intensity: 99});
const afterIntensity = readBlushTree(intensityPatched);
expectEqual(
  afterIntensity.intensity,
  AR_BLUSH_MAX_INTENSITY,
  '블러셔 농도는 공통 최대값으로 클램프한다',
);
expectEqual(afterIntensity.color, nextColor, '농도 변경은 색을 보존한다');
expectEqual(afterIntensity.shapeValue, 7, '농도 변경은 모양을 보존한다');
expectEqual(readBlushFit(intensityPatched).lift, 0.04, '농도 변경은 현재 lift를 보존한다');
expectEqual(readBlushFit(intensityPatched).spread, -0.03, '농도 변경은 현재 spread를 보존한다');

const ensuredFromEmpty = patchBlushTree(null, library, {
  color: AR_BLUSH_COLORS[1].hex,
});
const ensuredState = readBlushTree(ensuredFromEmpty);
expect(ensuredState.enabled, '빈 룩에서 색을 고르면 블러셔 잎을 만든다');
expectEqual(
  ensuredState.color,
  AR_BLUSH_COLORS[1].hex,
  '빈 룩에 시드한 뒤에도 선택한 색이 적용된다',
);

expectEqual(
  readBlushTree(removeBlushTree(ensuredFromEmpty, library)).enabled,
  false,
  '모양 축의 없음은 블러셔 잎을 제거한다',
);

const glamBlushDefId = 'sys:glam:blush';
expectEqual(
  defSwatchColor(library, glamBlushDefId)?.toUpperCase(),
  initial.color.toUpperCase(),
  '블러셔 카드 스와치는 글리터색보다 blushColor를 우선한다',
);

console.log('AR blush tree contract passed');
