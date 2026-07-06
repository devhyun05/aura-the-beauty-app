# 룩톡 커뮤니티 백엔드 설계 문서

> 프론트엔드 리디자인(P0~P2 + 개인화 3종) 완료 기준으로, 백엔드가 채워야 할 작업을 단계별로 정리한 구현 가이드.
> 기존 코드 컨벤션(FastAPI + asyncpg raw SQL, `success()` 엔벨로프, `AppError`, `ensure_user`)을 그대로 따른다.
> 작성: 2026-07-05 / 기준 프론트 커밋: `c02d6cb`

---

## 0. 현재 상태 요약

### 구현돼 있는 것 (`app/api/community.py`)

| 엔드포인트 | 상태 |
|---|---|
| `GET /community/threads` (category/sort/cursor/limit) | ✅ 단, 커서가 `created_at` 단독이라 인기 정렬에서 깨짐 (→ Phase 1.1) |
| `POST /community/threads` | ✅ 미디어 소유권 검증 + 트랜잭션 |
| `GET /community/threads/{id}` | ✅ view_count 증가 포함 |
| `POST /community/threads/{id}/replies` | ✅ 1단계 깊이 검증 포함. 단, 전체 detail 반환 (→ Phase 1.4) |
| `POST/DELETE /threads/{id}/like`, `/save` | ✅ |
| 신고 API | MVP 제외: 테이블은 남기되 라우트는 노출하지 않음 |

### 프론트가 기다리는 것 (이 문서의 범위)

| Phase | 내용 | 프론트 현행 대응 |
|---|---|---|
| ~~1.1~~ | ~~인기 정렬 복합 keyset 커서~~ | **불필요해짐** — 탭 개편(전체=최근 7일 인기 3 + 최신)으로 인기 정렬 페이지네이션 자체가 사라짐. 커서는 최신 정렬만 사용 |
| 1.2 | 답글 좋아요 API | 하트 카운트 display-only |
| 1.3 | 답글 삭제 API | 본인 로컬(낙관적) 답글만 삭제 가능 |
| 1.4 | 답글 생성 단건 응답 | 전체 detail로 통째 교체 중 |
| 2 | 행동 이벤트 수집 | 로컬 파일(expo-file-system)에 태그 점수 누적 — **신호 9종으로 확장됨** (아래 표) |
| 3 | 임베딩 매칭 추천 API | 룰 기반(퍼스널컬러 톤 사전) + 행동 관심사 결합 = "내 스타일 %" 클라이언트 계산, 추천 탭 전용 |
| 4 | 검색 | **프론트 로컬 검색 구현됨** (trending 풀 50건 클라이언트 필터) — 서버 시맨틱 검색으로 승격 대상 |
| 5 | RAG 매칭 설명 생성 (옵션) | 없음 |

### 프론트 신호 세트 (interestProfileService v2 — 서버 이벤트 스키마가 맞춰야 할 목록)

| 신호 | 가중치 | 수집 지점 |
|---|---|---|
| 저장 save | +3 | 카드/상세 저장 토글 on |
| 답글 작성 reply | +2.5 | 상세 답글 등록 |
| 좋아요 like | +2 | 카드/상세 좋아요 on |
| 검색어 search | +2/토큰 | 검색 제출 (토큰 최대 5개) |
| 정독 dwell | +1.5 | 상세 화면 12초 이상 체류 후 이탈 |
| 재방문 revisit | +1 | 같은 글 2회째 이상 조회 (seenThreads로 자동 판별) |
| 슬라이더 조작 slider | +1 | 비포애프터 슬라이더 첫 조작 (글당 1회) |
| 조회 view | +0.8 | 카드 탭 (첫 조회) |
| 비클릭 노출 impression | **−0.3** | 피드에서 60%·900ms 이상 노출 (세션당 글 1회) — 에이블리식 부정 신호 |

태그 점수 범위: −12(하한) ~ +60(상한). 클릭 시 순효과 = impression(−0.3) + view(+0.8) = +0.5.

---

## Phase 1 — 프론트 계약 마감 (기존 API 격차)

### 1.1 인기 정렬 복합 keyset 커서 — ⚠️ 탭 개편으로 불필요해짐

