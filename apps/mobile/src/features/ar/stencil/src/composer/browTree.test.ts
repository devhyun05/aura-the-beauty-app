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
  compileLayers(flattenTree(shaped)).params.browReplacementIntensity,
  0,
  '활성 눈썹 제품은 자연 눈썹 자동 밑지우기를 요청하지 않는다',
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
expectEqual(
  afterRemoval.params.browReplacementIntensity,
  0,
  '눈썹 제품을 제거하면 자동 밑지우기만 꺼진다',
);

console.log('AR brow tree contract passed');
