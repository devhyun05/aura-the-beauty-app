# Face3D G2 지표 계약 — 코 형태·앞광대·기존 G1

상태: **구현·제품 오너 해부 검수·17캡처 오프라인 승격 완료**
live map: `arkit-face3d-g2-product-approved-v1`
프로필 스키마: 제품 노출 `aura.face3d-profile.v1` (하위 호환 유지),
검증 전용 raw 거리 `aura.face3d-profile.v2`

## 0. 제품 경계

- 제품에 노출하는 값들은 ARKit/TrueDepth 얼굴 mesh의 local 3D 좌표를
  `faceScale`로 나눈 **무차원 상대값**이다.
- v2는 반복성·보정 검증을 위해 `valueMm`을 내부 병렬 필드로 보존한다.
  normalized stream과 raw-meter stream은 각각 median/MAD/outlier rejection을
  수행하며, `valueMmConfidence`, `valueMmValidFrameCount`, `valueMmMad`도 raw
  집계에서 독립적으로 계산한다. raw inlier 수가 해당 immutable policy의
  최소 frame 수에 못 미치면 `valueMm:null`로 차단하되 품질 필드는 진단용으로
  남긴다.
- v2의 mm 필드는 사용자 카드·AI prompt·제품 판정에 노출하지 않는다. 의료 진단,
  임상 정확도, 모집단 백분위를 뜻하지 않는다.
- 기존 G1 프로필에는 Tier-2 여섯 키가 없을 수 있다. 파서·DB 복원·보고서는 이 경우 기존 다섯 키만 정상 처리한다.
- 제품 오너 결정에 따라 신규 `3명 × 각 3회 neutral` 실기기 반복성 수집은 이번 G2 승격에서 면제했다. 대신 기존 17개 ARFace export의 topology exact match와 11지표 finite 계산을 승격 gate로 사용했다. 이 면제는 임상 정확도나 인구집단 일반화를 뜻하지 않는다.

## 1. 고정 topology 그룹

| 그룹 | index 계약 | 런타임 역할 |
|---|---:|---|
| `nasionIndices` | `[15]` 정확히 1점 | 코뿌리 고정 proxy |
| `noseBridgeMidlineIndices` | `[10,11,12,13,14,36]`, 최소 4점 | 콧대 중앙선 점열 |
| `alarLeftIndices` | `[202,204,292,298,325]`, 최소 5점 | 해부학적 Left 콧볼 surface patch |
| `alarRightIndices` | `[651,653,727,733,760]`, 최소 5점 | 해부학적 Right 콧볼 surface patch |
| `malarApexLeftIndices` | `[153,155,178,353,354,377,378,388,389,390]`, 최소 5점 | 해부학적 Left 앞광대 patch |
| `malarApexRightIndices` | `[602,604,627,784,785,808,809,819,820,821]`, 최소 5점 | 해부학적 Right 앞광대 patch |

Tier-2 그룹끼리는 교집합이 없어야 한다. G1과는 해부 위치를 왜곡하지 않기 위해 다음만 controlled overlap으로 허용한다.

- `nasionIndices`: `15`
- `noseBridgeMidlineIndices`: `10,11,12,14,36`

그 밖의 G1/Tier-2 overlap은 runtime validator와 승인 파이프라인이 거부한다. 모든 optional 그룹이 없는 G1 맵은 계속 허용한다. 하나라도 존재하는 G2 승인 후보는 여섯 그룹을 전부 갖춰야 한다.

## 2. 좌우·기준계

- 해부학적 Left = 셀피 화면에서 사용자가 보는 자신의 왼쪽 = face-local lateral 음수.
- 해부학적 Right = 셀피 화면에서 자신의 오른쪽 = face-local lateral 양수.
- `midfaceOrigin`과 전방 `midfaceNormal`은 기존 G1 중안면 기준면을 재사용한다.
- lateral normal은 `normalize(midfaceRight - midfaceLeft)`다.
- `faceScale = |midfaceRight - midfaceLeft|`다.
- 동률은 정규화 projection 차이 `≤ 1e-6`이면 작은 vertex index를 선택한다.

## 3. 11개 측정 공식

기존 G1 다섯 지표는 `noseTipProjection`, `chinProjection`, `upperLipToELine`, `lowerLipToELine`, `centralProjectionScore`다. `chinProjection`과 E-line은 `[34,35,975]` patch에서 중안면 기준면 전방 projection이 가장 큰 soft-tissue Pogonion proxy를 공유한다.

Tier-2 여섯 지표는 다음과 같다.

