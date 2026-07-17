# 통합 촬영 화면 greenlight 레거시 완전 동일 — 설계·계획

> 2026-07-18 착수. "완전한 레거시" 확정(사용자). 목적: 통합 촬영 화면
> (`UnifiedFaceCaptureScreen`)에 레거시 촬영 화면(`CameraFaceCaptureScreen`)의
> greenlight 게이트·오버레이(타원·중앙선·턱/이마 점·사유 메시지·빨강↔초록)를
> 픽셀 단위로 재현. 카메라만 AVCapture(Vision)→Unity ARKit로 바뀜.

## 확정 아키텍처: Unity=원시 신호, RN=단일 판정처

레거시 판정 로직·임계값·메시지·오버레이는 전부 RN에 있다. 바뀌는 건 **데이터
공급원**뿐 — Vision 네이티브 뷰 대신 Unity gate가 같은 원시 신호를 채워 보낸다.
RN이 greenlight를 계산해 **오버레이 색과 셔터 활성화를 둘 다** 구동한다.
(지금처럼 Unity `IsPoseReady`로 셔터를 잠그지 않는다.)

```
[Unity SendGate] 원시 신호(정규화 랜드마크·pose 각도·faceWidthRatio·안정성)
  → [RN] evaluateFaceCaptureGreenlight(yaw·roll·중앙·거리) + evaluateFacePitchGate(pitch)
  → 오버레이(타원·중앙선·점·메시지, danger↔guideReady) + 셔터 enable
```

## 게이트는 2종 (레거시와 동일)

1. **기본 greenlight** (`evaluateFaceCaptureGreenlight`): yaw·roll·중앙정렬·거리(가까움/멂)
   ·카메라 안정성. 6사유 + 한국어 메시지.
2. **pitch 게이트** (`evaluateFacePitchGate`, 별도): 고개 들기/숙이기.
   메시지 `'고개를 들거나 숙이지 말고 정면을 봐주세요'`(방향 구분 안 함).

## 소스별 처리 (재보정 최소화 원칙)

| 게이트 | 소스 | 재보정 |
|---|---|---|
| yaw·roll·pitch(각도) | **ARKit 6DOF pose** (pose.y/x/z). 임계값이 물리 단위(도)라 소스 무관 | 없음. 레거시 8/12/5 그대로 |
| 중앙 정렬 | MediaPipe 468 메시 정규화 좌표 → RN이 화면 매핑 | 소폭(리로드 튜닝) |
| 거리(faceWidthRatio) | 실제 MediaPipe 메시로 계산 | **2~3개 임계값 폰 튜닝** |
| 카메라 안정성 | ARKit 프레임 tracking/노출 | 폰 튜닝 |
| 색·메시지·오버레이 형태 | RN 기존 자산 그대로 | 없음 |

- **왜 Vision 휴리스틱을 포팅하지 않나**: 레거시 faceWidthRatio(`max(눈×2.35, 입×2.15)`)
  ·중앙선(이마↔턱 보간)·이마점(눈썹 휴리스틱)은 **Vision이 코·이마 랜드마크를 못 줘서**
  만든 우회책(`AURARealtimeFaceCaptureView.m`). Unity 실제 468 메시는 그 정점을 직접
  가지므로 우회책 불필요. 대신 거리·중앙 임계값 몇 개만 폰에서 리로드 튜닝.
- **pose 임계값 주의**: 현재 Unity `IsPoseReady`=yaw5/pitch7/roll5 로 레거시(8/12/5)보다
  엄격. RN이 판정처가 되며 `REALTIME_FACE_ANALYSIS_POSE_GATE`(facePoseGates.ts, 8/12/5)를
  단일 소스로 쓴다.

## 작업 (리빌드 비용 기준 순서)

### A. Unity SendGate 확장 (리빌드 1회 — 사용자 빌드)
`UnifiedFaceCaptureController.SendGate`에 원시 신호 추가:
- 정규화 랜드마크: 중앙선(forehead/noseTip/chin) + 거리·중앙 계산용(눈꼬리·입꼬리).
  접근 패턴은 `TryEvaluateLiveHairlineAdvisory`와 동일(`landmarkSource.Landmarks`, MediaPipe 인덱스).
- pose 각도 3축: `pose.y`(yaw)/`pose.x`(pitch)/`pose.z`(roll) — 이미 계산됨, 값만 실어보냄.
- faceWidthRatio: 실제 메시 눈/입 폭 기반(정규화 x).
- cameraStability: ARKit 프레임 안정성/노출.
- 계약: RN `parseGateEvent`(unifiedFaceCaptureContract.ts) 확장과 짝.

### B. RN 판정 연결 (리로드)
- gate 파서에 새 필드 파싱 추가.
- 정규화→화면 좌표 매핑(전면 카메라 미러/회전 정합 — **유일한 실질 위험**).
- `evaluateFaceCaptureGreenlight` + `evaluateFacePitchGate` 재사용.
- 셔터 enable을 Unity poseReady → RN greenlight로 전환.

### C. RN 오버레이 포팅 (리로드)
- 레거시 `CameraFaceCaptureScreen`의 타원·빨강/초록 중앙선·턱/이마 점·사유 메시지
  컴포넌트를 `UnifiedFaceCaptureScreen`으로 이식. 색: danger `#FF5A4D` ↔ guideReady `#31D06F`.

### D. 좌표계 정합 검증 (리로드 반복)
- 실기기에서 중앙선·점이 얼굴에 정확히 붙는지, 미러/회전 방향 확인.

### E. 레거시 폴백 경로 삭제
- 통합 성공이 확인되면 폴백 제거 → 촬영 1회 경로만 남김(사용자 지시).

## 핵심 파일

- Unity: `apps/unity/MakeupAR/Assets/Scripts/UnifiedFaceCaptureController.cs`
  (`SendGate`, `TryEvaluateLiveHairlineAdvisory` 참조), pose 규약 `Face3DHeadPose.cs`
- RN 계약: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureContract.ts`
  (`parseGateEvent`, `UnifiedFaceCaptureGateEvent`)
- RN 판정: `.../services/faceCaptureGreenlight.ts`, `.../services/faceCapturePitchGate.ts`,
  `.../constants/facePoseGates.ts`(임계값 단일 소스)
- RN 화면/오버레이: `.../screens/UnifiedFaceCaptureScreen.tsx`(대상),
  `.../screens/CameraFaceCaptureScreen.tsx`(오버레이 원본)
- 레거시 좌표 규약(참고): `apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m`
