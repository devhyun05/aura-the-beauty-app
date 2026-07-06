# 룩톡 백엔드 실행 가이드 (Step-by-Step)

> [community-backend-design.md](./community-backend-design.md)의 설계를 **실제 작업 순서대로** 쪼갠 실행 문서.
> 위에서부터 순서대로 진행하면 된다. 각 Step은 독립적으로 커밋 가능한 단위.
> 프론트(커밋 `bdfc9eb` 기준)는 모든 Step에 이미 대응돼 있어 API만 생기면 자동 연동된다.

## 전제 (모든 Step 공통)

- **컨벤션**: FastAPI + asyncpg raw SQL, 응답은 `success()` 엔벨로프, 에러는 `AppError(status, CODE, message)`, 유저는 `ensure_user(db, auth)`.
- **스키마 3중 동기화**: 테이블 변경 시 반드시 세 곳을 같이 수정
  1. `docs/backend/schema.sql`
  2. `docs/backend/aws-postgresql-schema.dbml`
  3. `services/backend/app/db/check_schema.py`
- **테스트**: `services/backend/tests/test_community_api.py`에 케이스 추가 + `test_route_contract.py`에 신규 라우트 등록.
- **프론트 연동 확인법**: 앱 환경변수에 백엔드 URL 설정 → 프론트는 `getBackendApiBaseUrl()` 유무로 목/실서버 자동 전환.

---

## Step 0. 현재 작업분 커밋 ✅ 먼저

워킹 트리에 미커밋 상태인 백엔드 기본 API를 커밋한다 (브랜치 전환 시 유실 방지).

- [ ] `services/backend/app/api/community.py` (threads CRUD/replies/like/save/events — 신고 API는 MVP 제외)
- [ ] `services/backend/app/schemas/community.py`
- [ ] `services/backend/tests/test_community_api.py`
- [ ] `docs/backend/schema.sql`, `aws-postgresql-schema.dbml`, `docs/spec.md`, `docs/plan.md` 수정분

**DoD**: 커밋 후 `pytest services/backend/tests/test_community_api.py` 통과.

---

## Step 1. 답글 좋아요 API

### 1-1. DDL (`schema.sql` + dbml + check_schema)

```sql
create table if not exists community_reply_likes (
  user_id uuid not null,
  reply_id uuid not null,
  liked_at timestamptz not null default now(),
  primary key (user_id, reply_id)
);
create index if not exists idx_community_reply_likes_reply on community_reply_likes (reply_id);
-- FK 섹션: user_id -> users(id), reply_id -> community_replies(id)
```

### 1-2. 엔드포인트 (`community.py`)

```
POST   /community/replies/{reply_id}/like   → success({"reply_id", "liked": true})
DELETE /community/replies/{reply_id}/like   → success({"reply_id", "liked": false})
```

- 스레드 like의 `_set_thread_reaction` 패턴 복제: `on conflict do nothing` insert / delete 후
  `community_replies.like_count = (select count(*) from community_reply_likes where reply_id=$1)` 재계산.
- 존재하지 않는/삭제된 답글이면 `AppError(404, "COMMUNITY_REPLY_NOT_FOUND", …)`.

### 1-3. 응답 확장

- `_fetch_thread_detail`의 reply 쿼리에 조인 추가:
  `exists(select 1 from community_reply_likes rl where rl.reply_id = r.id and rl.user_id = $2) as viewer_liked`
- `_reply()`에 `"viewer_state": {"liked": bool(row.get("viewer_liked"))}` 추가.

### 1-4. 프론트 연동 (백엔드 완료 후 요청)

- `types.ts` `CommunityReply`에 `viewerState?: {liked: boolean}` 추가
- `communityService.ts`에 like/unlike reply 함수 추가
- `ReplyList.tsx`의 display-only 하트 → 토글 버튼 승격

**DoD**: 좋아요 토글 idempotency 테스트(연속 2회 POST에도 like_count 1) + detail 응답에 viewer_state 포함.

---

## Step 2. 답글 삭제 API

```
DELETE /community/replies/{reply_id}
```

- [ ] 권한: `r.author_user_id != viewer.id` → `AppError(403, "COMMUNITY_REPLY_FORBIDDEN", …)`
- [ ] Soft delete: `status='deleted', deleted_at=now()`
- [ ] **자식 정책(확정)**: 자식 있는 부모는 행 유지 — detail 쿼리에서 `deleted` 부모의 body를 `"삭제된 답글이에요"`로 치환해 스레드 구조 보존. 자식 없으면 목록 제외 (현행 `status='active'` 필터에 `or (status='deleted' and 자식존재)` 분기 추가)
- [ ] `reply_count` 재계산 (create_reply의 쿼리 재사용)
- [ ] detail 응답에 `viewer_user_id` 포함 → 프론트 본인 판별(`VIEWER_AUTHOR_ID='me'` 하드코딩 교체)

