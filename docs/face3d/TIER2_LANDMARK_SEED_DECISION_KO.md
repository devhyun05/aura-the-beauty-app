# Face3D Tier-2 랜드마크 시드 결정 — malar / alare / nasion + G1 Pogonion

- 결정일: 2026-07-14
- Pogonion 동반 결정 반영일: 2026-07-15
- 대상 topology: ARKit 고정 face mesh, 1220 vertices
- 대상 그룹: `malarApexLeftIndices`, `malarApexRightIndices`, `alarLeftIndices`, `alarRightIndices`, `nasionIndices`; 동반 G1 결정: `chinIndices`
- Tier-2 상태: **정의·사람 검수 도구 준비 / 현재 자동 후보는 기각 / 두 reviewer 합의·최종 index 목록·지표 노출은 아직 미승인**
- Pogonion 계약: **`[31..35]` 고정 patch / 패치 내 전방 max / 동일 winner E-line endpoint / Menton 미사용**
- 변경 범위: 2026-07-14 Tier-2 조사에서는 결정 문서와 검수 도구·검증 core·테스트·검수 가이드를 추가/보강했고 Unity evaluator, live semantic map, 캡처 원본, approval pipeline은 수정하지 않았다(`scripts/face3d/build-tier2-seed-review.mjs:209-1068`, `scripts/face3d/tier2-seed-review-core.mjs:312-898`, `scripts/face3d/test-tier2-seed-review.mjs:1-614`, `docs/face3d/TIER2_SEED_REVIEW_GUIDE_KO.md:1-121`). 2026-07-15 Pogonion 동반 결정은 evaluator 계약과 live semantic map의 `chinIndices`를 갱신하며 캡처 원본과 Tier-2 승인 결과는 바꾸지 않는다.

### 쉽게 말하면

이 결정은 “모든 사람의 정확한 광대뼈 한 점을 임상적으로 찾아낸다”는 계획이 아니다. ARKit mesh 위에 **작고 고정된 측정 창(patch)**을 먼저 정하고, 그 창이 여러 얼굴·촬영 자세에서도 같은 해부 영역을 덮는지 확인한 뒤, 광대와 콧볼에 필요한 사람별 극값은 창 안에서만 찾는 방식이다. 따라서 제품 오너가 정답 vertex 하나를 알아서 찍을 필요도 없고, 육안으로 보이는 봉우리 하나를 곧바로 의학적 landmark라고 가정하지도 않는다.

- 광대는 얼굴 폭이 아니라 앞광대 영역의 상대적 전방 돌출을 잰다.
- 콧볼은 콧방울 양쪽의 가장 바깥점을 잡아 상대 폭을 잰다.
- nasion은 제품 오너가 확인한 코뿌리 중앙 vertex `15`를 고정 proxy로 쓴다.
- reviewer의 허용 해부 영역(ROI)과 target은 해부 판정 증거라 g1과 겹쳐도 된다. live map에 들어갈 고정 runtime patch만 g1-disjoint여야 한다. ROI 안에서 안전한 free patch를 일관되게 만들 수 없으면 증거는 보존하고 runtime patch만 `unsupported/null`로 남긴다.

여기서 “상대값”은 우선 각 거리·돌출을 같은 얼굴의 `faceScale`로 나눠 기기 거리와 얼굴 크기 영향을 줄인 값이다. 이것만으로 “평균보다 광대가 많이 나왔다”거나 “콧볼이 상위 몇 %로 넓다”는 뜻은 아니다. 그런 표현은 시드·반복성 검증 뒤 별도의 모집단 기준분포가 있어야 한다.

## 결론 요약

| 그룹 | 결정 | 표준·제품 의미 | 런타임 대표점/값 | 현재 구현과의 관계 |
|---|---|---|---|---|
| `malarApexLeft/Right` | **A** | soft-tissue maxillozygion 인접 영역의 **전방 malar prominence proxy** | 고정 해부 패치 안에서 midface 기준면 전방 투영 `max` | 기존 evaluator 식을 유지할 수 있다. |
| `alarLeft/Right` | **A** | Farkas 계열 `alare(al)`: nasal ala의 최외측점 | 고정 ala 패치 안에서 face-local 좌우축의 외측 극값을 각각 선택 | 현재 patch centroid 식은 표준과 충돌하므로 evaluator 변경이 선행돼야 한다. |
| `nasion` | **C** | frontonasal suture 위의 **soft-tissue nasion proxy** | 중앙 self-mirror vertex `15` 한 점 고정; 극값 탐색 없음 | 한 점 centroid는 그 점 자체다. deepest concavity는 사용하지 않는다. |
| `chinIndices` (G1) | **A** | 옆에서 가장 앞으로 나온 중앙 턱 볼록면의 **soft-tissue Pogonion proxy** | 고정 connected patch `[31,32,33,34,35]` 안에서 방향이 고정된 midface plane signed projection `max` | winner를 `chinProjection`과 두 E-line 지표의 동일한 턱 endpoint로 사용한다. Menton은 별도다. |

Tier-2 다섯 그룹 모두 **B(얼굴 전체 또는 화면 밴드에서 사람별 무제약 극값)**는 기각한다. ARKit의 고정 topology는 같은 index/UV 슬롯을 재사용할 근거는 되지만, 한 index가 모든 사람에서 임상적 landmark와 정확히 일치한다는 보장은 아니다. 따라서 해부 패치를 먼저 고정하고, 필요한 극값은 그 패치 안에서만 구한다. Pogonion도 얼굴 전체를 탐색하지 않고 고정 `[31..35]` patch 안에서만 winner를 고른다.

광대 지표의 제품 해석은 다음처럼 동결한다.

> `malarProjectionLeft/Right`는 `zy-zy` 옆광대 폭이 아니며, “45도 광대의 크기” 전체도 아니다. 외측 안와 아래 maxillozygomatic/malar 영역에서 **얼마나 앞으로 돌출됐는지의 1차원 성분**이다. superior three-quarter(통상 45도) view는 위치를 찾는 관찰 방향일 뿐 별도 지표가 아니다.

`zy-zy` 폭이 필요하면 별도 `zygionLeft/Right` 그룹과 midsagittal lateral-distance 공식을 새로 설계해야 한다. 현재 `malarProjection`을 재명명 없이 재사용하면 안 된다.

---

## 1. 그룹별 결정

### 1.1 `malarApexLeft/Right`: A — 고정 maxillozygomatic 해부 패치 + 패치 내 전방 max

채택 정의는 정식 골성 `maxillozygion(mz)` 자체가 아니라 **그 표면 투영 영역을 이용한 anterior malar prominence proxy**다. 정식 mz는 촉진으로 maxillozygomatic suture의 가장 전방 돌출점을 찾는 landmark이므로, 골성 봉합선이 보이지 않는 ARKit 표면 mesh에서 동일성을 단정할 수 없다. 다만 현재 지표가 재는 방향과 가장 가까운 표준 해부 개념은 zygion보다 mz다.

런타임 패치 `P_malar,s`에 대해 다음 값을 사용한다.

```text
p(v) = dot(v - midfaceOrigin, midfaceNormal) / faceScale
malarProjection_s = max { p(v) | v in P_malar,s }
```

이 식은 이미 `Face3DMetricEvaluator.cs`가 구현한 계약과 같다. `faceScale`은 좌우 midface centroid 거리이고, nose 방향으로 plane normal을 정렬한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:57-90`). malar는 그룹 안 vertex별 전방 투영 최댓값을 취한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:209-221,337-364`).

기각하는 대안:

- zygion 또는 얼굴 실루엣 lateral max: `zy-zy` 폭을 재며 현재 전방 공식과 구성개념이 다르다.
- 화면 밴드 전체의 전방 max: 코 쪽으로 끌리고 pose·밴드 경계에 따라 다른 해부 영역으로 점프한다.
- 한 개 고정 index: coarse mesh에서 정확한 임상 mz 대응을 과대 주장한다.

### 1.2 `alarLeft/Right`: A — 고정 ala 패치 + 패치 내 face-local lateral extreme

`alare(al)`는 nasal ala의 최외측점이다. 따라서 그룹은 콧볼의 convex alar lobule을 덮는 작은 고정 topology 패치로 정의하고, 런타임에는 화면 x가 아니라 face-local midsagittal 좌우축으로 외측점을 고른다.

`midsagittalNormal = normalize(midfaceRight - midfaceLeft)`라 두고 다음처럼 계산한다.

```text
q(v) = dot(v - midfaceOrigin, midsagittalNormal) / faceScale

alareLeft  = argmax { q(v)  | v in P_alar,Left  }  # 피사체 해부학적 왼쪽
alareRight = argmax { -q(v) | v in P_alar,Right }  # 피사체 해부학적 오른쪽
alarWidth  = distance(alareLeft, alareRight) / faceScale
```

동률은 비교 함수 안에서 pairwise epsilon을 쓰지 않고 다음처럼 결정한다. side별 외측 score의 전역 최댓값을 `M`이라 하고 `{v | score(v) >= M - 1e-6}`를 먼저 만든 뒤, 그 집합에서 가장 작은 vertex index를 택한다. runtime map에 별도 core 필드가 없으므로 tie-break가 authoring 메타데이터에 의존하지 않게 한다.

