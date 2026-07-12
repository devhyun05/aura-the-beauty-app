#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildCandidateOverlaySvg,
  buildReviewHtml,
  buildSemanticConsensusCandidate,
} from './semantic-candidate-core.mjs';

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveCaptureDirectory(value) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error(`캡처 폴더가 없습니다: ${absolute}`);
  }
  return absolute;
}

function buildDataUri(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function main() {
  const separatorIndex = process.argv.indexOf('--output');
  const captureValues = process.argv.slice(2, separatorIndex >= 0 ? separatorIndex : undefined);
  if (captureValues.length < 2) {
    throw new Error('사용법: build-semantic-consensus.mjs <capture-dir> <capture-dir> [...] --output <output-dir>');
  }

  const captureDirectories = captureValues.map(resolveCaptureDirectory);
  const payloads = captureDirectories.map(directory =>
    readJson(path.join(directory, 'arface_export.json')),
  );
  const representativeDirectory = captureDirectories.at(-1);
  const representativePayload = payloads.at(-1);
  const framePath = path.join(
    representativeDirectory,
    representativePayload.framePath ?? 'frame.png',
  );
  if (!fs.existsSync(framePath)) {
    throw new Error(`대표 검수 프레임이 없습니다: ${framePath}`);
  }

  const outputDirectory = path.resolve(
    separatorIndex >= 0 && process.argv[separatorIndex + 1]
      ? process.argv[separatorIndex + 1]
      : path.join(representativeDirectory, 'face3d-semantic-consensus-review'),
  );
  fs.mkdirSync(outputDirectory, {recursive: true});

  const candidate = buildSemanticConsensusCandidate(payloads, {
    candidateId: `face3d-consensus-${Date.now()}-candidate-v1`,
  });
  const frameDataUri = buildDataUri(framePath);
  const relativeFramePath = path.relative(outputDirectory, framePath) || path.basename(framePath);
  const candidatePath = path.join(outputDirectory, 'ARKitFaceSemanticMapV1.consensus.candidate.json');
  const overlayPath = path.join(outputDirectory, 'semantic_consensus_overlay.svg');
  const reviewPath = path.join(outputDirectory, 'semantic_consensus_review.html');

  writeJson(candidatePath, candidate);
  fs.writeFileSync(
    overlayPath,
    buildCandidateOverlaySvg({
      candidate,
      frameDataUri,
      framePath: relativeFramePath,
      payload: representativePayload,
    }),
    'utf8',
  );
  fs.writeFileSync(
    reviewPath,
    buildReviewHtml({
      candidate,
      frameDataUri,
      framePath: relativeFramePath,
      payload: representativePayload,
    }),
    'utf8',
  );

  console.log(`Face3D 합의 후보 생성 완료 (${payloads.length} captures): ${candidatePath}`);
  console.log(`합의 오버레이: ${overlayPath}`);
  console.log(`대화형 합의 검수 화면: ${reviewPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Face3D 합의 후보 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
