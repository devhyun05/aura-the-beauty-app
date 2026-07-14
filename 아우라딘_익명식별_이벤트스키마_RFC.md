# RFC: 아우라딘 익명 식별 및 이벤트 스키마 (A5)

- 상태: 승인 대기
- 작성일: 2026-07-15
- 기준 문서: `아우라딘_추천시스템_고도화_종합보고서.md` §7.2
- 범위: 식별·이벤트 저장 계약만 정의한다. **본 RFC에는 구현이 포함되지 않는다.**

---

## 1. 문제와 선행조건

현재 `auth_required=False`인 환경에서 `get_current_user()`는 `security.py`의 `_dev_auth_context()`가 만든 단일 `settings.dev_user_sub`를 반환한다. 여러 익명 사용자의 세션과 이벤트를 이 공용 subject에 기록하면 다음 오염이 발생한다.

- 서로 다른 사용자의 노출·클릭·저장이 한 사람의 이력처럼 합쳐진다.
- `(owner_subject, client_event_id)` 멱등성 범위가 실제 사용자 경계와 달라진다.
- 로그인 전후 이력 병합과 삭제권의 대상을 증명할 수 없다.
- 비멱등 세션에서 재시도 이벤트가 중복 축적되면 이후 개인화·A/B 데이터로 복구할 수 없다.

따라서 순서는 **A9 세션 멱등화 및 본 식별 계약 승인 → A5 이벤트 수집**으로 고정한다. 공용 dev subject를 이벤트 owner로 사용하는 구현은 금지한다.

## 2. 결정 제안

### 2.1 익명 ID 발급

1. 익명 ID는 IDFA, 광고 ID, MAC 주소, 기기 일련번호, IP/UA fingerprint가 아니라 **서버가 발급한 128-bit 이상의 무작위 opaque token**이다.
2. 웹은 first-party `Secure; HttpOnly; SameSite=Lax` cookie, 모바일은 OS secure storage에 저장한 device token으로 전달한다.
3. 서버는 원문 token을 이벤트 테이블에 저장하지 않고 서버 비밀키로 HMAC해 `anon:v1:<base64url-digest>` 형태의 `owner_subject`를 만든다.
4. token이 없거나 형식·서명이 유효하지 않으면 새 token을 발급한다. 클라이언트가 임의의 `owner_subject`를 직접 제출할 수 없다.
5. 앱 삭제, cookie 삭제 또는 명시적 익명 데이터 삭제 후에는 새 익명 ID가 발급된다. 서로 다른 기기 간 익명 이력은 자동 결합하지 않는다.

### 2.2 인증 사용자 owner

인증 요청은 검증된 Cognito `sub`를 서버에서 정규화해 `user:v1:<issuer-scope>:<sub>`를 canonical owner로 사용한다. 클라이언트가 제출한 사용자 ID, 이메일 또는 표시 이름은 owner 근거가 될 수 없다.

`auth_required=False` 개발 환경에서도 이벤트 수집은 다음 중 하나일 때만 허용한다.

- 유효한 익명 token으로 `anon:v1:*` owner를 만든 경우
- 테스트가 요청마다 명시적으로 격리한 test owner를 주입한 경우

그 외에는 추천 응답은 제공하되 이벤트 기록을 fail-open으로 건너뛴다. `settings.dev_user_sub`에는 이벤트를 적재하지 않는다.

### 2.3 로그인 전환과 병합

로그인 성공 시 서버는 그 요청이 소유한 익명 token과 인증 subject를 검증한 뒤 **단방향 identity link**를 만든다.

```text
anon:v1:<digest>  --linked_to-->  user:v1:<issuer-scope>:<sub>
```

병합 정책:

- 기존 `auradin_events.owner_subject`는 감사·멱등성 보존을 위해 다시 쓰지 않는다.
- 프로필 집계와 사용자 이력 조회는 인증 owner와 그 owner에 연결된 익명 subject를 하나의 read scope로 합친다.
- 하나의 익명 subject는 최초 연결된 인증 owner 한 명에게만 귀속된다. 다른 계정으로 재연결하지 않는다.
- 연결은 인증된 요청과 익명 token 소유 증명이 모두 있을 때만 만들며, 클라이언트가 임의의 과거 anon subject를 제출해 가져갈 수 없다.
- 로그아웃은 link를 끊거나 과거 이력을 다른 익명 ID로 복제하지 않는다. 이후 익명 활동을 분리하려면 새 token을 발급한다.
- 사용자 삭제는 canonical owner, 연결된 모든 anon owner의 이벤트, identity link, 파생 `user_taste_profile`을 한 트랜잭션에서 삭제한다.

