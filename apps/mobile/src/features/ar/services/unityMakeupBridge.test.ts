import {
  FACE_LANDMARKS_EVENT_TYPE,
  FACE_LANDMARKS_STILL_REQUEST_TYPE,
  UNITY_MAKEUP_BRIDGE_TARGET,
  UNITY_MAKEUP_LAYER_ORDER,
  UNITY_STILL_FACE_LANDMARKS_TARGET,
  buildAnalyzeFaceLandmarksStillRequest,
  buildFilterParamsFromARFilterSelections,
  cancelUnityUnifiedFaceCapture,
  createUnityMakeupRecipeBatch,
  createUnityMakeupRecipeBatchFromARFilterSelections,
  getUnityGeneratedMaskBridgeRoute,
  getUnityMakeupLayerRegionsForMakeupArea,
  parseFaceLandmarksMessage,
  parseUnityUnifiedFaceCaptureMessage,
  prepareUnityUnifiedFaceCapture,
  startUnityUnifiedFaceCapture,
} from './unityMakeupBridge';
import {NativeModules} from 'react-native';
import type {MakeupFilter} from '../../../shared/types/makeupGuide';
import {buildUnifiedFaceCaptureRequest} from '../../face-capture/services/unifiedFaceCaptureContract';
import {AR_BLUSH_SHAPES} from '../../../shared/contracts/arBlushCatalog';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const mockFilter: MakeupFilter = {
  id: 'full-face-contract',
  imageSource: 1,
  categoryId: 'recommended',
  title: '맞춤 룩',
  subtitle: '4부위',
  intensityLabel: '기본',
  makeupAreas: ['all'],
  colorOptions: [{id: 'rose', label: '로즈', hex: '#C76B74'}],
  typeOptions: [{id: 'liner', label: '라이너'}],
  textureOptions: [{id: 'matte', label: '매트'}],
};

expectEqual(
  UNITY_MAKEUP_LAYER_ORDER.join(','),
  'foundation,lip,blush,brow,eyeshadow,eyeliner,lens',
  'Unity makeup layer order',
);
expectEqual(
  getUnityMakeupLayerRegionsForMakeupArea('lens').join(','),
  'lens',
  'lens area alias',
);
expectEqual(
  getUnityMakeupLayerRegionsForMakeupArea('cheek').join(','),
  'blush',
  'cheek area alias',
);
expectEqual(
  getUnityMakeupLayerRegionsForMakeupArea('eye').join(','),
  'eyeliner',
  'eye area alias',
);

for (const shape of AR_BLUSH_SHAPES) {
  const params = buildFilterParamsFromARFilterSelections([
    {
      selectedColor: {hex: '#D77986', label: '로즈'},
      selectedColorId: 'neutral-rose',
      selectedMakeupArea: 'cheek',
      selectedMakeupFilter: mockFilter,
      selectedPointMakeupLookId: 'custom-blush',
      selectedShapeId: shape.arFilterShapeId,
      selectedTextureId: 'matte',
      selectedTotalMakeupLookId: null,
      selectedTypeId: 'blush',
    },
  ]);
  expectEqual(
    params.blushShape,
    shape.value,
    `${shape.label} AR 필터 shape value`,
  );
}

const generatedLipRoute = getUnityGeneratedMaskBridgeRoute('lip');
const generatedBrowRoute = getUnityGeneratedMaskBridgeRoute('brow');

expectEqual(
  generatedLipRoute.method,
  UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedLipMaskMethod,
  'generated lip Unity method',
);
expectEqual(
  generatedLipRoute.eventName,
  'generated_lip_mask_apply',
  'generated lip event name',
);
expectEqual(
  generatedLipRoute.retryKeyPrefix,
  'generated-lip-mask',
  'generated lip retry prefix',
);
expectEqual(
  generatedBrowRoute.method,
  UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedBrowMaskMethod,
  'generated brow Unity method',
);
expectEqual(
  generatedBrowRoute.eventName,
  'generated_brow_mask_apply',
  'generated brow event name',
);
expectEqual(
  generatedBrowRoute.retryKeyPrefix,
  'generated-brow-mask',
  'generated brow retry prefix',
);

const singleRegionRecipe = createUnityMakeupRecipeBatch('eyeliner', 1000);

expectEqual(singleRegionRecipe.version, 2, 'single region recipe version');
expectEqual(singleRegionRecipe.layerCount, 6, 'single region recipe layer count');
expectEqual(singleRegionRecipe.enabledLayerCount, 1, 'single region enabled count');
expectEqual(singleRegionRecipe.activeRegions, 'eyeliner', 'single region active summary');
expectEqual(
  singleRegionRecipe.layers.map(layer => layer.region).join(','),
  'foundation,lip,blush,brow,eyeshadow,eyeliner',
  'single region recipe keeps full-layer shape',
);
expectEqual(
  singleRegionRecipe.layers.find(layer => layer.region === 'eyeliner')?.maskTextureId,
  'e7-eyeliner-minimal-safe-uv-v0',
  'eyeliner recipe mask id',
);

