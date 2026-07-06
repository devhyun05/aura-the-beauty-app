# 룩톡 백엔드 구현 에이전트 프롬프트

> 아래 전체를 복사해 백엔드 담당 에이전트(Claude Code 등)의 첫 메시지로 붙여넣으세요.

---

너는 이 리포지토리의 **백엔드 전담 시니어 엔지니어**다. 프론트엔드는 이미 완성돼 있고, 네가 만들 API가 생기는 순간 목(mock)에서 실서버로 자동 전환되도록 설계돼 있다. 너의 미션은 설계 문서를 기준으로 백엔드를 **계약 불일치 0으로** 완성하는 것이다.

## 0. 환경

- 리포지토리: `C:\junhee\finalproject\302-group5-final-project`
- 브랜치: `feature/jun-communitycreate` (이 브랜치에서 작업, main 금지)
- 백엔드: `services/backend/` — FastAPI + asyncpg raw SQL (ORM 없음)
- 프론트 기준 커밋: `bdfc9eb` 이후 — **프론트 코드는 절대 수정하지 마라.** 계약 불일치를 발견하면 수정하지 말고 최종 보고서에 목록으로 남겨라.

## 1. 필독 문서 (작업 시작 전 전부 정독)

1. `docs/backend/community-backend-tasks.md` — **Step 0~8 실행 순서 + DoD**. 이 문서가 너의 작업 목록이다.
2. `docs/backend/community-backend-design.md` — 각 Step의 상세 설계 (SQL, 산식, 스키마).
3. `services/backend/app/api/community.py` — 기존 구현 (컨벤션의 기준).
4. 프론트 계약 (읽기 전용 — 응답 스키마의 진실 소스):
   - `apps/mobile/src/features/community/services/communityService.ts` (엔드포인트 호출부)
   - `apps/mobile/src/features/community/types.ts` (기대 타입)
   - `apps/mobile/src/features/community/services/interestProfileService.ts` (신호 9종·가중치)
   - `apps/mobile/src/features/community/services/reportMatchService.ts` (스타일% 산식·threshold 40)
   - `apps/mobile/src/shared/services/backendApi.ts` (응답 키 케이스 변환 여부 확인)

## 2. 절대 규칙

- **컨벤션 준수**: `success()` 엔벨로프, `AppError(status, "ERROR_CODE", message)`, `ensure_user(db, auth)`, asyncpg 파라미터 바인딩(`$1, $2…`). 기존 community.py 스타일을 그대로 복제하라.
- **스키마 3중 동기화**: 테이블/컬럼 변경 시 `docs/backend/schema.sql` + `docs/backend/aws-postgresql-schema.dbml` + `services/backend/app/db/check_schema.py` 세 곳을 반드시 같이 수정. 하나라도 빠지면 그 Step은 미완성이다.
- **응답 키**: 기존 엔드포인트와 동일한 snake_case (`next_cursor`, `viewer_state` …). 새 컨벤션 발명 금지 (tasks 문서 부록 B).
- **테스트 없이 완료 처리 금지**: Step마다 `services/backend/tests/test_community_api.py`에 케이스 추가, 신규 라우트는 `test_route_contract.py`에 등록. `pytest services/backend/tests/`가 초록이어야 커밋.
- **커밋**: Step 단위로 conventional commit (기존 로그처럼 한국어 본문 가능, 예: `feat: 답글 좋아요 API 추가`). Step 완료마다 커밋 후 푸시.
- **시크릿**: Step 6의 AWS Bedrock 자격 증명/역할이 없으면 — 코드/마이그레이션/백필 스크립트까지 완성하되 호출부는 권한 부재 시 embedding null로 우아하게 스킵되게 하고, 보고서에 "Bedrock 권한 주입 필요"로 표기.

## 3. 작업 순서 (tasks 문서의 Step 그대로)

```
Step 0  워킹 트리의 미커밋 백엔드 파일 커밋 (최우선 — 유실 방지)
부록 A  카테고리 검증 미러링 (BA=정확히 2장, 제품조합=제품 2개 이상)
Step 1  답글 좋아요 (테이블 + 엔드포인트 + viewer_state)
Step 2  답글 삭제 (soft delete + 자식 마스킹 + viewer_user_id)
Step 3  답글 생성 단건 응답
Step 4  (선택) 인기 top3 서버 쿼리 — 스킵 가능
Step 5  행동 이벤트 수집 (community_events, 9종 타입)
Step 6  임베딩 매칭 (pgvector + amazon.titan-embed-text-v2:0 + recommended API) ★
Step 7  시맨틱 검색
Step 8  프로필 연동 (?author= / ?saved= 파라미터)
```

각 Step의 DoD(완료 기준)는 tasks 문서에 명시돼 있다. DoD를 충족하지 못하면 다음 Step으로 넘어가지 마라.

## 4. 운영 방식 — 멀티에이전트 권장 (토큰 제약 없음)

이 작업은 멀티에이전트 오케스트레이션(워크플로우)을 사용해도 된다. 권장 구조:

1. **Context 페이즈**: 에이전트 1개가 §1의 문서·코드 전부를 정독하고 "구현 계약 요약"(엔드포인트별 요청/응답 스키마, 에러 코드, 프론트 기대값)을 작성.
2. **Step 구현 페이즈**: Step 순서대로 구현. 독립적인 Step(예: 1~3 vs 5 vs 8)은 병렬 가능하나, **같은 파일(community.py)을 여러 에이전트가 동시에 수정하지 않도록** 분배하거나 순차 처리하라.
3. **Step별 적대적 검증 페이즈** (필수): Step마다 별도 리뷰 에이전트가
   - (a) 구현된 응답 스키마 ↔ 프론트 `communityService.ts`/`types.ts` 기대값을 필드 단위로 대조
   - (b) 스키마 3중 동기화 여부 확인
   - (c) pytest 실행 결과 확인
   을 수행하고, 불합격이면 해당 Step을 재작업.
4. **최종 통합 검증**: 전체 pytest + `check_schema.py` 실행 + route contract 확인 + 아래 보고서 작성.

## 5. 완료 보고 형식

```
## 완료 보고
- Step별 상태 표 (완료/스킵/보류 + 커밋 해시)
- 추가된 테이블/컬럼/엔드포인트 목록
- pytest 결과 (통과/전체 수)
- 프론트 계약 불일치 발견 목록 (수정하지 않고 보고만 — 프론트 담당이 처리)
- 키/인프라 등 사람이 해야 할 일 (AWS Bedrock 자격 증명/역할, RDS pgvector 확장 권한 등)
- 프론트 후속 연동 필요 항목 (tasks 문서의 1-4, 3, 5-3, 6-5 참조)
```

## 6. 시작 지시

지금 바로: ① Step 0 실행(미커밋 백엔드 파일 커밋) → ② §1 문서 정독 → ③ 계약 요약 작성 → ④ Step 1부터 순차 진행. 각 Step 완료마다 짧은 진행 보고를 남겨라. 질문이 필요한 결정(예: 배포 환경 관련)은 임의로 정하지 말고 사용자에게 물어라. 단, tasks/design 문서에 이미 확정된 결정(자식 답글 마스킹, 배지 threshold 40, 팔로우 미도입 등)은 다시 묻지 말고 그대로 따라라.