이 방식은 이벤트 행을 인증 owner로 UPDATE할 때 생길 수 있는 `(owner_subject, client_event_id)` 충돌과 원본 귀속 손실을 피한다.

## 3. 이벤트 스키마 정본

아래 SQL은 종합보고서 §7.2의 구현 기준을 그대로 고정한 것이다. 구현 시 `docs/backend/schema.sql`과 `docs/backend/aws-postgresql-schema.dbml`을 함께 갱신해야 한다.

```sql
create table if not exists auradin_events (
  id bigserial primary key,
  client_event_id text not null,
  schema_version smallint not null default 1,
  owner_subject text not null,
  session_id text,
  turn_id text,
  result_set_id text,
  event_type text not null check (event_type in (
    'session_start',
    'question_answered',
    'impression',
    'product_open',
    'save',
    'unsave',
    'purchase_click',
    'refine_dial',
    'refine_prompt',
    'hide',
    'unhide'
  )),
  product_id text,
  category text,
  rank int,
  role text,
  match_rate int,
  data_manifest_id text not null,
  release_manifest_id text not null,
  catalog_run_date text,
  ranker_version text,
  payload jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  experiment_id text,
  variant text,
  unique (owner_subject, client_event_id)
);

create index if not exists idx_auradin_events_owner_time
  on auradin_events (owner_subject, occurred_at desc);
create index if not exists idx_auradin_events_session
  on auradin_events (session_id);
create index if not exists idx_auradin_events_manifest
  on auradin_events (data_manifest_id);
create index if not exists idx_auradin_events_received
  on auradin_events (received_at);
```

### 3.1 이벤트 타입 11종

| 이벤트 | 필수 연결 | 의미 |
|---|---|---|
| `session_start` | session, manifest | 추천 세션 시작 |
| `question_answered` | session, turn | 질문 선택 반영 |
| `impression` | result set, product, rank, role | 실제 화면에 노출 |
| `product_open` | result set, product | 상품 상세 열기 |
| `save` | product | 저장 |
| `unsave` | product | 저장 해제 |
| `purchase_click` | result set, product | 구매 링크 이동 |
| `refine_dial` | session, turn | 다이얼 기반 재탐색 |
| `refine_prompt` | session, turn | 텍스트 기반 재탐색 |
| `hide` | product | 부정 신호 |
| `unhide` | product | 부정 신호 취소 |

알 수 없는 이벤트 타입은 거부한다. 이벤트 기록 실패는 추천 응답을 막지 않는 fail-open으로 처리하되 실패율을 별도 운영 지표로 남긴다.

### 3.2 멱등성과 시간

- 클라이언트는 이벤트마다 안정적인 `client_event_id`를 생성하고 재시도 때 같은 값을 보낸다.
- 유니크 범위는 전역 ID가 아니라 `(owner_subject, client_event_id)`다.
- `occurred_at`은 클라이언트 발생 시각, `received_at`은 서버 수신 시각이다. 정렬·지연 분석에서 두 값을 바꿔 쓰지 않는다.
- 서버는 허용 가능한 clock skew와 미래 시각 거부 범위를 구현 RFC에서 별도로 고정한다.

### 3.3 manifest 귀속

모든 이벤트는 추천 결과를 만든 `data_manifest_id`와 `release_manifest_id`를 필수로 기록한다. `catalog_run_date`와 `ranker_version`은 조회 편의용 중복 값이며 정본은 manifest ID다. 이벤트 수신 시점의 최신 manifest가 아니라 **해당 session/result set에 봉인된 manifest ID**를 사용한다.

### 3.4 payload 허용 경계

`payload`에는 schema-versioned allowlist로 검증한 구조화 값만 저장한다.

허용 예:

- `scoreSnapshot.components`
- `filterDelta`
- refine dial 값
- 앱 버전, 플랫폼, locale, 동의 상태

금지:

