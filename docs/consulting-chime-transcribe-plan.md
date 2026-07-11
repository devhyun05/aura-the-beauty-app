# AWS Chime SDK 기반 한·영 영상 컨설팅 구현 계획

## Decision

온라인 컨설팅의 1:1 영상통화는 Amazon Chime SDK Meetings로 구현한다.

- 고객은 React Native 모바일 앱에서 참가한다.
- 상담사는 웹 관리자 화면에서 참가한다.
- 모바일은 공식 Chime iOS SDK를 기존 React Native 네이티브 브리지 패턴으로 연결한다.
- Chime SDK와 MeetingSession은 통화 화면에 진입할 때만 지연 초기화한다.
- 통화 진입 전에 Unity의 카메라와 오디오 사용을 중지하고, 통화 종료 후 필요한 리소스만 복원한다.
- FastAPI는 예약 권한을 검증하고 Chime Meeting/Attendee를 발급한다.
- 영상과 음성은 API Gateway나 ECS를 통과시키지 않고 Chime 미디어 네트워크로 전송한다.
- 지원 음성 언어는 한국어 `ko-KR`과 미국 영어 `en-US` 두 개로 제한한다.
- 각 참가자는 통화 입장 전에 자신의 발화 언어를 한국어 또는 영어로 선택한다.
- 실시간 원문 자막은 Chime SDK Live Transcription과 Amazon Transcribe를 사용한다.
- 한국어 원문은 영어로, 영어 원문은 한국어로 Amazon Translate를 사용해 번역한다.
- Transcribe와 Translate 처리는 AWS 서버 측에서 수행하므로 모바일에는 자막 표시 코드와 이벤트 계약만 추가한다.
- 부분 인식 결과는 원문 임시 자막으로만 표시하고, 확정 문장만 번역한다.
- 통화 녹화는 MVP 범위에서 제외한다.

## Goals

- 동일한 `booking_id`를 가진 고객 모바일과 상담사 웹이 하나의 영상통화에 참가한다.
- Cognito 고객과 파트너 상담사의 기존 인증 체계를 그대로 사용한다.
- 예약 소유자와 배정된 상담사만 통화에 참가할 수 있다.
- 카메라, 마이크, 로컬 영상, 상대 영상, 통화 종료, 재연결을 지원한다.
- 한국어와 영어 발화를 화자별 원문 자막으로 양쪽 화면에 표시한다.
- 한국어 확정 문장은 영어로, 영어 확정 문장은 한국어로 번역해 표시한다.
- 같은 언어 통화와 한국어/영어 혼합 통화를 모두 지원한다.
- AWS 자격 증명과 장기 키를 모바일이나 웹에 노출하지 않는다.
- 통화 및 자막 상태를 CloudWatch에서 추적할 수 있게 한다.

## Non-Goals

- 다자간 그룹 상담.
- 전화번호 기반 PSTN 통화.
- 통화 녹화 및 영상 파일 저장.
- 의료 진단용 Transcribe Medical.
- 첫 버전의 자동 통화 요약 및 AI 상담사.
- 첫 버전의 Android 네이티브 Chime 브리지.
- 자막을 법적 증빙 자료로 사용하는 기능.
- 한국어와 영어 외의 제3언어.
- 부분 자막을 매 토큰마다 번역하는 기능.
- 두 사람이 동시에 말할 때 완전한 동시통역 품질을 보장하는 기능.

## Current System

현재 저장소에서 재사용할 수 있는 진입점은 다음과 같다.

- Mobile call placeholder: `apps/mobile/src/features/consulting/screens/ConsultingCallScreen.tsx`
- Mobile call route: `apps/mobile/src/app/navigation/routes/consultingRoutes.tsx`
- Mobile backend helper: `apps/mobile/src/shared/services/backendApi.ts`
- Mobile consulting service: `apps/mobile/src/features/consulting/services/consultingService.ts`
- Customer consulting API: `services/backend/app/api/consulting.py`
- Partner consulting API: `services/backend/app/api/consulting_partner.py`
- Booking realtime WebSocket: `services/backend/app/api/consulting_realtime.py`
- Booking service: `services/backend/app/services/consulting.py`
- Partner authorization service: `services/backend/app/services/consulting_partner.py`
- Database schema: `docs/backend/schema.sql`
- Partner web location: `apps/admin`

`apps/admin`은 현재 `.gitkeep`만 있는 상태다. 상담사용 영상통화 웹 화면과 파트너 업무 화면을 이 위치에 만들거나, 별도 저장소의 consulting-web이 최종 운영 대상이라면 같은 계약을 그 저장소에 적용한다.

## Target Architecture

```text
Customer mobile app                         Partner web
React Native + native Chime iOS SDK         React + amazon-chime-sdk-js
          |                                             |
          | join credentials                            | join credentials
          v                                             v
      API Gateway -> VPC Link -> internal ALB -> FastAPI/ECS
                                   |
                                   | CreateMeeting / CreateAttendee
                                   v
                          Amazon Chime SDK Meetings
                                   |
                    audio/video + transcript data messages
                                   |
                 Amazon Transcribe through Chime integration
                                   |
                            finalized captions
                                   v
                         Amazon Translate ko <-> en

PostgreSQL
  consulting_bookings
  consulting_call_sessions
  consulting_transcript_segments (consent-enabled phase only)
```

API Gateway는 방 생성과 참가 자격 발급 같은 제어 요청만 전달한다. 실제 WebRTC 영상과 음성은 각 클라이언트가 Chime에 직접 연결한다.

## Region Strategy

- Control Region: `ap-northeast-2`
- Media Region: `ap-northeast-2`
- Transcribe Region: `ap-northeast-2`

서울 리전은 Chime SDK meeting control과 media를 모두 지원한다. 첫 버전은 한국 사용자 중심이므로 서울로 고정한다. 해외 상담을 지원하게 되면 클라이언트가 `nearest-media-region.l.chime.aws`를 조회한 결과를 서버에 전달하고 서버가 Media Region을 선택하도록 확장한다.

