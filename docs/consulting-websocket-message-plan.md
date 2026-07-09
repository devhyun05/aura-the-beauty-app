# Consulting Message WebSocket Plan

## Decision

상담 메시지는 WebSocket 중심으로 구현한다.

메시지 본문과 첨부 연결은 DB에 영구 저장한다. WebSocket은 저장소가 아니라 실시간 전달 채널이다. 서버는 `message.send`를 받으면 먼저 `consulting_messages`/`consulting_message_media`에 저장하고, 저장에 성공한 메시지만 같은 예약 방에 접속한 모바일 앱과 consulting-web으로 broadcast한다.

Firebase Firestore는 사용하지 않는다. Firebase/FCM 또는 Expo Push는 앱이 백그라운드에 있을 때 알림이 필요해지는 후속 단계에서만 검토한다.

## Goals

- 모바일 앱 사용자와 consulting-web 상담사가 같은 예약 기준으로 실시간 메시지를 주고받는다.
- 메시지 전송, 수신, 입력 중, 읽음, 연결 상태를 소켓 이벤트로 처리한다.
- 사진 첨부는 소켓에 바이너리를 싣지 않고 기존 업로드 API/S3에 먼저 올린 뒤 media id 또는 media URL만 메시지 이벤트에 포함한다.
- 서버 재시작/재배포 후에도 DB에서 이전 메시지를 다시 불러온다.
- 모바일의 `ConsultingConversationScreen` local mock 흐름과 consulting-web의 mock `ChatPage` 흐름을 같은 WebSocket contract로 교체한다.
- MVP는 단일 FastAPI 인스턴스 room manager와 PostgreSQL 영구 저장으로 구현하고, 운영 확장 단계에서 Redis Pub/Sub을 붙인다.

## Non-Goals

- Firebase Firestore, Sendbird, Stream 같은 외부 채팅 솔루션 도입.
- 오프라인 상태에서 서버 큐에 메시지를 보관했다가 재전송.
- 통화 기능 구현. 전화/화상은 메시지 이후 별도 계획으로 분리한다.

## Current Entry Points

- Mobile screen: `apps/mobile/src/features/consulting/screens/ConsultingConversationScreen.tsx`
- Mobile API helper: `apps/mobile/src/shared/services/backendApi.ts`
- Mobile upload helper: `apps/mobile/src/shared/services/mediaUploadService.ts`
- Backend consulting router: `services/backend/app/api/consulting.py`
- Backend API router: `services/backend/app/api/router.py`
- Web chat page: `/Users/yeoduchi/Documents/consulting-web/src/features/chat/ChatPage.tsx`
- Web mock API seam: `/Users/yeoduchi/Documents/consulting-web/src/services/api.ts`

## Architecture

```text
Mobile app
  WebSocket: /api/consulting/ws/bookings/{bookingId}
        |
FastAPI consulting realtime router
        |
PostgreSQL: consulting_messages + consulting_message_media
        |
In-memory booking room manager
        |
  WebSocket: /api/consulting/ws/bookings/{bookingId}
consulting-web
```

The WebSocket endpoint is added to the main backend under `services/backend/app/api`, then included in `api_router` so the public path stays under `/api`.

The first implementation uses a process-local room map:

```text
bookingId -> active connections[]
```

The room map is intentionally ephemeral. If the backend restarts, sockets reconnect and active presence is rebuilt, but old messages are reloaded from PostgreSQL through `message.history`.

## Message Contract

All socket payloads are JSON objects.

Common fields:

- `type`: event type.
- `bookingId`: 예약 id.
- `clientMessageId`: client-generated id for optimistic UI and duplicate suppression.
- `sentAt`: ISO timestamp set by the server for delivered messages.

Client to server:

```ts
type ClientSocketEvent =
  | {
      type: 'message.send';
      bookingId: string;
      clientMessageId: string;
      body: string;
      mediaIds?: string[];
    }
  | {
      type: 'typing';
      bookingId: string;
      isTyping: boolean;
    }
  | {
      type: 'read';
      bookingId: string;
      readAt: string;
    }
  | {
      type: 'ping';
      at: string;
    };
```

Server to client:

```ts
type ServerSocketEvent =
  | {
      type: 'connected';
      bookingId: string;
      connectionId: string;
      participantType: 'user' | 'expert' | 'operator';
    }
  | {
      type: 'message.history';
      bookingId: string;
      messages: Array<Extract<ServerSocketEvent, {type: 'message.new'}>>;
    }
  | {
      type: 'message.new';
      id: string;
      bookingId: string;
      clientMessageId?: string;
      senderType: 'user' | 'expert' | 'operator' | 'system';
      senderName: string;
      body: string;
      media?: Array<{
        id: string;
        cdnUrl?: string | null;
        thumbnailUrl?: string | null;
        contentType?: string | null;
      }>;
      mediaIds?: string[];
      sentAt: string;
    }
  | {
      type: 'message.ack';
      bookingId: string;
      clientMessageId: string;
      messageId: string;
      sentAt: string;
    }
  | {
      type: 'typing';
      bookingId: string;
      senderType: 'user' | 'expert' | 'operator';
      isTyping: boolean;
    }
  | {
      type: 'read';
      bookingId: string;
      senderType: 'user' | 'expert' | 'operator';
      readAt: string;
    }
  | {
      type: 'presence';
      bookingId: string;
      participants: Array<{
        participantType: 'user' | 'expert' | 'operator';
        connectionCount: number;
      }>;
    }
  | {
      type: 'pong';
      at: string;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      clientMessageId?: string;
    };
```

