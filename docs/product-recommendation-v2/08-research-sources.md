# 08. 조사 출처

확인일: 2026-07-12. 외부 API·약관·법령은 변경될 수 있으므로 구현·출시 직전에 다시 확인한다.

## Naver

1. [Naver Developers 쇼핑·책·전문자료 검색 API 종료 안내](https://developers.naver.com/notice/article/32564)  
   쇼핑 검색 API 종료일 2026-07-31의 1차 근거.

2. [Naver Developers API HUB 전환 안내](https://developers.naver.com/notice/article/32530)  
   검색, 검색어트렌드, 쇼핑인사이트 등의 API HUB 전환 일정과 기존 애플리케이션 지원 일정을 구분할 때 사용.

3. [Naver API HUB 개요](https://api.ncloud-docs.com/docs/naver-api-hub-overview)  
   API HUB 제품·인증 구조 확인.

4. [Naver API HUB 사용](https://guide.ncloud-docs.com/docs/apihub-use)  
   애플리케이션 등록과 API 사용 절차 확인.

5. [Naver API HUB 쇼핑인사이트 분야 내 검색어 트렌드](https://api.ncloud-docs.com/docs/naver-api-hub-shopping-insight-keywords)  
   시즌 keyword trend 요청/응답 계약 확인.

6. [Naver Developers DataLab 쇼핑인사이트 문서](https://developers.naver.com/docs/serviceapi/datalab/shopping/shopping.md)  
   기간, 요청 제한, 상대적 `ratio` 해석 확인. API HUB 적용 시 최신 문서를 우선한다.

7. [Naver Developers 쇼핑 검색 API 문서](https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md)  
   기존 상품 검색이 text `query` 기반이며 color vector/shade 측정 계약이 아님을 확인. 종료 일정은 별도 공지를 우선한다.

8. [Naver Developers API 이용약관](https://developers.naver.com/products/terms/)  
   검색결과 저장·가공, 결과 표시, 권리, API 이용 제한 검토. 실제 사용 방식은 서면 승인을 받아야 한다.

## 개인정보·생체정보

1. [개인정보보호법 제15·16조 연결정보](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079387)  
   개인정보 처리 근거와 최소수집 원칙 검토.

2. [개인정보보호법 제23조](https://www.law.go.kr/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1020398539)  
   민감정보 처리 검토.

3. [개인정보보호법 시행령 생체인식정보 관련 연결정보](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=67045)  
   고유 식별 목적 생체인식정보의 범위 검토.

4. [개인정보보호법 제30조](https://www.law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900078922)  
   개인정보 처리방침 관련 검토.

5. [개인정보보호법 제37조의2](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1029334889)  
   자동화된 결정 관련 권리. 본 기능이 가격차별·건강판단 등 중대한 결정으로 확장될 때 재평가.

6. [개인정보보호위원회 생체정보 보호 가이드라인](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=&nttId=10900)  
   얼굴·생체정보 처리의 기술적·관리적 보호조치 참고.

## 광고·초상·콘텐츠 권리

1. [추천·보증 등에 관한 표시·광고 심사지침](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000280130&chrClsCd=010201)  
   광고·협찬·경제적 이해관계 표시 검토.

2. [표시·광고의 공정화에 관한 법률](https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=&joNo=&languageType=KO&lsNm=%ED%91%9C%EC%8B%9C%E3%86%8D%EA%B4%91%EA%B3%A0%EC%9D%98+%EA%B3%B5%EC%A0%95%ED%99%94%EC%97%90+%EA%B4%80%ED%95%9C+%EB%B2%95%EB%A5%A0&paras=1)  
   거짓·과장·기만적 표시와 광고 전반 검토.

3. [대법원 판례 검색 — 성명·초상과 상업적 이용 쟁점](https://www.law.go.kr/LSW/precInfoP.do?precSeq=146849)  
   연예인 이름·사진·퍼블리시티 관련 법무 검토의 출발점. 개별 캠페인은 별도 권리 확인 필요.

## AWS Bedrock

1. [Amazon Bedrock Data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)  
   암호화, 민감정보 입력 주의, 데이터 보호 설정 검토.

2. [Amazon Bedrock Amazon models privacy](https://aws.amazon.com/bedrock/amazon-models/privacy/)  
   모델 입력·출력 사용 관련 공급자 설명. 실제 계정·모델·region·계약 조건과 함께 확인.

## AI·화장품 표시

1. [인공지능기본법 제31조 — 인공지능 투명성 확보 의무](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0031&lsiSeq=282791&urlMode=lsScJoRltInfoR)  
   2026-01-22 시행. 생성형 AI 기반 서비스의 사전 고지와 생성 결과물 표시 검토.

2. [화장품법 제13조 관련 연결정보](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1025608537)  
   화장품 효능·안전성·의약품 오인 표현을 catalog/AURADIN 문구에 사용할 때 검토.

## 접근성

1. [Apple Human Interface Guidelines — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)  
   iOS touch target와 버튼 설계 참고.

2. [WCAG 2.2 — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)  
   target 크기·간격의 웹 접근성 기준 참고. React Native 앱에서는 iOS 접근성 기준과 함께 사용.

## 저장된 내부 근거

코드 감사는 다음 현재 파일을 기준으로 수행했다.

- `apps/mobile/src/app/navigation/routes/homeRoutes.tsx`
- `apps/mobile/src/app/navigation/routes/recommendationRoutes.tsx`
- `apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx`
- `apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx`
- `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`
- `apps/mobile/src/features/ar/services/fullFaceMakeupEditService.ts`
- `apps/mobile/src/app/navigation/routes/referenceMakeupExtractionRoutes.tsx`
- `services/backend/app/api/products.py`
- `services/backend/app/api/ar.py`
- `services/backend/app/api/makeup_styles.py`
- `services/backend/app/services/shopping_products.py`
- `services/backend/app/db/init_db.py`
- `services/backend/app/db/check_schema.py`
- `docs/backend/schema.sql`
- `docs/backend/aws-postgresql-schema.dbml`

제품 추천 관련 기존 런타임 코드는 이번 기획 산출물에서 수정하지 않았다.
