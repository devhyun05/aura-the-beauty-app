import {getBackendApiBaseUrl} from '../../../shared/services/backendApi';

export type ConsultingParticipantType = 'user' | 'expert' | 'operator';

export type ConsultingSocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export type ConsultingRealtimeMessageEvent = {
  bookingId: string;
  body: string;
  clientMessageId?: string;
  id: string;
  media?: Array<{
    cdnUrl?: string | null;
    contentType?: string | null;
    id: string;
    thumbnailUrl?: string | null;
  }>;
  mediaIds?: string[];
  senderName: string;
  senderType: ConsultingParticipantType | 'system';
  sentAt: string;
  type: 'message.new';
};

export type ConsultingCaptionTranslationEvent = {
  bookingId: string;
  resultId: string;
  sourceLanguageCode: 'ko-KR' | 'en-US';
  targetLanguageCode: 'ko' | 'en';
  translatedContent: string;
  type: 'caption.translation';
};

export type ConsultingClientSocketEvent =
  | {
      at: string;
      type: 'ping';
    }
  | {
      body: string;
      bookingId: string;
      clientMessageId: string;
      mediaIds?: string[];
      type: 'message.send';
    }
  | {
      bookingId: string;
      isTyping: boolean;
      type: 'typing';
    }
  | {
      bookingId: string;
      readAt: string;
      type: 'read';
    };

export type ConsultingServerSocketEvent =
  | {
      bookingId: string;
      connectionId: string;
      participantType: ConsultingParticipantType;
      type: 'connected';
    }
  | {
      bookingId: string;
      messages: ConsultingRealtimeMessageEvent[];
      type: 'message.history';
    }
  | ConsultingRealtimeMessageEvent
  | ConsultingCaptionTranslationEvent
  | {
      bookingId: string;
      message: string;
      status: string;
      type: 'booking.status';
    }
  | {
      bookingId: string;
      callSessionId?: string | null;
      message: string;
      status: 'started' | 'ended';
      type: 'call.status';
    }
  | {
      bookingId: string;
      clientMessageId: string;
      messageId: string;
      sentAt: string;
      type: 'message.ack';
    }
  | {
      bookingId: string;
      isTyping: boolean;
      senderType: ConsultingParticipantType;
      type: 'typing';
    }
  | {
      bookingId: string;
      readAt?: string | null;
      senderType: ConsultingParticipantType;
      type: 'read';
    }
  | {
      bookingId: string;
      participants: Array<{
        connectionCount: number;
        participantType: ConsultingParticipantType;
      }>;
      type: 'presence';
    }
  | {
      at?: string;
      type: 'pong';
    }
  | {
      clientMessageId?: string;
      code: string;
      message: string;
      type: 'error';
    };

type ConnectConsultingConversationSocketOptions = {
  authToken?: string | null;
  bookingId: string;
  onEvent: (event: ConsultingServerSocketEvent) => void;
  onStatusChange?: (status: ConsultingSocketStatus) => void;
  participantType?: ConsultingParticipantType;
};

export type ConsultingConversationSocketClient = {
  close: () => void;
  reconnect: () => void;
  send: (event: ConsultingClientSocketEvent) => boolean;
  sendMessage: (payload: {
    body: string;
    bookingId: string;
    clientMessageId: string;
    mediaIds?: string[];
  }) => boolean;
  sendRead: (bookingId: string) => boolean;
  sendTyping: (bookingId: string, isTyping: boolean) => boolean;
};

const MAX_RECONNECT_DELAY_MS = 5000;
const INITIAL_RECONNECT_DELAY_MS = 500;

function getRealtimeBaseUrl(): URL {
  const apiBaseUrl = getBackendApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for consulting realtime.');
  }

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

export function buildConsultingWebSocketUrl({
  authToken,
  bookingId,
  participantType = 'user',
}: {
  authToken?: string | null;
  bookingId: string;
  participantType?: ConsultingParticipantType;
}): string {
  const url = getRealtimeBaseUrl();
  url.pathname = `${url.pathname}/consulting/ws/bookings/${encodeURIComponent(bookingId)}`;
  url.searchParams.set('participantType', participantType);

  if (authToken) {
    url.searchParams.set('token', authToken);
  }

  return url.toString();
}

function parseSocketEvent(data: unknown): ConsultingServerSocketEvent | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as {type?: unknown};
    return typeof parsed.type === 'string' ? (parsed as ConsultingServerSocketEvent) : null;
  } catch {
    return null;
  }
}

export function connectConsultingConversationSocket({
  authToken,
  bookingId,
  onEvent,
  onStatusChange,
  participantType = 'user',
}: ConnectConsultingConversationSocketOptions): ConsultingConversationSocketClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let closedByClient = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const setStatus = (status: ConsultingSocketStatus) => {
    onStatusChange?.(status);
  };

  const connect = () => {
    clearReconnectTimer();
    setStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    try {
      socket = new WebSocket(
        buildConsultingWebSocketUrl({
          authToken,
          bookingId,
          participantType,
        }),
      );
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectAttempt = 0;
      setStatus('connected');
    };

    socket.onmessage = event => {
      const parsed = parseSocketEvent(event.data);

      if (parsed) {
        onEvent(parsed);
      }
    };

    socket.onerror = () => {
      if (!closedByClient) {
        setStatus('offline');
      }
    };

    socket.onclose = () => {
      socket = null;

      if (closedByClient) {
        setStatus('idle');
        return;
      }

      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    reconnectAttempt += 1;
    setStatus('reconnecting');
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** Math.max(0, reconnectAttempt - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectTimer = setTimeout(connect, delay);
  };

  const send = (event: ConsultingClientSocketEvent): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(event));
    return true;
  };

  connect();

  return {
    close: () => {
      closedByClient = true;
      clearReconnectTimer();
      socket?.close();
      socket = null;
      setStatus('idle');
    },
    reconnect: () => {
      if (closedByClient) {
        return;
      }
      reconnectAttempt = 0;
      clearReconnectTimer();
      if (socket) {
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      socket = null;
      connect();
    },
    send,
    sendMessage: payload =>
      send({
        ...payload,
        type: 'message.send',
      }),
    sendRead: currentBookingId =>
      send({
        bookingId: currentBookingId,
        readAt: new Date().toISOString(),
        type: 'read',
      }),
    sendTyping: (currentBookingId, isTyping) =>
      send({
        bookingId: currentBookingId,
        isTyping,
        type: 'typing',
      }),
  };
}
