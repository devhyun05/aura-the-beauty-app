# Async AI Worker Architecture

이 문서는 AURA 백엔드에서 장시간 AI 작업을 FastAPI 요청 흐름에서 분리하기 위한 아키텍처 방향을 고정한다.

핵심은 Lambda 자체가 아니라, 얼굴 분석/피드백 분석/추천 이미지 생성처럼 오래 걸리는 작업을 API 서버 밖으로 분리하는 것이다.

## Decision Summary

```text
Mobile
  -> FastAPI
      -> job 생성
      -> SQS 메시지 발행
      -> job 상태 조회 API 제공

SQS
  -> ECS Worker
      -> 얼굴 분석
      -> 메이크업 피드백 분석
      -> 레퍼런스 메이크업 추출
      -> 추천 이미지 생성
      -> S3 업로드
      -> RDS 상태 업데이트

S3 ObjectCreated
  -> Lambda
      -> 이미지 검증
      -> 썸네일 생성
      -> EXIF 제거
      -> complete-upload에서 media_assets thumbnail metadata 보강

EventBridge Schedule
  -> Lambda
      -> 오래된 임시 파일 삭제
      -> stuck job 정리
      -> 만료 세션 삭제
```

최종 방향은 다음과 같다.

> FastAPI는 사용자 요청 접수와 상태 조회를 담당하고, SQS가 작업 대기열 역할을 하며, 장시간 소요되는 AI 분석/추천 이미지 생성은 ECS Worker가 처리한다. Lambda는 S3 업로드 후처리와 정기 cleanup처럼 짧고 이벤트성인 작업에 사용한다.

## Why Not Run Everything In FastAPI?

FastAPI도 여러 요청을 동시에 처리할 수 있고, FastAPI `BackgroundTasks`로 응답을 먼저 돌려준 뒤 백그라운드에서 AI 분석을 실행할 수도 있다.

하지만 중요한 차이는 동시 처리 가능 여부가 아니다.

```text
AI 분석 작업이 FastAPI 서버 안에서 도는가,
아니면 API 서버 밖의 별도 worker에서 도는가
```

FastAPI 내부에서 AI 분석과 이미지 생성을 처리하면 다음 문제가 생긴다.

- 사용자 요청 또는 API 서버 프로세스가 오래 붙잡힌다.
- API 서버의 CPU, 메모리, DB connection, 외부 API 호출 여유분을 AI 작업과 일반 API가 공유한다.
- 분석 요청이 몰리면 `/users/me`, `/home`, `/products/*` 같은 일반 API 응답성도 같이 나빠질 수 있다.
- 서버 재시작 시 FastAPI 내부 background 작업은 유실될 수 있다.
- 실패/재시도/DLQ 같은 작업 처리 정책을 체계화하기 어렵다.

SQS + ECS Worker 구조는 대기 시간을 없애는 구조가 아니다. 대신 작업이 몰렸을 때 API 서버 안에서 대기하지 않고 SQS 대기열에서 대기하게 만들어 부하와 실패를 통제 가능한 형태로 바꾸는 구조다.

## Structure Comparison

| 구조 | 설명 | 장점 | 문제 |
| --- | --- | --- | --- |
| FastAPI 요청 안에서 직접 분석 | HTTP 요청 안에서 AI 분석까지 처리 | 구현이 가장 단순함 | 요청이 오래 열림, timeout 위험, API worker 점유 |
| FastAPI BackgroundTask | job 응답은 빨리 주고 같은 FastAPI 컨테이너 안에서 background 분석 | 응답은 빨라짐, 구현 쉬움 | 분석이 여전히 API 서버 CPU/메모리/DB 연결을 사용 |
| SQS + ECS Worker | FastAPI는 job 생성/SQS 발행만 하고 별도 ECS Worker가 분석 처리 | API 서버와 AI 작업 분리, 처리량 제어 가능, 작업 유실 방지 | 인프라와 구현 복잡도 증가 |

## Waiting Model

어떤 구조든 처리 용량보다 요청이 많으면 늦게 온 사용자는 기다려야 한다.

