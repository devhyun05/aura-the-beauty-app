#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {FACE3D_PROFILE_SCHEMA_V3} from './face3d-calibration-contract.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');

export const DEFAULT_MOBILE_UNITY_BUILD_DIRECTORY = path.join(
  repositoryRoot,
  'apps/mobile/ios/UnityBuild',
);
export const UNITY_FACE3D_REBUILD_COMMAND =
  'bash scripts/unity/build_ios_unity_framework.sh';

const PROFILE_SCHEMA_PREFIX = 'aura.face3d-profile.v';

export class UnityFace3DRuntimePreflightError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'UnityFace3DRuntimePreflightError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new UnityFace3DRuntimePreflightError(code, message, details);
}

export function detectEmbeddedFace3DProfileSchemas(metadata) {
  const bytes = Buffer.isBuffer(metadata) ? metadata : Buffer.from(metadata);
  const prefix = Buffer.from(PROFILE_SCHEMA_PREFIX, 'utf8');
  const schemas = new Set();
  let offset = 0;

  while (offset < bytes.length) {
    const index = bytes.indexOf(prefix, offset);
    if (index === -1) {
      break;
    }
    const versionByte = bytes[index + prefix.length];
    if (versionByte >= 0x30 && versionByte <= 0x39) {
      schemas.add(`${PROFILE_SCHEMA_PREFIX}${String.fromCharCode(versionByte)}`);
    }
    offset = index + prefix.length;
  }

  return [...schemas].sort();
}

export function inspectEmbeddedUnityFace3DRuntime({
  unityBuildDirectory = DEFAULT_MOBILE_UNITY_BUILD_DIRECTORY,
  expectedProfileSchema = FACE3D_PROFILE_SCHEMA_V3,
} = {}) {
  const resolvedBuildDirectory = path.resolve(unityBuildDirectory);
  const frameworkDirectory = path.join(
    resolvedBuildDirectory,
    'UnityFramework.framework',
  );
  const metadataPath = path.join(
    resolvedBuildDirectory,
    'Data/Managed/Metadata/global-metadata.dat',
  );
  const passiveVerification = {
    deviceActionsExecuted: false,
    unityBuildExecuted: false,
    verificationScope: 'embedded_il2cpp_metadata_only',
  };

  if (
    !fs.existsSync(resolvedBuildDirectory)
    || !fs.statSync(resolvedBuildDirectory).isDirectory()
  ) {
    fail(
      'unity_build_missing',
      `UnityBuild 디렉터리가 없습니다: ${resolvedBuildDirectory}`,
      passiveVerification,
    );
  }
  if (
    !fs.existsSync(frameworkDirectory)
    || !fs.statSync(frameworkDirectory).isDirectory()
  ) {
    fail(
      'unity_framework_missing',
      `UnityFramework.framework가 없습니다: ${frameworkDirectory}`,
      passiveVerification,
    );
  }
  if (!fs.existsSync(metadataPath)) {
    fail(
      'unity_metadata_missing',
      `Unity IL2CPP metadata가 없습니다: ${metadataPath}`,
      passiveVerification,
    );
  }

  const metadataStat = fs.statSync(metadataPath);
  if (!metadataStat.isFile() || metadataStat.size === 0) {
    fail(
      'unity_metadata_invalid',
      `Unity IL2CPP metadata가 비어 있거나 파일이 아닙니다: ${metadataPath}`,
      passiveVerification,
    );
  }

  const metadata = fs.readFileSync(metadataPath);
  const observedProfileSchemas = detectEmbeddedFace3DProfileSchemas(metadata);
  if (!metadata.includes(Buffer.from(expectedProfileSchema, 'utf8'))) {
    fail(
      'unity_profile_schema_stale',
      `임베디드 Unity Face3D profile schema가 ${expectedProfileSchema}가 아닙니다. `
        + `관측값: ${observedProfileSchemas.join(', ') || '없음'}`,
      {
        ...passiveVerification,
        expectedProfileSchema,
        metadataPath,
        observedProfileSchemas,
      },
    );
  }

  return {
    ...passiveVerification,
    expectedProfileSchema,
    frameworkDirectory,
    metadataPath,
    observedProfileSchemas,
    readyForDeviceCollection: true,
    unityBuildDirectory: resolvedBuildDirectory,
  };
}

function readOptionalFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  if (typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) {
    fail('argument_missing', `${flag} 값이 없습니다.`);
  }
  return argv[index + 1];
}

export function runCli(argv = process.argv.slice(2)) {
  const unityBuildDirectory = readOptionalFlag(argv, '--unity-build-dir');
  const result = inspectEmbeddedUnityFace3DRuntime({
    unityBuildDirectory:
      unityBuildDirectory ?? DEFAULT_MOBILE_UNITY_BUILD_DIRECTORY,
  });
  console.log(
    `[aura:face3d] Unity runtime preflight PASS: ${result.expectedProfileSchema}`,
  );
  console.log(`[aura:face3d] metadata: ${result.metadataPath}`);
  console.log(
    '[aura:face3d] Unity build/device collection actions executed: 0',
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
      `[aura:face3d] Unity runtime preflight FAIL: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    console.error('[aura:face3d] 자동 빌드/실기기 동작은 실행하지 않았습니다.');
    console.error(`[aura:face3d] Unity 재빌드 명령: ${UNITY_FACE3D_REBUILD_COMMAND}`);
    console.error(
      '[aura:face3d] 재빌드 후 재검사: npm run face3d:collection:preflight',
    );
    process.exitCode = 1;
  }
}