- 얼굴 이미지, landmark, biometric embedding 또는 원시 얼굴 측정값
- 분석 리포트 원문과 personal color 원문
- 검색·refine prompt 원문
- 이메일, 전화번호, 이름, 주소, access/refresh token
- 네트워크·기기 fingerprint용 원시 IP/UA 조합

파서 개선을 위한 원문 수집은 본 테이블에 추가하지 않고 별도 opt-in, 별도 보존기간, 별도 승인 트랙으로 다룬다.

## 4. 보존과 삭제 계약

- 이벤트 기본 보존기간 제안은 `received_at` 기준 180일이다.
- 비파티션 MVP는 `idx_auradin_events_received`를 사용하는 주기적 batch DELETE로 만료분을 정리한다.
- 볼륨 임계 도달 전에는 파티셔닝을 도입하지 않는다. 도입 시 `received_at` range partition 전환을 별도 migration으로 설계한다.
- 익명 사용자의 삭제 요청은 현재 token으로 계산한 anon owner의 이벤트와 파생 프로필을 한 트랜잭션에서 삭제한다.
- 인증 사용자의 삭제 요청은 §2.3의 linked read scope 전체와 파생 프로필을 한 트랜잭션에서 삭제한다.
- 삭제 트랜잭션이 실패하면 일부 삭제 성공으로 응답하지 않는다. 재시도 가능한 실패로 반환한다.
- 운영 백업의 삭제 전파 기한과 법적 보존 예외는 승인 전 결정한다.

## 5. API 및 위협 경계

구현 시 최소 API 계약:

- `POST /search/events`: 최대 batch 크기, schemaVersion, 이벤트별 필수 필드를 검증하고 멱등 upsert한다.
- `DELETE /search/events`: 현재 증명된 owner scope의 이벤트·identity link·파생 프로필을 원자 삭제한다.

보안 불변식:

- 요청 body의 `ownerSubject`는 신뢰하지 않는다.
- 익명 token은 로그, analytics payload, 오류 메시지에 남기지 않는다.
- 인증 계정 연결은 CSRF 방어가 적용된 로그인 전환 요청에서만 수행한다.
- rate limit은 owner와 IP의 완화된 조합으로 적용하되 IP를 장기 identity로 사용하지 않는다.
- identity link 생성·삭제는 감사 이벤트로 남기되 원문 token은 기록하지 않는다.

## 6. 구현 전 미결정 항목

| ID | 항목 | 제안 기본값 | 결정 필요 이유 | 승인 결과 |
|---|---|---|---|---|
| D1 | 익명 token 발급 주체 | 서버 발급·서명 | 위조·탈취·멀티플랫폼 구현 영향 | |
| D2 | 웹 cookie 수명 | 180일 | 동의·제품 분석 기간과 결합 | |
| D3 | 모바일 token 저장소 | OS secure storage | 앱 재설치·백업 복원 동작 | |
| D4 | 로그인 후 새 익명 활동 | 기존 link 유지, 로그아웃 시 새 token | 공유 기기 계정 전환 오염 방지 | |
| D5 | 이벤트 보존기간 | 180일 | 분석 효용과 개인정보 최소화 균형 | |
| D6 | 백업 삭제 전파 SLA | 30일 이내 제안 | 사용자 고지·운영 비용 | |
| D7 | clock skew 허용 | 과거 24h, 미래 5m 제안 | 오프라인 전송과 조작 방어 | |
| D8 | Release Manifest 준비 전 A5 | 수집 시작 금지 | 필수 `release_manifest_id` 정본 부재 | |
| D9 | identity link 저장 스키마 | 별도 immutable link table | 행 UPDATE 병합 대비 감사·충돌 이점 | |

## 7. 승인 서명

아래 항목이 모두 채워지기 전에는 A5 이벤트 수집 구현을 시작하지 않는다.

| 역할 | 이름/식별자 | 결론 | 일시 | 비고 |
|---|---|---|---|---|
| Product owner | | pending | | |
| Backend owner | | pending | | |
| Security/Privacy reviewer | | pending | | |

최종 결론: `pending`

승인 조건:

- D1~D9가 모두 결정됨
- 익명 token 탈취·계정 연결·삭제 범위 threat review 완료
- DB migration, API contract, 모바일 저장소 작업의 소유자와 순서 확정
