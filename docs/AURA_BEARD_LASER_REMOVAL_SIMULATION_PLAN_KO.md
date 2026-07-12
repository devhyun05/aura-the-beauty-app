# AURA 남성 수염 레이저 제모 시뮬레이션 기획서 v0.1

작성일: 2026-07-08 KST  
상태: 에이전트 검토용 기획 초안  
대상 검토자: 기술/제품/UX/현재 디렉토리 적합성 검토 에이전트  
목표: 기존 AURA 얼굴 분석·마스크 생성·렌더링 사고방식을 활용해, 남성 사용자가 “레이저 제모를 하면 내 얼굴이 어떻게 달라질지”를 안전하고 자연스럽게 확인할 수 있는 MVP를 설계한다.

---

## 0. 한 줄 결론

이 기능은 “AI가 얼굴을 새로 그리는 서비스”가 아니라, **원본 하관 구조를 보존하면서 수염·수염 자국·푸른기만 단계적으로 줄여 보여주는 시각 시뮬레이션 서비스**다.

```text
입력 사진 + 사전 설문
→ 얼굴/하관 ROI 추출
→ 수염/수염 자국/보호 영역 마스크 생성
→ Mild / Medium / Strong 감소 단계 생성
→ 하관 형태 보존 검증
→ Before/After 슬라이더 + 상담 질문 생성
```

가장 중요한 제품 약속은 다음이다.

```text
정확한 회차 예측 X
시각적 참고 이미지 O

얼굴형/입술/턱선을 바꾸는 미용 보정 X
수염과 수염 자국만 줄이는 보수적 시뮬레이션 O
```

---

## 1. 제품 아이디어

### 1.1 서비스 개념

사용자가 수염이 있는 현재 사진을 업로드하거나 촬영하면, 서비스가 다음을 생성한다.

```text
- 현재 모습
- 수염이 약하게 줄어든 모습
- 수염이 중간 정도 줄어든 모습
- 수염이 많이 줄어든 모습
```

사용자는 Before/After 슬라이더로 변화를 확인하고, 원하면 피부과 상담에 가져갈 질문을 생성한다.

### 1.2 대상 사용자

```text
- 면도 후 푸른 자국이 남는 남성
- 인중/턱/입 양쪽 수염이 고민인 사용자
- 레이저 제모를 할지 말지 고민하는 사용자
- 피부과 상담 전 내 얼굴의 변화 가능성을 시각적으로 보고 싶은 사용자
```

### 1.3 핵심 사용자 가치

```text
- 레이저 제모 전후 느낌을 내 얼굴 기준으로 미리 체감
- 인중/턱/입 양쪽/턱선/구렛나루 중 어떤 부위가 문제인지 시각화
- 실제 상담에서 물어볼 질문을 정리
- 결과가 과장된 필터가 아니라 “수염만 줄인 참고 이미지”로 느껴지게 함
```

---

## 2. MVP 확정 UX 범위

이번 세션에서 확정한 MVP UX는 다음 8개다.

```text
1. Before / After 슬라이더
2. Mild / Medium / Strong 3단계 결과
3. 단계별 “약 몇 회차 느낌” 보조 문구
4. 수염 타입 분석 카드
5. 하관 보존 체크 표시
6. 사진 품질 / 재촬영 안내
7. 현실적 결과 안내 문구
8. 상담 질문 생성
```

### 2.1 Before / After 슬라이더

결과 한 장만 보여주면 변화가 미묘하게 느껴질 수 있다. 따라서 기본 결과 화면은 슬라이더를 중심으로 한다.

```text
왼쪽: 현재 사진
오른쪽: 선택한 단계 결과
```

슬라이더 하단에는 단계 탭을 둔다.

```text
Mild | Medium | Strong
```

### 2.2 Mild / Medium / Strong 3단계

회차를 절대 예측처럼 표현하지 않는다. 대신 공개 의학 정보의 일반적 치료 범위를 참고해 시각적 단계로 표현한다.

