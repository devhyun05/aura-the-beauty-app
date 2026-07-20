# 수염 제거 시뮬 — Scale-to-Zero 서버리스 스택

저빈도·띄엄띄엄 트래픽용. GPU 인스턴스를 평소엔 `stopped`(과금 0)로 두고,
**요청이 올 때만** 깨워서 추론하고, 유휴 시 자동으로 다시 재운다.
전부 AWS 네이티브 → **AWS 크레딧으로 결제**. 외부 API 결제 불필요.

## 구성

```
[모바일 앱]
   │  ① 진입 시 prewarm (설문 쓰는 동안 인스턴스 워밍)
   │  ② upload_url 로 셀피를 S3에 PUT
   │  ③ 제출 시 simulate → commandId
   │  ④ result 폴링 → 완료 시 결과 프리사인 URL
   ▼
[Lambda: beard-sim-control]  ← Function URL (AWS_IAM)
   │  ec2 start / SSM SendCommand / S3 presign
   ▼
[EC2 g6e.xlarge (평소 stopped)]  ── SSM ──▶ run_on_instance.sh
   │  S3 입력 다운로드 → run_kontext.py 추론 → S3 결과 업로드
   ▼
[S3: flux-kontext-beard-<account>]  inputs/ outputs/ scripts/

[Lambda: beard-sim-idle-stop]  ← EventBridge rate(5min)
   └ LastActivity 태그가 15분 넘게 안 갱신되면 ec2 stop
```

**콜드스타트(~2~4분)는 프리웜으로 숨긴다**: 사용자가 수염 시뮬 화면에 진입하는
순간 `prewarm`을 호출 → 사진 촬영 + 설문 6문항 + 동의 읽기 동안 인스턴스가 뜬다 →
제출 시엔 이미 warm. (`docs/mobile/FRONTEND_WORK_GUIDE.md` 및 보완계획서 Stage 8)

## 파일
- `deploy.sh` — 전체 스택 배포 (재실행 안전). S3·IAM·Lambda 2종·Function URL·스케줄.
- `lambda_control.py` — 제어 Lambda (upload_url / prewarm / status / simulate / result).
- `lambda_idle_stop.py` — 유휴 자동 정지 Lambda (5분 주기).
- `run_on_instance.sh` — 인스턴스에서 SSM으로 실행: S3 입력→추론→S3 출력.
- `iam/*.json` — 인스턴스/Lambda 최소권한 정책 (배포 시 계정·버킷값 치환).
- 추론 본체 `run_kontext.py` 는 `../ec2/` 것을 그대로 재사용 (S3 scripts/로 업로드).

## 배포
```bash
export AWS_PROFILE=flux            # SSO 만료 시: aws sso login --profile flux
bash deploy.sh
```
> 이 배포는 **GPU를 켜지 않는다**(인스턴스 stopped 유지). Lambda·IAM·S3는 사실상 무료.

## 사용 (액션별, JSON body)
| action | 입력 | 반환 |
|---|---|---|
| `upload_url` | `{name}` | `{uploadUrl, inputKey}` — 이 URL로 셀피 PUT |
| `prewarm` | — | `{status: warming\|ready}` — 화면 진입 시 |
| `status` | — | `{instanceState, ssmOnline}` — 준비 폴링 |
| `simulate` | `{inputKey}` | `{status: processing, commandId, outputKey}` (준비 안 됨→`warming`) |
| `result` | `{commandId, outputKey}` | `{status, resultUrl?}` |

### 테스트 (Function URL 인증 우회, 직접 호출)
```bash
export AWS_PROFILE=flux
aws lambda invoke --function-name beard-sim-control \
  --payload '{"body":"{\"action\":\"status\"}"}' --cli-binary-format raw-in-base64-out \
  /dev/stdout
```

## 앱/백엔드 연동
Function URL은 **AWS_IAM 인증**이다. RN 앱이 AWS 자격을 들지 않도록,
`services/backend`(FastAPI)가 프록시로 SigV4 서명해 호출하는 걸 권장.
결과는 S3 프리사인 URL로 내려오므로 기존 폴링/WebSocket 완료 패턴과 맞물린다.

## 비용
- 평소: **$0** (인스턴스 stopped) + S3·EBS 소액 (200GB gp3 ≈ $16/월, 모델 보존).
- 사용: 요청이 인스턴스를 깨운 시간 × ~$1.8/hr (크레딧 차감). 유휴 15분 후 자동 stop.
- EBS까지 아끼려면 오래 안 쓸 때 인스턴스 terminate (모델 재다운로드 필요).

## 튜닝
- 유휴 종료 시간: `beard-sim-idle-stop` 환경변수 `IDLE_MINUTES` (기본 15).
- 프롬프트 변경: `../ec2/run_kontext.py` 수정 후 `deploy.sh` 재실행(S3 재업로드) — 인스턴스 재빌드 불필요.

## 정리 (teardown)
```bash
export AWS_PROFILE=flux
aws lambda delete-function --function-name beard-sim-control
aws lambda delete-function --function-name beard-sim-idle-stop
aws events remove-targets --rule beard-sim-idle-check --ids idle
aws events delete-rule --name beard-sim-idle-check
# IAM 역할/프로파일·S3 버킷은 필요 시 수동 삭제
```
