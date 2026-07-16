import {FaceCaptureLabPreparedCommitCoordinator} from './faceCaptureLabPreparedCommitCoordinator';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

async function main() {
  const coordinator = new FaceCaptureLabPreparedCommitCoordinator();
  const delayedEvidence = createDeferred<string>();
  const deleted: string[] = [];
  const owned = new Set<string>();
  let durableEvidenceWrites = 0;
  let durableProgressUpdates = 0;
  let resultUri: string | null = null;
  const oldImageUri = 'file:///cache/aura_unified_face_1_1.jpg';

  const oldCommit = coordinator.run({
    requestId: 'planned-shot-1',
    persistEvidence: async () => {
      durableEvidenceWrites += 1;
      return delayedEvidence.promise;
    },
    finalize: async ({isCurrent, value}) => {
      expect(value === 'events.jsonl', 'the evidence receipt must be forwarded');
      durableProgressUpdates += 1;
      if (!isCurrent()) {
        deleted.push(oldImageUri);
        return true;
      }
      owned.add(oldImageUri);
      resultUri = oldImageUri;
      return true;
    },
  });

  expect(
    coordinator.pendingRequestId === 'planned-shot-1',
    'the delayed evidence write must keep its planned request pending',
  );

  // 사용자가 commit 대기 중 닫고 picker에서 같은 샷을 다시 선택하는 순서.
  coordinator.invalidate();
  let reentryBlocked = false;
  try {
    await coordinator.run({
      requestId: 'planned-shot-1',
      persistEvidence: async () => {
        durableEvidenceWrites += 1;
        return 'duplicate-events.jsonl';
      },
      finalize: () => true,
    });
  } catch {
    reentryBlocked = true;
  }

  expect(reentryBlocked, 'same-shot reentry must be blocked while pending');
  expect(
    durableEvidenceWrites === 1,
    'blocked reentry must not append duplicate evidence',
  );

  delayedEvidence.resolve('events.jsonl');
  expect(await oldCommit, 'a stale but durable commit must be acknowledged');
  expect(
    resultUri === null && owned.size === 0,
    'the stale callback must not restore result or image ownership',
  );
  expect(
    durableProgressUpdates === 1,
    'durable progress must advance exactly once for the persisted old shot',
  );
  expect(
    deleted.length === 1 && deleted[0] === oldImageUri,
    'only the stale image must be cleaned after its evidence settles',
  );
  expect(
    coordinator.pendingRequestId === null,
    'pending state must clear after stale cleanup finishes',
  );

  const newImageUri = 'file:///cache/aura_unified_face_2_2.jpg';
  await coordinator.run({
    requestId: 'planned-shot-2',
    persistEvidence: async () => {
      durableEvidenceWrites += 1;
      return 'events.jsonl';
    },
    finalize: ({isCurrent}) => {
      expect(isCurrent(), 'a later planned shot must use the new generation');
      durableProgressUpdates += 1;
      owned.add(newImageUri);
      resultUri = newImageUri;
      return true;
    },
  });

  expect(
    durableEvidenceWrites === 2 &&
      durableProgressUpdates === 2 &&
      resultUri === newImageUri &&
      owned.has(newImageUri) &&
      !deleted.includes(newImageUri),
    'the next generation must commit normally without wrong-image cleanup',
  );

  console.log('faceCaptureLabPreparedCommitCoordinator tests passed');
}

void main().catch(error => {
  throw error;
});