```text
Mild
초기 변화 예시 · 약 1~2회차 느낌
수염 밀도는 조금 줄었지만 인중/턱 자국은 아직 남아 있는 모습

Medium
중간 변화 예시 · 약 3~5회차 느낌
면도 자국과 푸른기가 눈에 띄게 완화된 모습

Strong
후반 변화 예시 · 약 6회 이상 진행된 느낌
전체적으로 깔끔하지만 피부결과 약한 모공감은 남긴 자연스러운 모습
```

의학정보 표현 원칙:

```text
- “N회 후 모습”이라고 단정하지 않는다.
- “약 N회차 느낌”, “시각적 예시”, “일반적 범위 참고”라고 표현한다.
- 실제 결과는 피부톤, 모발 굵기, 수염 밀도, 레이저 종류, 시술 간격, 의료진 판단에 따라 달라진다고 명시한다.
```

참고할 일반 정보:

```text
- AAD: 대부분 2~6회 치료가 필요하다고 설명.
- Mayo Clinic: 보통 최선의 결과에 4~8회가 필요하다고 설명.
- Cleveland Clinic: 6~8회 치료가 필요할 수 있고 첫 치료 후 10~25% 정도 감소를 볼 수 있다고 설명.
```

MVP UI에서는 이 정보를 길게 노출하지 않고, 상세 안내 또는 툴팁에 넣는다.

### 2.3 수염 타입 분석 카드

결과 생성 전 또는 결과 상단에 다음과 같은 카드가 있으면 사용자가 “내 사진을 분석했구나”라고 느낀다.

```text
현재 사진 기준 분석

- 인중 수염 밀도: 높음
- 턱 수염 자국: 중간
- 입 양쪽 수염: 약함
- 구렛나루 연결: 있음
- 푸른 자국: 강한 편
- 촬영 품질: 보통
```

주의:

```text
- “진단”이 아니라 “현재 사진 기준 분석”으로 표현한다.
- 조명/면도 상태에 따라 달라질 수 있다고 안내한다.
```

### 2.4 하관 보존 체크 표시

이 기능의 신뢰도는 “내 얼굴이 바뀌지 않았는가”에 달려 있다. 결과 화면에는 다음 체크를 노출한다.

```text
하관 보존 확인

✓ 턱선 유지
✓ 입술 형태 유지
✓ 입꼬리 위치 유지
✓ 얼굴 외곽 유지
✓ 수염 영역 중심 보정
```

이 체크는 단순 UX 문구가 아니라 geometry guard 결과와 연결해야 한다.

### 2.5 사진 품질 / 재촬영 안내

사진 품질이 낮으면 결과가 이상해질 수 있다. 따라서 결과 생성 전 quality gate가 필요하다.

```text
촬영 품질

- 정면: 좋음
- 밝기: 보통
- 그림자: 약간 있음
- 입 주변 가림: 없음
- 수염 경계 인식: 좋음
```

차단 또는 재촬영 권장 문구 예시:

```text
입 주변 그림자가 강해서 수염 자국이 과하게 보일 수 있어요.
밝은 곳에서 정면으로 다시 찍으면 더 자연스럽게 생성돼요.
```

### 2.6 현실적 결과 안내 문구

결과 하단에 반드시 노출한다.

```text
이 이미지는 레이저 제모 후 모습을 보장하는 의료 예측이 아니라,
수염 밀도와 자국이 줄었을 때의 시각적 참고 이미지입니다.
실제 결과는 피부·모발·시술 방식에 따라 달라질 수 있어요.
```

### 2.7 상담 질문 생성

결과 생성 후 사용자가 피부과 상담에 가져갈 질문을 생성한다.

예시:

```text
상담 질문 생성 결과

제 수염은 인중과 턱 자국이 강한 편으로 보여요.
제 피부톤과 모발 굵기 기준으로 어떤 레이저가 적합한지,
몇 회 정도부터 눈에 띄는 변화가 기대되는지 상담받고 싶습니다.
면도 후 붉어짐이 있는 편이라 자극이나 색소침착 위험을 줄이는 방법도 확인하고 싶어요.
```

상담 질문은 의료 조언이 아니라 **상담 준비용 문장**으로 제한한다.

---

## 3. 사전 설문 설계

### 3.1 설문의 목적

사전 설문은 단순히 UX 장식이 아니다. 엔진에 직접 영향을 준다.

