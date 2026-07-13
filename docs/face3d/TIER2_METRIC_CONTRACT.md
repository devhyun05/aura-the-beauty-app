# Face3D Tier-2 지표 계약 (코 형태 · 광대) — 코드 착수 전 동결 문서

> Wave B0 산출물. 이 문서가 동결되기 전에는 Tier-2 코드(B1)를 시작하지 않는다.
> 근거: 얼굴 측정 통합 도입 계획 v2(Codex REWORK 병합본). 기존 v1 계약
> (`aura.face3d-profile.v1`, gateVersion `face3d-gate-v1`, live 맵
> `arkit-face3d-g1-reviewed-v1`)은 그대로 유지되며, Tier-2는 전부 **optional**이다.

## 0. 원칙

1. **schemaVersion v1 유지.** 신규 지표·그룹은 optional — g1 맵(신규 그룹 없음)으로도
   로드·검증·직렬화·RN 파싱이 전부 통과해야 한다(회귀 테스트 필수).
2. **정규화는 한 곳에서 1회.** `SignedPlaneProjection`은 이미 `faceScale`
   (= `|midfaceRight − midfaceLeft|`, `Face3DMetricEvaluator.cs:57-58`)로 나눈 값을
   반환한다. **호출부에서 다시 나누지 않는다.** 신규 헬퍼(정규화 점간거리·선적합
   잔차 RMS)도 나눗셈을 헬퍼 내부 1곳으로 통일한다.
3. **노출 게이트 = repeatability 지표별 pass.** 오프라인 diagnostics(median/MAD/range)는
   후보 sanity 확인용일 뿐 노출 근거가 아니다. B2 강화판(3명×3 neutral 강제)의
   지표별 pass만 RN `FACE_3D_EXPOSED_METRIC_KEYS` 편입 근거가 된다.
4. 사용자 표현은 외관 trait 언어만 사용한다(의료·해부학 단정 금지).

## 1. 신규 시맨틱 그룹 (전부 optional)

| 그룹 | 용도 | disjointness |
|---|---|---|
| `nasionIndices` | 코 뿌리(nasion) 중심 | 기존 12그룹과 교집합 금지 |
| `noseBridgeMidlineIndices` | 콧대 중앙선 점열(nasion→noseTip 순서 무관, ≥4점) | 〃 |
| `alarLeftIndices` / `alarRightIndices` | 콧볼 좌/우 외측 | 〃 |
| `malarApexLeftIndices` / `malarApexRightIndices` | 광대 최고점 후보 ROI 좌/우 | 〃 |

- `Face3DSemanticMap.cs`의 기존 12그룹(noseTip/chin/chinBottom/upperLip/lowerLip/
  midfaceReference L·R·Upper/chinReference L·R·Upper/centralRegion)은 **필수 유지**.
- 신규 그룹 검증 규칙: 존재하면 "비어있지 않음 + 유효 vertex 범위 + 기존·신규 그룹과
  disjoint"를 검증하고, 없으면 게터가 null을 반환한다(로드는 성공).

## 2. Tier-2 지표 정의

기준계 정의(기존 evaluator 명칭 그대로):

- `midfaceOrigin`, `midfaceNormal`: 기존 전후(anterior) 기준면 (`Face3DMetricEvaluator.cs:64-90`).
- **중선(midsagittal) 평면 [신설]**: origin = `midfaceOrigin`,
  normal = `normalize(midfaceHorizontal)` (= 좌→우 축). 기존 `midfaceNormal`(전후)과
  혼동 금지 — 좌/우 부호를 갖는 유일한 평면이다.
- `faceScale` = `|midfaceRight − midfaceLeft|`.

| 지표 키 | 필요 그룹 | 식 (local vertex, 무차원) | L/R |
|---|---|---|---|
| `noseLength` | nasion + noseTip(기존) | `dist(centroid(nasion), centroid(noseTip)) / faceScale` | 단일 |
| `nasalBridgeStraightness` | noseBridgeMidline | nasion중심→noseTip중심 3D 직선에 대한 중앙선 점들의 **잔차 RMS / faceScale** (0 = 완전 직선) | 단일 |
| `nasalAxisDeviation` | noseBridgeMidline | 중앙선 점들의 **중선 평면 부호거리 평균 / faceScale** (양수 = 피사체 왼쪽으로 치우침) | 단일(부호) |
| `alarWidth` | alarLeft + alarRight | `dist(centroid(alarLeft), centroid(alarRight)) / faceScale` | 단일 |
| `malarProjectionLeft` / `Right` | malarApexLeft / Right | ROI 내 각 vertex의 `SignedPlaneProjection(v, midfaceOrigin, midfaceNormal, faceScale)` **최댓값** — 추가 나눗셈 금지 | **2지표(평균 금지)** |

