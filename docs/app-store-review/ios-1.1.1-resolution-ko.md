# AURA iOS 1.1.0 새 빌드 App Review 거절 대응안

정책 확인일: 2026-07-23
대상 제출: iOS 1.1.0 (6), Submission ID `e17aa627-20f8-4853-822e-728345639179`
제출 EAS 빌드: `20ced476-d7f9-46c9-a5fb-bc2d0c8fd2be`
앱 Bundle ID: `com.aurastyleguide.mobile`
Apple Team ID: `BRA7W3G4QS`

## 상태 표기

- `구현됨(검증 필요)`: 현재 작업트리에 코드가 있으나 Release/TestFlight·실서버 검증과 커밋이 아직 필요함
- `필요`: Apple Developer, AWS Cognito, App Store Connect, 운영 배포 등 외부 수동 조치가 아직 필요함
- `확인 필요`: 코드만으로 실제 운영 계정·보관 정책을 확정할 수 없음

## 재제출 결론

현재 상태는 **바로 재제출하면 안 됨**이다. 아래 네 항목을 모두 끝내고 새 Release/TestFlight
빌드에서 확인한 뒤 재제출해야 한다.

1. TrueDepth·얼굴 데이터 처리 내용을 개인정보처리방침과 App Review 답변에 구체적으로 명시
2. Apple 로그인 실기기 오류 해결 및 신규 설치·기존 버전 위 업데이트 설치 모두 검증
3. 13인치 iPad 로그인 화면 스크린샷을 실제 핵심 기능 화면으로 교체
4. 외부 AI 전송 전 명시적 동의와 서버 측 강제 차단을 실제 운영 환경에 배포

승인은 보장할 수 없으며, 아래 조치는 이번 거절 사유를 직접 해소하기 위한 최소 범위이다.

---

## 1. Guideline 2.1 — TrueDepth 정보 추가 제출

### Apple이 요구한 내용

Apple은 TrueDepth API를 통해 수집하는 정보, 목적, 공유 대상, 저장 위치, 보유·삭제 방식과
이를 설명하는 개인정보처리방침의 정확한 위치 및 문구를 요구했다.

### 현재 코드에서 확인된 처리 범위

- 지원 기기에서 ARKit 얼굴 추적과 TrueDepth 하드웨어를 이용한다.
- 촬영 중 전면 카메라 RGB 프레임과 ARKit 얼굴 메시를 기기 메모리에서 처리한다.
- 원시 depth-map 바이트 및 매 프레임의 원시 얼굴 메시 전체를 서버 요청 데이터로
  직렬화하는 경로는 확인되지 않았다.
- 서버에는 사용자가 분석을 실행한 경우 다음 정보가 전송될 수 있다.
  - 보고서 생성용 RGB 얼굴 사진
  - 얼굴 비율, 코·턱·광대 돌출도, 입술과 E-line 거리 등의 정규화된 파생 측정값
  - 측정 신뢰도, 유효 프레임 수 및 TrueDepth 사용 가능 여부와 같은 센서 출처 정보
- 얼굴 인증, 신원 확인, 사용자 추적, 광고를 위한 사용은 제품 목적이 아니다.
- 파생 측정값 일부와 RGB 얼굴 사진은 보고서 및 추천 생성을 위해 백엔드와 외부 AI
  처리 경로에서 사용될 수 있다.

> 주의: “모든 얼굴 데이터가 기기 안에서만 처리된다” 또는 “제3자에게 전송하지 않는다”라고
> 답하면 현재 클라우드 분석 구조와 모순된다.

### 앱·서버 수정 상태

- `구현됨(검증 필요)` 앱 내 개인정보처리방침에 별도 `TrueDepth 및 얼굴 정보 처리`
  항목이 추가되어 있다.
- `구현됨(검증 필요)` 원시 depth-map과 원시 메시 프레임, 서버 전송 가능한 RGB 사진 및
  파생값을 구분해 설명한다.
- `구현됨(검증 필요)` 설정 화면에서 외부 AI 동의 확인·철회 경로를 제공한다.
- `확인 필요` 보고서 삭제와 회원 탈퇴가 운영 DB, 객체 저장소, 백업에 적용되는 실제
  기간과 범위를 운영 정책과 일치시켜야 한다.

### 외부 수동 조치