```text
- 단계별 감소량 조절
- 푸른 자국 보정 강도 결정
- 부위 우선순위 결정
- 사진 상태 해석 보정
- 상담 질문 생성의 개인화
```

### 3.2 MVP 설문 문항

필수 6문항:

```text
1. 수염이 많이 나는 편인가요?
- 적음 / 보통 / 많음 / 매우 많음

2. 수염이 굵은 편인가요?
- 얇음 / 보통 / 굵음

3. 면도 후 푸른 자국이 남나요?
- 거의 없음 / 약간 / 많이 남음

4. 가장 신경 쓰이는 부위는 어디인가요?
- 인중 / 턱 / 입 양쪽 / 턱선 / 구렛나루 / 전체

5. 사진은 면도 후 얼마나 지난 상태인가요?
- 방금 면도 / 하루 이내 / 2~3일 / 수염 기른 상태

6. 원하는 결과는 어떤 쪽인가요?
- 자연스럽게 줄인 모습 / 깔끔한 모습 / 최대한 매끈한 모습
```

선택 1문항:

```text
7. 면도 후 피부 자극이나 트러블이 자주 생기나요?
- 아니오 / 가끔 / 자주
```

이 문항은 이미지 생성보다 상담 질문 생성과 주의 안내에 사용한다.

### 3.3 설문값이 엔진에 주는 영향

```text
수염 많음 / 굵음
→ Mild에서는 수염을 많이 남김
→ Medium에서도 인중·턱 자국 일부 유지
→ Strong에서만 확실히 줄임

푸른 자국 고민 높음
→ beard_shadow_mask 보정 강도 증가
→ blueGraySuppression 증가

방금 면도함
→ hard hair 제거보다 blue/gray shadow 보정 중심

2~3일 지남 또는 수염 기른 상태
→ hard_hair_mask / inpainting 비중 증가
→ 결과 신뢰도는 낮춤

구렛나루 고민 높음
→ sideburn 영역 별도 처리
→ 얼굴 외곽 변형 위험 안내

자연스럽게 줄인 모습 선호
→ preserveDetail 높임
→ inpaintStrength 낮춤
→ 모공/약한 그림자 일부 유지

최대한 매끈한 모습 선호
→ shadowReductionStrength 높임
→ 단, 피부결 감소 warning 표시
```

---

## 4. 기술 방향

### 4.1 핵심 기술 판단

가장 자연스러운 방식은 다음 하이브리드다.

```text
수염 전용 segmentation
+ 색 보정
+ 제한적 inpainting
+ 원본 재합성
+ 하관 geometry guard
```

전체 얼굴을 diffusion img2img로 다시 그리는 방식은 금지한다. 얼굴형, 입술, 턱선, 입꼬리가 바뀔 위험이 크기 때문이다.

### 4.2 기존 AURA 구조와의 연결

기존 AURA AR Makeup Engine은 다음 구조를 가진다.

```text
얼굴 분석 사진 또는 Unity/ARKit capture
→ iOS native MediaPipe FaceLandmarker 478 mesh
→ 부위별 512x512 generated mask package
→ RN bridge
→ Unity RNBridge
→ generated mask atlas / standalone texture
→ FullFaceMakeupRecipe
→ Unity E3RegionMaskOverlay
→ ARFace mesh UV + SmoothRegionMask shader
```

수염 레이저 제모 시뮬레이션은 라이브 AR 렌더링이 아니라 **사진 기반 복원 엔진**으로 시작한다. 하지만 다음 사고방식은 그대로 재사용한다.

```text
- 원본 이미지에서 얼굴 landmark 추출
- 부위별 마스크를 명확한 계약으로 생성
- 마스크와 recipe/correction parameter를 분리
- 결과 이미지와 디버그 산출물을 함께 저장
- fallback 로그가 아니라 실제 결과/마스크/metric을 proof로 삼음
```

### 4.3 권장 MVP 파이프라인

```text
입력 사진
→ face quality gate
→ MediaPipe FaceLandmarker
→ lower-face ROI 추출
→ protect mask 생성
→ beard mask 생성
→ beard shadow mask 생성
→ Mild / Medium / Strong correction recipe 생성
→ 색 보정
→ small stubble inpainting
→ optional generative inpainting
→ soft blending
→ geometry guard
→ 결과 저장
```

