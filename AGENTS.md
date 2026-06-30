# Project Guidelines

## Required Reading
- For all mobile frontend work under `apps/mobile`, read `docs/mobile/FRONTEND_WORK_GUIDE.md` first.
- Treat `docs/spec.md` as the product spec for the recommended makeup filter panel.
- Treat `docs/plan.md` as the implementation order and priority guide.

## Mobile Frontend Rules
- Work in `apps/mobile/src` using the existing React Native, TypeScript, React Navigation, and Tamagui stack.
- Do not add a new UI library or icon library without team agreement.
- Use mock data and service layers for unimplemented backend, AI, Unity, ARKit, or ARCore behavior.
- Keep reusable UI in `shared/ui`, tokens in `shared/theme`, mocks in `shared/mocks`, and feature code in `features`.

## Design Tokens
- Use Pretendard through `shared/theme/typography.ts`.
- Do not hardcode repeated font sizes, font weights, spacing, radius, colors, shadows, or icon sizes in screens.
- Use Tamagui for common UI.
- Use Lucide icons or the shared icon system; do not use text characters as icons.

## Recommended Filter Safety
- Do not use real celebrity, influencer, or actor photos, names, lookalikes, SNS handles, logos, or watermarks.
- Recommended filter images must use fictional models or clearly licensed assets.
- Do not reuse the same model face across multiple recommended filters.
- Treat trend names such as Kuro-Gyaru, Jirai Kei, Soft Goth, and Grunge as makeup/fashion styles only; avoid caricature, self-harm, violence, or medicalized styling.
- Render filter names and mood copy in the app UI, not baked into images.

## Code Quality
- Prefer existing patterns and helpers over new abstractions.
- Keep API-replaceable logic in services, not directly inside screens.
- Avoid `any`, unused code, temporary logs, and broad refactors unrelated to the task.
- Add focused tests for new data mapping, recommendation sorting, navigation params, and save behavior.
- Run `npm run typecheck` in `apps/mobile` when mobile code changes.

## Git And Commits
- Do not revert user changes unless explicitly asked.
- Commit messages must follow `type: 한국어 설명`.
- Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
- Choose the type automatically when the scope is clear and keep the header under 72 characters.
