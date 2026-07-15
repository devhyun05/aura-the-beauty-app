import {
  FACE_LANDMARKS_EVENT_TYPE,
  FACE_LANDMARKS_STILL_REQUEST_TYPE,
  UNITY_MAKEUP_BRIDGE_TARGET,
  UNITY_MAKEUP_LAYER_ORDER,
  UNITY_STILL_FACE_LANDMARKS_TARGET,
  buildAnalyzeFaceLandmarksStillRequest,
  buildFilterParamsFromARFilterSelections,
  buildUnitySplitModeMessage,
  createUnityMakeupRecipeBatch,
  createUnityMakeupRecipeBatchFromARFilterSelections,
  getUnityGeneratedMaskBridgeRoute,
  getUnityMakeupLayerRegionsForMakeupArea,
  parseFaceLandmarksMessage,
} from './unityMakeupBridge';
import type {MakeupFilter} from '../../../shared/types/makeupGuide';

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
  'foundation,lip,blush,brow,eyeliner,lens',
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
expectEqual(singleRegionRecipe.layerCount, 5, 'single region recipe layer count');
expectEqual(singleRegionRecipe.enabledLayerCount, 1, 'single region enabled count');
expectEqual(singleRegionRecipe.activeRegions, 'eyeliner', 'single region active summary');
expectEqual(
  singleRegionRecipe.layers.map(layer => layer.region).join(','),
  'foundation,lip,blush,brow,eyeliner',
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

const baseFilterParams = buildFilterParamsFromARFilterSelections([
  {
    selectedColor: {hex: '#F0E7DB', label: '포슬린 쿨'},
    selectedColorId: 'porcelain-cool-110c',
    selectedMakeupArea: 'base',
    selectedMakeupFilter: mockFilter,
    selectedPointMakeupLookId: 'custom',
    selectedShapeId: 'base-default',
    selectedTextureId: 'natural',
    selectedTotalMakeupLookId: null,
    selectedTypeId: 'foundation',
  },
]);
expectEqual(baseFilterParams.skinSmoothing, 0.58, 'base skin smoothing');
expectEqual(baseFilterParams.skinSmoothingExtended, 0.24, 'base extended skin smoothing');
expectEqual(baseFilterParams.foundationIntensity, 0.24, 'base tone-up intensity');

const lipOnlyFilterParams = buildFilterParamsFromARFilterSelections([
  {
    selectedColor: {hex: '#C94F6D', label: '로즈'},
    selectedColorId: 'rose',
    selectedMakeupArea: 'lip',
    selectedMakeupFilter: mockFilter,
    selectedPointMakeupLookId: 'custom',
    selectedShapeId: 'lip-gradient',
    selectedTextureId: 'matte',
    selectedTotalMakeupLookId: null,
    selectedTypeId: 'lip',
  },
]);
expectEqual(lipOnlyFilterParams.skinSmoothing, 0.48, 'general makeup skin smoothing');
expectEqual(lipOnlyFilterParams.skinSmoothingExtended, 0.2, 'general extended skin smoothing');

expectEqual(
  buildUnitySplitModeMessage(1),
  JSON.stringify({split: {mode: 1}, type: 'setSplit'}),
  'left half makeup split message',
);
expectEqual(
  buildUnitySplitModeMessage(9),
  JSON.stringify({split: {mode: 2}, type: 'setSplit'}),
  'split message clamps invalid mode',
);

expectEqual(allRegionRecipe.layerCount, 5, 'all region recipe layer count');
// 'all' enables every region EXCEPT lens (lens is opt-in via its own tab), so
// 5 of the 6 emitted layers are active.
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
    ],
    pose: {pitchDeg: 1.2, yawDeg: -0.4, rollDeg: 0.8},
  }),
);
expectEqual(okLandmarks?.status, 'ok', 'landmarks status ok');
expectEqual(okLandmarks?.requestId, 'pc-abc', 'landmarks requestId');
expectEqual(okLandmarks?.faceCount, 1, 'landmarks faceCount');
expectEqual(okLandmarks?.imageWidth, 1080, 'landmarks imageWidth');
expectEqual(okLandmarks?.landmarks.length, 2, 'landmarks filtered count');
expectEqual(okLandmarks?.landmarks[0].x, 0.5, 'landmarks first x');
expectEqual(okLandmarks?.pose?.pitchDeg, 1.2, 'landmarks pose pitch');

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