---

## 5. 마스크 설계

### 5.1 출력 마스크 종류

수염 제모 시뮬레이션은 마스크를 하나로 처리하면 안 된다. 최소 4종 마스크가 필요하다.

```text
1. hard_hair_mask
   실제 털, 긴 수염, 검은 점, stubble

2. beard_shadow_mask
   푸른/회색 수염 자국, 면도 후 남는 색

3. protect_mask
   바뀌면 안 되는 얼굴 요소

4. soft_blend_mask
   결과 합성 시 경계 feather 영역
```

### 5.2 부위별 마스크

```text
moustache
- 코밑~윗입술 위
- 윗입술과 코밑 경계 보호 필수
- 가장 민감한 영역

chin
- 아랫입술 아래~턱끝
- 푸른 자국이 많이 남는 핵심 영역

mouth_side
- 입꼬리 양쪽, 팔자 시작점 근처
- 표정이 바뀌지 않도록 보호

jaw_beard
- 턱선 안쪽 수염
- 턱선 실루엣 자체는 보호

sideburn
- 구렛나루
- 머리카락/귀/얼굴 외곽과 연결되어 가장 위험
- MVP에서는 기본 OFF 또는 low-strength 처리 권장
```

### 5.3 보호 영역

```text
protect_mask:
- 입술 전체
- 입 안
- 치아
- 콧구멍
- 입꼬리 주름
- 인중 중앙 구조
- 턱선 실루엣
- 얼굴 외곽
- 점, 흉터, 여드름 등 보존할 피부 특징
```

---

## 6. 이미지 보정 방식

### 6.1 Hard hair / stubble 제거

작은 검은 점, 짧은 털, 실제로 피부를 가리는 털은 inpainting 대상이다.

권장 순서:

```text
hard_hair_mask
→ mask erode/dilate 튜닝
→ OpenCV Telea/Navier-Stokes inpaint baseline
→ patch-based restoration
→ 필요 시 diffusion inpainting
→ 원본에 soft mask로 재합성
```

### 6.2 Beard shadow / 푸른 자국 완화

푸른 자국은 생성 모델보다 색 보정이 더 안전하다.

```text
원본 이미지
→ low frequency / high frequency 분리
→ low frequency에서 blue/gray 성분 완화
→ high frequency 피부결 유지
→ 주변 피부 ROI와 Lab/LCh 기준으로 조화
```

권장 처리:

```text
- Lab/LCh color transfer
- blueGraySuppression
- local skin mean matching
- frequency separation
- guided/bilateral filtering
- multi-band blending
```

### 6.3 피부결 보존

남성 하관에서 피부결을 다 지우면 뷰티필터처럼 보인다.

기본값:

```text
preserveDetail = high
```

Strong 단계에서도 모공, 약한 턱 밑 그림자, 피부 요철을 일부 남긴다.

### 6.4 Diffusion inpainting 사용 조건

Diffusion 또는 외부 생성 모델은 다음 경우에만 쓴다.

```text
- 긴 수염이 실제 피부를 많이 가린 경우
- dense beard가 단순 색 보정으로 해결되지 않는 경우
- 구렛나루처럼 hair-to-skin transition이 필요한 경우
```

금지:

```text
- 전체 얼굴 img2img
- 얼굴형이 바뀌는 denoise strength
- 입술/턱선/얼굴 외곽을 포함한 uncontrolled generation
- 생성 결과를 원본 위에 재합성하지 않고 그대로 사용
```

권장:

```text
lower-face crop
+ hard_hair_mask only
+ protect_mask 강제
+ 낮은 denoise strength
+ ControlNet/Canny/Depth/landmark 등 구조 고정 가능성 검토
+ 원본 재합성
```

---

## 7. 단계별 correction recipe

### 7.1 공통 파라미터

