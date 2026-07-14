# 메이크업 피드백 카메라 구현 핸드오프

작성 기준: feature/jun-makeupfeedback, 2026-07-14

## 1. 목표

메이크업 피드백 카메라는 사용자가 촬영한 뒤 서버 분석 단계에서 다시 촬영하라는
안내를 받는 경우를 최대한 줄여야 한다.

이를 위해 다음 두 단계를 사용한다.

1. 촬영 전 실시간 랜드마크·자세·거리·조명·흔들림 검사를 모두 통과해야 셔터를 활성화한다.
2. 셔터 요청 시점에 고정한 마지막 분석 비디오 프레임을 로컬에서 한 번 더 검사한다.
   JPEG/HEIC 실제 픽셀은 서버가 최종 판정하며, 로컬 실패 시 다음 화면으로 이동하거나
   업로드하지 않고 카메라 화면에서 즉시 수정 안내를 보여준다.

서버 검증은 제거하지 않는다. 기기별 분석기 오차, 앨범 사진, 셔터 순간의 변화에 대비하는
최종 안전망으로 유지한다.

## 2. 다른 기능과 분리하는 원칙

공용 카메라의 기본 정책을 강화하면 얼굴 분석, 헤어 분석, 퍼스널 컬러, 레퍼런스 촬영까지
같이 막힐 수 있다. 반드시 captureType이 makeup_feedback인 경우에만 선택되는 전용 정책을
추가한다.

- 기존 captureType의 임계값과 fail-open/fail-closed 정책은 변경하지 않는다.
- CameraFaceCaptureScreen의 공용 기본값을 변경하지 않는다.
- REALTIME_MAKEUP_FEEDBACK_POSE_GATE 같은 별도 상수를 만든다.
- makeup_feedback 전용 품질 판정기와 안내 문구를 분리한다.
- 클라이언트 측 측정값은 현재 서버 요청에 보내지 않는다. 향후 보내더라도 관찰·튜닝용
  telemetry로만 사용한다.
- 서버는 클라이언트 값을 신뢰해 검사를 생략하지 않고 사진을 다시 판정한다.

현재 메이크업 피드백 라우트는 이미 다음 값으로 카메라를 연다.

- captureMode: face
- captureType: makeup_feedback
- imageQuality: 1
- deferUpload: true

따라서 captureType 분기만 추가하면 다른 촬영 기능과 분리할 수 있다.

## 3. 현재 플랫폼별 동작

| 환경 | 현재 상태 |
| --- | --- |
| iOS 커스텀 빌드 | AURARealtimeFaceCaptureView에서 랜드마크·자세·거리·밝기·blur·해상도를 검사하며 makeup_feedback 셔터를 제어 |
| iOS Expo Go | 커스텀 네이티브 분석기가 없어 makeup_feedback 카메라는 fail-closed, 앨범 선택은 가능 |
| Android Expo Go | Android 분석기가 없어 makeup_feedback 카메라는 fail-closed, 앨범 선택은 가능 |
| Android 개발 빌드 | Kotlin/MediaPipe 또는 ML Kit 분석기를 추가하기 전까지 makeup_feedback 카메라는 fail-closed |

Expo Go는 앱에 포함되지 않은 커스텀 네이티브 코드를 로드할 수 없다. Android에서도
동일한 실시간 차단을 검증하려면 Expo Go가 아니라 Android 개발 빌드가 필요하다.

- Expo 개발 빌드 안내:
  https://docs.expo.dev/develop/development-builds/introduction/
- Expo Go에서 커스텀 네이티브 코드 사용 제한:
  https://docs.expo.dev/faq/

## 4. 현재 구현 상태

makeup_feedback에만 별도 fail-closed 정책이 연결되어 있다. face_analysis,
hair_analysis, personal_color 등 다른 captureType의 기존 정책은 변경하지 않는다.

- 얼굴 수는 정확히 1명이어야 한다.
- imageWidth·imageHeight가 있어야 하고 짧은 변 480px, 긴 변 640px 이상이어야 한다.
- 얼굴 bbox 폭·면적, 화면 가이드 거리, 중앙 정렬을 모두 확인한다.
- yaw·pitch·roll이 실제로 측정되어야 하며 각각 15도·12도·10도 이내여야 한다.
- 평균 밝기, 암부·하이라이트 비율, blur score가 모두 있어야 하고 안전 구간을 통과해야 한다.
- 카메라가 즉시 안정 상태이고 AE·AF·AWB 조정 중이 아니어야 한다.
- 위 조건 전체가 이벤트 수신 시각 기준 400ms 연속 통과해야 한다.
- 연속 프레임 간격이 250ms를 넘거나 한 프레임이라도 실패하면 400ms 누적을 초기화한다.
- 마지막 이벤트가 1000ms를 넘으면 UI가 자동으로 빨강·셔터 비활성 상태로 돌아간다.
- 분석기가 없는 Expo Go에서는 makeup_feedback 카메라만 막고 앨범 경로는 유지한다.

