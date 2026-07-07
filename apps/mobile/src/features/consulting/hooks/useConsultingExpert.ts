import {useEffect, useState} from 'react';

import {findConsultingExpertOrFirst} from '../mocks/consulting.mock';
import {getConsultingExpert} from '../services/consultingService';
import type {ConsultingExpert} from '../types';

/**
 * Resolves a consulting expert by id, seeded synchronously from the mock so the
 * UI renders immediately, then replaced with the backend detail once loaded.
 */
export function useConsultingExpert(
  expertId: string | undefined,
): ConsultingExpert {
  const [expert, setExpert] = useState<ConsultingExpert>(() =>
    findConsultingExpertOrFirst(expertId),
  );

  useEffect(() => {
    let isMounted = true;
    setExpert(findConsultingExpertOrFirst(expertId));

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
