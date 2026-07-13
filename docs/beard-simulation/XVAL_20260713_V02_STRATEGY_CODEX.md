## 한 줄 평결

**A를 주력으로 며칠 태우는 것은 비합리적입니다.** 공식 LaMa fine-tune은 v01보다 질감을 개선할 가능성이 있지만, 256px·수백 장 학습으로 1536px에서 “사용자 본인의 피부”를 복원할 근거는 없습니다. **B의 합성 페어 단독 학습도 선행연구상 실패 가능성이 높습니다.** 제가 고를 경로는 **B를 데이터 생성기로 제한하고, C인 ‘수염 레이어 분해 + 불투명도별 처리 + 원본 피부 기반 고해상도 질감 리파이너’로 가는 하이브리드**입니다. [확신도: 높음]

더 근본적인 문제는 이것입니다. 짙은 수염 아래의 점·흉터·모공은 관측되지 않으므로 복원할 수 없습니다. 만들 수 있는 것은 실제 미래 피부가 아니라 **그 사람에게 그럴듯한 무수염 모습**입니다. 고전적인 Image-Based Shaving 연구도 이 문제를 명시적으로 ill-posed라고 규정했습니다. [확신도: 높음 — [Image-Based Shaving](https://www.robots.ox.ac.uk/~minhhoai/papers/ibs_EG08.pdf)]

## 경로별 평결

| 경로 | 기대 품질 이득 | 주요 실패 위험 | 1인 기준 비용 | 평결 |
|---|---|---|---|---|
| A. 공식 LaMa fine-tune | v01 대비 선명도·텍스처 에너지는 중간 이상 개선 가능 | 일반 모공 환각, 얼굴 구조 드리프트, discriminator 과적합, 256→1536 질감 스케일 불일치 | 파일럿 2–4일, 약 10–30 T4 GPU시간 추정 | **1일 한정 대조군만** [확신도: 높음] |
| B. 합성 페어 단독 | 합성 검증셋에서는 매우 높음 | 실제 수염 sim-to-real 실패, 생성기 지문 학습, 비편집 영역 오염 | 페어 생성·검수 4–7일 이상 | **단독 경로로는 기각** [확신도: 높음] |
| B-hybrid. 합성+소량 실제 페어 | 실수염 일반화 가능성 중간 | 실제 데이터가 너무 적거나 불일치하면 여전히 실패 | 데이터 수집 포함 1–2주 | **C 학습 데이터로 채택** [확신도: 중간~높음] |
| C. 레이어 분해+질감 리파이너 | 옅은 수염·면도 자국에서 높음, 짙은 수염에서 중간 이하 | 불투명 수염 아래 실제 피부는 복원 불가, 패치 반복/질감 이음새 | 5–8 개발일, 비교적 가벼운 학습 | **주력 권고** [확신도: 중간] |
| 서빙타임 diffusion | 시각적 최고점은 높을 수 있음 | 정체성 변화, 지연·비용, 배포환경 간 결정론 불충족 | 실험 1–2일, 운영비 높음 | **oracle/teacher 전용** [확신도: 높음] |

---

## A. LaMa 공식 fine-tune의 현실적 천장

LaMa의 256px 학습→고해상도 추론 주장은 사실입니다. 다만 그 증거는 대규모 범용 데이터에서 구조와 반복 패턴이 고해상도에서도 유지된다는 것이지, 256px에서 보이지 않던 피부 모공을 1536px에서 정확히 되살린다는 뜻이 아닙니다. Big LaMa는 약 450만 Places 이미지, 100만 iteration, 8×V100에서 약 240시간 학습했습니다. 현재 계획의 수백 장 fine-tune과는 데이터 체제가 전혀 다릅니다. [확신도: 높음 — [LaMa 논문](https://arxiv.org/abs/2109.07161), [공식 저장소](https://github.com/advimman/lama)]

특히 256px로 축소하면서 제거된 모공·잔주름·카메라 노이즈 주파수는 FFC가 복구할 수 없습니다. adversarial loss가 만드는 것은 실제 입력 피부의 고주파가 아니라 **학습 데이터상 그럴듯한 고주파**입니다. 전체 얼굴 256px 학습과 하관 1536px 서빙 사이에는 해상도뿐 아니라 모공과 얼굴 부위의 픽셀 스케일 불일치도 있습니다. [확신도: 높음]

Adversarial과 feature matching은 v01의 왁스질을 상당히 완화할 가능성이 있습니다. 그러나 그 개선은 “정확한 피부 복원”보다 “가짜이지만 자연스럽게 보이는 텍스처 생성”에 가깝습니다. 지각적 자연스러움과 입력 충실도 사이에 근본적인 trade-off가 있다는 연구 결과와도 일치합니다. [확신도: 중간~높음 — [Perception-Distortion Tradeoff](https://openaccess.thecvf.com/content_cvpr_2018/html/Blau_The_Perception-Distortion_Tradeoff_CVPR_2018_paper.html)]

수백 장 GAN fine-tune에서 우려할 우선순위는 다음입니다.

- discriminator 과적합과 학습 진동: 소량 데이터 GAN의 전형적 실패입니다. ADA가 “몇천 장” 체제로 내려오는 데 필요했던 이유이기도 합니다. [확신도: 높음 — [StyleGAN2-ADA](https://arxiv.org/abs/2006.06676)]

- 특정 데이터셋의 모공 패턴·JPEG 지문 반복: 정량 texRatio는 좋아져도 여러 얼굴에 비슷한 피부가 생길 수 있습니다. [확신도: 중간]

- 입술·턱선·인중이 마스크에 들어간 경우의 해부학 변형: local PatchGAN과 perceptual loss는 이를 강하게 금지하지 않습니다. [확신도: 높음]

- conditional mode collapse보다는 “평균적인 턱 피부”로의 수렴이나 특정 질감 fingerprint가 더 현실적인 위험입니다. [확신도: 중간]

HRF perceptual loss 역시 주로 넓은 구조와 의미적 일관성을 돕습니다. 모공 복원을 보장하는 손실이 아닙니다. GLaMa의 주파수 손실도 범용 벤치마크상 개선이지, 수백 장 얼굴 fine-tune이나 본인 피부 재현의 선례는 아닙니다. AnimeLaMa와 GLaMa를 현재 계획의 직접 선례로 들면 과장입니다. [확신도: 높음 — [GLaMa](https://arxiv.org/abs/2205.07162)]

**결론:** A는 “GAN을 넣으면 v01의 블러가 줄어드는가?”를 확인하는 짧은 실험으로는 가치가 있습니다. 그러나 성공해도 그것이 제품 천장이라는 증거는 아닙니다. 공개 연구 중 1536px 수염 제거에서 사용자가 자기 피부로 믿을 수준을 재현 가능하게 입증한 선례는 찾기 어렵습니다. [확신도: 중간~높음]

---

## B. 역방향 합성 페어의 도메인 갭

이 경로에 가장 직접적인 반증이 이미 있습니다. CVPR 2020 수염 합성 연구는 합성 수염 이미지 30,400장을 만들었지만, 실제 수염 약 1,300장을 추가해야 일반화가 됐습니다. ablation에서 합성 단독은 FID 278.17, 실제+합성은 53.15로 차이가 매우 컸습니다. 합성 데이터가 필요했지만 합성만으로는 부족했습니다. [확신도: 높음 — [Intuitive, Interactive Beard and Hair Synthesis](https://openaccess.thecvf.com/content_CVPR_2020/html/Olszewski_Intuitive_Interactive_Beard_and_Hair_Synthesis_With_Generative_Models_CVPR_2020_paper.html)]

“모든 픽셀에 정답이 있으므로 블러가 근본적으로 해결된다”는 주장은 절반만 맞습니다.

- 합성 입력에는 정답이 있으므로 training-label ambiguity는 줄어듭니다. [확신도: 높음]

- 하지만 실수염 입력에서는 수염 아래 피부가 여전히 관측되지 않습니다. 합성 페어는 이 추론 ambiguity를 없애지 못합니다. [확신도: 높음]

- 모델은 피부 복원을 배우는 대신 Qwen 특유의 수염 경계, 색감, 노이즈 패턴을 탐지해 제거할 수 있습니다. 같은 생성기로 만든 검증셋에서는 매우 좋아 보입니다. [확신도: 높음]

Qwen-Image 계열은 코드·모델 라이선스가 Apache-2.0이라 상대적으로 명확하지만, 그것이 원본 얼굴 데이터, 생성 결과, 초상·개인정보, API 약관까지 상업적으로 자동 승인한다는 뜻은 아닙니다. 또한 Qwen-Image-Edit은 정확한 비편집 픽셀 보존을 보장하는 페어 생성기가 아닙니다. [확신도: 높음 — [Qwen-Image 공식 저장소](https://github.com/QwenLM/Qwen-Image), [기술 보고서](https://arxiv.org/abs/2508.02324)]

더구나 공식적인 Qwen-Image-Edit 배포 경로는 20B급으로, NVIDIA NIM 지원표에서는 80GB급 GPU가 요구됩니다. T4 중심의 페어 팩토리로는 양자화·오프로딩 또는 외부 API가 필요해 운영 복잡도와 비용이 올라갑니다. [확신도: 높음 — [NVIDIA NIM 지원표](https://docs.nvidia.com/nim/visual-genai/1.5.1/support-matrix.html)]

B를 사용한다면 원시 Qwen 출력으로 쌍을 만들면 안 됩니다. 최소 통제는 다음입니다.

1. 원본 무수염 이미지 `Y`를 정답으로 보존합니다.
2. Qwen 결과 전체를 입력으로 쓰지 말고, 검증된 수염 soft mask 안만 원본에 합성해 `X`를 만듭니다.
3. 입술·입꼬리·콧방울·턱 외곽은 protected mask로 편집을 금지합니다.
4. 마스크 밖 pixel max error, ΔE2000, landmark 및 ArcFace drift 기준을 넘으면 페어를 폐기합니다.
5. Qwen 하나가 아니라 절차적 strand renderer, 실제 수염 residual transfer 등 여러 생성원을 섞습니다.
6. 반드시 **leave-one-generator-out 평가**를 합니다. 보지 않은 생성기의 수염을 못 지우면 생성기 지문을 배운 것입니다.
7. 출력 모델은 전체 RGB 얼굴이 아니라 `mask × 피부 residual`만 예측하고, 마스크 밖은 원본을 bit-exact하게 복사합니다.
8. 무수염 입력→완전 no-op 예제를 충분히 포함합니다.

[위 통제의 필요성: 확신도 높음, 최종 성능 이득: 확신도 중간]

K-FACE 수만 장도 주의해야 합니다. K-FACE는 약 1,000명에게 조명·포즈·표정 조건을 반복해 100만 장 이상을 만든 데이터라, 프레임 수를 독립 피부 identity 수로 계산하면 안 됩니다. 동일인 기준으로 split해야 하며, 스튜디오→한국 사용자 셀피 도메인 갭도 큽니다. 수염/무수염 동일인 페어라는 보장도 없습니다. [확신도: 높음 — [K-FACE 논문](https://arxiv.org/abs/2103.02211)]

가치가 더 높은 것은 수만 장의 상관된 K-FACE 프레임보다 **동일인·동일 조명·고정 카메라의 수염/면도 직후 페어 20–50명**입니다. PGU-Face에는 224명의 clean-shaven 및 unshaven/stubble 모바일 이미지가 있어 연구용 벤치마크 후보가 되지만, 상업적 얼굴 데이터 사용 권한은 별도로 확인해야 합니다. [효용 판단 확신도: 높음 — [PGU-Face 설명](https://www.sciencedirect.com/science/article/pii/S2352340916305741)]

---

## 놓친 C: 수염을 “구멍”이 아니라 “부분 투명 레이어”로 처리

현재 가장 큰 구조적 오류는 수염 영역 전체를 missing region으로 취급하는 것입니다. 옅은 수염과 면도 자국에서는 피부 색·턱 음영·주름이 상당 부분 남아 있습니다. 이를 모두 삭제한 뒤 LaMa가 다시 그리게 하면 정체성과 해부학을 스스로 버리는 셈입니다. [확신도: 높음]

제가 구현할 C는 다음과 같습니다.

```text
수염 soft alpha / opacity 예측
        │
        ├─ 낮은 불투명도: 수염 색·strand residual만 제거
        │                  원본 저주파 음영과 피부 구조 보존
        │
        ├─ 높은 불투명도 core: LaMa로 구조만 채움
        │
        └─ native-resolution refiner:
             주변의 본인 피부 패치로 고주파 residual만 합성
             마스크 밖과 저주파는 원본/LaMa 결과를 고정
```

핵심은 다음입니다.

- binary mask를 `core / feather halo / protected anatomy`로 나눕니다.
- 리파이너는 전체 RGB가 아니라 Laplacian/high-pass residual만 출력합니다.
- 입력 셀피의 볼·턱 주변 피부를 texture bank로 사용해 같은 카메라 노이즈와 피부 통계를 가져옵니다.
- deterministic PatchMatch 또는 작은 residual U-Net으로 구현할 수 있습니다.
- 모공 합성용 약한 local adversarial loss는 마지막에만 추가하고, 전체 얼굴 discriminator는 쓰지 않습니다.
- 불투명도가 높은 긴 수염은 별도 라우팅하거나 “지원 품질 낮음”으로 거절합니다.

이 방식은 옅은 수염·stubble에서는 A/B보다 문제 정의에 더 맞습니다. 짙고 불투명한 수염에서는 실제 피부 정보가 없으므로 여전히 generic synthesis입니다. [전반적 확신도: 중간, 옅은 수염에서의 우위: 중간~높음]

### 다른 C 후보의 평결

- **GFPGAN/CodeFormer 후처리:** 기각합니다. 이들은 얼굴 열화 복원 모델이라 편집된 턱만이 아니라 얼굴 전체를 미화·재해석할 수 있습니다. GFPGAN 모델 설명 자체에도 일부 버전의 identity change와 비자연적 결과가 명시돼 있습니다. CodeFormer는 fidelity–quality trade-off가 있고 공식 라이선스가 비상업용입니다. [확신도: 높음 — [GFPGAN](https://github.com/TencentARC/GFPGAN), [CodeFormer](https://github.com/sczhou/CodeFormer), [CodeFormer 라이선스](https://github.com/sczhou/CodeFormer/blob/master/LICENSE)]

- **MAT/FcF:** 사전학습 모델을 research-only 품질 상한선으로 돌려보는 것은 유용합니다. 하지만 공식 학습 규모가 현재 예산보다 훨씬 크고, MAT는 research-only 조건, FcF도 포함된 StyleGAN 계열 조건을 상업적으로 검토해야 합니다. 재학습 후보로 삼는 것은 낭비입니다. [확신도: 높음 — [MAT](https://github.com/fenglinglwb/MAT), [FcF](https://github.com/SHI-Labs/FcF-Inpainting)]

- **LGM 등 최신 인페인팅:** 논문 성능만 보고 2주 주력으로 바꾸기에는 production checkpoint·라이선스·얼굴 도메인 증거가 약합니다. no-training baseline을 확보할 때만 사용하십시오. [확신도: 중간]

- **Diffusion inpaint:** 최고 품질 oracle이나 합성 teacher로는 가치가 큽니다. 하지만 fixed seed만으로 결정론 계약이 충족되지 않습니다. 모델·scheduler·PyTorch/CUDA/cuDNN·precision·입력 shape까지 고정해야 하며, 플랫폼이나 버전이 바뀌면 bit-exact 결과는 기대하기 어렵습니다. [확신도: 높음 — [Diffusers 재현성 문서](https://huggingface.co/docs/diffusers/en/using-diffusers/reusing_seeds)]

- **상용 API:** 제품 서빙보다 품질 oracle/teacher로만 권합니다. 모델 버전 pinning, 얼굴 보존·학습 미사용, 데이터 보관, 동일 seed 결과 보장을 계약으로 받지 못하면 현재 결정론·개인정보 조건과 맞지 않습니다. [확신도: 높음]

---

## 권고 시퀀스: 2주

### 1주차 — 문제 위치를 분리하고 빠르게 경로를 탈락

**1–2일차: 마스크와 채움을 분리**

- 현재 8장은 이미 결과를 봤으므로 이후 모델 선택용 dev set으로 강등합니다.
- 실제 수염 30–50장에 `opaque core / stubble halo / 입술·턱 보호영역` oracle mask를 수작업합니다.
- 현재 LaMa와 v01을 자동 마스크와 oracle mask 양쪽으로 실행합니다.
- 무수염 입력 no-op과 마스크 밖 bit-exact 복사를 검사합니다.

oracle mask에서도 턱 구조가 무너지면 채움 문제이고, oracle에서는 괜찮다면 A/B에 투자하기 전에 segmentation을 고쳐야 합니다. [확신도: 높음]

**2–3일차: 학습 없는 품질 상한 확인**

- 같은 oracle mask로 MAT/FcF와 diffusion/API 하나를 research baseline으로 실행합니다.
- C의 단순 버전인 원본 인접 피부 high-pass patch transfer를 구현합니다.
- 어떤 모델도 통과하지 못하면 네트워크 선택 문제가 아니라 데이터·마스크·제품 약속 문제입니다.

**3–5일차: A-lite와 B pilot**

- A는 공식 generator+discriminator checkpoint로 재개하되, 최대 10–20k step 또는 24 GPU시간으로 제한합니다.
- 낮은 learning rate, adversarial weight ramp, identity split, 최소 두 seed를 사용합니다.
- 동시에 B 페어는 100–200장만 생성해 검수 파이프라인과 생성기 지문 여부를 확인합니다.

A는 두 seed 모두에서 인간 선호와 질감이 개선되고 해부학 회귀가 0일 때만 연장합니다. 합성 검증에서는 좋지만 실제 수염에서 개선이 없으면 B 단독은 즉시 중단합니다. [확신도: 높음]

### 2주차 — C+B hybrid

- 합성 수염 500–2,000장을 여러 생성 방식으로 제작합니다.
- 모델은 전체 얼굴 U-Net이 아니라 masked residual/alpha student로 제한합니다.
- sparse/stubble은 residual 제거, opaque core만 LaMa 구조 채움으로 라우팅합니다.
- native-resolution 256–512 patch 리파이너로 고주파만 학습합니다.
- 가능하면 동의받은 동일인 면도 전후 페어를 소량이라도 real anchor로 넣습니다.
- 마지막 2일은 untouched sealed set과 독립 평가자에게만 사용합니다.

2주 후 짙은 수염에서 구조 실패가 남는다면 품질 게이트를 낮추지 말고, 초기 MVP를 면도 자국·옅은 수염에 한정하는 편이 맞습니다. [확신도: 높음]

---

## 평가 방법론에서 고쳐야 할 점

현재 자동 게이트 8/8과 인간 판정 8/8의 일치는 아직 “정합”이라 부르기 어렵습니다. 모든 사례가 불합격인 단일 클래스이므로 false positive, false negative, 통과작 순위화 능력을 전혀 측정하지 못했습니다. [확신도: 높음]

| 현재 항목 | 맹점 | 추가할 것 |
|---|---|---|
| texRatio | 백색 노이즈·샤프닝으로 쉽게 게임 가능. 에너지 양과 자연스러움을 혼동 | 다중 주파수 band power·PSD slope, DISTS, 인접 피부 여러 패치와의 분포 비교 |
| dL50·dAb50 | median 피부색으로 채워도 좋아질 수 있음. 자연스러운 턱 음영·색소를 벌점 처리 가능 | ΔE2000 분포와 p90/p95, 저주파 shading 보존, 경계 ring 색차 |
| 오너 1인 블라인드 | 독립성·평가자 일치도 없음. 모델 선택에 쓰면 sealed set 오염 | 3–5명 독립 평가자 또는 목표 사용자 20명 이상, randomized 2AFC, bootstrap CI |
| 실제 수염 무정답 평가 | 실제 피부 정답이 없음 | 합성 paired set과 동일인 면도 전후 paired set을 분리 운영 |
| 전체 품질 점수 | 수염 제거·자연스러움·정체성 문제가 섞임 | “수염 제거”, “자연스러운 피부”, “동일인/해부학 보존”, “사용 의향” 별도 질문 |

[DISTS는 구조와 텍스처를 함께 보는 지각 지표이므로 보조 지표로 적합하지만, 인간평가를 대체하지는 않습니다. 확신도: 중간 — [DISTS](https://arxiv.org/abs/2004.07728)]

추가해야 할 hard gate는 다음입니다.

- 마스크 밖 최대 변화량 0, 단 feather ring은 별도 허용
- 무수염 입력 완전 no-op
- 입술·입꼬리·턱 외곽 landmark drift
- ArcFace identity drift를 품질 점수가 아닌 안전 가드레일로 사용
- residual beard 검출 점수
- 경계 ring의 gradient/Laplacian 불연속
- 수염 밀도·길이, 피부톤, 여드름·점·흉터, 조명, 압축, 입 벌림별 slice 평가
- 재시작·배치 순서 변경 후 output hash 동일성

FID는 현재 규모에서는 쓰지 않는 편이 낫습니다. 소표본 FID는 편향이 크고, 얼굴 전체 분포가 좋아 보여도 특정 사용자의 턱이 망가진 것을 잡지 못합니다. [확신도: 높음 — [소표본 FID 편향 연구](https://openaccess.thecvf.com/content_CVPR_2020/html/Chong_Effectively_Unbiased_FID_and_Inception_Score_and_Where_to_Find_CVPR_2020_paper.html)]

## 지금 당장 고쳐야 할 오류·낭비

1. **256→1536 일반화를 피부 모공 재현 근거로 해석하는 것.** LaMa의 증거 범위를 넘습니다. [높음]
2. **수염 전체를 binary hole로 지우는 것.** 남아 있는 턱 음영·피부 구조까지 버립니다. [높음]
3. **마스크 오류와 인페인팅 오류를 한 평가에 섞는 것.** oracle-mask ablation이 먼저입니다. [높음]
4. **“합성 페어에 GT가 있으니 실수염 ambiguity도 해결된다”는 가정.** 틀렸습니다. [높음]
5. **Qwen 편집 결과 전체를 학습 입력으로 사용하는 것.** 수염 밖 미세 변화와 생성기 fingerprint가 누출됩니다. [높음]
6. **K-FACE 프레임 수를 독립 샘플 수로 세는 것.** identity와 촬영 조건 반복을 분리해야 합니다. [높음]
7. **AnimeLaMa/GLaMa를 수백 장 얼굴 fine-tune의 성공 선례로 제시하는 것.** 직접 근거가 아닙니다. [높음]
8. **GFPGAN/CodeFormer를 제품 후처리로 붙이는 것.** 정체성 보존 목표와 충돌하고 라이선스도 걸립니다. [높음]
9. **고정 seed만으로 결정론 계약을 충족한다고 보는 것.** 배포 스택 전체 고정과 hash 회귀 테스트가 필요합니다. [높음]
10. **현재 8장을 계속 sealed checkpoint로 쓰는 것.** 결과를 본 순간 future model selection용 dev set입니다. [높음]
11. **통과작이 없는 8/8 일치로 자동 게이트가 검증됐다고 보는 것.** 단일 클래스 일치일 뿐입니다. [높음]
12. **1000장 수집부터 시작하는 것.** 먼저 100–200개 합성 페어와 20–50개 실제 앵커로 sim-to-real 가능성을 반증해야 합니다. [높음]
13. **“레이저 제모 결과 예측”으로 표현하는 것.** 현재 모델은 치료 반응·횟수·색소 변화를 예측하지 않고 완전 무수염 모습을 합성합니다. 제품 문구를 “무수염 모습 시뮬레이션”으로 제한해야 합니다. [높음]

최종적으로는 **A-lite를 하루짜리 falsification 실험으로만 수행하고, 곧바로 C+B-hybrid로 이동**하는 것이 정보량/주가 가장 높습니다. A가 놀랍게 잘되면 유지하면 되지만, 성공 가능성을 전제로 데이터와 GPU 시간을 선투자할 근거는 현재 없습니다.