> **2026-07-05 갱신**: 전체 탭이 "최근 7일 인기 top 3(고정) + 최신순 피드"로 바뀌면서 인기 정렬 페이지네이션이 사라졌다.
> 백엔드에 필요한 것은 복합 커서가 아니라 **인기 top 3 쿼리** 하나다:
>
> ```sql
> select … from community_threads t …
> where t.deleted_at is null and t.status = 'active'
>   and t.created_at >= now() - interval '7 days'
>   and (t.like_count + t.save_count * 2 + t.reply_count) >= 1
> order by (t.like_count + t.save_count * 2 + t.reply_count) desc, t.created_at desc
> limit 3;
> ```
>
> 현재 프론트는 `sort=popular` 첫 페이지를 받아 클라이언트에서 7일 필터 + top 3를 뽑고 있으므로 기존 API로도 동작한다.
> 아래 복합 커서 설계는 나중에 인기 무한스크롤이 부활할 경우를 위한 참고로만 남긴다.

**문제(참고)**: `cursor_clause`가 `t.created_at < $n` 단독이라, `popular` 정렬(`like+save*2+reply` 점수순)에서 2페이지부터 점수 높은 최신 글이 스킵/중복된다.

**해법**: 정렬 축과 커서 축을 일치시킨 복합 keyset.

```sql
-- popular 정렬용 커서 조건 (score, created_at, id 3중 타이브레이커)
and (
  (t.like_count + t.save_count * 2 + t.reply_count) < $n
  or ((t.like_count + t.save_count * 2 + t.reply_count) = $n and t.created_at < $m)
  or ((t.like_count + t.save_count * 2 + t.reply_count) = $n and t.created_at = $m and t.id < $k)
)
order by (t.like_count + t.save_count * 2 + t.reply_count) desc, t.created_at desc, t.id desc
```

**커서 인코딩**: 정렬별 페이로드가 다르므로 base64(JSON) 불투명 커서 권장.

```python
# popular: {"s": 123, "t": "2026-07-05T…", "id": "uuid"} / latest: {"t": "…", "id": "uuid"}
next_cursor = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
```

- `latest` 정렬도 `(created_at, id)` 2중으로 올리면 동일 타임스탬프 경계가 안전해진다.
- 잘못된 커서는 `AppError(400, "INVALID_COMMUNITY_CURSOR", …)`.
- **프론트 변경**: [communityService.ts](../../apps/mobile/src/features/community/services/communityService.ts)는 커서를 불투명 문자열로 그대로 전달하므로 무변경. [CommunityHomeScreen.tsx](../../apps/mobile/src/features/community/screens/CommunityHomeScreen.tsx)의 "인기=1페이지 고정" 제한만 해제(effectiveSort 조건 제거).

**우선순위**: 중. 프론트 절충이 이미 동작하므로 1.2/1.4보다 뒤로 미뤄도 됨.

### 1.2 답글 좋아요

**DDL** (`schema.sql`에 추가):

```sql
create table if not exists community_reply_likes (
  user_id uuid not null,
  reply_id uuid not null,
  liked_at timestamptz not null default now(),
  primary key (user_id, reply_id)
);
-- FK: user_id -> users(id), reply_id -> community_replies(id) (기존 FK 섹션 패턴대로)
create index if not exists idx_community_reply_likes_reply on community_reply_likes (reply_id);
```

**엔드포인트** (스레드 like와 동일 패턴):

```
POST   /community/replies/{reply_id}/like   → {"reply_id", "liked": true}
DELETE /community/replies/{reply_id}/like   → {"reply_id", "liked": false}
```

- 카운트 동기화: `community_replies.like_count = (select count(*) from community_reply_likes where reply_id = $1)`
- **응답 스키마 확장**: `_reply()`에 `viewer_state: {"liked": bool}` 추가. detail의 reply 조회 쿼리에 `exists(select 1 from community_reply_likes rl where rl.reply_id = r.id and rl.user_id = $2) as viewer_liked` 조인.
- **프론트 변경**: `CommunityReply` 타입에 `viewerState?: {liked: boolean}` 추가 → [ReplyList.tsx](../../apps/mobile/src/features/community/components/ReplyList.tsx)의 display-only 하트를 토글 버튼으로 승격.

