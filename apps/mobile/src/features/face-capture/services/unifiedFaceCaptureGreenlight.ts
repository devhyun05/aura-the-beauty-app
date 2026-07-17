// 통합 촬영(ARKit) gate 의 원시 신호를 레거시 greenlight 판정으로 변환한다.
//
// Unity SendGate 가 pose 각도·ARKit 얼굴 박스(faceBox)·cameraStability 를 실어보내면,
// 여기서 화면 좌표로 매핑해 레거시 evaluateFaceCaptureGreenlight + evaluateFacePitchGate 를
// 그대로 재사용한다. 임계값·메시지·오버레이는 레거시 단일 소스를 쓴다.
//
// faceBox 는 preview 카메라 투영 결과라 미러/회전이 이미 반영돼 있다(정규화[0,1],
// top-left 원점). 따라서 previewSize 만 곱하면 화면 좌표가 되고, 수동 미러가 없다.

import type {
  RealtimeCameraStabilityPayload,
  RealtimeFaceCaptureScreenPoint,
  RealtimeMediaPipeLandmarkKey,
  RealtimeMediaPipePayload,
} from '../components/RealtimeFaceCaptureNativeView';
import {UNIFIED_FACE_ANALYSIS_POSE_GATE} from '../constants/facePoseGates';
import {
  evaluateFaceCaptureGreenlight,
  type FaceCaptureGreenlightGuide,
  type FaceCaptureGreenlightReport,
} from './faceCaptureGreenlight';
import {
  evaluateFacePitchGate,
  FACE_PITCH_GATE_MAX_ABS_DEG,
  type FacePitchGateResult,
} from './faceCapturePitchGate';
import type {UnifiedFaceCaptureGateGreenlight} from './unifiedFaceCaptureContract';

type CenterlineKey = 'forehead' | 'noseBridge' | 'noseTip' | 'chin';

export type UnifiedGreenlightEvaluation = {
  // 오버레이가 그릴 화면 좌표(중앙선·턱/이마 점). 얼굴이 없으면 비어 있다.
  screenLandmarks: Partial<
    Record<RealtimeMediaPipeLandmarkKey, RealtimeFaceCaptureScreenPoint>
  >;
  report: FaceCaptureGreenlightReport;
  pitch: FacePitchGateResult;
  // 셔터를 열 최종 조건: 기본 greenlight + pitch 게이트 둘 다 통과.
  greenlit: boolean;
};

export function evaluateUnifiedFaceCaptureGreenlight({
  greenlight,
  guide,
  previewWidth,
  previewHeight,
}: {
  greenlight: UnifiedFaceCaptureGateGreenlight;
  guide: FaceCaptureGreenlightGuide;
  previewWidth: number;
  previewHeight: number;
}): UnifiedGreenlightEvaluation {
  const box = greenlight.faceBox;

  // 중앙선용 화면 좌표: faceBox 중심 x 에 세로로 4점을 배치한다(얼굴 세로 범위
  // 상·1/3·2/3·하). 4점의 x 가 같아 centerLineSpread=0 이고, centerOffset 은
  // 얼굴 중심과 가이드 중심의 수평 차로 계산된다(레거시 not_centered 과 동일).
  const screenLandmarks: Partial<
    Record<RealtimeMediaPipeLandmarkKey, RealtimeFaceCaptureScreenPoint>
  > = {};
  if (box) {
    const centerXpx = box.centerX * previewWidth;
    const topPx = (box.centerY - box.height / 2) * previewHeight;
    const heightPx = box.height * previewHeight;
    const atFractions: Record<CenterlineKey, number> = {
      forehead: 0,
      noseBridge: 1 / 3,
      noseTip: 2 / 3,
      chin: 1,
    };
    (Object.keys(atFractions) as CenterlineKey[]).forEach(key => {
      screenLandmarks[key] = {
        left: centerXpx,
        top: topPx + heightPx * atFractions[key],
      };
    });
  }

  // 레거시 평가기가 먹는 MediaPipe 페이로드 형태로 재구성. pose 는 ARKit 실측이라
  // poseSource 를 'vision'(측정됨)으로 둬 fail-closed 로직에서 유효로 인정받는다.
  // faceWidthRatio = faceBox.width(정규화 얼굴 폭). 거리 임계값(0.30..0.62)과
  // 같은 "얼굴 폭 / 화면 폭" 스케일이라 그대로 비교한다.
  const mediaPipe: RealtimeMediaPipePayload = {
    ...(box ? {faceWidthRatio: box.width} : {}),
    pitchDeg: greenlight.pose.pitchDeg,
    pitchMeasured: greenlight.pose.valid,
    poseSource: 'vision',
    rollDeg: greenlight.pose.rollDeg,
    screenLandmarks,
    status: box ? 'ok' : 'landmark_missing',
    yawDeg: greenlight.pose.yawDeg,
  };

  const cameraStability: RealtimeCameraStabilityPayload = {
    isStable: greenlight.cameraStability.isStable,
    stableDurationMs: greenlight.cameraStability.stableDurationMs,
    status: 'ok',
  };

  const report = evaluateFaceCaptureGreenlight({
    cameraStability,
    guide,
    mediaPipe,
    poseGate: UNIFIED_FACE_ANALYSIS_POSE_GATE,
  });

  // pitch 게이트: 통합 임계값 7°, face_analysis 는 결측 pitch 를 차단(requireValid).
  const pitch = evaluateFacePitchGate(
    greenlight.pose.valid ? greenlight.pose.pitchDeg : undefined,
    UNIFIED_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg ?? FACE_PITCH_GATE_MAX_ABS_DEG,
    true,
    greenlight.pose.valid,
  );

  return {
    greenlit: report.finalCaptureGreenlight && pitch.pitchOk,
    pitch,
    report,
    screenLandmarks,
  };
}
