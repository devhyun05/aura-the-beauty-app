# 룩톡 최종 디자인 스펙 (개정판)

> 멀티에이전트 디자인 프로세스 결과물 (2026-07-05)
> 3개 관점 독립 제안 → 3개 렌즈 심사 → 종합 → 적대적 검증(UX 비평 + RN 구현 가능성 검증, 이슈 26건 반영)

**종합 판단**: 총점 1위이자 product-fit 우승인 C(레시피)를 뼈대로, ios-ux 우승 A의 상태·키보드·입력 설계와 style-feasibility 우승 B의 에디토리얼 감량·토큰 규율을 결합한다. C의 최대 감점 요인(데이터 모델 팽창)은 전면 삭제한다. 본 개정판은 비평에서 확인된 자기모순·미정의 상태·기술 전제 오류를 해소한다.

## 1. 최종 컨셉

**"룩은 레시피다 — 사진이 말 걸고, 난이도·시간·제품이 따라 하게 만든다."**

1. **레시피 언어 일관**: 난이도·소요시간·제품 4그룹을 카드→상세→작성까지 동일한 아이콘+칩으로 반복. 단, 레시피 요소는 전부 **선택 입력**이며 값이 없으면 해당 UI는 **숨김**(빈 자리 미노출)이 기본 규칙 — 질문 카테고리에서도 컨셉이 깨지지 않는다(§2·§3 변형 정의 참조). API 변경은 0건(replyType/triedMeta/topReply/productCount 전부 제외). 단 하나의 예외로 **답글 좋아요 인터랙션은 API가 없어 MVP에서 display-only**로 한정한다(§3).
2. **계기판 제거**: HOT 랭크·TREND 점수·조회수·정적 배너 삭제. 반응 **인터랙션**은 좋아요·답글·저장 3개. 이 중 **카운트 노출은 좋아요·답글 2개만**이며 저장은 상태(on/off)만 표시하고 카운트는 어디에도 노출하지 않는다(counts.saves는 데이터에만 존재).
3. **상태·접근성 우선**: 스켈레톤/빈/에러+재시도/pull-to-refresh 필수. 커서 페이지네이션은 **최신 정렬 한정**(백엔드 cursor가 created_at keyset이므로). 인기(trending 점수) 정렬은 커서를 잇지 않고 **1페이지 고정(limit 상향, 예: 30)** — 점수순 복합 keyset 커서는 백엔드 후속 과제로 이관. 모든 액션은 **터치 영역 44pt 이상**(시각 크기가 작으면 hitSlop으로 확장, 예외 없음). 오버레이 텍스트는 스크림으로 대비 보증하되 **이미지 로드 실패 시 폴백 규칙 포함**(§2).

## 2. 피드 카드 최종 스펙 (위→아래)

1. **커버 4:5** (첫 요소, radius lg16): 전면 틴트 제거, 하단 45%만 스크림 그라데이션(투명→rgba(17,17,17,0.65)). 구현은 **expo-linear-gradient 신규 의존성 추가**(react-native-svg 오버레이 대안 허용, 리스트 성능 측정 후 택1). `scrim` 토큰은 단일 컬러가 아닌 **그라데이션 정의(colors+locations 페어)**로 theme에 승격.
   - **이미지 상태**: 로딩 중 `surfaceMuted` 4:5 블록(오버레이 텍스트는 로드 완료 후 표시), 로드 실패 시 surfaceMuted 배경+중앙 재시도 아이콘, 오버레이 텍스트는 **textPrimary로 폴백**(스크림 미표시). 흰 배경 위 흰 제목 금지.
