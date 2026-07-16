# 얼굴 보고서 재구성 계획 v2 — Local Execution Ready (2026-07-17)

상태: **로컬 무인 실행 계획 확정** — 저장소 정찰·적대 검증·Claude 디자인 산출물 감사와 안전 기본값 결정을 반영함. §6의 L0에서 로컬 도구·의존성·fixture를 고정한 뒤 모든 코드 lane을 진행하며, Claude 로그인과 사람·실기기 관문만 별도 `BLOCKED/PENDING`으로 관리한다.
실행 기준: PR #27의 이중 GO·dev 반영이 끝난 최신 `origin/dev`에서 전용 feature branch를 만든다. 구현·테스트·리뷰·Report Lab 구동은 이 Mac의 로컬 worktree에서 수행하며, 장시간 프로세스는 재시작 가능한 스크립트와 로컬 artifact로 상태를 남긴다.
자매 문서: [측정·분석 개선 계획](2026-07-16-face-measurement-analysis-plan.md) — 측정 트랙. 본 문서는 **보고서 트랙**(내용 재구성·Lab·UI·AR 인터페이스).
산출물: [보고서 UI 디자인 요청 프롬프트](2026-07-16-report-ui-design-prompt.md) · [AR 맞춤 핏 계약 초안](../../faceData_WEI/AR맞춤핏-계약초안-v0.md) · 저장소 루트 `얼굴 분석 보고서 디자인/`의 Claude 디자인 번들(현재 untracked, **레퍼런스 전용**)

---

## 0. 결정 요약

| # | 결정 | 근거 |
|---|---|---|
| 1 | 목차는 부록 7섹션으로 재구성. R0 = **V2 데이터 공급 확보 + DTO 배선**(기존 컴포넌트 직마운트 금지) | V2 파이프라인은 2026-07-16에야 머지된 opt-in 기능(기본 OFF) — 과거 잡 데이터 부재는 가설(R0 쿼리로 확정, §1). 기존 V2 컴포넌트는 원시값·%를 렌더해 원칙 4 위반(§1) |
| 2 | 작업 순서 = **계약 고정 후 병렬** — 단 fixture 동결만으로는 부족, **4대 경계(파일 소유권·스키마 단일 창구·문구 소유·좌표 프레임) 선행**(§2) | 셀프 검증에서 같은 파일 4곳 겹침·문구 3소스 경합 실증 |
| 3 | Report Lab = **로컬 웹앱 + 로컬 FastAPI + 전용 Docker Compose PostgreSQL**. `apps/report-lab`을 React/Vite/TypeScript로 만들고 `127.0.0.1`에서 실행한다. **파일 기반 fixtureId를 1급 시민으로 두고 운영 DB·사용자 원본 자산은 사용하지 않는다**(§3) | 무인 세션 뒤 사용자가 같은 Mac에서 즉시 보고서를 생성·테스트할 수 있어야 하며 외부 인프라는 필요하지 않음 |
| 4 | 부위 확대 = **SVG viewBox 확대**, 좌표는 분석 시점 산출·저장. 스키마는 **v1 유지 + optional 키**(버전 업 아님) | "v1 키 동결"은 face3d 5지표 계약의 오인용 — 어떤 파서도 미지 키를 거부하지 않음(§4.1) |
| 5 | AR 맞춤 = **핏 시트를 표준 컨테이너로 채택** — 단 "매핑 계층만 신설"은 과소평가: 신규 수평 축(D-5)·measured 시트 주입점·평면 FitEntry 저장 계약이 추가 범위(계약 v0.2) | eyelinerInnerLift는 수직 리프트+디버그 필드로 판명(Codex 검증) |
| 6 | Claude 디자인 번들은 **시각·인터랙션 레퍼런스만 사용**한다. `support.js`/DC runtime/동적 eval/`window.omelette`는 실행 앱에서 제외하고 typed React 컴포넌트로 이식한다(§4.3) | 번들은 `new Function`, 런타임 JSX fetch/eval, 외부 CDN, host 전용 저장 bridge에 의존해 그대로 실행 앱에 포함할 수 없음 |
| 7 | 로컬 자동화 범위와 사람·실기기 관문을 분리한다. 아침 완료 정의는 **localhost Report Lab + fixture 기반 prompt 실행·보고서 생성 + 자동 테스트 + 동일 SHA 이중 GO + dev PR**이다. 실기기·캘리퍼·블라인드 사람 승인·AR 시각 승인은 `PENDING/OFF`로 남긴다(§8) | 보정·판정 승격과 사람 품질 승인을 무인 로컬 성공으로 대체할 수 없음 |
| 8 | 미결 입력은 안전 기본값으로 닫는다: 누락 정본은 측정 계획 v5 대체 계약, 디자인 이미지는 synthetic, provider는 disabled/fixture, body profile AI 제외, 무규준 locale 게이지 숨김+자기이력만 | 사용자 부재 중에도 계약·UI·테스트를 완결하되 판정·외부 전송은 승격하지 않음 |
| 9 | R5는 스텐실 레인만 구현하고 `"내 얼굴에 맞춤"` opt-in을 기본 OFF로 둔다. `eyelinerInnerExtension`은 계약·브리지에 추가하되 δ=0/OFF, 라이브 레인과 기존 생성 계약 provenance 변경은 후속이다 | D1–D6를 가장 보수적인 가역 기본값으로 고정 |