## Data Model

### Call session

```sql
create table if not exists consulting_call_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references consulting_bookings(id),
  meeting_id text not null unique,
  control_region text not null default 'ap-northeast-2',
  media_region text not null default 'ap-northeast-2',
  customer_language_code text not null default 'ko-KR',
  expert_language_code text not null default 'ko-KR',
  transcription_mode text not null default 'fixed',
  status text not null default 'created',
  transcription_status text not null default 'stopped',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_consulting_call_status
    check (status in ('created', 'active', 'ended', 'failed')),
  constraint chk_consulting_transcription_status
    check (transcription_status in ('stopped', 'starting', 'active', 'stopping', 'failed')),
  constraint chk_consulting_customer_language
    check (customer_language_code in ('ko-KR', 'en-US')),
  constraint chk_consulting_expert_language
    check (expert_language_code in ('ko-KR', 'en-US')),
  constraint chk_consulting_transcription_mode
    check (transcription_mode in ('fixed', 'identify'))
);
```

`JoinToken`은 저장하지 않는다. 고객과 상담사가 입장할 때마다 `CreateAttendee`를 호출하고 응답을 해당 클라이언트에만 전달한다.

### Final transcript segments

MVP 자막은 화면 표시만 지원하고 기본적으로 저장하지 않는다. 사용자가 자막 저장에 명시적으로 동의한 후에만 아래 테이블을 활성화한다.

```sql
create table if not exists consulting_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  call_session_id uuid not null references consulting_call_sessions(id),
  result_id text not null,
  attendee_id text,
  speaker_type text not null,
  source_language_code text not null,
  content text not null,
  target_language_code text,
  translated_content text,
  start_time_ms integer,
  end_time_ms integer,
  created_at timestamptz not null default now(),
  unique (call_session_id, result_id),
  constraint chk_consulting_transcript_speaker
    check (speaker_type in ('user', 'expert', 'unknown'))
);
```

부분 자막은 저장하지 않는다. 확정된 결과만 저장하고, 보존 기간이 지나면 삭제하는 작업을 별도로 둔다.

## API Contract

### Customer join

```http
POST /api/consulting/bookings/{booking_id}/call/join
Authorization: Bearer <Cognito access token>
Content-Type: application/json

{
  "languageCode": "ko-KR"
}
```

### Partner join

```http
POST /api/consulting/partner/bookings/{booking_id}/call/join
Authorization: Bearer <partner session token>
Content-Type: application/json

{
  "languageCode": "en-US"
}
```

### Shared join response

```ts
type ConsultingCallJoinResponse = {
  callSessionId: string;
  bookingId: string;
  participantType: 'user' | 'expert';
  participantLanguageCode: 'ko-KR' | 'en-US';
  supportedLanguageCodes: ['ko-KR', 'en-US'];
  meeting: {
    MeetingId: string;
    MediaRegion: string;
    MediaPlacement: Record<string, string>;
  };
  attendee: {
    AttendeeId: string;
    ExternalUserId: string;
    JoinToken: string;
  };
  transcriptionStatus: 'stopped' | 'starting' | 'active' | 'stopping' | 'failed';
  transcriptionMode: 'fixed' | 'identify';
};
```

### Transcription control

```http
POST /api/consulting/partner/bookings/{booking_id}/call/transcription/start
POST /api/consulting/partner/bookings/{booking_id}/call/transcription/stop
```

첫 버전에서는 상담사 또는 운영자만 자막을 시작하고 종료할 수 있다. 요청 전에 고객 동의 상태를 확인한다.

자막 시작 시 서버는 두 참가자의 언어 선택을 비교한다.

```text
customer=ko-KR, expert=ko-KR -> fixed ko-KR
customer=en-US, expert=en-US -> fixed en-US
customer=ko-KR, expert=en-US -> identify ko-KR,en-US
customer=en-US, expert=ko-KR -> identify ko-KR,en-US
```

### End call

```http
POST /api/consulting/partner/bookings/{booking_id}/call/end
```

상담사가 전체 통화를 종료할 때 `StopMeetingTranscription`, `DeleteMeeting`, DB 상태 갱신을 순서대로 수행한다. 고객의 단순 화면 이탈은 Meeting 삭제로 처리하지 않는다.

### Call state

```http
GET /api/consulting/bookings/{booking_id}/call
GET /api/consulting/partner/bookings/{booking_id}/call
```

재접속 시 활성 Meeting 존재 여부와 자막 상태를 확인하는 용도다.

## Authorization Rules

- 고객은 `consulting_bookings.user_id`가 자신의 사용자 id와 일치해야 한다.
- 상담사는 파트너 계정의 `expert_id`가 예약의 `expert_id`와 일치해야 한다.
- 운영자는 기존 파트너 role이 `operator` 또는 `business_manager`일 때만 대리 입장할 수 있다.
- 예약 상태는 `confirmed`여야 한다.
- `session_mode`는 `online`이어야 한다.
- 취소 또는 완료된 예약에는 새 Attendee를 발급하지 않는다.
- 기본 입장 시간은 예약 시작 15분 전부터 종료 예정 30분 후까지로 제한한다.
- 참가자 언어는 `ko-KR` 또는 `en-US`만 허용한다.
- `ExternalMeetingId`와 `ExternalUserId`에 이름, 이메일, 전화번호 같은 개인정보를 넣지 않는다.

## Backend Implementation

### New files

```text
services/backend/app/schemas/consulting_call.py
services/backend/app/services/chime_meetings.py
services/backend/tests/test_consulting_call_api.py
services/backend/tests/test_chime_meetings.py
```

### Settings

`services/backend/app/core/settings.py`에 다음 값을 추가한다.

