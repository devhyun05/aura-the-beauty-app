# iOS 헤어 분석·시뮬레이션 운영 문서

## 1. 범위

이 기능은 iOS 정면 촬영 사진 한 장을 사용해 현재 헤어와 얼굴형을 분석하고, 고정 카탈로그에서 3개 스타일을 추천한 뒤 사용자가 선택한 스타일만 합성한다.

- Android, 앨범 업로드, 실시간 AR, 헤어 컬러 변경은 현재 범위에 포함하지 않는다.
- 현재 머리색, 얼굴, 표정, 의상, 배경과 구도를 유지한다.
- 원본·마스크·저장하지 않은 결과는 24시간 후 삭제한다.
- 계정 저장을 선택해도 결과만 보관하며 원본과 마스크는 삭제한다.

## 2. 처리 흐름

1. 앱은 전면 카메라에서 한 명, 정면, 얼굴 전체 프레이밍을 확인한다.
2. 사용자가 확인 화면에서 확정하기 전까지 서버 업로드를 시작하지 않는다.
3. 지원 기기에서는 HEIC의 Apple Hair Semantic Matte를 PNG로 추출한다.
4. 원본과 선택적 Apple matte를 private S3 객체로 업로드한다.
5. `POST /api/hair-analyses`가 DB 작업을 만들고 SQS에 작업 ID만 전송한다.
6. worker는 Apple matte 품질을 검사하고, 없거나 기준 미달이면 MediaPipe Hair Segmenter를 사용한다.
7. OpenAI 비전 분석 결과를 정해진 enum으로 정규화한 후 결정론적으로 3개를 추천한다.
8. 사용자가 한 스타일을 선택하면 `gpt-image-2`가 원본, 합성 마네킹 레퍼런스, 알파 마스크를 사용해 한 장을 생성한다.
9. 얼굴 수·랜드마크·보호 영역·비헤어 영역 변경 기준을 넘으면 강화 프롬프트로 한 번만 자동 재생성한다.
10. 앱은 원본/결과 비교, 사진 앱 저장, 공유, 계정 저장을 제공한다.

## 3. API

모든 경로는 Cognito JWT authorizer를 사용한다.

```text
GET    /api/hair-styles
POST   /api/hair-analyses
GET    /api/hair-analyses/{analysis_id}
POST   /api/hair-analyses/{analysis_id}/simulations
GET    /api/hair-simulations/{simulation_id}
POST   /api/hair-simulations/{simulation_id}/save
GET    /api/hair-simulations?saved=true
DELETE /api/hair-simulations/{simulation_id}
```

분석·합성 POST에는 UUID `clientRequestId`가 필수다. 앱은 같은 화면의 재전송 동안 같은 값을 유지한다. API의 unique constraint와 worker의 stale claim 조건이 HTTP 재전송 및 SQS 중복 전달을 같은 작업으로 수렴시킨다.

## 4. 제한 정책

| 계층 | 제한 | 목적 |
|---|---:|---|
| API Gateway 생성 경로 | rate 20/s, burst 40 | 서비스 전체의 순간 트래픽 보호 |
| API Gateway 조회 경로 | 스테이지 기본 rate 50/s, burst 100 | 폴링 및 일반 조회 허용 |
| FastAPI 분석별 | 정상 작업 최대 3회 | 사용자 비용·오사용 제어 |
| FastAPI 사용자별 | KST 하루 6회 | 사용자 단위 공정 사용 |
| ECS worker | 태스크당 동시 작업 1개 | 이미지 생성 메모리와 비용 안정화 |
| ECS worker 수 | 최소 1, 최대 10 | SQS backlog에 따라 확장 |

API Gateway 제한은 사용자별이 아니라 API·스테이지·경로 전체 제한이다. 사용자 1,000명을 가정한 사용자별 정책은 FastAPI의 DB 트랜잭션에서 강제한다. `failed`와 `expired` 작업은 사용자 생성 횟수에 포함하지 않는다.

## 5. 데이터 보관과 보안

| 데이터 | 저장 위치 | 공개 여부 | 만료 |
|---|---|---|---|
| 촬영 원본 | S3 `uploads/hair-analysis-source/` | private, presigned PUT만 사용 | 24시간 |
| Apple/MediaPipe 마스크 | S3 `uploads/hair-analysis-mask/` | private | 24시간 |
| 미저장 합성 결과 | S3 `uploads/hair-simulation-result/` | private, 15분 presigned GET | 24시간 |
| 계정 저장 결과 | 같은 private S3 객체, `aura-retention=saved` 태그 | private, 15분 presigned GET | 사용자 삭제 시까지 |
| 분석 속성 | PostgreSQL | 사용자 소유권 검사 | 원본 만료 시 payload 제거 |

EventBridge 정리 태스크가 15분마다 만료 객체를 삭제한다. S3 lifecycle은 장애 시 보조 장치이며 일 단위이므로 2일로 설정한다. 합성 결과의 현재 버전 만료는 `aura-retention=ephemeral` 태그가 있는 객체에만 적용된다.

S3 버전 관리가 켜졌거나 일시 중단된 버킷에서는 정리 태스크, 저장 결과 삭제, 회원 탈퇴 outbox가 해당 헤어 객체의 모든 버전과 삭제 마커를 제거한다. lifecycle은 source·mask와 결과의 noncurrent version도 2일 후 제거하는 보조 안전망을 둔다.

CloudWatch 로그에는 presigned URL, 사진 URL, Cognito/OpenAI 토큰을 남기지 않는다. OpenAI 요청의 safety identifier는 내부 사용자 UUID를 SHA-256으로 변환한 값만 전송한다.

