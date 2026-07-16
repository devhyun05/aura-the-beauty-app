type TimerHandle = ReturnType<typeof setTimeout>;

type DeferredCleanupScheduler = {
  cancel: (timer: TimerHandle) => void;
  schedule: (callback: () => void) => TimerHandle;
};

const DEFAULT_SCHEDULER: DeferredCleanupScheduler = {
  cancel: timer => clearTimeout(timer),
  schedule: callback => setTimeout(callback, 0),
};

type PendingCleanup = {
  callback: () => void;
  requestId: string;
  timer: TimerHandle;
};

/**
 * React StrictMode는 개발 중 effect setup → cleanup → setup을 한 번 더 수행한다.
 * 실제 unmount 정리는 다음 tick으로 미루고 같은 requestId가 즉시 다시 mount되면
 * 취소한다. 다른 request의 cleanup은 그대로 실행해 이전 Unity 세션을 남기지 않는다.
 */
export class UnifiedFaceCaptureDeferredCleanup {
  private pending: PendingCleanup | null = null;

  constructor(
    private readonly scheduler: DeferredCleanupScheduler = DEFAULT_SCHEDULER,
  ) {}

  resume(requestId: string): boolean {
    if (!this.pending || this.pending.requestId !== requestId) {
      return false;
    }

    this.scheduler.cancel(this.pending.timer);
    this.pending = null;
    return true;
  }

  schedule(requestId: string, callback: () => void): void {
    if (this.pending) {
      this.scheduler.cancel(this.pending.timer);
      const previous = this.pending.callback;
      this.pending = null;
      previous();
    }

    const pending = {
      callback,
      requestId,
      timer: null as unknown as TimerHandle,
    };
    pending.timer = this.scheduler.schedule(() => {
      if (this.pending !== pending) {
        return;
      }

      this.pending = null;
      callback();
    });
    this.pending = pending;
  }
}
