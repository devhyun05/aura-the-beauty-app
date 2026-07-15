# S1 + 3D 얼굴 분석 AI 보완 파이프라인 설계

- 상태: 사용자 승인 설계
- 작성일: 2026-07-15
- 대상 브랜치: `fix/face-analysis-fix`
- 기준 문서: `/Users/hi/dev/Jungle/ARwithFable/얼굴분석-설계.html`

## 1. 목적

현재 앱의 정면 무표정 촬영(S1)과 ARKit 3D 측정을 유지하면서, 카메라가 산출하지 않는 S1 관찰 가능 항목만 AI가 보완한다. 카메라와 AI의 측정값을 하나의 정본 프로필로 병합한 뒤, 전체 측정값을 근거로 규칙 분석(L1), AI 지각 분석(L2), AI 컨설팅(L3)을 순서대로 생성하고 기존 얼굴 분석 보고서에 점진적으로 추가한다.

핵심 원칙은 다음과 같다.

1. 카메라 실측값은 AI가 다시 측정하거나 덮어쓰지 않는다.
2. AI는 누락됐고 S1 사진에서 관찰 가능한 항목만 구조화해 추정한다.
3. 촬영 범위 밖의 항목은 추측하지 않고 `unmeasured`로 기록한다.
4. L1 규칙 분석은 결정적 코드로 계산하고, L2와 L3만 AI가 생성한다.
5. L2는 카메라와 AI 측정이 병합된 전체 프로필을 입력으로 받는다.
6. 기존 보고서는 즉시 표시하고 AI 단계가 끝날 때마다 결과를 덧붙인다.

## 2. 범위

### 2.1 포함

- S1 정면 무표정 사진 1장
- 현재 촬영 품질 게이트
- 현재 얼굴 세로 비율 측정
- 현재 2D 얼굴 기하 16지표
- 현재 ARKit 3D 필수 5지표와 조건부 Tier-2 지표
- 현재 온디바이스 퍼스널 컬러 측정
- S1 사진에서 확인 가능한 AI 보완 측정
- 카메라·AI 측정 병합
- L1 규칙 라벨
- L2 AI 피부·외관·인상·퍼스널 컬러 분석
- L3 메이크업·헤어·패션·촬영 컨설팅
- 기존 얼굴 분석 보고서에 출처와 신뢰도를 포함한 결과 표시
- 단계별 저장, 캐시, 재시도, 실패 격리

### 2.2 제외

다음 항목은 필요한 샷이 없으므로 AI가 S1에서 억지로 추정하지 않는다.

- S2 스마일 변화: 입꼬리 상승 벡터, 치아·잇몸 노출 변화, 웃을 때 입술·볼륨·비대칭 변화
- S3/S4 회전 스윕 기반 전체 측면 실루엣과 두상 곡률
- S5 헤어를 완전히 드러낸 상태가 필요한 헤어라인·귀 정밀 계측
- S6 목 길이·두께, 승모근, 턱–목 연결
- S7 키 대비 얼굴 크기
- 디지털 드레이핑을 전제로 하는 퍼스널 컬러 최종 확정

이 항목들은 `unmeasured`로 남기며 보고서에서는 필요 샷이 없다는 사유를 표시할 수 있다.

## 3. 현재 카메라 측정의 권위 범위

다음 값은 기존 온디바이스 결과를 그대로 사용한다.

### 3.1 얼굴 세로 비율

- H/G/Sn/Me 기준점과 신뢰도
- 상·중·하안부 픽셀 길이, 정규화 비율, 표시 비율
- 얼굴 높이, 너비, 세로·가로 비율
- pitch, roll, yaw 품질값
- roll 보정 결과
- 상태, 사유, 경고

### 3.2 2D 얼굴 기하

- 좌우 눈썹 기울기
- 좌우 눈꼬리 기울기
- 좌우 눈–눈썹 간격
- 좌우 눈 뜬 정도
- 좌우 눈 너비 비율
- 미간 비율
- 턱 너비 비율
- 하관 너비 비율
- 입술 두께 비율
- 입 너비 비율
- 입꼬리 비대칭
- pose, roll 보정, 상태, 지표별 경고

### 3.3 3D

필수 5지표:

