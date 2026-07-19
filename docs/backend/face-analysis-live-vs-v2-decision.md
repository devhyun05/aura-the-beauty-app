# 얼굴분석: 라이브(analyze_text) vs V2 3단계 — 계측·결정 프레임 (Stage 7)

## 배경

- **dev 배포 = V2 3단계 라이브**(`FACE_ANALYSIS_V2_ENABLED=true`), 로컬/프로드 기본값 = OFF → `analyze_text` 단일 호출.
- 두 경로 모두 라이브라, 신뢰성 수정(절단 관측·다운스케일)은 이미 양 경로를 커버한다(Stage 1·4).
- 남은 질문: **V2를 정본으로 굳힐지, 라이브(단일 호출)로 통일할지, perceive+consult 병합 2단계로 갈지.** 이건 코드가 아니라 **실측 데이터로** 정해야 한다.

## 계측 (이미 배선됨)

양 경로가 동일 포맷으로 로그를 남긴다. dev 트래픽만으로 A/B가 가능하다.

```
[aura:bedrock] analysis:metrics durationMs=… inputTokens=… outputTokens=…   # 단일 호출
[aura:bedrock] stage:metrics    durationMs=… inputTokens=… outputTokens=…   # V2 스테이지(측정·인지·컨설팅 각 1줄)
[aura:bedrock] analysis:truncated / stage:truncated maxTokens=…             # 절단 발생
```

## 측정 방법 (사용자 실행)

1. dev(V2 ON)에서 대표 촬영 N건 분석 → CloudWatch/로그에서 `stage:metrics` 3줄 × N을 수집.
2. 로컬 또는 프로드(V2 OFF)에서 동일 입력 N건 분석 → `analysis:metrics` 1줄 × N.
3. 비교 지표:
   - **지연**: V2 = 3 스테이지 durationMs 합(순차) vs 라이브 = 1 durationMs.
   - **토큰 비용**: V2 = 3 스테이지 input+output 합 vs 라이브 = 1회 합.
   - **절단/실패율**: `*:truncated` 및 `FACE_ANALYSIS_*_INCOMPLETE`/`STAGE_OUTPUT_INVALID` 빈도.
   - **품질**: 산출 보고서의 빈 필드·재촬영 유도율.

## 결정 규칙 (제안)

| 관찰 | 권고 |
|---|---|
| V2 지연·토큰이 라이브의 ~2배 이상이고 품질 이득이 불명확 | 라이브로 통일(V2 플래그 상시 OFF), V2 전용 하드코딩 정리 |
| V2 품질(근거·일관성)이 뚜렷이 우수하고 지연이 수용 범위 | V2 정본화, 라이브는 폴백 유지 |
| perceive·consult가 지연의 대부분이고 measure는 저렴 | 2단계 병합(measure 분리 유지 — 사실/해석 경계) 실험 |

## 주의

- A/B는 **실 Bedrock 호출·과금**이 필요해 코드 환경에서 자동 실행하지 않는다. 위 로그 수집으로 대체한다.
- 스테이지별 토큰/duration을 DB에 영속하려면 `analysis_stage_runs` 컬럼 신설(마이그레이션)이 필요하다 — 현재는 로그로 충분하다고 판단해 미실행.