차이는 어디서 기다리느냐다.

| 구조 | 사용자가 기다리는 위치 | 위험 |
| --- | --- | --- |
| FastAPI 직접 처리 | API 서버 안에서 요청 연결이 열린 채로 대기 | timeout, 전체 API 지연 |
| FastAPI BackgroundTask | FastAPI 서버 내부 background 작업 공간에서 대기 | API 서버 리소스 경쟁 |
| SQS + ECS Worker | SQS 대기열에서 대기 | 결과 완료는 늦어질 수 있지만 API 서버는 보호됨 |

유저 대기 시간을 줄이려면 별도 전략이 필요하다.

- ECS Worker 수 autoscaling
- OpenAI/Bedrock rate limit 상향 또는 처리량 제한
- 기본 분석 결과와 추천 이미지 생성을 분리
- 기본 분석 결과 먼저 제공
- 추천 이미지는 `imageGenerationStatus=processing`으로 두고 나중에 갱신
- 캐시 또는 프리셋 이미지 활용
- 긴 작업 완료 시 push 알림 또는 재방문 가능한 UX 제공

## Component Responsibilities

### FastAPI

FastAPI는 사용자와 직접 맞닿는 API 서버다.

담당한다.

- 인증/인가
- 요청 validation
- job row 생성
- SQS 메시지 발행
- job 상태 조회
- 일반 조회 API 제공

운영 모드에서는 장시간 AI 분석과 이미지 생성을 직접 실행하지 않는다.

로컬 개발에서는 기존 편의성을 위해 `inline` 실행 모드를 유지할 수 있다.

### SQS

SQS는 AWS가 관리하는 작업 대기열이다.

FastAPI는 다음과 같은 메시지를 SQS에 넣는다.

```json
{
  "version": 1,
  "jobType": "analysis",
  "jobId": "11111111-1111-1111-1111-111111111111",
  "userId": "22222222-2222-2222-2222-222222222222"
}
```

`requestPayload` 전체는 SQS 메시지에 싣지 않는다. 요청 원본은 `analysis_reports.detail_payload`에 저장하고, worker는 `jobId`로 DB에서 필요한 데이터를 다시 읽는다. 이렇게 해야 SQS 메시지 크기와 개인정보 노출 범위를 줄일 수 있다.

SQS를 두는 이유는 다음과 같다.

- 요청 폭주 시 작업을 줄 세울 수 있다.
- FastAPI가 오래 걸리는 작업을 직접 들고 있지 않아도 된다.
- 실패 시 재시도가 가능하다.
- DLQ로 실패 메시지를 보관할 수 있다.
- worker 수로 처리량을 제어할 수 있다.

### ECS Worker

ECS Worker는 HTTP 요청을 받는 서버가 아니라, SQS를 계속 확인하면서 작업 메시지를 꺼내 처리하는 백그라운드 컨테이너다.

FastAPI와 같은 코드베이스/도커 이미지를 재사용할 수 있다.

```text
FastAPI container:
uvicorn app.main:app

Worker container:
python -m app.workers.ai_job_worker
```

초기에는 하나의 worker로 시작한다.

```text
aura-worker
```

이 worker가 `jobType`을 보고 분기한다.

- `analysis`: 얼굴 분석
- `feedback`: 메이크업 피드백 분석
- `filter_extraction`: 레퍼런스 메이크업 추출
- `imageGeneration`: 추천 이미지 생성

나중에 병목이 생기면 부하 성격에 따라 분리한다.

```text
aura-analysis-worker
aura-image-generation-worker
aura-auradin-worker
```

분리 기준은 기능 개수가 아니라 부하 성격이다.

### Lambda

Lambda는 메인 AI 분석 worker가 아니라 짧고 이벤트성인 작업에 사용한다.

적합한 작업은 다음과 같다.

