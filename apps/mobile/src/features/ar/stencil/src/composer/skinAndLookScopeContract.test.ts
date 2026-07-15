import type {LookLibrary} from './lookTree';
import {
  buildSystemLibrary,
  regionDefsForSlot,
  subDefsForRegion,
} from './lookTree';
import {buildVariantLibrary} from './lookVariants';
import {PRESETS} from '../presets';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const library = {...buildSystemLibrary(), ...buildVariantLibrary()};

const upperLiner = subDefsForRegion(library, 'eyelinerUpper');
expect(
  upperLiner.every(def => def.pickerScope === 'standalone'),
  '상위 눈 룩의 내부 아이라이너가 세부부위 카드에 노출되면 안 된다',
);
const parentEyeLookNames = new Set(
  regionDefsForSlot(library, '눈').map(def => def.name),
);
expect(
  !upperLiner.some(def => parentEyeLookNames.has(def.name)),
  '상위 눈 룩 이름이 아이라인 세부부위 카드에 섞이면 안 된다',
);

const lowerLiner = subDefsForRegion(library, 'eyelinerLower');
expect(
  lowerLiner.some(def => def.name === '소프트 브라운'),
  '아이라인 하 전용 룩은 유지한다',
);

const skin = subDefsForRegion(library, 'skin');
expect(
  skin.some(def => def.name === '모공 프라이머'),
  '모공 프라이머 전용 카드를 유지한다',
);
expect(
  skin.some(def => def.name === '윤광 프라이머'),
  '윤광 프라이머 전용 카드를 유지한다',
);

expect(
  regionDefsForSlot(library, '눈').some(def => def.name === '로즈골드 시머'),
  '상위 눈 룩은 눈 전체 카드에 계속 노출되어야 한다',
);

const legacyUser: LookLibrary = {
  legacy: {
    id: 'legacy',
    name: '내 아이라인',
    level: 'sub',
    slot: '눈',
    owner: 'user',
    kids: [
      {
        label: '아이라인',
        region: 'eyelinerUpper',
        params: {eyelinerIntensity: 0.4},
      },
    ],
  },
};
expect(
  subDefsForRegion(legacyUser, 'eyelinerUpper').length === 1,
  '기존 사용자 세부부위 룩은 유지한다',
);

const presetsById = Object.fromEntries(PRESETS.map(preset => [preset.id, preset]));
expect(presetsById.bare.params.skinSmoothing === 0, '원본은 피부 보정이 없어야 한다');
expect(
  presetsById.custom.params.skinSmoothing === 0,
  '직접 시작점은 피부 보정이 없어야 한다',
);
expect(
  presetsById.natural.params.skinSmoothing === 0.53,
  '내추럴 기본 보정을 강화한다',
);
expect(presetsById.rosy.params.skinSmoothing === 0.63, '로지 기본 보정을 강화한다');
expect(
  presetsById.rosy.params.skinBrightening === 0.3,
  '파운데이션 톤업 상한의 로지 기준값은 0.3이어야 한다',
);
expect(presetsById.peach.params.skinSmoothing === 0.58, '피치 기본 보정을 강화한다');
expect(presetsById.glam.params.skinSmoothing === 0.68, '글램 기본 보정을 강화한다');
expect(presetsById.smoky.params.skinSmoothing === 0.58, '스모키 기본 보정을 강화한다');

console.log('AR skin and look-scope contract passed');
