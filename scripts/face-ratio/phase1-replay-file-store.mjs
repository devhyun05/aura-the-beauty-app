import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {hostname} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {randomUUID} from 'node:crypto';

import {
  appendPhase1ReplayCapture,
  createEmptyPhase1ReplayArtifact,
  isPhase1ReplayArtifactExpired,
  validatePhase1ReplayArtifact,
} from './phase1-replay-core.mjs';

export const PHASE1_REPLAY_LOCK_SUFFIX = '.lock';
export const PHASE1_REPLAY_TEMP_MARKER = '.phase1-replay-tmp-';

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_LOCK_MS = 5 * 60_000;
const LOCK_POLL_INTERVAL_MS = 25;
const LOCK_OWNER_FILE = 'owner.json';

function positiveInteger(value, fallback, label) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function sleepSync(milliseconds) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, milliseconds);
}

function lockAgeMs(lockPath, nowMs) {
  const ownerPath = join(lockPath, LOCK_OWNER_FILE);
  try {
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    if (
      owner &&
      typeof owner === 'object' &&
      typeof owner.acquiredAtUtc === 'string' &&
      Number.isFinite(Date.parse(owner.acquiredAtUtc))
    ) {
      return Math.max(0, nowMs - Date.parse(owner.acquiredAtUtc));
    }
  } catch {
    // A process may have created the lock directory but not its owner file yet.
  }
  try {
    return Math.max(0, nowMs - lstatSync(lockPath).mtimeMs);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      // The previous owner released between mkdir(EEXIST) and inspection.
      return null;
    }
    throw error;
  }
}

