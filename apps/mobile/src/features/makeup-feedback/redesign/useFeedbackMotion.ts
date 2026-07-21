import {useCallback, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

export function useFeedbackReduceMotion(override = false) {
  const [osReduceMotion, setOsReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) {
        setOsReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setOsReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return override || osReduceMotion;
}

export function useFeedbackCountUp(
  target: number,
  {durationMs = 700, reduceMotion = false} = {},
) {
  const [value, setValue] = useState(reduceMotion ? target : 0);
  const animationFrame = useRef<number | null>(null);

  const restart = useCallback(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
    }

    if (reduceMotion) {
      setValue(target);
      return;
    }

    setValue(0);
    let startedAt: number | null = null;

    const step = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * easedProgress));

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(step);
      }
    };

    animationFrame.current = requestAnimationFrame(step);
  }, [durationMs, reduceMotion, target]);

  useEffect(() => {
    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  return [value, restart] as const;
}
