# 룩톡 Product Spec

## 1. Purpose

룩톡은 Aura 홈에서 진입하는 메이크업 커뮤니티이다. 단순한 글 목록이 아니라 사용자가 메이크업 룩을 발견하고, 저장하고, 따라 해보고, 질문할 수 있는 이미지 중심 피드로 설계한다.

핵심 경험은 다음과 같다.

- 사용자는 홈의 커뮤니티 액션을 눌러 룩톡 피드에 진입한다.
- 피드는 대표 이미지, 무드 태그, 상황 태그, 난이도, 소요시간, 반응 수를 먼저 보여준다.
- 상세 화면은 룩북처럼 이미지와 메이크업 정보를 보여주고, 댓글은 Threads처럼 가볍게 이어진다.
- 글쓰기는 사진 중심으로 시작하고, 룩 정보와 사용 제품을 단계적으로 입력한다.

UI copy는 `룩톡`을 사용한다. 코드, route, API, DB naming은 기존 프로젝트 패턴에 맞춰 `Community` 또는 `community_*`를 사용한다.

## 2. Entry And Navigation

기존 홈 탭 구조는 유지한다.

- `HomeTab`은 그대로 메인 홈이다.
- 홈 화면의 커뮤니티 quick action은 `Community` route로 이동한다.
- `Community` placeholder는 실제 `CommunityHomeScreen`으로 교체한다.
- 상세와 작성은 RootStack route로 추가한다.

Routes:

- `Community`: 룩톡 피드
- `CommunityThreadDetail`: `{threadId: string}`
- `CommunityThreadCreate`: `undefined`

Deep links:

- `community`
- `community/thread/:threadId`
- `community/create`

## 3. Community Categories

MVP 카테고리는 다음 5개이다.

| UI Label | API Value | Meaning |
| --- | --- | --- |
| 트렌딩 | `trending` | 저장/좋아요/댓글/조회 기반 인기 룩 discovery tab |
| 룩북 | `lookbook` | 데일리, 데이트, 하객, 페스티벌 등 완성 룩 공유 |
| 질문 | `question` | 톤, 제품, 조합, 어울림 질문 |
| 제품조합 | `product_combo` | 립+치크, 베이스, 아이 조합 공유 |
| 비포애프터 | `before_after` | 전후 비교, 따라 해본 후기 |

`trending`은 작성 카테고리가 아니라 discovery tab이다. DB에 저장되는 카테고리는 `lookbook`, `question`, `product_combo`, `before_after` 중 하나다.

Sort:

- `latest`: 최신순
- `popular`: 인기순

## 4. Feed UX

피드는 one-column editorial card layout을 사용한다. Masonry는 MVP 이후로 미룬다.

Feed card requirements:

- 대표 이미지는 4:5 비율로 고정한다.
- 이미지는 카드의 첫 번째 시각 요소이다.
- 카드 안에서는 본문을 길게 노출하지 않는다.
- 제목은 1-2줄까지 허용한다.
- 무드 태그는 최대 3개만 노출한다.
- 상황 태그, 난이도, 소요시간은 작게 정리한다.
- 좋아요, 댓글, 저장 수를 compact reaction row로 표시한다.
- 저장 버튼은 빠르게 누를 수 있게 카드 우상단 또는 우하단에 둔다.
- 카드 터치 시 상세로 이동한다.

Feed states:

- loading skeleton
- empty state
- error state with retry
- pull to refresh
- pagination or cursor-based load more

## 5. Thread Detail UX

상세 화면은 룩북처럼 보인다.

Required sections:

- 이미지 캐러셀
- 카테고리 pill
- 제목
- 작성자, 작성 시간
- 무드 태그
- 상황 태그
- 난이도
- 소요시간
- 본문
- 사용 제품
- 좋아요, 저장, 공유, 신고
- 댓글 리스트
- sticky 댓글 입력 composer

Product usage groups:

- 베이스
- 아이
- 치크
- 립

댓글 정책:

- 댓글은 1단계 대댓글까지만 허용한다.
- 대댓글의 대댓글은 API에서 거부한다.
- 댓글 작성은 로그인/DB가 가능한 상태에서만 성공한다.

## 6. Create Thread UX

글쓰기는 복잡한 게시판 폼이 아니라 룩 등록 플로우처럼 보이게 한다.

Sections:

1. 사진
2. 룩 정보
3. 무드/상황
4. 사용 제품
5. 미리보기/게시

Validation:

- 이미지 1-4장 필수
- 제목 1-30자 필수
- 카테고리 필수
- 본문 최대 2000자
- 무드 태그 최대 6개
- 상황 태그 최대 6개
- 제품 그룹별 항목명 최대 60자
- 게시 버튼은 필수 조건 충족 전 disabled

Image upload:

- 기존 `uploadMediaAsset` 서비스를 재사용한다.
- `mediaKind`는 `community-thread`를 사용한다.
- 업로드 완료 후 `mediaIds` 순서대로 thread create API에 전달한다.
- thread creation 실패 후 업로드된 orphan media는 MVP에서 즉시 삭제하지 않는다.

## 7. Mobile Types

```ts
export type CommunityCategory =
  | 'trending'
  | 'lookbook'
  | 'question'
  | 'product_combo'
  | 'before_after';

export type WritableCommunityCategory =
  | 'lookbook'
  | 'question'
  | 'product_combo'
  | 'before_after';

export type CommunitySort = 'latest' | 'popular';

export type CommunityProductUsage = {
  base: CommunityProductUsageItem[];
  eye: CommunityProductUsageItem[];
  cheek: CommunityProductUsageItem[];
  lip: CommunityProductUsageItem[];
};

export type CommunityProductUsageItem = {
  name: string;
  shade?: string | null;
};

export type CommunityThreadCounts = {
  likes: number;
  replies: number;
  saves: number;
  views: number;
};

export type CommunityViewerState = {
  liked: boolean;
  saved: boolean;
};
```

