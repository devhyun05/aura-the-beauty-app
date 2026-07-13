# 05. 보안·개인정보·법무

> 이 문서는 제품·기술 관점의 리스크 검토이며 법률 자문이 아니다. 한국 출시 전 개인정보 보호책임자와 법무 검토가 필요하다.

## 출시 판단

현재 상태 그대로는 production 출시 `NO-GO`다. UI 시제품은 진행할 수 있지만, 실제 사용자의 AR/행동 데이터와 외부 상품을 연결하기 전에 아래 P0를 해결해야 한다.

1. 클라이언트 상품 payload로 공용 카탈로그를 덮어쓰는 like 경로 제거
2. 종료 예정 Naver Shopping Search 의존 제거와 약관/라이선스 확인
3. 최종 AR recipe 최소수집·소유권·삭제·보존 정책
4. 행동 개인화와 코호트 개인화의 선택 동의 및 철회 경로
5. 상품 이미지·shade·가격·판매 URL의 출처와 이용권리
6. 광고·제휴·협찬 표시 정책
7. 원본 얼굴 frame/landmark가 추천 로그로 유입되지 않는 검증

## 1. 현 코드의 P0 카탈로그 오염 취약점

`services/backend/app/api/products.py`의 외부 상품 좋아요 경로는 클라이언트가 보낸 다음 값을 서버 `products`에 upsert한다.

- brand/product/shade name
- image URL
- purchase URL
- price
- tags/palette
- match rate/reason

같은 `external_key`가 존재하면 기존 공용 row를 update한다. 공격자는 인증 계정 하나로 정상 상품의 구매 URL을 피싱 사이트로 바꾸거나 이미지·상품명·추천 이유를 오염시킬 수 있다. 이후 다른 사용자에게 오염된 값이 노출될 가능성이 있다.

### 필수 수정

- like/unlike는 서버 내부 UUID만 허용
- body의 product payload 제거
- 공용 상품 metadata 변경은 인증된 ingestion/admin 경로만 허용
- seller URL은 provider별 HTTPS domain allowlist
- 기존 row의 source/provider/license는 immutable 또는 권한 있는 ingestion만 변경
- 변경 감사로그, rate limit, anomaly alert
- 이미 저장된 외부 상품 URL/metadata를 일회성 audit

외부 결과를 즉시 저장해야 한다면 서버가 provider 응답을 직접 검증한 뒤 product UUID 또는 짧은 TTL의 서명 reference를 발급한다. 클라이언트가 self-asserted metadata를 보내는 구조는 유지하지 않는다.

## 2. 데이터 분류와 최소수집

| 데이터 | 분류/위험 | 사용 | 금지/제한 |
| --- | --- | --- | --- |
| 원본 얼굴 사진·video frame | 개인 식별 가능성이 큰 개인정보 | AR 처리에 필요한 순간 | 추천 이벤트/LLM/분석 로그 금지, 즉시 폐기 우선 |
| 얼굴 landmark | 얼굴 기하 정보 | on-device rendering | 서버 추천에 불필요, 저장 금지 우선 |
| identity face embedding | 생체인식 위험이 매우 큼 | 본 기능에 불필요 | 수집하지 않음 |
| `saved_ar_look_v1` + recipe v2 | 계정과 연결된 취향·AR 설정 | AR 재현/authoring-color 추천 | `sourceFrameMetadata`·얼굴 원본·landmark 제외, private 기본 |
| 저장 룩 얼굴 thumbnail | 얼굴 개인정보 | 선택적 룩 미리보기 | 기본 미저장; 별도 opt-in/private media/삭제가 있을 때만 |
| personal color/undertone | 계정 연결 시 개인정보가 될 수 있음 | 보조 랭킹/코호트 | 건강·인종·질병으로 과도 추론 금지 |
| 피부 상태/분석 요약 | 건강 관련 해석 위험 | 별도 얼굴분석 기능 | 상품 추천에 꼭 필요한 최소 feature만, 원문 외부 전송 지양 |
| 좋아요 | 명시적 선호 | 저장·개인화 | 철회 즉시 반영 |
| 검색/클릭/impression | 행동 데이터 | 동의한 개인화/품질 | raw query 최소화, 보존 제한, 목적 외 사용 금지 |
| seller outbound | 구매 의도 추정 | funnel 지표 | 실제 구매로 표현 금지 |

