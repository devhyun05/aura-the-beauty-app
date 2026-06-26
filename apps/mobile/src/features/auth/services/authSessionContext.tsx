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
import * as SecureStore from 'expo-secure-store';

import {setBackendAuthTokenProvider} from '../../../shared/services/backendApi';
import type {AuthSession} from '../types';

export const AUTH_SESSION_PROVIDER_ERROR =
  'useAuthSession must be used inside AuthSessionProvider';

const AUTH_SESSION_STORAGE_KEY = 'aura.auth.session.v1';

type AuthSessionContextValue = {
  clearSession: () => Promise<void>;
  getAuthToken: () => string | null;
  isRestoringSession: boolean;
  session: AuthSession | null;
  setSession: (session: AuthSession | null) => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function getTokenFromSession(session: AuthSession | null): string | null {
  return session?.idToken ?? session?.accessToken ?? null;
}

function parseStoredSession(value: string | null): AuthSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as AuthSession;

    if (!parsed.accessToken || !parsed.provider || !parsed.user?.id) {
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
  const [session, setSessionState] = useState<AuthSession | null>(initialSession);
  const [isRestoringSession, setIsRestoringSession] = useState(initialSession === null);
  const sessionRef = useRef<AuthSession | null>(session);

  const setSession = useCallback(async (nextSession: AuthSession | null) => {
    sessionRef.current = nextSession;
    setSessionState(nextSession);
    await saveSessionToSecureStore(nextSession);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setBackendAuthTokenProvider(() => getTokenFromSession(sessionRef.current));

    return () => setBackendAuthTokenProvider(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const storedSession = parseStoredSession(
          await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY),
        );

        if (!isMounted) {
          return;
        }

        sessionRef.current = storedSession;
        setSessionState(storedSession);
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    if (initialSession) {
      setIsRestoringSession(false);
      return () => {
        isMounted = false;
      };
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, [initialSession]);

  const clearSession = useCallback(async () => {
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