2. **좌상단 카테고리 pill 1개** — xs12 Medium, 반투명 검정 위 흰색.
3. **우하단 저장 버튼** — 시각 40px 원형 흰 배경 + **hitSlop으로 터치 영역 44pt 이상 확장 명문화**. 커버 탭(상세 진입)과 겹치는 영역에서는 **저장이 우선**(저장 버튼의 확장 히트 영역 내 탭은 상세 진입을 트리거하지 않음).
4. **오버레이 하단**: 작성자(아바타 24+닉네임 sm14) + 상황태그 1개 → 제목 xl24 SemiBold 흰색 2줄 → 무드칩 최대 2개(xs12).
5. **레시피 스트립**(흰 패널 1줄): `⏱ 15분 · 난이도 쉬움` sm14 Medium textPrimary. **난이도 라벨은 코드베이스 표준인 쉬움/보통/어려움으로 통일**(하/중/상 폐기). difficulty·durationMinutes는 nullable — **둘 중 있는 값만 표시, 둘 다 null이면 스트립 줄 자체를 숨김**(기본값 날조 금지, 현행 '10분' 하드코딩 제거). **질문 카테고리 변형**: 레시피 값이 없으면 같은 자리에 `💬 답변 n개` 컨텍스트 줄로 대체해 카드 높이 리듬 유지.
6. **reaction row**: ♥ n · 💬 n 텍스트형(xs12 textSecondary, 아이콘 16px), 각 터치 영역 44pt 패딩 필수. **탭 동작 정의**: ♥=인라인 좋아요 토글(낙관적), 💬=상세 진입+composer 자동 포커스.

**제거**: HOT/TREND/조회수, reaction pill 배경 4개, 이미지 전면 틴트, 무드 3개+상황 다수 중복, RISING·EDITOR PICK·TrendPulse 배너. 헤더는 56px 타이틀 바+카테고리 탭(1줄 pill)+정렬 세그먼트만 — 첫 카드가 첫 스크린에 걸린다. **글쓰기 진입점은 기존 우하단 FAB 유지**(헤더 글쓰기 버튼 삭제분을 FAB가 승계, 체크리스트 P0에 명시). **트렌딩 탭**: 정렬 세그먼트 숨김(discovery 전용 축과 중복이므로), 빈 상태·에러 처리는 일반 카테고리와 동일, 페이지네이션은 §1 규칙(인기 정렬 취급) 적용.

## 3. 상세 화면 최종 스펙

스크롤: **캐러셀(전폭 4:5, 페이저 pill 내부 하단)** → 작성자 행(아바타 32+닉네임 sm14 SemiBold+상대시간) → 제목 xl24 Bold → 무드+상황 칩 → 본문 md16/24 → **레시피 카드** → 액션바 → 답글.

