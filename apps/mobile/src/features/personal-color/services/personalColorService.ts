// 오케스트레이터: 캡처 → 네이티브 색통계 → 엔진(5축·12톤) → 아티팩트 → JSONL → 결과.
// 이 서비스 자체는 업로드를 호출하지 않는다. 단, 측정 데이터 3-반영 규칙(2026-07-13)에
// 따라 호출측(보고서 생성)이 reported 요약·원본을 requestPayload 에 실어 서버
// detail_payload 에 저장한다 — privacy 필드는 "이 결과 객체(원시 프레임 포함 계보)의
// 온디바이스 계약"을 뜻하며, 보고서 첨부 전송과 모순되지 않도록 wire 계약
// (faceAnalysisMeasurements)에서는 privacy 필드를 제거하고 보낸다.

import { analyzePersonalColorPhoto } from './personalColorAnalyzerNative';
import type { PersonalColorLandmarkInput } from './personalColorAnalyzerNative';
import { requestFaceLandmarks } from '../../ar/services/unityMakeupBridge';
import { saveSourceImage, writeResultJson } from './personalColorArtifacts';
import { analyzePersonalColor } from './personalColorCore/engine';
import { deriveIlluminationCorrection } from './personalColorCore/illuminationCorrection';
import { evaluatePersonalColorQuality } from './personalColorQualityGate';
import { createPersonalColorLogger } from './personalColorLogger';
import type { AuraPersonalColorResult } from './personalColorCore/contracts';
import type { IlluminationCorrectionReport } from './personalColorCore/illuminationCorrection';
import type { PersonalColorCaptureInput } from '../types';

export type PersonalColorAnalysisOutcome = {
  // baseline: 조명 보정 없이 사진 그대로 분석한 결과 (원본 색).
  result: AuraPersonalColorResult;
  // 조명 보정(A/B): 흰자/WB 기반 캐스트 보정을 같은 캡처에 적용한 결과. 사용자
  // 정책(보정 우선 표시)상 보정 성공 시 화면·저장 모두 이 결과를 메인으로 쓴다.
  // baseline 은 비교·폴백용으로 보존한다.
  corrected: {
    result: AuraPersonalColorResult;
    report: IlluminationCorrectionReport;
  } | null;
  // 실제로 보고/저장되는 결과 = corrected 있으면 corrected, 없으면 baseline.
  // 화면(setSelectedPersonalColor)과 저장(writeResultJson)이 동일 값을 쓰도록
  // 여기서 확정한다 — "화면 corrected / 저장 baseline" 불일치(코덱스 F13) 방지.
  reported: AuraPersonalColorResult;
  // 미적용이어도 사유·실측 흰자 확인이 가능하도록 리포트는 항상 노출(현장 진단용)
  correctionReport: IlluminationCorrectionReport;
  artifacts: {
    sourceUri: string | null;
    resultJsonUri: string | null;
    logUri: string | null;
  };
};

