# AURA Mobile QA Test Cases

작성일: 2026-07-08
대상 앱: AI AR Makeup Guide / AURA mobile app
대상 플랫폼: iOS real device 우선, simulator 보조

## 목적

이 문서는 앱 전체 QA를 위한 테스트 케이스 목록이다. 핵심 목표는 다음이다.

- 앱 설치 후 주요 플로우가 크래시 없이 동작하는지 확인한다.
- 로그인, 권한, 앨범, 카메라, Unity AR, MediaPipe 연동처럼 네이티브 의존성이 큰 기능을 우선 검증한다.
- 회귀가 자주 발생한 missing native module, OAuth, 앨범 중복 열림, AR 진입 문제를 P0로 관리한다.
- 수동 QA와 자동화 테스트 범위를 분리해 팀원이 같은 기준으로 테스트할 수 있게 한다.

## 우선순위

| 우선순위 | 의미 | 예시 |
|---|---|---|
| P0 | 앱 사용을 막는 치명 이슈 | 앱 실행 불가, 로그인 불가, 앨범/카메라 불가, AR 크래시 |
| P1 | 주요 사용자 경험 이슈 | 홈 배너, 보고서 하단바, 추천 결과, 저장/불러오기 |
| P2 | 엣지 케이스 또는 보조 기능 | 빈 상태, 긴 텍스트, 재시도, UI polish |

## 테스트 유형

| 유형 | 설명 |
|---|---|
| Unit | 순수 로직, 계산식, reducer, option rule 테스트 |
| Integration | 화면/서비스/라우팅/API mock을 함께 검증 |
| Device Manual | 실제 iPhone에서 권한, 카메라, 앨범, Unity, OAuth 검증 |
| Smoke | 배포/merge 전 P0만 빠르게 확인 |
| Regression | 이전에 발생한 오류가 재발하지 않는지 확인 |

## 공통 테스트 환경

| 항목 | 기준 |
|---|---|
| 기기 | 실제 iPhone 1대 이상 |
| OS | 최신 사용 가능 iOS + 팀 테스트 기기 OS |
| 네트워크 | 정상 Wi-Fi, 네트워크 차단/불안정 상태 각각 1회 |
| 계정 | Google 로그인 가능한 테스트 계정 |
| 권한 초기화 | 앱 삭제 후 재설치로 사진/카메라 권한 초기화 |
| 테스트 이미지 | 얼굴 정면 사진, 어두운 사진, 얼굴 없는 사진, 여러 얼굴 사진 |
| AR 데이터 | 저장된 메이크업 룩 1개 이상 |

## Merge 전 P0 Smoke Checklist

| 체크 | 항목 | 기대결과 |
|---|---|---|
| [ ] | 앱 설치 후 첫 실행 | 크래시 없이 앱이 실행된다 |
| [ ] | Missing native module 확인 | ExpoImage, ExpoWebBrowser, ExpoSecureStore 등 오류가 없다 |
| [ ] | Google 로그인 | unsupported_code_challenge_method 없이 로그인된다 |
| [ ] | 홈 화면 | 홈이 정상 렌더링되고 히어로 배너가 약 2.5초마다 전환된다 |
| [ ] | 앨범 열기 | 메이크업 추출에서 앨범이 한 번만 열린다 |
| [ ] | 카메라 권한 | 권한 허용 후 촬영 화면이 열린다 |
| [ ] | 얼굴 촬영 | 얼굴 가이드 통과 후 사진을 촬영할 수 있다 |
| [ ] | 보고서 상세 | 보고서 결과 페이지에 진입하고 하단바/퀵액션이 보인다 |
| [ ] | AR 진입 | Unity AR 화면이 열리고 앱이 죽지 않는다 |
| [ ] | AR 필터 적용 | 립/치크/베이스 중 최소 1개가 적용된다 |
| [ ] | 반반 메이크업 | 좌/우 비교 모드가 의도한 반쪽에만 적용된다 |
| [ ] | 앱 재실행 | 로그인/저장 상태가 유지된다 |

