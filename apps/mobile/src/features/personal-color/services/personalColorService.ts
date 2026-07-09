// 오케스트레이터: 캡처 → 네이티브 색통계 → 엔진(5축·12톤) → 아티팩트 → JSONL → 결과.
// 프라이버시 불변식(localOnly)을 assert하고, personal_color는 어떤 업로드 경로도 호출하지 않는다.

import { analyzePersonalColorPhoto } from './personalColorAnalyzerNative';
import type { PersonalColorLandmarkInput } from './personalColorAnalyzerNative';
import { requestFaceLandmarks } from '../../ar/services/unityMakeupBridge';
import { saveSourceImage, writeResultJson } from './personalColorArtifacts';
import { analyzePersonalColor } from './personalColorCore/engine';
import { evaluatePersonalColorQuality } from './personalColorQualityGate';
import { createPersonalColorLogger } from './personalColorLogger';
import type { AuraPersonalColorResult } from './personalColorCore/contracts';
import type { PersonalColorCaptureInput } from '../types';

export type PersonalColorAnalysisOutcome = {
  result: AuraPersonalColorResult;
  artifacts: {
    sourceUri: string | null;
    resultJsonUri: string | null;
    logUri: string | null;
  };
};

// 온디바이스 전용 invariant. 위반 시 즉시 throw(개발 중 오배선 차단).
function assertLocalOnly(result: AuraPersonalColorResult): void {
  if (result.privacy.localOnly !== true || result.privacy.offDeviceUpload !== false) {
    throw new Error('personal-color privacy invariant violated: must be local-only, no upload');
  }
}

export async function analyzePersonalColorCapture(
  input: PersonalColorCaptureInput,
): Promise<PersonalColorAnalysisOutcome> {
  const logger = createPersonalColorLogger(input.sessionId, input.createdAt);
  logger.log('capture:received', { captureId: input.captureId, imageUri: input.imageUri });

  let sourceUri: string | null = null;
  try {
    sourceUri = await saveSourceImage(input.sessionId, input.imageUri);
  } catch (error) {
    logger.log('artifact:source_failed', { message: String(error) });
  }

  // homuler(Unity IMAGE 모드)에서 얼굴 랜드마크를 받아온다. 미탑재/타임아웃/미검출은
  // null 로 격리 → 네이티브가 얼굴 미검출로 처리(로컬 전용 유지, 업로드/원격 호출 없음).
  let landmarks: PersonalColorLandmarkInput | undefined;
  try {
    const detected = await requestFaceLandmarks(input.imageUri);
    logger.log('landmarks:done', {
      source: 'unity-homuler',
      status: detected.status,
      count: detected.landmarks.length,
    });
    if (detected.status === 'ok' && detected.landmarks.length > 0) {
      landmarks = {
        points: detected.landmarks,
        imageWidth: detected.imageWidth,
        imageHeight: detected.imageHeight,
        pose: detected.pose,
      };
    }
  } catch (error) {
    logger.log('landmarks:error', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const native = await analyzePersonalColorPhoto(input.imageUri, { landmarks });
  logger.log('native:done', {
    status: native.status,
    regions: Object.keys(native.regions ?? {}),
    hairMatte: native.matte?.hairAvailable ?? false,
    skinMatte: native.matte?.skinAvailable ?? false,
  });

  const gate = evaluatePersonalColorQuality(native);
  if (gate.warnings.length > 0) {
    logger.log('quality:gate', { usable: gate.usable, warnings: gate.warnings });
  }

  const result = analyzePersonalColor(native, {
    frameCount: input.frameCount,
    calibrationApplied: input.calibrationApplied,
    calibrationVersion: input.calibrationVersion,
  });

  // 게이트 경고를 결과 경고에 병합(중복 제외)
  for (const w of gate.warnings) {
    if (!result.warnings.includes(w)) {
      result.warnings.push(w);
    }
  }

  assertLocalOnly(result);

  let resultJsonUri: string | null = null;
  try {
    resultJsonUri = await writeResultJson(input.sessionId, result);
  } catch (error) {
    logger.log('artifact:result_failed', { message: String(error) });
  }

  logger.log('analysis:done', {
    status: result.status,
    measurementConfidence: result.measurementConfidence,
    top: result.tone?.top ?? null,
    secondary: result.tone?.secondary ?? null,
    isMixed: result.tone?.isMixed ?? false,
  });

  return {
    result,
    artifacts: { sourceUri, resultJsonUri, logUri: logger.logFileUri },
  };
}
