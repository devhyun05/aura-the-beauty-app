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
  const subIds = subs.map((sub, i) => {
    const subId = `${regionId}:s${i}`;
    lib[subId] = {
      id: subId,
      name: sub.name,
      level: 'sub',
      slot,
      owner: 'system',
      pickerScope: exposeAtRegionLevel ? 'internal' : 'standalone',
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
      name: '윤광 프라이머',
      leaves: [{
        label: '윤광 프라이머',
        region: 'skin',
        params: { skinSmoothing: 0.45, skinGlow: 0.5 },
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
      name: '모공 프라이머',
      leaves: [{
        label: '모공 프라이머',
        region: 'skin',
        params: { skinSmoothing: 0.6 },
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

  // 피부 전체 룩의 내부 프라이머를 세부부위 카드에 재사용하지 않는다. 피부결에서
  // 직접 고르는 두 카드는 별도 standalone 정의로 제공한다.
  addRegionLook(lib, 'skin-primer', 'pore', '모공 프라이머', '피부',
    single('모공 프라이머', 'skin', {
      skinSmoothing: 0.6,
      skinGlow: 0,
    }), false);
  addRegionLook(lib, 'skin-primer', 'glow', '윤광 프라이머', '피부',
    single('윤광 프라이머', 'skin', {
      skinSmoothing: 0.45,
      skinGlow: 0.5,
    }), false);

  // ── 세부부위 룩 — BasicMode의 세부부위 탭은 level='sub' 정의를 직접 조회한다.
  //    기존 '전체' 탭의 슬롯 룩 목록과 섞이지 않도록 region 래퍼는 만들지 않는다.

  // 하이라이터 5부위 × 은은/펄. 각 룩은 자기 부위 강도만 소유해 독립 토글된다.
  const highlighterLooks: Array<{
    slug: string;
    name: string;
    region: Extract<RegionKey,
      | 'highlightCheek'
      | 'highlightNoseBridge'
      | 'highlightNoseTip'
      | 'highlightBrowBone'
      | 'highlightCupid'>;
    intensityKey: keyof FilterParams;
    soft: [number, string];
    pearl: [number, string, number];
  }> = [
    {slug: 'cheek', name: '광대', region: 'highlightCheek', intensityKey: 'highlightCheekIntensity', soft: [0.42, '#F6D6C7'], pearl: [0.52, '#FFE2C2', 0.58]},
    {slug: 'bridge', name: '콧대', region: 'highlightNoseBridge', intensityKey: 'highlightNoseBridgeIntensity', soft: [0.32, '#F4D9CB'], pearl: [0.42, '#FFE4C7', 0.48]},
    {slug: 'tip', name: '코끝', region: 'highlightNoseTip', intensityKey: 'highlightNoseTipIntensity', soft: [0.3, '#F6D8C9'], pearl: [0.48, '#FFE3C2', 0.62]},
    {slug: 'brow-bone', name: '눈썹뼈', region: 'highlightBrowBone', intensityKey: 'highlightBrowBoneIntensity', soft: [0.3, '#F2D7CA'], pearl: [0.4, '#F7DECF', 0.44]},
    {slug: 'cupid', name: '입술산', region: 'highlightCupid', intensityKey: 'highlightCupidIntensity', soft: [0.28, '#F4D5C9'], pearl: [0.44, '#FFE0C4', 0.54]},
  ];
  for (const look of highlighterLooks) {
    addRegionLook(lib, `highlighter-${look.slug}`, 'soft', `${look.name} 은은`, '컨투어',
      single(`${look.name} 은은`, look.region, {
        [look.intensityKey]: look.soft[0],
        highlightColor: look.soft[1],
        highlightFinish: 0,
        highlightShimmer: 0.1,
      }), false);
    addRegionLook(lib, `highlighter-${look.slug}`, 'pearl', `${look.name} 펄`, '컨투어',
      single(`${look.name} 펄`, look.region, {
        [look.intensityKey]: look.pearl[0],
        highlightColor: look.pearl[1],
        highlightFinish: 3,
        highlightShimmer: look.pearl[2],
      }), false);
  }

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

  // 아이섀도 상 12종 — 각 shape가 standalone 카드에 정확히 한 번씩 등장한다.
  const upperShadows: Array<{
    slug: string; name: string; shape: number; color: string; color2: string;
    intensity: number; gradient: number; finish: number; shimmer: number; height?: number;
  }> = [
    {slug: 'base-full', name: '베이스 전체', shape: 0, color: '#C99186', color2: '#E5B4AA', intensity: 0.42, gradient: 0.35, finish: 0, shimmer: 0.1},
    {slug: 'base-inner', name: '베이스 앞쪽', shape: 1, color: '#D7A39B', color2: '#F1C7BC', intensity: 0.4, gradient: 0.3, finish: 0, shimmer: 0.08},
    {slug: 'base-outer', name: '베이스 뒤쪽', shape: 2, color: '#9B645F', color2: '#C88A82', intensity: 0.48, gradient: 0.45, finish: 1, shimmer: 0},
    {slug: 'main-inner', name: '메인 앞쪽', shape: 3, color: '#B87773', color2: '#D99A92', intensity: 0.52, gradient: 0.35, finish: 0, shimmer: 0.12},
    {slug: 'main-center', name: '메인 중앙', shape: 4, color: '#B77A86', color2: '#E2A7AF', intensity: 0.55, gradient: 0.45, finish: 3, shimmer: 0.38},
    {slug: 'main-outer', name: '메인 뒤쪽', shape: 5, color: '#85515B', color2: '#B9787E', intensity: 0.58, gradient: 0.5, finish: 0, shimmer: 0.15},
    {slug: 'point-inner', name: '포인트 앞머리', shape: 6, color: '#F0CDB6', color2: '#FFE7CD', intensity: 0.5, gradient: 0.55, finish: 3, shimmer: 0.58},
    {slug: 'point-center', name: '포인트 눈동자 위', shape: 7, color: '#E7B3A9', color2: '#FFD9C8', intensity: 0.56, gradient: 0.6, finish: 3, shimmer: 0.68},
    {slug: 'point-outer', name: '포인트 눈꼬리', shape: 8, color: '#7D4658', color2: '#B66B7A', intensity: 0.62, gradient: 0.55, finish: 0, shimmer: 0.18},
    {slug: 'crease', name: '크리스', shape: 9, color: '#795B59', color2: '#A77B75', intensity: 0.5, gradient: 0.25, finish: 1, shimmer: 0},
    {slug: 'smoky', name: '스모키', shape: 10, color: '#554B52', color2: '#846F75', intensity: 0.62, gradient: 0.6, finish: 1, shimmer: 0, height: 1.15},
    {slug: 'wide-gradient', name: '와이드 그라데', shape: 11, color: '#B36F7B', color2: '#E0A4A7', intensity: 0.56, gradient: 0.75, finish: 0, shimmer: 0.2, height: 1.25},
  ];
  for (const look of upperShadows) {
    addRegionLook(lib, 'eyeshadow-upper', look.slug, look.name, '눈',
      single(look.name, 'eyeshadow', {
        eyeshadowShape: look.shape,
        eyeshadowColor: look.color,
        eyeshadowColor2: look.color2,
        eyeshadowIntensity: look.intensity,
        eyeshadowGradient: look.gradient,
        eyeshadowFinish: look.finish,
        eyeshadowShimmer: look.shimmer,
        eyeshadowHeight: look.height ?? 1,
      }), false);
  }

  const lowerShadows = [
    ['peach-satin', '피치 새틴', '#D79A85', 0.34, 0, 0.08],
    ['taupe-matte', '토프 매트', '#826C67', 0.42, 1, 0],
    ['rosy-shimmer', '로지 시머', '#C98291', 0.38, 3, 0.48],
    ['inner-bright', '앞머리 밝힘', '#EBC7B2', 0.3, 3, 0.38],
    ['outer-shadow', '바깥 음영', '#77555C', 0.46, 1, 0],
    ['under-smoky', '언더 스모키', '#514A50', 0.52, 1, 0],
  ] as const;
  for (const [slug, name, color, intensity, finish, shimmer] of lowerShadows) {
    addRegionLook(lib, 'eyeshadow-lower', slug, name, '눈',
      single(name, 'eyeshadowLower', {
        eyeshadowLowerColor: color,
        eyeshadowLowerIntensity: intensity,
        eyeshadowLowerFinish: finish,
        eyeshadowLowerShimmer: shimmer,
      }), false);
  }

  const upperLiners = [
    ['thin-brown', '얇은 브라운', 4, 0, 0, 0, '#4A302A', 0.46],
    ['sharp-black-wing', '샤프 블랙 윙', 0, 0, 0, 1, '#171416', 0.72],
    ['puppy-brown', '퍼피 브라운', 1, 0, 1, 0, '#55352F', 0.58],
    ['horizontal-long', '가로 롱', 2, 0, 0, 1, '#272126', 0.64],
    ['tail-point', '꼬리 포인트', 3, 1, 0, 1, '#20191D', 0.7],
    ['inner-tail', '앞머리+꼬리', 4, 2, 0, 0, '#3A2525', 0.6],
    ['smoky-gel', '스모키 젤', 5, 0, 1, 0, '#46383E', 0.55],
    ['color-pearl', '컬러 펄', 0, 3, 2, 3, '#6F486D', 0.52],
  ] as const;
  for (const [slug, name, style, segment, texture, finish, color, intensity] of upperLiners) {
    addRegionLook(lib, 'eyeliner-upper', slug, name, '눈',
      single(name, 'eyelinerUpper', {
        eyelinerStyle: style,
        eyelinerSegment: segment,
        eyelinerTexture: texture,
        eyelinerFinish: finish,
        eyelinerColor: color,
        eyelinerIntensity: intensity,
      }), false);
  }

  const lowerLiners = [
    ['soft-brown', '소프트 브라운', 0, 0, 0, '#5B3D35', 0.36],
    ['deep-brown', '딥 브라운', 0, 1, 0, '#34241F', 0.48],
    ['burgundy', '버건디', 0, 0, 0.05, '#63313D', 0.44],
    ['tight-waterline', '얇은 점막', 1, 1, 0, '#292023', 0.4],
    ['outer-third', '바깥 1/3', 2, 0, 0.05, '#493036', 0.5],
    ['soft-pearl', '소프트 펄', 2, 3, 0.48, '#8A647F', 0.38],
  ] as const;
  for (const [slug, name, style, finish, shimmer, color, intensity] of lowerLiners) {
    addRegionLook(lib, 'eyeliner-lower', slug, name, '눈',
      single(name, 'eyelinerLower', {
        eyelinerLowerStyle: style,
        eyelinerLowerFinish: finish,
        eyelinerLowerShimmer: shimmer,
        eyelinerColor: color,
        eyelinerLowerIntensity: intensity,
      }), false);
  }

  const aegyoLooks = [
    ['natural-soft', '내추럴 소프트', 0, '#F1D2C7', 0.36, 0.26, 0, 0.85],
    ['rosy-volume', '로지 볼륨', 0, '#E9BFC0', 0.44, 0.32, 0, 1],
    ['plump-volume', '도톰 볼륨', 0, '#F0CBBB', 0.52, 0.38, 0, 1.18],
    ['champagne-pearl', '샴페인 펄', 1, '#FFE0B8', 0.44, 0.28, 0.54, 0.95],
    ['pink-pearl', '핑크 펄', 1, '#F2BDD0', 0.46, 0.3, 0.58, 1],
    ['lilac-pearl', '라일락 펄', 1, '#DCC8F2', 0.42, 0.28, 0.62, 0.96],
  ] as const;
  for (const [slug, name, mode, color, intensity, shadow, shimmer, height] of aegyoLooks) {
    addRegionLook(lib, 'aegyo', slug, name, '눈',
      single(name, 'aegyo', {
        aegyoMode: mode,
        aegyoColor: color,
        aegyoIntensity: intensity,
        aegyoShadowIntensity: shadow,
        aegyoShimmer: shimmer,
        aegyoHeight: height,
        aegyoRendererVersion: 1,
      }), false);
  }

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
