/**
 * 시스템 부위 룩 변형 — LOOK 라이브러리 다양성 확충.
 * buildSystemLibrary(내장 프리셋 5종 분해)와 별도 함수로, 슬롯별 region 룩
 * 변형을 추가한다. App이 { ...buildSystemLibrary(), ...buildVariantLibrary() }로
 * 병합하면 ⇄ 교체 패널(regionDefsForSlot)이 level='region' 정의를 슬롯별로
 * 자동 노출한다 — 유저가 부위 단위로 조합을 최대한 다양하게 갈아끼울 수 있게.
 *
 * 규약:
 *  - id: region `sys:var:{slot}:{name}` · sub `…:s{n}` — buildSystemLibrary의
 *    `sys:{presetId}:…`/`sys:face:…`와 접두사가 달라 충돌하지 않는다.
 *  - owner='system' — 불변. 수정분은 저장 시 자동 사본(copy-on-write 규칙).
 *  - params는 각 부위 regionOwnKeys 소유 필드만(브리지 필드명 = types.ts) —
 *    컴파일이 부위 밖 필드를 오염시키지 않는다. 검증은 lookVariants.test.ts.
 *  - 같은 sub 안 잎 2장(2겹)은 겹치는 필드에서 위 잎이 이긴다(compileLayers
 *    병합 순서) — 위 겹을 끄면 아래 겹이 드러나는 스택 의미론.
 */
import type { FilterParams, LensLayer } from '../bridge/types';
import {
  AR_BLUSH_COLORS,
  AR_BLUSH_SHAPES,
} from '../../../../../shared/contracts/arBlushCatalog';
import {
  BROW_REFERENCE_SHAPES,
  DEFAULT_BROW_COLOR,
  REFERENCE_BROW_INTENSITY,
} from './browTree';
import type { LeafDef, LookLibrary, SlotKey } from './lookTree';
import type { LookMaskRef, MaskRegion, RegionKey } from './regions';

// 눈썹 부위 룩 id 슬러그 — BROW_REFERENCE_SHAPES.value(=browShape) 순서와 1:1.
// 라벨(한글)은 바뀔 수 있어도 id는 저장물 참조라 고정이다.
const BROW_LOOK_SLUGS = [
  'straight',
  'soft-straight',
  'semi-arch',
  'arch',
  'round',
] as const;
const BROW_LOOK_COLOR = DEFAULT_BROW_COLOR;
const BROW_LOOK_INTENSITY = REFERENCE_BROW_INTENSITY;

// ── 카탈로그 에셋 URI 헬퍼(§16) — 번들 StreamingAssets 상대경로(streaming: 스킴).
//    파일 실존은 catalogDefault.json 엔트리와 1:1(작성 시 검증). ──────────────────
const maskUri = (file: string): string => `streaming:catalog/mask/${file}.png`;
/** 부위별 카탈로그 마스크 참조 한 장(잎 maskRef). */
const mask = (region: MaskRegion, file: string): LookMaskRef => ({
  region,
  uri: maskUri(file),
});

interface LeafSpec {
  label: string;
  // 'eyeshadowLower'는 경계 유사-부위 — leafFromDef의 migrateLegacyEyeshadowLayer가
  // eyeshadow(surface=아래)로 변환한다(newLayer·migrate 선례). 아래 섀도 마스크 룩용.
  region: RegionKey | 'eyeshadowLower';
  params: Partial<FilterParams>;
  /** 동일 제품을 여러 해부학 존에 나눠 바르는 경우에도 제품 정체성을 보존한다. */
  productId?: string;
  /** 렌즈 세부(#25) payload — region이 lensBase/lensDetail/lensRim일 때 */
  lens?: LensLayer;
  /** 역할 태그(§5 A13) — 같은 부위 다겹의 배치 역할(핏 '.부위[역할]' 셀렉터 대상) */
  role?: string;
  /** 자유 배치 데코 payload — FilterParams 무소유 부위가 직접 캐리한다. */
  overlay?: LeafDef['overlay'];
  /** 카탈로그 마스크 참조(§16) — 부위 스텐실 URI. 룩 적용 시 App이 세션 경로에 주입.
   *  마커(params[…MaskImported])도 함께 세워야 reconcileMasks가 set한다. */
  maskRef?: LookMaskRef;
  /** 아이라이너 콜르아트 참조(§16) — setEyelinerStyle URI. gate=eyelinerStyleIntensity. */
  linerStyleRef?: string;
}

interface SubSpec {
  name: string;
  leaves: LeafSpec[];
}

function addRegionLook(
  lib: LookLibrary,
  slotSlug: string,
  nameSlug: string,
  name: string,
  slot: SlotKey,
  subs: SubSpec[],
  exposeAtRegionLevel = true,
): void {
  const regionId = `sys:var:${slotSlug}:${nameSlug}`;
  // 내부 파트 판정(구조 기준, 이름 무관): 부위 룩으로 노출되는 **복합** 룩(파트 2개
  // 이상)의 sub는 그 룩의 조각일 뿐이다 — 파트 이름('파운데이션'·'라이너'·'렌즈')이
  // 룩 이름이 아니라 역할명이라 세부부위 카드에 단독으로 띄우면 출처를 알 수 없다
  // (글로우/세미매트/커버의 "파운데이션" 3장이 동명으로 섞이던 버그). 반대로
  //  · 파트 1개짜리 부위 룩 → sub가 곧 룩 전체(coextensive) → 노출 유지
  //  · exposeAtRegionLevel=false → region 래퍼가 없어 sub가 유일한 선택 경로 →
  //    반드시 노출(하이라이터·컨투어 등 전용 세부부위 룩)
  const internal = exposeAtRegionLevel && subs.length > 1;
  // 단일 파트(subs.length===1)면 sub ≡ 룩 전체(coextensive) — 세부부위 카드에 그
  // 파트의 제품명(SubSpec.name, 예 "블러셔")이 아니라 룩 이름(예 "클래식 로즈")을
  // 써야 같은 카드 안에서 서로 다른 룩을 구분할 수 있다("블러셔"×6 동명 문제).
  // 제품명은 leaf.label에 그대로 남아 잎 표시(ComposerSheet)에서 보존된다.
  // 파트 2개 이상(internal)은 역할명이 맞는 이름이라 건드리지 않는다.
  const subIds = subs.map((sub, i) => {
    const subId = `${regionId}:s${i}`;
    lib[subId] = {
      id: subId,
      name: subs.length === 1 ? name : sub.name,
      level: 'sub',
      slot,
      owner: 'system',
      ...(internal ? { internal: true } : {}),
      kids: sub.leaves.map(leaf => ({
        label: leaf.label,
        // 'eyeshadowLower' 경계 유사-부위는 leafFromDef가 eyeshadow로 마이그레이션한다.
        region: leaf.region as RegionKey,
        params: { ...leaf.params },
        ...(leaf.productId ? { productId: leaf.productId } : {}),
        ...(leaf.lens ? { lens: { ...leaf.lens } } : {}),
        ...(leaf.role ? { role: leaf.role } : {}),
        ...(leaf.overlay ? { overlay: { ...leaf.overlay } } : {}),
        ...(leaf.maskRef ? { maskRef: { ...leaf.maskRef } } : {}),
        ...(leaf.linerStyleRef ? { linerStyleRef: leaf.linerStyleRef } : {}),
      })),
    };
    return subId;
  });
  if (exposeAtRegionLevel) {
    lib[regionId] = {
      id: regionId,
      name,
      level: 'region',
      slot,
      owner: 'system',
      kids: subIds,
    };
  }
}

/** 잎 1장짜리 sub 하나 — 립/블러셔처럼 단순한 룩의 축약 */
function single(
  name: string,
  region: RegionKey | 'eyeshadowLower', // 유사-부위는 leafFromDef가 마이그레이션
  params: Partial<FilterParams>,
): SubSpec[] {
  return [{ name, leaves: [{ label: name, region, params }] }];
}

/** LeafSpec → 직렬화 LeafDef 잎(카탈로그 마스크·라이너 참조 포함). addFaceLook 전용. */
function specToLeafDef(leaf: LeafSpec): LeafDef {
  return {
    label: leaf.label,
    // 'eyeshadowLower' 경계 유사-부위는 leafFromDef가 eyeshadow로 마이그레이션한다.
    region: leaf.region as RegionKey,
    params: { ...leaf.params },
    ...(leaf.productId ? { productId: leaf.productId } : {}),
    ...(leaf.lens ? { lens: { ...leaf.lens } } : {}),
    ...(leaf.role ? { role: leaf.role } : {}),
    ...(leaf.overlay ? { overlay: { ...leaf.overlay } } : {}),
    ...(leaf.maskRef ? { maskRef: { ...leaf.maskRef } } : {}),
    ...(leaf.linerStyleRef ? { linerStyleRef: leaf.linerStyleRef } : {}),
  };
}

/**
 * 전체(face) 룩(§16) — 여러 슬롯을 가로지르는 완성 메이크업 1장을 라이브러리에 등록한다.
 * buildSystemLibrary가 PRESETS를 분해해 만드는 face 룩과 동형 구조(face→region→sub→leaf)
 * 이나, 여기선 잎이 카탈로그 마스크·라이너 콜르아트를 직접 참조할 수 있다(프리셋 flat
 * params는 마스크 URI를 담지 못하므로). presetId는 presets.ts의 칩용 PRESETS 항목 id와
 * 1:1 — selectLook(presetId)이 faceLookIdForPreset(presetId)로 이 def를 인스턴스화한다.
 * parts는 각각 한 sub(= 한 RegionKey 파트)이며, 같은 슬롯 파트들은 한 region def로 묶인다.
 */
function addFaceLook(
  lib: LookLibrary,
  presetId: string,
  name: string,
  parts: { slot: SlotKey; subName: string; leaves: LeafSpec[] }[],
): void {
  const faceId = `sys:face:${presetId}`;
  const subsBySlot = new Map<SlotKey, string[]>();
  parts.forEach((part, i) => {
    const subId = `${faceId}:s${i}`;
    lib[subId] = {
      id: subId,
      name: part.subName,
      level: 'sub',
      slot: part.slot,
      owner: 'system',
      internal: true, // 파트=완성 룩의 조각 — 세부부위 카드에 단독 노출하지 않는다.
      kids: part.leaves.map(specToLeafDef),
    };
    const arr = subsBySlot.get(part.slot) ?? [];
    arr.push(subId);
    subsBySlot.set(part.slot, arr);
  });
  const regionIds: string[] = [];
  let ri = 0;
  for (const [slot, subIds] of subsBySlot) {
    const regionId = `${faceId}:r${ri}`;
    ri += 1;
    lib[regionId] = {
      id: regionId,
      name: `${name} ${slot}`,
      level: 'region',
      slot,
      owner: 'system',
      kids: subIds,
    };
    regionIds.push(regionId);
  }
  lib[faceId] = {
    id: faceId,
    name,
    level: 'face',
    slot: '피부',
    owner: 'system',
    kids: regionIds,
  };
}

