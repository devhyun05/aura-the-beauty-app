#!/usr/bin/env node

import {existsSync, lstatSync, readFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  phase1ReplayFileStoreOptionsFromEnvironment,
  savePhase1ReplayCaptureFile,
} from './phase1-replay-file-store.mjs';

function usage() {
  console.error(
    'Usage: node scripts/face-ratio/prepare-phase1-replay-artifact.mjs ' +
      '--response <face-landmarks.json> --metadata <capture-metadata.json> ' +
      '--output <local-artifact.json>',
  );
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      usage();
      process.exit(2);
    }
    values[key.slice(2)] = value;
  }
  if (!values.response || !values.metadata || !values.output) {
    usage();
    process.exit(2);
  }
  return values;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function unwrapResponse(value) {
  if (value && typeof value === 'object' && typeof value.message === 'string') {
    return JSON.parse(value.message);
  }
  return value;
}

const args = parseArgs(process.argv.slice(2));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const ignoredArtifactRoot = resolve(
  repoRoot,
  'artifacts/face-ratio/phase1-local',
);
const ignoredSessionRoot = resolve(repoRoot, 'local-face-measurement');
const responsePath = resolve(args.response);
const metadataPath = resolve(args.metadata);
const outputPath = resolve(args.output);
const response = unwrapResponse(readJson(responsePath));
const metadata = readJson(metadataPath);

function isWithin(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function assertRepoLocalOutputBoundary(candidate) {
  if (!isWithin(candidate, repoRoot)) {
    return;
  }
  const safeRoot = [ignoredArtifactRoot, ignoredSessionRoot].find(root =>
    isWithin(candidate, root),
  );
  if (!safeRoot) {
    throw new Error(
      'repo-local raw replay artifacts must stay under local-face-measurement/ ' +
        'or artifacts/face-ratio/phase1-local/',
    );
  }

  let cursor = repoRoot;
  const parentRelativePath = relative(repoRoot, dirname(candidate));
  for (const segment of parentRelativePath.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) {
      continue;
    }
    const entry = lstatSync(cursor);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `repo-local raw replay output must not traverse a symlink: ${cursor}`,
      );
    }
    if (!entry.isDirectory()) {
      throw new Error(
        `repo-local raw replay parent must be a directory: ${cursor}`,
      );
    }
  }
}

assertRepoLocalOutputBoundary(outputPath);

if (
  !response ||
  response.type !== 'faceLandmarks' ||
  response.status !== 'ok' ||
  response.faceCount !== 1
) {
  throw new Error('response must be a successful single-face faceLandmarks event');
}
if (!Array.isArray(response.landmarks) || response.landmarks.length !== 478) {
  throw new Error('response.landmarks must contain exactly 478 points');
}
if (!response.transformationMatrix) {
  throw new Error('response.transformationMatrix is required');
}
if (
  !metadata ||
  typeof metadata !== 'object' ||
  Array.isArray(metadata) ||
  !metadata.cohortId ||
  !metadata.captureId ||
  !metadata.capturedAtUtc ||
  !metadata.sessionId ||
  !metadata.subjectId ||
  !metadata.condition ||
  !metadata.acquisition
) {
  throw new Error(
    'metadata requires cohortId, sessionId, captureId, capturedAtUtc, subjectId, condition, and acquisition',
  );
}
if (
  !Number.isFinite(Date.parse(metadata.artifactCreatedAtUtc)) ||
  !Number.isInteger(metadata.deleteAfterDays) ||
  metadata.deleteAfterDays < 1 ||
  metadata.deleteAfterDays > 30
) {
  throw new Error(
    'metadata requires an ISO artifactCreatedAtUtc and explicit deleteAfterDays in [1, 30]',
  );
}

const capture = {
  acquisition: metadata.acquisition,
  captureId: metadata.captureId,
  capturedAtUtc: metadata.capturedAtUtc,
  subjectId: metadata.subjectId,
  condition: metadata.condition,
  imageWidth: response.imageWidth,
  imageHeight: response.imageHeight,
  landmarks: response.landmarks,
  transformationMatrix: response.transformationMatrix,
  ...(metadata.hairline ? {hairline: metadata.hairline} : {}),
};

const fileStoreOptions = phase1ReplayFileStoreOptionsFromEnvironment(
  process.env,
);
const result = savePhase1ReplayCaptureFile({
  capture,
  cohortId: metadata.cohortId,
  createdAtUtc: metadata.artifactCreatedAtUtc,
  deleteAfterDays: metadata.deleteAfterDays,
  failBeforeRename: fileStoreOptions.failBeforeRename,
  lockOptions: fileStoreOptions.lockOptions,
  ...(fileStoreOptions.nowUtc
    ? {nowUtc: fileStoreOptions.nowUtc}
    : {}),
  outputPath,
  sessionId: metadata.sessionId,
});
console.log(
  `Prepared local-only Phase 1 replay artifact: ${outputPath} ` +
    `(${result.artifact.captures.length} capture(s), ` +
    `${result.changed ? 'updated' : 'idempotent unchanged'})`,
);