```text
CHIME_ENABLED=false
CHIME_CONTROL_REGION=ap-northeast-2
CHIME_MEDIA_REGION=ap-northeast-2
CHIME_TRANSCRIPTION_ENABLED=false
CHIME_TRANSCRIBE_SUPPORTED_LANGUAGES=ko-KR,en-US
CHIME_TRANSCRIBE_DEFAULT_LANGUAGE=ko-KR
CHIME_TRANSCRIBE_PREFERRED_LANGUAGE=ko-KR
CHIME_TRANSLATE_ENABLED=false
CONSULTING_CALL_JOIN_EARLY_MINUTES=15
CONSULTING_CALL_JOIN_LATE_MINUTES=30
CONSULTING_TRANSCRIPT_RETENTION_DAYS=0
```

`0`일 보존은 자막을 DB에 저장하지 않는다는 의미로 사용한다.

### Chime service responsibilities

`ChimeMeetingsService`는 다음 메서드를 제공한다.

```python
create_or_get_meeting(booking_id)
create_attendee(meeting_id, participant_type, participant_id)
start_transcription(meeting_id, participant_languages)
stop_transcription(meeting_id)
end_meeting(meeting_id)
translate_final_caption(source_language_code, content)
```

구현 규칙:

- Boto3 client 이름은 `chime-sdk-meetings`를 사용한다.
- FastAPI 이벤트 루프를 막지 않도록 Boto3 호출은 `asyncio.to_thread()`로 감싼다.
- `ClientRequestToken`은 예약 id에서 결정적으로 생성한다.
- Meeting 생성 전 PostgreSQL advisory lock 또는 동등한 예약 단위 lock을 사용한다.
- `consulting_call_sessions.booking_id` unique constraint로 중복 Meeting을 차단한다.
- AWS 오류 원문과 JoinToken을 로그에 남기지 않는다.
- 이미 종료된 Meeting은 새 Meeting으로 교체하고 이전 상태를 `ended` 또는 `failed`로 남긴다.
- 두 참가자 언어가 같으면 고정 `LanguageCode`를 사용한다.
- 두 참가자 언어가 다르면 `IdentifyLanguage=true`, `LanguageOptions=ko-KR,en-US`를 사용한다.
- Transcribe의 `ko-KR`, `en-US` 코드는 Translate 호출 시 각각 `ko`, `en`으로 변환한다.

### Router changes

- 고객 API는 `services/backend/app/api/consulting.py`에 추가한다.
- 상담사 API는 `services/backend/app/api/consulting_partner.py`에 추가한다.
- 공통 예약 및 Chime 처리는 `chime_meetings.py`에서 담당한다.
- `services/backend/tests/test_route_contract.py`에 새 경로를 추가한다.

## Partner Web Implementation

`apps/admin`에 React + TypeScript 웹을 구성한다.

필수 의존성:

```text
amazon-chime-sdk-js
```

React Component Library는 초기 구현 속도를 높일 수 있지만, 프로젝트 디자인과 번들 크기를 확인한 후 선택한다. 핵심 통화 로직은 `amazon-chime-sdk-js`에 직접 의존한다.

권장 파일 구조:

```text
apps/admin/src/features/call/ConsultingCallPage.tsx
apps/admin/src/features/call/chimeMeetingSession.ts
apps/admin/src/features/call/useChimeMeeting.ts
apps/admin/src/features/call/VideoTile.tsx
apps/admin/src/services/partnerApi.ts
```

웹 클라이언트 책임:

- 파트너 로그인 세션으로 join API 호출.
- `MeetingSessionConfiguration`과 `DefaultMeetingSession` 생성.
- 마이크와 카메라 권한 요청.
- 로컬 영상과 원격 영상 tile 바인딩.
- 음소거, 카메라 끄기, 장치 변경, 통화 종료.
- 재연결 상태와 네트워크 품질 표시.
- Chime transcription data message 구독.
- 부분 자막과 확정 자막을 구분해서 표시.
- 입장 전에 상담사의 발화 언어를 한국어 또는 영어로 선택.
- 원문과 번역문을 구분해 표시하고 자막 표시 언어를 전환.

## Mobile Implementation

모바일은 Chime JavaScript SDK를 WebView로 실행하지 않고 공식 Chime iOS SDK를 얇은 네이티브 모듈로 연결한다.

현재 앱은 Unity와 네이티브 모듈을 이미 포함하므로 Expo Go가 아니라 네이티브 Development Build에서 검증한다.

권장 파일 구조:

```text
apps/mobile/ios/ChimeMeetingModule/
apps/mobile/src/features/consulting/native/chimeMeeting.ts
apps/mobile/src/features/consulting/components/ChimeVideoView.tsx
apps/mobile/src/features/consulting/hooks/useChimeMeeting.ts
apps/mobile/src/features/consulting/services/consultingCallService.ts
```

네이티브 브리지 최소 계약:

```ts
type ChimeMeetingNativeModule = {
  initialize(meeting: object, attendee: object): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  startLocalVideo(): Promise<void>;
  stopLocalVideo(): Promise<void>;
  switchCamera(): Promise<void>;
};
```

네이티브 이벤트:

```text
meetingStateChanged
attendeePresenceChanged
videoTileAdded
videoTileRemoved
audioLevelChanged
transcriptEvent
meetingError
```

`ConsultingCallScreen.tsx`의 임시 Agora 안내 화면을 다음 상태 기반 UI로 교체한다.

```text
loading -> permissions -> joining -> connected -> reconnecting -> ended/error
```

통화 입장 전 고객이 `한국어` 또는 `English`를 선택한다. 기본값은 한국어이며 최근 선택값은 기기에 저장할 수 있지만, join 요청마다 서버에 명시적으로 전송한다.

자막 UI는 다음 규칙을 따른다.

```text
한국어 발화: 한국어 원문(부분/확정) + 영어 번역(확정만)
영어 발화: 영어 원문(부분/확정) + 한국어 번역(확정만)
```

사용자 설정에 따라 번역문을 크게 표시하고 원문을 보조 줄로 표시하거나, 원문만 표시할 수 있게 한다.

iOS 통합 시 Unity와 Chime이 모두 `AVAudioSession`을 사용하므로 다음을 반드시 실기기에서 확인한다.