- `필요` 앱 안의 개인정보처리방침과 App Store Connect에 등록된 공개 개인정보처리방침
  URL의 내용을 동일하게 갱신
- `필요` 운영팀이 아래 항목을 확정
  - 계정 유지 중 사진·보고서·파생값의 실제 보유 기간
  - 보고서 삭제 및 회원 탈퇴 후 운영 저장소 삭제 완료 기한
  - 백업 격리 보관 기간
  - AWS·OpenAI 처리 데이터의 계약상 보관·재사용 설정
- `필요` App Review 답변에는 공개된 방침의 정확한 절 번호와 **실제 공개 문구 그대로**
  인용

### App Review 답변 초안

아래 답변은 공개 개인정보처리방침과 운영 정책을 최종 확인한 후 전송해야 한다.
대괄호 부분은 실제 값으로 교체한다.

```text
안녕하세요. TrueDepth API 및 얼굴 데이터 처리 방식을 아래와 같이 설명드립니다.

1. 수집·처리하는 정보
AURA는 지원되는 iPhone에서 얼굴 분석 및 AR 정렬을 위해 전면 카메라 RGB 프레임과
ARKit 얼굴 메시의 3차원 꼭짓점, 2차원 투영점 및 삼각형 연결 정보를 촬영 중 기기
메모리에서 처리합니다. 원시 TrueDepth depth-map 바이트와 매 프레임의 원시 얼굴
메시 전체는 파일로 저장하거나 서버로 업로드하지 않습니다.

사용자가 얼굴 분석을 실행한 경우 보고서용 RGB 얼굴 사진과 코·턱·광대 돌출도,
입술과 E-line 거리, 얼굴 비율, 측정 신뢰도·유효 프레임 수 등 계산된 파생값이
서버로 전송·저장될 수 있습니다.

2. 이용 목적
이 정보는 얼굴형·비율·색상 분석, 맞춤 보고서·메이크업 추천 생성, AR 메이크업 위치
정렬에만 사용합니다. 얼굴 인증, 신원 확인, 사용자 추적 또는 광고 목적으로
사용하지 않습니다.

3. 공유·저장
앱 서버, 데이터베이스 및 객체 저장소는 Amazon Web Services에서 운영합니다.
사용자가 별도 외부 AI 처리 동의 화면에서 명시적으로 동의한 경우에만 RGB 얼굴
사진과 필요한 파생 분석값이 Amazon Bedrock(Anthropic Claude) 및 OpenAI에
보고서·추천·이미지 생성을 위해 전달될 수 있습니다. 원시 depth-map과 원시 얼굴
메시 프레임은 외부 AI 제공업체에 전달하지 않습니다.

4. 보유·삭제
원시 depth-map과 원시 얼굴 메시 프레임은 측정 또는 화면 종료 시 메모리에서
해제됩니다. 서버에 저장된 사진·보고서·파생값은 [확정된 보유 기간] 동안 보관되며,
이용자가 보고서 삭제 또는 회원 탈퇴를 요청하면 [확정된 삭제 완료 기한] 안에
삭제됩니다. 백업은 [확정된 백업 보관 기간] 동안 격리 보관 후 삭제됩니다.
외부 AI 동의는 앱의 프로필 > 설정 > AI 데이터 관리에서 철회할 수 있으며,
철회 이후 새로운 외부 AI 전송은 중단됩니다.

5. 개인정보처리방침 위치
앱 내: 로그인 화면 및 프로필 > 설정 > 개인정보처리방침
공개 URL: [App Store Connect에 등록한 실제 URL]
관련 절: “2. TrueDepth 및 얼굴 정보 처리”, “3. 외부 AI 전송과 명시적 동의”,
“4. 보유 기간과 파기”, “6. 이용자의 권리와 행사 방법”

개인정보처리방침의 관련 문구는 다음과 같습니다.

“지원되는 iPhone의 얼굴 분석 촬영에서는 Apple ARKit TrueDepth 기능을 사용할 수
있습니다. 원시 depth-map 바이트를 복사·파일 저장·서버 업로드하지 않습니다.
촬영 샘플과 원시 얼굴 메시 프레임은 측정 종료 또는 화면 종료 시 메모리에서
해제됩니다. 코·턱·광대 돌출도, 입술과 E-line 거리, 얼굴 비율, 측정 신뢰도·유효
프레임 수 등 계산된 측정값과 보고서 생성용 RGB 사진은 이용자가 분석을 실행한
경우 서버에 전송·저장될 수 있습니다.”
```