## Backend Plan

### Milestone 1. Realtime Router

Priority: P0

Tasks:

- Add `services/backend/app/api/consulting_realtime.py`.
- Add a WebSocket route:
  - `/consulting/ws/bookings/{booking_id}`
  - Public path after router prefix: `/api/consulting/ws/bookings/{bookingId}`
- Include the router in `services/backend/app/api/router.py`.
- Parse auth token from one of:
  - `Authorization: Bearer ...` if the client supports it.
  - `?token=...` for React Native/WebSocket compatibility.
- Reuse Cognito verification behavior from `services/backend/app/core/security.py`.
- In local dev with `auth_required=false`, allow the existing dev auth context.

Acceptance:

- A test client can connect to `/api/consulting/ws/bookings/{bookingId}`.
- Invalid token closes the socket with a policy/error code.

### Milestone 2. Room Authorization

Priority: P0

Tasks:

- Add a helper that checks whether the socket participant can enter the booking room.
- Mobile user can enter only when `consulting_bookings.user_id` matches the authenticated app user.
- Expert/operator can enter when the consulting-web account is allowed for `booking.expert_id`.
- For MVP while consulting-web auth is still mock, support a clearly marked dev-only expert token or dev query parameter behind local environment only.
- Return a socket error and close the connection when the booking does not exist or access is denied.

Acceptance:

- Users cannot join another user's booking room.
- Expert-side development remains possible before final consulting-web auth is complete.

### Milestone 3. Persistent Message Store And Room Manager

Priority: P0

Tasks:

- Add `services/backend/app/services/consulting_realtime.py`.
- Add `services/backend/app/services/consulting_message_store.py`.
- Add DB tables:
  - `consulting_messages`
  - `consulting_message_media`
- Implement `ConnectionManager`.
- Track connections by booking id.
- Track participant type and connection id.
- Broadcast `message.new`, `typing`, `read`, and `presence` to all connections in the room.
- On `message.send`, persist the message first, then send `message.ack` and broadcast `message.new`.
- Use `clientMessageId` with a DB unique constraint for duplicate suppression.
- On socket connect, send `message.history` with recent persisted messages.

Acceptance:

- Two sockets connected to the same booking receive each other's messages.
- Sockets connected to different bookings do not receive those messages.
- Reconnecting to the same booking returns previous messages from DB.
- Disconnect removes the connection and broadcasts updated presence.

### Milestone 4. Validation And Failure Behavior

Priority: P1

Tasks:

- Reject empty `message.send` when no body and no media ids exist.
- Enforce body max length, recommended: 1000 characters.
- Enforce media count, recommended: max 10 per message.
- Validate media ownership before broadcasting media ids.
- Handle malformed JSON with `{type: "error", code: "INVALID_EVENT"}`.
- Handle unsupported event types with `{type: "error", code: "UNSUPPORTED_EVENT"}`.
- Keep WebSocket messages camelCase to match existing frontend code style.

Acceptance:

- Bad payloads do not crash the socket handler.
- The sender gets a useful error event.

## Mobile Plan

### Milestone 5. Socket Service

Priority: P0

Tasks:

- Add `apps/mobile/src/features/consulting/services/consultingRealtimeService.ts`.
- Build WebSocket URL from `EXPO_PUBLIC_API_BASE_URL`.
  - `http://.../api` maps to `ws://.../api`.
  - `https://.../api` maps to `wss://.../api`.
- Add token query parameter from the same auth token provider used by backend API calls.
- Expose a small client:
  - `connectConsultingConversationSocket`
  - `sendMessage`
  - `sendTyping`
  - `sendRead`
  - `close`
- Add reconnect with bounded exponential backoff.

Acceptance:

- The service connects locally and receives `connected`.
- Reconnect state can be observed by the screen.

### Milestone 6. Conversation Screen Integration

Priority: P0

Tasks:

- Replace local seeded message-only state in `ConsultingConversationScreen`.
- Keep local UI state for ephemeral messages:
  - `pending`
  - `sent`
  - `failed`
- Generate `clientMessageId` on send.
- Render optimistic user bubble immediately.
- Convert `message.ack` into `sent`.
- Convert `message.new` from the other side into a new bubble.
- Show connection states:
  - connecting
  - connected
  - reconnecting
  - offline
