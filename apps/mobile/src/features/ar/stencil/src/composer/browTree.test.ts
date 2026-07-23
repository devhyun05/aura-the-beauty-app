import {BARE, BROW_COLORS} from '../presets';
import {compileLayers} from './model';
import {
  BROW_REFERENCE_SHAPES,
  patchBrowTree,
  readBrowTree,
  removeBrowTree,
} from './browTree';
import {buildVariantLibrary} from './lookVariants';
import {buildSystemLibrary, decomposeToTree, flattenTree} from './lookTree';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const library = {...buildSystemLibrary(), ...buildVariantLibrary()};

expectEqual(
  BROW_REFERENCE_SHAPES.length,
  5,
  '기본 눈썹 UI는 사용자가 제공한 레퍼런스 알파 에셋 5종만 제공한다',
);
const expectedShapes = [
  {value: 0, label: '일자', template: 9},
  {value: 1, label: '소프트 일자', template: 8},
  {value: 2, label: '세미아치', template: 7},
  {value: 3, label: '아치', template: 5},
  {value: 4, label: '둥근형', template: 6},
];
for (let index = 0; index < expectedShapes.length; index += 1) {
  expectEqual(
    JSON.stringify(BROW_REFERENCE_SHAPES[index]),
    JSON.stringify(expectedShapes[index]),
    `눈썹 모양 ${index}은 대응하는 실제 알파 마스크와 같은 순서여야 한다`,
  );
}
expectEqual(
  BROW_COLORS.length,
  11,
  '기본 브라운 6색과 컬러 브로우 5색을 모두 제공한다',
);

const shaped = patchBrowTree(null, library, {shapeValue: 4});
expect(readBrowTree(shaped).enabled, '빈 룩에서 모양을 고르면 눈썹 잎을 만든다');
expectEqual(
  readBrowTree(shaped).shapeValue,
  4,
  '선택한 눈썹 모양이 트리에 저장된다',
);
const seededRegions = flattenTree(shaped).map(layer => layer.region);
expect(
  seededRegions.length === 1 && seededRegions[0] === 'browStyle',
  '빈 룩의 첫 모양 선택은 단일 알파 눈썹 스타일 레이어만 만든다',
);
expectEqual(
  compileLayers(flattenTree(shaped)).params.browStyleTemplate,
  6,
  '선택한 모양은 대응하는 레퍼런스 알파 템플릿을 요청한다',
);

const recolored = patchBrowTree(shaped, library, {color: BROW_COLORS[4]});
expectEqual(
  readBrowTree(recolored).color,
  BROW_COLORS[4],
  '색 변경은 눈썹 제품 색상에 반영된다',
);
expectEqual(
  readBrowTree(recolored).shapeValue,
  4,
  '색 변경은 모양을 보존한다',
);

expectEqual(
  readBrowTree(removeBrowTree(recolored, library)).enabled,
  false,
  '없음 선택은 눈썹 제품을 제거한다',
);

const eraserOnly = decomposeToTree(
  {...BARE, browConcealIntensity: 1},
  [],
  '지우개 유지 계약',
);
const eraserAndBrow = patchBrowTree(eraserOnly, library, {shapeValue: 2});
const erasedBrowProducts = removeBrowTree(eraserAndBrow, library);
const afterRemoval = compileLayers(flattenTree(erasedBrowProducts));
expectEqual(
  afterRemoval.params.browConcealIntensity,
  1,
  '눈썹 제품을 제거해도 사용자가 선택한 지우개는 유지된다',
);

const recommendedParams = {
  ...BARE,
  browColor: '#59402E',
  browIntensity: 0.42,
  browPowderColor: '#624936',
  browPowderIntensity: 0.31,
  browPencilColor: '#342219',
  browPencilIntensity: 0.27,
  browStyleColor: '#4B3528',
  browStyleIntensity: 0.36,
  browStyleTemplate: 4,
};
const recommendedTree = decomposeToTree(
  recommendedParams,
  [],
  '추천 눈썹 보존 계약',
);
const beforeRead = JSON.stringify(
  compileLayers(flattenTree(recommendedTree)).params,
);
readBrowTree(recommendedTree);
const afterRead = JSON.stringify(
  compileLayers(flattenTree(recommendedTree)).params,
);
expectEqual(
  afterRead,
  beforeRead,
  '추천 룩을 열고 눈썹 UI 상태를 읽는 것만으로 기존 제품 스택을 정규화하지 않는다',
);

const directlyRecolored = patchBrowTree(recommendedTree, library, {
  color: BROW_COLORS[7],
});
const directLayers = flattenTree(directlyRecolored);
expect(
  directLayers.length === 1 && directLayers[0].region === 'browStyle',
  '사용자가 눈썹 색을 직접 선택한 경우에만 레퍼런스 알파 스타일로 정규화한다',
);
expectEqual(
  compileLayers(directLayers).params.browStyleTemplate,
  9,
  '색상만 직접 선택해도 현재 UI 모양의 레퍼런스 알파 템플릿을 적용한다',
);

console.log('AR brow tree contract passed');
