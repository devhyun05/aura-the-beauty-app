# 메이크업 트렌드 운영·관측 Runbook

자동 crawler는 이 범위에 포함하지 않는다. 승인된 출처를 사람이 읽고 근거를 JSON으로 작성한 뒤 검증·import·승인을 분리한다. 원문 전체나 사용자 데이터는 저장하지 않는다.

## JSON import

입력 정본은 [trend-import.example.json](./trend-import.example.json) 형식이다. `sourceUrl`, `sourcePublishedAt`, `market`, `locale`, `evidence`, `asOf`, `expiresAt`, `confidence`, `situations`는 필수다. 키워드 텍스트는 NFKC와 연속 공백 정규화를 거치며 `(normalized_text, locale, market)` 조합으로 중복 제거된다. 상황 key는 고정된 8개 부모만 허용한다.

```powershell
cd services/backend
.\.venv\Scripts\python.exe scripts\import_makeup_trends.py --input ..\..\docs\makeup-recommendation-v2\trend-import.example.json --validate-only
.\.venv\Scripts\python.exe scripts\import_makeup_trends.py --input ..\..\docs\makeup-recommendation-v2\trend-import.example.json
```

두 번째 명령도 기본값은 `draft`이며 mapping은 `disabled`다. 출처와 만료일을 사람이 재확인한 뒤에만 다음처럼 승인한다.

```powershell
.\.venv\Scripts\python.exe scripts\import_makeup_trends.py --input ..\..\docs\makeup-recommendation-v2\trend-import.example.json --approve
```

기존 `approved` row에 같은 composite key를 draft로 다시 넣어도 공개 row를 덮어쓰지 않는다. 승인 import만 row를 갱신하고 mapping을 활성화한다. discovery는 `approved + active + 미만료`만 노출한다.

## CloudWatch EMF와 알람

Bedrock `generate_json`과 OpenAI `generate_recommendation_asset` 공통 경계는 `Aura/MakeupRecommendation` namespace에 `RequestCount`, `ErrorCount`, `LatencyMs`를 EMF JSON으로 stdout에 남긴다. dimension은 service/provider/operation/model/status만 사용하며 prompt, 사진 URL, credential은 포함하지 않는다.

설정 JSON과 명령을 AWS 호출 없이 검증한 뒤 적용한다.

```powershell
.\scripts\aws\configure_makeup_recommendation_observability.ps1 -ValidateOnly
.\scripts\aws\configure_makeup_recommendation_observability.ps1 -Profile aura-dev -Region ap-northeast-2 -Environment dev -AlertTopicArn arn:aws:sns:ap-northeast-2:ACCOUNT:aura-ops-alerts-dev
```

스크립트는 모델별 요청 수, p95 지연, 오류 dashboard와 5분 오류 3건, Bedrock p95 20초, OpenAI image p95 90초 알람을 idempotent하게 생성·갱신한다. 임계값은 staging 관측 후 운영 SLO에 맞춰 조정한다.