const allRegionRecipe = createUnityMakeupRecipeBatchFromARFilterSelections(
  [
    {
      selectedColor: {hex: '#C76B74', label: '로즈'},
      selectedColorId: 'rose',
      selectedMakeupArea: 'all',
      selectedMakeupFilter: mockFilter,
      selectedPointMakeupLookId: 'custom',
      selectedShapeId: 'balanced',
      selectedTextureId: 'matte',
      selectedTotalMakeupLookId: 'custom',
      selectedTypeId: 'liner',
    },
  ],
  2000,
);

expectEqual(allRegionRecipe.layerCount, 6, 'all region recipe layer count');
// 'all' enables every region EXCEPT lens and eyeshadow (both opt-in), so
// 5 of the 7 emitted layers are active.
expectEqual(allRegionRecipe.enabledLayerCount, 5, 'all region enabled count');
expectEqual(
  allRegionRecipe.activeRegions,
  'foundation,lip,blush,brow,eyeliner',
  'all region active summary',
);
expectEqual(
  allRegionRecipe.layers.find(layer => layer.region === 'brow')?.maskTextureId,
  'brow-png-natural-hair-v1',
  'brow recipe mask id',
);

// ── 퍼스널 컬러 정지영상 랜드마크 요청/응답 (homuler Track 1) ────────────────
const stillRequest = JSON.parse(
  buildAnalyzeFaceLandmarksStillRequest('file:///tmp/capture.jpg', 'pc-abc', 1),
);
expectEqual(stillRequest.type, FACE_LANDMARKS_STILL_REQUEST_TYPE, 'still request type');
expectEqual(stillRequest.requestId, 'pc-abc', 'still request id');
expectEqual(stillRequest.imagePath, 'file:///tmp/capture.jpg', 'still request imagePath');
expectEqual(stillRequest.maxFaces, 1, 'still request maxFaces');

const okLandmarks = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-abc',
    status: 'ok',
    faceCount: 1,
    imageWidth: 1080,
    imageHeight: 1440,
    landmarks: [
      {i: 0, x: 0.5, y: 0.42, z: -0.03},
      {i: 1, x: 0.51, y: 0.44, z: -0.02},
      {i: 2, x: 'bad', y: 0.5, z: 0}, // 비유한값 → 필터링
      {i: 3, x: 0.52, y: 0.46, z: 'bad'}, // 깨진 z를 0으로 위장하지 않음
      {i: 4, x: 0.53, y: 0.47}, // 누락 z도 필터링
    ],
    pose: {pitchDeg: 1.2, yawDeg: -0.4, rollDeg: 0.8},
    transformationMatrix: {
      layout: 'row-major',
      values: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, -0.2, 0.3, 1],
    },
  }),
);
expectEqual(okLandmarks?.status, 'ok', 'landmarks status ok');
expectEqual(okLandmarks?.requestId, 'pc-abc', 'landmarks requestId');
expectEqual(okLandmarks?.faceCount, 1, 'landmarks faceCount');
expectEqual(okLandmarks?.imageWidth, 1080, 'landmarks imageWidth');
expectEqual(okLandmarks?.landmarks.length, 2, 'landmarks filtered count');
expectEqual(okLandmarks?.landmarks[0].x, 0.5, 'landmarks first x');
expectEqual(okLandmarks?.pose?.pitchDeg, 1.2, 'landmarks pose pitch');
expectEqual(
  okLandmarks?.transformationMatrix?.values[12],
  0.1,
  'landmarks transformation matrix preserved',
);

const malformedMatrixLandmarks = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-malformed-matrix',
    status: 'ok',
    faceCount: 1,
    imageWidth: 1080,
    imageHeight: 1440,
    landmarks: [{i: 0, x: 0.5, y: 0.42, z: -0.03}],
    pose: {pitchDeg: 0, yawDeg: 0, rollDeg: 0},
    transformationMatrix: {
      layout: 'row-major',
      values: [1, 0, 0],
    },
  }),
);
expectEqual(
  malformedMatrixLandmarks?.transformationMatrix,
  undefined,
  'malformed matrix is omitted so correction stays disabled',
);

// 다른 이벤트 타입(예: photoCaptured)은 무시(null)
const otherEvent = parseFaceLandmarksMessage(
  JSON.stringify({type: 'photoCaptured', path: 'file:///tmp/x.jpg'}),
);
expectEqual(otherEvent, null, 'non personal-color event ignored');