### 1.3 답글 삭제 (본인)

```
DELETE /community/replies/{reply_id}
```

- 권한: `r.author_user_id == viewer.id` 아니면 `AppError(403, "COMMUNITY_REPLY_FORBIDDEN", …)`.
- **Soft delete**: `status='deleted', deleted_at=now()` (스레드와 동일 패턴).
- **자식 답글 정책 (결정 필요)** — 권장: 자식이 있으면 행을 지우지 않고 목록에서 `body`를 "삭제된 답글이에요"로 마스킹해 스레드 구조 유지, 자식이 없으면 목록에서 완전 제외. (Threads/인스타 방식)
- `reply_count` 재계산 (기존 create_reply의 재계산 쿼리 재사용).
- **프론트 변경**: [CommunityThreadDetailScreen.tsx](../../apps/mobile/src/features/community/screens/CommunityThreadDetailScreen.tsx) `replyHandlers.onDeleteReply`에서 API 호출 후 로컬 제거. 본인 판별은 현재 `VIEWER_AUTHOR_ID='me'` 하드코딩 → 세션 유저 id로 교체 필요(백엔드가 detail 응답에 `viewer_user_id`를 내려주면 가장 깔끔).

### 1.4 답글 생성 단건 응답

**문제**: `POST /threads/{id}/replies`가 전체 detail을 반환 → 프론트 낙관적 삽입이 통째 교체돼 애니메이션·스크롤 위치가 리셋된다.

**해법**: 생성된 reply 단건 + 갱신 카운트만 반환.

```json
{ "reply": { …_reply() 형식, "parent_reply_id": … }, "counts": { "replies": 25 } }
```

- 하위호환이 걱정되면 `?response=reply` 쿼리 스위치로 점진 전환해도 된다(프론트만 쓰는 API라 바로 바꿔도 무방).
- **프론트 변경**: `createCommunityReply` 반환 타입 변경 → 상세 화면에서 낙관적 항목을 서버 reply로 id만 교체(단건 병합). 목 구현도 동일 형태로 맞춤.

---

## Phase 2 — 행동 이벤트 수집 (개인화 서버화 기반)

프론트 [interestProfileService.ts](../../apps/mobile/src/features/community/services/interestProfileService.ts)가 로컬로 하던 신호 수집을 서버로 승격한다. 로컬 프로필은 오프라인 폴백으로 유지.

**DDL**:

```sql
create table if not exists community_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  thread_id uuid,
  event_type text not null,          -- 프론트 신호 세트와 1:1 (위 표 참고)
  search_query text,                 -- event_type='search'일 때만
  dwell_ms integer,                  -- event_type='dwell'일 때 체류 시간
  created_at timestamptz not null default now(),
  constraint chk_community_events_type check (
    event_type in ('impression', 'view', 'revisit', 'dwell', 'like', 'save', 'reply', 'slider', 'search')
  ),
  constraint chk_community_events_target check (
    (event_type = 'search' and search_query is not null)
    or (event_type <> 'search' and thread_id is not null)
  )
);
create index if not exists idx_community_events_user_time on community_events (user_id, created_at desc);
```

**엔드포인트** (배치 허용 — 프론트가 모아 보낼 수 있게):

```
POST /community/events
body: {"events": [{"event_type": "view", "thread_id": "…"}, …]}  (최대 20건)
→ {"accepted": n}
```

- like/save는 기존 reaction 엔드포인트에서 서버가 직접 이벤트를 적재해도 된다(프론트 중복 발사 방지). **권장**: reaction은 서버 적재, view/search만 이벤트 API로.
- 유저별 태그 프로필은 조회 시점 집계(뷰) 또는 Phase 3의 행동 벡터 입력으로 사용:

```sql
-- 최근 30일 명시 행동 신호만 추천 점수에 반영한다. 미정의 이벤트는 0점이다.
select tag, sum(case e.event_type
  when 'save' then 3.0
  when 'reply' then 2.5
  when 'like' then 2.0
  when 'dwell' then case when coalesce(e.dwell_ms, 0) >= 12000 then 1.5 else 0 end
  when 'revisit' then 1.0
  when 'slider' then 1.0
  when 'view' then 0.8
  when 'impression' then -0.3
  else 0
end) as score
from community_events e
join community_threads t on t.id = e.thread_id,
unnest(t.mood_tags || t.situation_tags || array[t.category]) as tag
where e.user_id = $1 and e.created_at > now() - interval '30 days'
group by tag order by score desc limit 30;
```

