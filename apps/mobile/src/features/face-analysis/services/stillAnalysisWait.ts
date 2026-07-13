// 보고서 POST 직전의 온디바이스 분석 대기 헬퍼 (RN 의존 없음 — 계약 러너로 검증).
//
// 각 분석 promise 를 "개별" null 타임아웃과 race 한다. 공유 race
// (Promise.all vs 단일 타이머)는 한 축이 타임아웃하면 이미 해소된 다른 축의
// 값까지 함께 버리므로 금지 — 축마다 독립적으로 강등돼야 한다.
// 거부(reject)도 null 로 흡수한다: 온디바이스 분석 실패가 보고서 생성 자체를
// 막으면 안 된다.
export function raceWithNullTimeout<T>(
  promise: Promise<T | null> | null,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return Promise.race([
    (promise ?? Promise.resolve(null)).catch(() => null),
    new Promise<null>(resolve => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}
