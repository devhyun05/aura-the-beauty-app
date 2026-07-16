import {UnifiedFaceCaptureDeferredCleanup} from './unifiedFaceCaptureDeferredCleanup';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

type FakeTimer = {callback: () => void; cancelled: boolean};
const timers: FakeTimer[] = [];
const cleanup = new UnifiedFaceCaptureDeferredCleanup({
  cancel: timer => {
    (timer as unknown as FakeTimer).cancelled = true;
  },
  schedule: callback => {
    const timer = {callback, cancelled: false};
    timers.push(timer);
    return timer as unknown as ReturnType<typeof setTimeout>;
  },
});

let cleanupCount = 0;
cleanup.schedule('strict-request', () => {
  cleanupCount += 1;
});
expectEqual(cleanup.resume('strict-request'), true, 'same request resumes in StrictMode');
if (!timers[0]?.cancelled) {
  timers[0]?.callback();
}
expectEqual(cleanupCount, 0, 'StrictMode cleanup is suppressed');

cleanup.schedule('old-request', () => {
  cleanupCount += 1;
});
expectEqual(cleanup.resume('new-request'), false, 'different request does not suppress cleanup');
timers[1]?.callback();
expectEqual(cleanupCount, 1, 'old request cleanup still runs');

cleanup.schedule('first-request', () => {
  cleanupCount += 1;
});
cleanup.schedule('second-request', () => {
  cleanupCount += 1;
});
expectEqual(cleanupCount, 2, 'replaced pending cleanup is flushed exactly once');
timers[3]?.callback();
expectEqual(cleanupCount, 3, 'latest cleanup runs exactly once');