```ts
type BeardSimulationRecipe = {
  version: 1;
  stage: 'mild' | 'medium' | 'strong';
  stageCopy: string;

  survey: {
    beardDensity: 'low' | 'medium' | 'high' | 'very_high';
    hairThickness: 'thin' | 'medium' | 'coarse';
    blueShadow: 'none' | 'mild' | 'strong';
    targetAreas: Array<'moustache' | 'chin' | 'mouth_side' | 'jaw_beard' | 'sideburn' | 'all'>;
    shavingState: 'just_shaved' | 'within_day' | 'two_three_days' | 'grown';
    desiredResult: 'natural' | 'clean' | 'smooth';
    irritationConcern?: 'none' | 'sometimes' | 'often';
  };

  layers: BeardCorrectionLayer[];
};

type BeardCorrectionLayer = {
  region: 'moustache' | 'chin' | 'mouth_side' | 'jaw_beard' | 'sideburn';
  enabled: boolean;

  hairRemovalStrength: number;
  shadowReductionStrength: number;
  blueGraySuppression: number;
  inpaintStrength: number;

  skinToneAdaptive: number;
  preserveDetail: number;
  feather: number;
  maskErode: number;
  maskDilate: number;

  protectGeometry: boolean;
};
```

### 7.2 기본 프리셋

초기값은 실험용이며, 로컬 랩에서 튜닝한다.

```yaml
mild:
  hairRemovalStrength: 0.25
  shadowReductionStrength: 0.20
  blueGraySuppression: 0.18
  inpaintStrength: 0.15
  preserveDetail: 0.90
  feather: 0.25

medium:
  hairRemovalStrength: 0.55
  shadowReductionStrength: 0.48
  blueGraySuppression: 0.45
  inpaintStrength: 0.35
  preserveDetail: 0.80
  feather: 0.32

strong:
  hairRemovalStrength: 0.82
  shadowReductionStrength: 0.72
  blueGraySuppression: 0.68
  inpaintStrength: 0.55
  preserveDetail: 0.68
  feather: 0.40
```

### 7.3 설문 기반 보정

```text
beardDensity = very_high
→ mild/medium에서 hairRemovalStrength를 낮춰서 잔여감 유지

hairThickness = coarse
→ hard_hair_mask confidence 증가
→ inpaintStrength 소폭 증가

blueShadow = strong
→ blueGraySuppression 증가
→ shadowReductionStrength 증가

desiredResult = natural
→ preserveDetail 증가
→ inpaintStrength 감소

desiredResult = smooth
→ shadowReductionStrength 증가
→ 결과 warning 표시

targetAreas에 sideburn 포함
→ sideburnStrength 별도 적용
→ jawlineProtectMargin 증가
```

---

## 8. Geometry Guard

### 8.1 목적

생성 결과가 좋아 보여도 하관 구조가 바뀌면 실패다. 자동 검증을 통과한 결과만 사용자에게 보여준다.

### 8.2 검증 항목

```text
Before / After 비교:

- 입술 landmark 이동량
- 입꼬리 이동량
- 턱끝 landmark 이동량
- 코밑~윗입술 거리 변화
- 아랫입술~턱끝 거리 변화
- jawline silhouette IoU
- face outer contour IoU
- protected region pixel diff
- outside-mask SSIM
```

### 8.3 초기 기준

```text
주요 landmark drift
- normalized image 기준 0.5~1.0% 이상 이동하면 reject 또는 재생성

jawline silhouette
- IoU 0.98 이하이면 reject

protect_mask 내부 변화
- 입술/콧구멍/치아/입꼬리 변화가 크면 reject

mask 밖 변화
- 거의 0에 가까워야 함
```

### 8.4 실패 시 대응

```text
1. inpaintStrength 낮춤
2. mask를 안쪽으로 erode
3. protect margin 확대
4. diffusion path 끄고 deterministic path로 fallback
5. 그래도 실패하면 결과 생성 차단
```

---

## 9. 로컬 테스트 랩

### 9.1 목적

앱에 붙이기 전, 맥 로컬에서 여러 얼굴 예시에 엔진을 적용하고 파라미터를 조정한다.

```text
여러 얼굴 사진 입력
→ 마스크 확인
→ Mild / Medium / Strong 결과 확인
→ 슬라이더로 파라미터 조정
→ 결과와 로그 저장
→ 실패 케이스 분류
```

### 9.2 권장 구현

초기에는 Python + Gradio 또는 Streamlit으로 만든다.