---

## 2. Guideline 2.1(a) — Sign in with Apple 오류

### 거절 내용의 의미

Apple은 iPhone 17 Pro Max, iOS 26.5.2, 정상 인터넷 환경에서 Apple 로그인 완료에
실패했다고만 알렸다. 오류 코드가 없으므로 다음 구간을 각각 확인해야 한다.

1. 앱에서 Cognito Hosted UI 열기
2. Cognito에서 Apple 인증 페이지로 이동
3. Apple이 Cognito의 `/oauth2/idpresponse`로 인증 결과 반환
4. Cognito가 앱의 `aiarmakeup://auth/callback`으로 인증 코드 반환
5. 앱의 토큰 교환
6. 백엔드 사용자 조회·생성

Apple Service ID의 도메인·Return URL 또는 Primary App ID 연결이 틀리면 보통
Apple 인증 단계에서 `invalid_client`가 발생한다. 인증 성공 뒤 백엔드가 Cognito의
`SignInWithApple` 공급자를 잘못 해석해도 최종 로그인이 실패할 수 있다.

### 코드 수정 상태

- `구현됨(검증 필요)` 백엔드가 Cognito 공급자 이름 `SignInWithApple`을 `apple`로
  정규화하도록 변경되어 있다.
- `구현됨(검증 필요)` 관련 공급자 파싱 테스트가 작업트리에 추가되어 있다.
- `필요` Release/TestFlight 빌드에서 Apple 인증부터 백엔드 사용자 생성까지
  end-to-end 검증

### 공개 OAuth 경로 별도 확인 결과 (2026-07-23)

- Cognito authorize endpoint는 현재 앱 클라이언트와 `aiarmakeup://auth/callback`을
  허용하고 Apple로 `302` 리디렉션한다.
- Cognito가 Apple에 전달하는 값은 아래와 같이 확인됐다.
  - `client_id=com.aurathebeautyapp.mobile.signin`
  - `redirect_uri=https://ap-northeast-2qmib9sdys.auth.ap-northeast-2.amazoncognito.com/oauth2/idpresponse`
- 위 Service ID와 Return URL 조합으로 Apple authorize endpoint를 열면 현재
  `HTTP 200` Sign in with Apple 로그인 화면이 반환되며 로그인 전 단계의
  `invalid_client`는 재현되지 않았다.
- 이 공개 확인은 Apple 계정 인증 이후의 authorization code 발급, Cognito의 Apple
  client secret(Key ID·private key) 검증, 앱 토큰 교환, 백엔드 사용자 동기화까지
  보장하지 않는다. 따라서 아래 실기기 end-to-end 테스트는 여전히 필수다.

### Apple Developer의 Service ID 체크리스트

현재 사용 값:

- 앱 Bundle ID: `com.aurastyleguide.mobile`
- Cognito Apple Service ID: `com.aurathebeautyapp.mobile.signin`
- Cognito 도메인:
  `ap-northeast-2qmib9sdys.auth.ap-northeast-2.amazoncognito.com`
- 앱용 Cognito callback: `aiarmakeup://auth/callback`

Service ID 문자열이 앱 Bundle ID와 같을 필요는 없다. 단, Service ID가 현재 앱의
Primary App ID와 올바르게 연결되어야 한다.

- `필요` Apple Developer → Identifiers → App IDs →
  `com.aurastyleguide.mobile`
  - Sign in with Apple 활성화
  - Primary App ID 또는 올바른 기존 Primary 그룹 연결 확인
- `필요` Apple Developer → Identifiers → Services IDs →
  `com.aurathebeautyapp.mobile.signin` → Sign in with Apple → Configure
  - Primary App ID가 `com.aurastyleguide.mobile`인지 확인
  - Domains and Subdomains에는 다음 **호스트만** 입력

```text
ap-northeast-2qmib9sdys.auth.ap-northeast-2.amazoncognito.com
```

  - Return URLs에는 다음을 **정확히** 입력

```text
https://ap-northeast-2qmib9sdys.auth.ap-northeast-2.amazoncognito.com/oauth2/idpresponse
```

  - `https://` 누락, 마지막 경로 누락, 끝 슬래시 추가, 다른 Cognito 도메인 사용 금지
