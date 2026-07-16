#!/usr/bin/env node

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  appendPhase1ReplayCapture,
  createEmptyPhase1ReplayArtifact,
  validatePhase1ReplayArtifact,
} from './phase1-replay-core.mjs';

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
if (
  outputPath.startsWith(`${repoRoot}/`) &&
  outputPath !== ignoredArtifactRoot &&
  !outputPath.startsWith(`${ignoredArtifactRoot}/`) &&
  outputPath !== ignoredSessionRoot &&
  !outputPath.startsWith(`${ignoredSessionRoot}/`)
) {
  throw new Error(
    'repo-local raw replay artifacts must stay under local-face-measurement/ ' +
      'or artifacts/face-ratio/phase1-local/',
  );
}
const response = unwrapResponse(readJson(responsePath));
const metadata = readJson(metadataPath);

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

const artifact = existsSync(outputPath)
  ? validatePhase1ReplayArtifact(readJson(outputPath))
  : createEmptyPhase1ReplayArtifact({
      cohortId: metadata.cohortId,
      createdAtUtc: metadata.artifactCreatedAtUtc ?? metadata.capturedAtUtc,
      deleteAfterDays: metadata.deleteAfterDays ?? 30,
      sessionId: metadata.sessionId,
    });

if (
  artifact.cohortId !== metadata.cohortId ||
  artifact.sessionId !== metadata.sessionId
) {
  throw new Error(
    `metadata cohort/session does not match ${artifact.cohortId}/${artifact.sessionId}`,
  );
}

const next = appendPhase1ReplayCapture(artifact, capture);
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(
  `Prepared local-only Phase 1 replay artifact: ${outputPath} (${next.captures.length} capture(s))`,
);