- 코끝 돌출도
- 턱끝 돌출도
- 윗입술–E-line 관계
- 아랫입술–E-line 관계
- 중앙부 종합 돌출도

조건부 Tier-2 지표:

- 코 길이
- 콧대 직선성
- 코축 편차
- 콧볼 폭
- 좌우 광대 돌출도

각 지표의 값, 단위, confidence, MAD, 유효 프레임 수를 그대로 유지한다.

### 3.4 퍼스널 컬러

- 피부·머리카락·입술 Lab/LCh와 품질
- 온도, 명도, 채도, 청탁, 대비 5축
- 피부–머리카락/입술 명도차와 색차
- 12톤 확률·거리, 1·2순위 톤, 계절, 혼합 여부
- 측정 confidence, 상태, 경고
- 흰자와 카메라 WB 기반 조명 보정 결과

## 4. 측정 정본과 병합 규칙

### 4.1 공통 측정 봉투

```ts
type MeasurementSource = 'landmark' | 'pixel' | 'depth' | 'ai';
type MeasurementStatus = 'measured' | 'estimated' | 'unmeasured' | 'blocked';
type MeasurementShot = 'S1' | 'FACE3D';

interface MetricEnvelope<T> {
  value: T | null;
  unit?: 'mm' | 'deg' | 'ratio' | 'lab' | 'score' | 'label';
  confidence: number;
  source: MeasurementSource;
  status: MeasurementStatus;
  shots: MeasurementShot[];
  sensitivity: 0 | 1 | 2 | 3;
  reason?: string;
  warnings: string[];
  derivedFrom?: string[];
}
```

AI가 추정한 값은 `source: 'ai'`, `status: 'estimated'`, `shots: ['S1']`을 강제한다. 정면 사진과 별도로 수집한 ARKit 3D 값은 `shots: ['FACE3D']`로 기록한다. 두 입력을 함께 소비한 파생 결과는 두 근거를 모두 기록할 수 있다. 촬영 범위 밖이거나 사진에서 확인할 수 없으면 `value: null`, `status: 'unmeasured'`, `reason`을 반환한다.

### 4.2 권위 우선순위

```text
유효한 카메라 실측 > 유효한 AI 추정 > 미측정
```

- 카메라 값이 존재하고 품질 기준을 통과하면 AI 값은 생성하지 않는다.
- 카메라 값이 `null`, `blocked`, 스키마 오류 또는 기준 confidence 미만이면 누락 목록에 포함할 수 있다.
- AI는 기존 키를 반환하더라도 서버 병합기가 무시하고 충돌을 기록한다.
- 값 없음과 낮은 신뢰도를 구분한다.
- 병합은 서버의 결정적 함수가 수행한다. 모델에게 병합을 맡기지 않는다.

### 4.3 측정 커버리지 계획

서버는 AI 호출 전에 `MeasurementCoveragePlan`을 만든다.

```ts
interface MeasurementCoveragePlan {
  authoritativeKeys: string[];
  missingObservableKeys: string[];
  outOfScopeKeys: string[];
  blockedKeys: Array<{key: string; reason: string}>;
}
```

- `authoritativeKeys`: AI 재측정 금지 목록
- `missingObservableKeys`: AI가 S1에서 보완할 키
- `outOfScopeKeys`: S2~S7 또는 드레이핑이 필요한 키
- `blockedKeys`: 품질 문제로 보류된 키

## 5. AI 보완 측정 범위

AI는 카메라가 이미 제공한 키를 제외하고 다음 S1 관찰 가능 항목을 보완한다. 숫자 정밀도가 보장되지 않는 항목은 연속값을 가장하지 않고 등급·형태·분포와 confidence를 반환한다.

### 5.1 눈·눈썹·입

- 눈머리 개방 형태
- 홍채 상·하 노출 유형
- 눈 개구 대비 홍채 비율 유형
- 상·하안검 곡률 유형
- 흰자–홍채 명도 대비
- 눈썹 길이 유형, 산 위치, 아치 높이
- 좌우 눈·눈썹 높이 차 보완 관찰
- 윗입술·아랫입술 두께 유형
- 큐피드보우 형상
- 입꼬리 시각적 인상
- 속눈썹 방향·밀도
- 눈썹 결·밀도
- 쌍꺼풀 유무·형태·두께·라인 안정성
- 몽고주름과 애교살