- S3 업로드 후 이미지 검증
- 썸네일 생성
- EXIF 제거
- `media_assets` thumbnail metadata는 Lambda가 DB에 직접 붙지 않고, `complete-upload`가 예상 썸네일 key를 짧게 조회해 있으면 보강한다. 드문 지연 케이스는 추후 reconciliation/retry job으로 보완할 수 있다.
- 오래된 임시 파일 삭제
- 오래 `processing` 상태인 stuck job 정리
- 만료된 Auradin session 삭제

Lambda를 메인 AI worker로 쓰지 않는 이유는 다음과 같다.

- 얼굴 분석/추천 이미지 생성은 30초에서 1분 이상 걸릴 수 있다.
- OpenAI/Bedrock 외부 API rate limit 관리가 중요하다.
- Lambda 동시 실행이 폭증하면 외부 AI API 호출과 RDS 연결도 같이 폭증할 수 있다.
- RDS Proxy, reserved concurrency, 중복 실행 방지, 패키징 등 운영 고려사항이 많아진다.
- 기존 FastAPI 백엔드 코드 재사용은 ECS Worker가 더 단순하다.

### EventBridge

EventBridge는 작업을 직접 처리하는 서비스가 아니라 정해진 시간이나 이벤트에 따라 Lambda, ECS Task, Batch 등을 실행시키는 스케줄러/이벤트 라우터다.

예시는 다음과 같다.

```text
매일 새벽 3시
-> EventBridge
-> cleanup Lambda 실행
```

## Feature Placement

| 기능 | 처리 방식 | 이유 |
| --- | --- | --- |
| 로그인/유저 정보 | FastAPI | 즉시 응답 필요 |
| 홈 화면 데이터 | FastAPI | DB 조회 중심 |
| 상품 추천 조회 | FastAPI | 기본은 API 조회, 무거워지면 캐시/worker 고려 |
| 이미지 업로드 URL 발급 | FastAPI | presigned URL 발급만 수행 |
| S3 이미지 업로드 후 검증 | Lambda | S3 이벤트 기반, 짧은 작업 |
| 썸네일 생성/EXIF 제거 | Lambda | 이미지 후처리, 짧은 작업 |
| 얼굴 AI 분석 | SQS + ECS Worker | 외부 AI API 호출, 장시간 처리 가능성 |
| 추천 이미지 생성 | SQS + ECS Worker | 오래 걸리고 rate limit/비용 관리 필요 |
| 메이크업 피드백 분석 | SQS + ECS Worker | AI 호출이 길 수 있음 |
| 레퍼런스 메이크업 추출 | SQS + ECS Worker | 이미지 읽기 + AI 분석 |
| Auradin 대량 상품 수집 | ECS Worker 또는 AWS Batch | 장기/대량 작업 |
| Auradin 세션 만료 정리 | EventBridge + Lambda | 주기적이고 가벼움 |
| 오래된 임시 S3 파일 삭제 | EventBridge + Lambda | 정기 cleanup |
| stuck job 정리 | EventBridge + Lambda | 오래 `processing`인 job 정리 |

## Job State Contract

모바일은 worker나 Lambda를 직접 알 필요가 없다.

모바일은 기존처럼 job 생성 후 상태 API를 조회한다.

```text
pending -> processing -> completed
                      -> failed
```

중요한 규칙은 다음과 같다.

- 같은 job이 두 번 실행되어도 결과가 꼬이지 않아야 한다.
- 이미 `completed`인 job은 다시 처리하지 않는다.
- `processing`으로 바꿀 때 현재 상태 조건을 확인한다.
- 실패하면 `failed`와 error payload를 남긴다.
- SQS 재시도와 DLQ를 고려한다.

## Implementation Phases

### Phase 1. Architecture Document

이 문서로 방향을 고정한다.

코드 동작 변경은 없다.

### Phase 2. Execution Mode Split

FastAPI에 job 실행 모드를 추가한다.

```env
AI_JOB_EXECUTION_MODE=inline
SQS_AI_JOB_QUEUE_URL=
```

- `inline`: 로컬 개발용. 기존처럼 FastAPI 내부에서 실행한다.
- `sqs`: 운영용. FastAPI는 job 생성 후 SQS 메시지만 발행한다.

