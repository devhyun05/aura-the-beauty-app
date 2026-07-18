# AR 맞춤 핏 계약 v0.2 — 얼굴 측정 기반 개인화 렌더링

상태: 로컬 정적 구현 기준(v0.2 — 2026-07-17 안전 기본값 확정). 그릇과 레인 선택은 고정하고 실제 δ값·자동 적용·실기기 시각 승격은 OFF/PENDING이다.
작성: 2026-07-16, 저장소 정찰 기반 ([보고서 재구성 계획 §5](../superpowers/plans/2026-07-16-face-report-redesign-plan.md))
목적 예시: 미간이 넓은 사용자의 메이크업 생성 시 아이라이너 눈앞머리를 조금 길게 렌더링.
v0.1→v0.2 결정: 스텐실 레인만 우선 구현, 사용자 opt-in 기본 OFF, 기존 생성 계약은 변경하지 않음, `eyelinerInnerExtension`은 계약·직렬화까지 추가하되 δ=0/OFF, 라이브 레인은 후속, `eyelinerInnerLift`는 deprecated 상태로 보존하되 신규 매핑에서 사용 금지.

---

## 1. 전제 — 무엇이 이미 있고 무엇이 없는가 (정찰 결과)

| 있음 (재사용) | 없음 (이 계약의 신설 대상) |
|---|---|
| **핏 시트**: region/role/leafId 셀렉터 + 공간 델타(dx,dy,sx,rot,rules) + 구체성 캐스케이드 — `stencil/src/composer/fitSheets.ts`에 구현 | **측정→델타 매핑 계층** — 측정치가 AR 파라미터에 입력되는 지점이 현재 0 (측정은 보고서로만 흐름) |
| **골드 축**: `eyelinerWingLength`, `eyelinerThickness`, `eyeCornerLift`, `eyeshadowHeight`, `aegyoHeight` 등 — `stencil/src/bridge/types.ts:229-262` | **눈앞머리 수평 연장 축 없음** — `eyelinerInnerLift`는 수직 리프트(dyUp)이자 임시 디버그 필드(제거 예정, regions.ts:1137-1147)라 사용 불가. 신규 `eyelinerInnerExtension` 필요(§7 D-2·D-5) |
| **클램프 유틸**: `clampFitHandleStoredDelta`(`fitHandleContract.ts:138-149`) | 맞춤 프로필의 저장 스키마·수명 규칙, 수동/자동 충돌 규칙 |
| **시트 우선순위 원리**: `applyFitToLayers`가 fitChain(근접 우선)→main을 마지막 append — 배열 끝 = 최하위 폴백 | **measured 자동 시트 주입점 없음** — `FitSheetsState`는 `{sheets, mainId}`뿐이고 적용 체인이 하드코딩. main 뒤 append용 필드/파라미터 1개 확장 필요(§6) |
| **측정 지표**: `faceGeometry2d` 16지표(`interCanthalRatio`, `eyeBrowGapL/R`, `canthalTiltL/R`, `mouthWidthRatio`…) — 캡처 1회 산출 | 라이브 레인의 공간 축 일부(§7 D-2) |

## 2. 데이터 흐름

```
[얼굴 분석 1회]                    [메이크업 적용 시마다]
faceGeometry2d 16지표 ──┐
Face3D 11지표(가용 시) ──┤→ ② 매핑 엔진 → ③ PersonalFitProfile 저장 → ④ 핏 시트 병합 → ⑤ 기존 브리지로 송신
세로3분할·faceLength ────┘   (순수함수)      (AsyncStorage; 서버 sync는 후속/현 범위 밖)        (자동 entry 주입)    (Unity 무변경)
```