### 5.2 코·인중·윤곽

- 콧구멍 노출 유형과 좌우 차
- 코끝 피부 두께감과 콧볼 살성
- 인중 길이·또렷함의 시각적 보완값
- 이마·광대·턱끝의 상대 폭 유형
- 하악각 유형
- 오안 균형 보완값
- 부위별 좌우차 관찰 세트
- 얼굴 외곽선 강도

카메라 3D 값이 있는 돌출도, E-line, 코 길이·폭·직선성은 AI가 다시 산출하지 않고 분석 근거로만 사용한다.

### 5.3 색·피부 외관

- 이마·볼·코·턱의 피부 톤 균일도와 상대 색차
- 홍조 위치맵
- 다크서클 색 유형
- 입술 라인색
- 눈썹·눈동자 상대 색
- 피부–머리–눈동자–눈썹 상대 대비 보완값
- 피부결
- 모공 크기·형태·분포
- 피지감·건조감
- 유분·광 분포
- 광택 타입
- 피부 두께감
- 탄력감
- 색소침착·잡티·기미·주근깨 분포
- 점·흉터 맵

의학적 질환, 나이, 민족, 건강 상태를 추론하지 않는다.

### 5.4 S1에서 허용하지 않는 AI 측정

- 실제 mm 단위 깊이·거리의 임의 추정
- 전체 측면 프로파일
- 두상·귀·목·신체 비율
- 스마일 변화
- 치아·잇몸 동적 노출
- 드레이핑 반응

현재 3D가 제공하지 않는 깊이 항목은 정밀 수치가 아니라 `estimated` 시각 라벨만 허용하거나 `unmeasured`로 남긴다.

## 6. 처리 파이프라인

### 6.1 단계 0 — 기존 측정과 커버리지 계산

1. 모바일이 기존 `requestPayload.measurements`를 전송한다.
2. 백엔드가 소유 미디어와 측정 스키마를 검증한다.
3. 카메라 측정값을 공통 봉투로 정규화한다.
4. 커버리지 계획을 생성한다.
5. S1 사진 해시, 측정 스키마 버전, 모델 버전으로 단계 입력 해시를 만든다.

### 6.2 단계 1 — `ai_measurement`

입력:

- S1 사진
- `MeasurementCoveragePlan`
- 기존 카메라 측정값
- 카메라 값은 참고용이며 재측정 금지라는 명시적 지시
- 강제 구조화 출력 스키마

출력:

- `missingObservableKeys`에 대한 `MetricEnvelope`
- 사진 품질 관찰
- 미측정 사유
- 입력 키 외의 항목을 만들지 않았는지 검증할 수 있는 키 목록

서버는 출력 스키마와 허용 키를 검증한 뒤 카메라 결과와 병합해 `faceProfile`을 만든다.

### 6.3 단계 1.5 — L1 결정적 분석

AI 호출 없이 `faceProfile`에서 다음 라벨을 계산한다.

- 얼굴형
- 상·중·하안부 및 오안 균형
- 눈매와 눈썹 형태
- 홍채 노출 유형
- 언더톤, 명도, 채도, 대비 유형
- 홍조·다크서클 색 유형
- 코·인중·입술 비율 라벨
- 비대칭 내부 점수
- 광대 유형과 E-line 라벨(근거가 있을 때)

임계값과 규칙 버전을 결과에 기록한다. 민감도 3인 비대칭 종합 점수와 황금비 편차는 사용자에게 직접 노출하지 않는다.

### 6.4 단계 2 — `ai_perception`

입력:

- S1 사진
- 병합 완료된 `faceProfile`
- L1 `derived` 결과
- 민감도·표현 정책

출력은 다음 구조를 갖는다.