function releaseOwnedLock(lockPath, token) {
  const ownerPath = join(lockPath, LOCK_OWNER_FILE);
  if (!existsSync(lockPath)) {
    throw new Error(`Phase 1 replay lock disappeared before release: ${lockPath}`);
  }

  let owner;
  try {
    owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot verify Phase 1 replay lock ownership for ${lockPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (owner?.token !== token) {
    throw new Error(
      `Refusing to release Phase 1 replay lock owned by another process: ${lockPath}`,
    );
  }

  unlinkSync(ownerPath);
  rmdirSync(lockPath);
}

export function withPhase1ReplayFileLock(
  outputPath,
  action,
  {
    lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
    staleLockMs = DEFAULT_STALE_LOCK_MS,
  } = {},
) {
  const timeoutMs = positiveInteger(
    lockTimeoutMs,
    DEFAULT_LOCK_TIMEOUT_MS,
    'lockTimeoutMs',
  );
  const staleMs = positiveInteger(
    staleLockMs,
    DEFAULT_STALE_LOCK_MS,
    'staleLockMs',
  );
  const lockPath = `${outputPath}${PHASE1_REPLAY_LOCK_SUFFIX}`;
  const deadlineMs = Date.now() + timeoutMs;
  const token = randomUUID();

  while (true) {
    try {
      mkdirSync(lockPath, {mode: 0o700});
      try {
        writeFileSync(
          join(lockPath, LOCK_OWNER_FILE),
          `${JSON.stringify(
            {
              acquiredAtUtc: new Date().toISOString(),
              hostname: hostname(),
              pid: process.pid,
              token,
            },
            null,
            2,
          )}\n`,
          {encoding: 'utf8', flag: 'wx', mode: 0o600},
        );
      } catch (error) {
        try {
          rmdirSync(lockPath);
        } catch {
          // Preserve the original owner-file creation failure.
        }
        throw error;
      }
      break;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') {
        throw error;
      }

      const ageMs = lockAgeMs(lockPath, Date.now());
      if (ageMs === null) {
        continue;
      }
      if (ageMs >= staleMs) {
        throw new Error(
          `Stale Phase 1 replay lock detected at ${lockPath} ` +
            `(${Math.round(ageMs)}ms old); fail-closed manual cleanup is required`,
        );
      }
      if (Date.now() >= deadlineMs) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for Phase 1 replay lock: ${lockPath}`,
        );
      }
      sleepSync(Math.min(LOCK_POLL_INTERVAL_MS, deadlineMs - Date.now()));
    }
  }

  let actionError;
  try {
    return action();
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    try {
      releaseOwnedLock(lockPath, token);
    } catch (releaseError) {
      if (!actionError) {
        throw releaseError;
      }
    }
  }
}

function fsyncDirectory(path) {
  let directoryFd;
  try {
    directoryFd = openSync(path, 'r');
    fsyncSync(directoryFd);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes(error?.code)) {
      throw error;
    }
  } finally {
    if (directoryFd !== undefined) {
      closeSync(directoryFd);
    }
  }
}

export function writePhase1ReplayArtifactAtomically(
  outputPath,
  artifact,
  {failBeforeRename = false} = {},
) {
  validatePhase1ReplayArtifact(artifact);
  const outputDirectory = dirname(outputPath);
  mkdirSync(outputDirectory, {recursive: true, mode: 0o700});
  const tempPath = join(
    outputDirectory,
    `.${basename(outputPath)}${PHASE1_REPLAY_TEMP_MARKER}${process.pid}-${randomUUID()}`,
  );
  let fileDescriptor;

  try {
    fileDescriptor = openSync(tempPath, 'wx', 0o600);
    writeFileSync(
      fileDescriptor,
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf8',
    );
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;

    if (failBeforeRename) {
      throw new Error('Injected Phase 1 replay failure before atomic rename');
    }

    renameSync(tempPath, outputPath);
    fsyncDirectory(outputDirectory);
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}

function assertOutputIsNotSymlink(outputPath) {
  if (existsSync(outputPath) && lstatSync(outputPath).isSymbolicLink()) {
    throw new Error(`Phase 1 replay output must not be a symlink: ${outputPath}`);
  }
}

export function savePhase1ReplayCaptureFile({
  capture,
  cohortId,
  createdAtUtc,
  deleteAfterDays,
  failBeforeRename = false,
  lockOptions,
  nowUtc = new Date().toISOString(),
  outputPath,
  sessionId,
}) {
  mkdirSync(dirname(outputPath), {recursive: true, mode: 0o700});
  assertOutputIsNotSymlink(outputPath);

  return withPhase1ReplayFileLock(
    outputPath,
    () => {
      assertOutputIsNotSymlink(outputPath);
      const artifact = existsSync(outputPath)
        ? validatePhase1ReplayArtifact(
            JSON.parse(readFileSync(outputPath, 'utf8')),
          )
        : createEmptyPhase1ReplayArtifact({
            cohortId,
            createdAtUtc,
            deleteAfterDays,
            sessionId,
          });

      if (isPhase1ReplayArtifactExpired(artifact, nowUtc)) {
        throw new Error(
          `Phase 1 replay artifact reached deleteByUtc; run the cleanup CLI before writing: ${outputPath}`,
        );
      }
      if (artifact.cohortId !== cohortId || artifact.sessionId !== sessionId) {
        throw new Error(
          `metadata cohort/session does not match ${artifact.cohortId}/${artifact.sessionId}`,
        );
      }
      if (
        artifact.privacy.retention.deleteAfterDays !== deleteAfterDays ||
        Date.parse(artifact.privacy.retention.createdAtUtc) !==
          Date.parse(createdAtUtc)
      ) {
        throw new Error(
          'metadata retention does not match the existing Phase 1 replay artifact',
        );
      }

      const next = appendPhase1ReplayCapture(artifact, capture);
      const changed = next !== artifact;
      if (changed) {
        writePhase1ReplayArtifactAtomically(outputPath, next, {
          failBeforeRename,
        });
      }
      return {artifact: next, changed};
    },
    lockOptions,
  );
}

export function phase1ReplayFileStoreOptionsFromEnvironment(environment) {
  const testNowUtc =
    environment.AURA_PHASE1_REPLAY_TEST_NOW_UTC;
  if (
    testNowUtc !== undefined &&
    !Number.isFinite(Date.parse(testNowUtc))
  ) {
    throw new Error(
      'AURA_PHASE1_REPLAY_TEST_NOW_UTC must be an ISO timestamp',
    );
  }
  return {
    failBeforeRename:
      environment.AURA_PHASE1_REPLAY_TEST_FAIL_BEFORE_RENAME === '1',
    lockOptions: {
      lockTimeoutMs: positiveInteger(
        environment.AURA_PHASE1_REPLAY_LOCK_TIMEOUT_MS,
        DEFAULT_LOCK_TIMEOUT_MS,
        'AURA_PHASE1_REPLAY_LOCK_TIMEOUT_MS',
      ),
      staleLockMs: positiveInteger(
        environment.AURA_PHASE1_REPLAY_STALE_LOCK_MS,
        DEFAULT_STALE_LOCK_MS,
        'AURA_PHASE1_REPLAY_STALE_LOCK_MS',
      ),
    },
    nowUtc: testNowUtc,
  };
}
