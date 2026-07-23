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

import {
  AuthRefreshTemporarilyUnavailableError,
  setBackendAuthTokenProvider,
  setBackendAuthTokenRefreshProvider,
} from '../../../shared/services/backendApi';
import {clearMyPageProfileSummaryCache} from '../../../shared/services/profileService';
import {clearCachedUserProfile} from '../../../shared/services/userService';
import {invalidateMakeupJourneyCache} from '../../makeup-journey/services/makeupJourneyCache';
import {clearMakeupJourneyPrivateImageMemoryCache} from '../../makeup-journey/services/makeupJourneyPrivateImage';
import {clearMakeupDiscoveryCache} from '../../makeup-recommendation/state/makeupRecommendationDiscoveryReducer';
import {resetProductEventCollection} from '../../recommendation/services/productEventService';
import {clearProductHubRecommendationCache} from '../../recommendation/services/productHubService';
import {unregisterCurrentPushDevice} from '../../notifications/services/notificationService';
import {
  clearGoldenMaskPendingUploadsForUser,
  handleGoldenMaskAuthUserChanged,
} from '../../face-capture/services/goldenMaskUploadService';
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
  const goldenMaskUserIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const setSession = useCallback(async (nextSession: AuthSession | null) => {
    const previousUserId = sessionRef.current?.user.id ?? null;
    const nextUserId = nextSession?.user.id ?? null;
    const userChanged = previousUserId !== nextUserId;

    if (userChanged) {
      resetProductEventCollection();
      clearProductHubRecommendationCache();
      clearMyPageProfileSummaryCache();
      clearMakeupDiscoveryCache();
      await clearCachedUserProfile();
    }

    if (userChanged && previousUserId) {
      // The old access token is still active here, so unattached private media
      // can be deleted from the old account before logout/account switch.
      await clearGoldenMaskPendingUploadsForUser(previousUserId).catch(
        () => undefined,
      );
    }

    sessionRef.current = nextSession;
    setSessionState(nextSession);
    if (userChanged) {
      goldenMaskUserIdRef.current = nextUserId;
      await handleGoldenMaskAuthUserChanged(null, nextUserId).catch(
        () => undefined,
      );
    }
    if (userChanged) {
      invalidateMakeupJourneyCache();
    }
    await saveSessionToSecureStore(nextSession);
  }, []);

  const refreshSessionIfNeeded = useCallback(async (force = false) => {
    const currentSession = sessionRef.current;

    if (!currentSession || (!force && getUsableTokenFromSession(currentSession))) {
      return true;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const refreshedSession = await refreshAuthSession(currentSession);

        // A refresh can finish after logout or an account switch. Never let a
        // stale response restore the previous account over the newer session.
        if (sessionRef.current !== currentSession) {
          return Boolean(getUsableTokenFromSession(sessionRef.current));
        }

        if (!refreshedSession || !getUsableTokenFromSession(refreshedSession)) {
          await setSession(null);
          return false;
        }

        await setSession(refreshedSession);
        return true;
      } catch (error) {
        // A transport, timeout, 5xx, or malformed-response failure is not proof
        // that the refresh token expired. Keep the device-local session so the
        // next request or scheduled refresh can try again.
        if (sessionRef.current === currentSession) {
          console.info('[aura:auth] session-refresh:retryable-error', {
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return false;
      }
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
    clearProductHubRecommendationCache();
    clearMakeupJourneyPrivateImageMemoryCache();
  }, [session?.user.id]);

  useEffect(() => {
    const previousUserId = goldenMaskUserIdRef.current;
    const nextUserId = session?.user.id ?? null;
    if (previousUserId === nextUserId) {
      return;
    }
    goldenMaskUserIdRef.current = nextUserId;
    void handleGoldenMaskAuthUserChanged(previousUserId, nextUserId).catch(() => undefined);
  }, [session?.user.id]);

  useEffect(() => {
    setBackendAuthTokenProvider(() => getTokenFromSession(sessionRef.current));
    setBackendAuthTokenRefreshProvider(async (force = false) => {
      const didRefresh = await refreshSessionIfNeeded(force);

      // `false` with a retained session means Cognito failed transiently. It is
      // not an anonymous/expired session and must never be converted into a
      // backend 401 that feature routes interpret as a reason to log out.
      if (!didRefresh && sessionRef.current) {
        throw new AuthRefreshTemporarilyUnavailableError();
      }

      return getTokenFromSession(sessionRef.current);
    });

    return () => {
      setBackendAuthTokenProvider(null);
      setBackendAuthTokenRefreshProvider(null);
    };
  }, [refreshSessionIfNeeded]);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const storedValue = await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY);
        const storedSession = parseStoredSession(storedValue);
        const shouldRefreshStoredSession = Boolean(
          storedSession && !getUsableTokenFromSession(storedSession),
        );
        let restoredSession = storedSession;

        if (shouldRefreshStoredSession && storedSession) {
          try {
            restoredSession = await refreshAuthSession(storedSession);
          } catch (error) {
            // Startup must not sign the user out merely because Cognito is
            // temporarily unreachable. Retain the stored refresh token and
            // let the next authenticated request retry the refresh.
            console.info('[aura:auth] session-restore:retryable-error', {
              message: error instanceof Error ? error.message : String(error),
            });
            restoredSession = storedSession;
          }
        }

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
