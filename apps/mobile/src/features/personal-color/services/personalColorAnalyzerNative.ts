import { NativeModules } from 'react-native';

import type { NativePersonalColorResult } from './personalColorCore/contracts';

// homuler(Unity IMAGE 모드)에서 검출해 넘겨주는 얼굴 랜드마크.
// CocoaPods MediaPipe 제거 이후, 네이티브 분석기는 랜드마크를 스스로 검출하지 않고
// 이 입력(정규화 478점 + 원본 크기 + pose)으로 색 영역 샘플링만 수행한다.
export type PersonalColorLandmarkInput = {
  points: {i: number; x: number; y: number; z: number}[];
  imageWidth: number;
  imageHeight: number;
  pose: {pitchDeg: number; yawDeg: number; rollDeg: number} | null;
};

export type PersonalColorAnalyzeOptions = {
  // 예약: 향후 튜닝 override 전달용 (네이티브 kXXX 상수)
  tuning?: Record<string, number>;
  // Unity homuler 로 검출한 랜드마크. 없으면 네이티브가 얼굴 미검출로 처리한다.
  landmarks?: PersonalColorLandmarkInput;
};

type NativePersonalColorAnalyzer = {
  analyze?: (
    imageUri: string,
    options?: PersonalColorAnalyzeOptions,
  ) => Promise<NativePersonalColorResult>;
};

function getNativeAnalyzer(): NativePersonalColorAnalyzer | undefined {
  return NativeModules.AURAPersonalColorAnalyzer as NativePersonalColorAnalyzer | undefined;
}

export function isPersonalColorAnalyzerAvailable(): boolean {
  return typeof getNativeAnalyzer()?.analyze === 'function';
}

export async function analyzePersonalColorPhoto(
  imageUri: string,
  options: PersonalColorAnalyzeOptions = {},
): Promise<NativePersonalColorResult> {
  const analyzer = getNativeAnalyzer();

  if (typeof analyzer?.analyze !== 'function') {
    return {
      status: 'unsupported',
      faceCount: 0,
      error: 'AURAPersonalColorAnalyzer native module is not available. Rebuild the iOS app.',
    };
  }

  return analyzer.analyze(imageUri, options);
}
