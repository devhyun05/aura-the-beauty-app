# 글램 2.0 에셋 계약 — 생성물이 지켜야 할 규격 (2026-07-21 정찰 실측)

> 새 텍스처가 기존 시스템에 꽂히기 위한 기술 계약. 전부 코드·에셋 실측 기반 (추정은 ⚠️ 표기).
> 관련: [룩 스펙](GLAM2_LOOK_SPEC_KO.md) · [작업 로그](GLAM2_WORKLOG_KO.md)

## 1. 속눈썹 텍스처 계약 ✅ 확정

- **파일**: Resources/lash_natural.png, lash_volume.png — **512×256**
- **잉크 = 알파 채널**: 획 알파 190~208(반투명), 배경 완전 투명(0). RGB는 셰이더가 무시하고 색은 유니폼(_BrowColor 마스카라색)에서 옴 → **생성물은 "검정 획+흰 배경"으로 받아 코드에서 밝기→알파 변환** (LashTexture.shader:47-49 근거)
- **좌표 규약** (LashRenderer.cs:182-204):
  - v=0(아래변)=뿌리, v=1(위)=끝 — 획이 아래에서 위로 자람
  - u=0(왼쪽)=눈머리, **u=1(오른쪽)=눈꼬리** (texU 주석 "바깥=1=꼬리")
  - 리본(상안검 라인 곡선 스트립)에 통짜로 스트레치 — 인조 속눈썹 스트립과 동일 개념
- **좌우 눈**: 같은 텍스처 공유, 미러링은 리본 기하가 처리 (텍스처 1장만 만들면 됨)
- **스타일 전환**: style==2 → lash_volume, 그 외 → lash_natural (LashRenderer.cs:213). 새 텍스처는 이 두 슬롯 중 하나를 교체하거나 스타일 추가
- **임포트 설정**: sRGB=1, 압축=Normal, 밉맵 ON, wrap=Clamp, filter=Bilinear (기존과 동일하게)
- **참고**: 절차 모드(Pencil 셰이더)와 텍스처 모드 2계통 존재 — 우리는 텍스처 모드 대상

## 2. 아이라인 텍스처 계약 ✅ 대부분 확정

- **파일**: Resources/default_eyeliner.png — **512×160**, 알파 잉크(속눈썹과 동일 방식)
- **모양**: 얇은 수평 라인이 오른쪽으로 갈수록 두꺼워지다 오른쪽 끝에서 위로 꺾이는 윙 → **오른쪽=눈꼬리** 규약 일치
- **소비처**: EyelinerStyleRenderer.cs:91 (기본 로드) — ⭐ **SetTextureFromFile(path) 런타임 교체 지원** = 재빌드 없이 핫스왑 가능 (반복 실험에 최적)
- ⚠️ v축 방향(라인이 아래변 기준인지)은 장착 후 캡처로 최종 확인

## 3. 섀도 디자이너 마스크 계약 ✅ 확정 (기존 확보)

- 슬롯: Eyeshadow 디자이너 마스크, 밴드-로컬 uv2 (u=눈앞0→눈꼬리1, v=안검연0→눈썹1), **.r 채널 = 존 세기**
- 임포트: **straight/linear(non-sRGB)** — 감마 왜곡 방지 (셰이더 주석 근거)
- 생성물: 검정 배경 + 흰 존 (스펙 §4 프롬프트 규칙과 일치)

## 4. 펄/광 맵 계약 ✅ 확정 (기존 확보)

- FinishMap: R=광 게인, G=시머 밀도, B=예약. 기본 white + has flag 0 = 무변조
- straight(non-sRGB/linear) 임포트 필수. 립=링 uv 반경, 섀도=밴드 uv 샘플

## 5. 립 라우팅 ✅ 정적 확정 (2026-07-21 코드 추적, 라이브 로그로 최종 1회 재확인 예정)

- **AR 스텐실 화면의 립 칩들(MLBB 벨벳·글램 립·레드 매트 등) → Fable 링 메시 (Lip.shader)** 경로:
  - 칩 정의: `apps/mobile/.../composer/lookVariants.ts:113~` — lipColor/lipIntensity/lipFinish/lipTexture 등 **Fable 셰이더 축 이름 그대로**
  - "글램 립" 라벨은 전체룩 'glam' 프리셋(presets.ts:337)에서 부위 카드로 상속된 이름 (lookTree.ts 주석 근거)
  - 전송: unityMakeupBridge → NativeBridge.OnMessageFromRN → MakeupController.ApplyRecipeJson → **LipRenderer.ApplyLipParams (풀 파라미터: finish·gradient·texture·overline·color2 전부 배선됨)** — codegraph로 호출자 2곳(RNBridge 파일럿 / MakeupController) 확인
- 결론: **튜닝 대상 = Lip.shader 유니폼, 조작 경로 = MakeupController 레시피 파라미터.** RNBridge 파일럿(색+강도만)과 E3 마스크 경로는 다른 표면(추천/보고서 플로우)용
- 스크린샷의 경계 결함 재해석: Fable 경로라면 스필은 E3가 아니라 **글램 프리셋의 overline 값 또는 스냅 실패** 가능성 — 첫 장착 때 프리셋 overline 값 확인
- 최종 검증: 첫 장착 실험에서 콘솔 로그 1회 확인 (정적 결론 재확인용)

## 6. 검증 씬 — ⚠️ 미조사 (다음 단계)

- 에디터 상단에 "Makeup AR Validation" 커스텀 메뉴 존재 확인 (스크린샷). 씬: Assets/Scenes/MakeupARFaceValidation.unity
- 캡처 방법·테스트 얼굴 제공 여부는 첫 장착 실험 때 확인

## 7. Unity AI 크레딧 예산 (2026-07-21)

- 잔액 **1000 크레딧**. 공개 요율표 못 찾음(웹 확인) → **실측 원칙**: 첫 생성 1장 → AI 창 잔액 변화로 장당 소모 확인 → 배치 크기 결정
- 우선순위: 속눈썹 > 섀도 마스크 > 아이라인 (라이너는 형태가 단순해 절차 생성으로도 충분할 가능성)