- `필요` Sign in with Apple Key
  - Team ID `BRA7W3G4QS`, Key ID, `.p8`가 Cognito에 등록된 조합과 일치하는지 확인
  - Key가 현재 App ID/Primary App ID 구성에서 사용 가능한지 확인
- `필요` Amazon Cognito 사용자 풀 → Apple 자격 증명 공급자
  - Service ID가 `com.aurathebeautyapp.mobile.signin`인지 확인
  - Team ID, Key ID, private key 재확인
- `필요` Cognito 앱 클라이언트
  - Apple 공급자 활성화
  - Authorization code grant 활성화
  - `openid`, `email`, `profile` 범위 활성화
  - 허용 Callback URL에 `aiarmakeup://auth/callback` 등록

> Apple Service ID의 Return URL은 **Apple → Cognito** 주소다.
> `aiarmakeup://auth/callback`은 **Cognito → 앱** 주소이므로 Apple Service ID의
> Return URL 칸에 넣으면 안 된다.

Apple의 공식 구성 문서는 Services ID를 Sign in with Apple이 활성화된 Primary App
ID와 연결하도록 요구하며, AWS는 소셜 IdP의 callback endpoint를
`https://<user-pool-domain>/oauth2/idpresponse`로 안내한다.

### 필수 재현·회귀 테스트

- `필요` TestFlight Release 빌드에서 신규 Apple 계정 첫 로그인
- `필요` Apple 계정 설정에서 AURA 사용을 중단한 뒤 다시 로그인하여 최초 동의 흐름 확인
- `필요` 기존 App Store 1.0을 설치한 뒤 새 TestFlight 빌드를 **업데이트 설치**하여 로그인
- `필요` 앱 삭제 후 새 TestFlight 빌드를 깨끗하게 설치하여 로그인
- `필요` Apple의 이메일 가리기 relay 주소, 이름이 한 번만 반환되는 최초 로그인,
  기존 사용자 재로그인 모두 확인
- `필요` 로그인 완료 후 홈·마이페이지 진입 및 백엔드 사용자 데이터 조회 확인
- `필요` 실패 시 Cognito Hosted UI의 `error`, `error_description`, callback URL,
  백엔드 응답 코드를 개인정보 없이 기록

### App Review 답변 초안

아래 문구는 위 설정과 실기기 테스트가 모두 완료된 후에만 사용한다.

```text
안녕하세요. Sign in with Apple 오류를 수정했습니다.

- 현재 앱 ID com.aurastyleguide.mobile의 Sign in with Apple 구성을 확인하고,
  Cognito용 Service ID와 Primary App ID 연결 및 Return URL을 수정했습니다.
- Cognito의 SignInWithApple 공급자를 백엔드에서 Apple 계정으로 올바르게 처리하도록
  수정했습니다.
- 기존 App Store 버전 위에 새 버전을 업데이트 설치한 경우와 앱을 새로 설치한 경우를
  모두 테스트했습니다.
- Apple의 이메일 가리기를 사용한 신규 계정과 기존 계정 모두 로그인 후 홈 화면까지
  정상 진입하는 것을 확인했습니다.

검토 경로:
1. 앱 실행
2. Apple 로고 버튼 선택
3. Apple 인증 완료
4. AURA 홈 화면 진입 확인
```

---

## 3. Guideline 2.3.3 — 13인치 iPad 스크린샷

### 문제

현재 13인치 iPad 스크린샷은 로그인 화면만 표시한다. Apple은 로그인·스플래시 화면을
앱 사용 중인 핵심 기능 화면으로 보지 않았다.

### 필요한 스크린샷

- `필요` 실제 13인치 iPad 또는 정확한 13인치 iPad 시뮬레이터에서 새 Release 빌드 실행
- `필요` 로그인 화면이 아닌 실제 기능 화면을 최소 3장 이상 준비
- 권장 순서:
  1. 홈과 주요 기능 진입점
  2. 얼굴 분석 결과 보고서
  3. 메이크업 추천 결과
  4. AR 메이크업 또는 메이크업 추출 결과
  5. 마이페이지의 보고서 목록
- iPad에서 실제로 정상 동작하지 않는 기능을 합성해 넣지 않는다.
- 사용자 얼굴, 실명 등 개인정보가 보이면 본인 동의가 확인된 자료 또는 허가된
  테스트 계정·샘플 이미지로 교체한다.
