#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {FACE3D_PROFILE_SCHEMA_V3} from './face3d-calibration-contract.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const EXPECTED_GATE_VERSION = 'face3d-gate-v2';
const EXPECTED_PRODUCT_POLICY_ID = 'unified-micro-burst-5of8-v1';
const EXPECTED_PRODUCT_POLICY_TUPLE = Object.freeze({
  aggregation: 'median_mad',
  maximumDurationMs: 500,
  minimumValidFrames: 5,
  sampleMode: 'micro_burst',
  targetValidFrames: 8,
});

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCSharpComments(source) {
  let output = '';
  let state = 'code';

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') {
        output += char;
        state = 'code';
      } else {
        output += ' ';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (state === 'string' || state === 'char') {
      output += char;
      if (char === '\\' && next !== undefined) {
        output += next;
        index += 1;
      } else if (
        (state === 'string' && char === '"')
        || (state === 'char' && char === "'")
      ) {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else {
      output += char;
      if (char === '"') {
        state = 'string';
      } else if (char === "'") {
        state = 'char';
      }
    }
  }

  return output;
}

function readSingleConst(source, type, name) {
  const matches = [
    ...source.matchAll(
      new RegExp(
        `\\bpublic\\s+const\\s+${escapeRegExp(type)}\\s+`
          + `${escapeRegExp(name)}\\s*=\\s*([^;]+);`,
        'g',
      ),
    ),
  ];
  requireCondition(
    matches.length === 1,
    `Unity UnifiedFaceCaptureContract.${name} 선언은 정확히 하나여야 합니다.`,
  );
  return matches[0][1].trim();
}

function readStringConst(source, name) {
  const expression = readSingleConst(source, 'string', name);
  const match = expression.match(/^"([^"]*)"$/);
  requireCondition(
    match,
    `Unity UnifiedFaceCaptureContract.${name}는 string literal이어야 합니다.`,
  );
  return match[1];
}

function readBooleanConst(source, name) {
  const expression = readSingleConst(source, 'bool', name);
  requireCondition(
    expression === 'true' || expression === 'false',
    `Unity UnifiedFaceCaptureContract.${name}는 bool literal이어야 합니다.`,
  );
  return expression === 'true';
}

function extractBraceBlock(source, startPattern, label) {
  const startMatch = startPattern.exec(source);
  requireCondition(startMatch, `${label} 선언을 찾을 수 없습니다.`);
  const openingBrace = source.indexOf('{', startMatch.index + startMatch[0].length);
  requireCondition(openingBrace !== -1, `${label} 본문 시작을 찾을 수 없습니다.`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBrace + 1, index);
      }
    }
  }
  throw new Error(`${label} 본문 끝을 찾을 수 없습니다.`);
}

