# Project Guidelines

## Mobile Frontend Guide

For all mobile frontend work under `apps/mobile`, always read and follow:

```text
docs/mobile/FRONTEND_WORK_GUIDE.md
```

This guide is the source of truth for mobile frontend scope, design direction,
folder structure, mock data rules, shared UI rules, and Codex prompt conventions.

## Commit Message Rules

All commit messages must follow the Conventional Commits format.

Format:

```text
type: 한국어 설명
```

Allowed types:

```text
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
refactor: 동작 변화 없는 코드 구조 개선
test: 테스트 추가 또는 수정
chore: 설정, 패키지, 기타 작업
ci: CI/CD 설정 변경
```

Valid examples:

```text
feat: Slack 로그인 기능 추가
fix: refresh token 만료 처리 오류 수정
docs: README 실행 방법 추가
refactor: auth service 계층 분리
test: 로그인 API 테스트 추가
chore: 의존성 패키지 업데이트
ci: commitlint workflow 추가
```

Invalid examples:

```text
로그인 기능 추가
기능: 로그인 기능 추가
feat 로그인 기능 추가
update
fix:
```

Commit messages may use Korean in the subject, but the type must be one of
the allowed English keywords.

## Codex Commit Behavior

When Codex creates commits in this repository, it must automatically follow
the commit message rules above.

- Choose the commit type from the allowed English keywords without asking when
  the change scope is clear.
- Use `feat` for new user-facing functionality.
- Use `fix` for bug fixes or visual corrections.
- Use `docs` for documentation-only changes.
- Use `refactor` for structure changes that do not alter behavior.
- Use `test` for test additions or test updates.
- Use `chore` for dependency, configuration, or maintenance changes.
- Use `ci` for GitHub Actions or CI/CD changes.
- Write the subject in concise Korean by default.
- Keep the full commit header within 72 characters.
- Do not use non-allowed types such as `feature`, `기능`, `update`, or `style`.
- Before pushing, verify that the commit message follows the configured
  `commitlint` rules when the project dependencies are available.

## Font Rules

All mobile frontend screens and shared components must use the shared font
system instead of ad hoc font values.

- Use Pretendard as the default app font.
- Store font files under `apps/mobile/src/assets/fonts/`.
- Manage font family, font size, line height, and font weight through
  `apps/mobile/src/shared/theme/typography.ts`.
- Do not hardcode repeated `fontSize` values in screen components.
- Avoid hardcoding `fontWeight` values in screen components.
- Use semantic typography tokens with the following minimum scale:

```text
fontFamily.primary = Pretendard

fontSize.xs = 12
fontSize.sm = 14
fontSize.md = 16
fontSize.lg = 18
fontSize.xl = 24
fontSize.xxl = 32

lineHeight.xs = 16
lineHeight.sm = 20
lineHeight.md = 24
lineHeight.lg = 26
lineHeight.xl = 32
lineHeight.xxl = 40

fontWeight.regular = 400
fontWeight.medium = 500
fontWeight.semibold = 600
fontWeight.bold = 700
```

Token usage guide:

```text
xs: helper text and captions
sm: small labels and secondary button text
md: default body text
lg: section titles
xl: screen titles
xxl: emphasized titles
```

## Icon Rules

All mobile frontend icons must use one shared icon direction.

- Use one team-approved icon library across the app.
- Prefer the Lucide icon family.
- For React Native, use `lucide-react-native` after team agreement.
- If a new dependency is required, do not add it without team agreement.
- Use a shared Icon component or the approved icon library for new screens.
- Manage icon sizes through shared theme tokens.
- Temporary hand-drawn View icons are allowed only until the shared Icon
  component is finalized.
- Do not use text characters as icons.

Invalid text-icon examples:

```text
×
↻
>
<
★
```

Minimum icon size scale:

```text
iconSize.xs = 16
iconSize.sm = 20
iconSize.md = 24
iconSize.lg = 28
iconSize.xl = 32
```

## Design Token Rules

Shared design values must live in `apps/mobile/src/shared/theme`.

- Manage colors, spacing, radius, shadow, typography, and icon sizes in
  shared theme files.
- Do not repeat raw numbers across screen components when a shared token
  exists.
- Keep reusable UI components in `apps/mobile/src/shared/ui`.
- Keep feature-specific UI inside the relevant `apps/mobile/src/features`
  folder.
- Build shared Button, Text, Icon, Header, and Footer components from the
  shared UI and theme rules.
- Build common UI with Tamagui.
- Do not add another UI library besides Tamagui.
- Treat the icon library as an icon-only dependency, not a second UI library.

## Do Not

- Do not hardcode repeated `fontSize` values in screens.
- Do not hardcode repeated `fontWeight` values in screens.
- Do not use text characters as icons.
- Do not mix multiple icon libraries across screens.
- Do not add new libraries without team agreement.
- Do not ignore shared theme tokens for colors, spacing, radius, typography,
  or icon sizes.