- 앱 UI를 보여주는 영역이 대부분이어야 하며, 과도한 광고 문구나 기기에 존재하지 않는
  UI를 합성하지 않는다.

13인치 iPad 허용 크기:

- 세로: `2064 × 2752` 또는 `2048 × 2732`
- 가로: `2752 × 2064` 또는 `2732 × 2048`
- 투명도(alpha channel) 없는 PNG/JPEG

### App Store Connect 수동 조치

- `필요` App Store Connect → 해당 iOS 버전 → Previews and Screenshots
- `필요` iPad 탭 → **View All Sizes in Media Manager**
- `필요` 13-inch Display의 기존 로그인 화면 이미지를 삭제
- `필요` 실제 기능 화면 이미지 업로드 후 순서 확인
- `필요` 한국어 외 다른 현지화가 존재한다면 각 현지화의 13인치 iPad 이미지 확인

### App Review 답변 초안

```text
안녕하세요. 13인치 iPad 스크린샷을 실제 앱 사용 화면으로 교체했습니다.
새 스크린샷은 홈, 얼굴 분석 결과, 메이크업 추천 결과 및 보고서 관리 등 앱의 핵심
기능을 13인치 iPad에서 직접 실행한 화면으로 보여줍니다. 로그인 화면만 표시하던
기존 스크린샷은 제거했습니다.
```

---

## 4. Guidelines 5.1.1(i), 5.1.2(i) — 외부 AI 전송 고지·동의

### Apple이 요구한 내용

개인 데이터를 제3자 AI에 보내기 전에 앱 안에서 다음 세 가지를 모두 제공해야 한다.

1. 무엇을 보내는지
2. 누구에게 보내는지
3. 사용자의 명시적 허용

약관이나 개인정보처리방침에만 적는 것은 충분하지 않다.

### 코드 수정 상태

- `구현됨(검증 필요)` 클라우드 AI 기능을 시작하기 전 별도 동의 sheet 추가
- `구현됨(검증 필요)` 전송 가능 데이터 표시
  - 얼굴 사진
  - 얼굴형·비율·피부·헤어·입술 색상·퍼스널 컬러 등 파생 분석값
  - 상황·설문 답변·메이크업 목표
- `구현됨(검증 필요)` 수신자와 목적 표시
  - Amazon Web Services의 Amazon Bedrock / Anthropic Claude:
    얼굴·메이크업 분석, 보고서·추천 문구 생성
  - OpenAI: 맞춤 메이크업·헤어 이미지 분석·편집·생성
- `구현됨(검증 필요)` `동의하지 않음`, `동의하고 계속` 선택 제공
- `구현됨(검증 필요)` 설정의 `AI 데이터 관리`에서 상태 확인과 철회 제공
- `구현됨(검증 필요)` 서버에 동의 버전·시각·철회 상태를 저장하고 주요 AI·미디어
  API가 유효 동의 없이는 요청을 거부하도록 변경
- `구현됨(검증 필요)` 개인정보처리방침에 외부 AI 수신자, 목적, 전송 항목,
  보관·삭제 및 철회 경로 추가

### 운영 배포·수동 조치

- `필요` 동의 API와 AI API 차단 로직을 운영 백엔드에 배포
- `필요` 새 모바일 Release/TestFlight 빌드 배포
- `필요` 공개 개인정보처리방침 URL을 앱 내 문구와 동일하게 갱신
- `필요` App Store Connect의 App Privacy 답변을 실제 처리와 일치하도록 재검토
  - 사용자 콘텐츠/사진
  - 식별자 및 계정 정보
  - 위치
  - 제품 상호작용·사용 데이터
  - 진단 데이터가 실제 수집되는 경우 해당 항목
- `필요` AWS Bedrock/Anthropic 및 OpenAI의 실제 기업용 데이터 보관·모델 학습 사용
  설정과 계약이 개인정보처리방침 설명과 일치하는지 운영 계정에서 확인

### 필수 테스트

- `필요` 신규 계정에서 동의 전 얼굴 사진 또는 분석값이 서버·외부 AI로 전송되지 않음
- `필요` `동의하지 않음` 선택 시 클라우드 AI 기능은 설명 가능한 화면으로 제한되고,
  로그인과 기기 내 AR 필터는 계속 이용 가능