- 통화 진입 전 Unity 오디오와 카메라가 완전히 중지되는지.
- 통화 종료 후 앱 오디오 세션이 복원되는지.
- 블루투스 이어폰과 스피커 전환이 정상인지.
- 앱 백그라운드 전환 시 통화 정책이 의도대로 동작하는지.
- 카메라 사용 화면에서 Chime 통화로 이동할 때 캡처 세션 충돌이 없는지.

## 앱 용량과 런타임 성능

### 앱 용량 영향

Chime 도입 시 앱 용량은 증가하지만, 배포 파일 전체 크기를 그대로 앱 증가량으로 계산하면 안 된다. 문서 작성 시점인 2026-07-10에 Chime iOS SDK `0.27.3` 배포물을 직접 확인한 참고치는 다음과 같다.

- `AmazonChimeSDK` 압축 배포물: 약 5.1 MiB.
- `AmazonChimeSDKMedia` 압축 배포물: 약 30.6 MiB.
- 약 37 MiB인 두 압축 배포물에는 iPhone과 시뮬레이터용 slice가 함께 들어 있다.
- 실제 iPhone용 `ios-arm64` 프레임워크 바이너리 합계는 약 14.5 MB다.
- App Store 전송 크기와 설치 크기는 심볼 제거, 앱 슬라이싱, 압축의 영향을 받으므로 이 수치와 같지 않다.

위 수치는 SDK 버전 변경에 따라 달라질 수 있는 계획 참고치다. 제품의 최종 증가량은 동일한 Release 설정으로 Chime 추가 전후 Archive를 만들고 Xcode Organizer와 App Thinning Size Report에서 비교한다.

구성 요소별 영향은 다음과 같다.

- Objective-C/Swift 네이티브 브리지와 TypeScript 래퍼의 용량은 매우 작다.
- 앱 용량 증가의 대부분은 Chime 미디어/WebRTC 프레임워크에서 발생한다.
- Amazon Transcribe와 Amazon Translate는 AWS에서 실행되므로 SDK 전체를 모바일에 추가하지 않는다.
- 자막 이벤트 모델과 UI가 추가하는 앱 용량은 미미하다.
- 시뮬레이터 slice는 App Store용 iPhone 빌드에 포함하지 않는다.

### 리소스 생명주기

Chime을 앱 시작 시 초기화하지 않는다. 일반 홈, AR, 예약 화면에서는 Chime MeetingSession, 카메라, 마이크가 존재하지 않아야 한다.

```text
통화 화면 진입
  -> 예약 및 권한 확인
  -> Unity 카메라/오디오 중지
  -> Unity capture session과 AVAudioSession 사용 정리
  -> FastAPI join API 호출
  -> Chime MeetingSession 생성
  -> 카메라/마이크 시작

통화 화면 종료
  -> local video 중지
  -> audioVideo.stop()
  -> video tile unbind
  -> observer와 event listener 제거
  -> MeetingSession 참조 해제
  -> 카메라/마이크 사용 종료 확인
  -> 필요한 Unity/앱 오디오 세션 복원
```

초기화와 종료 작업은 여러 번 호출되어도 안전하도록 idempotent하게 만든다. 통화 입장 실패와 앱 강제 화면 이탈 경로에서도 동일한 정리 함수를 실행한다.

### 초기 영상 품질 정책

MVP는 화질보다 안정성, 발열, 배터리 사용량을 우선한다.

- 1:1 통화로 제한하고 로컬/원격 최대 두 개의 video tile만 유지한다.
- 지원 캡처 포맷 중 `540p급/15fps`를 우선 검증한다.
- 기기와 SDK에서 해당 포맷을 지원하지 않으면 `720p/15fps`를 사용한다.
- `720p/30fps`는 초기 기본값으로 사용하지 않고 실기기 측정 후 선택적으로 허용한다.
- 배경 흐림, 가상 배경, 화면 공유, 로컬 녹화는 MVP에서 제외한다.
- 네트워크 상태가 나쁘면 Chime의 적응형 전송을 따르며 임의로 고화질을 강제하지 않는다.

### 성능 및 용량 검증 기준

구현 전 현재 앱의 기준값을 먼저 기록하고 Chime 추가 후 같은 조건으로 비교한다.

- Release Archive의 앱 크기, App Store 다운로드 예상 크기, 설치 크기.
- 앱 콜드 스타트부터 홈 첫 화면까지 걸리는 시간.
- 홈 유휴 상태의 메모리와 Chime 객체 생성 여부.
- Unity AR 화면 진입/종료 후 메모리와 카메라 상태.
- 영상통화 10분 및 30분 동안 메모리, CPU, 네트워크, 배터리, thermal state.
- 통화 진입과 종료를 3회 반복한 뒤 지속적으로 증가하는 메모리와 observer 누수 여부.
- 지원 대상 중 가장 낮은 사양의 실제 iPhone과 최신 iPhone에서 동일 시나리오 수행.

도구는 Xcode Organizer, App Thinning Size Report, Instruments의 Allocations, Leaks, Energy Log, Network를 사용한다. 임시 출시 차단 기준은 다음과 같으며, 기준 앱 측정 후 팀이 수치를 확정한다.

- Chime 추가로 인한 iPhone arm64 원시 바이너리 증가량이 20 MB를 넘으면 원인을 검토한다.
- 통화 화면 밖에서 Chime MeetingSession, 카메라, 마이크가 활성화되지 않는다.
- 통화 진입/종료 3회 후 메모리가 회차마다 계속 증가하지 않는다.
- 30분 통화에서 OOM, 앱 종료, 지속적인 `serious` 또는 `critical` thermal state가 발생하지 않는다.
- 통화 종료 후 Unity 카메라와 앱 오디오가 정상 복원된다.

## Live Transcription

### Start flow

```text
Partner presses "자막 시작"
  -> partner transcription/start API
  -> FastAPI validates booking and consent
  -> StartMeetingTranscription
  -> Chime connects meeting audio to Amazon Transcribe
  -> both clients receive transcript data messages
```