/**
 * 부위 룩 변형 라이브러리 — 립 8 · 눈 6 · 블러셔 6 · 눈썹 5(레퍼런스 모양) · 피부 3.
 * buildSystemLibrary와 시그니처·결과를 공유하는 별도 진입점(기존 함수 무변경).
 */
export function buildVariantLibrary(): LookLibrary {
  const lib: LookLibrary = {};

  // ── 메인립 6종 — "색만". 마감(글로시/매트/시머)·질감·라이너를 섞지 않는다(조합 금지).
  //    메인립은 입술 메인 색을 풀로 칠하는 단일 색 레이어일 뿐이고, 마감은 상세 모드 마감
  //    축에서, 광은 립글로스 세부부위에서 따로 쌓는다. 농도(lipIntensity)는 색 밝기로 체감을
  //    맞춘다(밝은 색↑·어두운 색↓). 유사색이던 MLBB·피치는 정리해 제거(6색 또렷이 구분).
  addRegionLook(lib, 'lip', 'rose', '로즈', '립',
    single('로즈', 'lip', { lipColor: '#D96C7B', lipIntensity: 0.55, lipEdgeFeather: 0.35 }));
  addRegionLook(lib, 'lip', 'coral', '코랄', '립',
    single('코랄', 'lip', { lipColor: '#F2846B', lipIntensity: 0.6, lipEdgeFeather: 0.35 }));
  addRegionLook(lib, 'lip', 'mauve', '모브', '립',
    single('모브', 'lip', { lipColor: '#A8647E', lipIntensity: 0.52, lipEdgeFeather: 0.35 }));
  addRegionLook(lib, 'lip', 'red', '레드', '립',
    single('레드', 'lip', { lipColor: '#B01E3C', lipIntensity: 0.5, lipEdgeFeather: 0.35 }));
  addRegionLook(lib, 'lip', 'burgundy', '버건디', '립',
    single('버건디', 'lip', { lipColor: '#9E3B54', lipIntensity: 0.48, lipEdgeFeather: 0.35 }));
  addRegionLook(lib, 'lip', 'orange', '오렌지', '립',
    single('오렌지', 'lip', { lipColor: '#E8703C', lipIntensity: 0.58, lipEdgeFeather: 0.35 }));

  // ── 그라데이션 립 3종 — 전용 '그라데이션' 세부부위(lipGradient)로 카테고리(서브탭) 노출.
  //    "색만" 칠한다(글로스·광은 넣지 않음 — 립글로스 탭에서 레이어로 따로 쌓는다).
  //    · lipColor(바깥 옅은 톤) → lipColor2(안쪽 짙은 톤), lipGradient 혼합, lipShape=1(중앙 집중)
  //      = "안쪽 진하고 바깥 연한" 그라데. lipFinish=0(새틴)로 깔끔한 색.
  addRegionLook(lib, 'lip-gradient', 'rose-gradient', '로즈 그라데', '립',
    single('로즈 그라데', 'lipGradient', {
      lipColor: '#DC6F87', lipColor2: '#AE2647', lipGradient: 0.82, lipShape: 1,
      lipIntensity: 0.82, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);
  addRegionLook(lib, 'lip-gradient', 'coral-gradient', '코랄 그라데', '립',
    single('코랄 그라데', 'lipGradient', {
      lipColor: '#EE8062', lipColor2: '#CE3E22', lipGradient: 0.82, lipShape: 1,
      lipIntensity: 0.82, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);
  addRegionLook(lib, 'lip-gradient', 'berry-gradient', '베리 그라데', '립',
    single('베리 그라데', 'lipGradient', {
      lipColor: '#C55766', lipColor2: '#8E1226', lipGradient: 0.85, lipShape: 1,
      lipIntensity: 0.8, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);
  addRegionLook(lib, 'lip-gradient', 'pink-gradient', '핑크 그라데', '립',
    single('핑크 그라데', 'lipGradient', {
      lipColor: '#E98BAA', lipColor2: '#C63A6E', lipGradient: 0.82, lipShape: 1,
      lipIntensity: 0.8, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);
  addRegionLook(lib, 'lip-gradient', 'orange-gradient', '오렌지 그라데', '립',
    single('오렌지 그라데', 'lipGradient', {
      lipColor: '#F1976C', lipColor2: '#DA531E', lipGradient: 0.82, lipShape: 1,
      lipIntensity: 0.8, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);
  addRegionLook(lib, 'lip-gradient', 'mauve-gradient', '모브 그라데', '립',
    single('모브 그라데', 'lipGradient', {
      lipColor: '#B47C92', lipColor2: '#793858', lipGradient: 0.82, lipShape: 1,
      lipIntensity: 0.78, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);
  addRegionLook(lib, 'lip-gradient', 'plum-gradient', '플럼 그라데', '립',
    single('플럼 그라데', 'lipGradient', {
      lipColor: '#9C6580', lipColor2: '#571F3F', lipGradient: 0.85, lipShape: 1,
      lipIntensity: 0.78, lipEdgeFeather: 0.35, lipFinish: 0,
    }), false);

  // ── 눈 6종 — 섀도 색·finish·강도 변형, 일부는 라이너 스타일/질감 조합.
  //    스모키·글리터는 같은 부위 2겹 스택 예시(위 겹이 기본, 끄면 베이스).
  addRegionLook(lib, 'eye', 'daily-brown', '데일리 브라운', '눈', [
    {
      name: '섀도',
      leaves: [{
        label: '아이섀도',
        region: 'eyeshadow',
        role: 'main',
        params: { eyeshadowColor: '#C29A7B', eyeshadowIntensity: 0.5, eyeshadowFinish: 0 },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'rosegold', '로즈골드 시머', '눈', [
    {
      name: '섀도',
      leaves: [{
        label: '아이섀도',
        region: 'eyeshadow',
        role: 'main',
        params: {
          eyeshadowColor: '#D89AA0',
          eyeshadowIntensity: 0.6,
          eyeshadowFinish: 3,
          eyeshadowShimmer: 0.6,
        },
      }],
    },
    {
      name: '라이너',
      leaves: [{
        label: '아이라인 상',
        region: 'eyelinerUpper',
        params: {
          eyelinerColor: '#5A4433',
          eyelinerIntensity: 0.6,
          eyelinerStyle: 0,
          eyelinerTexture: 2, // 펜슬 — 부드러운 로즈골드 무드
          eyelinerFinish: 1, // 구 새틴은 로컬 도메인에 없어 매트로 안전 치환
        },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'smoky', '스모키 스택', '눈', [
    {
      name: '섀도 2겹',
      leaves: [
        {
          label: '베이스 브라운',
          region: 'eyeshadow',
          role: 'base',
          params: { eyeshadowColor: '#8A5A44', eyeshadowIntensity: 0.6, eyeshadowFinish: 0 },
        },
        {
          // 위 겹이 기본으로 이긴다 — 끄면 베이스 브라운만 남는 2겹 스택
          label: '딥 스모키',
          region: 'eyeshadow',
          role: 'point',
          params: {
            eyeshadowColor: '#5C4A46',
            eyeshadowIntensity: 0.78,
            eyeshadowFinish: 1,
            eyeshadowHeight: 1.25,
          },
        },
      ],
    },
    {
      name: '라이너',
      leaves: [{
        label: '아이라인 상',
        region: 'eyelinerUpper',
        params: {
          eyelinerColor: '#141014',
          eyelinerIntensity: 0.7,
          eyelinerStyle: 0,
          eyelinerTexture: 1, // 젤 — 진하고 뭉근한 라인
          eyelinerFinish: 1,
          eyelinerThickness: 1.3,
        },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'coral', '코랄 데일리', '눈', [
    {
      name: '섀도',
      leaves: [{
        label: '아이섀도',
        region: 'eyeshadow',
        role: 'main',
        params: { eyeshadowColor: '#E0A183', eyeshadowIntensity: 0.55, eyeshadowFinish: 0 },
      }],
    },
    {
      name: '라이너',
      leaves: [{
        label: '아이라인 상',
        region: 'eyelinerUpper',
        params: {
          eyelinerColor: '#6E3A2A',
          eyelinerIntensity: 0.5,
          eyelinerStyle: 2, // 가로 롱 — 데일리 무드
          eyelinerTexture: 0,
          eyelinerFinish: 1, // 구 새틴은 로컬 도메인에 없어 매트로 안전 치환
        },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'mauve', '모브 무드', '눈', [
    {
      name: '섀도',
      leaves: [{
        label: '아이섀도',
        region: 'eyeshadow',
        role: 'main',
        params: { eyeshadowColor: '#6E5A8A', eyeshadowIntensity: 0.6, eyeshadowFinish: 1 },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'glitter', '글리터 팝', '눈', [
    {
      name: '섀도 2겹',
      leaves: [
        {
          label: '베이스 새틴',
          region: 'eyeshadow',
          role: 'base',
          params: { eyeshadowColor: '#C29A7B', eyeshadowIntensity: 0.5, eyeshadowFinish: 0 },
        },
        {
          label: '글리터 토퍼',
          region: 'eyeshadow',
          role: 'point',
          params: {
            eyeshadowColor: '#D8B49A',
            eyeshadowIntensity: 0.65,
            eyeshadowFinish: 3,
            eyeshadowShimmer: 0.9,
          },
        },
      ],
    },
  ]);

  // ── 렌즈 레이어드 3종(#25) — 3세부(베이스/내부/림) 조합. 절차 방사 그라데(디자인
  //    임포트 없이). 그레이 서클=베이스+림, 헤이즐 그라데=베이스+내부, 브라운=베이스 단독.
  addRegionLook(lib, 'eye', 'lens-gray-circle', '그레이 서클렌즈', '렌즈', [
    {
      name: '렌즈',
      leaves: [{
        label: '베이스 컬러',
        region: 'lensBase',
        params: {},
        lens: { part: 0, color: '#8A8F96', blendMode: 1, intensity: 0.5, inner: 0, outer: 1 },
      }],
    },
    {
      name: '렌즈',
      leaves: [{
        label: '테두리 림',
        region: 'lensRim',
        params: {},
        lens: { part: 2, color: '#2A2A2E', blendMode: 1, intensity: 0.65, inner: 0.8, outer: 1 },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'lens-hazel', '헤이즐 그라데', '렌즈', [
    {
      name: '렌즈',
      leaves: [{
        label: '베이스 컬러',
        region: 'lensBase',
        params: {},
        lens: { part: 0, color: '#8A6A4A', blendMode: 3, intensity: 0.45, inner: 0, outer: 1 },
      }],
    },
    {
      name: '렌즈',
      leaves: [{
        label: '내부 디테일',
        region: 'lensDetail',
        params: {},
        lens: { part: 1, color: '#B79A5A', blendMode: 2, intensity: 0.4, inner: 0, outer: 0.5 },
      }],
    },
  ]);
  addRegionLook(lib, 'eye', 'lens-brown', '브라운 내추럴', '렌즈', [
    {
      name: '렌즈',
      leaves: [
        {
          label: '베이스 컬러',
          region: 'lensBase',
          params: {},
          lens: { part: 0, color: '#6E5038', blendMode: 1, intensity: 0.5, inner: 0, outer: 1 },
        },
      ],
    },
  ]);

  // ── 블러셔 6종 — 기존 룩 ID는 유지하고 표시 이름은 실제 색상과 맞춘다.
  addRegionLook(lib, 'blush', 'classic-rose', '클래식 로즈', '컨투어',
    single('블러셔', 'blush', {
      blushShape: AR_BLUSH_SHAPES[0].value,
      blushColor: AR_BLUSH_COLORS[3].hex,
      blushIntensity: 0.72,
      blushFinish: 0,
      blushLift: AR_BLUSH_SHAPES[0].lift,
      blushSpread: AR_BLUSH_SHAPES[0].spread,
    }));
  addRegionLook(lib, 'blush', 'classic-peach', '클래식 피치 베이지 시머', '컨투어',
    single('블러셔', 'blush', {
      blushShape: AR_BLUSH_SHAPES[0].value,
      blushColor: AR_BLUSH_COLORS[1].hex,
      blushIntensity: 0.68,
      blushFinish: 3,
      blushShimmer: 0.4,
      blushLift: AR_BLUSH_SHAPES[0].lift,
      blushSpread: AR_BLUSH_SHAPES[0].spread,
    }));
  addRegionLook(lib, 'blush', 'igari-coral', '이가리 살구 코랄', '컨투어',
    single('블러셔', 'blush', {
      blushShape: AR_BLUSH_SHAPES[1].value,
      blushColor: AR_BLUSH_COLORS[0].hex,
      blushIntensity: 0.82,
      blushFinish: 0,
      blushLift: AR_BLUSH_SHAPES[1].lift,
      blushSpread: AR_BLUSH_SHAPES[1].spread,
    }));
  addRegionLook(lib, 'blush', 'igari-mauve', '이가리 라일락 모브', '컨투어',
    single('블러셔', 'blush', {
      blushShape: AR_BLUSH_SHAPES[1].value,
      blushColor: AR_BLUSH_COLORS[6].hex,
      blushIntensity: 0.7,
      blushFinish: 1,
      blushLift: AR_BLUSH_SHAPES[1].lift,
      blushSpread: AR_BLUSH_SHAPES[1].spread,
    }));
  addRegionLook(lib, 'blush', 'draping-rose', '드레이핑 소프트 레드', '컨투어',
    single('블러셔', 'blush', {
      blushShape: AR_BLUSH_SHAPES[2].value,
      blushColor: AR_BLUSH_COLORS[4].hex,
      blushIntensity: 0.78,
      blushFinish: 0,
      blushLift: AR_BLUSH_SHAPES[2].lift,
      blushSpread: AR_BLUSH_SHAPES[2].spread,
    }));
  addRegionLook(lib, 'blush', 'draping-lift', '드레이핑 베리', '컨투어',
    single('블러셔', 'blush', {
      blushShape: AR_BLUSH_SHAPES[2].value,
      blushColor: AR_BLUSH_COLORS[7].hex,
      blushIntensity: 0.8,
      blushFinish: 0,
      blushLift: AR_BLUSH_SHAPES[2].lift,
      blushSpread: AR_BLUSH_SHAPES[2].spread,
    }));

  // ── 눈썹 5종 — 세부부위 '눈썹' 탭(BasicMode 눈썹 모양 축)의 레퍼런스 알파 에셋을
  //    그대로 부위 룩으로 승격한 것이다. 절차적 결·채움·한올 조합(구 4종)은 알파
  //    마스크 위에 기하학 밴드를 덧그려 어긋났고, 사용자가 실제로 고르는 축은 모양
  //    5종이라 '전체' 탭 = 모양 5장으로 통일했다.
  //    params는 patchBrowTree(세부부위 탭 탭 한 번)가 만드는 값과 1:1 —
  //    browStyle 잎 한 장(템플릿=알파 에셋, browShape=밴드 기하)이라 ensureBrowTree가
  //    정규화 없이 그대로 통과시키고, 두 경로가 픽셀 단위로 같은 눈썹을 그린다.
  BROW_REFERENCE_SHAPES.forEach(shape => {
    addRegionLook(lib, 'brow', BROW_LOOK_SLUGS[shape.value], shape.label, '눈썹',
      single(shape.label, 'browStyle', {
        browStyleTemplate: shape.template,
        browStyleColor: BROW_LOOK_COLOR,
        browStyleIntensity: BROW_LOOK_INTENSITY,
        browShape: shape.value,
        browThicknessProfile: 2,
        browThickness: 1,
        browLength: 1,
        browArch: 0.08,
      }));
  });

  // ── 피부 3종 — 카탈로그 "피부 — 베이스" 제형 잎으로. 글로우/세미매트/커버.
  //    각 잎은 부위 소유 필드만(tone=skinBrightening/toneBaseColor,
  //    skin=skinSmoothing/skinDetailPreservation/skinClarity/skinGlow(+skinShape/glowShape),
  //    foundation=foundationColor/Intensity/Finish, powder=powderIntensity,
  //    concealer=concealerColor/Intensity + blemishRemoval/corrector*).
  addRegionLook(lib, 'skin', 'glow', '글로우 스킨', '피부', [
    {
      name: '톤 베이스',
      leaves: [{
        label: '피치 베이스', // 언더톤=색 캐스트 보정(메이크업 베이스) — 정본 정합
        region: 'tone',
        params: { skinBrightening: 0.3, toneBaseColor: '#FBE6D8' },
      }],
    },
    {
      name: '질감 베이스',
      leaves: [{
        label: '윤광 프라이머',
        region: 'skin',
        params: { skinSmoothing: 0.35, skinDetailPreservation: 0.7, skinGlow: 0.5 },
      }],
    },
    {
      name: '파운데이션',
      leaves: [{
        label: '스킨틴트',
        region: 'foundation',
        params: { foundationColor: '#EFD0BC', foundationIntensity: 0.3, foundationFinish: 2, foundationTexture: 4 }, // 스킨틴트
      }],
    },
  ]);
  addRegionLook(lib, 'skin', 'semi-matte', '세미매트 스킨', '피부', [
    {
      name: '질감 베이스',
      leaves: [{
        label: '모공 프라이머',
        region: 'skin',
        params: { skinSmoothing: 0.5, skinDetailPreservation: 0.65, skinClarity: -0.1 },
      }],
    },
    {
      name: '파운데이션',
      leaves: [{
        label: '쿠션 파운데이션',
        region: 'foundation',
        params: { foundationColor: '#E8C4A8', foundationIntensity: 0.5, foundationFinish: 0, foundationTexture: 1 }, // 쿠션
      }],
    },
    {
      name: '파우더',
      leaves: [{
        label: '트랜스루선트 파우더',
        region: 'powder',
        params: { powderIntensity: 0.3, powderTexture: 0 }, // 루스 트랜스루선트 파우더
      }],
    },
  ]);
  addRegionLook(lib, 'skin', 'cover', '커버 스킨', '피부', [
    {
      name: '파운데이션',
      leaves: [{
        label: '리퀴드 파운데이션',
        region: 'foundation',
        params: { foundationColor: '#DFB79A', foundationIntensity: 0.65, foundationFinish: 0 },
      }],
    },
    {
      name: '부분 커버',
      leaves: [{
        label: '컨실러',
        region: 'concealer',
        params: { concealerColor: '#F0DCC8', concealerIntensity: 0.5 },
      }],
    },
    {
      name: '파우더',
      leaves: [{
        label: '트랜스루선트 파우더',
        region: 'powder',
        params: { powderIntensity: 0.5, powderTexture: 0 }, // 루스 트랜스루선트 파우더
      }],
    },
  ]);

  // ── 세부부위 룩 — BasicMode의 세부부위 탭은 level='sub' 정의를 직접 조회한다.
  //    기존 '전체' 탭의 슬롯 룩 목록과 섞이지 않도록 region 래퍼는 만들지 않는다.

  // 질감 프라이머 2종 — 위 피부 3종의 '질감 베이스' 파트가 쓰던 params 그대로.
  //  (복합 룩의 내부 파트는 세부부위 카드에 안 뜬다 — 여기서 standalone으로 제공)
  //  윤광은 독립 축(skinGlow+glowShape)이라 모공 매트와 양자택일이 아니다 — 존이
  //  다르면 동시 적용(아래 'T존 매트 + 볼 윤광' 조합 참조).
  addRegionLook(lib, 'skin-prime', 'glow-primer', '윤광 프라이머', '피부',
    single('윤광 프라이머', 'skin', {
      skinSmoothing: 0.35,
      skinDetailPreservation: 0.7,
      skinGlow: 0.5,
      glowShape: 0, // 전체 — 존은 상세 패널 세그에서
    }), false);
  addRegionLook(lib, 'skin-prime', 'pore-primer', '모공 프라이머', '피부',
    single('모공 프라이머', 'skin', {
      skinSmoothing: 0.5,
      skinDetailPreservation: 0.7,
      skinShape: 0, // 전체 — T존만 등은 상세 패널 세그에서
    }), false);
  // 존별 중첩 조합 — 매트(결 보정)는 T존, 윤광은 볼만: 한 잎에서 두 프라이머 동시.
  addRegionLook(lib, 'skin-prime', 'tzone-matte-cheek-glow', 'T존 매트 + 볼 윤광', '피부',
    single('T존 매트 + 볼 윤광', 'skin', {
      skinSmoothing: 0.5,
      skinDetailPreservation: 0.7,
      skinShape: 1, // T존
      skinGlow: 0.5,
      glowShape: 3, // 볼만
    }), false);

  // 피부결 리터치 티어 3종 — 프리셋 분해가 만들던 "피부결 N" 번호 카드를 흡수하는
  //  강도 프리셋. 피부결 소유 필드만 만진다(부위 소유 원칙 — 잡티·코렉터는 부분
  //  커버 소유, 티어와 독립). 값은 lookTree SKIN_TIERS와 정합.
  addRegionLook(lib, 'skin-tier', 'natural', '내추럴 보정', '피부',
    single('내추럴 보정', 'skin', {
      skinSmoothing: 0.3,
      skinDetailPreservation: 0.8,
      skinClarity: 0.1,
    }), false);
  addRegionLook(lib, 'skin-tier', 'soft', '소프트 보정', '피부',
    single('소프트 보정', 'skin', {
      skinSmoothing: 0.5,
      skinDetailPreservation: 0.6,
      skinClarity: -0.2,
    }), false);
  addRegionLook(lib, 'skin-tier', 'full', '풀 보정', '피부',
    single('풀 보정', 'skin', {
      skinSmoothing: 0.7,
      skinDetailPreservation: 0.4,
      skinClarity: 0,
    }), false);

  // 파운데이션 3종 — 제형(FOUNDATION_TEXTURES) × 마감. 색·커버리지·마감은 피부 3종의
  //    '파운데이션' 파트 값 재사용(스킨틴트/쿠션/리퀴드), 제형만 라벨에 맞춰 명시.
  addRegionLook(lib, 'foundation', 'skin-tint', '스킨틴트 듀이', '피부',
    single('스킨틴트 듀이', 'foundation', {
      foundationTexture: 4,
      foundationColor: '#EFD0BC',
      foundationIntensity: 0.3,
      foundationFinish: 2,
    }), false);
  addRegionLook(lib, 'foundation', 'cushion', '쿠션 새틴', '피부',
    single('쿠션 새틴', 'foundation', {
      foundationTexture: 1,
      foundationColor: '#E8C4A8',
      foundationIntensity: 0.5,
      foundationFinish: 0,
    }), false);
  addRegionLook(lib, 'foundation', 'liquid-cover', '리퀴드 커버', '피부',
    single('리퀴드 커버', 'foundation', {
      foundationTexture: 0,
      foundationColor: '#DFB79A',
      foundationIntensity: 0.65,
      foundationFinish: 0,
    }), false);

  // 컨실러 2종 — 커버 스킨의 '부분 커버' 파트 색 그대로, 강도만 단계화.
  addRegionLook(lib, 'concealer', 'natural-cover', '내추럴 컨실', '피부',
    single('내추럴 컨실', 'concealer', {
      concealerColor: '#F0DCC8',
      concealerIntensity: 0.35,
    }), false);
  addRegionLook(lib, 'concealer', 'full-cover', '풀 커버 컨실', '피부',
    single('풀 커버 컨실', 'concealer', {
      concealerColor: '#F0DCC8',
      concealerIntensity: 0.5,
    }), false);
  // 컬러 코렉터 — 자동 셀렉터 3슬롯(색별 강도, 중첩 가능). 구 컨실러 레거시 경로
  //  (concealerColor 스와치 판별) 대신 corrector* 슬롯 키를 직접 쓴다. 슬롯 규약:
  //  1=그린(홍조) 2=피치(다크서클) 3=라벤더(누런기) — regions.ts defaults와 동일.
  addRegionLook(lib, 'concealer', 'green-corrector', '그린 코렉터', '피부',
    single('그린 코렉터', 'concealer', {
      correctorColor: '#BFE3C8', // 붉은 트러블·홍조 중화
      correctorIntensity: 0.4,
    }), false);
  addRegionLook(lib, 'concealer', 'peach-undereye', '피치 다크서클', '피부',
    single('피치 다크서클', 'concealer', {
      corrector2Color: '#F7C9A8', // 다크서클(푸른 그늘) 중화
      corrector2Intensity: 0.42,
    }), false);
  addRegionLook(lib, 'concealer', 'lavender-bright', '라벤더 브라이트', '피부',
    single('라벤더 브라이트', 'concealer', {
      corrector3Color: '#D9CBE8', // 노란기 중화
      corrector3Intensity: 0.35,
    }), false);
  // 색 중첩 조합 — 홍조와 다크서클을 한 번에(슬롯 1+2 동시).
  addRegionLook(lib, 'concealer', 'green-peach-duo', '그린+피치 듀오', '피부',
    single('그린+피치 듀오', 'concealer', {
      correctorColor: '#BFE3C8',
      correctorIntensity: 0.4,
      corrector2Color: '#F7C9A8',
      corrector2Intensity: 0.4,
    }), false);

  // 파우더 2종 — 무색(POWDER_COLORS[0] 트랜스루선트)에 매트화 강도만 2단(세미매트·커버 파트 값).
  addRegionLook(lib, 'powder', 'translucent-soft', '트랜스루선트 소프트', '피부',
    single('트랜스루선트 소프트', 'powder', {
      powderColor: '#FFFFFF',
      powderIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'powder', 'translucent-matte', '트랜스루선트 매트', '피부',
    single('트랜스루선트 매트', 'powder', {
      powderColor: '#FFFFFF',
      powderIntensity: 0.5,
    }), false);
  // 컬러·존·펄 3종 — POWDER_COLORS 캐스트 + 존(전체/T존)·시머 마감 축 조합.
  addRegionLook(lib, 'powder', 'pink-toneup', '핑크 톤업 파우더', '피부',
    single('핑크 톤업 파우더', 'powder', {
      powderColor: '#FBE8EC', // 핑크 톤업
      powderIntensity: 0.4,
    }), false);
  addRegionLook(lib, 'powder', 'tzone-set', 'T존 세팅', '피부',
    single('T존 세팅', 'powder', {
      powderColor: '#FFFFFF',
      powderShape: 1, // T존
      powderIntensity: 0.5,
    }), false);
  addRegionLook(lib, 'powder', 'pearl-finish', '펄 피니시 파우더', '피부',
    single('펄 피니시 파우더', 'powder', {
      powderColor: '#FAE9DC', // 피치 세팅
      powderFinish: 3, // 시머
      powderShimmer: 0.4,
      powderIntensity: 0.35,
    }), false);

  // 렌즈 내부·림 — 레이어드 렌즈 3종의 내부 파트가 쓰던 lens payload 그대로 단독 제공.
  addRegionLook(lib, 'lens-detail', 'hazel-gradient', '헤이즐 디테일', '렌즈', [
    {
      name: '헤이즐 디테일',
      leaves: [{
        label: '내부 디테일',
        region: 'lensDetail',
        params: {},
        lens: { part: 1, color: '#B79A5A', blendMode: 2, intensity: 0.4, inner: 0, outer: 0.5 },
      }],
    },
  ], false);
  addRegionLook(lib, 'lens-rim', 'dark-rim', '다크 림', '렌즈', [
    {
      name: '다크 림',
      leaves: [{
        label: '테두리 림',
        region: 'lensRim',
        params: {},
        lens: { part: 2, color: '#2A2A2E', blendMode: 1, intensity: 0.65, inner: 0.8, outer: 1 },
      }],
    },
  ], false);

  // 눈썹 라이트너 2종 — 소프트 라이트닝의 파트 값(0.5) 기준으로 강도만 2단.
  addRegionLook(lib, 'brow-lightener', 'soft-lighten', '소프트 라이트너', '눈썹',
    single('소프트 라이트너', 'browLightener', {
      browLightenerIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'brow-lightener', 'full-lighten', '풀 라이트너', '눈썹',
    single('풀 라이트너', 'browLightener', {
      browLightenerIntensity: 0.5,
    }), false);
  // 제형·마감 변주 2종 — 색 축이 없는 부위라 텍스처·마감으로 성격을 가른다.
  addRegionLook(lib, 'brow-lightener', 'powder-lighten', '크림 라이트너', '눈썹',
    single('크림 라이트너', 'browLightener', {
      browLightenerIntensity: 0.4,
      browLightenerTexture: 0, // 크림 — 현재 단일 로컬 제형
    }), false);
  addRegionLook(lib, 'brow-lightener', 'gel-soft-lighten', '크림 소프트 라이트너', '눈썹',
    single('크림 소프트 라이트너', 'browLightener', {
      browLightenerIntensity: 0.32,
      browLightenerTexture: 0, // 크림 — 현재 단일 로컬 제형
      browLightenerFinish: 0, // 새틴
    }), false);

  // 립라이너 3종 — 버건디 매트의 '라이너' 파트 값 + LIP_COLORS 팔레트 색.
  addRegionLook(lib, 'lip-liner', 'deep-burgundy', '딥 버건디 라인', '립',
    single('딥 버건디 라인', 'lipLiner', {
      lipLinerColor: '#7A2A40',
      lipLinerIntensity: 0.35,
    }), false);
  addRegionLook(lib, 'lip-liner', 'mlbb-line', 'MLBB 라인', '립',
    single('MLBB 라인', 'lipLiner', {
      lipLinerColor: '#C94F6D',
      lipLinerIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'lip-liner', 'red-line', '레드 라인', '립',
    single('레드 라인', 'lipLiner', {
      lipLinerColor: '#B01E3C',
      lipLinerIntensity: 0.35,
    }), false);
  // LIP_COLORS 팔레트 확장 2종 — 웜 코랄·로즈 윤곽(립보다 한 톤 딥하게).
  addRegionLook(lib, 'lip-liner', 'coral-line', '코랄 라인', '립',
    single('코랄 라인', 'lipLiner', {
      lipLinerColor: '#F2846B',
      lipLinerIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'lip-liner', 'rose-line', '로즈 라인', '립',
    single('로즈 라인', 'lipLiner', {
      lipLinerColor: '#D96C7B',
      lipLinerIntensity: 0.32,
    }), false);

  // 하이라이터 4종 — 기본 광채 존에서 색·마감·퍼짐 차이만 사용(별도 마스크 불필요).
  addRegionLook(lib, 'highlighter', 'soft-champagne', '은은 샴페인', '컨투어',
    single('은은 샴페인', 'highlighter', {
      highlightColor: '#FFF2DB',
      highlightIntensity: 0.18,
      highlightFinish: 0,
      highlightEdgeSoftness: 0.72,
    }), false);
  addRegionLook(lib, 'highlighter', 'dewy-glow', '듀이 글로우', '컨투어',
    single('듀이 글로우', 'highlighter', {
      highlightColor: '#FFE9C8',
      highlightIntensity: 0.28,
      highlightFinish: 0,
      highlightLift: 0.02,
      highlightSpread: 0.03,
      highlightEdgeSoftness: 0.65,
    }), false);
  addRegionLook(lib, 'highlighter', 'pink-pearl', '핑크 펄', '컨투어',
    [{name: '핑크 펄', leaves: [
      {label: '핑크 펄 · 볼', region: 'highlighter', productId: 'sys:prod:highlighter:glowbeam', params: {
        highlightColor: '#F5DDE2', highlightIntensity: 0.24, highlightFinish: 3,
        highlightShimmer: 0.45, highlightLift: 0.01, highlightSpread: 0.01,
        highlightEdgeSoftness: 0.55, highlightZone: 0, highlightZoneWeight: 0.20,
      }},
      {label: '핑크 펄 · 콧대', region: 'highlighter', productId: 'sys:prod:highlighter:glowbeam', params: {
        highlightColor: '#F5DDE2', highlightIntensity: 0.24, highlightFinish: 3,
        highlightShimmer: 0.45, highlightLift: 0.01, highlightSpread: 0.01,
        highlightEdgeSoftness: 0.55, highlightZone: 1, highlightZoneWeight: 0.10,
      }},
      {label: '핑크 펄 · 코끝', region: 'highlighter', productId: 'sys:prod:highlighter:glowbeam', params: {
        highlightColor: '#F5DDE2', highlightIntensity: 0.24, highlightFinish: 3,
        highlightShimmer: 0.45, highlightLift: 0.01, highlightSpread: 0.01,
        highlightEdgeSoftness: 0.55, highlightZone: 2, highlightZoneWeight: 0.075,
      }},
    ]}], false);
  addRegionLook(lib, 'highlighter', 'lilac-beam', '라일락 빔', '컨투어',
    single('라일락 빔', 'highlighter', {
      highlightColor: '#EFE6F2',
      highlightIntensity: 0.32,
      highlightFinish: 3,
      highlightShimmer: 0.62,
      highlightLift: 0.03,
      highlightSpread: -0.02,
      highlightEdgeSoftness: 0.48,
    }), false);

  // 컨투어 4종 — 존을 과장해 이름 붙이지 않고 톤·농도·블렌딩 차이로 구분.
  addRegionLook(lib, 'contour', 'soft-taupe', '소프트 토프', '컨투어',
    single('소프트 토프', 'contour', {
      contourColor: '#9E806B',
      contourIntensity: 0.16,
      contourFinish: 1,
      contourSpread: 0.03,
      contourEdgeSoftness: 0.75,
    }), false);
  addRegionLook(lib, 'contour', 'daily-warm', '데일리 웜', '컨투어',
    single('데일리 웜', 'contour', {
      contourColor: '#A88A70',
      contourIntensity: 0.22,
      contourFinish: 1,
      contourEdgeSoftness: 0.65,
    }), false);
  addRegionLook(lib, 'contour', 'cool-sculpt', '쿨 조각', '컨투어',
    single('쿨 조각', 'contour', {
      contourColor: '#7A6250',
      contourIntensity: 0.28,
      contourFinish: 1,
      contourLift: 0.02,
      contourSpread: -0.02,
      contourEdgeSoftness: 0.5,
    }), false);
  addRegionLook(lib, 'contour', 'deep-bronze', '딥 브론즈', '컨투어',
    single('딥 브론즈', 'contour', {
      contourColor: '#6E584A',
      contourIntensity: 0.32,
      contourFinish: 1,
      contourLift: -0.03,
      contourSpread: 0.02,
      contourEdgeSoftness: 0.58,
    }), false);

  // 아이섀도 하 5종 — 유사-부위 'eyeshadowLower' 잎: leafFromDef의
  // migrateLegacyEyeshadowLayer가 eyeshadow(surface=아래) 밴드로 변환한다.
  // (하부 베이크드 개편 2026-07-24) 구판은 region 'eyeshadow' 잎에 eyeshadowLower*
  // 플랫 스칼라를 실었는데, compileLayers가 eyeshadow 잎을 전부 V2 밴드 배열로
  // 돌리면서 eyeshadowLower* 키가 통째로 유실돼 이 5종은 아무것도 렌더하지 않는
  // 죽은 룩이었다(주석의 Object.assign 경로는 더 이상 존재하지 않음). 실루엣은
  // 이제 셰이더 아틀라스(모양 미지정=타일 0 초승달 워시)·마스크(딥 스모키)다.
  addRegionLook(lib, 'eyeshadow-lower', 'daily-beige', '데일리 베이지', '눈',
    single('데일리 베이지', 'eyeshadowLower', {
      eyeshadowLowerColor: '#C29A7B',
      eyeshadowLowerIntensity: 0.36, eyeshadowLowerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeshadow-lower', 'coral-shadow', '코랄 그늘', '눈',
    single('코랄 그늘', 'eyeshadowLower', {
      eyeshadowLowerColor: '#B06A4E',
      eyeshadowLowerIntensity: 0.42, eyeshadowLowerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeshadow-lower', 'rosy-under', '로지 언더', '눈',
    single('로지 언더', 'eyeshadowLower', {
      eyeshadowLowerColor: '#D89AA0',
      eyeshadowLowerIntensity: 0.42, eyeshadowLowerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeshadow-lower', 'mauve-shimmer', '모브 시머', '눈',
    single('모브 시머', 'eyeshadowLower', {
      eyeshadowLowerColor: '#6E5A8A',
      eyeshadowLowerIntensity: 0.46, eyeshadowLowerFinish: 3, eyeshadowLowerShimmer: 0.35,
    }), false);
  // 꼬리집중 매트 — 언더 스모키의 눈꼬리 깊이(legacy shape 2 → profile 6 마스크).
  addRegionLook(lib, 'eyeshadow-lower', 'deep-smoky-under', '딥 스모키 언더', '눈',
    single('딥 스모키 언더', 'eyeshadowLower', {
      eyeshadowLowerColor: '#5C4A46',
      eyeshadowLowerIntensity: 0.7, eyeshadowLowerShape: 2, eyeshadowLowerFinish: 1,
    }), false);

  // 아이라인 하 3종 — 색은 상·하 라인이 공유하는 계약을 그대로 따른다.
  addRegionLook(lib, 'eyeliner-lower', 'soft-brown', '소프트 브라운', '눈',
    single('소프트 브라운', 'eyelinerLower', {
      eyelinerLowerColor: '#5A4433',
      eyelinerLowerIntensity: 0.16,
    }), false);
  addRegionLook(lib, 'eyeliner-lower', 'deep-brown', '딥 브라운', '눈',
    single('딥 브라운', 'eyelinerLower', {
      eyelinerLowerColor: '#3A2A20',
      eyelinerLowerIntensity: 0.23,
    }), false);
  addRegionLook(lib, 'eyeliner-lower', 'burgundy-under', '버건디 언더', '눈',
    single('버건디 언더', 'eyelinerLower', {
      eyelinerLowerColor: '#5A2A3A',
      eyelinerLowerIntensity: 0.2,
    }), false);
  // 구간 축(LOWER_EYELINER_SEGMENTS) 변주 2종 — 앞+꼬리 롱, 꼬리만 포인트.
  addRegionLook(lib, 'eyeliner-lower', 'long-under', '롱 언더라인', '눈',
    single('롱 언더라인', 'eyelinerLower', {
      eyelinerLowerColor: '#3A2A20',
      eyelinerLowerIntensity: 0.2,
      eyelinerLowerSegment: 2, // 앞+꼬리
    }), false);
  addRegionLook(lib, 'eyeliner-lower', 'tail-accent', '꼬리 포인트 언더', '눈',
    single('꼬리 포인트 언더', 'eyelinerLower', {
      eyelinerLowerColor: '#141014',
      eyelinerLowerIntensity: 0.22,
      eyelinerLowerSegment: 1, // 꼬리만
    }), false);

  // 아이라인 상 5종 — 모양(윙업/롱)·구간(눈동자 위·앞+꼬리)·제형(리퀴드/젤/펜슬)·
  //   마감(새틴/매트/펄) 축을 조합해 성격이 또렷이 갈리게. 세부부위 카드 전용.
  addRegionLook(lib, 'eyeliner-upper', 'black-wing-liquid', '블랙 윙 리퀴드', '눈',
    single('블랙 윙 리퀴드', 'eyelinerUpper', {
      eyelinerColor: '#0E0B10',
      eyelinerIntensity: 0.85, eyelinerThickness: 1.5, eyelinerWingLength: 1.5, // 두껍고 진한 긴 윙
      eyelinerStyle: 0, // 윙업
      eyelinerTexture: 0, // 리퀴드
      eyelinerFinish: 1,
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'brown-daily-pencil', '브라운 데일리 펜슬', '눈',
    single('브라운 데일리 펜슬', 'eyelinerUpper', {
      eyelinerColor: '#2E1F16',
      eyelinerIntensity: 0.6, eyelinerThickness: 1.15, eyelinerWingLength: 0.85, // 데일리 = 짧고 얇은 편
      eyelinerStyle: 2, // 롱
      eyelinerTexture: 2, // 펜슬
      eyelinerFinish: 1, // 매트
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'inner-line-gel', '이너라인 젤', '눈',
    single('이너라인 젤', 'eyelinerUpper', {
      eyelinerColor: '#0E0B10',
      eyelinerIntensity: 0.72, eyelinerThickness: 1.35, // 이너 채움 = 두껍게(윙 없음=타이트라인)
      eyelinerSegment: 3, // 눈동자 위 — 안쪽 채움
      eyelinerTexture: 1, // 젤
      eyelinerFinish: 1,
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'burgundy-pearl', '버건디 펄 라인', '눈',
    single('버건디 펄 라인', 'eyelinerUpper', {
      eyelinerColor: '#4A1F2E',
      eyelinerIntensity: 0.62, eyelinerThickness: 1.25, eyelinerWingLength: 1.1, // 중간 길이
      eyelinerTexture: 0, // 리퀴드
      eyelinerFinish: 3, // 펄
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'long-matte-wing', '롱 매트 윙', '눈',
    single('롱 매트 윙', 'eyelinerUpper', {
      eyelinerColor: '#0E0B10',
      eyelinerIntensity: 0.8, eyelinerThickness: 1.6, eyelinerWingLength: 1.75, // 가장 두껍고 긴 윙
      eyelinerStyle: 2, // 롱
      eyelinerSegment: 2, // 앞+꼬리
      eyelinerFinish: 1, // 매트
    }), false);

  // 애교살 4종 — 임포트 강도 없이 내장 밴드의 톤·펄·두께 축만 사용.
  addRegionLook(lib, 'aegyo', 'natural-ivory', '내추럴 아이보리', '눈',
    single('내추럴 아이보리', 'aegyo', {
      aegyoColor: '#FFF3E2',
      aegyoIntensity: 0.25,
      aegyoFinish: 1,
      aegyoHeight: 0.85,
    }), false);
  addRegionLook(lib, 'aegyo', 'champagne-pearl', '샴페인 펄', '눈',
    single('샴페인 펄', 'aegyo', {
      aegyoColor: '#F7E7CE',
      aegyoIntensity: 0.34,
      aegyoFinish: 3,
      aegyoShimmer: 0.4,
      aegyoHeight: 0.95,
    }), false);
  addRegionLook(lib, 'aegyo', 'plump-pink', '핑크 도톰', '눈',
    single('핑크 도톰', 'aegyo', {
      aegyoColor: '#FFD9E0',
      aegyoIntensity: 0.38,
      aegyoFinish: 1,
      aegyoHeight: 1.12,
    }), false);
  addRegionLook(lib, 'aegyo', 'lilac-pearl', '라일락 펄', '눈',
    single('라일락 펄', 'aegyo', {
      aegyoColor: '#E8E6F5',
      aegyoIntensity: 0.3,
      aegyoFinish: 3,
      aegyoShimmer: 0.5,
      aegyoHeight: 0.9,
    }), false);
  // 골드 펄 도톰 — 웜 골드 하이라이트 + 시머로 볼륨감(중앙 도톰 무드).
  addRegionLook(lib, 'aegyo', 'gold-pearl', '골드 펄 도톰', '눈',
    single('골드 펄 도톰', 'aegyo', {
      aegyoColor: '#F2D6A0',
      aegyoIntensity: 0.34,
      aegyoFinish: 3,
      aegyoShimmer: 0.42,
      aegyoHeight: 0.98,
    }), false);

  // 속눈썹 상 5종 — 내장 스트로크 프로파일(MASCARA_STYLES_UPPER) 조합.
  addRegionLook(lib, 'mascara', 'natural-brown', '내추럴 브라운', '눈',
    // 컨셉: 옅은 갈색·짧고 성긴 '데일리 노메이크업'. 확실히 갈색으로 읽히게 밝게(알파
    // 부스트로도 안 검게), 길이 최단 → 롱래시/돌리와 확연히 구분.
    single('내추럴 브라운', 'mascara', {
      mascaraStyle: 3, // 오픈아이(수직에 가깝게) — 짧아도 또렷
      mascaraColor: '#6B4A33',
      mascaraIntensity: 0.34,
      mascaraLength: 0.8,
    }), false);
  addRegionLook(lib, 'mascara', 'long-lash', '롱래시 블랙', '눈',
    // 컨셉: 새까맣고 '길이' 강조 — 최장 + 바깥 스윕. 색·길이 모두 브라운과 반대극.
    single('롱래시 블랙', 'mascara', {
      mascaraStyle: 0,
      mascaraColor: '#0E0B10',
      mascaraIntensity: 0.5,
      mascaraLength: 1.4,
    }), false);
  addRegionLook(lib, 'mascara', 'dolly-volume', '돌리 볼륨', '눈',
    // 컨셉: 중앙 볼륨·풍성(돌리) — 길이는 중간이되 진하고 꽉 참. 롱래시와 '길이 vs 볼륨'으로 대비.
    single('돌리 볼륨', 'mascara', {
      mascaraStyle: 1,
      mascaraColor: '#161016',
      mascaraIntensity: 0.68,
      mascaraLength: 1.0,
    }), false);
  addRegionLook(lib, 'mascara', 'cat-lift', '캣 리프트', '눈',
    single('캣 리프트', 'mascara', {
      mascaraStyle: 2,
      mascaraColor: '#181418',
      mascaraIntensity: 0.48,
      mascaraLength: 1.12,
    }), false);
  addRegionLook(lib, 'mascara', 'wispy-curl', '위스피 컬', '눈',
    single('위스피 컬', 'mascara', {
      mascaraStyle: 4,
      mascaraColor: '#3A2A20',
      mascaraIntensity: 0.43,
      mascaraLength: 1.15,
    }), false);
  // 텍스처 속눈썹 2종 — 절차 스트로크(각짐·컬 찌그러짐) 대신 곡선 스트로크 PNG를
  // 상안검 리본에 매핑(mascaraTexStyle). 부드러운 곡선·부챗살·컬이 래스터로 구워져 있다.
  addRegionLook(lib, 'mascara', 'tex-natural', '텍스처 내추럴', '눈',
    single('텍스처 내추럴', 'mascara', {
      mascaraTexStyle: 1,
      mascaraColor: '#1A1418',
      mascaraIntensity: 0.85,
    }), false);
  addRegionLook(lib, 'mascara', 'tex-volume', '텍스처 볼륨', '눈',
    single('텍스처 볼륨', 'mascara', {
      mascaraTexStyle: 2,
      mascaraColor: '#120E12',
      mascaraIntensity: 0.95,
    }), false);
  addRegionLook(lib, 'mascara', 'downturned-lash', '처짐 래시', '눈',
    single('처짐 래시', 'mascara', {
      mascaraStyle: 5,
      mascaraColor: '#181418',
      mascaraIntensity: 0.42,
      mascaraLength: 1.05,
    }), false);

  // 속눈썹 하 4종 — 상단과 공유하는 mascaraColor 외에는 독립 축만 사용.
  addRegionLook(lib, 'lower-mascara', 'natural-under', '내추럴 언더', '눈',
    single('내추럴 언더', 'lowerMascara', {
      lowerLashStyle: 0,
      mascaraColor: '#3A2A20',
      lowerLashIntensity: 0.2,
      lowerLashLength: 0.8,
    }), false);
  addRegionLook(lib, 'lower-mascara', 'dolly-point', '돌리 포인트', '눈',
    single('돌리 포인트', 'lowerMascara', {
      lowerLashStyle: 1,
      mascaraColor: '#181418',
      lowerLashIntensity: 0.26,
      lowerLashLength: 0.88,
    }), false);
  addRegionLook(lib, 'lower-mascara', 'open-eye', '오픈아이 언더', '눈',
    single('오픈아이 언더', 'lowerMascara', {
      lowerLashStyle: 3,
      mascaraColor: '#141014',
      lowerLashIntensity: 0.28,
      lowerLashLength: 0.92,
    }), false);
  addRegionLook(lib, 'lower-mascara', 'wispy-under', '위스피 언더', '눈',
    single('위스피 언더', 'lowerMascara', {
      lowerLashStyle: 4,
      mascaraColor: '#3A2A20',
      lowerLashIntensity: 0.24,
      lowerLashLength: 0.98,
    }), false);

  // 삼각존 3종 — 좁은 눈꼬리 음영의 색·농도 단계.
  addRegionLook(lib, 'triangle-zone', 'soft-taupe', '소프트 토프존', '눈',
    single('소프트 토프존', 'triangleZone', {
      triangleZoneColor: '#5A4034',
      triangleZoneIntensity: 0.17,
    }), false);
  addRegionLook(lib, 'triangle-zone', 'daily-brown', '데일리 삼각존', '눈',
    single('데일리 삼각존', 'triangleZone', {
      triangleZoneColor: '#4A342A',
      triangleZoneIntensity: 0.23,
    }), false);
  addRegionLook(lib, 'triangle-zone', 'deep-shadow', '딥 음영존', '눈',
    single('딥 음영존', 'triangleZone', {
      triangleZoneColor: '#3E2C24',
      triangleZoneIntensity: 0.3,
    }), false);
  // 폭 축(TRIANGLE_ZONE_SHAPES) 변주 2종 — 좁게 또렷 / 넓게 부드러운 그늘.
  addRegionLook(lib, 'triangle-zone', 'narrow-taupe', '좁은 토프존', '눈',
    single('좁은 토프존', 'triangleZone', {
      triangleZoneColor: '#5A4034',
      triangleZoneIntensity: 0.2,
      triangleZoneShape: 1, // 좁게
    }), false);
  addRegionLook(lib, 'triangle-zone', 'wide-warm', '넓은 웜 그늘', '눈',
    single('넓은 웜 그늘', 'triangleZone', {
      triangleZoneColor: '#4A342A',
      triangleZoneIntensity: 0.24,
      triangleZoneShape: 2, // 넓게
    }), false);

  // 쌍꺼풀 3종 — 고정 자연 음영에 강도·크리스 높이만 조절.
  addRegionLook(lib, 'double-lid', 'soft-crease', '은은 크리스', '눈',
    single('은은 크리스', 'doubleLid', {
      doubleLidIntensity: 0.2,
      doubleLidHeight: 0.75,
    }), false);
  addRegionLook(lib, 'double-lid', 'clear-crease', '또렷 크리스', '눈',
    single('또렷 크리스', 'doubleLid', {
      doubleLidIntensity: 0.3,
      doubleLidHeight: 1,
    }), false);
  addRegionLook(lib, 'double-lid', 'high-crease', '하이 크리스', '눈',
    single('하이 크리스', 'doubleLid', {
      doubleLidIntensity: 0.38,
      doubleLidHeight: 1.3,
    }), false);

  // 눈썹 지우기 3종 — 주변 피부 복원 강도를 단계별로 제공하며 마지막은 완전 교체용.
  addRegionLook(lib, 'brow-conceal', 'soft-cleanup', '가벼운 커버', '눈썹',
    single('가벼운 커버', 'browConceal', {
      browConcealIntensity: 0.72,
    }), false);
  addRegionLook(lib, 'brow-conceal', 'half-cover', '눈썹 지우기', '눈썹',
    single('눈썹 지우기', 'browConceal', {
      browConcealIntensity: 0.88,
    }), false);
  addRegionLook(lib, 'brow-conceal', 'clean-canvas', '완전 지우기', '눈썹',
    single('완전 지우기', 'browConceal', {
      browConcealIntensity: 1,
    }), false);

  // 눈썹 스타일 5종 — 임포트 없이 번들 default_brow 텍스처를 색·모양·핏으로 변주(마지막 소프트 헤어는 전용 텍스처).
  addRegionLook(lib, 'brow-style', 'natural-texture', '내추럴 결', '눈썹',
    single('내추럴 결', 'browStyle', {
      browStyleColor: '#4A3628',
      browStyleIntensity: 0.3,
      browShape: 0,
      browThicknessProfile: 2,
      browThickness: 1,
      browArch: 0.08,
    }), false);
  addRegionLook(lib, 'brow-style', 'soft-straight', '소프트 일자', '눈썹',
    single('소프트 일자', 'browStyle', {
      browStyleColor: '#5A4433',
      browStyleIntensity: 0.34,
      browShape: 1,
      browThicknessProfile: 3,
      browThickness: 1.05,
      browArch: 0,
    }), false);
  // (구 '슬림 아치' 복합 룩은 폐지 — 눈썹 '전체' 탭에 남은 마지막 절차적 밴드 룩이라
  //  레퍼런스 알파 5종으로 통일하며 함께 걷어냈다. 아치는 'brow:arch'가 대체한다.)
  addRegionLook(lib, 'brow-style', 'lifted-brow', '리프트 브로우', '눈썹',
    single('리프트 브로우', 'browStyle', {
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0.44,
      browShape: 4,
      browThicknessProfile: 3,
      browThickness: 1,
      browArch: 0.3,
    }), false);
  // 소프트 헤어스트록 — 전용 텍스처(default_brow_soft, template 4) 기반의 정돈된 자연 결.
  addRegionLook(lib, 'brow-style', 'soft-hairstroke', '소프트 헤어', '눈썹',
    single('소프트 헤어', 'browStyle', {
      browStyleTemplate: 4,
      browStyleColor: '#4A3428',
      browStyleIntensity: 0.36,
      browShape: 0,
      browThicknessProfile: 2,
      browThickness: 1,
      browArch: 0.12,
    }), false);

  // 베이스립 4종 — 본래 입술색을 정리하는 누드 톤과 커버 단계.
  addRegionLook(lib, 'lip-base', 'soft-nude', '소프트 누드', '립',
    single('소프트 누드', 'lipBase', {
      lipBaseColor: '#D9A896',
      lipBaseIntensity: 0.32,
    }), false);
  addRegionLook(lib, 'lip-base', 'peach-base', '피치 베이스립', '립',
    single('피치 베이스립', 'lipBase', {
      lipBaseColor: '#E8C3B0',
      lipBaseIntensity: 0.38,
    }), false);
  addRegionLook(lib, 'lip-base', 'rosy-nude', '로지 누드', '립',
    single('로지 누드', 'lipBase', {
      lipBaseColor: '#CBA392',
      lipBaseIntensity: 0.45,
    }), false);
  addRegionLook(lib, 'lip-base', 'full-cover', '누드 풀커버', '립',
    single('누드 풀커버', 'lipBase', {
      lipBaseColor: '#C99A86',
      lipBaseIntensity: 0.55,
    }), false);

  // 립글로스 4종 — 독립 광 톱코트의 투명·피치·로즈 틴트와 광량 차이. 다른 립(메인립·
  //  그라데)과 별도 리전이라 그 위에 레이어로 얹힌다. 셰이더 _GlossLumaLo 기본을 낮춰
  //  (0.6→0.4) 광택이 입술 전반에 촉촉하게 퍼지게 했고, 강도도 올려 확실히 보이게 한다.
  addRegionLook(lib, 'lip-gloss', 'clear-dew', '클리어 듀', '립',
    single('클리어 듀', 'lipGloss', {
      lipGlossColor: '#FFFFFF',
      lipGlossIntensity: 0.5,
    }), false);
  addRegionLook(lib, 'lip-gloss', 'peach-jelly', '피치 젤리', '립',
    single('피치 젤리', 'lipGloss', {
      lipGlossColor: '#F7D9D0',
      lipGlossIntensity: 0.58,
    }), false);
  addRegionLook(lib, 'lip-gloss', 'rose-syrup', '로즈 시럽', '립',
    single('로즈 시럽', 'lipGloss', {
      lipGlossColor: '#E9B7C2',
      lipGlossIntensity: 0.6,
    }), false);
  addRegionLook(lib, 'lip-gloss', 'glass-coat', '글래스 코팅', '립',
    single('글래스 코팅', 'lipGloss', {
      lipGlossColor: '#FFFFFF',
      lipGlossIntensity: 0.72,
    }), false);

  // 치아 미백 — 프리셋(데일리/클린/포토) 대신 단일 "치아 미백" 룩 1장으로 정리했다.
  // 기본 모드에선 이 카드로 켜고 '치아 농도' 슬라이더로 미백 정도를 직접 조절하며,
  // 상세/전문가 모드의 '미백' 슬라이더(regions.ts teeth opacity)가 세밀 제어를 준다.
  // 입을 벌렸을 때만, TeethWhiten 셰이더가 밝은 치아 픽셀만 골라 미백한다.
  addRegionLook(lib, 'teeth', 'whiten', '치아 미백', '립',
    single('치아 미백', 'teeth', {
      teethWhitenIntensity: 0.5,
    }), false);

  // 헤어 컬러 6종 — 기존 HAIR_COLORS 팔레트 안에서 세그멘테이션 틴트만 사용.
  addRegionLook(lib, 'hair', 'natural-brown', '내추럴 브라운', '헤어',
    single('내추럴 브라운', 'hair', {
      hairTintColor: '#5A4030',
      hairTintIntensity: 0.28,
    }), false);
  addRegionLook(lib, 'hair', 'dark-chocolate', '다크 초코', '헤어',
    single('다크 초코', 'hair', {
      hairTintColor: '#3B2A20',
      hairTintIntensity: 0.32,
    }), false);
  addRegionLook(lib, 'hair', 'ash-beige', '애쉬 베이지', '헤어',
    single('애쉬 베이지', 'hair', {
      hairTintColor: '#8A7A6A',
      hairTintIntensity: 0.36,
    }), false);
  addRegionLook(lib, 'hair', 'blue-black', '블루 블랙', '헤어',
    single('블루 블랙', 'hair', {
      hairTintColor: '#1E2432',
      hairTintIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'hair', 'wine-brown', '와인 브라운', '헤어',
    single('와인 브라운', 'hair', {
      hairTintColor: '#6E2A3A',
      hairTintIntensity: 0.4,
    }), false);
  addRegionLook(lib, 'hair', 'rose-brown', '로즈 브라운', '헤어',
    single('로즈 브라운', 'hair', {
      hairTintColor: '#9A6A5A',
      hairTintIntensity: 0.38,
    }), false);

  // 점 데코 3종 — builtin:dot만 사용. 한 sub의 여러 leaf는 함께 배치되는 한 룩이다.
  addRegionLook(lib, 'deco-dot', 'beauty-mark', '뷰티 마크', '데코', [
    {
      name: '뷰티 마크',
      leaves: [{
        label: '브라운 포인트',
        region: 'deco',
        params: {},
        overlay: {
          path: 'builtin:dot',
          intensity: 0.65,
          x: 0.62,
          y: 0.58,
          scale: 0.055,
          rotation: 0,
          blendMode: 1,
          color: '#4A2F28',
          kind: 'deco',
        },
      }],
    },
  ], false);
  addRegionLook(lib, 'deco-dot', 'brown-freckles', '브라운 주근깨', '데코', [
    {
      name: '브라운 주근깨',
      leaves: [
        {
          label: '주근깨 왼쪽',
          region: 'deco',
          params: {},
          overlay: {
            path: 'builtin:dot', intensity: 0.36, x: 0.42, y: 0.48,
            scale: 0.05, rotation: -8, blendMode: 1, color: '#765044', kind: 'deco',
          },
        },
        {
          label: '주근깨 중앙',
          region: 'deco',
          params: {},
          overlay: {
            path: 'builtin:dot', intensity: 0.4, x: 0.5, y: 0.465,
            scale: 0.052, rotation: 5, blendMode: 1, color: '#6B463B', kind: 'deco',
          },
        },
        {
          label: '주근깨 오른쪽',
          region: 'deco',
          params: {},
          overlay: {
            path: 'builtin:dot', intensity: 0.34, x: 0.58, y: 0.49,
            scale: 0.054, rotation: 9, blendMode: 1, color: '#835B4D', kind: 'deco',
          },
        },
      ],
    },
  ], false);
  addRegionLook(lib, 'deco-dot', 'rosy-duo', '로지 듀오', '데코', [
    {
      name: '로지 듀오',
      leaves: [
        {
          label: '로지 포인트 왼쪽',
          region: 'deco',
          params: {},
          overlay: {
            path: 'builtin:dot', intensity: 0.48, x: 0.37, y: 0.56,
            scale: 0.06, rotation: -6, blendMode: 1, color: '#8A4E52', kind: 'deco',
          },
        },
        {
          label: '로지 포인트 오른쪽',
          region: 'deco',
          params: {},
          overlay: {
            path: 'builtin:dot', intensity: 0.45, x: 0.64, y: 0.55,
            scale: 0.055, rotation: 7, blendMode: 1, color: '#9A5960', kind: 'deco',
          },
        },
      ],
    },
  ], false);

  // ════════════════════════════════════════════════════════════════════════
  // §16 디자이너 마스크 룩 — 오늘 추가된 카탈로그 마스크/라이너 콜르아트를 실사용한다.
  //  마스크 잎은 부위 마커(…MaskImported:1)와 maskRef(카탈로그 스텐실 URI)를 함께 든다.
  //  App(collectLookAssets→emitCompiled)이 룩 적용 시 세션 경로에 주입해 기존
  //  reconcileMasks 화해 경로로 setRegionMask한다(사용자 직접 임포트가 룩 참조보다 우선).
  //  위(region 'eyeshadow')·아래(region 'eyeshadowLower')는 서로 다른 마스크 슬롯이라
  //  한 룩에서 동시 적용된다. 색·강도·마감 값은 기존 눈/하이라이터 룩 분포를 참고.
  // ════════════════════════════════════════════════════════════════════════

  // ── 아이섀도 마스크 세부부위 룩 4종 — 위+아래 마스크 쌍으로 실루엣 정밀화 ──
  addRegionLook(lib, 'eye-mask', 'daily-base', '데일리 베이스', '눈', [
    { name: '위 베이스 워시', leaves: [{
      label: '베이스 워시', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#C7A488', eyeshadowIntensity: 0.5, eyeshadowFinish: 0, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_base'),
    }] },
    { name: '아래 워시', leaves: [{
      label: '아래 워시', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#C29A7B', eyeshadowLowerIntensity: 0.34, eyeshadowLowerFinish: 0, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_wash'),
    }] },
  ]);
  addRegionLook(lib, 'eye-mask', 'soft-smoky', '소프트 스모키', '눈', [
    { name: '위 아우터 스모키', leaves: [{
      label: '아우터 스모키', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#7A5C50', eyeshadowIntensity: 0.6, eyeshadowFinish: 1, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_outer'),
    }] },
    { name: '아래 스머지', leaves: [{
      label: '아래 스머지', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#6E574E', eyeshadowLowerIntensity: 0.4, eyeshadowLowerFinish: 1, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_outer'),
    }] },
  ]);
  addRegionLook(lib, 'eye-mask', 'center-halo', '센터 할로', '눈', [
    { name: '위 센터 할로', leaves: [{
      label: '센터 할로', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#B98C9A', eyeshadowIntensity: 0.55, eyeshadowFinish: 3, eyeshadowShimmer: 0.5, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_halo'),
    }] },
    { name: '아래 센터', leaves: [{
      label: '아래 센터', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#C79AA4', eyeshadowLowerIntensity: 0.4, eyeshadowLowerFinish: 3, eyeshadowLowerShimmer: 0.4, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_center'),
    }] },
  ]);
  addRegionLook(lib, 'eye-mask', 'cat-sweep', '캣 스윕', '눈', [
    { name: '위 윙 스윕(연장)', leaves: [{
      label: '윙 스윕', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#5C4A46', eyeshadowIntensity: 0.62, eyeshadowFinish: 1, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'ext_wing_sweep'),
    }] },
    { name: '아래 꼬리 연결', leaves: [{
      label: '아래 꼬리', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#5C4A46', eyeshadowLowerIntensity: 0.34, eyeshadowLowerFinish: 1, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_tail'),
    }] },
  ]);

  // ── 아이라이너 세부부위 룩 5종 — 콜르아트(setEyelinerStyle) 대신 파라메트릭 라이너
  //    (IrisRenderer 두께/테일 프로파일)로 정의. 콜르아트는 플랫 알파 + 단색 틴트라
  //    스티커처럼 보이고 윙 지터가 도드라져, 시스템 룩은 질감·마감 축을 가진 절차
  //    라이너로 통일한다(콜르아트 경로 자체는 사용자 임포트 전용으로 존치).
  //    슬러그·이름은 기존 저장 참조 보존을 위해 그대로 둔다.
  const linerLook = (
    nameSlug: string, name: string, params: LeafSpec['params'],
  ): void =>
    addRegionLook(lib, 'eyeliner-upper', nameSlug, name, '눈', [
      { name, leaves: [{ label: name, region: 'eyelinerUpper', params }] },
    ], false);
  // 프로파일 인덱스 = regions.ts EYELINER_THICKNESS/TAIL_PROFILES 라벨 기준.
  linerLook('art-slim', '슬림 아트라인', {
    eyelinerColor: '#221A20', eyelinerIntensity: 0.75,
    eyelinerHasGeometryProfiles: 1,
    eyelinerThicknessProfile: 2, // 슬림
    eyelinerTailProfile: 0, eyelinerWingLength: 0.7, // 윙업, 꼬리 짧게
  });
  linerLook('art-bold-wing', '볼드 윙 아트', {
    eyelinerColor: '#1B141A', eyelinerIntensity: 0.85,
    eyelinerHasGeometryProfiles: 1,
    eyelinerThicknessProfile: 3, // 볼드
    eyelinerTailProfile: 0, eyelinerWingLength: 1.1, // 윙업
  });
  linerLook('art-cat-long', '롱 캣아이 아트', {
    eyelinerColor: '#1B141A', eyelinerIntensity: 0.85,
    eyelinerHasGeometryProfiles: 1,
    eyelinerThicknessProfile: 4, // 바깥 볼드 — 가는 몸통, 두꺼운 꼬리
    eyelinerTailProfile: 4, eyelinerWingLength: 1.15, // 롱 업
  });
  linerLook('art-puppy-droop', '퍼피 드룹 아트', {
    eyelinerColor: '#2A1E1C', eyelinerIntensity: 0.72,
    eyelinerTexture: 1, // 젤 — 뭉근하게 처지는 무드
    eyelinerHasGeometryProfiles: 1,
    eyelinerThicknessProfile: 2, // 슬림
    eyelinerTailProfile: 1, // 다운턴
  });
  linerLook('art-tightline', '타이트라인 아트', {
    eyelinerColor: '#241C22', eyelinerIntensity: 0.7,
    eyelinerHasGeometryProfiles: 1,
    eyelinerThicknessProfile: 1, // 극슬림 — 점막 채우기 느낌
    eyelinerTailProfile: 2, eyelinerWingLength: 0.3, // 가로 롱, 꼬리 최소
  });

  // ── 하이라이터 부위별 마스크 룩 5종 — high_* 존 스텐실 1장씩(단일 머티리얼 슬롯 규약상
  //    한 룩=한 존). 색·마감은 기존 하이라이터 룩 분포 참고. ──
  const highMaskLook = (
    nameSlug: string, name: string, file: string,
    color: string, intensity: number, finish: number, shimmer?: number,
  ): void =>
    addRegionLook(lib, 'highlighter-mask', nameSlug, name, '컨투어',
      single(name, 'highlighter', {
        highlightColor: color,
        highlightIntensity: intensity,
        highlightFinish: finish,
        ...(shimmer !== undefined ? { highlightShimmer: shimmer } : {}),
        highlightMaskImported: 1,
      }).map(sub => ({
        ...sub,
        leaves: sub.leaves.map(leaf => ({ ...leaf, maskRef: mask('highlighter', file) })),
      })), false);
  highMaskLook('cheek-glow', '광대 글로우', 'high_cheekbone', '#FFF2DB', 0.24, 0);
  highMaskLook('nose-beam', '콧대 하이라이트', 'high_nose', '#FFE9C8', 0.22, 0);
  highMaskLook('cupid-tzone', 'T존 큐피드', 'high_cupid', '#FFF2DB', 0.2, 0);
  highMaskLook('undereye-bright', '언더아이 브라이트', 'high_undereye', '#FFF4E4', 0.2, 0);
  highMaskLook('browbone-lift', '눈썹뼈 리프트', 'high_browbone', '#EFE6F2', 0.2, 3, 0.4);

  // ════════════════════════════════════════════════════════════════════════
  // §16 기존 눈·하이라이터 룩의 v2 리파인 — 기존 정의는 불변(병존), 신규 '-v2' 항목만
  //  추가한다. 기존 색/강도/마감을 출발점으로 오늘 마스크·연장·콜르아트로 실루엣 정밀화.
  // ════════════════════════════════════════════════════════════════════════

  // 데일리 브라운 v2 — 기존 단일 섀도에 위 eye_base + 아래 under_wash 마스크 쌍을 얹어
  //  번짐 경계를 또렷이. 색(#C29A7B)·강도 유지.
  addRegionLook(lib, 'eye', 'daily-brown-v2', '데일리 브라운 v2', '눈', [
    { name: '위 베이스', leaves: [{
      label: '아이섀도', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#C29A7B', eyeshadowIntensity: 0.5, eyeshadowFinish: 0, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_base'),
    }] },
    { name: '아래 워시', leaves: [{
      label: '아래 섀도', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#C29A7B', eyeshadowLowerIntensity: 0.32, eyeshadowLowerFinish: 0, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_wash'),
    }] },
  ]);
  // 로즈골드 시머 v2 — 기존 로즈골드 시머 색을 센터 할로 마스크로 중앙 집중, 아래 센터로
  //  받쳐 입체감. 기존 라이너 대신 이너 톤은 유지.
  addRegionLook(lib, 'eye', 'rosegold-v2', '로즈골드 시머 v2', '눈', [
    { name: '위 할로', leaves: [{
      label: '아이섀도', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#D89AA0', eyeshadowIntensity: 0.6, eyeshadowFinish: 3, eyeshadowShimmer: 0.6, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_halo'),
    }] },
    { name: '아래 센터', leaves: [{
      label: '아래 섀도', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#D89AA0', eyeshadowLowerIntensity: 0.4, eyeshadowLowerFinish: 3, eyeshadowLowerShimmer: 0.45, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_center'),
    }] },
    { name: '라이너', leaves: [{
      label: '아이라인 상', region: 'eyelinerUpper',
      params: { eyelinerColor: '#5A4433', eyelinerIntensity: 0.6, eyelinerStyle: 0, eyelinerTexture: 2, eyelinerFinish: 1 },
    }] },
  ]);
  // 스모키 스택 v2 — 기존 2겹 스모키를 위 스모키 아웃(연장) + 아래 딥 스모키 마스크로
  //  꼬리까지 확장하고, 볼드 윙 콜르아트로 라인 강조.
  addRegionLook(lib, 'eye', 'smoky-v2', '스모키 스택 v2', '눈', [
    { name: '위 스모키 아웃(연장)', leaves: [{
      label: '딥 스모키', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#4A3A3E', eyeshadowIntensity: 0.72, eyeshadowFinish: 1, eyeshadowHeight: 1.25, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'ext_smoky_out'),
    }] },
    { name: '아래 딥 스모키', leaves: [{
      label: '아래 스모키', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#4A3A3E', eyeshadowLowerIntensity: 0.5, eyeshadowLowerShape: 2, eyeshadowLowerFinish: 1, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_smoky_deep'),
    }] },
    { name: '볼드 윙 라이너', leaves: [{
      label: '아이라인 상', region: 'eyelinerUpper',
      params: {
        eyelinerColor: '#1B141A', eyelinerIntensity: 0.85,
        eyelinerHasGeometryProfiles: 1,
        eyelinerThicknessProfile: 3, // 볼드
        eyelinerTailProfile: 0, eyelinerWingLength: 1.1, // 윙업
      },
    }] },
  ]);
  // 코랄 데일리 v2 — 기존 코랄 데일리에 위 베이스 + 아래 워시 마스크로 안정적인 데일리 번짐.
  addRegionLook(lib, 'eye', 'coral-v2', '코랄 데일리 v2', '눈', [
    { name: '위 베이스', leaves: [{
      label: '아이섀도', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#E0A183', eyeshadowIntensity: 0.55, eyeshadowFinish: 0, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_base'),
    }] },
    { name: '아래 워시', leaves: [{
      label: '아래 섀도', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#B06A4E', eyeshadowLowerIntensity: 0.34, eyeshadowLowerFinish: 0, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_wash'),
    }] },
    { name: '타이트라인', leaves: [{
      label: '아이라인 상', region: 'eyelinerUpper',
      params: {
        eyelinerColor: '#3A2A22', eyelinerIntensity: 0.6, // 웜 브라운 — 코랄 무드
        eyelinerHasGeometryProfiles: 1,
        eyelinerThicknessProfile: 1, // 극슬림
        eyelinerTailProfile: 2, eyelinerWingLength: 0.3, // 가로 롱, 꼬리 최소
      },
    }] },
  ]);
  // 모브 무드 v2 — 기존 모브 매트를 위 아우터 + 아래 스머지 마스크로 눈꼬리 그늘 강조.
  addRegionLook(lib, 'eye', 'mauve-v2', '모브 무드 v2', '눈', [
    { name: '위 아우터', leaves: [{
      label: '아이섀도', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#6E5A8A', eyeshadowIntensity: 0.6, eyeshadowFinish: 1, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_outer'),
    }] },
    { name: '아래 스머지', leaves: [{
      label: '아래 섀도', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#6E5A8A', eyeshadowLowerIntensity: 0.4, eyeshadowLowerFinish: 1, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_outer'),
    }] },
  ]);
  // 글리터 팝 v2 — 기존 글리터 토퍼를 센터 할로 마스크로 눈두덩 중앙에 집중, 아래 센터로 확산.
  addRegionLook(lib, 'eye', 'glitter-v2', '글리터 팝 v2', '눈', [
    { name: '위 할로 글리터', leaves: [{
      label: '아이섀도', region: 'eyeshadow', role: 'main',
      params: { eyeshadowColor: '#D8B49A', eyeshadowIntensity: 0.65, eyeshadowFinish: 3, eyeshadowShimmer: 0.9, eyeshadowMaskImported: 1 },
      maskRef: mask('eyeshadow', 'eye_halo'),
    }] },
    { name: '아래 센터', leaves: [{
      label: '아래 섀도', region: 'eyeshadowLower',
      params: { eyeshadowLowerColor: '#C79AA4', eyeshadowLowerIntensity: 0.36, eyeshadowLowerFinish: 3, eyeshadowLowerShimmer: 0.4, eyeshadowLowerMaskImported: 1 },
      maskRef: mask('eyeshadowLower', 'under_center'),
    }] },
  ]);

  // 하이라이터 v2 3종 — 기존 색·마감을 부위별 마스크에 얹어 존을 정밀 배치.
  highMaskLook('soft-champagne-v2', '은은 샴페인 v2', 'high_cheekbone', '#FFF2DB', 0.18, 0);
  highMaskLook('dewy-glow-v2', '듀이 글로우 v2', 'high_undereye', '#FFE9C8', 0.28, 0);
  highMaskLook('lilac-beam-v2', '라일락 빔 v2', 'high_browbone', '#EFE6F2', 0.32, 3, 0.62);

  // (§16 전체(face) 룩 3종은 2026-07-24 제거 — presets.ts 칩 주석 참고.)

  return lib;
}
