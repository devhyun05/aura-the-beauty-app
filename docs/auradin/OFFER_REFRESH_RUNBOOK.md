# Auradin 주간 오퍼 갱신 런북

이 문서는 활성 Auradin 스냅샷의 가격·구매 URL·이미지를 주 1회 갱신하는 A6 운영 절차다. 러너는 새 스냅샷을 준비하고 증거를 만들지만, **활성화와 승인은 사람이 수행한다.** 실패하거나 승격이 거부돼도 현재 active snapshot은 그대로 서빙된다.

## 1. 사전 조건

- 저장소 루트에서 `./.venv/bin/python`을 사용한다.
- 네이버 쇼핑 API 자격 증명이 실행 환경에 있어야 한다.
- 실행일은 active manifest의 `runDate`보다 뒤여야 한다.
- 동일 저장소에서 주간 러너를 동시에 실행하지 않는다. 러너는 `data/auradin/offer_refresh/run.lock` 파일을 배타 생성해 lock을 잡으며, 파일이 이미 있으면 즉시 중단한다. 정상 종료·중단 시 lock은 자동 해제되고, 프로세스가 비정상 종료해 lock이 남았다면 실행 중인 러너가 없음을 확인한 뒤 수동 삭제한다.
- cron 실행 전 `logs/` 디렉터리가 존재해야 한다. 아래 cron은 이를 직접 생성한다.

## 2. cron 등록

매주 월요일 03:00에 golden 단계까지 시도하는 예시다. `<repo>`는 절대 경로로 치환한다.

```cron
0 3 * * 1 cd <repo> && mkdir -p logs && ./.venv/bin/python scripts/run_auradin_weekly_offer_refresh.py --until golden >> logs/offer_refresh.log 2>&1
```

등록 후 확인한다.

```bash
crontab -l
tail -n 200 logs/offer_refresh.log
```

cron이 `review_required`에서 종료되는 것은 실패가 아니다. 사람 검토가 필요한 가격 급변 또는 `possible_stale` 항목을 발견해 안전하게 멈춘 상태다.

## 3. 실행 결과와 runId 찾기

각 실행은 fetch 전에 `{run-date}-{uuid8}` 형식의 `runId`를 발급하고 다음 디렉터리에 격리한다.

```text
data/auradin/offer_refresh/run_<runId>/
```

최초 실행이 만드는 핵심 파일:

- `results.jsonl`: 재조회 결과. 최초 생성 뒤 수정 금지
- `review_template.csv`: 검토 입력 템플릿. 최초 생성 뒤 수정 금지
- `meta.json`: `resultsSha`와 `reviewTemplateSha`, 단계 상태
- `diff.json`: 검토 큐가 없거나 검토 재개가 끝난 뒤의 최종 diff
- `seed.jsonl`: 검토 큐가 없거나 검토 재개가 끝난 뒤의 승격 후보 seed

`meta.json`의 SHA와 실제 파일이 다르면 해당 run을 폐기하고 새 run을 시작한다. SHA 불일치를 수동으로 고치거나 봉인을 다시 계산하지 않는다.

## 4. `review_required` 처리

### 4.1 결정 파일 만들기

원본 템플릿을 보존한 채 별도 파일로 복사한다.

```bash
cp data/auradin/offer_refresh/run_<runId>/review_template.csv \
  data/auradin/offer_refresh/run_<runId>/review_decisions.csv
```

`review_decisions.csv`에서는 아래 세 열만 편집한다.

- `decision`: `accept_new`, `keep_old`, `mark_stale` 중 하나
- `reviewedBy`: 실제 검토자 식별자
- `note`: 판단 근거

`runId`, `catalogItemId`, 상품명, 가격, URL, 점수 등 나머지 열을 변경하면 재개가 거부된다.

결정 의미:

- `accept_new`: 새 매칭 결과의 갱신 가능 필드를 적용한다.
- `keep_old`: 기존 오퍼와 상태를 유지한다. 불확실할 때의 기본값이다.
- `mark_stale`: 사람이 판매 상태를 검토한 뒤에만 `collectionStatus="stale"`로 전환한다.

### 4.2 동일 run 재개

```bash
./.venv/bin/python scripts/run_auradin_weekly_offer_refresh.py \
  --resume-run <runId> \
  --apply-review data/auradin/offer_refresh/run_<runId>/review_decisions.csv \
  --until golden
```

