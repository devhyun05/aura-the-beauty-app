# 메이크업 추천 Bedrock 호출 실패 원인 분석 및 해결 가이드

- 작성일: 2026-07-15 KST
- 장애 대상 브랜치/배포 커밋: `feature/makeup-recommendation` / `a8f74f94376f58aa4d02ff7360caa11cd4768137`
- 진단 실행: [GitHub Actions #29372037605](https://github.com/devhyun05/aura-the-beauty-app/actions/runs/29372037605)
- 문서 상태: RCA v1

## 1. 결론

최종 메이크업 추천 요청은 모바일과 FastAPI를 정상적으로 통과했지만, **FastAPI가 Claude Sonnet 4.6을 동기 호출하는 단계에서 실패**했다.

CloudWatch에 같은 실패가 두 번 기록됐다.

```text
2026-07-15 06:59:35 KST
[aura:makeup-recommendation] bedrock:failed modelId=global.anthropic.claude-sonnet-4-6 providerCode=None providerRequestId=None

2026-07-15 07:05:00 KST
[aura:makeup-recommendation] bedrock:failed modelId=global.anthropic.claude-sonnet-4-6 providerCode=None providerRequestId=None
```

현재 증거가 확정하는 범위는 다음과 같다.

- 확정: 최종 추천용 Bedrock 호출 경로에서 예외가 발생했다.
- 확정: IAM 거부, 잘못된 모델 ID 등 Bedrock이 반환한 일반적인 `ClientError`가 아니다.
- 확정: JSON 파싱, Pydantic 추천 스키마 검증, DB 저장, 이미지 작업 발행보다 앞에서 실패했다.
- 유력: Botocore `ReadTimeoutError`와 같은 SDK 전송 계층 예외다.
- 미확정: CloudWatch 진단 쿼리가 traceback 후속 줄을 제외했기 때문에 실제 예외 클래스는 아직 증거로 고정되지 않았다.

따라서 **“타임아웃”은 고신뢰 가설이지만 아직 확정 사실로 표기하면 안 된다.** 확정된 근본 실패 지점은 `Bedrock Converse 호출`이다.

## 2. 사용자 영향

1. 상황 카드 생성은 정상 동작한다.
2. 질문 생성도 정상 동작한다.
3. 마지막 답변 제출 후 최종 추천만 생성되지 않는다.
4. 추천 보고서와 이미지 생성 작업도 시작되지 않는다.
5. 모바일은 백엔드 오류의 안전한 진단 코드까지 표시하지 않고 일반 오류 문구로 대체한다.

보고된 “오류 메시지가 전혀 보이지 않음”은 런타임에서 다시 확인해야 한다. 현재 화면 코드는 취소가 아닌 실패라면 일반 오류 화면으로 전환하지만, 구체적인 백엔드 오류 원인은 버린다.

## 3. 실제 실패 위치

```text
모바일 마지막 답변 제출
  -> POST /makeup-recommendations
  -> FastAPI create_recommendation
  -> generate_recommendation
  -> generate_json
  -> boto3 Bedrock Converse (Sonnet 4.6)  <-- 실패
  X  JSON 파싱
  X  Pydantic 추천 스키마 검증
  X  DB 보고서 저장
  X  이미지 작업 발행
  X  성공 응답 및 UI 결과 표시
```

코드 근거:

- 모바일은 마지막 답변에서 `POST /makeup-recommendations`를 호출하며 제한 시간은 90초다: [makeupRecommendationService.ts](../../apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts#L562)
- API는 추천 생성을 완료한 뒤에만 DB에 저장하고 이미지 작업을 발행한다: [makeup_recommendations.py](../../services/backend/app/api/makeup_recommendations.py#L158)
- Bedrock 클라이언트는 별도 `Config` 없이 생성되고, 모든 메이크업 AI 호출에 `maxTokens=6000`을 사용한다: [makeup_recommendation.py](../../services/backend/app/services/makeup_recommendation.py#L148)
- 최종 추천은 정확히 세 룩과 상세 단계·제품 목록을 Sonnet 4.6에 요구한다: [makeup_recommendation.py](../../services/backend/app/services/makeup_recommendation.py#L535)
- 화면은 실제 오류 객체를 사용자 문구나 추적 정보로 보존하지 않는다: [MakeupRecommendationScreen.tsx](../../apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx#L208)

## 4. CloudWatch 증거

진단 시 ECS 상태는 정상이다.

- 서비스: `ACTIVE`
- 실행 태스크: `1`
- 대기 태스크: `0`
- 배포 상태: `COMPLETED`
- 태스크 정의: `aura-backend-api:88`
- 중지된 태스크: 없음
- 로그 그룹: `/ecs/aura-backend-api`
- 로그 스트림: `ecs/aura-backend-api/4c19457ea3474264baba233e6ddb2e9c`

즉 ECS 프로세스 중단이나 배포 불안정이 아니라, 살아 있는 API 태스크 내부의 특정 외부 모델 호출 실패다.

진단 워크플로는 다음 조건으로 로그를 걸러낸다.

```text
events[?contains(message, 'aura:makeup-recommendation')]
```

이 때문에 `logger.exception()`이 여러 CloudWatch 이벤트로 분리한 traceback 후속 줄은 결과에서 빠질 수 있다: [deploy-backend-ecs.yml](../../.github/workflows/deploy-backend-ecs.yml#L375).

## 5. 단계별 배제 결과

| 구간 | 판정 | 근거 |
| --- | --- | --- |
| 모바일 요청 생성 | 통과 | 백엔드의 `bedrock:failed` 로그가 생성됨 |
| 인증/FastAPI 라우팅 | 통과 | 추천 서비스 내부 로그까지 도달 |
| ECS 가용성 | 정상 | ACTIVE, running 1, rollout COMPLETED |
| IAM `AccessDenied` | 배제 | `ClientError`라면 `providerCode=AccessDeniedException`이 기록돼야 함 |
| 모델 ID/요청 `ValidationException` | 배제 | `ClientError`라면 provider code와 request ID가 남아야 함 |
| JSON 파싱 | 미도달 | 파싱 오류는 `BEDROCK_INVALID_JSON` `AppError`로 분기되어 현재 로그와 다름 |
| 추천 스키마 검증 | 미도달 | 실패 시 `recommendation:validation-failed` 로그가 남아야 함 |
| DB 저장 | 미도달 | 모델 추천 생성 다음 순서임 |
| 이미지 생성/SQS | 미도달 | DB 저장 다음 순서임 |
| UI 결과 매핑 | 미도달 | 성공 HTTP 응답이 없음 |

## 6. `ReadTimeoutError`가 가장 유력한 이유

`_bedrock_app_error()`는 예외가 `ClientError`가 아닐 때 `providerCode` 없이 `BEDROCK_REQUEST_FAILED`로 바꾼다. 실제 CloudWatch 값이 `providerCode=None`이므로 SDK 전송 계층 또는 로컬 파라미터 처리 예외 범주다.

그중 read timeout 가능성이 가장 높은 이유는 다음과 같다.

1. 같은 ECS와 자격 증명으로 Haiku 4.5 기반 상황·질문 단계는 정상 동작한다.
2. 실패하는 단계만 더 무거운 `global.anthropic.claude-sonnet-4-6`을 사용한다.
3. 출력 요구량이 세 개 룩, 각 다섯 부위 단계, 제품 3~8개로 크다.
4. 코드가 모든 호출에 `maxTokens=6000`을 허용한다.
5. Bedrock 클라이언트에 timeout/retry 정책을 명시하지 않았다.
6. Botocore의 기본 connect/read timeout은 각각 60초다: [Botocore Config 문서](https://docs.aws.amazon.com/botocore/latest/reference/config.html).
7. 모바일 요청 제한은 90초라서 SDK 재시도까지 발생하면 모바일이 먼저 연결을 종료할 수 있다.

Claude Sonnet 4.6의 adaptive thinking은 낮은 effort를 지정하지 않으면 더 긴 추론이 발생할 수 있다. AWS는 낮은 effort가 단순 작업에서 thinking을 줄일 수 있다고 설명한다: [AWS adaptive thinking 문서](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html).

남아 있는 대안 가설은 `EndpointConnectionError`, `NoCredentialsError`, `ParamValidationError`, TLS/DNS 오류다. 다만 앞 단계가 동일 환경에서 성공하므로 지속적인 자격 증명·네트워크 장애 가능성은 상대적으로 낮다.

## 7. 해결 방법

### P0. 실제 예외 클래스를 한 번에 확정

다음 정보를 같은 첫 로그 줄에 구조화해 기록한다.

```text
phase=recommendation
modelId=...
exceptionType=ReadTimeoutError
durationMs=...
attempt=...
providerCode=...
providerRequestId=...
```

프롬프트, 질문 답변, 토큰, AWS 자격 증명은 로그에 남기지 않는다.

진단 워크플로에서는 접두사 포함 이벤트만 가져오지 말고 실패 시각 전후의 원본 이벤트를 함께 출력한다. `aws logs get-log-events` 실패를 `|| true`로 숨기지 말고 권한 오류도 job 실패로 처리한다.

예외별 API 코드를 분리한다.

| 예외 | 권장 API 코드 | HTTP | 재시도 가능 |
| --- | --- | --- | --- |
| `ReadTimeoutError` | `BEDROCK_TIMEOUT` | 504 | 예 |
| `EndpointConnectionError` | `BEDROCK_ENDPOINT_UNAVAILABLE` | 503 | 예 |
| `ClientError/ThrottlingException` | `BEDROCK_TEMPORARILY_UNAVAILABLE` | 503 | 예 |
| `ParamValidationError` | `BEDROCK_CLIENT_REQUEST_INVALID` | 500 또는 502 | 아니오 |

### P0. 가장 빠른 서비스 복구

최종 추천 모델을 이미 상황·질문 단계에서 동작이 확인된 Haiku 4.5로 임시 전환하고 재배포한다.

```text
BEDROCK_RECOMMENDATION_MODEL_ID=global.anthropic.claude-haiku-4-5-20251001-v1:0
```

장점은 코드 변경 없이 되돌릴 수 있다는 점이다. 단점은 추천 품질이 낮아질 수 있다는 점이므로 임시 롤백으로만 사용하고 대표 입력 품질을 확인한다.

### P1. 동기 구조를 당장 유지해야 할 때

1. Bedrock 클라이언트에 `connect_timeout`, `read_timeout`, retry 수를 명시한다.
2. `maxTokens=6000` 고정을 제거하고 실제 출력 토큰 분포에 맞춰 축소한다. 초기 검증 후보는 2,500~3,500이지만 세 룩 계약의 완전성을 라이브 평가로 확인해야 한다.
3. Sonnet 4.6을 유지한다면 `additionalModelRequestFields`에서 adaptive thinking의 effort를 `low`로 지정해 품질·지연을 비교한다.
4. `ReadTimeoutError`에만 제한적으로 Haiku fallback을 적용한다.
5. 전체 모델 호출 예산이 ALB/API Gateway와 모바일 제한보다 먼저 끝나도록 맞춘다.

시간 제한은 다음 관계를 지켜야 한다.

```text
Bedrock 전체 시도 예산 + fallback 예산
  < ALB/API Gateway origin timeout
  < 모바일 timeout(현재 90초)
```

timeout 값만 120초로 늘리는 방식은 모바일이 90초에 먼저 끊기 때문에 해결이 아니다. 외부 HTTP 계층의 실제 timeout도 반드시 함께 확인해야 한다.

현재 테스트는 `maxTokens >= 5000`을 강제하므로 출력 한도를 줄일 때 테스트도 새로운 근거에 맞게 변경해야 한다: [test_makeup_recommendations.py](../../services/backend/tests/test_makeup_recommendations.py#L67).

### P2. 권장 영구 해결: 최종 추천 비동기화

최종 추천은 HTTP 요청 안에서 생성하지 말고 기존 SQS + ECS AI Worker 구조로 옮긴다.

```text
POST /makeup-recommendations
  -> 보고서/job 생성(status=pending)
  -> SQS 발행
  -> 202 + reportId 즉시 응답

AI Worker
  -> status=processing
  -> Bedrock 최종 추천 생성
  -> status=completed + recommendation 저장
  -> 이미지 생성 작업 발행
  -> 실패 시 status=failed + 안전한 error code 저장

Mobile
  -> GET /makeup-recommendations/{reportId} 폴링
  -> pending -> processing -> completed | failed
```

이 구조에서는 Sonnet 응답 시간이 모바일·ALB 요청 timeout에 직접 묶이지 않는다. 저장된 작업을 재시도하고 DLQ로 추적할 수도 있다. 저장소의 기존 [Async AI Worker Architecture](./ASYNC_AI_WORKER_ARCHITECTURE.md)는 긴 AI 작업을 동기 HTTP에서 분리하도록 이미 같은 방향을 정의한다.

주의할 점은 현재 `makeup_recommendation` worker job이 **추천 텍스트가 아니라 추천 이미지 생성**을 의미한다는 것이다. 텍스트 생성용 job type 또는 명시적인 `phase`를 별도로 추가해야 한다.

### P1. 모바일 오류 UX 보완

- `BEDROCK_TIMEOUT`이면 “AI 응답이 지연되고 있어요. 다시 시도해 주세요.”와 재시도 버튼을 표시한다.
- 원시 AWS 메시지나 request ID는 운영 사용자에게 노출하지 않는다.
- 개발 빌드에서는 안전한 `error.code`, `exceptionType`, `providerCode`만 확인할 수 있게 한다.
- 취소와 timeout을 구분한다.
- 같은 답변을 재시도할 수 있도록 세션과 마지막 답변을 유지한다.

## 8. 구현 대상

| 영역 | 대상 | 변경 내용 |
| --- | --- | --- |
| Bedrock 호출 | `services/backend/app/services/makeup_recommendation.py` | 전용 Config, 예외 분류, duration/exceptionType 로그, 토큰·effort 조정 |
| 설정 | `services/backend/app/core/settings.py` | 모델별 timeout, max token, effort 설정 |
| API | `services/backend/app/api/makeup_recommendations.py` | 비동기 job 생성과 202 응답 또는 안전한 동기 오류 계약 |
| Worker | `services/backend/app/workers/job_dispatcher.py` | 텍스트 추천 job 처리 후 이미지 job 연결 |
| DB | `docs/backend/schema.sql`, `docs/backend/aws-postgresql-schema.dbml` | 비동기화 시 추천 status/error/attempt/timestamp 계약 동시 반영 |
| 모바일 서비스 | `makeupRecommendationService.ts` | 202/report polling 및 오류 코드 보존 |
| 모바일 화면 | `MakeupRecommendationScreen.tsx` | 명확한 실패 메시지와 재시도 |
| 진단 | `.github/workflows/deploy-backend-ecs.yml` | traceback 주변 로그와 AWS 명령 실패 가시화 |
| 테스트 | backend/mobile 관련 테스트 | timeout, fallback, 상태 전이, 오류 UX 회귀 테스트 |

## 9. 검증 기준

### 동기 복구안을 적용한 경우

- 대표 입력 10회 연속 최종 추천 성공
- 세 룩(`anchor`, `bold`, `discovery`)과 각 부위 단계 계약 통과
- 모든 요청이 모바일 90초 제한 전에 종료
- 실패를 강제로 주입하면 모바일 제한 전에 `BEDROCK_TIMEOUT` 응답
- CloudWatch에 `durationMs`, `exceptionType`, 모델 ID가 남음
- DB 저장 및 이미지 작업은 텍스트 추천 성공 후에만 실행

### 비동기 구조를 적용한 경우

- POST가 2초 이내 `202 + reportId` 반환
- 상태 전이가 `pending -> processing -> completed|failed`를 지킴
- 같은 메시지가 중복 전달돼도 보고서가 중복 생성되지 않음
- worker 재시작 후 작업 재처리 가능
- 최종 실패는 DB와 CloudWatch에 안전한 코드로 남음
- 모바일은 완료 결과 또는 재시도 가능한 실패 화면을 반드시 표시

### 관측성

AWS는 Bedrock 런타임에 `InvocationLatency`, `TimeToFirstToken`, client/server error, throttle, 입출력 토큰 지표를 제공한다: [AWS Bedrock CloudWatch 지표](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html).

최소 대시보드와 알람:

- 모델별 호출 수와 성공률
- p50/p95 `InvocationLatency`
- `TimeToFirstToken`
- `InvocationClientErrors`, `InvocationServerErrors`, `InvocationThrottles`
- 입력/출력 토큰
- 애플리케이션 `BEDROCK_TIMEOUT` 횟수
- 추천 job의 pending/processing 체류 시간과 DLQ 수

## 10. 배포 순서

1. 예외 클래스와 duration 로그를 먼저 배포해 실제 예외를 확정한다.
2. 긴급하면 추천 모델만 Haiku 4.5로 롤백한다.
3. Sonnet 동기 복구안을 적용한다면 timeout·max token·effort를 한 번에 하나씩 바꿔 라이브 측정한다.
4. API와 worker는 같은 이미지/태스크 정의 revision으로 배포한다.
5. 대표 입력 10회와 강제 실패 1회를 실행한다.
6. CloudWatch와 모바일 양쪽에서 성공/실패 계약을 확인한다.
7. 이후 최종 추천을 비동기 job으로 전환한다.

## 11. 최종 권고

- 오늘 즉시 서비스 복구가 우선이면: **Haiku 4.5 임시 롤백 + 예외 클래스 로깅**
- Sonnet 품질을 유지하며 단기 복구하려면: **출력량/effort 축소 + 명시적 시간 예산 + timeout 전용 fallback**
- 운영 안정성을 해결하려면: **최종 텍스트 추천 자체를 SQS + ECS Worker 비동기 작업으로 전환**

단순히 timeout 값만 늘리는 것은 모바일과 ALB timeout을 뒤로 미룰 뿐이며 재발 방지책이 아니다.

## 12. 참고

- [메이크업 시나리오 추천 설계](../superpowers/specs/2026-07-14-makeup-scenario-recommendation-design.md)
- [AWS 배포 체크리스트](./AWS_DEPLOYMENT_CHECKLIST.md)
- [Async AI Worker Architecture](./ASYNC_AI_WORKER_ARCHITECTURE.md)
- [Claude Sonnet 4.6 모델 정보](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html)
- [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)

