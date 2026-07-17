import * as FileSystem from 'expo-file-system/legacy';

import {
  appendFace3DRuntimeEvidence,
  readFace3DRuntimeEvidenceLogAfterPendingWrites,
} from './face3DRuntimeEvidenceLogger';

type RuntimeEvidenceFileSystemMock = {
  blockNextWrite(): {
    release(): void;
    started: Promise<void>;
  };
  reset(): void;
};

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  (globalThis as typeof globalThis & {__DEV__: boolean}).__DEV__ = true;
  const fileSystemMock = FileSystem as unknown as RuntimeEvidenceFileSystemMock;
  fileSystemMock.reset();
  const writeBarrier = fileSystemMock.blockNextWrite();
  const requestId = 'prepared-exact30-interleaving-1';

  const append = appendFace3DRuntimeEvidence({
    requestId,
    status: 'completed',
    targetFrameCount: 30,
    type: 'face3d_status',
    validFrameCount: 30,
    warnings: [],
  });
  await writeBarrier.started;

  let resumeReadSettled = false;
  const resumeRead = readFace3DRuntimeEvidenceLogAfterPendingWrites().then(
    value => {
      resumeReadSettled = true;
      return value;
    },
  );
  await Promise.resolve();
  expect(
    !resumeReadSettled,
    'resume read must wait while the prior mounted instance has an in-flight append',
  );

  const lateRequestId = 'prepared-exact30-interleaving-2';
  const lateAppend = appendFace3DRuntimeEvidence({
    requestId: lateRequestId,
    status: 'completed',
    targetFrameCount: 30,
    type: 'face3d_status',
    validFrameCount: 30,
    warnings: [],
  });

  writeBarrier.release();
  await Promise.all([append, lateAppend]);
  const log = await resumeRead;
  const events = log
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as {event?: {requestId?: string}});
  expect(
    events.length === 2 &&
      events[0]?.event?.requestId === requestId &&
      events[1]?.event?.requestId === lateRequestId,
    'resume must observe every durable prepared requestId exactly once, including a late enqueue',
  );

  console.log('face3DRuntimeEvidenceLogger interleaving test passed');
}

void main().catch(error => {
  throw error;
});