### Same-language calls

두 참가자가 같은 언어를 선택하면 자동 감지를 사용하지 않고 고정 언어로 시작한다. 이 방식이 가장 빠르고 정확하다.

한국어 통화:

```json
{
  "EngineTranscribeSettings": {
    "LanguageCode": "ko-KR",
    "EnablePartialResultsStabilization": true,
    "PartialResultsStability": "medium",
    "Region": "ap-northeast-2"
  }
}
```

영어 통화:

```json
{
  "EngineTranscribeSettings": {
    "LanguageCode": "en-US",
    "EnablePartialResultsStabilization": true,
    "PartialResultsStability": "medium",
    "Region": "ap-northeast-2"
  }
}
```

### Mixed Korean/English calls

고객과 상담사의 언어가 다르면 다음 설정을 우선 검증한다.

```json
{
  "EngineTranscribeSettings": {
    "IdentifyLanguage": true,
    "LanguageOptions": "ko-KR,en-US",
    "PreferredLanguage": "ko-KR",
    "EnablePartialResultsStabilization": true,
    "PartialResultsStability": "medium",
    "Region": "ap-northeast-2"
  }
}
```

`PreferredLanguage`는 한국 사용자 중심 기본값일 뿐이다. 영어 사용자가 주 참가자인 예약에서는 `en-US`로 바꿀 수 있다.

중요한 제약:

- Amazon Transcribe Streaming 자체는 다국어 식별을 지원한다.
- Chime Live Transcription의 `EngineTranscribeSettings`에는 `IdentifyLanguage`가 있지만 `IdentifyMultipleLanguages`는 노출되지 않는다.
- 따라서 한 참가자가 한국어, 다른 참가자가 영어를 계속 사용하는 통화에서 양쪽 언어가 모두 안정적으로 인식되는지 출시 전에 실제 Meeting으로 검증해야 한다.
- 자동 식별에는 최소 약 1초의 발화가 필요하므로 첫 짧은 문장은 지연되거나 잘못 식별될 수 있다.

필수 검증 시나리오:

```text
customer ko-KR -> expert ko-KR
customer en-US -> expert en-US
customer ko-KR -> expert en-US, alternating turns
customer en-US -> expert ko-KR, alternating turns
one speaker switches languages mid-sentence
both speakers overlap
```

혼합 통화 검증이 기준을 통과하지 못하면 Chime Live Transcription의 자동 식별을 운영에 사용하지 않는다. 그 경우 다음 대안을 순서대로 검토한다.

1. 참가자별 로컬 오디오를 고정 언어 Transcribe 스트림으로 별도 전송한다.
2. Chime SDK Media Insights Pipeline의 다국어 식별 지원 여부를 PoC로 검증한다.
3. 첫 출시에서는 통화별 단일 언어만 허용하고 혼합 언어 통화는 번역 지원 대상에서 제외한다.

첫 번째 대안은 한국어 참가자 오디오를 `ko-KR`, 영어 참가자 오디오를 `en-US` 스트림으로 분리해 가장 예측 가능한 결과를 얻지만, 모바일 네이티브 오디오 tap과 서버 스트리밍 구현이 추가된다.

부분 결과는 빠르게 갱신되는 임시 한 줄 자막으로 표시한다. 확정 결과가 도착하면 부분 자막을 교체하고 대화 기록 영역에 추가한다.

```ts
type CaptionViewModel = {
  resultId: string;
  attendeeId?: string;
  speakerType: 'user' | 'expert' | 'unknown';
  sourceLanguageCode: 'ko-KR' | 'en-US';
  content: string;
  isPartial: boolean;
  targetLanguageCode?: 'ko' | 'en';
  translatedContent?: string;
  startTimeMs?: number;
  endTimeMs?: number;
};
```

Chime transcript 이벤트의 attendee id를 join response에서 관리한 참가자 역할과 매핑해 `고객`, `상담사` 레이블을 표시한다. 언어 식별 결과가 이벤트에 충분히 포함되지 않는 경우 attendee별 선택 언어를 원문 언어로 사용한다.

## Korean-English Translation

Amazon Transcribe는 음성을 텍스트로 변환하지만 번역하지 않는다. 한국어와 영어 번역 자막에는 Amazon Translate를 연결한다.

권장 흐름:

```text
Chime final transcript event
  -> partner web submits resultId + source language + content
  -> FastAPI validates and deduplicates resultId
  -> Amazon Translate TranslateText (ko -> en or en -> ko)
  -> existing booking WebSocket broadcast
  -> FastAPI translation response
  -> customer mobile + partner web translated caption
```

구현 계약은 다음과 같다.

```http
POST /api/consulting/partner/bookings/{booking_id}/call/captions/translate
Authorization: Bearer <partner session token>
Content-Type: application/json

{
  "resultId": "transcript-result-id",
  "sourceLanguageCode": "ko-KR",
  "content": "이 색상이 고객님께 잘 어울려요."
}
```

```json
{
  "data": {
    "resultId": "transcript-result-id",
    "sourceLanguageCode": "ko-KR",
    "targetLanguageCode": "en",
    "translatedContent": "This color suits you well."
  }
}
```

언어 코드 매핑:

```text
Transcribe ko-KR -> Translate source ko -> target en
Transcribe en-US -> Translate source en -> target ko
```

부분 자막을 매번 번역하지 않는다. 확정 문장만 번역해 자막 흔들림, 중복 비용, API 호출량을 줄인다. `resultId`를 idempotency key로 사용하고 동일 결과가 다시 들어오면 저장된 번역을 반환한다.

뷰티 제품명과 전문 용어는 Amazon Translate custom terminology 또는 애플리케이션 후처리 사전으로 보정한다. 원문과 번역문 모두 화면에서 구분 가능해야 하며 번역 오류 신고 기능은 후속 단계로 둔다.

## AWS Configuration

### ECS task role

