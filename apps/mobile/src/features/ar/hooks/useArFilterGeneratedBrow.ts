import {useCallback, useEffect, useRef} from 'react';

import {
  buildFullFaceCaptureBundleFromEvent,
  buildFullFaceMakeupSourceInput,
  buildUnitySynchronizedCaptureRequest,
  type UnitySynchronizedCaptureEvent,
} from '../../../shared/contracts/fullFaceMakeupCapture';
import {
  DEFAULT_GENERATED_BROW_CONTROLS,
  type BrowShapeId,
  type GeneratedBrowControls,
} from '../services/browGenerateCore';
import {
  buildGeneratedBrowFromCaptureResult,
  generateBrowFromCapture,
  isPersonalizedMakeupGenerateAvailable,
} from '../services/personalizedMakeupGenerateService';
import type {E7NativeBoundaryResult} from '../services/personalizedGenerate/e7PersonalizedGeneratePipeline';
import {
  addUnityMakeupEventListener,
  postUnityGeneratedBrowMaskPayload,
  postUnitySynchronizedCaptureRequest,
} from '../services/unityMakeupBridge';

export type ArFilterGeneratedBrowArgs = {
  colorHex: string;
  enabled: boolean;
  shapeId: BrowShapeId;
};

export type ArFilterGeneratedBrowController = {
  /**
   * True when the native generate pipeline is compiled into this build. When
   * false the caller should fall back to the static (recipe) brow.
   */
  available: boolean;
  /**
   * Request the landmark-aligned generated brow for the given shape/color. The
   * FIRST enabled call triggers one synchronized capture (~150ms, does NOT
   * freeze the live view); subsequent shape/color calls re-rasterize from the
   * cached capture with no re-scan. Passing enabled=false hides the brow.
   */
  applyGeneratedBrow: (args: ArFilterGeneratedBrowArgs) => void;
  /** Hide the generated brow (keeps the cached capture for a later re-enable). */
  clearGeneratedBrow: () => void;
};

function controlsFromArgs(args: ArFilterGeneratedBrowArgs): GeneratedBrowControls {
  return {
    ...DEFAULT_GENERATED_BROW_CONTROLS,
    colorHex: args.colorHex,
    enabled: args.enabled,
    shapeId: args.shapeId,
  };
}

/**
 * Brings the scan-based PERSONALIZED (landmark-aligned) brow into the live AR
 * filter. The static UV-locked brow cannot align to a person's real brow, lacks
 * hair strands, and cannot erase the natural brow; the generated brow rasterizes
 * a mask from the captured ARFace landmarks (real-brow neutralize footprint +
 * strand map) so it sits ON the real brow, hides it, and reads as hair.
 */
