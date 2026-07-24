// 마스크·라이너 아트 참조의 저장 왕복 계약(§16).
// URI(잎 maskRef/linerStyleRef)와 임포트 마커(params[appliedKey])는 짝이다 —
// 저장 스냅샷이 URI를 떨어뜨리면 재시작 후 "마커 1 + 경로 없음" 고아가 남고,
// reconcileMasks가 setRegionMask('')로 마스크를 해제해 하부 밴드가 번들 스모키
// 실루엣(눈머리 30% 비어 있음)으로 그려진다 — 저장 직전과 다른 눈매가 된다.
import {BARE} from '../presets';
import {
  decomposeToTree,
  flattenTree,
  reviveTree,
  snapshotTree,
  registerScopedLook,
  instantiate,
  buildSystemLibrary,
  collectChanges,
  applySaveDecisions,
  updateLeaf,
  isLeaf,
} from './lookTree';

const isLeafChild = (kid: unknown): boolean =>
  Boolean(kid && typeof kid === 'object' && (kid as {kind?: string}).kind === 'app');

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

const UPPER_URI = 'streaming:catalog/mask/eye_base.png';
const LOWER_URI = 'streaming:catalog/mask/under_wash.png';

// 추천 룩 형태 — 위(surface 0) + 아래(surface 1) 밴드에 마스크 페어와 마커.
const tree = decomposeToTree(
  {...BARE, eyeshadowMaskImported: 1, eyeshadowLowerMaskImported: 1},
  [],
  '마스크 왕복',
  [],
  [
    {surface: 0, profile: 0, shape: 0, color: '#8A5A40', color2: '#8A5A40',
      intensity: 0.55, finish: 0, gradient: 0, height: 1, shimmer: 0, texture: -1,
      glossLo: 0, glossGain: 0, shimmerSize: 0, shimmerDensity: 0, matte: 0,
      sheen: 0, particleSize: 0, particleDensity: 0},
    {surface: 1, profile: 6, shape: 6, color: '#5C4A46', color2: '#5C4A46',
      intensity: 0.28, finish: 1, gradient: 0, height: 1.15, shimmer: 0, texture: -1,
      glossLo: 0, glossGain: 0, shimmerSize: 0, shimmerDensity: 0, matte: 0,
      sheen: 0, particleSize: 0, particleDensity: 0},
  ],
  [
    {region: 'eyeshadow', uri: UPPER_URI},
    {region: 'eyeshadowLower', uri: LOWER_URI},
  ],
);

const maskUris = (root: Parameters<typeof flattenTree>[0]) => {
  const found: Record<string, string> = {};
  for (const layer of flattenTree(root)) {
    if (layer.maskRef) found[layer.maskRef.region] = layer.maskRef.uri;
  }
  return found;
};

const before = maskUris(tree);
expectEqual(before.eyeshadow, UPPER_URI, '주입 직후 위 마스크 URI');
expectEqual(before.eyeshadowLower, LOWER_URI, '주입 직후 아래 마스크 URI');

// ① 스냅샷 → JSON → revive 왕복에서 URI가 살아남는다.
const revived = reviveTree(
  JSON.parse(JSON.stringify(snapshotTree(tree))),
  buildSystemLibrary(),
);
const after = maskUris(revived);
expectEqual(after.eyeshadow, UPPER_URI, '왕복 후 위 마스크 URI 보존');
expectEqual(after.eyeshadowLower, LOWER_URI, '왕복 후 아래 마스크 URI 보존');

// ② 마커와 URI는 항상 같은 잎에서 함께 산다 — 한쪽만 남으면 고아 상태다.
for (const layer of flattenTree(revived)) {
  const upperMarker = (layer.params.eyeshadowMaskImported ?? 0) > 0;
  const lowerMarker = (layer.params.eyeshadowLowerMaskImported ?? 0) > 0;
  if (upperMarker) {
    expect(
      layer.maskRef?.region === 'eyeshadow',
      '위 마스크 마커를 든 잎은 같은 슬롯 URI도 들어야 한다',
    );
  }
  if (lowerMarker) {
    expect(
      layer.maskRef?.region === 'eyeshadowLower',
      '아래 마스크 마커를 든 잎은 같은 슬롯 URI도 들어야 한다',
    );
  }
  if (layer.maskRef?.region === 'eyeshadow') {
    expect(upperMarker, '위 마스크 URI를 든 잎은 마커도 들어야 한다');
  }
  if (layer.maskRef?.region === 'eyeshadowLower') {
    expect(lowerMarker, '아래 마스크 URI를 든 잎은 마커도 들어야 한다');
  }
}

// ③ '내 룩으로 저장'(스코프 저장) → 라이브러리 정의 → 재인스턴스에서도 보존된다.
const scoped = registerScopedLook(tree, buildSystemLibrary(), 'region', '내 마스크 룩');
expect(scoped !== null, '스코프 저장이 정의를 등록한다');
const reinstantiated = instantiate(scoped!.lib, scoped!.defId);
expect(reinstantiated !== null, '스코프 저장 정의를 다시 인스턴스화할 수 있다');
const afterScoped = maskUris(reinstantiated!);
expectEqual(afterScoped.eyeshadow, UPPER_URI, '스코프 저장 후 위 마스크 URI 보존');
expectEqual(afterScoped.eyeshadowLower, LOWER_URI, '스코프 저장 후 아래 마스크 URI 보존');