## 앱 공통

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| APP-001 | P0 | 앱 최초 실행 | 앱 신규 설치 | 앱을 실행한다 | 스플래시 후 홈 또는 로그인 화면이 표시된다 | Smoke |
| APP-002 | P0 | 앱 재실행 안정성 | 앱 실행 이력 있음 | 앱을 종료 후 다시 실행한다 | 크래시 없이 이전 세션 상태로 진입한다 | Smoke |
| APP-003 | P0 | missing native module 회귀 | Debug/Release 앱 설치 | 앱 주요 탭을 순회한다 | ExpoImage, ExpoWebBrowser, ExpoSecureStore 등 missing native module 오류가 없다 | Regression |
| APP-004 | P1 | 네트워크 오류 표시 | 네트워크 비활성화 | API가 필요한 화면에 진입한다 | 앱이 죽지 않고 오류/재시도 UI가 표시된다 | Device Manual |
| APP-005 | P1 | 백그라운드 복귀 | 앱 실행 중 | 홈 버튼/앱 전환 후 복귀한다 | 화면 상태가 유지되고 새 크래시가 없다 | Device Manual |
| APP-006 | P2 | 빈 데이터 상태 | 저장 데이터 없음 | 저장 목록/보고서 목록에 진입한다 | 빈 상태 문구와 다음 행동이 표시된다 | Integration |

## 인증

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| AUTH-001 | P0 | Google 로그인 성공 | 로그아웃 상태 | Google 로그인 버튼을 누르고 인증을 완료한다 | 로그인 성공 후 앱으로 복귀한다 | Device Manual |
| AUTH-002 | P0 | PKCE S256 검증 | 로그아웃 상태 | Google 로그인 플로우를 실행한다 | unsupported_code_challenge_method 오류가 발생하지 않는다 | Regression |
| AUTH-003 | P1 | 로그인 취소 | 로그아웃 상태 | Google 로그인 화면에서 취소한다 | 앱으로 복귀하고 로그아웃 상태가 유지된다 | Device Manual |
| AUTH-004 | P0 | 토큰 저장/복원 | 로그인 완료 | 앱을 완전히 종료 후 재실행한다 | 재로그인 없이 로그인 상태가 유지된다 | Smoke |
| AUTH-005 | P1 | SecureStore fallback | SecureStore 사용 불가 빌드 | 로그인 후 앱 재실행 | local fallback 저장소로 세션이 복원된다 | Regression |
| AUTH-006 | P1 | 프로필 미완료 분기 | 신규 계정 | 로그인 후 프로필 입력 전 상태 확인 | 프로필 설정 화면으로 이동한다 | Integration |

## 홈

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| HOME-001 | P0 | 홈 렌더링 | 앱 실행 | 홈 화면에 진입한다 | 주요 섹션과 네비게이션이 표시된다 | Smoke |
| HOME-002 | P1 | 히어로 배너 자동 전환 | 홈 화면 | 6초 이상 대기한다 | 배너가 약 2.5초마다 다음 항목으로 넘어간다 | Regression |
| HOME-003 | P1 | 히어로 수동 스와이프 | 홈 화면 | 히어로 배너를 좌우로 스와이프한다 | 수동 이동 후에도 자동 전환이 이어진다 | Device Manual |
| HOME-004 | P1 | 주요 CTA 라우팅 | 홈 화면 | 얼굴 분석/AR/추천/저장 버튼을 누른다 | 각각 올바른 화면으로 이동한다 | Integration |
| HOME-005 | P2 | 홈 데이터 없음 | 저장 데이터 없음 | 홈 화면을 확인한다 | 깨진 이미지나 빈 레이아웃 없이 표시된다 | Integration |

