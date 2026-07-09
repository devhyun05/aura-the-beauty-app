# 모델 선정 결정 문서 (2026-07-10)

작업 목록 4가지에 대한 답. 벤치마크: `eval/bench_models.py` (자체 셀카 9쌍, 약 6명).
라이선스·온디바이스 조사: 웹 리서치 + 직접 파라미터 측정.

---

## ⚠️ 앞선 보고의 정정 2건

### 정정 1 — "CLIPSeg가 C1보다 3.2배" 는 **과장**이었다

이전 비교는 두 모델을 **같은 threshold(0.3)** 로 쟀는데, C1의 confidence는 스케일이 훨씬 낮아
0.3은 C1에게 불리한 지점이었다. **각자 최적 threshold**에서 다시 재면:

| 모델 | best thr | IoU | Precision | Recall |
|---|---:|---:|---:|---:|
| C1 (우리 규칙) | 0.05 | 0.304 | 0.418 | 0.551 |
| **CLIPSeg "beard stubble"** | **0.12** | **0.483** | **0.646** | **0.736** |

실제 격차는 **IoU 1.6배** (3.2배 아님). CLIPSeg가 여전히 **모든 지표에서 우위**지만
정직한 수치는 이것이다. (C1의 자체 도메인 recall도 0.109가 아니라 최적점에서 0.551.)

**교훈**: threshold 보정이 안 된 상태의 모델 간 비교는 무의미하다.

### 정정 3 — ELFW를 "Apache-2.0, 깨끗함"이라 한 것도 **틀렸다**

