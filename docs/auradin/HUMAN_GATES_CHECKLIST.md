# 아우라딘 사람 게이트 체크리스트 (2026-07-15 전 항목 구현 완료 시점)

종합보고서의 전 항목이 구현·커밋된 상태에서, **사람만 수행할 수 있는 잔여 절차**를 실행 순서대로 정리한다.
공통 계약: 승인 필드(`approvedBy`/`reviewedAt`/`approvalConclusion`, 스팟체크 `verdict`/`checkedBy`)는 사람만 기입한다 — 에이전트·git user 대필 금지.

## 1. A6 첫 갱신 스냅샷(20260717) 승격 — 최우선

가격 변동 149건·티어 이동 21건이 반영된 스냅샷이 골든 6/6 통과 후 대기 중이다.

- [ ] 검토 큐 13건 결정: `data/auradin/offer_refresh/run_20260717-c0b79920/review_template.csv`를 `review_decisions.csv`로 복사해 decision(accept_new/keep_old/mark_stale)·reviewedBy 기입
- [ ] 재개: `./.venv/bin/python scripts/run_auradin_weekly_offer_refresh.py --resume-run 20260717-c0b79920 --apply-review <decisions.csv> --until golden`
- [ ] 승인: `reports/auradin/approvals/offer_refresh_20260717_approval.json` 서명(pending→approved)
- [ ] activate: 러너가 출력한 커맨드 실행(런북 §5) → active pointer·골든 재확인
- 참고: **20260716 활성화는 생략 권고** — 20260717이 동일 seed + A8 정화 + 최신 오퍼로 상위 대체함(승인 템플릿 `snapshot_20260716_activation.json`은 기록으로만 유지)

## 2. base 보충(20260718) 스팟체크 → 병합 → 승격 (C급)

신규 base 1,418개(A8 invalid 0, 컷 후 base 1,038 예측)가 대기 중이다.

- [ ] 스팟체크 30건: `data/auradin/review/base_supplement_spotcheck_20260718.csv` — 구매 URL 원문과 대조해 verdict(pass/fix/drop)·checkedBy 기입
- [ ] 반영: builder `--apply-spotcheck` → `scripts/merge_auradin_seed_supplement.py`로 병합(기존 행 불변 3단언 자동)
- [ ] 승격: `run_auradin_weekly_offer_refresh.py --from preprocess --run-date 20260719 --seed-path <병합 seed> --until golden` (1번 activate 이후에만 — 하루 1승격, runDate > 20260717)
- [ ] **C급 baseline 재승인**(런북 §9.3) 후 activate
- 규모 판단 참고: 1,418개 전량 편입은 base 편중을 만든다 — 스팟체크와 함께 편입 상한(예: 인기 상위 N) 결정 권장. F17 캡은 반영돼 있어 성능은 안전.

## 3. A10 유형별 컷 발효 승인 (B급, 소급)

코드는 커밋·활성 상태(리필/미니/도구 컷 + 기획 caveat + chunks 동기 + 라이브 대칭).

- [ ] `reports/auradin/approvals/a10_golden_diff_20260717.json` 검토·서명 (근거: 골든 6/6 with A10, 단위테스트 5건)

## 4. B8 가중치 v2 + R3 matchRate 재정의 켜기 (C급)

flag `auradin_score_weights_v2`(기본 off). before/after 골든 증거 생성됨(둘 다 6/6).

- [ ] `reports/auradin/mvp_agent_eval_20260717_weights_v2{_before,}.{md,json}` 비교 검수 → 승인 시 settings에서 flag on + baseline 재승인 기록

## 5. A5 이벤트 수집 켜기

구현 완료(스키마·로거·API·모바일 방출, 테스트 19건). flag `auradin_events_enabled`(기본 off).

- [ ] `아우라딘_익명식별_이벤트스키마_RFC.md` 미결정 항목(D1~D9) 승인 서명
- [ ] 익명 token 발급·모바일 헤더 전송 배선(후속 구현 1건) 후 flag on
- 주의: dev 공용 subject로는 어떤 경우에도 적재되지 않는다(구조적 차단 확인됨)

## 6. R1 표면 전환 켜기

- [ ] `EXPO_PUBLIC_AURADIN_PRIMARY_SURFACE=1`로 실기기 E2E(분석완료→Auradin 랜딩→톤 칩→저장→재마운트 복원) 후 기본값 전환 결정

## 7. 운영 등록

- [ ] crontab 2건: 주간(`0 3 * * 1` 오퍼 갱신), 월간(`0 4 1 * *` 확장 트랙) — 런북 §2·§9.1
- [ ] AWS 크리덴셜 확보 시: B2 실임베딩 전환(docs/auradin/B2_EMBEDDING_SWITCH.md 체크리스트) + B3 LLM 배치 추출 실행(`--dry-run` 제거)

## 8. 데이터 축적 후 (달력 시간 게이트)

- B7 개인화 실반영: 이벤트 2주+ 축적 후 flag `auradin_profile_score_enabled` on (새도 로깅은 즉시 동작)
- C1 LTR·C5 A/B 정식화: 수천 세션 축적 후 (§12 판정 유지)
