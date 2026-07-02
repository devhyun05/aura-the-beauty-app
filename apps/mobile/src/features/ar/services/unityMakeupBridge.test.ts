import {
  UNITY_MAKEUP_BRIDGE_TARGET,
  UNITY_MAKEUP_LAYER_ORDER,
  createUnityMakeupRecipeBatch,
  createUnityMakeupRecipeBatchFromARFilterSelections,
  getUnityGeneratedMaskBridgeRoute,
  getUnityMakeupLayerRegionsForMakeupArea,
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
  'lip,blush,brow,eyeliner',
  'Unity makeup layer order',
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
expectEqual(singleRegionRecipe.layerCount, 4, 'single region recipe layer count');
expectEqual(singleRegionRecipe.enabledLayerCount, 1, 'single region enabled count');
expectEqual(singleRegionRecipe.activeRegions, 'eyeliner', 'single region active summary');
expectEqual(
  singleRegionRecipe.layers.map(layer => layer.region).join(','),
  'lip,blush,brow,eyeliner',
  'single region recipe keeps four-layer shape',
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

expectEqual(allRegionRecipe.layerCount, 4, 'all region recipe layer count');
expectEqual(allRegionRecipe.enabledLayerCount, 4, 'all region enabled count');
expectEqual(
  allRegionRecipe.activeRegions,
  'lip,blush,brow,eyeliner',
  'all region active summary',
);
expectEqual(
  allRegionRecipe.layers.find(layer => layer.region === 'brow')?.maskTextureId,
  'psd-arcore-brow-semi-arch-v1',
  'brow recipe mask id',
);