FastAPI ECS Task Role에 최소 권한을 추가한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "chime:CreateMeeting",
        "chime:CreateAttendee",
        "chime:GetMeeting",
        "chime:DeleteMeeting",
        "chime:StartMeetingTranscription",
        "chime:StopMeetingTranscription",
        "translate:TranslateText"
      ],
      "Resource": "*"
    }
  ]
}
```

실제 IAM action 이름은 배포 전 AWS Service Authorization Reference와 CloudTrail 결과로 최종 확인한다.

### API Gateway

- join/start/stop/end는 기존 HTTP API와 VPC Link 통합을 그대로 사용한다.
- 영상과 음성은 API Gateway로 전송하지 않는다.
- join API는 기본 API 제한 안에서 운영하고 예약 단위 중복 생성 방지는 DB에서 처리한다.
- 상담사 웹 origin을 CORS 허용 목록에 추가한다.

### Network

- ECS는 Chime API 호출을 위해 HTTPS 443 아웃바운드가 필요하다.
- 모바일과 웹은 Chime signaling용 HTTPS/WebSocket 443과 미디어용 UDP 3478에 연결한다.
- UDP가 막힌 환경에서는 TCP fallback이 가능하지만 품질 저하를 사용자에게 안내한다.

### EventBridge

운영 단계에서는 Chime meeting lifecycle event를 EventBridge로 수신한다.

- MeetingStarted -> call session `active`.
- AttendeeJoined/Left -> 참가 상태와 운영 지표 갱신.
- MeetingEnded -> call session `ended`, 자막 상태 `stopped`.
- 예상치 못한 종료 -> 알림 및 정리 작업 실행.

## Security And Privacy

- 통화 시작 전 마이크, 카메라, 실시간 음성 인식에 대해 각각 안내한다.
- 자막 저장 여부는 실시간 자막 사용 동의와 분리한다.
- 고객과 상담사 양쪽의 동의가 없으면 녹화 또는 자막 영구 저장을 하지 않는다.
- Chime `JoinToken`과 AWS 응답 전체를 로그에 남기지 않는다.
- Meeting/Attendee 발급 API 응답에 `Cache-Control: no-store`를 적용한다.
- 예약 UUID 외의 개인정보를 Chime external id에 포함하지 않는다.
- Transcript 원문과 번역문은 민감 정보로 분류한다.
- 참가자별 언어 선택값도 상담 데이터로 취급하고 예약 참가자에게만 노출한다.
- 보존 기간이 설정된 경우 만료 삭제 작업과 사용자 삭제 연계를 구현한다.
- AWS AI 서비스 데이터 사용 opt-out 정책 적용 여부를 보안 검토에서 결정한다.

## Observability

구조화 로그 필드:

```text
bookingId
callSessionId
meetingIdHash
participantType
operation
status
durationMs
errorCode
mediaRegion
transcriptionMode
sourceLanguageCode
targetLanguageCode
```

JoinToken, 실제 발화 내용, 전화번호, 이메일은 로그 필드에서 제외한다.

CloudWatch 지표와 경보:

- Meeting 생성 실패 수.
- Attendee 발급 실패 수.
- join API p95 latency.
- 활성 call session 수.
- transcription 시작 실패 수.
- `ko-KR`, `en-US` 언어별 transcription 실패 수.
- 언어 식별 실패 또는 미지원 언어 결과 수.
- Translate 호출 실패 수와 p95 latency.
- 비정상 Meeting 종료 수.
- 모바일 meeting error 및 재연결 횟수.

## Testing Strategy

### Backend unit tests

- 고객 예약 소유권 검증.
- 상담사 expert id 검증.
- 예약 상태와 입장 시간 검증.
- 동일 예약에 대한 Meeting 생성 idempotency.
- Boto3 timeout 및 throttling 오류 매핑.
- 종료된 Meeting 재생성.
- JoinToken이 로그에 포함되지 않는지 검사.
- 동일 언어 선택 시 고정 `LanguageCode`가 사용되는지 검사.
- 혼합 언어 선택 시 `IdentifyLanguage`와 `ko-KR,en-US`만 전달되는지 검사.
- `ko-KR -> ko/en`, `en-US -> en/ko` 번역 코드 매핑 검사.
- 동일 transcript `resultId` 번역 요청의 idempotency 검사.

### Contract tests

- customer join response shape.
- partner join response shape.
- transcription start/stop response.
- customer/partner 언어 선택 request validation.
- translated caption response shape.
- unauthorized, forbidden, booking closed 오류 코드.
- camelCase API envelope 유지.

### Client tests

- 카메라 및 마이크 권한 거절.
- 로컬/원격 video tile 추가와 제거.
- mute, camera off, switch camera.
- 고객 또는 상담사 늦은 입장.
- 네트워크 전환 Wi-Fi <-> LTE.
- 일시적 연결 끊김과 재접속.
- 통화 중 앱 백그라운드 및 복귀.
- 부분 자막이 확정 자막으로 교체되는지.
- 고객/상담사 speaker label 매핑.
- 한국어 원문과 영어 번역 표시.
- 영어 원문과 한국어 번역 표시.
- 부분 자막에 번역 호출이 발생하지 않는지 검사.
- 원문만 보기와 번역 우선 보기 전환.

### End-to-end test

```text
Physical iPhone customer
  <-> Chime meeting in ap-northeast-2