---

## Phase 3 — 임베딩 매칭 (리포트 ↔ 게시글) ★핵심

프론트의 룰 기반 `reportMatchService`를 임베딩 코사인 유사도로 교체한다. UI(배지·개인화 정렬)는 그대로, 점수 소스만 바뀐다.

### 3.1 임베딩 모델 선택

| 후보 | 차원 | 비용 | 한국어 | 비고 |
|---|---|---|---|---|
| **Amazon Bedrock `amazon.titan-embed-text-v2:0`** ✅ 권장 | 1024 | $0.02/1M tok (사실상 무료 수준) | 양호 | 관리 0, 키 1개면 끝 |
| Voyage `voyage-3-lite` | 512 | 유사 | 양호 | Anthropic 권장 파트너 |
| `multilingual-e5-base` (자체 호스팅) | 768 | 서버비 | 우수 | GPU/메모리 관리 부담 — 졸프 비권장 |

이하 1024차원 기준으로 기술. **임베딩 호출은 반드시 백엔드에서** (앱에 키 내장 금지).

### 3.2 스키마 (pgvector)

```sql
create extension if not exists vector;

alter table community_threads add column if not exists embedding vector(1024);
alter table analysis_reports  add column if not exists embedding vector(1024);

-- 수천 건 규모까지는 인덱스 없이 seq scan도 충분. 만 건 넘으면:
create index if not exists idx_community_threads_embedding
  on community_threads using hnsw (embedding vector_cosine_ops);
```

> RDS PostgreSQL은 15.2+에서 pgvector 지원. `CREATE EXTENSION vector` 권한 확인 필요.

### 3.3 임베딩 입력 텍스트 규칙 (일관성이 생명)

```python
def thread_embedding_text(t) -> str:
  products = " ".join(item["name"] for group in t.product_usage.values() for item in group)
  return f"{t.title}\n무드: {' '.join(t.mood_tags)}\n상황: {' '.join(t.situation_tags)}\n제품: {products}\n{t.body[:500]}"

def report_embedding_text(r) -> str:
  return f"퍼스널컬러: {r.personal_color}\n피부: {r.skin_type}\n추천 무드: {r.recommended_mood}\n{r.tone_summary}\n태그: {' '.join(r.tags or [])}"
```

### 3.4 임베딩 파이프라인

- **게시글**: `POST /threads` 트랜잭션 커밋 후 동기 임베딩(글 수백 건 규모에서 지연 ~수백 ms, 허용). 실패 시 embedding null로 두고 게시는 성공시킴 → 야간 배치/재시도 스크립트로 백필.
- **리포트**: 분석 완료 훅에서 동일하게. 기존 리포트는 1회성 백필 스크립트(`app/db/` 패턴).

### 3.5 추천 API

```
GET /community/threads/recommended?limit=20
→ {"threads": [ …_thread_summary + "match_percent": 87 ], "based_on": {"report_id": "…"} }
```

```sql
select t.*, …(기존 summary 조인)…,
  1 - (t.embedding <=> r.embedding) as similarity
from community_threads t, analysis_reports r
where r.id = (select id from analysis_reports where user_id = $1 and status = 'completed'
              order by created_at desc limit 1)
  and t.embedding is not null and t.deleted_at is null and t.status = 'active'
order by t.embedding <=> r.embedding asc
limit $2;
```

- **match_percent 산식**: 코사인 유사도는 보통 0.3~0.8 사이에 몰리므로 캘리브레이션해서 노출.
  `percent = round(clamp((sim - 0.18) / (0.55 - 0.18), 0, 1) * 100)` — Bedrock Titan 실제 QA backfill 분포(약 0.18~0.54)를 보고 조정.
