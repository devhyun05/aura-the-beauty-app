#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {FACE3D_PROFILE_SCHEMA_V3} from './face3d-calibration-contract.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');

export const DEFAULT_UNITY_FACE3D_CONTRACT_PATH = path.join(
  repositoryRoot,
  'apps/unity/MakeupAR/Assets/Scripts/Face3D/UnifiedFaceCaptureContracts.cs',
);
export const DEFAULT_UNITY_FACE3D_CONTRACT_TEST_PATH = path.join(
  repositoryRoot,
  'apps/unity/MakeupAR/Assets/Tests/Face3D/UnifiedFaceCaptureContractsTests.cs',
);

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function inspectUnityFace3DSourceContract({
  contractPath = DEFAULT_UNITY_FACE3D_CONTRACT_PATH,
  contractTestPath = DEFAULT_UNITY_FACE3D_CONTRACT_TEST_PATH,
  expectedProfileSchema = FACE3D_PROFILE_SCHEMA_V3,
} = {}) {
  const resolvedContractPath = path.resolve(contractPath);
  const resolvedContractTestPath = path.resolve(contractTestPath);
  requireCondition(
    fs.existsSync(resolvedContractPath),
    `Unity Face3D contract source가 없습니다: ${resolvedContractPath}`,
  );
  requireCondition(
    fs.existsSync(resolvedContractTestPath),
    `Unity Face3D contract test source가 없습니다: ${resolvedContractTestPath}`,
  );

  const contractSource = fs.readFileSync(resolvedContractPath, 'utf8');
  const profileSchemaMatches = [
    ...contractSource.matchAll(
      /public const string ProfileSchemaVersion\s*=\s*"([^"]+)"\s*;/g,
    ),
  ];
  requireCondition(
    profileSchemaMatches.length === 1,
    'Unity UnifiedFaceCaptureContract.ProfileSchemaVersion 선언은 정확히 하나여야 합니다.',
  );
  const actualProfileSchema = profileSchemaMatches[0][1];
  requireCondition(
    actualProfileSchema === expectedProfileSchema,
    `Unity source profile schema가 ${expectedProfileSchema}가 아닙니다: ${actualProfileSchema}`,
  );

  const contractTestSource = fs.readFileSync(resolvedContractTestPath, 'utf8');
  requireCondition(
    contractTestSource.includes(expectedProfileSchema),
    `Unity contract test source에 ${expectedProfileSchema} 기대값이 없습니다.`,
  );

  return {
    actualProfileSchema,
    contractPath: resolvedContractPath,
    contractTestPath: resolvedContractTestPath,
    expectedProfileSchema,
    unityBuildExecuted: false,
    unityEditorTestsExecuted: false,
    verificationScope: 'static_source_only',
  };
}

export function runCli() {
  const result = inspectUnityFace3DSourceContract();
  console.log(
    `[aura:face3d] Unity source contract PASS: ${result.actualProfileSchema}`,
  );
  console.log(
    '[aura:face3d] 범위=정적 소스 검사; Unity 빌드/Editor 테스트 실행=0 '
      + '(CI Unity 라이선스 비의존)',
  );
  return result;
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `[aura:face3d] Unity source contract FAIL: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