- ② 매핑 엔진은 **순수함수** `deriveFitDeltas(measurements) → FitEntry[]` — LLM·네트워크 무관, 결정적. 산출물은 기존 평면 `FitEntry` 형식 그대로(§3).
- ⑤ 스텐실 레인의 **기존 축**을 쓰는 매핑 행은 자동 시트 추가만으로 동작(Unity 무변경). **단 v0.1 정정**: 신설 축이 필요한 행(M-1의 `eyelinerInnerExtension` 등, D-5)은 Unity 파라미터+브리지 필드+직렬화가 선행 — "Unity 무변경으로 시작"은 기존 축 한정 조건부 문장이다.

## 3. 저장 스키마 — PersonalFitProfile v0

```ts
type PersonalFitProfile = {
  schemaVersion: 'aura-personal-fit.v0';
  sourceReportId: string;           // 어느 분석에서 파생됐나 (측정 스냅샷 추적)
  measuredAt: string;               // ISO — 재분석 시 갱신
  entries: PersonalFitEntry[];
};

// v0.1 재정정(3라운드): 실제 FitEntry는 region/role/leafId가 **최상위 평면**이고
// matcher가 e.region/e.role/e.leafId를 직접 읽는다(fitSheets.ts:49·145).
// 중첩 selector 객체(v0.1 초안)는 또 다른 불일치였음 — 디코더 없이 쓰려면 평면 그대로.
type PersonalFitEntry = {
  region: string;                   // FitEntry와 동일 평면 필드 — '.eyelinerUpper' 대응
  role?: string;
  leafId?: string;
  rules: Record<string, number>;    // 골드 축 델타: { eyelinerInnerExtension: +δ }
  provenance: 'measured';           // 수동 조작('manual')과 구분 — §6 충돌 규칙의 키
  basis: {                          // 근거 추적 (보고서 어조 게이트와 동일 사상)
    metric: string;                 // 'interCanthalRatio'
    band: string;                   // 'wide' | 'narrow' | … (매핑 테이블의 조건 밴드)
    mappingVersion: string;         // 매핑 테이블 버전 — δ 개정 시 재산출 판별
  };
};
// 적용 시 FitEntry로의 변환은 basis/provenance 필드 strip만 — 별도 디코더 불필요.
```

- 위치: 클라이언트 AsyncStorage(`aura.personalFit.v0`) 우선, 서버 동기화는 후속(보고서 detail_payload의 measurements 밖 별도 최상위 필드 — 재구성 계획 §1 스키마 규칙의 "별도 필드 숨은 비용 4건" 적용: 프롬프트 pop·목록 strip·camelize·양방향 배선).
- 재분석 시 전량 재산출(부분 갱신 없음 — 단순성 우선).

## 4. 매핑 테이블 형식 (v0 예시 1행 — δ값은 잠정)

| # | 측정 지표 | 조건 밴드 | 셀렉터 | 델타(rules) | 근거 등급 | 상태 |
|---|---|---|---|---|---|---|
| M-1 | `interCanthalRatio` | 상위 밴드(넓은 미간)* | `{region:'eyelinerUpper'}` | `{ eyelinerInnerExtension: +δ₁ }` — **신설 축**(v0.1 정정: 기존 `eyelinerInnerLift`는 수직 리프트+디버그 필드라 부적합, §7 D-5) | C(업계 관행) | 잠정 — 축 신설 후 δ 확정 |

δ 확정 실험 도구는 **스텐실 컴포저의 기존 디버그 슬라이더 패널**(실기기 렌더 실험 — regions.ts의 gold 축 슬라이더가 이미 이 용도)로 진행한다. 사람 육안 비교로 밴드별 δ 후보를 좁힌다.

\* 밴드 경계는 측정 트랙 Phase 4의 자체 분포(mean±SD) 확정 전까지 잠정값 — 매핑 테이블에 `mappingVersion`으로 버전 명시.

**행 추가 규칙** (측정 계획 §9.3 준용): 근거 등급(§5 근거표) 없는 행 금지 · 모든 행은 잠정/확정 상태 표기 · δ 개정은 mappingVersion 증가로만.

## 5. 단위·클램프 규약