이 정책은 카메라 촬영의 서버 재촬영 가능성을 크게 줄이지만 저장 사진 픽셀과 실시간
비디오 프레임의 차이까지 없애지는 못하므로 서버 hard gate는 최종 안전망으로 유지한다.

## 5. 실시간 분석기가 매 프레임 제공할 값

### 검출 상태

- detectorAvailable
- detectorVersion
- status: ok, no_face, multiple_faces, landmark_missing, unavailable
- sequence
- capturedAtMs
- faceCount

### 프레임 좌표 정보

- frameWidth, frameHeight
- orientation
- mirrored
- 얼굴 bbox: x, y, width, height
- 모든 좌표의 기준이 원본 이미지인지 화면 미리보기인지 명시

### 필수 랜드마크

- forehead
- chin
- noseBridge
- noseTip
- leftEye, rightEye 또는 양쪽 눈 안쪽·바깥쪽 점
- mouthLeft, mouthRight
- upperLip, lowerLip
- leftCheek, rightCheek
- leftJaw, rightJaw

서버와 UI 모두에서 left/right는 화면 기준이 아니라 피사체 기준으로 통일한다.
전면 카메라 미러링은 화면 투영 단계에서만 적용하고 원본 정규화 좌표의 의미는 바꾸지 않는다.

### 자세

- yawDeg
- pitchDeg
- rollDeg
- poseMeasured
- poseSource

측정할 수 없는 자세를 0도로 채우면 안 된다. poseMeasured=false 또는 명확한 unavailable
상태를 보내고 makeup_feedback에서는 fail-closed 처리한다.

### 얼굴 크기와 정렬

- faceWidthRatio
- faceAreaRatio
- centerOffsetPx
- centerLineSpreadPx
- screenLandmarks

### 사진 품질

- exposureMean
- shadowRatio
- highlightRatio
- blurScore 또는 sharpnessScore
- adjustingExposure
- adjustingFocus
- adjustingWhiteBalance
- stableDurationMs
- stableThresholdMs

iOS는 얼굴 ROI를 stride로 샘플링한 뒤 Laplacian variance를 계산하고, 서버는 ROI를
LANCZOS로 리사이즈한 뒤 계산한다. 둘 다 값이 클수록 선명하다는 방향과 단위 개념은 같지만
숫자 척도는 동일하지 않다. 같은 사진의 모바일·서버 측정값 쌍을 기기별로 수집해 보정하기
전에는 두 임계값이나 측정값을 직접 비교하면 안 된다.

## 6. 촬영 전 makeup_feedback 전용 차단 조건

### 필수 조건

- 분석기 사용 가능
- 얼굴이 정확히 1명
- 필수 랜드마크가 모두 존재
- pose가 실제로 측정됨
- 얼굴이 타원과 화면 중앙에 정렬됨
- 얼굴 크기가 허용 범위 안
- 너무 어둡거나 과다 노출되지 않음
- 심하게 흐리지 않음
- 카메라가 안정된 상태를 일정 시간 유지

### 현재 실시간 기준 중 재사용할 값

- 얼굴 중심 오차: 가이드 폭의 6% 이하
- 얼굴 중앙선 퍼짐: 가이드 폭의 10% 이하
- faceWidthRatio: 0.30 이상 0.62 이하
- 전체 조건 연속 통과: 최소 400ms
- 연속 이벤트 최대 간격: 250ms
- 실시간 이벤트 stale 차단: 1000ms 초과
- 셔터 요청 시 고정 프레임 stale 차단: 500ms 초과
- 최소 프레임 해상도: 짧은 변 480px, 긴 변 640px

### makeup_feedback 자세 기준 제안

초기 운영값은 서버보다 좁게 시작하고 실기기 데이터로 조정한다.

- yaw: 절댓값 15도 이하
- pitch: 절댓값 12도 이하
- roll: 절댓값 10도 이하
- pose 결측: 촬영 불가

이 값은 UX와 검출기 편차를 고려한 카메라 초기값 제안이다. 서버 hard gate인
yaw 28도, pitch 24도, roll 20도를 그대로 카메라에 사용하면 셔터 순간의 지터와
검출기 차이 때문에 실시간 통과 후 서버 실패 구간이 남는다.

### 서버와 맞춰야 하는 hard 기준