## 권한

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| PERM-001 | P0 | 사진 권한 허용 | 신규 설치 | 메이크업 추출에서 앨범 열기를 누르고 권한을 허용한다 | 앨범 선택 화면이 열린다 | Device Manual |
| PERM-002 | P0 | 사진 권한 거부 | 신규 설치 | 사진 권한 요청에서 거부한다 | 앱이 죽지 않고 권한 안내/설정 이동이 표시된다 | Device Manual |
| PERM-003 | P0 | 카메라 권한 허용 | 신규 설치 | 얼굴 촬영/AR에서 카메라 권한을 허용한다 | 카메라 프리뷰가 표시된다 | Device Manual |
| PERM-004 | P0 | 카메라 권한 거부 | 신규 설치 | 카메라 권한 요청에서 거부한다 | 권한 안내 UI가 표시되고 앱이 유지된다 | Device Manual |
| PERM-005 | P1 | 권한 재허용 | 권한 거부 상태 | iOS 설정에서 권한을 허용하고 앱으로 복귀한다 | 해당 기능을 다시 사용할 수 있다 | Device Manual |

## 얼굴 촬영

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| FACE-CAP-001 | P0 | 촬영 화면 진입 | 카메라 권한 허용 | 얼굴 촬영 화면에 진입한다 | 프리뷰와 얼굴 가이드가 표시된다 | Smoke |
| FACE-CAP-002 | P0 | 정면 얼굴 가이드 통과 | 밝은 환경 | 얼굴을 가이드 중앙에 맞춘다 | 촬영 가능 상태가 된다 | Device Manual |
| FACE-CAP-003 | P1 | 얼굴 없음 | 카메라 화면 | 얼굴을 화면 밖으로 이동한다 | 촬영 제한 또는 안내 문구가 표시된다 | Device Manual |
| FACE-CAP-004 | P1 | 어두운 환경 | 조도 낮음 | 촬영 화면에 진입한다 | 밝기 부족 안내 또는 품질 제한이 동작한다 | Device Manual |
| FACE-CAP-005 | P1 | 흔들림/각도 불량 | 얼굴 촬영 | 얼굴을 크게 기울인다 | 가이드 실패 상태가 표시된다 | Device Manual |
| FACE-CAP-006 | P0 | 촬영 후 확인 화면 | 촬영 가능 상태 | 촬영 버튼을 누른다 | 확인 화면으로 이동하고 이미지가 표시된다 | Smoke |
| FACE-CAP-007 | P1 | 재촬영 | 확인 화면 | 재촬영 버튼을 누른다 | 촬영 화면으로 돌아간다 | Integration |

## 얼굴 분석/보고서

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| REPORT-001 | P0 | 분석 로딩 진입 | 촬영 완료 | 분석 시작 | 로딩 화면이 표시되고 앱이 유지된다 | Smoke |
| REPORT-002 | P1 | 분석 성공 | 정상 이미지/API mock | 분석 완료까지 대기한다 | 보고서 상세로 이동한다 | Integration |
| REPORT-003 | P1 | 분석 실패 | API 실패 mock | 분석 시작 | 실패 안내와 재시도 동선이 표시된다 | Integration |
| REPORT-004 | P0 | 보고서 상세 렌더링 | 보고서 데이터 존재 | 보고서 상세에 진입한다 | 주요 지표/카드가 표시된다 | Smoke |
| REPORT-005 | P1 | 보고서 하단바 | 보고서 상세 | 화면 하단을 확인한다 | 하단바가 표시되고 콘텐츠를 가리지 않는다 | Regression |
| REPORT-006 | P1 | 보고서 퀵액션 | 보고서 상세 | 퀵액션을 각각 누른다 | 연결된 기능으로 이동하거나 sheet가 열린다 | Regression |
| REPORT-007 | P2 | 보고서 목록 빈 상태 | 보고서 없음 | 보고서 목록 진입 | 빈 상태와 시작 CTA가 표시된다 | Integration |

## 퍼스널 컬러

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| PC-001 | P1 | 동의 화면 | 신규 사용자 | 퍼스널 컬러 진입 | 동의 화면이 표시된다 | Integration |
| PC-002 | P1 | 분석 시작 | 동의 완료 | 분석 화면 진입 | 품질 가이드와 진행 UI가 표시된다 | Device Manual |
| PC-003 | P1 | 네이티브 MediaPipe Pod 없음 | 현재 통합 빌드 | 퍼스널 컬러 진입 | 앱이 빌드/실행되며 기능 제한 안내 또는 fallback이 동작한다 | Regression |
| PC-004 | P2 | 조명 품질 불량 | 어두운 환경 | 분석 시도 | 품질 불량 안내가 표시된다 | Device Manual |

