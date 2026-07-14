# 메이크업 피드백 사진 분석 파이프라인

카메라와 앨범 사진은 같은 서버 분석 경로를 사용합니다. Android Expo Go에는 iOS 전용
랜드마크 모듈이 없으므로, 모바일의 촬영 가이드는 보조 기능이고 서버 판정이 최종 기준입니다.

## 실행 순서

1. 모바일이 사용자가 고른 원본 사진과 source, 크기, MIME type, 파일명을 한 번 업로드합니다.
2. 서버가 EXIF 방향을 반영하고 EXIF 등 메타데이터를 제거합니다. 색상, 화이트밸런스,
   대비, 피부 표현은 보정하지 않습니다.
3. 서버 MediaPipe가 얼굴 수, 얼굴 영역, 주요 랜드마크와 yaw/pitch/roll을 구합니다.
4. 해상도, 얼굴 크기, 노출, 심한 흔들림, 얼굴 수와 각도를 검사합니다.
5. hard issue가 있으면 Bedrock을 호출하지 않고 score=null인 retake_required를 반환합니다.
6. 분석 가능하면 원본 전체와 left/right eye, left/right cheek, lips crop을 만듭니다.
7. 프롬프트와 사용 가능한 crop을 한 번의 Bedrock 호출에 함께 전달합니다.
8. AI는 관찰 → 사용자 목적의 동적 기준 → 11개 부위 평가 → 종합 점수 순서로 JSON을 반환합니다.
9. 서버가 상태, 가시성, 관찰/목적 ID 참조와 점수 범위를 검증합니다. 잘못된 응답을
   고정 점수나 기본 문구로 대체하지 않습니다.

점수와 피드백을 만드는 core analysis는 Bedrock 한 번입니다. 로딩 화면의 에이전트 대화는
완료 결과를 짧게 재서술하는 별도 presentation 호출이며 점수나 부위 평가를 바꾸지 않습니다.

## 수정 위치

- 사진 품질·랜드마크·crop: services/backend/app/services/makeup_feedback_vision.py
- Bedrock 이미지 묶음·응답 검증: services/backend/app/services/makeup_feedback_analysis.py
- 모델 역할: services/backend/app/services/prompts/makeup_feedback_system.md
- 목적 해석·평가·점수·출력 계약: services/backend/app/services/prompts/makeup_feedback_user.md
- 모바일 live 응답 검증: apps/mobile/src/features/makeup-feedback/services/makeupFeedbackService.ts

프롬프트 문장만 바꾸려면 두 Markdown 파일을 편집합니다. topic/status/JSON 필드 자체를
바꾸려면 Python과 TypeScript 검증기 및 테스트도 함께 수정해야 합니다.

## 현재 품질 gate

아래 값은 임상 기준이 아니라 첫 운영을 위한 보수적인 engineering baseline입니다. 실제
사용자 사진을 카메라/기종/조명별로 표본화한 뒤 false reject와 false accept를 측정해 조정합니다.

- 최소 이미지: short edge 480px, long edge 640px
- 최소 얼굴 폭 비율 0.24, 얼굴 면적 비율 0.09
- 최대 얼굴 폭 비율 0.96, 얼굴 면적 비율 0.86
- 노출 평균: 48 미만 또는 212 초과
- 그림자/하이라이트 극단 픽셀 비율: 0.62 초과
- Laplacian variance blur score: 18 미만
- yaw 28도, pitch 24도, roll 20도 초과

MediaPipe 자체를 사용할 수 없는 런타임 오류는 soft issue입니다. 이 이유만으로 재촬영을
강제하지 않고 full image를 Bedrock이 계속 판단합니다.

## Bedrock 이미지 제한

- 각 crop은 JPEG, 최대 edge 1568px, 최대 3.5MB입니다.
- 전체 raw image 합은 14MiB 이하로 제한합니다.
- 우선순위는 full → 양쪽 눈 → lips → 양쪽 볼입니다.
- 요청 JSON body는 24,000,000 bytes 미만인지 호출 전에 검사합니다.
- 예산을 넘으면 낮은 우선순위 crop 묶음을 제외하되 full image는 유지합니다.

이 제한은 base64 증가분을 포함해 Amazon Bedrock InvokeModel의 요청 한도 안에 머물기
위한 것입니다.

## 응답 해석

- completed: captureQuality.usable=true, 숫자 score와 scoreRange가 있습니다.
- retake_required: usable=false, score/scoreRange는 null이고 Bedrock 점수를 만들지 않습니다.
- not_assessable: 사진 조건 때문에 해당 부위를 판단할 수 없습니다. 감점하지 않습니다.
- not_applicable: 사용자의 명시 목적과 관련 없는 부위입니다. 감점하지 않습니다.
- strength/improvement/optional만 observations와 dynamicCriteria ID를 연결해 점수 근거가 됩니다.

## 검증

    cd services/backend
    python -m pytest -q tests/test_makeup_feedback_vision.py tests/test_makeup_feedback_analysis.py

    cd ../../apps/mobile
    npm run typecheck

실제 품질 임계값을 바꿀 때는 최소한 다음 사진군을 별도로 확인합니다.

- 전면/후면 카메라, Android/iPhone
- 카메라 촬영/앨범 선택
- 밝은 실내/어두운 실내/창가 역광
- 안경 반사, 앞머리 가림, 한쪽 얼굴 회전
- 무메이크업/연한 메이크업/강한 메이크업
