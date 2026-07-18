import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from '../../../shared/services/localSecureStore';

import {setBackendAuthTokenProvider} from '../../../shared/services/backendApi';
import {clearMyPageProfileSummaryCache} from '../../../shared/services/profileService';
import {clearCachedUserProfile} from '../../../shared/services/userService';
import {invalidateMakeupJourneyCache} from '../../makeup-journey/services/makeupJourneyCache';
import {resetProductEventCollection} from '../../recommendation/services/productEventService';
import {unregisterCurrentPushDevice} from '../../notifications/services/notificationService';
import {refreshAuthSession} from './authService';
import type {AuthSession} from '../types';

export const AUTH_SESSION_PROVIDER_ERROR =
  'useAuthSession must be used inside AuthSessionProvider';

const AUTH_SESSION_STORAGE_KEY = 'aura.auth.session.v1';
const JWT_EXPIRY_LEEWAY_SECONDS = 60;

type AuthSessionContextValue = {
  clearSession: () => Promise<void>;
  getAuthToken: () => string | null;
  isRestoringSession: boolean;
  session: AuthSession | null;
  setSession: (session: AuthSession | null) => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

type JwtClaims = {
  exp?: number;
};

function decodeBase64UrlJson<T>(token: string | undefined): T | null {
  const encodedPayload = token?.split('.')[1];

  if (!encodedPayload) {
    return null;
  }

  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = globalThis.atob(paddedBase64);
    const json = decodeURIComponent(
      Array.from(binary)
        .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );

    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function isJwtUsable(token: string | undefined): token is string {
  const claims = decodeBase64UrlJson<JwtClaims>(token);

  if (!claims?.exp) {
    return false;
  }

  const currentSeconds = Math.floor(Date.now() / 1000);

  return claims.exp > currentSeconds + JWT_EXPIRY_LEEWAY_SECONDS;
}

function getUsableTokenFromSession(session: AuthSession | null): string | null {
  if (isJwtUsable(session?.idToken)) {
    return session.idToken;
  }

  if (isJwtUsable(session?.accessToken)) {
    return session.accessToken;
  }

  return null;
}

function getTokenFromSession(session: AuthSession | null): string | null {
  return getUsableTokenFromSession(session);
}

function parseStoredSession(value: string | null): AuthSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as AuthSession;

    if (
      !parsed.accessToken ||
      !parsed.provider ||
      !parsed.user?.id
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function saveSessionToSecureStore(session: AuthSession | null): Promise<void> {
  if (!session) {
    await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

type AuthSessionProviderProps = {
  children: ReactNode;
  initialSession?: AuthSession | null;
};

export function AuthSessionProvider({
  children,
  initialSession = null,
}: AuthSessionProviderProps) {
  const initialUsableSession = getUsableTokenFromSession(initialSession) ? initialSession : null;
  const [session, setSessionState] = useState<AuthSession | null>(initialUsableSession);
  const [isRestoringSession, setIsRestoringSession] = useState(initialSession === null);
  const sessionRef = useRef<AuthSession | null>(session);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const setSession = useCallback(async (nextSession: AuthSession | null) => {
    const previousUserId = sessionRef.current?.user.id ?? null;
    const nextUserId = nextSession?.user.id ?? null;
    const userChanged = previousUserId !== nextUserId;

    if (userChanged) {
      resetProductEventCollection();
      clearMyPageProfileSummaryCache();
      await clearCachedUserProfile();
    }

    sessionRef.current = nextSession;
    setSessionState(nextSession);
    if (userChanged) {
      invalidateMakeupJourneyCache();
    }
    await saveSessionToSecureStore(nextSession);
  }, []);

  const refreshSessionIfNeeded = useCallback(async () => {
    const currentSession = sessionRef.current;

    if (!currentSession || getUsableTokenFromSession(currentSession)) {
      return true;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      const refreshedSession = await refreshAuthSession(currentSession);

      if (!refreshedSession || !getUsableTokenFromSession(refreshedSession)) {
        await setSession(null);
        return false;
      }

      await setSession(refreshedSession);
      return true;
    })().finally(() => {
      refreshInFlightRef.current = null;
    });

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [setSession]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    // Optional product events must never cross an account switch or logout.
    resetProductEventCollection();
  }, [session?.user.id]);

  useEffect(() => {
    setBackendAuthTokenProvider(() => getTokenFromSession(sessionRef.current));

    return () => setBackendAuthTokenProvider(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const storedValue = await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY);
        const storedSession = parseStoredSession(storedValue);
        const shouldRefreshStoredSession = Boolean(
          storedSession && !getUsableTokenFromSession(storedSession),
        );
        const restoredSession = shouldRefreshStoredSession && storedSession
          ? await refreshAuthSession(storedSession)
          : storedSession;

        if (!isMounted) {
          return;
        }

        if (storedValue && !restoredSession) {
          await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
        }

        sessionRef.current = restoredSession;
        setSessionState(restoredSession);
        if (restoredSession && shouldRefreshStoredSession) {
          await saveSessionToSecureStore(restoredSession);
        }
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    if (initialUsableSession) {
      setIsRestoringSession(false);
      return () => {
        isMounted = false;
      };
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, [initialUsableSession]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const refreshTimer = setInterval(() => {
      void refreshSessionIfNeeded();
    }, 30000);

    void refreshSessionIfNeeded();

    return () => clearInterval(refreshTimer);
  }, [refreshSessionIfNeeded, session]);

  const clearSession = useCallback(async () => {
    if (sessionRef.current) {
      await unregisterCurrentPushDevice().catch(() => undefined);
    }
    await setSession(null);
  }, [setSession]);

  const getAuthToken = useCallback(() => getTokenFromSession(sessionRef.current), []);

  const value = useMemo(
    () => ({
      clearSession,
      getAuthToken,
      isRestoringSession,
      session,
      setSession,
    }),
    [clearSession, getAuthToken, isRestoringSession, session, setSession],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error(AUTH_SESSION_PROVIDER_ERROR);
  }

  return context;
}