## 메이크업 추출

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| MAKEUP-EXT-001 | P0 | 앨범 열기 | 사진 권한 허용 | 메이크업 추출에서 앨범 열기를 누른다 | 앨범이 열린다 | Smoke |
| MAKEUP-EXT-002 | P0 | 앨범 중복 열림 방지 | 메이크업 추출 화면 | 화면 진입/버튼 탭 후 3초 대기 | 앨범 picker가 한 번만 열린다 | Regression |
| MAKEUP-EXT-003 | P0 | 이미지 선택 | 앨범 열림 | 얼굴 사진을 선택한다 | 선택 이미지가 화면에 표시된다 | Smoke |
| MAKEUP-EXT-004 | P1 | 이미지 선택 취소 | 앨범 열림 | 취소를 누른다 | 이전 화면으로 복귀하고 앱이 유지된다 | Device Manual |
| MAKEUP-EXT-005 | P1 | 추출 성공 | 정상 얼굴 이미지 | 추출을 시작한다 | 추출 결과 화면으로 이동한다 | Integration |
| MAKEUP-EXT-006 | P1 | 추출 실패 | 얼굴 없는 이미지/API 실패 | 추출을 시작한다 | 실패 안내와 재시도 동선이 표시된다 | Integration |
| MAKEUP-EXT-007 | P1 | 룩 저장 | 추출 결과 존재 | 저장 버튼을 누른다 | 저장 완료 화면 또는 저장 목록에 반영된다 | Integration |

## 메이크업 피드백

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| FEEDBACK-001 | P1 | 앨범 업로드 | 사진 권한 허용 | 피드백에서 앨범 사진 선택 | 이미지가 선택되고 분석 시작 가능하다 | Device Manual |
| FEEDBACK-002 | P1 | 앨범 중복 열림 방지 | 피드백 업로드 화면 | 화면 진입/버튼 탭 후 대기 | picker가 한 번만 열린다 | Regression |
| FEEDBACK-003 | P1 | 목표 입력 검증 | 피드백 입력 화면 | 의미 없는 문자열 입력 | 유효성 안내가 표시된다 | Unit |
| FEEDBACK-004 | P1 | 피드백 결과 | 정상 입력/API mock | 분석 완료 | 결과와 교정 가이드가 표시된다 | Integration |

## AR / Unity

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| AR-001 | P0 | AR 화면 진입 | 카메라 권한 허용 | AR 메뉴를 연다 | Unity 화면이 열리고 앱이 죽지 않는다 | Smoke |
| AR-002 | P0 | Unity bridge 초기화 | AR 화면 | 화면 진입 후 5초 대기 | JS/Unity bridge 오류 없이 유지된다 | Regression |
| AR-003 | P0 | 립 필터 적용 | AR 화면 | 립 옵션을 선택한다 | 입술 영역에 색상이 적용된다 | Device Manual |
| AR-004 | P1 | 치크 필터 적용 | AR 화면 | 치크 옵션을 선택한다 | 볼 영역에 색상이 적용된다 | Device Manual |
| AR-005 | P1 | 베이스 필터 적용 | AR 화면 | 베이스 옵션을 선택한다 | 피부 베이스 효과가 적용된다 | Device Manual |
| AR-006 | P0 | 반반 좌측 모드 | AR 화면 | 반반 비교 좌측 적용 | 얼굴 UV 기준 한쪽에만 효과가 적용된다 | Device Manual |
| AR-007 | P0 | 반반 우측 모드 | AR 화면 | 반반 비교 우측 적용 | 반대쪽에만 효과가 적용된다 | Device Manual |
| AR-008 | P1 | 저장된 룩 적용 | 저장 룩 존재 | 저장 룩을 AR에 적용한다 | 선택 룩의 색상/옵션이 반영된다 | Integration |
| AR-009 | P1 | AR 캡처 | AR 화면 | 캡처 버튼을 누른다 | 캡처 이미지 저장/공유 플로우가 동작한다 | Device Manual |
| AR-010 | P0 | MediaPipe 중복 크래시 회귀 | homuler 통합 빌드 | AR 진입 후 필터 적용 | 중복 MediaPipe 로딩 크래시가 발생하지 않는다 | Regression |
| AR-011 | P1 | 백그라운드 복귀 | AR 화면 | 앱 전환 후 복귀한다 | Unity 화면 또는 복구 UI가 정상 표시된다 | Device Manual |

