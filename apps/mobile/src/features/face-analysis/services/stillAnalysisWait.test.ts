// 실행: scripts/mobile/run-face-geometry-contract.mjs (tsc → node)
import {raceWithNullTimeout} from './stillAnalysisWait';

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`);
}

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    fail(label, `expected ${String(expected)}, got ${String(actual)}`);
  }
}

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), ms);
  });
}

async function main(): Promise<void> {
  // 1. 타임아웃 전에 해소되면 값 보존.
  expectEqual(
    await raceWithNullTimeout(delay(10, 'fast'), 200),
    'fast',
    'value preserved before timeout',
  );

  // 2. 타임아웃보다 느리면 null 강등.
  expectEqual(
    await raceWithNullTimeout(delay(200, 'slow'), 20),
    null,
    'slow promise degrades to null',
  );

  // 3. null promise 는 즉시 null.
  expectEqual(await raceWithNullTimeout(null, 200), null, 'null promise → null');

  // 4. 거부는 null 로 흡수 — 보고서 POST 를 막지 않는다.
  expectEqual(
    await raceWithNullTimeout(Promise.reject(new Error('boom')), 200),
    null,
    'rejection absorbed to null',
  );

  // 5. 핵심 계약: 한 축이 타임아웃해도 다른 축의 이미 해소된 값은 보존된다.
  //    (공유 race 였다면 둘 다 null 이 됐을 상황)
  const [fast, slow] = await Promise.all([
    raceWithNullTimeout(delay(10, 'kept'), 100),
    raceWithNullTimeout(delay(300, 'dropped'), 50),
  ]);
  expectEqual(fast, 'kept', 'per-axis timeout keeps the fast axis');
  expectEqual(slow, null, 'per-axis timeout drops only the slow axis');

  console.log('stillAnalysisWait.test.ts passed');
}

// 실패 시 unhandled rejection 으로 node 가 비정상 종료한다(러너가 감지).
void main();