Thread summary includes `id`, `title`, `category`, `coverMedia`, `moodTags`, `situationTags`, `difficulty`, `durationMinutes`, `author`, `counts`, `viewerState`, and `createdAt`.

Thread detail adds `body`, `media`, `productUsage`, and `replies`.

## 8. Backend API

All responses use the existing `success()` envelope and camelCase output.

### GET `/api/community/threads`

Query params:

- `category?: trending | lookbook | question | product_combo | before_after`
- `sort?: latest | popular`
- `cursor?: string`
- `limit?: number`

Response:

```json
{
  "threads": [],
  "nextCursor": null
}
```

Behavior:

- If DB is not configured, return an empty list with fallback meta.
- `trending` uses popular ordering and does not filter by stored category.
- Default category is `trending`.
- Default sort is `popular` for `trending`, `latest` otherwise.

### POST `/api/community/threads`

Requires auth and DB.

Body:

```json
{
  "category": "lookbook",
  "title": "로즈 글로우 데일리 룩",
  "body": "오늘 사용한 조합이에요.",
  "mediaIds": ["uuid"],
  "moodTags": ["글로우", "로즈"],
  "situationTags": ["데일리"],
  "difficulty": "easy",
  "durationMinutes": 10,
  "productUsage": {
    "base": [{"name": "톤업 선크림", "shade": null}],
    "eye": [],
    "cheek": [],
    "lip": []
  }
}
```

Validation:

- `category` cannot be `trending`.
- `mediaIds` length must be 1-4.
- All media must belong to the current user.
- Title max 30 characters.
- Body max 2000 characters.

### GET `/api/community/threads/{thread_id}`

Returns thread detail and increments view count.

### POST `/api/community/threads/{thread_id}/replies`

Requires auth and DB.

Body:

```json
{
  "body": "이 립 조합 예뻐요!",
  "parentReplyId": null
}
```

Validation:

- Body max 1000 characters.
- `parentReplyId` may reference only a top-level reply.
- Nested depth greater than 1 is rejected.

### POST/DELETE like and save

Endpoints:

- `POST /api/community/threads/{thread_id}/like`
- `DELETE /api/community/threads/{thread_id}/like`
- `POST /api/community/threads/{thread_id}/save`
- `DELETE /api/community/threads/{thread_id}/save`

Behavior:

- Idempotent.
- Returns `{threadId, liked}` or `{threadId, saved}`.
- Counts should remain consistent.

### POST `/api/community/reports`

Requires auth and DB.

Body:

```json
{
  "targetType": "thread",
  "targetId": "uuid",
  "reason": "spam",
  "detail": "홍보성 게시물이에요."
}
```

Supports target types `thread` and `reply`.

Duplicate report by the same user for the same target is rejected or treated idempotently.

## 9. DB Spec

### `community_threads`

- `id uuid primary key default gen_random_uuid()`
- `author_user_id uuid not null`
- `category text not null`
- `title text not null`
- `body text not null default ''`
- `mood_tags text[] not null default '{}'`
- `situation_tags text[] not null default '{}'`
- `difficulty text`
- `duration_minutes integer`
- `product_usage jsonb not null default '{}'::jsonb`
- `like_count integer not null default 0`
- `reply_count integer not null default 0`
- `save_count integer not null default 0`
- `view_count integer not null default 0`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

### `community_thread_media`

- `id uuid primary key default gen_random_uuid()`
- `thread_id uuid not null`
- `media_id uuid not null`
- `sort_order integer not null`
- `created_at timestamptz not null default now()`
- unique `(thread_id, media_id)`
- unique `(thread_id, sort_order)`
- check `sort_order between 0 and 3`

### `community_replies`

- `id uuid primary key default gen_random_uuid()`
- `thread_id uuid not null`
- `parent_reply_id uuid`
- `author_user_id uuid not null`
- `body text not null`
- `like_count integer not null default 0`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

### `community_thread_likes`

- `user_id uuid not null`
- `thread_id uuid not null`
- `liked_at timestamptz not null default now()`
- primary key `(user_id, thread_id)`

### `community_thread_saves`

- `user_id uuid not null`
- `thread_id uuid not null`
- `saved_at timestamptz not null default now()`
- primary key `(user_id, thread_id)`

### `community_reports`

- `id uuid primary key default gen_random_uuid()`
- `reporter_user_id uuid not null`
- `target_type text not null`
- `target_thread_id uuid`
- `target_reply_id uuid`
- `reason text not null`
- `detail text`
- `status text not null default 'open'`
- `created_at timestamptz not null default now()`
- unique duplicate prevention per reporter and target

Indexes:

- threads by category/status/created_at
- threads by popularity score fields
- media by thread/sort
- replies by thread/created_at
- likes/saves by user timestamp
- reports by target/status

## 10. MVP Exclusions

Not included in MVP:

- realtime notifications
- DM
- follow system
- hashtag search ranking
- product DB autocomplete
- AI 룩 추천 연동
- AR result auto-share
- video upload
- unlimited nested replies
- advanced moderation dashboard
- before/after comparison slider

## 11. Acceptance Criteria

- Home community action opens a 룩톡 feed, not a placeholder.
- Feed visually reads as a beauty look discovery surface.
- Detail shows images, tags, products, body, actions, and replies.
- Create screen can submit a valid 1-4 image thread through existing media upload.
- Backend exposes all planned community endpoints in OpenAPI.
- DB schema includes all community tables and constraints.
- Typecheck and focused tests pass.