## 추천 / Auradin

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| REC-001 | P1 | 추천 홈 진입 | 로그인 상태 | 추천 화면 진입 | 질문/검색 시작 UI가 표시된다 | Integration |
| REC-002 | P1 | 질문 플로우 | 추천 홈 | 질문에 답변한다 | 다음 질문 또는 검색 상태로 이동한다 | Integration |
| REC-003 | P1 | 상품 검색 성공 | 네트워크 정상 | 검색어 입력 후 제출 | 결과 목록이 표시된다 | Integration |
| REC-004 | P1 | 상품 상세 | 결과 존재 | 상품을 선택한다 | 상세 정보가 표시된다 | Integration |
| REC-005 | P1 | 좋아요/저장 | 결과 존재 | 상품 저장 버튼을 누른다 | 좋아요 목록에 반영된다 | Integration |
| REC-006 | P2 | 검색 결과 없음 | 결과 없는 검색어 | 검색 제출 | 빈 결과 UI가 표시된다 | Integration |
| REC-007 | P1 | API 실패 | API 실패 mock | 검색 제출 | 오류 UI와 재시도 버튼이 표시된다 | Integration |

## 커뮤니티

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| COMM-001 | P1 | 커뮤니티 홈 | 로그인 상태 | 커뮤니티 탭 진입 | 게시글 목록 또는 빈 상태가 표시된다 | Integration |
| COMM-002 | P1 | 게시글 검색 | 게시글 존재 | 검색어 입력 | 관련 게시글이 필터링된다 | Integration |
| COMM-003 | P1 | 게시글 작성 | 로그인 상태 | 글 작성 후 제출 | 작성 성공 후 목록/상세로 이동한다 | Integration |
| COMM-004 | P1 | 이미지 첨부 | 사진 권한 허용 | 글 작성 중 이미지 선택 | 이미지가 첨부된다 | Device Manual |
| COMM-005 | P1 | 게시글 상세 | 게시글 존재 | 게시글 선택 | 상세 내용과 댓글 영역이 표시된다 | Integration |
| COMM-006 | P2 | 신고/매칭 정보 | 보고서 데이터 존재 | 관련 기능 진입 | 매칭/신고 UI가 정상 동작한다 | Integration |

## 상담

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| CONSULT-001 | P1 | 상담 홈 | 로그인 상태 | 상담 탭 진입 | 전문가/예약 진입점이 표시된다 | Integration |
| CONSULT-002 | P1 | 전문가 목록 | 상담 홈 | 전문가 목록 열기 | 전문가 카드가 표시된다 | Integration |
| CONSULT-003 | P1 | 예약 플로우 | 전문가 선택 | 날짜/시간 선택 | 결제 또는 예약 확인으로 이동한다 | Integration |
| CONSULT-004 | P2 | 리뷰 작성 | 상담 이력 존재 | 리뷰 작성 제출 | 리뷰 완료 상태가 표시된다 | Integration |
| CONSULT-005 | P2 | 상담 대화 이미지 첨부 | 사진 권한 허용 | 대화에서 이미지 선택 | 이미지가 첨부된다 | Device Manual |

## 프로필 / 설정

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| PROFILE-001 | P1 | 프로필 조회 | 로그인 상태 | 프로필 화면 진입 | 사용자 정보가 표시된다 | Integration |
| PROFILE-002 | P1 | 프로필 편집 | 로그인 상태 | 이름/전화/생년월일 수정 | 유효성 검증 후 저장된다 | Integration |
| PROFILE-003 | P1 | 프로필 이미지 변경 | 사진 권한 허용 | 앨범에서 이미지 선택 | 프로필 이미지가 갱신된다 | Device Manual |
| PROFILE-004 | P1 | 로그아웃 | 로그인 상태 | 로그아웃 실행 | 로그인 화면 또는 비로그인 상태로 이동한다 | Smoke |

