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
import type { LeafDef, LookLibrary, SlotKey } from './lookTree';
import type { RegionKey } from './regions';

interface LeafSpec {
  label: string;
  region: RegionKey;
  params: Partial<FilterParams>;
  /** 렌즈 세부(#25) payload — region이 lensBase/lensDetail/lensRim일 때 */
  lens?: LensLayer;
  /** 역할 태그(§5 A13) — 같은 부위 다겹의 배치 역할(핏 '.부위[역할]' 셀렉터 대상) */
  role?: string;
  /** 자유 배치 데코 payload — FilterParams 무소유 부위가 직접 캐리한다. */
  overlay?: LeafDef['overlay'];
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
        region: leaf.region,
        params: { ...leaf.params },
        ...(leaf.lens ? { lens: { ...leaf.lens } } : {}),
        ...(leaf.role ? { role: leaf.role } : {}),
        ...(leaf.overlay ? { overlay: { ...leaf.overlay } } : {}),
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
  region: RegionKey,
  params: Partial<FilterParams>,
): SubSpec[] {
  return [{ name, leaves: [{ label: name, region, params }] }];
}

/**
 * 부위 룩 변형 라이브러리 — 립 8 · 눈 6 · 블러셔 6 · 눈썹 4 · 피부 3 (27종).
 * buildSystemLibrary와 시그니처·결과를 공유하는 별도 진입점(기존 함수 무변경).
 */
