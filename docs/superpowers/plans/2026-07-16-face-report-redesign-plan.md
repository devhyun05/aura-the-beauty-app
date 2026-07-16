# 얼굴 보고서 재구성 계획 (2026-07-16)

상태: 초안 — 저장소 정찰(4갈래 워크플로) 기반, 팀 검토 대기
브랜치: `docs/WEI/face-measurement-plan-0716`
자매 문서: [측정·분석 개선 계획](2026-07-16-face-measurement-analysis-plan.md) — 측정 트랙. 본 문서는 **보고서 트랙**(내용 재구성·Lab·UI·AR 인터페이스).
산출물: [보고서 UI 디자인 요청 프롬프트](2026-07-16-report-ui-design-prompt.md) · [AR 맞춤 핏 계약 초안](../../faceData_WEI/AR맞춤핏-계약초안-v0.md)

---

## 0. 결정 요약

| # | 결정 | 근거 |
|---|---|---|
| 1 | 목차는 부록 7섹션으로 재구성. R0 = **V2 데이터 공급 확보 + DTO 배선**(기존 컴포넌트 직마운트 금지) | V2 파이프라인은 2026-07-16에야 머지된 opt-in 기능(기본 OFF) — 과거 잡 데이터 부재는 가설(R0 쿼리로 확정, §1). 기존 V2 컴포넌트는 원시값·%를 렌더해 원칙 4 위반(§1) |
| 2 | 작업 순서 = **계약 고정 후 병렬** — 단 fixture 동결만으로는 부족, **4대 경계(파일 소유권·스키마 단일 창구·문구 소유·좌표 프레임) 선행**(§2) | 셀프 검증에서 같은 파일 4곳 겹침·문구 3소스 경합 실증 |
| 3 | Report Lab = **독립 웹앱 + 로컬 FastAPI** — 단 "로컬"은 HTTP·DB 표면뿐, 스테이지 실행·사진 읽기는 라이브 AWS(Bedrock·S3) 의존. **파일 기반 fixtureId를 1급 시민으로, 운영 DB/S3+인증 해제 조합 금지**(§3) | S3 endpoint 하드코딩·compose는 postgres뿐·매 run 실과금(§3.1) |
| 4 | 부위 확대 = **SVG viewBox 확대**, 좌표는 분석 시점 산출·저장. 스키마는 **v1 유지 + optional 키**(버전 업 아님) | "v1 키 동결"은 face3d 5지표 계약의 오인용 — 어떤 파서도 미지 키를 거부하지 않음(§4.1) |
| 5 | AR 맞춤 = **핏 시트를 표준 컨테이너로 채택** — 단 "매핑 계층만 신설"은 과소평가: 신규 수평 축(D-5)·measured 시트 주입점·평면 FitEntry 저장 계약이 추가 범위(계약 v0.1) | eyelinerInnerLift는 수직 리프트+디버그 필드로 판명(Codex 검증) |

## 1. 새 목차 ↔ 데이터 매핑