```ts
interface PerceptionResult {
  skin: {
    texture: Insight;
    pores: Insight;
    sebumDryness: Insight;
    shineDistribution: Insight;
    shineType: Insight;
    pigmentation: Insight;
    redness: Insight;
    darkCircles: Insight;
    toneUniformity: Insight;
  };
  featureImpression: {
    eyeImpression: Insight;
    eyelidWeight: Insight;
    underEyeZone: Insight;
    browImpression: Insight;
    lipImpression: Insight;
  };
  linesAndPlanes: {
    lineShape: Insight;
    lineWeight: Insight;
    dimensionality: Insight;
    contourDefinition: Insight;
    noseShadowEffect: Insight;
    noseCheekConnection: Insight;
    lowerFaceImpression: Insight;
    jawlineDefinition: Insight;
  };
  gestalt: {
    perceptualCenter: Insight;
    featurePresenceRanking: Insight;
    detailDensity: Insight;
    negativeSpace: Insight;
    centerVsOuter: Insight;
    clarityVsSoftness: Insight;
    overallMood: Insight;
    standoutFeatures: Insight[];
  };
  volume: {
    upperLowerDistribution: Insight;
    visibleHollows: Insight[];
    mouthCornerImpression: Insight;
  };
  personalColor: {
    status: 'provisional' | 'insufficient';
    season: string | null;
    subtype: string | null;
    borderTone: string | null;
    rationaleMetricKeys: string[];
  };
}
```

`Insight`는 `label`, 짧은 설명, confidence, 근거 측정 키, sensitivity를 포함한다. L2는 새로운 측정값을 만들지 않는다.

드레이핑이 없으므로 퍼스널 컬러는 `provisional` 또는 `insufficient`만 허용한다.

### 6.5 단계 3 — `ai_consulting`

입력:

- `faceProfile`
- L1 `derived`
- L2 `perception`
- 사용자에게 노출 가능한 항목만 남긴 정책 적용 결과

사진은 다시 보내지 않는다.

출력:

- 메이크업 핏: 눈썹, 아이라이너, 블러셔, 컨투어, 하이라이트의 공간 가이드
- 색·제품: 립색, 베이스 톤, 컨실러, 파우더 존, 미백 계열 팁
- 추천 룩 참조와 선택 근거
- 헤어: 기장, 컬, 가르마, 염색색
- 패션: 네크라인, 안경테, 액세서리 톤, 팔레트
- 촬영 팁: 조명과 각도
- 추천별 근거 측정 키

컨설팅은 시술·질환·외모 비하 표현을 사용하지 않는다.

## 7. 저장 모델

### 7.1 `analysis_reports.detail_payload`

기존 저장 형식을 유지하면서 `result`를 확장한다.

```json
{
  "request": {
    "measurements": "기존 카메라 원본",
    "...": "기존 요청"
  },
  "result": {
    "...": "기존 호환 필드",
    "faceAnalysisV2": {
      "schemaVersion": "aura-face-analysis-v2",
      "coverage": {},
      "aiMeasurements": {},
      "faceProfile": {},
      "derived": {},
      "perception": {},
      "consulting": {},
      "pipeline": {}
    }
  }
}
```

기존 `faceShape`, `skinType`, `personalColor`, `recommendedMood`, `summary`, `makeupGuideline`은 `faceAnalysisV2`에서 파생해 계속 채운다. 구버전 모바일과 API 소비자를 깨뜨리지 않는다.

목록 응답은 대형 측정·AI 원본을 제외하고 요약과 단계 상태만 제공한다. 상세 조회는 전체 정규화 결과를 반환한다.

### 7.2 AI 실행 이력

단계별 실행과 재시도를 위해 `analysis_stage_runs`를 추가한다.

```text
id
report_id
stage                 ai_measurement | ai_perception | ai_consulting
status                pending | processing | completed | partial | failed
schema_version
model
input_hash
normalized_output     jsonb
raw_response           jsonb
error_payload          jsonb
attempt_count
started_at
completed_at
created_at
updated_at
```

동일 `report_id + stage + input_hash + schema_version`의 완료 결과를 캐시로 재사용한다. 새 모델이나 스키마로 명시적 재분석할 때만 새 실행을 만든다.

- `(report_id, stage, created_at desc)` 조회 인덱스를 둔다.
- `(stage, input_hash, schema_version, model)` 완료 결과 검색 인덱스를 둔다.
- 한 보고서에서 동일 단계의 `processing` 실행은 하나만 허용해 중복 워커 실행을 막는다.
- 재시도 이력은 기존 행을 덮지 않고 새 실행 행으로 보존한다.