```text
beard-simulation-lab/
  app.py
  engine/
    detect_face.py
    lower_face_roi.py
    beard_segmentation.py
    beard_shadow_corrector.py
    stubble_inpaint.py
    generative_inpaint_adapter.py
    blend.py
    geometry_guard.py
    pipeline.py
  configs/
    mild.yaml
    medium.yaml
    strong.yaml
  samples/
    input/
    consented_test_faces/
    synthetic_faces/
  outputs/
    runs/
```

### 9.3 화면 구성

```text
왼쪽:
- 원본 사진
- 얼굴 landmark overlay
- lower-face ROI
- hard_hair_mask
- beard_shadow_mask
- protect_mask
- soft_blend_mask

오른쪽:
- Mild 결과
- Medium 결과
- Strong 결과
- Before/After slider
- diff heatmap
- metrics.json preview
```

### 9.4 조정 슬라이더

```text
hairRemovalStrength
shadowReductionStrength
blueGraySuppression
inpaintStrength
preserveDetail
feather
maskErode
maskDilate
jawlineProtectMargin
lipProtectMargin
sideburnStrength
```

### 9.5 테스트 샘플 구성

```text
A. 수염 밀도
- 거의 없음
- 보통
- 많음
- 매우 많음

B. 수염 형태
- 인중 중심
- 턱 중심
- 입 양쪽
- 턱선
- 구렛나루 연결
- 전체 beard

C. 사진 상태
- 방금 면도
- 하루 지난 stubble
- 긴 수염
- 푸른 자국 강함

D. 피부/조명
- 밝은 피부
- 중간 피부
- 어두운 피부
- 실내 노란 조명
- 측면 그림자
- 저화질/흔들림
```

테스트 데이터 원칙:

```text
- 실제 얼굴은 명시 동의 받은 내부 테스트 사진만 사용
- AI 생성 얼굴은 시각 디버깅 보조용으로만 사용
- 최종 품질 평가는 실제 동의 사진으로 수행
```

### 9.6 저장 산출물

각 run마다 저장한다.

```text
original.png
face_landmarks.png
lower_face_roi.png
hard_hair_mask.png
beard_shadow_mask.png
protect_mask.png
soft_blend_mask.png
mild.png
medium.png
strong.png
before_after_grid.png
diff_heatmap.png
metrics.json
config.yaml
survey.json
```

### 9.7 자동 평가 지표

```text
Geometry preservation:
- lip landmark drift
- mouth corner drift
- chin point drift
- jawline contour IoU
- protected region pixel diff

Beard reduction:
- dark stubble pixel reduction
- blue/gray shadow reduction
- beard mask average intensity change

Naturalness:
- outside-mask SSIM
- skin texture preservation score
- boundary seam score

Quality:
- face detected
- frontal quality
- lighting quality
- mask confidence
```

### 9.8 실패 케이스 폴더

```text
failed_cases/
  lip_changed/
  jawline_changed/
  skin_over_smoothed/
  sideburn_failed/
  shadow_misread/
  mask_leak/
  identity_changed/
```

---

## 10. 구현 단계

### Phase 0. Contract 고정

```text
- BeardSimulationRequest
- BeardSurvey
- BeardMaskPackage
- BeardSimulationRecipe
- BeardSimulationResult
- BeardSimulationMetrics
- Error/Warning code
```

완료 기준:

```text
- fixture JSON 5개 작성
- validator 통과
- mild/medium/strong config load 가능
```

### Phase 1. 로컬 Beard Simulation Lab

```text
- Gradio/Streamlit UI
- 단일 이미지 실행
- mask/result/metrics 저장
- 슬라이더 조정
- YAML preset 저장/불러오기
```

완료 기준:

```text
- 10개 샘플 batch 실행
- outputs/runs 하위에 산출물 저장
- 실패 케이스 수동 분류 가능
```

### Phase 2. Face / Lower-face ROI

```text
- MediaPipe FaceLandmarker
- 하관 ROI 추출
- 입술/턱선/얼굴 외곽 protect mask
- 사진 품질 gate
```

완료 기준:

```text
- 입술/입꼬리/턱선 보호 영역이 overlay로 검토 가능
- 정면/조명/가림 warning 생성
```

### Phase 3. Beard Mask Baseline

