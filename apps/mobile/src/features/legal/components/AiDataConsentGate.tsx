import React from 'react';

import {useAiDataConsent} from '../services/aiDataConsentContext';

type AiDataConsentGateProps = {
  children: React.ReactNode;
  onDecline: () => void;
};

/**
 * Protects capture/upload routes themselves, not only the buttons that usually
 * navigate to them. This keeps deep links and internal reset flows from
 * bypassing the disclosure screen.
 */
export function AiDataConsentGate({
  children,
  onDecline,
}: AiDataConsentGateProps) {
  const {requestAiDataConsent} = useAiDataConsent();
  const [isAllowed, setIsAllowed] = React.useState(false);
  const onDeclineRef = React.useRef(onDecline);

  React.useEffect(() => {
    onDeclineRef.current = onDecline;
  }, [onDecline]);

  React.useEffect(() => {
    let active = true;
    void requestAiDataConsent().then(accepted => {
      if (!active) {
        return;
      }
      if (accepted) {
        setIsAllowed(true);
      } else {
        onDeclineRef.current();
      }
    });

    return () => {
      active = false;
    };
  }, [requestAiDataConsent]);

  return isAllowed ? <>{children}</> : null;
}