- ELFW **코드**는 Apache-2.0이 맞다 (LICENSE 파일 직접 확인).
- 그러나 **데이터셋**은 프로젝트 사이트에 **Hippocratic License**로 명시돼 있다
  (https://multimedia-eurecat.github.io/2020/06/22/extended-faces-in-the-wild.html).
  이는 OSI 미승인 "Ethical Source" 라이선스로, **상업 사용 자체는 허용**하나
  인권 준수 조항이 붙은 **비표준 라이선스**다 → 법무 검토 필요.
- 게다가 **다운로드가 구글 폼 승인제**라 자동으로 받을 수 없다. 사람이 신청해야 한다.
- 규모: 라벨 얼굴 **3,754장**, 확장 클래스(beard-mustache 등) 포함 **1,423장**, 6+1 클래스.

### ⚠️ 반복된 실수의 패턴 (기록해 둘 것)

세 번의 라이선스 오판은 **모두 같은 실수**였다:

> **"저장소의 코드 라이선스"를 "가중치·데이터셋의 라이선스"로 착각했다.**

| 대상 | 코드 | 가중치/데이터 |
|---|---|---|
| CLIPSeg | MIT ✅ | 불명확 ⚠️ |
| SegFormer | Apache-2.0 (HF transformers) ✅ | NVIDIA 비상업 ❌ |
| ELFW | Apache-2.0 ✅ | Hippocratic ⚠️ |

**앞으로 규칙: 모델·데이터셋 라이선스는 반드시 "가중치 파일" 또는 "데이터 배포처"에서
따로 확인한다. GitHub의 LICENSE 파일만 보고 판단하지 않는다.**

### 정정 2 — SegFormer-B0 추천은 **틀렸다** (비상업 라이선스)

앞서 "SegFormer-B0 fine-tune"을 권했으나, `nvidia/mit-b0` 사전학습 가중치는
**Apache-2.0이 아니라 NVIDIA Source Code License = 비상업 전용**이다:

> "The Work and any derivative works thereof only may be used or intended for use
> non-commercially… 'non-commercially' means for research or evaluation purposes only."
> — https://github.com/NVlabs/SegFormer/blob/master/LICENSE

HF `transformers`의 SegFormer **코드**는 Apache-2.0이지만 **NVIDIA 가중치는 상업 사용 불가**.
사전학습 없이 처음부터 학습하면 소량 데이터 fine-tune의 이점이 사라진다. → **제품에 부적합.**

---

## 1) 어떤 모델이 우리 샘플을 가장 잘 잡는가

프롬프트 변형 + 작은 변종까지 같은 ROI·같은 지표로 비교 (9장 평균, 각자 최적 thr):

| config | best thr | IoU | Prec | Rec | 비고 |
|---|---:|---:|---:|---:|---|
| c1 (규칙) | 0.05 | 0.304 | 0.418 | 0.551 | 참조 |
| **rd64 "beard stubble"** | **0.12** | **0.483** | **0.646** | **0.736** | **최고** |
| rd64 "beard" | 0.15 | 0.471 | 0.740 | 0.656 | precision 우위 |
| rd64 "facial hair" | 0.15 | 0.472 | 0.743 | 0.654 | 거의 동일 |
| rd64 "mustache and beard" | 0.15 | 0.411 | 0.673 | 0.671 | 열위 |
| rd64 앙상블 6프롬프트 | 0.25 | 0.482 | 0.598 | 0.807 | IoU 동률, 느림 |
| rd16 앙상블 | 0.4 | 0.483 | 0.587 | 0.749 | **작지 않음(아래)** |

**선정: `CIDAS/clipseg-rd64-refined` + 단일 프롬프트 `"beard stubble"` + thr ≈ 0.12.**
앙상블은 IoU 이득 없이 비용만 늘고, 낮은 threshold에서 recall 1.0(=ROI 전체 도배)로 붕괴한다.

CPU warm latency: C1 0.25s/장, CLIPSeg 1.20s/장 (약 5배).

## 2) 아이폰 탑재 가능한가, 서버가 필요한가

직접 측정한 파라미터 분해:

| | 총 파라미터 | CLIP 백본 | 디코더 | 텍스트 인코더 |
|---|---:|---:|---:|---:|
| clipseg-rd64-refined | 150.7M | 149.6M | 1.1M | 63.2M |
| clipseg-rd16 | 149.9M | 149.6M | 0.3M | 63.2M |

- **rd16은 "작은 모델"이 아니다.** rd 숫자는 디코더 차원일 뿐, 용량의 **99%는 공유 CLIP 백본**.
  크기 이득이 없다 (603MB vs 600MB fp32).
- 용량: **fp32 603MB / fp16 301MB.** 프롬프트가 고정("beard stubble")이면 **텍스트 임베딩을
  미리 계산해 상수로 구워넣고 텍스트 인코더(63.2M)를 제거** 가능 → **fp16 약 175MB.**
  (CLIP은 frozen feature extractor이고 텍스트는 FiLM 조건 벡터로만 들어가므로 표준 기법.)
- **CoreML 포트가 존재하지 않는다.** ONNX 익스포트는 존재(`Xenova/clipseg-rd64-refined`).
  변환 시 예상 난점: CLIP ViT 중간 활성값 추출(hook), FiLM 조건화, 동적 shape → **실제 변환 엔지니어링 필요.**
- 예상 지연: A17/A18 ANE에서 **30~80ms/장** (ViT-B/16 기준 추정, **미측정**). 정지 셀카엔 충분,
  실시간 비디오엔 빠듯.

**판단: 기술적으로는 온디바이스 가능하나, (a) 175~300MB는 앱에 무겁고 (b) CoreML 변환 미검증,
(c) 아래 라이선스 리스크 때문에 — CLIPSeg 자체를 출시하지 않는 것을 권고.** 서버도 불필요하다.
대신 **작은 자체 모델**을 온디바이스로 (3)~(4) 참조.

## 3) 라이선스 — 연구용인가 상업용인가

| 대상 | 라이선스 | 상업 사용 |
|---|---|---|
| CLIPSeg **코드** (github.com/timojl/clipseg) | MIT | ✅ 명확 |
| CLIPSeg **가중치** (`CIDAS/clipseg-rd64-refined`) | HF 태그는 `apache-2.0`, 그러나 GitHub는 "MIT는 가중치에 적용 안 됨"이라 명시하고 대체 라이선스를 안 밝힘 | ⚠️ **법적으로 불명확** |
| 내장 **OpenAI CLIP 가중치** | 별도 라이선스 파일 없음. 모델 카드: "Any deployed use case of the model — whether commercial or not — is currently out of scope." | ⚠️ **회색지대** |
| 학습 데이터 PhraseCut → Visual Genome | PhraseCut 라이선스 파일 없음 / VG는 CC BY 4.0 | ⚠️ 불명확 (기반은 관대) |
| ELFW **코드** | Apache-2.0 (LICENSE 파일 확인) | ✅ |
| ELFW **데이터셋** (beard-mustache 클래스 보유) | **Hippocratic License** (프로젝트 사이트 명시) — 상업 사용은 허용하나 OSI 미승인 "Ethical Source" 라이선스 | ⚠️ **비표준, 법무 검토 필요** |
| `nvidia/mit-b0` (SegFormer-B0) | NVIDIA Source Code License | ❌ **비상업 전용** |
| DeepLabv3 + MobileNetV3 (torchvision) | BSD-3-Clause | ✅ |
| MobileSAM | Apache-2.0 | ✅ |
| ND 수염 어노테이션 (arXiv 2308.15740) | 라이선스 미명시 + CelebA 파생 | ⚠️ 연구 전용으로 취급 |

**결론: CLIPSeg 가중치를 제품에 넣어 배포하는 것은 "리스크 있음, 깨끗하지 않음".**
코드는 MIT로 깨끗하지만 가중치·내장 CLIP이 불명확하다.

**참고**: CelebAMask-HQ 기반 face-parsing 모델(BiSeNet, `jonathandinu/face-parsing`)은
**beard 클래스가 아예 없다**(수염이 skin에 흡수됨). 그래서 face-parsing으론 못 푼다 —
CLIPSeg가 이긴 이유가 이것이다.

## 4) 학습을 어떻게 진행할 것인가

**핵심 전략: CLIPSeg를 "선생님"으로만 쓰고, 출시 모델은 따로 만든다 (teacher-student).**

- **아이폰**: 출시 모델은 ~10M 파라미터 (150M 아님) → 가볍고 CoreML 변환 쉬움
- **데이터 부족**: CLIPSeg가 셀카를 **자동 라벨링** → 사람이 손보기만 하면 되어 데이터 확보 저렴
- **라이선스**: CLIPSeg 가중치를 **배포하지 않는다** (사내 오프라인 라벨링 도구로만 사용)

**단, 라이선스 리스크가 0이 되는 것은 아니다 (과장 금지).**
가중치를 배포하지 않는 것은 **명백한 이득**이지만, "불명확한 라이선스의 모델이 생성한
라벨로 학습한 모델"이 파생물로 간주되는지는 **법적으로 미정**이다. 리스크를 낮출 뿐 없애지 못한다.

**리스크를 실제로 0에 가깝게 만드는 유일한 길**: 자체 촬영·자체 라벨링한 데이터로만 학습.
CLIPSeg는 **초안을 그려주는 보조**로 쓰고 **사람이 모두 검수·수정**하면, 최종 라벨의
저작·소유가 우리에게 있다는 주장이 훨씬 강해진다. ELFW는 **선택 사항**이지 필수가 아니다.

### 절차

1. **자동 라벨링**: CLIPSeg(thr 0.12)로 수집한 한국인 셀카에 마스크 생성 → **사람이 검수·수정**
   (지금 recall 0.736 / precision 0.646 수준이라 "초안"으로 충분히 쓸만함)
2. **깨끗한 외부 데이터 보강**: **ELFW (Apache-2.0, beard-mustache 클래스)**
3. **학생 모델 학습**: **DeepLabv3-MobileNetV3 (BSD)** 또는 **MobileSAM (Apache-2.0)** 또는 자체 U-Net
   - 손실: **Dice + Focal** (수염은 픽셀 비중이 작아 CE만 쓰면 "전부 배경" 으로 붕괴)
   - 해상도: 하관 ROI를 크롭해 **≥512²** (수염은 고주파 텍스처라 다운샘플 금물)
4. **평가**: 자체 한국인 셀카를 **학습에 쓰지 말고 평가 게이트로만** 사용. 인물 단위로 split.

### 비용

- **Google Colab 무료 T4로 충분.** 2,000장 × 50 epoch ≈ 1~3시간, 단일 자릿수 GPU-hour.
- 토큰 비용 아님(GPU가 도는 동안 에이전트 토큰 미사용).

### 함정 (조사에서 확인)

1. **도메인 시프트가 최대 리스크** — 외부(서양) 데이터에 과적합. 평가는 반드시 자체 도메인으로.
2. **클래스 불균형** — Dice/Focal 필수, 픽셀 정확도 대신 IoU로 보고.
3. **stubble 라벨 노이즈** — 면도 자국 경계는 본질적으로 모호. 일관된 라벨 규칙 유지.
4. **자체 9~30장은 학습셋으로 부족** — 평가 게이트로 쓰고, 학습 데이터는 자동 라벨링으로 확보.
5. **라벨 기준 통일** — 현재 pic 세트(tight, 0.5%)와 psd 세트(broad, 5.7%)가 10배 다름.

---

## 종합 권고 (다음 행동)

1. **[결정 필요]** CLIPSeg는 **오프라인 티처로만** 사용한다는 방침 확정 (배포하지 않음).
   → 라이선스 리스크가 사라지고, 아이폰 문제도 함께 풀린다.
2. **라벨 기준 통일 + 셀카 20~30장 확보** (사람·수염양 다양하게). 평가 게이트용.
3. **ELFW 라이선스·내용 직접 확인** 후 학습 데이터로 편입.
4. **파일럿**: DeepLabv3-MobileNetV3를 CLIPSeg 자동라벨 + ELFW로 fine-tune → 자체 셀카에서
   CLIPSeg(IoU 0.483)에 얼마나 근접하는지 측정. Colab 무료로 가능.
5. CoreML 변환·지연 측정은 학생 모델이 정해진 뒤에.

## 검증

```text
파라미터 분해: 직접 측정 (rd64 150.7M / CLIP 149.6M / decoder 1.1M / text 63.2M)
벤치마크: eval/bench_models.py, 자체 셀카 9쌍, engine 무수정
라이선스: 1차 출처(라이선스 파일·모델 카드) 인용. CLIPSeg 가중치·CLIP 가중치는 UNCLEAR로 표기.
pytest: 29 passed
```
