/**
 * 컴포저 시트 — 재귀 룩 트리 아코디언 (목업 v2 화면 02) + 축 편집기(화면 03).
 * 전체 룩 = 부위 룩의 합 = 세부 룩의 합 = 제품 적용(겹겹)의 합. 4계층이지만
 * 화면 이동 없이 한 시트 안 세로 스크롤로만 펼친다(행 탭=아코디언).
 *  - ⇄ 교체: 같은 슬롯 자리에 라이브러리의 다른 region 룩 갈아끼우기(인라인 패널)
 *  - ＋겹: 같은 제품 한 겹 더(stackLeaf, 농도 절반)
 *  - 잎 탭: 축 편집기(AxisEditor) — 경로 표시줄이 어느 룩의 어느 겹인지 보여준다
 * 트리 변형은 전부 App(불변 lookTree.ts)에 위임 — 여기는 렌더와 UI 상태(펼침·선택)만.
 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { FilterParams, LensLayer, OverlayLayer } from '../bridge/types';
import type { AssetCatalogEntry, CatalogManifest } from '../assets/assetCatalog';
import { isRenderableThumb } from '../assets/assetCatalog';
import { designEntries, entriesForControl } from '../assets/catalogPicker';
import { BARE, BLUSH_COLORS, IRIS_COLORS } from '../presets';
import ParamSlider from './ParamSlider';
import ColorSwatches from './ColorSwatches';
import ColorWheel from './ColorWheel';
import FinishStudio from './FinishStudio';
import ExpertParamControls from './ExpertParamControls';
import {
  paramsForRegion,
} from '../composer/expertParams';
import type {
  ExpertOverrides,
  ExpertParamKey,
} from '../composer/expertParams';
import {
  AXIS_LABELS,
  FINISHES,
  FINISH_ENUM_SEED,
  FOUNDATION_FINISHES,
  finishBundleToPatch,
  GOLD,
  isCustomFinish,
  isDecoRegion,
  isLensRegion,
  LENS_BLEND_MODES,
  readFinishBundle,
  REGION_GROUPS,
  REGION_MAP,
} from '../composer/regions';
import type {
  AxisKey,
  AxisPresentation,
  ComposerControl,
  DomainOption,
  RegionDef,
  FinishBundle,
  FinishDetailKeys,
  MaskRegion,
  RegionKey,
  TextureAction,
  TextureMapRegion,
} from '../composer/regions';
import type { UserFinish } from '../storage/finishStore';
import type {FitSheet} from '../composer/fitSheets';
import {
  FAMILY_TEMPLATES,
  familiesRankedForRegion,
  findProduct,
  addProductColorway,
  normalizeProduct,
  physicalKeysForRegion,
  physicalOverridesForRoundTrip,
  productFromLeafPhysicals,
  productsOfFamily,
  resolveColorway,
  translateProduct,
} from '../composer/products';
import type { ProductDef, ProductFamily } from '../composer/products';

/** 상위 편집 탭(§5 개념 계층) — 제품(물감)·테크닉(붓질)·핏(맞춤). 6축은 이 3그룹
 *  아래 섹션으로 들어간다(분류체계 §5). UI 전용 그룹 — 데이터 모델(축) 무변경. */
type TabKey = 'product' | 'technique' | 'fit' | 'expert';

const GROUP_LABEL: Record<TabKey, string> = {
  product: '제품',
  technique: '테크닉',
  fit: '핏',
  expert: '전문가',
};
/** 그룹별 하위 축(§5): 제품=색·텍스처(제형)·마감 / 테크닉=모양·농도(+가장자리 프로파일). */
const PRODUCT_AXES: AxisKey[] = ['color', 'texture', 'finish'];
const TECHNIQUE_AXES: AxisKey[] = ['shape', 'opacity'];

/** '가장자리 흐림'(터치=테크닉 프로파일) — fit 축에 선언돼 있으나 §5상 테크닉.
 *  핏 그룹에선 빼고 테크닉 그룹으로 옮긴다(사용자 결정). */
function isEdgeControl(c: ComposerControl): boolean {
  return c.type === 'slider' && /EdgeSoftness$/.test(c.key as string);
}

/** 이 부위에 제품군 기본 선택이 있나 — **적합 제품군이 있는 부위만**. 번역만 가능한
 *  부위까지 노출하면 기본 선택이 엉뚱한 제품군(파운데이션)으로 떨어져 층위가
 *  헷갈린다(사용자 지적). 부위 커버리지는 제품군 신설로 늘린다(brow·mascara 등). */
function hasProductTab(region: RegionKey): boolean {
  return familiesRankedForRegion(region).fit.length > 0;
}

/** 부위가 실제 가진 상위 그룹(제품/테크닉/핏) — 빈 그룹은 탭에서 뺀다. */
function groupsForRegion(region: RegionKey): TabKey[] {
  const def = REGION_MAP[region];
  const has = (a: AxisKey) => (def.axes[a]?.length ?? 0) > 0;
  const fitCtrls = def.axes.fit ?? [];
  const out: TabKey[] = [];
  if (hasProductTab(region) || PRODUCT_AXES.some(has)) out.push('product');
  if (TECHNIQUE_AXES.some(has) || fitCtrls.some(isEdgeControl)) out.push('technique');
  if (fitCtrls.some(c => !isEdgeControl(c))) out.push('fit');
  return out;
}

/** 세부부위(sub) 룩 표시 이름 — 칩이 부위를 말하므로 이름에서 부위 라벨을 걷어낸다:
 *  "내추럴 아이섀도 상"→"내추럴", "아이섀도 상 커스텀"→"커스텀". 걷어내면 빈 이름은
 *  '커스텀'. */
function subDisplayName(sub: LookNode, rdef: RegionDef): string {
  const trimmed = sub.name.replace(rdef.label, '').replace(/\s+/g, ' ').trim();
  return trimmed || '커스텀';
}
import { BUILTIN_DOT, MAX_OVERLAY_LAYERS } from '../composer/model';
import {
  addGroupBundle,
  addRegionNode,
  addSubNode,
  createGroup,
  emptyFaceLook,
  findNode,
  groupBundleDefs,
  groupOfRegion,
  instantiate,
  isLeaf,
  mirrorLeaf,
  newRegionNode,
  newSubNode,
  regionDefsForSlot,
  regionNodeOfSlot,
  regionNodeWith,
  removeGroup,
  removeNode,
  renameGroup,
  setGroupVisible,
  setNodeVisible,
  SLOT_LABEL,
  SLOT_OF_REGION,
  stackLeaf,
  subDefsForRegion,
  swapSubNode,
  swapRegionNode,
  updateBrowSharedAxis,
  updateLeaf,
} from '../composer/lookTree';
import type {
  LookGroup,
  LookLibrary,
  LookNode,
  ProductLeaf,
  TreeChild,
} from '../composer/lookTree';
import { multiUseRegionNode, multiUseTargets } from '../composer/multiUse';
import {
  ACCENT,
  ACCENT_LIGHT,
  ACCENT_PALE,
  CONTROL_H,
  GOLD_CTA,
  GOLD_LIGHT,
  PANEL_INSET,
  SP,
  TEXT_HINT,
  accentAlpha,
} from '../theme';

// 컬러휠 버튼 썸네일 — 스와치 맨 앞 "직접 고르기" 어포던스(무지개 원).
const WHEEL_THUMB = require('../assets/color-wheel.png');

// 눈썹 슬롯 공통 축 — 편집 시 트리의 모든 눈썹 잎에 브로드캐스트(형제 잎 덮어쓰기 회귀 방지).
const BROW_SHARED_KEYS: (keyof FilterParams)[] = [
  'browShape',
  'browThicknessProfile',
  'browThickness',
  'browExpandLower',
  'browExpandUpper',
  'browArch',
];

interface Props {
  mode?: 'detail' | 'expert';
  /** 작업본 룩 트리 — null이면 빈 조합(원본에서 시작) */
  tree: LookNode | null;
  /** 시스템+사용자 병합 라이브러리 — ⇄ 교체 후보 */
  library: LookLibrary;
  /** 새 부위 룩의 기본값 시드용 현재 파라미터 */
  currentParams: FilterParams;
  onChangeTree: (next: LookNode) => void;
  /** 저장 시트 v2 열기 */
  onSave: () => void;
  onClose: () => void;
  /** 통합 파라미터 헤더를 App이 소유할 때 — 자체 최소화·닫기 버튼 생략(중복/닫기 제거). */
  hideChrome?: boolean;
  /** 부위 텍스처 임포트 — 선택된 잎에 강도를 올린다 */
  onPickTexture: (action: TextureAction, leafId: string) => void;
  /** 부위 모양 마스크 임포트(§16 존 스텐실) — 선택된 잎에 "적용됨" 마커를 올린다 */
  onPickMask: (region: MaskRegion, leafId: string) => void;
  /** 질감 맵 임포트(#22 광 지도) — 선택된 잎에 "적용됨" 마커를 올린다(어떻게 빛나는지) */
  onPickTextureMap: (region: TextureMapRegion, leafId: string) => void;
  /** 데코 잎의 그림 교체 (갤러리) */
  onPickOverlayImage: (leafId: string) => void;
  /** 렌즈 세부 잎(#25)의 방사 디자인 텍스처 임포트 (갤러리) */
  onPickLensDesign: (leafId: string) => void;
  // ── 에셋 카탈로그(§16) — 목록 탭 = apply-by-uri (사진 라이브러리 없이 uri로 바로 적용) ──
  /** 병합된 카탈로그(번들 기본 + 사용자) — 컨트롤별 kind+region 필터해 썸네일 노출 */
  catalog: CatalogManifest;
  onApplyTexture: (action: TextureAction, leafId: string, uri: string) => void;
  onApplyMask: (region: MaskRegion, leafId: string, uri: string) => void;
  onApplyTextureMap: (region: TextureMapRegion, leafId: string, uri: string) => void;
  onApplyOverlayImage: (leafId: string, uri: string) => void;
  onApplyLensDesign: (leafId: string, uri: string) => void;
  /** 매니페스트 붙여넣기 임포트 모달 열기 (App이 소유) */
  onOpenCatalogImport: () => void;
  /** 카탈로그 항목 삭제 (썸네일 롱프레스→확인). 번들 기본 시드는 지워지지 않음. */
  onRemoveCatalogEntry?: (id: string) => void;
  /** 제형 스튜디오(#21) — 저장된 커스텀 제형 (마감 축 ◈ 칩) */
  userFinishes: UserFinish[];
  /** 커스텀 제형 저장 (이름 + 부위 무관 번들) */
  onSaveFinish: (name: string, bundle: FinishBundle) => void;
  /** 그룹 통째 라이브러리 승격(#23 Phase 3) — 이름 입력받아 재사용 번들로 등록 */
  onPromoteGroup: (groupId: string, name: string) => void;
  /** "이 겹 핏 조정"(§5 A13) — 잎의 겹id 셀렉터 핏 편집을 App 핏 패널로 승격 */
  onLeafFit?: (leafId: string, region: RegionKey) => void;
  /** 내 제품(A12 후반) — 스튜디오 저작 커스텀 제품(제품 칩에 시중품과 함께 노출) */
  userProducts?: ProductDef[];
  /** 제품 라이브러리+현재 트리를 한 트랜잭션으로 교체 — App가 정규화·영속·방출한다. */
  onCommitProductsAndTree?: (products: ProductDef[], tree: LookNode) => void;
  /** 핏 시트 목록(§5 A13) — 룩 노드에 핏 지정 배지용(이름만) */
  fitSheets?: FitSheet[];
  /** 기존 mainId의 표면명은 "내 얼굴 프로필". 이 id와 다른 유효 fitRef만 룩 예외다. */
  mainFitId?: string | null;
  /** 룩 노드에 핏 시트 지정/해제 — node.fitRef 설정(하위룩>룩>메인 캐스케이드) */
  onSetFitRef?: (nodeId: string, sheetId: string | null) => void;
  expertOverrides?: ExpertOverrides;
  onChangeExpertOverride?: (key: ExpertParamKey, value: number) => void;
  onResetExpertOverride?: (key: ExpertParamKey) => void;
  expertError?: string | null;
}

// ── 표시용 헬퍼 ──────────────────────────────────────────────────────────────

function firstLeafOf(node: TreeChild): ProductLeaf | null {
  if (isLeaf(node)) return node;
  for (const kid of node.kids) {
    const found = firstLeafOf(kid);
    if (found) return found;
  }
  return null;
}