**정찰 발견(셀프 적대 검증으로 2026-07-17 정정)**: `FaceAnalysisV2ReportSections`(AI 보완측정 53키·해석 9종·인상·컨설팅 렌더 가능)가 **렌더 소비 0인 dead 컴포넌트**인 것은 사실이다(전 저장소 import 0건 — 비렌더 소비는 2종: 폴링 조기종료 게이트 + recommendedMakeups fallback 분기). **그러나 초안의 "데이터가 이미 내려오는데 버려진다"는 저장소 증거상 거짓** — `FACE_ANALYSIS_V2_ENABLED` 기본 false이고 저장소·배포 워크플로 어디에도 ON이 없으며, V2 파이프라인 자체가 2026-07-15 작성·07-16 머지(PR #16)다. "과거 잡에 V2 데이터 부재"는 **가설**로 표시(라이브 ECS env·과거 DB는 저장소 밖 — 콘솔 수동 설정 가능성 잔존): R0 사전 쿼리(아래 1)와 배포 env 확인 결과를 evidence로 첨부해 확정한다. 따라서 R0의 실체는:

1. **데이터 공급**: 플래그 ON 로컬 백엔드 기동 → 신규 잡 1건 생성(또는 07-13 이후 measurements 보유 잡을 retry — 플래그 OFF면 409). 착수 전 DB에서 `detail_payload->'request'->'measurements'->>'schemaVersion'` 실측 카운트 1회.
2. **소비 지점 제약**: 목록 GET은 faceAnalysisV2의 coverage/derived 등을 **벗겨서 내려주므로**(경량화 strip) 배선은 **상세 GET payload에만** 가능 — 목록·홈에 연결하면 영원히 빈 값.
3. **직마운트 금지(Codex BLOCKER 반영)**: 기존 컴포넌트는 `metricValue`가 소수 3자리·단위·confidence %를 그대로 렌더 — 마운트 즉시 원칙 4 위반. 순서는 **타입 파서 → 표현용 DTO(숫자 없는 서술·밴드 라벨만) → 신규 UI → feature flag 마운트**. 기존 컴포넌트는 Lab/개발 모드 전용으로 강등.

| 목차 | 현존 데이터 (즉시 사용 가능) | 결측 (신규 작업) |
|---|---|---|
| ① 분석 요약 | `recommendedMood`, 요약 4카드(퍼컬·얼굴형·톤·무드), V2 `consulting.overallMood`(≤18자)·`shortSummary`·`recommendedLook` | "핵심 타입 한두 마디" = 얼굴형+퍼컬 조합 네이밍 로직(신규, 소형) |
| ② 얼굴사진+가늠선 | H/G/Sn/Me 4점 + `VerticalThirdsOverlay`(가로 가늠선·밴드, 저장 보고서에서 재렌더 동작 중) | 세로 가늠선·오량(5등분)·부위 마커 — **좌표 미저장**, §4 배관과 동일 작업 |
| ③ 이목구비 분석 | 2D 기하 16지표(눈·눈썹·입·턱) + Face3D 11지표(코·E라인·턱·광대) + AI 보완측정 53키(3라운드 검토로 54→53 정정) + **derived 9해석**(얼굴형/세로균형/눈·눈썹/코·인중·입술/광대·E라인/좌우균형 — 부위별 라벨이 이미 만들어져 옴) | 이마 실측(AI 라벨뿐), 볼 전용 지표(광대 돌출로 대체), 인중 실측(AI 라벨뿐), E라인 2D 폴백(Face3D 성공 세션 한정), 얼굴형 7-class 스코어러(§7.2 미구현 — 현행 서버 룰 4라벨로 임시 대체) |
| ④ 퍼스널 컬러 | **최풍부·결측 없음**: 12타입 전체 확률·5축(value·confidence)·부위 Lab/LCh·대비 관계값·팔레트·조명보정 리포트 | 없음. device-relative(절대 진단 아님) 캡션 유지 필수 |
| ⑤ 체형 분석 | **완성본이 딴 곳에 있음**: 스텐실 AR의 `bodyProfile.ts` — 7문항 설문 → 실루엣 5종+골격 3종 분류 + 타입별 스타일링 콘텐츠, AsyncStorage 영속까지 완비 | face-analysis 연결 0 — 설문 UI 노출 + 보고서 스키마 연결. 저장은 measurements 밖 **별도 최상위 필드**(근거: measurements는 캡처 측정 봉투 — 설문은 성격이 다름. "키 동결 계약" 아님 — 스키마 규칙 참조) + 프롬프트 유입 pop 결정 |
| ⑥ 인상 분석 | 서버 perception이 시각 5블록 + personalColor(총 6블록) 생성 중: skin 9·featureImpression 5·linesAndPlanes 8·gestalt(지각중심·존재감 랭킹·여백·무드)·volume 3 + personalColor — 각 항목 `Insight{label, description, confidence, 근거키}` | 모바일 파서(현재 `Record<string,unknown>`) + 섹션 UI 신규. "우리만의 분석 체계"는 측정 계획 §9(어조 이중 게이트·조합 서술)를 그대로 채택 |
| ⑦ 스타일링 인사이트 | consulting 8부위 가이드 + colorAndProduct·hair·fashion 조언(화면 미노출) + `recommendedLook` **1종** | **내추럴/글램 2종 분리** — `RecommendedLook` 단수를 2종 배열로 백엔드 스키마·프롬프트 확장(또는 recommendedMakeups 2장) |

**스키마 규칙(셀프 검증으로 정정)**: 초안의 "measurements-v1 키 동결 계약"은 **face3d 프로필 5지표 계약(`face-3d/types.ts:1`)의 오인용** — measurements 최상위는 백엔드(알려진 4섹션만 읽음)·모바일(알려진 키만 재구성) 어느 파서도 미지 키를 거부하지 않는다. 따라서:

- **bbox 최저가 경로 = v1 유지 + measurements 내부 optional 키**(4건 변경: encode/decode/프롬프트 제외 pop/15,000자 캡 재확인). 버전 업 선택 시 하드체크 4곳(백엔드 3 + 모바일 파서 strict equality) + v1∪v2 이중 수용이 순수 추가 비용.
- 단 face3d 프로필 **내부** 5지표에는 진짜 동결 계약이 있으므로 bbox를 `face3d.metrics` 안에 넣는 것만 금지.
- **체형(별도 최상위 필드)의 숨은 비용 4건**: ① `_safe_analysis_prompt_metadata`가 신규 필드를 **자동으로 AI 프롬프트에 실음**(제외하려면 pop 추가 — 설문 데이터의 프롬프트 유입 여부 결정 필요), ② 목록 GET 경량화 strip에 미포함이라 목록 비대, ③ 응답 camelize 재귀 변형 대비 키 네이밍, ④ 모바일 인코드·복원 양방향 배선 신설.

## 2. 작업 순서 — 계약 고정 후 병렬 (직렬 기각)

1. **역방향 의존이 존재.** §1의 결측 목록(이마·볼·인중·E라인 2D·얼굴형 스코어러)이 측정 확장의 우선순위를 정한다 — 보고서를 미루면 측정 트랙이 뭘 먼저 만들지 모른다.
2. **직렬이면 측정 Phase 1~2(실기기 검증, 수 주)를 보고서가 논다.** 스킬셋도 분리(측정=네이티브/Unity, 보고서=프롬프트/웹/UI).
3. 초안의 근거 "측정 개편은 데이터 형태를 바꾸지 않는다"는 **셀프 검증에서 반박됨** — 측정 트랙 스스로 판정 버저닝(Phase 0-5)·mm 병렬 저장(Phase 2-3)으로 형태를 바꾸고, fixture 봉투 안에 사용자 노출 문구(`interpretation.summary`가 payload에 직렬화·복원)까지 들어 있어 측정 Phase 0-3 문구 개정이 fixture **내용**을 바꾼다. **fixture 동결만으로는 병렬이 성립하지 않는다 — 아래 4대 경계가 선행 조건.**

**병렬 성립의 4대 경계 (fixture 동결에 추가, 셀프 검증 2026-07-17):**

| # | 경계 | 내용 |
|---|---|---|
| B1 | **파일 소유권 배정** | `MeasurementDetailSection` = 보고서 트랙이 철거 소유(측정 Phase 0은 "신규 숫자 차단"까지로 한정 — 측정 계획의 자체 모순도 해소) · `FaceAnalysisReportDetailScreen` = 보고서 트랙 전속(측정 Phase 0 관문 적용 범위에서 명시 위임) · `VerticalThirdsOverlay` **중복 정의 2벌**(공유본 + FaceVerticalThirdsScreen:375-512 로컬본) 통합을 선행 커밋으로 처리 후 R3 소유 |
| B2 | **측정 계약 변경 단일 창구** | bbox(R3)는 v1 optional 키(§1 스키마 규칙), 판정 스냅샷(측정 Phase 0-5)·mm(Phase 2-3)도 같은 창구에서 조율 — 두 트랙이 각자 버전을 올리면 모바일 strict-equality 파서(faceAnalysisMeasurements.ts:1068)에서 상호 파손 |
| B3 | **문구·임계 소유권** | 세로균형 텍스트 슬롯에 **3소스 경합**: 모바일 로컬 규칙(임계 0.08, "평균보다 긴") · 서버 derived(`face_analysis_rules.py` 임계 0.025/1.38/1.2 — 모바일 4중 불일치 밖의 **제5의 상수 세트**) · AI perception(R2). 화면 슬롯별 표시 소스 지정 + 서버 임계를 측정 Phase 0-1 상수 통합에 포함할지 결정 필요 |
| B4 | **bbox 좌표 프레임 계약** | "roll 보정 이전 원본 픽셀 좌표" 보존을 측정 Phase 1 리팩터(보정 위치 네이티브 이동)의 불변 조건으로 등재 — 병렬 창에서 좌표 프레임이 바뀌면 bbox가 사진과 어긋남 |

**실행**: ① fixture 동결(파일 기반 fixtureId — §3.1) + 4대 경계 합의 → ② 두 트랙 병렬 → ③ fixture 재생성 트리거 = 측정 Phase 1 관문 통과 시 **그리고 측정 Phase 0 문구 개정 시**(초안은 후자 누락 — 낡은 '평균' 문구 위에서 R2/R4가 UI를 굳히는 사고 방지).

## 3. Report Lab 웹앱 — 보고서 생성 실험 도구

### 3.1 아키텍처 (정찰 결론)

- **독립 웹앱**(React/Vite 등) + 로컬 FastAPI 직접 호출. 모바일 앱은 `platforms: [ios, android]`로 web 미지원이고 Lab은 카메라가 필요 없음 — 실험 앱 스위치(`EXPO_PUBLIC_AURA_EXPERIMENT_APP`)에 끼울 이유 없음.
- **"로컬"의 실체(셀프 검증 정정)**: docker-compose는 **postgres 하나뿐**이고, S3 클라이언트는 실 AWS 엔드포인트 하드코딩(오버라이드 설정 부재 — localstack/minio 불가), 스테이지 실행은 **매 run 실 Bedrock 호출·과금**(apac inference profile 필수). 즉 HTTP·DB 표면만 로컬이고 사진 읽기·AI 실행은 라이브 AWS 의존. 추가 환경 전제: 실 AWS 자격(s3:GetObject + bedrock:InvokeModel), `S3_BUCKET_NAME`, `IMAGE_GENERATION_PROVIDER` **비활성화**(기본 openai — 잡 재실행 시 이미지 생성 자동 발동·과금), 스키마 부트스트랩(init_db+seed_db).
- **격리 원칙(Codex BLOCKER 반영)**: `AUTH_REQUIRED=false` + 개방 CORS + 실 DB/S3 + 임의 reportId 조합은 `user_id` 소유권 경계를 제거한다 — **금지**. Lab은 ① `127.0.0.1` 바인드 + 전용 `LAB_MODE` 플래그(dev 판정과 별개), ② CORS는 Lab origin 정확 지정, ③ **파일 기반 `fixtureId`를 1급 시민으로**(비식별 스냅샷 디렉터리 — DB 반입·user_id 재작성 우회), ④ 인증 해제 상태로 운영/공유 dev DB·S3 직결 금지(README 기존 금지 조합).
- fixture 형식: presigned URL은 900초 만료라 **URL이 아니라 `bucket`/`objectKey`(+표시용 `cdn_url`)를 저장**. dev RDS에서 스냅샷 1회 추출하는 반출 절차는 신규 작성(기존 스크립트 없음).
- **consult 스테이지는 이미지 불필요(순수 JSON)** → 프롬프트 반복 실험의 최적 시작점. 단 현행 유일 진입로는 stage 무관하게 S3 read를 선행하므로, **신설 lab 엔드포인트가 stage별 이미지 로드를 분기**해야 성립(§3.2 요구사항에 포함).

### 3.2 백엔드 신설 — 실험용 오버라이드 엔드포인트 1개

현행 retry API(`POST /api/analysis/jobs/{id}/retry`)는 스테이지 이름만 받고 오버라이드가 없으며, **캐시가 동일 입력 재실행을 차단**한다(`analysis_stage_runs` 히트 시 즉시 반환 — "같은 입력 N회 반복"이 불가능). 해결:

```
POST /api/lab/analysis/stage-run   (전용 LAB_MODE 플래그 게이트 — auth 설정과 별개)
{
  // 입력 소스 — 모드별 제한(3라운드 검토 반영):
  //   인증 해제(LAB_MODE) 시: fixtureId만 허용(파일 기반 비식별 스냅샷 — 로컬/마스킹 이미지 파일 동봉 가능)
  //   reportId는 정상 인증 + user_id 소유권 확인 모드에서만 허용
  fixtureId | reportId,
  stage: measure|perceive|consult,
  overrides: {
    promptDeveloper?, promptUser?,   // 본문 오버라이드 (현행 face_analysis_ai.py 인라인 하드코딩)
    promptVersion,                   // 필수 — 캐시 키 축이므로 실험마다 유니크하면 캐시 문제가 자연 해소
    model?, maxTokens?, temperature? // temperature는 현재 0.1 하드코딩 — 시그니처 확장 필요
  },
  bypassCache?: boolean
}
→ { runId, rawResponse, normalizedOutput, validationErrors, latencyMs, tokenUsage }
```

- `FaceAnalysisAI`를 프롬프트/버전/세팅 **주입형**으로 리팩터(실험용 서브클래스 가능). 프롬프트 본문은 캐시 키에 안 들어가므로(버전 문자열만) **버전 미변경 프롬프트 수정 = stale 캐시**라는 함정을 Lab UI가 강제로 막는다(프롬프트 변경 시 버전 자동 suffix).
- 엔드포인트 요구사항 추가: stage별 이미지 로드 분기(consult는 S3 read 생략), `LAB_MODE` 플래그 게이트, fixtureId(파일) 입력 경로.
- **실험 기록은 `analysis_stage_runs` 재사용 금지(Codex 반영)** — 이 테이블은 `(report_id, stage)` processing 유니크 제약 + `on conflict do nothing returning *` 구조라, Lab 실행이 **운영 파이프라인의 진행 중 행을 가로채 완료/실패 처리**할 수 있다. **별도 `analysis_lab_runs` 테이블로 분리하되 스키마는 독자 설계**(3라운드 정정: "동일 컬럼" 복제는 `report_id NOT NULL` FK 때문에 fixture-only 실행을 기록할 수 없음) — `fixture_id` 필수 + `source_report_id` **nullable** + 실험 메타(prompt_version·model·overrides).

### 3.3 Lab 화면 구성

| 패널 | 내용 |
|---|---|
| 좌: 입력 | fixture 선택(잡 목록/스냅샷), 스테이지 선택, 프롬프트 에디터(developer/user 분리, diff 뷰), 세팅(model/maxTokens/temperature), 반복 횟수 N |
| 우: 결과 | 구조화 출력 렌더(실제 보고서 섹션 프리뷰와 동형) + raw JSON 토글, **run 간 비교**(같은 입력 N회 산포·다른 프롬프트 A/B), 검증 실패 표시 |
| 하: 이력 | run 목록(promptVersion·model·latency·토큰), 우수 run 북마크 → 확정 프롬프트를 `face_analysis_ai.py`에 반영하는 체크리스트 |

**관문 2축(셀프 비판 반영 — 도구 가동과 품질 판정 분리)**: ① 도구: 같은 fixture로 프롬프트 2종 A/B 실행 → 보고서 프리뷰 비교가 브라우저에서 3분 내 도는 것. ② 품질: 프롬프트 확정(R2)은 **블라인드 비교 루브릭**으로 — 팀원이 A/B 산출물을 소스 모른 채 항목별(정확성·어조 게이트 준수·근거 연결·중복) 채점, 과반 우세 없이는 교체 금지. *도구가 돈다는 것과 보고서가 좋아졌다는 것은 다른 명제다.* 비용·지연도 run 이력에서 함께 계측(보고서 1건당 토큰·초 예산은 R2에서 실측 후 설정).

## 4. 보고서 UI 개편 — 시각자료 원칙

### 4.1 부위 확대 crop + 가이드선 (LLM 아닌 내부 로직)

**판정(정찰)**: 현 저장 데이터로는 불가 — 저장 좌표가 H/G/Sn/Me 4점뿐이고 478 랜드마크는 분석 직후 버려진다. 단 분석 시점에는 전부 있으므로 **산출→저장→복원→렌더 사슬에서 '저장'만 비어 있다.**

채택 방식: **SVG viewBox 확대**(픽셀 crop 아님) — `VerticalThirdsOverlay`의 픽셀 좌표계 viewBox 패턴을 부위 bbox로 좁혀 재사용. 원격 이미지 URL 그대로 동작, 다운로드·신규 라이브러리 불필요(expo-image-manipulator는 의존성만 있고 실사용 0 — no-op 스텁 확인).

신규 배관 6건:
1. `landmarkIndices` 확장(코끝·콧볼 인덱스 — 현재 Sn만 존재)
2. `faceGeometryCore`에 부위 bbox 빌더(순수함수) — **roll 보정 이전 원본 픽셀 좌표**로 산출(현행 지표는 보정 후 좌표라 혼용 금지)
3. 저장: measurements **v1 유지 + 내부 optional 키**(`regionBboxes`) — encode/decode + 프롬프트 pop + 15,000자 캡 재확인이 유일한 계약(§1 스키마 규칙. 초안의 "버전 업" 지시는 철회)
4. 복원: 파서 디코더 추가(imageUrl 주입 패턴 재사용)
5. 렌더: 부위 오버레이 컴포넌트 신설(viewBox 확대 + 가이드선·마커)
6. 폴백: 구버전 보고서(bbox 없음)는 섹션 미표시가 기본(재분석 경로는 비권장 — Unity 런타임 필요한 무거운 배관)

### 4.2 숫자 대체 시각자료 표준 (측정 계획 원칙 4와 정합)

수치 대신 아래 4종을 표준 형태로(전부 결정적 내부 로직, LLM 무관):

| 형태 | 용도 | 예 |
|---|---|---|
| **사진 오버레이** | 위치·비율 특징 | 가늠선(3분할 — 기존 좌표로 즉시 가능), 부위 확대+가이드선(§4.1). **오량(가로 5등분)은 눈 좌표 저장이 §4.1 배관에 추가되기 전까지 불가**(셀프 비판 — 초안의 표기는 §1 결측 목록과 자기모순이었음) |
| **스펙트럼 칩** | 단일 축 경향 | 눈꼬리 각도(내려감↔올라감), 대비(soft↔clear), 세로균형(하안부 짧음↔긺) — 눈금 숫자 없이 마커 위치+서술 라벨만 |
| **블렌드 바** | 확률·혼합형 | 얼굴형 top2 혼합("타원형 우세 + 둥근형 특징"), 퍼컬 1·2차 톤 |
| **팔레트·스와치** | 색 데이터 | 퍼컬 best/worst, 부위 색(입술·모발) |

Insight의 confidence는 어조로만 반영(측정 계획 §9.2 이중 게이트) — 숫자로 노출하지 않는다.

### 4.3 UI 디자인 생성

claude design(fable)으로 생성한다. **요청용 프롬프트 완성본: [2026-07-16-report-ui-design-prompt.md](2026-07-16-report-ui-design-prompt.md)** — 7섹션 사양·시각자료 표준·숫자 금지 제약·기존 화면 관성(실패 사유 노출 원칙 등)을 포함.

## 5. AR 맞춤 핏 인터페이스 (추후 트랙 — 계약 선행 설계)

**정찰 결론(3라운드 검토로 재기술 — 초안의 "유일한 신설 구간 = 매핑 계층"은 과소평가)**: 스텐실 레인에 핏 시트(region/role/leafId 매칭 + 공간 델타 + 구체성 캐스케이드)와 `eyelinerWingLength`·`browGap` 등 골드 축·클램프 유틸이 실재하는 것은 맞다. 그러나 신설 구간은 매핑 계층 외에 3가지가 더 있다: ① **`eyelinerInnerExtension`(수평 눈앞머리 연장) 축 신설** — 기존 `eyelinerInnerLift`는 수직 리프트(dyUp)이자 제거 예정 디버그 필드라 대용 불가(Unity도 눈꺼풀 법선 방향 리프트로 사용), ② **measured 자동 시트의 최하위 주입점 확장**(적용 체인이 fitChain+main 하드코딩), ③ 매핑 산출물을 평면 `FitEntry`로 저장하는 계약(계약 v0.1 §3).

사용자 예시(미간 넓음 → 눈앞머리 연장)는 **축 신설(D-5) 후에** 표현 가능: `interCanthalRatio > θ` → FitEntry `{region: 'eyelinerUpper', rules: {eyelinerInnerExtension: +δ}}`.

**계약 초안 완성본: [AR맞춤핏-계약초안-v0.md](../../faceData_WEI/AR맞춤핏-계약초안-v0.md) (v0.1)** — 데이터 흐름·저장 스키마·매핑 테이블 형식·레인별 주입 지점·AR 담당자 결정 항목(D-1~D-6) 포함. **R5 선행 의존성**: Unity 절차 라이너 파라미터 + RN 브리지 필드 + region gold field/슬라이더 + 직렬화 테스트(D-5), 시트 주입점 확장 + 스토리지 버전(§6-2). 매핑 δ값 자체는 실험으로 정할 잠정값이며 계약은 **그릇의 형태**만 고정한다.

## 6. 실행 마일스톤

**단계 완료 프로토콜**: 각 R 단계는 측정 계획의 "Phase 완료 프로토콜"(이중 GO 게이트 → PR → 계획 현행화 → 다음 단계 착수)을 동일하게 따른다.

| 단계 | 내용 | 의존 |
|---|---|---|
| R0 | **V2 데이터 공급 확보**(플래그 ON 백엔드 + 신규 잡 1건 or retry) → 파일 기반 fixture 동결 → **DTO 배선**(직마운트 금지, §1) + 4대 경계 합의(§2) | 없음 — 즉시. 관문: 상세 GET 기반 화면에 숫자 없는 V2 서술이 feature flag 뒤에서 렌더 |
| R1 | Report Lab 웹앱(§3) + lab 엔드포인트 + `analysis_lab_runs` | R0 fixture. 관문: §3.3-① |
| R2 | 프롬프트 개정 실험 — 7섹션 내용 생성(내추럴/글램 2종 스키마 확장 포함) | R1. 관문: §3.3-② 블라인드 루브릭 통과 |
| R3 | 부위 bbox 배관 6건(§4.1, v1 optional 키) + 시각자료 컴포넌트(§4.2) | R0과 병렬 가능(B4 좌표 프레임 계약 전제) |
| R4 | UI 개편 구현(claude design 산출물 기반) + 체형 설문 연결(bodyProfile은 stencil 내부 첫 외부 결합 — **shared 승격 vs 직접 import 결정** 필요) | R2·R3. 관문: 디자인 시안 수용 기준(프롬프트 절대 제약 5항 준수 체크) |
| R5 | AR 맞춤 핏 매핑 계층(계약 v0.1 확정 후) | 계약 검토 + AR 담당자 결정 회신 |

측정 트랙과의 접점: R2의 fixture는 측정 Phase 1 관문 통과 시 재생성(§2), §1 결측 목록은 측정 트랙 §7 확장의 우선순위 입력.
