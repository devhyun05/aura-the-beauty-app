/**
 * 재귀 룩 트리 — 목업 v2의 핵심 모델 (전체 룩 = 부위 룩의 합 = 세부 룩의 합 =
 * 제품 적용(잎)의 합). 상위 계층은 하위 참조의 묶음일 뿐 자체 데이터가 없고,
 * 실제 렌더 데이터(FilterParams 부분값)는 잎에만 있다.
 *
 * copy-on-write 3규칙 (목업 v2에서 확정):
 *  1) 편집 중 절대 묻지 않는다 — 트리는 항상 작업본(정의 불변), dirty(*)만 전파
 *  2) 시스템 프리셋은 불변 — 수정분은 저장 시 자동 사본(질문 없음)
 *  3) 중간 계층은 기본 익명으로 상위에 흡수 — ☆승격으로만 라이브러리 등록
 *  유일한 실질 질문 = 내가 만든 룩이 다른 저장 룩에서도 쓰일 때 (사본/원본 반영)
 *
 * 브리지는 무변경: flattenTree → ComposerLayer[] → compileLayers(model.ts) →
 * 기존 applyFilter/setOverlayLayers. 워프(FIT 레인)는 이 트리가 절대 소유하지
 * 않는다(fitPresets.ts).
 *
 * React 상태로 쓰이므로 모든 변형은 불변(immutable) — 새 루트를 돌려준다.
 */
import type {
  EyeshadowLayer,
  FilterParams,
  LensLayer,
  OverlayLayer,
} from '../bridge/types';
import {AR_BLUSH_COLORS} from '../../../../../shared/contracts/arBlushCatalog';
import { PRESETS } from '../presets';
import {
  EYELINER_STYLES,
  FOUNDATION_FINISHES,
  MASCARA_STYLES,
  MASCARA_STYLES_UPPER,
  REGION_GROUPS,
  REGION_MAP,
} from './regions';
import type { LookMaskRef, MaskRegion, RegionKey } from './regions';
import { migrateLegacyEyeshadowLayer, newLayer, seedLayers } from './model';
import type { ComposerLayer } from './model';

// 카탈로그 8슬롯 (FIT은 별도 레인이라 제외): 피부·컨투어·렌즈·눈·눈썹·립·헤어·데코.
export type SlotKey =
  | '피부'
  | '컨투어'
  | '렌즈'
  | '눈'
  | '눈썹'
  | '립'
  | '헤어'
  | '데코';

/** 부위(RegionKey) → 슬롯 매핑 — REGION_GROUPS.slot 선언에서 유도(드리프트 방지) */
export const SLOT_OF_REGION: Record<RegionKey, SlotKey> = (() => {
  const map = {} as Record<RegionKey, SlotKey>;
  for (const group of REGION_GROUPS) {
    for (const def of group.regions) map[def.key] = group.slot;
  }
  return map;
})();

export const SLOT_ORDER: SlotKey[] = [
  '피부',
  '컨투어',
  '렌즈', // 눈보다 먼저 — 라인·속눈썹이 렌즈 위에 오도록(분류체계 정의 A2)
  '눈',
  '눈썹',
  '립',
  '헤어',
  '데코',
];

/** 슬롯 표시 라벨 — 내부 키(저장 데이터 호환)와 화면 표기를 분리한다. 미기재 슬롯은 키 그대로. */
export const SLOT_LABEL: Record<SlotKey, string> = {
  피부: '피부',
  컨투어: '윤곽', // 키는 '컨투어' 유지, 표시만 '윤곽'
  렌즈: '렌즈',
  눈: '눈',
  눈썹: '눈썹',
  립: '립',
  헤어: '헤어',
  데코: '데코',
};

// ── 트리 노드 ────────────────────────────────────────────────────────────────

/** 잎 = 제품 적용 1회. 같은 제품을 옵션 바꿔 여러 겹 쌓을 수 있다(배열 순서=그리는 순서). */
export interface ProductLeaf {
  kind: 'app';
  id: string;
  /** 표시용 제품명 ('아이섀도', '아이섀도 2겹' 등) */
  label: string;
  region: RegionKey;
  visible: boolean;
  dirty: boolean;
  params: Partial<FilterParams>;
  /** isDecoRegion(region)일 때 캐노니컬 오버레이 한 장(데코 5종 공통 payload) */
  overlay?: OverlayLayer;
  /** region이 렌즈 세부(lensBase/lensDetail/lensRim, #25)일 때 렌즈 레이어 한 장 */
  lens?: LensLayer;
  /** 역할 태그(§5 A13, ROLE_VOCAB의 key) — 핏 시트 '.부위[역할]' 셀렉터가 지목 */
  role?: string;
  /** 제품 참조(§5 A12) — products.ts ProductDef id. null/부재=커스텀 */
  productId?: string | null;
  colorwayId?: string;
  /** 테크닉(§5) — Phase A는 강도만(제품 coverage와 곱연산) */
  technique?: { strength: number };
  /** 카탈로그 마스크 참조(§16) — 시스템/디자이너 룩이 부위 스텐실을 선언(선택). 룩 적용 시
   *  App이 세션 마스크 경로에 주입 후 마커(params[appliedKey])로 reconcileMasks 화해.
   *  저장 스냅샷에 포함된다 — URI가 빠지고 마커(params[appliedKey])만 남으면
   *  reconcileMasks가 마스크를 해제해(setRegionMask '') 하부 밴드가 번들 실루엣으로
   *  바뀌므로, 마커와 URI는 항상 같은 잎에서 함께 살고 함께 사라져야 한다.
   *  (streaming:/카탈로그 URI는 재설치에도 유효하고, 사용자 임포트 파일 경로는
   *  파일이 사라졌을 때 Unity가 직전 텍스처 유지 + 알림으로 처리한다.) */
  maskRef?: LookMaskRef;
  /** 아이라이너 콜르아트 참조(§16) — setEyelinerStyle로 보낼 streaming URI(선택).
   *  gate는 params.eyelinerStyleIntensity(잎 소유). 마스크와 같은 이유로 저장
   *  스냅샷에 포함한다(빠지면 강도만 남아 기본 윙 도안이 대신 그려진다). */
  linerStyleRef?: string;
}

export interface LookNode {
  kind: 'look';
  /** 인스턴스 id — 트리 내 유일 (React key·조작 대상 지정) */
  id: string;
  /** 라이브러리 정의 id — 수정 없이 저장되면 라이브 참조로 복원(공유 전파),
   *  수정되면 저장 시 null로 분리(익명 사본). */
  ref: string | null;
  name: string;
  level: 'face' | 'region' | 'sub';
  slot: SlotKey;
  owner: 'system' | 'user';
  visible: boolean;
  dirty: boolean;
  kids: TreeChild[];
  /** 사용자 그룹 메타(face 루트에만) — 슬롯을 넘나드는 가상 컨테이너(#23 Phase 3).
   *  표시·조작 단위일 뿐 렌더에 영향 없음: flattenTree/컴파일은 groups를 무시하고
   *  kids만 걷는다. 그룹 통째 켬/끔은 멤버 region의 visible로 위임한다. */
  groups?: LookGroup[];
  /** 핏 시트 지정(§5 A13) — 참조만(내 핏 라이브러리 id, ref와 동일 패턴).
   *  이 노드 아래 잎들은 이 시트를 메인보다 우선 적용(하위룩>룩>메인 캐스케이드).
   *  룩 공유 시 벗겨진다(핏=내 얼굴 종속물 — §5 공유 원칙). */
  fitRef?: string | null;
}

/** 사용자 그룹 — face 아래 region 노드 여럿을 슬롯 무관하게 묶는 가상 컨테이너.
 *  memberIds = root 직속 region 노드 인스턴스 id. 렌더에 영향 없는 표시 메타. */
export interface LookGroup {
  id: string;
  name: string;
  memberIds: string[];
  visible: boolean;
  /** 라이브러리 그룹 번들 참조(#23 Phase 3) — 번들에서 인스턴스화됐으면 그 def id.
   *  익명 그룹(직접 묶기)은 null/미지정. 저장 시 copy-on-write 대상 판별에 쓴다
   *  (멤버가 dirty면 "이 룩에서만/원본에 반영"을 그룹 단위로 묻는다). */
  ref?: string | null;
}

export type TreeChild = LookNode | ProductLeaf;

export function isLeaf(c: TreeChild): c is ProductLeaf {
  return c.kind === 'app';
}

// ── 라이브러리 정의 (직렬화 가능) ────────────────────────────────────────────

export interface LeafDef {
  label: string;
  region: RegionKey;
  params: Partial<FilterParams>;
  overlay?: OverlayLayer;
  /** 렌즈 세부(#25) payload */
  lens?: LensLayer;
  /** 역할 태그(§5 A13) — 시스템/디자이너 룩이 겹의 배치 역할을 선언(선택) */
  role?: string;
  /** 제품 참조(§5 A12) — 정의가 특정 제품을 쓰는 룩일 때 */
  productId?: string | null;
  colorwayId?: string;
  technique?: { strength: number };
  /** 카탈로그 마스크 참조(§16) — 잎이 참조하는 부위 스텐실 URI(선택). ProductLeaf 참조. */
  maskRef?: LookMaskRef;
  /** 아이라이너 콜르아트 참조(§16) — setEyelinerStyle URI(선택). ProductLeaf 참조. */
  linerStyleRef?: string;
}

export interface LookDef {
  id: string;
  name: string;
  level: 'face' | 'region' | 'sub';
  slot: SlotKey;
  owner: 'system' | 'user';
  /** 그룹 번들(#23 Phase 3) — 슬롯을 넘나드는 region 정의 묶음. kind==='group'이면
   *  kids는 region 정의 id 배열이고, 재사용 시 멤버 region 노드로 펼쳐져 새 그룹으로
   *  인스턴스화된다(instantiateGroup). 미지정=일반 룩 정의. 하위호환: 옛 라이브러리엔
   *  이 필드가 없어 undefined로 로드되며 일반 정의로 동작한다. */
  kind?: 'group';
  /** 내부 구성 요소(sub 레벨 전용) — 여러 파트로 이뤄진 상위 부위 룩의 조각이라
   *  단독으로는 의미가 없다("파운데이션"만 떼면 어느 룩의 것인지 알 수 없다).
   *  세부부위 ⇄ 픽커(subDefsForRegion)에 노출하지 않는다. 라이브러리에는 그대로
   *  남아 상위 룩 인스턴스화·기존 스냅샷 revive에 쓰인다. 미지정=standalone
   *  (하위호환: 옛 저장본엔 이 필드가 없어 undefined로 로드되고 노출된다). */
  internal?: boolean;
  /** face/region 레벨: 하위 정의 id 배열 · sub 레벨: 잎 정의 배열 */
  kids: string[] | LeafDef[];
}

export type LookLibrary = Record<string, LookDef>;

let seq = 0;
const nid = (p: string) => `${p}${++seq}`;

/** 스냅샷에서 복원한 인스턴스 id를 그대로 쓰되, 세션 카운터를 그 뒤로 밀어
 *  이후 nid()가 같은 id를 다시 뱉지 않게 한다(§5 A13 — 겹id 셀렉터 영속의 전제). */
const claimId = (id: string): string => {
  const m = /^(?:lf|lk)(\d+)$/.exec(id);
  if (m) seq = Math.max(seq, Number(m[1]));
  return id;
};

let groupSeq = 0;
const gid = () => `grp${++groupSeq}`;

// ── 시스템 라이브러리 — 기존 PRESETS를 재귀 구조로 분해 ─────────────────────

const SYSTEM_PRESET_IDS = ['natural', 'rosy', 'peach', 'glam', 'smoky'];

// ── 세부부위(sub) 이름 유도 — 프리셋(전체룩) 이름을 물려주지 않는다 ─────────────
// 사용자 지적: 세부부위 카드가 "글램 마스카라"처럼 전체룩 이름을 물려받았다. 세부부위
// 룩은 자기 성격(대표색/스타일/마감)을 말하는 이름을 가져야 한다. 잎 특성에서 유도하고,
// 같은 부위에 같은 이름이 겹치면(프리셋마다 유사한 베이스 등) 번호만 덧붙인다.