export function buildVariantLibrary(): LookLibrary {
  const lib: LookLibrary = {};

  // ── 립 8종 — LIP_COLORS 팔레트 축 + finish 다양화(매트/글로시/새틴≈벨벳/시머)
  addRegionLook(lib, 'lip', 'mlbb', 'MLBB 벨벳', '립',
    single('MLBB 벨벳', 'lip', { lipColor: '#C94F6D', lipIntensity: 0.4, lipFinish: 0, lipTexture: 1 })); // 벨벳틴트
  addRegionLook(lib, 'lip', 'red', '레드 매트', '립',
    single('레드 매트', 'lip', { lipColor: '#B01E3C', lipIntensity: 0.65, lipFinish: 1 }));
  addRegionLook(lib, 'lip', 'coral', '코랄 글로시', '립',
    single('코랄 글로시', 'lip', { lipColor: '#F2846B', lipIntensity: 0.55, lipFinish: 2 }));
  addRegionLook(lib, 'lip', 'peach', '피치 새틴', '립',
    single('피치 새틴', 'lip', { lipColor: '#F09A80', lipIntensity: 0.45, lipFinish: 0 }));
  addRegionLook(lib, 'lip', 'mauve', '모브 매트', '립',
    single('모브 매트', 'lip', { lipColor: '#A8647E', lipIntensity: 0.5, lipFinish: 1 }));
  addRegionLook(lib, 'lip', 'rose', '로즈 글로시', '립',
    single('로즈 글로시', 'lip', { lipColor: '#D96C7B', lipIntensity: 0.5, lipFinish: 2 }));
  // 버건디는 라이너 링까지 — 립라이너 분리(#19b) 후 메인립+라이너 2 sub로 또렷한 딥립
  addRegionLook(lib, 'lip', 'burgundy', '버건디 매트', '립', [
    {
      name: '메인립',
      leaves: [{
        label: '립스틱',
        region: 'lip',
        params: { lipColor: '#9E3B54', lipIntensity: 0.7, lipFinish: 1 },
      }],
    },
    {
      name: '라이너',
      leaves: [{
        label: '립 펜슬',
        region: 'lipLiner',
        params: { lipLinerColor: '#7A2A40', lipLinerIntensity: 0.35, lipLinerTexture: 4 }, // 립 펜슬
      }],
    },
  ]);
  addRegionLook(lib, 'lip', 'orange', '오렌지 시머', '립',
    single('오렌지 시머', 'lip', {
      lipColor: '#E8703C',
      lipIntensity: 0.55,
      lipFinish: 3,
      lipShimmer: 0.45,
    }));

  // ── 눈 6종 — 섀도 색·finish·강도 변형, 일부는 라이너 스타일/질감 조합.
  //    스모키·글리터는 같은 부위 2겹 스택 예시(위 겹이 기본, 끄면 베이스).
  addRegionLook(lib, 'eye', 'daily-brown', '데일리 브라운', '눈', [
    {
      name: '섀도',
      leaves: [{
        label: '아이섀도',
        region: 'eyeshadow',
        role: 'main',
        params: { eyeshadowColor: '#C29A7B', eyeshadowIntensity: 0.35, eyeshadowFinish: 0 },
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
          eyeshadowIntensity: 0.45,
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
          eyelinerIntensity: 0.4,
          eyelinerStyle: 0,
          eyelinerTexture: 2, // 펜슬 — 부드러운 로즈골드 무드
          eyelinerFinish: 0,
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
          params: { eyeshadowColor: '#8A5A44', eyeshadowIntensity: 0.45, eyeshadowFinish: 0 },
        },
        {
          // 위 겹이 기본으로 이긴다 — 끄면 베이스 브라운만 남는 2겹 스택
          label: '딥 스모키',
          region: 'eyeshadow',
          role: 'point',
          params: {
            eyeshadowColor: '#5C4A46',
            eyeshadowIntensity: 0.6,
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
        params: { eyeshadowColor: '#E0A183', eyeshadowIntensity: 0.4, eyeshadowFinish: 0 },
      }],
    },
    {
      name: '라이너',
      leaves: [{
        label: '아이라인 상',
        region: 'eyelinerUpper',
        params: {
          eyelinerColor: '#6E3A2A',
          eyelinerIntensity: 0.35,
          eyelinerStyle: 2, // 가로 롱 — 데일리 무드
          eyelinerTexture: 0,
          eyelinerFinish: 0,
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
        params: { eyeshadowColor: '#6E5A8A', eyeshadowIntensity: 0.45, eyeshadowFinish: 1 },
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
          params: { eyeshadowColor: '#C29A7B', eyeshadowIntensity: 0.35, eyeshadowFinish: 0 },
        },
        {
          label: '글리터 토퍼',
          region: 'eyeshadow',
          role: 'point',
          params: {
            eyeshadowColor: '#D8B49A',
            eyeshadowIntensity: 0.5,
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

  // ── 블러셔 6종 — 모양(클래식/이가리/드레이핑) × 색, 배치 변형(blushLift/Spread) 1종
  addRegionLook(lib, 'blush', 'classic-rose', '클래식 로즈', '컨투어',
    single('블러셔', 'blush', {
      blushShape: 0, blushColor: '#F08FA0', blushIntensity: 0.45, blushFinish: 0,
    }));
  addRegionLook(lib, 'blush', 'classic-peach', '클래식 피치 시머', '컨투어',
    single('블러셔', 'blush', {
      blushShape: 0,
      blushColor: '#E89A7A',
      blushIntensity: 0.4,
      blushFinish: 3,
      blushShimmer: 0.4,
    }));
  addRegionLook(lib, 'blush', 'igari-coral', '이가리 코랄', '컨투어',
    single('블러셔', 'blush', {
      blushShape: 1, blushColor: '#E86A80', blushIntensity: 0.5, blushFinish: 0,
    }));
  addRegionLook(lib, 'blush', 'igari-mauve', '이가리 모브', '컨투어',
    single('블러셔', 'blush', {
      blushShape: 1, blushColor: '#B85C6E', blushIntensity: 0.4, blushFinish: 1,
    }));
  addRegionLook(lib, 'blush', 'draping-rose', '드레이핑 로즈', '컨투어',
    single('블러셔', 'blush', {
      blushShape: 2, blushColor: '#D96C7B', blushIntensity: 0.45, blushFinish: 0,
    }));
  // 배치 변형 — R4 골드 핸들(blushLift/Spread)을 룩 정의에 포함
  addRegionLook(lib, 'blush', 'draping-lift', '드레이핑 리프트', '컨투어',
    single('블러셔', 'blush', {
      blushShape: 2,
      blushColor: '#E86A80',
      blushIntensity: 0.45,
      blushFinish: 0,
      blushLift: 0.05,
      blushSpread: 0.04,
    }));

  // ── 눈썹 4종 — 제품 종류가 각각 별도 부위(#19b 분리). 제품 스택 조합 다양화.
  addRegionLook(lib, 'brow', 'natural', '내추럴 브로우', '눈썹', [
    {
      name: '결+채움',
      leaves: [{
        label: '브로우 마스카라',
        region: 'brow', // 결(browColor/browIntensity)
        params: { browColor: '#4A3428', browIntensity: 0.3 },
      }],
    },
    {
      name: '결+채움',
      leaves: [{
        // 별도 부위(채움) — 제품 합성으로 병합된다
        label: '브로우 파우더',
        region: 'browPowder',
        params: { browPowderColor: '#4A3628', browPowderIntensity: 0.2 },
      }],
    },
  ]);
  addRegionLook(lib, 'brow', 'powder-full', '파우더 풀브로우', '눈썹',
    single('브로우 파우더', 'browPowder', {
      browPowderColor: '#3A2A20',
      browPowderIntensity: 0.45,
      browThickness: 1.15, // 두께=눈썹 슬롯 공통 핏(browPowder도 소유)
    }));
  addRegionLook(lib, 'brow', 'pencil', '펜슬 한올한올', '눈썹',
    single('브로우 펜슬', 'browPencil', {
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0.5,
      browPencilTexture: 4, // 펜슬
    }));
  addRegionLook(lib, 'brow', 'soft-lighten', '소프트 라이트닝', '눈썹', [
    {
      name: '라이트너+결',
      leaves: [{
        label: '브로우 라이트너',
        region: 'browLightener',
        params: { browLightenerIntensity: 0.5 },
      }],
    },
    {
      name: '라이트너+결',
      leaves: [{
        label: '라이트 마스카라',
        region: 'brow',
        params: { browColor: '#6B5240', browIntensity: 0.22 },
      }],
    },
  ]);

  // ── 피부 3종 — 카탈로그 "피부 — 베이스" 제형 잎으로. 글로우/세미매트/커버.
  //    각 잎은 부위 소유 필드만(tone=skinBrightening/toneBaseColor,
  //    skin=skinSmoothing/skinGlow, foundation=foundationColor/Intensity/Finish,
  //    powder=powderIntensity, concealer=concealerColor/Intensity).
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
        params: { skinSmoothing: 0.35, skinGlow: 0.5 },
      }],
    },
    {
      name: '파운데이션',
      leaves: [{
        label: '스킨틴트',
        region: 'foundation',
        params: { foundationColor: '#EFD0BC', foundationIntensity: 0.3, foundationFinish: 2, foundationTexture: 2 }, // 스킨틴트
      }],
    },
  ]);
  addRegionLook(lib, 'skin', 'semi-matte', '세미매트 스킨', '피부', [
    {
      name: '질감 베이스',
      leaves: [{
        label: '모공 프라이머',
        region: 'skin',
        params: { skinSmoothing: 0.5 },
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
        params: { powderIntensity: 0.3, powderTexture: 1 }, // 트랜스루선트 파우더
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
        params: { powderIntensity: 0.5, powderTexture: 1 }, // 트랜스루선트 파우더
      }],
    },
  ]);

  // ── 세부부위 룩 — BasicMode의 세부부위 탭은 level='sub' 정의를 직접 조회한다.
  //    기존 '전체' 탭의 슬롯 룩 목록과 섞이지 않도록 region 래퍼는 만들지 않는다.

  // 질감 프라이머 2종 — 위 피부 3종의 '질감 베이스' 파트가 쓰던 params 그대로.
  //  (복합 룩의 내부 파트는 세부부위 카드에 안 뜬다 — 여기서 standalone으로 제공)
  addRegionLook(lib, 'skin-prime', 'glow-primer', '윤광 프라이머', '피부',
    single('윤광 프라이머', 'skin', {
      skinSmoothing: 0.35,
      skinGlow: 0.5,
    }), false);
  addRegionLook(lib, 'skin-prime', 'pore-primer', '모공 프라이머', '피부',
    single('모공 프라이머', 'skin', {
      skinSmoothing: 0.5,
    }), false);

  // 파운데이션 3종 — 제형(FOUNDATION_TEXTURES) × 마감. 색·커버리지·마감은 피부 3종의
  //    '파운데이션' 파트 값 재사용(스킨틴트/쿠션/리퀴드), 제형만 라벨에 맞춰 명시.
  addRegionLook(lib, 'foundation', 'skin-tint', '스킨틴트 듀이', '피부',
    single('스킨틴트 듀이', 'foundation', {
      foundationTexture: 2,
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
  // 컬러 코렉터 3종 — CONCEALER_COLORS 보정색 + 모양(눈밑/붉은기 자동)·마감 축 조합.
  addRegionLook(lib, 'concealer', 'green-corrector', '그린 코렉터', '피부',
    single('그린 코렉터', 'concealer', {
      concealerColor: '#BFE3C8', // 붉은 트러블 중화
      concealerShape: 1, // 붉은기 자동
      concealerIntensity: 0.4,
    }), false);
  addRegionLook(lib, 'concealer', 'peach-undereye', '피치 다크서클', '피부',
    single('피치 다크서클', 'concealer', {
      concealerColor: '#F7C9A8', // 다크서클 중화
      concealerShape: 0, // 눈밑 존
      concealerIntensity: 0.42,
    }), false);
  addRegionLook(lib, 'concealer', 'lavender-bright', '라벤더 브라이트', '피부',
    single('라벤더 브라이트', 'concealer', {
      concealerColor: '#D9C8E8', // 노란기 중화
      concealerIntensity: 0.35,
      concealerFinish: 2, // 듀이
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
  addRegionLook(lib, 'brow-lightener', 'powder-lighten', '파우더 라이트너', '눈썹',
    single('파우더 라이트너', 'browLightener', {
      browLightenerIntensity: 0.4,
      browLightenerTexture: 1, // 파우더 — 보송한 옅음
    }), false);
  addRegionLook(lib, 'brow-lightener', 'gel-soft-lighten', '젤 소프트 라이트너', '눈썹',
    single('젤 소프트 라이트너', 'browLightener', {
      browLightenerIntensity: 0.32,
      browLightenerTexture: 3, // 젤 — 매끈 코팅
      browLightenerFinish: 2, // 듀이
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
      highlightFinish: 2,
      highlightLift: 0.02,
      highlightSpread: 0.03,
      highlightEdgeSoftness: 0.65,
    }), false);
  addRegionLook(lib, 'highlighter', 'pink-pearl', '핑크 펄', '컨투어',
    single('핑크 펄', 'highlighter', {
      highlightColor: '#F5DDE2',
      highlightIntensity: 0.24,
      highlightFinish: 3,
      highlightShimmer: 0.45,
      highlightLift: 0.01,
      highlightSpread: 0.01,
      highlightEdgeSoftness: 0.55,
    }), false);
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
      contourFinish: 0,
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

  // 아이섀도 하 4종 — 애교살 아래에 깔리는 하안검 음영.
  addRegionLook(lib, 'eyeshadow-lower', 'daily-beige', '데일리 베이지', '눈',
    single('데일리 베이지', 'eyeshadowLower', {
      eyeshadowLowerColor: '#C29A7B',
      eyeshadowLowerIntensity: 0.16,
      eyeshadowLowerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeshadow-lower', 'coral-shadow', '코랄 그늘', '눈',
    single('코랄 그늘', 'eyeshadowLower', {
      eyeshadowLowerColor: '#B06A4E',
      eyeshadowLowerIntensity: 0.22,
      eyeshadowLowerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeshadow-lower', 'rosy-under', '로지 언더', '눈',
    single('로지 언더', 'eyeshadowLower', {
      eyeshadowLowerColor: '#D89AA0',
      eyeshadowLowerIntensity: 0.23,
      eyeshadowLowerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeshadow-lower', 'mauve-shimmer', '모브 시머', '눈',
    single('모브 시머', 'eyeshadowLower', {
      eyeshadowLowerColor: '#6E5A8A',
      eyeshadowLowerIntensity: 0.27,
      eyeshadowLowerFinish: 3,
      eyeshadowLowerShimmer: 0.35,
    }), false);
  // 꼬리집중 매트 — 언더 스모키의 눈꼬리 깊이(esBand 프로파일 2 + 매트 마감).
  addRegionLook(lib, 'eyeshadow-lower', 'deep-smoky-under', '딥 스모키 언더', '눈',
    single('딥 스모키 언더', 'eyeshadowLower', {
      eyeshadowLowerColor: '#5C4A46',
      eyeshadowLowerIntensity: 0.26,
      eyeshadowLowerShape: 2, // 꼬리집중
      eyeshadowLowerFinish: 1, // 매트
    }), false);

  // 아이라인 하 3종 — 색은 상·하 라인이 공유하는 계약을 그대로 따른다.
  addRegionLook(lib, 'eyeliner-lower', 'soft-brown', '소프트 브라운', '눈',
    single('소프트 브라운', 'eyelinerLower', {
      eyelinerColor: '#5A4433',
      eyelinerLowerIntensity: 0.16,
    }), false);
  addRegionLook(lib, 'eyeliner-lower', 'deep-brown', '딥 브라운', '눈',
    single('딥 브라운', 'eyelinerLower', {
      eyelinerColor: '#3A2A20',
      eyelinerLowerIntensity: 0.23,
    }), false);
  addRegionLook(lib, 'eyeliner-lower', 'burgundy-under', '버건디 언더', '눈',
    single('버건디 언더', 'eyelinerLower', {
      eyelinerColor: '#5A2A3A',
      eyelinerLowerIntensity: 0.2,
    }), false);
  // 구간 축(LOWER_EYELINER_SEGMENTS) 변주 2종 — 앞+꼬리 롱, 꼬리만 포인트.
  addRegionLook(lib, 'eyeliner-lower', 'long-under', '롱 언더라인', '눈',
    single('롱 언더라인', 'eyelinerLower', {
      eyelinerColor: '#3A2A20',
      eyelinerLowerIntensity: 0.2,
      eyelinerLowerSegment: 2, // 앞+꼬리
    }), false);
  addRegionLook(lib, 'eyeliner-lower', 'tail-accent', '꼬리 포인트 언더', '눈',
    single('꼬리 포인트 언더', 'eyelinerLower', {
      eyelinerColor: '#141014',
      eyelinerLowerIntensity: 0.22,
      eyelinerLowerSegment: 1, // 꼬리만
    }), false);

  // 아이라인 상 5종 — 모양(윙업/롱)·구간(눈동자 위·앞+꼬리)·제형(리퀴드/젤/펜슬)·
  //   마감(새틴/매트/펄) 축을 조합해 성격이 또렷이 갈리게. 세부부위 카드 전용.
  addRegionLook(lib, 'eyeliner-upper', 'black-wing-liquid', '블랙 윙 리퀴드', '눈',
    single('블랙 윙 리퀴드', 'eyelinerUpper', {
      eyelinerColor: '#141014',
      eyelinerIntensity: 0.6,
      eyelinerStyle: 0, // 윙업
      eyelinerTexture: 0, // 리퀴드
      eyelinerFinish: 0, // 새틴
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'brown-daily-pencil', '브라운 데일리 펜슬', '눈',
    single('브라운 데일리 펜슬', 'eyelinerUpper', {
      eyelinerColor: '#3A2A20',
      eyelinerIntensity: 0.42,
      eyelinerStyle: 2, // 롱
      eyelinerTexture: 2, // 펜슬
      eyelinerFinish: 1, // 매트
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'inner-line-gel', '이너라인 젤', '눈',
    single('이너라인 젤', 'eyelinerUpper', {
      eyelinerColor: '#181418',
      eyelinerIntensity: 0.5,
      eyelinerSegment: 3, // 눈동자 위 — 안쪽 채움
      eyelinerTexture: 1, // 젤
      eyelinerFinish: 0,
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'burgundy-pearl', '버건디 펄 라인', '눈',
    single('버건디 펄 라인', 'eyelinerUpper', {
      eyelinerColor: '#5A2A3A',
      eyelinerIntensity: 0.45,
      eyelinerTexture: 0, // 리퀴드
      eyelinerFinish: 3, // 펄
    }), false);
  addRegionLook(lib, 'eyeliner-upper', 'long-matte-wing', '롱 매트 윙', '눈',
    single('롱 매트 윙', 'eyelinerUpper', {
      eyelinerColor: '#141014',
      eyelinerIntensity: 0.55,
      eyelinerStyle: 2, // 롱
      eyelinerSegment: 2, // 앞+꼬리
      eyelinerFinish: 1, // 매트
    }), false);

  // 애교살 4종 — 임포트 강도 없이 내장 밴드의 톤·펄·두께 축만 사용.
  addRegionLook(lib, 'aegyo', 'natural-ivory', '내추럴 아이보리', '눈',
    single('내추럴 아이보리', 'aegyo', {
      aegyoColor: '#FFF3E2',
      aegyoIntensity: 0.25,
      aegyoFinish: 0,
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
      aegyoFinish: 0,
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
    single('내추럴 브라운', 'mascara', {
      mascaraStyle: 0,
      mascaraColor: '#3A2A20',
      mascaraIntensity: 0.32,
      mascaraLength: 0.92,
    }), false);
  addRegionLook(lib, 'mascara', 'long-lash', '롱래시 블랙', '눈',
    single('롱래시 블랙', 'mascara', {
      mascaraStyle: 0,
      mascaraColor: '#181418',
      mascaraIntensity: 0.46,
      mascaraLength: 1.2,
    }), false);
  addRegionLook(lib, 'mascara', 'dolly-volume', '돌리 볼륨', '눈',
    single('돌리 볼륨', 'mascara', {
      mascaraStyle: 1,
      mascaraColor: '#141014',
      mascaraIntensity: 0.52,
      mascaraLength: 1.08,
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

  // 눈썹 지우개 3종 — 피부톤 컨실 강도만 단계화해 다른 눈썹 제품의 밑작업으로 사용.
  addRegionLook(lib, 'brow-conceal', 'soft-cleanup', '소프트 정돈', '눈썹',
    single('소프트 정돈', 'browConceal', {
      browConcealIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'brow-conceal', 'half-cover', '반톤 커버', '눈썹',
    single('반톤 커버', 'browConceal', {
      browConcealIntensity: 0.48,
    }), false);
  addRegionLook(lib, 'brow-conceal', 'clean-canvas', '클린 캔버스', '눈썹',
    single('클린 캔버스', 'browConceal', {
      browConcealIntensity: 0.65,
    }), false);

  // 눈썹 스타일 4종 — 임포트 없이 번들 default_brow 텍스처를 색·모양·핏으로 변주.
  addRegionLook(lib, 'brow-style', 'natural-texture', '내추럴 결', '눈썹',
    single('내추럴 결', 'browStyle', {
      browStyleColor: '#4A3628',
      browStyleIntensity: 0.3,
      browShape: 0,
      browThickness: 1,
      browArch: 0.08,
    }), false);
  addRegionLook(lib, 'brow-style', 'soft-straight', '소프트 일자', '눈썹',
    single('소프트 일자', 'browStyle', {
      browStyleColor: '#5A4433',
      browStyleIntensity: 0.34,
      browShape: 1,
      browThickness: 1.1,
      browArch: 0,
    }), false);
  addRegionLook(lib, 'brow-style', 'slim-arch', '슬림 아치', '눈썹',
    single('슬림 아치', 'browStyle', {
      browStyleColor: '#3A2A20',
      browStyleIntensity: 0.4,
      browShape: 2,
      browThickness: 0.82,
      browArch: 0.42,
    }), false);
  addRegionLook(lib, 'brow-style', 'lifted-brow', '리프트 브로우', '눈썹',
    single('리프트 브로우', 'browStyle', {
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0.44,
      browShape: 4,
      browThickness: 0.95,
      browArch: 0.3,
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

  // 립글로스 4종 — 독립 광 톱코트의 투명·피치·로즈 틴트와 광량 차이.
  addRegionLook(lib, 'lip-gloss', 'clear-dew', '클리어 듀', '립',
    single('클리어 듀', 'lipGloss', {
      lipGlossColor: '#FFFFFF',
      lipGlossIntensity: 0.3,
    }), false);
  addRegionLook(lib, 'lip-gloss', 'peach-jelly', '피치 젤리', '립',
    single('피치 젤리', 'lipGloss', {
      lipGlossColor: '#F7D9D0',
      lipGlossIntensity: 0.4,
    }), false);
  addRegionLook(lib, 'lip-gloss', 'rose-syrup', '로즈 시럽', '립',
    single('로즈 시럽', 'lipGloss', {
      lipGlossColor: '#E9B7C2',
      lipGlossIntensity: 0.46,
    }), false);
  addRegionLook(lib, 'lip-gloss', 'glass-coat', '글래스 코팅', '립',
    single('글래스 코팅', 'lipGloss', {
      lipGlossColor: '#FFFFFF',
      lipGlossIntensity: 0.55,
    }), false);

  // 치아 미백 3종 — 입을 벌렸을 때만 보이는 자연스러운 단계.
  addRegionLook(lib, 'teeth', 'daily-bright', '데일리 브라이트', '립',
    single('데일리 브라이트', 'teeth', {
      teethWhitenIntensity: 0.25,
    }), false);
  addRegionLook(lib, 'teeth', 'clean-white', '클린 화이트', '립',
    single('클린 화이트', 'teeth', {
      teethWhitenIntensity: 0.45,
    }), false);
  addRegionLook(lib, 'teeth', 'photo-white', '포토 화이트', '립',
    single('포토 화이트', 'teeth', {
      teethWhitenIntensity: 0.65,
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

  return lib;
}
