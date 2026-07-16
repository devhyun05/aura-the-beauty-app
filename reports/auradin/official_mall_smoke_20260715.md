# 공식몰 수집 재가동 스모크 (B3-2, §6.4-1)

- 실행일: 2026-07-15
- 대상: 공식몰 수집기 7종 중 대표 2곳 (gsshop, hmall)
- 방법: 기존 시드(catalog_items_seed_20260708_refined.jsonl)의 liveOffer/evidence URL 재사용,
  각 몰 2건씩 실 HTTP fetch (`collect_auradin_official_metadata._fetch_text`, 재시도 1회+백오프 포함).
  요청 간 2~3초 딜레이, robots/약관 준수 — 안티봇 챌린지 감지 시 우회 없이 blocked로 기록하는 계약.
- 판정 기준: HTTP 상태 / 안티봇 마커(captcha·challenge·access denied 등) / 상품 마커(title·옵션) /
  기존 수집기 파서로 실제 파싱 가능 여부.

## 판정 요약

| 몰 | 판정 | 근거 |
| --- | --- | --- |
| gsshop | **OPEN (수집 가능)** | 정규화 상품 URL이 상품 HTML 전문을 서빙, 안티봇 마커 없음 |
| hmall | **OPEN (수집 가능)** | itemPtc가 `__NEXT_DATA__` 포함 HTML 서빙, 기존 파서로 title·옵션 추출 성공 |

## gsshop 상세

| 상품 | URL 형태 | 상태 | 크기 | 판정 |
| --- | --- | --- | --- | --- |
| VDL 커버스테인 퍼펙팅 쿠션 | `with.gsshop.com/prd/prd.gs?prdid=1070926534&fromWith=Y` | 200 | 652,778B | ok — title `[VDL] 커버스테인 퍼펙팅 쿠션 - GS SHOP`, 옵션 마커 존재 |
| 3CE 페이스 블러쉬 | `with.gsshop.com/prd/prd.gs?prdid=1064749384&fromWith=Y` | 200 | 694,603B | ok — title `[3CE] 페이스 블러쉬 - GS SHOP`, 옵션 마커 존재 |

- 주의: 시드에 저장된 원본 affiliate 게이트 URL(`with.gsshop.com/alia/aliaGate.gs?...`)을 직접 fetch하면
  200이지만 2,765B짜리 JS 리다이렉트 스텁("GS SHOP" 빈 셸)만 온다. 이는 차단이 아니라 게이트 동작이며,
  기존 수집기의 `_gsshop_product_url()`이 이미 `prdid/ecpid/prdseqnum`을 뽑아 정규화 URL로 변환한다 —
  수집기 경로는 정상.
- 안티봇 마커: 없음 (captcha/challenge/denied/incapsula/akamai/perimeterx 모두 미검출).

## hmall 상세

| 상품 | URL 형태 | 상태 | 크기 | 판정 |
| --- | --- | --- | --- | --- |
| 3CE 베어 커버 쿠션 | `www.hmall.com/md/pda/itemPtc?slitmCd=2150866042...` | 200 | 13,439B | ok — og:title `3CE 베어 커버 쿠션 - 현대Hmall` |
| 3CE 핏팅 메쉬 커버 쿠션 | `www.hmall.com/md/pda/itemPtc?slitmCd=2251443750...` | 200 | 14,123B | ok — og:title `3CE [NEW] 핏팅 메쉬 커버 쿠션+피카소 퍼프 - 현대Hmall` |

- 본문은 Next.js 셸(13~14KB)이지만 `__NEXT_DATA__`가 포함되어 있고, 기존
  `collect_auradin_hmall_metadata` 파서로 실검증 시 title(`3CE 베어 커버 쿠션`)과
  옵션 코드(`P01, N01, N02`)가 정상 추출됐다 — 페이지 구조 변경 없음.
- 안티봇 마커: 없음.

## 결론 및 다음 액션

1. gsshop·hmall 모두 **차단 아님 / 구조 변경 없음** — 기존 수집기 그대로 재가동 가능.
2. `_fetch_text`에 재시도 1회+백오프(1.5s)를 추가해 일시 오류(타임아웃/리셋) 내성 확보
   (`scripts/collect_auradin_official_metadata.py`, 7종 수집기 공유).
3. 나머지 5종(official, lotteon, ably, wconcept, chicor)은 동일 절차의 스모크 후 재가동 —
   챌린지가 뜨는 몰은 우회 없이 blocked 기록(잠긴 계약, 올리브영 동일).
4. 재가동 시 수집 결과는 §6.4-1대로 속성 근거(공식몰 상세) 전용으로만 사용, 오퍼는 Naver 전용 유지.