현재 evaluator는 각 alar 그룹의 centroid 사이 거리를 사용한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:203-207`; 계약도 `docs/face3d/TIER2_METRIC_CONTRACT.md:45-51`). 이 식은 `alare`의 “최외측점” 정의와 일치하지 않는다. 현재 17개 자동 3점 후보를 그대로 대입해 비교하면 lateral-extreme 폭이 centroid 폭보다 17/17 크게 나왔고, 차이는 `0.0103–0.1092 faceScale`, 중앙값 `0.0705`였다. 현재 neutral faceScale 약 55.8 mm를 적용하면 중앙값 약 3.9 mm다. 후보의 해부학적 정답 여부와 별개로 centroid가 폭을 안쪽으로 축소하는 구조적 효과다.

따라서 **evaluator를 위 argmax pair 식으로 바꾸기 전에는 결과를 `al-al width` 또는 표준 alar width로 노출하지 않는다.** 코드를 유지해야 한다면 명칭을 `alarPatchCentroidWidthProxy`로 낮춰야 하며, 그것은 본 결정의 표준 alare 지표가 아니다.

### 1.3 `nasion`: C — 중앙 vertex `15` 고정 proxy

Farkas/FaceBase 계열 nasion은 정중선에서 frontonasal suture 바로 위의 연조직점이다. 3D 표면에서는 양쪽 upper palpebral sulcus를 잇는 높이와 profile을 함께 보며 찾는다. 코-이마 각도의 deepest midline point는 `sellion`이고 nasion보다 조금 아래·뒤일 수 있다.

ARKit mesh에는 봉합선이나 촉진 정보가 없으므로 `nasionIndices`는 제품 오너가 2D overlay에서 코뿌리 중앙으로 확인한 **고정 vertex `15` 한 점**으로 정의한다. 좌우 보조점 `347/780`의 centroid보다 실제 중앙 vertex를 직접 쓰는 편이 이 제품의 비임상적 상대 지표에 더 명확하다는 후속 검수 결정을 반영한다.

```text
nasionProxy = vertex[15] = centroid({15})
noseLength = distance(nasionProxy, noseTipCentroid) / faceScale
```

현재 evaluator의 nasion centroid 및 nose-length 식과 일치한다. 한 점 배열의 centroid는 vertex `15` 자체다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:176-180`). depth minimum, curvature maximum, 화면상 “가장 위”를 다시 찾지 않는다.

vertex `15`는 기존 upper-midface g1에도 속하므로 nasion에 한해 controlled overlap을 명시적으로 허용한다. 정확한 중앙점을 버리고 옆의 free vertex로 이동시키지 않는다.

### 1.4 `chinIndices`: A — 고정 중앙 턱 표면 patch + 패치 내 전방 max

연조직 Pogonion은 턱의 최하단이 아니라 측면에서 가장 앞으로 나온 중앙 턱 볼록면이다.
따라서 `chinIndices`는 단일 대표점이나 centroid가 아니라 topology가 고정된 connected patch
`[34,35,975]`로 둔다. `31..33`은 아랫입술 아래의 labiomental fold 쪽이므로 Pogonion
탐색 영역에서 제외한다. live asset도 이 배열과 Menton 배열
`[913,914,1047]`을 별도 필드로 보존한다(`apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json:20-30`).
런타임에는 midface plane normal을 코끝 쪽이 양수가 되도록 정렬한 뒤 다음 winner를 고른다.

```text
p(v) = dot(v - midfaceOrigin, midfaceNormal) / faceScale
pogonion = argmax { p(v) | v in chinIndices }
chinProjection = p(pogonion)
E-line = segment(noseTipCentroid, pogonion)
```

두 입술 E-line 거리도 별도의 chin centroid를 다시 만들지 않고 같은 프레임의
`pogonion` winner를 공유한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:104-163`).
projection 차이가 `GeometryEpsilon` 이내인 동률은 더 작은 vertex index를 택해 결정적으로
처리한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:365-415`).
`chinBottomIndices=[913,914,1047]`는 턱 최하단 Menton으로 그대로 유지하며, `chinProjection`과 현재 E-line
계산에는 사용하지 않는다.

---

## 2. 근거

### 2.1 표준 해부학 및 문헌

#### 광대: zygion과 maxillozygion은 다른 형질이다