재개는 봉인된 번들 전체를 다시 검증하며 네이버 API를 재호출하지 않는다 — `results.jsonl` SHA뿐 아니라 **원 실행의 runDate·입력 seed SHA·active manifest SHA**가 하나라도 다르면 중단한다(과거 결과를 새 날짜·새 seed 위에 재생하는 경로 차단). `--apply-review` 시에는 **헤더 완전 일치 + 원본 큐와 1:1 행 집합 + 모든 행의 명시적 decision(accept_new/keep_old/mark_stale — keep_old도 직접 기입)과 reviewedBy**를 요구한다. 비결정 열 변경, 행 누락·중복, 공란 decision은 전부 중단 사유다.

## 5. 승인 및 activate

golden까지 통과하면 러너는 다음을 출력한다.

1. 준비된 snapshot manifest와 SHA
2. golden 6/6 및 A8 결과
3. 최종 diff 요약
4. activate 명령 전문
5. `approvalConclusion="pending"`인 승인 증거 템플릿

운영자는 diff 리포트와 가격 하드필터 영향 시나리오를 확인한다. 승인 파일에서 다음 값은 사람이 직접 작성한다.

- `approvedBy`
- `reviewedAt`
- `approvalConclusion`: `pending`에서 `approved`로 변경

git user 또는 러너가 이 값을 대신 채워서는 안 된다. 승인 증거에는 해당 run의 `runId`, `resultsSha`, `reviewDecisionsSha`, `snapshotManifestSha256`이 포함돼야 한다. 승인 파일이 완성된 뒤에만 러너가 출력한 activate 명령을 그대로 실행한다. 활성화 후 active pointer와 golden 6/6을 다시 확인한다.

승인하지 않는 경우 activate를 실행하지 않는다. **승격 거부는 롤백이 아니다.** active pointer가 바뀌지 않았으므로 기존 스냅샷이 계속 서빙된다.

## 6. 실패 대응

| 상태 | 의미 | 대응 |
|---|---|---|
| `review_required` | 사람 판단이 필요한 항목 존재 | §4의 별도 decisions 파일로 검토 후 동일 run 재개 |
| fetch 실패율 `>10%` | 외부 API 또는 네트워크 품질 불량 | 승격하지 말고 원인을 해소한 뒤 새 run 실행 |
| active runDate 이상/동일 실행일 | 날짜 역행 또는 덮어쓰기 위험 | active보다 뒤의 날짜로 새 run 실행 |
| SHA/비결정 열 불일치 | 검토 대상과 승격 대상의 동일성 훼손 | run 폐기, 파일을 수선하지 말고 새 run 실행 |
| preprocess/A8/golden 실패 | 후보 스냅샷 품질 게이트 실패 | activate 금지, 산출물과 로그를 보존해 원인 수정 |
| lock 획득 실패 | 다른 실행이 lock 보유 중 | 실행 상태 확인 후 기존 실행이 끝난 다음 재시도 |

lock 파일이 남아 있으면 먼저 실제 실행 중인 러너 프로세스가 있는지 확인한다(`ps` 또는 로그). 실행 중이 아니라고 확인된 경우에만 lock 파일을 수동 삭제하고 재시도한다.

## 7. 상태 해석의 한계

- `fetch_failed`: 요청 실패다. 상품 판매 종료나 품절 증거가 아니다.
- `no_match`: 정상 검색 응답에서 확정 매칭을 만들지 못했다. 빈 응답과 타 브랜드 결과도 여기에 포함된다.
- `ambiguous`: 1위 점수, 2위와의 margin, 브랜드·variant 검증이 확정 기준을 충족하지 못했다.
- `matched`: identity 사다리로 확정 매칭됐다.
- `possible_stale`: 2회 연속 `no_match`인 사람 검토 사유다. 자동으로 stale이 되지 않는다.
- `stale`: 사람이 `mark_stale` 결정을 내린 경우에만 기록한다.
- `unavailable`: 정확한 productId 또는 구매 URL에서 명시적 판매 종료 신호를 확인한 상태다. 현재 M2 수집은 이 증거를 만들 수 없으므로 자동 산출하지 않는다.

검색 미노출, 브랜드 필드 공란, 가격 누락만으로 품절·판매 종료를 추론하지 않는다.

## 8. 매칭 임계값 캘리브레이션 기록

기본 확정 조건은 브랜드 검증, `bestScore >= 0.50`, `bestScore - runnerUpScore >= 0.15`다. 값 변경은 단일 run의 감으로 하지 않고 실제 diff와 오매칭/미매칭 표본을 함께 남긴다.