개인정보보호법상 얼굴 사진은 개인을 알아볼 수 있거나 다른 정보와 쉽게 결합해 알아볼 수 있으면 개인정보다. 얼굴에서 고유 식별을 목적으로 생성한 생체인식정보는 더 높은 보호가 필요할 수 있다. 이 기능은 얼굴 identity embedding이 필요하지 않으므로 아예 만들지 않는 것이 가장 안전하다.

## 3. 동의와 제어

서비스 필수 처리를 포괄 동의 하나로 묶지 않는다. 권고 UI는 목적별 선택을 분리한다.

| 처리 목적 | 기본 | 사용자가 끄면 |
| --- | --- | --- |
| 저장한 AR 룩 보관·재사용 | 사용자가 저장할 때 명시 | 저장하지 않거나 기존 룩 삭제 가능 |
| 저장 AR 룩의 즉시 제품 매칭 | 룩을 선택한 명시 행동 | 해당 요청에만 처리, 시즌 추천은 유지 |
| 좋아요 저장 | 좋아요 명시 행동 | unlike/목록 삭제 |
| 검색·클릭 기반 개인화 | **선택·기본 꺼짐 권고** | 이벤트를 개인화에 사용하지 않고 파생 프로필 삭제/비활성화 |
| 비슷한 취향 코호트 | **별도 선택** | section 숨김, 코호트 기여 중단 |
| 마케팅 push/email | 추천 기능과 별도 | 추천 허브 사용 가능 |

동의 화면에는 수집 항목, 목적, 보유기간, 거부해도 사용할 수 있는 기능, 철회 경로를 짧고 구체적으로 표시한다. 설정에서 언제든 상태를 확인·변경할 수 있어야 한다.

만 14세 미만 사용 가능성이 있으면 법정대리인 동의와 연령 확인 정책을 출시 전에 확정한다. 준비되지 않았다면 지원 연령을 정책·스토어 정보·가입 흐름에 일관되게 제한한다.

## 4. 보존과 삭제

다음은 법정 보존기간이 아니라 데이터 최소화를 위한 **초기 정책 제안**이다. 계약·법적 의무·운영 필요를 검토해 승인해야 한다.

| 데이터 | 제안 보존 | 삭제/집계 |
| --- | --- | --- |
| 카메라 raw frame | 처리 직후 | 메모리/임시파일 포함 즉시 폐기 |
| 저장 AR recipe | 사용자가 삭제/계정 삭제까지 | 삭제 즉시 추천 제외, backup 삭제 목표 30일 |
| 선택 저장 얼굴 thumbnail | 룩과 함께, 별도 동의 기간 | 룩 삭제 시 전용 media 즉시 삭제 queue; backup 목표 30일 |
| raw engagement event | 90일 | 이후 비식별·집계 또는 삭제 |
| 파생 취향 profile | 최근 활동 후 180일 | 동의 철회 시 재계산/삭제 |
| recommendation run | 30일 | 모델 품질용 집계만 장기 보존 |
| raw search query | 30일 이하 우선 | 해시/범주 집계로 대체 검토 |
| likes | unlike 또는 계정 삭제까지 | 관계 row 삭제 |
| provider raw response | 계약이 허용한 최소 기간 | 약관·라이선스에 맞춰 삭제 |
| 감사로그 | 보안/법무 승인 기간 | 민감 payload 금지 |

삭제 요청은 `saved_makeup_styles`, likes, events, recommendation runs, AURADIN state, derived profile, cache/queue까지 추적한다. 기존 media deletion service가 style/run을 참조하므로 새 FK와 테이블도 삭제 영향 분석에 추가한다.

