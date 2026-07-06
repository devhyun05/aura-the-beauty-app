# Project Guidelines

## Source Of Truth
- Treat `docs/spec.md` as the product spec for 룩톡, the look-first community feature.
- Treat `docs/plan.md` as the implementation order and priority guide.
- For mobile frontend work, read `docs/mobile/FRONTEND_WORK_GUIDE.md` first.

## Product Direction
- 룩톡 is not a text 게시판; it is a beauty look discovery feed.
- Keep `HomeTab` as home and use the existing Community entry action.
- UI copy may say `룩톡`; internal route/API/DB names should use `Community` or `community_*`.
- Prioritize image, mood tags, product usage, save, and lightweight replies.

## Mobile Rules
- Work in `apps/mobile/src` with Expo React Native, TypeScript, React Navigation, and Tamagui.
- Do not add a new UI or icon library.
- Use existing theme tokens for colors, spacing, typography, radius, shadows, and icon sizes.
- Keep feature code under `features/community` unless a truly shared component belongs in `shared/ui`.
- Use `requestBackendJson` for backend calls and `uploadMediaAsset` for community images.
- Use `mediaKind: "community-thread"` for 룩톡 uploaded images.
- Preserve loading, empty, error, refresh, keyboard, and safe-area states.

## Backend Rules
- Use FastAPI route files under `services/backend/app/api`.
- Use the existing `success()` envelope and camelCase response behavior.
- Writes require auth and DB; reads should return safe empty fallback when DB is unavailable where practical.
- Validate media ownership before attaching images to community threads.
- Keep reply depth to one nested level.

## DB Rules
- Update both `docs/backend/schema.sql` and `docs/backend/aws-postgresql-schema.dbml` for schema changes.
- Keep schema SQL idempotent with existing `create table if not exists` style.
- Add FKs, checks, indexes, and duplicate-prevention constraints for likes, saves, reports, and media order.
- Prefer JSONB for MVP product usage, leaving room for later product DB linking.

## Quality
- Prefer existing patterns and helpers over new abstractions.
- Avoid unrelated refactors, temporary logs, broad `any`, and unused code.
- Add focused tests for route contracts, API behavior, service mapping, validation, and navigation.
- Run mobile typecheck when mobile code changes.
- Do not revert user changes unless explicitly asked.