// ④ 저장 시트 경로(원본 반영)도 URI를 보존한다 — 잎→정의 재료화가 인라인
// 사본이던 시절엔 여기서 URI만 증발해 이미 저장된 사용자 룩이 손상됐다.
// 저장 시트 '원본 반영'(mode='apply') — 이미 저장된 사용자 정의를 편집 후 반영하는
// 경로. 잎→정의 재료화(materializeSub)가 인라인 사본이던 시절 여기서 URI만 증발해
// 라이브러리에 손상된 정의가 영속화됐다(이미 정상 저장된 룩이 파괴됨).
const markDirty = <T,>(node: T): T => {
  const n = node as unknown as {kind?: string; kids?: unknown[]};
  if (n.kind === 'app') return {...(node as object), dirty: true} as T;
  return {
    ...(node as object),
    dirty: true,
    ...(n.kids ? {kids: n.kids.map(kid => markDirty(kid))} : {}),
  } as T;
};
const editedRoot = markDirty(scoped!.root);
const items = collectChanges(editedRoot, scoped!.lib, []).map(item => ({
  ...item,
  mode: 'apply' as const,
}));
expect(items.length > 0, '저장 시트가 변경 항목을 잡는다');
const applied = applySaveDecisions(editedRoot, scoped!.lib, items);
const reapplied = instantiate(applied.lib, scoped!.defId);
expect(reapplied !== null, '반영 후에도 원본 정의를 인스턴스화할 수 있다');
const afterApply = maskUris(reapplied!);
expectEqual(afterApply.eyeshadow, UPPER_URI, '원본 반영 후 위 마스크 URI 보존');
expectEqual(afterApply.eyeshadowLower, LOWER_URI, '원본 반영 후 아래 마스크 URI 보존');

// ⑤ 재시작을 못 견디는 URI(file://)는 URI·마커를 함께 떨어뜨린다 — 죽은 경로를
// 전송하면 Unity가 직전 룩 텍스처를 유지해 엉뚱한 마스크가 남는다.
const importedTree = decomposeToTree(
  {...BARE, eyeshadowIntensity: 0.5, eyeshadowMaskImported: 1},
  [],
  '사용자 임포트',
  [],
  [],
  [{region: 'eyeshadow', uri: 'file:///var/mobile/tmp/user-mask.png'}],
);
const importedSnap = JSON.parse(JSON.stringify(snapshotTree(importedTree)));
const importedRevived = reviveTree(importedSnap, buildSystemLibrary());
expectEqual(
  maskUris(importedRevived).eyeshadow,
  undefined,
  '죽는 file:// 경로는 저장하지 않는다',
);
for (const layer of flattenTree(importedRevived)) {
  expect(
    (layer.params.eyeshadowMaskImported ?? 0) === 0,
    'URI를 못 싣는 잎은 마커도 남기지 않는다(고아 금지)',
  );
}

// ⑥ 라이너 콜르아트 URI도 잎에 남아 왕복한다 — 강도만 남으면 setEyelinerStyle이
// 안 나가 Unity가 기본 윙 도안을 대신 그린다(마스크와 같은 고아 함정).
const LINER_URI = 'streaming:catalog/colorArt/liner_puppy.png';
const linerBase = decomposeToTree(
  {...BARE, eyelinerIntensity: 0.6, eyelinerStyleIntensity: 0.85},
  [],
  '라이너 아트',
);
const findLeafId = (node: unknown): string | undefined => {
  const n = node as {kind?: string; id?: string; kids?: unknown[]};
  if (isLeaf(n as never)) return n.id;
  for (const kid of n.kids ?? []) {
    const found = findLeafId(kid);
    if (found) return found;
  }
  return undefined;
};
const linerLeafId = findLeafId(linerBase);
expect(Boolean(linerLeafId), '라이너 잎을 찾는다');
const linerTree = updateLeaf(linerBase, linerLeafId!, {linerStyleRef: LINER_URI});
const linerRevived = reviveTree(
  JSON.parse(JSON.stringify(snapshotTree(linerTree))),
  buildSystemLibrary(),
);
expectEqual(
  flattenTree(linerRevived).find(l => l.linerStyleRef)?.linerStyleRef,
  LINER_URI,
  '왕복 후 라이너 아트 URI 보존',
);
// 죽는 file:// 라이너 경로는 저장하지 않는다(마스크와 같은 지속성 규칙).
const staleLiner = updateLeaf(linerBase, linerLeafId!, {
  linerStyleRef: 'file:///var/mobile/tmp/liner.png',
});
expectEqual(
  flattenTree(
    reviveTree(JSON.parse(JSON.stringify(snapshotTree(staleLiner))), buildSystemLibrary()),
  ).find(l => l.linerStyleRef)?.linerStyleRef,
  undefined,
  '죽는 file:// 라이너 경로는 저장하지 않는다',
);

// ⑦ 마스크 없는 룩은 스냅샷에 필드를 남기지 않는다(옛 저장물과 바이트 동일).
const plain = decomposeToTree({...BARE, lipIntensity: 0.4}, [], '마스크 없음');
const plainSnap = JSON.stringify(snapshotTree(plain));
expect(!plainSnap.includes('maskRef'), '마스크 없는 룩 스냅샷엔 maskRef 키가 없다');
expect(
  !plainSnap.includes('linerStyleRef'),
  '라이너 아트 없는 룩 스냅샷엔 linerStyleRef 키가 없다',
);

console.log('AR look mask persistence contract passed');
