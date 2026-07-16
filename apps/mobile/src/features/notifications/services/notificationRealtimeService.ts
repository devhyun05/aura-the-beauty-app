import {AppState} from 'react-native';

import {getBackendApiBaseUrl} from '../../../shared/services/backendApi';
import type {AppNotification} from '../types';


export type NotificationRealtimeEvent =
  | {type: 'connected'}
  | {type: 'pong'}
  | {
      notification: AppNotification;
      type: 'notification.created';
    };

type ConnectNotificationRealtimeOptions = {
  authToken: string;
  onEvent: (event: NotificationRealtimeEvent) => void;
};

export type NotificationRealtimeClient = {
  close: () => void;
  reconnect: () => void;
};

const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 20000;

export function buildNotificationWebSocketUrl(): string {
  const apiBaseUrl = getBackendApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is required for notification realtime.',
    );
  }

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/notifications/ws`;
  return url.toString();
}

function parseEvent(value: unknown): NotificationRealtimeEvent | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      notification?: unknown;
      type?: unknown;
    };
    if (
      parsed.type === 'notification.created' &&
      parsed.notification &&
      typeof parsed.notification === 'object'
    ) {
      return parsed as NotificationRealtimeEvent;
    }
    if (parsed.type === 'connected' || parsed.type === 'pong') {
      return parsed as NotificationRealtimeEvent;
    }
  } catch {
    return null;
  }
  return null;
}

export function connectNotificationRealtime({
  authToken,
  onEvent,
}: ConnectNotificationRealtimeOptions): NotificationRealtimeClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempt = 0;
  let closedByClient = false;
  let appIsActive = AppState.currentState === 'active';

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    if (closedByClient || !appIsActive) {
      return;
    }
    reconnectAttempt += 1;
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** Math.max(0, reconnectAttempt - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    clearReconnectTimer();
    clearHeartbeat();
    if (closedByClient || !appIsActive) {
      return;
    }

    try {
      const ReactNativeWebSocket = WebSocket as unknown as {
        new (
          url: string,
          protocols?: string | string[],
          options?: {headers?: Record<string, string>},
        ): WebSocket;
      };
      socket = new ReactNativeWebSocket(
        buildNotificationWebSocketUrl(),
        undefined,
        {headers: {Authorization: `Bearer ${authToken}`}},
      );
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectAttempt = 0;
      heartbeatTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({type: 'ping'}));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };
    socket.onmessage = event => {
      const parsed = parseEvent(event.data);
      if (parsed) {
        onEvent(parsed);
      }
    };
    socket.onerror = () => undefined;
    socket.onclose = () => {
      socket = null;
      clearHeartbeat();
      scheduleReconnect();
    };
  };

  const appStateSubscription = AppState.addEventListener(
    'change',
    nextState => {
      appIsActive = nextState === 'active';
      if (appIsActive) {
        reconnectAttempt = 0;
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          connect();
        }
        return;
      }

      clearReconnectTimer();
      clearHeartbeat();
      socket?.close();
      socket = null;
    },
  );

  connect();

  return {
    close: () => {
      closedByClient = true;
      clearReconnectTimer();
      clearHeartbeat();
      appStateSubscription.remove();
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
    },
    reconnect: () => {
      if (closedByClient || !appIsActive) {
        return;
      }
      reconnectAttempt = 0;
      clearReconnectTimer();
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      connect();
    },
  };
}