/** 프리셋에 실제로 쓰인 대표색 hex → 색계열 한국어. 유도 실패 시(신규 색) HSL 폴백. */
const COLOR_FAMILY_KO: Record<string, string> = {
  // 립
  '#D96C7B': '로즈', '#E04E68': '로즈', '#F2846B': '코랄', '#B01E3C': '레드', '#A65560': '모브',
  // 블러셔
  '#F2A0AC': '로즈', '#F08698': '핑크', '#F7A98C': '피치', '#D97386': '로즈', '#C98A93': '모브',
  ...Object.fromEntries(AR_BLUSH_COLORS.map(color => [color.hex, color.label])),
  // 아이섀도(상·하)·삼각존
  '#C29A7B': '베이지', '#D89AA0': '로즈', '#E0A183': '코랄', '#8A5A44': '브라운', '#5C4A46': '토프',
  '#3E2C24': '딥브라운',
  // 눈썹(결·채움·한올) — BROW_COLORS
  '#4A3428': '브라운', '#4A3628': '브라운', '#6B5240': '브라운',
  '#3A2A20': '다크브라운', '#2A1E16': '다크브라운',
  // 애교살·하이라이터
  '#FFF3E2': '아이보리', '#FFD9E0': '핑크', '#F7E7CE': '샴페인',
  '#F5DDE2': '핑크', '#FFE9C8': '샴페인',
  // 렌즈(레이어드 베이스 payload)
  '#5B7B8C': '그레이블루', '#7A6A9E': '바이올렛',
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** hex → 색계열 한국어. 표에 없으면 HSL로 대략 분류(방어용 — 현재 프리셋은 표에서 해결). */
function colorFamilyKo(hex: string): string {
  const up = hex.toUpperCase();
  if (COLOR_FAMILY_KO[up]) return COLOR_FAMILY_KO[up];
  const rgb = hexToRgb(up);
  if (!rgb) return '';
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12) return l > 0.85 ? '아이보리' : l > 0.5 ? '그레이' : '다크';
  let h = 0;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  if (h < 15 || h >= 345) return l < 0.4 ? '버건디' : '레드';
  if (h < 40) return l > 0.6 ? '코랄' : l < 0.4 ? '브라운' : '로즈';
  if (h < 55) return l < 0.45 ? '브라운' : '베이지';
  if (h < 170) return '그린';
  if (h < 255) return '블루';
  if (h < 290) return '바이올렛';
  return l > 0.6 ? '핑크' : '모브';
}

type SubNameStrategy = 'color' | 'style' | 'finish' | 'plain';

interface SubNameSpec {
  /** 부위 노운(카드에 보이는 짧은 성격어 — 이름 반복 회피용, 잎 label과 별개) */
  noun: string;
  strategy: SubNameStrategy;
  colorKey?: keyof FilterParams;
  styleKey?: keyof FilterParams;
  styleOptions?: { value: number; label: string }[];
  finishKey?: keyof FilterParams;
}

/** 프리셋 분해가 만드는 부위별 세부부위 이름 규칙. 색이 무의미한 부위(라이너·마스카라
 *  =거의 검정)는 스타일을, 색이 없는 부위(파운데)는 마감을, 베이스 보정(톤·피부결)은
 *  노운만 쓴다. 표에 없는 부위는 REGION_MAP.label로 폴백(전체룩 이름 미사용). */
const SYS_SUB_NAME: Partial<Record<RegionKey, SubNameSpec>> = {
  tone: { noun: '언더톤', strategy: 'plain' },
  skin: { noun: '피부결', strategy: 'plain' },
  foundation: { noun: '파운데', strategy: 'finish', finishKey: 'foundationFinish' },
  lip: { noun: '립', strategy: 'color', colorKey: 'lipColor' },
  blush: { noun: '블러셔', strategy: 'color', colorKey: 'blushColor' },
  eyeshadow: { noun: '섀도', strategy: 'color', colorKey: 'eyeshadowColor' },
  triangleZone: { noun: '삼각존', strategy: 'color', colorKey: 'triangleZoneColor' },
  eyelinerUpper: { noun: '라이너', strategy: 'style', styleKey: 'eyelinerStyle', styleOptions: EYELINER_STYLES },
  mascara: { noun: '마스카라', strategy: 'style', styleKey: 'mascaraStyle', styleOptions: MASCARA_STYLES_UPPER },
  lowerMascara: { noun: '언더래시', strategy: 'style', styleKey: 'lowerLashStyle', styleOptions: MASCARA_STYLES },
  aegyo: { noun: '애교살', strategy: 'color', colorKey: 'aegyoColor' },
  highlighter: { noun: '하이라이터', strategy: 'color', colorKey: 'highlightColor' },
  brow: { noun: '결', strategy: 'color', colorKey: 'browColor' },
  browPowder: { noun: '채움', strategy: 'color', colorKey: 'browPowderColor' },
  browPencil: { noun: '한올', strategy: 'color', colorKey: 'browPencilColor' },
  lensBase: { noun: '렌즈', strategy: 'color' }, // 색은 lens payload에서
};

function labelForValue(
  opts: { value: number; label: string }[],
  v: number | undefined,
): string {
  if (v === undefined) return '';
  return opts.find(o => o.value === v)?.label ?? '';
}

/** 피부결 리터치 티어 — 프리셋 분해 skin 잎을 흡수하는 강도 구간(lookVariants
 *  'skin-tier' 룩 3종과 이름·경계 정합). 분해 잎은 tierNameForSkin으로 티어 이름만
 *  물려받고 internal로 숨긴다 — 잎 params는 그대로라 프리셋 시각 무손상. */
export const SKIN_TIERS = [
  { name: '내추럴 보정', maxSmoothing: 0.5 },
  { name: '소프트 보정', maxSmoothing: 0.55 },
  { name: '풀 보정', maxSmoothing: Number.POSITIVE_INFINITY },
] as const;

function tierNameForSkin(params: Partial<FilterParams>): string {
  const smoothing = params.skinSmoothing ?? 0;
  for (const tier of SKIN_TIERS) {
    if (smoothing <= tier.maxSmoothing) return tier.name;
  }
  return SKIN_TIERS[SKIN_TIERS.length - 1].name;
}

/**
 * 세부부위(sub) 정의의 표시 이름 — 프리셋 이름 대신 잎 자신의 특성에서 유도한다.
 *  ① 색 부위 → 대표색 계열("브라운 섀도")  ② 라이너·마스카라 → 스타일("돌리 마스카라")
 *  ③ 파운데 → 마감("듀이 파운데")  ④ 그 외 → 노운만("피부결"). 모두 실패하면 노운.
 * 중복(프리셋마다 유사)은 호출부가 번호로 가른다(setSubName dedup).
 * 예외: skin은 buildSystemLibrary가 tierNameForSkin(강도 티어)으로 직접 명명한다.
 */
function systemSubName(
  region: RegionKey,
  params: Partial<FilterParams>,
  lensColor?: string,
): string {
  const spec = SYS_SUB_NAME[region];
  const noun = region === 'eyeshadow' && params.eyeshadowSurface === 1
    ? '언더섀도'
    : spec?.noun ?? REGION_MAP[region].label;
  if (!spec) return noun;
  let modifier = '';
  if (spec.strategy === 'color') {
    const hex = lensColor ?? (spec.colorKey ? (params[spec.colorKey] as string | undefined) : undefined);
    if (typeof hex === 'string') modifier = colorFamilyKo(hex);
  } else if (spec.strategy === 'style' && spec.styleKey && spec.styleOptions) {
    modifier = labelForValue(spec.styleOptions, params[spec.styleKey] as number | undefined);
  } else if (spec.strategy === 'finish' && spec.finishKey) {
    modifier = labelForValue(FOUNDATION_FINISHES, params[spec.finishKey] as number | undefined);
  }
  return modifier ? `${modifier} ${noun}` : noun;
}

/**
 * 내장 프리셋(플랫 params)을 face→region→sub→잎 계층으로 분해해 시스템
 * 라이브러리를 만든다. 시각 결과는 seedLayers→compileLayers 왕복과 동일
 * (기존 프리셋 무손상 — 설계 §06 "대체가 아니라 승격").
 */
export function buildSystemLibrary(): LookLibrary {
  const lib: LookLibrary = {};
  // 부위별 세부부위 이름 중복 카운터 — 같은 카드(RegionKey)에 같은 이름이 겹치면
  // (프리셋마다 유사한 베이스 등) 두 번째부터 번호를 붙인다(프리셋명 대신 — 규칙 5).
  const usedSubNames = new Map<RegionKey, Map<string, number>>();
  for (const preset of PRESETS) {
    if (!SYSTEM_PRESET_IDS.includes(preset.id)) continue;
    const layers = seedLayers(
      preset.params,
      preset.overlayLayers ?? [],
      preset.lensLayers ?? [],
    );
    const bySlot = new Map<SlotKey, ComposerLayer[]>();
    for (const layer of layers) {
      const slot = SLOT_OF_REGION[layer.region];
      const list = bySlot.get(slot) ?? [];
      list.push(layer);
      bySlot.set(slot, list);
    }
    const regionIds: string[] = [];
    for (const slot of SLOT_ORDER) {
      const list = bySlot.get(slot);
      if (!list || list.length === 0) continue;
      const subIds: string[] = [];
      const regionSeen = new Map<RegionKey, number>();
      for (const layer of list) {
        const label = REGION_MAP[layer.region].label;
        // 같은 부위 잎이 프리셋에 2개면(위 섀도 + 하부 승격 잎 등) id가 충돌해
        // 뒤 잎이 앞 잎을 덮어썼다(스모키 위 섀도 유실). 2번째부터 서수 접미.
        const nth = (regionSeen.get(layer.region) ?? 0) + 1;
        regionSeen.set(layer.region, nth);
        const subId = `sys:${preset.id}:${layer.region}${nth === 1 ? '' : `:${nth}`}`;
        // 세부부위 이름 = 잎 특성 유도(프리셋명 미사용) + 부위 내 중복 시 번호.
        // skin은 강도 티어 이름으로 흡수 + internal — 스무딩 0.05 차이뿐인 "피부결 N"
        // 번호 카드 6장이 픽커를 채우던 문제. 표시는 lookVariants 'skin-tier' 3종이
        // 담당하고, 분해 잎은 프리셋 합성용으로만 남는다(시각 무손상).
        const absorbedSkin = layer.region === 'skin';
        const baseName = absorbedSkin
          ? tierNameForSkin(layer.params)
          : systemSubName(layer.region, layer.params, layer.lens?.color);
        const perRegion = usedSubNames.get(layer.region) ?? new Map<string, number>();
        const count = (perRegion.get(baseName) ?? 0) + 1;
        perRegion.set(baseName, count);
        usedSubNames.set(layer.region, perRegion);
        const subName = count === 1 ? baseName : `${baseName} ${count}`;
        // §16 프리셋 사이드채널 마스크(preset.maskRefs) — 위 섀도 잎에만 주입(하부
        // 승격 잎(surface=1)은 제외). 마스크가 실루엣을 소유하므로 임포트 마커를
        // 함께 세워 App reconcile·셰이더 디자인 게이트가 열리게 한다.
        const presetMask = layer.region === 'eyeshadow' &&
          (layer.params.eyeshadowSurface ?? 0) !== 1
            ? preset.maskRefs?.find(m => m.region === 'eyeshadow')
            : undefined;
        lib[subId] = {
          id: subId,
          name: subName,
          level: 'sub',
          slot,
          owner: 'system',
          ...(absorbedSkin ? { internal: true } : {}),
          kids: [
            {
              label,
              region: layer.region,
              params: {
                ...layer.params,
                ...(presetMask ? { eyeshadowMaskImported: 1 } : {}),
              },
              ...(layer.overlay ? { overlay: { ...layer.overlay } } : {}),
              ...(layer.lens ? { lens: { ...layer.lens } } : {}),
              ...(presetMask
                ? { maskRef: { region: 'eyeshadow' as const, uri: presetMask.uri } }
                : {}),
              // 프리셋 분해는 부위당 1겹 — 섀도는 '메인' 역할로 시딩(§5 A13,
              // 핏 '.eyeshadow[main]' 셀렉터가 지목 가능하게).
              ...(layer.region === 'eyeshadow' ? { role: 'main' } : {}),
            },
          ],
        };
        subIds.push(subId);
      }
      const regionId = `sys:${preset.id}:slot:${slot}`;
      // 눈썹만 프리셋 분해본을 부위 룩 카드로 띄우지 않는다(internal) — 눈썹 '전체'
      // 탭의 정본은 레퍼런스 알파 모양 5종(lookVariants 'brow')이고, 프리셋은 그중
      // 하나를 골라 쓰는 소비자라 "내추럴 눈썹"·"글램 눈썹"이 같은 모양 룩을 이름만
      // 바꿔 중복시켰다. 정의는 그대로 남아 전체 룩 합성·기존 스냅샷 복원에 쓰인다.
      const internalRegion = slot === '눈썹';
      lib[regionId] = {
        id: regionId,
        name: `${preset.name} ${slot}`,
        level: 'region',
        slot,
        owner: 'system',
        ...(internalRegion ? { internal: true } : {}),
        kids: subIds,
      };
      regionIds.push(regionId);
    }
    const faceId = `sys:face:${preset.id}`;
    lib[faceId] = {
      id: faceId,
      name: preset.name,
      level: 'face',
      slot: '피부',
      owner: 'system',
      kids: regionIds,
    };
  }
  return lib;
}

export function faceLookIdForPreset(presetId: string): string {
  return `sys:face:${presetId}`;
}

/** 슬롯 교체 패널용 — 같은 슬롯의 region 룩 정의 전부 (시스템+사용자).
 *  internal 정의는 상위 룩의 조각이라 카드로 띄우지 않는다(sub 픽커와 동일 규약). */
export function regionDefsForSlot(lib: LookLibrary, slot: SlotKey): LookDef[] {
  return Object.values(lib)
    .filter(d => d.level === 'region' && d.slot === slot && !d.internal)
    .sort((a, b) => (a.owner === b.owner ? a.name.localeCompare(b.name) : a.owner === 'system' ? -1 : 1));
}