// 형식 깨진 JSON 은 null
expectEqual(
  parseFaceLandmarksMessage('{not-json'),
  null,
  'malformed message ignored',
);

// requestId 없는 랜드마크 이벤트는 null(상관 불가)
expectEqual(
  parseFaceLandmarksMessage(
    JSON.stringify({type: FACE_LANDMARKS_EVENT_TYPE, status: 'ok'}),
  ),
  null,
  'landmarks without requestId ignored',
);

// Unity 수신 타겟: StillFaceLandmarkService.cs 의 GameObject/메서드명과 계약
expectEqual(
  UNITY_STILL_FACE_LANDMARKS_TARGET.gameObject,
  'AuraStillFaceLandmarks',
  'still landmarks gameObject',
);
expectEqual(
  UNITY_STILL_FACE_LANDMARKS_TARGET.analyzeMethod,
  'AnalyzeStillJson',
  'still landmarks method',
);

// 통합 얼굴 촬영 v2도 기존 RNBridge GameObject를 사용하되 legacy Face3D v1
// Start/Cancel 메서드와 분리된 immutable 요청 경로로 보낸다.
expectEqual(
  UNITY_MAKEUP_BRIDGE_TARGET.prepareUnifiedFaceCaptureMethod,
  'PrepareUnifiedFaceCaptureJson',
  'unified capture prepare method',
);
expectEqual(
  UNITY_MAKEUP_BRIDGE_TARGET.startUnifiedFaceCaptureMethod,
  'StartUnifiedFaceCaptureJson',
  'unified capture start method',
);
expectEqual(
  UNITY_MAKEUP_BRIDGE_TARGET.cancelUnifiedFaceCaptureMethod,
  'CancelUnifiedFaceCaptureJson',
  'unified capture cancel method',
);

const unifiedBridgeCalls: Array<{
  gameObject: string;
  method: string;
  payload: string;
}> = [];
let unifiedPrepareRuntimeCallCount = 0;
Object.assign(NativeModules.UnityMakeupBridge, {
  isFrameworkAvailable: () => true,
  postMessage: (gameObject: string, method: string, payload: string) => {
    unifiedBridgeCalls.push({gameObject, method, payload});
  },
  prepareRuntime: () => {
    unifiedPrepareRuntimeCallCount += 1;
  },
});

const unifiedRequest = buildUnifiedFaceCaptureRequest({
  requestId: 'unified-bridge-1',
});
expectEqual(
  prepareUnityUnifiedFaceCapture(unifiedRequest),
  true,
  'unified capture prepare posts',
);
expectEqual(unifiedPrepareRuntimeCallCount, 1, 'unified prepare warms runtime');
expectEqual(
  unifiedBridgeCalls[0]?.gameObject,
  UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
  'unified prepare gameObject',
);
expectEqual(
  unifiedBridgeCalls[0]?.method,
  UNITY_MAKEUP_BRIDGE_TARGET.prepareUnifiedFaceCaptureMethod,
  'unified prepare target method',
);
expectEqual(
  JSON.parse(unifiedBridgeCalls[0]?.payload ?? '{}').collectionPolicyId,
  'unified-micro-burst-5of8-v1',
  'unified prepare preserves immutable policy',
);

expectEqual(
  startUnityUnifiedFaceCapture(unifiedRequest),
  true,
  'unified capture start posts',
);
expectEqual(
  unifiedBridgeCalls[1]?.method,
  UNITY_MAKEUP_BRIDGE_TARGET.startUnifiedFaceCaptureMethod,
  'unified start target method',
);
expectEqual(
  JSON.parse(unifiedBridgeCalls[1]?.payload ?? '{}').requestId,
  unifiedRequest.requestId,
  'unified start requestId',
);
expectEqual(
  startUnityUnifiedFaceCapture({
    ...unifiedRequest,
    targetValidFrames: 30,
  }),
  false,
  'mutated unified policy is rejected before Unity post',
);
expectEqual(
  unifiedBridgeCalls.length,
  2,
  'invalid unified start does not reach native bridge',
);

expectEqual(
  cancelUnityUnifiedFaceCapture(unifiedRequest.requestId, 'screen_unmounted'),
  true,
  'unified capture cancel posts',
);
expectEqual(
  unifiedBridgeCalls[2]?.method,
  UNITY_MAKEUP_BRIDGE_TARGET.cancelUnifiedFaceCaptureMethod,
  'unified cancel target method',
);
expectEqual(
  JSON.parse(unifiedBridgeCalls[2]?.payload ?? '{}').reason,
  'screen_unmounted',
  'unified cancel reason',
);
expectEqual(
  cancelUnityUnifiedFaceCapture('   '),
  false,
  'blank unified cancel requestId rejected',
);

