import {useEffect, useState} from 'react';

import {getConsultingExpert} from '../services/consultingService';
import type {ConsultingExpert} from '../types';

export function useConsultingExpert(
  expertId: string | undefined,
): ConsultingExpert | null {
  const [expert, setExpert] = useState<ConsultingExpert | null>(null);

  useEffect(() => {
    let isMounted = true;
    setExpert(null);

    if (expertId) {
      getConsultingExpert(expertId).then(data => {
        if (isMounted) {
          setExpert(data);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [expertId]);

  return expert;
}
