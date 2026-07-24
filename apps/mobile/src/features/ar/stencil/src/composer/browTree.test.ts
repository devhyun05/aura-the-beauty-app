import {BARE, BROW_COLORS, PRESETS} from '../presets';
import {compileLayers} from './model';
import {
  BASIC_BROW_LENGTH_MAX,
  BASIC_BROW_LENGTH_MIN,
  BASIC_BROW_THICKNESS_MAX,
  BASIC_BROW_THICKNESS_MIN,
  BROW_REFERENCE_SHAPES,
  browLengthFromSlider,
  browThicknessFromSlider,
  normalizeBrowLength,
  normalizeBrowThickness,
  patchBrowTree,
  readBrowTree,
  removeBrowTree,
} from './browTree';
import {buildVariantLibrary} from './lookVariants';
import {
  buildSystemLibrary,
  decomposeToTree,
  flattenTree,
  instantiate,
  regionDefsForSlot,
} from './lookTree';

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
expectEqual(
  browThicknessFromSlider(0),
  BASIC_BROW_THICKNESS_MIN,
  '두께 슬라이더 최소는 0.25배까지 확실히 얇아진다',
);
expectEqual(
  browThicknessFromSlider(0.5),
  1,
  '두께 슬라이더 중앙은 기존 1배 실루엣을 유지한다',
);
expectEqual(
  browThicknessFromSlider(1),
  BASIC_BROW_THICKNESS_MAX,
  '두께 슬라이더 최대는 2.5배까지 확실히 두꺼워진다',
);
expectEqual(
  normalizeBrowThickness(1),
  0.5,
  '저장된 기존 1배 두께는 슬라이더 중앙으로 역매핑된다',
);
expectEqual(
  browLengthFromSlider(0),
  BASIC_BROW_LENGTH_MIN,
  '가로 길이 슬라이더 최소는 0.65배까지 꼬리를 줄인다',
);
expectEqual(
  browLengthFromSlider(0.5),
  1,
  '가로 길이 슬라이더 중앙은 기존 눈썹머리·꼬리 위치를 유지한다',
);
expectEqual(
  browLengthFromSlider(1),
  BASIC_BROW_LENGTH_MAX,
  '가로 길이 슬라이더 최대는 꼬리 방향으로 1.6배 늘린다',
);
expectEqual(
  normalizeBrowLength(1),
  0.5,
  '저장된 기존 1배 가로 길이는 슬라이더 중앙으로 역매핑된다',
);

// 눈썹 '전체' 탭 = 레퍼런스 알파 모양 5종. 절차적 결·채움·한올·라이트닝 조합 룩과
// 복합 '슬림 아치'는 폐지됐고, 부위 룩은 세부부위 탭의 모양 축과 1:1이어야 한다.
const browRegionDefs = regionDefsForSlot(library, '눈썹');
expectEqual(
  // 카드 순서는 regionDefsForSlot 공통 정렬(소유자→이름) 소관이라 집합으로 비교한다.
  JSON.stringify(browRegionDefs.map(def => def.name).sort()),
  JSON.stringify(BROW_REFERENCE_SHAPES.map(shape => shape.label).sort()),
  "눈썹 '전체' 탭은 레퍼런스 알파 모양 5종만 노출한다",
);
for (const shape of BROW_REFERENCE_SHAPES) {
  const def = browRegionDefs.find(candidate => candidate.name === shape.label);
  if (!def) throw new Error(`${shape.label} 눈썹룩이 없다`);
  const applied = compileLayers(
    flattenTree(instantiate(library, def.id)!),
  ).params;
  expectEqual(
    applied.browStyleTemplate,
    shape.template,
    `${shape.label} 눈썹룩은 대응하는 레퍼런스 알파 템플릿을 그린다`,
  );
  expectEqual(
    readBrowTree(instantiate(library, def.id)).shapeValue,
    shape.value,
    `${shape.label} 눈썹룩은 세부부위 탭에서 같은 모양으로 되읽힌다`,
  );
}

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