function selectLeafProduct(
  node: LookNode,
  leafId: string,
  identity: Pick<ProductLeaf, 'productId' | 'colorwayId' | 'technique'>,
  clearKeys: readonly (keyof FilterParams)[],
  retainedParams: Partial<FilterParams> = {},
): LookNode {
  let changed = false;
  const kids = node.kids.map(child => {
    if (isLeaf(child)) {
      if (child.id !== leafId) return child;
      changed = true;
      const params = {...child.params};
      clearKeys.forEach(key => delete params[key]);
      Object.assign(params, retainedParams);
      return {...child, ...identity, params, dirty: true};
    }
    const next = selectLeafProduct(child, leafId, identity, clearKeys, retainedParams);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? {...node, kids, dirty: true} : node;
}

/** 잎의 대표 농도(%) — 부위 onKeys 중 최대값 */
function leafIntensity(leaf: ProductLeaf): number {
  if (isDecoRegion(leaf.region)) return leaf.overlay?.intensity ?? 0;
  if (isLensRegion(leaf.region)) return leaf.lens?.intensity ?? 0;
  let max = 0;
  for (const k of REGION_MAP[leaf.region].onKeys) {
    const v = leaf.params[k];
    if (typeof v === 'number' && v > max) max = v;
  }
  return max;
}

function decoLeafCount(tree: LookNode | null): number {
  if (!tree) return 0;
  let count = 0;
  const walk = (node: TreeChild) => {
    if (isLeaf(node)) {
      if (isDecoRegion(node.region)) count++;
      return;
    }
    node.kids.forEach(walk);
  };
  walk(tree);
  return count;
}

const dn = (node: LookNode) => `${node.name}${node.dirty ? '*' : ''}`;

/** 잎까지의 경로 표시줄 — `루트* › 부위룩* › 세부룩* › 제품` */
function pathToLeaf(root: LookNode, leafId: string): string | null {
  const segs: string[] = [];
  const walk = (node: LookNode): boolean => {
    segs.push(dn(node));
    for (const kid of node.kids) {
      if (isLeaf(kid)) {
        if (kid.id === leafId) {
          segs.push(kid.label + (kid.dirty ? '*' : ''));
          return true;
        }
      } else if (walk(kid)) {
        return true;
      }
    }
    segs.pop();
    return false;
  };
  return walk(root) ? segs.join(' › ') : null;
}

interface FitExceptionSource {
  nodeId: string;
}

/** 표시 노드에서 root 방향으로 올라가며 실제 캐스케이드가 참조하는 가장 가까운
 * 유효 non-main 시트를 찾는다. main/유실 ref는 예외가 아니므로 건너뛴다. */
function fitExceptionSource(
  nearestFirst: LookNode[],
  sheets: FitSheet[] | undefined,
  mainId: string | null,
): FitExceptionSource | null {
  const validIds = new Set((sheets ?? []).map(sheet => sheet.id));
  for (const node of nearestFirst) {
    const ref = node.fitRef;
    if (ref && ref !== mainId && validIds.has(ref)) return {nodeId: node.id};
  }
  return null;
}

export default function ComposerSheet({
  mode = 'detail',
  tree,
  library,
  currentParams,
  onChangeTree,
  onSave,
  onClose,
  hideChrome = false,
  onPickTexture,
  onPickMask,
  onPickTextureMap,
  onPickOverlayImage,
  onPickLensDesign,
  catalog,
  onApplyTexture,
  onApplyMask,
  onApplyTextureMap,
  onApplyOverlayImage,
  onApplyLensDesign,
  onOpenCatalogImport,
  onRemoveCatalogEntry,
  userFinishes,
  onSaveFinish,
  onPromoteGroup,
  onLeafFit,
  userProducts,
  onCommitProductsAndTree,
  fitSheets,
  mainFitId = null,
  onSetFitRef,
  expertOverrides = {},
  onChangeExpertOverride,
  onResetExpertOverride,
  expertError,
}: Props) {
  const [saveProductDraft, setSaveProductDraft] = useState<{
    leafId: string;
    family: ProductFamily;
    sourceId?: string;
  } | null>(null);
  // UI 상태 — 트리는 불변 재구성돼도 노드 id가 유지되므로 id 기반으로 기억한다
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [swapId, setSwapId] = useState<string | null>(null);
  // 세부부위 룩 ⇄ — 열린 sub id ("아이라인룩만 갈아끼우기" 픽커)
  const [subSwapId, setSubSwapId] = useState<string | null>(null);
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [axis, setAxis] = useState<TabKey | null>(null);
  // 멀티유즈(Phase 2) — 대상 부위 픽커가 열린 잎 id
  const [multiUseFor, setMultiUseFor] = useState<string | null>(null);
  // 그룹핑(Phase 3) — 다중선택 모드 + 체크된 region id + 그룹 이름 초안
  const [selectMode, setSelectMode] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  // 그룹 승격(Phase 3) — "☆ 따로 저장" 이름 입력 중인 그룹 id
  const [promotingGroup, setPromotingGroup] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectLeaf = useCallback((leaf: ProductLeaf) => {
    setSelectedLeafId(leaf.id);
    if (!isDecoRegion(leaf.region) && !isLensRegion(leaf.region)) {
      // 상위 탭 = 제품·테크닉·핏(§5). 현재 선택 그룹이 이 부위에 없으면 첫 그룹으로.
      const available = groupsForRegion(leaf.region);
      setAxis(prev => (prev && available.includes(prev) ? prev : available[0] ?? null));
    }
  }, []);

  const addRegion = useCallback(
    (region: RegionKey) => {
      const root = tree ?? emptyFaceLook();
      // 같은 슬롯 그룹이 이미 있으면 그 안에 세부부위 룩(sub)으로 끼운다 — 눈 그룹이
      // 있는데 '아이라인 상'을 추가하면 새 그룹이 아니라 눈 그룹 안에(copy-on-write
      // dirty). 없을 때만 슬롯 이름의 새 그룹("눈 커스텀")을 만든다.
      const slot = SLOT_OF_REGION[region];
      const host = regionNodeOfSlot(root, slot);
      if (host) {
        const sub = newSubNode(region, currentParams);
        onChangeTree(addSubNode(root, host.id, sub));
        const leaf = firstLeafOf(sub);
        setExpanded(prev => {
          const next = new Set(prev);
          next.add(host.id);
          next.add(sub.id);
          return next;
        });
        if (leaf) selectLeaf(leaf);
      } else {
        const node = newRegionNode(region, currentParams);
        onChangeTree(addRegionNode(root, node));
        // 새 부위는 바로 펼치고 잎을 선택 — 만들자마자 편집
        const sub = node.kids[0];
        const leaf = firstLeafOf(node);
        setExpanded(prev => {
          const next = new Set(prev);
          next.add(node.id);
          if (sub && !isLeaf(sub)) next.add(sub.id);
          return next;
        });
        if (leaf) selectLeaf(leaf);
      }
      setPickerOpen(false);
    },
    [tree, currentParams, onChangeTree, selectLeaf],
  );

  const swapTo = useCallback(
    (regionNodeId: string, defId: string) => {
      if (!tree) return;
      const fresh = instantiate(library, defId);
      if (!fresh) return;
      onChangeTree(swapRegionNode(tree, regionNodeId, fresh));
      setSwapId(null);
      setExpanded(prev => new Set(prev).add(fresh.id));
    },
    [tree, library, onChangeTree],
  );

  // 멀티유즈(Phase 2) — 잎의 색·마감·농도를 대상 부위 새 룩으로 번역해 추가.
  // 원본 잎은 그대로 둔다(복제 개념). 대상 부위가 이미 트리에 있으면 append가
  // 아니라 그 region을 교체(swap) — 같은 브리지 필드라 append 시 컴파일
  // last-writer-wins로 기존 설정이 소실되기 때문("립색을 볼에" = 볼을 이 색으로).
  const applyMultiUse = useCallback(
    (leaf: ProductLeaf, target: RegionKey) => {
      if (!tree) return;
      const node = multiUseRegionNode(leaf, target, currentParams);
      if (!node) return;
      const existing = regionNodeWith(tree, target);
      onChangeTree(
        existing
          ? swapRegionNode(tree, existing.id, node)
          : addRegionNode(tree, node),
      );
      setExpanded(prev => new Set(prev).add(node.id));
      setMultiUseFor(null);
    },
    [tree, currentParams, onChangeTree],
  );

  // 그룹핑(Phase 3) — 다중선택 토글/그룹 생성
  const toggleSelect = useCallback((regionId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    setGroupName('');
  }, []);

  const makeGroup = useCallback(() => {
    if (!tree || selected.size < 2) return;
    onChangeTree(createGroup(tree, groupName, [...selected]));
    exitSelectMode();
  }, [tree, selected, groupName, onChangeTree, exitSelectMode]);

  // 저장된 그룹 번들 재사용 — 멤버 region 전체가 새 그룹으로 인스턴스화돼 트리에 추가
  const addBundle = useCallback(
    (defId: string) => {
      const root = tree ?? emptyFaceLook();
      onChangeTree(addGroupBundle(root, library, defId));
      setPickerOpen(false);
    },
    [tree, library, onChangeTree],
  );

  const selectedLeaf = (() => {
    if (!tree || !selectedLeafId) return null;
    const node = findNode(tree, selectedLeafId);
    return node && isLeaf(node) ? node : null;
  })();
  const saveLeaf = (() => {
    if (!tree || !saveProductDraft) return null;
    const node = findNode(tree, saveProductDraft.leafId);
    return node && isLeaf(node) ? node : null;
  })();
  const saveSource = saveLeaf?.productId
    ? findProduct(saveLeaf.productId, userProducts)
    : undefined;
  const saveResolved = saveLeaf
    ? saveSource
      ? {
          ...translateProduct(
            saveSource,
            saveLeaf.technique ?? {strength: 1},
            saveLeaf.region,
            saveLeaf.colorwayId,
          ),
          ...saveLeaf.params,
        }
      : saveLeaf.params
    : {};

  const decoFull = decoLeafCount(tree) >= MAX_OVERLAY_LAYERS;

  // 레이어(겹) 행 — 항상 세부부위 헤더 아래 들여쓰기 한 단. 세부부위 관리(＋겹·⇄·
  // 이름)는 헤더가 담당하고, 이 행은 순수 레이어(제형·농도·핏·삭제). soleLeaf=이
  // 세부부위의 유일한 겹 → 삭제·표시토글이 빈 sub를 남기지 않게 sub까지 함께 처리.
  const leafRow = (
    leaf: ProductLeaf,
    sub: LookNode,
    soleLeaf: boolean,
    li: number,
    total: number,
  ) => {
    const isSel = leaf.id === selectedLeafId;
    const rdef = REGION_MAP[leaf.region];
    // 유일 겹은 sub.visible도 함께 봐야 유령 행(켜 보이는데 렌더 안 됨) 방지.
    const shown = soleLeaf ? leaf.visible && sub.visible : leaf.visible;
    return (
      <TouchableOpacity
        key={leaf.id}
        style={[
          styles.row,
          styles.rowLeafNested, // 겹은 항상 세부부위 아래 들여쓰기 한 단
          !shown && styles.rowDim,
          isSel && styles.rowSel,
        ]}
        onPress={() => selectLeaf(leaf)}
      >
        <Text style={styles.rowName} numberOfLines={1}>
          {/* 겹 이름 = 제형/제품명(부위는 헤더 칩이 말함). 라벨=부위명이면 폴백. */}
          {leaf.label === rdef.label ? rdef.productName ?? '커스텀' : leaf.label}
          {leaf.dirty && <Text style={styles.dirtyStar}>*</Text>}
          {total > 1 && <Text style={styles.rowSub}>  {li + 1}/{total}겹</Text>}
        </Text>
        <Text style={styles.rowSub}>{Math.round(leafIntensity(leaf) * 100)}%</Text>
        {!isDecoRegion(leaf.region) && multiUseTargets(leaf.region).length > 0 && (
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={() =>
              setMultiUseFor(prev => (prev === leaf.id ? null : leaf.id))
            }
          >
            <Text style={[styles.rowBtnText, multiUseFor === leaf.id && styles.swapOn]}>
              ⋯
            </Text>
          </TouchableOpacity>
        )}
        {/* 이 겹 핏 조정(§5 A13) — fitTraits가 선언한 부위만 겹id 셀렉터로 승격. */}
        {onLeafFit && rdef.fitTraits && (
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={() => onLeafFit(leaf.id, leaf.region)}
          >
            <Text style={[styles.rowBtnText, { color: GOLD }]}>핏</Text>
          </TouchableOpacity>
        )}
        {/* 세부부위 관리(＋겹·⇄·삭제)는 헤더 담당 — 겹 행엔 없음. 유일 겹의 표시토글·
            삭제만 sub까지 함께 처리(빈 sub 방지). */}
        <TouchableOpacity
          style={styles.rowBtn}
          onPress={() => {
            if (!tree) return;
            if (soleLeaf) {
              onChangeTree(
                setNodeVisible(setNodeVisible(tree, leaf.id, !shown), sub.id, !shown),
              );
            } else {
              onChangeTree(setNodeVisible(tree, leaf.id, !leaf.visible));
            }
          }}
        >
          <Text style={styles.eyeText}>{shown ? '◉' : '○'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rowBtn}
          onPress={() =>
            tree && onChangeTree(removeNode(tree, soleLeaf ? sub.id : leaf.id))
          }
        >
          <Text style={styles.rowBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // 멀티유즈(Phase 2) — 잎 아래 대상 부위 픽커. 색·마감·농도만 번역해 새 부위 룩 추가.
  // 세부부위 룩 ⇄ 픽커 — 같은 세부부위의 라이브러리 sub 룩으로 교체("아이라인룩만
  // 갈아끼우기"). 슬롯 ⇄(regionDefsForSlot)의 sub 판.
  const renderSubSwap = (sub: LookNode, region: RegionKey) => {
    if (subSwapId !== sub.id) return null;
    const defs = subDefsForRegion(library, region);
    if (defs.length === 0) return null;
    return (
      <View style={styles.swapPanel}>
        <Text style={styles.swapTitle}>
          "{REGION_MAP[region].label}" 자리에 끼울 세부부위 룩
        </Text>
        <View style={styles.swapChips}>
          {defs.map(def => {
            const on = def.id === sub.ref;
            return (
              <TouchableOpacity
                key={def.id}
                style={[
                  styles.swapChip,
                  def.owner === 'user' && styles.swapChipMine,
                  on && styles.swapChipOn,
                ]}
                onPress={() => {
                  if (!tree) return;
                  const fresh = instantiate(library, def.id);
                  if (!fresh) return;
                  onChangeTree(swapSubNode(tree, sub.id, fresh));
                  setSubSwapId(null);
                }}
              >
                <Text
                  style={[styles.swapChipText, on && styles.swapChipTextOn]}
                  numberOfLines={1}
                >
                  {def.owner === 'user' ? '◈ ' : ''}
                  {def.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderMultiUse = (leaf: ProductLeaf) => {
    if (multiUseFor !== leaf.id) return null;
    const targets = multiUseTargets(leaf.region);
    return (
      <View key={`mu:${leaf.id}`} style={styles.multiUsePanel}>
        <Text style={styles.multiUseTitle}>
          "{REGION_MAP[leaf.region].label}" 색·마감·농도를 다른 부위에도
        </Text>
        <View style={styles.swapChips}>
          {targets.map(t => (
            <TouchableOpacity
              key={t}
              style={styles.multiUseChip}
              onPress={() => applyMultiUse(leaf, t)}
            >
              <Text style={styles.multiUseChipText} numberOfLines={1}>
                {REGION_MAP[t].emoji} {REGION_MAP[t].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.multiUseHint}>
          모양·핏은 대상 부위 기본값 · 원본은 그대로 유지돼요
        </Text>
      </View>
    );
  };

  const renderFitException = (
    displayNodeId: string,
    source: FitExceptionSource | null,
  ) => {
    if (!source || !onSetFitRef) return null;
    const inherited = source.nodeId !== displayNodeId;
    return (
      <View style={styles.exceptionPill}>
        <Text style={styles.fitBadge}>이 룩 예외</Text>
        <TouchableOpacity
          accessibilityLabel={inherited ? '공통 룩 예외 해제' : '룩 예외 해제'}
          accessibilityHint={inherited
            ? '상위 룩을 함께 쓰는 다른 부위에도 적용됩니다'
            : undefined}
          onPress={() => onSetFitRef(source.nodeId, null)}>
          <Text style={styles.exceptionClear}>{inherited ? '공통 해제' : '해제'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // 부위룩 섹션 — 그룹 안/밖 어디서든 같은 렌더(그룹은 표시 래퍼일 뿐).
  const renderRegion = (region: LookNode) => {
    const collapsed = expanded.has(`sec:${region.id}`);
    const checked = selected.has(region.id);
    const regionException = fitExceptionSource(
      tree ? [region, tree] : [region],
      fitSheets,
      mainFitId,
    );
    // 이미 다른 그룹에 속한 region은 새 그룹 다중선택 대상에서 제외(다중 소속 금지).
    const alreadyGrouped = !!tree && !!groupOfRegion(tree, region.id);
    return (
      <View key={region.id}>
        {/* 슬롯 + 부위룩 섹션 헤더 (얇게 — 이름·⇄·dirty*·켬끔·삭제) */}
        <View style={[styles.sectionHeader, !region.visible && styles.rowDim]}>
          {selectMode && !alreadyGrouped && (
            <TouchableOpacity
              style={styles.checkBtn}
              onPress={() => toggleSelect(region.id)}
            >
              <Text style={[styles.checkText, checked && styles.checkTextOn]}>
                {checked ? '◼' : '◻'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.sectionMain}
            onPress={() =>
              selectMode && !alreadyGrouped
                ? toggleSelect(region.id)
                : toggleExpand(`sec:${region.id}`)
            }
          >
            {/* 접기 캐럿 — 그룹(슬롯) 통째 접기/펼치기. ▼=펼침 ▶=접힘. */}
            <Text style={styles.groupCaret}>{collapsed ? '▶' : '▼'}</Text>
            <Text style={styles.slotLabel}>{SLOT_LABEL[region.slot]}</Text>
            <Text style={styles.sectionName} numberOfLines={1}>
              {region.name}
              {region.dirty && <Text style={styles.dirtyStar}>*</Text>}
            </Text>
            {region.owner === 'user' && <Text style={styles.ownBadge}>내 룩</Text>}
          </TouchableOpacity>
          {renderFitException(region.id, regionException)}
          {/* ＋겹은 그룹(슬롯) 헤더에서 제거(사용자 결정) — 겹은 각 세부부위 행의
              ＋겹으로 쌓는다(층위 명확). */}
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={() => setSwapId(prev => (prev === region.id ? null : region.id))}
          >
            <Text style={[styles.rowBtnText, swapId === region.id && styles.swapOn]}>
              ⇄
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={() =>
              tree && onChangeTree(setNodeVisible(tree, region.id, !region.visible))
            }
          >
            <Text style={styles.eyeText}>{region.visible ? '◉' : '○'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={() => tree && onChangeTree(removeNode(tree, region.id))}
          >
            <Text style={styles.rowBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ⇄ 교체 패널 — 같은 슬롯의 라이브러리 region 룩들 */}
        {swapId === region.id && (
          <View style={styles.swapPanel}>
            <Text style={styles.swapTitle}>
              "{SLOT_LABEL[region.slot]}" 자리에 끼울 룩 — 라이브러리
            </Text>
            <View style={styles.swapChips}>
              {regionDefsForSlot(library, region.slot).map(def => {
                const on = def.id === region.ref;
                return (
                  <TouchableOpacity
                    key={def.id}
                    style={[
                      styles.swapChip,
                      def.owner === 'user' && styles.swapChipMine,
                      on && styles.swapChipOn,
                    ]}
                    onPress={() => swapTo(region.id, def.id)}
                  >
                    <Text
                      style={[styles.swapChipText, on && styles.swapChipTextOn]}
                      numberOfLines={1}
                    >
                      {def.owner === 'user' ? '◈ ' : ''}
                      {def.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* 세부부위 룩(sub) 3단 — 슬롯 그룹 > 세부부위 룩 > 겹(분류체계 4층과 1:1).
            겹 개수와 무관하게 항상 [세부부위 헤더] + [레이어 행(들여쓰기)] — 1겹도
            레이어층을 표현(사용자 결정). 헤더가 세부부위 관리(＋겹·⇄·삭제), 레이어
            행은 순수 겹. 표시는 역순(하단=먼저 바른 층, R4/A1) — 데이터 순서 무변경. */}
        {!collapsed &&
          [...region.kids].reverse().map(sub => {
            if (isLeaf(sub)) return null;
            const leaves = sub.kids.filter(isLeaf);
            if (leaves.length === 0) return null;
            const rdef = REGION_MAP[leaves[0].region];
            const subException = fitExceptionSource(
              tree ? [sub, region, tree] : [sub, region],
              fitSheets,
              mainFitId,
            );
            return (
              <View key={sub.id}>
                <View
                  style={[styles.row, styles.rowStack, !sub.visible && styles.rowDim]}
                >
                  {/* 세부부위 칩 — 칩=부위, 이름=룩(부위 라벨 걷어낸 표시명). */}
                  <View style={styles.regionChip}>
                    <Text style={styles.regionChipText} numberOfLines={1}>
                      {rdef.label}
                    </Text>
                  </View>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {subDisplayName(sub, rdef)}
                    {sub.dirty && <Text style={styles.dirtyStar}>*</Text>}
                  </Text>
                  {renderFitException(sub.id, subException)}
                  {leaves.length > 1 && (
                    <Text style={styles.countBadge}>×{leaves.length}겹</Text>
                  )}
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() => tree && onChangeTree(stackLeaf(tree, sub.id))}
                  >
                    <Text style={styles.rowBtnText}>＋겹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() =>
                      setSubSwapId(prev => (prev === sub.id ? null : sub.id))
                    }
                  >
                    <Text
                      style={[styles.rowBtnText, subSwapId === sub.id && styles.swapOn]}
                    >
                      ⇄
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() =>
                      tree && onChangeTree(setNodeVisible(tree, sub.id, !sub.visible))
                    }
                  >
                    <Text style={styles.eyeText}>{sub.visible ? '◉' : '○'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() => tree && onChangeTree(removeNode(tree, sub.id))}
                  >
                    <Text style={styles.rowBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {renderSubSwap(sub, rdef.key)}
                {/* 겹 번호(li)는 바르는 순서 기준 유지 — 표시만 역순(1겹이 맨 아래) */}
                {[...leaves].reverse().map((leaf, ri) => (
                  <View key={leaf.id}>
                    {leafRow(
                      leaf,
                      sub,
                      leaves.length === 1,
                      leaves.length - 1 - ri,
                      leaves.length,
                    )}
                    {renderMultiUse(leaf)}
                  </View>
                ))}
              </View>
            );
          })}
      </View>
    );
  };

  // 그룹 헤더 — 통째 켬/끔·삭제·이름 변경·라이브러리 승격. 멤버 region은 아래에 렌더.
  const renderGroupHeader = (group: LookGroup) => {
    // "☆ 따로 저장" 이름 입력 — 재사용 번들로 등록(App이 라이브러리 영속화)
    if (promotingGroup === group.id) {
      return (
        <View style={styles.groupHeader}>
          <TextInput
            style={styles.groupNameInput}
            defaultValue={group.name}
            autoFocus
            placeholder="세트 이름 (라이브러리에 저장)"
            placeholderTextColor="rgba(255,255,255,0.4)"
            onSubmitEditing={e => {
              onPromoteGroup(group.id, e.nativeEvent.text);
              setPromotingGroup(null);
            }}
            onBlur={() => setPromotingGroup(null)}
          />
        </View>
      );
    }
    return (
      <View style={styles.groupHeader}>
        {renamingGroup === group.id ? (
          <TextInput
            style={styles.groupNameInput}
            defaultValue={group.name}
            autoFocus
            placeholder="그룹 이름"
            placeholderTextColor="rgba(255,255,255,0.4)"
            onSubmitEditing={e => {
              if (tree) onChangeTree(renameGroup(tree, group.id, e.nativeEvent.text));
              setRenamingGroup(null);
            }}
            onBlur={() => setRenamingGroup(null)}
          />
        ) : (
          <TouchableOpacity
            style={styles.groupNameBtn}
            onPress={() => setRenamingGroup(group.id)}
          >
            <Text style={styles.groupName} numberOfLines={1}>
              ◆ {group.name}
              {group.ref ? ' ★' : ''}
            </Text>
            <Text style={styles.groupCount}>{group.memberIds.length}부위</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.rowBtn}
          onPress={() => setPromotingGroup(group.id)}
        >
          <Text style={styles.rowBtnText}>{group.ref ? '★ 저장' : '☆ 저장'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rowBtn}
          onPress={() => tree && onChangeTree(setGroupVisible(tree, group.id, !group.visible))}
        >
          <Text style={styles.eyeText}>{group.visible ? '◉' : '○'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rowBtn}
          onPress={() => tree && onChangeTree(removeGroup(tree, group.id))}
        >
          <Text style={styles.rowBtnText}>해제</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // 헤더 — 룩 트리 · 루트 이름(dirty*) + 최소화/그룹/저장/닫기
  const headerBar = (
    <View style={styles.header}>
      {!hideChrome && (
        <TouchableOpacity
          style={styles.collapseBtn}
          onPress={() => setMinimized(m => !m)}>
          <Text style={styles.collapseBtnText}>{minimized ? '⌃' : '⌄'}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        룩 트리 — {tree ? dn(tree) : '빈 조합'}
      </Text>
      {!pickerOpen && tree && tree.kids.some(c => !isLeaf(c)) && (
        <TouchableOpacity
          style={[styles.headerBtn, selectMode && styles.headerBtnOn]}
          onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        >
          <Text style={styles.headerBtnText}>{selectMode ? '그룹취소' : '그룹'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.headerBtn, styles.saveBtn]} onPress={onSave}>
        <Text style={styles.saveBtnText}>저장</Text>
      </TouchableOpacity>
      {!hideChrome && (
        <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
          <Text style={styles.headerBtnText}>닫기</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // 완전 최소화 — 헤더 한 줄만 남기고 본문 숨겨 카메라 화면을 꽉 채운다.
  // 통합 헤더(hideChrome) 모드에선 최소화는 App이 담당하므로 자체 최소화는 무시.
  if (!hideChrome && minimized) {
    return <View style={styles.sheet}>{headerBar}</View>;
  }

  return (
    <View style={styles.sheet}>
      {headerBar}

      {pickerOpen ? (
        // 부위 선택 — 새 부위 룩 (목업 화면 02b 픽커)
        <ScrollView style={styles.pickerScroll}>
          <TouchableOpacity style={styles.pickerBack} onPress={() => setPickerOpen(false)}>
            <Text style={styles.headerBtnText}>← 트리로</Text>
          </TouchableOpacity>
          {/* 저장된 그룹 세트(#23 Phase 3) — 멤버 부위 전체를 한 번에 추가 */}
          {(() => {
            const bundles = groupBundleDefs(library);
            if (bundles.length === 0) return null;
            return (
              <View>
                <Text style={styles.groupTitle}>저장된 그룹 세트</Text>
                <View style={styles.regionGrid}>
                  {bundles.map(def => (
                    <TouchableOpacity
                      key={def.id}
                      style={styles.regionCell}
                      onPress={() => addBundle(def.id)}
                    >
                      <Text style={styles.regionEmoji}>◆</Text>
                      <Text style={styles.regionLabel} numberOfLines={1}>
                        {def.name.replace(/^★\s*/, '')}
                        {` ${(def.kids as string[]).length}부위`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })()}
          {REGION_GROUPS.map(group => (
            <View key={group.title}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.regionGrid}>
                {group.regions.map(def => {
                  const full = isDecoRegion(def.key) && decoFull;
                  return (
                    <TouchableOpacity
                      key={def.key}
                      style={[styles.regionCell, full && styles.regionCellOff]}
                      disabled={full}
                      onPress={() => addRegion(def.key)}
                    >
                      <Text style={styles.regionEmoji}>{def.emoji}</Text>
                      <Text style={styles.regionLabel}>
                        {def.label}
                        {isDecoRegion(def.key)
                          ? ` ${decoLeafCount(tree)}/${MAX_OVERLAY_LAYERS}`
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <>
          {/* 다중선택 툴바 — 그룹 만들기(2개 이상 체크 시 활성) */}
          {selectMode && (
            <View style={styles.groupBar}>
              <TextInput
                style={styles.groupBarInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="그룹 이름 (예: 내 포인트 세트)"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
              <TouchableOpacity
                style={[styles.groupMakeBtn, selected.size < 2 && styles.groupMakeBtnOff]}
                disabled={selected.size < 2}
                onPress={makeGroup}
              >
                <Text style={styles.groupMakeText}>그룹 만들기 ({selected.size})</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 룩 트리 아코디언 — 그룹(가상 컨테이너) 먼저, 그다음 그룹 밖 부위룩 */}
          <ScrollView style={styles.treeScroll}>
            {!tree || tree.kids.length === 0 ? (
              <Text style={styles.emptyText}>
                조합이 비어 있어요 — 홈에서 룩을 고르거나 ＋부위 룩 추가로 시작
              </Text>
            ) : (
              (() => {
                const regionNodes = tree.kids.filter(
                  (c): c is LookNode => !isLeaf(c),
                );
                const byId = new Map(regionNodes.map(r => [r.id, r]));
                const groups = tree.groups ?? [];
                // 표시는 전부 역순 — 하단=먼저 바른 층(분류체계 정의 R4/A1), 데이터 무변경.
                return (
                  <>
                    {[...groups].reverse().map(group => (
                      <View key={group.id} style={styles.groupBox}>
                        {renderGroupHeader(group)}
                        {[...group.memberIds]
                          .reverse()
                          .map(id => byId.get(id))
                          .filter((r): r is LookNode => !!r)
                          .map(renderRegion)}
                      </View>
                    ))}
                    {regionNodes
                      .filter(r => !groupOfRegion(tree, r.id))
                      .reverse()
                      .map(renderRegion)}
                  </>
                );
              })()
            )}

            <Text style={styles.hint}>
              아래=먼저 바른 층 · 행 탭=펼치기 · ⇄=교체 · ⋯=다른 부위에 쓰기 · 그룹=여러 부위 묶기
            </Text>
          </ScrollView>

          {/* ＋부위 룩 추가 — 트리 스크롤 밖 고정 행(플로팅). 트리를 스크롤해도
              항상 스크롤 영역 바로 아래 같은 위치에 뜬다(flexShrink:0로 축소 방지). */}
          <TouchableOpacity
            style={[styles.addRow, styles.addRowFloating]}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.addRowText}>＋ 부위 룩 추가</Text>
          </TouchableOpacity>

          {/* 축 편집기 — 잎(제품 적용 1회)의 6축. 경로 표시줄이 겹 위치를 보여준다 */}
          {selectedLeaf &&
            tree &&
            !isDecoRegion(selectedLeaf.region) &&
            !isLensRegion(selectedLeaf.region) && (
            <AxisEditor
              mode={mode}
              leaf={selectedLeaf}
              path={pathToLeaf(tree, selectedLeaf.id)}
              axis={axis}
              onAxis={setAxis}
              onPatch={patch => {
                // 눈썹 슬롯 공통 축(모양·굵기 프로파일·상하 커버·아치)은 전 눈썹 잎에 브로드캐스트,
                // 나머지(색·농도 등 제품 고유)는 선택된 잎에만. 비눈썹 부위는 shared 빔.
                const shared: Partial<FilterParams> = {};
                const own: Partial<FilterParams> = {};
                for (const [k, v] of Object.entries(patch)) {
                  if (BROW_SHARED_KEYS.includes(k as keyof FilterParams)) {
                    (shared as Record<string, unknown>)[k] = v;
                  } else {
                    (own as Record<string, unknown>)[k] = v;
                  }
                }
                let next = tree;
                if (Object.keys(own).length > 0) {
                  next = updateLeaf(next, selectedLeaf.id, { params: own });
                }
                if (Object.keys(shared).length > 0) {
                  next = updateBrowSharedAxis(next, shared);
                }
                onChangeTree(next);
              }}
              onIdentity={patch =>
                onChangeTree(updateLeaf(tree, selectedLeaf.id, patch))
              }
              onSelectProduct={(product, colorwayId, clearKeys) =>
                onChangeTree(selectLeafProduct(tree, selectedLeaf.id, {
                  productId: product?.id,
                  colorwayId,
                  technique: selectedLeaf.technique ?? {strength: 0.8},
                }, clearKeys))
              }
              onOpenSaveProduct={(family, source) => setSaveProductDraft({
                leafId: selectedLeaf.id,
                family,
                sourceId: source?.id,
              })}
              canSaveProduct={!!onCommitProductsAndTree}
              userProducts={userProducts}
              onPickTexture={action => onPickTexture(action, selectedLeaf.id)}
              onPickMask={region => onPickMask(region, selectedLeaf.id)}
              onPickTextureMap={region => onPickTextureMap(region, selectedLeaf.id)}
              catalog={catalog}
              onApplyTexture={(action, uri) =>
                onApplyTexture(action, selectedLeaf.id, uri)
              }
              onApplyMask={(region, uri) => onApplyMask(region, selectedLeaf.id, uri)}
              onApplyTextureMap={(region, uri) =>
                onApplyTextureMap(region, selectedLeaf.id, uri)
              }
              onOpenCatalogImport={onOpenCatalogImport}
              onRemoveCatalogEntry={onRemoveCatalogEntry}
              userFinishes={userFinishes}
              onSaveFinish={onSaveFinish}
              expertOverrides={expertOverrides}
              onChangeExpertOverride={onChangeExpertOverride}
              onResetExpertOverride={onResetExpertOverride}
              expertError={expertError}
            />
          )}
          {selectedLeaf && tree && isDecoRegion(selectedLeaf.region) && selectedLeaf.overlay && (
            <View>
              <Text style={styles.pathBar} numberOfLines={1}>
                {pathToLeaf(tree, selectedLeaf.id)}
              </Text>
              <DecoEditor
                overlay={selectedLeaf.overlay}
                decoCount={decoLeafCount(tree)}
                onPatch={patch =>
                  onChangeTree(
                    updateLeaf(tree, selectedLeaf.id, {
                      overlay: { ...selectedLeaf.overlay!, ...patch },
                    }),
                  )
                }
                onMirror={() => onChangeTree(mirrorLeaf(tree, selectedLeaf.id))}
                onPickImage={() => onPickOverlayImage(selectedLeaf.id)}
                catalog={catalog}
                onApplyImage={uri => onApplyOverlayImage(selectedLeaf.id, uri)}
                onOpenCatalogImport={onOpenCatalogImport}
                onRemoveCatalogEntry={onRemoveCatalogEntry}
              />
            </View>
          )}
          {selectedLeaf &&
            tree &&
            isLensRegion(selectedLeaf.region) &&
            selectedLeaf.lens && (
              <View>
                <Text style={styles.pathBar} numberOfLines={1}>
                  {pathToLeaf(tree, selectedLeaf.id)}
                </Text>
                <LensEditor
                  lens={selectedLeaf.lens}
                  onPatch={patch =>
                    onChangeTree(
                      updateLeaf(tree, selectedLeaf.id, { lens: patch }),
                    )
                  }
                  onPickDesign={() => onPickLensDesign(selectedLeaf.id)}
                  catalog={catalog}
                  onApplyDesign={uri => onApplyLensDesign(selectedLeaf.id, uri)}
                  onOpenCatalogImport={onOpenCatalogImport}
                  onRemoveCatalogEntry={onRemoveCatalogEntry}
                />
              </View>
            )}
          {saveProductDraft && saveLeaf && tree && onCommitProductsAndTree && (
            <SaveAsProductSheet
              leaf={saveLeaf}
              initialFamily={saveProductDraft.family}
              userProducts={userProducts ?? []}
              compiledParams={saveResolved}
              source={saveSource}
              onCancel={() => setSaveProductDraft(null)}
              onSave={({mode: saveMode, name, family, targetProductId, shadeName}) => {
                const currentSource = saveSource;
                const resolved = saveResolved;
                if (saveMode === 'add') {
                  const target = (userProducts ?? []).find(product =>
                    product.id === targetProductId && product.family === family);
                  const colorControl = (REGION_MAP[saveLeaf.region].axes.color ?? [])
                    .find(control => control.type === 'swatches');
                  if (!target || !colorControl || colorControl.type !== 'swatches') return;
                  const color = resolved[colorControl.key];
                  if (typeof color !== 'string') return;
                  const updated = addProductColorway(target, {name: shadeName, color});
                  const colorwayId = updated.colorways?.at(-1)?.id;
                  const products = (userProducts ?? []).map(product =>
                    product.id === updated.id ? updated : product);
                  const retained = physicalOverridesForRoundTrip(
                    saveLeaf,
                    resolved,
                    updated,
                    colorwayId,
                  );
                  const nextTree = selectLeafProduct(tree, saveLeaf.id, {
                    productId: updated.id,
                    colorwayId,
                    technique: saveLeaf.technique ?? {strength: 1},
                  }, physicalKeysForRegion(saveLeaf.region), retained);
                  onCommitProductsAndTree(products, nextTree);
                } else {
                  const product = productFromLeafPhysicals(
                    saveLeaf,
                    resolved,
                    family,
                    name,
                    currentSource,
                  );
                  const retained = physicalOverridesForRoundTrip(saveLeaf, resolved, product);
                  const nextTree = selectLeafProduct(tree, saveLeaf.id, {
                    productId: product.id,
                    colorwayId: product.defaultColorwayId,
                    technique: saveLeaf.technique ?? {strength: 1},
                  }, physicalKeysForRegion(saveLeaf.region), retained);
                  onCommitProductsAndTree([...(userProducts ?? []), product], nextTree);
                }
                setSaveProductDraft(null);
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

type SaveProductMode = 'new' | 'add';

/** 정본 §3.2 — 이름·제품군·신규/컬렉션 추가를 확정한 뒤에만 원자 저장한다. */
function SaveAsProductSheet({
  leaf,
  initialFamily,
  userProducts,
  compiledParams,
  source,
  onCancel,
  onSave,
}: {
  leaf: ProductLeaf;
  initialFamily: ProductFamily;
  userProducts: ProductDef[];
  compiledParams: Partial<FilterParams>;
  source?: ProductDef;
  onCancel: () => void;
  onSave: (draft: {
    mode: SaveProductMode;
    name: string;
    family: ProductFamily;
    targetProductId?: string;
    shadeName: string;
  }) => void;
}) {
  const ranked = familiesRankedForRegion(leaf.region);
  const inferred: ProductFamily = leaf.region === 'lip' && leaf.params.lipTexture === 2
    ? 'lipTint'
    : initialFamily;
  const [name, setName] = useState(`${REGION_MAP[leaf.region].label} 제품`);
  const [family, setFamily] = useState<ProductFamily>(inferred);
  const [mode, setMode] = useState<SaveProductMode>('new');
  const targets = userProducts.filter(product => product.family === family && product.base);
  const [targetProductId, setTargetProductId] = useState<string | undefined>(
    targets[0]?.id,
  );
  const [shadeName, setShadeName] = useState('새 색상');
  const families = [...ranked.fit, ...ranked.others];
  const colorCollectionApplicable = FAMILY_TEMPLATES[family].base != null;
  const canSave = mode === 'new'
    ? name.trim().length > 0
    : colorCollectionApplicable
      && !!targets.find(product => product.id === targetProductId)
      && shadeName.trim().length > 0;
  const preview = productFromLeafPhysicals(
    leaf,
    compiledParams,
    family,
    name || '미리보기',
    source,
    'usr:prod:preview',
  );
  const hasFinishLadder = (REGION_MAP[leaf.region].axes.finish ?? [])
    .some(control => control.type === 'finish');
  const hasSegmentsFinish = (REGION_MAP[leaf.region].axes.finish ?? [])
    .some(control => control.type === 'segments');
  const capturedChannels = [
    preview.base && '색·농도',
    preview.pearl && '펄',
    preview.glitter?.length && '글리터',
    preview.neon && '네온',
    preview.texture !== undefined && '제형',
    hasFinishLadder && '마감',
    preview.finishDetail && '마감 세부',
    preview.material && '재질',
    preview.particleLayer && '입자',
  ].filter(Boolean).join(', ');
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.saveProductBackdrop}>
        <View style={styles.saveProductSheet}>
          <Text style={styles.axisSectionLabel}>현재 조합을 제품으로 저장</Text>
          <TextInput
            testID="save-product-name"
            style={styles.saveProductInput}
            value={name}
            maxLength={24}
            onChangeText={setName}
            placeholder="제품 이름"
            placeholderTextColor={TEXT_HINT}
          />
          <Text style={styles.noteText}>제품군 · {FAMILY_TEMPLATES[family].label}</Text>
          {mode === 'new' ? (
            <>
              <Text style={styles.noteText}>
                담기는 채널 · {capturedChannels || '없음'}
              </Text>
              {hasSegmentsFinish && (
                <Text style={styles.noteText}>
                  이 부위의 segments형 마감은 제품에 담기지 않습니다.
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.noteText}>추가되는 항목 · 색상, 셰이드 이름</Text>
          )}
          {!colorCollectionApplicable && (
            <Text style={styles.noteText}>
              이 제품군은 색상 컬렉션을 사용하지 않아 색상 추가 모드를 선택할 수 없습니다.
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.identityRow}>
              {families.map(candidate => (
                <TouchableOpacity
                  key={candidate}
                  testID={`save-family-${candidate}`}
                  accessibilityRole="button"
                  accessibilityState={{selected: family === candidate}}
                  style={[styles.identityChip, family === candidate && styles.identityChipOn]}
                  onPress={() => {
                    setFamily(candidate);
                    if (!FAMILY_TEMPLATES[candidate].base) setMode('new');
                    setTargetProductId(userProducts.find(
                      p => p.family === candidate && p.base,
                    )?.id);
                  }}
                >
                  <Text style={styles.identityChipText}>{FAMILY_TEMPLATES[candidate].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={styles.identityRow}>
            <TouchableOpacity
              testID="save-mode-new"
              accessibilityRole="button"
              accessibilityState={{selected: mode === 'new'}}
              style={[styles.identityChip, mode === 'new' && styles.identityChipOn]}
              onPress={() => setMode('new')}
            >
              <Text style={styles.identityChipText}>새 제품</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="save-mode-add"
              accessibilityRole="button"
              accessibilityState={{
                selected: mode === 'add',
                disabled: !colorCollectionApplicable,
              }}
              disabled={!colorCollectionApplicable}
              style={[styles.identityChip, mode === 'add' && styles.identityChipOn]}
              onPress={() => setMode('add')}
            >
              <Text style={styles.identityChipText}>기존 내 컬렉션에 색상으로 추가</Text>
            </TouchableOpacity>
          </View>
          {mode === 'add' && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.identityRow}>
                  {targets.map(product => (
                    <TouchableOpacity
                      key={product.id}
                      testID={`save-target-${product.id}`}
                      accessibilityRole="button"
                      accessibilityState={{selected: targetProductId === product.id}}
                      style={[
                        styles.identityChip,
                        targetProductId === product.id && styles.identityChipOn,
                      ]}
                      onPress={() => setTargetProductId(product.id)}
                    >
                      <Text style={styles.identityChipText}>{product.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TextInput
                testID="save-shade-name"
                style={styles.saveProductInput}
                value={shadeName}
                maxLength={24}
                onChangeText={setShadeName}
                placeholder="셰이드 이름"
                placeholderTextColor={TEXT_HINT}
              />
            </>
          )}
          <View style={styles.identityRow}>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.identityChip}
              onPress={onCancel}
            >
              <Text style={styles.identityChipText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="save-product-confirm"
              accessibilityRole="button"
              accessibilityState={{disabled: !canSave}}
              style={[styles.identityChip, canSave && styles.identityChipOn]}
              disabled={!canSave}
              onPress={() => onSave({
                mode,
                name: name.trim(),
                family,
                targetProductId,
                shadeName: shadeName.trim(),
              })}
            >
              <Text style={styles.identityChipText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// 카탈로그 썸네일 스트립(§16) — 컨트롤별 kind+region 항목을 가로 목록으로. 탭=apply-by-uri
// (사진 라이브러리 없이 uri로 바로 적용). 우상단 "붙여넣기"로 매니페스트 임포트 모달 진입.
function CatalogStrip({
  entries,
  onPick,
  onImport,
  onRemove,
  emptyHint,
}: {
  entries: AssetCatalogEntry[];
  onPick: (uri: string) => void;
  onImport: () => void;
  /** 롱프레스→확인 후 항목 삭제. 없으면 삭제 어포던스 비활성. */
  onRemove?: (id: string) => void;
  emptyHint: string;
}) {
  const confirmRemove = useCallback(
    (e: AssetCatalogEntry) => {
      if (!onRemove) return;
      Alert.alert(
        '카탈로그에서 삭제',
        `"${e.name}"을(를) 카탈로그에서 지울까요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: () => onRemove(e.id) },
        ],
      );
    },
    [onRemove],
  );
  return (
    <View style={styles.catalogStrip}>
      <View style={styles.catalogStripHead}>
        <Text style={styles.catalogStripTitle}>카탈로그에서</Text>
        <TouchableOpacity onPress={onImport}>
          <Text style={styles.catalogImportLink}>＋ 붙여넣기 임포트</Text>
        </TouchableOpacity>
      </View>
      {entries.length === 0 ? (
        <Text style={styles.catalogEmpty}>{emptyHint}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catalogRow}
        >
          {entries.map(e => (
            <TouchableOpacity
              key={e.id}
              style={styles.catalogItem}
              onPress={() => onPick(e.uri)}
              onLongPress={onRemove ? () => confirmRemove(e) : undefined}
            >
              {/* 번들 항목은 uri가 streaming:…(네이티브 전용)이라 RN Image로 못
                  읽는다 — 렌더 가능한 스킴(data:/file:/http(s):…)일 때만 <Image>,
                  아니면 깨진 이미지 대신 이름 타일. apply(탭)은 그대로 uri로 동작. */}
              {isRenderableThumb(e.thumbnail ?? e.uri) ? (
                <Image
                  source={{ uri: e.thumbnail ?? e.uri }}
                  style={styles.catalogThumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.catalogThumb, styles.catalogThumbFallback]}>
                  <Text style={styles.catalogThumbFallbackText} numberOfLines={3}>
                    {e.name}
                  </Text>
                </View>
              )}
              <Text style={styles.catalogItemName} numberOfLines={1}>
                {e.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {onRemove && entries.length > 0 && (
        <Text style={styles.catalogRemoveHint}>길게 눌러 삭제</Text>
      )}
    </View>
  );
}

function AxisEditor({
  mode,
  leaf,
  path,
  axis,
  onAxis,
  onPatch,
  onIdentity,
  onSelectProduct,
  onOpenSaveProduct,
  canSaveProduct,
  userProducts,
  onPickTexture,
  onPickMask,
  onPickTextureMap,
  catalog,
  onApplyTexture,
  onApplyMask,
  onApplyTextureMap,
  onOpenCatalogImport,
  onRemoveCatalogEntry,
  userFinishes,
  onSaveFinish,
  expertOverrides,
  onChangeExpertOverride,
  onResetExpertOverride,
  expertError,
}: {
  mode: 'detail' | 'expert';
  leaf: ProductLeaf;
  path: string | null;
  axis: TabKey | null;
  onAxis: (a: TabKey) => void;
  onPatch: (patch: Partial<FilterParams>) => void;
  /** 잎 정체성(§5) 패치 — 제품 참조(A12)·역할 태그(A13). params와 별개 잎 필드. */
  onIdentity: (patch: {
    role?: string | null;
    productId?: string | null;
    colorwayId?: string | null;
    technique?: { strength: number };
  }) => void;
  onSelectProduct: (
    product: ProductDef | undefined,
    colorwayId: string | undefined,
    clearKeys: readonly (keyof FilterParams)[],
  ) => void;
  onOpenSaveProduct: (family: ProductFamily, source?: ProductDef) => void;
  canSaveProduct: boolean;
  userProducts?: ProductDef[];
  onPickTexture: (action: TextureAction) => void;
  onPickMask: (region: MaskRegion) => void;
  onPickTextureMap: (region: TextureMapRegion) => void;
  catalog: CatalogManifest;
  onApplyTexture: (action: TextureAction, uri: string) => void;
  onApplyMask: (region: MaskRegion, uri: string) => void;
  onApplyTextureMap: (region: TextureMapRegion, uri: string) => void;
  onOpenCatalogImport: () => void;
  onRemoveCatalogEntry?: (id: string) => void;
  userFinishes: UserFinish[];
  onSaveFinish: (name: string, bundle: FinishBundle) => void;
  expertOverrides: ExpertOverrides;
  onChangeExpertOverride?: (key: ExpertParamKey, value: number) => void;
  onResetExpertOverride?: (key: ExpertParamKey) => void;
  expertError?: string | null;
}) {
  const def = REGION_MAP[leaf.region];
  // 상위 탭 = 제품·테크닉·핏(§5). 각 그룹 아래 축 섹션이 세로로 들어간다.
  const regionParams = paramsForRegion(leaf.region);
  const detailParams = regionParams.filter(param => param.tier === 'detail');
  const available: TabKey[] = [
    ...groupsForRegion(leaf.region),
    ...(mode === 'expert' && regionParams.length > 0
      ? ['expert' as const]
      : []),
  ];
  const active = axis && available.includes(axis) ? axis : available[0];
  // 제품 탭의 제품군 선택 — 기본: 현재 제품의 제품군 → 없으면 첫 적합 제품군.
  // 잎이 바뀌면 리셋(leafId 짝으로 저장).
  const [famSel, setFamSel] = useState<{leafId: string; fam: ProductFamily} | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState<{leafId: string; open: boolean} | null>(null);
  const detailsExpanded = detailOpen?.leafId === leaf.id
    ? detailOpen.open
    : false;
  const referencedProduct = leaf.productId ? findProduct(leaf.productId, userProducts) : undefined;
  const referencedPhysicals = referencedProduct
    ? translateProduct(
        referencedProduct,
        leaf.technique ?? {strength: 1},
        leaf.region,
        leaf.colorwayId,
      )
    : {};
  const physicalModified = physicalKeysForRegion(leaf.region).some(key => {
    const override = leaf.params[key];
    if (override === undefined) return false;
    if (!referencedProduct) return true;
    const baseline = referencedPhysicals[key];
    return typeof override === 'number' && typeof baseline === 'number'
      ? Math.abs(override - baseline) > 1e-8
      : override !== baseline;
  });
  if (!active) return null;

  // 축 컨트롤 섹션 — 라벨(축 이름) + 그 축의 컨트롤들. 그룹 본문 조립에 공용.
  const axisSection = (a: AxisKey, controls: ComposerControl[]) => {
    const presentation =
      a === 'texture' || a === 'finish' ? def.axisPresentation[a] : undefined;
    if (controls.length === 0 || presentation === 'hidden') return null;
    return (
      <View key={a} style={styles.axisSection}>
        <Text style={styles.axisSectionLabel}>{AXIS_LABELS[a]}</Text>
        {controls.map((control, i) => {
          // 연속된 동일 group 묶음 앞에만 소제목 한 줄. group 미지정은 현행(소제목 없음).
          const showGroup =
            control.group != null && control.group !== controls[i - 1]?.group;
          return (
            <React.Fragment key={i}>
              {showGroup && (
                <Text style={styles.axisGroupLabel}>{control.group}</Text>
              )}
              <ControlView
                control={control}
                presentation={presentation}
                axisLabel={AXIS_LABELS[a]}
                params={leaf.params}
                onPatch={onPatch}
                onPickTexture={onPickTexture}
                onPickMask={onPickMask}
                onPickTextureMap={onPickTextureMap}
                catalog={catalog}
                onApplyTexture={onApplyTexture}
                onApplyMask={onApplyMask}
                onApplyTextureMap={onApplyTextureMap}
                onOpenCatalogImport={onOpenCatalogImport}
                onRemoveCatalogEntry={onRemoveCatalogEntry}
                userFinishes={userFinishes}
                onSaveFinish={onSaveFinish}
              />
            </React.Fragment>
          );
        })}
      </View>
    );
  };
  return (
    <View style={styles.axisBox}>
      {path != null && (
        <Text style={styles.pathBar} numberOfLines={1}>
          {path}
        </Text>
      )}
      {/* 역할(role) 행은 UI에서 제거(사용자 결정) — 섀도 다겹은 쌓는 순서(하단=베이스)
          가 곧 역할이라 명시 태그가 오히려 애매하다. 데이터 모델(leaf.role)·핏
          '.부위[역할]' 셀렉터·시스템 룩의 'main' 시딩은 유지(저장물 호환). */}
      <View style={styles.axisTabs}>
        {available.map(a => (
          <TouchableOpacity
            key={a}
            style={[styles.axisTab, active === a && styles.axisTabOn]}
            onPress={() => onAxis(a)}
          >
            <Text
              style={[styles.axisTabText, active === a && styles.axisTabTextOn]}
            >
              {GROUP_LABEL[a]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {def.note != null && <Text style={styles.noteText}>{def.note}</Text>}
      <ScrollView style={styles.axisScroll}>
        {/* ── 제품 그룹 — 제품군→제품 스트립 + 색·텍스처(제형)·마감 섹션(§5) ── */}
        {active === 'product' && (
          <>
          {hasProductTab(leaf.region) &&
          (() => {
            const ranked = familiesRankedForRegion(leaf.region);
            const curProd = leaf.productId
              ? findProduct(leaf.productId, userProducts)
              : undefined;
            const colorControl = (def.axes.color ?? []).find(
              control => control.type === 'swatches',
            );
            const colorKey = colorControl?.type === 'swatches'
              ? colorControl.key
              : undefined;
            const colorways = curProd ? normalizeProduct(curProd).colorways : [];
            const customColor = colorKey != null && leaf.params[colorKey] !== undefined;
            const selectedColorway = !customColor && curProd
              ? resolveColorway(curProd, leaf.colorwayId)
              : undefined;
            const fam =
              (famSel?.leafId === leaf.id ? famSel.fam : undefined) ??
              curProd?.family ??
              ranked.fit[0] ??
              ranked.others[0];
            const famChip = (f: ProductFamily) => (
              <TouchableOpacity
                key={f}
                style={[styles.identityChip, fam === f && styles.identityChipOn]}
                onPress={() => setFamSel({ leafId: leaf.id, fam: f })}
              >
                <Text
                  style={[
                    styles.identityChipText,
                    fam === f && styles.identityChipTextOn,
                  ]}
                >
                  {FAMILY_TEMPLATES[f].label}
                </Text>
              </TouchableOpacity>
            );
            return (
              <View>
                {/* ① 제품군 줄 — 적합 먼저 ┊ 전체(다른 부위 제품군) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.identityRow}>
                    <Text style={styles.identityLabel}>제품군</Text>
                    {ranked.fit.map(famChip)}
                    {ranked.others.length > 0 && (
                      <Text style={styles.identityDivider}>┊ 전체</Text>
                    )}
                    {ranked.others.map(famChip)}
                  </View>
                </ScrollView>
                {/* ② 제품 줄 — 커스텀(참조 없음) + 선택 제품군의 제품들 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.identityRow}>
                    <Text style={styles.identityLabel}>제품</Text>
                    <TouchableOpacity
                      style={[
                        styles.identityChip,
                        !leaf.productId && styles.identityChipOn,
                      ]}
                      onPress={() => onSelectProduct(undefined, undefined, [])}
                    >
                      <Text
                        style={[
                          styles.identityChipText,
                          !leaf.productId && styles.identityChipTextOn,
                        ]}
                      >
                        커스텀
                      </Text>
                    </TouchableOpacity>
                    {(fam ? productsOfFamily(fam, userProducts) : []).map(p => (
                      <TouchableOpacity
                        key={p.id}
                        testID={`product-${p.id}`}
                        style={[
                          styles.identityChip,
                          leaf.productId === p.id && styles.identityChipOn,
                        ]}
                        onPress={() =>
                          onSelectProduct(
                            p,
                            resolveColorway(p)?.id,
                            physicalKeysForRegion(leaf.region),
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.identityChipText,
                            leaf.productId === p.id && styles.identityChipTextOn,
                          ]}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {curProd?.base && curProd.colorways && curProd.colorways.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.identityRow}>
                      <Text style={styles.identityLabel}>색상</Text>
                      {colorways.map(colorway => (
                        <TouchableOpacity
                          key={colorway.id}
                          testID={`colorway-${curProd.id}-${colorway.id}`}
                          style={[
                            styles.identityChip,
                            selectedColorway?.id === colorway.id && styles.identityChipOn,
                          ]}
                          onPress={() => onSelectProduct(
                            curProd,
                            colorway.id,
                            colorKey ? [colorKey] : [],
                          )}
                        >
                          <View style={[styles.colorwayDot, {backgroundColor: colorway.color}]} />
                          <Text style={[
                            styles.identityChipText,
                            selectedColorway?.id === colorway.id && styles.identityChipTextOn,
                          ]}>
                            {colorway.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {customColor && <Text style={styles.identityDivider}>커스텀 색</Text>}
                    </View>
                  </ScrollView>
                )}
                {curProd && (
                  <Text style={styles.noteText}>
                    {FAMILY_TEMPLATES[curProd.family].label} · {curProd.name}
                    {curProd.brandish ? ` (${curProd.brandish})` : ''} — 색·마감·농도가
                    제품에서 유도되고, 축에서 만진 값이 오버라이드로 이깁니다.
                  </Text>
                )}
                {canSaveProduct && fam && physicalModified && (
                  <View style={styles.identityRow}>
                    <TouchableOpacity
                      style={styles.identityChip}
                      onPress={() => onOpenSaveProduct(fam, curProd)}
                    >
                      <Text style={styles.identityChipText}>제품으로 저장</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })()}
          {PRODUCT_AXES.map(a => axisSection(a, def.axes[a] ?? []))}
          <TouchableOpacity
            style={styles.identityChip}
            onPress={() => setDetailOpen({
              leafId: leaf.id,
              open: !detailsExpanded,
            })}
          >
            <Text style={styles.identityChipText}>
              세부 조정
              {physicalModified ? ' · 수정됨' : ''}
              {' '}{detailsExpanded ? '⌃' : '⌄'}
            </Text>
          </TouchableOpacity>
          {detailsExpanded && (() => {
            const product = leaf.productId ? findProduct(leaf.productId, userProducts) : undefined;
            const shade = product ? resolveColorway(product, leaf.colorwayId) : undefined;
            const colorControl = (def.axes.color ?? []).find(
              control => control.type === 'swatches',
            );
            const hasCustomColor = colorControl?.type === 'swatches'
              && leaf.params[colorControl.key] !== undefined;
            return (
              <View style={styles.axisSection}>
                <Text style={styles.noteText}>
                  {product
                    ? `현재 참조 · ${product.name} · ${shade?.name ?? '기본 색상'}`
                      + (hasCustomColor ? ' · 커스텀 색' : '')
                    : '현재 참조 · 커스텀'}
                </Text>
                <Text style={styles.noteText}>
                  제형·마감 편집은 위의 기존 조정면을 그대로 사용합니다.
                </Text>
              </View>
            );
          })()}
          </>
        )}

        {/* ── 테크닉 그룹 — 모양 · 농도(제품 잎이면 강도) · 가장자리(터치) ── */}
        {active === 'technique' && (
          <>
          {axisSection('shape', def.axes.shape ?? [])}
          {(def.axes.opacity?.length ?? 0) > 0 && (
            <View style={styles.axisSection}>
              <Text style={styles.axisSectionLabel}>{AXIS_LABELS.opacity}</Text>
              {/* §5 농도 분해 — 제품 잎은 '강도(테크닉)': coverage ⊗ 강도로 번역. */}
              {leaf.productId ? (
                <ParamSlider
                  label="강도 (제품 coverage와 곱)"
                  value={leaf.technique?.strength ?? 0.8}
                  accent={GOLD}
                  onChange={v => onIdentity({ technique: { strength: v } })}
                />
              ) : (
                (def.axes.opacity ?? []).map((control, i) => (
                  <ControlView
                    key={i}
                    control={control}
                    params={leaf.params}
                    onPatch={onPatch}
                    onPickTexture={onPickTexture}
                    onPickMask={onPickMask}
                    onPickTextureMap={onPickTextureMap}
                    catalog={catalog}
                    onApplyTexture={onApplyTexture}
                    onApplyMask={onApplyMask}
                    onApplyTextureMap={onApplyTextureMap}
                    onOpenCatalogImport={onOpenCatalogImport}
                    onRemoveCatalogEntry={onRemoveCatalogEntry}
                    userFinishes={userFinishes}
                    onSaveFinish={onSaveFinish}
                  />
                ))
              )}
            </View>
          )}
          {/* 가장자리(터치) — fit 축의 EdgeSoftness 컨트롤을 테크닉으로(§5, 사용자 결정) */}
          {(def.axes.fit ?? []).some(isEdgeControl) && (
            <View style={styles.axisSection}>
              <Text style={styles.axisSectionLabel}>터치</Text>
              {(def.axes.fit ?? []).filter(isEdgeControl).map((control, i) => (
                <ControlView
                  key={i}
                  control={control}
                  params={leaf.params}
                  onPatch={onPatch}
                  onPickTexture={onPickTexture}
                  onPickMask={onPickMask}
                  onPickTextureMap={onPickTextureMap}
                  catalog={catalog}
                  onApplyTexture={onApplyTexture}
                  onApplyMask={onApplyMask}
                  onApplyTextureMap={onApplyTextureMap}
                  onOpenCatalogImport={onOpenCatalogImport}
                  onRemoveCatalogEntry={onRemoveCatalogEntry}
                  userFinishes={userFinishes}
                  onSaveFinish={onSaveFinish}
                />
              ))}
            </View>
          )}
          </>
        )}

        {/* ── 핏 그룹 — 위치·배치(가장자리 흐림 제외, 그건 테크닉으로) ── */}
        {active === 'fit' &&
          (def.axes.fit ?? [])
            .filter(c => !isEdgeControl(c))
            .map((control, i) => (
              <ControlView
                key={i}
                control={control}
                params={leaf.params}
                onPatch={onPatch}
                onPickTexture={onPickTexture}
                onPickMask={onPickMask}
                onPickTextureMap={onPickTextureMap}
                catalog={catalog}
                onApplyTexture={onApplyTexture}
                onApplyMask={onApplyMask}
                onApplyTextureMap={onApplyTextureMap}
                onOpenCatalogImport={onOpenCatalogImport}
                onRemoveCatalogEntry={onRemoveCatalogEntry}
                userFinishes={userFinishes}
                onSaveFinish={onSaveFinish}
              />
            ))}
        {active !== 'expert' && detailParams.length > 0 && (
          <View style={styles.axisSection}>
            <Text style={styles.axisSectionLabel}>세부 파라미터</Text>
            <ExpertParamControls
              params={detailParams}
              overrides={expertOverrides}
              onChange={onChangeExpertOverride ?? (() => {})}
              onReset={onResetExpertOverride ?? (() => {})}
              error={expertError}
            />
          </View>
        )}
        {active === 'expert' && (
          <View style={styles.axisSection}>
            <Text style={styles.axisSectionLabel}>전문가 파라미터</Text>
            <ExpertParamControls
              params={regionParams}
              overrides={expertOverrides}
              onChange={onChangeExpertOverride ?? (() => {})}
              onReset={onResetExpertOverride ?? (() => {})}
              error={expertError}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ControlView({
  control,
  presentation,
  axisLabel,
  params,
  onPatch,
  onPickTexture,
  onPickMask,
  onPickTextureMap,
  catalog,
  onApplyTexture,
  onApplyMask,
  onApplyTextureMap,
  onOpenCatalogImport,
  onRemoveCatalogEntry,
  userFinishes,
  onSaveFinish,
}: {
  control: ComposerControl;
  presentation?: AxisPresentation;
  axisLabel?: string;
  params: Partial<FilterParams>;
  onPatch: (patch: Partial<FilterParams>) => void;
  onPickTexture: (action: TextureAction) => void;
  onPickMask: (region: MaskRegion) => void;
  onPickTextureMap: (region: TextureMapRegion) => void;
  catalog: CatalogManifest;
  onApplyTexture: (action: TextureAction, uri: string) => void;
  onApplyMask: (region: MaskRegion, uri: string) => void;
  onApplyTextureMap: (region: TextureMapRegion, uri: string) => void;
  onOpenCatalogImport: () => void;
  onRemoveCatalogEntry?: (id: string) => void;
  userFinishes: UserFinish[];
  onSaveFinish: (name: string, bundle: FinishBundle) => void;
}) {
  // 컬러휠 모달 열림 상태(이 컨트롤 전용 — ControlView 는 컨트롤 1개 렌더).
  const [wheelOpen, setWheelOpen] = useState(false);
  switch (control.type) {
    case 'slider': {
      const min = control.min ?? 0;
      const max = control.max ?? 1;
      const raw = (params[control.key] as number) ?? control.fallback ?? 0;
      return (
        <ParamSlider
          label={control.label}
          value={(raw - min) / (max - min)}
          displayValue={control.step == null ? undefined : raw}
          step={control.step == null ? undefined : control.step / (max - min)}
          accent={control.gold ? GOLD : undefined}
          onChange={v => onPatch({ [control.key]: min + v * (max - min) })}
        />
      );
    }
    case 'swatches': {
      const selectedColor =
        (params[control.key] as string) ??
        (BARE[control.key] as string | undefined) ??
        control.palette[0];
      const inPalette = control.palette.some(
        c => c.toLowerCase() === selectedColor.toLowerCase(),
      );
      return (
        <View>
          {control.label != null && (
            <Text style={styles.swatchLabel}>{control.label}</Text>
          )}
          <View style={styles.swatchRow}>
            {/* 맨 앞 컬러휠 버튼 — 임의 색 선택기 열기. 팔레트에 없는
                커스텀 색이면 그 색을 채워 현재 선택을 반영, 아니면
                무지개 휠 썸네일로 "직접 고르기" 어포던스만. */}
            <TouchableOpacity
              onPress={() => setWheelOpen(true)}
              style={[styles.wheelBtn, !inPalette && styles.wheelBtnSelected]}
            >
              {inPalette ? (
                <Image source={WHEEL_THUMB} style={styles.wheelBtnImg} />
              ) : (
                <View
                  style={[styles.wheelBtnFill, { backgroundColor: selectedColor }]}
                />
              )}
            </TouchableOpacity>
            <ColorSwatches
              colors={control.palette}
              selected={selectedColor}
              onSelect={color => onPatch({ [control.key]: color })}
            />
          </View>
          <ColorWheel
            visible={wheelOpen}
            initial={selectedColor}
            onCancel={() => setWheelOpen(false)}
            onDone={hex => {
              setWheelOpen(false);
              onPatch({ [control.key]: hex });
            }}
          />
        </View>
      );
    }
    case 'segments': {
      const value = params[control.key] as number | undefined;
      const resolved = control.options.find(option => option.value === value);
      if (presentation === 'badge') {
        const fallback = axisLabel === AXIS_LABELS.texture
          ? control.options[0]?.label ?? '레거시 제형'
          : '레거시 새틴';
        return (
          <Text style={styles.noteText}>
            {axisLabel}: {resolved?.label ?? fallback}
          </Text>
        );
      }
      if (presentation === 'toggle' && control.options.length === 2) {
        return (
          <DomainToggle
            field={control.key}
            options={control.options}
            value={resolved?.value}
            userLabel={control.key === 'toneTexture' || control.key === 'skinTexture'
              ? '파우더 피니시'
              : undefined}
            onPatch={onPatch}
          />
        );
      }
      return (
        <View>
          {control.label && <Text style={styles.noteText}>{control.label}</Text>}
          <View style={styles.segRow}>
            {control.options.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[styles.segBtn, resolved?.value === o.value && styles.segBtnOn]}
                onPress={() =>
                  onPatch({
                    [control.key]: o.value,
                    ...((control.key === 'eyelinerThicknessProfile' ||
                    control.key === 'eyelinerTailProfile')
                      ? {eyelinerHasGeometryProfiles: 1}
                      : control.key === 'eyelinerStyle'
                        ? {eyelinerHasGeometryProfiles: 0}
                        : {}),
                    ...(o.patch ?? {}),
                  })
                }
              >
                <Text
                  style={[
                    styles.segText,
                    resolved?.value === o.value && styles.segTextOn,
                  ]}
                >
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }
    case 'finish': {
      const options = control.options ?? FINISHES;
      const raw = params[control.finishKey] as number | undefined;
      const resolved = options.find(option => option.value === raw);
      if (presentation === 'badge') {
        return (
          <Text style={styles.noteText}>
            {axisLabel}: {resolved?.label ?? '레거시 새틴'}
          </Text>
        );
      }
      if (presentation === 'toggle' && options.length === 2) {
        return (
          <View>
            <DomainToggle
              field={control.finishKey}
              options={options}
              value={resolved?.value}
              onPatch={onPatch}
            />
            {resolved?.value === 3 && (
              <ParamSlider
                label="시머 게인"
                value={(params[control.shimmerKey] as number) ?? 0.5}
                onChange={v => onPatch({[control.shimmerKey]: v})}
              />
            )}
          </View>
        );
      }
      return (
        <FinishControl
          finishKey={control.finishKey}
          shimmerKey={control.shimmerKey}
          detail={control.detail}
          options={options}
          params={params}
          onPatch={onPatch}
          userFinishes={userFinishes}
          onSaveFinish={onSaveFinish}
        />
      );
    }
    case 'caption':
      return (
        <Text style={styles.noteText}>
          {control.label}: {control.value}
        </Text>
      );
    case 'import':
      return (
        <View>
          <ParamSlider
            label={control.label}
            value={(params[control.intensityKey] as number) ?? 0}
            onChange={v => onPatch({ [control.intensityKey]: v })}
          />
          <TouchableOpacity
            style={styles.importBtn}
            onPress={() => onPickTexture(control.action)}
          >
            <Text style={styles.importBtnText}>
              {control.label} 불러오기 (파일에서 · 내 그림)
            </Text>
          </TouchableOpacity>
          <CatalogStrip
            entries={entriesForControl(catalog, 'import', control.action)}
            onPick={uri => onApplyTexture(control.action, uri)}
            onImport={onOpenCatalogImport}
            onRemove={onRemoveCatalogEntry}
            emptyHint="등록된 컬러 아트가 없어요 — 붙여넣기로 카탈로그를 채우세요"
          />
        </View>
      );
    case 'maskImport': {
      // 모양 축 마스크 = "어디에"(존 스텐실, 색은 앱이). 텍스처 축 컬러 아트 = "무엇을".
      // 강도 슬라이더 없음 — 부위 자체 농도 축이 세기 담당. 마커로 적용 상태만 표시.
      const applied = ((params[control.appliedKey] as number) ?? 0) > 0;
      return (
        <View>
          <Text style={styles.maskHint}>
            흑백/알파 모양만 — 색·마감·농도는 다른 탭에서 (색은 앱이 칠해요)
          </Text>
          <TouchableOpacity
            style={[styles.maskBtn, applied && styles.maskBtnApplied]}
            onPress={() => onPickMask(control.region)}
          >
            <Text style={styles.maskBtnText}>
              {applied ? `◈ ${control.label} 적용됨 · 파일에서 변경` : `◇ ＋ ${control.label} 파일에서 임포트`}
            </Text>
          </TouchableOpacity>
          <CatalogStrip
            entries={entriesForControl(catalog, 'maskImport', control.region)}
            onPick={uri => onApplyMask(control.region, uri)}
            onImport={onOpenCatalogImport}
            onRemove={onRemoveCatalogEntry}
            emptyHint="등록된 마스크가 없어요 — 붙여넣기로 카탈로그를 채우세요"
          />
        </View>
      );
    }
    case 'textureMap': {
      // 질감 맵(#22) = "어떻게 빛나는지"(픽셀별 광 지도). 컬러 아트("무엇을")·마스크
      // ("어디에")와 3번째 구분 — 시안 강조 + ✦ 아이콘으로 시각 분리. 강도 슬라이더
      // 없음(마감 세부가 세기 담당, 맵은 그 위 공간 변조). 마커로 적용 상태만 표시.
      const applied = ((params[control.appliedKey] as number) ?? 0) > 0;
      return (
        <View>
          <Text style={styles.mapHint}>
            빛 반응 지도(R=광, G=시머) — 외부 툴에서 구운 광택 맵. 마감(광)을 픽셀별로 변조해요
          </Text>
          <TouchableOpacity
            style={[styles.mapBtn, applied && styles.mapBtnApplied]}
            onPress={() => onPickTextureMap(control.region)}
          >
            <Text style={styles.mapBtnText}>
              {applied ? `✦ ${control.label} 적용됨 · 파일에서 변경` : `✧ ＋ ${control.label} 파일에서 임포트`}
            </Text>
          </TouchableOpacity>
          <CatalogStrip
            entries={entriesForControl(catalog, 'textureMap', control.region)}
            onPick={uri => onApplyTextureMap(control.region, uri)}
            onImport={onOpenCatalogImport}
            onRemove={onRemoveCatalogEntry}
            emptyHint="등록된 질감 맵이 없어요 — 붙여넣기로 카탈로그를 채우세요"
          />
        </View>
      );
    }
  }
}

/** 두 enum 선택지를 한 개의 boolean-style 스위치로 낮춘다. 실제 저장값과 물성 patch는
 * DomainOption 계약 그대로 한 번의 onPatch에 담는다. */
function DomainToggle({
  field,
  options,
  value,
  userLabel,
  onPatch,
}: {
  field: keyof FilterParams;
  options: [DomainOption, DomainOption] | DomainOption[];
  value?: number;
  userLabel?: string;
  onPatch: (patch: Partial<FilterParams>) => void;
}) {
  const off = options[0];
  const on = options[1];
  if (!off || !on) return null;
  const checked = value === on.value;
  const target = checked ? off : on;
  return (
    <View style={styles.segRow}>
      <TouchableOpacity
        accessibilityRole="switch"
        accessibilityState={{checked}}
        style={[styles.segBtn, checked && styles.segBtnOn]}
        onPress={() => onPatch({[field]: target.value, ...(target.patch ?? {})})}
      >
        <Text style={[styles.segText, checked && styles.segTextOn]}>{userLabel ?? on.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// 제형 스튜디오(#21) — 마감 세부 0 번들(초기화·enum 리셋용).
const ZERO_BUNDLE: FinishBundle = {
  glossLo: 0,
  glossGain: 0,
  shimmerSize: 0,
  shimmerDensity: 0,
  matte: 0,
  sheen: 0,
};

const sameBundle = (a: FinishBundle, b: FinishBundle) =>
  a.glossLo === b.glossLo &&
  a.glossGain === b.glossGain &&
  a.shimmerSize === b.shimmerSize &&
  a.shimmerDensity === b.shimmerDensity &&
  a.matte === b.matte &&
  a.sheen === b.sheen;

/**
 * 마감 축 컨트롤 — enum 4버튼 + 저장된 커스텀 제형 칩(◈) + 제형 스튜디오.
 *  - enum 버튼: 세부값을 0으로 리셋 → enum 레거시 경로(하위호환, Finish.cginc 대수 검증).
 *  - ◈ 칩: 저장 제형(부위 무관 번들)을 이 부위 세부 필드로 번역해 적용(커스텀 경로).
 *  - 스튜디오: 다섯 축 슬라이더로 실시간 커스텀 + 이름 붙여 저장.
 *  detail 없는 finish 컨트롤(현재 없음)은 enum 버튼만 렌더한다(방어적).
 */
function FinishControl({
  finishKey,
  shimmerKey,
  detail,
  options,
  params,
  onPatch,
  userFinishes,
  onSaveFinish,
}: {
  finishKey: keyof FilterParams;
  shimmerKey: keyof FilterParams;
  detail?: FinishDetailKeys;
  options: DomainOption[];
  params: Partial<FilterParams>;
  onPatch: (patch: Partial<FilterParams>) => void;
  userFinishes: UserFinish[];
  onSaveFinish: (name: string, bundle: FinishBundle) => void;
}) {
  const enumValue = (params[finishKey] as number) ?? 0;
  const bundle = detail ? readFinishBundle(params, detail) : ZERO_BUNDLE;
  const custom = detail ? isCustomFinish(bundle) : false;
  const zeroDetail = detail ? finishBundleToPatch(ZERO_BUNDLE, detail) : {};

  return (
    <View>
      <View style={styles.finishRow}>
        {/* enum 마감 — 선택 시 세부 0 리셋(레거시 경로). 커스텀 활성 중엔 미선택 표시. */}
        {options.map(f => {
          const on = !custom && enumValue === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              style={[styles.segBtn, on && styles.segBtnOn]}
              onPress={() =>
                onPatch({
                  [finishKey]: f.value,
                  ...zeroDetail,
                  ...(f.patch ?? {}),
                })
              }
            >
              <Text style={[styles.segText, on && styles.segTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
        {/* 저장된 커스텀 제형(◈) — 마감 버튼 줄에 함께 나타남 */}
        {detail &&
          userFinishes.map(uf => {
            const on = custom && sameBundle(bundle, uf.bundle);
            return (
              <TouchableOpacity
                key={uf.id}
                style={[styles.finishChip, on && styles.finishChipOn]}
                onPress={() => onPatch(finishBundleToPatch(uf.bundle, detail))}
              >
                <Text
                  style={[styles.finishChipText, on && styles.finishChipTextOn]}
                  numberOfLines={1}
                >
                  ◈ {uf.name}
                </Text>
              </TouchableOpacity>
            );
          })}
      </View>
      {/* 시머 게인 — enum 시머(3)이고 커스텀 아닐 때만(커스텀은 스튜디오 밀도가 담당) */}
      {enumValue === 3 && !custom && (
        <ParamSlider
          label="시머 게인"
          value={(params[shimmerKey] as number) ?? 0.5}
          onChange={v => onPatch({ [shimmerKey]: v })}
        />
      )}
      {detail && (
        <FinishStudio
          bundle={bundle}
          customActive={custom}
          enumSeed={FINISH_ENUM_SEED[enumValue] ?? FINISH_ENUM_SEED[0]}
          onChange={next => onPatch(finishBundleToPatch(next, detail))}
          onReset={() => onPatch(finishBundleToPatch(ZERO_BUNDLE, detail))}
          onSave={onSaveFinish}
        />
      )}
    </View>
  );
}

// 데코 배치 프리셋 — 캐노니컬 UV(0.5=중앙, y는 위로 증가). 왼볼(0.35, 0.4)은
// model.ts newLayer의 데코 시작점과 같은 앵커, 나머지는 그 좌표계의 근사점.
const DECO_SPOTS: { label: string; x: number; y: number }[] = [
  { label: '왼볼', x: 0.35, y: 0.4 },
  { label: '오른볼', x: 0.65, y: 0.4 },
  { label: '이마', x: 0.5, y: 0.78 },
  { label: '눈밑 왼', x: 0.38, y: 0.52 },
  { label: '눈밑 오른', x: 0.62, y: 0.52 },
  { label: '턱', x: 0.5, y: 0.12 },
];

// 회전 퀵 스냅(도) + 위치 노브 스텝
const ROTATION_SNAPS = [0, 45, 90];
const NUDGE_STEP = 0.02;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** 데코(자유 배치) 잎 편집 — 강도=제품(로즈), 배치=골드 (설계 색 규약).
 *  배치 프리셋 그리드 + 좌우 미러 복제 + 위치 노브/회전 스냅 + 기존 슬라이더. */
function DecoEditor({
  overlay,
  decoCount,
  onPatch,
  onMirror,
  onPickImage,
  catalog,
  onApplyImage,
  onOpenCatalogImport,
  onRemoveCatalogEntry,
}: {
  overlay: OverlayLayer;
  /** 트리 전체 데코 잎 수 — 미러 복제 상한(MAX_OVERLAY_LAYERS) 판정 */
  decoCount: number;
  onPatch: (patch: Partial<OverlayLayer>) => void;
  /** 같은 설정 x 미러(1−x)로 한 장 더 — 같은 sub에 잎 추가 */
  onMirror: () => void;
  onPickImage: () => void;
  catalog: CatalogManifest;
  onApplyImage: (uri: string) => void;
  onOpenCatalogImport: () => void;
  onRemoveCatalogEntry?: (id: string) => void;
}) {
  const full = decoCount >= MAX_OVERLAY_LAYERS;
  const [wheelOpen, setWheelOpen] = useState(false);
  return (
    <View style={styles.axisBox}>
      <ScrollView style={styles.axisScroll}>
        {/* 배치 프리셋 — 탭 한 번에 x,y 세팅 (목업 스탬프 UX) */}
        <Text style={styles.swatchLabel}>배치 프리셋</Text>
        <View style={styles.spotGrid}>
          {DECO_SPOTS.map(spot => {
            const on = near(overlay.x, spot.x) && near(overlay.y, spot.y);
            return (
              <TouchableOpacity
                key={spot.label}
                style={[styles.spotChip, on && styles.spotChipOn]}
                onPress={() => onPatch({ x: spot.x, y: spot.y })}
              >
                <Text style={[styles.spotChipText, on && styles.spotChipTextOn]}>
                  {spot.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.mirrorBtn, full && styles.mirrorBtnOff]}
          disabled={full}
          onPress={onMirror}
        >
          <Text style={styles.mirrorBtnText}>
            ⇆ 좌우 미러로 한 장 더 ({decoCount}/{MAX_OVERLAY_LAYERS})
          </Text>
        </TouchableOpacity>
        {full && (
          <Text style={styles.capNote}>
            데코 상한 {MAX_OVERLAY_LAYERS}장 — 잎을 지우면 더 추가할 수 있어요
          </Text>
        )}

        {/* 위치 미세 조정 — 스텝 노브(0.02) + 기존 슬라이더 */}
        <Text style={styles.swatchLabel}>위치 미세 조정</Text>
        <View style={styles.nudgeRow}>
          <TouchableOpacity
            style={styles.nudgeBtn}
            onPress={() => onPatch({ x: clamp01(overlay.x - NUDGE_STEP) })}
          >
            <Text style={styles.nudgeText}>◀</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nudgeBtn}
            onPress={() => onPatch({ x: clamp01(overlay.x + NUDGE_STEP) })}
          >
            <Text style={styles.nudgeText}>▶</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nudgeBtn}
            onPress={() => onPatch({ y: clamp01(overlay.y + NUDGE_STEP) })}
          >
            <Text style={styles.nudgeText}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nudgeBtn}
            onPress={() => onPatch({ y: clamp01(overlay.y - NUDGE_STEP) })}
          >
            <Text style={styles.nudgeText}>▼</Text>
          </TouchableOpacity>
          <Text style={styles.nudgeVal}>
            x {overlay.x.toFixed(2)} · y {overlay.y.toFixed(2)}
          </Text>
        </View>
        <ParamSlider
          label="가로"
          accent={GOLD}
          value={overlay.x}
          onChange={v => onPatch({ x: v })}
        />
        <ParamSlider
          label="세로"
          accent={GOLD}
          value={overlay.y}
          onChange={v => onPatch({ y: v })}
        />
        <ParamSlider
          label="크기"
          accent={GOLD}
          value={overlay.scale / 2}
          onChange={v => onPatch({ scale: Math.max(0.05, v * 2) })}
        />

        {/* 회전 — 0/45/90 퀵 스냅 + 슬라이더 */}
        <View style={styles.segRow}>
          {ROTATION_SNAPS.map(deg => (
            <TouchableOpacity
              key={deg}
              style={[styles.spotChip, near(overlay.rotation, deg) && styles.spotChipOn]}
              onPress={() => onPatch({ rotation: deg })}
            >
              <Text
                style={[
                  styles.spotChipText,
                  near(overlay.rotation, deg) && styles.spotChipTextOn,
                ]}
              >
                {deg}°
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <ParamSlider
          label="회전"
          accent={GOLD}
          value={overlay.rotation / 360 + 0.5}
          onChange={v => onPatch({ rotation: (v - 0.5) * 360 })}
        />

        {/* 블렌드: 스티커=원본색, 틴트=루마 보존 색소, 발광=네온(조명 초과 가산) */}
        <Text style={styles.swatchLabel}>블렌드</Text>
        <View style={styles.segRow}>
          {[
            { value: 0, label: '스티커 (원본색)' },
            { value: 1, label: '색소 틴트' },
            { value: 2, label: '✦ 네온 발광' },
          ].map(m => (
            <TouchableOpacity
              key={m.value}
              style={[styles.segBtn, overlay.blendMode === m.value && styles.segBtnOn]}
              onPress={() => onPatch({ blendMode: m.value })}
            >
              <Text
                style={[
                  styles.segText,
                  overlay.blendMode === m.value && styles.segTextOn,
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* 색 스와치 — 틴트·발광일 때. 내장 점은 흰 텍스처 × 색이라 항상 노출 */}
        {(overlay.blendMode === 1 ||
          overlay.blendMode === 2 ||
          overlay.path === BUILTIN_DOT) &&
          (() => {
            const decoColor = overlay.color ?? BLUSH_COLORS[0];
            const inPalette = BLUSH_COLORS.some(
              c => c.toLowerCase() === decoColor.toLowerCase(),
            );
            return (
              <View>
                <View style={styles.swatchRow}>
                  {/* 맨 앞 컬러휠 버튼 — 표준 swatches 컨트롤과 동일 패턴 */}
                  <TouchableOpacity
                    onPress={() => setWheelOpen(true)}
                    style={[styles.wheelBtn, !inPalette && styles.wheelBtnSelected]}
                  >
                    {inPalette ? (
                      <Image source={WHEEL_THUMB} style={styles.wheelBtnImg} />
                    ) : (
                      <View
                        style={[styles.wheelBtnFill, { backgroundColor: decoColor }]}
                      />
                    )}
                  </TouchableOpacity>
                  <ColorSwatches
                    colors={BLUSH_COLORS}
                    selected={decoColor}
                    onSelect={color => onPatch({ color })}
                  />
                </View>
                <ColorWheel
                  visible={wheelOpen}
                  initial={decoColor}
                  onCancel={() => setWheelOpen(false)}
                  onDone={hex => {
                    setWheelOpen(false);
                    onPatch({ color: hex });
                  }}
                />
              </View>
            );
          })()}
        <ParamSlider
          label="강도"
          value={overlay.intensity}
          onChange={v => onPatch({ intensity: v })}
        />

        {/* 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 젬(젬스톤 광)에 특히 유효.
            0=새틴=기존 출력(하위호환) */}
        <Text style={styles.swatchLabel}>마감</Text>
        <View style={styles.segRow}>
          {FOUNDATION_FINISHES.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.segBtn,
                (overlay.finish ?? 0) === f.value && styles.segBtnOn,
              ]}
              onPress={() => onPatch({ finish: f.value })}
            >
              <Text
                style={[
                  styles.segText,
                  (overlay.finish ?? 0) === f.value && styles.segTextOn,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.importBtn} onPress={onPickImage}>
          <Text style={styles.importBtnText}>내 그림 불러오기 (파일에서 · 투명 PNG)</Text>
        </TouchableOpacity>
        {/* 디자인 이미지는 부위 무관 컬러 아트 풀에서 고른다(§16 — 오버레이는 colorArt 취급) */}
        <CatalogStrip
          entries={designEntries(catalog)}
          onPick={onApplyImage}
          onImport={onOpenCatalogImport}
          onRemove={onRemoveCatalogEntry}
          emptyHint="카탈로그 컬러 아트가 없어요 — 붙여넣기로 채우세요"
        />
      </ScrollView>
    </View>
  );
}

// 렌즈 세부(#25) payload 편집기 — 색·블렌드·농도·직경/두께·디자인. 세부(part)별로
// 방사 존 슬라이더 의미가 다르다(베이스=직경 outer, 내부=내부직경 outer, 림=두께=1−inner).
function LensEditor({
  lens,
  onPatch,
  onPickDesign,
  catalog,
  onApplyDesign,
  onOpenCatalogImport,
  onRemoveCatalogEntry,
}: {
  lens: LensLayer;
  onPatch: (patch: Partial<LensLayer>) => void;
  onPickDesign: () => void;
  catalog: CatalogManifest;
  onApplyDesign: (uri: string) => void;
  onOpenCatalogImport: () => void;
  onRemoveCatalogEntry?: (id: string) => void;
}) {
  const partLabel =
    lens.part === 2 ? '테두리 림' : lens.part === 1 ? '내부 디테일' : '베이스 컬러';
  const [wheelOpen, setWheelOpen] = useState(false);
  const inPalette = IRIS_COLORS.some(
    c => c.toLowerCase() === lens.color.toLowerCase(),
  );
  return (
    <View style={styles.axisBox}>
      <ScrollView style={styles.axisScroll}>
        <Text style={styles.swatchLabel}>세부 — {partLabel}</Text>

        <Text style={styles.swatchLabel}>색</Text>
        <View style={styles.swatchRow}>
          {/* 맨 앞 컬러휠 버튼 — 표준 swatches 컨트롤과 동일 패턴 */}
          <TouchableOpacity
            onPress={() => setWheelOpen(true)}
            style={[styles.wheelBtn, !inPalette && styles.wheelBtnSelected]}
          >
            {inPalette ? (
              <Image source={WHEEL_THUMB} style={styles.wheelBtnImg} />
            ) : (
              <View style={[styles.wheelBtnFill, { backgroundColor: lens.color }]} />
            )}
          </TouchableOpacity>
          <ColorSwatches
            colors={IRIS_COLORS}
            selected={lens.color}
            onSelect={color => onPatch({ color })}
          />
        </View>
        <ColorWheel
          visible={wheelOpen}
          initial={lens.color}
          onCancel={() => setWheelOpen(false)}
          onDone={hex => {
            setWheelOpen(false);
            onPatch({ color: hex });
          }}
        />

        {/* 블렌드 10종(0~9) — Iris.shader LensBlend와 1:1 */}
        <Text style={styles.swatchLabel}>블렌드</Text>
        <View style={styles.segRow}>
          {LENS_BLEND_MODES.map(m => (
            <TouchableOpacity
              key={m.value}
              style={[styles.segBtn, lens.blendMode === m.value && styles.segBtnOn]}
              onPress={() => onPatch({ blendMode: m.value })}
            >
              <Text
                style={[
                  styles.segText,
                  lens.blendMode === m.value && styles.segTextOn,
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ParamSlider
          label="농도"
          value={lens.intensity}
          onChange={v => onPatch({ intensity: v })}
        />

        {/* 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환). 겹별 독립 */}
        <Text style={styles.swatchLabel}>마감</Text>
        <View style={styles.segRow}>
          {FOUNDATION_FINISHES.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.segBtn,
                (lens.finish ?? 0) === f.value && styles.segBtnOn,
              ]}
              onPress={() => onPatch({ finish: f.value })}
            >
              <Text
                style={[
                  styles.segText,
                  (lens.finish ?? 0) === f.value && styles.segTextOn,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 방사 존(직경/두께) — 세부별 의미 분기. smoothstep 경계는 셰이더가 처리 */}
        {lens.part === 2 ? (
          <ParamSlider
            label="두께 (외곽에서 안쪽)"
            accent={GOLD}
            value={1 - lens.inner}
            onChange={v => onPatch({ inner: clamp01(1 - Math.max(0.05, v)) })}
          />
        ) : (
          <ParamSlider
            label={lens.part === 1 ? '내부 직경' : '직경'}
            accent={GOLD}
            value={lens.outer}
            onChange={v => onPatch({ outer: Math.max(0.1, v) })}
          />
        )}

        {/* 디자인 — 방사 컬러 아트 텍스처(꽃무늬·별·헤이즐). 없으면 절차 방사 그라데 */}
        <Text style={styles.swatchLabel}>
          디자인 {lens.designPath ? '(임포트됨)' : '(기본: 방사 그라데)'}
        </Text>
        <TouchableOpacity style={styles.importBtn} onPress={onPickDesign}>
          <Text style={styles.importBtnText}>렌즈 디자인 불러오기 (파일에서)</Text>
        </TouchableOpacity>
        {/* 렌즈 디자인도 부위 무관 컬러 아트 풀에서 고른다(§16 — 렌즈는 colorArt 취급) */}
        <CatalogStrip
          entries={designEntries(catalog)}
          onPick={onApplyDesign}
          onImport={onOpenCatalogImport}
          onRemove={onRemoveCatalogEntry}
          emptyHint="카탈로그 컬러 아트가 없어요 — 붙여넣기로 채우세요"
        />
        {lens.designPath && (
          <TouchableOpacity
            style={styles.mirrorBtn}
            onPress={() => onPatch({ designPath: undefined })}
          >
            <Text style={styles.mirrorBtnText}>디자인 지우기 (절차 그라데로)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 배경·마진·모서리는 상위 paramPanel(App)이 소유 — 본문은 패딩만.
  sheet: {
    paddingHorizontal: PANEL_INSET,
    paddingTop: 0,
    paddingBottom: SP.md,
    maxHeight: 460,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginBottom: SP.sm,
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerBtn: {
    height: CONTROL_H,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  collapseBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  collapseBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  headerBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: ACCENT,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  pickerScroll: {
    maxHeight: 380,
  },
  pickerBack: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  groupTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  regionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  regionCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  regionCellOff: {
    opacity: 0.35,
  },
  regionEmoji: {
    fontSize: 14,
  },
  regionLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  treeScroll: {
    maxHeight: 200,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 14,
  },
  // 트리 행 — 들여쓰기 + 좌측 보더로 계층 표현 (화면 이동 없음)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // 평탄 뷰 — 부위룩 섹션 헤더(얇게), 제품 잎 행(기본 단위), 다겹 스택 헤더.
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 4,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  sectionMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionName: {
    flex: 1,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  rowLeaf: {
    marginLeft: 10,
  },
  rowLeafNested: {
    marginLeft: 28,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderLeftWidth: 2,
    borderLeftColor: accentAlpha(0.35),
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    paddingVertical: 5,
  },
  rowStack: {
    marginLeft: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 6,
  },
  regionChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(201,161,94,0.14)',
    maxWidth: 110,
  },
  regionChipText: {
    color: GOLD_LIGHT,
    fontSize: 10,
    fontWeight: '700',
  },
  countBadge: {
    color: ACCENT_PALE,
    backgroundColor: accentAlpha(0.18),
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  rowSel: {
    backgroundColor: accentAlpha(0.16),
    borderWidth: 1,
    borderColor: accentAlpha(0.6),
  },
  rowDim: {
    opacity: 0.45,
  },
  caret: {
    width: 12,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
  },
  // 그룹(슬롯) 접기 캐럿 — 슬롯 라벨 앞. 톤다운(관리 아닌 상태 표시).
  groupCaret: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    width: 14,
  },
  slotLabel: {
    width: 28,
    color: GOLD,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  swatch: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  rowName: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
  },
  rowSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '400',
  },
  dirtyStar: {
    color: ACCENT,
    fontWeight: '800',
  },
  ownBadge: {
    color: GOLD_LIGHT,
    backgroundColor: 'rgba(201,161,94,0.16)',
    fontSize: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fitBadge: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '700',
  },
  exceptionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 6,
  },
  exceptionClear: {color: 'rgba(255,255,255,0.55)', fontSize: 10, textDecorationLine: 'underline'},
  rowBtn: {
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  rowBtnText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
  },
  swapOn: {
    color: ACCENT,
  },
  eyeText: {
    color: GOLD,
    fontSize: 12,
  },
  swapPanel: {
    marginLeft: SP.md,
    marginBottom: SP.xs,
    padding: SP.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accentAlpha(0.5),
    backgroundColor: accentAlpha(0.05),
  },
  swapTitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    marginBottom: 5,
  },
  swapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP.xs,
  },
  swapChip: {
    height: CONTROL_H,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    maxWidth: 150,
  },
  swapChipMine: {
    backgroundColor: 'rgba(201,161,94,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,161,94,0.7)',
  },
  swapChipOn: {
    backgroundColor: ACCENT,
  },
  swapChipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  swapChipTextOn: {
    color: '#FFFFFF',
  },
  addRow: {
    marginTop: 2,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accentAlpha(0.6),
    backgroundColor: accentAlpha(0.05),
    alignItems: 'center',
  },
  // 트리 스크롤 밖 고정 행 — 스크롤과 형제로 두어 트리를 밀어도 위치 불변.
  addRowFloating: {
    marginTop: SP.sm,
    flexShrink: 0,
  },
  addRowText: {
    color: ACCENT_LIGHT,
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9.5,
    textAlign: 'center',
    marginVertical: 6,
  },
  pathBar: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  // 잎 정체성 스트립(§5) — 제품 참조·역할 태그 칩 줄(축 탭 위)
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    marginBottom: SP.sm,
  },
  identityLabel: {color: 'rgba(255,255,255,0.45)', fontSize: 10, width: 26},
  // 제품 스트립 구분 — 적합 제품 ┊ 전체(다른 부위 제품 = 멀티유즈 후보).
  identityDivider: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    alignSelf: 'center',
    paddingHorizontal: 2,
  },
  identityChip: {
    height: CONTROL_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  identityChipOn: {
    borderColor: GOLD,
    backgroundColor: 'rgba(201,161,94,0.14)',
  },
  identityChipText: {color: 'rgba(255,255,255,0.6)', fontSize: 11},
  identityChipTextOn: {color: GOLD, fontWeight: '600'},
  colorwayDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  saveProductBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  saveProductSheet: {
    padding: PANEL_INSET,
    gap: SP.sm,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#1c1c1e',
  },
  saveProductInput: {
    height: 38,
    paddingHorizontal: SP.sm,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    color: '#FFFFFF',
  },
  axisBox: {
    marginTop: SP.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: SP.md,
  },
  axisTabs: {
    flexDirection: 'row',
    gap: SP.xs,
    marginBottom: SP.sm,
  },
  axisTab: {
    height: CONTROL_H,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // 2단(§5) — 상위 그룹 탭 아래 축 섹션. 라벨(축 이름) + 컨트롤. 여러 축이 한 그룹에.
  axisSection: {
    marginTop: SP.sm,
  },
  axisSectionLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: SP.xs,
  },
  // 축 안 group 소제목 — 축 라벨보다 조용하게(무채색 힌트톤). 위 여백으로 묶음 경계만.
  axisGroupLabel: {
    color: TEXT_HINT,
    fontSize: 11,
    fontWeight: '600',
    marginTop: SP.sm,
    marginBottom: SP.xs,
  },
  axisTabOn: {
    backgroundColor: accentAlpha(0.35),
  },
  axisTabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  axisTabTextOn: {
    color: '#FFFFFF',
  },
  noteText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginBottom: 4,
  },
  axisScroll: {
    maxHeight: 170,
  },
  swatchLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: SP.xs,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
  },
  wheelBtn: {
    padding: 2,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  wheelBtnSelected: {
    borderColor: '#FFFFFF',
  },
  wheelBtnImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  wheelBtnFill: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  segRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP.xs,
    marginVertical: SP.sm,
  },
  // 마감 축 — enum 버튼 + 커스텀 제형 칩(◈)이 한 줄에 섞여 줄바꿈된다.
  finishRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP.xs,
    marginVertical: SP.sm,
  },
  finishChip: {
    height: CONTROL_H,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 12,
    backgroundColor: accentAlpha(0.14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha(0.6),
    maxWidth: 130,
  },
  finishChipOn: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  finishChipText: {
    color: ACCENT_PALE,
    fontSize: 12,
    fontWeight: '600',
  },
  finishChipTextOn: {
    color: '#FFFFFF',
  },
  // 세그 버튼 — 제품 탭 칩(identityChip)과 동일 톤으로 통일(사용자 요청):
  // 아웃라인 필 + 선택=골드 틴트. 모양·마감·렌즈 블렌드 등 enum 줄 공용.
  segBtn: {
    height: CONTROL_H,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  segBtnOn: {
    borderColor: GOLD,
    backgroundColor: 'rgba(201,161,94,0.14)',
  },
  segText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  segTextOn: {
    color: GOLD,
    fontWeight: '600',
  },
  // 데코 배치(골드) — 프리셋 그리드·미러·노브 (설계 색 규약: 배치=골드)
  spotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP.xs,
    marginVertical: SP.sm,
  },
  spotChip: {
    height: CONTROL_H,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 12,
    backgroundColor: 'rgba(201,161,94,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,161,94,0.55)',
  },
  spotChipOn: {
    backgroundColor: GOLD,
  },
  spotChipText: {
    color: GOLD_CTA,
    fontSize: 12,
    fontWeight: '600',
  },
  spotChipTextOn: {
    color: '#1A1410',
  },
  mirrorBtn: {
    marginTop: 2,
    marginBottom: 4,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(201,161,94,0.7)',
    backgroundColor: 'rgba(201,161,94,0.08)',
  },
  mirrorBtnOff: {
    opacity: 0.35,
  },
  mirrorBtnText: {
    color: GOLD_CTA,
    fontSize: 12,
    fontWeight: '600',
  },
  capNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 4,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    marginVertical: SP.sm,
  },
  nudgeBtn: {
    width: 36,
    height: CONTROL_H,
    justifyContent: 'center',
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(201,161,94,0.18)',
  },
  nudgeText: {
    color: GOLD_CTA,
    fontSize: 12,
    fontWeight: '700',
  },
  nudgeVal: {
    flex: 1,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  importBtn: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  importBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  // 카탈로그 썸네일 스트립(§16) — 컨트롤 아래 가로 목록(탭=apply-by-uri)
  catalogStrip: {
    marginBottom: 8,
  },
  catalogStripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catalogStripTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
  },
  catalogImportLink: {
    color: ACCENT_PALE,
    fontSize: 10,
    fontWeight: '700',
  },
  catalogEmpty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    paddingVertical: 6,
  },
  catalogRow: {
    flexDirection: 'row',
  },
  catalogItem: {
    width: 56,
    marginRight: 8,
  },
  catalogThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // 렌더 불가 썸네일(번들 streaming: 등) 폴백 — 깨진 이미지 대신 이름 타일.
  catalogThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  catalogThumbFallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
  },
  catalogItemName: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    marginTop: 2,
  },
  catalogRemoveHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    marginTop: 2,
  },
  // 모양 축 마스크 = 존 스텐실("어디에"). 텍스처 임포트(컬러 아트)와 시각 구분:
  // 외곽선 스타일 + 골드 강조 + 흑백 다이아 아이콘(◇/◈).
  maskHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 2,
    marginBottom: 6,
  },
  maskBtn: {
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GOLD,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  maskBtnApplied: {
    borderStyle: 'solid',
    backgroundColor: 'rgba(201,161,94,0.18)',
  },
  maskBtnText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '600',
  },
  // 질감 맵(#22) = 광 지도("어떻게 빛나는지"). 마스크(골드)·텍스처(회색 채움)와
  // 3번째 시각 구분 — 시안 외곽선 + ✦/✧ 아이콘(빛/반짝임 은유).
  mapHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 2,
    marginBottom: 6,
  },
  mapBtn: {
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6FD3E0',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  mapBtnApplied: {
    borderStyle: 'solid',
    backgroundColor: 'rgba(111,211,224,0.18)',
  },
  mapBtnText: {
    color: '#8FE0EC',
    fontSize: 12,
    fontWeight: '600',
  },
  headerBtnOn: {
    backgroundColor: accentAlpha(0.4),
  },
  // 멀티유즈(Phase 2) — 대상 부위 픽커 (잎 아래 로즈 점선 패널)
  multiUsePanel: {
    marginLeft: SP.md,
    marginBottom: SP.xs,
    padding: SP.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accentAlpha(0.5),
    backgroundColor: accentAlpha(0.05),
  },
  multiUseTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    marginBottom: 5,
  },
  multiUseChip: {
    height: CONTROL_H,
    justifyContent: 'center',
    paddingHorizontal: SP.sm,
    borderRadius: 12,
    backgroundColor: accentAlpha(0.16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha(0.5),
    maxWidth: 130,
  },
  multiUseChipText: {
    color: ACCENT_PALE,
    fontSize: 11,
    fontWeight: '600',
  },
  multiUseHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9.5,
    marginTop: 5,
  },
  // 그룹핑(Phase 3) — 다중선택 체크·툴바·그룹 헤더
  checkBtn: {
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  checkText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
  checkTextOn: {
    color: ACCENT,
  },
  groupBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    padding: 6,
    borderRadius: 10,
    backgroundColor: accentAlpha(0.1),
  },
  groupBarInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(46,44,42,0.35)',
  },
  groupMakeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: ACCENT,
  },
  groupMakeBtnOff: {
    opacity: 0.4,
  },
  groupMakeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  groupBox: {
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: accentAlpha(0.35),
    backgroundColor: accentAlpha(0.04),
    paddingBottom: 4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: accentAlpha(0.12),
  },
  groupNameBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupName: {
    color: ACCENT_PALE,
    fontSize: 12,
    fontWeight: '700',
  },
  groupCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
  },
  groupNameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(46,44,42,0.3)',
  },
});