Chrome partner web on macOS
```

실기기와 실제 브라우저 조합으로 10분 이상 통화하며 음성 끊김, 영상 지연, 자막 정확도, 발열, 배터리 사용량을 기록한다.

### 앱 용량 및 성능 테스트

- Chime 추가 전후 Release Archive와 App Thinning Size Report를 같은 설정으로 비교한다.
- 앱 시작과 홈 화면에서는 Chime MeetingSession이 생성되지 않는지 확인한다.
- 지원 대상 중 가장 낮은 사양의 iPhone에서 `540p급/15fps`와 `720p/15fps`를 비교한다.
- 10분 통화로 기능을 검증한 뒤 30분 통화로 메모리, 발열, 배터리를 측정한다.
- Unity AR 화면과 Chime 통화 화면을 3회 왕복하며 카메라, 오디오, observer 누수를 검사한다.
- 통화 종료 후 iOS의 카메라와 마이크 사용 표시가 사라지는지 확인한다.
- 네트워크가 Wi-Fi에서 LTE로 바뀌어도 앱이 종료되거나 영상 세션이 중복 생성되지 않는지 확인한다.

## Rollout Phases

### Phase 0 - Native feasibility spike

- [ ] Chime 추가 전 Release Archive와 콜드 스타트, 홈 유휴 메모리 기준값을 기록한다.
- [ ] Chime iOS SDK를 현재 Unity 포함 빌드에 추가한다.
- [ ] 하드코딩된 테스트 Meeting으로 iPhone과 웹이 참가한다.
- [ ] 카메라, 마이크, 스피커, 블루투스를 검증한다.
- [ ] Unity 화면과 왕복한 뒤 AVAudioSession 복원을 검증한다.
- [ ] Chime을 통화 화면에서만 지연 초기화하고 종료 시 모든 observer와 tile을 해제한다.
- [ ] `540p급/15fps`와 `720p/15fps`의 CPU, 메모리, 발열을 비교한다.
- [ ] 30분 통화와 통화 화면 3회 왕복 테스트를 수행한다.
- [ ] Chime 추가 후 Archive와 App Thinning Size Report 증가량을 기록한다.
- [ ] native SDK 충돌 여부를 기록하고 Go/No-Go를 결정한다.

### Phase 1 - Backend session control

- [ ] `consulting_call_sessions` migration을 추가한다.
- [ ] Chime settings와 ECS IAM을 추가한다.
- [ ] `ChimeMeetingsService`를 구현한다.
- [ ] customer/partner join API를 구현한다.
- [ ] end와 state API를 구현한다.
- [ ] unit/contract tests를 추가한다.

### Phase 2 - Partner web MVP

- [ ] `apps/admin` React + TypeScript 프로젝트를 구성한다.
- [ ] 기존 partner login API를 연결한다.
- [ ] 예약 상세에서 통화 입장 버튼을 제공한다.
- [ ] Chime JS meeting session과 video tile을 구현한다.
- [ ] 장치 선택, 음소거, 카메라, 종료를 구현한다.

### Phase 3 - Customer mobile MVP

- [ ] Chime iOS native bridge를 제품 코드로 정리한다.
- [ ] `consultingCallService.ts`를 추가한다.
- [ ] 임시 `ConsultingCallScreen`을 실제 통화 화면으로 교체한다.
- [ ] 통화 화면 전용 지연 초기화와 공통 resource cleanup을 구현한다.
- [ ] Unity 카메라/오디오 중지 및 복원 계약을 구현한다.
- [ ] 재접속, 오류, 통화 종료 상태를 구현한다.
- [ ] 예약 시간 기반 입장 UI를 연결한다.

### Phase 4 - Korean/English live transcription

- [ ] 자막 동의 UI를 구현한다.
- [ ] 고객과 상담사의 한국어/영어 선택 UI를 구현한다.
- [ ] start/stop transcription API를 구현한다.
- [ ] 웹과 모바일에서 transcript event를 구독한다.
- [ ] 부분/확정 자막 UI를 구현한다.
- [ ] speaker label 매핑을 검증한다.
- [ ] 한국어 고정 통화 정확도와 지연을 측정한다.
- [ ] 영어 고정 통화 정확도와 지연을 측정한다.
- [ ] 한국어/영어 혼합 통화 자동 식별 PoC를 수행한다.
- [ ] 혼합 통화가 기준 미달이면 화자별 고정 언어 스트림 대안으로 전환한다.

### Phase 5 - Korean/English translation and transcript persistence

- [ ] Amazon Translate `ko <-> en`을 연결한다.
- [ ] 확정 자막 전용 번역 API를 구현한다.
- [ ] transcript `resultId` 중복 제거를 구현한다.
- [ ] 기존 booking WebSocket에 번역 자막 이벤트를 추가한다.
- [ ] 자막 저장 동의와 보존 기간을 구현한다.
- [ ] 확정 transcript 저장과 삭제 작업을 구현한다.
- [ ] 기존 상담 요약 API에 transcript 전달을 연결한다.

### Phase 6 - Production hardening

- [ ] EventBridge lifecycle event를 연결한다.
- [ ] CloudWatch dashboard와 alarms를 추가한다.
- [ ] Service Quotas와 동시 통화 한도를 확인한다.
- [ ] 최종 Release Archive의 다운로드/설치 크기를 기록하고 용량 기준을 승인한다.
- [ ] 최저 지원 iPhone에서 30분 통화 성능 기준을 통과한다.
- [ ] 장애 및 재연결 runbook을 작성한다.
- [ ] 개인정보 처리방침과 상담 동의 문구를 검토한다.
- [ ] 비용 예산과 이상 사용 경보를 설정한다.

## Acceptance Criteria

- 고객과 배정 상담사가 동일 예약으로 1:1 영상통화에 참가한다.
- 권한이 없는 고객 또는 상담사는 join API에서 거부된다.
- 앱과 웹 어디에도 AWS 장기 자격 증명이 포함되지 않는다.
- 두 참가자의 마이크, 카메라, 음소거, 종료가 정상 동작한다.
- 일시적 네트워크 장애 후 정상적으로 재접속한다.
- 앱 시작과 홈 화면에서는 Chime MeetingSession을 초기화하지 않는다.
- 통화 종료 후 video tile, observer, MeetingSession, 카메라와 마이크를 모두 해제한다.
- Unity 화면과 통화 화면을 반복해서 이동해도 카메라와 AVAudioSession이 정상 복원된다.
- Chime 추가 전후 App Thinning Size Report가 기록되고 승인된 앱 크기 기준을 만족한다.
- 최저 지원 iPhone의 30분 통화에서 OOM, 앱 종료 또는 지속적인 심각한 발열 상태가 발생하지 않는다.
- 한국어 발화가 화자 레이블과 함께 한국어 원문 자막으로 표시된다.
- 영어 발화가 화자 레이블과 함께 영어 원문 자막으로 표시된다.
- 한국어 확정 자막은 영어 번역과 함께 표시된다.
- 영어 확정 자막은 한국어 번역과 함께 표시된다.
- 부분 자막은 확정 자막으로 자연스럽게 교체된다.
- 부분 자막은 번역 API를 호출하지 않는다.
- 한·영 혼합 통화 자동 식별이 테스트 기준을 통과하거나 화자별 스트림 대안이 적용된다.
- 자막 미동의 상태에서는 Transcribe가 시작되지 않는다.
- 통화 종료 후 Meeting과 transcription 상태가 정리된다.
- CloudWatch에서 생성, 입장, 자막 시작, 종료 실패를 추적할 수 있다.

## Main Risks

### React Native native integration

공식 iOS SDK는 제공되지만 React Native용 drop-in 패키지를 그대로 제품 의존성으로 사용하기보다 얇은 네이티브 브리지를 유지하는 편이 안전하다. Phase 0에서 현재 Expo/Unity 빌드와의 충돌을 먼저 검증한다.

### AVAudioSession and camera contention

Unity AR 카메라, React Native 카메라, Chime 카메라가 동시에 살아 있으면 충돌할 수 있다. 통화 진입 전에 다른 캡처 세션을 명시적으로 종료하고 통화 종료 후 필요한 세션만 다시 시작한다.

### App binary size

앱 용량 증가의 대부분은 Chime 미디어 프레임워크에서 발생한다. 저장소에 포함된 SDK 압축 파일 크기를 제품 앱 증가량으로 보고하지 않고, 동일한 Release 설정의 Chime 추가 전후 Archive와 App Thinning Size Report로 판단한다. SDK를 업데이트할 때도 같은 비교를 반복한다.

### Runtime performance and thermal pressure

Unity와 Chime을 동시에 활성화하면 메모리, GPU, 카메라, 오디오, 발열 문제가 커질 수 있다. Chime은 통화 화면에서만 초기화하고 Unity capture를 먼저 중지한다. 초기 영상은 15fps로 제한하며 30분 실기기 테스트를 통과한 설정만 운영 기본값으로 사용한다.

### Duplicate meeting creation

고객과 상담사가 동시에 첫 입장을 누를 수 있다. 예약 단위 lock, 결정적 `ClientRequestToken`, DB unique constraint를 함께 사용한다.

### Transcript accuracy

제품명, 브랜드명, 시술명은 기본 음성 인식 정확도가 낮을 수 있다. 실제 상담 문장으로 측정한 뒤 지원되는 custom vocabulary와 후처리 사전을 검토한다.

### Mixed-language identification

Chime Live Transcription은 `IdentifyLanguage`를 제공하지만 Meeting 설정에서 `IdentifyMultipleLanguages`를 직접 제공하지 않는다. 한·영 혼합 통화는 구현 전에 실제 두 화자 테스트를 통과해야 하며, 실패하면 화자별 고정 언어 Transcribe 스트림으로 전환한다.

### Privacy

영상통화와 음성 인식은 별도 동의가 필요하다. 녹화하지 않는다는 사실과 자막 저장 여부를 UI와 정책에서 명확히 구분한다.

### Cost

Chime은 attendee-minute, Transcribe는 스트리밍 시간 기준으로 비용이 발생한다. 개발 환경에서 자동 통화를 방치하지 않고 예산 알림과 최대 상담 시간을 적용한다.

확정 문장마다 Amazon Translate 비용도 발생하므로 부분 결과를 번역하지 않고 `resultId`로 중복 호출을 차단한다.

## Recommended First Milestone

첫 완료 목표는 다음 하나로 제한한다.

```text
Confirmed booking
  -> customer iPhone joins
  -> partner Chrome joins
  -> two-way audio/video works for 10 minutes
  -> no transcription, recording, translation yet
