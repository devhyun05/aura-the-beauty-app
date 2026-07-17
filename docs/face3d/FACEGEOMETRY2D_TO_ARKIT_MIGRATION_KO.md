# faceGeometry2d → ARKit+TrueDepth 이관 (보류 기록)

> 상태: **보류(deferred)**. 2026-07-18 조사·기록. 착수 전 이 문서부터 읽으면 재조사 불필요.
> 목적: "정면 얼굴 비율 지표(눈·눈썹·입·턱)를 원근 왜곡 없이 ARKit 3D 메시로 재려던 의도"를
> 나중에 이어가기 위한 현황·근거·해야 할 일 기록.

## 한 줄 요약

`faceGeometry2d`의 16개 지표는 현재 **MediaPipe 478 랜드마크(정지사진 2D)**로 잰다.
의도는 이를 **ARKit 메시(자세 불변 3D)**로 옮겨 원근·yaw 왜곡을 없애는 것. 기술적으로
가능하나, 시맨틱 정점 승인 게이트와 임계값 전면 재보정이 무거워 보류.

## 현재 상황 (2026-07-18 코드 기준)

### 얼굴 특성 측정 축 4개

| 축 | 소스 | 성격 | 이관 대상? |
|---|---|---|---|
| `faceVerticalThirds` | MediaPipe 정지사진 + 헤어라인 세그멘테이션 | 세로 삼등분 비율 | (사용자: 유지) |
| `personalColor` | MediaPipe 정지사진 | 퍼스널 컬러 | (사용자: 유지) |
| `faceGeometry2d` | **MediaPipe 478 랜드마크(IMAGE 모드, 2D)** | 정면 비율·각도 16지표 | **← 이관 대상** |
| `face3d` | **ARKit 메시 + TrueDepth** | 입체 돌출(투영·E-line) 필수5+Tier2 6 | 이미 ARKit |

- 코드: `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts`
  → `requestFaceLandmarks(imageUri)` → Unity homuler MediaPipe **IMAGE 모드**.
- 지표 16종: `apps/mobile/src/features/face-geometry/types.ts` `FACE_GEOMETRY_METRIC_KEYS`
  (browSlope L/R, canthalTilt L/R, eyeBrowGap L/R, eyeOpenness L/R, eyeWidthRatio L/R,
  interCanthalRatio, jawWidthRatio, lipThicknessRatio, lowerJawWidthRatio,
  mouthCornerAsymmetry, mouthWidthRatio).
- 왜곡 보정: 현재 **roll(기울기)만** 수학 보정. yaw·원근 왜곡은 보정 안 됨.
- 소비처: measurements에 저장·백엔드 전송되지만 **새 S1~S7 보고서 UI엔 수치 미노출**.
  백엔드 `services/backend/app/services/openai_analysis.py`(`_safe_face_geometry_prompt_payload`)의
  **AI 서술 프롬프트 재료로만** 사용.

### 왜 ARKit가 아니라 MediaPipe로 갔나 (의도 미반영 원인)

의도를 거부한 게 아니라, ARKit 경로를 **"3D여야만 되는 지표"로 좁혀 설계**한 점진적 결정.

1. **face3d는 투영/깊이 전용으로 선을 그음.** 설계 문서
   `docs/face3d/ARKit_FACE3D_LAB_IMPLEMENTATION_KO.md`의 "확정 경계"·"MVP metric"이 전부
   signed distance·E-line·전후 투영 = "옆으로 얼마나 나왔나". 정면 비율은 처음부터 범위 밖.
2. **시맨틱 맵이 중안면만 덮음.** `apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs`
   에 `noseTip/chin/noseBridge/malar` 인덱스만 존재. **눈·눈썹·입꼬리·턱각 정점 인덱스 없음**
   → 16지표를 ARKit로 계산할 정점 정의 자체가 없음.
3. **정점 추가에 무거운 승인 게이트.** 시맨틱 맵은 topology fingerprint 잠금 +
   "3명 × 정면/좌/우 재투영 수동 승인" gate 통과 자산만 허용
   (`docs/face3d/LOCAL_VALIDATION_RESULT_20260711.md`). 정점 하나 늘릴 때마다 사람 검증 필요.
   → 이미 시맨틱이 정의된 MediaPipe 478점이 훨씬 값쌌음. 코드 주석도 MediaPipe를 "주경로"로 명시
   (`ARKitBlendshapeSource.cs:95`).

## 이관 가능성 — 가능. 의도(왜곡 최소화)는 기술적으로 타당

- **왜곡 근거**: MediaPipe 2D 지표는 원근 투영 왜곡을 받음(얼굴이 yaw로 조금 돌면 눈·턱 너비
  비율이 실제와 달라짐). 현재 roll만 보정. **ARKit 메시는 미터 단위 3D라 자세 불변** →
  3D에서 계산한 비율은 원근·yaw에 강건. 의도가 옳음.
- **재료 있음**: ARKit ARFace = **1220 정점 고정 topology**(눈꼬리·입꼬리·턱각 정점 전부 존재)
  + **blendshape 계수**(eyeBlink/jawOpen/mouth 등 = eyeOpenness·mouth 지표 직접 제공).
  파이프라인에 `Face3DMeshSnapshot.Vertices`로 이미 정점이 들어옴.

## 해야 할 일 (착수 시)

### 방향 3안 (미결정 — 착수 시 사용자 선택 필요)