/**
 * region/face 룩 정의가 건드리는 세부부위(RegionKey) 전부 — 정의 트리를 잎까지
 * 내려가 leaf.region을 수집한다(인스턴스화 없이 정의만). 기본 모드 중분류 필터용.
 */
export function regionKeysOfDef(lib: LookLibrary, defId: string): Set<RegionKey> {
  const out = new Set<RegionKey>();
  const walk = (id: string) => {
    const def = lib[id];
    if (!def) return;
    if (def.level === 'sub') {
      for (const leaf of def.kids as LeafDef[]) out.add(leaf.region);
    } else {
      for (const childId of def.kids as string[]) walk(childId);
    }
  };
  walk(defId);
  return out;
}

// ── 인스턴스화 / 분해 ────────────────────────────────────────────────────────

function leafFromDef(def: LeafDef): ProductLeaf {
  const migrated = migrateLegacyEyeshadowLayer(def.region as RegionKey | 'eyeshadowLower', def.params);
  return {
    kind: 'app',
    id: nid('lf'),
    label: def.label,
    region: migrated.region,
    visible: true,
    dirty: false,
    params: migrated.params,
    ...(def.overlay ? { overlay: { ...def.overlay } } : {}),
    ...(def.lens ? { lens: { ...def.lens } } : {}),
    ...(def.role ? { role: def.role } : {}),
    ...(def.productId ? { productId: def.productId } : {}),
    ...(def.colorwayId ? { colorwayId: def.colorwayId } : {}),
    ...(def.technique ? { technique: { ...def.technique } } : {}),
    ...(def.maskRef ? { maskRef: { ...def.maskRef } } : {}),
    ...(def.linerStyleRef ? { linerStyleRef: def.linerStyleRef } : {}),
  };
}

/** 라이브러리 정의 → 작업본 트리(깊은 사본). copy-on-write의 토대. */
export function instantiate(lib: LookLibrary, defId: string): LookNode | null {
  const def = lib[defId];
  if (!def) return null;
  const kids: TreeChild[] = [];
  if (def.level === 'sub') {
    for (const leaf of def.kids as LeafDef[]) kids.push(leafFromDef(leaf));
  } else {
    for (const childId of def.kids as string[]) {
      const child = instantiate(lib, childId);
      if (child) kids.push(child);
    }
  }
  return {
    kind: 'look',
    id: nid('lk'),
    ref: def.id,
    name: def.name,
    level: def.level,
    slot: def.slot,
    owner: def.owner,
    visible: true,
    dirty: false,
    kids,
  };
}

