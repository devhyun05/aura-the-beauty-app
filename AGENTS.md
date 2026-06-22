# Project Guidelines

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
