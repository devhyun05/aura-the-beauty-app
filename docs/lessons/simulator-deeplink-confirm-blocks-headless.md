# simctl openurl 커스텀 스킴은 시스템 확인 다이얼로그를 띄운다 — 헤드리스 데모는 env 드라이브로

`xcrun simctl openurl booted "aiarmakeup://…"`는 iOS가 "'AURA'에서 열겠습니까?" 확인을 띄우고,
호출할 때마다 알림이 큐잉된다(시뮬레이터 재부팅으로만 제거). 접근성 권한 없는 환경(osascript
-25211, brew CLT 구식으로 idb 설치 불가)에서는 이 버튼을 누를 방법이 없다.

해결: `EXPO_PUBLIC_AURADIN_DEMO_DRIVE=<질의>` 플래그(기본 미설정) — AuradinSearch에서 시작해
검색→discovery 상세→다이얼→anchor 상세를 **탭과 동일한 핸들러**(submit/openDetail/refine)로
타임라인 구동. `.env` 수정 후 앱 terminate+launch만 하면 Metro가 env를 다시 인라인한다.
스크린샷은 `xcrun simctl io booted screenshot`(권한 불필요)로.