- 공간 단위는 기존 관례 준수: 뷰포트 0..1 정규화(fitHandles의 `eyeVp` = 눈꼬리간 거리 스케일) — **눈폭 상대 단위**. 절대 px·mm 금지.
- **rules(골드 축) 델타**는 송신 전 `clampFitHandleStoredDelta` 재사용으로 축별 min/max 클램프 — 측정 이상치가 렌더 파탄으로 이어지는 것을 구조적으로 차단. **v0.1 한정 정정**: 이 helper는 gold rule field 전용 — affine 델타(dx/dy 0..1, sx 하한만, rot 무제한)는 커버하지 않으므로, measured 엔트리가 affine을 쓰게 되면 별도 finite/min/max 계약+테스트 추가(현 매핑 테이블은 rules만 사용 — affine 사용 금지를 기본 규약으로).
- 델타는 **가산(additive)** — 프리셋·수동값 위에 더해지고, 합산 결과도 클램프.

## 6. 우선순위·충돌 규칙

1. **수동이 항상 이긴다**: 사용자가 같은 축을 직접 조작(`manual`)하면 그 축의 `measured` 델타는 무효(세션·저장 모두). 사용자 의도 > 자동 맞춤.
2. 핏 시트 캐스케이드는 기존 규칙 그대로(구체성 겹id > 역할 > 부위, 근접 시트 승리) — measured 자동 시트는 **가장 낮은 우선순위**(적용 체인의 main 시트 뒤)로 삽입. **v0.1 정정**: 이 주입점은 기구현이 아니다 — `applyFitToLayers`가 fitChain+main을 하드코딩하므로 `FitSheetsState`에 자동 시트 참조 필드 1개(또는 함수 파라미터 1개)를 추가하는 소규모 확장이 선행 작업(스토리지 버전 업 동반).
3. 측정 confidence가 낮은 지표(측정 계획 §0-8 해소 전 하드코딩 값 포함)는 매핑 엔진이 해당 행을 **생략**(델타 0이 아니라 미적용 — provenance 오염 방지).

## 7. 확정 기본값과 후속 승격 조건

| # | v0.2 결정 | 후속 승격 조건 |
|---|---|---|
| D-1 | **스텐실 레인 우선**, 라이브 레인 미지원 | 스텐실 실기기 시각 GO 뒤 별도 라이브 설계 |
| D-2 | 라이브 레인용 다운컴파일·Unity 파라미터는 구현하지 않음 | 라이브 레인 제품 요구 승인 |
| D-3 | 기존 Lip/Brow 생성 계약에는 provenance를 추가하지 않고 `PersonalFitEntry.provenance`만 사용 | 생성 계약과 자동 맞춤의 병합 필요성이 입증될 때 스키마 버전 업 |
| D-4 | `"내 얼굴에 맞춤"` 사용자 opt-in 토글, 기본 OFF | 사람 UX 승인 뒤 기본값 재검토 |
| D-5 | `eyelinerInnerExtension` 축을 스텐실 타입·클램프·직렬화에 추가하되 mapping δ=0, 자동 적용 OFF | 실기기 슬라이더 실험으로 non-zero δ 승인 |
| D-6 | `eyelinerInnerLift`는 deprecated로 보존하고 신규 measured 매핑에서 사용 금지 | 기존 소비자 제거가 확인된 별도 cleanup PR |

## 8. 버저닝

- `schemaVersion`(그릇)과 `mappingVersion`(내용물)을 분리 — δ 튜닝은 mappingVersion만 증가, 스키마 변경 시에만 schemaVersion 증가.
- 렌더 재현성: 적용 시점의 (schemaVersion, mappingVersion, sourceReportId)를 룩 저장 시 함께 기록 — "그때 그 맞춤"의 재현 가능.

## 9. 측정 트랙 의존성

- 매핑 밴드 경계는 측정 계획 Phase 4(자체 분포 mean±SD)에 종속 — 그 전까지 모든 행은 잠정.
- confidence 실측화(측정 계획 Phase 1 §3) 전에는 §6-3 생략 규칙이 보수적으로 동작(적용 행이 적음) — 의도된 동작.