- 최종 사진 해상도: 짧은 변 480px 이상, 긴 변 640px 이상
- 얼굴 수: 정확히 1명
- 얼굴 bbox width ratio: 0.24 이상 0.96 이하
- 얼굴 bbox area ratio: 0.09 이상 0.86 이하
- 평균 밝기: 48 이상 212 이하
- 암부 픽셀 비율: 0.62 이하
- 하이라이트 픽셀 비율: 0.62 이하
- 서버 LANCZOS ROI 기준 blur score: 18 이상(모바일 stride 값과 직접 비교 금지)
- yaw: 절댓값 28도 이하
- pitch: 절댓값 24도 이하
- roll: 절댓값 20도 이하

현재 iOS faceWidthRatio와 서버 bbox width ratio는 계산 방식이 완전히 같지 않다.
숫자만 복사하지 말고 같은 측정식으로 통일하거나 동일 사진의 모바일·서버 측정값 쌍으로
보정해야 한다.

## 7. 카메라 UI 동작

### 상태 표시

- 빨강: 현재 조건으로 촬영 불가 또는 400ms 연속 통과 시간을 채우는 중
- 초록: 모든 조건을 400ms 연속으로 통과해 촬영 가능

셔터는 빨강 상태에서 disabled다. 눌렀을 때만 거부하는 방식이 아니며, 새 이벤트가
1000ms 동안 오지 않아도 만료 타이머가 자동으로 초록 상태를 해제한다. 프레임 사이가
250ms를 넘거나 조건 하나가 깨지면 연속 통과 시간은 즉시 처음부터 다시 센다.

### 화면에 표시할 랜드마크

478개 전체 mesh를 표시할 필요는 없다. 사용자에게 도움이 되는 다음 요소만 표시한다.

- 얼굴 타원
- forehead와 chin 위치
- noseBridge부터 noseTip까지의 얼굴 중앙선
- 양쪽 눈 기준선

검출용 전체 랜드마크는 내부적으로 유지한다.

### 안내 문구 우선순위

한 번에 하나의 행동만 안내한다.

1. 얼굴 없음: 얼굴이 인식되지 않았어요. 밝은 곳에서 가이드 안에 맞춰주세요
2. 다중 얼굴: 한 명의 얼굴만 가이드 안에 맞춰주세요
3. 너무 가까움: 조금 멀리서 촬영해주세요
4. 너무 멂: 조금 가까이서 촬영해주세요
5. yaw/roll: 정면을 응시한 상태에서 촬영해주세요
6. pitch: 고개를 들거나 숙이지 말고 정면을 봐주세요
7. 중앙 불일치: 얼굴을 화면 중앙에 맞춰주세요
8. 어두움: 얼굴이 너무 어두워요. 더 밝은 곳으로 이동해주세요
9. 과다 노출: 빛이 너무 강해요. 강한 조명을 피해주세요
10. 블러·흔들림: 휴대폰을 고정하고 잠시 멈춰주세요
11. 안정화 중: 잠시 움직이지 말아주세요
12. 통과: 좋아요. 촬영할 수 있어요

안내 문구는 약 500~700ms 단위로 안정화해 빠르게 깜빡이지 않게 한다.

## 8. 셔터 경계 재검사와 한계

실시간 프레임이 통과했더라도 셔터 요청 순간에 얼굴이나 조명이 바뀔 수 있으므로 두 경계를
검사한다.

1. 셔터를 누르기 직전 JS가 최신 이벤트의 수신 시각·sequence와 400ms 전체 조건 연속
   통과 기록을 다시 확인한다. 1000ms 초과 stale, sequence 결측, 조건 실패는 즉시 막는다.
2. iOS 네이티브는 AVCapturePhotoSettings.uniqueID별로 사진 요청 순간의 마지막 분석
   비디오 프레임을 고정하고 captureFrameMetadata로 반환한다.
3. 앱은 metadata 존재, source, photoPixelsAnalyzed=false, isStale=false, 0~500ms frame age,
   pre-shutter sequence 이상인지와 고정 프레임의 얼굴 수·자세·거리·조명·blur·해상도를
   다시 확인한다.
4. 실패하면 원본 URI를 다음 화면이나 업로드로 전달하지 않고 카메라를 유지해 현재 수정할
   원인 하나만 안내한다.
5. 통과했을 때만 촬영 결과를 다음 단계로 전달한다.

captureFrameMetadata의 frame은 저장 JPEG/HEIC가 아니라 셔터 요청 직전 비디오 프레임이다.
photoPixelsAnalyzed=false가 이 사실을 명시한다. 따라서 저장 사진과 분석 프레임의 픽셀
일치까지 보장하지 않으며, 서버 hard gate는 최종 안전망으로 남는다. 정확한 셔터 사진
동등성이 필요하면 향후 네이티브가 저장 사진 픽셀에 같은 품질 계산을 수행해야 한다.

