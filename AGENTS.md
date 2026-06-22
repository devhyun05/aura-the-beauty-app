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
