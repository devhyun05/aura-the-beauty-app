/**
 * AR Makeup — React Native + Unity(UaaL) 얼굴 보정/메이크업 필터 앱.
 *
 * Unity가 카메라 + 얼굴 트래킹 + 메이크업 렌더링을 담당하고,
 * RN은 필터 선택/강도 조절 UI와 촬영 플로우를 담당한다.
 * 통신 프로토콜: src/bridge/types.ts ↔ unity/Assets/Scripts/Bridge/BridgeMessages.cs
 *
 * 홈 UI는 목업 v2의 "두 레인" 모델: LOOK(메이크업 룩 트리, 로즈)과 FIT(얼굴형
 * 보정 필터, 골드)이 별도 레인으로 자유 조합된다. 방출 파이프라인은
 * flattenTree → compileLayers → applyWarpToParams → 기존 브리지(applyFilter/
 * setOverlayLayers) — 워프 필드는 보정 레인이 단독 소유한다(warpPresets.ts).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import UnityView from './StencilUnityViewAdapter';
import { launchImageLibrary } from 'react-native-image-picker';

import { parseUnityMessage } from './src/bridge/types';
import type {
  CalibrationParams,
  FilterParams,
  EyeshadowLayer,
  LensLayer,
  LightingParams,
  LookMeasurement,
  OverlayLayer,
  RNToUnityMessage,
  StencilParams,
  SymmetryParams,
} from './src/bridge/types';
import { BARE, PRESETS } from './src/presets';
import { suggestStyleName } from './src/storage/styleStore';
import {
  loadFitSheets,
  loadUserProducts,
  loadUserWarpFilters,
  loadUserLibrary,
  loadUserStylesV2,
  saveFitSheets,
  saveUserProducts,
  saveUserWarpFilters,
  saveUserLibrary,
  saveUserStylesV2,
} from './src/storage/lookStore';
import type { UserStyleV2 } from './src/storage/lookStore';
import { loadUserFinishes, saveUserFinishes } from './src/storage/finishStore';
import type { UserFinish } from './src/storage/finishStore';
import {
  addEntry as addCatalogEntry,
  fetchRemoteManifest,
  importManifestText,
  loadCatalogStore,
  removeEntry as removeCatalogEntry,
} from './src/storage/catalogStore';
import { emptyCatalog, loadCatalog } from './src/assets/assetCatalog';
import type { AssetKind, CatalogManifest } from './src/assets/assetCatalog';
import ParamSlider from './src/components/ParamSlider';
import ExtractDiagPanel from './src/components/ExtractDiagPanel';
import ExtractSourceThumb from './src/components/ExtractSourceThumb';
import Icon from './src/components/Icon';
import BasicMode from './src/components/BasicMode';
import type { LaneChip } from './src/components/LaneRow';
import ComposerSheet from './src/components/ComposerSheet';
import GuideMode, { SKY } from './src/components/GuideMode';
import {maskStencilByKeys, stencilStepsFromTree} from './src/composer/stencilSteps';
import LightingPanel from './src/components/LightingPanel';
import PerfumePanel from './src/components/PerfumePanel';
import BodyPanel from './src/components/BodyPanel';
import HairstylePanel from './src/components/HairstylePanel';
import SettingsPanel, {
  DEFAULT_SETTINGS,
  type UserSettings,
} from './src/components/SettingsPanel';
import WarpSheet from './src/components/WarpSheet';
import FitSheetPanel from './src/components/FitSheetPanel';
import FitHandlesOverlay from './src/components/FitHandlesOverlay';
import type { FitHandlePoint } from './src/components/FitHandlesOverlay';
import StudioHub from './src/components/StudioHub';
import {
  applyFitToLayers,
  entryOf,
  newFitSheet,
  upsertEntry,
} from './src/composer/fitSheets';
import { applyProductsToLayers } from './src/composer/products';
import type { ProductDef } from './src/composer/products';
import type { FitSheet as FitSheetData } from './src/composer/fitSheets';
import SaveSheetV2 from './src/components/SaveSheetV2';
import type { SaveDecision } from './src/components/SaveSheetV2';
import { compileLayers } from './src/composer/model';
import { measurementToLook } from './src/composer/lookExtract';
import {
  GOLD,
  isDecoRegion,
  REGION_DEFS,
  regionOwnKeys,
} from './src/composer/regions';
import type { RegionKey } from './src/composer/regions';
import type {
  FinishBundle,
  MaskRegion,
  TextureAction,
  TextureMapRegion,
} from './src/composer/regions';
import {
  applySaveDecisions,
  buildSystemLibrary,
  collectChanges,
  decomposeToTree,
  faceLookIdForPreset,
  findNode,
  flattenTree,
  instantiate,
  isLeaf,
  promoteGroup,
  reviveTree,
  setNodeFitRef,
  SLOT_OF_REGION,
  snapshotTree,
  treeDirty,
  updateLeaf,
} from './src/composer/lookTree';
import type { SlotKey } from './src/composer/lookTree';
import type {
  LookLibrary,
  LookNode,
  LookSnapshot,
  ProductLeaf,
  SaveItem,
  TreeChild,
} from './src/composer/lookTree';
import { buildVariantLibrary } from './src/composer/lookVariants';
import {
  WARP_PRESETS,
  WARP_SLIDERS,
  applyWarpToParams,
  emptyWarpLane,
  warpLaneActive,
  warpLaneFrom,
} from './src/composer/warpPresets';
import type {
  WarpLane,
  UserWarpFilter,
  WarpGroup,
  WarpKey,
  WarpParams,
} from './src/composer/warpPresets';
import * as History from './src/composer/history';
import type { EditSnapshot } from './src/composer/history';

// 레인 시그니처 색 — 메이크업(로즈)·보정(골드, GOLD import). 세그먼트 도트/텍스트 강조 공용.
const ROSE = '#FF7E9D';

// iOS 실기기(iPhone 15 Pro) 확정값: displayMatrix(행렬1)가 y뒤집기를 포함하므로 flipY 불필요.
// Android는 미확정 — 실기기 캘리브레이션 후 갱신할 것.
const DEFAULT_CALIBRATION: CalibrationParams = {
  flipY: Platform.OS !== 'ios',
  rotationDegrees: -1,
  matrixMode: -1,
  debugMesh: false,
  debugSeg: false,
  cullMode: -1,
};

// 튜토리얼 스텐실(#2) 기본값 — 열었을 때 립·눈썹만 켜고 농도 0.85로 시작(바로 보임).
// 나머지 부위는 사용자가 칩으로 켠다.
const DEFAULT_STENCIL: StencilParams = {
  opacity: 0.85,
  lips: true,
  brows: true,
  eyeshadow: false,
  eyeliner: false,
  aegyo: false,
  blush: false,
  highlighter: false,
  contour: false,
  pulse: true,
  dash: true,
};

// 좌우 대칭 가이드(#6) 기본값 — 열면 중심축·대칭 쌍 둘 다 켜고 농도 0.9로 또렷하게.
// 좌우 대칭(#6) 기본 — 첫 가이드 레인 진입 시 중심축·대칭쌍 둘 다 OFF(칩으로 켬).
// 켠 조합은 유저 선호로 유지 — 레인을 나갔다 와도 칩 상태가 복원된다.
const DEFAULT_SYMMETRY: SymmetryParams = {
  opacity: 0.9,
  midline: false,
  pairs: false,
};

// 조명 시뮬레이션(#4) 기본값 — 열면 자연광(1)부터, 세기 0.85. 프리셋 칩으로 전환.
// 조명 기본 — '끔'(원본). enabled 게이트가 없어져 선택 칩=실제 적용이 1:1이어야
// 하므로 시작 선택도 끔(자연광이 선택돼 보이는데 미적용인 불일치 방지).
const DEFAULT_LIGHTING: LightingParams = {
  preset: 0,
  intensity: 0.85,
  temperature: 0.5,
};

const CULL_STEPS = [-1, 0, 1, 2];
const CULL_LABELS: Record<number, string> = {
  [-1]: '기본',
  0: '끔',
  1: '앞컷',
  2: '뒤컷',
};

// 편집 히스토리 코얼레스 창(ms) — 같은 tag의 연속 변경(슬라이더 드래그 등)은 이 시간
// 내면 첫 기록만 남겨 undo 한 번이 드래그 전체를 되돌리게 한다.
const HIST_COALESCE_MS = 500;

const ROTATION_STEPS = [-1, 0, 90, 180, 270];
// 시간 동기 표시 경로에서 행렬 버튼은 표시 회전(0/90/180/270°)으로 동작한다
const MATRIX_STEPS = [-1, 0, 1, 2, 3];

function cycle(steps: number[], current: number): number {
  const index = steps.indexOf(current);
  return steps[(index + 1) % steps.length];
}

// 전역 메이크업 농도가 곱해지는 강도 필드 (색·두께·아치·스타일 enum·워프는 제외).
// R2 그라데(lipGradient/eyeshadowGradient)도 제외 — 두 색의 혼합 "비율"이지
// 칠해진 농도가 아니라서, 전역 농도를 곱하면 색축(스톱B 위치)이 임의로 이동한다.
const INTENSITY_KEYS: (keyof FilterParams)[] = [
  'skinSmoothing',
  'skinBrightening',
  'highlightIntensity',
  'contourIntensity',
  'concealerIntensity',
  'aegyoIntensity',
  'aegyoStyleIntensity',
  'lipIntensity',
  'lipStyleIntensity',
  'blushIntensity',
  'blushStyleIntensity',
  'eyeshadowIntensity',
  'eyeshadowLowerIntensity',
  'irisIntensity',
  'eyelinerIntensity',
  'eyelinerStyleIntensity',
  'eyelinerLowerIntensity',
  'mascaraIntensity',
  'lipLinerIntensity',
  'browIntensity',
  'browPowderIntensity',
  'browLightenerIntensity',
  'browPencilIntensity',
  'browStyleIntensity',
  'faceOverlayIntensity',
  // 부위 확장 팩 — 컨실·치아·아래 속눈썹 (적대 리뷰: 전역 농도 스케일 필수 등록)
  'browConcealIntensity',
  'teethWhitenIntensity',
  'lowerLashIntensity',
  // 신규 렌더 4종 — 삼각존·쌍꺼풀·베이스립·립글로스 (전역 농도 스케일 등록)
  'triangleZoneIntensity',
  'doubleLidIntensity',
  'lipBaseIntensity',
  'lipGlossIntensity',
  // 세그 확장 — 이마·목 스무딩·헤어 염색 (전역 농도 스케일 등록)
  'skinSmoothingExtended',
  'hairTintIntensity',
  // 베이스 팩(#18) — 파운데 커버리지·파우더·프라이머 윤광 (색·마감 enum은 제외)
  'foundationIntensity',
  'powderIntensity',
  'skinGlow',
];

// 강도 필드 → 슬롯(대분류) 매핑 — 카테고리별 농도 스케일용. regions 축 선언에서
// 유도(regionOwnKeys × SLOT_OF_REGION)해 드리프트 없음.
const FIELD_SLOT: Partial<Record<keyof FilterParams, SlotKey>> = (() => {
  const m: Partial<Record<keyof FilterParams, SlotKey>> = {};
  for (const def of REGION_DEFS) {
    const slot = SLOT_OF_REGION[def.key];
    for (const k of regionOwnKeys(def)) m[k] = slot;
  }
  return m;
})();

// 슬롯별 농도 게인(0..1, 없으면 1). '전체' 카테고리=opacity(전역), 슬롯 카테고리는
// 그 슬롯 부위만 추가 스케일. 최종 배수 = opacity × slotGain[그 필드의 슬롯].
export type SlotGain = Partial<Record<SlotKey, number>>;

// 룩의 모든 강도에 전역 농도 × 슬롯 게인을 곱한 사본. 색/두께/아치/워프는 그대로.
function scaleParams(
  base: FilterParams,
  opacity: number,
  slotGain: SlotGain = {},
): FilterParams {
  const out = { ...base };
  for (const k of INTENSITY_KEYS) {
    const slot = FIELD_SLOT[k];
    const g = opacity * (slot ? slotGain[slot] ?? 1 : 1);
    if (g >= 1) continue; // 배수 1 = 원본 유지(불필요 대입 스킵)
    // 선택적 강도 필드(생략 가능)는 undefined → 0으로 처리해 NaN 전파 방지.
    (out as any)[k] = ((base as any)[k] ?? 0) * g;
  }
  return out;
}

// 시스템 라이브러리 — 내장 프리셋(PRESETS) 분해 + 부위 룩 변형(다양성 확충) 병합.
// 변형은 전부 region 레벨이라 ⇄ 교체 패널(regionDefsForSlot)에 자동 노출된다.
const SYSTEM_LIBRARY = { ...buildSystemLibrary(), ...buildVariantLibrary() };
// LOOK 레인 시스템 칩 — 시스템 face 룩이 있는 프리셋만 (원본/직접은 제외)
const SYSTEM_LOOKS = PRESETS.filter(p => SYSTEM_LIBRARY[faceLookIdForPreset(p.id)]);

// 갤러리 임포트 텍스처 → 브리지 메시지·잎 강도 필드 매핑 (컴포저 텍스처 탭)
const TEXTURE_SPEC = {
  brow: { msg: 'setBrowStyle', key: 'browStyleIntensity' },
  eyeliner: { msg: 'setEyelinerStyle', key: 'eyelinerStyleIntensity' },
  lip: { msg: 'setLipStyle', key: 'lipStyleIntensity' },
  blush: { msg: 'setBlushStyle', key: 'blushStyleIntensity' },
  aegyo: { msg: 'setAegyoStyle', key: 'aegyoStyleIntensity' },
} as const;

// 디자이너 마스크 임포트(모양 축, §16) → setRegionMask region + 세션 적용 마커 필드.
// 텍스처(TEXTURE_SPEC=컬러 아트, "무엇을")와 구분되는 존 스텐실("어디에", 색은 앱이).
// 마커는 UI 상태일 뿐(Unity 무시), 마스크 픽셀은 브리지로 스왑·파일은 세션 한정.
const MASK_SPEC = {
  blush: { region: 'blush', appliedKey: 'blushMaskImported' },
  highlighter: { region: 'highlighter', appliedKey: 'highlightMaskImported' },
  contour: { region: 'contour', appliedKey: 'contourMaskImported' },
  eyeshadow: { region: 'eyeshadow', appliedKey: 'eyeshadowMaskImported' },
} as const;

// 질감 맵 임포트(#22, 에셋 3층의 ③) → setTextureMap region + 세션 적용 마커 필드.
// 마스크(MASK_SPEC="어디에")·텍스처(TEXTURE_SPEC=컬러 아트 "무엇을")와 구분되는
// "어떻게 빛나는지"(광 지도). 마스크와 동일한 룩-화해(reconcile) 방식 — 마커는 UI
// 상태일 뿐(Unity 무시), 맵 픽셀은 브리지로 스왑·파일은 세션 한정(저장 스냅샷 미포함).
const TEXTUREMAP_SPEC = {
  lip: { region: 'lip', appliedKey: 'lipFinishMapImported' },
  eyeshadow: { region: 'eyeshadow', appliedKey: 'eyeshadowFinishMapImported' },
  blush: { region: 'blush', appliedKey: 'blushFinishMapImported' },
} as const;

type StencilARAppProps = {
  onBack?: () => void;
};

function App({ onBack }: StencilARAppProps) {
  return (
    <SafeAreaProvider>
      <FilterScreen onBack={onBack} />
    </SafeAreaProvider>
  );
}

function FilterScreen({ onBack }: StencilARAppProps) {
  console.log('[RN] FilterScreen render');
  const insets = useSafeAreaInsets();
  const unityRef = useRef<UnityView | null>(null);
  const paramsRef = useRef<FilterParams>(BARE);
  const opacityRef = useRef(0.75); // 전역 메이크업 농도 (0~1) — 기본 75%

  const [unityReady, setUnityReady] = useState(false);
  const [faceTracked, setFaceTracked] = useState(false);
  const [params, setParams] = useState<FilterParams>(BARE);
  // photoUri = 전체화면 미리보기(개발용 UV 템플릿 export 전용). 실제 촬영은
  // 미리보기 대신 화면 깜빡임(flashOpacity)만 준다.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  // 갤러리 버튼 썸네일 — 이번 세션 마지막 촬영 사진(미리보기 닫아도 유지). 세션 한정.
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [photoVideo, setPhotoVideo] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  // ── 사전 촬영 미디어 보정(사진/영상) ──
  // editMode: 'none'=라이브 / 'photo'=사진 편집 중 / 'video'=영상 편집 중(첫 프레임 스틸).
  // editProgress: 영상 오프라인 처리 진행률(0..1) 또는 null(비진행). null이 아니면 전체
  // 화면을 덮는 진행 오버레이가 뜨고 조작을 막는다.
  const [editMode, setEditMode] = useState<'none' | 'photo' | 'video'>('none');
  const editModeRef = useRef<'none' | 'photo' | 'video'>('none');
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  const [editProgress, setEditProgress] = useState<number | null>(null);
  // 사용자 설정(배포용) — 개발자 캘리브레이션(settingsOpen)과 별개.
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  // 메시지 핸들러가 매번 재생성되지 않도록 최신 설정을 ref로도 보관(플래시 게이트용).
  const settingsRef = useRef(userSettings);
  // 격자(3분할) 구도 가이드 — 화면 프레이밍 보조. 캡처(Unity 오프스크린)엔 안 담긴다.
  const [gridOn, setGridOn] = useState(false);
  // UI 가리기 — 셔터·보이기 버튼만 남기고 나머지 UI를 숨겨 깔끔히 본다(저장물은 원래 UI 없음).
  const [uiHidden, setUiHidden] = useState(false);
  const [facing, setFacing] = useState<'front' | 'rear'>('front');
  // ready 재동기화(resyncAll)가 스테일 클로저 없이 읽도록 최신값 ref 미러.
  const facingRef = useRef<'front' | 'rear'>('front');
  const [calib, setCalib] = useState<CalibrationParams>(DEFAULT_CALIBRATION);
  const calibRef = useRef<CalibrationParams>(DEFAULT_CALIBRATION);
  // ── 룩 추출 진단(개발용, #1) — 마지막 측정치·게인·WB끄기·패널 토글 ──
  const [extractDiagOpen, setExtractDiagOpen] = useState(false);
  const [lastMeasurement, setLastMeasurement] = useState<LookMeasurement | null>(
    null,
  );
  const lastMeasurementRef = useRef<LookMeasurement | null>(null);
  const [extractGain, setExtractGain] = useState(1); // 추출 농도 게인 배율(0.5~6)
  const extractGainRef = useRef(1);
  const [extractNoWB, setExtractNoWB] = useState(false); // WB 끄기(다음 추출부터)
  const extractNoWBRef = useRef(false);
  // 추출에 쓴 원본 사진 URI(검증용) — 썸네일·확대 모달 표시. null=한 번도 추출 안 함.
  const [extractSourceUri, setExtractSourceUri] = useState<string | null>(null);
  const [opacity, setOpacityState] = useState(0.75); // 전역 메이크업 농도 슬라이더 — 기본 75%
  // 슬롯별 농도 게인(0..1, 없으면 1) — '전체' 외 카테고리 선택 시 그 슬롯만 조절.
  const [slotGain, setSlotGainState] = useState<SlotGain>({});
  const slotGainRef = useRef<SlotGain>({});
  // 현재 오버레이 스택 — 브리지 재전송용 최신값 (표시는 컴포저 트리가 담당)
  const overlayLayersRef = useRef<OverlayLayer[]>([]);
  // 현재 렌즈 레이어 스택(#25) — 브리지 재전송용 최신값 (표시는 컴포저 트리가 담당)
  const lensLayersRef = useRef<LensLayer[]>([]);
  const eyeshadowLayersRef = useRef<EyeshadowLayer[]>([]);
  // 디자이너 마스크(모양 축) 세션 상태 — 저장 스냅샷 미포함(파일은 세션 한정).
  //  maskPaths: 이번 세션에 임포트한 부위별 파일 경로.
  //  maskSent: Unity에 마지막으로 화해시킨 상태(경로=적용, null=절차 복원) — 룩 전환 시
  //   부위별 set/clear를 재조정하되 같은 상태면 재전송(파일 IO) 회피.
  const maskPathsRef = useRef<Partial<Record<MaskRegion, string>>>({});
  const maskSentRef = useRef<Record<MaskRegion, string | null>>({
    blush: null,
    highlighter: null,
    contour: null,
    eyeshadow: null,
  });
  // 질감 맵(#22) 세션 상태 — 마스크와 동형(저장 스냅샷 미포함, 파일은 세션 한정).
  //  mapPaths: 이번 세션에 임포트한 부위별 광 지도 파일 경로.
  //  mapSent: Unity에 마지막으로 화해시킨 상태(경로=적용, null=맵 해제) — 룩 전환 시
  //   부위별 set/clear를 재조정하되 같은 상태면 재전송(파일 IO) 회피.
  const mapPathsRef = useRef<Partial<Record<TextureMapRegion, string>>>({});
  const mapSentRef = useRef<Record<TextureMapRegion, string | null>>({
    lip: null,
    eyeshadow: null,
    blush: null,
  });

  // ── 두 레인 상태 (목업 v2 화면 01) ──────────────────────────────────────
  // LOOK 레인 — 작업본 룩 트리(사본 위 편집, 원본 불변) + 활성 칩 id
  const [lookTree, setLookTreeState] = useState<LookNode | null>(null);
  const lookTreeRef = useRef<LookNode | null>(null);
  const [lookSel, setLookSel] = useState('bare'); // 'bare' | 프리셋 id | 내 룩 id
  // 히스토리 스냅샷이 참조하는 활성 LOOK 칩 미러 — 렌더마다 state와 동기(아래 useEffect).
  // 편집 직전 캡처(before)는 커밋된 렌더값이면 충분하고, 복원 시엔 imperative로도 맞춘다.
  const lookSelRef = useRef('bare');
  // 라이브러리 — 시스템(코드 재생성) + 사용자(영속) 병합
  const [lookLibrary, setLookLibrary] = useState<LookLibrary>(SYSTEM_LIBRARY);
  const lookLibraryRef = useRef<LookLibrary>(SYSTEM_LIBRARY);
  // 보정 레인 — 보정 필터 사본 + 보정 강도(레인 마스터)
  const [warpLane, setWarpLaneState] = useState<WarpLane>(emptyWarpLane());
  const warpLaneRef = useRef<WarpLane>(warpLane);
  const [wpGain, setWpGainState] = useState(1);
  const wpGainRef = useRef(1);
  // 내 저장물 — 스타일(두 레인 쌍)·FIT 필터
  const [userStylesV2, setUserStylesV2] = useState<UserStyleV2[]>([]);
  const userStylesV2Ref = useRef<UserStyleV2[]>([]);
  const [userWarpFilters, setUserWarpFilters] = useState<UserWarpFilter[]>([]);
  const userWarpFiltersRef = useRef<UserWarpFilter[]>([]);
  // 제형 스튜디오(#21) — 저장된 커스텀 마감(제형). 마감 축 ◈ 칩.
  const [userFinishes, setUserFinishes] = useState<UserFinish[]>([]);
  const userFinishesRef = useRef<UserFinish[]>([]);
  // 에셋 카탈로그(§16) — 웹 GUI 매니페스트(번들 기본 + 사용자 저장/임포트) 병합 목록.
  // 임포트 픽커가 이 목록을 kind+region로 필터해 썸네일로 노출한다(apply-by-uri).
  const [catalog, setCatalog] = useState<CatalogManifest>(emptyCatalog());
  // 매니페스트 붙여넣기 임포트 모달 (웹 GUI export JSON — 새 네이티브 파일선택 없이).
  const [catalogImportOpen, setCatalogImportOpen] = useState(false);
  const [catalogImportText, setCatalogImportText] = useState('');
  // 원격 매니페스트 URL 임포트(§16 v2) — CDN manifest.json에서 바로 가져오기.
  const [catalogImportUrl, setCatalogImportUrl] = useState('');
  // "카탈로그에 저장" — 방금 사진 라이브러리로 임포트한 에셋(이름 입력 대기).
  const [saveDraft, setSaveDraft] = useState<{
    kind: AssetKind;
    region: string;
    uri: string;
    name: string;
  } | null>(null);
  // 보정 필터 저장 — 이름 입력 팝업(null=닫힘). 메이크업 저장 시트의 경량판.
  const [fitSaveName, setFitSaveName] = useState<string | null>(null);
  // 롱프레스 편집 중인 내 룩 (저장 시트 덮어쓰기 대상)
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  // 현재 컴파일 결과(FIT 곱하기 전) — FIT/농도만 바뀔 때 트리 재컴파일 없이 재방출
  const compiledRef = useRef<{
    params: FilterParams;
    overlayLayers: OverlayLayer[];
    lensLayers: LensLayer[];
    eyeshadowLayers: EyeshadowLayer[];
  }>({
    params: BARE,
    overlayLayers: [],
    lensLayers: [],
    eyeshadowLayers: [],
  });

  // ── 하단 파라미터 창의 2축 — 레인 × 깊이 ────────────────────────────────
  // 레인: 메이크업(색소)↔보정(FIT, 지오메트리 워프)↔가이드(#2 코치 스텝) — 최상위
  // 분리축(분류체계 정의 §2, 구 'domain'). 하단 세그먼트가 전환. 농도 슬라이더·본문이
  // 레인 따라 라우팅(메이크업=opacity/보정=wpGain/가이드=stencil.opacity).
  const [lane, setLane] = useState<'makeup' | 'warp' | 'guide'>('makeup');
  // 깊이: 기본(초보자, 부위 칩)↔상세(컴포저/보정 시트). 파라미터창 우상단 버튼이 전환.
  // 두 깊이가 같은 lookTree/fitLane을 공유해 전환해도 상태 연속(#24). UI 로컬 상태.
  const [mode, setMode] = useState<'basic' | 'detail'>('basic');
  // 파라미터 창 최소화(⌄/⌃) — App이 단일 소유(각 편집기 자체 최소화 대신 통합 헤더).
  const [panelMin, setPanelMin] = useState(false);
  // 설정(⚙️) 캘리브레이션·디버그 시트 — ⚙️ 토글로 좌측 스트립 여닫음(개발용).
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 튜토리얼 스텐실(#2) — "어디에 바르는지" 가이드 라인. 하단 **가이드 레인**이 UI
  // 진입점: 레인 진입=켬 / 이탈=끔(switchDomain이 구동). 별도 ON/OFF 버튼 없음 —
  // ref가 "가이드 레인 활성" 단일 출처(대칭 오버레이도 이 ref를 따라간다).
  const stencilEnabledRef = useRef(false);
  const [stencil, setStencilState] = useState<StencilParams>(DEFAULT_STENCIL);
  const stencilRef = useRef<StencilParams>(DEFAULT_STENCIL);
  // 가이드는 현재 룩에 실제 있는 부위만 그린다(안 올린 부위엔 가이드 없음). 룩에서 유도.
  const availableStencilKeysRef = useRef<Set<string>>(new Set());

  // 좌우 대칭 가이드(#6) — 가이드 레인에서만 활성(레인 이탈=오버레이 끔). 중심축·
  // 대칭쌍 칩 상태는 유저 선호로 유지돼, 레인에 다시 들어오면 켜둔 조합이 복원된다.
  // 첫 진입 기본은 둘 다 OFF(DEFAULT_SYMMETRY).
  const [symmetry, setSymmetryState] = useState<SymmetryParams>(DEFAULT_SYMMETRY);
  const symmetryRef = useRef<SymmetryParams>(DEFAULT_SYMMETRY);

  // 조명 시뮬레이션(#4) — open=패널 표시만. 프리셋 선택=즉시 적용(enabled 모델 없음,
  // '끔' 프리셋=원본). 패널을 닫아도 고른 조명은 유지된다.
  const [lightingOpen, setLightingOpen] = useState(false);
  const lightingOpenRef = useRef(false);
  const [lighting, setLightingState] = useState<LightingParams>(DEFAULT_LIGHTING);
  const lightingRef = useRef<LightingParams>(DEFAULT_LIGHTING);

  // 향수 추천(#7) — 순수 RN 계산 패널(Unity 무관). open=표시 토글만.
  const [perfumeOpen, setPerfumeOpen] = useState(false);
  const perfumeOpenRef = useRef(false);

  // 체형 체크 — 순수 RN 설문·진단 패널(Unity 무관). open=표시 토글만.
  const [bodyOpen, setBodyOpen] = useState(false);
  const bodyOpenRef = useRef(false);

  // 헤어 추천 — 얼굴형·두상·모발 프로필 기반 스타일 순위. 순수 RN 패널(Unity 무관).
  const [hairOpen, setHairOpen] = useState(false);
  const hairOpenRef = useRef(false);

  // 반반 모드 — 전체(0)/왼쪽(1)/오른쪽(2). 상단 세그먼트로 전환. 가이드는 Unity가
  // 전역 분할선으로 자동 추종하므로 RN은 setSplit만 보내면 된다.
  const [splitMode, setSplitModeState] = useState(0);
  const splitModeRef = useRef(0);

  // 내 핏(§5 A13) — 핏 시트 라이브러리 + 메인 시트. 컴파일 직전 단일 적용점
  // (applyFitToLayers)에서 잎에 얹힌다. 룩·보정과 별개 저장물(FitSheetsStore).
  const [fitSheets, setFitSheets] = useState<FitSheetData[]>([]);
  const fitSheetsRef = useRef<FitSheetData[]>([]);
  const [mainFitId, setMainFitId] = useState<string | null>(null);
  const mainFitIdRef = useRef<string | null>(null);
  // 내 핏 패널 — 하단 레인 탭이 아니라 우측 도구 레일 토글(가이드/대칭/조명과
  // 동렬: 룩과 독립인 개인 도구). 명시 진입(§5) 원칙의 문이 레일 토글이 된다.
  // 장래 온페이스 핸들 모드(A17 — 얼굴 위 골드 점 드래그)도 같은 토글로 진입.
  const [fitPanelOpen, setFitPanelOpen] = useState(false);
  const fitPanelOpenRef = useRef(false);
  // 스튜디오 허브(A18) — 저작·관리 풀시트: 핏 시트 만들기/관리·에셋 카탈로그·제품
  // 만들기(A12). 핏 조정 진입도 여기('🎯 조정' — 레일 핏 버튼 폐지): 스튜디오를
  // 닫고 카메라 위 핏 패널을 그 시트로 연다.
  const [studioOpen, setStudioOpen] = useState(false);
  // "이 겹 핏 조정"(§5 A13) — 컴포저 잎에서 승격된 겹id 셀렉터 편집 초점.
  const [fitFocus, setFitFocus] = useState<{
    region: RegionKey;
    leafId?: string;
  } | null>(null);
  // 스튜디오 '조정' 진입 시 초기 선택 시트 — 핏 패널이 열릴 때 한 번 읽는다.
  const [fitInitialSheet, setFitInitialSheet] = useState<string | null>(null);
  // 온페이스 핏 핸들(A17) — Unity가 방출한 핸들 좌표(핏 패널 열림 동안 ~10Hz).
  const [fitHandlesMsg, setFitHandlesMsg] = useState<{
    handles: { key: string; x: number; y: number }[];
    eyeVp: number;
  } | null>(null);
  const fitHandlesEyeVpRef = useRef(0.12);
  // 내 제품(A12 후반) — 스튜디오에서 저작한 커스텀 ProductDef. 번역기·제품 칩이 소비.
  const [userProducts, setUserProducts] = useState<ProductDef[]>([]);
  const userProductsRef = useRef<ProductDef[]>([]);
  // 드래그 시작 시점의 룰 값(필드별) — WYSIWYG: 최종값 = 시작값 + 총델타.
  const handleDragStartRef = useRef<Record<string, number>>({});
  // 핏 프리즈("사진 찍고 그 위에서 수정") 상태 기계 — capture→enterPhotoEdit→frozen.
  // editMode(갤러리 편집)와 별개: UI는 평소대로, Unity만 정지 스틸 위에서 돈다.
  const fitFreezeRef = useRef<'off' | 'capturing' | 'entering' | 'frozen'>('off');


  // ── 편집 히스토리(undo/redo) — 룩 트리 + 보정(warpLane/wpGain/opacity) 통합 스택 ──
  //  편집 직전 상태를 commitEdit로 past에 push(redo 클리어). undo/redo는 현재 상태를
  //  반대쪽으로 옮기며 스냅샷을 복원(revive+재컴파일). 슬라이더 드래그처럼 연속 변경은
  //  같은 tag가 짧은 시간 내면 첫 tick만 기록(코얼레스)해 스택 폭주를 막는다.
  const historyRef = useRef<History.HistoryState>(History.emptyHistory());
  const histTagRef = useRef<{ tag: string; time: number } | null>(null);
  // 이산 편집(칩/룩·핏 선택/구조 편집)이 코얼레스로 병합되지 않도록 매번 새 유니크 태그.
  const histSeqRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saveCtx, setSaveCtx] = useState<{
    defaultName: string;
    items: SaveItem[];
  } | null>(null);

  // lookSelRef를 state와 동기 — 렌더 커밋 후 미러 갱신(편집 직전 캡처용).
  useEffect(() => {
    lookSelRef.current = lookSel;
  }, [lookSel]);

  // 앱 시작 시 저장물 로드 (실패해도 빈 목록으로 무해). v1 스타일은 lookStore가
  // 자동 마이그레이션한다(트리 없음 → 컴파일 fast-path).
  useEffect(() => {
    loadUserStylesV2().then(styles => {
      userStylesV2Ref.current = styles;
      setUserStylesV2(styles);
    });
    loadUserWarpFilters().then(filters => {
      userWarpFiltersRef.current = filters;
      setUserWarpFilters(filters);
    });
    // 내 제품(A12) — 컴포저 제품 칩·컴파일 번역기가 소비.
    loadUserProducts().then(products => {
      userProductsRef.current = products;
      setUserProducts(products);
    });
    // 내 핏(§5 A13) — 시트가 있으면 다음 컴파일부터 자동 적용(메인 시트).
    loadFitSheets().then(store => {
      fitSheetsRef.current = store.sheets;
      mainFitIdRef.current = store.mainId;
      setFitSheets(store.sheets);
      setMainFitId(store.mainId);
    });
    loadUserLibrary().then(userLib => {
      const merged = { ...SYSTEM_LIBRARY, ...userLib };
      lookLibraryRef.current = merged;
      setLookLibrary(merged);
    });
    loadUserFinishes().then(finishes => {
      userFinishesRef.current = finishes;
      setUserFinishes(finishes);
    });
    // 에셋 카탈로그 로드 — 실패해도 빈 목록으로 무해(픽커는 "파일에서" 경로 유지).
    loadCatalogStore().then(setCatalog);
  }, []);

  const sendToUnity = useCallback((msg: RNToUnityMessage) => {
    unityRef.current?.postMessage(
      'NativeBridge',
      'OnMessageFromRN',
      JSON.stringify(msg),
    );
  }, []);

  // base(풀강도 룩)에 전역 농도 × 슬롯 게인을 곱해 Unity로 전송. base는 표시·조정용 그대로.
  const sendScaled = useCallback(
    (base: FilterParams, op: number, sg: SlotGain = slotGainRef.current) => {
      const scaled = scaleParams(base, op, sg);
      sendToUnity({ type: 'applyFilter', filter: scaled });
    },
    [sendToUnity],
  );

  const applyParams = useCallback(
    (next: FilterParams) => {
      paramsRef.current = next;
      setParams(next);
      sendScaled(next, opacityRef.current);
    },
    [sendScaled],
  );

  const setOpacity = useCallback(
    (v: number) => {
      opacityRef.current = v;
      setOpacityState(v);
      sendScaled(paramsRef.current, v);
    },
    [sendScaled],
  );

  // 슬롯별 농도 — 그 슬롯 부위만 재스케일해 전송(전역 opacity와 곱). 카테고리 선택 시.
  const setSlotGain = useCallback(
    (slot: SlotKey, v: number) => {
      const next = { ...slotGainRef.current, [slot]: v };
      slotGainRef.current = next;
      setSlotGainState(next);
      sendScaled(paramsRef.current, opacityRef.current, next);
    },
    [sendScaled],
  );

  const applyOverlayLayers = useCallback(
    (layers: OverlayLayer[]) => {
      overlayLayersRef.current = layers;
      sendToUnity({ type: 'setOverlayLayers', overlayLayers: layers });
    },
    [sendToUnity],
  );

  // 렌즈 레이어 스택(#25) 재전송 — setOverlayLayers와 동형(전 슬롯 교체). 빈 배열이면
  // Unity가 레이어드 끄고 legacy irisColor/irisIntensity 어댑터로 복귀(하위호환).
  const applyLensLayers = useCallback(
    (layers: LensLayer[]) => {
      lensLayersRef.current = layers;
      sendToUnity({ type: 'setLensLayers', lensLayers: layers });
    },
    [sendToUnity],
  );

  // 아이섀도 멀티밴드(A14) 재전송 — 겹 2+면 배열, 1 이하면 빈 배열(Unity legacy 스칼라).
  const applyEyeshadowLayers = useCallback(
    (layers: EyeshadowLayer[]) => {
      eyeshadowLayersRef.current = layers;
      sendToUnity({ type: 'setEyeshadowLayers', eyeshadowLayers: layers });
    },
    [sendToUnity],
  );

  // 튜토리얼 스텐실(#2) 전송 — active(=enabled)면 현재 농도, 아니면 농도 0으로 숨긴다
  // (부위/농도 상태는 유지). 패널 열림과 독립 — 닫아도 활성이면 계속 보인다.
  const pushStencil = useCallback(
    (p: StencilParams, active: boolean) => {
      // 룩에 없는 부위는 강제로 끔 — 안 올린 부위에 가이드가 뜨지 않게.
      const masked = maskStencilByKeys(p, availableStencilKeysRef.current);
      sendToUnity({
        type: 'setStencil',
        stencil: active ? masked : { ...masked, opacity: 0 },
      });
    },
    [sendToUnity],
  );

  const applyStencil = useCallback(
    (next: StencilParams) => {
      stencilRef.current = next;
      setStencilState(next);
      pushStencil(next, stencilEnabledRef.current);
    },
    [pushStencil],
  );

  // 가이드 농도 — 공용 헤더 슬라이더의 가이드 레인 라우팅(메이크업 opacity와 동렬).
  const setStencilOpacity = useCallback(
    (v: number) => {
      applyStencil({ ...stencilRef.current, opacity: v });
    },
    [applyStencil],
  );

  // 좌우 대칭 가이드(#6) — 스텐실 전송과 동형. active=가이드 레인 활성(stencilEnabledRef)
  // — 대칭은 가이드 레인에서만 그려지고, 칩(중심축·대칭쌍) 조합은 상태로 유지된다.
  const pushSymmetry = useCallback(
    (p: SymmetryParams, active: boolean) => {
      sendToUnity({
        type: 'setSymmetry',
        symmetry: active ? p : { ...p, opacity: 0 },
      });
    },
    [sendToUnity],
  );

  const applySymmetry = useCallback(
    (next: SymmetryParams) => {
      symmetryRef.current = next;
      setSymmetryState(next);
      pushSymmetry(next, stencilEnabledRef.current);
    },
    [pushSymmetry],
  );

  // 조명 시뮬레이션(#4) — 프리셋을 고르면 즉시 적용(별도 ON/OFF 없음). '끔'=preset 0
  // =원본 복귀(Unity 규약). 패널을 닫아도 고른 조명은 유지된다.
  const applyLighting = useCallback(
    (next: LightingParams) => {
      lightingRef.current = next;
      setLightingState(next);
      sendToUnity({ type: 'setLighting', lighting: next });
    },
    [sendToUnity],
  );

  // ── 도구 레일 패널(조명/설정/핏)은 상호 배타 ──
  // 하나를 열면 나머지 열려 있던 패널을 닫는다. 조명은 열림=활성 모델이라 닫을 때
  // 오버레이도 끈다. 설정은 로컬 상태만 닫는다.
  // (가이드(#2)=하단 가이드 레인으로 승격, 대칭(#6)=가이드 패널 안 컨트롤로 이동.)
  const closeLightingIfOpen = useCallback(() => {
    if (!lightingOpenRef.current) return;
    lightingOpenRef.current = false;
    setLightingOpen(false);
  }, []);
  const closeSettingsIfOpen = useCallback(() => setUserSettingsOpen(false), []);
  const closeFitPanelIfOpen = useCallback(() => {
    if (!fitPanelOpenRef.current) return;
    fitPanelOpenRef.current = false;
    setFitPanelOpen(false);
  }, []);
  const closePerfumeIfOpen = useCallback(() => {
    if (!perfumeOpenRef.current) return;
    perfumeOpenRef.current = false;
    setPerfumeOpen(false);
  }, []);
  const closeBodyIfOpen = useCallback(() => {
    if (!bodyOpenRef.current) return;
    bodyOpenRef.current = false;
    setBodyOpen(false);
  }, []);
  const closeHairIfOpen = useCallback(() => {
    if (!hairOpenRef.current) return;
    hairOpenRef.current = false;
    setHairOpen(false);
  }, []);

  const toggleLighting = useCallback(() => {
    const open = !lightingOpenRef.current;
    lightingOpenRef.current = open;
    setLightingOpen(open); // 표시 토글만 — 활성은 패널 안 ON/OFF가 담당
    if (open) {
      closeSettingsIfOpen();
      closeFitPanelIfOpen();
      closePerfumeIfOpen();
      closeBodyIfOpen();
      closeHairIfOpen();
    }
  }, [closeSettingsIfOpen, closeFitPanelIfOpen, closePerfumeIfOpen, closeBodyIfOpen, closeHairIfOpen]);

  const togglePerfume = useCallback(() => {
    const open = !perfumeOpenRef.current;
    perfumeOpenRef.current = open;
    setPerfumeOpen(open);
    if (open) {
      closeLightingIfOpen();
      closeSettingsIfOpen();
      closeFitPanelIfOpen();
      closeBodyIfOpen();
      closeHairIfOpen();
    }
  }, [closeLightingIfOpen, closeSettingsIfOpen, closeFitPanelIfOpen, closeBodyIfOpen, closeHairIfOpen]);

  const toggleBody = useCallback(() => {
    const open = !bodyOpenRef.current;
    bodyOpenRef.current = open;
    setBodyOpen(open);
    if (open) {
      closeLightingIfOpen();
      closeSettingsIfOpen();
      closeFitPanelIfOpen();
      closePerfumeIfOpen();
      closeHairIfOpen();
    }
  }, [closeLightingIfOpen, closeSettingsIfOpen, closeFitPanelIfOpen, closePerfumeIfOpen, closeHairIfOpen]);

  const toggleHair = useCallback(() => {
    const open = !hairOpenRef.current;
    hairOpenRef.current = open;
    setHairOpen(open);
    if (open) {
      closeLightingIfOpen();
      closeSettingsIfOpen();
      closeFitPanelIfOpen();
      closePerfumeIfOpen();
      closeBodyIfOpen();
    }
  }, [closeLightingIfOpen, closeSettingsIfOpen, closeFitPanelIfOpen, closePerfumeIfOpen, closeBodyIfOpen]);

  const toggleUserSettings = useCallback(() => {
    setUserSettingsOpen(prev => {
      const open = !prev;
      if (open) {
        closeLightingIfOpen();
        closeFitPanelIfOpen();
        closePerfumeIfOpen();
        closeBodyIfOpen();
        closeHairIfOpen();
      }
      return open;
    });
  }, [closeLightingIfOpen, closeFitPanelIfOpen, closePerfumeIfOpen, closeBodyIfOpen, closeHairIfOpen]);

  // 내 핏 패널 토글(§5 A13) — 다른 레일 패널과 상호 배타. 핏 적용 자체는 시트가
  // 있는 한 상시(패널 표시와 독립 — 가이드의 open/enabled 분리와 같은 모델).
  // 열림 = 온페이스 핸들 모드(A17)도 함께 — Unity에 좌표 방출을 켜고 끈다.
  const toggleFitPanel = useCallback(() => {
    const open = !fitPanelOpenRef.current;
    fitPanelOpenRef.current = open;
    setFitPanelOpen(open);
    if (open) {
      closeLightingIfOpen();
      closeSettingsIfOpen();
      closePerfumeIfOpen();
      closeBodyIfOpen();
      closeHairIfOpen();
      // 프리즈 진입("사진 찍고 그 위에서 수정") — 라이브면 촬영→정지 편집으로.
      // 이미 사진/영상 편집 중이면 그 스틸이 곧 정지 화면이라 핸들만 켠다.
      if (editModeRef.current === 'none') {
        fitFreezeRef.current = 'capturing';
        sendToUnity({ type: 'capture' });
      } else {
        sendToUnity({ type: 'setFitHandles', fitHandles: true });
      }
    } else {
      sendToUnity({ type: 'setFitHandles', fitHandles: false });
      setFitHandlesMsg(null);
      if (fitFreezeRef.current === 'frozen') sendToUnity({ type: 'exitEdit' });
      fitFreezeRef.current = 'off';
    }
  }, [sendToUnity, closeLightingIfOpen, closeSettingsIfOpen, closePerfumeIfOpen, closeBodyIfOpen, closeHairIfOpen]);


  // 반반 모드 — 전체/왼쪽/오른쪽. Unity가 전역 분할선으로 복원 쿼드·가이드를 함께 몬다.
  const applySplitMode = useCallback(
    (next: number) => {
      splitModeRef.current = next;
      setSplitModeState(next);
      sendToUnity({ type: 'setSplit', split: { mode: next } });
    },
    [sendToUnity],
  );

  // 디자이너 마스크(모양 축) 룩 상태 화해 — 컴파일된 룩의 부위별 마커를 보고 Unity
  // 마스크 슬롯을 set/clear로 맞춘다. 텍스처 임포트는 intensity가 compileLayers로 룩을
  // 따라다녀 자동 게이트되지만, 마스크는 Unity 게이트 필드가 없어(공유 머티리얼 슬롯)
  // 룩 전환 시 명시적으로 화해시켜야 A룩 마스크가 B룩에 새는 것을 막는다.
  // 마커1인데 세션 경로 없음(저장/재로드 후) = clear가 정직 — 파일 미보존 한계.
  const reconcileMasks = useCallback(
    (p: FilterParams) => {
      (Object.keys(MASK_SPEC) as MaskRegion[]).forEach(mr => {
        const { region, appliedKey } = MASK_SPEC[mr];
        const marker = (p[appliedKey] as number | undefined) ?? 0;
        const sessionPath = maskPathsRef.current[mr];
        const desired = marker > 0 && sessionPath ? sessionPath : null;
        if (maskSentRef.current[mr] === desired) return; // 변화 시에만 (재로드/IO 회피)
        maskSentRef.current[mr] = desired;
        sendToUnity({ type: 'setRegionMask', region, path: desired ?? '' });
      });
    },
    [sendToUnity],
  );

  // 질감 맵(#22) 룩 상태 화해 — reconcileMasks와 동형. 컴파일된 룩의 부위별 마커를 보고
  // Unity 광 지도 슬롯을 set/clear로 맞춘다. 마스크와 마찬가지로 Unity 게이트 필드가
  // 없어(공유 머티리얼 슬롯) 룩 전환 시 명시적으로 화해시켜야 A룩 맵이 B룩에 새지 않는다.
  const reconcileMaps = useCallback(
    (p: FilterParams) => {
      (Object.keys(TEXTUREMAP_SPEC) as TextureMapRegion[]).forEach(tr => {
        const { region, appliedKey } = TEXTUREMAP_SPEC[tr];
        const marker = (p[appliedKey] as number | undefined) ?? 0;
        const sessionPath = mapPathsRef.current[tr];
        const desired = marker > 0 && sessionPath ? sessionPath : null;
        if (mapSentRef.current[tr] === desired) return; // 변화 시에만 (재로드/IO 회피)
        mapSentRef.current[tr] = desired;
        sendToUnity({ type: 'setTextureMap', region, path: desired ?? '' });
      });
    },
    [sendToUnity],
  );

  // ── 방출 파이프라인 — 컴파일 결과에 보정 레인을 기입해 브리지로 ──────────
  // applyFitToParams가 항상 전체 워프 키를 기입해 이전 필터 잔재를 지운다.
  const emitCompiled = useCallback(
    (
      compiled: {
        params: FilterParams;
        overlayLayers: OverlayLayer[];
        lensLayers: LensLayer[];
        eyeshadowLayers?: EyeshadowLayer[];
      },
      warp: WarpLane,
      gain: number,
    ) => {
      compiledRef.current = {
        ...compiled,
        eyeshadowLayers: compiled.eyeshadowLayers ?? [],
      };
      applyParams(applyWarpToParams(compiled.params, warp, gain));
      applyOverlayLayers(compiled.overlayLayers);
      // 렌즈 레이어드(#25) — 전 슬롯 교체. 빈 배열이면 legacy 어댑터 복귀(룩 전환 누수 방지).
      applyLensLayers(compiled.lensLayers);
      // 아이섀도 멀티밴드(A14) — 겹 2+면 배열, 아니면 빈 배열로 스칼라 경로 복귀.
      applyEyeshadowLayers(compiled.eyeshadowLayers ?? []);
      // 마스크는 워프 대상이 아니라 마커만 보면 되므로 컴파일 결과(워프 전)로 화해.
      reconcileMasks(compiled.params);
      // 질감 맵(#22)도 마커 기반 화해(마스크와 동일 경로 — 룩 전환 누수 방지).
      reconcileMaps(compiled.params);
    },
    [applyParams, applyOverlayLayers, applyLensLayers, applyEyeshadowLayers, reconcileMasks, reconcileMaps],
  );

  // 트리 → 컴파일. §5 단일 적용점 사슬: 제품 번역(A12 — productId 잎에 색·마감·
  // 농도 깔기) → 핏 델타(A13 — 개인 공간 조정) → 컴파일. 전부 잎 사본, 트리 무변경.
  const compileWithFit = useCallback(
    (root: LookNode | null) =>
      compileLayers(
        applyFitToLayers(applyProductsToLayers(flattenTree(root), userProductsRef.current), {
          sheets: fitSheetsRef.current,
          mainId: mainFitIdRef.current,
        }),
      ),
    [],
  );

  // 트리 변경 → flattenTree(+핏) → compileLayers → 방출 (라이브 반영)
  const changeTree = useCallback(
    (next: LookNode | null) => {
      lookTreeRef.current = next;
      setLookTreeState(next);
      emitCompiled(compileWithFit(next), warpLaneRef.current, wpGainRef.current);
    },
    [emitCompiled, compileWithFit],
  );

  // 내 핏 변경(패널 콜백) — 상태·미러 갱신, best-effort 저장, 현재 룩 재컴파일.
  // 히스토리(undo/redo)에는 안 태운다(룩 편집이 아니라 내 프로필 편집 — 별개 축).
  const changeFitSheets = useCallback(
    (sheets: FitSheetData[], mainId: string | null) => {
      fitSheetsRef.current = sheets;
      mainFitIdRef.current = mainId;
      setFitSheets(sheets);
      setMainFitId(mainId);
      saveFitSheets({ sheets, mainId });
      emitCompiled(
        compileWithFit(lookTreeRef.current),
        warpLaneRef.current,
        wpGainRef.current,
      );
    },
    [emitCompiled, compileWithFit],
  );

  // 온페이스 핸들 드래그(A17 v2) → 메인 핏 시트에 "겹 단위(#겹id)" 델타 기록.
  // 점 key = `${부위앵커L|R}#${leafId}` — 겹마다 점(사용자 요구). 델타 = (뷰포트
  // 총델타 / eyeVp) × k, k는 실기기 튜닝 대상. dxOut = 얼굴 바깥(+): L=-dx, R=+dx.
  // 데코 겹은 배치(dx/dy 캐노니컬 UV)를 직접 이동(dUV = dVp × 0.39/eyeVp 근사 —
  // 0.39 = 캐노니컬 눈꼬리간 거리). 마스크/파라미터 부위는 겹별로 저장되지만
  // 렌더는 아직 부위 단위 합침(엔진 멀티밴드 후속 — §5 A13 렌더 스코프).
  const onHandleDelta = useCallback(
    (key: string, dxVp: number, dyVpUp: number, phase: 'start' | 'move' | 'end') => {
      const ANCHOR_RULES: Record<
        string,
        {
          region?: RegionKey; // 미지정 = 잎의 자기 region(눈썹 슬롯 공유 등)
          dyUp?: { field: string; k: number };
          dxOut?: { field: string; k: number };
        }
      > = {
        blush: {
          region: 'blush',
          dyUp: { field: 'blushLift', k: 0.35 },
          dxOut: { field: 'blushSpread', k: 0.35 },
        },
        wing: { region: 'eyelinerUpper', dxOut: { field: 'eyelinerWingLength', k: 3.0 } },
        aegyo: { region: 'aegyo', dyUp: { field: 'aegyoHeight', k: -2.0 } },
        eyeshadow: { region: 'eyeshadow', dyUp: { field: 'eyeshadowHeight', k: 1.2 } },
        doubleLid: { region: 'doubleLid', dyUp: { field: 'doubleLidHeight', k: 1.0 } },
        mascara: { region: 'mascara', dyUp: { field: 'mascaraLength', k: 1.3 } },
        lowerMascara: {
          region: 'lowerMascara',
          dyUp: { field: 'lowerLashLength', k: -1.3 },
        },
        brow: { dyUp: { field: 'browArch', k: 0.35 } }, // 눈썹 슬롯 공유 — 잎 region 사용
        lip: { region: 'lip', dyUp: { field: 'lipOverline', k: 0.8 } },
      };
      const [rawAnchor, leafId] = key.split('#');
      if (!leafId) return;
      const leaf = flattenTree(lookTreeRef.current).find(l => l.id === leafId);
      if (!leaf) return;
      const side = rawAnchor.endsWith('L') ? 'L' : rawAnchor.endsWith('R') ? 'R' : '';
      const anchor = side ? rawAnchor.slice(0, -1) : rawAnchor.replace(/\d+$/, '');
      const eyeVp = fitHandlesEyeVpRef.current || 0.12;

      // 시트 확보 — 없으면 자동 생성(조정의 연속이라 스튜디오 강제 진입 안 함).
      let sheets = fitSheetsRef.current;
      let mainId = mainFitIdRef.current;
      let sheet = sheets.find(sh => sh.id === mainId) ?? sheets[0];
      if (!sheet) {
        sheet = newFitSheet('내 핏 1');
        sheets = [sheet];
        mainId = sheet.id;
      }

      // 데코 겹 — 배치 직접 이동(#겹id의 dx/dy).
      if (anchor === 'deco') {
        const sel = { region: leaf.region, leafId };
        if (phase === 'start') {
          const entry = entryOf(sheet, sel);
          handleDragStartRef.current = { dx: entry?.dx ?? 0, dy: entry?.dy ?? 0 };
          if (sheets !== fitSheetsRef.current) changeFitSheets(sheets, mainId);
          return;
        }
        const toUv = 0.39 / eyeVp; // 캐노니컬 눈간 0.39 기준 근사
        const nextSheet = upsertEntry(sheet, sel, {
          dx: (handleDragStartRef.current.dx ?? 0) + dxVp * toUv,
          dy: (handleDragStartRef.current.dy ?? 0) + dyVpUp * toUv,
        });
        changeFitSheets(
          sheets.map(sh => (sh.id === nextSheet.id ? nextSheet : sh)),
          mainId,
        );
        return;
      }

      const spec = ANCHOR_RULES[anchor];
      if (!spec) return;
      const region = spec.region ?? leaf.region;
      const sel = { region, leafId };
      if (phase === 'start') {
        const entry = entryOf(sheet, sel);
        const startVals: Record<string, number> = {};
        if (spec.dyUp) startVals[spec.dyUp.field] = entry?.rules?.[spec.dyUp.field] ?? 0;
        if (spec.dxOut) startVals[spec.dxOut.field] = entry?.rules?.[spec.dxOut.field] ?? 0;
        handleDragStartRef.current = startVals;
        if (sheets !== fitSheetsRef.current) changeFitSheets(sheets, mainId);
        return;
      }
      const out = side === 'L' ? -dxVp : dxVp;
      const rules: Record<string, number> = {};
      if (spec.dyUp) {
        rules[spec.dyUp.field] =
          (handleDragStartRef.current[spec.dyUp.field] ?? 0) +
          (dyVpUp / eyeVp) * spec.dyUp.k;
      }
      if (spec.dxOut) {
        rules[spec.dxOut.field] =
          (handleDragStartRef.current[spec.dxOut.field] ?? 0) +
          (out / eyeVp) * spec.dxOut.k;
      }
      const nextSheet = upsertEntry(sheet, sel, { rules });
      changeFitSheets(
        sheets.map(sh => (sh.id === nextSheet.id ? nextSheet : sh)),
        mainId,
      );
    },
    [changeFitSheets],
  );

  // 핸들 팬아웃(A17 v2) — Unity 부위 앵커 × 현재 룩의 보이는 겹 = 점("겹마다 점").
  // 룩에 없는 부위 앵커는 자동 필터, 같은 부위 다겹은 부채꼴+번호. 데코는 겹별
  // 앵커가 이미 따로 옴(deco0..3 = 컴파일 순서의 보이는 데코 겹).
  const expandedHandles = useMemo<FitHandlePoint[]>(() => {
    if (!fitHandlesMsg) return [];
    const byRegion = new Map<string, string[]>();
    const decoIds: string[] = [];
    for (const l of flattenTree(lookTree)) {
      if (isDecoRegion(l.region)) {
        if (l.overlay) decoIds.push(l.id);
        continue;
      }
      const arr = byRegion.get(l.region) ?? [];
      arr.push(l.id);
      byRegion.set(l.region, arr);
    }
    const leavesFor = (anchor: string): string[] => {
      if (anchor === 'brow') {
        // 눈썹 슬롯 공유 필드 — 슬롯의 모든 겹(부위 6종이 전부 'brow' 접두)
        const ids: string[] = [];
        for (const [r, arr] of byRegion) if (r.startsWith('brow')) ids.push(...arr);
        return ids;
      }
      return byRegion.get(anchor) ?? [];
    };
    const ANCHOR_REGION: Record<string, string> = {
      blush: 'blush',
      wing: 'eyelinerUpper',
      aegyo: 'aegyo',
      eyeshadow: 'eyeshadow',
      doubleLid: 'doubleLid',
      mascara: 'mascara',
      lowerMascara: 'lowerMascara',
      brow: 'brow',
      lip: 'lip',
    };
    const out: FitHandlePoint[] = [];
    for (const h of fitHandlesMsg.handles) {
      if (!h.key) continue;
      if (h.key.startsWith('deco')) {
        const idx = Number(h.key.slice(4));
        const leafId = decoIds[idx];
        if (leafId) {
          out.push({
            key: `${h.key}#${leafId}`,
            x: h.x,
            y: h.y,
            label: decoIds.length > 1 ? String(idx + 1) : undefined,
          });
        }
        continue;
      }
      const side = h.key.endsWith('L') || h.key.endsWith('R') ? h.key.slice(-1) : '';
      const anchor = side ? h.key.slice(0, -1) : h.key;
      const regionKey = ANCHOR_REGION[anchor];
      if (!regionKey) continue;
      const leaves = leavesFor(regionKey === 'brow' ? 'brow' : regionKey);
      leaves.forEach((leafId, i) => {
        out.push({
          key: `${h.key}#${leafId}`,
          x: h.x,
          y: h.y,
          stack: i,
          label: leaves.length > 1 ? String(i + 1) : undefined,
        });
      });
    }
    return out;
  }, [fitHandlesMsg, lookTree]);


  // ── 편집 히스토리(undo/redo) ─────────────────────────────────────────────
  // 현재 편집 상태 스냅샷 — 룩 트리 + 활성 칩(lookSel) + 보정(warpLane/wpGain/opacity) 통합.
  const snapshotState = useCallback(
    (): EditSnapshot => ({
      look: lookTreeRef.current ? snapshotTree(lookTreeRef.current) : null,
      lookSel: lookSelRef.current,
      warp: {
        ref: warpLaneRef.current.ref,
        name: warpLaneRef.current.name,
        params: { ...warpLaneRef.current.params },
        dirty: warpLaneRef.current.dirty,
      },
      wpGain: wpGainRef.current,
      opacity: opacityRef.current,
    }),
    [],
  );

  // 두 스냅샷 동일 여부 — no-op 편집이 죽은 히스토리 엔트리를 만들지 않게 판정(직렬화 비교).
  const snapEqual = useCallback((a: EditSnapshot, b: EditSnapshot): boolean => {
    return (
      a.opacity === b.opacity &&
      a.wpGain === b.wpGain &&
      a.lookSel === b.lookSel &&
      JSON.stringify(a.warp) === JSON.stringify(b.warp) &&
      JSON.stringify(a.look) === JSON.stringify(b.look)
    );
  }, []);

  // 이산 편집용 유니크 태그 — 코얼레스로 병합되지 않음(각 편집 = 1스텝).
  const uniqueTag = useCallback(() => `edit:${(histSeqRef.current += 1)}`, []);

  // 편집 실행 + 히스토리 커밋. before=편집 직전, after=편집 후를 비교해:
  //  - 상태 무변화면 기록 안 함(no-op 죽은 엔트리 방지, MED#4).
  //  - 같은 tag가 코얼레스 창 내면 첫 before만 유지(연속 드래그 한 컨트롤 = 1스텝, MED#3).
  //    tag를 컨트롤 단위(slider:<control>)로 세분하고 이산 편집엔 유니크 태그를 줘서
  //    서로 다른 컨트롤/이산 액션은 절대 병합되지 않는다.
  const commitEdit = useCallback(
    (tag: string, run: () => void) => {
      const before = snapshotState();
      run();
      const after = snapshotState();
      if (snapEqual(before, after)) return; // 무변화 → 기록 안 함
      const now = Date.now();
      const last = histTagRef.current;
      histTagRef.current = { tag, time: now };
      if (last && last.tag === tag && now - last.time < HIST_COALESCE_MS) return;
      historyRef.current = History.record(historyRef.current, before);
      setCanUndo(true);
      setCanRedo(false);
    },
    [snapshotState, snapEqual],
  );

  // 트리 편집 태그 — 이전→다음 트리를 비교해 "한 잎의 한 필드"만 바뀌면 그 컨트롤 단위
  // 코얼레스 태그(slider:leaf:field), 구조 변경·다중 변경·트리 유무 변화면 유니크(이산).
  const treeEditTag = useCallback(
    (prev: LookNode | null, next: LookNode | null): string => {
      if (!prev || !next) return uniqueTag();
      const collect = (node: LookNode): Map<string, ProductLeaf> => {
        const m = new Map<string, ProductLeaf>();
        const walk = (c: TreeChild) => {
          if (isLeaf(c)) m.set(c.id, c);
          else c.kids.forEach(walk);
        };
        walk(node);
        return m;
      };
      const pm = collect(prev);
      const nm = collect(next);
      if (pm.size !== nm.size) return uniqueTag();
      // 각 잎에서 바뀐 필드 목록을 모은다. 정확히 한 잎·한 필드면 슬라이더 드래그로 간주.
      let changedLeaf: string | null = null;
      let changedField: string | null = null;
      for (const [id, nl] of nm) {
        const pl = pm.get(id);
        if (!pl) return uniqueTag(); // 잎 id 집합이 다름 → 구조 변경
        const fields: string[] = [];
        if (pl.visible !== nl.visible) fields.push('visible');
        const keys = new Set([
          ...Object.keys(pl.params),
          ...Object.keys(nl.params),
        ]);
        for (const k of keys) {
          if ((pl.params as any)[k] !== (nl.params as any)[k]) fields.push(`p:${k}`);
        }
        if (JSON.stringify(pl.overlay) !== JSON.stringify(nl.overlay)) {
          fields.push('overlay');
        }
        if (JSON.stringify(pl.lens) !== JSON.stringify(nl.lens)) fields.push('lens');
        if (fields.length === 0) continue;
        if (changedLeaf !== null || fields.length > 1) return uniqueTag();
        changedLeaf = id;
        changedField = fields[0];
      }
      if (changedLeaf && changedField) {
        return `slider:${changedLeaf}:${changedField}`;
      }
      return uniqueTag();
    },
    [uniqueTag],
  );

  // 스냅샷 복원 — 룩 revive + 활성 칩·보정/농도 세팅 + 재컴파일 방출. undo/redo 공용.
  // emitCompiled가 reconcileMasks/Maps를 재실행하므로 마커→0 복원 시 마스크/맵 clear가 전송된다.
  const applyEditSnapshot = useCallback(
    (snap: EditSnapshot) => {
      const tree = snap.look ? reviveTree(snap.look, lookLibraryRef.current) : null;
      lookTreeRef.current = tree;
      setLookTreeState(tree);
      lookSelRef.current = snap.lookSel;
      setLookSel(snap.lookSel);
      opacityRef.current = snap.opacity;
      setOpacityState(snap.opacity);
      wpGainRef.current = snap.wpGain;
      setWpGainState(snap.wpGain);
      warpLaneRef.current = snap.warp;
      setWarpLaneState(snap.warp);
      emitCompiled(compileWithFit(tree), snap.warp, snap.wpGain);
    },
    [emitCompiled, compileWithFit],
  );

  const undoEdit = useCallback(() => {
    const res = History.undo(historyRef.current, snapshotState());
    if (!res) return;
    historyRef.current = res.history;
    histTagRef.current = null; // 새 코얼레스 구간 시작
    applyEditSnapshot(res.snapshot);
    setCanUndo(History.canUndo(res.history));
    setCanRedo(History.canRedo(res.history));
  }, [snapshotState, applyEditSnapshot]);

  const redoEdit = useCallback(() => {
    const res = History.redo(historyRef.current, snapshotState());
    if (!res) return;
    historyRef.current = res.history;
    histTagRef.current = null;
    applyEditSnapshot(res.snapshot);
    setCanUndo(History.canUndo(res.history));
    setCanRedo(History.canRedo(res.history));
  }, [snapshotState, applyEditSnapshot]);

  // ── 히스토리 기록 래퍼 — UI 편집 진입점에 감아 "직전 상태 push"를 단일화 ──
  // 트리 편집: 컨트롤 단위 태그로 커밋(연속 슬라이더만 코얼레스). 컴포저 에셋 임포트도
  // 이 경로를 타므로(applyComposer* → changeTreeUser) undo에 정상 기록된다.
  const changeTreeUser = useCallback(
    (next: LookNode | null) => {
      commitEdit(treeEditTag(lookTreeRef.current, next), () => {
        // 하위 룩을 모두 없음으로 비우면 원본(null)으로 정규화 + 선택 카드도 원본으로.
        const emptyNow = !next || flattenTree(next).length === 0;
        changeTree(emptyNow ? null : next);
        if (emptyNow && lookSelRef.current !== 'bare') {
          lookSelRef.current = 'bare';
          setLookSel('bare');
        }
      });
    },
    [commitEdit, treeEditTag, changeTree],
  );

  // 그룹 통째 라이브러리 승격(#23 Phase 3) — 재사용 번들 등록 + 작업본 그룹에 ref 링크.
  // 라이브러리(사용자 소유만)를 즉시 영속화하고, 멤버 re-ref된 트리로 교체한다.
  const promoteGroupToLibrary = useCallback(
    (groupId: string, name: string) => {
      const tree = lookTreeRef.current;
      if (!tree) return;
      const result = promoteGroup(tree, lookLibraryRef.current, groupId, name);
      if (!result) return;
      lookLibraryRef.current = result.lib;
      setLookLibrary(result.lib);
      saveUserLibrary(result.lib);
      changeTree(result.root);
    },
    [changeTree],
  );

  // 보정 레인 변경 → 컴파일 결과는 그대로, params만 다시 기입
  const changeWarp = useCallback(
    (warp: WarpLane) => {
      warpLaneRef.current = warp;
      setWarpLaneState(warp);
      applyParams(
        applyWarpToParams(compiledRef.current.params, warp, wpGainRef.current),
      );
    },
    [applyParams],
  );

  // 보정 강도 (보정 레인 마스터, 골드)
  const setWpGain = useCallback(
    (v: number) => {
      wpGainRef.current = v;
      setWpGainState(v);
      applyParams(
        applyWarpToParams(compiledRef.current.params, warpLaneRef.current, v),
      );
    },
    [applyParams],
  );

  // ── LOOK 레인 — 칩 탭 ────────────────────────────────────────────────────
  // 내 룩 적용 — 메이크업 레인만 복원(레인 분리 저장, 분류체계 정의 07-10).
  // 보정은 절대 건드리지 않는다 — 내 보정 필터는 보정 레인에서 각자 적용.
  const applyStyleV2 = useCallback(
    (style: UserStyleV2) => {
      setLookSel(style.id);
      setEditingStyleId(null);
      opacityRef.current = style.mkGain;
      setOpacityState(style.mkGain);
      if (style.lookTree) {
        // 트리 스냅샷 복원 — ref 살아있으면 라이브 해석('원본 반영' 전파)
        changeTree(reviveTree(style.lookTree, lookLibraryRef.current));
      } else {
        // v1 마이그레이션분 — 컴파일 결과 fast-path (편집 진입 시 분해)
        lookTreeRef.current = null;
        setLookTreeState(null);
        emitCompiled(
          {
            params: style.compiled.params,
            overlayLayers: style.compiled.overlayLayers,
            lensLayers: style.compiled.lensLayers ?? [],
            eyeshadowLayers: style.compiled.eyeshadowLayers ?? [],
          },
          warpLaneRef.current,
          wpGainRef.current,
        );
      }
    },
    [changeTree, emitCompiled],
  );

  const selectLook = useCallback(
    (id: string) => {
      setEditingStyleId(null);
      if (id === 'bare') {
        setLookSel('bare');
        changeTree(null);
        return;
      }
      const style = userStylesV2Ref.current.find(s => s.id === id);
      if (style) {
        applyStyleV2(style);
        return;
      }
      const tree = instantiate(lookLibraryRef.current, faceLookIdForPreset(id));
      if (!tree) return;
      setLookSel(id);
      changeTree(tree);
    },
    [changeTree, applyStyleV2],
  );

  // ── 보정 레인 — 칩 탭·슬라이더·리셋·필터 저장 ────────────────────────────
  const selectWarp = useCallback(
    (id: string) => {
      const source =
        WARP_PRESETS.find(p => p.id === id) ??
        userWarpFiltersRef.current.find(f => f.id === id);
      if (!source) return;
      changeWarp(warpLaneFrom(source));
    },
    [changeWarp],
  );

  const changeWarpParam = useCallback(
    (key: WarpKey, value: number) => {
      const fit = warpLaneRef.current;
      const next = { ...fit, params: { ...fit.params, [key]: value }, dirty: true };
      // 하위 워프를 모두 0으로 비우면 선택 카드를 원본(보정 없음)으로 되돌린다.
      if (!warpLaneActive(next)) {
        changeWarp(warpLaneFrom(WARP_PRESETS[0]));
        return;
      }
      changeWarp(next);
    },
    [changeWarp],
  );

  const resetWarp = useCallback(() => {
    changeWarp(warpLaneFrom(WARP_PRESETS[0]));
  }, [changeWarp]);

  // 부위 프리셋 카드 — 그 부위 키만 세팅(다른 부위 불변). 전부 0되면 원본 복귀.
  const applyWarpPart = useCallback(
    (part: WarpGroup, preset: WarpParams) => {
      const fit = warpLaneRef.current;
      const partKeys = WARP_SLIDERS.filter(s => s.group === part).map(s => s.key);
      const nextParams: WarpParams = { ...fit.params };
      for (const k of partKeys) {
        const v = preset[k] ?? 0;
        if (v === 0) delete nextParams[k];
        else nextParams[k] = v;
      }
      const next = { ...fit, params: nextParams, dirty: true };
      if (!warpLaneActive(next)) {
        changeWarp(warpLaneFrom(WARP_PRESETS[0]));
        return;
      }
      changeWarp(next);
    },
    [changeWarp],
  );

  // 기본 이름 제안 — '내 보정 N'(중복 회피)
  const suggestFitName = useCallback(() => {
    const names = userWarpFiltersRef.current.map(f => f.name);
    let n = userWarpFiltersRef.current.length + 1;
    let name = `내 보정 ${n}`;
    while (names.includes(name)) {
      n += 1;
      name = `내 보정 ${n}`;
    }
    return name;
  }, []);

  // [필터로 저장] 버튼 — 이름 입력 팝업을 연다(제안 이름 프리필). 메이크업과 대칭.
  const openWarpSaveSheet = useCallback(() => {
    setFitSaveName(suggestFitName());
  }, [suggestFitName]);

  // 팝업 확정 — 입력 이름(빈값이면 제안 이름·중복 자동번호)으로 영속화 → 레인 ref 이동·dirty 해제
  const confirmFitSave = useCallback(
    (rawName: string) => {
      let name = rawName.trim() || suggestFitName();
      const taken = userWarpFiltersRef.current.map(f => f.name);
      if (taken.includes(name)) {
        let n = 2;
        while (taken.includes(`${name} ${n}`)) n += 1;
        name = `${name} ${n}`;
      }
      const filter: UserWarpFilter = {
        id: `fit-usr-${Date.now()}`,
        name,
        createdAt: Date.now(),
        params: { ...warpLaneRef.current.params },
      };
      const next = [...userWarpFiltersRef.current, filter];
      userWarpFiltersRef.current = next;
      setUserWarpFilters(next);
      saveUserWarpFilters(next); // best-effort 영속화
      changeWarp(warpLaneFrom(filter)); // 값 동일 → 시각 무변화, ref만 이동
      setFitSaveName(null);
    },
    [changeWarp, suggestFitName],
  );

  // 제형 스튜디오(#21) — 커스텀 마감 저장(부위 무관 번들). 마감 축 ◈ 칩으로 재사용.
  const saveFinish = useCallback((name: string, bundle: FinishBundle) => {
    const finish: UserFinish = {
      id: `finish-usr-${Date.now()}`,
      name,
      createdAt: Date.now(),
      bundle: { ...bundle },
    };
    const next = [...userFinishesRef.current, finish];
    userFinishesRef.current = next;
    setUserFinishes(next);
    saveUserFinishes(next); // best-effort 영속화
  }, []);

  // ── 레인 × 깊이 전환 ────────────────────────────────────────────────────
  // 메이크업·상세 진입 전 트리 보장 — fast-path(v1) 스타일이면 컴파일 결과를 익명 트리로 분해.
  const ensureTreeForDetail = useCallback(() => {
    if (lookTreeRef.current) return;
    const style = userStylesV2Ref.current.find(s => s.id === lookSel);
    if (style) {
      changeTree(
        decomposeToTree(
          style.compiled.params,
          style.compiled.overlayLayers,
          style.name,
          style.compiled.lensLayers ?? [],
          style.compiled.eyeshadowLayers ?? [],
        ),
      );
    }
  }, [lookSel, changeTree]);

  // 깊이 버튼(파라미터창 우상단) — 현재 레인 내에서 기본↔상세 전환.
  const setDepth = useCallback(
    (next: 'basic' | 'detail') => {
      if (next === 'detail' && lane === 'makeup') ensureTreeForDetail();
      setMode(next);
    },
    [lane, ensureTreeForDetail],
  );

  // 레인 세그먼트(하단) — 메이크업↔보정↔가이드. 메이크업·상세면 트리 보장.
  // 가이드 레인은 진입=오버레이 켬 / 이탈=끔 (별도 ON/OFF 버튼 없음 — 탭이 곧 스위치).
  const switchDomain = useCallback(
    (next: 'makeup' | 'warp' | 'guide') => {
      if (next === 'makeup' && mode === 'detail') ensureTreeForDetail();
      // 가이드 레인 진입=가이드·대칭 오버레이 켬 / 이탈=끔. 대칭 칩(중심축·대칭쌍)
      // 조합은 상태로 유지 — 재진입 시 켜둔 그대로 복원(첫 진입 기본 둘 다 OFF).
      const active = next === 'guide';
      if (stencilEnabledRef.current !== active) {
        stencilEnabledRef.current = active;
        pushStencil(stencilRef.current, active);
        pushSymmetry(symmetryRef.current, active);
      }
      setLane(next);
    },
    [mode, ensureTreeForDetail, pushStencil, pushSymmetry],
  );

  // ── 사전 촬영 미디어 보정 진입/액션 ──────────────────────────────────────
  // 갤러리 썸네일 버튼(카메라 줄 좌측)이 이 진입점을 호출한다 — 최근 사진 표시 겸
  // 탭하면 사진/영상을 골라 보정 모드로 들어간다(별도 버튼 없이 겸용).
  // 갤러리에서 사진/영상 1개 선택(mixed) → 타입 자동 판별 → 편집 모드 진입.
  // Unity가 EXIF 정립 정규화 + 검출 후 editReady로 응답, 이후 룩은 라이브와 동일하게
  // 컴포저로 실시간 조정된다(applyFilter가 편집 스틸에 그대로 반영).
  const pickMediaToEdit = useCallback(async () => {
    try {
      const res = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 });
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      const isVideo =
        (asset.type ?? '').startsWith('video') || /\.(mov|mp4|m4v)$/i.test(asset.uri);
      setEditProgress(null);
      setEditMode(isVideo ? 'video' : 'photo');
      sendToUnity(
        isVideo
          ? { type: 'enterVideoEdit', path: asset.uri }
          : { type: 'enterPhotoEdit', path: asset.uri },
      );
    } catch (e) {
      console.warn('[media edit] 피커 실패', e);
    }
  }, [sendToUnity]);

  // 사진 저장 — 편집 중인 스틸을 소스 해상도로 합성해 앨범에 저장(editPhotoSaved 응답).
  const saveEditedPhoto = useCallback(() => {
    sendToUnity({ type: 'saveEditedPhoto' });
  }, [sendToUnity]);

  // 영상 적용 — 기억한 소스 영상 전체에 현재 룩을 오프라인 적용(진행률→videoEditDone).
  const applyVideoEdit = useCallback(() => {
    setEditProgress(0); // 진행 오버레이 즉시 표시(첫 progress 콜백 전)
    sendToUnity({ type: 'applyVideoEdit' });
  }, [sendToUnity]);

  // 편집 종료 — 라이브 카메라 복귀(editExited 응답으로 최종 정리, 낙관적 즉시 반영).
  const exitMediaEdit = useCallback(() => {
    sendToUnity({ type: 'exitEdit' });
    setEditMode('none');
    setEditProgress(null);
  }, [sendToUnity]);

  // 사진→룩 추출(#1) 진입 — 갤러리 레퍼런스 사진 1장을 골라 Unity에 온디바이스 색 측정을
  // 요청한다. 편집 모드처럼 화면을 뺏지 않고(레퍼런스는 옆에서 측정만), lookExtracted 응답이
  // 오면 measurementToLook로 번역해 내 얼굴 라이브에 초안을 얹는다(onUnityMessage 참조).
  const extractLookFromPhoto = useCallback(() => {
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, res => {
      const uri = res.assets?.[0]?.uri;
      if (!uri) return;
      // 추출 원본을 검증용 썸네일/확대 모달에 쓰기 위해 저장(새 추출마다 갱신).
      setExtractSourceUri(uri);
      // 개발용 WB 끄기 상태를 추출 직전 동기화(Unity 재마운트 후에도 확실히 반영).
      sendToUnity({
        type: 'setExtractDebug',
        disableWhiteBalance: extractNoWBRef.current,
      });
      sendToUnity({ type: 'extractLook', path: uri });
    });
  }, [sendToUnity]);

  // 룩 추출 진단(개발용) — 저장한 측정치로 measurementToLook을 재실행해 빌드 없이 농도 확정.
  // 게인 드래그는 상수 태그(extract:gain)로 코얼레스해 undo 한 스텝으로 묶는다.
  const reapplyExtract = useCallback(
    (gain: number) => {
      extractGainRef.current = gain;
      setExtractGain(gain);
      const m = lastMeasurementRef.current;
      if (!m || !m.hasFace) return;
      const { params: draftParams, lensLayers } = measurementToLook(m, gain);
      const tree = decomposeToTree(
        { ...BARE, ...draftParams },
        [],
        '추출한 룩',
        lensLayers,
        [],
      );
      const next = flattenTree(tree).length === 0 ? null : tree;
      commitEdit('extract:gain', () => changeTree(next));
    },
    [commitEdit, changeTree],
  );

  // 화이트밸런스 끄기 토글(개발용) — Unity에 즉시 전송(다음 추출부터 raw 색 반환).
  const toggleExtractWB = useCallback(
    (next: boolean) => {
      extractNoWBRef.current = next;
      setExtractNoWB(next);
      sendToUnity({ type: 'setExtractDebug', disableWhiteBalance: next });
    },
    [sendToUnity],
  );

  const toggleSettings = useCallback(() => {
    setSettingsOpen(open => !open);
  }, []);

  const togglePhotoVideo = useCallback(() => {
    setPhotoVideo(pv => (pv === 'photo' ? 'video' : 'photo'));
  }, []);

  // ── 히스토리 기록 래퍼(이어서) — 룩/보정 편집 진입점 ─────────────────────
  // 룩·핏 선택, 리셋은 이산 편집 → 유니크 태그(서로 다른 선택이 <500ms여도 각각 1스텝).
  const selectLookUser = useCallback(
    (id: string) => {
      commitEdit(uniqueTag(), () => selectLook(id));
    },
    [commitEdit, uniqueTag, selectLook],
  );

  const selectWarpUser = useCallback(
    (id: string) => {
      commitEdit(uniqueTag(), () => selectWarp(id));
    },
    [commitEdit, uniqueTag, selectWarp],
  );

  // 워프 슬라이더는 key별 태그로 코얼레스 — 한 슬라이더 연속 드래그만 1스텝, 다른 key는 별개.
  const changeWarpParamUser = useCallback(
    (key: WarpKey, value: number) => {
      commitEdit(`slider:fit:${key}`, () => changeWarpParam(key, value));
    },
    [commitEdit, changeWarpParam],
  );

  const resetWarpUser = useCallback(() => {
    commitEdit(uniqueTag(), () => resetWarp());
  }, [commitEdit, uniqueTag, resetWarp]);

  const applyWarpPartUser = useCallback(
    (part: WarpGroup, preset: WarpParams) => {
      commitEdit(uniqueTag(), () => applyWarpPart(part, preset));
    },
    [commitEdit, uniqueTag, applyWarpPart],
  );

  // 농도 슬라이더 — 컨트롤별 코얼레스 태그(메이크업 opacity / 보정 wpGain 각각 1스텝).
  const setOpacityUser = useCallback(
    (v: number) => {
      commitEdit('slider:opacity', () => setOpacity(v));
    },
    [commitEdit, setOpacity],
  );

  // 슬롯별 농도 슬라이더 — 슬롯마다 별도 코얼레스 태그(연속 드래그 1스텝).
  const setSlotGainUser = useCallback(
    (slot: SlotKey, v: number) => {
      commitEdit(`slider:slotGain:${slot}`, () => setSlotGain(slot, v));
    },
    [commitEdit, setSlotGain],
  );

  const setWpGainUser = useCallback(
    (v: number) => {
      commitEdit('slider:wpGain', () => setWpGain(v));
    },
    [commitEdit, setWpGain],
  );

  // 내 룩 롱프레스 — 편집(덮어쓰기 대상)·삭제 메뉴
  const persistStylesV2 = useCallback((next: UserStyleV2[]) => {
    userStylesV2Ref.current = next;
    setUserStylesV2(next);
    saveUserStylesV2(next);
  }, []);

  const styleMenu = useCallback(
    (id: string) => {
      const style = userStylesV2Ref.current.find(s => s.id === id);
      if (!style) return;
      Alert.alert(style.name, undefined, [
        {
          text: '컴포저로 편집',
          onPress: () => {
            applyStyleV2(style);
            setEditingStyleId(style.id);
            if (!style.lookTree) {
              changeTree(
                decomposeToTree(
                  style.compiled.params,
                  style.compiled.overlayLayers,
                  style.name,
                  style.compiled.lensLayers ?? [],
                  style.compiled.eyeshadowLayers ?? [],
                ),
              );
            }
            setSettingsOpen(false);
            setLane('makeup');
            setMode('detail');
          },
        },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            persistStylesV2(userStylesV2Ref.current.filter(s => s.id !== id)),
        },
        { text: '취소', style: 'cancel' },
      ]);
    },
    [applyStyleV2, changeTree, persistStylesV2],
  );

  // ── 저장 시트 v2 (목업 화면 05 — 변경 요약) ─────────────────────────────
  const openSaveSheet = useCallback(() => {
    const tree = lookTreeRef.current;
    const editing = userStylesV2Ref.current.find(s => s.id === editingStyleId);
    const otherSnapshots = userStylesV2Ref.current
      .filter(s => s.id !== editingStyleId)
      .map(s => s.lookTree);
    const items = collectChanges(tree, lookLibraryRef.current, otherSnapshots);
    const defaultName = editing
      ? editing.name
      : suggestStyleName(
          compiledRef.current.params,
          compiledRef.current.overlayLayers,
          tree?.name ?? '내 룩',
          userStylesV2Ref.current.map(s => s.name),
        );
    setSaveCtx({ defaultName, items });
  }, [editingStyleId]);

  const confirmSaveV2 = useCallback(
    (decision: SaveDecision) => {
      const tree = lookTreeRef.current;
      let finalTree = tree;
      // 시트 결정 적용 — 원본 반영/승격은 라이브러리 갱신, 나머지 수정분은
      // 참조 분리(익명 사본) + dirty 해제. 원본 정의는 여기서만 바뀔 수 있다.
      if (tree) {
        const applied = applySaveDecisions(
          tree,
          lookLibraryRef.current,
          decision.items,
        );
        finalTree = applied.root;
        lookLibraryRef.current = applied.lib;
        setLookLibrary(applied.lib);
        saveUserLibrary(applied.lib); // 사용자 소유 정의만 영속화
      }

      const editing = decision.overwrite
        ? userStylesV2Ref.current.find(s => s.id === editingStyleId)
        : undefined;
      // 이름 충돌 자동 번호 — 같은 이름 칩 두 개 방지(v1 저장과 동일 규칙)
      let name = decision.name;
      const taken = userStylesV2Ref.current
        .filter(s => s.id !== editing?.id)
        .map(s => s.name);
      if (taken.includes(name)) {
        let n = 2;
        while (taken.includes(`${name} ${n}`)) n += 1;
        name = `${name} ${n}`;
      }

      const id = editing?.id ?? `us${Date.now()}`;

      let snapshot: LookSnapshot | null = null;
      if (finalTree) {
        snapshot = snapshotTree(finalTree);
        // 저장물 루트는 내 소유의 새 룩 — 시스템 face 룩 참조를 떼어낸다
        snapshot.name = name;
        snapshot.ref = null;
        snapshot.owner = 'user';
      }

      const style: UserStyleV2 = {
        id,
        name,
        createdAt: editing?.createdAt ?? Date.now(),
        lookTree: snapshot,
        // 레인 분리 저장 — 보정은 담지 않는다(레거시 필드는 빈 값 고정)
        warpRef: 'fit-none',
        warpName: '',
        warpParams: {},
        mkGain: opacityRef.current,
        wpGain: 1,
        includeMk: true,
        includeWp: false,
        // fast-path용 컴파일 결과 — 워프 필드는 레인 소유라 0으로 고정 저장
        compiled: {
          params: applyWarpToParams(compiledRef.current.params, emptyWarpLane(), 0),
          overlayLayers: compiledRef.current.overlayLayers,
          lensLayers: compiledRef.current.lensLayers,
          eyeshadowLayers: compiledRef.current.eyeshadowLayers,
        },
      };
      const next = editing
        ? userStylesV2Ref.current.map(s => (s.id === editing.id ? style : s))
        : [style, ...userStylesV2Ref.current];
      persistStylesV2(next);

      // 작업본 정리 — dirty 해제된 트리로 교체(시각 동일, 재방출 불필요).
      // 보정 레인은 건드리지 않는다(레인 분리 저장 — 보정 dirty는 FIT 저장 몫).
      if (finalTree) {
        const renamed = { ...finalTree, name };
        lookTreeRef.current = renamed;
        setLookTreeState(renamed);
      }
      setLookSel(id);
      setEditingStyleId(null);
      setSaveCtx(null);
    },
    [editingStyleId, persistStylesV2],
  );

  // ── apply-by-uri 후단 (§16) ────────────────────────────────────────────────
  // 각 임포트의 "uri 얻은 뒤 적용" 후단을 헬퍼로 추출 — 사진 라이브러리 픽(launchImage
  // Library)과 카탈로그 항목 탭이 같은 경로를 공유한다. 카탈로그 탭은 파일선택 없이
  // 주어진 uri로 바로 적용(새 네이티브 의존 0). 파일은 세션 한정(저장 스냅샷 미포함 규약
  // 유지) — 카탈로그는 uri 목록일 뿐.

  // 텍스처(컬러 아트)는 브리지로 보내고, 강도는 선택된 잎에 올린다(다음 컴파일에 살아남게).
  const applyComposerTexture = useCallback(
    (action: TextureAction, leafId: string, uri: string) => {
      const { msg, key } = TEXTURE_SPEC[action];
      sendToUnity({ type: msg, path: uri });
      const tree = lookTreeRef.current;
      if (!tree) return;
      const node = findNode(tree, leafId);
      if (node && isLeaf(node) && ((node.params[key] as number) ?? 0) === 0) {
        // 히스토리 경로(changeTreeUser)로 — 컴포저 임포트도 undo에 남는다(MED-HIGH#1).
        changeTreeUser(updateLeaf(tree, leafId, { params: { [key]: 0.85 } }));
      }
    },
    [sendToUnity, changeTreeUser],
  );

  // 모양 축 마스크(§16) — 세션 경로 기록 후 마커=1로 트리 갱신. 실제 setRegionMask
  // 전송은 emitCompiled의 reconcileMasks가 담당(룩 전환 화해 경로와 단일화).
  const applyComposerMask = useCallback(
    (maskRegion: MaskRegion, leafId: string, uri: string) => {
      const { appliedKey } = MASK_SPEC[maskRegion];
      maskPathsRef.current[maskRegion] = uri;
      const tree = lookTreeRef.current;
      if (!tree) return;
      const node = findNode(tree, leafId);
      if (node && isLeaf(node)) {
        changeTreeUser(updateLeaf(tree, leafId, { params: { [appliedKey]: 1 } }));
      }
    },
    [changeTreeUser],
  );

  // 질감 맵(#22 광 지도) — 마스크와 동형(마커만 잎에, 실제 setTextureMap은 reconcileMaps).
  const applyComposerTextureMap = useCallback(
    (mapRegion: TextureMapRegion, leafId: string, uri: string) => {
      const { appliedKey } = TEXTUREMAP_SPEC[mapRegion];
      mapPathsRef.current[mapRegion] = uri;
      const tree = lookTreeRef.current;
      if (!tree) return;
      const node = findNode(tree, leafId);
      if (node && isLeaf(node)) {
        changeTreeUser(updateLeaf(tree, leafId, { params: { [appliedKey]: 1 } }));
      }
    },
    [changeTreeUser],
  );

  // 데코 잎의 그림 교체 — 그림은 원본색 스티커가 자연스러워 블렌드를 되돌린다.
  const applyComposerOverlayImage = useCallback(
    (leafId: string, uri: string) => {
      const tree = lookTreeRef.current;
      if (!tree) return;
      const node = findNode(tree, leafId);
      if (!node || !isLeaf(node) || !node.overlay) return;
      changeTreeUser(
        updateLeaf(tree, leafId, {
          overlay: { ...node.overlay, path: uri, blendMode: 0, color: undefined },
        }),
      );
    },
    [changeTreeUser],
  );

  // 렌즈 세부(#25) 디자인 — 방사 컬러 아트 텍스처. designPath는 트리 payload에 실려
  // setLensLayers로 흐른다. 세션 tmp URI라 재시작 후 stale 경로면 Unity가 절차 방사
  // 그라데로 무음 폴백(graceful — IrisRenderer.LoadLensDesign).
  const applyComposerLensDesign = useCallback(
    (leafId: string, uri: string) => {
      const tree = lookTreeRef.current;
      if (!tree) return;
      const node = findNode(tree, leafId);
      if (!node || !isLeaf(node) || !node.lens) return;
      changeTreeUser(updateLeaf(tree, leafId, { lens: { designPath: uri } }));
    },
    [changeTreeUser],
  );

  // 방금 사진 라이브러리로 임포트한 에셋을 "카탈로그에 저장" 프롬프트에 올린다(이름 입력).
  // 부위/종류가 뚜렷한 마스크·질감 맵·컬러 아트만 저장 제안(렌즈/오버레이는 부위 없음).
  const offerSaveToCatalog = useCallback(
    (kind: AssetKind, region: string, uri: string) => {
      setSaveDraft({ kind, region, uri, name: '' });
    },
    [],
  );

  // ── 사진 라이브러리 픽 (일회성 경로 — apply-by-uri 후단 재사용) ─────────────
  const pickComposerTexture = useCallback(
    (action: TextureAction, leafId: string) => {
      launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, res => {
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        applyComposerTexture(action, leafId, uri);
        offerSaveToCatalog('colorArt', action, uri);
      });
    },
    [applyComposerTexture, offerSaveToCatalog],
  );

  const pickComposerMask = useCallback(
    (maskRegion: MaskRegion, leafId: string) => {
      launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, res => {
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        applyComposerMask(maskRegion, leafId, uri);
        offerSaveToCatalog('mask', maskRegion, uri);
      });
    },
    [applyComposerMask, offerSaveToCatalog],
  );

  const pickTextureMap = useCallback(
    (mapRegion: TextureMapRegion, leafId: string) => {
      launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, res => {
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        applyComposerTextureMap(mapRegion, leafId, uri);
        offerSaveToCatalog('textureMap', mapRegion, uri);
      });
    },
    [applyComposerTextureMap, offerSaveToCatalog],
  );

  const pickComposerOverlayImage = useCallback(
    (leafId: string) => {
      launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, res => {
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        applyComposerOverlayImage(leafId, uri);
      });
    },
    [applyComposerOverlayImage],
  );

  const pickComposerLensDesign = useCallback(
    (leafId: string) => {
      launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, res => {
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        applyComposerLensDesign(leafId, uri);
      });
    },
    [applyComposerLensDesign],
  );

  // ── 카탈로그 관리 — 붙여넣기 임포트 · 카탈로그에 저장 ───────────────────────
  const submitCatalogImport = useCallback(() => {
    const text = catalogImportText.trim();
    if (!text) {
      setCatalogImportOpen(false);
      return;
    }
    // 붙여넣은 매니페스트의 유효 항목 수를 먼저 세어 피드백 — 파싱 실패/빈 결과와
    // 정상 반영을 구분(무피드백 시 truncated JSON도 성공한 듯 보이던 갭).
    const parsedCount = loadCatalog(text).entries.length;
    importManifestText(text).then(next => {
      setCatalog(next);
      setCatalogImportText('');
      setCatalogImportOpen(false);
      Alert.alert(
        parsedCount > 0 ? '카탈로그 가져오기' : '가져오기 실패',
        parsedCount > 0
          ? `유효한 에셋 ${parsedCount}개를 반영했어요.`
          : 'JSON에서 유효한 에셋 항목을 찾지 못했어요. 형식을 확인해 주세요.',
      );
    });
  }, [catalogImportText]);

  // 원격 매니페스트 URL 임포트(§16 v2) — CDN의 manifest.json에서 바로 가져와 병합.
  // fetchRemoteManifest는 네트워크/파싱 실패 시 조용히 기존 목록을 반환하므로(§16 방어
  // 원칙) 성공/실패를 단정하지 않고 반영된 전체 카탈로그 규모만 알린다.
  const submitRemoteCatalogImport = useCallback(() => {
    const url = catalogImportUrl.trim();
    if (!url) {
      return;
    }
    fetchRemoteManifest(url).then(next => {
      setCatalog(next);
      setCatalogImportUrl('');
      setCatalogImportOpen(false);
      Alert.alert('원격 카탈로그', `카탈로그를 갱신했어요 (에셋 ${next.entries.length}개).`);
    });
  }, [catalogImportUrl]);

  const submitSaveDraft = useCallback(() => {
    if (!saveDraft) return;
    const name = saveDraft.name.trim();
    if (!name) {
      setSaveDraft(null);
      return;
    }
    // id = kind:region:epoch (매니페스트 내 유일). uri만 저장(파일 자체는 미포함).
    addCatalogEntry({
      id: `${saveDraft.kind}:${saveDraft.region}:${Date.now()}`,
      kind: saveDraft.kind,
      region: saveDraft.region as CatalogManifest['entries'][number]['region'],
      name,
      tags: [],
      version: 1,
      uri: saveDraft.uri,
      createdAt: Date.now(),
    }).then(next => {
      setCatalog(next);
      setSaveDraft(null);
    });
  }, [saveDraft]);

  // 카탈로그 항목 삭제(썸네일 롱프레스→확인). 사용자 레이어만 지운다 — 번들 기본
  // (catalogDefault.json) 시드는 removeEntry가 손대지 않아 다시 병합돼 유지된다.
  const removeCatalogEntryById = useCallback((id: string) => {
    removeCatalogEntry(id).then(setCatalog);
  }, []);

  // 촬영 피드백 — 전체화면 미리보기 대신 화면을 흰색으로 한 번 깜빡인다.
  const triggerFlash = useCallback(() => {
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 0.9,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flashOpacity]);

  // 사용자 설정 변경 — 상태·ref 갱신 + 저장 옵션을 Unity에 반영(saveUnmirror).
  const applyUserSettings = useCallback(
    (next: UserSettings) => {
      setUserSettings(next);
      settingsRef.current = next;
      sendToUnity({ type: 'setSaveOptions', saveUnmirror: next.saveUnmirror });
    },
    [sendToUnity],
  );

  // Unity 플레이어 재마운트(백그라운드 복귀·컨텍스트 로스로 'ready' 재발화) 시 현재
  // 편집 상태를 전량 재방출한다 — 베이스 필터만 복원되고 오버레이/렌즈/섀도·스텐실·
  // 대칭·조명·split·카메라·캘리브레이션이 조용히 사라지는 것을 막는다. onUnityMessage
  // 스테일 클로저를 피하려 상태는 전부 ref로 최신값을 읽는다(useState 직접 참조 금지).
  // 각 상태의 기존 전송부를 그대로 재사용하며, 꺼짐 상태도 idempotent하게 재전송한다.
  const resyncAll = useCallback(() => {
    // 베이스 룩 + 오버레이/렌즈/섀도 4연발 — 마지막 컴파일 결과에 워프를 얹어 재전송.
    emitCompiled(compiledRef.current, warpLaneRef.current, wpGainRef.current);
    // 튜토리얼 스텐실(#2)·좌우 대칭(#6) — 가이드 레인 활성 상태를 그대로 재적용.
    pushStencil(stencilRef.current, stencilEnabledRef.current);
    pushSymmetry(symmetryRef.current, stencilEnabledRef.current);
    // 조명 시뮬(#4) — 고른 프리셋 유지('끔' 프리셋이면 원본).
    sendToUnity({ type: 'setLighting', lighting: lightingRef.current });
    // 반반 모드 — Unity가 전역 분할선으로 복원 쿼드·가이드를 함께 몬다.
    sendToUnity({ type: 'setSplit', split: { mode: splitModeRef.current } });
    // 카메라 facing.
    sendToUnity({ type: 'setCamera', facing: facingRef.current });
    // 개발자 캘리브레이션.
    sendToUnity({ type: 'setCalibration', calibration: calibRef.current });
  }, [emitCompiled, pushStencil, pushSymmetry, sendToUnity]);

  const onUnityMessage = useCallback(
    (event: NativeSyntheticEvent<{ message: string }>) => {
      const msg = parseUnityMessage(event.nativeEvent.message);
      if (!msg) {
        return;
      }
      switch (msg.type) {
        case 'ready':
          setUnityReady(true);
          // Unity 기동/재마운트(백그라운드 복귀·컨텍스트 로스) 완료 — 베이스 필터만이
          // 아니라 전 편집 상태를 재방출해 재동기화(전역 농도·레이어·가이드·조명 등).
          resyncAll();
          break;
        case 'faceTracked':
          setFaceTracked(msg.tracked);
          break;
        case 'fitHandles':
          // 온페이스 핏 핸들(A17) — 핏 패널 열림 동안 ~10Hz. eyeVp는 드래그 정규화용.
          fitHandlesEyeVpRef.current = msg.eyeVp || fitHandlesEyeVpRef.current;
          setFitHandlesMsg({ handles: msg.handles ?? [], eyeVp: msg.eyeVp });
          break;
        case 'photoCaptured': {
          const uri = msg.path.startsWith('file://')
            ? msg.path
            : `file://${msg.path}`;
          setLastPhotoUri(uri);
          // 핏 프리즈 경유 촬영 — 방금 찍은 사진으로 정지 편집 진입(플래시 생략).
          if (fitFreezeRef.current === 'capturing') {
            fitFreezeRef.current = 'entering';
            sendToUnity({ type: 'enterPhotoEdit', path: msg.path });
            break;
          }
          // 전체화면 미리보기 없이 — 화면만 깜빡이고 갤러리 썸네일만 갱신한다.
          if (settingsRef.current.flashOnCapture) triggerFlash();
          break;
        }
        case 'uvTemplateExported': {
          // 개발용: UV 템플릿은 전체화면 미리보기로 확인.
          // 파일은 앱 문서 폴더에 저장됨 (iOS: Files 앱, Android: Android/data/<pkg>/files)
          console.log('[UV template]', msg.path);
          const uri = msg.path.startsWith('file://')
            ? msg.path
            : `file://${msg.path}`;
          setPhotoUri(uri);
          break;
        }
        case 'recordingStarted':
          setRecording(true);
          break;
        case 'videoCaptured':
          setRecording(false);
          console.log('[video]', msg.path);
          break;
        // ── 사전 촬영 미디어 보정 응답 ──
        case 'editReady':
          // 핏 프리즈 완료 — 정지 스틸에서 검출되면 핸들 방출 시작, 실패면 라이브 폴백.
          if (fitFreezeRef.current === 'entering') {
            if (msg.tracked) {
              fitFreezeRef.current = 'frozen';
            } else {
              sendToUnity({ type: 'exitEdit' });
              fitFreezeRef.current = 'off';
              Alert.alert(
                '정지 화면에서 얼굴을 찾지 못했어요',
                '라이브 화면에서 핏을 조정합니다.',
              );
            }
            sendToUnity({ type: 'setFitHandles', fitHandles: true });
            break;
          }
          if (!msg.tracked) {
            Alert.alert(
              '얼굴을 찾지 못했어요',
              '얼굴이 또렷하게 보이는 정면 사진/영상이 좋아요. 그래도 보정을 이어갈 수 있어요.',
            );
          }
          break;
        case 'editPhotoSaved': {
          const uri = msg.path.startsWith('file://') ? msg.path : `file://${msg.path}`;
          setLastPhotoUri(uri);
          if (settingsRef.current.flashOnCapture) triggerFlash();
          Alert.alert('저장 완료', '보정한 사진을 앨범에 저장했어요.');
          break;
        }
        case 'videoEditProgress':
          setEditProgress(msg.progress);
          break;
        case 'videoEditDone':
          setEditProgress(null);
          console.log('[media edit] 영상 저장', msg.path);
          Alert.alert('완료', '보정한 영상을 앨범에 저장했어요.');
          break;
        case 'editExited':
          setEditMode('none');
          setEditProgress(null);
          break;
        case 'lookExtracted': {
          // 사진→룩 추출(#1) — 측정치를 컴포저 초안으로 번역해 내 얼굴 라이브에 얹는다.
          const m = msg.lookMeasurement;
          // 개발용 진단 패널이 읽도록 원 측정치를 항상 보관(미검출도 hasFace 표시용).
          setLastMeasurement(m ?? null);
          lastMeasurementRef.current = m ?? null;
          if (!m || !m.hasFace) {
            Alert.alert(
              '얼굴을 찾지 못했어요',
              '얼굴이 또렷한 정면 사진이 좋아요.',
            );
            break;
          }
          // 새 추출은 게인을 기본 1로 리셋(이후 진단 슬라이더로 조정).
          extractGainRef.current = 1;
          setExtractGain(1);
          const { params: draftParams, lensLayers } = measurementToLook(m, 1);
          // changeTreeUser 경유 = undo 기록 + emitCompiled로 즉시 라이브 반영.
          // '컴포저로 편집'과 동일하게 상세뷰(컴포저)로 진입해 초안을 수정하게 한다.
          changeTreeUser(
            decomposeToTree(
              { ...BARE, ...draftParams },
              [],
              '추출한 룩',
              lensLayers,
              [],
            ),
          );
          setLane('makeup');
          setMode('detail');
          break;
        }
        case 'error':
          // 영상 처리 중 에러면 진행 오버레이를 풀어 화면이 잠기지 않게 한다.
          setEditProgress(null);
          // 녹화 실패 시 녹화 상태를 풀어 셔터가 멈추지 않게 한다.
          setRecording(false);
          console.warn('[Unity error]', msg.message);
          // 사용자에게 실패를 알린다 — 룩 추출·미디어 편집 등 Unity 실패가 무반응으로
          // 묻히지 않게. (상태 리셋은 위에서, 성공 케이스는 각자 전용 Alert를 가지므로
          // 이 Alert는 error 경로에만 떠 중복되지 않는다.)
          Alert.alert('오류', msg.message ?? '알 수 없는 오류가 발생했어요.');
          break;
      }
    },
    [resyncAll, triggerFlash, sendToUnity, changeTreeUser],
  );

  // 셔터: 사진 모드=한 장 촬영, 동영상 모드=녹화 시작/정지 토글.
  // 미디어 보정 중에는 라이브 셔터를 막는다(편집 바의 저장/적용을 사용).
  const capture = useCallback(() => {
    if (editMode !== 'none') return;
    if (photoVideo === 'video') {
      sendToUnity({ type: recording ? 'stopRecording' : 'startRecording' });
    } else {
      sendToUnity({ type: 'capture' });
    }
  }, [sendToUnity, photoVideo, recording, editMode]);

  // 갤러리 버튼 썸네일 = 사진 라이브러리 최신 1장. 마운트·포그라운드 복귀·촬영 후
  // 갱신. 권한 거부/미지원이면 best-effort로 조용히 스킵(세션 촬영분 유지).
  const refreshLatestPhoto = useCallback(async () => {
    try {
      const page = await CameraRoll.getPhotos({ first: 1, assetType: 'Photos' });
      const uri = page.edges[0]?.node?.image?.uri;
      if (uri) setLastPhotoUri(uri);
    } catch {
      // 권한 없음/시뮬레이터 빈 라이브러리 등 — 무시
    }
  }, []);

  useEffect(() => {
    refreshLatestPhoto();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refreshLatestPhoto();
    });
    return () => sub.remove();
  }, [refreshLatestPhoto]);

  const flipCamera = useCallback(() => {
    const next = facingRef.current === 'front' ? 'rear' : 'front';
    facingRef.current = next;
    setFacing(next);
    sendToUnity({ type: 'setCamera', facing: next });
  }, [sendToUnity]);

  const updateCalib = useCallback(
    (patch: Partial<CalibrationParams>) => {
      const next = { ...calibRef.current, ...patch };
      calibRef.current = next;
      setCalib(next);
      sendToUnity({ type: 'setCalibration', calibration: next });
    },
    [sendToUnity],
  );

  // ── 레인 칩 목록 ─────────────────────────────────────────────────────────
  const lookDirty = treeDirty(lookTree);
  // 튜토리얼 가이드 '내 룩 순서' 스텝 — 현재 룩에서 바르는 순서대로 유도(부위 스텐실 있는 것만).
  const stencilSteps = useMemo(() => stencilStepsFromTree(lookTree), [lookTree]);
  // 룩에 실제 있는 가이드 부위 집합 — 부위별 칩 노출·전송 마스킹에 공용.
  const availableStencilKeys = useMemo(
    () => new Set<string>(stencilSteps.map(s => s.key)),
    [stencilSteps],
  );
  useEffect(() => {
    availableStencilKeysRef.current = availableStencilKeys;
    // 룩이 바뀌어 부위 구성이 변하면, 켜져 있던 가이드를 새 구성으로 다시 마스킹해 방출.
    if (stencilEnabledRef.current) pushStencil(stencilRef.current, true);
  }, [availableStencilKeys, pushStencil]);
  const lookChips: LaneChip[] = [
    { id: 'bare', label: '원본', dirty: lookSel === 'bare' && lookDirty },
    ...SYSTEM_LOOKS.map(p => ({
      id: p.id,
      label: p.name,
      dirty: lookSel === p.id && lookDirty,
    })),
    ...userStylesV2.map(s => ({
      id: s.id,
      label: s.name,
      mine: true,
      dirty: lookSel === s.id && lookDirty,
    })),
  ];
  const editingStyle = userStylesV2.find(s => s.id === editingStyleId);

  // 셔터 버튼 — 전체 UI(카메라 줄)와 가리기 모드에서 공용. 사진/동영상·녹화 상태 반영.
  const shutterButton = (
    <TouchableOpacity
      style={styles.shutterOuter}
      onPress={capture}
      disabled={!unityReady || editMode !== 'none'}
      testID="shutter-btn"
      accessibilityLabel={
        photoVideo === 'video'
          ? recording
            ? '녹화 정지'
            : '녹화 시작'
          : '촬영'
      }
    >
      <View
        style={[
          styles.shutterInner,
          photoVideo === 'video' &&
            (recording ? styles.shutterInnerRecording : styles.shutterInnerVideo),
        ]}
      />
    </TouchableOpacity>
  );

  // 룩진단(개발용) 패널이 열리면 컴포저 상세 시트를 시각적으로 접어 진단 컨트롤(게인
  // 슬라이더·WB 토글)이 가려지지 않게 한다. 기존 최소화 경로(panelMin)를 재사용하며,
  // 룩 트리 상태 자체는 그대로 유지(닫으면 사용자의 panelMin 값으로 원복). App 재렌더용 파생값.
  const composerCollapsed = panelMin || extractDiagOpen;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent />

      <UnityView
        ref={unityRef}
        style={StyleSheet.absoluteFill}
        androidKeepPlayerMounted
        onUnityMessage={onUnityMessage}
      />

      {onBack && (
        <TouchableOpacity
          accessibilityLabel="홈으로 돌아가기"
          onPress={onBack}
          style={[styles.hostBackButton, { top: insets.top + 8 }]}
          testID="stencil-host-back"
        >
          <Text style={styles.hostBackButtonText}>‹</Text>
        </TouchableOpacity>
      )}

      {/* 프리뷰 영역 꾹누름 → 잠깐 쌩얼(비교), 놓으면 현재 룩 복원. 컨트롤 아래
          레이어라(오버레이 box-none) 빈 화면 터치만 잡고 슬라이더/버튼은 방해 안 함. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={() => sendToUnity({ type: 'applyFilter', filter: BARE })}
        onPressOut={() => sendScaled(paramsRef.current, opacityRef.current)}
      />

      {/* 격자(3분할) 구도 가이드 — 카메라 위, UI 아래. 터치 통과(pointerEvents none).
          Unity 오프스크린 캡처엔 안 담겨 저장물은 깨끗하다(아이폰 카메라 격자와 동일). */}
      {gridOn && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.gridLineV, styles.gridV33]} />
          <View style={[styles.gridLineV, styles.gridV66]} />
          <View style={[styles.gridLineH, styles.gridH33]} />
          <View style={[styles.gridLineH, styles.gridH66]} />
        </View>
      )}

      {/* 미디어 보정 액션 바 — 편집 모드일 때 하단에 뜬다(사진=저장 / 영상=적용 + 나가기).
          zIndex로 일반 UI 위에 얹는다. 진행 오버레이는 아래 별도 레이어. */}
      {editMode !== 'none' && (
        <View style={styles.editBar} pointerEvents="box-none">
          <View style={styles.editBanner} pointerEvents="none">
            <Text style={styles.editBannerText}>
              {editMode === 'video'
                ? '영상 보정 — 첫 프레임에서 룩을 조정한 뒤 적용하세요'
                : '사진 보정 — 룩을 조정하고 저장하세요'}
            </Text>
          </View>
          <View style={styles.editActions} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.editBtnGhost}
              onPress={exitMediaEdit}
              disabled={editProgress !== null}
              testID="media-edit-exit"
            >
              <Text style={styles.editBtnGhostText}>나가기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBtnPrimary}
              onPress={editMode === 'video' ? applyVideoEdit : saveEditedPhoto}
              disabled={editProgress !== null}
              testID="media-edit-apply"
            >
              <Text style={styles.editBtnPrimaryText}>
                {editMode === 'video' ? '영상에 적용' : '저장'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 영상 오프라인 처리 진행 오버레이 — 전체 화면을 덮어 조작을 막고 진행률을 보인다. */}
      {editProgress !== null && (
        <View style={styles.editProgressOverlay} pointerEvents="auto">
          <View style={styles.editProgressCard}>
            <Text style={styles.editProgressText}>
              영상 보정 중… {Math.round(editProgress * 100)}%
            </Text>
            <View style={styles.editProgressTrack}>
              <View
                style={[
                  styles.editProgressFill,
                  { width: `${Math.max(2, Math.round(editProgress * 100))}%` },
                ]}
              />
            </View>
            <Text style={styles.editProgressHint}>화면을 그대로 두세요</Text>
          </View>
        </View>
      )}

      {uiHidden ? (
        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <View style={styles.hiddenBar}>
            {recording && (
              <View style={styles.recordingRow}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>녹화 중</Text>
              </View>
            )}
            {shutterButton}
            <TouchableOpacity
              style={styles.showUiBtn}
              onPress={() => setUiHidden(false)}
              testID="show-ui-btn"
            >
              <Text style={styles.showUiText}>보이기</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : (
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* 상단 — 반반 토글(전체/왼쪽/오른쪽)이 위, 설정 ⚙️는 우측 절대. */}
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.splitSeg}>
            {[
              { m: 1, l: '왼쪽' },
              { m: 0, l: '전체' },
              { m: 2, l: '오른쪽' },
            ].map(s => (
              <TouchableOpacity
                key={s.m}
                style={[styles.splitBtn, splitMode === s.m && styles.splitBtnOn]}
                onPress={() => applySplitMode(s.m)}
                disabled={!unityReady}
              >
                <Text
                  style={[
                    styles.splitText,
                    splitMode === s.m && styles.splitTextOn,
                  ]}
                >
                  {s.l}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 상태칩 — 반반 토글 바로 아래 중앙. 얼굴 인식되면 아예 숨긴다(로딩·미인식 때만). */}
        {!faceTracked && (
          <View
            style={[styles.statusRow, { top: insets.top + 50 }]}
            pointerEvents="box-none">
            <View
              style={[
                styles.statusChip,
                unityReady ? styles.statusWait : styles.statusLoading,
              ]}
              pointerEvents="none"
            >
              <Text style={styles.statusText}>
                {!unityReady ? 'Unity 로딩 중…' : '얼굴을 화면에 맞춰주세요'}
              </Text>
            </View>
          </View>
        )}

        {/* 디버그 레일(좌측) — 실기기 캘리브레이션·디버그 토글. ⚙️로 여닫음(이전과 동일,
            위치만 좌측). */}
        {settingsOpen && (
          <View
            style={[styles.debugRail, { top: insets.top + 96 }]}
            pointerEvents="box-none">
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() => updateCalib({ flipY: !calib.flipY })}>
              <Text style={styles.debugText}>Y플립 {calib.flipY ? 'ON' : 'off'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() =>
                updateCalib({
                  rotationDegrees: cycle(ROTATION_STEPS, calib.rotationDegrees),
                })
              }>
              <Text style={styles.debugText}>
                회전 {calib.rotationDegrees < 0 ? '자동' : `${calib.rotationDegrees}°`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() =>
                updateCalib({ matrixMode: cycle(MATRIX_STEPS, calib.matrixMode) })
              }>
              <Text style={styles.debugText}>
                행렬 {calib.matrixMode < 0 ? '기본' : calib.matrixMode}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() =>
                updateCalib({ cullMode: cycle(CULL_STEPS, calib.cullMode) })
              }>
              <Text style={styles.debugText}>컬링 {CULL_LABELS[calib.cullMode]}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() => updateCalib({ debugMesh: !calib.debugMesh })}>
              <Text style={styles.debugText}>메시 {calib.debugMesh ? 'ON' : 'off'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() => updateCalib({ debugSeg: !calib.debugSeg })}>
              <Text style={styles.debugText}>세그 {calib.debugSeg ? 'ON' : 'off'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() => sendToUnity({ type: 'exportUVTemplate' })}>
              <Text style={styles.debugText}>UV 추출</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.debugBtn, extractDiagOpen && styles.debugBtnOn]}
              onPress={() => setExtractDiagOpen(o => !o)}>
              <Text style={styles.debugText}>
                룩진단 {extractDiagOpen ? 'ON' : 'off'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 룩 추출 진단(개발용, #1) — 측정치·최종농도 표시 + 게인 슬라이더 + WB 끄기 토글.
            settingsOpen(DEV) 하위 토글로 여닫음. 사용자 UI와 분리된 하단 디버그 오버레이. */}
        {extractDiagOpen && (
          <ExtractDiagPanel
            measurement={lastMeasurement}
            gain={extractGain}
            onGainChange={reapplyExtract}
            noWhiteBalance={extractNoWB}
            onToggleWhiteBalance={toggleExtractWB}
            onClose={() => setExtractDiagOpen(false)}
          />
        )}

        {/* 룩 추출 원본 썸네일(#1, 검증용) — 좌상단. 탭하면 전체화면 확대해 추출색과 비교.
            추출을 한 번도 안 했으면(URI null) 미표시. 우측 도구 레일·하단 시트와 안 겹침. */}
        <ExtractSourceThumb uri={extractSourceUri} topOffset={insets.top + 8} />

        {/* 도구 레일(우측) — 메이크업 조작과 독립인 분석/코치 도구 토글.
            #2 가이드·#6 대칭(이후 #4 조명 추가). 각 패널은 하단에 스택된다. */}
        <View
          style={[styles.toolRail, { top: insets.top + 8 }]}
          pointerEvents="box-none">
          {/* 개발자 설정(캘리브레이션·디버그) — 아이콘 대신 'DEV' 글씨. 아래로 도구 버튼. */}
          <TouchableOpacity
            style={[styles.toolBtn, settingsOpen && styles.toolBtnOn]}
            onPress={toggleSettings}
          >
            <Text style={styles.devIcon}>DEV</Text>
          </TouchableOpacity>
          {/* (핏(§5 A13) 조정 진입은 스튜디오 '내 핏 시트 → 🎯 조정'으로 이동 —
              레일 버튼 폐지. 대칭(#6)도 가이드 레인 패널 안으로 이동.) */}
          <TouchableOpacity
            style={[styles.toolBtn, userSettingsOpen && styles.toolBtnOn]}
            onPress={toggleUserSettings}
            testID="settings-btn"
          >
            <Icon name="settings" size={19} />
            <Text style={styles.toolLabel}>설정</Text>
          </TouchableOpacity>
          {/* 스튜디오(A18) — 저작·라이브러리 허브. 레일 배치는 잠정(진입점 후보 확정 전). */}
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setStudioOpen(true)}
          >
            <Icon name="folder" size={19} />
            <Text style={styles.toolLabel}>스튜디오</Text>
          </TouchableOpacity>
          {/* 룩 추출(#1) — 레퍼런스 사진에서 온디바이스로 색을 측정해 컴포저 초안으로. */}
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={extractLookFromPhoto}
            testID="extract-look-btn"
          >
            <Icon name="image" size={19} />
            <Text style={styles.toolLabel}>룩 추출</Text>
          </TouchableOpacity>
          {/* 향수 추천(#7) — 체향·환경 조건 → 계열·부향률·전개 예측. 순수 RN 계산 패널. */}
          <TouchableOpacity
            style={[styles.toolBtn, perfumeOpen && styles.toolBtnOn]}
            onPress={togglePerfume}
            testID="perfume-btn"
          >
            <Icon name="droplet" size={19} />
            <Text style={styles.toolLabel}>향수</Text>
          </TouchableOpacity>
          {/* 체형 체크 — 7문항 체감 설문 → 실루엣·골격 진단+스타일링. 순수 RN 패널. */}
          <TouchableOpacity
            style={[styles.toolBtn, bodyOpen && styles.toolBtnOn]}
            onPress={toggleBody}
            testID="body-btn"
          >
            <Icon name="user" size={19} />
            <Text style={styles.toolLabel}>체형</Text>
          </TouchableOpacity>
          {/* 헤어 추천 — 얼굴형·두상·모발 7문항 프로필 → 스타일 순위. 순수 RN 패널. */}
          <TouchableOpacity
            style={[styles.toolBtn, hairOpen && styles.toolBtnOn]}
            onPress={toggleHair}
            testID="hair-btn"
          >
            <Icon name="scissors" size={19} />
            <Text style={styles.toolLabel}>헤어</Text>
          </TouchableOpacity>
        </View>

        {/* 온페이스 핏 핸들(A17) — 핏 패널 열림 동안 골드 점을 얼굴 위에 드래그.
            Unity=좌표만, 터치·기록=RN. 하단 패널보다 아래(z) 두어 패널이 가리게. */}
        {fitPanelOpen && expandedHandles.length > 0 && (
          <FitHandlesOverlay handles={expandedHandles} onDelta={onHandleDelta} />
        )}

        {/* 하단 컨트롤 */}
        <View style={styles.bottomPanel} pointerEvents="box-none">
          {lightingOpen && (
            <LightingPanel
              value={lighting}
              onChange={applyLighting}
              onClose={toggleLighting}
            />
          )}
          {perfumeOpen && <PerfumePanel onClose={togglePerfume} />}
          {bodyOpen && <BodyPanel onClose={toggleBody} />}
          {hairOpen && <HairstylePanel onClose={toggleHair} />}
          {/* 내 핏(§5 A13) — 핏 시트 편집. 슬라이더 변경 즉시 재컴파일로 라이브 반영. */}
          {fitPanelOpen && (
            <FitSheetPanel
              sheets={fitSheets}
              mainId={mainFitId}
              onChange={changeFitSheets}
              onClose={toggleFitPanel}
              onOpenStudio={() => setStudioOpen(true)}
              focus={fitFocus}
              initialSheetId={fitInitialSheet}
            />
          )}
          {userSettingsOpen && (
            <SettingsPanel
              value={userSettings}
              onChange={applyUserSettings}
              onClose={() => setUserSettingsOpen(false)}
              extraRows={[
                {
                  key: 'grid',
                  label: '구도 격자',
                  hint: '얼굴 배치·수평을 맞추는 3분할 격자',
                  kind: 'toggle',
                  value: gridOn,
                  onSelect: () => setGridOn(g => !g),
                },
                {
                  key: 'hide',
                  label: 'UI 가리기',
                  hint: '셔터만 남기고 화면을 깔끔하게 (숨김 화면 탭하면 복귀)',
                  kind: 'toggle',
                  value: uiHidden,
                  onSelect: () => setUiHidden(h => !h),
                },
                {
                  key: 'lighting',
                  label: '조명 시뮬',
                  hint: '자연광·형광등·노을 등 가상 조명(전용 패널)',
                  kind: 'action',
                  disabled: !unityReady,
                  onSelect: () => {
                    setUserSettingsOpen(false);
                    toggleLighting();
                  },
                },
              ]}
            />
          )}
          {/* 공유 파라미터 헤더 — 최상단 컨트롤 줄(패널 밖 위). 좌: 최소화(⌄/⌃)·
              깊이(기본/상세)·되돌리기(↶)·다시(↷), 우: 농도. 레인 토글은 아래 패널 안. */}
          <View style={styles.panelHeader} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.miniBtn}
              onPress={() => setPanelMin(m => !m)}
            >
              <Icon
                name={composerCollapsed ? 'chevronUp' : 'chevronDown'}
                size={16}
                color="rgba(255,255,255,0.9)"
              />
            </TouchableOpacity>
            {/* 보정은 상세만 — 기본/상세 깊이 버튼은 메이크업에서만 노출. */}
            {lane === 'makeup' && (
              <TouchableOpacity
                style={styles.depthBtn}
                onPress={() => setDepth(mode === 'basic' ? 'detail' : 'basic')}
              >
                <Text style={styles.depthBtnText}>
                  {mode === 'basic' ? '기본' : '상세'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.histBtn, !canUndo && styles.histBtnOff]}
              onPress={undoEdit}
              disabled={!canUndo}
            >
              <Icon
                name="undo"
                size={17}
                color={canUndo ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.histBtn, !canRedo && styles.histBtnOff]}
              onPress={redoEdit}
              disabled={!canRedo}
            >
              <Icon
                name="redo"
                size={17}
                color={canRedo ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
            {/* 농도 — 헤더 오른쪽을 flex로 채운다(배경·라벨 없음). 레인 따라 값·핸들러
                라우팅(메이크업=opacity, 보정=wpGain, 가이드=stencil.opacity). 최소화 시엔 spacer. */}
            {composerCollapsed ? (
              <View style={styles.headerSpacer} />
            ) : (
              <>
                {/* 메이크업 기본 모드는 농도 슬라이더가 룩카드 아래로 이동(카테고리별
                    라우팅) — 헤더엔 spacer. 그 외(상세/보정/가이드)는 헤더 슬라이더 유지. */}
                {lane === 'makeup' && mode === 'basic' ? (
                  <View style={styles.headerSpacer} />
                ) : (
                <View style={styles.densityInline} testID="density-slider">
                  <ParamSlider
                    label=""
                    value={
                      lane === 'makeup'
                        ? opacity
                        : lane === 'warp'
                          ? wpGain
                          : stencil.opacity
                    }
                    accent={
                      lane === 'makeup' ? undefined : lane === 'warp' ? GOLD : SKY
                    }
                    onChange={
                      lane === 'makeup'
                        ? setOpacityUser
                        : lane === 'warp'
                          ? setWpGainUser
                          : setStencilOpacity
                    }
                  />
                </View>
                )}
                {/* 필터로 저장 — 농도 슬라이더 오른쪽에 상시 표시. 수정사항이 없으면
                    회색·비활성(터치 무반응), 있으면 레인 시그니처색(메이크업=로즈/보정=골드)·활성. */}
                {lane === 'makeup' && mode === 'basic' && (
                  <TouchableOpacity
                    style={[
                      styles.headerSaveBtn,
                      !lookDirty && styles.headerSaveBtnOff,
                    ]}
                    onPress={openSaveSheet}
                    disabled={!lookDirty}
                  >
                    <Text
                      style={[
                        styles.headerSaveText,
                        !lookDirty && styles.headerSaveTextOff,
                      ]}
                    >
                      ＋ 저장
                    </Text>
                  </TouchableOpacity>
                )}
                {lane === 'warp' && (
                  <TouchableOpacity
                    style={[
                      styles.headerSaveBtn,
                      styles.headerSaveBtnWarp,
                      !warpLane.dirty && styles.headerSaveBtnOff,
                    ]}
                    onPress={openWarpSaveSheet}
                    disabled={!warpLane.dirty}
                  >
                    <Text
                      style={[
                        styles.headerSaveText,
                        styles.headerSaveTextWarp,
                        !warpLane.dirty && styles.headerSaveTextOff,
                      ]}
                    >
                      ＋ 저장
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* 레인 세그먼트 — 파라미터 패널 안 최상단(헤더 아래, 본문 위). 본문과
              한 덩어리로 붙여 '패널 안'으로 읽히게 gap 없이 스택.
              메이크업(로즈)↔보정(골드)↔가이드(스카이). */}
          {!composerCollapsed && (
            <View style={styles.paramPanel}>
              <View style={styles.laneSeg} pointerEvents="box-none">
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.laneSegBtn,
                    lane === 'makeup' && styles.laneSegBtnMakeupOn,
                  ]}
                  onPress={() => switchDomain('makeup')}
                >
                  <Text
                    style={[
                      styles.laneSegText,
                      lane === 'makeup' && styles.laneSegTextMakeupOn,
                    ]}
                  >
                    메이크업
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.laneSegBtn,
                    lane === 'warp' && styles.laneSegBtnWarpOn,
                  ]}
                  onPress={() => switchDomain('warp')}
                >
                  <Text
                    style={[
                      styles.laneSegText,
                      lane === 'warp' && styles.laneSegTextWarpOn,
                    ]}
                  >
                    보정
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.laneSegBtn,
                    lane === 'guide' && styles.laneSegBtnGuideOn,
                  ]}
                  onPress={() => switchDomain('guide')}
                >
                  <Text
                    style={[
                      styles.laneSegText,
                      lane === 'guide' && styles.laneSegTextGuideOn,
                    ]}
                  >
                    가이드
                  </Text>
                </TouchableOpacity>
              </View>

          {/* 본문 — 레인×깊이 4분면. (paramPanel이 !panelMin 가드하므로 여기선 레인·깊이만) */}
          {lane === 'makeup' && mode === 'basic' && (
            <BasicMode
              tree={lookTree}
              library={lookLibrary}
              onChangeTree={changeTreeUser}
              lookChips={lookChips}
              lookSelectedId={lookSel}
              onSelectLook={selectLookUser}
              onLongPressLook={styleMenu}
              dirty={lookDirty}
              hideHeader
              opacity={opacity}
              onOpacity={setOpacityUser}
              slotGain={slotGain}
              onSlotGain={setSlotGainUser}
            />
          )}
          {lane === 'makeup' && mode === 'detail' && (
            <ComposerSheet
              tree={lookTree}
              library={lookLibrary}
              currentParams={params}
              onChangeTree={changeTreeUser}
              onSave={openSaveSheet}
              onClose={() => {}}
              hideChrome
              onPickTexture={pickComposerTexture}
              onPickMask={pickComposerMask}
              onPickTextureMap={pickTextureMap}
              onPickOverlayImage={pickComposerOverlayImage}
              onPickLensDesign={pickComposerLensDesign}
              catalog={catalog}
              onApplyTexture={applyComposerTexture}
              onApplyMask={applyComposerMask}
              onApplyTextureMap={applyComposerTextureMap}
              onApplyOverlayImage={applyComposerOverlayImage}
              onApplyLensDesign={applyComposerLensDesign}
              onOpenCatalogImport={() => setCatalogImportOpen(true)}
              onRemoveCatalogEntry={removeCatalogEntryById}
              userFinishes={userFinishes}
              onSaveFinish={saveFinish}
              onPromoteGroup={promoteGroupToLibrary}
              userProducts={userProducts}
              fitSheets={fitSheets}
              onSetFitRef={(nodeId, sheetId) => {
                if (!lookTreeRef.current) return;
                const next = setNodeFitRef(lookTreeRef.current, nodeId, sheetId);
                changeTree(next);
              }}
              onLeafFit={(leafId, region) => {
                // 겹id 셀렉터 편집으로 승격 — 핏 패널을 그 겹에 초점 맞춰 연다.
                setFitFocus({ region, leafId });
                if (!fitPanelOpenRef.current) toggleFitPanel();
              }}
            />
          )}
          {/* 보정은 기본 모드 없이 상세(FitSheet)만 — 프리셋 칩+슬라이더 한 벌. */}
          {lane === 'warp' && (
            <WarpSheet
              lane={warpLane}
              userFilters={userWarpFilters}
              onSelectRef={selectWarpUser}
              onChangeParam={changeWarpParamUser}
              onApplyPart={applyWarpPartUser}
              onReset={resetWarpUser}
              onClose={() => {}}
              hideChrome
            />
          )}
          {/* 가이드 레인(#2) — 룩의 바르는 순서를 스텝 카드로. 카드=한 단계(제품×부위).
              레인 진입=가이드 켬/이탈=끔(switchDomain) — 본문엔 ON/OFF 없음. */}
          {lane === 'guide' && (
            <GuideMode
              value={stencil}
              onChange={applyStencil}
              steps={stencilSteps}
              available={availableStencilKeys}
              symValue={symmetry}
              onSymChange={applySymmetry}
            />
          )}
            </View>
          )}

          {/* 사진/동영상 — 셔터 위 심플 토글(현재 모드 강조). */}
          <View style={styles.simpleToggleRow}>
            <TouchableOpacity
              style={styles.simpleToggle}
              onPress={togglePhotoVideo}
              disabled={recording}
              testID="pv-toggle"
            >
              <Text
                style={[
                  styles.toggleOpt,
                  photoVideo === 'photo' && styles.toggleOptOn,
                ]}
              >
                사진
              </Text>
              <Text style={styles.toggleDivider}>|</Text>
              <Text
                style={[
                  styles.toggleOpt,
                  photoVideo === 'video' && styles.toggleOptOn,
                ]}
              >
                동영상
              </Text>
            </TouchableOpacity>
          </View>
          {/* 카메라 줄 — 갤러리 썸네일(좌, 탭=사전 촬영 사진/영상 보정) · 셔터(중앙) · 전후면(우). */}
          <View style={styles.cameraRow}>
            <TouchableOpacity
              style={styles.camSideBtn}
              onPress={pickMediaToEdit}
              disabled={!unityReady || editMode !== 'none'}
              testID="gallery-btn"
            >
              {lastPhotoUri ? (
                <Image
                  source={{ uri: lastPhotoUri }}
                  style={styles.galleryThumb}
                />
              ) : (
                <View style={[styles.galleryThumb, styles.galleryThumbEmpty]}>
                  <Icon name="image" size={20} color="rgba(255,255,255,0.9)" />
                </View>
              )}
            </TouchableOpacity>
            {shutterButton}
            <TouchableOpacity
              style={styles.camSideBtn}
              onPress={flipCamera}
              disabled={!unityReady}
              testID="flip-btn"
              accessibilityLabel={
                facing === 'front' ? '후면 카메라로 전환' : '전면 카메라로 전환'
              }
            >
              <Icon name="cameraFlip" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {recording && (
            <View style={styles.recordingRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>녹화 중</Text>
            </View>
          )}

        </View>
      </SafeAreaView>
      )}

      {/* 촬영 결과 미리보기 */}
      <Modal
        visible={photoUri != null}
        animationType="slide"
        onRequestClose={() => setPhotoUri(null)}
      >
        <View style={styles.previewRoot}>
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
          <SafeAreaView style={styles.previewBar}>
            <TouchableOpacity
              style={styles.previewClose}
              onPress={() => setPhotoUri(null)}
            >
              <Text style={styles.previewCloseText}>닫기</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* 저장 시트 v2 — 변경 요약. 메이크업 룩 단독 저장(레인 분리 —
          보정은 보정 시트의 자체 저장). 열 때마다 새로 마운트해 초기화. */}
      {saveCtx && (
        <SaveSheetV2
          defaultName={saveCtx.defaultName}
          items={saveCtx.items}
          treeDirty={lookDirty}
          editingName={editingStyle?.name ?? null}
          onCancel={() => setSaveCtx(null)}
          onSave={confirmSaveV2}
        />
      )}

      {/* 스튜디오 허브(A18) — 저작·관리 풀시트. 핏 시트 만들기/관리(레일 패널은
          조정 전용), 에셋 카탈로그 진입, 제품 만들기(A12) 자리. */}
      <StudioHub
        visible={studioOpen}
        onClose={() => setStudioOpen(false)}
        sheets={fitSheets}
        mainId={mainFitId}
        onChangeSheets={changeFitSheets}
        onAdjustFit={sheetId => {
          // 스튜디오 닫고 카메라 위 핏 패널을 그 시트로 — 겹 초점은 초기화.
          setStudioOpen(false);
          setFitInitialSheet(sheetId);
          setFitFocus(null);
          if (!fitPanelOpenRef.current) toggleFitPanel();
        }}
        userProducts={userProducts}
        onChangeProducts={products => {
          userProductsRef.current = products;
          setUserProducts(products);
          saveUserProducts(products);
          // 편집 중 제품을 쓰는 잎이 있으면 즉시 반영.
          emitCompiled(
            compileWithFit(lookTreeRef.current),
            warpLaneRef.current,
            wpGainRef.current,
          );
        }}
        onOpenCatalogImport={() => {
          setStudioOpen(false);
          setCatalogImportOpen(true);
        }}
      />

      {/* 매니페스트 붙여넣기 임포트(§16) — 웹 GUI export JSON을 붙여넣어 카탈로그에 병합.
          새 네이티브 파일선택 없이 TextInput만 사용(RN 전용, 새 의존 0). */}
      <Modal
        visible={catalogImportOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCatalogImportOpen(false)}
      >
        <View style={styles.catalogModalRoot}>
          <View style={styles.catalogModalCard}>
            <Text style={styles.catalogModalTitle}>에셋 카탈로그 임포트</Text>
            <Text style={styles.catalogModalHint}>
              웹 GUI(에셋-카탈로그-빌더)에서 내보낸 매니페스트 JSON을 붙여넣으세요.
              같은 id는 최신본이 덮어씁니다.
            </Text>
            {/* 원격 매니페스트 URL(§16 v2) — CDN manifest.json에서 바로 가져오기. */}
            <View style={styles.catalogUrlRow}>
              <TextInput
                style={[styles.catalogNameInput, styles.catalogUrlInput]}
                value={catalogImportUrl}
                onChangeText={setCatalogImportUrl}
                placeholder="https://…/manifest.json"
                placeholderTextColor="rgba(255,255,255,0.35)"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.catalogModalBtn, styles.catalogModalBtnPrimary]}
                onPress={submitRemoteCatalogImport}
              >
                <Text style={styles.catalogModalBtnTextPrimary}>URL</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.catalogModalInput}
              value={catalogImportText}
              onChangeText={setCatalogImportText}
              placeholder={'{ "schema": "armakeup.assetCatalog", "version": 1, "entries": [ … ] }'}
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.catalogModalRow}>
              <TouchableOpacity
                style={styles.catalogModalBtn}
                onPress={() => {
                  setCatalogImportText('');
                  setCatalogImportUrl('');
                  setCatalogImportOpen(false);
                }}
              >
                <Text style={styles.catalogModalBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catalogModalBtn, styles.catalogModalBtnPrimary]}
                onPress={submitCatalogImport}
              >
                <Text style={styles.catalogModalBtnTextPrimary}>임포트</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* "카탈로그에 저장" — 방금 사진 라이브러리로 임포트한 에셋에 이름을 붙여 등록. */}
      <Modal
        visible={saveDraft != null}
        animationType="fade"
        transparent
        onRequestClose={() => setSaveDraft(null)}
      >
        <View style={styles.catalogModalRoot}>
          <View style={styles.catalogModalCard}>
            <Text style={styles.catalogModalTitle}>카탈로그에 저장</Text>
            <Text style={styles.catalogModalHint}>
              방금 불러온 에셋을 이름 붙여 카탈로그에 등록하면 다음에 목록에서 바로
              고를 수 있어요. (파일은 세션 한정 — uri만 저장)
            </Text>
            <TextInput
              style={styles.catalogNameInput}
              value={saveDraft?.name ?? ''}
              onChangeText={t =>
                setSaveDraft(prev => (prev ? { ...prev, name: t } : prev))
              }
              placeholder="에셋 이름 (예: 자연 블러셔 존)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoFocus
            />
            <View style={styles.catalogModalRow}>
              <TouchableOpacity
                style={styles.catalogModalBtn}
                onPress={() => setSaveDraft(null)}
              >
                <Text style={styles.catalogModalBtnText}>건너뛰기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catalogModalBtn, styles.catalogModalBtnPrimary]}
                onPress={submitSaveDraft}
              >
                <Text style={styles.catalogModalBtnTextPrimary}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 보정 필터 저장 — 이름 입력 팝업(메이크업 SaveSheetV2의 경량판). */}
      <Modal
        visible={fitSaveName != null}
        animationType="fade"
        transparent
        onRequestClose={() => setFitSaveName(null)}
      >
        <View style={styles.catalogModalRoot}>
          <View style={styles.catalogModalCard}>
            <Text style={styles.catalogModalTitle}>보정 필터로 저장</Text>
            <Text style={styles.catalogModalHint}>
              지금 워프 조합을 이름 붙여 내 보정 필터로 저장해요. 다음에 보정
              전체 탭에서 바로 다시 고를 수 있어요.
            </Text>
            <TextInput
              style={styles.catalogNameInput}
              value={fitSaveName ?? ''}
              onChangeText={t => setFitSaveName(t)}
              placeholder="필터 이름 (예: 내 V라인)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoFocus
            />
            <View style={styles.catalogModalRow}>
              <TouchableOpacity
                style={styles.catalogModalBtn}
                onPress={() => setFitSaveName(null)}
              >
                <Text style={styles.catalogModalBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catalogModalBtn, styles.catalogModalBtnPrimary]}
                onPress={() => confirmFitSave(fitSaveName ?? '')}
              >
                <Text style={styles.catalogModalBtnTextPrimary}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 촬영 플래시 — 전체화면 미리보기 대신 화면을 흰색으로 한 번 깜빡인다.
          pointerEvents none으로 터치는 통과. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.captureFlash, { opacity: flashOpacity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  hostBackButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    left: 12,
    position: 'absolute',
    width: 38,
    zIndex: 200,
  },
  hostBackButtonText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 36,
    marginTop: -2,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusWait: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)', // 레드 — 얼굴 미인식(배치 유도)
  },
  statusLoading: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)', // 중립 — Unity 로딩 중
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statusRow: {
    // top은 세이프에어리어 인셋 기준으로 런타임에 지정(반반 토글 아래 + 여백).
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  splitSeg: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  splitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 11,
  },
  splitBtnOn: {
    backgroundColor: '#FF7E9D',
  },
  splitText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  splitTextOn: {
    color: '#FFFFFF',
  },
  toolRail: {
    // top은 세이프에어리어 인셋 기준으로 런타임 지정(노치 아래 우측 세로 레일).
    position: 'absolute',
    right: 12,
    gap: 8,
  },
  devIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  toolBtn: {
    width: 52,
    paddingVertical: 7,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  toolBtnOn: {
    backgroundColor: 'rgba(127,208,255,0.55)',
  },
  toolLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  bottomPanel: {
    // 카메라 컨트롤을 홈 인디케이터 영역까지 더 내림 — 세이프에어리어 하단 여백을
    // 음수 마진으로 일부 상쇄(홈바와는 겹치지 않는 선). 프리뷰 영역 확보(사용자 요청).
    paddingBottom: 2,
    marginBottom: -10,
    gap: 3,
  },
  // 파라미터 패널 — 레인 토글 + 본문을 한 덩어리로 묶는다(토글이 '패널 안'으로 읽히게).
  // 자식(laneSeg·본문)이 각자 배경을 가지므로 래퍼는 간격만 좁혀 연속감을 준다.
  // 파라미터 패널 = 레인 세그먼트 + 본문을 담는 **하나의 패널**(배경·둥근 모서리를
  // 여기서 소유). 안쪽 레인 세그먼트·본문은 배경/마진/모서리 없이 패딩만 — 예전엔
  // 둘이 별도 View에 같은 배경으로 '한 덩어리처럼 보이게'만 했다(간격을 마진으로
  // 억지 조절). 이제 진짜 한 패널이라 레인↔본문 간격은 laneSeg paddingBottom 하나로.
  paramPanel: {
    marginHorizontal: 12,
    marginTop: -3, // 헤더(undo/redo 줄)와 붙임
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  // 레인(메이크업/보정) 토글 버튼 — 깊이 버튼 왼쪽. 솔리드 필로 깊이(아웃라인)와 구분.
  // 'MODE' 라벨 — 레인 버튼 왼쪽.
  // 레인 세그먼트 — 패널 최상단 full-width. 선택: 메이크업=로즈/보정=골드.
  // 레인 세그먼트 — 아래 본문 패널과 '한 덩어리'로 보이게: 같은 배경 + 위쪽 모서리만
  // 둥글게 + gap 0으로 붙여 하나의 라운드 사각형 상단이 되게. 선택 버튼만 시그니처색 틴트.
  // 레인 세그먼트 — 이제 paramPanel 안쪽 첫 줄(배경·모서리는 패널이 소유). 레인
  // 탭↔본문 간격은 paddingBottom 하나로 조절.
  laneSeg: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 5, // 레인 탭↔카테고리 탭 간격
    gap: 3,
  },
  // 반반(왼쪽/전체/오른쪽) 세그먼트와 동일 룩(사용자 요청): 선택 시 솔리드 배경
  // 채움·테두리 없음. 색만 모드별(메이크업 로즈/보정 골드/가이드 스카이).
  laneSegBtn: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneSegBtnMakeupOn: {
    backgroundColor: ROSE,
  },
  laneSegBtnWarpOn: {
    backgroundColor: GOLD,
  },
  laneSegBtnGuideOn: {
    backgroundColor: SKY,
  },
  laneSegText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  laneSegTextMakeupOn: {
    color: '#FFFFFF',
  },
  laneSegTextWarpOn: {
    color: '#FFFFFF',
  },
  laneSegTextGuideOn: {
    color: '#FFFFFF',
  },
  densityInline: {
    flex: 1,
    marginHorizontal: 8,
  },
  // 필터로 저장 — 농도 슬라이더 오른쪽에 붙는 컴팩트 로즈 알약.
  headerSaveBtn: {
    paddingHorizontal: 11,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE,
  },
  headerSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  // 보정 레인 변형 — 골드 알약 + 짙은 텍스트(골드 위 가독).
  headerSaveBtnWarp: {
    backgroundColor: GOLD,
  },
  headerSaveTextWarp: {
    color: '#1A1206',
  },
  // 비활성(저장할 수정사항 없음) — 회색 알약, 터치 무반응(disabled). 색 변형보다 뒤에 와서 이김.
  headerSaveBtnOff: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerSaveTextOff: {
    color: 'rgba(255,255,255,0.4)',
  },
  laneStack: {
    gap: 6,
  },
  // 공유 파라미터 헤더 — 좌: 최소화/undo/redo, 우: 깊이 버튼
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    gap: 6,
  },
  miniBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  histBtn: {
    width: 30,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  histBtnOff: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  headerSpacer: {
    flex: 1,
  },
  depthBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 13,
    backgroundColor: 'rgba(255,126,157,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,126,157,0.9)',
  },
  depthBtnText: {
    color: '#FF9EB5',
    fontSize: 12,
    fontWeight: '700',
  },
  // 카메라 줄 — 갤러리·셔터·전후면
  cameraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  camSideBtn: {
    width: 60,
    paddingVertical: 6,
    alignItems: 'center',
  },
  // 갤러리 버튼 — 최신 촬영 사진 썸네일(라벨 없음).
  galleryThumb: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  galleryThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  // 사진/동영상 심플 토글 — 셔터 아래 중앙. 현재 모드만 강조.
  simpleToggleRow: {
    alignItems: 'center',
    marginTop: 4, // 살짝 내려 촬영 버튼에 가깝게(사용자 요청)
    marginBottom: 1,
  },
  simpleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  toggleOpt: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleOptOn: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  toggleDivider: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
  },
  // 동영상 모드 대기 = 빨간 원, 녹화 중 = 빨간 사각(정지 버튼).
  shutterInnerVideo: {
    backgroundColor: '#FF3B30',
  },
  shutterInnerRecording: {
    backgroundColor: '#FF3B30',
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  recordingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  // 디버그 레일(좌측, __DEV__) — 캘리브레이션·디버그 토글 세로 스트립.
  debugRail: {
    position: 'absolute',
    left: 4,
    gap: 4,
  },
  debugBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    minWidth: 58,
  },
  debugBtnOn: {
    borderColor: '#7FE0A0',
    backgroundColor: 'rgba(127,224,160,0.2)',
  },
  debugText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  sideButton: {
    width: 64,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sideButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sideButtonGold: {
    color: '#E6C687',
  },
  // ── 사전 촬영 미디어 보정 ──
  editBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 34,
    paddingTop: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
    zIndex: 40,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  editBanner: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  editBannerText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editBtnGhost: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  editBtnGhostText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  editBtnPrimary: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#E6C687',
  },
  editBtnPrimaryText: {
    color: '#1A1206',
    fontSize: 15,
    fontWeight: '700',
  },
  editProgressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  editProgressCard: {
    minWidth: 240,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 18,
    backgroundColor: 'rgba(28,28,30,0.96)',
    alignItems: 'center',
    gap: 14,
  },
  editProgressText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  editProgressTrack: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  editProgressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E6C687',
  },
  editProgressHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  shutterOuter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  captureFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth, // 1px → 헤어라인(가장 얇은 선, 3x에서 ~0.33px)
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  hiddenBar: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  showUiBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  showUiText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  gridV33: { left: '33.333%' },
  gridV66: { left: '66.666%' },
  gridH33: { top: '33.333%' },
  gridH66: { top: '66.666%' },
  previewRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
  },
  previewClose: {
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  previewCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // 카탈로그 관리 모달 (§16) — 붙여넣기 임포트 · 카탈로그에 저장
  catalogModalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  catalogModalCard: {
    borderRadius: 16,
    backgroundColor: '#1B1B1F',
    padding: 18,
    gap: 10,
  },
  catalogModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  catalogModalHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 17,
  },
  catalogModalInput: {
    minHeight: 150,
    maxHeight: 260,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    fontSize: 12,
    padding: 10,
    textAlignVertical: 'top',
  },
  catalogNameInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // 원격 매니페스트 URL 임포트 행(§16 v2) — 단일줄 입력 + URL 버튼.
  catalogUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catalogUrlInput: {
    flex: 1,
  },
  catalogModalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  catalogModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  catalogModalBtnPrimary: {
    backgroundColor: '#FF7E9D',
  },
  catalogModalBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  catalogModalBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default App;