**DoD**: 본인 삭제 200 / 타인 403 / 자식 있는 삭제 시 마스킹 렌더 테스트.

---

## Step 3. 답글 생성 단건 응답

`POST /threads/{id}/replies`의 반환을 전체 detail → 단건으로 변경:

```json
{ "reply": { …_reply() 형식 }, "counts": { "replies": 25 } }
```

- [ ] insert 후 `returning *`로 방금 행을 받아 `_reply()` 매핑 (작성자 조인 포함)
- [ ] 프론트: `createCommunityReply` 반환 타입 변경 + 상세 화면에서 낙관적 항목을 서버 reply로 단건 교체

**DoD**: 답글 등록 시 프론트 리스트가 통째 리렌더되지 않고 단건 병합됨.

---

## Step 4. 인기 top3 쿼리 (선택 — 현행으로도 동작)

프론트 홈 탭은 `sort=popular` 1페이지를 받아 클라이언트에서 "최근 7일 + top3"를 뽑는다.
서버 최적화를 원하면 파라미터 추가:

```
GET /community/threads?category=trending&sort=popular&window_days=7&limit=3
```

`where t.created_at >= now() - ($n || ' days')::interval` 절만 추가. **인기 정렬 커서는 만들지 않는다** (탭 개편으로 불필요 — design doc §1.1 참고).

---

## Step 5. 행동 이벤트 수집 (개인화 서버화 기반)

### 5-1. DDL — design doc Phase 2의 `community_events` 그대로 (9종 이벤트 타입 + `dwell_ms`)

### 5-2. 엔드포인트

```
POST /community/events
body: {"events": [{"event_type": "view", "thread_id": "…"}, …]}  # 최대 20건
→ success({"accepted": n})
```

- [ ] like/save/reply는 기존 엔드포인트 내부에서 서버가 직접 적재 (프론트 중복 발사 방지)
- [ ] view/impression/dwell/slider/revisit/search만 이 API로
- [ ] 검증: 알 수 없는 event_type 400, 배열 20건 초과 400

### 5-3. 프론트 연동

`interestProfileService.recordThreadSignal`에서 로컬 기록과 **병행**해 이벤트 배치 전송(디바운스 큐). 로컬 프로필은 오프라인 폴백으로 유지.

**DoD**: 신호 가중치 표(design doc)와 event_type 1:1 매핑 확인.

---

## Step 6. 임베딩 매칭 (pgvector) ★ 핵심 차별화

### 6-1. 사전 준비

- [ ] Bedrock 임베딩 권한 발급 → 백엔드 AWS 자격 증명/역할 설정 (모델: `amazon.titan-embed-text-v2:0`, 1024차원)
- [ ] RDS에서 `create extension if not exists vector;` 권한 확인 (PostgreSQL 15.2+)

### 6-2. 스키마

```sql
alter table community_threads add column if not exists embedding vector(1024);
alter table analysis_reports  add column if not exists embedding vector(1024);
```
(수천 건까지 인덱스 불필요 — 만 건 넘으면 hnsw 추가, design doc §3.2)

### 6-3. 임베딩 파이프라인

- [ ] `app/services/embeddings.py` 신설: `embed_text(text) -> list[float]` (Bedrock 호출, 실패 시 None 반환)
- [ ] **입력 텍스트 규칙은 design doc §3.3의 함수 그대로** (제목+태그+제품+본문 500자 / 리포트는 퍼스널컬러+무드+톤요약+태그) — 일관성이 매칭 품질을 결정
- [ ] `create_thread` 커밋 후 동기 임베딩 (실패해도 게시 성공, embedding null)
- [ ] 분석 완료 훅에서 리포트 임베딩
- [ ] 백필 스크립트 `app/db/backfill_embeddings.py`: embedding null인 threads/reports 일괄 처리

### 6-4. 추천 API

```
GET /community/threads/recommended?limit=20
→ success({"threads": […summary + "match_percent"], "based_on": {"report_id"} | null})
```

- [ ] SQL·산식은 design doc §3.5 그대로 (코사인 유사도 → 캘리브레이션 percent)
- [ ] **스타일% 결합**: `스타일% = 톤매칭% × 0.5 + 행동관심사(0~100) × 0.5`, 배지 threshold **50** — 프론트 `STYLE_BADGE_THRESHOLD`와 반드시 일치
- [ ] 리포트 없는 유저: 빈 배열 + `based_on: null` (프론트가 룰 기반 폴백)

### 6-5. 프론트 교체 지점