- Disable send while disconnected, or mark message failed with retry.
- Keep keyboard and safe-area behavior intact.

Acceptance:

- Mobile can send a message to a connected web client.
- Mobile can receive a message from web without refresh.
- Failed sends can be retried.

### Milestone 7. Image Attachment Flow

Priority: P1

Tasks:

- Continue using `uploadMediaAsset`.
- Use `mediaKind: "consulting-chat"` for chat images.
- Upload image first.
- Send `message.send` with `mediaIds`.
- Render image attachment from the `message.new` payload.

Acceptance:

- Images are not sent through WebSocket as base64 or binary payloads.
- A sent image appears in both mobile and web chat UI.

## consulting-web Plan

### Milestone 8. Web Socket Client

Priority: P0

Tasks:

- Add a WebSocket helper in `/Users/yeoduchi/Documents/consulting-web/src/services`.
- Build the socket URL from `VITE_API_BASE_URL`.
- Replace mock `sendMessage` behavior for chat with socket send.
- Keep React Query for non-realtime lists if needed, but use socket events for the active conversation.
- Store active conversation messages in component state.
- Add reconnect and connection status display.

Acceptance:

- Web can join the same booking room as mobile.
- Web sends messages that appear on mobile immediately.
- Web receives mobile messages without query invalidation/refetch.

### Milestone 9. Chat Page Integration

Priority: P0

Tasks:

- Update `/Users/yeoduchi/Documents/consulting-web/src/features/chat/ChatPage.tsx`.
- Connect when an active thread or booking is selected.
- Disconnect when active booking changes.
- Render optimistic expert/operator messages.
- Render `typing`, `read`, and `presence` if time allows.
- Leave the existing phone button as an action placeholder.

Acceptance:

- Active chat window behaves like a realtime conversation.
- Switching customers does not leak messages across rooms.

## Deployment Plan

### Milestone 10. MVP Deployment

Priority: P1

Tasks:

- Confirm ECS/CloudFront path supports WebSocket upgrade.
- Confirm CORS/origin policy allows consulting-web and mobile dev origins.
- Run the first production-like test with one backend task only.
- Set health and logs for socket connect/disconnect/message errors.

Acceptance:

- Mobile and deployed consulting-web can hold a WebSocket connection through the public API URL.

### Milestone 11. Scale Upgrade With Redis Pub/Sub

Priority: P2

Trigger:

- More than one backend task is running, or sticky sessions cannot be guaranteed.

Tasks:

- Add Redis or ElastiCache.
- On `message.send`, publish event to a Redis channel by booking id.
- Every backend task subscribes and broadcasts to its local room connections.
- Keep message content ephemeral; Redis Pub/Sub is transport, not message storage.

Acceptance:

- Mobile and web still receive each other's messages even when connected to different backend tasks.

## Test Plan

Backend:

- Unit test `ConnectionManager` room isolation.
- Unit test duplicate `clientMessageId` handling.
- WebSocket integration test with two clients in one booking room.
- WebSocket integration test with two booking rooms.
- Authorization tests for invalid token and wrong booking user.

Mobile:

- Typecheck: `npm --prefix apps/mobile run typecheck`.
- Service tests for URL conversion from HTTP/HTTPS to WS/WSS.
- Screen-level tests for optimistic, ack, failed, and received message states where existing test setup allows.

consulting-web:

- Typecheck/build: `npm run typecheck` or `npm run build` from `/Users/yeoduchi/Documents/consulting-web`.
- Manual two-window test with mobile simulator or a second browser socket client.

Manual verification:

1. Start backend locally.
2. Open consulting-web chat.
3. Open mobile consulting conversation for the same booking.
4. Send mobile to web.
5. Send web to mobile.
6. Toggle airplane mode/network disconnect on mobile.
7. Confirm reconnect state and retry behavior.
8. Send an image and confirm it renders on both sides.

## Open Questions

- consulting-web final auth model: Cognito, manager-only dev token, or separate partner auth?
- Should messages intentionally disappear after refresh for MVP, or should clients keep local-only cache with `localStorage`/AsyncStorage?
- Which actor names should be shown for expert/operator messages before partner account data is finalized?
- Should typing/read events ship in the first implementation or wait until basic send/receive is stable?
- Is Redis available in the current AWS environment, or should the first deployment pin backend desired count to 1?

## Implementation Order

1. Backend WebSocket route and in-memory room manager.
2. Backend auth/booking room guard.
3. Minimal web socket test client or automated WebSocket integration test.
4. Mobile realtime service.
5. Mobile conversation screen integration.
6. consulting-web socket service.
7. consulting-web `ChatPage` integration.
8. Image attachment over existing upload flow.
9. Deployment WebSocket upgrade verification.
10. Redis Pub/Sub only after multi-instance deployment is required.
