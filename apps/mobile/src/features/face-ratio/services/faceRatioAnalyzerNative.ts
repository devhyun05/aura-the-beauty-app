import {NativeModules} from 'react-native';

import type {FaceRatioHairlineTuning} from '../constants';
import type {NativeFaceRatioAnalyzeResult} from '../types';

export type FaceRatioHairlineOptions = {
  // 네이티브 tmp에 apple-hair-matte.png / apple-skin-matte.png / hairline-debug.png 생성
  debugArtifacts?: boolean;
  // false면 matte 파싱 자체를 건너뜀 (촬영 payload가 matte 없음을 알린 경우 로그 소음 억제용).
  // 기본 true — matte 없는 파일의 aux-data 조회는 빠르게 nil이라 안전하다.
  enabled?: boolean;
  // AURAFaceRatioHairline.m의 kHairline* 상수 override (constants.ts HAIRLINE_TUNING)
  tuning?: FaceRatioHairlineTuning;
};

export type FaceRatioAnalyzeOptions = {
  hairline?: FaceRatioHairlineOptions;
};

type NativeFaceRatioAnalyzer = {
  analyze?: (
    imageUri: string,
    options?: FaceRatioAnalyzeOptions,
  ) => Promise<NativeFaceRatioAnalyzeResult>;
};

function getNativeFaceRatioAnalyzer(): NativeFaceRatioAnalyzer | undefined {
  return NativeModules.AURAFaceRatioAnalyzer as NativeFaceRatioAnalyzer | undefined;
}

export function isFaceRatioAnalyzerAvailable(): boolean {
  return typeof getNativeFaceRatioAnalyzer()?.analyze === 'function';
}

export async function analyzeFacePhoto(
  imageUri: string,
  options: FaceRatioAnalyzeOptions = {},
): Promise<NativeFaceRatioAnalyzeResult> {
  const analyzer = getNativeFaceRatioAnalyzer();

  if (typeof analyzer?.analyze !== 'function') {
    return {
      error: 'AURAFaceRatioAnalyzer native module is not available. Rebuild the iOS app.',
      faceCount: 0,
      status: 'unsupported',
    };
  }

  return analyzer.analyze(imageUri, options);
}