| 파일 | 변경 |
|---|---|
| `reportMatchService.ts` | 백엔드 있으면 recommended API의 match_percent 사용, 없으면 현행 룰 기반 폴백 |
| `CommunityHomeScreen.tsx` | 추천 모드 데이터 소스를 recommended API로 — 배지/정렬 로직 무변경 |

**DoD**: "물광 피부" 리포트 유저에게 "글로우 스킨" 글이 상위 노출 (사전에 없는 의미 유사 매칭 = 룰 기반 대비 개선 증명).

---

## Step 7. 시맨틱 검색

```
GET /community/search?q=하객룩 물광&limit=20
```

- [ ] 질의 1회 임베딩 → `order by embedding <=> $qvec` (Step 6 인프라 재활용)
- [ ] 보조: `pg_trgm` ILIKE로 제목·태그 정확 매치 부스트
- [ ] 검색 실행을 `community_events(event_type='search')`로 적재 (Step 5)
- [ ] 프론트: `handleSearchSubmit`의 클라이언트 필터를 이 API 호출로 교체 (검색 UI 무변경)

---

## Step 8. 프로필 연동 API (신규 테이블 0개)

프론트는 이미 **커뮤니티 MY 탭**(하단 바 4번째 — 내 글/저장됨 그리드) + 공개 프로필 화면(`CommunityUserProfileScreen`, 상세 작성자 탭 진입)이 구현돼 있고, 아래 API가 생기면 목에서 실데이터로 자동 전환된다. 작성자 닉네임은 users 테이블(앱 프로필)과 단일 소스다.

```
GET /community/threads?author=me&limit=30      내가 올린 룩 (viewer 기준 해석)
GET /community/threads?author={user_id}&limit=30   특정 유저가 올린 룩 (공개 프로필)
GET /community/threads?saved=me&limit=30       내가 저장한 룩 (community_thread_saves 조인)
```

- [ ] `get_threads`에 `author`/`saved` 쿼리 파라미터 분기 추가 — `author=me`는 `ensure_user` 결과의 id로 치환, uuid면 그대로 필터
- [ ] `saved=me`: `join community_thread_saves s on s.thread_id = t.id and s.user_id = $viewer` + `order by s.saved_at desc`
- [ ] 정렬: author 조회는 `created_at desc` 고정 (커서 불필요, limit 30)
- [ ] 프론트 참고: `communityService.ts`의 `getCommunityThreadsByAuthor`/`getSavedCommunityThreads`가 이 계약을 이미 호출
- [ ] **팔로우/팔로워는 만들지 않는다** — 초기 커뮤니티에서 '팔로워 0' 노출은 역효과. 유저 규모 확보 후 P2 (design doc에 없음, 신규 설계 필요)

**DoD**: 커뮤니티 MY 탭과 공개 프로필이 실데이터로 렌더, 타인 author 조회 시 viewer_state가 조회자 기준으로 계산됨.

## 부록 A. 서버 측 카테고리 검증 미러링 (권장, Step 0 직후 아무 때나)

프론트 `validateCreateCommunityThreadInput`(communityService.ts)의 카테고리 규칙을 `create_thread`에도 미러링한다 (프론트 우회 방어):

- `before_after`: `len(media_ids) == 2` — **규약: media[0]=BEFORE(=커버, sort_order 0), media[1]=AFTER**. 프론트 슬라이더/작성 2슬롯이 이 순서를 전제한다.
- `product_combo`: product_usage 4그룹 합산 항목 **2개 이상**
- 위반 시 `AppError(400, "INVALID_COMMUNITY_PAYLOAD", …)`
- 참고: 제품 항목은 `{name, shade?}` — 프론트가 "제품명(쉐이드)" 문법으로 파싱해 보낸다.

## 부록 B. 응답 키 컨벤션

기존 엔드포인트처럼 **snake_case**로 응답한다 (`cover_media`, `next_cursor`, `viewer_state` …). camelCase 변환이 필요한지 여부는 `apps/mobile/src/shared/services/backendApi.ts`의 응답 처리에서 확인하고, **기존 get_threads 응답이 프론트에서 정상 동작하는 컨벤션을 그대로 따른다** (새 컨벤션 발명 금지).

## 진행 순서 요약

```
Step 0 (커밋)  →  오늘 바로
Step 1~3 (답글 3종)  →  반나절 묶음, 프론트 연동까지 하루
Step 4  →  선택 (스킵 가능)
Step 5 (이벤트)  →  반나절
Step 6 (임베딩)  →  1~2일 ★ 발표 차별화 포인트
Step 7 (검색)  →  Step 6 후 반나절
```

막히면: 각 Step의 상세 SQL/코드 스케치는 [community-backend-design.md](./community-backend-design.md) 해당 Phase 참조. 프론트 쪽 연동 작업(1-4, 3, 5-3, 6-5)은 백엔드 완료 후 요청하면 바로 붙임.