| 기록일 | runId | 표본 수 | min score | margin | 오매칭 수 | 미매칭 수 | 결정·근거 | 검토자 |
|---|---|---:|---:|---:|---:|---:|---|---|
| | | | 0.50 | 0.15 | | | 초기값 유지/변경 사유 | |

임계값을 변경하면 코드·테스트·본 표를 같은 변경으로 갱신하고, 과거 run의 봉인 파일은 수정하지 않는다.

## 9. 월1회 확장 트랙 (B4)

주간 트랙이 기존 618개의 오퍼만 갱신하는 것과 달리, 확장 트랙은 **신규 제품 + 속성**을 월 1회 편입한다(§6.2 확장 트랙). 오케스트레이터는 `scripts/run_auradin_monthly_expansion.py`이며 기존 자산만 체이닝한다 — 신규 인프라 없음.

```
① collect      run_auradin_naver_collection --all-templates (전 카테고리)
② supplement   build_auradin_base_supplement_seed --category {cat} (정규화 이름 키로 신규 판별)
③ spotcheck    사람 스팟체크 큐 — 체인이 여기서 멈춘다 (자동 통과 없음)
④ merge        merge_auradin_seed_supplement (카테고리별 supplement 순차 병합)
⑤ promote-prep run_auradin_weekly_offer_refresh --from preprocess --seed-path {merged}
```

### 9.1 cron 등록

매월 1일 04:00, 주간 트랙(월요일 03:00)과 시간대가 겹치지 않게 잡는다. 오케스트레이터는 스팟체크 게이트에서 스스로 멈추므로 cron은 게이트 앞까지만 자동이다.

```cron
0 4 1 * * cd <repo> && mkdir -p logs && ./.venv/bin/python scripts/run_auradin_monthly_expansion.py >> logs/monthly_expansion.log 2>&1
```

실행 계획만 미리 보려면 `--plan-only`를 쓴다.

```bash
./.venv/bin/python scripts/run_auradin_monthly_expansion.py --plan-only
```

### 9.2 스팟체크 절차 (사람 게이트)

1. 오케스트레이터가 `halted_for_spotcheck`로 멈추면 `data/auradin/review/{category}_supplement_spotcheck_{RUN_DATE}.csv`가 카테고리별로 생성돼 있다(브랜드 층화 표본, 기본 30건).
2. 검토자는 각 행의 추출 속성(texture/finish/colorFamily/undertone)을 구매 URL 원문과 대조해 `verdict`(`pass`/`fix`/`drop`)와 `checkedBy`를 기입한다. `fix`는 `correctedField`·`correctedValue`를 함께 기입한다. **verdict와 checkedBy는 사람만 기입한다 — 러너·git user가 대신 채우지 않는다.**
3. 모든 CSV가 채워지면 검토된 CSV가 있는 디렉터리로 재실행한다.

```bash
./.venv/bin/python scripts/run_auradin_monthly_expansion.py --date <RUN_DATE> \
  --spotcheck-dir data/auradin/review >> logs/monthly_expansion.log 2>&1
```

4. 재실행은 ②를 `--apply-spotcheck` 모드로 다시 돌려 drop/fix를 반영하고 ④ merge → ⑤ promote-prep(preprocess→vector→prepare→golden)까지 진행한다.

LLM 배치 추출(`scripts/run_auradin_llm_attribute_extraction.py`, B3)의 결과도 같은 원칙을 따른다: 추출 결과는 `data/auradin/review/` 아래 review 큐 파일로만 나오고 시드에 직접 병합하지 않는다. `hardFilterEligible` 승격은 field-specific confidence ≥ 0.70 **그리고** 사람 스팟체크 통과 배치만 가능하다.

### 9.3 C급 baseline 재승인

대규모 카탈로그 재생성은 골든 정책상 **C급(체계 변경)**이다 — "무회귀"가 아니라 **전체 baseline 재승인**(골든 스냅샷 재생성 + 사람 검수)을 요구한다. 확장 트랙으로 카탈로그 구성이 크게 바뀐 달에는 §5의 승인 절차에 더해 골든 corpus 9질의 결과를 사람이 재검수하고 새 baseline으로 명시 승인한다.

승인 파일에서 다음 값은 **사람만 기입한다** (§5와 동일 계약 — 러너·git user 대필 금지):

- `approvedBy`
- `reviewedAt`
- `approvalConclusion`: `pending` → `approved`

승인 전까지 activate를 실행하지 않으며, 승격 거부는 롤백이 아니다 — active pointer가 바뀌지 않았으므로 기존 스냅샷이 계속 서빙된다.