## 1. 새 목차 ↔ 데이터 매핑

**정찰 발견(셀프 적대 검증으로 2026-07-17 정정)**: `FaceAnalysisV2ReportSections`(AI 보완측정 53키·해석 9종·인상·컨설팅 렌더 가능)가 **렌더 소비 0인 dead 컴포넌트**인 것은 사실이다(전 저장소 import 0건 — 비렌더 소비는 2종: 폴링 조기종료 게이트 + recommendedMakeups fallback 분기). **그러나 초안의 "데이터가 이미 내려오는데 버려진다"는 저장소 증거상 거짓** — `FACE_ANALYSIS_V2_ENABLED` 기본 false이고 저장소의 기본 설정에도 ON이 없으며, V2 파이프라인 자체가 2026-07-15 작성·07-16 머지(PR #16)다. 제품 환경의 과거 잡 상태를 추측하지 않고, R0는 승인된 fixture provenance 또는 전용 localhost Report Lab DB 실측만 evidence로 사용한다. 따라서 R0의 실체는:

1. **데이터 공급**: 제품 `FACE_ANALYSIS_V2_ENABLED`는 기본 OFF를 유지한다. 로컬 Lab은 비식별 fixture를 1급 입력으로 사용한다. 실제 `reportId`는 전용 localhost Report Lab DB에 소유권이 확인된 비식별 snapshot이 있을 때만 정상 인증+소유권 검사 뒤 읽는다. 원격 dev/운영 DB에는 접속하지 않는다. 착수 전 이 전용 DB에서 `detail_payload->'request'->'measurements'->>'schemaVersion'` 실측 카운트 1회 또는 승인된 fixture provenance를 evidence로 남긴다. 이 단계는 제품 플래그 승격 근거가 아니다.
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
- **체형(별도 최상위 필드)의 숨은 비용 4건**: ① `_safe_analysis_prompt_metadata`에서 명시적으로 pop해 AI 프롬프트 유입을 차단, ② 목록 GET 경량화 strip에 포함, ③ 응답 camelize 재귀 변형 대비 키 네이밍, ④ 모바일 인코드·복원 양방향 배선 신설.

## 2. 작업 순서 — 계약 고정 후 병렬 (직렬 기각)

1. **역방향 의존이 존재.** §1의 결측 목록(이마·볼·인중·E라인 2D·얼굴형 스코어러)이 측정 확장의 우선순위를 정한다 — 보고서를 미루면 측정 트랙이 뭘 먼저 만들지 모른다.
2. **직렬이면 측정 Phase 1~2(실기기 검증, 수 주)를 보고서가 논다.** 스킬셋도 분리(측정=네이티브/Unity, 보고서=프롬프트/웹/UI).
3. 초안의 근거 "측정 개편은 데이터 형태를 바꾸지 않는다"는 **셀프 검증에서 반박됨** — 측정 트랙 스스로 판정 버저닝(Phase 0-5)·mm 병렬 저장(Phase 2-3)으로 형태를 바꾸고, fixture 봉투 안에 사용자 노출 문구(`interpretation.summary`가 payload에 직렬화·복원)까지 들어 있어 측정 Phase 0-3 문구 개정이 fixture **내용**을 바꾼다. **fixture 동결만으로는 병렬이 성립하지 않는다 — 아래 4대 경계가 선행 조건.**

**병렬 성립의 4대 경계 (fixture 동결에 추가, 셀프 검증 2026-07-17):**

| # | 경계 | 내용 |
|---|---|---|
| B1 | **파일 소유권 배정** | `MeasurementDetailSection` = 보고서 트랙이 철거 소유(측정 Phase 0은 "신규 숫자 차단"까지로 한정 — 측정 계획의 자체 모순도 해소) · `FaceAnalysisReportDetailScreen` = 보고서 트랙 전속(측정 Phase 0 관문 적용 범위에서 명시 위임) · `VerticalThirdsOverlay` **중복 정의 2벌**(공유본 + FaceVerticalThirdsScreen:375-512 로컬본) 통합을 선행 커밋으로 처리 후 R3 소유 |
| B2 | **측정 계약 변경 단일 창구** | bbox(R3)는 v1 optional 키(§1 스키마 규칙), 판정 스냅샷(측정 Phase 0-5)·mm(Phase 2-3)도 같은 창구에서 조율 — 두 트랙이 각자 버전을 올리면 모바일 strict-equality 파서(faceAnalysisMeasurements.ts:1068)에서 상호 파손 |
| B3 | **문구·임계 소유권** | 측정 화면은 저장된 모바일 판정 스냅샷, 보고서는 그 스냅샷을 따르는 서버 derived의 numeric-free 라벨, AI perception은 정성 인상 슬롯만 소유한다. AI가 세로균형 기하를 재판정하지 않으며 서버 legacy 임계는 스냅샷 없는 구 payload 폴백에만 사용한다 |
| B4 | **bbox 좌표 프레임 계약** | "roll 보정 이전 원본 픽셀 좌표" 보존을 측정 Phase 1 리팩터(보정 위치 네이티브 이동)의 불변 조건으로 등재 — 병렬 창에서 좌표 프레임이 바뀌면 bbox가 사진과 어긋남 |

**실행**: ① L0 완료(§6) → fixture 동결(파일 기반 fixtureId — §3.1) + 4대 경계 합의 → ② 소유권별 로컬 세션 병렬 → ③ fixture 재생성 트리거 = 측정 Phase 1 관문 통과 시 **그리고 측정 Phase 0 문구 개정 시**(초안은 후자 누락 — 낡은 '평균' 문구 위에서 R2/R4가 UI를 굳히는 사고 방지).

## 3. Local Report Lab — 보고서 생성·프롬프트 실험 도구

### 3.1 목표 아키텍처

- **프론트엔드**: 신규 `apps/report-lab`(React/Vite/TypeScript). 모바일 앱은 web 미지원이고 Lab은 카메라가 필요 없으므로 Expo 실험 앱 스위치에 넣지 않는다. 기본 주소는 `http://127.0.0.1:5173`이며 외부 인터페이스에 bind하지 않는다.
- **백엔드**: 기존 FastAPI 코드베이스에 lab router/service를 추가하고 `LAB_MODE=true`인 로컬 프로세스로만 기동한다. 기본 주소는 `http://127.0.0.1:8000`; 일반 backend 실행에서는 `LAB_MODE=false`를 유지한다.
- **인증·격리**: fixture-only 기본 모드는 `127.0.0.1` bind + CORS origin 정확히 `http://127.0.0.1:5173` 하나만 허용한다(`localhost` alias·wildcard 금지). `AUTH_REQUIRED=false`에서는 `fixtureId`만 받고 `reportId`를 항상 거부하며, 감사 기록의 비사용자 principal은 고정 UUID `00000000-0000-4000-8000-000000000027`을 쓴다. `reportId` 모드는 전용 localhost DB의 소유권 확인된 비식별 snapshot에만 한정하고 정상 인증과 `user_id` 소유권 검사를 요구한다. 원격 dev/운영 DB 접속은 허용하지 않는다.
- **데이터**: `infra/report-lab/docker-compose.yml`, Compose project `aura-report-lab`, host `127.0.0.1:55432`, database/user `aura_report_lab`로 고정한다. `report-lab:setup`이 최초 실행 때 32-byte random `AURA_REPORT_LAB_DB_PASSWORD`를 gitignored `.runtime/report-lab.env`에 만들고, DSN `postgresql://aura_report_lab:${AURA_REPORT_LAB_DB_PASSWORD}@127.0.0.1:55432/aura_report_lab`을 같은 파일의 `AURA_REPORT_LAB_DATABASE_URL`로 주입한다. 비밀번호·완성 DSN은 저장소·로그에 넣지 않는다. 기존 backend compose·dev DB·운영 자산과 database/schema/volume을 공유하지 않는다. named volume은 7일 TTL 정리를 위해 실행 간 유지하고 `report-lab:down`에서만 `docker compose -p aura-report-lab --env-file .runtime/report-lab.env -f infra/report-lab/docker-compose.yml down --volumes --remove-orphans`로 제거한다. 테스트는 고유 project suffix와 임시 env/volume을 사용하고 성공·실패 모두 teardown한다.
- **fixture 형식**: 승인된 repo fixture metadata와 로컬 allowlist 디렉터리의 비식별·합성 이미지를 사용한다. 원본 사용자 얼굴을 fixture로 commit하지 않는다. 실제 이미지가 필요하면 최소 필드 추출·식별자 재발급·명시적 사용 허가·보존/삭제 절차를 먼저 작성한다.
- **provider 기본값**: `REPORT_LAB_MODEL_PROVIDER=disabled`, `IMAGE_GENERATION_PROVIDER=disabled`. provider를 선택하지 않은 상태에서도 deterministic fixture response로 UI·DTO·validation을 전부 테스트할 수 있어야 한다.
- **외부 모델 선택**: 이번 구현과 본 계획은 provider-disabled deterministic fixture runner까지만 완료한다. 외부 adapter·provider key·모델 호출은 현 범위에서 만들거나 실행하지 않는다. 향후 필요하면 사용자의 새 승인과 별도 계획에서 전송 범위·비용·보존 정책부터 다시 심사한다.
- **Bedrock 제외**: cloud 사용 취소에 따라 Bedrock adapter·AWS 전송·Bedrock fallback은 이번 계획 범위에 없다. 소스 코드·git diff·계획·리뷰 문서를 외부 provider에 전송하지 않으며, Codex×Claude 코드 리뷰는 first-party Claude 로컬 로그인 경로만 사용한다.
- **계측·보존**: 현재 실행의 외부 provider run은 항상 `0`, `tokenUsage`는 `null` 또는 `0`이다. 로컬 latency·동시성·세션 run 상한·retention TTL만 계측한다. prompt·fixture response 로그는 얼굴 이미지·인증 토큰·서명 receipt·nonce를 포함하지 않도록 redact한다.
- **consult 스테이지는 이미지 불필요(순수 JSON)** → 프롬프트 반복 실험의 최적 시작점. 신설 lab 엔드포인트는 stage별 이미지 로드를 분기해 consult run이 로컬 이미지 파일 접근 없이 동작해야 한다.

### 3.2 백엔드 신설 — 실험용 오버라이드 엔드포인트 1개

현행 retry API(`POST /api/analysis/jobs/{id}/retry`)는 스테이지 이름만 받고 오버라이드가 없으며, **캐시가 동일 입력 재실행을 차단**한다(`analysis_stage_runs` 히트 시 즉시 반환 — "같은 입력 N회 반복"이 불가능). 해결:

```
POST /api/lab/analysis/stage-run   (LAB_MODE + loopback + 입력 모드별 role 게이트)
{
  // 입력 소스:
  //   fixtureId: 승인된 비식별 lab fixture
  //   reportId: 정상 인증 + user_id 소유권 확인 모드에서만 허용
  fixtureId | reportId,
  stage: measure|perceive|consult,
  overrides: {
    promptDeveloper?, promptUser?,   // 본문 오버라이드 (현행 face_analysis_ai.py 인라인 하드코딩)
    promptVersion,                   // 필수 — 캐시 키 축이므로 실험마다 유니크하면 캐시 문제가 자연 해소
    model?, maxTokens?, temperature? // temperature는 현재 0.1 하드코딩 — 시그니처 확장 필요
  },
  bypassCache?: boolean
}
→ { runId, rawResponse?, normalizedOutput, validationErrors, latencyMs, tokenUsage }
```

- `FaceAnalysisAI`를 프롬프트/버전/세팅 **주입형**으로 리팩터(실험용 서브클래스 가능). 프롬프트 본문은 캐시 키에 안 들어가므로(버전 문자열만) **버전 미변경 프롬프트 수정 = stale 캐시**라는 함정을 Lab UI가 강제로 막는다(프롬프트 변경 시 버전 자동 suffix).
- 엔드포인트 요구사항 추가: stage별 이미지 로드 분기(consult는 이미지 read 생략), `LAB_MODE`+loopback/role 게이트, fixtureId allowlist, `AUTH_REQUIRED=false`일 때 reportId 거부, 인증 모드의 reportId 소유권 검사, rate/budget limit, audit event.
- `rawResponse`는 `REPORT_LAB_RAW_RESPONSE_ADMIN_TOKEN`이 비어 있지 않고 요청의 `X-Aura-Lab-Admin-Token`과 상수시간 비교로 일치할 때만 반환한다. 기본 env 예제에는 값이 없으므로 raw 응답은 기본 차단된다. 토큰은 DB·로그·응답에 저장하지 않으며 일반 tester에는 `normalizedOutput`·검증 오류·비식별 계측만 제공한다.
- **실험 기록은 `analysis_stage_runs` 재사용 금지(Codex 반영)** — 이 테이블은 `(report_id, stage)` processing 유니크 제약 + `on conflict do nothing returning *` 구조라, Lab 실행이 **운영 파이프라인의 진행 중 행을 가로채 완료/실패 처리**할 수 있다. **별도 `analysis_lab_runs` 테이블로 분리하되 스키마는 독자 설계**(3라운드 정정: "동일 컬럼" 복제는 `report_id NOT NULL` FK 때문에 fixture-only 실행을 기록할 수 없음) — `fixture_id` 필수 + `source_report_id` **nullable** + 실험 메타(prompt_version·model·overrides). reportId 모드는 전용 localhost DB에서 소유권을 확인한 최소 필드만 비식별 snapshot으로 고정하고 그 새 fixtureId를 기록한 다음 실행한다.

### 3.3 Lab 화면 구성

| 패널 | 내용 |
|---|---|
| 좌: 입력 | fixture 선택(잡 목록/스냅샷), 스테이지 선택, 프롬프트 에디터(developer/user 분리, diff 뷰), 세팅(model/maxTokens/temperature), 반복 횟수 N |
| 우: 결과 | 구조화 출력 렌더(실제 보고서 섹션 프리뷰와 동형) + lab admin role 전용 raw JSON 토글, **run 간 비교**(같은 입력 N회 산포·다른 프롬프트 A/B), 검증 실패 표시 |
| 하: 이력 | run 목록(promptVersion·runner·로컬 latency·`tokenUsage=null/0`), 우수 run 북마크 → 확정 프롬프트를 `face_analysis_ai.py`에 반영하는 체크리스트 |

**관문 2축(셀프 비판 반영 — 도구 가동과 품질 판정 분리)**: ① 도구: 같은 fixture로 프롬프트 2종 A/B 실행 → 보고서 프리뷰 비교가 브라우저에서 3분 내 도는 것. ② 품질: 프롬프트 확정(R2)은 **블라인드 비교 루브릭**으로 — 팀원이 A/B 산출물을 소스 모른 채 항목별(정확성·어조 게이트 준수·근거 연결·중복) 채점, 과반 우세 없이는 교체 금지. *도구가 돈다는 것과 보고서가 좋아졌다는 것은 다른 명제다.* 현재는 로컬 latency와 run 상한만 계측하고 외부 비용·토큰 예산은 두지 않는다(`tokenUsage=null/0`). 외부 adapter는 새 계획에서 승인될 때만 별도 예산 관문을 정의한다.

### 3.4 로컬 구동·운영 표면

- 루트 스크립트로 `report-lab:setup`, `report-lab:dev`, `report-lab:test`, `report-lab:stop`, `report-lab:down`, `report-lab:status`를 제공한다. setup은 lockfile 기반 Node/Python 의존성, Playwright Chromium, 전용 `aura-report-lab` PostgreSQL, 필수 환경변수 이름을 idempotent하게 검사·준비한다. `stop`은 앱 프로세스만 멈추고 DB/7일 이력은 유지하며, `down`만 전용 volume까지 삭제한다.
- `report-lab:dev`는 backend와 Vite를 loopback에 띄우고 PID·포트·로그 경로·commit SHA를 gitignored runtime state에 기록한다. 이미 실행 중이면 중복 프로세스를 만들지 않고 health를 확인한다.
- `report-lab:status`는 frontend/backend/PostgreSQL health, 현재 SHA, provider mode, fixture catalog를 한 번에 보여준다. 사용자는 아침에 이 명령과 localhost 주소만으로 상태를 확인할 수 있어야 한다.
- `.env.local`과 provider credential은 commit하지 않는다. 예제 파일에는 변수 이름과 disabled 기본값만 둔다. 로컬 프로세스의 로그에도 secret 값을 출력하지 않는다.
- 화면 footer·backend health·test artifact가 같은 commit SHA를 표시한다. 테스트, Codex 리뷰, Claude 리뷰, 실행 중인 Lab이 서로 다른 SHA면 GO가 아니다.
- 작업 시작 시 `artifacts/report-lab/tool-manifest.json`에 plugin/MCP 이름·버전·연결 상태·용도를 기록한다. 필수 표면은 CodeGraph(코드 탐색), GitHub(PR/check), Playwright(E2E/시각 QA·브라우저 디버깅), Postgres(로컬 lab DB), Context7/공식 문서(라이브러리 확인), Expo(모바일 통합), Claude의 Superpowers·code-review·frontend-design plugin이다.
- plugin/MCP는 끄지 않는다. 필요한 로컬 plugin/MCP가 없으면 설치·버전 고정 후 manifest에 기록한다. 연결 실패 시 기능을 조용히 생략하지 말고 `BLOCKED`와 대체 검증 경로를 남긴다. Postgres MCP는 local lab database만 접근한다.

## 4. 보고서 UI 개편 — 시각자료 원칙

### 4.1 부위 확대 crop + 가이드선 (LLM 아닌 내부 로직)

**판정(정찰)**: 현 저장 데이터로는 불가 — 저장 좌표가 H/G/Sn/Me 4점뿐이고 478 랜드마크는 분석 직후 버려진다. 단 분석 시점에는 전부 있으므로 **산출→저장→복원→렌더 사슬에서 '저장'만 비어 있다.**

채택 방식: **SVG viewBox 확대**(픽셀 crop 아님) — `VerticalThirdsOverlay`의 픽셀 좌표계 viewBox 패턴을 부위 bbox로 좁혀 재사용. 기존 모바일 renderer의 원격 이미지 URL 호환은 변경하지 않되 Local Lab fixture는 allowlist된 로컬 URL 또는 object URL만 사용한다. 다운로드·신규 라이브러리는 불필요하다(expo-image-manipulator는 의존성만 있고 실사용 0 — no-op 스텁 확인).

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

Claude design(fable) 생성은 완료됐다. 요청 원본은 [2026-07-16-report-ui-design-prompt.md](2026-07-16-report-ui-design-prompt.md), 결과 번들은 저장소 루트 `얼굴 분석 보고서 디자인/`에 있다.

현재 번들은 **로컬 untracked 레퍼런스**다. 이번 로컬 세션에서는 읽을 수 있지만, 사용자 허가 전에는 원본 파일·sidecar·embedded 얼굴 이미지를 stage/commit/push하지 않는다.

1. 분해형 유니코드 파일명인 `*보고서.dc.html`을 glob/디렉터리 탐색으로 찾고, 레이아웃·토큰·카피·상태·인터랙션의 레퍼런스로만 읽는다.
2. `.image-slots.state.json`의 embedded 얼굴 이미지는 사용자 허가 전 사용·복사·전송하지 않는다. 기본 UI fixture는 합성/비식별 placeholder다.
3. `support.js`, DC runtime, `new Function`/eval, 런타임 JSX fetch/Babel 실행, `window.omelette.writeFile`, 외부 Pretendard CDN은 실행 앱에 포함하지 않는다.
4. `apps/report-lab`에 S1–S7을 typed React/Vite 컴포넌트로 다시 구현한다. 폰트는 로컬 번들 또는 승인된 system fallback을 사용하고, 저장은 정상 local API를 통한다.
5. 원본의 핵심 상태(헤어라인 누락, 확정/경계/보류, 밴드 탭, 드레이프, 조명 설명, 시선 순서, 내추럴↔글램)를 fixture 기반 Story/Playwright 시나리오로 재현한다.
6. 향후 원본 디자인 자산을 추적해야 한다면 사용자 허가 뒤 민감 이미지 제거본만 별도 commit하고 SHA를 기록한다. 허가 전에는 구현 코드가 원본 폴더 경로를 runtime 의존성으로 가져도 안 된다.

디자인 fidelity 관문은 픽셀 동일성 하나가 아니라 ① 숫자 비노출, ② 실패·보류 이유 가시성, ③ 키보드/스크린리더 접근성, ④ 390pt 모바일 폭과 desktop 비교 UI, ⑤ 보안상 동적 코드 실행 제거를 모두 포함한다.

## 5. AR 맞춤 핏 인터페이스 (추후 트랙 — 계약 선행 설계)

**정찰 결론(3라운드 검토로 재기술 — 초안의 "유일한 신설 구간 = 매핑 계층"은 과소평가)**: 스텐실 레인에 핏 시트(region/role/leafId 매칭 + 공간 델타 + 구체성 캐스케이드)와 `eyelinerWingLength`·`browGap` 등 골드 축·클램프 유틸이 실재하는 것은 맞다. 그러나 신설 구간은 매핑 계층 외에 3가지가 더 있다: ① **`eyelinerInnerExtension`(수평 눈앞머리 연장) 축 신설** — 기존 `eyelinerInnerLift`는 수직 리프트(dyUp)이자 제거 예정 디버그 필드라 대용 불가(Unity도 눈꺼풀 법선 방향 리프트로 사용), ② **measured 자동 시트의 최하위 주입점 확장**(적용 체인이 fitChain+main 하드코딩), ③ 매핑 산출물을 평면 `FitEntry`로 저장하는 계약(계약 v0.2 §3).

사용자 예시(미간 넓음 → 눈앞머리 연장)는 **축 신설(D-5) 후에** 표현 가능: `interCanthalRatio > θ` → FitEntry `{region: 'eyelinerUpper', rules: {eyelinerInnerExtension: +δ}}`.

**계약 초안 완성본: [AR맞춤핏-계약초안-v0.md](../../faceData_WEI/AR맞춤핏-계약초안-v0.md) (v0.2)** — 데이터 흐름·저장 스키마·매핑 테이블 형식·레인별 주입 지점과 D-1~D-6 안전 기본값이 확정됐다. **R5 선행 의존성**: v0.2에 따라 Unity 절차 라이너 파라미터 + RN 브리지 필드 + region gold field/슬라이더 + 직렬화 테스트(D-5), 시트 주입점 확장 + 스토리지 버전(§6-2)을 정적으로 구현한다. 매핑 δ값은 0/OFF로 두고 non-zero 승격은 실기기 실험 뒤 별도 승인한다.

## 6. 로컬 무인 실행 파동

### Wave L0 — 로컬 선행 관문과 lane별 차단

1. PR #27이 Codex·Claude 양쪽 GO를 받고 dev에 반영됐거나, 후속 branch의 base SHA를 명시적으로 고정한다.
2. B1–B4의 파일·스키마·문구·좌표 계약과 §7 단일 소유권을 고정한다.
3. `얼굴 분석 보고서 디자인/`이 로컬에서 읽히는지 확인하되 원본/sidecar는 stage하지 않는다. embedded 얼굴 이미지는 허가 전 제외하고 합성 placeholder를 사용한다.
4. Node/Python/PostgreSQL/Playwright/CodeGraph와 필요한 plugin/MCP를 설치·동기화한다. plugin/MCP는 ON을 유지하고 실제 버전·연결 상태를 manifest에 기록한다.
5. 로컬 Claude를 first-party 계정으로 로그인하고 정확한 `claude-fable-5`, effort `high`, plugin/MCP ON 조합을 dry-run한다. 실패하면 해당 리뷰 gate만 `BLOCKED`; Sonnet·Bedrock·다른 모델로 대체하지 않는다.
6. `얼굴분석-설계.html`, `메이크업-분류체계-정의.html`은 부재 상태를 기록하되 측정 계획 v5의 대체 계약을 이번 구현 정본으로 사용한다. 원본이 나중에 반입되면 별도 delta review를 수행한다.
7. 보고서 생성 provider는 이번 실행에서 `disabled/fixture`로 고정한다. 외부 호출 없이 deterministic stage runner를 실제 실행하고, 새 사용자 승인과 별도 계획 전에는 외부 adapter를 열지 않는다.

### Wave A — 계약·fixture·로컬 골격

- 공용 numeric-free report DTO/parser/fixture schema를 RN 의존 없는 패키지로 고정하고 mobile/Vite가 소비하는 설치·lockfile 경로를 명시한다.
- 허가된 synthetic fixture와 provenance를 commit하고 `analysis_lab_runs` SQL·DBML·init/check migration/test를 추가한다.
- §3.2 lab API, loopback 제한, fixture allowlist, reportId 차단/소유권, rate/budget/audit를 구현한다.
- `apps/report-lab` skeleton과 `report-lab:{setup,dev,test,stop,down,status}` 스크립트, SHA 표시, localhost smoke를 완성한다.
- plugin/MCP manifest를 생성하고 필수 연결 실패를 먼저 드러낸다.

### Wave B — 동결 계약 위 병렬 구현

- **Prompt/measurement 세션**: 7섹션 prompt, `visualEvidence`, 내추럴/글램 2종, prompt override/version/cache/privacy와 provider-disabled stage-runner interface. 외부 provider adapter는 현 범위에서 제외한다.
- **Geometry/bbox 세션**: 7-class 얼굴형·대비·피부 균일도, 원본 픽셀 bbox, sanitization·회전/복원 테스트.
- **Web UI 세션**: 로컬 Claude 디자인 S1–S7 typed React 이식, prompt runner, run 비교, 접근성·Playwright.
- **Local contract 세션**: 공용 DTO·schema/API·PostgreSQL·로컬 구동 스크립트 단일 창구. 다른 세션은 공유 schema와 runner를 직접 수정하지 않는다.

### Wave C — 통합·모바일 보고서

- frozen DTO로 localhost web과 mobile 상세 보고서를 연결한다.
- `MeasurementDetailSection` 숫자 화면을 철거하고 numeric-free V2 UI를 feature flag 뒤에서 연결한다.
- body profile을 shared 계약으로 승격해 보고서에 연결한다. prompt 유입은 제품 결정 전 기본 exclude다.
- 홈의 `메이크업 추천` shortcut은 이미 구현됐으므로 재구현하지 않고 navigation/typecheck 회귀만 검증한다.
- localhost에서 fixture 선택 → prompt run 또는 deterministic response → normalized report 생성 → A/B 비교를 3분 안에 재현한다.

### Wave D — Phase 4·AR 후속 통합

- Phase 4의 self-relative/locale/history schema와 offline estimator 도구를 구현하되 실제 mean±SD 기준 승격은 데이터·제품 승인 전까지 OFF로 둔다.
- R5는 스텐실 레인·opt-in 기본 OFF·기존 생성 계약 무변경·`eyelinerInnerExtension` δ=0/OFF라는 확정 기본값으로 구현한다. 라이브 레인 지원과 실제 δ 튜닝은 후속이다. 로컬 자동 완료는 RN/Unity bridge·serialization·mapping 단위 테스트까지다.
- iPhone/TrueDepth·Unity 렌더·캘리퍼·AR δ 시각 승인은 §8.2 human/device gate로 남긴다.

## 7. 단일 소유권과 병렬 충돌면

| 충돌면 | 단일 소유 세션 | 규칙 |
|---|---|---|
| `face_analysis_v2.py`, `face_analysis_ai.py`, `face_analysis_pipeline.py` | Prompt/measurement | prompt·stage 실행 계약은 한 세션만 수정 |
| `openai_analysis.py`, `face_analysis_measurements.py`, 공용 report DTO | Local contract | 현재 PR 수정과 먼저 합친 뒤 다른 세션은 frozen API만 소비 |
| `docs/backend/schema.sql`, `docs/backend/aws-postgresql-schema.dbml`, DB init/check | Local contract | schema 변경 단일 창구 |
| `FaceAnalysisReportDetailScreen`, `MeasurementDetailSection`, `VerticalThirdsOverlay` | Mobile report UI | 숫자 철거·중복 overlay 통합 포함 |
| geometry/landmark/index/bbox/measurement codec | Geometry/bbox | B4 원본 좌표 불변 |
| `apps/report-lab/**` | Web UI | shared DTO 변경은 contract 세션에 요청 |
| `fitSheets.ts`, `lookStore.ts`, `StencilARApp.tsx`, Unity bridge/types | AR fit | Wave D 전용 |
| root scripts, local env example, Report Lab runtime state | Local contract | 포트·DB·provider·process lifecycle 단일 창구 |
| 본 계획과 자매 계획의 상태표 | 루트 오케스트레이터 | 각 wave 종료 때 실제 SHA/evidence로만 현행화 |

## 8. 완료 관문

### 8.1 로컬 자동 관문

- backend 전체 테스트와 lab endpoint/loopback/role/ownership/cache/rate/budget/privacy/path-traversal 테스트
- 고유 Compose project의 임시 PostgreSQL에서 SQL·DBML·init/check migration 정합 검증 후 `down --volumes` 보장
- `apps/report-lab` typecheck, unit test, production build
- Playwright localhost fixture A/B, 키보드·스크린리더 핵심 흐름, 390px/desktop 시각 snapshot
- mobile typecheck 및 face-report/home/navigation/geometry contract 테스트
- 제품·Lab UI와 accessibility snapshot에서 측정 수치·confidence %·내부 mm/receipt/nonce 비노출
- `AUTH_REQUIRED=false`에서 reportId 거부, fixture path allowlist, localhost CORS, raw response role 차단
- `report-lab:status` health, build SHA, fixture prompt/deterministic run, normalized report 생성
- 외부 provider·이미지 생성 기본 disabled, provider 명시 선택 전 네트워크 호출 0건
- `support.js`, DC runtime, `new Function`/eval, 외부 런타임 JSX fetch가 production bundle에 없다는 정적 검사
- plugin/MCP manifest와 테스트/review/runtime artifact가 동일 SHA를 가리킴

### 8.2 사람·실기기 관문

- prompt R2의 blind A/B 정확성·어조·근거·중복 사람 승인
- iPhone/TrueDepth MAD/MAE 및 diverse subject 수집
- 캘리퍼/자 오차표, Gate 6B, 승인 artifact/HMAC receipt
- AR 맞춤핏의 실제 device 시각 검증과 δ 승인
- Phase 4 cohort 통계와 기준 승격 제품 승인

이 관문은 로컬 자동화 성공으로 대체하지 않는다. 미완료 항목은 `PENDING/UNVERIFIED`, 관련 보정·판정·제품 플래그는 기본 `OFF`로 기록한다. 실기기 수집은 runbook·스크립트·결과 스키마 준비까지만 자동 완료로 인정한다.

### 8.3 Codex × Claude 동일 SHA 완료 프로토콜

1. 자동 테스트와 localhost smoke가 통과한 commit SHA를 잠근다.
2. Codex가 계획·diff·전체 파일을 적대적으로 리뷰하고 `GO` 또는 actionable finding을 artifact로 남긴다.
3. 로컬 Claude CLI를 first-party 계정으로 실행해 **`claude-fable-5`, effort `high`**로 같은 SHA를 독립 리뷰한다. plugin/MCP를 비활성화하지 않으며 실제 사용 manifest를 남긴다.
4. 어느 한쪽이라도 GO가 아니면 수정 후 **두 리뷰를 모두 새 SHA에서 다시 실행**한다. 이전 SHA의 GO를 재사용하지 않는다.
5. 모델을 사용할 수 없거나 인증이 실패하면 blocker다. Sonnet·Bedrock·다른 모델로 fallback하지 않는다.
6. 양쪽 GO와 §8.1이 같은 SHA에서 통과하면 dev PR을 생성한다.
7. 같은 PR에서 본 계획을 다음 revision으로 현행화해 실제 commit, 로컬 시작/상태 명령, test artifact, 두 GO artifact, 남은 §8.2 gate를 기록한 뒤 종료한다.

## 9. 외부 인증과 확정 기본값

사용자 응답 없이 다음 값으로 구현을 끝낸다.

1. 누락 정본은 본 계획과 측정 계획 v5의 대체 계약으로 갈음한다.
2. 디자인 sidecar의 얼굴 이미지는 사용하지 않고 합성 placeholder를 쓴다.
3. body profile은 보고서에만 연결하고 AI prompt에서는 제외한다.
4. Phase 4 no-norm locale은 모집단 게이지 숨김 + 자기이력만 제공한다.
5. R5는 스텐실 레인, opt-in 기본 OFF, 기존 생성 계약 무변경, `eyelinerInnerExtension` δ=0/OFF, 라이브 레인 후속이다.
6. Lab은 `maxRunsPerRequest=5`, `sessionBudgetRuns=50`, `retentionDays=7`, CORS origin은 `http://127.0.0.1:5173` 하나, fixture principal은 `00000000-0000-4000-8000-000000000027`, raw response는 명시적 admin token 일치 시에만 허용한다.
7. model provider와 image generation은 `disabled`; deterministic fixture stage runner를 실제 실행 대상으로 삼는다.

유일한 외부 인증 관문은 로컬 Claude CLI first-party 계정과 `claude-fable-5` high 사용 가능 상태다. 로그아웃이면 구현·테스트·PR 준비는 계속하되 동일 SHA Claude GO만 `BLOCKED`로 남긴다. Sonnet·Bedrock·다른 모델로 대체하지 않는다.

## 10. R0–R5 마일스톤 매핑

| 단계 | 내용 | Local wave·의존 |
|---|---|---|
| R0 | 제품 플래그 OFF 유지 → fixture provenance 확보 → 숫자 없는 공용 DTO 배선 + B1–B4 계약 | L0→A. 관문: 상세 GET/fixture 기반 numeric-free 서술 |
| R1 | Local Report Lab + lab endpoint + `analysis_lab_runs` + localhost runner | A. 관문: §3.3 도구 축 + §8.1 |
| R2 | 7섹션 prompt 개정과 내추럴/글램 2종 | B. 자동 비교는 로컬, 최종 교체는 §8.2 blind rubric |
| R3 | bbox 배관 6건(v1 optional 키) + 시각자료 컴포넌트 | B. B4 좌표 프레임 계약 전제 |
| R4 | Claude 디자인을 typed web/mobile UI로 이식 + body profile 연결 | B→C. 직접 DC runtime 포함 금지 |
| R5 | AR 맞춤 핏 매핑·bridge·저장 계약 | D. §9의 보수적 D-1~D-6 기본값으로 정적 구현; 실제 δ와 device 시각 승인은 별도 gate |

측정 트랙과의 접점: R2 fixture는 측정 Phase 1 관문 통과 또는 측정 Phase 0 문구 개정 시 재생성한다(§2). §1 결측 목록은 측정 트랙 확장의 우선순위 입력이다. 측정 Phase 1/2의 실기기·보정 관문이 미완료인 동안 보고서 로컬 구현이 끝나도 제품 보정 플래그를 승격하지 않는다.
