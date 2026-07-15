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
import type { LookLibrary, SlotKey } from './lookTree';
import type { RegionKey } from './regions';

interface LeafSpec {
  label: string;
  region: RegionKey;
  params: Partial<FilterParams>;
  /** 렌즈 세부(#25) payload — region이 lensBase/lensDetail/lensRim일 때 */
  lens?: LensLayer;
  /** 역할 태그(§5 A13) — 같은 부위 다겹의 배치 역할(핏 '.부위[역할]' 셀렉터 대상) */
  role?: string;
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
): void {
  const regionId = `sys:var:${slotSlug}:${nameSlug}`;
  const subIds = subs.map((sub, i) => {
    const subId = `${regionId}:s${i}`;
    lib[subId] = {
      id: subId,
      name: sub.name,
      level: 'sub',
      slot,
      owner: 'system',
      kids: sub.leaves.map(leaf => ({
        label: leaf.label,
        region: leaf.region,
        params: { ...leaf.params },
        ...(leaf.lens ? { lens: { ...leaf.lens } } : {}),
        ...(leaf.role ? { role: leaf.role } : {}),
      })),
    };
    return subId;
  });
  lib[regionId] = {
    id: regionId,
    name,
    level: 'region',
    slot,
    owner: 'system',
    kids: subIds,
  };
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
    single('MLBB 벨벳', 'lip', { lipColor: '#C94F6D', lipIntensity: 0.4, lipFinish: 0 }));
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
        params: { lipLinerColor: '#7A2A40', lipLinerIntensity: 0.35 },
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
      leaves: [
        {
          label: '베이스 컬러',
          region: 'lensBase',
          params: {},
          lens: { part: 0, color: '#8A8F96', blendMode: 1, intensity: 0.5, inner: 0, outer: 1 },
        },
        {
          label: '테두리 림',
          region: 'lensRim',
          params: {},
          lens: { part: 2, color: '#2A2A2E', blendMode: 1, intensity: 0.65, inner: 0.8, outer: 1 },
        },
      ],
    },
  ]);
  addRegionLook(lib, 'eye', 'lens-hazel', '헤이즐 그라데', '렌즈', [
    {
      name: '렌즈',
      leaves: [
        {
          label: '베이스 컬러',
          region: 'lensBase',
          params: {},
          lens: { part: 0, color: '#8A6A4A', blendMode: 3, intensity: 0.45, inner: 0, outer: 1 },
        },
        {
          label: '내부 디테일',
          region: 'lensDetail',
          params: {},
          lens: { part: 1, color: '#B79A5A', blendMode: 2, intensity: 0.4, inner: 0, outer: 0.5 },
        },
      ],
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
      leaves: [
        {
          label: '브로우 마스카라',
          region: 'brow', // 결(browColor/browIntensity)
          params: { browColor: '#4A3428', browIntensity: 0.3 },
        },
        {
          // 별도 부위(채움) — 제품 합성으로 병합된다
          label: '브로우 파우더',
          region: 'browPowder',
          params: { browPowderColor: '#4A3628', browPowderIntensity: 0.2 },
        },
      ],
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
    }));
  addRegionLook(lib, 'brow', 'soft-lighten', '소프트 라이트닝', '눈썹', [
    {
      name: '라이트너+결',
      leaves: [
        {
          label: '브로우 라이트너',
          region: 'browLightener',
          params: { browLightenerIntensity: 0.5 },
        },
        {
          label: '라이트 마스카라',
          region: 'brow',
          params: { browColor: '#6B5240', browIntensity: 0.22 },
        },
      ],
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
        label: '톤업크림',
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
        params: { foundationColor: '#EFD0BC', foundationIntensity: 0.3, foundationFinish: 2 },
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
        params: { foundationColor: '#E8C4A8', foundationIntensity: 0.5, foundationFinish: 0 },
      }],
    },
    {
      name: '파우더',
      leaves: [{
        label: '트랜스루선트 파우더',
        region: 'powder',
        params: { powderIntensity: 0.3 },
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
        params: { powderIntensity: 0.5 },
      }],
    },
  ]);

  return lib;
}