- 신규 헬퍼 2개(B1에서 구현): ① `NormalizedDistance(a, b, faceScale)`,
  ② `LineFitResidualRms(points, faceScale)` (최소자승 3D 직선, 반환 전 1회만 정규화).
- 그룹 부재(g1 맵) 또는 표본 부족 시 해당 지표는 **null** — 프레임 finite 계약은
  "존재하는 지표만 finite"로 완화한다(`Face3DProfileCollector` Tier-2 optional 집계).

## 3. 데이터·코드 lockstep 체크리스트 (B1)

한 커밋에서 함께 움직여야 하는 지점 — 하나라도 빠지면 v1 회귀 또는 조용한 미노출:

1. Unity: `Face3DSemanticMap.cs`(optional 분기·disjointness) ·
   `Face3DMetricEvaluator.cs`(중선 평면 + 헬퍼 2개) ·
   `Face3DContracts.cs`(신규 키 nullable 직렬화, `IsFinite`는 기본 5지표만 유지) ·
   `Face3DProfileCollector.cs`(optional 집계).
2. **live 자산 + 로더**: template(`docs/face3d/ARKitFaceSemanticMapV1.template.json`)뿐
   아니라 live 리소스 `Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json`
   (mapId `arkit-face3d-g1-reviewed-v1`)과 `Face3DSessionController.cs` 로더 경로
   (`SemanticMapResourcePath`) 기준으로 **g1 맵이 신규 그룹 없이 로드 통과**함을
   회귀 테스트로 증명. g2 전환 = live 리소스 교체 + mapId 갱신 + receipt.
3. RN: `face-3d/types.ts`를 3-리스트로 분리 —
   `FACE_3D_REQUIRED_METRIC_KEYS`(기존 5) / `FACE_3D_OPTIONAL_METRIC_KEYS`(Tier-2 6) /
   `FACE_3D_EXPOSED_METRIC_KEYS`(B2 pass 화이트리스트). `Face3DMetrics`는
   required Record + optional Partial 교차 타입. `Face3DMetricGrid`는 exposed 순회.
   `face3DContract.ts` 파서는 신규 키 optional 파싱 + **v1 프로필 파싱 회귀 테스트**.
4. 오프라인: `semantic-candidate-core.mjs`/`evaluate-semantic-candidate.mjs` SEED 기하
   line-parity, `Face3DCoreTests.cs`, `test-evaluate-semantic-candidate.mjs`.
5. 선택(같은 재빌드 편승): `FinishSession`에서 ARSession 비활성화 — A0 lease의
   "로딩 중 카메라 재점등" 제거. AR 필터 흐름 세션 재시작 비용 검증 후에만.

## 4. 승인·노출 사이클 (B2)

1. 시드 정의 → 기기 캡처: ① 오버레이 3명×(neutral/yaw L/R) ② **반복성 3명×3 neutral(별도 세트)**.
2. candidates → diagnostics(sanity) → validate(재투영) → review-board → 사람 오버레이
   검수 → 매니페스트(3명 attest) → approve → **g2 mapId** + receipt.
3. `analyze-repeatability` **강화판**: 매니페스트 검증에서 정확히 **피험자 3명 ×
   각 3 neutral 캡처**를 강제(미달·초과·비-neutral → 실행 거부). 산출된 지표별
   pass만 `FACE_3D_EXPOSED_METRIC_KEYS`에 편입하고 `FACE3D_GATE_STATUS.json`에 기록.
4. 실기기(B3, 사용자): UnityFramework 재빌드 → events.jsonl로 신규 지표 finite·수집
   확인 → g2 전환. 그 전까지 프로덕션은 g1 + 신규 지표 null.

## 5. 제외·경계 (재확인)

- 콧볼(오블리크 각도 의존)·광대는 confidence 하향 라벨로 노출한다.
- 눈밑/팔자 등 국소 굴곡, 절대 mm, 안구·지방량·이중턱은 이 계약 범위 밖(기존 판정 유지).
