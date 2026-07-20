import { useCallback, useState } from 'react';
import { useBeardFlow } from '../state/BeardFlowContext';
import { useBeardService } from '../services/BeardServiceContext';
import { useToast } from '../state/ToastContext';
import { beardTiming } from '../tokens/tokens';

/**
 * One-tap save of the beard-removed result (one clean image, no divider).
 * Success → "수염을 지운 결과를 사진에 저장했어요"; failure → "사진을 저장하지 못했어요" + 다시 시도.
 * Guards against duplicate taps while in-flight.
 */
export function useSaveResult() {
  const flow = useBeardFlow();
  const service = useBeardService();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (saving) return;
    const uri = flow.result?.resultImageUri;
    if (!uri) return;
    setSaving(true);
    try {
      await service.saveResultToLibrary(uri);
      flow.setSavedOnce(true);
      toast.show('ok', '수염을 지운 결과를 사진에 저장했어요', beardTiming.toastSaved);
    } catch {
      // TODO(backend): distinguish permission-denied from generic failure for a tailored message.
      toast.show('err', '사진을 저장하지 못했어요', beardTiming.toastError, () => {
        void save();
      });
    } finally {
      setSaving(false);
    }
  }, [saving, flow, service, toast]);

  return { saving, save };
}