- **제스처 확정**: 캐러셀 내부는 **가로 팬 전유**(첫 장에서 우측 스와이프는 페이징 바운스, 마지막 장도 바운스). back은 **네비게이션 바 뒤로 버튼 + iOS 좌측 edge-swipe(단, 캐러셀 세로 구간에서는 edge 20pt 이내만 back에 양보)**. 기존 '뒤로 스와이프 dismiss' 문구 폐기. 캐러셀은 전폭 페이저로 전환하므로 snapToInterval 기반 activeIndex 계산 재작성 포함. 이미지 상태는 카드와 동일 규칙(로딩 surfaceMuted, 실패 시 재시도).
- **레시피 카드**: surfaceWarm 배경 radius lg16, 스와치 20px 원+그룹명 sm14 SemiBold+제품 칩(name·shade) 세로 나열, 접지 않음(제품이 핵심 콘텐츠). **빈 상태 규칙**: 제품 0개면 카드 섹션 자체를 숨김. 1개 이상이면 **입력된 그룹만 렌더**(빈 그룹 행 미노출). 작성자 본인 열람 시에만 숨김 대신 '제품을 추가하면 레시피가 완성돼요' CTA 1줄 노출. 각 그룹 우측 24px 여백 예약(추후 퍼스널컬러 배지). 본문 뒤 배치로 답글 진입 스크롤 절충.
- **Sticky composer**: 하단 고정, 내 아바타 24+placeholder "이 룩에 답글…". **구현 전제 명시(P0 공수)**: 현행 AppScreen 단일 ScrollView 구조에서 분리해 `View + FlatList(답글 렌더) + KeyboardAvoidingView + 고정 컴포저`로 화면 재구성. **키보드 설계**: 키보드 등장 시 composer가 키보드 상단에 밀착, home indicator safe area 포함, 리스트 하단 패딩=composer 높이+16(마지막 답글 가림 방지), 멀티라인은 최대 5줄(~120px)까지 확장 후 내부 스크롤. 포커스 시 위에 **유형 프롬프트 칩 3개**: `따라해봤어요` `제품 질문` `톤 추천` — **📷 이모지 제거**(답글 media MVP 제외와의 dead-end 방지). 칩 탭 시 텍스트 prefix 삽입+placeholder가 후속 안내로 전환(예: "어떻게 됐는지 후기를 들려주세요"). 모델 변경 0.
- **대댓글**: 들여쓰기 대신 부모→자식 **2px `threadLine`(=border #E6E6E6, divider는 너무 연해 기각)** 세로 커넥터+아바타 24px. "답글 달기"는 부모·자식 모두 노출되며 **자식에서 탭해도 같은 부모에 붙는 Threads식**(1단계 유지). composer에 `@닉네임에게` 배지 인라인. **답글 좋아요는 MVP에서 display-only 카운트**(viewer liked 상태 필드·답글 좋아요 API 부재 — 하트 토글 인터랙션은 community_reply_likes 테이블+엔드포인트+viewerState 추가와 함께 P2/백엔드 후속으로 이관).
- **답글 신뢰·안전(신규, UGC 필수)**: 답글 행 long-press 또는 ··· 메뉴로 **신고 / 삭제(본인 답글만)**. ReplyList에 본인 답글 식별 상태 정의. 답글 0개 빈 상태: "첫 답글을 남겨보세요" 문구+composer 포커스 유도. 답글 목록은 MVP에서 detail의 replies[] 통짜 렌더 유지(페이지네이션은 후속 명시).
- 상세의 저장 버튼은 **액션바 단일 노출**(작성자 행 우측 저장 제거 — 이중 존재 정리).
- 상태: 스켈레톤(캐러셀 블록+3줄), 에러+재시도, 답글 media는 MVP 제외.

## 4. 작성 플로우 최종 스펙

> **카테고리별 양식 규약 (v2 확정)**: 질문 = 사진+질문 내용 2섹션(레시피 필드 숨김) / 제품조합 = 제품 섹션 ② 승격·제품 2개 이상 필수 / 비포애프터 = BEFORE·AFTER 고정 2슬롯(정확히 2장), **media[0]=before(피드 커버), media[1]=after** — 백엔드 sort_order 규약과 동일. BEFORE는 최신 분석 리포트 사진 재사용 가능(원격 URI 한정, 실패 시 갤러리 폴백).

**1페이지 4섹션 유지**(CreateThreadForm 재활용률 최대, 위저드 기각) + 상단 진행 도트 4개(섹션 스크롤 연동).

① 사진 1~4장(첫 장 커버, 전 카테고리 공통 필수 — **질문 카테고리 선택 시 "참고할 사진을 올려주세요 (얼굴 전체가 아니어도 괜찮아요)" 가이드 문구** 표시)
② 룩 정보(카테고리 칩·제목 30자 카운터·본문 선택)
③ 무드/상황 각 최대 6개·**난이도·소요시간(선택 입력임을 명시, 미입력 시 카드·상세에서 숨김 — §2·§3 규칙)**
④ 제품 4그룹(선택임을 명시, "레시피 완성도" 0~4 게이지)

- 게시 버튼 위 **미충족 사유 1줄**("사진 1장 필요") + 섹션별 인라인 danger 에러(하단 에러 박스 폐기).
- **게시 진행/실패 상태(신규, P0)**: 게시 탭 → 버튼 스피너+비활성(중복 탭 방지) + 이미지 업로드 진행 표시(n/4) → 실패 시 인라인 에러+**draft 보존**+재시도 버튼. 업로드 중 이탈 시도 시 확인 다이얼로그("업로드가 진행 중이에요").
- 이탈 시 로컬 draft 자동 저장+복귀 복원 배너. **저장 인프라: @react-native-async-storage/async-storage 신규 의존성 추가 명시**(secure-store 용도 부적합).
- 게시 버튼 위 **실제 피드 카드 미리보기**(크롭/제목 잘림 사전 확인·완성 보상 — 레시피 스트립 숨김 규칙도 미리보기에 반영되어 질문 글 카드 형태를 사전 확인 가능).

## 5. 비주얼 스타일 가이드

**추가 토큰**(하드코딩 37곳 승격):
- `surfaceWarm #FBF8F6` (피드·상세 배경)
- **`communityAccent #7B3F4E` / `communityAccentSoft #F7ECEF`** (기존 profileColors.accent·feedbackColors.accent #111111과의 동명 충돌 회피를 위해 네임스페이스 접두 — 활성 칩·게이지·링크, soft는 면적 5% 이하)
- `scrim` (그라데이션 정의: transparent→rgba(17,17,17,0.65), 하단 45%)
- `threadLine` (**=border #E6E6E6**, divider #F4F4F4는 시인성 미달로 기각)
- `swatchBase #F4ECE6 / swatchEye #C9B8A8 / swatchCheek #F2C4C4 / swatchLip #C96A6A`

**규칙**: 색은 토큰 외 hex 금지. 타이포 3단 — 제목 xl24 / 본문·메타 sm14~md16 / 카운트·라벨 xs12. **letterSpacing 0.4는 typography에 `labelSpacing` 토큰 슬롯 신설 후 적용**(규칙만 있는 승격 금지). 20/13/11/22/34px 전부 토큰으로 스냅, 34px 배너 타이틀 폐기. 카드 간 20(spacing xl), 섹션 sectionGap 30, screenX 14. 그림자는 soft만, 이미지 카드는 radius로 분리.

**오프라인 규칙(신규)**: 에러 상태는 네트워크 없음("연결을 확인해주세요")과 서버 오류("잠시 후 다시 시도해주세요")를 문구·아이콘으로 구분. 오프라인 감지 시 좋아요·저장·답글 등 낙관적 액션은 **즉시 실패 토스트 1회**(연타 시 롤백 shake 반복 방지, 토스트 중복 억제).

## 6. 마이크로 인터랙션

- **좋아요**: 이미지 더블탭 지원(+VoiceOver용 명시 버튼 병행), 하트 heart색 scale 0.8→1.15→1 spring, 낙관적 업데이트 유지.
- **저장**: scale 0.9→1.08 spring+햅틱 light+"저장됨" 토스트 1.5s, 실패 롤백 시 shake 4px. **전제 명시: expo-haptics 신규 의존성+공용 Toast 컴포넌트 신설 필요**(현재 앱에 둘 다 부재).
- **답글 등록**: 등록 성공 시 신규 행 fade+8px slide-in 250ms, composer 텍스트만 클리어. **현행 createCommunityReply가 전체 detail을 반환·통째 교체(setThread)하므로, 낙관적 삽입은 응답을 replies 배열에 단건 병합하도록 서비스 조정 후 적용**(리마운트·중복 표시 방지). 조정 전에는 서버 확정 후 삽입+애니메이션으로 운영.
- **전환**: **shared element는 P2 '기술 검증 후'로 강등**(RN 0.85 신아키텍처+native-stack 7+Reanimated 4 조합에서 현재 미지원). **폴백 확정**: native-stack 기본 전환+상세 진입 시 커버와 동일 URI 캐시로 캐러셀 첫 장 즉시 표시(시각적 연속성 확보).
- **stagger fade-in**은 첫 페이지 최초 로드 1회만. **카드 마운트마다 재생되는 현행 entrance 애니메이션 제거**(FlatList 윈도잉 remount 시 재애니메이션·append 페이지 delay 적용 버그 해소, 카드당 Animated.Value+useEffect 제거).
- **로딩**: 4:5 블록+2줄 스켈레톤 3장. 개별 이미지 로딩/실패는 §2 규칙.

## 7. 구현 체크리스트

### P0 (스펙 필수·감량)

- `LookThreadCard`: HOT/TREND/조회수/pill 배경/전면 틴트 제거, 저장 우하단 40px+**hitSlop 44pt·커버 탭 대비 저장 우선**, 레시피 스트립(**null 숨김·쉬움/보통/어려움 라벨·질문 변형 '답변 n개'**), 상황태그 1개, 이미지 로딩/실패 상태, 그라데이션 스크림(**expo-linear-gradient 도입**)
- `CommunityHeader`: RISING·TrendPulse 삭제, 56px 타이틀 바로 축소, **우하단 글쓰기 FAB 유지 확인**
- `CommunityHomeScreen`: 스켈레톤·빈 상태·에러+재시도(네트워크/서버 구분)·pull-to-refresh·**커서 페이지네이션(최신 정렬 한정, 인기 정렬 1페이지 고정 limit 상향)**
- `CommunityThreadDetailScreen`: **AppScreen scroll 모드 이탈 — View+FlatList+KeyboardAvoidingView+고정 컴포저로 화면 재구성(공수 명시)**, 스켈레톤·에러+재시도, 레시피 카드 배치+**빈/부분 렌더 규칙**, 저장 액션바 단일화
- `ReplyComposer`: sticky 고정+키보드 밀착·safe area·최대 5줄, @배지 인라인 대댓글, 유형 프롬프트 칩(**📷 제거, prefix 후 placeholder 안내**)
- `ReplyList`: **답글 long-press/··· 신고·본인 삭제**, 답글 0개 빈 상태
- `CreateThreadForm`: 인라인 에러+버튼 위 사유 1줄, draft 자동 저장(**AsyncStorage 도입**), **게시 중 스피너·중복 탭 방지·업로드 진행 n/4·실패 시 에러+draft 보존+재시도·이탈 확인**

### P1 (품질)

- `ReplyList`: 세로 커넥터(**threadLine=border**) 대댓글, 좋아요 **display-only 카운트**, Threads식 답글 달기
- `ProductUsageSection`: 스와치 토큰화, AI 배지 여백 예약, 작성자 본인 CTA
- `ThreadActionBar`: 공유/신고 포함 재정리
- theme tokens: **communityAccent 네임스페이스·scrim 그라데이션 정의·labelSpacing 슬롯** 신설+오프토큰 hex/px 일괄 치환
- `ThreadImageCarousel`: **전폭 페이저 전환+activeIndex 재계산, 가로 팬 전유·edge-swipe 규칙**, 더블탭 좋아요, 이미지 실패 상태
- 작성 미리보기 카드, 햅틱+공용 토스트(**expo-haptics 도입**), 답글 낙관적 삽입(서비스 단건 병합 조정)

### P2 (향후)

- shared element 전환(**기술 검증 후**, 폴백은 URI 캐시 연속성), `CommunityCategoryTabs` 1줄 pill 간소화, `LookMoodChips` 2개 제한, 진행 도트, VoiceOver 라벨·Dynamic Type 점검
- **백엔드 후속**: 인기 정렬 복합 keyset 커서(score,created_at,id), **답글 좋아요 인터랙션**(community_reply_likes 테이블+POST/DELETE /community/replies/{id}/like+CommunityReply.viewerState), 답글 페이지네이션