DB 변경 시 `docs/backend/schema.sql`과 `docs/backend/aws-postgresql-schema.dbml`을 함께 갱신한다.

## 8. API와 상태 모델

기존 `POST /analysis/jobs`가 보고서를 생성하고 파이프라인을 시작한다. 응답은 기존 `job`에 단계 상태를 추가한다.

```ts
interface FaceAnalysisPipelineState {
  aiMeasurement: StageState;
  aiPerception: StageState;
  aiConsulting: StageState;
  overall: 'processing' | 'partial' | 'completed' | 'failed';
}
```

- 카메라 결과가 저장되면 보고서 상세는 즉시 조회 가능하다.
- 모바일은 현재 폴링 흐름을 유지하되 전체 완료만 기다리지 않는다.
- 단계가 완료될 때마다 상세 결과를 다시 받아 해당 섹션을 추가한다.
- 특정 단계 재시도 API는 동일 입력 해시를 재사용하거나 실패 실행만 재개한다.
- 보고서 전체 삭제 시 단계 실행 이력도 함께 삭제하거나 보존 정책에 맞춰 익명화한다.

## 9. 보고서 구성

### 9.1 화면 순서

1. 기존 보고서 히어로와 요약
2. 카메라 측정 결과
3. AI 추가 측정
4. 통합 구조·색상 분석(L1)
5. 피부·외관·인상·퍼스널 컬러 분석(L2)
6. 메이크업·헤어·패션·촬영 컨설팅(L3)
7. 추천 메이크업과 기존 액션

### 9.2 출처 표시

- `카메라 실측`: landmark, pixel, depth
- `AI 추정`: AI가 S1 사진으로 보완
- `측정 보류`: confidence 미달 또는 품질 문제
- `미측정`: 필요한 샷이 없음

AI 값과 카메라 값이 같은 카드에서 섞이더라도 각 항목에 출처를 표시한다. 카메라 실측을 AI 문장으로 다시 포장해 중복 카드로 만들지 않는다.

### 9.3 점진적 표시

- 카메라 측정은 즉시 표시
- `ai_measurement` 처리 중에는 AI 측정 섹션 스켈레톤 표시
- `ai_perception` 완료 시 분석 섹션 추가
- `ai_consulting` 완료 시 컨설팅 섹션 추가
- 한 단계 실패 시 다른 완료 섹션은 유지
- 사용자는 보고서를 나갔다가 다시 들어와도 저장된 단계 상태를 이어서 본다

### 9.4 민감도

- 민감도 0: 기본 노출
- 민감도 1: 컨설팅 톤으로 기본 노출
- 민감도 2: 기본 비노출, 자세히 보기에서 옵트인
- 민감도 3: 내부 근거 전용, 직접 노출 금지

개발 모드는 전체 항목을 출처·confidence와 함께 확인할 수 있다.

## 10. 실패와 품질 처리

### 10.1 부분 실패

- AI 측정 일부 실패: 성공 키만 병합하고 나머지는 `unmeasured`
- AI 측정 전체 실패: 기존 카메라 보고서를 유지하고 L1 가능한 범위만 표시
- L2 실패: 측정과 L1 결과는 유지
- L3 실패: 측정·분석 결과는 유지하고 컨설팅만 재시도 가능
- 모델 출력 스키마 오류: 1회 구조화 재시도 후 해당 단계를 `failed`

### 10.2 신뢰도

- 모델의 자기 confidence만 사용하지 않는다.
- 사진 품질, 가림, 조명, 해당 부위 가시성, 카메라 측정과의 일관성을 서버에서 함께 평가한다.
- threshold 미만은 값 대신 측정 보류로 표시한다.
- AI가 `authoritativeKeys`를 반환하면 병합하지 않고 관측 오류로 기록한다.

### 10.3 타임아웃과 재시도

- 단계별 타임아웃과 재시도 횟수를 독립적으로 둔다.
- 재시도는 동일 입력 해시로 멱등성을 보장한다.
- 컨설팅 재생성은 측정과 L2를 다시 실행하지 않는다.
- 모델·프롬프트·스키마 버전이 바뀐 경우에만 캐시를 무효화한다.