// 엔진 산출물의 privacy 계약 확인. 위반 시 즉시 throw(개발 중 오배선 차단).
// 의미: 이 "결과 객체" 자체를 임의 경로로 통째 업로드하지 않는다는 기기 계약 —
// 보고서 생성 시 privacy 필드를 뗀 측정 사본이 서버에 저장되는 것(3-반영 규칙)은
// 이 계약의 예외가 아니라 별도의 명시적 wire 계약(faceAnalysisMeasurements)이다.
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

  // 소스 사진 복사는 결과 산출과 무관한 진단용 IO — 크리티컬 패스(보고서 POST 의
  // 8초 게이트가 이 outcome 을 기다림)에서 떼어 분석과 병렬로 돌리고, 결과 조립
  // 직전에만 합류한다(Codex D2 반영: 비필수 artifact 쓰기로 인한 지연 제거).
  const sourceUriPromise: Promise<string | null> = saveSourceImage(
    input.sessionId,
    input.imageUri,
  ).catch(error => {
    logger.log('artifact:source_failed', { message: String(error) });
    return null;
  });

  // homuler(Unity IMAGE 모드)에서 얼굴 랜드마크를 받아온다. 미탑재/타임아웃/에러는
  // undefined 로 격리 → 네이티브가 unsupported 로 처리(로컬 전용, 업로드 없음).
  // no_face 는 빈 points 로 그대로 전달한다 — 네이티브가 no_face 를 방출해야
  // quality gate 가 '재촬영' 신호(no_face)와 '기능 불가'(native_unsupported)를
  // 구분할 수 있다.
  let landmarks: PersonalColorLandmarkInput | undefined;
  try {
    const detected = await requestFaceLandmarks(input.imageUri);
    logger.log('landmarks:done', {
      source: 'unity-homuler',
      status: detected.status,
      count: detected.landmarks.length,
      error: detected.error ?? null,
    });
    if (detected.status === 'ok' || detected.status === 'no_face') {
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

  const engineOptions = {
    frameCount: input.frameCount,
    calibrationApplied: input.calibrationApplied,
    calibrationVersion: input.calibrationVersion,
  };
  const result = analyzePersonalColor(native, engineOptions);

  // 게이트 경고를 결과 경고에 병합(중복 제외)
  for (const w of gate.warnings) {
    if (!result.warnings.includes(w)) {
      result.warnings.push(w);
    }
  }

  assertLocalOnly(result);

  // ---- 조명 보정 실험 (A/B) — baseline은 위에서 확정, 여기서는 병기용 계산만 ----
  const { correctedNative, report: correctionReport } = deriveIlluminationCorrection(native, {
    whiteBalanceGains: input.cameraMetadata?.whiteBalanceGains ?? null,
  });
  let corrected: PersonalColorAnalysisOutcome['corrected'] = null;
  if (correctedNative && correctionReport.applied) {
    const correctedResult = analyzePersonalColor(correctedNative, engineOptions);
    assertLocalOnly(correctedResult);
    // 게이트 경고를 corrected 에도 병합 — 보정본이 보고/저장 메인이 되면
    // skin_matte_unavailable 등 경고가 사용자 표시에서 사라지지 않게(코덱스 minor).
    for (const w of gate.warnings) {
      if (!correctedResult.warnings.includes(w)) {
        correctedResult.warnings.push(w);
      }
    }
    corrected = { result: correctedResult, report: correctionReport };
  }
  // 보고/저장 메인 결과: 보정 성공 시 corrected, 아니면 baseline.
  const reported = corrected?.result ?? result;
  logger.log('illumination:correction', {
    applied: correctionReport.applied,
    source: correctionReport.source,
    gains: correctionReport.gains,
    strength: correctionReport.strength,
    capped: correctionReport.capped,
    confidence: correctionReport.confidence,
    scleraEyes: correctionReport.sclera.eyesUsed,
    scleraSamples: correctionReport.sclera.sampleCount,
    scleraAgreement: correctionReport.sclera.leftRightAgreement,
    // 편향 진단·scleraReferenceRgb 재보정용 실측 흰자 (기준 ≈ Lab a*+1.5 b*+6)
    scleraMeasuredRgb: correctionReport.sclera.measuredRgb,
    scleraMeasuredLab: correctionReport.sclera.measuredLab,
    wbRg: correctionReport.wb.rg,
    wbBg: correctionReport.wb.bg,
    reasons: [
      ...correctionReport.reasons,
      ...correctionReport.sclera.reasons,
      ...correctionReport.wb.reasons,
    ],
    // baseline vs corrected A/B 상세. analysis:done 가 reported(=보정 적용 시
    // corrected)만 기록하므로, baseline 재보정 데이터는 여기 남겨 보존한다.
    baselineTop: result.tone?.top ?? null,
    baselineAxes: {
      temperature: result.axes.temperature.value,
      value: result.axes.value.value,
      chroma: result.axes.chroma.value,
      clarity: result.axes.clarity.value,
      contrast: result.axes.contrast.value,
    },
    correctedTop: corrected?.result.tone?.top ?? null,
    correctedAxes: corrected
      ? {
          temperature: corrected.result.axes.temperature.value,
          value: corrected.result.axes.value.value,
          chroma: corrected.result.axes.chroma.value,
          clarity: corrected.result.axes.clarity.value,
          contrast: corrected.result.axes.contrast.value,
        }
      : null,
  });

  let resultJsonUri: string | null = null;
  try {
    // 화면과 동일한 reported(보정 우선) 결과를 저장. 보정 provenance 를 결과 JSON 에
    // 함께 남겨 프로덕션(로그 미기록)에서도 복원 후 보정본 여부를 판독 가능하게 한다.
    resultJsonUri = await writeResultJson(input.sessionId, reported, {
      illuminationCorrected: Boolean(corrected),
      illuminationSource: correctionReport.applied ? correctionReport.source : null,
      illuminationConfidence: correctionReport.confidence,
    });
  } catch (error) {
    logger.log('artifact:result_failed', { message: String(error) });
  }

  // analysis:done 은 '실제 보고/저장된' reported 를 일관되게 기록한다 — 종전엔
  // top 은 reported, axes/relations/regionLab 은 baseline 이 섞여 로그가 자기모순
  // 이었다(코덱스 #246-1). baseline 의 A/B 상세는 위 illumination:correction 로그의
  // baselineTop/baselineAxes 로 보존한다(보정 적용 시).
  logger.log('analysis:done', {
    reportedIsCorrected: Boolean(corrected),
    status: reported.status,
    measurementConfidence: reported.measurementConfidence,
    top: reported.tone?.top ?? null,
    secondary: reported.tone?.secondary ?? null,
    isMixed: reported.tone?.isMixed ?? false,
    // 오분류 진단용: 분류를 좌우하는 5축 실측값(reported)을 그대로 남긴다.
    axes: {
      temperature: reported.axes.temperature.value,
      value: reported.axes.value.value,
      chroma: reported.axes.chroma.value,
      clarity: reported.axes.clarity.value,
      contrast: reported.axes.contrast.value,
    },
    // 축 기준(ref/scale) 재보정용 raw: 부위 간 명도차·색차, 부위 Lab.
    relations: reported.relations,
    regionLab: Object.fromEntries(
      reported.regions.map(r => [
        r.region,
        { L: r.lab.L, a: r.lab.a, b: r.lab.b, C: r.lch.C },
      ]),
    ),
  });

  const sourceUri = await sourceUriPromise;

  return {
    result,
    corrected,
    reported,
    correctionReport,
    artifacts: { sourceUri, resultJsonUri, logUri: logger.logFileUri },
  };
}