`SQS_AI_JOB_QUEUE_URL`은 `AI_JOB_EXECUTION_MODE=sqs`일 때만 필요하다. worker와 queue가 준비되기 전까지는 `inline`을 기본값으로 유지해 기존 모바일/로컬 개발 흐름을 보존한다.

### Phase 3. SQS Publisher

백엔드에 SQS 메시지 발행 서비스를 추가한다.

처음에는 `analysis` job만 대상으로 한다.

### Phase 4. ECS Worker Skeleton

worker 실행 진입점을 추가한다.

```text
services/backend/app/workers/
  __init__.py
  ai_job_worker.py
  job_dispatcher.py
```

초기 실행 명령은 다음과 같다.

```powershell
python -m app.workers.ai_job_worker
python -m app.workers.ai_job_worker --once
```

Phase 4 worker는 SQS 메시지를 long polling 하고, 메시지 body를 검증하고, handler 성공 시에만 메시지를 삭제한다.

### Phase 5. Move Analysis Job To Worker

`POST /api/analysis/jobs`는 다음만 수행한다.

- `analysis_reports` row 생성
- SQS 메시지 발행
- job 반환

Phase 5에서 ECS Worker는 다음을 수행한다.

- 메시지 수신
- job 상태를 `processing`으로 변경
- 기존 분석 로직 실행
- 성공 시 `completed`
- 실패 시 `failed`

### Phase 6. Extend Worker Job Types

analysis가 안정화된 뒤 다음 job type으로 확장한다.

- `feedback`
- `filter_extraction`
- `imageGeneration`

### Phase 7. Lambda For Event Tasks

AI worker와 별개로 Lambda는 짧은 이벤트 작업부터 붙인다.

우선순위는 다음과 같다.

1. S3 이미지 후처리 Lambda: `app.lambdas.media_postprocess.lambda_handler`
2. EventBridge + stuck job cleanup Lambda
3. 오래된 임시 S3 파일 cleanup Lambda

S3 이미지 후처리 Lambda는 원본 object를 같은 key로 EXIF 없이 다시 저장하고, `<original-dir>/thumbnails/<name>.jpg` 썸네일을 만든다. 재귀 실행은 `/thumbnails/` key skip과 `aura-postprocessed=true` object metadata로 막는다.

## Verification Checklist

배포 순서는 `docs/backend/ASYNC_AI_WORKER_DEPLOYMENT_RUNBOOK.md`를 따른다.

각 단계에서 확인할 항목은 다음과 같다.

- 로컬 `inline` 모드가 기존처럼 동작하는가
- `sqs` 모드에서 FastAPI가 job을 만들고 바로 응답하는가
- SQS 메시지 payload가 job type과 job id를 포함하는가
- worker가 job을 처리하고 DB 상태를 변경하는가
- worker 중단 후 재시작해도 pending/processing job 처리 정책이 명확한가
- 중복 메시지가 와도 결과가 꼬이지 않는가
- 실패 시 `failed` 상태와 error payload가 남는가
- DLQ에 실패 메시지가 보관되는가
- 모바일은 기존 `/jobs/{jobId}` 또는 report 조회 흐름으로 상태를 확인할 수 있는가

## Delivery Statement

FastAPI만으로도 AI 분석을 비동기로 여러 개 처리할 수는 있지만, 분석 작업이 API 서버 리소스를 공유하기 때문에 트래픽 증가 시 전체 API 응답성에 영향을 줄 수 있다. 따라서 운영 구조에서는 FastAPI는 job 생성과 상태 조회만 담당하고, 장시간 AI 분석/이미지 생성은 SQS 기반 ECS Worker로 분리한다. 이 구조는 대기 시간을 없애는 것이 아니라, 대기와 부하를 SQS에서 안정적으로 관리하고 API 서버를 보호하기 위한 것이다. Lambda는 메인 AI worker가 아니라 S3 후처리와 정기 cleanup 같은 짧은 이벤트성 작업에 사용한다.