function readSingleAssignment(block, name) {
  const matches = [
    ...block.matchAll(
      new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*([^;]+);`, 'g'),
    ),
  ];
  requireCondition(
    matches.length === 1,
    `Unity v3 producer의 ${name} 대입은 정확히 하나여야 합니다.`,
  );
  return matches[0][1].replace(/\s+/g, '');
}

function inspectProductPolicyTuple(contractSource) {
  const matches = [
    ...contractSource.matchAll(
      /\{\s*UnifiedFaceCaptureContract\.ProductPolicyId\s*,\s*new\s+UnifiedFaceCapturePolicy\s*\(\s*UnifiedFaceCaptureContract\.ProductPolicyId\s*,\s*UnifiedFaceCaptureContract\.SampleModeMicroBurst\s*,\s*UnifiedFaceCaptureContract\.AggregationMedianMad\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*\}/gs,
    ),
  ];
  requireCondition(
    matches.length === 1,
    'Unity product 5-of-8 policy tuple 선언은 정확히 하나여야 합니다.',
  );
  return {
    maximumDurationMs: Number(matches[0][1]),
    minimumValidFrames: Number(matches[0][2]),
    targetValidFrames: Number(matches[0][3]),
  };
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

  const contractSource = stripCSharpComments(
    fs.readFileSync(resolvedContractPath, 'utf8'),
  );
  const actualProfileSchema = readStringConst(
    contractSource,
    'ProfileSchemaVersion',
  );
  requireCondition(
    actualProfileSchema === expectedProfileSchema,
    `Unity source profile schema가 ${expectedProfileSchema}가 아닙니다: ${actualProfileSchema}`,
  );

  const actualGateVersion = readStringConst(contractSource, 'GateVersion');
  requireCondition(
    actualGateVersion === EXPECTED_GATE_VERSION,
    `Unity GateVersion은 ${EXPECTED_GATE_VERSION}이어야 합니다: ${actualGateVersion}`,
  );
  const actualProductPolicyId = readStringConst(contractSource, 'ProductPolicyId');
  requireCondition(
    actualProductPolicyId === EXPECTED_PRODUCT_POLICY_ID,
    `Unity ProductPolicyId는 ${EXPECTED_PRODUCT_POLICY_ID}이어야 합니다: `
      + actualProductPolicyId,
  );
  requireCondition(
    readStringConst(contractSource, 'SampleModeMicroBurst')
      === EXPECTED_PRODUCT_POLICY_TUPLE.sampleMode,
    'Unity product sampleMode는 micro_burst여야 합니다.',
  );
  requireCondition(
    readStringConst(contractSource, 'AggregationMedianMad')
      === EXPECTED_PRODUCT_POLICY_TUPLE.aggregation,
    'Unity product aggregation은 median_mad여야 합니다.',
  );
  requireCondition(
    readStringConst(contractSource, 'ConfidenceCalibrationUncalibrated')
      === 'uncalibrated',
    'Unity uncalibrated 상태 상수는 uncalibrated여야 합니다.',
  );
  const calibrationPromotionEnabled = readBooleanConst(
    contractSource,
    'CalibrationPromotionEnabled',
  );
  requireCondition(
    calibrationPromotionEnabled === false,
    'Unity CalibrationPromotionEnabled는 Gate 6B 전 정확히 false여야 합니다.',
  );

  const productPolicy = inspectProductPolicyTuple(contractSource);
  requireCondition(
    productPolicy.maximumDurationMs
      === EXPECTED_PRODUCT_POLICY_TUPLE.maximumDurationMs
      && productPolicy.minimumValidFrames
        === EXPECTED_PRODUCT_POLICY_TUPLE.minimumValidFrames
      && productPolicy.targetValidFrames
        === EXPECTED_PRODUCT_POLICY_TUPLE.targetValidFrames,
    'Unity product policy는 immutable 500ms/5-of-8 tuple이어야 합니다.',
  );

  const producerConstructor = extractBraceBlock(
    contractSource,
    /private\s+Face3DProfileV2\s*\(/g,
    'Unity Face3DProfileV2 producer constructor',
  );
  const producerDefaults = {
    calibrationReceipt: readSingleAssignment(
      producerConstructor,
      'CalibrationReceipt',
    ),
    collectionPolicyId: readSingleAssignment(
      producerConstructor,
      'CollectionPolicyId',
    ),
    confidenceCalibrationStatus: readSingleAssignment(
      producerConstructor,
      'ConfidenceCalibrationStatus',
    ),
    gateVersion: readSingleAssignment(producerConstructor, 'GateVersion'),
    profileBindingSha256: readSingleAssignment(
      producerConstructor,
      'ProfileBindingSha256',
    ),
    schemaVersion: readSingleAssignment(producerConstructor, 'SchemaVersion'),
  };
  requireCondition(
    producerDefaults.schemaVersion
      === 'UnifiedFaceCaptureContract.ProfileSchemaVersion'
      && producerDefaults.collectionPolicyId === 'policy.Id'
      && producerDefaults.gateVersion === 'UnifiedFaceCaptureContract.GateVersion',
    'Unity v3 producer는 immutable schema/policy/gate binding을 그대로 사용해야 합니다.',
  );
  requireCondition(
    producerDefaults.confidenceCalibrationStatus
      === 'UnifiedFaceCaptureContract.ConfidenceCalibrationUncalibrated',
    'Unity v3 producer의 ConfidenceCalibrationStatus 기본값은 uncalibrated여야 합니다.',
  );
  requireCondition(
    producerDefaults.profileBindingSha256 === 'null',
    'Unity v3 producer의 ProfileBindingSha256 기본값은 null이어야 합니다.',
  );
  requireCondition(
    producerDefaults.calibrationReceipt === 'null',
    'Unity v3 producer의 CalibrationReceipt 기본값은 null이어야 합니다.',
  );

  const contractTestSource = stripCSharpComments(
    fs.readFileSync(resolvedContractTestPath, 'utf8'),
  );
  requireCondition(
    contractTestSource.includes(expectedProfileSchema),
    `Unity contract test source에 ${expectedProfileSchema} 기대값이 없습니다.`,
  );
  requireCondition(
    /Assert\.That\s*\(\s*UnifiedFaceCaptureContract\.CalibrationPromotionEnabled\s*,\s*Is\.False\s*\)/s
      .test(contractTestSource),
    'Unity contract test source에 CalibrationPromotionEnabled=false assertion이 없습니다.',
  );
  requireCondition(
    /Assert\.That\s*\(\s*\w+\.ConfidenceCalibrationStatus\s*,\s*Is\.EqualTo\s*\(\s*"uncalibrated"\s*\)\s*\)/s
      .test(contractTestSource)
      && /Assert\.That\s*\(\s*\w+\.ProfileBindingSha256\s*,\s*Is\.Null\s*\)/s
        .test(contractTestSource)
      && /Assert\.That\s*\(\s*\w+\.CalibrationReceipt\s*,\s*Is\.Null\s*\)/s
        .test(contractTestSource),
    'Unity contract test source에 uncalibrated/null producer default assertion이 없습니다.',
  );

  return {
    actualGateVersion,
    actualProfileSchema,
    actualProductPolicyId,
    calibrationPromotionEnabled,
    contractPath: resolvedContractPath,
    contractTestPath: resolvedContractTestPath,
    expectedProfileSchema,
    productPolicy: {
      ...productPolicy,
      aggregation: EXPECTED_PRODUCT_POLICY_TUPLE.aggregation,
      sampleMode: EXPECTED_PRODUCT_POLICY_TUPLE.sampleMode,
    },
    producerDefaults,
    unityBuildExecuted: false,
    unityEditorTestsExecuted: false,
    verificationScope: 'static_source_policy_and_promotion_guard',
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