## 11. 개인정보와 안전

- 사용자 인증과 미디어 소유권 검증을 통과한 사진만 AI에 전달한다.
- 로컬 `file://` 경로, 디버그 아티팩트, privacy 마커는 업로드하지 않는다.
- AI 원응답에는 사용자 식별 정보를 포함하지 않는다.
- 얼굴 사진과 AI 실행 이력은 보고서 삭제 정책에 포함한다.
- 피부 결과는 미용 관찰이며 의료 진단이 아니라는 경계를 유지한다.
- 민감도 2·3 항목은 L2→L3 경계와 보고서 렌더 직전에 모두 필터링한다.

## 12. 관측성과 버전 관리

단계별로 다음을 기록한다.

- reportId, stageRunId, stage, status
- inputHash, schemaVersion, promptVersion, model
- durationMs, attemptCount, cacheHit
- requestedMetricCount, returnedMetricCount, acceptedMetricCount
- rejectedAuthoritativeKeyCount, unmeasuredCount
- validationErrorCode
- 토큰·이미지 비용 메타데이터

로그에는 얼굴 사진 URL, 원본 측정 전체, AI 원문을 직접 남기지 않는다.

## 13. 테스트 전략

### 13.1 모바일 계약

- 기존 카메라 측정 payload가 손실 없이 전송되는지
- `faceAnalysisV2` 응답 매핑과 구버전 응답 폴백
- source/status/confidence 렌더링
- 단계별 pending/completed/partial/failed 화면
- 민감도 2 옵트인과 민감도 3 비노출
- 과거 보고서 상세 재진입 시 AI 섹션 복원

### 13.2 병합기와 규칙 엔진

- 카메라 값이 AI 값보다 항상 우선하는지
- AI가 권위 키를 반환해도 덮어쓰지 않는지
- 누락, blocked, 저신뢰도 차이를 보존하는지
- 동일 입력에서 L1 결과가 결정적인지
- 촬영 범위 밖 키가 항상 `unmeasured`인지

### 13.3 백엔드 계약

- 측정값과 AI 단계 결과가 신뢰화 필터를 통과해 저장되는지
- 각 단계 DB 갱신이 기존 `request.measurements`를 보존하는지
- 목록은 경량화하고 상세는 전체를 반환하는지
- 단계 재시도와 input hash 캐시가 멱등적인지
- 사용자 간 보고서·미디어 접근이 차단되는지
- 보고서 삭제 시 단계 이력과 미디어 정책이 적용되는지

### 13.4 AI 평가

- 고정된 익명화 S1 평가 세트로 구조화 출력 성공률 측정
- 카메라 권위 키 재측정 위반률 0% 확인
- 비가시 항목 환각률 측정
- 근거 키가 실제 입력에 존재하는지 검증
- 동일 입력 반복 시 라벨 안정성 측정
- 민감 표현·의료 표현·시술 유도 회귀 검사

## 14. 출시 순서

1. 공통 측정 봉투, 커버리지 계획, 결정적 병합기
2. AI 단계 실행 저장소와 상태 API
3. `ai_measurement` 구조화 호출과 평가
4. L1 규칙 엔진 확장
5. `ai_perception` 구조화 호출
6. 보고서 점진적 렌더링과 민감도 필터
7. `ai_consulting` 텍스트 호출
8. 캐시·재시도·관측성 강화
9. 제한된 개발 모드 데이터로 품질 검증 후 출시 노출 활성화

## 15. 완료 기준

- 카메라 측정값이 AI에 의해 다시 생성되거나 덮어써지지 않는다.
- S1 범위 밖 항목이 AI 값으로 채워지지 않는다.
- AI L2는 병합 완료된 전체 측정 프로필과 L1 결과를 입력으로 받는다.
- 기존 보고서가 AI 단계 실패와 무관하게 계속 동작한다.
- AI 결과가 단계별로 저장되고 보고서 재진입 시 복원된다.
- 각 결과에 출처, 상태, confidence, 근거 키가 있다.
- 민감도 정책이 백엔드 컨설팅 입력과 모바일 렌더 양쪽에서 적용된다.
- 모바일 타입체크와 관련 계약·백엔드 테스트가 통과한다.