- `필요` 동의 후 얼굴 분석, 메이크업 추천, 메이크업 추출, 메이크업 피드백이 정상 동작
- `필요` 설정에서 철회 후 새로운 AI·이미지 업로드 요청이 서버에서 거부됨
- `필요` 재동의 후 기능이 정상 복구됨
- `필요` 오래된 앱이 새 백엔드에 요청했을 때 개인정보가 동의 없이 전송되지 않음

### App Review 답변 초안

아래 문구는 운영 백엔드와 새 앱 빌드 배포 후에만 사용한다.

```text
안녕하세요. 제3자 AI 데이터 처리 고지와 동의 흐름을 수정했습니다.

사용자가 클라우드 AI 기능을 처음 실행할 때, 전송 전에 별도 동의 화면을 표시합니다.
이 화면은 다음 내용을 명시합니다.

- 전송 데이터: 얼굴 사진, 얼굴형·비율·피부·헤어·입술 색상·퍼스널 컬러 등의 파생
  분석값, 사용자가 입력한 상황·설문 답변·메이크업 목표
- 수신자와 목적:
  1) Amazon Web Services의 Amazon Bedrock / Anthropic Claude —
     얼굴·메이크업 분석 및 보고서·추천 문구 생성
  2) OpenAI — 맞춤 메이크업·헤어 이미지의 분석·편집·생성
- 보관·삭제 및 동의 철회 방법

사용자가 “동의하고 계속”을 선택하기 전에는 해당 데이터가 외부 AI로 전송되지
않습니다. “동의하지 않음”을 선택할 수 있으며, 로그인과 기기 내 AR 필터는 계속
이용할 수 있습니다. 사용자는 프로필 > 설정 > AI 데이터 관리에서 언제든 동의를
철회할 수 있고, 철회 후에는 새로운 외부 AI 전송이 중단됩니다.

또한 백엔드에서도 현재 동의가 확인되지 않으면 AI 분석 및 관련 이미지 업로드 요청을
거부하도록 적용했습니다. 개인정보처리방침에는 수집 항목, 수집 방식, 모든 이용 목적,
외부 AI 수신자, 보유·삭제 및 철회 방법을 추가했습니다.
```

---

## 최종 재제출 체크리스트

### 코드·배포

- [ ] 현재 작업트리의 변경을 리뷰하고 커밋
- [ ] 개인정보처리방침 문구와 실제 코드·운영 정책의 일치 확인
- [ ] 운영 백엔드 배포
- [ ] 새 EAS Production 빌드 생성
- [ ] App Store Connect에 새 빌드 업로드

### 로그인

- [ ] Apple App ID와 Service ID 수동 설정 완료
- [ ] Cognito Apple IdP 및 앱 클라이언트 설정 완료
- [ ] 신규 설치 Apple 로그인 성공
- [ ] 기존 App Store 버전 위 업데이트 설치 Apple 로그인 성공
- [ ] 이메일 가리기 신규·기존 계정 성공

### 개인정보·AI

- [ ] 동의 전 네트워크 전송 차단 확인
- [ ] 거부·철회·재동의 확인
- [ ] 계정 삭제 및 보고서 삭제 동작 확인
- [ ] 공개 개인정보처리방침 URL 갱신
- [ ] App Privacy 답변 갱신

### iPad·메타데이터

- [ ] 13인치 iPad 실제 기능 스크린샷 준비
- [ ] 로그인 화면만 있는 기존 스크린샷 삭제
- [ ] Media Manager의 모든 현지화·크기 확인
- [ ] iPad에서 로그인, 홈, 주요 보고서 화면 smoke test

### App Review 제출

- [ ] 위 네 항목의 답변을 실제 완료 상태에 맞게 수정
- [ ] 대괄호 placeholder 전부 제거
- [ ] 검토용 계정 또는 Apple 로그인 테스트 절차 제공
- [ ] 비직관적인 카메라·TrueDepth·AI 동의 흐름을 Review Notes에 설명
- [ ] 새 빌드 번호 선택 후 재제출

---

## 공식 근거

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple — Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Apple — About Sign in with Apple](https://developer.apple.com/help/account/capabilities/about-sign-in-with-apple)
- [AWS — Identity provider and relying party endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html)
- [Apple — Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Apple — Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