```text
- hard_hair_mask baseline
- beard_shadow_mask baseline
- moustache/chin/mouth_side/jaw/sideburn region split
```

완료 기준:

```text
- 수염 부위가 1차적으로 분리됨
- 입술/콧구멍/얼굴 외곽 누수 최소화
```

### Phase 4. Deterministic Restoration

```text
- Lab/LCh 기반 shadow 보정
- frequency separation
- OpenCV inpaint
- multi-band/feather blending
```

완료 기준:

```text
- Medium 단계에서 푸른기 감소 체감
- 피부결 과도한 뭉개짐 없음
- geometry guard 통과
```

### Phase 5. Optional Generative Inpainting

```text
- hard_hair_mask only
- lower-face crop inpainting
- protect mask 강제
- 원본 재합성
```

완료 기준:

```text
- dense beard / long beard 케이스에서 baseline보다 자연스러운 결과
- identity / jawline drift reject 가능
```

### Phase 6. 앱 연결

```text
- RN 화면: 설문 + 사진 입력 + 결과 화면
- Before/After slider
- 수염 타입 카드
- 하관 보존 체크
- 상담 질문 생성
```

완료 기준:

```text
- 로컬 엔진 API 또는 backend job과 연결
- 결과 저장/재조회 가능
- 현실적 결과 안내 문구 노출
```

---

## 11. 계약 초안

### 11.1 BeardSimulationRequest

```ts
type BeardSimulationRequest = {
  schemaVersion: 'aura-beard-simulation-request-v1';
  sourceImageUri: string;
  survey: BeardSurvey;
  requestedStages: Array<'mild' | 'medium' | 'strong'>;
  options?: {
    generateConsultationQuestions?: boolean;
    saveDebugArtifacts?: boolean;
  };
};
```

### 11.2 BeardSurvey

```ts
type BeardSurvey = {
  beardDensity: 'low' | 'medium' | 'high' | 'very_high';
  hairThickness: 'thin' | 'medium' | 'coarse';
  blueShadow: 'none' | 'mild' | 'strong';
  targetAreas: Array<'moustache' | 'chin' | 'mouth_side' | 'jaw_beard' | 'sideburn' | 'all'>;
  shavingState: 'just_shaved' | 'within_day' | 'two_three_days' | 'grown';
  desiredResult: 'natural' | 'clean' | 'smooth';
  irritationConcern?: 'none' | 'sometimes' | 'often';
};
```

### 11.3 BeardMaskPackage

```ts
type BeardMaskPackage = {
  schemaVersion: 'aura-beard-mask-package-v1';
  packageId: string;
  sourceImage: {
    width: number;
    height: number;
    uri: string;
  };
  faceQuality: {
    usable: boolean;
    frontalScore: number;
    lightingScore: number;
    blurScore: number;
    occlusionScore: number;
    warnings: string[];
  };
  masks: {
    hardHairMaskUri: string;
    beardShadowMaskUri: string;
    protectMaskUri: string;
    softBlendMaskUri: string;
    regionMasks: Partial<Record<'moustache' | 'chin' | 'mouth_side' | 'jaw_beard' | 'sideburn', string>>;
  };
  metrics: {
    beardDensityScore: number;
    blueShadowScore: number;
    maskConfidence: number;
  };
};
```

### 11.4 BeardSimulationResult

```ts
type BeardSimulationResult = {
  schemaVersion: 'aura-beard-simulation-result-v1';
  status: 'ready' | 'partial_success' | 'blocked' | 'failed';
  resultId: string;
  originalImageUri: string;
  stages: Array<{
    stage: 'mild' | 'medium' | 'strong';
    imageUri: string;
    label: string;
    sessionRangeCopy: string;
    explanation: string;
  }>;
  analysisCard: {
    moustacheDensity: 'low' | 'medium' | 'high';
    chinShadow: 'low' | 'medium' | 'high';
    mouthSideBeard: 'low' | 'medium' | 'high';
    sideburnConnection: boolean;
    blueShadow: 'none' | 'mild' | 'strong';
  };
  geometryPreservation: {
    passed: boolean;
    checks: Array<{
      name: string;
      status: 'passed' | 'warning' | 'failed';
      value?: number;
    }>;
  };
  qualityWarnings: string[];
  medicalDisclaimer: string;
  consultationQuestions?: string[];
  artifacts?: {
    maskPackageUri?: string;
    metricsJsonUri?: string;
    diffHeatmapUri?: string;
  };
};
```