모바일은 스타일 카탈로그만 영구 디스크 캐시한다. 개인 합성 결과는 메모리 캐시로 표시하고, 사진 앱 저장·공유를 위해 만든 임시 다운로드 파일은 작업 직후 삭제한다.

worker는 S3 메타데이터와 실제 읽기 크기를 모두 확인한다. 촬영 원본은 25MB, 마스크와 스타일 레퍼런스는 각각 10MB, 디코딩 이미지 전체는 4천만 픽셀을 넘으면 작업을 영구 실패로 종료해 비정상 업로드의 메모리 사용을 제한한다.

## 6. 스타일 카탈로그 검수

12개 스타일은 실제 인물·연예인·브랜드를 사용하지 않는다. 스크립트가 합성 마네킹 한 장을 만든 뒤 같은 마네킹의 헤어만 변경해 레퍼런스를 만든다.

기존 OpenAI 키가 안전하게 주입된 환경에서 실행한다. 키를 명령행이나 문서에 넣지 않는다.

```bash
cd services/backend
python -m app.ops.generate_hair_style_assets \
  --output-dir ../../output/hair-styles/v1 \
  --upload
```

생성 직후 manifest 상태는 `pending_human_review`다. 얼굴·프레이밍 일관성, 스타일 명칭 일치, 실제 인물 유사성 없음, 텍스트·로고 없음 여부를 사람이 검수한 뒤 승인한다.

manifest는 모델, 프롬프트, reference/preview SHA-256과 `generationHistory`를 기록한다. 검수 명령과 worker가 파일 checksum을 다시 확인하므로 승인 후 교체되거나 변조된 reference는 합성에 사용되지 않는다.

```bash
python -m app.ops.review_hair_style_assets \
  --manifest ../../output/hair-styles/v1/manifest.json \
  --style-id soft-crop \
  --style-id pixie-layer \
  --reviewer reviewer-id \
  --upload
```

승인되지 않은 스타일은 worker가 `HAIR_STYLE_NOT_APPROVED`로 거절한다. 출시 전 12개 스타일을 모두 승인해야 한다.

## 7. AWS 배포 순서

1. 새 Docker 이미지를 ECR에 push한다. 이미지 빌드는 MediaPipe 모델 SHA-256을 검증한다.
2. `infra/hair-simulation.yaml`을 배포한다. private subnet에는 NAT가 있어야 OpenAI HTTPS 호출이 가능하다. S3·SQS·Secrets Manager는 VPC endpoint로 NAT 사용량을 줄일 수 있다.
3. CloudFormation 출력 `HairJobsQueueUrl`을 API ECS 서비스의 `HAIR_JOBS_QUEUE_URL`에 넣고 새 task definition을 배포한다.
4. API task role에 생성된 `sqs:SendMessage`와 private 결과 조회·태그 변경 정책이 연결됐는지 확인한다.
5. 기존 DB migration 절차로 `docs/backend/schema.sql`을 적용한다. 앱 시작 시 idempotent 보강 DDL도 실행된다.
6. 스타일 에셋을 생성·검수·업로드한다.
7. S3 lifecycle을 병합한다.
8. API Gateway 명시적 경로와 throttling을 적용한다.

```bash
S3_BUCKET_NAME=your-private-bucket \
  scripts/aws/configure-hair-s3-lifecycle.sh

API_ID=your-http-api-id \
  scripts/aws/configure-hair-api-routes.sh
```

기존 `ANY /{proxy+}`의 VPC Link 통합과 `aura-cognito-authorizer`를 스크립트가 자동 탐색한다. 이름이 다르면 `INTEGRATION_ID`와 `AUTHORIZER_ID`를 명시한다. 기존 route throttling map은 덮어쓰지 않고 병합한다.

GitHub Actions에서 API와 worker를 함께 갱신하려면 다음 repository variable을 설정한다.

```text
HAIR_WORKER_SERVICE=aura-hair-worker
HAIR_WORKER_TASK_DEFINITION=aura-hair-worker
HAIR_WORKER_CONTAINER_NAME=aura-hair-worker
```

## 8. 모니터링

`AURA/HairSimulation` namespace의 Embedded Metrics와 SQS/ECS 기본 지표를 확인한다.

- `HairJobQueued`, `HairJobCompleted`, `HairJobFailed`
- `HairProcessingLatency`
- `HairQualityRegenerated`
- `HairQuotaRejected`
- `HairMediaDeleted`, `HairMediaDeleteFailed`
- SQS `ApproximateNumberOfMessagesVisible`, `ApproximateAgeOfOldestMessage`
- DLQ `ApproximateNumberOfMessagesVisible`
- ECS desired/running task count

권장 경보는 DLQ 메시지 1개 이상, oldest message 5분 이상, worker running task가 desired보다 작음, 15분 실패율 5% 이상이다.

## 9. 출시 전 필수 검토

- 외부 AI 처리자에게 얼굴 사진이 전송된다는 동의 문구와 개인정보 처리방침
- 원본·마스크 24시간 삭제 및 계정 저장 결과 보관 정책
- 사진 저장 권한 거절, 백그라운드 복귀, 24시간 만료 UX
- 동의된 또는 합성 데이터셋에서 12개 스타일 사람 검수 평균 4/5 이상
- 1,000개 동시 생성 요청에서 API 유실 없음, SQS backlog, ECS 1~10 확장, DLQ 동작

이 문서는 기술 통제의 구현 기준이며 법률 자문을 대체하지 않는다.
