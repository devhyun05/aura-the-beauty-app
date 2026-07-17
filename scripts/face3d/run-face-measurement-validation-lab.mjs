#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  validateFaceMeasurementCollectionPlan,
} from './prepare-face-measurement-collection.mjs';

export const FACE_MEASUREMENT_COLLECTION_MODE_ENV =
  'EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_MODE';
export const FACE_MEASUREMENT_COLLECTION_PLAN_ENV =
  'EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_PLAN_BASE64';

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readOption(argv, flag) {
  const index = argv.indexOf(flag);
  requireCondition(
    index !== -1 && typeof argv[index + 1] === 'string',
    `${flag} 값이 필요합니다.`,
  );
  return argv[index + 1];
}

export function buildPreparedLabEnvironment(plan) {
  validateFaceMeasurementCollectionPlan(plan);
  return {
    [FACE_MEASUREMENT_COLLECTION_MODE_ENV]: 'prepared',
    [FACE_MEASUREMENT_COLLECTION_PLAN_ENV]: Buffer.from(
      JSON.stringify(plan),
      'utf8',
    ).toString('base64'),
  };
}

export function parsePreparedLabArguments(argv) {
  const separatorIndex = argv.indexOf('--');
  const ownArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const forwardedArgs =
    separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  const target = readOption(ownArgs, '--target');
  requireCondition(
    target === 'start' || target === 'ios',
    '--target은 start 또는 ios여야 합니다.',
  );

  return {
    forwardedArgs,
    planPath: path.resolve(readOption(ownArgs, '--plan')),
    target,
  };
}

export function runPreparedLab(argv = process.argv.slice(2)) {
  const {forwardedArgs, planPath, target} =
    parsePreparedLabArguments(argv);
  requireCondition(fs.existsSync(planPath), `collection plan이 없습니다: ${planPath}`);
  const plan = validateFaceMeasurementCollectionPlan(
    JSON.parse(fs.readFileSync(planPath, 'utf8')),
  );
  const preparedEnvironment = buildPreparedLabEnvironment(plan);
  const mobileScript =
    target === 'start'
      ? 'start:face-measurement-prepared-lab'
      : 'ios:face-measurement-prepared-lab';
  const npmArgs = ['--prefix', 'apps/mobile', 'run', mobileScript];
  if (forwardedArgs.length > 0) {
    npmArgs.push('--', ...forwardedArgs);
  }
  const result = spawnSync('npm', npmArgs, {
    cwd: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..',
    ),
    env: {...process.env, ...preparedEnvironment},
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    process.exitCode = runPreparedLab();
  } catch (error) {
    console.error(
      `Prepared face measurement lab 시작 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
