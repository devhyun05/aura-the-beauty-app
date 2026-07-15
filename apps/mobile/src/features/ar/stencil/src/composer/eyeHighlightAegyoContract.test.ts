import {buildSystemLibrary, subDefsForRegion} from './lookTree';
import {buildVariantLibrary} from './lookVariants';
import {
  pickerVisibleRegionDefs,
  REGION_GROUPS,
  REGION_MAP,
} from './regions';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const library = {...buildSystemLibrary(), ...buildVariantLibrary()};
const firstParams = (def: (typeof library)[string]) => {
  const kid = def.kids[0];
  return (typeof kid === 'string' || kid == null ? {} : kid.params) as Record<
    string,
    unknown
  >;
};

const expectedCounts = {
  eyeshadow: 12,
  eyeshadowLower: 6,
  eyelinerUpper: 8,
  eyelinerLower: 6,
  aegyo: 6,
} as const;

for (const [region, count] of Object.entries(expectedCounts)) {
  const defs = subDefsForRegion(library, region as keyof typeof expectedCounts);
  expect(
    defs.length === count,
    `${region} standalone 룩은 ${count}개여야 한다 (현재 ${defs.length}개)`,
  );
  expect(
    defs.every(def => def.pickerScope === 'standalone'),
    `${region} 세부 카드에는 standalone 룩만 보여야 한다`,
  );
}

const upperShadowShapes = subDefsForRegion(library, 'eyeshadow')
  .map(def => firstParams(def).eyeshadowShape)
  .sort((a, b) => Number(a) - Number(b));
expect(
  JSON.stringify(upperShadowShapes) ===
    JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  '아이섀도 상 standalone 룩은 12개 모양을 정확히 한 번씩 사용해야 한다',
);

const lowerShadowShapes = subDefsForRegion(library, 'eyeshadowLower')
  .map(def => firstParams(def).eyeshadowLowerShape)
  .sort((a, b) => Number(a) - Number(b));
expect(
  JSON.stringify(lowerShadowShapes) === JSON.stringify([0, 0, 1, 2, 3, 4]),
  '하단 아이섀도 룩은 전체·앞·중앙·뒤·스모키 위치를 명시해야 한다',
);

const upperLinerStyles = new Set(
  subDefsForRegion(library, 'eyelinerUpper').map(
    def => firstParams(def).eyelinerStyle,
  ),
);
for (let style = 0; style < 6; style += 1) {
  expect(upperLinerStyles.has(style), `아이라인 상 스타일 ${style}가 누락됐다`);
}

const lowerLinerStyles = new Set(
  subDefsForRegion(library, 'eyelinerLower').map(
    def => firstParams(def).eyelinerLowerStyle,
  ),
);
for (let style = 0; style < 3; style += 1) {
  expect(lowerLinerStyles.has(style), `아이라인 하 스타일 ${style}가 누락됐다`);
}
expect(
  subDefsForRegion(library, 'eyelinerLower').every(
    def => firstParams(def).eyelinerFinish == null,
  ),
  '하단 아이라인 룩은 상단 eyelinerFinish를 소유하면 안 된다',
);

expect(
  subDefsForRegion(library, 'eyelinerLower').every(def => {
    const params = firstParams(def);
    return typeof params.eyelinerLowerColor === 'string' && params.eyelinerColor == null;
  }),
  '하단 아이라인 룩은 전용 색만 소유해야 한다',
);

const aegyoModes = subDefsForRegion(library, 'aegyo').map(
  def => firstParams(def).aegyoMode,
);
expect(aegyoModes.filter(mode => mode === 0).length === 3, '자연 애교살 룩은 3개여야 한다');
expect(aegyoModes.filter(mode => mode === 1).length === 3, '펄 애교살 룩은 3개여야 한다');
expect(
  subDefsForRegion(library, 'aegyo').every(
    def => firstParams(def).aegyoRendererVersion === 1,
  ),
  '새 애교살 룩은 legacy payload와 구분되는 렌더 버전을 가져야 한다',
);

const contourGroup = REGION_GROUPS.find(group => group.slot === '컨투어');
expect(contourGroup != null, '컨투어 리전 그룹이 있어야 한다');
const visibleContourKeys = pickerVisibleRegionDefs(contourGroup?.regions ?? []).map(
  def => def.key,
);
expect(
  JSON.stringify(visibleContourKeys) ===
    JSON.stringify([
      'blush',
      'highlightCheek',
      'highlightNoseBridge',
      'highlightNoseTip',
      'highlightBrowBone',
      'highlightCupid',
      'contour',
    ]),
  `하이라이터 선택기는 5개 부위만 보여야 한다: ${visibleContourKeys.join(', ')}`,
);
expect(REGION_MAP.highlighter.pickerHidden === true, 'legacy 합성 하이라이터는 숨겨야 한다');

const highlightRegions = [
  'highlightCheek',
  'highlightNoseBridge',
  'highlightNoseTip',
  'highlightBrowBone',
  'highlightCupid',
] as const;
for (const region of highlightRegions) {
  const defs = subDefsForRegion(library, region);
  expect(defs.length === 2, `${region}에는 은은/펄 룩 2개가 있어야 한다`);
  expect(
    defs.every(def => def.pickerScope === 'standalone'),
    `${region}에는 standalone 룩만 보여야 한다`,
  );
}

console.log('AR eye, highlighter, and aegyo mobile contract passed');
