import {
  LipAdjustment,
  LipGeneratePackage,
  LipMaskProvider,
  LipRuntimeApplyPayload,
} from './contracts';

type BuildRuntimePayloadInput = {
  generatedMaskId: string;
  captureSetId?: string;
  provider: LipMaskProvider;
  expressionMode: LipRuntimeApplyPayload['expressionMode'];
  adjustment: LipAdjustment;
  maskTexturePath?: string;
  maskTextureId?: string;
  maskTextureEncoding?: LipRuntimeApplyPayload['maskTextureEncoding'];
  maskPngBase64?: string;
  maskRawRgbaBase64?: string;
  maskTextureWidth?: number;
  maskTextureHeight?: number;
  maskThreshold?: number;
  maskFeatherUvNormalized?: number;
  runtimeReady?: boolean;
};

export function buildRuntimeApplyPayload({
  generatedMaskId,
  captureSetId,
  provider,
  expressionMode,
  adjustment,
  maskTexturePath,
  maskTextureId,
  maskTextureEncoding,
  maskPngBase64,
  maskRawRgbaBase64,
  maskTextureWidth,
  maskTextureHeight,
  maskThreshold = 0.5,
  maskFeatherUvNormalized = 0.07,
  runtimeReady = false,
}: BuildRuntimePayloadInput): LipRuntimeApplyPayload {
  return {
    schemaVersion: 'e7-generated-lip-mask-runtime-payload-v0',
    generatedMaskId,
    captureSetId,
    provider,
    expressionMode,
    adjustment,
    maskTexturePath,
    maskTextureId,
    maskTextureEncoding,
    maskPngBase64,
    maskRawRgbaBase64,
    maskTextureWidth,
    maskTextureHeight,
    maskThreshold,
    maskFeatherUvNormalized,
    localOnly: true,
    offDeviceUpload: false,
    longTermRawFrameStored: false,
    runtimeReady,
  };
}

export function buildUnityMessageFromPackage(
  generatedPackage: LipGeneratePackage,
) {
  return {
    type: 'apply_generated_lip_mask',
    schemaVersion: generatedPackage.runtimeApplyPayload.schemaVersion,
    generatedMaskId: generatedPackage.generatedMaskId,
    captureSetId: generatedPackage.captureSetId,
    provider: generatedPackage.provider,
    expressionMode: generatedPackage.expressionMode,
    adjustment: generatedPackage.adjustment,
    maskTexturePath: generatedPackage.runtimeApplyPayload.maskTexturePath,
    maskTextureId: generatedPackage.runtimeApplyPayload.maskTextureId,
    maskTextureEncoding:
      generatedPackage.runtimeApplyPayload.maskTextureEncoding,
    maskPngBase64: generatedPackage.runtimeApplyPayload.maskPngBase64,
    maskRawRgbaBase64:
      generatedPackage.runtimeApplyPayload.maskRawRgbaBase64,
    maskTextureWidth: generatedPackage.runtimeApplyPayload.maskTextureWidth,
    maskTextureHeight: generatedPackage.runtimeApplyPayload.maskTextureHeight,
    maskThreshold: generatedPackage.runtimeApplyPayload.maskThreshold,
    maskFeatherUvNormalized:
      generatedPackage.runtimeApplyPayload.maskFeatherUvNormalized,
    localOnly: true,
    offDeviceUpload: false,
    longTermRawFrameStored: false,
    runtimeReady: generatedPackage.runtimeApplyPayload.runtimeReady,
  };
}