## 네이티브/빌드 회귀

| ID | 우선순위 | 테스트 케이스 | 사전조건 | 절차 | 기대결과 | 유형 |
|---|---|---|---|---|---|---|
| NATIVE-001 | P0 | iOS Pod 설치 | clean checkout | `npm run pods` 또는 pod install 실행 | Pod 설치가 성공한다 | Regression |
| NATIVE-002 | P0 | MediaPipeTasksVision 제거 | iOS project | Podfile/Podfile.lock 확인 | MediaPipeTasksVision Pod가 포함되지 않는다 | Regression |
| NATIVE-003 | P0 | homuler MediaPipe 패키지 준비 | Unity build 전 | `Packages/local` tgz 존재 확인 | `com.github.homuler.mediapipe-0.16.3.tgz`가 준비된다 | Regression |
| NATIVE-004 | P0 | UnityFramework 빌드 | Unity 환경 준비 | Unity iOS export/build 실행 | MediaPipeUnity.framework가 생성된다 | Regression |
| NATIVE-005 | P0 | 실제 기기 설치 | iPhone 연결 | Debug app 설치/실행 | 설치 성공 후 프로세스가 유지된다 | Smoke |
| NATIVE-006 | P0 | native module import | 설치 앱 실행 | 주요 화면 순회 | 네이티브 모듈 not found 오류가 없다 | Regression |

## 자동화 권장 범위

현재 코드베이스에는 TypeScript typecheck와 다수의 `.test.ts/.test.tsx`가 있다. 자동화는 다음 우선순위로 보강한다.

| 영역 | 권장 자동화 | 이유 |
|---|---|---|
| 인증 PKCE | Unit | S256 code challenge 회귀 방지 |
| 홈 배너 | Component/Unit | 2.5초 interval과 cleanup 검증 |
| 앨범 picker | Component/Integration | picker 중복 호출 회귀 방지 |
| AR option rules | Unit | 룩 선택/수정/반반 모드 상태 회귀 방지 |
| Unity bridge payload | Contract | JS에서 Unity로 보내는 메시지 구조 보장 |
| 보고서 route/quick action | Integration | 하단바와 액션 이동 회귀 방지 |
| SecureStore fallback | Unit | 네이티브 모듈 부재 환경에서 세션 저장 보장 |
| 얼굴 비율/퍼스널 컬러 계산 | Unit | 계산 로직 회귀 방지 |

## 기본 검증 명령

```bash
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run test:unity-bridge
npm --prefix apps/mobile run test:generated-brow
npm --prefix apps/mobile run test:personal-color
npm --prefix apps/mobile run test:face-ratio-distortion
git diff --check
```

## QA 결과 기록 양식

| 테스트 일시 | 빌드/브랜치 | 기기/OS | tester | 결과 요약 |
|---|---|---|---|---|
|  |  |  |  |  |

| ID | 결과 | 실제 결과 | 이슈 링크/메모 |
|---|---|---|---|
| APP-001 | PASS / FAIL / BLOCKED |  |  |
| AUTH-001 | PASS / FAIL / BLOCKED |  |  |
| MAKEUP-EXT-002 | PASS / FAIL / BLOCKED |  |  |
| AR-010 | PASS / FAIL / BLOCKED |  |  |

## 완료 기준

Merge 전 최소 기준:

- P0 테스트가 모두 PASS
- P1 실패가 있으면 우회 방법 또는 후속 이슈가 명확함
- iPhone 실제 기기에서 앱 설치/실행/로그인/앨범/카메라/AR가 확인됨
- missing native module 오류가 없음
- MediaPipe 관련 중복 로딩 크래시가 없음
- fresh build 환경에서 homuler MediaPipe 패키지 준비 방법이 문서화되어 있음