- **(A) 전면 이관**: 16지표 모두 ARKit 메시로. 가장 정확하나 ①~④ 전부 필요.
- **(B) 부분 이관**: blendshape로 자세 불변 직접 산출되는 지표(eyeOpenness·mouth류)만 먼저
  ARKit로, 각도·비율(canthalTilt·jawWidthRatio 등)은 시맨틱 맵 확장 전까지 MediaPipe 유지.
  → 승인 게이트 없이 착수 가능한 최소 경로.
- **(C) 현행 유지**: 별도 과제로 계속 보류.

### 작업 항목

| # | 작업 | 비용 | 위험 |
|---|---|---|---|
| ① | 시맨틱 맵 확장 — 눈꼬리·눈두덩·눈썹·입꼬리·턱각 정점 인덱스 추가 + **3명 재투영 승인 게이트 통과** | 큼 | 사람 검증 필요 |
| ② | 지표 수식 3D 포팅 — 16지표를 픽셀 2D → 메시 3D 좌표로 재구현 | 중 | — |
| ③ | 임계값 재보정 — 현재 임계값은 **MediaPipe 픽셀 스케일** 기준, 3D로 옮기면 전부 재설정 | 큼 | **게이트 깨짐**(720p 회귀와 동종 위험) |
| ④ | 회귀 검증 — 기존 MediaPipe 값 대비 검증 | 중 | — |

### 착수 전 확인

- TrueDepth 깊이가 실제 관측되는지: 촬영 시 completed 이벤트의
  `sensorProvenance.depthObservedRatio` 로그로 확인(현재 계측 미포함).
  ARKit 메시 자체는 TrueDepth 기반이나 `capturedDepthData` 관측 여부는 별개.

## 비율 지표 계산 방식 (현행 MediaPipe 2D)

출처: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts`
(`computeFaceGeometryMetrics`). 모든 거리는 **정지사진 픽셀 평면의 2D 유클리드 거리**
(`distance()`)이며, roll(기울기)만 사전 보정된 좌표를 쓴다. **yaw·원근 왜곡은 보정 안 됨**
→ ARKit 3D 이관의 핵심 동기.

기준 거리 정의 (MediaPipe 478 인덱스, `landmarkIndices.ts`):
- **faceWidthPx** = dist(234, 454) — 좌우 얼굴 폭(광대 바깥).
- **interCanthalPx** = dist(133, 362) — 양 내안각(눈 안쪽 끝) 거리.
- **eyeWidthRightPx** = dist(133, 33), **eyeWidthLeftPx** = dist(362, 263) — 동측 내안각↔외안각.

| 지표 | 공식 | 분자 / 분모 의미 | 쓰는 인덱스 |
|---|---|---|---|
| `eyeWidthRatioLeft` | eyeWidthLeftPx / interCanthalPx | 왼눈 가로폭 ÷ 양 눈 사이 | 362,263 / 133,362 |
| `eyeWidthRatioRight` | eyeWidthRightPx / interCanthalPx | 오른눈 가로폭 ÷ 양 눈 사이 | 133,33 / 133,362 |
| `interCanthalRatio` | interCanthalPx / faceWidthPx | 양 눈 사이 ÷ 얼굴 폭 | 133,362 / 234,454 |
| `mouthWidthRatio` | dist(61,291) / faceWidthPx | 입꼬리 너비 ÷ 얼굴 폭 | 61,291 / 234,454 |
| `jawWidthRatio` | dist(172,397) / faceWidthPx | 하악(턱선 중간) 폭 ÷ 얼굴 폭 | 172,397 / 234,454 |
| `lowerJawWidthRatio` | dist(148,377) / faceWidthPx | 아래턱(턱끝 근처) 폭 ÷ 얼굴 폭 | 148,377 / 234,454 |
| `lipThicknessRatio` | dist(0,13) / dist(14,17) | 윗입술 두께 ÷ 아랫입술 두께 | 0,13 / 14,17 |

참고(비율 인접 지표):
- `eyeOpennessL/R` = dist(상눈꺼풀,하눈꺼풀) / 동측 eyeWidthPx — 눈 세로 개방도 ÷ 눈 가로폭.
- `ratioMetric(a, b)`는 `a/b`를 담되 분모 0/결측 시 지표 단위 null(격리, `partial_success`).

**핵심**: `mouthWidthRatio·jawWidthRatio·lowerJawWidthRatio·interCanthalRatio`는 전부
**분모가 faceWidthPx(얼굴 폭)**. `eyeWidthRatio`만 분모가 interCanthal, `lipThicknessRatio`만
윗:아랫 두께 상대비(분모도 입술). ARKit 이관 시 이 분모 정의를 3D 메시 폭으로 옮기고
동일 대응 정점을 시맨틱 맵에 승인 등록해야 값이 연속적으로 이어짐.

## 핵심 파일 색인

- 현행 2D 측정: `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts`,
  `.../faceGeometryCore/faceGeometryMath.ts`, `.../landmarkIndices.ts`
- 지표 정의: `apps/mobile/src/features/face-geometry/types.ts`
- ARKit 메시·시맨틱: `apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs`,
  `Face3DMetricEvaluator.cs`, `Face3DContracts.cs`(`Face3DMeshSnapshot`)
- ARKit blendshape: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/ARKitBlendshapeSource.cs`
- 설계·승인 근거: `docs/face3d/ARKit_FACE3D_LAB_IMPLEMENTATION_KO.md`,
  `docs/face3d/LOCAL_VALIDATION_RESULT_20260711.md`, `docs/face3d/TIER2_METRIC_CONTRACT.md`
- 백엔드 소비: `services/backend/app/services/openai_analysis.py`
  (`_safe_face_geometry_prompt_payload`)
