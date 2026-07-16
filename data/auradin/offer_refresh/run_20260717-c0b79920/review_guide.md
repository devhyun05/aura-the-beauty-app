# 검토 큐 13건 판단 가이드 (run 20260717)

**핵심**: 이 13건은 '의심스러워서 자동 반영이 보류된 예외'다. 나머지 553건의 가격 갱신은 이 결정과 무관하게 이미 반영된다.
따라서 **전부 keep_old로 적어도 손실이 거의 없다** — 아래 추천은 그보다 조금 더 회수하려는 참고안이다.

CSV의 URL은 제휴 게이트라 직접 접속이 안 될 수 있다. 아래 **네이버 검색 링크**는 항상 열리며 현재 시세 범위를 한눈에 보여준다:
새 가격이 검색 결과의 시세 범위 안이면 accept_new, 범위 밖이거나 세트/리필만 보이면 keep_old.

| # | 상품 | 가격 변화 | 추천 | 근거 | 시세 확인 |
|---|---|---|---|---|---|
| 1 | VDL VDL 브로우 펜슬 스키니 메이크업 엑스퍼트 0.0 | 39,960→3,990 (-90%) | **keep_old** | 변동 폭이 큼(-90%) — 세트/리필/다른 용량 오매칭 가능성. 검색 링크에서 실제 시세 확인 후에만 accept_new | [네이버 검색](https://search.shopping.naver.com/search/all?query=VDL+VDL+%EB%B8%8C%EB%A1%9C%EC%9A%B0+%ED%8E%9C%EC%8A%AC+%EC%8A%A4%ED%82%A4%EB%8B%88+%EB%A9%94%EC%9D%B4%ED%81%AC%EC%97%85+%EC%97%91%EC%8A%A4%ED%8D%BC%ED%8A%B8+) |
| 2 | VDL 브이디엘 립스틱 스타일 립스틱 아이디어 컴포트 슬립 | 34,600→65,610 (+90%) | **keep_old** | 변동 폭이 큼(+90%) — 세트/리필/다른 용량 오매칭 가능성. 검색 링크에서 실제 시세 확인 후에만 accept_new | [네이버 검색](https://search.shopping.naver.com/search/all?query=VDL+%EB%B8%8C%EC%9D%B4%EB%94%94%EC%97%98+%EB%A6%BD%EC%8A%A4%ED%8B%B1+%EC%8A%A4%ED%83%80%EC%9D%BC+%EB%A6%BD%EC%8A%A4%ED%8B%B1+%EC%95%84%EC%9D%B4%EB%94%94%EC%96%B4+%EC%BB%B4%ED%8F%AC%ED%8A%B8) |
| 3 | 네이밍 네이밍 오버 듀 글로시 립 틴트 4656911 | 28,710→33,720 (+17%) | **accept_new** | ±20% 이내 변동(+17%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EB%84%A4%EC%9D%B4%EB%B0%8D+%EB%84%A4%EC%9D%B4%EB%B0%8D+%EC%98%A4%EB%B2%84+%EB%93%80+%EA%B8%80%EB%A1%9C%EC%8B%9C+%EB%A6%BD+%ED%8B%B4%ED%8A%B8+4656911) |
| 4 | 데이지크 DASIQUE [하트컬렉션] 워터 듀이 젤 하트 쿠 | 36,360→46,550 (+28%) | **keep_old** | 변동 폭이 큼(+28%) — 세트/리필/다른 용량 오매칭 가능성. 검색 링크에서 실제 시세 확인 후에만 accept_new | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EB%8D%B0%EC%9D%B4%EC%A7%80%ED%81%AC+DASIQUE+%5B%ED%95%98%ED%8A%B8%EC%BB%AC%EB%A0%89%EC%85%98%5D+%EC%9B%8C%ED%84%B0+%EB%93%80%EC%9D%B4+%EC%A0%A4+%ED%95%98) |
| 5 | 데이지크 DASIQUE 프로 디테일 브로우 펜슬352005 | 15,390→26,200 (+70%) | **keep_old** | 변동 폭이 큼(+70%) — 세트/리필/다른 용량 오매칭 가능성. 검색 링크에서 실제 시세 확인 후에만 accept_new | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EB%8D%B0%EC%9D%B4%EC%A7%80%ED%81%AC+DASIQUE+%ED%94%84%EB%A1%9C+%EB%94%94%ED%85%8C%EC%9D%BC+%EB%B8%8C%EB%A1%9C%EC%9A%B0+%ED%8E%9C%EC%8A%AC3520) |
| 6 | 뮤드 뮤드 아이래쉬 틴팅 세럼 샷 1개 틴팅 세럼 샷 0 | 21,690→22,000 (+1%) | **accept_new** | ±20% 이내 변동(+1%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EB%AE%A4%EB%93%9C+%EB%AE%A4%EB%93%9C+%EC%95%84%EC%9D%B4%EB%9E%98%EC%89%AC+%ED%8B%B4%ED%8C%85+%EC%84%B8%EB%9F%BC+%EC%83%B7+1%EA%B0%9C+%ED%8B%B4%ED%8C%85+%EC%84%B8%EB%9F%BC+) |
| 7 | 뮤드 [뮤드] mude 글라세 립 틴트 11종 택1 | 17,990→24,500 (+36%) | **keep_old** | 변동 폭이 큼(+36%) — 세트/리필/다른 용량 오매칭 가능성. 검색 링크에서 실제 시세 확인 후에만 accept_new | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EB%AE%A4%EB%93%9C+%5B%EB%AE%A4%EB%93%9C%5D+mude+%EA%B8%80%EB%9D%BC%EC%84%B8+%EB%A6%BD+%ED%8B%B4%ED%8A%B8+11%EC%A2%85+%ED%83%9D1) |
| 8 | 에스쁘아 [에스쁘아] NEW 꾸뛰르 립틴트 글레이즈 | 15,400→14,720 (-4%) | **accept_new** | ±20% 이내 변동(-4%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EC%97%90%EC%8A%A4%EC%81%98%EC%95%84+%5B%EC%97%90%EC%8A%A4%EC%81%98%EC%95%84%5D+NEW+%EA%BE%B8%EB%9B%B0%EB%A5%B4+%EB%A6%BD%ED%8B%B4%ED%8A%B8+%EA%B8%80%EB%A0%88%EC%9D%B4%EC%A6%88) |
| 9 | 웨이크메이크 웨이크메이크 심리스 웨어 쿠션 본품+리필 기획세트 | 24,910→24,390 (-2%) | **accept_new** | ±20% 이내 변동(-2%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EC%9B%A8%EC%9D%B4%ED%81%AC%EB%A9%94%EC%9D%B4%ED%81%AC+%EC%9B%A8%EC%9D%B4%ED%81%AC%EB%A9%94%EC%9D%B4%ED%81%AC+%EC%8B%AC%EB%A6%AC%EC%8A%A4+%EC%9B%A8%EC%96%B4+%EC%BF%A0%EC%85%98+%EB%B3%B8%ED%92%88%2B%EB%A6%AC%ED%95%84+%EA%B8%B0%ED%9A%8D) |
| 10 | 컬러그램 컬러그램 긱 누드 스킨 틴트 03 라이트 베이지 1 | 12,700→13,200 (+4%) | **accept_new** | ±20% 이내 변동(+4%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%EC%BB%AC%EB%9F%AC%EA%B7%B8%EB%9E%A8+%EC%BB%AC%EB%9F%AC%EA%B7%B8%EB%9E%A8+%EA%B8%B1+%EB%88%84%EB%93%9C+%EC%8A%A4%ED%82%A8+%ED%8B%B4%ED%8A%B8+03+%EB%9D%BC%EC%9D%B4%ED%8A%B8+%EB%B2%A0%EC%9D%B4) |
| 11 | 클리오 클리오 샤프 쏘 심플 브로우펜슬 | 9,800→8,400 (-14%) | **accept_new** | ±20% 이내 변동(-14%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%ED%81%B4%EB%A6%AC%EC%98%A4+%ED%81%B4%EB%A6%AC%EC%98%A4+%EC%83%A4%ED%94%84+%EC%8F%98+%EC%8B%AC%ED%94%8C+%EB%B8%8C%EB%A1%9C%EC%9A%B0%ED%8E%9C%EC%8A%AC) |
| 12 | 투쿨포스쿨 11 투쿨포스쿨 플레르 틴트 4g 8colors 4 | 16,290→6,600 (-59%) | **keep_old** | 변동 폭이 큼(-59%) — 세트/리필/다른 용량 오매칭 가능성. 검색 링크에서 실제 시세 확인 후에만 accept_new | [네이버 검색](https://search.shopping.naver.com/search/all?query=%ED%88%AC%EC%BF%A8%ED%8F%AC%EC%8A%A4%EC%BF%A8+11+%ED%88%AC%EC%BF%A8%ED%8F%AC%EC%8A%A4%EC%BF%A8+%ED%94%8C%EB%A0%88%EB%A5%B4+%ED%8B%B4%ED%8A%B8+4g+8color) |
| 13 | 페리페라 [페리페라] 브이쉐딩 디테일 003 그레이쉬쿨 | 12,000→11,400 (-5%) | **accept_new** | ±20% 이내 변동(-5%) — 같은 상품의 다른 몰 리스팅일 가능성이 높아 저위험 | [네이버 검색](https://search.shopping.naver.com/search/all?query=%ED%8E%98%EB%A6%AC%ED%8E%98%EB%9D%BC+%5B%ED%8E%98%EB%A6%AC%ED%8E%98%EB%9D%BC%5D+%EB%B8%8C%EC%9D%B4%EC%89%90%EB%94%A9+%EB%94%94%ED%85%8C%EC%9D%BC+003+%EA%B7%B8%EB%A0%88%EC%9D%B4%EC%89%AC%EC%BF%A8) |

## 기입 방법

1. `review_template.csv`를 같은 폴더에 `review_decisions.csv`로 복사
2. 각 행의 `decision`에 위 추천(또는 본인 판단)을, `reviewedBy`에 이름을 기입 — **13행 전부 필수**(공란 불가)
3. 특이 케이스 참고:
   - #1 VDL 브로우 펜슬: 기존 39,960원이 0.05g 펜슬 가격으로는 비정상(수집 당시 세트 가격 의심). 검색해보고 3,990원이 정상가면 accept_new가 오히려 데이터를 고치는 것
   - #12 투쿨포스쿨 틴트 -59%: 세일일 수도, 낱개↔세트 오매칭일 수도 — 검색 확인 없이는 keep_old
4. 저장 후 재개 명령 실행(러너가 나머지 자동 진행)

## 부록: VDL 브로우 펜슬 3차 검증 (에스컬레이션 절차 적용 기록)

- 공식 정가 17,000원(VDL 공식몰 KR38001607), 공식 플래그십 스토어 18,000원 판매 확인.
- 매칭 오퍼 3,990원은 네이버 가격비교 카탈로그(productType=1, id 59386604315)의 최저가 — 1시간 내 3회 API 조회 모두 동일(실재 확정).
- 기존 39,960원의 정체: 쿠팡 묶음 리스팅 계열(2개 79,560·8개 306,000) — 묶음 오염이었음.
- 결론: accept_new 유지. 상품명 표기 절단("0.0")은 가이드 표시 문제였으며 실제 사양은 0.05g로 정확 일치.