/** 라이브러리의 그룹 번들 정의 전부 (재사용 픽커용). */
export function groupBundleDefs(lib: LookLibrary): LookDef[] {
  return Object.values(lib)
    .filter(d => d.kind === 'group')
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 그룹 번들(kind==='group') → 멤버 region 노드들 + 이들을 묶는 새 그룹.
 * 각 멤버 region 정의를 instantiate로 깊은 사본화(id 새로 발급)하고, 새 그룹은
 * 그 노드들을 memberIds로 잡고 ref=번들 def id로 링크한다(copy-on-write 토대).
 */
export function instantiateGroup(
  lib: LookLibrary,
  defId: string,
): { nodes: LookNode[]; group: LookGroup } | null {
  const def = lib[defId];
  if (!def || def.kind !== 'group') return null;
  const nodes: LookNode[] = [];
  for (const rid of def.kids as string[]) {
    const n = instantiate(lib, rid);
    if (n) nodes.push(n);
  }
  if (nodes.length === 0) return null;
  const group: LookGroup = {
    id: gid(),
    name: def.name.replace(/^★\s*/, ''),
    memberIds: nodes.map(n => n.id),
    visible: true,
    ref: defId,
  };
  return { nodes, group };
}

/** 저장된 그룹 번들을 현재 트리에 추가 — 멤버 region 노드 전체 + 새 그룹. 루트 dirty. */
export function addGroupBundle(
  root: LookNode,
  lib: LookLibrary,
  defId: string,
): LookNode {
  const inst = instantiateGroup(lib, defId);
  if (!inst) return root;
  return {
    ...root,
    kids: [...root.kids, ...inst.nodes],
    groups: [...(root.groups ?? []), inst.group],
    dirty: true,
  };
}

/** 빈 커스텀 조합(직접 만들기 시작점) */
export function emptyFaceLook(name = '새 조합'): LookNode {
  return {
    kind: 'look',
    id: nid('lk'),
    ref: null,
    name,
    level: 'face',
    slot: '피부',
    owner: 'user',
    visible: true,
    dirty: false,
    kids: [],
  };
}

/**
 * 컴파일된 현재 룩(플랫 params + 오버레이)을 익명 트리로 분해 — v1 저장물
 * 마이그레이션·'직접' 편집 시드 경로. 부위별 커스텀 region 룩으로 감싼다.
 */
/** 마스크 슬롯 → 그 슬롯의 임포트 마커 키. URI(잎)와 마커(params)는 반드시 같은
 *  잎에 함께 있어야 한다 — 마커 보유 잎만 삭제되면 남은 잎이 URI를 들고 있어도
 *  compileLayers가 마커를 못 찾아 마스크가 조용히 해제되기 때문이다. */
/** 저장에 안전한 에셋 URI — 앱 번들(StreamingAssets) 참조만 재설치·컨테이너 UUID
 *  변경·tmp 정리를 견딘다. 사용자 임포트 file:// 경로는 저장 대상이 아니다. */
const isDurableAssetUri = (uri: string): boolean => uri.startsWith('streaming:');

const MASK_MARKER_KEY: Record<MaskRegion, keyof FilterParams> = {
  blush: 'blushMaskImported',
  highlighter: 'highlightMaskImported',
  contour: 'contourMaskImported',
  eyeshadow: 'eyeshadowMaskImported',
  eyeshadowLower: 'eyeshadowLowerMaskImported',
};

/** §16 분해 경로 마스크 부착 — 잎의 부위·표면으로 슬롯을 정한다(위 섀도는
 *  'eyeshadow', 하부 승격 잎(surface=1)은 'eyeshadowLower'). buildSystemLibrary의
 *  프리셋 사이드채널과 같은 계약: 마스크 URI는 잎에, 임포트 마커는 params에.
 *  마커를 들고 있는 잎에만 붙여 URI·마커가 항상 함께 살고 함께 사라지게 한다. */
function decomposedMaskRef(
  layer: ComposerLayer,
  maskRefs: readonly {region: string; uri: string}[],
): LookMaskRef | undefined {
  if (maskRefs.length === 0) return undefined;
  const region =
    layer.region === 'eyeshadow'
      ? (layer.params.eyeshadowSurface ?? 0) === 1
        ? 'eyeshadowLower'
        : 'eyeshadow'
      : layer.region;
  if (!(region in MASK_MARKER_KEY)) return undefined; // 알 수 없는 슬롯명은 무시
  const slot = region as MaskRegion;
  if (((layer.params[MASK_MARKER_KEY[slot]] as number | undefined) ?? 0) <= 0) {
    return undefined;
  }
  const found = maskRefs.find(m => m.region === slot);
  return found ? { region: slot, uri: found.uri } : undefined;
}

export function decomposeToTree(
  params: FilterParams,
  overlayLayers: OverlayLayer[],
  name: string,
  lensLayers: LensLayer[] = [],
  eyeshadowLayers: EyeshadowLayer[] = [],
  maskRefs: readonly {region: string; uri: string}[] = [],
): LookNode {
  const root = emptyFaceLook(name);
  const layers = seedLayers(params, overlayLayers, lensLayers, eyeshadowLayers);
  const bySlot = new Map<SlotKey, ComposerLayer[]>();
  for (const layer of layers) {
    const slot = SLOT_OF_REGION[layer.region];
    const list = bySlot.get(slot) ?? [];
    list.push(layer);
    bySlot.set(slot, list);
  }
  for (const slot of SLOT_ORDER) {
    const list = bySlot.get(slot);
    if (!list || list.length === 0) continue;
    const subs: LookNode[] = list.map(layer => ({
      kind: 'look' as const,
      id: nid('lk'),
      ref: null,
      name: REGION_MAP[layer.region].label,
      level: 'sub' as const,
      slot,
      owner: 'user' as const,
      visible: true,
      dirty: false,
      kids: [
        {
          kind: 'app' as const,
          id: nid('lf'),
          label: REGION_MAP[layer.region].productName ?? REGION_MAP[layer.region].label,
          region: layer.region,
          visible: true,
          dirty: false,
          params: { ...layer.params },
          ...(layer.overlay ? { overlay: { ...layer.overlay } } : {}),
          ...(layer.lens ? { lens: { ...layer.lens } } : {}),
          ...(() => {
            const maskRef = decomposedMaskRef(layer, maskRefs);
            return maskRef ? { maskRef } : {};
          })(),
          // 분해 경로도 부위당 1겹 — 섀도는 '메인' 역할(§5 A13, buildSystemLibrary와 동일)
          ...(layer.region === 'eyeshadow' ? { role: 'main' } : {}),
        },
      ],
    }));
    root.kids.push({
      kind: 'look',
      id: nid('lk'),
      ref: null,
      name: `${slot} 커스텀`,
      level: 'region',
      slot,
      owner: 'user',
      visible: true,
      dirty: false,
      kids: subs,
    });
  }
  return root;
}

/** 세부부위 룩(sub) 노드 한 장 — 이름=세부부위, 잎=제형명. ＋부위가 기존 슬롯
 *  그룹 안에 끼울 때와 newRegionNode 내부가 공유한다. */
export function newSubNode(region: RegionKey, current: FilterParams): LookNode {
  const layer = newLayer(region, current);
  const slot = SLOT_OF_REGION[region];
  const label = REGION_MAP[region].label;
  // 잎은 제형명으로 — region/sub 라벨 반복("피부보정→피부보정→피부보정") 해소.
  const leafLabel = REGION_MAP[region].productName ?? label;
  return {
    kind: 'look',
    id: nid('lk'),
    ref: null,
    // 이름 안 정해진 룩은 '커스텀' — 부위는 행 앞의 세부부위 칩이 말해준다
    // (표시 규약: [칩 아이섀도 상] 커스텀).
    name: '커스텀',
    level: 'sub',
    slot,
    owner: 'user',
    visible: true,
    dirty: false,
    kids: [
      {
        kind: 'app',
        id: nid('lf'),
        label: leafLabel,
        region,
        visible: true,
        dirty: false,
        params: { ...layer.params },
        ...(layer.overlay ? { overlay: layer.overlay } : {}),
        ...(layer.lens ? { lens: layer.lens } : {}),
      },
    ],
  };
}

/** 부위 픽커에서 새 부위 룩 추가 (region 커스텀 → sub → 잎 1장).
 *  그룹 이름=슬롯("눈 커스텀") — 세부부위 이름을 슬롯 그룹에 붙이면 층위가 헷갈린다
 *  (사용자 지적: "아이라인 상"이 눈 그룹 이름으로 뜸). 세부부위 이름은 sub가 가진다. */
export function newRegionNode(region: RegionKey, current: FilterParams): LookNode {
  const slot = SLOT_OF_REGION[region];
  return {
    kind: 'look',
    id: nid('lk'),
    ref: null,
    name: `${SLOT_LABEL[slot]} 커스텀`,
    level: 'region',
    slot,
    owner: 'user',
    visible: true,
    dirty: false,
    kids: [newSubNode(region, current)],
  };
}

/** 슬롯의 첫 region 노드 (없으면 null) — ＋부위가 "같은 슬롯 그룹이 있으면 그 안에
 *  세부부위 룩을 추가"할 때 대상 탐색. */
export function regionNodeOfSlot(root: LookNode | null, slot: SlotKey): LookNode | null {
  if (!root) return null;
  return (
    root.kids.find((c): c is LookNode => !isLeaf(c) && c.slot === slot) ?? null
  );
}

/** region 노드에 세부부위 룩(sub) 추가 — copy-on-write dirty(그룹·루트). */
export function addSubNode(
  root: LookNode,
  regionNodeId: string,
  sub: LookNode,
): LookNode {
  const kids = root.kids.map(c => {
    if (isLeaf(c) || c.id !== regionNodeId) return c;
    return { ...c, kids: [...c.kids, sub], dirty: true };
  });
  return { ...root, kids, dirty: true };
}

/** 세부부위 룩 교체 — region 노드 안의 sub 한 장을 라이브러리 인스턴스로 스왑
 *  ("아이라인룩만 갈아끼우기"). 슬롯 룩 교체(swapRegionNode)의 sub 판. */
export function swapSubNode(
  root: LookNode,
  subId: string,
  fresh: LookNode,
): LookNode {
  const kids = root.kids.map(c => {
    if (isLeaf(c)) return c;
    if (!c.kids.some(k => !isLeaf(k) && k.id === subId)) return c;
    return {
      ...c,
      kids: c.kids.map(k => (!isLeaf(k) && k.id === subId ? fresh : k)),
      dirty: true,
    };
  });
  return { ...root, kids, dirty: true };
}

/** 이 세부부위(잎 region)로 구성된 standalone 라이브러리 sub 룩 정의 전부 —
 *  세부부위 ⇄ 교체 픽커용(시스템 먼저, 이름순). internal(상위 룩의 내부 파트)은
 *  제외한다 — 같은 "파운데이션" 라벨로 여러 상위 룩의 조각이 섞여 뜨던 계약 버그. */
export function subDefsForRegion(lib: LookLibrary, region: RegionKey): LookDef[] {
  return Object.values(lib)
    .filter(
      d =>
        d.level === 'sub' &&
        !d.internal &&
        (d.kids as LeafDef[]).some(leaf => leaf.region === region),
    )
    .sort((a, b) =>
      a.owner === b.owner
        ? a.name.localeCompare(b.name)
        : a.owner === 'system'
          ? -1
          : 1,
    );
}

// ── 평탄화 — 트리 → 기존 컴파일 파이프라인 재료 ─────────────────────────────

/** DFS로 보이는 잎을 그리는 순서대로 ComposerLayer로 눌러 편다.
 *  잎마다 역할 태그와 핏 시트 사슬(가까운 조상 fitRef 먼저 — §5 A13 캐스케이드
 *  '하위룩>룩>메인'의 재료)을 주석한다. 소비는 applyFitToLayers(fitSheets.ts). */
export function flattenTree(root: LookNode | null): ComposerLayer[] {
  const out: ComposerLayer[] = [];
  if (!root || !root.visible) return out;
  const walk = (node: LookNode, ancestors: string[]) => {
    if (!node.visible) return;
    const chain = node.fitRef ? [node.fitRef, ...ancestors] : ancestors;
    for (const child of node.kids) {
      if (isLeaf(child)) {
        if (!child.visible) continue;
        out.push({
          id: child.id,
          region: child.region,
          visible: true,
          params: child.params,
          ...(child.overlay ? { overlay: child.overlay } : {}),
          ...(child.lens ? { lens: child.lens } : {}),
          ...(child.role ? { role: child.role } : {}),
          ...(chain.length > 0 ? { fitChain: chain } : {}),
          ...(child.productId ? { productId: child.productId } : {}),
          ...(child.colorwayId ? { colorwayId: child.colorwayId } : {}),
          ...(child.technique ? { technique: child.technique } : {}),
          ...(child.maskRef ? { maskRef: child.maskRef } : {}),
          ...(child.linerStyleRef ? { linerStyleRef: child.linerStyleRef } : {}),
        });
      } else {
        walk(child, chain);
      }
    }
  };
  walk(root, []);
  return out;
}

// ── 불변 트리 변형 (dirty 전파 포함) ────────────────────────────────────────

type ChildPatch = (child: TreeChild) => TreeChild | null; // null = 제거

/**
 * targetId를 포함하는 경로를 따라 새 노드를 만들어 돌려준다.
 * markPath=true면 경로의 look 노드 전부 dirty(수정 전파 — 목업 * 규칙).
 */
function rebuild(
  node: LookNode,
  targetId: string,
  patch: ChildPatch,
  markPath: boolean,
): { node: LookNode; found: boolean } {
  let found = false;
  const kids: TreeChild[] = [];
  for (const child of node.kids) {
    if (child.id === targetId) {
      found = true;
      const next = patch(child);
      if (next) kids.push(next);
      continue;
    }
    if (!isLeaf(child)) {
      const r = rebuild(child, targetId, patch, markPath);
      if (r.found) {
        found = true;
        kids.push(r.node);
        continue;
      }
    }
    kids.push(child);
  }
  if (!found) return { node, found: false };
  return {
    node: { ...node, kids, dirty: markPath ? true : node.dirty },
    found: true,
  };
}

/** 잎의 params/overlay/label/role/제품 참조 수정 — 잎과 조상 전부 dirty. */
export function updateLeaf(
  root: LookNode,
  leafId: string,
  patch: {
    params?: Partial<FilterParams>;
    overlay?: OverlayLayer;
    lens?: Partial<LensLayer>;
    label?: string;
    /** 역할 태그(§5 A13) — null=태그 해제 */
    role?: string | null;
    /** 제품 참조(§5 A12) — null=커스텀 전환 */
    productId?: string | null;
    colorwayId?: string | null;
    technique?: { strength: number };
    /** 카탈로그 마스크 참조(§16) — null=해제. 사용자 카탈로그 선택을 잎에 영속화해
     *  저장·재시작 후에도 마커(…MaskImported)와 URI가 함께 살아남게 한다. */
    maskRef?: LookMaskRef | null;
    /** 아이라이너 콜르아트 참조(§16) — null=해제. 마스크와 같은 이유로 잎에
     *  영속화한다(URI가 없으면 강도만 남아 기본 윙 도안이 대신 그려진다). */
    linerStyleRef?: string | null;
  },
): LookNode {
  if (root.id === leafId) return root; // 루트는 잎이 아님
  const r = rebuild(
    root,
    leafId,
    child => {
      if (!isLeaf(child)) return child;
      return {
        ...child,
        dirty: true,
        label: patch.label ?? child.label,
        params: patch.params ? { ...child.params, ...patch.params } : child.params,
        overlay: patch.overlay ?? child.overlay,
        // 렌즈 세부(#25) payload 부분 패치 — child.lens가 있을 때만 병합.
        lens:
          patch.lens && child.lens
            ? { ...child.lens, ...patch.lens }
            : child.lens,
        // 역할·제품 참조(§5) — null=해제(필드 제거 대신 undefined로 통일)
        ...(patch.role !== undefined ? { role: patch.role ?? undefined } : {}),
        ...(patch.productId !== undefined
          ? { productId: patch.productId ?? undefined }
          : {}),
        ...(patch.colorwayId !== undefined
          ? { colorwayId: patch.colorwayId ?? undefined }
          : {}),
        ...(patch.technique !== undefined ? { technique: patch.technique } : {}),
        ...(patch.maskRef !== undefined
          ? { maskRef: patch.maskRef ?? undefined }
          : {}),
        ...(patch.linerStyleRef !== undefined
          ? { linerStyleRef: patch.linerStyleRef ?? undefined }
          : {}),
      };
    },
    true,
  );
  return r.found ? { ...r.node, dirty: true } : root;
}

/**
 * 눈썹 슬롯 공통 축(모양·두께·아치) 편집 — 트리의 모든 눈썹 잎에 동일 브로드캐스트.
 * 6개 눈썹 부위가 이 필드를 공유 소유(regionOwnKeys)하므로 seedLayers가 각 잎에
 * 복제하고, updateLeaf로 한 잎만 패치하면 compileLayers(Object.assign, last-writer-
 * wins)에서 뒤 눈썹 잎의 옛 값이 편집을 덮는다(회귀). 전 눈썹 잎에 같은 값을 기입해
 * 병합 순서와 무관하게 편집이 반영되도록 한다(카탈로그 '슬롯 공통' 계약). 불변 반환.
 */
export function updateBrowSharedAxis(
  root: LookNode,
  patch: Partial<FilterParams>,
): LookNode {
  const ids: string[] = [];
  const walk = (node: LookNode) => {
    for (const child of node.kids) {
      if (isLeaf(child)) {
        if (SLOT_OF_REGION[child.region] === '눈썹') ids.push(child.id);
      } else {
        walk(child);
      }
    }
  };
  walk(root);
  let next = root;
  for (const id of ids) next = updateLeaf(next, id, { params: patch });
  return next;
}

/** 켬/끔 토글 — dirty는 켜지 않는다(구성 수정이 아니라 표시 상태).
 *  스냅샷이 visible을 보존하고 revive가 복원한다(copyVisibility). */
export function setNodeVisible(root: LookNode, nodeId: string, visible: boolean): LookNode {
  if (root.id === nodeId) return { ...root, visible };
  const r = rebuild(root, nodeId, child => ({ ...child, visible } as TreeChild), false);
  return r.found ? r.node : root;
}

/** 룩 노드에 핏 시트 지정(§5 A13 캐스케이드) — null=해제. dirty는 켜지 않는다
 *  (핏은 내 얼굴 상태지 룩 구성이 아님 — visible과 같은 부류, 스냅샷이 보존). */
export function setNodeFitRef(
  root: LookNode,
  nodeId: string,
  fitRef: string | null,
): LookNode {
  const apply = (n: LookNode): LookNode => ({
    ...n,
    fitRef: fitRef ?? undefined,
  });
  if (root.id === nodeId) return apply(root);
  const r = rebuild(
    root,
    nodeId,
    child => (isLeaf(child) ? child : apply(child)) as TreeChild,
    false,
  );
  return r.found ? r.node : root;
}

/** 같은 슬롯 자리의 region 룩 교체 — 루트만 dirty(구성 변경), 새 자식은 깨끗.
 *  교체된 region이 그룹 멤버였으면 group.memberIds를 옛 id→새 id로 재매핑한다
 *  (region은 사라지는 게 아니라 교체 — prune이 아니라 remap이 맞다). */
export function swapRegionNode(root: LookNode, regionNodeId: string, fresh: LookNode): LookNode {
  const r = rebuild(root, regionNodeId, () => fresh, false);
  if (!r.found) return root;
  const node: LookNode = { ...r.node, dirty: true };
  if (node.groups?.some(g => g.memberIds.includes(regionNodeId))) {
    node.groups = node.groups.map(g => ({
      ...g,
      memberIds: g.memberIds.map(id => (id === regionNodeId ? fresh.id : id)),
    }));
  }
  return node;
}

/** root 직속 region 노드 중 그 부위(RegionKey) 잎을 포함한 첫 노드 (없으면 null).
 *  멀티유즈 대상 충돌 탐지 — 같은 브리지 필드 region을 append하면 컴파일
 *  last-writer-wins로 기존 설정이 소실되므로, 있으면 교체(swap)한다. */
export function regionNodeWith(root: LookNode | null, region: RegionKey): LookNode | null {
  if (!root) return null;
  const has = (node: LookNode): boolean =>
    node.kids.some(k => (isLeaf(k) ? k.region === region : has(k)));
  return root.kids.find((c): c is LookNode => !isLeaf(c) && has(c)) ?? null;
}

/** 부위 룩 추가(픽커) — 루트 dirty. */
export function addRegionNode(root: LookNode, node: LookNode): LookNode {
  return { ...root, kids: [...root.kids, node], dirty: true };
}

// ── 사용자 그룹 CRUD (#23 Phase 3) — 전부 루트 대상, 불변 반환 ────────────────
// 그룹은 표시·조작 메타일 뿐 렌더에 영향 없다(flatten 투명). dirty=구성 변경으로 전파.

/** 루트 직속 region 노드 id 집합 (그룹 멤버 유효성 검사용) */
function liveRegionIds(root: LookNode): Set<string> {
  return new Set(root.kids.filter((c): c is LookNode => !isLeaf(c)).map(c => c.id));
}

/** 없어진 멤버 id 정리 + 빈 그룹 제거 — region 삭제/교체 후 dangling 방지. */
function pruneGroups(root: LookNode): LookNode {
  if (!root.groups || root.groups.length === 0) return root;
  const live = liveRegionIds(root);
  const groups = root.groups
    .map(g => ({ ...g, memberIds: g.memberIds.filter(id => live.has(id)) }))
    .filter(g => g.memberIds.length > 0);
  if (groups.length === (root.groups?.length ?? 0) &&
      groups.every((g, i) => g.memberIds.length === root.groups![i].memberIds.length)) {
    return root; // 변화 없음
  }
  return { ...root, groups };
}

/** 선택한 region 노드들을 한 그룹으로 — 슬롯 무관. 멤버 2개 미만이면 무변경.
 *  이미 다른 그룹에 속한 region은 배제한다(한 region 다중 소속 금지 — 두 박스
 *  중복 렌더·setGroupVisible 충돌 방지). */
export function createGroup(root: LookNode, name: string, memberIds: string[]): LookNode {
  const live = liveRegionIds(root);
  const ids = [...new Set(memberIds)].filter(
    id => live.has(id) && !groupOfRegion(root, id),
  );
  if (ids.length < 2) return root;
  const group: LookGroup = { id: gid(), name: name.trim() || '내 세트', memberIds: ids, visible: true };
  return { ...root, groups: [...(root.groups ?? []), group], dirty: true };
}

/** 그룹 해제 — 메타만 제거, 멤버 region은 트리에 그대로 남는다. */
export function removeGroup(root: LookNode, groupId: string): LookNode {
  if (!root.groups?.some(g => g.id === groupId)) return root;
  return { ...root, groups: root.groups.filter(g => g.id !== groupId), dirty: true };
}

/** 그룹 이름 변경. */
export function renameGroup(root: LookNode, groupId: string, name: string): LookNode {
  if (!root.groups?.some(g => g.id === groupId)) return root;
  return {
    ...root,
    groups: root.groups.map(g => (g.id === groupId ? { ...g, name: name.trim() || g.name } : g)),
    dirty: true,
  };
}

/** 그룹 통째 켬/끔 — 멤버 region 전부 visible 세팅(렌더는 region.visible만 봄).
 *  visible은 dirty가 아니다(표시 상태) — 그룹 메타에도 반영해 UI가 일관되게. */
export function setGroupVisible(root: LookNode, groupId: string, visible: boolean): LookNode {
  const group = root.groups?.find(g => g.id === groupId);
  if (!group) return root;
  let next = root;
  for (const id of group.memberIds) next = setNodeVisible(next, id, visible);
  return {
    ...next,
    groups: (next.groups ?? []).map(g => (g.id === groupId ? { ...g, visible } : g)),
  };
}

/** 그룹에 멤버(region) 추가 — 이미 어느 그룹에든 속했으면 무변경(다중 소속 금지). */
export function addToGroup(root: LookNode, groupId: string, memberId: string): LookNode {
  const group = root.groups?.find(g => g.id === groupId);
  if (!group || !liveRegionIds(root).has(memberId) || groupOfRegion(root, memberId)) return root;
  return {
    ...root,
    groups: root.groups!.map(g =>
      g.id === groupId ? { ...g, memberIds: [...g.memberIds, memberId] } : g,
    ),
    dirty: true,
  };
}

/** 그룹에서 멤버 제외 — 마지막 멤버가 빠지면 그룹 자체가 사라진다. */
export function removeFromGroup(root: LookNode, groupId: string, memberId: string): LookNode {
  const group = root.groups?.find(g => g.id === groupId);
  if (!group) return root;
  const memberIds = group.memberIds.filter(id => id !== memberId);
  const groups = memberIds.length === 0
    ? root.groups!.filter(g => g.id !== groupId)
    : root.groups!.map(g => (g.id === groupId ? { ...g, memberIds } : g));
  return { ...root, groups, dirty: true };
}

/** region 노드가 속한 그룹 (없으면 null) — UI 렌더 분류용. */
export function groupOfRegion(root: LookNode, regionId: string): LookGroup | null {
  return root.groups?.find(g => g.memberIds.includes(regionId)) ?? null;
}

/** 슬롯의 모든 region 노드 — 상세 모드 addRegion은 슬롯당 dedup 없이 append하므로
 *  한 슬롯에 여럿일 수 있다(특히 눈). 기본 모드는 이 전부를 대상으로 정규화한다. */
export function slotRegionNodes(root: LookNode | null, slot: SlotKey): LookNode[] {
  if (!root) return [];
  return root.kids.filter(
    (c): c is LookNode => !isLeaf(c) && c.slot === slot,
  );
}

/** 슬롯의 현재 region 노드(첫 번째) — 단순 존재 조회용. */
export function slotRegionNode(root: LookNode | null, slot: SlotKey): LookNode | null {
  return slotRegionNodes(root, slot)[0] ?? null;
}

/**
 * 기본 모드 — 슬롯 자리에 라이브러리 부위 룩을 앉힌다(슬롯당 하나로 정규화).
 * 상세 모드가 한 슬롯에 region 노드를 여럿 쌓아둘 수 있으므로, 첫 노드만이 아니라
 * 그 슬롯의 **모든** region 노드를 대상으로 동작한다(고아 잔존 방지).
 *  - defId 지정: 그 슬롯 기존 region 전부 제거 후 새 것 하나 추가(단일 선택).
 *  - defId=null(없음): 그 슬롯 region 전부 제거(비우기).
 * 불변 반환 — 트리가 null이면 emptyFaceLook에서 시작한다(첫 선택이 트리를 만든다).
 */
export function setSlotRegion(
  root: LookNode | null,
  lib: LookLibrary,
  slot: SlotKey,
  defId: string | null,
): LookNode | null {
  const existing = slotRegionNodes(root, slot);
  if (defId === null) {
    if (!root || existing.length === 0) return root; // 이미 비어 있음 — 무변화
    let next: LookNode = root;
    for (const node of existing) next = removeNode(next, node.id);
    return next;
  }
  const fresh = instantiate(lib, defId);
  if (!fresh) return root;
  let base: LookNode = root ?? emptyFaceLook();
  for (const node of existing) base = removeNode(base, node.id);
  return addRegionNode(base, fresh);
}

/** 노드 하위 전체 잎의 세부부위(RegionKey) 집합 — 세부부위 단위 스왑의 충돌 판별용. */
function leafRegionsOf(node: LookNode): Set<RegionKey> {
  const out = new Set<RegionKey>();
  const walk = (n: LookNode) => {
    for (const c of n.kids) {
      if (isLeaf(c)) out.add(c.region);
      else walk(c);
    }
  };
  walk(node);
  return out;
}

/** 슬롯 안에서 이 세부부위(RegionKey) 잎을 소유한 sub 노드 (첫 번째, 없으면 null).
 *  기본 모드 세부부위 탭의 활성 표시·존재 조회용 — 슬롯 전체가 아닌 세부부위 단위. */
export function subRegionNode(
  root: LookNode | null,
  slot: SlotKey,
  region: RegionKey,
): LookNode | null {
  for (const rn of slotRegionNodes(root, slot)) {
    const sub = rn.kids.find(
      (c): c is LookNode =>
        !isLeaf(c) && c.kids.some(k => isLeaf(k) && k.region === region),
    );
    if (sub) return sub;
  }
  return null;
}

/**
 * 기본 모드 — 슬롯 안의 한 세부부위(RegionKey)만 교체/제거한다. setSlotRegion이
 * 슬롯 전체를 갈아끼우는 것과 달리, 같은 슬롯의 다른 세부부위(파운데·컨실러 등)는
 * 보존한다("언더톤만 바꿔도 파운데는 그대로" — 부위룩/세부부위룩 구분의 핵심).
 *  - subDefId 지정: 그 세부부위(및 새 sub가 건드리는 세부부위)를 소유하던 기존 sub
 *    전부 제거 후, 슬롯의 첫 region 노드에 새 sub 하나를 얹는다(빈 슬롯이면 region
 *    노드를 새로 만들어 담는다). last-writer-wins 필드 충돌을 막으려 겹치는 세부부위를
 *    함께 걷어낸다.
 *  - subDefId=null(없음): 그 세부부위 sub만 제거(비어진 region 노드는 정리).
 * 불변 반환 — 트리가 null이면 emptyFaceLook에서 시작(첫 선택이 트리를 만든다).
 */
export function setSubRegion(
  root: LookNode | null,
  lib: LookLibrary,
  slot: SlotKey,
  region: RegionKey,
  subDefId: string | null,
): LookNode | null {
  // 슬롯의 region 노드들에서 `regions` 세부부위를 소유한 sub를 걷어낸다(빈 region은 제거).
  const stripSubs = (base: LookNode, regions: Set<RegionKey>): LookNode => {
    let changed = false;
    const kids: TreeChild[] = [];
    for (const c of base.kids) {
      if (isLeaf(c) || c.slot !== slot) {
        kids.push(c);
        continue;
      }
      const keptSubs: TreeChild[] = [];
      for (const sub of c.kids) {
        if (isLeaf(sub)) {
          keptSubs.push(sub);
          continue;
        }
        const keptLeaves = sub.kids.filter(k => {
          if (!isLeaf(k) || !regions.has(k.region)) return true;
          changed = true;
          return false;
        });
        if (keptLeaves.length === sub.kids.length) {
          keptSubs.push(sub);
        } else if (keptLeaves.length > 0) {
          keptSubs.push({ ...sub, kids: keptLeaves, dirty: true });
        }
      }
      const regionChanged =
        keptSubs.length !== c.kids.length ||
        keptSubs.some((sub, i) => sub !== c.kids[i]);
      if (!regionChanged) {
        kids.push(c); // 이 region 노드엔 해당 세부부위 없음 — 그대로
      } else if (keptSubs.length === 0) {
        changed = true; // 마지막 sub까지 빠짐 — 빈 region 껍데기 제거
      } else {
        kids.push({ ...c, kids: keptSubs, dirty: true });
      }
    }
    return changed ? pruneGroups({ ...base, kids, dirty: true }) : base;
  };

  if (subDefId === null) {
    if (!root) return root;
    return stripSubs(root, new Set([region]));
  }

  const fresh = instantiate(lib, subDefId);
  if (!fresh || fresh.level !== 'sub') return root;
  const freshRegions = leafRegionsOf(fresh);
  freshRegions.add(region);
  const base = stripSubs(root ?? emptyFaceLook(), freshRegions);
  // host = 슬롯의 첫 region 노드에 얹는다(다른 세부부위 보존). 없으면 새 region 노드.
  const host = base.kids.find(
    (c): c is LookNode => !isLeaf(c) && c.slot === slot,
  );
  if (host) {
    return {
      ...base,
      kids: base.kids.map(c =>
        c === host ? { ...host, kids: [...host.kids, fresh], dirty: true } : c,
      ),
      dirty: true,
    };
  }
  const regionNode: LookNode = {
    kind: 'look',
    id: nid('lk'),
    ref: null,
    name: `${SLOT_LABEL[slot]} 커스텀`,
    level: 'region',
    slot,
    owner: 'user',
    visible: true,
    dirty: false,
    kids: [fresh],
  };
  return addRegionNode(base, regionNode);
}

/**
 * region 정의(라이브러리)의 대표 색 — 첫 잎 params/overlay의 첫 '#…' 색.
 * 기본 모드 스타일 칩 썸네일 스와치용(인스턴스화 없이 정의만 훑는다).
 */
export function defSwatchColor(lib: LookLibrary, defId: string): string | null {
  const def = lib[defId];
  if (!def) return null;
  if (def.level === 'sub') {
    // 블러셔는 글리터색(blushParticleColor) 등 보조색보다 실제 안료색을 우선한다.
    for (const leaf of def.kids as LeafDef[]) {
      if (
        leaf.region === 'blush' &&
        typeof leaf.params.blushColor === 'string' &&
        leaf.params.blushColor.startsWith('#')
      ) {
        return leaf.params.blushColor;
      }
    }
    for (const leaf of def.kids as LeafDef[]) {
      for (const v of Object.values(leaf.params)) {
        if (typeof v === 'string' && v.startsWith('#')) return v;
      }
      if (leaf.overlay?.color) return leaf.overlay.color;
    }
    return null;
  }
  for (const childId of def.kids as string[]) {
    const c = defSwatchColor(lib, childId);
    if (c) return c;
  }
  return null;
}

/**
 * DFS로 첫 '보이는' 잎 — flattenTree와 동일한 가시성 규칙(visible=false 노드/잎 스킵).
 * 기본 모드 농도 슬라이더가 방출되지 않는 숨은 잎을 타겟하던 죽은 슬라이더 방지.
 */
export function firstVisibleLeaf(node: TreeChild): ProductLeaf | null {
  if (isLeaf(node)) return node.visible ? node : null;
  if (!node.visible) return null;
  for (const kid of node.kids) {
    const found = firstVisibleLeaf(kid);
    if (found) return found;
  }
  return null;
}

/** 노드 제거 — 조상 dirty. region 삭제 시 그룹 멤버에서도 정리(dangling 방지). */
export function removeNode(root: LookNode, nodeId: string): LookNode {
  const r = rebuild(root, nodeId, () => null, true);
  return r.found ? pruneGroups({ ...r.node, dirty: true }) : root;
}

/** 같은 제품 한 겹 더(＋겹) — sub 룩의 마지막 잎을 절반 농도로 복제. */
export function stackLeaf(root: LookNode, subNodeId: string): LookNode {
  const r = rebuild(
    root,
    subNodeId,
    child => {
      if (isLeaf(child) || child.level !== 'sub') return child;
      const leaves = child.kids.filter(isLeaf);
      const last = leaves[leaves.length - 1];
      if (!last) return child;
      const dupParams: Partial<FilterParams> = { ...last.params };
      // 강도류 필드를 절반으로 — 겹이 누적돼도 과하지 않게 시작
      for (const [k, v] of Object.entries(dupParams)) {
        if (typeof v === 'number' && k.toLowerCase().includes('intensity')) {
          (dupParams as any)[k] = Math.max(0.1, Math.round(v * 50) / 100);
        }
      }
      // 렌즈 세부(#25) 겹: payload intensity를 절반으로(누적 과함 방지) 복제.
      const dupLens: LensLayer | undefined = last.lens
        ? { ...last.lens, intensity: Math.max(0.1, Math.round(last.lens.intensity * 50) / 100) }
        : undefined;
      const dup: ProductLeaf = {
        ...last,
        id: nid('lf'),
        label: `${last.label.replace(/ \d+겹$/, '')} ${leaves.length + 1}겹`,
        params: dupParams,
        dirty: true,
        ...(last.overlay ? { overlay: { ...last.overlay } } : {}),
        ...(dupLens ? { lens: dupLens } : {}),
      };
      return { ...child, kids: [...child.kids, dup], dirty: true };
    },
    true,
  );
  return r.found ? { ...r.node, dirty: true } : root;
}

/** 잎의 부모 look 노드 id — 미러 복제가 같은 sub에 사본을 얹기 위한 탐색 */
function findLeafParentId(node: LookNode, leafId: string): string | null {
  for (const child of node.kids) {
    if (isLeaf(child)) {
      if (child.id === leafId) return node.id;
    } else {
      const found = findLeafParentId(child, leafId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 데코 잎 좌우 미러 복제 — 같은 sub에 x=1−x·회전 부호 반전 사본을 한 장 추가
 * (배치 프리셋 UX: 왼볼을 잡으면 오른볼도 한 번에). 나머지 설정은 그대로.
 * MAX_OVERLAY_LAYERS 상한은 호출부(UI)가 확인하고, 초과분은 컴파일이 자른다.
 */
export function mirrorLeaf(root: LookNode, leafId: string): LookNode {
  // 오버레이 없는 잎(비데코)은 미러 대상이 아니다 — rebuild 전에 걸러
  // 트리에 dirty 흔적을 남기지 않는다.
  const target = findNode(root, leafId);
  if (!target || !isLeaf(target) || !target.overlay) return root;
  const parentId = findLeafParentId(root, leafId);
  if (!parentId || parentId === root.id) return root; // face 직속 잎은 없다(구조 규약)
  const r = rebuild(
    root,
    parentId,
    child => {
      if (isLeaf(child)) return child;
      const src = child.kids.find(
        (k): k is ProductLeaf => isLeaf(k) && k.id === leafId,
      );
      if (!src?.overlay) return child;
      const dup: ProductLeaf = {
        ...src,
        id: nid('lf'),
        label: `${src.label.replace(/ 미러$/, '')} 미러`,
        dirty: true,
        params: { ...src.params },
        overlay: {
          ...src.overlay,
          x: 1 - src.overlay.x,
          rotation: -src.overlay.rotation,
        },
      };
      return { ...child, kids: [...child.kids, dup], dirty: true };
    },
    true,
  );
  return r.found ? { ...r.node, dirty: true } : root;
}

/** id로 노드 찾기 (UI 선택 상태 해석용) */
export function findNode(root: LookNode | null, id: string): TreeChild | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.kids) {
    if (child.id === id) return child;
    if (!isLeaf(child)) {
      const r = findNode(child, id);
      if (r) return r;
    }
  }
  return null;
}

/** 트리에 dirty가 하나라도 있는가 (헤더 * 표시) */
export function treeDirty(root: LookNode | null): boolean {
  return !!root?.dirty;
}

// ── 스냅샷 / 복원 (저장물 ↔ 작업본) ─────────────────────────────────────────

export interface LeafSnapshot {
  kind: 'app';
  label: string;
  region: RegionKey;
  visible: boolean;
  /** 편집 히스토리용 — 부재(옛 저장물)=깨끗한 상태. */
  dirty?: boolean;
  params: Partial<FilterParams>;
  overlay?: OverlayLayer;
  /** 렌즈 세부 payload — 부재=비렌즈/옛 스냅샷. */
  lens?: LensLayer;
  /** 역할 태그(§5 A13) — 부재=미태그(옛 스냅샷과 바이트 동일 유지) */
  role?: string;
  /** 잎 인스턴스 id(§5 A13) — 핏 시트 '#겹id' 셀렉터가 저장/재로드를 견디게
   *  보존한다. 부재(옛 스냅샷)=revive가 새 id 발급(겹id 항목은 고아 — 무시 규약). */
  id?: string;
  /** 제품 참조(§5 A12) — 부재=커스텀(옛 스냅샷과 바이트 동일 유지) */
  productId?: string;
  colorwayId?: string;
  technique?: { strength: number };
  /** 카탈로그 마스크·라이너 아트 참조(§16) — params의 임포트 마커와 짝이라
   *  반드시 함께 직렬화한다. 빠지면 마커만 살아남아 마스크가 해제되고(하부는
   *  번들 실루엣) 라이너는 기본 윙 도안으로 바뀐다. 부재=마스크 없는 잎이거나
   *  이 필드 추가 이전 저장물(마커도 통상 없음 — 옛 스냅샷과 바이트 동일). */
  maskRef?: LookMaskRef;
  linerStyleRef?: string;
}

/** 그룹 스냅샷 — 멤버를 인스턴스 id가 아닌 region 순번(인덱스)으로 기록해
 *  revive 시 새로 생성되는 id에 안전하게 재매핑한다(#23 Phase 3). */
export interface GroupSnapshot {
  name: string;
  visible: boolean;
  memberIndexes: number[];
  /** 그룹 번들 참조(#23 Phase 3) — 없으면 익명 그룹(하위호환: 옛 스냅샷엔 부재). */
  ref?: string | null;
}

export interface LookSnapshot {
  kind: 'look';
  ref: string | null;
  name: string;
  level: 'face' | 'region' | 'sub';
  slot: SlotKey;
  owner: 'system' | 'user';
  visible: boolean;
  /** 편집 히스토리용 — dirty ref는 라이브 해석 대신 스냅샷 값으로 복원한다. */
  dirty?: boolean;
  kids: (LookSnapshot | LeafSnapshot)[];
  /** face 루트에만 — 사용자 그룹 메타 */
  groups?: GroupSnapshot[];
  /** 핏 시트 참조(§5 A13) — 부재=미지정(옛 스냅샷과 바이트 동일 유지).
   *  ⚠ 룩 공유(#5 QR) 직렬화에서는 벗겨야 한다(핏=얼굴 종속물). */
  fitRef?: string;
}

export function snapshotTree(root: LookNode): LookSnapshot {
  const snapLeaf = (c: ProductLeaf): LeafSnapshot => {
    // 마스크·라이너 아트 URI는 params의 임포트 마커와 짝이라 함께 저장한다. 단
    // 재시작을 못 견디는 URI(사용자 임포트 file://)는 URI·마커를 **함께** 떨어뜨린다
    // — 죽은 경로를 전송하면 Unity가 로드 실패 후 직전 룩 텍스처를 그대로 유지해
    // 엉뚱한 마스크가 남고(부위 누수) 재전송 댐퍼까지 걸려 복구가 막힌다. 둘 다
    // 없으면 그 부위는 절차 실루엣으로 정직하게 돌아간다.
    const durableMask =
      c.maskRef && isDurableAssetUri(c.maskRef.uri) ? c.maskRef : undefined;
    const staleMarkerKey =
      c.maskRef && !durableMask ? MASK_MARKER_KEY[c.maskRef.region] : undefined;
    const params = { ...c.params };
    if (staleMarkerKey) delete params[staleMarkerKey];
    return {
      kind: 'app',
      id: c.id,
      label: c.label,
      region: c.region,
      visible: c.visible,
      ...(c.dirty ? { dirty: true } : {}),
      params,
      ...(c.overlay ? { overlay: { ...c.overlay } } : {}),
      ...(c.lens ? { lens: { ...c.lens } } : {}),
      ...(c.role ? { role: c.role } : {}),
      ...(c.productId ? { productId: c.productId } : {}),
      ...(c.colorwayId ? { colorwayId: c.colorwayId } : {}),
      ...(c.technique ? { technique: { ...c.technique } } : {}),
      ...(durableMask ? { maskRef: { ...durableMask } } : {}),
      ...(c.linerStyleRef && isDurableAssetUri(c.linerStyleRef)
        ? { linerStyleRef: c.linerStyleRef }
        : {}),
    };
  };
  const snapChild = (c: TreeChild): LookSnapshot | LeafSnapshot =>
    isLeaf(c)
      ? snapLeaf(c)
      : {
          kind: 'look',
          ref: c.ref,
          name: c.name,
          level: c.level,
          slot: c.slot,
          owner: c.owner,
          visible: c.visible,
          ...(c.dirty ? { dirty: true } : {}),
          kids: c.kids.map(snapChild),
          ...(c.fitRef ? { fitRef: c.fitRef } : {}),
        };
  const snap = snapChild(root) as LookSnapshot;
  // 그룹 — 멤버를 region 순번으로 직렬화(id는 revive 시 재생성되므로)
  if (root.groups && root.groups.length > 0) {
    const regionKids = root.kids.filter((c): c is LookNode => !isLeaf(c));
    const groups = root.groups
      .map(g => ({
        name: g.name,
        visible: g.visible,
        memberIndexes: g.memberIds
          .map(id => regionKids.findIndex(k => k.id === id))
          .filter(i => i >= 0),
        // 번들 링크만 직렬화(익명 그룹은 필드 부재 — 옛 스냅샷과 바이트 동일 유지)
        ...(g.ref ? { ref: g.ref } : {}),
      }))
      .filter(g => g.memberIndexes.length > 0);
    if (groups.length > 0) snap.groups = groups;
  }
  return snap;
}

/** 라이브 해석 노드에도 스냅샷의 켬/끔·핏 지정·잎 id는 복원(구조 같을 때만 — 목업
 *  검증 규칙). fitRef·잎 id는 사용자 상태(내 얼굴 종속·겹id 셀렉터 앵커)라 라이브
 *  정의가 아니라 스냅샷이 출처다. */
function copyVisibility(snap: LookSnapshot | LeafSnapshot, live: TreeChild): void {
  live.visible = snap.visible;
  if (snap.kind === 'app' && isLeaf(live)) {
    if (snap.id) live.id = claimId(snap.id);
    return;
  }
  if (snap.kind === 'look' && !isLeaf(live)) {
    if (snap.fitRef) live.fitRef = snap.fitRef;
    if (snap.kids.length === live.kids.length) {
      snap.kids.forEach((sk, i) => copyVisibility(sk, live.kids[i]));
    }
  }
}

/** 그룹 스냅샷 복원 — 멤버 순번을 node의 region kids id로 재매핑해 node에 붙인다.
 *  ref-live/동결 두 복원 경로 모두 같은 규칙(그룹은 어느 쪽 루트든 그대로 살린다). */
function reviveGroups(node: LookNode, snapGroups?: GroupSnapshot[]): void {
  if (!snapGroups || snapGroups.length === 0) return;
  const regionKids = node.kids.filter((c): c is LookNode => !isLeaf(c));
  const groups = snapGroups
    .map(g => ({
      id: gid(),
      name: g.name,
      visible: g.visible,
      memberIds: g.memberIndexes
        .map(i => regionKids[i]?.id)
        .filter((id): id is string => !!id),
      ref: g.ref ?? null,
    }))
    .filter(g => g.memberIds.length > 0);
  if (groups.length > 0) node.groups = groups;
}

// 2026-07 혼합 SubSpec 분리 전에는 이 4개 :s0가 서로 다른
// RegionKey 잎 2개를 소유했다. 익명 region 아래의 clean sub ref로 저장된
// 스냅샷을 신규 단일 잎 :s0으로 live 해석하면 두 번째 겹이 유실된다.
// 구 혼합 모양이 스냅샷에 실제로 남아 있는 경우만 동결 복원해,
// 같은 ref의 신규 단일 잎 저장본은 기존 live 전파 규칙을 그대로 따른다.
const LEGACY_MIXED_SUB_REFS = new Set([
  'sys:var:eye:lens-gray-circle:s0',
  'sys:var:eye:lens-hazel:s0',
  'sys:var:brow:natural:s0',
  'sys:var:brow:soft-lighten:s0',
]);

function containsLegacyMixedSub(snap: LookSnapshot): boolean {
  if (snap.level === 'sub' && snap.ref && LEGACY_MIXED_SUB_REFS.has(snap.ref)) {
    const regions = new Set(
      snap.kids.filter((k): k is LeafSnapshot => k.kind === 'app').map(k => k.region),
    );
    if (regions.size > 1) return true;
  }
  return snap.kids.some(k => k.kind === 'look' && containsLegacyMixedSub(k));
}

/**
 * 스냅샷 → 작업본. ref가 라이브러리에 살아있고 dirty가 아니면 라이브 해석(공유 룩
 * '원본 반영' 전파 — 목업 v2 검증 의미론), ref=null 또는 dirty=true인 노드는
 * 스냅샷 값으로 동결 복원한다(dirty ref 자체는 저장 의미론을 위해 그대로 보존).
 * 그룹 메타는 두 경로 모두에서 순번 기반으로 복원한다(루트 ref 유무와 무관).
 */
export function reviveTree(snap: LookSnapshot, lib: LookLibrary): LookNode {
  if (snap.ref && !snap.dirty && lib[snap.ref] && !containsLegacyMixedSub(snap)) {
    const live = instantiate(lib, snap.ref);
    if (live) {
      copyVisibility(snap, live);
      reviveGroups(live, snap.groups);
      return live;
    }
  }
  const kids: TreeChild[] = snap.kids.map(k => {
    if (k.kind === 'app') {
      const migrated = migrateLegacyEyeshadowLayer(k.region as RegionKey | 'eyeshadowLower', k.params);
      return ({
          kind: 'app',
          id: k.id ? claimId(k.id) : nid('lf'),
          label: k.label,
          region: migrated.region,
          visible: k.visible,
          dirty: k.dirty ?? false,
          params: migrated.params,
          ...(k.overlay ? { overlay: { ...k.overlay } } : {}),
          ...(k.lens ? { lens: { ...k.lens } } : {}),
          ...(k.role ? { role: k.role } : {}),
          ...(k.productId ? { productId: k.productId } : {}),
          ...(k.colorwayId ? { colorwayId: k.colorwayId } : {}),
          ...(k.technique ? { technique: { ...k.technique } } : {}),
          // 저장된 마스크·라이너 아트 URI 복원 — 마커만 살아남으면 reconcileMasks가
          // 마스크를 해제해 저장 직전과 다른 실루엣이 그려진다.
          ...(k.maskRef ? { maskRef: { ...k.maskRef } } : {}),
          ...(k.linerStyleRef ? { linerStyleRef: k.linerStyleRef } : {}),
        } as ProductLeaf);
    }
    return reviveTree(k, lib);
  });
  const node: LookNode = {
    kind: 'look',
    id: nid('lk'),
    ref: snap.ref,
    name: snap.name,
    level: snap.level,
    slot: snap.slot,
    owner: snap.owner,
    visible: snap.visible,
    dirty: snap.dirty ?? false,
    kids,
    ...(snap.fitRef ? { fitRef: snap.fitRef } : {}),
  };
  reviveGroups(node, snap.groups);
  return node;
}

// ── 저장 시트 — 변경 수집·확정 (copy-on-write의 유일한 확인 지점) ───────────

export interface SaveItem {
  /** 대상 종류(#23 Phase 3) — 'region'=부위 노드 · 'group'=그룹 번들.
   *  미지정=region(하위호환). group일 때 nodeId는 그룹 id다. */
  target?: 'region' | 'group';
  /** 대상 인스턴스 id — region 노드 id 또는(그룹일 때) 그룹 id */
  nodeId: string;
  name: string;
  slot: SlotKey;
  owner: 'system' | 'user';
  /** 'auto'=시스템 자동 사본 · 'choice'=내 룩(사본/원본반영 선택) · 'new'=새 레이어 */
  kind: 'auto' | 'choice' | 'new';
  /** kind==='choice'일 때: 이 정의를 쓰는 다른 곳 개수 (경고 문구용) */
  sharedCount: number;
  /** 사용자가 고른 처리 — 기본 'copy'. 'apply'=원본에 반영 */
  mode: 'copy' | 'apply';
  /** ☆ 라이브러리에 별도 룩으로 승격 */
  promote: boolean;
}

/** 다른 저장 스타일들의 스냅샷에서 defId 참조 횟수 (자기 자신 제외) */
export function countSharedRefs(
  defId: string,
  snapshots: (LookSnapshot | null)[],
): number {
  let count = 0;
  const walk = (s: LookSnapshot | LeafSnapshot) => {
    if (s.kind === 'look') {
      if (s.ref === defId) count++;
      s.kids.forEach(walk);
    }
  };
  for (const snap of snapshots) if (snap) walk(snap);
  return count;
}

/** 다른 저장 스타일들의 스냅샷에서 그룹 번들 defId 참조 횟수(#23 Phase 3).
 *  주의(경고 문구 전용, 행동 무관): 번들의 멤버 region def를 그룹 없이 슬롯 픽커로
 *  직접 채택한 스타일은 group.ref가 없어 여기서 집계되지 않는다 → "다른 곳 N곳"이
 *  과소 집계될 수 있다. sharedCount는 안내 문자열에만 쓰이고 apply/copy 결정 로직엔
 *  영향을 주지 않으므로 의도적으로 그룹 참조만 센다(멤버 def 참조까지 더하면 그룹
 *  멤버가 곧 그 region def이라 이중 집계 위험). */
export function countSharedGroupRefs(
  defId: string,
  snapshots: (LookSnapshot | null)[],
): number {
  let count = 0;
  const walk = (s: LookSnapshot | LeafSnapshot) => {
    if (s.kind !== 'look') return;
    for (const g of s.groups ?? []) if (g.ref === defId) count++;
    s.kids.forEach(walk);
  };
  for (const snap of snapshots) if (snap) walk(snap);
  return count;
}

/** 저장 시트에 띄울 변경 요약 항목 — region 레벨만(중간 계층 익명 흡수 규칙).
 *  번들 링크 그룹(group.ref)의 멤버는 region 항목에서 빼고 그룹 단위로 한 번만 묻는다. */
export function collectChanges(
  root: LookNode | null,
  lib: LookLibrary,
  otherSnapshots: (LookSnapshot | null)[],
): SaveItem[] {
  const items: SaveItem[] = [];
  if (!root) return items;
  for (const child of root.kids) {
    if (isLeaf(child) || child.level !== 'region') continue;
    // 번들 링크 그룹의 멤버는 그룹 단위(아래)로 묶어 묻는다 — region 개별 항목 억제.
    const grp = groupOfRegion(root, child.id);
    if (grp && grp.ref && lib[grp.ref]) continue;
    if (child.dirty && child.ref && lib[child.ref]) {
      const owner = lib[child.ref].owner;
      items.push({
        target: 'region',
        nodeId: child.id,
        name: child.name,
        slot: child.slot,
        owner,
        kind: owner === 'system' ? 'auto' : 'choice',
        sharedCount: owner === 'user' ? countSharedRefs(child.ref, otherSnapshots) : 0,
        mode: 'copy',
        promote: false,
      });
    } else if (!child.ref) {
      items.push({
        target: 'region',
        nodeId: child.id,
        name: child.name,
        slot: child.slot,
        owner: 'user',
        kind: 'new',
        sharedCount: 0,
        mode: 'copy',
        promote: false,
      });
    }
  }
  // 그룹 번들 항목 — 멤버가 하나라도 dirty면 "이 룩에서만/원본에 반영"을 그룹 단위로.
  for (const group of root.groups ?? []) {
    if (!group.ref || !lib[group.ref]) continue;
    const members = root.kids.filter(
      (c): c is LookNode => !isLeaf(c) && group.memberIds.includes(c.id),
    );
    if (!members.some(m => m.dirty)) continue;
    items.push({
      target: 'group',
      nodeId: group.id,
      name: group.name,
      slot: '피부',
      owner: 'user',
      kind: 'choice',
      sharedCount: countSharedGroupRefs(group.ref, otherSnapshots),
      mode: 'copy',
      promote: false,
    });
  }
  return items;
}

let userDefSeq = 0;
const newDefId = () => `usr:${Date.now().toString(36)}:${++userDefSeq}`;

/** sub 노드 → 정의 id (안 더러우면 기존 ref 재사용, 아니면 새 사용자 정의) */
function materializeSub(node: LookNode, lib: LookLibrary): string {
  if (node.ref && !node.dirty && lib[node.ref]) return node.ref;
  const id = newDefId();
  lib[id] = {
    id,
    name: node.name,
    level: 'sub',
    slot: node.slot,
    owner: 'user',
    // 잎→정의 변환은 leafDefFromLeaf 하나로 — 인라인 사본은 필드가 늘 때마다
    // 조용히 뒤처진다(마스크 URI를 떨어뜨려 저장된 룩이 마커만 남는 고아가 됐다).
    kids: node.kids.filter(isLeaf).map(leafDefFromLeaf),
  };
  return id;
}

/** region 노드 → region 정의 id (안 더러운 '사용자' 정의는 재사용, 아니면 새 사용자 정의).
 *  materializeSub의 region 레벨 짝 — 그룹 번들 승격/반영이 멤버를 재료화할 때 쓴다.
 *  ★ rule 2(시스템 불변): 시스템 def는 clean이어도 재사용하지 않고 사용자 사본으로
 *  승격한다. 시스템 ref를 번들 kids·멤버 ref로 남기면 그룹 '원본 반영'이 in-place로
 *  nextLib['sys:...']를 덮어써 세션 내 시스템 프리셋을 오염시킨다(개별 경로는 시스템을
 *  kind:'auto'=사본으로만 다루는 것과 일치). 사용자 def가 (시스템일 수 있는) 하위 sub를
 *  감싸는 형태는 materializeSub 철학 그대로 — 하위 sys sub는 apply 시에도 dirty 잎만
 *  새 사용자 sub로 교체돼 절대 in-place 변형되지 않는다. */
function materializeRegion(node: LookNode, lib: LookLibrary): string {
  if (node.ref && !node.dirty && lib[node.ref] && lib[node.ref].owner === 'user') {
    return node.ref;
  }
  const id = newDefId();
  lib[id] = {
    id,
    name: node.name,
    level: 'region',
    slot: node.slot,
    owner: 'user',
    kids: node.kids
      .filter((c): c is LookNode => !isLeaf(c))
      .map(c => materializeSub(c, lib)),
  };
  return id;
}

/**
 * 그룹 멤버 region 노드들을 region 정의로 재료화하고, 작업본을 그 정의에 re-ref
 * (dirty 해제)한 새 root와 정의 id 배열을 돌려준다. 번들 원본 반영·승격 공용.
 */
function materializeGroupMembers(
  root: LookNode,
  group: LookGroup,
  lib: LookLibrary,
): { root: LookNode; regionIds: string[] } {
  const regionIds: string[] = [];
  const idToRef = new Map<string, string>();
  for (const id of group.memberIds) {
    const node = root.kids.find(
      (c): c is LookNode => !isLeaf(c) && c.id === id,
    );
    if (!node) continue;
    const rid = materializeRegion(node, lib);
    regionIds.push(rid);
    idToRef.set(id, rid);
  }
  const kids = root.kids.map(c => {
    if (isLeaf(c)) return c;
    const rid = idToRef.get(c.id);
    if (!rid) return c;
    return {
      ...c,
      ref: rid,
      dirty: false,
      kids: c.kids.map(k =>
        isLeaf(k)
          ? { ...k, dirty: false }
          : {
              ...k,
              dirty: false,
              kids: k.kids.map(l => (isLeaf(l) ? { ...l, dirty: false } : l)),
            },
      ),
    } as LookNode;
  });
  return { root: { ...root, kids }, regionIds };
}

/**
 * 그룹 통째 라이브러리 승격(#23 Phase 3) — 멤버 region들을 재사용 번들(kind:'group',
 * owner:'user')로 등록하고, 작업본 그룹에 ref를 링크(멤버 re-ref·dirty 해제)한 새
 * (root, lib, defId)를 돌려준다. "☆ 따로 저장" 즉시 흐름. 멤버 없으면 null.
 */
export function promoteGroup(
  root: LookNode,
  lib: LookLibrary,
  groupId: string,
  name: string,
): { root: LookNode; lib: LookLibrary; defId: string } | null {
  const group = root.groups?.find(g => g.id === groupId);
  if (!group) return null;
  const hasMember = root.kids.some(
    c => !isLeaf(c) && group.memberIds.includes(c.id),
  );
  if (!hasMember) return null;
  const nextLib: LookLibrary = { ...lib };
  const { root: reref, regionIds } = materializeGroupMembers(root, group, nextLib);
  if (regionIds.length === 0) return null;
  const clean = name.trim() || group.name;
  const defId = newDefId();
  nextLib[defId] = {
    id: defId,
    name: `★ ${clean}`,
    kind: 'group',
    level: 'face',
    slot: '피부',
    owner: 'user',
    kids: regionIds,
  };
  const groups = (reref.groups ?? []).map(g =>
    g.id === groupId ? { ...g, name: clean, ref: defId } : g,
  );
  return { root: { ...reref, groups }, lib: nextLib, defId };
}

/**
 * 저장 확정 — 시트 결정(items)을 적용한 새 (트리, 라이브러리)를 돌려준다.
 *  - mode='apply' → 원본 정의에 반영(다른 공유처에 전파). sub는 재료화 후 re-ref.
 *  - promote      → '★ 이름'으로 라이브러리 승격.
 *  - 나머지 dirty ref → 참조 분리(익명 흡수, 원본 불변).
 *  - 그룹 번들 항목(target==='group') → 멤버 통째 원본 반영/사본 분리/승격.
 *  - 모든 dirty 해제.
 */
export function applySaveDecisions(
  root: LookNode,
  lib: LookLibrary,
  items: SaveItem[],
): { root: LookNode; lib: LookLibrary; appliedNotes: string[] } {
  const nextLib: LookLibrary = { ...lib };
  const notes: string[] = [];
  const groupItems = items.filter(i => i.target === 'group');
  const byNode = new Map(
    items.filter(i => i.target !== 'group').map(i => [i.nodeId, i]),
  );

  // 그룹 '원본 반영'은 멤버 region 정의를 in-place로 갱신해야 공유 번들을 쓰는
  // 다른 스타일에도 전파된다(region def id 안정 유지). 그래서 apply 그룹의 dirty
  // 멤버마다 region-apply 항목을 합성해 아래 region 경로(정의 in-place 갱신)를 태운다.
  for (const gi of groupItems) {
    if (gi.mode !== 'apply') continue;
    const group = root.groups?.find(g => g.id === gi.nodeId);
    if (!group) continue;
    for (const c of root.kids) {
      if (isLeaf(c) || !group.memberIds.includes(c.id) || !c.dirty) continue;
      if (byNode.has(c.id)) continue; // 이미 개별 항목이 있으면 그대로 둔다
      // ★ rule 2 방어선: 멤버 ref가 사용자 def가 아니면(시스템 정의·부재) apply 항목을
      // 합성하지 않는다 — 합성 생략 시 rebuildNode가 dirty ref를 copy(fork)로 강등해
      // 시스템 프리셋 in-place 오염을 막는다(개별 경로 kind:'auto'=사본과 동일 의미론).
      // materializeRegion(b 수정) 덕에 정상 경로 멤버는 이미 사용자 def지만, 승격 후
      // swapRegionNode로 시스템 region을 끼운 잔여 경로까지 여기서 확실히 차단한다.
      if (!c.ref || nextLib[c.ref]?.owner !== 'user') continue;
      byNode.set(c.id, {
        target: 'region',
        nodeId: c.id,
        name: c.name,
        slot: c.slot,
        owner: 'user',
        kind: 'choice',
        sharedCount: gi.sharedCount,
        mode: 'apply',
        promote: false,
      });
    }
  }

  const rebuildNode = (node: LookNode): LookNode => {
    const item = byNode.get(node.id);
    let kids: TreeChild[] = node.kids.map(c => (isLeaf(c) ? c : rebuildNode(c)));
    let ref = node.ref;

    if (item && node.level === 'region') {
      if (item.mode === 'apply' && ref && nextLib[ref]) {
        // 원본에 반영 — sub들을 재료화해 정의 갱신, 작업본도 re-ref
        const subIds: string[] = [];
        kids = kids.map(c => {
          if (isLeaf(c)) return c;
          const subId = materializeSub(c, nextLib);
          subIds.push(subId);
          return { ...c, ref: subId, dirty: false, kids: c.kids.map(k => (isLeaf(k) ? { ...k, dirty: false } : k)) };
        });
        nextLib[ref] = { ...nextLib[ref], kids: subIds };
        notes.push(`${node.name} 원본 반영${item.sharedCount > 0 ? ` (다른 곳 ${item.sharedCount}곳 적용)` : ''}`);
      }
      if (item.promote) {
        const id = newDefId();
        const subIds = kids
          .filter((c): c is LookNode => !isLeaf(c))
          .map(c => materializeSub(c, nextLib));
        nextLib[id] = {
          id,
          name: `★ ${node.name}`,
          level: 'region',
          slot: node.slot,
          owner: 'user',
          kids: subIds,
        };
        notes.push(`★ ${node.name} 라이브러리 등록`);
      }
    }

    // 원본 반영이 아닌 수정분은 참조 분리(익명 사본) — 시스템/사용자 공통
    if (node.dirty && ref && !(item && item.mode === 'apply')) {
      ref = null;
    }
    const clearedKids = kids.map(c =>
      isLeaf(c) ? (c.dirty ? { ...c, dirty: false } : c) : c,
    );
    return { ...node, ref, dirty: false, kids: clearedKids };
  };

  let nextRoot = rebuildNode(root);

  // 그룹 번들 항목 — 멤버 재료화는 rebuildNode가 처리했다(apply=합성 region 항목으로
  // 정의 in-place 갱신·전파 / copy=dirty ref 분리). 여기서는 그룹 링크·승격만 마무리.
  for (const item of groupItems) {
    const group = nextRoot.groups?.find(g => g.id === item.nodeId);
    if (!group) continue;

    if (item.mode === 'apply') {
      // 멤버 region 정의가 in-place 갱신돼 공유 번들 사용처 전부에 전파됨(그룹 ref 유지)
      notes.push(
        `${group.name} 그룹 원본 반영${item.sharedCount > 0 ? ` (다른 곳 ${item.sharedCount}곳 적용)` : ''}`,
      );
    } else if (group.ref) {
      // 사본 — 공유 번들에서 분리(익명 그룹화, 원본 번들 불변)
      nextRoot = {
        ...nextRoot,
        groups: (nextRoot.groups ?? []).map(g =>
          g.id === group.id ? { ...g, ref: null } : g,
        ),
      };
      notes.push(`${group.name} 그룹 사본 (원본 번들 불변)`);
    }

    if (item.promote) {
      // 멤버를 재료화해 새 번들로 등록(apply 멤버는 ref 유지→공유 region 정의 재사용)
      const { regionIds } = materializeGroupMembers(nextRoot, group, nextLib);
      const defId = newDefId();
      nextLib[defId] = {
        id: defId,
        name: `★ ${group.name}`,
        kind: 'group',
        level: 'face',
        slot: '피부',
        owner: 'user',
        kids: regionIds,
      };
      notes.push(`★ ${group.name} 그룹 라이브러리 등록`);
    }
  }

  return { root: nextRoot, lib: nextLib, appliedNotes: notes };
}

// ── 저장 스코프 판정 — 실제 편집 범위를 따라 등록 레벨을 자동 결정 ───────────
// 사용자 지적: 세부부위 하나(아이라인)만 편집해도 저장이 '전체 룩'으로 굳었다.
// 저장 단위는 내용 범위를 따라야 한다 — 세부부위 1개=sub, 한 슬롯 여러 세부=region,
// 여러 슬롯=face. 판정은 기본값이고 사용자는 시트에서 상위 레벨로 올릴 수 있다.

export type SaveLevel = 'sub' | 'region' | 'face';

interface ContentSub {
  sub: LookNode;
  slot: SlotKey;
  /** 세부부위 표시 라벨(첫 잎 region의 REGION_MAP.label) */
  regionLabel: string;
}

/** leaf를 하나라도 가진 sub 노드 전부 = '내용 있는 세부부위'. 스코프 판정의 원재료. */
function contentSubs(root: LookNode | null): ContentSub[] {
  const out: ContentSub[] = [];
  if (!root) return out;
  const walk = (node: LookNode) => {
    for (const c of node.kids) {
      if (isLeaf(c)) continue;
      if (c.level === 'sub') {
        const leaves = c.kids.filter(isLeaf);
        if (leaves.length > 0) {
          out.push({
            sub: c,
            slot: c.slot,
            regionLabel: REGION_MAP[leaves[0].region]?.label ?? c.name,
          });
          continue; // sub 아래는 잎뿐 — 더 내려가지 않는다
        }
      }
      walk(c);
    }
  };
  walk(root);
  return out;
}

export interface SaveScope {
  /** 내용에 맞는 최소(가장 좁은) 등록 레벨 — 저장 시트 기본 선택값 */
  level: SaveLevel;
  /** 내용 있는 세부부위 수 */
  subCount: number;
  /** 내용 있는 슬롯 수 */
  slotCount: number;
  /** 내용 슬롯 표시 라벨(SLOT_LABEL) */
  slotLabels: string[];
  /** 내용 세부부위 표시 라벨(REGION_MAP.label) */
  subLabels: string[];
}

/**
 * 작업본 트리의 내용을 스캔해 기본 저장 레벨을 판정한다.
 *  ① 세부부위 1개 → 'sub'  ② 한 슬롯 안 여러 세부부위 → 'region'  ③ 여러 슬롯 → 'face'.
 * 내용이 없으면 'face'로 폴백(빈 저장은 시트가 '변경 없음'으로 별도 안내).
 */
export function analyzeSaveScope(root: LookNode | null): SaveScope {
  const subs = contentSubs(root);
  const slots = [...new Set(subs.map(s => s.slot))];
  let level: SaveLevel;
  if (subs.length === 0) level = 'face';
  else if (subs.length === 1) level = 'sub';
  else if (slots.length === 1) level = 'region';
  else level = 'face';
  return {
    level,
    subCount: subs.length,
    slotCount: slots.length,
    slotLabels: slots.map(s => SLOT_LABEL[s]),
    subLabels: subs.map(s => s.regionLabel),
  };
}

/** 이 스코프에서 선택 가능한 레벨(판정 레벨 이상만 — 좁히기는 불가, 넓히기만 허용). */
export function selectableLevels(scope: SaveScope): SaveLevel[] {
  if (scope.subCount === 0) return ['face'];
  if (scope.level === 'sub') return ['sub', 'region', 'face'];
  if (scope.level === 'region') return ['region', 'face'];
  return ['face'];
}

// ── 스코프 저장 실행 — 세부부위/부위 레벨은 라이브러리 정의로 등록 ──────────

function leafDefFromLeaf(lf: ProductLeaf): LeafDef {
  return {
    label: lf.label,
    region: lf.region,
    params: { ...lf.params },
    ...(lf.overlay ? { overlay: { ...lf.overlay } } : {}),
    ...(lf.lens ? { lens: { ...lf.lens } } : {}),
    ...(lf.role ? { role: lf.role } : {}),
    ...(lf.productId ? { productId: lf.productId } : {}),
    ...(lf.colorwayId ? { colorwayId: lf.colorwayId } : {}),
    ...(lf.technique ? { technique: { ...lf.technique } } : {}),
    // 내 룩으로 저장(스코프 저장·저장 시트 반영/승격)해도 마스크·라이너 아트가
    // 남아야 한다 — leafFromDef가 정의에서 다시 잎으로 복사한다(마커는 params에
    // 이미 있음). 라이브러리 정의는 세션을 넘겨 재사용되므로 스냅샷과 같은
    // 지속성 규칙을 쓴다(죽는 file:// 경로는 싣지 않는다).
    ...(lf.maskRef && isDurableAssetUri(lf.maskRef.uri)
      ? { maskRef: { ...lf.maskRef } }
      : {}),
    ...(lf.linerStyleRef && isDurableAssetUri(lf.linerStyleRef)
      ? { linerStyleRef: lf.linerStyleRef }
      : {}),
  };
}

/** 트리 전체 dirty 해제 + 지정 노드를 새 정의로 re-ref(스코프 저장 후 작업본 정리). */
function cleanReref(node: LookNode, targetId: string | null, defId: string): LookNode {
  const kids = node.kids.map(c =>
    isLeaf(c) ? (c.dirty ? { ...c, dirty: false } : c) : cleanReref(c, targetId, defId),
  );
  return {
    ...node,
    dirty: false,
    ...(targetId != null && node.id === targetId ? { ref: defId } : {}),
    kids,
  };
}

export interface ScopedSaveResult {
  lib: LookLibrary;
  root: LookNode;
  defId: string;
  level: 'sub' | 'region';
  /** 등록된 정의 이름(충돌 회피 반영 후) */
  name: string;
}

/**
 * 세부부위/부위 레벨 저장 — 편집한 범위만 사용자 라이브러리 정의로 등록한다
 * (전체 룩 카드로 굳지 않게 — 사용자 지적 대응). 등록 후 작업본은 dirty 해제하고
 * 해당 노드를 새 정의에 re-ref한다. 'face'는 이 경로를 타지 않는다(호출부가 카드로 저장).
 *  - 'sub'   : 내용 세부부위 1개 → 사용자 sub 정의(subDefsForRegion 픽커 노출).
 *  - 'region': 한 슬롯의 세부부위 전부 → 사용자 region 정의(regionDefsForSlot 픽커).
 *     region의 멤버 sub은 internal로 등록해 세부부위 픽커를 어지럽히지 않는다(계약).
 * 이름 충돌은 같은 레벨 사용자 정의와 자동 번호로 피한다. 내용 없으면 null.
 */
export function registerScopedLook(
  root: LookNode,
  lib: LookLibrary,
  level: 'sub' | 'region',
  name: string,
): ScopedSaveResult | null {
  const subs = contentSubs(root);
  if (subs.length === 0) return null;
  const nextLib: LookLibrary = { ...lib };
  const slot = subs[0].slot;

  // 이름 충돌 회피 — 같은 레벨의 사용자(비-internal·비-group) 정의 이름과 비교.
  const taken = new Set(
    Object.values(lib)
      .filter(
        d => d.owner === 'user' && d.level === level && !d.internal && d.kind !== 'group',
      )
      .map(d => d.name),
  );
  let clean = name.trim() || (level === 'sub' ? '내 세부룩' : '내 부위룩');
  if (taken.has(clean)) {
    let n = 2;
    while (taken.has(`${clean} ${n}`)) n += 1;
    clean = `${clean} ${n}`;
  }

  if (level === 'sub') {
    const sub = subs[0].sub;
    const defId = newDefId();
    nextLib[defId] = {
      id: defId,
      name: clean,
      level: 'sub',
      slot,
      owner: 'user',
      kids: sub.kids.filter(isLeaf).map(leafDefFromLeaf),
    };
    return { lib: nextLib, root: cleanReref(root, sub.id, defId), defId, level, name: clean };
  }

  // region — 그 슬롯의 내용 세부부위 전부를 하나의 사용자 region 정의로 묶는다
  // (슬롯에 region 노드가 여럿이어도 견고하게: 노드 수와 무관하게 잎을 모은다).
  const slotSubs = subs.filter(s => s.slot === slot).map(s => s.sub);
  const subIds = slotSubs.map(sub => {
    const sid = newDefId();
    nextLib[sid] = {
      id: sid,
      name: sub.name,
      level: 'sub',
      slot,
      owner: 'user',
      internal: true, // 상위 부위 룩의 조각 — 세부부위 픽커에 개별 노출 안 함
      kids: sub.kids.filter(isLeaf).map(leafDefFromLeaf),
    };
    return sid;
  });
  const defId = newDefId();
  nextLib[defId] = {
    id: defId,
    name: clean,
    level: 'region',
    slot,
    owner: 'user',
    kids: subIds,
  };
  // 슬롯에 region 노드가 정확히 하나면 그것을 re-ref, 아니면 dirty만 정리.
  const regionNodes = root.kids.filter(
    (c): c is LookNode => !isLeaf(c) && c.slot === slot,
  );
  const targetId = regionNodes.length === 1 ? regionNodes[0].id : null;
  return { lib: nextLib, root: cleanReref(root, targetId, defId), defId, level, name: clean };
}