const emphasized = patchBrowTree(recolored, library, {
  intensity: 1,
  thickness: BASIC_BROW_THICKNESS_MAX,
  length: BASIC_BROW_LENGTH_MAX,
});
const emphasizedParams = compileLayers(flattenTree(emphasized)).params;
expectEqual(
  emphasizedParams.browStyleIntensity,
  1,
  '기본 모드 눈썹 농도 최대는 실제 스타일 강도 1까지 전달된다',
);
expectEqual(
  emphasizedParams.browThickness,
  BASIC_BROW_THICKNESS_MAX,
  '기본 모드 눈썹 두께 최대는 실제 2.5배로 전달된다',
);
expectEqual(
  emphasizedParams.browLength,
  BASIC_BROW_LENGTH_MAX,
  '기본 모드 눈썹 가로 길이 최대는 실제 꼬리 길이 1.6배로 전달된다',
);
expectEqual(
  readBrowTree(emphasized).intensity,
  1,
  '트리 상태가 사용자가 조정한 최대 농도를 읽는다',
);
expectEqual(
  readBrowTree(emphasized).thickness,
  BASIC_BROW_THICKNESS_MAX,
  '트리 상태가 사용자가 조정한 최대 두께를 읽는다',
);
expectEqual(
  readBrowTree(emphasized).length,
  BASIC_BROW_LENGTH_MAX,
  '트리 상태가 사용자가 조정한 최대 가로 길이를 읽는다',
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

// ── browStyleTemplate 왕복 보존(잠복 버그 회귀 봉인) ─────────────────────────
// decomposeToTree(주입·저장 복원)가 regionOwnKeys 필터에서 template만 버리고
// styleIntensity는 살려, 스타일 눈썹이 의도한 built-in 텍스처 대신 Unity의 직전
// 템플릿(잔존 레퍼런스 마스크 포함)으로 그려지던 버그. patchBrowTree 경유 기존
// 검증(위)은 이 필터를 우회해 잠복해 있었다 — 여기서 decompose 경로를 직접 봉인.
const templateRoundTrip = compileLayers(
  flattenTree(
    decomposeToTree(
      {
        ...BARE,
        browStyleColor: '#2A1E16',
        browStyleIntensity: 0.7,
        browStyleTemplate: 2,
      },
      [],
      'template-round-trip',
    ),
  ),
).params;
expectEqual(
  templateRoundTrip.browStyleTemplate,
  2,
  'decompose 왕복이 browStyleTemplate을 보존한다',
);
expectEqual(
  templateRoundTrip.browStyleIntensity,
  0.7,
  'decompose 왕복이 browStyleIntensity를 보존한다',
);

// 전체 메이크업 룩(프리셋)도 세부부위 탭과 같은 레퍼런스 알파 눈썹을 쓴다 —
// 시스템 라이브러리와 동일한 시드 경로에서 template이 와이어까지 살아남고,
// 절차적 결·채움·펜슬은 꺼져 알파 위 덧그림이 생기지 않는다.
const REFERENCE_BROW_PRESETS: {id: string; template: number}[] = [
  {id: 'natural', template: 8},
  {id: 'rosy', template: 7},
  {id: 'peach', template: 6},
  {id: 'glam', template: 5},
  {id: 'glam2', template: 5},
  {id: 'smoky', template: 9},
];
for (const {id, template} of REFERENCE_BROW_PRESETS) {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) throw new Error(`${id} preset missing`);
  const compiled = compileLayers(
    flattenTree(decomposeToTree({...BARE, ...preset.params}, [], preset.name)),
  ).params;
  expectEqual(
    compiled.browStyleTemplate,
    template,
    `${id} 프리셋 시드가 레퍼런스 알파 template ${template}을 유지한다`,
  );
  expectEqual(
    (compiled.browIntensity ?? 0) +
      (compiled.browPowderIntensity ?? 0) +
      (compiled.browPencilIntensity ?? 0),
    0,
    `${id} 프리셋은 알파 마스크 위에 절차적 눈썹을 덧그리지 않는다`,
  );
}

// BARE 명시 0 — 전 필드 명시 관례 + 소유권 이탈 시 PASSTHROUGH 승격(carry 잔존)
// 방어. (applyFilter 자체는 메시지마다 새 wire 기본값에 역직렬화돼 병합 잔존 없음.)
expectEqual(
  compileLayers([]).params.browStyleTemplate,
  0,
  '빈 룩 컴파일이 명시 template 0을 전송한다(상시 명시 전송 관례)',
);

console.log('AR brow tree contract passed');