- **"내 스타일 %" 결합 (프론트 산식과 일치시킬 것)**: `스타일% = 톤 매칭% × 0.5 + 행동 관심사(0~100 정규화) × 0.5`.
  서버 구현 시 행동 축은 community_events 가중 합(위 신호 표) 또는 유저 행동 벡터(`0.6 × 리포트 임베딩 + 0.4 × 최근 상호작용 글 임베딩 평균`)로 대체.
  리포트 없으면 관심사만으로(콜드스타트), 배지 노출 threshold = 40 (프론트 `STYLE_BADGE_THRESHOLD`).
- 리포트 없는 유저: 400 대신 `{"threads": [], "based_on": null}` — 프론트가 룰 기반 폴백 유지.

### 3.6 프론트 교체 지점

| 파일 | 변경 |
|---|---|
| `reportMatchService.ts` | `loadReportMatchContext` → 백엔드 있으면 recommended API 결과의 `match_percent` 맵 사용, 없으면 현행 룰 기반 폴백 (기존 mock 폴백 패턴과 동일) |
| `CommunityHomeScreen.tsx` | `matchPercentByThreadId`를 API 응답으로 채움 — 배지·가점 로직 무변경 |
| `MATCH_BADGE_THRESHOLD` (55) | 유지 — 서버 percent도 같은 기준으로 캘리브레이션 |

---

## Phase 4 — 검색

- **시맨틱 검색 (권장)**: Phase 3 인프라 재활용 — 질의를 임베딩해서 벡터 검색. "물광 피부"로 "글로우 스킨" 글이 잡힌다.
  ```
  GET /community/search?q=하객룩 물광&limit=20
  ```
  질의 임베딩 1회 호출 + `order by embedding <=> $qvec`. 보조로 `pg_trgm` ILIKE(제목·태그 정확 매치 부스트).
- 검색 실행 시 `community_events(event_type='search', search_query=…)` 적재 → "검색 기록 기반 관심사"가 여기서 완성된다.
- 프론트: 홈 타이틀 바에 검색 아이콘 + 검색 화면 (백엔드 완성 후 요청 주면 붙임).

## Phase 5 (옵션) — RAG 매칭 설명 생성

발표 임팩트용. "이 룩이 봄웜 라이트인 당신에게 어울리는 이유: 코랄 베이스와 물광 마감이…" 를 LLM이 생성 — 여기서부터가 진짜 RAG(검색된 게시글+리포트를 근거로 생성).

```
POST /community/threads/{thread_id}/match-explanation
→ {"explanation": "…", "cached": true}
```

- 모델: `claude-haiku-4-5` (저비용·저지연). 입력 = 리포트 요약 + 게시글 텍스트, 출력 2문장 제한.
- 같은 (report_id, thread_id) 쌍은 테이블 캐시 — 호출당 1회만 과금.
- 비용: 호출당 입력 ~600tok + 출력 ~100tok → 데모 수백 회 돌려도 $1 미만.

---

## 마이그레이션 & 검증 체크리스트

1. **순서**: `community_reply_likes` → replies 응답 확장(1.2) → 답글 삭제(1.3) → 단건 응답(1.4) → `community_events`(2) → pgvector + embedding 컬럼(3) → 백필 스크립트 → recommended API
2. `docs/backend/aws-postgresql-schema.dbml` + `schema.sql` + `app/db/check_schema.py` 세 곳 동기화 (기존 패턴)
3. `tests/test_community_api.py` 확장 포인트:
   - popular 커서 경계(동점 score) 왕복 시 중복/누락 0
   - reply like 토글 idempotency (`on conflict do nothing`)
   - 타인 답글 삭제 403 / 자식 있는 답글 삭제 시 마스킹
   - recommended: 리포트 없는 유저 빈 배열, embedding null 글 제외
4. `test_route_contract.py`에 신규 라우트 추가

## 열린 결정 사항 (구현 전 확정 필요)

- [ ] 1.3 자식 답글 삭제 정책 (마스킹 vs 연쇄 숨김) — 권장: 마스킹
- [ ] 3.1 임베딩 모델 확정 (권장: amazon.titan-embed-text-v2:0) + API 키 시크릿 관리 위치
- [ ] 3.5 match_percent 캘리브레이션 상수 (실데이터로 조정)
- [ ] detail 응답에 `viewer_user_id` 포함 여부 (프론트 본인 답글 판별용 — 권장: 포함)