const unifiedBlockedEvent = parseUnityUnifiedFaceCaptureMessage(
  JSON.stringify({
    reason: 'native_face_frame_sync_unavailable',
    requestId: unifiedRequest.requestId,
    type: 'unified_face_capture_blocked',
    warnings: ['native_sync_unavailable'],
  }),
);
expectEqual(
  unifiedBlockedEvent?.type,
  'unified_face_capture_blocked',
  'unified event parsed from generic Unity event message',
);
expectEqual(
  parseUnityUnifiedFaceCaptureMessage(
    JSON.stringify({requestId: unifiedRequest.requestId, type: 'face3d_status'}),
  ),
  null,
  'legacy Face3D event is not reclassified as unified',
);
expectEqual(
  parseUnityUnifiedFaceCaptureMessage('{bad-json'),
  null,
  'malformed unified event ignored',
);

// Unity SendFailure 형식(빈 landmarks + error, imageWidth/pose 없음)도 파싱
const failureEvent = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-err',
    status: 'error',
    faceCount: 0,
    landmarks: [],
    error: 'mediapipe_package_unavailable',
  }),
);
expectEqual(failureEvent?.status, 'error', 'failure status parsed');
expectEqual(failureEvent?.error, 'mediapipe_package_unavailable', 'failure error field');
expectEqual(failureEvent?.imageWidth, 0, 'failure imageWidth defaults 0');
expectEqual(failureEvent?.pose, null, 'failure pose null');

// no_face 응답도 정상 파싱(호출측이 insufficient 처리)
const noFace = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-def',
    status: 'no_face',
    faceCount: 0,
    landmarks: [],
  }),
);
expectEqual(noFace?.status, 'no_face', 'no_face status parsed');
expectEqual(noFace?.landmarks.length, 0, 'no_face empty landmarks');
expectEqual(noFace?.pose, null, 'no_face null pose');

// ── 아이섀도 그래프트 사이드채널 (setEyeshadowLayers) ────────────────────────
// eyeshadow 레이어는 ApplyRecipeJson 와이어에 실리면 Unity 파서가 전체 레시피를
// 초기화하므로, 와이어에서 제거되고 그래프트 밴드 계약으로 번역되어야 한다.
import {
  buildEyeshadowLayersFromRecipe,
  stripGraftOnlyRecipeLayers,
} from './unityMakeupBridge';
import {
  DEFAULT_FULL_FACE_REGION_CONTROLS,
  buildFullFaceMakeupRecipe,
} from '../../../shared/contracts/fullFaceMakeupRecipe';

const eyeshadowControls = {
  ...DEFAULT_FULL_FACE_REGION_CONTROLS,
  eyeshadow: {
    ...DEFAULT_FULL_FACE_REGION_CONTROLS.eyeshadow,
    enabled: true,
    colorHex: '#B03A48',
    intensity: 0.6,
    finish: 'shimmer',
    shimmer: 0.5,
    params: {coverage: 1.2},
  },
};
const eyeshadowRecipe = buildFullFaceMakeupRecipe({
  controls: eyeshadowControls,
  sentAtMs: 4000,
});

const eyeshadowBands = buildEyeshadowLayersFromRecipe(eyeshadowRecipe);
expectEqual(eyeshadowBands.length, 1, 'enabled eyeshadow -> single band');
expectEqual(eyeshadowBands[0]?.color, '#B03A48', 'band color from control');
expectEqual(eyeshadowBands[0]?.finish, 3, 'shimmer finish enum');
expectEqual(eyeshadowBands[0]?.shimmer, 0.5, 'shimmer gain passthrough');
expectEqual(eyeshadowBands[0]?.height, 1.2, 'coverage param -> band height');
expectEqual(eyeshadowBands[0]?.intensity, 0.6, 'band intensity');
expectEqual(eyeshadowBands[0]?.surface, 0, 'band surface upper');

const wireRecipe = stripGraftOnlyRecipeLayers(eyeshadowRecipe);
expectEqual(
  wireRecipe.layers.some(layer => layer.region === 'eyeshadow'),
  false,
  'eyeshadow layer stripped from ApplyRecipeJson wire',
);
expectEqual(wireRecipe.layerCount, 5, 'wire layer count recomputed');
expectEqual(
  wireRecipe.activeRegions.includes('eyeshadow'),
  false,
  'wire active regions exclude eyeshadow',
);
expectEqual(
  wireRecipe.enabledLayerCount,
  eyeshadowRecipe.enabledLayerCount - 1,
  'wire enabled count recomputed',
);

// 비활성(기본) 아이섀도 → 빈 배열(밴드 클리어 계약)
const defaultWireRecipe = buildFullFaceMakeupRecipe({sentAtMs: 5000});
expectEqual(
  buildEyeshadowLayersFromRecipe(defaultWireRecipe).length,
  0,
  'disabled eyeshadow -> empty band list (clears graft band)',
);