- Farkas 계열의 `zygion(zy)`은 zygomatic arch의 가장 외측점이며 `zy-zy`는 최대 bizygomatic width다([3D Facial Norms Database anthropometric supplement](https://stacks.cdc.gov/view/cdc/39061/cdc_39061_DS2.pdf)). 반면 Nechala, Mahoney, Farkas(1998)는 `maxillozygion(mz)`을 외측 안와 1/3 아래 maxillozygomatic suture에서 가장 전방으로 돌출한 점으로 제안했다. 비슷한 `zy-zy` 폭을 가진 집단에서도 mz의 수평 위치가 달랐다는 결과는 `zy-zy`만으로 mz 위치를 정할 수 없음을 보인다. 다만 이 연구가 전방 projection 크기의 집단 차이를 직접 검정한 것은 아니다. 두 지표를 분리하는 일차 근거는 각각 “transverse extreme”과 “anterior maxillozygomatic contour”라는 landmark 정의 차이다. [Nechala et al., 1998, *Maxillozygional anthropometric landmark*](https://pubmed.ncbi.nlm.nih.gov/9788221/).
- Moubayed et al.(2012)은 superior three-quarter view에서 외측 안와 아래의 가장 돌출한 zygomatic 부위를 찾고 axial/coronal/sagittal view로 전방 위치를 확인했다. 이는 현재 metric의 해부 영역 선택에는 맞지만, 그 연구는 3D-CT와 soft-tissue mz를 사용했으므로 ARKit coarse surface에 동일 정확도를 이전할 수는 없다. [Moubayed et al., 2012, *A Novel Technique for Malar Eminence Evaluation Using 3-Dimensional Computed Tomography*](https://doi.org/10.1001/archfacial.2012.510).
- Nechala et al.(2000)은 여러 기하학적 malar point 구성법이 촉진한 mz와 서로 다른 위치를 낼 수 있음을 보였다. 즉 “얼굴의 어떤 최고점”을 mz로 자동 등치하면 안 된다. [Nechala et al., 2000, *Comparison of Techniques Used to Locate the Malar Eminence*](https://journals.sagepub.com/doi/10.1177/229255030000800102).

따라서 본 프로젝트는 mz를 임상적으로 검출했다고 주장하지 않고, **mz 인접 해부 패치 안의 ARKit anterior projection proxy**라고 제한한다.

#### alare와 nasion

- FaceBase 3D Facial Norms 프로토콜은 `alare`를 nasal ala의 lateral-most projection으로 정의한다. convex surface라 3D에서 찾기 어렵고, subnasal view에서 전후 위치, frontal view에서 상하 위치를 반복 확인하도록 한다. 같은 문서의 `alar curvature point`는 ala-cheek crease의 별도 landmark다. [FaceBase, *3D Facial Norms Technical Notes: Alare*](https://www.facebase.org/resources/human/facial_norms/notes/).
- 같은 프로토콜은 nasion을 midline에서 nasofrontal suture 바로 위의 점으로 두고, 3D surface에서는 upper palpebral sulci 높이를 이용한다. deepest nasofrontal angle인 sellion과 혼동하지 말라고 명시한다. [FaceBase, *3D Facial Norms Technical Notes: Nasion*](https://www.facebase.org/resources/human/facial_norms/notes/).
- 반면 Wang, Wusiman, Mi(2021) 등 일부 CBCT·cephalometric 연구는 soft-tissue nasion을 glabella와 pronasale 사이 정중선의 최대 오목점으로 정의한다. 이는 FaceBase가 sellion으로 구분하는 deepest nasofrontal-angle point와 개념적으로 겹칠 수 있다. 본 프로젝트는 `nasion` 필드를 유지하므로 FaceBase의 suture-overlying 정의를 채택하고, depth minimum이 필요하면 별도 `sellion` 필드로 분리한다. [Wang et al., 2021, *Cone-beam computed tomography analysis of the nasal morphology among Uyghur nationality adults in Xinjiang for forensic reconstruction*](https://www.sciencedirect.com/science/article/pii/S2214854X21000297).

#### 곡률 기반 C의 위치

Katina et al.(2016)은 orientation 의존성을 줄이기 위해 alare를 alar curve의 geodesic-curvature maximum 등으로 재정의했다. 4명·4관찰자(방법별 2명)의 작은 검증에서 **전체 landmarks·3축을 평균한** observer random-effect SD는 곡률 정의 `0.361 mm`, 전통 orientation 정의 `0.553 mm`였다. 논문이 별도로 제시한 전체 landmark 재현성 요약 `1.27 mm` 대 `1.51 mm`는 subject를 제외한 observer/day/image/repeat 변동을 합성한 3D 값이지 alare 고유 수치나 observer SD 자체가 아니다. alare는 곡률 정의에서 observer variation이 감소하는 방향을 보였지만 alare-specific SD 숫자는 따로 제시되지 않았고 관찰자 수도 적다. 또한 새 곡률점은 전통 landmark와 다른 해부 위치가 될 수 있다. 따라서 곡률은 patch 경계 제안, plateau/tie 경고, QA에만 쓰고 표준 alare를 대체하지 않는다. [Katina et al., 2016, *The definitions of three-dimensional landmarks on the human face*](https://eprints.gla.ac.uk/111162/1/111162.pdf).

#### 3D landmark 재현성은 landmark·축·관찰자에 따라 다르다

| 연구 | 표본·방법 | 핵심 결과 | 본 결정에 주는 의미 |
|---|---|---|---|
| Toma et al., 2009 | 평균 15.5세 British-Caucasian 청소년 30명, 21 landmarks, 2 examiners, 2주 간격 | 좌표 오차가 1 mm를 넘은 비율은 intra 11%, inter 17%; landmark 식별 재현성 범위는 `0.39–1.49 mm`였다. 논문은 accuracy라는 용어를 쓰지만 외부 gold standard 비교값은 아니다. | 단일 관찰자·단일 화면 클릭을 gold standard로 보지 않는다. [논문](https://pubmed.ncbi.nlm.nih.gov/19154273/) |
| Baysal et al., 2016 | 34 images, 19 landmarks, 2 examiners, 4주 간격 | 모든 landmark의 재현 오차는 1 mm 미만이었지만 zygion 재현성이 가장 낮았고 zygion·pogonion·nasion·glabella가 가장 큰 intraexaminer variability를 보였다. | 넓고 완만한 광대와 nasal root는 2인 검토와 3D 오차가 필요하다. [논문](https://pmc.ncbi.nlm.nih.gov/articles/PMC8597352/) |
| Li et al., 2022 | European Caucasian 80명 + Chinese 80명, 46 landmarks, 2 raters | 1 mm 이내 좌표는 intra `87.0%`, inter `73.2%`; left zygion 재현성이 가장 낮았고 집단 간 재현성 차이는 nasal tip·alare·nostril 주변에 집중됐다. | 현재 3명의 결과를 모집단 일반화하지 않는다. [논문](https://pmc.ncbi.nlm.nih.gov/articles/PMC9090709/) |
| Al-Baker et al., 2023 | 자동 3D landmarking 14개 연구 systematic review | manual 대비 평균 차이 0.67–4.73 mm; 연구 이질성·bias가 커 개별 자동 landmark를 임상 등급으로 보기 어려움 | 무제약 자동 B보다 topology-constrained patch + 사람 승인을 택한다. [논문](https://pubmed.ncbi.nlm.nih.gov/37042196/) |

문헌 결과가 낙관적·비관적으로 갈리는 이유는 scanner, landmark 정의, 좌표축, rater training, ICC와 절대거리의 차이 때문이다. 본 검증은 ICC 하나가 아니라 **해부학 pass, normalized 3D 거리, pose range, patch boundary hit, 최종 repeatability**를 함께 본다.

### 2.2 ARKit topology가 보장하는 것과 보장하지 않는 것

Apple은 `ARFaceGeometry` 인스턴스 사이에서 face mesh topology와 triangle index 구조가 일정하다고 설명하며, generic model의 vertex 위치가 사람의 크기·형상·표정에 맞게 변한다고 설명한다. 이는 고정 index/UV patch의 플랫폼 근거다. 다만 geometry는 공식 문서상 **coarse triangle mesh**이고, 특정 vertex를 alare·nasion·mz로 보증하지 않는다. [Apple, `ARFaceGeometry.triangleCount`](https://developer.apple.com/documentation/arkit/arfacegeometry/trianglecount), [Apple, `ARFaceAnchor.geometry`](https://developer.apple.com/documentation/arkit/arfaceanchor/geometry).

이 repo의 fingerprint도 vertex 좌표가 아니라 vertex/index/UV count와 index/UV hash를 묶는다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DTopologyFingerprint.cs:54-84,168-181`). 따라서 fingerprint 일치는 topology 슬롯 대응의 증거이지 임상적 semantic correspondence의 증거가 아니다.

live g1 맵은 1220 vertices, 6912 indices, 1220 UV 및 fingerprint `57bdaf...f3f`를 동결한다(`apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json:2-13`). Pogonion 갱신 후 현재 `mapId`는 `arkit-face3d-g1-reviewed-v2-pogonion`이다. 기존 12개 g1 그룹은 `apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json:15-174`에 있고, Tier-2 그룹은 존재할 때 최소 개수·범위·중복 및 g1/Tier-2 상호 disjoint를 통과해야 한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs:323-334,391-470`).

### 2.3 현재 다른 부위의 측정 체계와 Tier-2가 따라야 할 계약

현재 g1도 “사람마다 얼굴 전체에서 최고점을 다시 찾는” 방식이 아니다. live map은 12개 의미 그룹마다 고정 vertex index 배열을 저장한다(`apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json:15-174`). nose tip·입술·기준면 그룹은 centroid를 쓰지만, `chinIndices`는 고정 connected patch `[31,32,33,34,35]` 안에서만 oriented midface plane signed projection max를 찾는다. `chinBottomIndices`는 이 evaluator 단계에서 사용하지 않는다. 후보 생성 파이프라인도 검수된 고정 seed 또는 triangle-adjacency connected patch를 사용하고, 양측 reference patch에는 UV mutual-nearest mirror pair를 함께 성장시킨다(`scripts/face3d/semantic-candidate-core.mjs:315-327,364-451,493-641`). 코드는 후보 입력을 neutral 캡처로 강제하며, warning으로 yaw 캡처에는 같은 index를 재투영해 사람이 확인하라고 명시한다(`scripts/face3d/semantic-candidate-core.mjs:792-824,865-870`). 즉 Tier-2의 A/C와 Pogonion 결정은 기존 시스템의 고정-topology + 사람 overlay 승인 철학을 연장하고, 얼굴 전체의 무제약 극값 B는 도입하지 않는다.

기존 수식은 다음 구조다.

- 좌우 midface centroid 거리로 `faceScale`을 만들고, 세 centroid로 midface 기준면을 만든 뒤 코끝 쪽을 양의 전방으로 고정한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:57-90`).
- `noseTipProjection`과 `centralProjectionScore`는 그 기준면에 대한 부호 투영을 `faceScale`로 나눈다. `chinProjection`은 `chinIndices` patch에서 그 부호 투영이 최대인 winner의 값이며, 입술 두 지표는 nose-tip과 **같은 winner**를 잇는 E-line에 대한 부호 거리다.
- 한 세션은 기본 3초 동안 30 valid frame을 목표로 하고 최소 20개를 요구한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DProfileCollector.cs:7-20,242-307`). 각 지표는 median과 MAD를 이용해 `3×MAD` 밖 값을 제거하고 inlier median·MAD·coverage로 confidence를 만든다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DProfileCollector.cs:401-462`).
- 수집 전에는 yaw `5°`, pitch `7°`, roll `5°`, neutral-expression activation `0.5`, 연속 stable gate 5 frame을 적용한다(`apps/unity/MakeupAR/Assets/Scripts/Face3DSessionController.cs:18-30,150,357-425`). 이는 자세·표정 노이즈를 줄이지만 잘못 정의된 해부 patch를 고쳐 주지는 않는다.

현재 Tier-2 공식도 이미 분명하다. 한 점 nasion 배열의 centroid(즉 vertex `15`)–nose-tip 거리가 `noseLength`, alar 좌우 patch centroid 거리가 `alarWidth`, malar patch의 vertex별 전방 투영 max가 `malarProjectionLeft/Right`다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:176-180,203-221`). 본 결정은 nasion 계산 구조와 malar max는 유지하고, 표준 `alare` 의미와 충돌하는 alar centroid만 외측 argmax pair로 바꾼다.

현재 모바일 표시 경로는 `metric.value`를 소수 3자리의 `normalized` scalar로 그대로 보여 주며 “기기 거리와 얼굴 크기 영향을 줄인 상대값”이라고 설명한다. 이 경로에는 인구집단 percentile이나 “넓다/좁다” 보정이 적용되지 않는다(`apps/mobile/src/features/face-3d/components/Face3DMetricGrid.tsx:27-60`; `apps/mobile/src/features/face-3d/types.ts:42-48`). 그러므로 **landmark 정의**, **동일인 반복성**, **사람 사이 구분력**, **사용자 해석용 기준분포**를 서로 다른 승인 단계로 유지한다.

### 2.4 좌우 기준: Tier-2는 피사체의 해부학적 `Left/Right`로 고정한다

Apple 원시 좌표 설명만으로 이 검수 프레임의 화면 좌우를 결정하지 않는다. 현재 export의 `isMirrored:false`는 카메라 표시 변환을 판별한 값이 아니라 하드코딩된 값이며, 같은 payload도 좌표공간 승인을 `pending_projected_mesh_overlay_review`로 남긴다(`apps/unity/MakeupAR/Assets/Scripts/E7SynchronizedCaptureExporter.cs:698-723`). 실제 전면카메라 프레임은 제품 오너가 자신의 얼굴 비대칭을 기준으로 거울 표시임을 확인했고, 이 corpus에서는 local 양수가 화면 오른쪽으로 투영된다. 따라서 이 authoring 도구의 해부 좌우 계약은 거울 화면과 실제 투영을 함께 근거로 고정한다.

실제 기준 캡처 `...9136465`에서 계산한 결과는 다음과 같다.

| 기존 그룹 | local x centroid | screen x centroid |
|---|---:|---:|
| `midfaceReferenceLeftIndices` | -0.027825 m | 464.31 px |
| `midfaceReferenceRightIndices` | +0.027808 m | 601.29 px |

즉 기존 g1 key의 `Left/Right`는 화면/맵 방향이고, `midsagittalNormal`의 양수 방향인 기존 map-Right가 피사체 해부학적 left다. evaluator도 normal을 `midfaceRight-midfaceLeft`로 만들며 양수가 map-Right라고 명시한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs:164-167`); Tier-2 계약은 이 양수를 피사체 왼쪽이라고 설명한다(`docs/face3d/TIER2_METRIC_CONTRACT.md:39-49`). 두 진술은 서로 일관된다.

이전 Tier-2 authoring 도구는 하드코딩된 `isMirrored:false`를 신뢰해 좌우를 반대로 붙였다. 현재 도구와 검증 core는 거울 프레임에서의 피사체 자신의 side를 강제한다(`scripts/face3d/build-tier2-seed-review.mjs:242-247,843-868`; `scripts/face3d/tier2-seed-review-core.mjs:25-63,480-492,739-748`; `scripts/face3d/test-tier2-seed-review.mjs:137-153,293-310`).

```text
anatomical Left  = local q < 0 = mirrored selfie screen left
anatomical Right = local q > 0 = mirrored selfie screen right
```

따라서 교정 전 자동 JSON·기존 index page는 좌우 승인 근거로 재사용하지 않고, 현 도구에서 해부 좌우 validation을 다시 통과시킨다.

### 2.5 17개 캡처 정량 감사

#### 데이터 품질과 구성

실제 `artifacts/face3d/device-captures/pair_*/arface_export.json` 17개를 전수 파싱했다.

- shot 구성: neutral 9, yawLeft 4, yawRight 4.
- 17/17 모두 local/world/screen vertices 1220, UV 1220, triangle indices 6912, 동일 fingerprint `57bdaf...f3f`.
- 17/17 모두 `display.isMirrored=false`다. blend shape도 17/17에서 ARKit provider, `available=true`, 52개, `UnqualifiedSuccess`로 기록됐다. export의 12개 `keySignals` 중 capture별 최댓값은 전체에서 최대 `0.143`으로 현재 neutral activation gate `0.5` 아래였다. 단일 payload의 필드 구조 예시는 `artifacts/face3d/device-captures/pair_face3d_semantic_1783799136465/arface_export.json:1`에 있으며 17개 집계는 아래 재현 스크립트로 계산했다. 이는 캡처 메타데이터의 표정 신호 상태 확인이지 landmark 해부 정확도의 증거는 아니다.
- 승인 보드가 서로 다른 피험자로 묶은 핵심 pose set은 3명 × neutral/yawLeft/yawRight = 9개다. 최신 g1-v7 manifest의 subject-01은 `...1550595/...1552908/...1555305`, subject-02는 `...9298585/...9315132/...9318477`, subject-03은 `...9381863/...9388370/...9393013`이다(`artifacts/face3d/semantic-validation/g1-v7-three-subject-review/three_subject_review_summary.json:33-75,77-118,120-161`).
- 나머지 8개는 주로 같은 사람 neutral 반복 또는 legacy sequence다. subject-01 neutral consensus pool만 4개임이 기록돼 있다(`artifacts/face3d/semantic-consensus/subject-01-neutral-only-v7/ARKitFaceSemanticMapV1.consensus.candidate.json:186-198`). 따라서 17개를 17명 표본으로 해석할 수 없다.
- 17개 payload는 `coordinateSpaceValidated:false`, `pending_projected_mesh_overlay_review` 상태다. exporter도 이 값을 명시적으로 쓴다(`apps/unity/MakeupAR/Assets/Scripts/E7SynchronizedCaptureExporter.cs:628-663`). topology 수치 분석은 가능하지만, frame 위 해부학 overlay는 별도 registration 확인을 합격 전제에 둔다.

조사 시작 시의 legacy screen-band 수치는 `/tmp/tier2-seed-analysis/analyze_tier2.py`가 당시 공식을 독립 재구현해 17개에 계산한 값이다. 그 결과는 repo에 보존된 3개 legacy suggestions의 대상 5그룹 배열과 모두 일치했다. 현재 v2 authoring 생성기는 해부 좌우·개수·blind workflow가 달라 같은 legacy 배열을 재생성하지 않으며, v2 결과는 아래 별도 batch audit로 검증한다. 예를 들어 다음 repo 산출물이 사용자 관측을 그대로 보여준다.

- `...897441`: malar L `[154,153,380,379,381]`, alar R `[760,727,729]`, nasion empty (`artifacts/face3d/tier2-seed-review/pair_face3d_semantic_1783798897441.suggestions.json:4-33`).
- `...9136465`: malar L `[42,41,1141,1140,1142]`, alar R `[744,866,867]`, nasion empty (`artifacts/face3d/tier2-seed-review/pair_face3d_semantic_1783799136465.suggestions.json:4-33`).
- `...9298585`: malar L `[151,152,154,153,455]`, alar R `[744,866,867]`, nasion `[387]` 하나뿐이다(`artifacts/face3d/tier2-seed-review/pair_face3d_semantic_1783839298585.suggestions.json:4-35`).

#### 자동 후보의 캡처 간 일관성

`top`은 malar의 전방 max 또는 alar의 lateral max index다. `mean J`는 도구가 제안한 index 집합의 모든 capture pair 평균 Jaccard다.

캡처 간 `point distance`는 world 좌표나 화면 좌표를 직접 빼지 않는다. 각 capture `c`에서 midface origin `o_c`, 정규화 lateral/up/anterior 축 `l_c,u_c,n_c`, `faceScale s_c`를 다시 만들고 다음 face-local normalized 좌표를 비교했다.

```text
x_c(v) = (
  dot(v-o_c,l_c)/s_c,
  dot(v-o_c,u_c)/s_c,
  dot(v-o_c,n_c)/s_c
)
d_ab(v_a,v_b) = ||x_a(v_a) - x_b(v_b)||_2
```

따라서 아래 `distance/faceScale` 표기는 “raw local distance를 한 capture의 scale로만 나눈 값”이 아니라, 양쪽 capture를 각각 정렬·정규화한 뒤의 무차원 거리다.

| 그룹 | 전체 17: top 종류 | 전체 mean J | neutral 9: top 종류 | neutral mean J |
|---|---:|---:|---:|---:|
| malar anatomical R에 해당하는 현 screen-L | 4 | 0.299 | 3 | 0.431 |
| malar anatomical L에 해당하는 현 screen-R | 2 | 0.525 | 1 | 0.769 |
| alar anatomical R에 해당하는 현 screen-L | 6 | 0.316 | 2 | 0.431 |
| alar anatomical L에 해당하는 현 screen-R | 4 | 0.607 | 2 | 0.778 |
| nasion | 13/17 empty | coverage 부족 | 7/9 empty | coverage 부족 |

전체 Jaccard는 사람을 섞으므로 landmark 재현성 통계가 아니라 **현재 자동 선택기가 같은 topology 영역을 되찾는지의 진단**이다. 특히 empty-empty를 1로 세면 nasion Jaccard가 부풀기 때문에 nasion은 coverage만 본다.

같은 subject-01 neutral 4회, 6개 pair 비교에서도 screen-L malar는 mean J `0.278`, 4/6이 J=0, top 공간 점프 최대 `0.552 faceScale`; screen-L alar는 mean J `0.500`, 3/6이 J=0, 최대 `0.249 faceScale`였다. 반대편의 안정 사례는 malar 최대 `0.005`, alar 최대 `0.009`였다. 즉 서로 다른 사람을 섞은 것만으로 설명되지 않으며, 화면 밴드의 좌우 비대칭도 드러난다.

공식 3피험자 pose triplet의 9개 within-person pose pair 결과는 다음과 같다.

| 현 도구 그룹 | mean J | J=0 | top exact | top 위치 평균 거리 / faceScale |
|---|---:|---:|---:|---:|
| malar screen-L | 0.287 | 2/9 | 7/9 | 0.125 |
| malar screen-R | 0.409 | 0/9 | 9/9 | 0.003 |
| alar screen-L | 0.467 | 4/9 | 4/9 | 0.125 |
| alar screen-R | 0.556 | 4/9 | 5/9 | 0.116 |
| nasion | coverage 부족 | — | 1/2 유효 pair | 0.054 |

인접 vertex 사이의 top 교체만으로 metric 불안정이라고 단정하지는 않는다. 실제로 잘못된 위치가 비슷한 projection 값을 낼 수도 있다. 그래서 최종 gate는 index 일치가 아니라 **해부 위치, patch boundary, point distance, metric range**를 분리한다.

#### 구조적 편향과 경계 민감도

현재 도구의 **자동 suggestion 보조 레이어**는 screen anchor/band를 만든 뒤 alar는 face-local lateral max, malar는 local anterior max를 고른다. nasion target/radius는 `scripts/face3d/build-tier2-seed-review.mjs:233-269`, alar band와 lateral max는 `scripts/face3d/build-tier2-seed-review.mjs:271-283,346-399`, malar screen band와 projection max는 `scripts/face3d/build-tier2-seed-review.mjs:285-300,402-468`다. 제안 이웃도 mesh graph가 아니라 2D pixel 근접 순이다(`scripts/face3d/build-tier2-seed-review.mjs:368-371,436-439`). 이 로직은 runtime patch가 아니라 blind 해부 표시 뒤에만 공개되는 탐색 보조다.

17개에서 실제 계산한 결과:

- malar band 안에서 anterior projection과 정중선으로부터의 lateral fraction 상관은 17/17 캡처, 양쪽 모두 음수였다. 평균 Pearson `r`은 현 screen-L `-0.673`, screen-R `-0.740`이다. 전방 max가 통계적으로 코 쪽에 끌린다.
- malar inner fraction을 `0.35..0.55`, step `0.01`로 sweep하면 34개 capture-side series 중 21개에서 top이 한 번 이상 바뀌었고, 한 series의 top 종류는 최대 6개였다.
- alar outer fraction을 `0.34..0.50`, step `0.01`로 sweep하면 34/34 series에서 top이 바뀌었고 평균 4.82개, 최대 11개 top이 나왔다. outer cutoff가 곧 lateral max의 censoring boundary이기 때문이다.
- 조사 시작 시 nasion 제안 크기는 0개×13, 1개×2, 2개×2였고 당시 3-index 계약을 통과한 capture는 **0/17**이었다. 이 실패와 후속 사람 검수를 근거로 동적 제안 대신 고정 vertex `15` 한 점 계약으로 변경했다.
- 조사 시작 시 자동 suggestion 생성은 g1 union을 먼저 제외하므로 g1 overlap은 0/17이었지만(`scripts/face3d/build-tier2-seed-review.mjs:248-258,317-328,346-371,402-439`), 2D-nearest로 보탠 후보는 triangle graph에서 모두 연결되지 않았다. connected capture는 malar screen-L `12/17`, screen-R `11/17`, alar screen-L `9/17`, screen-R `13/17`뿐이었다. nonempty nasion 4개 중에도 single component는 2개뿐이었다.
- topology UV 자체는 1220/1220 vertex가 mutual mirror match이고 최대 residual은 `0.001026`이었지만, 조사 시 좌우 제안 set이 exact mirror인 capture는 malar `2/17`, alar `6/17`뿐이었다(mean mirror Jaccard 각각 `0.369`, `0.365`). 고정 좌우 patch를 함께 authoring해야 하는 이유다.
- `...1237646`에서는 자동 `malarApexRight`와 `alarRight`가 589, 729를 공유해 Tier-2 상호 disjoint도 위반했다. 이후 authoring UI는 fixed patch의 기존 owner를 확인해 중복 선택을 차단하고(`scripts/face3d/build-tier2-seed-review.mjs:844-859`), 공용 validator도 모든 Tier-2 patch 쌍의 overlap을 오류로 만든다(`scripts/face3d/tier2-seed-review-core.mjs:788-803`). runtime map 역시 이를 거부한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs:426-470`).

#### malar `max` / top-3 평균 / centroid 비교

아직 승인된 고정 malar patch가 없으므로 최종 patch 공식을 직접 비교할 수는 없다. 대신 현재 **동적 screen band**에 같은 수식을 적용한 탐색적 ablation을 별도로 계산했다. 공식 3명 pose triplet에서 각 subject-side의 N/L/R range는 `max 0.00137–0.00535`, band 내 top-3 평균 `0.01075–0.02137`, band centroid `0.143–0.342 faceScale`였다. 도구가 고른 5점을 patch처럼 취급하면 top-3 평균 range는 `0.261–0.347`, centroid는 `0.560–0.669`까지 커졌다. subject-01 neutral 4회에서도 screen-L은 max `0.00505`, band top-3 `0.01587`, 선택 5점 top-3 `0.02912`, 선택 5점 centroid `0.04995`였다. screen-R에서는 selected top-3 `0.00420`, band top-3 `0.00417`, band centroid `0.00286`이 max `0.00435`보다 소폭 작았지만 다른 side·pose set에서 재현되지 않았다.

이 결과는 승인 patch의 성능 증거가 아니라 **현재 후보에서 top-3나 centroid가 max보다 일관되게 안정적이라는 근거가 없다는 반증**이다. 더구나 현 malar screen-L은 공식 pose pair에서 top 위치가 평균 `0.125 faceScale` 이동했는데 max 값 range는 작았다. 서로 다른 잘못된 vertex가 비슷한 projection을 내면 지표만 안정적으로 보일 수 있다는 뜻이다. 따라서 이번 결정에서는 기존 `max`를 유지하되, 최종 고정 해부 patch를 만든 뒤 §4의 해부·boundary·point-distance gate와 함께 다시 비교한다. 지표 range만으로 patch를 승인하지 않는다.

이 결과는 **고정 topology의 실패**가 아니라 **screen-space 동적 밴드 선택의 실패**를 지지한다. 최신 g1-v7은 UV reflection mutual-nearest pair, residual cap `0.00125`, 관측 max `0.001026`을 이미 사용한다(`artifacts/face3d/semantic-consensus/subject-01-neutral-only-v7/ARKitFaceSemanticMapV1.consensus.candidate.json:27-45`). Tier-2도 같은 topology/UV pairing을 재사용하되 해부학 승인을 새로 받아야 한다.

---

## 3. 시드 명세

### 3.1 공통 불변조건

1. **Topology lock**
   - `vertexCount=1220`, `indexCount=6912`, `uvCount=1220`, fingerprint `57bdaf554d270e1a2f708120ced12ab4ed2207ad1f87a915d04a02d1c6ee1f3f`가 아니면 authoring·runtime 모두 fail-closed한다.
   - index는 `0..1219`, 그룹 내 중복 0이어야 한다.

2. **Laterality lock**
   - Tier-2 `Left/Right`는 피사체 자신의 해부학적 side다.
   - `Left`: `q<0`, 현재 거울 화면 왼쪽. `Right`: `q>0`, 현재 거울 화면 오른쪽.
   - 최종 테스트 fixture에는 양수 local-x 쪽에 `Left`만 존재하는지 검증하는 assertion을 둔다.

3. **Disjoint lock**
   - 이 조건은 **runtime 고정 patch**에만 적용한다. live g1 12개 그룹의 unique union과 runtime patch의 교집합은 0이어야 한다.
   - 다섯 runtime patch의 상호 교집합도 0이다. `noseBridgeMidlineIndices`가 함께 authoring되는 경우에도 교집합 0이다. 아직 bridge index가 없다면 이 다섯 그룹을 먼저 동결하고, 후속 bridge가 이 집합을 제외하게 한다.
   - reviewer ROI와 target은 해부 판정 증거이므로 g1-reserved index를 포함할 수 있다. target을 인접 free vertex로 자동 치환하지 않는다. 대신 runtime patch는 ROI 안의 free vertex로만 구성하고, 불가능하면 증거를 보존한 채 `unsupported/null`로 판정한다.

4. **Bilateral topology lock**
   - UV `(u,v) -> (1-u,v)` mutual-nearest pair만 허용한다.
   - 좌우 patch는 pair set Jaccard `1.0`, 같은 cardinality, 각자 single connected component여야 한다.
   - 기존 g1-v7과 같이 UV residual `<=0.00125`를 사용한다. 실제 얼굴 비대칭은 vertex 좌표에 남고 index topology만 대칭으로 맞춘다.

5. **Coordinate source**
   - authoring view는 `screenVertices`/frame을 쓰되, runtime 극값은 오직 `localVertices`와 face-local axes를 쓴다.
   - screen x/y, frame silhouette, 촬영 crop은 runtime search 함수에 들어가면 안 된다.

6. **Patch topology**
   - mesh adjacency는 export의 triangle `indices`에서 만든 undirected graph를 사용한다.
   - 2D pixel-nearest를 topology neighbor로 사용하지 않는다.
   - malar/alar patch는 최소 5 vertices, single connected component다. 현재 runtime validator는 nasion/alar/malar에 일반 최소 3, `noseBridgeMidline`에 4를 적용한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs:45-49,323-334`). 최종 g2에서는 runtime validator를 nasion 정확히 1, bridge 최소 4, alar/malar 최소 5로 함께 변경해야 한다.

7. **Evidence와 runtime patch 분리**
   - `targetIndex`는 `allowedRegionIndices` 안에 있어야 한다. 둘은 g1과 겹쳐도 된다.
   - `fixedPatchIndices`는 reviewer ROI의 부분집합이어야 하지만 target을 반드시 포함할 필요는 없다.
   - blind 단계에서 candidate group은 ROI+target만 기록하고, suggestion/fixed patch를 공개한 뒤 `coverageVerdict=pass|fail`과 비어 있지 않은 `coverageNote`를 남긴다. `candidate_review` 완료에는 coverage pass가 필요하다. `unsupported_null`은 blind 단계에서도 coverage fail/note와 구체적인 unsupported reason을 기록할 수 있다.
   - `unsupported_null`에서도 ROI/target 증거는 보존할 수 있다. provisional authoring JSON의 `groups[key]`와 `fixedPatchIndices`는 빈 배열이어야 하지만, 승인된 flat runtime map에서는 해당 optional Tier-2 필드를 생략하거나 `null`로 둔다. live map의 빈 배열은 non-null 최소개수 검증에 실패한다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs:323-334,416-424`).

### 3.2 사람 확정 절차

현재 `build-tier2-seed-review.mjs`는 2D frame overlay, 클릭·solo·모든 vertex, g1 reserved 표시, rotatable local-mesh 3D, 피사체 Left/Right 45도와 subnasal preset, 고정 patch import/reprojection, 구조 validation, JSON export를 제공한다. 자동 suggestion과 imported/fixed patch는 reviewer가 ROI+target 해부 증거를 먼저 남기도록 blind review에서 숨긴 상태로 시작한다. 공개는 되돌릴 수 없고 그 전에는 JSON 복사·저장이 비활성화된다(`scripts/face3d/build-tier2-seed-review.mjs:683-1068`; 검증 계약은 `scripts/face3d/tier2-seed-review-core.mjs:312-898`).

1. 17개 HTML을 모두 생성한다.

   ```sh
   for d in artifacts/face3d/device-captures/pair_*; do
     node scripts/face3d/build-tier2-seed-review.mjs "$d" "/tmp/tier2-review/$(basename "$d").html"
   done
   ```

2. projected mesh와 frame registration을 17/17 먼저 확인한다. 현재 payload flag가 pending이므로, 사람의 `Registration=pass` 전 클릭 결과는 provisional이다. `captureFraming.fullMeshInFrame`은 별도 상태로 기록한다. false이면 중앙부 registration은 판정할 수 있어도 전체 mesh framing PASS로 세지 않는다.
3. primary authoring frame은 제품 오너가 가장 정면·수평으로 판정한 `...1783799136465`를 쓴다. 그러나 index는 이 한 장에서 확정하지 않는다.
4. 두 reviewer에게 landmark 정의, 포함/제외 경계, alare-vs-alar-crease·nasion-vs-sellion·malar-vs-zygion 반례를 먼저 제시한다. 서로의 결과, 자동 suggestion, imported/fixed patch를 보지 않는 blind mode에서 각 그룹의 ROI를 표시하고, 그 안에서 대표 target 한 점을 클릭한다. ROI와 target은 g1과 겹쳐도 되는 해부 판정 증거이며 제품 오너 한 명의 클릭을 gold standard로 쓰지 않는다. 이 단계에서 명백히 표현 불가인 그룹은 `unsupported_null`, coverage fail/note, reason을 기록할 수 있다.
5. 필수 blind 증거가 갖춰지면 `1차 해부 표시 완료 · 자동 후보 공개`를 누른다. 공개는 되돌릴 수 없으며, 공개 전에는 export 버튼도 비활성화되므로 “blind annotation JSON”을 따로 저장하는 단계는 없다. export의 `blindReviewCompleted`와 `suggestionsRevealedAtUtc`가 공개 이력을 보존한다.
6. 공개된 suggestion/fixed patch를 2D 정면/실캡처 yaw와 rotatable 3D의 피사체 Left/Right 45도·subnasal preset에서 확인한다. 이 3D는 같은 `localVertices`의 topology view라 전후 위치 확인에는 도움이 되지만 texture나 새로운 촬영 정보를 만들지는 않는다. alar crease 경계가 여전히 모호하면 neutral pitch-up/subnasal 실캡처를 추가하고, 그 전에는 해당 alar coverage를 pass로 만들지 않는다.
7. candidate group은 patch를 확인한 뒤 각 capture·group의 해부 포함 여부를 `coverageVerdict=pass|fail`로 명시하고 `coverageNote`를 작성한다. 안전한 free patch를 만들 수 없으면 ROI/target 증거는 남기고 `unsupported_null`, coverage fail, 구체적 reason을 기록하며 runtime patch는 비운다. suggestion을 본 뒤 ROI/target 판정을 바꾸면 note에 이유를 남긴다.
8. 각 capture·group에서 두 target의 normalized 3D 거리를 계산한다. `<=0.05 faceScale`이고 두 사람이 표시한 ROI가 겹치면 그 교집합을 patch 허용 영역으로 삼는다. 이 gate를 통과한 경우에만 그 capture의 consensus target `t_c`를 **두 target vertex의 local 3D 좌표 산술중점**으로 정의한다. 초과하거나 영역 교집합이 없으면 `t_c`를 만들지 않고 독립 재표시한다. 즉 불일치한 해부 부위를 평균으로 숨기지 않는다. **현 도구는 reviewer별 JSON과 한 캡처 구조 validation까지만 제공하며, 두 reviewer ROI/target 합의도와 17-board 결과를 계산하는 batch consensus validator는 아직 후속 구현이다.**
9. A 그룹은 primary frame에서 `E_s = ROI_A ∩ ROI_B − g1 − 이미 배정된 Tier-2 runtime patch`를 만든다. `E_s` 안에서 malar는 face-local anterior score, alar는 해당 side의 face-local lateral score의 전역 argmax를 초기 winner로 잡고, `1e-6` tie 집합에서 가장 작은 index를 택한다. 이 winner의 closed one-ring과 `E_s`의 교집합을 raw patch 시작점으로 삼아 최소 5개와 내부 winner 여유를 만족할 때까지 `E_s` 안에서 graph ring을 확장한다. 좌우 UV mirror pair union을 취한 뒤 disjoint와 연결성을 검사한다. `E_s`가 부족하거나 해부 coverage가 깨지면 해당 bilateral family를 unsupported로 둔다. target은 patch에 반드시 포함할 필요가 없다.
10. 독립 authoring을 계속할 때 후보 JSON을 다른 capture의 보드에 `--patch`로 불러오면 고정 groups만 전달하고 blind stage를 유지하며 reviewer ID, registration, ROI, target, selection evidence, coverage verdict/note를 초기화한다. 반면 primary authoring에서 후보가 승인된 뒤 같은 고정 patch의 pose/subject coverage만 확인할 때는 `--patch ... --reprojection`을 사용한다. 이 모드는 patch를 처음부터 표시하고 vertex 편집을 잠그며 reviewer·registration·coverage만 초기화한다. Export는 `reviewMode=fixed_patch_reprojection`, `blindReviewCompleted=false`로 기록한다. 따라서 어느 모드에서도 다른 capture의 `Registration=pass`나 coverage 판정이 복사되지 않는다.
11. raw patch를 17개에 동일 index로 재투영하고 각 capture에서 registration·framing·blind ROI/target·공개 후 coverage를 새로 판정한다. patch 안 runtime winner가 mesh-boundary vertex인 capture가 하나라도 있으면 ROI 안의 free 해부 surface로 patch를 확장한 뒤 17개를 다시 검토한다. 확장할 surface가 없으면 해당 그룹을 `unsupported_null`로 남긴다.
12. export의 `reviewOutcome`과 `validation.completionStatus`가 `candidate_structural_pass`면 unsupported 없이 한 캡처의 구조 후보 조건을 통과한 상태다. `complete_with_unsupported`는 근거와 함께 검수 기록을 마쳤지만 완전한 runtime seed PASS가 아니다. 어느 상태도 두 reviewer 합의나 live 승인이 아니다. 최종 candidate에는 topology fingerprint, source 17 capture IDs, reviewer ID/시각, 좌우 UV pair hash, g1/Tier-2 disjoint audit, patch adjacency hash를 저장하고 단일 capture export를 바로 live map에 넣지 않는다.

### 3.3 malar patch의 해부 경계와 런타임 함수

Reviewer가 클릭할 target:

- 외측 안와 1/3 아래의 maxillozygomatic/malar eminence 표면 영역.
- superior three-quarter view에서 malar mound의 앞쪽 prominence로 보이고, frontal/profile에서 코 옆기둥이나 zygomatic arch silhouette가 아님을 확인한다.

패치 포함:

- 두 reviewer ROI 공통부 안의 연속된 anterior malar surface 중 g1/Tier-2에서 free인 topology.
- 사람별 전방 apex가 이동할 수 있는 바로 인접 topology one-ring. target은 ROI 증거라 patch가 그 index 자체를 포함할 필요는 없다.

패치 제외:

- superior: lower eyelid/orbital rim vertex.
- medial: nasal sidewall·paranasal column.
- inferior: nasolabial/buccal soft-tissue mound.
- lateral: zygomatic arch/얼굴 silhouette rim.

최종 `P_malar,Left/Right`는 각 최소 5 vertices, UV exact-paired, connected, g1/Tier-2-disjoint다. 런타임은 §1.1의 기존 anterior `max`를 그대로 사용한다. winner index가 사람·frame에 따라 패치 안에서 바뀌는 것은 허용하지만, boundary hit와 pose-distance gate를 통과해야 한다.

### 3.4 alar patch의 해부 경계와 런타임 함수

Reviewer가 클릭할 target:

- nasal ala가 가장 바깥으로 돌출되는 `alare`.
- frontal view에서 좌우 폭, rotatable 3D의 subnasal preset에서 전후 위치를 확인한다.

현 reviewer는 같은 `localVertices`를 회전하는 3D와 subnasal preset을 제공한다. 이는 topology의 전후 위치를 확인할 수 있어 기존 2D-only 제약은 해소했지만, texture나 새로운 pitch-up 실캡처를 만들지는 않는다. alar crease/nostril 경계가 3D geometry만으로 모호한 capture는 coverage fail로 남기고 별도 subnasal 실캡처 뒤에만 재검수한다.

패치 포함:

- 두 reviewer ROI 공통부 안 convex alar lobule의 바깥 표면 중 free topology와 runtime extreme 주위 one-ring. target 자체 포함은 필수가 아니다.

패치 제외:

- alar crease/ac(ala-cheek insertion fold).
- cheek, nasal sidewall, columella, nostril 내부/후연.

최종 `P_alar,Left/Right`는 각 최소 5 vertices, UV exact-paired, connected, g1/Tier-2-disjoint다. 런타임은 §1.2의 face-local lateral argmax를 사용한다. 조사 시작 시 legacy screen-space auto picker와 evaluator의 centroid 식은 폐기 대상이며, 현 reviewer의 face-local suggestion도 사람 검수를 돕는 보조 레이어일 뿐 runtime 승인값은 아니다.

### 3.5 nasion 중앙 1점 확정

Reviewer target은 다음 세 조건을 동시에 만족해야 한다.

1. midline,
2. 양쪽 upper palpebral sulci를 잇는 높이,
3. profile에서 sellion보다 약간 superior/anterior인 nasal-root surface proxy.

제품 오너의 blind ROI 표시에서 대표 target은 `15`였고, 이 정점은 UV `u≈0.5`의 self-mirror 중앙점이다. 좌우 보조점 `347/780`을 함께 평균하면 mesh 비대칭·표정 변형에 따라 중앙이 이동할 수 있으므로 사용하지 않는다. 최종 계약은 `nasionIndices=[15]`이며, 사람마다 다른 정점을 다시 찾지 않는다.

`15`는 g1 upper-midface에도 예약돼 있으므로 nasion에 한해 controlled overlap을 허용한다. `noseBridgeMidlineIndices`에는 `15`를 넣지 않아 Tier-2 그룹끼리는 겹치지 않게 유지한다. 17개 캡처에서는 `vertex[15]`의 위치 변동과 `noseLength` pose range를 별도로 검증하며, 임상적 frontonasal suture 점이라는 보증이 아니라 뷰티 지표용 고정 nasal-root proxy로만 명명한다.

### 3.6 구현 lockstep

현재 authoring 단계에는 anatomical L/R, ROI/target/runtime patch 분리, rotatable 3D/subnasal preset, 고정 patch 재투영, mesh adjacency, g1/Tier-2 runtime patch disjoint, UV mirror, winner boundary, unsupported/null 및 capture별 coverage 기록이 구현돼 있다(`scripts/face3d/build-tier2-seed-review.mjs:683-1068`; `scripts/face3d/tier2-seed-review-core.mjs:312-898`). 이 도구의 PASS는 authoring 구조 판정일 뿐 runtime 변경이 아니다.

사람 검수 뒤의 runtime 구현은 다음을 한 변경 묶음으로 처리해야 한다.

- batch validation: 두 reviewer JSON의 blind ROI/target 합의도, capture별 coverage verdict/note, registration/framing, 17-capture gate를 계산한다. 현재 보드는 이를 자동 합의하지 않는다.
- `Face3DMetricEvaluator.cs`: alar centroid를 patch-local lateral argmax pair로 변경하고, `chinIndices=[31..35]`의 oriented-midface signed-projection argmax를 `chinProjection`과 E-line이 같은 winner로 공유하도록 unit/formula test를 추가. malar와 nasion 식은 유지하고 Menton은 현재 projection에서 제외한다.
- `Face3DSemanticMap.cs`: optional null 허용은 유지하되 nasion=1, bridge≥4, alar/malar≥5를 그룹별로 검증하고 controlled g1-overlap/null/disjoint/minimum-count test를 추가.
- approval pipeline: 현재 `SEMANTIC_GROUPS`는 g1 12개에서 끝나고, runtime map clone도 그 목록만 복사한다(`scripts/face3d/semantic-candidate-core.mjs:7-157,230-233,1098-1115`). 승인 receipt는 groups를 직접 나열하지 않고 runtime map SHA-256·schema·topology를 기록해 semantic content를 간접 결박한다(`scripts/face3d/approve-semantic-map.mjs:432-478`). 따라서 Tier-2 정의·clone·검증과 receipt가 가리키는 runtime map을 함께 확장해야 한다.
- live asset: Pogonion 동반 변경은 g1 asset을 `arkit-face3d-g1-reviewed-v2-pogonion`으로 갱신한다. Tier-2 필드를 포함한 g2 교체는 이와 분리하고 최종 사람 승인·17-capture gate 후에만 새 `mapId`와 receipt로 수행한다.

---

## 4. 검증 계획과 합격 기준

### 4.1 17-capture seed gate

아래 수치는 이 데이터에서 안정 사례의 점프가 대체로 `0.001–0.009 faceScale`, 명백한 screen-band 오선택이 `0.18–0.55`였던 분리를 이용한 **engineering gate**다. 임상 정확도나 모집단 기준이 아니다. 17개 faceScale 범위는 `0.0540–0.0567 m`라 `0.02/0.04/0.05 faceScale`은 각각 약 1.1/2.2/2.8 mm다.

| Gate | 합격 기준 | 실패 시 |
|---|---|---|
| Frame registration | projected mesh ↔ frame 17/17 사람 승인; L/R sign 17/17 확인; 다른 capture import가 registration PASS를 승계하지 않음 | 클릭 결과 전부 provisional, 다음 gate 금지 |
| Capture framing | `captureFraming.fullMeshInFrame`와 out-of-frame count를 17/17 기록; false capture는 전체-mesh framing PASS로 세지 않음 | 재촬영 또는 local overlay만 제한적으로 검수 |
| Topology | fingerprint 17/17 exact; count 1220/6912/1220 | hard fail |
| Index contract | 범위·중복 오류 0; nasion=1(`15`); bridge≥4; alar/malar 각 ≥5 | hard fail |
| Evidence contract | capture·group별 target∈ROI; fixed patch⊆ROI; coverage verdict/note 기록 | 누락 capture 재검수 |
| Runtime patch disjoint | alar/malar의 g1 overlap 0; nasion/bridge의 명시된 controlled g1 overlap만 허용; Tier-2 patch 상호 overlap 0 | hard fail |
| Bilateral | UV mirror-set Jaccard=1.0; 같은 수; residual≤0.00125 | hard fail |
| Connectivity | 각 patch connected component=1 | hard fail |
| Anatomical coverage | 핵심 3명 pose board 9/9에서 reviewer 2명 모두 그룹별 `coverageVerdict=pass`와 note; 나머지 8/8도 coverage fail/gross miss 0 | candidate gate fail; 증거를 보존해 unsupported 가능 |
| Alare view adequacy | 각 alar side의 전후 위치를 rotatable local-mesh 3D의 subnasal preset에서 reviewer 2명 모두 pass; geometry가 불명확하면 별도 textured subnasal/pitch-up capture에서도 pass | 충족 전 alar index provisional/미승인 |
| Consensus error | 추출점↔사람 consensus `distance/faceScale`: 17개 median≤0.025, 각 capture≤0.05 | patch 재작성 또는 unsupported |
| Same-neutral | subject-01 neutral 4회, 6 pair: point distance median≤0.015, max≤0.03 | fail |
| Pose | 공식 3명 N/L/R, 9 pair/group: point distance median≤0.02, max≤0.04 | fail |
| Patch censoring | alar/malar runtime winner가 patch graph boundary인 capture 0/17 | patch 확장 후 전면 재검증 |
| Metric pose range | 각 subject N/L/R에서 `noseLength`, `alarWidth` max-min≤0.02; 각 `malarProjection`≤0.01 | fail |
| Finite/coverage | nasion vertex `15`·alar extreme·malar max가 17/17 finite | fail |

추가 해석 규칙:

- argmax index 자체가 인접 vertex로 바뀌는 것은 fail이 아니다. 공간 거리, graph boundary, metric range를 본다. graph distance 2 edges 초과는 reviewer 경고를 발생시키되 공간/해부 gate가 최종 판정한다.
- 높은 index 안정성도 해부학 pass를 대체하지 않는다. 현 malar screen-R의 top 600은 neutral 9/9로 안정적이었지만 그것만으로 mz proxy라고 승인할 수 없다.
- 조사 시작 시 17개 legacy 자동 suggestions는 nasion **minimum-count pass가 0/17**이었고 L/R·alar 공식도 본 결정과 달랐다. 현 v2 reviewer에서 해부학 좌우와 face-local alar 후보를 고쳤어도 자동 보조 후보의 구조 gate는 여전히 `0/17 PASS`다. 사람 ROI/target·고정 patch가 없는 **현 상태 판정은 FAIL**이다.
- export의 `reviewOutcome` 및 `validation.completionStatus`가 `candidate_structural_pass`면 unsupported 없이 한 capture의 authoring 구조 조건을 통과했다는 뜻이다. `complete_with_unsupported`는 각 unsupported group에 빈 runtime patch, coverage fail/note, reason이 있어 검수 기록이 완결됐다는 뜻이며 runtime candidate PASS가 아니다. 두 상태 모두 reviewer 간 consensus와 위 17-capture gate를 대체하지 않는다.

제품 오너의 첫 ROI 검수에서 만든 provisional 고정안에 `nasionIndices=[15]`를 적용해 17개 캡처를 다시 계산했다. 구조 오류는 `0/17`, 모든 그룹의 connected component는 `1`, bilateral exact mirror는 `17/17`이었다. nasion 위치 이동량은 pose 9 pair에서 median `0.00246`, max `0.01464 faceScale`, subject-01 neutral 6 pair에서 median `0.00742`, max `0.01477`로 위 engineering gate를 통과했다. `noseLength` pose range는 subject-01 `0.00226`, subject-02 `0.00184`, subject-03 `0.02077`이므로 subject-03은 기준 `≤0.02`를 소폭 초과한다. 또한 winner boundary hit는 alar L `4/17`, alar R `5/17`, malar L/R 각각 `17/17`이므로 현재 alar/malar patch는 확장·재검수가 필요하다. 재현 파일은 `/tmp/tier2-seed-analysis/candidate-validation.json`(SHA-256 `187cd16201ab9d664c60a65c19e16e9557d65453d6a71381c0e86f847c05f2ee`)과 `/tmp/tier2-seed-analysis/candidate-metrics.json`(SHA-256 `eaa452d7f036f1a0d846438019e5a4f4a465aa755168e2d548eea44f47faf622`)이다. 이는 1차 candidate precheck이며 두 reviewer의 17-capture 해부 coverage 승인이 아니다.

### 4.2 별도 repeatability·노출 gate

17개 seed gate는 index/patch의 해부 타당성과 pose 강건성을 보는 것이지 제품 노출 승인이 아니다. repo 계약은 별도 **3명 × 각 3회 neutral**을 정확히 요구한다(`docs/face3d/TIER2_METRIC_CONTRACT.md:81-90`; `scripts/face3d/analyze-repeatability.mjs:57-103`). 분석기의 기본 합격은 between-subject MAD / within-subject MAD인 `discriminability >= 2.0`이며, Tier-2는 지표별 pass한 key만 노출 후보가 된다(`scripts/face3d/analyze-repeatability.mjs:108-120,145-183`).

최종 노출 순서:

1. 위 17-capture seed gate 통과.
2. 기존 17개와 별도로 균형 잡힌 3명×3 neutral 신규 세트 수집.
3. `analyze-repeatability`에서 각 `noseLength`, `alarWidth`, `malarProjectionLeft/Right`의 `discriminability>=2.0` 확인.
4. 사람 overlay approval, g2 map/receipt, Unity runtime finite event 증거 확인.
5. 통과한 metric만 `FACE_3D_EXPOSED_METRIC_KEYS`에 편입.

현재 17개는 세 사람의 pose triplet과 같은 사람 반복이 섞였으므로 2번을 대체하지 못한다. 따라서 이 문서로 그룹 정의는 결정하지만 **Tier-2 제품 노출은 UNVERIFIED/미승인**이다.

---

## 5. 리스크와 미해결 질문

### 확정된 리스크

1. **Topology ≠ 임상적 homology.** Apple은 고정 topology를 보장하지만 alare/nasion/mz vertex를 보장하지 않는다. 3명 overlay와 이후 인구집단 확장이 필수다.
2. **nasion의 controlled g1 overlap.** 중앙 vertex `15`는 `midfaceReferenceUpperIndices`와 공유된다. 이는 해부 위치를 옆 정점으로 왜곡하지 않기 위한 의도적 예외이며 approval receipt에 기록해야 한다.
3. **legacy L/R 반전 artifact.** 현 authoring 도구는 피사체 해부 좌우를 강제하지만 교정 전 suggestions/index page는 반대 naming을 포함할 수 있다. legacy JSON을 승인 근거로 직접 import하지 않고 현 validation을 다시 통과시킨다.
4. **alar 공식 불일치.** centroid width를 표준 al-al로 노출할 수 없다.
5. **frame registration 상태.** capture 자체가 coordinate-space validation을 pending으로 기록한다. 기존 g1 승인 board와 별개로 Tier-2 17/17 registration attest가 필요하다.
6. **표정·콧볼 flare.** FaceBase도 alare가 표정에 민감하다고 지적한다. neutral 표정 및 blendshape gate 없이 alarWidth를 비교하면 생체 형태와 표정이 섞인다.
7. **표본 일반화 한계.** 해부 검증의 distinct subject는 3명뿐이다. ancestry, sex, age, nose/zygomatic morphology 범위를 대표하지 않는다.
8. **기존 approval pipeline 누락.** 현 `semantic-candidate-core.mjs`는 Tier-2를 보존하지 않는다. 구현자가 live map만 편집하면 승인 receipt와 pipeline이 어긋난다.
9. **기존 tier2 index page는 승인 근거가 아니다.** 페이지는 두 capture의 공통 index만으로 해부 대응을 실증했다고 주장한다(`artifacts/face3d/tier2-seed-review/index.html:94-95`). 이는 Apple 보장과 17-capture 결과보다 강한 주장이라 본 결정문으로 폐기한다. 같은 페이지의 old 후보(`artifacts/face3d/tier2-seed-review/index.html:65-90`)도 현재 생성기 suggestions와 다르다.
10. **실영상 alare subnasal 정보 한계.** 현 reviewer는 rotatable local-mesh 3D와 subnasal preset을 제공하지만 texture나 새 촬영 정보를 만들지는 않는다. convex ala와 crease/nostril 경계가 geometry만으로 모호하면 별도 textured pitch-up/subnasal capture 전까지 해당 exact alar indices를 승인할 수 없다.
11. **작은 metric range의 거짓 안정성.** 서로 다른 오선택 vertex가 비슷한 전방 투영을 내면 malar 값만 안정적으로 보일 수 있다. point-distance·해부 ROI·boundary gate를 metric range보다 먼저 통과시킨다.
12. **현재 runtime minimum 불일치.** 현 optional landmark validator는 3개만 있어도 받으므로 alar/malar 5개 authoring 계약을 runtime이 강제하지 못한다. g2 전환은 validator·approval·evaluator·receipt를 lockstep으로 바꾼 뒤에만 한다.
13. **두 reviewer consensus 자동화 미완료.** 현 보드는 reviewer별 annotation과 한 캡처의 구조 gate를 만든다. 독립 JSON 간 ROI/target 합의도, coverage/gross-miss 17-board 집계, blind-review provenance를 계산하는 batch validator는 사람 검수와 함께 후속 구현해야 한다.
14. **곡률 QA는 아직 미검증.** Katina식 곡률 후보를 ARKit 17개에 적용하는 실험은 이번 산출물에 포함하지 않았다. 해부 ROI가 없는 curvature extreme은 다른 landmark를 안정적으로 고를 수 있어 현재 A/C 결정의 근거로 쓰지 않는다. 두 reviewer ROI가 생긴 뒤 ROI 내부에서만 boundary/plateau 경고 보조값으로 시험한다.

### 미해결이지만 결정을 막지 않는 질문

- 제품이 실제로 원하는 nasal-root 지표가 nasion인가, deepest radix/sellion인가? 본 결정은 요청대로 nasion을 확정했다. sellion이 필요하면 별도 그룹·명칭·검증으로 추가한다.
- 제품이 원하는 광대가 anterior prominence인가, `zy-zy` 폭인가? 현재 공식 때문에 전자를 확정했다. 옆광대 폭은 새 지표다.
- vertex `15`가 더 다양한 얼굴에서도 nasal-root 중앙 proxy를 유지하는가? 17개 gate 이후 확장 cohort에서 검증해야 한다.
- alar/malar patch가 더 다양한 얼굴에서 해부 영역을 유지하는가? 17개 gate 후 별도 확장 cohort에서 검증해야 한다.

---

## 재현 메모

현 v2 reviewer의 17개 보드 생성은 다음 형태로 수행했다. 출력은 `/tmp`에만 만들었다. 이 명령은 위 legacy screen-band 배열 재현 명령이 아니다.

```sh
mkdir -p /tmp/tier2-seed-analysis
for d in artifacts/face3d/device-captures/pair_*; do
  node scripts/face3d/build-tier2-seed-review.mjs \
    "$d" "/tmp/tier2-seed-analysis/$(basename "$d").html"
done
```

정량 재계산 스크립트와 산출물도 repo 밖 `/tmp`에 두었다.

```sh
python3 /tmp/tier2-seed-analysis/analyze_tier2.py
jq '.runtimeContractAudit, .formalTripletsAggregate, .bias, .sensitivity, .fineBoundarySweepSummary' \
  /tmp/tier2-seed-analysis/results.json
python3 /tmp/tier2-seed-analysis/augment_analysis.py
jq '.alarCentroidVsOutwardExtreme, .malarFormulaFormalTripletRanges, .malarFormulaSubject01NeutralRanges' \
  /tmp/tier2-seed-analysis/augment_results.json
python3 /tmp/tier2-seed-analysis/structure_audit.py
jq '{g1OverlapCaptureCount,tier2OverlapCaptureCount,connectivity,uvMirror}' \
  /tmp/tier2-seed-analysis/structure_results.json

for f in artifacts/face3d/device-captures/pair_*/arface_export.json; do
  jq -c '[.display.isMirrored,.coordinateSpaceValidated,.coordinateSpaceValidationStatus,.blendShapes.available,.blendShapes.count,.blendShapes.provider,.blendShapes.statusCode]' "$f"
done | sort | uniq -c

for f in artifacts/face3d/device-captures/pair_*/arface_export.json; do
  jq -r '[.capturePairId, (.blendShapes.keySignals|to_entries|max_by(.value)|.value)]|@tsv' "$f"
done | sort -k2,2nr
```

- base audit script: `/tmp/tier2-seed-analysis/analyze_tier2.py`, SHA-256 `ba0a68daa76ffec616e2bd68ab6a920d46203c2e8c2b120ead40929bee7a3235`
- machine-readable result: `/tmp/tier2-seed-analysis/results.json`, SHA-256 `755c5377a43579579a15a55cbf1b21a235b5515dcf51301dfef7ff5c62b189ab`
- 17-capture table: `/tmp/tier2-seed-analysis/results.md`, SHA-256 `9c5554b726f9076d38e004f90b376ad5509477fc2d610bbb27775bc2556fc7be`
- formula/parity augmentation script: `/tmp/tier2-seed-analysis/augment_analysis.py`, SHA-256 `dc641a6c58eac2bf7a72d50377dda4740a00b3003de92715655a6d3658367800`
- augmentation result: `/tmp/tier2-seed-analysis/augment_results.json`, SHA-256 `dc87575129191084835e1f6510d9e305586de2ce78a61d9ee922e0c196b33b8b`
- structure audit script: `/tmp/tier2-seed-analysis/structure_audit.py`, SHA-256 `38eb05a068939c40aca83680b6d6211a03a8930a8785b2ddbc21fbae8e3734d4`
- structure result: `/tmp/tier2-seed-analysis/structure_results.json`, SHA-256 `afa405ba630ca5a5c264059942a935491884b1f2627a89223b5280e59f3937a0`

현 v2 authoring 도구도 최종 코드로 17개 보드를 다시 생성해 별도 감사했다.

```sh
node /tmp/tier2-seed-authoring-v2/audit-tier2-reviewer-output.mjs \
  /tmp/tier2-seed-authoring-v2/boards \
  "$PWD"
```

결과는 board `17/17`, shot `9 neutral / 4 yawLeft / 4 yawRight`, topology fingerprint 1종, HTML 계약·좌우 계약 및 **존재하는 suggestion index의 정수/범위 유효성** `17/17`, 전체 mesh in-frame `16/17`, 자동 suggestion structural PASS `0/17`이다. 이 index 유효성은 빈 nasion도 vacuous pass하므로 해부 coverage나 metric finite를 뜻하지 않는다. 구조 오류 집계는 required ROI/target/group missing 각 13, winner boundary 68, bilateral UV mismatch 28, below minimum 5, disconnected 17, Tier-2 overlap 2, exact-count 위반 4였다. 이는 reviewer UI/검증기가 17개를 처리한다는 증거이지 자동 후보 승인이나 사람 해부 coverage 증거가 아니다. 감사 스크립트는 `/tmp/tier2-seed-authoring-v2/audit-tier2-reviewer-output.mjs`(SHA-256 `ee12077dacd36053b8904bd5d436c006ffcd9743fa2c3635e3e68cb2420d3b4f`), 최종 실행 결과는 `/tmp/tier2-seed-authoring-v2/boards/batch-audit.json`(SHA-256 `13d98eb281006fcaaeb002712b43487198e569d1b2be6b3fedbed7a5ef64241d`)에 남겼다.

정량 감사에서는 다음을 계산했다.

- capture별 top index와 suggestion set.
- all/neutral pairwise Jaccard.
- 최신 g1-v7의 3 subject × N/L/R 내 9 pose pair 거리.
- subject-01 neutral 4회의 6 repeat pair 거리.
- malar band의 projection-vs-lateral Pearson correlation.
- malar inner fraction `0.35..0.55` 및 alar outer fraction `0.34..0.50`, step `0.01` one-factor sweep.
- g1/Tier-2 overlap, minimum count, bilateral UV mirror, connectivity.
- 현 alar 3점 centroid 폭과 같은 3점의 face-local lateral-extreme 폭 차이.
- 현 dynamic malar band/5점 후보에 대한 max, top-3 평균, centroid의 pose·repeat range. 이 ablation은 고정 해부 patch 승인 자료가 아니라 공식 선택의 방향성 확인에만 사용했다.
- repo에 보존된 3개 suggestions와 조사 시 새 생성물의 대상 다섯 그룹 배열 exact match. HTML/JSON 전체 byte parity나 이후 authoring schema metadata의 동일성은 주장하지 않는다.

사용자가 제시한 정면성 `0.2%/0.8%/7.6%`의 원래 산식은 repo에서 찾지 못했다. 따라서 이 수치는 재현값으로 인용하지 않으며, `...1783799136465`를 primary authoring frame으로 삼는 근거도 제품 오너의 “가장 정면·수평” 촬영 판정으로만 기록한다. 이 판정과 미재현 수치는 그룹 결정이나 위 seed gate의 정량 입력으로 사용하지 않았다.

## 참고 문헌

1. Farkas LG (ed.), 1994, 2nd ed., [*Anthropometry of the Head and Face*](https://books.google.com/books/about/Anthropometry_of_the_Head_and_Face.html?id=MKVpAAAAMAAJ), Raven Press — 전통 craniofacial landmark 체계의 기반.
2. Nechala P, Mahoney J, Farkas LG, 1998, [*Maxillozygional anthropometric landmark: a new morphometric orientation point in the upper face*](https://pubmed.ncbi.nlm.nih.gov/9788221/), DOI 10.1097/00000637-199810000-00009.
3. Nechala P, Mahoney J, Farkas LG, 2000, [*Comparison of Techniques Used to Locate the Malar Eminence*](https://journals.sagepub.com/doi/10.1177/229255030000800102).
4. Moubayed SP et al., 2012, [*A Novel Technique for Malar Eminence Evaluation Using 3-Dimensional Computed Tomography*](https://doi.org/10.1001/archfacial.2012.510), DOI 10.1001/archfacial.2012.510.
5. FaceBase, n.d., [*3D Facial Norms Technical Notes: Facial Landmarks and Measurements*](https://www.facebase.org/resources/human/facial_norms/notes/), project PI Seth M. Weinberg, accessed 2026-07-14.
6. Weinberg SM et al., 2016, [*The 3D Facial Norms Database: Part 1 — Supplement*](https://stacks.cdc.gov/view/cdc/39061/cdc_39061_DS2.pdf), DOI 10.1597/15-199.
7. Wang C, Wusiman P, Mi C, 2021, [*Cone-beam computed tomography analysis of the nasal morphology among Uyghur nationality adults in Xinjiang for forensic reconstruction*](https://www.sciencedirect.com/science/article/pii/S2214854X21000297).
8. Katina S et al., 2016, [*The definitions of three-dimensional landmarks on the human face: an interdisciplinary view*](https://eprints.gla.ac.uk/111162/1/111162.pdf), DOI 10.1111/joa.12407.
9. Toma AM et al., 2009, [*Reproducibility of facial soft tissue landmarks on 3D laser-scanned facial images*](https://pubmed.ncbi.nlm.nih.gov/19154273/), DOI 10.1111/j.1601-6343.2008.01435.x.
10. Baysal A et al., 2016, [*Reproducibility and reliability of three-dimensional soft tissue landmark identification using three-dimensional stereophotogrammetry*](https://pmc.ncbi.nlm.nih.gov/articles/PMC8597352/), DOI 10.2319/120715-833.1.
11. Li K et al., 2022, [*Reproducibility of Novel Soft-Tissue Landmarks on 3D Stereophotogrammetric Images in Caucasian and Asian Populations*](https://pmc.ncbi.nlm.nih.gov/articles/PMC9090709/), DOI 10.1007/s00266-021-02642-4.
12. Al-Baker B et al., 2023, [*Accuracy and reliability of automated three-dimensional facial landmarking in medical and biological studies: a systematic review*](https://pubmed.ncbi.nlm.nih.gov/37042196/), DOI 10.1093/ejo/cjac077.
13. Apple, [`ARFaceAnchor`](https://developer.apple.com/documentation/arkit/arfaceanchor), [`ARFaceGeometry`](https://developer.apple.com/documentation/arkit/arfacegeometry), [`ARFaceAnchor.geometry`](https://developer.apple.com/documentation/arkit/arfaceanchor/geometry).