```

이 단계가 안정화된 후 Live Transcription을 추가한다. 영상통화와 자막을 동시에 처음부터 구현하면 네이티브 오디오 문제와 Transcribe 문제를 분리하기 어렵다.

두 번째 완료 목표는 다음과 같다.

```text
ko-KR speaker -> Korean source caption -> English final translation
en-US speaker -> English source caption -> Korean final translation
mixed call -> passes language identification quality gate or uses per-speaker fallback
```

## References

- Amazon Chime SDK meetings: https://docs.aws.amazon.com/chime-sdk/latest/dg/meetings-sdk.html
- Creating Chime meetings: https://docs.aws.amazon.com/chime-sdk/latest/dg/create-meeting.html
- Chime SDK available regions: https://docs.aws.amazon.com/chime-sdk/latest/dg/sdk-available-regions.html
- Chime SDK live transcription: https://docs.aws.amazon.com/chime-sdk/latest/dg/meeting-transcription.html
- Starting and stopping transcription: https://docs.aws.amazon.com/chime-sdk/latest/dg/initiate-transcription.html
- Amazon Transcribe streaming: https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
- Amazon Transcribe supported languages: https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html
- Amazon Transcribe streaming language identification: https://docs.aws.amazon.com/transcribe/latest/dg/lang-id-stream.html
- Chime EngineTranscribeSettings: https://docs.aws.amazon.com/chime-sdk/latest/APIReference/API_meeting-chime_EngineTranscribeSettings.html
- Amazon Translate real-time API: https://docs.aws.amazon.com/translate/latest/dg/sync-api.html
- Amazon Chime SDK for JavaScript: https://github.com/aws/amazon-chime-sdk-js
- Amazon Chime SDK for iOS: https://github.com/aws/amazon-chime-sdk-ios
- Amazon Chime SDK for iOS API documentation: https://aws.github.io/amazon-chime-sdk-ios/
- Apple app size optimization: https://developer.apple.com/documentation/xcode/reducing-your-app-s-size
