#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  buildCandidateOverlaySvg,
  buildReviewHtml,
  buildSemanticCandidate,
} from './semantic-candidate-core.mjs';

function usage() {
  const script = path.relative(process.cwd(), fileURLToPath(import.meta.url));
  console.error(`사용법: node ${script} <capture-directory|arface_export.json> [output-directory]`);
  console.error('예: npm run face3d:semantic:candidates -- /path/to/pair_face_0001');
}

function resolveInput(value) {
  const absolute = path.resolve(value);
  const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
  if (!stat) {
    throw new Error(`입력 경로가 없습니다: ${absolute}`);
  }
  if (stat.isDirectory()) {
    return {
      captureDirectory: absolute,
      exportPath: path.join(absolute, 'arface_export.json'),
    };
  }
  return {
    captureDirectory: path.dirname(absolute),
    exportPath: absolute,
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function buildDataUri(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = extension === '.svg'
    ? 'image/svg+xml'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : 'image/png';
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function main() {
  const inputValue = process.argv[2];
  if (!inputValue || inputValue === '--help' || inputValue === '-h') {
    usage();
    process.exitCode = inputValue ? 0 : 2;
    return;
  }

  const input = resolveInput(inputValue);
  if (!fs.existsSync(input.exportPath)) {
    throw new Error(`ARFace 덤프가 없습니다: ${input.exportPath}`);
  }

  const payload = readJson(input.exportPath);
  const outputDirectory = path.resolve(
    process.argv[3] ?? path.join(input.captureDirectory, 'face3d-semantic-review'),
  );
  fs.mkdirSync(outputDirectory, {recursive: true});

  const candidate = buildSemanticCandidate(payload, {
    candidateId: `face3d-${payload.capturePairId ?? path.basename(input.captureDirectory)}-candidate-v1`,
  });
  const framePath = path.join(input.captureDirectory, payload.framePath ?? 'frame.png');
  if (!fs.existsSync(framePath)) {
    throw new Error(`검수용 프레임 이미지가 없습니다: ${framePath}`);
  }

  const relativeFramePath = path.relative(outputDirectory, framePath) || path.basename(framePath);
  const frameDataUri = buildDataUri(framePath);
  const candidatePath = path.join(outputDirectory, 'ARKitFaceSemanticMapV1.candidate.json');
  const overlayPath = path.join(outputDirectory, 'semantic_candidate_overlay.svg');
  const reviewPath = path.join(outputDirectory, 'semantic_candidate_review.html');
  writeJson(candidatePath, candidate);
  fs.writeFileSync(
    overlayPath,
    buildCandidateOverlaySvg({candidate, frameDataUri, framePath: relativeFramePath, payload}),
    'utf8',
  );
  fs.writeFileSync(
    reviewPath,
    buildReviewHtml({candidate, frameDataUri, framePath: relativeFramePath, payload}),
    'utf8',
  );

  console.log(`Face3D 후보 생성 완료: ${candidatePath}`);
  console.log(`색상 오버레이: ${overlayPath}`);
  console.log(`대화형 검수 화면: ${reviewPath}`);
  console.log('주의: candidate JSON은 런타임 Resources에 넣으면 안 됩니다. 검수 화면에서 승인된 맵만 저장하세요.');
}

try {
  main();
} catch (error) {
  console.error(`Face3D 후보 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