---

## 12. 사용자 문구 가이드

### 12.1 결과 제목

```text
레이저 제모가 진행됐을 때의 참고 이미지예요
```

### 12.2 하관 보존

```text
턱선과 입술 형태는 유지하고, 수염과 수염 자국 중심으로만 줄였어요.
```

### 12.3 단계 설명

```text
Mild: 초기 변화 느낌
Medium: 눈에 띄는 완화 느낌
Strong: 많이 줄어든 깔끔한 느낌
```

### 12.4 제한 안내

```text
실제 결과는 개인의 피부톤, 모발 굵기, 수염 밀도, 레이저 종류, 시술 간격에 따라 달라질 수 있어요.
```

### 12.5 재촬영 안내

```text
입 주변 그림자가 강해서 결과가 어색할 수 있어요.
밝은 곳에서 정면으로 다시 촬영하면 더 자연스럽게 확인할 수 있어요.
```

---

## 13. 금지사항

```text
- “레이저 N회 후 정확한 모습”이라고 단정 금지
- 의료적 효능, 부작용, 적합 레이저 종류를 확정적으로 말하기 금지
- 전체 얼굴 img2img로 얼굴을 다시 생성하는 방식 금지
- 턱선, 입술, 입꼬리, 얼굴 외곽 변경 금지
- 구렛나루 제거 시 얼굴 폭/귀/머리카락을 새로 생성하는 강한 보정 금지
- 사진 품질 낮은 상태에서 강한 결과를 확정적으로 노출 금지
- 실제 얼굴 테스트 데이터 무단 사용 금지
- 상담 질문을 의학적 처방처럼 작성 금지
```

---

## 14. 검토 요청 사항

검토 에이전트는 다음을 중점적으로 판단한다.

```text
1. 이 아이디어가 남성 사용자 경험 관점에서 충분히 매력적인가?
2. MVP UX 범위가 적절한가? 빠진 핵심 UX가 있는가?
3. Mild / Medium / Strong 단계와 “약 몇 회차 느낌” 문구가 안전하고 설득력 있는가?
4. 사전 설문 문항이 엔진과 UX에 실제로 도움이 되는가?
5. 수염 segmentation / beard shadow correction / inpainting / blending 구조가 기술적으로 적합한가?
6. 하관 geometry guard 기준이 충분히 보수적인가?
7. 기존 AURA 디렉토리 구조와 통합하기에 어떤 위치가 적합한가?
8. 로컬 Beard Simulation Lab을 어떤 형태로 만드는 것이 가장 빠르고 안전한가?
9. 현재 AURA의 MediaPipe, generated mask, shared-contracts, RN bridge 구조에서 재사용할 수 있는 부분은 무엇인가?
10. 기존 AR 메이크업 엔진과 분리해야 하는 부분은 무엇인가?
11. 의료/프라이버시/동의 측면에서 위험한 표현이나 데이터 흐름은 없는가?
12. MVP에서 제거하거나 후순위로 미뤄야 할 기능은 무엇인가?
```

---

## 15. 최종 판단

이 MVP의 성공 기준은 “의학적으로 정확한 회차 예측”이 아니다.

성공 기준은 다음이다.

```text
1. 사용자가 자기 얼굴에서 수염이 줄어든 모습을 자연스럽게 체감한다.
2. 원래 하관 형태가 바뀌지 않았다고 신뢰한다.
3. 단계별 변화가 과장되지 않고 현실적이다.
4. 사진 품질이 낮을 때는 재촬영을 안내한다.
5. 상담 질문 생성으로 실제 행동 전환이 가능하다.
6. 로컬 테스트 랩에서 다양한 얼굴/수염 케이스를 반복 검증할 수 있다.
```

따라서 첫 구현은 **“수염 전용 마스크 + 색 보정 + 제한적 인페인팅 + 하관 보존 검증 + 로컬 테스트 랩”**으로 시작한다.
