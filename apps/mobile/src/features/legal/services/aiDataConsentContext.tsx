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

import {useAuthSession} from '../../auth/services/authSessionContext';
import {BackendApiError} from '../../../shared/services/backendApi';
import {ThirdPartyAiConsentSheet} from '../components/ThirdPartyAiConsentSheet';
import {
  clearAiDataConsentCache,
  getAiDataConsent,
  isCurrentAiDataConsentAccepted,
  updateAiDataConsent,
  type AiDataConsentState,
} from './aiDataConsentService';

type AiDataConsentContextValue = {
  openAiDataConsentSettings: () => void;
  requestAiDataConsent: () => Promise<boolean>;
};

const AiDataConsentContext = createContext<AiDataConsentContextValue | null>(null);

export function AiDataConsentProvider({children}: {children: ReactNode}) {
  const {session} = useAuthSession();
  const [consent, setConsent] = useState<AiDataConsentState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'request' | 'settings'>('request');
  const [visible, setVisible] = useState(false);
  const pendingResolversRef = useRef<Array<(accepted: boolean) => void>>([]);
  const requestSequenceRef = useRef(0);
  const userId = session?.user.id ?? null;
  const userIdRef = useRef(userId);

  const resolvePending = useCallback((accepted: boolean) => {
    const resolvers = pendingResolversRef.current;
    pendingResolversRef.current = [];
    resolvers.forEach(resolve => resolve(accepted));
  }, []);

  useEffect(() => {
    requestSequenceRef.current += 1;
    userIdRef.current = userId;
    clearAiDataConsentCache();
    setConsent(null);
    setErrorMessage(null);
    setIsSubmitting(false);
    setVisible(false);
    resolvePending(false);
  }, [resolvePending, userId]);

  const requestAiDataConsent = useCallback(async () => {
    if (!userId) {
      return false;
    }

    setErrorMessage(null);
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    try {
      const current = await getAiDataConsent(userId);
      if (
        userIdRef.current !== userId ||
        requestSequenceRef.current !== requestSequence
      ) {
        return false;
      }
      setConsent(current);
      if (isCurrentAiDataConsentAccepted(current)) {
        return true;
      }
    } catch (error) {
      if (
        userIdRef.current !== userId ||
        requestSequenceRef.current !== requestSequence
      ) {
        return false;
      }
      setErrorMessage(
        error instanceof BackendApiError && error.status === 401
          ? '로그인이 만료됐어요. 닫은 뒤 다시 로그인해 주세요.'
          : '동의 상태를 확인하지 못했어요. 아래 내용을 확인하고 다시 동의해 주세요.',
      );
    }

    setMode('request');
    setVisible(true);
    return new Promise<boolean>(resolve => {
      pendingResolversRef.current.push(resolve);
    });
  }, [userId]);

  const openAiDataConsentSettings = useCallback(() => {
    if (!userId) {
      return;
    }

    setMode('settings');
    setVisible(true);
    setErrorMessage(null);
    setIsSubmitting(true);
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    void getAiDataConsent(userId, {force: true})
      .then(nextConsent => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setConsent(nextConsent);
        }
      })
      .catch(() => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setErrorMessage('AI 데이터 동의 상태를 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setIsSubmitting(false);
        }
      });
  }, [userId]);

  const handleAccept = useCallback(() => {
    if (!userId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    void updateAiDataConsent(userId, true)
      .then(nextConsent => {
        if (
          userIdRef.current !== userId ||
          requestSequenceRef.current !== requestSequence
        ) {
          return;
        }
        setConsent(nextConsent);
        if (!isCurrentAiDataConsentAccepted(nextConsent)) {
          setErrorMessage('동의 상태가 확인되지 않았어요. 다시 시도해 주세요.');
          return;
        }
        setVisible(false);
        resolvePending(true);
      })
      .catch(error => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setErrorMessage(
            error instanceof BackendApiError && error.status === 401
              ? '로그인이 만료됐어요. 닫은 뒤 다시 로그인해 주세요.'
              : '동의를 저장하지 못했어요. 네트워크를 확인해 주세요.',
          );
        }
      })
      .finally(() => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setIsSubmitting(false);
        }
      });
  }, [isSubmitting, resolvePending, userId]);

  const handleRevoke = useCallback(() => {
    if (!userId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    void updateAiDataConsent(userId, false)
      .then(nextConsent => {
        if (
          userIdRef.current !== userId ||
          requestSequenceRef.current !== requestSequence
        ) {
          return;
        }
        setConsent(nextConsent);
        if (isCurrentAiDataConsentAccepted(nextConsent)) {
          setErrorMessage('동의 철회 상태가 확인되지 않았어요. 다시 시도해 주세요.');
          return;
        }
        resolvePending(false);
      })
      .catch(() => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setErrorMessage('동의를 철회하지 못했어요. 네트워크를 확인해 주세요.');
        }
      })
      .finally(() => {
        if (
          userIdRef.current === userId &&
          requestSequenceRef.current === requestSequence
        ) {
          setIsSubmitting(false);
        }
      });
  }, [isSubmitting, resolvePending, userId]);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    setVisible(false);
    resolvePending(false);
  }, [isSubmitting, resolvePending]);

  const value = useMemo(
    () => ({openAiDataConsentSettings, requestAiDataConsent}),
    [openAiDataConsentSettings, requestAiDataConsent],
  );

  return (
    <AiDataConsentContext.Provider value={value}>
      {children}
      <ThirdPartyAiConsentSheet
        accepted={Boolean(consent?.accepted)}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        mode={mode}
        onAccept={handleAccept}
        onClose={handleClose}
        onRevoke={handleRevoke}
        visible={visible}
      />
    </AiDataConsentContext.Provider>
  );
}

export function useAiDataConsent() {
  const context = useContext(AiDataConsentContext);
  if (!context) {
    throw new Error('useAiDataConsent must be used inside AiDataConsentProvider');
  }
  return context;
}
