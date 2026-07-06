# 룩톡 Implementation Plan

## Milestone 0. Safety Baseline

Priority: P0

Goal: 구현 전 현재 프로젝트 상태와 기존 패턴을 고정한다.

Tasks:

- Confirm branch is `feature/jun-communitycreate`.
- Confirm `Community` route currently points to placeholder.
- Confirm mobile service calls use `requestBackendJson`.
- Confirm upload flow uses `uploadMediaAsset`.
- Confirm backend API router and `success()` envelope pattern.
- Confirm schema changes belong in `docs/backend/schema.sql` and `docs/backend/aws-postgresql-schema.dbml`.

Done when:

- No unrelated files are modified.
- Existing Expo/Metro flow still starts.

## Milestone 1. Shared Mobile Community Model

Priority: P0

Goal: 룩톡의 타입, mock, API service contract를 먼저 만든다.

Tasks:

- Create `apps/mobile/src/features/community/types.ts`.
- Add categories, sort types, media, author, counts, viewer state, summary, detail, reply, product usage, create input types.
- Create `mocks/community.mock.ts` with image-first sample look threads.
- Create `services/communityService.ts`.
- Implement query builder for `GET /community/threads`.
- Implement fallback to mock data when backend base URL is missing or API fails.
- Add validation helpers for create form: image 1-4, title max 30, tag limits, body max 2000.

Acceptance:

- Mobile screens can be built against stable types before backend is complete.
- API service names are final:
  - `getCommunityThreads`
  - `getCommunityThreadDetail`
  - `createCommunityThread`
  - `createCommunityReply`
  - `likeCommunityThread`
  - `unlikeCommunityThread`
  - `saveCommunityThread`
  - `unsaveCommunityThread`
  - `reportCommunityTarget`

## Milestone 2. Mobile Feed UI

Priority: P0

Goal: `Community` placeholder를 룩 중심 피드로 교체한다.

Tasks:

- Create `CommunityHomeScreen`.
- Create `CommunityHeader`, `CommunityCategoryTabs`, `LookThreadCard`, `LookMoodChips`.
- Replace `CommunityRouteScreen` placeholder with `CommunityHomeScreen`.
- Feed uses a one-column `FlatList`.
- Add category tabs: 트렌딩, 룩북, 질문, 제품조합, 비포애프터.
- Add latest/popular sort control.
- Add loading skeleton, empty, error retry, pull refresh.
- Add floating write action to navigate to `CommunityThreadCreate`.
- Card press navigates to `CommunityThreadDetail`.

UX details:

- Image ratio is 4:5.
- Title is max 2 lines.
- Mood chips shown max 3.
- Body is not shown in cards.
- Reaction row shows likes, replies, saves, views.
- Save button is available directly from card.

Acceptance:

- Community entry from Home opens a polished 룩톡 feed.
- The feed does not look like a text 게시판.

## Milestone 3. Navigation Integration

Priority: P0

Goal: Community detail and create screens are first-class routes.

Tasks:

- Add `CommunityThreadDetail` and `CommunityThreadCreate` to `RootStackParamList`.
- Add routes to `rootStackRoutes`.
- Add screens to `RootNavigator`.
- Add chrome entries in `routeChrome`.
- Add deep links in `linkingConfig`.
- Add route contract tests for missing/unknown routes if existing tests require it.

Acceptance:

- Feed, detail, and create navigation typecheck.
- Deep link config has no missing root routes.

## Milestone 4. Thread Detail UI

Priority: P1

Goal: 하나의 룩을 룩북처럼 깊게 볼 수 있게 한다.

Tasks:

- Create `CommunityThreadDetailScreen`.
- Create `ThreadImageCarousel`, `ThreadActionBar`, `ProductUsageSection`, `ReplyList`, `ReplyComposer`.
- Load detail by `threadId`.
- Incremental UX: detail data fallback from mock when backend is unavailable.
- Add optimistic like/save.
- Add reply composer with disabled/loading states.
- Add report action through simple overflow/bottom sheet style interaction.

UX details:

- Top area is image carousel.
- Tags and title appear immediately below image.
- Product usage is grouped by base, eye, cheek, lip.
- Reply composer stays reachable and keyboard-safe.

Acceptance:

- Tapping a feed card opens detail.
- Like/save/reply can update UI and recover from API failure.

## Milestone 5. Create Thread UI And Upload Flow

Priority: P1

Goal: 사용자가 이미지 1-4장으로 룩 스레드를 작성할 수 있게 한다.

Tasks:

- Create `CommunityCreateThreadScreen`.
- Create `CreateThreadForm`.
- Add photo picker using existing Expo image picker dependency.
- Upload selected images with `uploadMediaAsset({mediaKind: "community-thread"})`.
- Submit ordered `mediaIds` to create thread API.
- Add sectioned form:
  - 사진
  - 룩 정보
  - 무드/상황
  - 사용 제품
  - 미리보기/게시
- Add validation and disabled submit state.
- Navigate to created detail after success.

Acceptance:

- A valid thread can be created with 1-4 uploaded images.
- Upload and submit errors show useful retryable UI.

## Milestone 6. Backend Community API

Priority: P1

Goal: FastAPI에 community endpoints를 추가한다.

Tasks:

- Add `services/backend/app/schemas/community.py`.
- Add `services/backend/app/api/community.py`.
- Include community router in `services/backend/app/api/router.py`.
- Implement list with cursor, category, sort, fallback empty response without DB.
- Implement create with auth, DB, media ownership validation.
- Implement detail with media, author, viewer state, replies, and view count.
- Implement reply create with max depth 1.
- Implement idempotent like/save create/delete.
- Implement report create with duplicate prevention.
- Add helper mappers that return camelCase-compatible dicts via `success()`.

Acceptance:

- OpenAPI includes all community endpoints.
- Writes require auth and DB.
- Reads do not crash when DB is not configured.

## Milestone 7. DB Schema And Docs

Priority: P1

Goal: community data model을 PostgreSQL schema에 추가한다.

Tasks:

- Add community table definitions to `docs/backend/schema.sql`.
- Add foreign keys, checks, unique constraints, indexes.
- Add updated_at triggers for mutable tables.
- Add DBML tables and refs to `docs/backend/aws-postgresql-schema.dbml`.
- Update schema checker required tables if applicable.
- Consider seed data only if local demo requires it.

Acceptance:

- Schema is idempotent with existing `create table if not exists` style.
- Likes/saves cannot duplicate.
- Media order is constrained to 0-3.
- Replies can store parent reply while API enforces depth.

## Milestone 8. Tests

Priority: P2

Goal: 핵심 계약과 UX helper를 깨지지 않게 고정한다.

Tasks:

- Mobile typecheck: `npm --prefix apps/mobile run typecheck`.
- Add mobile tests for service query building and create form validation.
- Add route/linking/chrome tests for new routes.
- Add backend route contract tests.
- Add backend API tests:
  - list fallback without DB
  - create validation
  - media ownership
  - like/save idempotency
  - reply depth rejection
  - report duplicate behavior

Acceptance:

- Typecheck passes.
- Existing tests remain green.
- New community behavior is covered at API and helper level.

## Milestone 9. Polish And Manual Verification

Priority: P2

Goal: 발표/데모에서 트렌디한 룩 피드로 보이게 마감한다.

Tasks:

- Review Korean copy for all visible UI.
- Check long title/tag/product overflow.
- Check Android small-screen layout.
- Check iOS safe area and keyboard composer.
- Confirm skeleton/empty/error states are visually polished.
- Confirm no new UI library was added.
- Confirm Expo logs show no fatal runtime error.

Demo flow:

1. Home quick action opens 룩톡.
2. User switches category to 룩북.
3. User opens a look card.
4. User likes/saves and writes a reply.
5. User creates a new look with images and product usage.

## Priority Summary

- P0: Model/service foundation, feed UI, route integration.
- P1: Detail, create/upload, backend API, DB schema.
- P2: Tests, polish, demo verification.

## PR Split Recommendation

1. Mobile shell: types, mocks, feed, navigation.
2. Mobile detail/create/upload.
3. Backend API and schema.
4. Tests and polish.