앨범 사진은 실시간 카메라 정책을 적용할 수 없으므로 기존 서버 검증과 재선택 UX를 계속
사용한다.

## 9. 현재 서버 전송과 향후 telemetry

현재 흐름은 촬영 시 즉시 업로드하지 않고 사용자 목적 입력 뒤 분석 시작 시 한 번만 업로드한다.
업로드 요청에는 원본 이미지와 contentType·fileName·width·height·source 같은 파일 정보만
사용한다.

captureFrameMetadata와 실시간 faceCount·bbox·pose·exposureMean·shadowRatio·highlightRatio·
blurScore·연속 통과 시간은 로컬 셔터 게이트에만 사용하며 현재 backend 요청으로 보내지 않는다.
cameraMetadata에도 이 품질 값들이 보존된다고 가정하면 안 된다.

기기별 임계값 튜닝을 위해 향후 telemetry가 필요하면 별도 스키마·사용자 고지·보존 기간을
정한 뒤 전송한다. 이 경우에도 서버가 클라이언트 값을 신뢰해 사진 hard gate를 생략해서는
안 된다.

## 10. 필수 테스트와 완료 조건

- makeup_feedback만 전용 정책을 선택한다.
- face_analysis, hair_analysis, personal_color, reference의 기존 판정은 바뀌지 않는다.
- 얼굴 0명, 1명, 2명 이상을 구분한다.
- bbox width·area 경계값을 검사한다.
- yaw·pitch·roll 경계와 pose 결측을 검사한다.
- 어두움·과다 노출·암부·하이라이트·blur 경계를 검사한다.
- 전체 조건 연속 통과 399ms에는 셔터가 비활성이고 400ms부터 활성화된다.
- 이벤트 간격 251ms, 마지막 이벤트 age 1001ms, 셔터 고정 프레임 age 501ms를 차단한다.
- 전면 카메라 미러링에서도 피사체 기준 left/right가 유지된다.
- 셔터 순간 조건이 깨지면 다음 화면으로 이동하지 않는다.
- 실시간 통과 fixture가 서버 deterministic hard-retake를 만들지 않는 공통 계약 테스트를 둔다.
- iOS 실기기에서 밝은 실내, 어두운 실내, 역광, 안경 반사, 앞머리 가림,
  측면 회전, 고개 숙임, 다중 얼굴, 손떨림을 확인한다.
- Android 구현 시 Expo Go가 아닌 개발 빌드 실기기에서 같은 시나리오를 확인한다.

## 11. 관련 코드

- 메이크업 카메라 라우트:
  apps/mobile/src/app/navigation/routes/makeupFeedbackRoutes.tsx
- 공용 카메라 화면:
  apps/mobile/src/features/face-capture/screens/CameraFaceCaptureScreen.tsx
- 실시간 greenlight:
  apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.ts
- 자세 정책:
  apps/mobile/src/features/face-capture/constants/facePoseGates.ts
- 타원 가이드:
  apps/mobile/src/features/face-capture/constants/faceEllipseGuide.ts
- iOS 네이티브 뷰 연결:
  apps/mobile/src/features/face-capture/components/RealtimeFaceCaptureNativeView.tsx
- iOS 네이티브 구현:
  apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m
- 서버 최종 사진 판정:
  services/backend/app/services/makeup_feedback_vision.py

## 12. 이번 메이크업 피드백 변경 요약

- 카메라와 앨범의 원본 품질, MIME type, 파일명, 크기, source를 보존한다.
- 카메라 사진은 촬영 시 업로드하지 않고 분석 시작 시 한 번만 업로드한다.
- 서버가 EXIF 방향을 반영하고 색상·피부·화이트밸런스는 보정하지 않는다.
- 서버 MediaPipe가 얼굴 수, bbox, 랜드마크, pose와 품질을 검사한다.
- hard issue면 Bedrock을 호출하지 않고 score=null인 retake_required를 반환한다.
- 통과하면 전체 얼굴, 양쪽 눈, 양쪽 볼, 입술 crop을 한 번의 Bedrock 요청에 전달한다.
- AI가 사진 관찰, 사용자 원문의 동적 목적 기준, 11개 부위 평가, 종합 점수 순서로 응답한다.
- 고정 데일리·내추럴 기준과 기본 점수를 제거했다.
- 보이지 않는 부위는 not_assessable, 목적과 무관한 부위는 not_applicable로 처리하고 감점하지 않는다.
- 모바일은 시스템 오류와 사진 재촬영을 분리해 표시하며 재촬영 결과는 저장하지 않는다.
