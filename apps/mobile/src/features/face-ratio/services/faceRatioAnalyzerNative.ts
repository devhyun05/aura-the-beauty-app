import {NativeModules} from 'react-native';

import type {FaceRatioHairlineTuning} from '../constants';
import type {NativeFaceRatioAnalyzeResult} from '../types';
import type {
  FaceRatioLandmark3D,
  FaceRatioTransformationMatrix,
} from './faceRatioPoseNormalization';

export type FaceRatioHairlineOptions = {
  // 네이티브 tmp에 apple-hair-matte.png / apple-skin-matte.png / hairline-debug.png 생성
  debugArtifacts?: boolean;
  // 헤어 분석 기능에서 Apple hair/skin matte PNG를 production 입력으로 내보낸다.
  matteArtifacts?: boolean;
  // false면 matte 파싱 자체를 건너뜀 (촬영 payload가 matte 없음을 알린 경우 로그 소음 억제용).
  // 기본 true — matte 없는 파일의 aux-data 조회는 빠르게 nil이라 안전하다.
  enabled?: boolean;
  // AURAFaceRatioHairline.m의 kHairline* 상수 override (constants.ts HAIRLINE_TUNING)
  tuning?: FaceRatioHairlineTuning;
};

// homuler(Unity IMAGE 모드)에서 검출해 넘겨주는 얼굴 랜드마크.
// CocoaPods MediaPipe 제거 이후, 네이티브 분석기는 랜드마크를 스스로 검출하지 않고
// 이 입력(정규화 478점 + 원본 크기 + pose + optional matrix)으로 네이티브
// hair-matte 경계를 계산한다. 구조 키포인트/비율과 Phase 1 정면화는 동일 입력
// replay를 위해 순수 TS 코어가 담당한다.
export type FaceRatioLandmarkInput = {
  points: FaceRatioLandmark3D[];
  imageWidth: number;
  imageHeight: number;
  pose: {pitchDeg: number; yawDeg: number; rollDeg: number} | null;
  transformationMatrix?: FaceRatioTransformationMatrix;
};

export type FaceRatioAnalyzeOptions = {
  hairline?: FaceRatioHairlineOptions;
  // Unity homuler 로 검출한 랜드마크. 없으면 네이티브가 얼굴 미검출로 처리한다.
  landmarks?: FaceRatioLandmarkInput;
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