| 지표 | 공식 | 사용자 해석 |
|---|---|---|
| `noseLength` | `distance(nasion[15], noseTipCentroid) / faceScale` | 클수록 얼굴 폭 대비 코뿌리–코끝 길이가 길다 |
| `nasalBridgeStraightness` | nasion–noseTip 고정 3D 직선에 대한 bridge 점들의 RMS 잔차 `/ faceScale` | 작을수록 기준선에 가깝다 |
| `nasalAxisDeviation` | bridge 점들의 lateral signed projection 평균 `/ faceScale` | 0 중앙, 음수 Left, 양수 Right |
| `alarWidth` | Left patch의 lateral minimum과 Right patch의 lateral maximum 사이 3D 거리 `/ faceScale` | 클수록 얼굴 폭 대비 콧볼이 넓다 |
| `malarProjectionLeft` | Left patch의 전방 signed projection 최댓값 | 클수록 왼쪽 앞광대가 더 전방이다 |
| `malarProjectionRight` | Right patch의 전방 signed projection 최댓값 | 클수록 오른쪽 앞광대가 더 전방이다 |

`alarWidth`는 patch centroid 거리가 아니다. 표준 alare의 “콧방울 최외측점” 의미를 유지하기 위해 사람별 mesh 좌표에서 고정 patch 내부 lateral extreme을 고른다. `malarProjection`은 `zy-zy` 옆광대 폭이 아니라 maxillozygomatic 인접 **앞광대 전방 돌출 proxy**다.

## 4. 수집·직렬화·저장·표시

1. Unity evaluator가 한 frame의 11지표를 계산한다. Tier-2 그룹 부재·퇴화는 해당 optional 값만 null이며 기본 frame을 차단하지 않는다.
2. `Face3DProfileCollector`가 normalized와 raw-meter stream의
   median/MAD/confidence/validFrameCount를 각각 집계한다.
3. v1 canonical JSON은 기존 normalized 계약을 바꾸지 않는다. v2 canonical JSON은
   여섯 optional 키와 내부 `valueMm` 품질 필드를 항상 직렬화하며, raw 품질 최소치
   미달은 `valueMm:null`이다.
4. 모바일은 프로필 전체를 AI 요청의 `face3d`와 원본 `measurements.face3d`에 필터 없이 전달한다.
5. 백엔드는 전체 request payload를 detail JSONB에 저장하고 상세 GET에서 그대로 돌려준다. 목록 응답만 용량을 위해 measurements를 제외한다.
6. 보고서 상세 화면은 세션 프로필 또는 DB에서 복원한 `measurements.face3d`를 사용해 값이 존재하는 11개 카드를 표시한다. 각 카드는 숫자와 쉬운 방향 설명을 함께 표시한다.
7. AI prompt는 여섯 Tier-2 의미·좌우 부호·null·비임상 상대값 경계를 명시한다.

## 5. 승인 및 재현 증거

- 제품 오너 primary 승인: `artifacts/face3d/tier2-seed-reprojection-v1/primary-approved-patch.json`
- 재현 가능한 G2 후보: `artifacts/face3d/semantic-approval-g2/ARKitFaceSemanticMapV1.g2.candidate.json`
- 17캡처 11지표 진단: `artifacts/face3d/semantic-approval-g2/tier2-offline-diagnostics-17.json`
- 면제·승격 manifest: `artifacts/face3d/semantic-approval-g2/tier2-promotion-manifest.json`
- live map을 hash로 결박한 receipt: `artifacts/face3d/semantic-approval-g2/ARKitFaceSemanticMapV1.g2.promotion-receipt.json`

재현 명령:

```bash
npm run face3d:test:tier2-promotion
npm run face3d:test:semantic-diagnostics
npm run mobile:test:face3d
npm run mobile:typecheck
services/backend/.venv/bin/pytest services/backend/tests/test_analysis_measurements_payload.py -q
```

## 6. 남은 제품 리스크

- 17개 파일은 17명이 아니라 3명의 pose 세트와 같은 사람 반복을 포함한다.
- alare·nasion·광대는 넓고 완만한 연조직 부위라 임상 landmark 재현성을 주장할 수 없다.
- 표정, 콧볼 flare, pose, ARKit mesh fitting 오차가 값에 섞일 수 있다.
- “넓다/좁다”, “많이/적게 나왔다” 같은 등급 표현을 추가하려면 더 다양한 모집단 기준분포가 별도로 필요하다.
- 이번 승격에서 면제한 신규 반복성 자료는 향후 품질 개선·threshold calibration에는 여전히 유용하다.
