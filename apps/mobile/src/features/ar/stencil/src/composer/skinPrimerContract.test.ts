import type {LeafDef} from './lookTree';
import {buildSystemLibrary, SKIN_TIERS} from './lookTree';
import {buildVariantLibrary} from './lookVariants';
import {REGION_MAP} from './regions';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ── 1) 피부결 상세 — 프라이머 양자택일 세그 해체, 윤광은 독립 축(강도+존) ──
//     매트(결 보정 존)와 윤광(윤광 존)이 서로 다른 존이면 동시 적용된다.
const finishControls = REGION_MAP.skin.axes.finish ?? [];
const glowSlider = finishControls.find(
  control => control.type === 'slider' && control.key === 'skinGlow',
);
expect(!!glowSlider, '윤광은 양자택일 세그가 아니라 독립 슬라이더여야 한다');
const glowZone = finishControls.find(
  control => control.type === 'segments' && control.key === 'glowShape',
);
expect(
  glowZone?.type === 'segments',
  '윤광 존 세그(glowShape)가 있어야 T존 매트+볼 윤광이 성립한다',
);
if (glowZone?.type === 'segments') {
  expect(
    glowZone.options.some(option => option.value === 3 && option.label === '볼만'),
    '윤광 존에는 볼만(3)이 있어야 매트 존과 중첩된다',
  );
}
expect(
  !finishControls.some(
    control => control.type === 'segments' && control.key === 'skinGlow',
  ),
  '모공/윤광 프라이머 양자택일 세그는 해체되어야 한다',
);

// ── 2) 피부결 리터치 축 — PR #83 파라미터(결 보존·선명도) 노출 ──
const skinOpacity = REGION_MAP.skin.axes.opacity ?? [];
for (const key of ['skinSmoothing', 'skinDetailPreservation', 'skinClarity'] as const) {
  expect(
    skinOpacity.some(control => control.type === 'slider' && control.key === key),
    `피부결 상세에 ${key} 슬라이더가 있어야 한다`,
  );
}

// ── 3) 부분 커버 — 코렉터 3슬롯(색별 강도, 중첩) + 슬롯 색 규약 ──
const coverOpacity = REGION_MAP.concealer.axes.opacity ?? [];
for (const key of [
  'correctorIntensity',
  'corrector2Intensity',
  'corrector3Intensity',
] as const) {
  expect(
    coverOpacity.some(control => control.type === 'slider' && control.key === key),
    `부분 커버 상세에 ${key} 슬라이더가 있어야 한다(색별 강도 중첩)`,
  );
}
const coverDefaults = REGION_MAP.concealer.defaults;
expect(
  coverDefaults.correctorColor === '#BFE3C8'
    && coverDefaults.corrector2Color === '#F7C9A8'
    && coverDefaults.corrector3Color === '#D9CBE8',
  '코렉터 슬롯 색 규약(1=그린 2=피치 3=라벤더)이 defaults에 고정되어야 한다',
);

// ── 4) 라이브러리 — 프라이머 2종·존 중첩 조합·티어 3종·코렉터 듀오 카드 ──
const library = buildVariantLibrary();
function findVisibleSub(
  matcher: (name: string, leaves: LeafDef[]) => boolean,
) {
  return Object.values(library).find(def => {
    if (def.level !== 'sub' || def.internal) return false;
    return matcher(def.name, def.kids as LeafDef[]);
  });
}
for (const label of ['모공 프라이머', '윤광 프라이머', 'T존 매트 + 볼 윤광']) {
  expect(
    !!findVisibleSub(
      (name, leaves) => name === label && leaves.some(leaf => leaf.region === 'skin'),
    ),
    `${label}가 피부결 룩 카드 이름으로 보여야 한다`,
  );
}
for (const tier of SKIN_TIERS) {
  expect(
    !!findVisibleSub(
      (name, leaves) => name === tier.name && leaves.some(leaf => leaf.region === 'skin'),
    ),
    `${tier.name} 티어 카드가 있어야 한다(피부결 소유 필드만)`,
  );
}
expect(
  !!findVisibleSub(
    (name, leaves) =>
      name === '그린+피치 듀오'
      && leaves.some(
        leaf => !!leaf.params.correctorIntensity && !!leaf.params.corrector2Intensity,
      ),
  ),
  '코렉터 색 중첩(그린+피치 듀오) 카드가 있어야 한다',
);

// ── 5) 프리셋 분해 — "피부결 N" 번호 카드 생성 중단(티어 이름 흡수 + internal) ──
//     잎 params는 그대로 유지된다(프리셋 시각 무손상 — 표시만 티어 룩이 담당).
const systemLibrary = buildSystemLibrary();
const visiblePresetSkinSubs = Object.values(systemLibrary).filter(
  def =>
    def.level === 'sub'
    && !def.internal
    && (def.kids as LeafDef[]).some(leaf => leaf.region === 'skin'),
);
expect(
  visiblePresetSkinSubs.length === 0,
  '프리셋 분해 skin 잎은 internal이어야 한다(세부부위 픽커 비노출)',
);
expect(
  !Object.values(systemLibrary).some(def => /^피부결( \d+)?$/.test(def.name)),
  '"피부결 N" 번호 카드가 더는 생성되지 않아야 한다',
);

console.log('skin primer selection contract passed');
