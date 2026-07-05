import { NativeModules } from 'react-native';

import type { NativePersonalColorResult } from './personalColorCore/contracts';

export type PersonalColorAnalyzeOptions = {
  // 예약: 향후 튜닝 override 전달용 (네이티브 kXXX 상수)
  tuning?: Record<string, number>;
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
