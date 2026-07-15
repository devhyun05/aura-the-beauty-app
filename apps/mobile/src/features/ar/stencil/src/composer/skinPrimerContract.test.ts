import type {LeafDef} from './lookTree';
import {buildVariantLibrary} from './lookVariants';
import {REGION_MAP} from './regions';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const finishControls = REGION_MAP.skin.axes.finish ?? [];
const primerSelector = finishControls.find(
  control => control.type === 'segments' && control.key === 'skinGlow',
);

expect(
  primerSelector?.type === 'segments',
  '피부결 상세에는 윤광 슬라이더 대신 프라이머 선택지가 있어야 한다',
);

if (primerSelector?.type === 'segments') {
  const pore = primerSelector.options.find(option => option.label === '모공 프라이머');
  const glow = primerSelector.options.find(option => option.label === '윤광 프라이머');
  expect(pore?.value === 0, '모공 프라이머는 윤광을 끈다');
  expect((glow?.value ?? 0) > 0, '윤광 프라이머는 윤광을 켠다');
}

const library = buildVariantLibrary();
for (const label of ['모공 프라이머', '윤광 프라이머']) {
  const definition = Object.values(library).find(def => {
    if (def.level !== 'sub') return false;
    const leaves = def.kids as LeafDef[];
    return leaves.some(leaf => leaf.region === 'skin' && leaf.label === label);
  });
  expect(definition?.name === label, `${label}가 피부결 룩 카드 이름으로 보여야 한다`);
}

console.log('skin primer selection contract passed');