export function useArFilterGeneratedBrow(): ArFilterGeneratedBrowController {
  const available = isPersonalizedMakeupGenerateAvailable();

  // Cached native landmark result from the one capture; lets shape/color taps
  // re-rasterize without re-scanning.
  const nativeResultRef = useRef<E7NativeBoundaryResult | null>(null);
  // The most recent request; when an in-flight capture resolves we apply THIS
  // (so rapid shape/color taps during capture converge on the latest).
  const latestArgsRef = useRef<ArFilterGeneratedBrowArgs | null>(null);
  // capturePairId of the in-flight capture (null when none is pending).
  const pendingCapturePairIdRef = useRef<string | null>(null);

  const applyFromCache = useCallback((args: ArFilterGeneratedBrowArgs) => {
    const nativeResult = nativeResultRef.current;
    if (!nativeResult) {
      return false;
    }
    try {
      const result = buildGeneratedBrowFromCaptureResult(
        nativeResult,
        controlsFromArgs(args),
      );
      postUnityGeneratedBrowMaskPayload(result.browUnityApplyPayload);
      return true;
    } catch (error) {
      console.warn('[arfilter:generated-brow] rasterize from cache failed', error);
      return false;
    }
  }, []);

  const triggerCapture = useCallback(() => {
    if (pendingCapturePairIdRef.current) {
      console.info('[arfilter:generated-brow] capture already pending', {
        capturePairId: pendingCapturePairIdRef.current,
      });
      return;
    }
    const request = buildUnitySynchronizedCaptureRequest({
      requestedAtMs: Date.now(),
    });
    pendingCapturePairIdRef.current = request.capturePairId;
    console.info('[arfilter:generated-brow] trigger capture', {
      capturePairId: request.capturePairId,
    });
    postUnitySynchronizedCaptureRequest(request);
  }, []);

  const applyGeneratedBrow = useCallback(
    (args: ArFilterGeneratedBrowArgs) => {
      if (!available) {
        return;
      }
      latestArgsRef.current = args;
      console.info('[arfilter:generated-brow] applyGeneratedBrow', {
        enabled: args.enabled,
        hasCachedScan: nativeResultRef.current !== null,
        shapeId: args.shapeId,
      });

      if (!args.enabled) {
        // Hide via the cache if we have one; nothing to do before first capture.
        applyFromCache(args);
        return;
      }

      if (applyFromCache(args)) {
        return;
      }
      // No cached landmarks yet -> scan once; the event listener applies the
      // latest args when the export lands.
      triggerCapture();
    },
    [available, applyFromCache, triggerCapture],
  );

  const clearGeneratedBrow = useCallback(() => {
    const args = latestArgsRef.current;
    if (!args) {
      return;
    }
    const hiddenArgs: ArFilterGeneratedBrowArgs = {...args, enabled: false};
    latestArgsRef.current = hiddenArgs;
    applyFromCache(hiddenArgs);
  }, [applyFromCache]);

  useEffect(() => {
    if (!available) {
      return undefined;
    }

    const subscription = addUnityMakeupEventListener(event => {
      if (!event.message) {
        return;
      }
      let parsed: UnitySynchronizedCaptureEvent | null = null;
      try {
        parsed = JSON.parse(event.message) as UnitySynchronizedCaptureEvent;
      } catch {
        return;
      }
      if (parsed?.type !== 'e7_reference_capture') {
        return;
      }
      const pendingId = pendingCapturePairIdRef.current;
      if (!pendingId || parsed.capturePairId !== pendingId) {
        return;
      }

      console.info('[arfilter:generated-brow] capture event', {
        capturePairId: parsed.capturePairId,
        status: parsed.status,
      });

      if (parsed.status === 'failed' || parsed.status === 'busy') {
        // Let the next brow tap retry a fresh capture.
        pendingCapturePairIdRef.current = null;
        return;
      }
      if (parsed.status !== 'exported') {
        return;
      }

      pendingCapturePairIdRef.current = null;
      const bundle = buildFullFaceCaptureBundleFromEvent(parsed);
      if (!bundle) {
        return;
      }
      const args = latestArgsRef.current;
      if (!args || !args.enabled) {
        // The user turned the brow off before the scan resolved.
        return;
      }

      const sourceFrameMetadata = buildFullFaceMakeupSourceInput(bundle);
      generateBrowFromCapture({
        controls: controlsFromArgs(args),
        sourceFrameMetadata,
      })
        .then(result => {
          nativeResultRef.current = result.nativeResult;
          console.info('[arfilter:generated-brow] generate ok -> apply', {
            payloadBytes: result.browUnityApplyPayload.length,
          });
          // Apply the LATEST args (a shape/color tap may have landed mid-scan).
          const latest = latestArgsRef.current ?? args;
          if (!latest.enabled) {
            return;
          }
          if (!applyFromCache(latest)) {
            postUnityGeneratedBrowMaskPayload(result.browUnityApplyPayload);
          }
        })
        .catch(error => {
          console.warn('[arfilter:generated-brow] generate failed', error);
        });
    });

    return () => {
      subscription.remove();
    };
  }, [available, applyFromCache]);

  return {available, applyGeneratedBrow, clearGeneratedBrow};
}