## 5. Naver API와 이용조건

### 종료 및 전환 리스크

- Naver Developers는 쇼핑 검색 API를 2026-07-31 종료한다고 [공식 공지](https://developers.naver.com/notice/article/32564)했다.
- 별도 [API HUB 전환 공지](https://developers.naver.com/notice/article/32530)는 검색·검색어트렌드·쇼핑인사이트 등의 이전 일정을 안내한다.
- 현재 공개된 [Naver API HUB 개요](https://api.ncloud-docs.com/docs/naver-api-hub-overview)와 사용 문서에서 기존 쇼핑 상품 검색의 동등 대체 endpoint를 확인하지 못했다. 이는 문서 기반 추론이므로 Naver에 서면 확인해야 한다.

### 결과 저장·가공 리스크

[Naver Developers API 이용약관](https://developers.naver.com/products/terms/)은 승인되지 않은 검색결과 저장·가공과 검색결과의 독립적 표시/왜곡 문제에 제한을 둔다. 현 구조처럼 외부 검색결과를 자체 catalog에 정규화해 저장하고, 재정렬·추천 세트 생성 후 독립적인 쇼핑 결과처럼 보이는 방식은 높은 약관 리스크가 있다.

필수 조치:

- 법무/파트너 담당자가 현재·API HUB 계약에서 저장, 캐시, 재정렬, 추천, 이미지 표시, deep link 허용범위를 서면 확인
- 확인 전 신규 기능이 Naver Shopping Search 결과를 장기 저장하거나 자체 shade catalog로 취급하지 않음
- Naver Shopping Insight는 trend signal로만 사용
- Insight 응답의 `ratio`를 동일 조회 범위 내 상대 클릭 지표로만 설명
- 종료/쿼터/오류 시 자체 시즌 컬렉션으로 graceful degradation

## 6. 상품·shade·이미지 권리

제품 추천에 사용할 각 데이터 필드의 권리를 별도로 관리한다.

- product name/brand/logo
- product/packshot image
- shade swatch
- 가격·재고·seller URL
- 리뷰/설명 문구
- affiliate attribution

product family 한 row에 모든 권리를 뭉치지 않는다. 제품, shade evidence, packshot/swatch asset, seller offer마다 `source_provider`, `source_reference`, `license_type/status`, `allowed_uses`, `valid_from/valid_until` 또는 이에 준하는 typed provenance를 둔다. 후보 query가 각 단계의 유효기간과 `mobile_display`/`recommendation` 허용을 강제해야 한다. `인터넷에서 보이는 이미지`는 앱 재사용 권한을 의미하지 않는다. 파트너 feed와 브랜드 공식 자료도 계약상 모바일 표시·캐시·리사이즈·추천 재정렬 허용범위를 확인한다.

사용자가 판매처로 이동하기 전 가격/재고 갱신 시점을 표시하고, 만료·품절 상품은 ranking에서 제외한다.

## 7. 광고·제휴·연예인 콘텐츠

### 광고·제휴

대가, 수수료, 노출 보장 또는 제휴 관계가 추천 순위/표시에 영향을 주면 사용자가 즉시 이해할 수 있는 표시가 필요하다. [공정거래위원회 추천·보증 등에 관한 표시·광고 심사지침](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000280130&chrClsCd=010201)과 [표시·광고의 공정화에 관한 법률](https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=&joNo=&languageType=KO&lsNm=%ED%91%9C%EC%8B%9C%E3%86%8D%EA%B4%91%EA%B3%A0%EC%9D%98+%EA%B3%B5%EC%A0%95%ED%99%94%EC%97%90+%EA%B4%80%ED%95%9C+%EB%B2%95%EB%A5%A0&paras=1)을 법무가 검토해야 한다.

권고:

- `광고`, `제휴 링크`, `협찬`을 카드 가까이에 표시
- organic score에 숨은 유료 boost 금지
- sponsored rail 분리
- 사용자가 광고 이유를 확인 가능
- affiliate 클릭 파라미터는 서버 관리

### 연예인·인플루언서

`청하 갈웜 메이크업` 같은 시즌 테마는 눈에 띄지만 이름·사진·초상·보증 관계 오인 리스크가 있다. [대법원 판례의 퍼블리시티/초상 관련 쟁점](https://www.law.go.kr/LSW/precInfoP.do?precSeq=146849)과 각 콘텐츠 라이선스를 검토해야 한다.

권리가 없을 때는 `골든 웜 글로우`, `뮤트 로즈 무대 룩`처럼 일반 trend theme를 사용한다. AI 생성 닮은꼴 이미지도 안전한 우회로로 보지 않는다.

## 8. AWS Bedrock/외부 AI

현 추천 경로는 analysis summary, personal color, skin type 등의 텍스트를 embedding 입력으로 구성할 수 있다. 색상 거리 계산에는 이 외부 전송이 필요하지 않다.

권고:

- AR 색상은 로컬/자체 서버의 결정론적 변환으로 처리
- LLM/embedding에는 user ID, raw report, 얼굴 데이터, 자유 서술 원문을 보내지 않음
- 필요한 경우 broad enum (`warm`, `glow`, `lip`)만 전송
- AWS region, IAM least privilege, KMS, network path, CloudTrail/로그, DPA/국외 이전을 검토
- prompt/model version과 삭제 가능성을 기록하되 원문은 최소화
- [AWS Bedrock 데이터 보호 문서](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)와 [Amazon 모델 개인정보 설명](https://aws.amazon.com/bedrock/amazon-models/privacy/)을 실제 계정 설정·계약과 함께 검토

공급자 문구만 믿고 앱 로그, tracing, proxy, error monitoring에 payload가 남는 경로를 놓치지 않는다.

### 생성형 AI 고지

대한민국 [인공지능기본법 제31조](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0031&lsiSeq=282791&urlMode=lsScJoRltInfoR)는 2026-01-22 시행됐으며, 생성형 AI 기반 제품·서비스의 사전 고지와 생성 결과물 표시를 규정한다. AURADIN이 생성형 모델로 답변·설명·이미지를 만들면 사용자가 AI와 상호작용 중임을 분명히 하고, 생성 결과와 catalog의 검증 사실을 구분해야 한다.

- AURADIN 진입/대화 화면에 AI 기반 탐색임을 알림
- 생성된 설명은 `AI 생성 안내`와 함께 제공하고 제품 사실은 서버 catalog로 검증
- 실제와 구분하기 어려운 가상 인물·발색 이미지는 명확한 AI 표시와 권리 검토
- 생성 문구를 공식 브랜드 효능·사용후기처럼 보이게 하지 않음
- 법 시행령상 표시 방법·예외와 최신 가이드를 출시 직전에 재검토

일반적인 rule-based AR 색상 정렬 자체가 생성 결과물인지는 별도 문제다. 생성형 AI를 쓰지 않은 deterministic reason label까지 모두 AI 생성이라고 표시할 필요가 있는지는 실제 구현과 법무 판단에 맞춰 구분한다.

## 9. 화장품 효능·안전성 표현

추천 서비스가 외부 상품 설명이나 AURADIN 문구를 재구성할 때 검증되지 않은 의학적·기능성 주장을 만들 수 있다. [화장품법 제13조 관련 규정](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1025608537)과 표시·광고 규정을 법무·상품 담당자가 검토해야 한다.

금지 또는 별도 승인 대상으로 둘 표현 예:

- `여드름을 치료해요`, `피부염을 완치해요`
- `민감성 피부에 100% 안전해요`
- `부작용이 전혀 없어요`
- 근거 없는 `전문가 인증`, `임상 1위`, `완벽한 퍼스널 컬러 일치`

통제:

- 제품 효능·주의사항은 승인된 catalog field만 표시
- LLM이 효능·성분 안전성·진단을 생성하지 못하도록 policy+schema 적용
- 외부 상품명·리뷰·trend text는 untrusted input으로 처리
- 알레르기·피부질환 질문은 제품 추천으로 단정하지 않고 전문상담/공식 주의사항 안내
- 기능성·시험 수치에는 근거 source와 적용 조건을 함께 저장

## 10. 위협 모델

| 위협 | 공격/실패 | 통제 |
| --- | --- | --- |
| Catalog poisoning | client payload로 이름/URL 변조 | 내부 UUID, server ingestion, immutable provenance |
| Phishing/SSRF | 악성 seller/image URL | HTTPS allowlist, redirect/IP 검증, proxy 제한 |
| IDOR | 다른 사용자의 AR style 조회 | auth ownership, 존재 여부 비공개 |
| Event fraud | impression/click spam으로 순위 조작 | 서명 run, idempotency, rate limit, unique cap |
| Prompt injection | 상품명/외부 문서가 AURADIN 지시로 작동 | data/instruction 분리, schema output, catalog allowlist |
| Hallucination | 없는 shade/가격/재고 생성 | 서버 catalog grounding, unknown 허용, evidence 표시 |
| Sensitive log leak | 얼굴/리포트/query가 로그로 유출 | structured allowlist logging, redaction, no body logging |
| Cross-user cache | 개인 추천이 다른 계정에 노출 | private/no-store, cache key auth scope |
| Stale trend | 지난 시즌/품절 상품 노출 | validUntil, reviewedAt, availability TTL |
| Re-identification | 작은 취향 cohort | opt-in, k threshold, rare bucket merge, contribution cap |
| Secret exposure | Naver/AWS key를 앱 bundle에 포함 | server-only secret manager, rotation |
| Scraping/quota abuse | search/season endpoint 남용 | auth where needed, rate limit, cache, quota alert |

## 11. 개인정보 사용자 권리

앱/서버는 최소한 다음을 지원해야 한다.

- 저장 AR 룩 열람·삭제
- 좋아요 열람·취소
- 행동 개인화/코호트 동의 상태 확인·철회
- 계정 삭제 시 관련 데이터 삭제 흐름
- 추천 이유의 이해 가능한 설명
- 개인화 없이도 시즌·명시적 AR 룩 추천 사용
- 정정/문의 채널과 개인정보 처리방침

[개인정보보호법 제15·16조](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079387)의 처리·최소수집 원칙, [제23조](https://www.law.go.kr/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1020398539)의 민감정보, [제30조](https://www.law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900078922)의 처리방침을 법무가 실제 처리흐름에 맞춰 검토한다. 완전히 자동화된 결정이 권리·의무에 중대한 영향을 주는 기능으로 확장된다면 [제37조의2](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1029334889)도 다시 평가한다. 일반적인 화장품 추천은 보통 고위험 결정과 거리가 있지만, 가격차별·건강판단·서비스 접근 제한으로 확장되면 판단이 달라질 수 있다.

## 12. 보안·법무 승인 게이트

Production 전에 문서화된 증거가 있어야 한다.

- [ ] Naver/파트너별 API 및 콘텐츠 이용권리 확인
- [ ] 카탈로그 ingestion 관리자·감사·rollback
- [ ] like payload poisoning 수정과 기존 데이터 audit
- [ ] seller/image URL allowlist 테스트
- [ ] AR recipe privacy data-flow diagram과 삭제 테스트
- [ ] 선택 동의/철회/비개인화 fallback
- [ ] raw face/landmark/리포트가 event·LLM·로그에 없다는 검증
- [ ] 보존기간과 backup 삭제 책임자 승인
- [ ] 광고·제휴 disclosure QA
- [ ] 연예인/인플루언서 콘텐츠 권리 검토
- [ ] AURADIN/생성 결과의 AI 고지와 생성물 표시 검토
- [ ] 화장품 효능·안전성 문구 allowlist와 상품/법무 검수
- [ ] 미성년자 정책
- [ ] incident response와 API key rotation runbook
