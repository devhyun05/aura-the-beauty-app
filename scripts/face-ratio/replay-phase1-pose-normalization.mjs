#!/usr/bin/env node

import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {
  evaluatePhase1ReplayArtifact,
  validatePhase1ReplayArtifact,
} from './phase1-replay-core.mjs';

function usage() {
  console.error(
    'Usage: node scripts/face-ratio/replay-phase1-pose-normalization.mjs ' +
      '--input <local-artifact.json> [--output <aggregate-report.json>]',
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
  if (!values.input) {
    usage();
    process.exit(2);
  }
  return values;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const sourceRoot = join(repoRoot, 'apps/mobile/src');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-ratio-phase1-replay-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const poseSource = join(
  sourceRoot,
  'features/face-ratio/services/faceRatioPoseNormalization.ts',
);
const measurementSource = join(
  sourceRoot,
  'features/face-ratio/services/faceRatioLandmarkMeasurement.ts',
);
const compile = spawnSync(
  process.execPath,
  [
    tscPath,
    '--ignoreConfig',
    '--module',
    'commonjs',
    '--target',
    'ES2020',
    '--skipLibCheck',
    '--rootDir',
    sourceRoot,
    '--outDir',
    outDir,
    poseSource,
    measurementSource,
  ],
  {cwd: repoRoot, stdio: 'inherit'},
);
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const require = createRequire(import.meta.url);
const pose = require(
  join(
    outDir,
    'features/face-ratio/services/faceRatioPoseNormalization.js',
  ),
);
const measurement = require(
  join(
    outDir,
    'features/face-ratio/services/faceRatioLandmarkMeasurement.js',
  ),
);
const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(args.input);
const artifact = validatePhase1ReplayArtifact(
  JSON.parse(readFileSync(inputPath, 'utf8')),
  {requireReplayReady: true},
);
const report = evaluatePhase1ReplayArtifact(artifact, {
  applyFaceRatioPoseTransform: pose.applyFaceRatioPoseTransform,
  extractFaceRatioMeasurementGeometry:
    measurement.extractFaceRatioMeasurementGeometry,
  normalizeFaceRatioLandmarks: pose.normalizeFaceRatioLandmarks,
});

if (args.output) {
  const outputPath = resolve(args.output);
  mkdirSync(dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote aggregate-only Phase 1 replay report: ${outputPath}`);
} else {
  console.log(JSON.stringify(report, null, 2));
}

if (report.gate.status !== 'GO') {
  process.exitCode = 1;
}
