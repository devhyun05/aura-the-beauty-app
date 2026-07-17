#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  UNITY_FACE3D_REBUILD_COMMAND,
  UnityFace3DRuntimePreflightError,
  detectEmbeddedFace3DProfileSchemas,
  inspectEmbeddedUnityFace3DRuntime,
} from './check-unity-face3d-runtime-preflight.mjs';
import {inspectUnityFace3DSourceContract} from './check-unity-face3d-source-contract.mjs';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function createEmbeddedBuild(root, metadataContents) {
  const buildDirectory = path.join(root, 'UnityBuild');
  const frameworkDirectory = path.join(
    buildDirectory,
    'UnityFramework.framework',
  );
  fs.mkdirSync(frameworkDirectory, {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(frameworkDirectory, 'UnityFramework'),
    Buffer.from('fixture-unity-framework-binary'),
  );
  const metadataDirectory = path.join(
    buildDirectory,
    'Data/Managed/Metadata',
  );
  fs.mkdirSync(metadataDirectory, {recursive: true});
  fs.writeFileSync(
    path.join(metadataDirectory, 'global-metadata.dat'),
    metadataContents,
  );
  return buildDirectory;
}

function createSourceFixture(root, {
  aggregation = 'median_mad',
  calibrationPromotionEnabled = false,
  calibrationReceiptExpression = 'null',
  confidenceCalibrationExpression =
    'UnifiedFaceCaptureContract.ConfidenceCalibrationUncalibrated',
  gateVersion = 'face3d-gate-v2',
  maximumDurationMs = 500,
  minimumValidFrames = 5,
  productPolicyId = 'unified-micro-burst-5of8-v1',
  profileBindingExpression = 'null',
  sampleMode = 'micro_burst',
  schema = 'aura.face3d-profile.v3',
  targetValidFrames = 8,
} = {}) {
  fs.mkdirSync(root, {recursive: true});
  const contractPath = path.join(root, 'UnifiedFaceCaptureContracts.cs');
  const contractTestPath = path.join(
    root,
    'UnifiedFaceCaptureContractsTests.cs',
  );
  fs.writeFileSync(
    contractPath,
    [
      'public static class UnifiedFaceCaptureContract',
      '{',
      `    public const string ProfileSchemaVersion = "${schema}";`,
      `    public const string GateVersion = "${gateVersion}";`,
      '    public const string ConfidenceCalibrationUncalibrated = "uncalibrated";',
      `    public const bool CalibrationPromotionEnabled = ${calibrationPromotionEnabled};`,
      `    public const string AggregationMedianMad = "${aggregation}";`,
      `    public const string SampleModeMicroBurst = "${sampleMode}";`,
      `    public const string ProductPolicyId = "${productPolicyId}";`,
      '}',
      'public static class UnifiedFaceCaptureRequestValidator',
      '{',
      '    private static readonly object Policies = new object[]',
      '    {',
      '        {',
      '            UnifiedFaceCaptureContract.ProductPolicyId,',
      '            new UnifiedFaceCapturePolicy(',
      '                UnifiedFaceCaptureContract.ProductPolicyId,',
      '                UnifiedFaceCaptureContract.SampleModeMicroBurst,',
      '                UnifiedFaceCaptureContract.AggregationMedianMad,',
      `                ${maximumDurationMs},`,
      `                ${minimumValidFrames},`,
      `                ${targetValidFrames})`,
      '        }',
      '    };',
      '}',
      'public sealed class Face3DProfileV2',
      '{',
      '    private Face3DProfileV2(UnifiedFaceCapturePolicy policy)',
      '    {',
      '        SchemaVersion = UnifiedFaceCaptureContract.ProfileSchemaVersion;',
      '        CollectionPolicyId = policy.Id;',
      '        GateVersion = UnifiedFaceCaptureContract.GateVersion;',
      `        ConfidenceCalibrationStatus = ${confidenceCalibrationExpression};`,
      `        ProfileBindingSha256 = ${profileBindingExpression};`,
      `        CalibrationReceipt = ${calibrationReceiptExpression};`,
      '    }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    contractTestPath,
    [
      `Assert.That(json, Does.Contain("${schema}"));`,
      'Assert.That(profile.ConfidenceCalibrationStatus, Is.EqualTo("uncalibrated"));',
      'Assert.That(profile.ProfileBindingSha256, Is.Null);',
      'Assert.That(profile.CalibrationReceipt, Is.Null);',
      'Assert.That(UnifiedFaceCaptureContract.CalibrationPromotionEnabled, Is.False);',
      '',
    ].join('\n'),
    'utf8',
  );
  return {contractPath, contractTestPath};
}

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'aura-unity-face3d-preflight-'),
);

test('detects embedded Face3D schema strings without shell tools', () => {
  assert.deepEqual(
    detectEmbeddedFace3DProfileSchemas(
      Buffer.from(
        '\0aura.face3d-profile.v1x\0aura.face3d-profile.v2'
          + '\0aura.face3d-profile.v3\0',
        'utf8',
      ),
    ),
    [
      'aura.face3d-profile.v1',
      'aura.face3d-profile.v2',
      'aura.face3d-profile.v3',
    ],
  );
});

test('root npm aliases preserve the public preflight and source-check commands', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    packageJson.scripts['face3d:collection:preflight'],
    'node scripts/face3d/check-unity-face3d-runtime-preflight.mjs',
  );
  assert.equal(
    packageJson.scripts['face3d:check:unity-source-contract'],
    'node scripts/face3d/check-unity-face3d-source-contract.mjs',
  );
  assert.equal(
    packageJson.scripts['face3d:test:unity-runtime-preflight'],
    'node scripts/face3d/test-unity-face3d-runtime-preflight.mjs',
  );
});

test('embedded runtime preflight accepts v3 and executes no build or device action', () => {
  const buildDirectory = createEmbeddedBuild(
    path.join(root, 'ready'),
    Buffer.from('\0binary\0aura.face3d-profile.v3\0payload', 'utf8'),
  );
  const result = inspectEmbeddedUnityFace3DRuntime({
    unityBuildDirectory: buildDirectory,
  });
  assert.equal(result.readyForDeviceCollection, true);
  assert.equal(
    result.verificationScope,
    'embedded_framework_and_il2cpp_metadata',
  );
  assert.equal(result.unityBuildExecuted, false);
  assert.equal(result.deviceActionsExecuted, false);
  assert.equal(
    fs.statSync(result.frameworkExecutablePath).size > 0,
    true,
  );
  assert.deepEqual(result.observedProfileSchemas, ['aura.face3d-profile.v3']);
});

test('embedded runtime preflight rejects a stale v2 build fail-closed', () => {
  const buildDirectory = createEmbeddedBuild(
    path.join(root, 'stale'),
    Buffer.from('\0aura.face3d-profile.v1\0aura.face3d-profile.v2\0', 'utf8'),
  );
  assert.throws(
    () => inspectEmbeddedUnityFace3DRuntime({
      unityBuildDirectory: buildDirectory,
    }),
    error =>
      error instanceof UnityFace3DRuntimePreflightError
      && error.code === 'unity_profile_schema_stale'
      && error.details.unityBuildExecuted === false
      && error.details.deviceActionsExecuted === false
      && error.details.observedProfileSchemas.includes(
        'aura.face3d-profile.v2',
      ),
  );
  assert.equal(
    UNITY_FACE3D_REBUILD_COMMAND,
    'bash scripts/unity/build_ios_unity_framework.sh',
  );
});

test('embedded runtime preflight rejects missing framework and metadata', () => {
  const missingFramework = path.join(root, 'missing-framework', 'UnityBuild');
  fs.mkdirSync(missingFramework, {recursive: true});
  assert.throws(
    () => inspectEmbeddedUnityFace3DRuntime({
      unityBuildDirectory: missingFramework,
    }),
    error =>
      error instanceof UnityFace3DRuntimePreflightError
      && error.code === 'unity_framework_missing',
  );

  const missingMetadata = path.join(root, 'missing-metadata', 'UnityBuild');
  const missingMetadataFramework = path.join(
    missingMetadata,
    'UnityFramework.framework',
  );
  fs.mkdirSync(missingMetadataFramework, {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(missingMetadataFramework, 'UnityFramework'),
    Buffer.from('fixture-unity-framework-binary'),
  );
  assert.throws(
    () => inspectEmbeddedUnityFace3DRuntime({
      unityBuildDirectory: missingMetadata,
    }),
    error =>
      error instanceof UnityFace3DRuntimePreflightError
      && error.code === 'unity_metadata_missing',
  );
});

test('embedded runtime preflight rejects missing or empty framework executable', () => {
  const missingExecutable = createEmbeddedBuild(
    path.join(root, 'missing-executable'),
    Buffer.from('\0aura.face3d-profile.v3\0', 'utf8'),
  );
  fs.rmSync(
    path.join(
      missingExecutable,
      'UnityFramework.framework',
      'UnityFramework',
    ),
  );
  assert.throws(
    () => inspectEmbeddedUnityFace3DRuntime({
      unityBuildDirectory: missingExecutable,
    }),
    error =>
      error instanceof UnityFace3DRuntimePreflightError
      && error.code === 'unity_framework_executable_missing',
  );

  const emptyExecutable = createEmbeddedBuild(
    path.join(root, 'empty-executable'),
    Buffer.from('\0aura.face3d-profile.v3\0', 'utf8'),
  );
  fs.writeFileSync(
    path.join(
      emptyExecutable,
      'UnityFramework.framework',
      'UnityFramework',
    ),
    Buffer.alloc(0),
  );
  assert.throws(
    () => inspectEmbeddedUnityFace3DRuntime({
      unityBuildDirectory: emptyExecutable,
    }),
    error =>
      error instanceof UnityFace3DRuntimePreflightError
      && error.code === 'unity_framework_executable_invalid',
  );
});

test('source checker verifies v3 but explicitly does not run Unity tests', () => {
  const paths = createSourceFixture(
    path.join(root, 'source-v3'),
  );
  const result = inspectUnityFace3DSourceContract(paths);
  assert.equal(result.actualProfileSchema, 'aura.face3d-profile.v3');
  assert.equal(result.actualGateVersion, 'face3d-gate-v2');
  assert.equal(result.actualProductPolicyId, 'unified-micro-burst-5of8-v1');
  assert.equal(result.calibrationPromotionEnabled, false);
  assert.deepEqual(result.productPolicy, {
    aggregation: 'median_mad',
    maximumDurationMs: 500,
    minimumValidFrames: 5,
    sampleMode: 'micro_burst',
    targetValidFrames: 8,
  });
  assert.equal(
    result.verificationScope,
    'static_source_policy_and_promotion_guard',
  );
  assert.equal(result.unityBuildExecuted, false);
  assert.equal(result.unityEditorTestsExecuted, false);
});

test('source checker rejects a non-v3 Unity contract', () => {
  const paths = createSourceFixture(
    path.join(root, 'source-v2'),
    {schema: 'aura.face3d-profile.v2'},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(paths),
    /Unity source profile schema가 aura\.face3d-profile\.v3가 아닙니다/,
  );
});

test('source checker rejects promotion enabled before Gate 6B', () => {
  const paths = createSourceFixture(
    path.join(root, 'source-promotion-enabled'),
    {calibrationPromotionEnabled: true},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(paths),
    /CalibrationPromotionEnabled.*정확히 false/,
  );
});

test('source checker ignores commented-out false promotion decoys', () => {
  const paths = createSourceFixture(
    path.join(root, 'source-commented-promotion-decoy'),
  );
  const source = fs.readFileSync(paths.contractPath, 'utf8').replace(
    'public const bool CalibrationPromotionEnabled = false;',
    '// public const bool CalibrationPromotionEnabled = false;\n'
      + '    public static bool CalibrationPromotionEnabled => true;',
  );
  fs.writeFileSync(paths.contractPath, source, 'utf8');
  assert.throws(
    () => inspectUnityFace3DSourceContract(paths),
    /CalibrationPromotionEnabled 선언은 정확히 하나/,
  );
});

test('source checker rejects calibrated producer defaults', () => {
  const paths = createSourceFixture(
    path.join(root, 'source-calibrated-default'),
    {
      confidenceCalibrationExpression:
        'UnifiedFaceCaptureContract.ConfidenceCalibrationCalibrated',
    },
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(paths),
    /ConfidenceCalibrationStatus 기본값은 uncalibrated/,
  );
});

test('source checker rejects pre-populated binding or receipt defaults', () => {
  const bindingPaths = createSourceFixture(
    path.join(root, 'source-binding-default'),
    {profileBindingExpression: '"fixture-binding"'},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(bindingPaths),
    /ProfileBindingSha256 기본값은 null/,
  );

  const receiptPaths = createSourceFixture(
    path.join(root, 'source-receipt-default'),
    {calibrationReceiptExpression: 'new Face3DCalibrationReceipt()'},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(receiptPaths),
    /CalibrationReceipt 기본값은 null/,
  );
});

test('source checker rejects immutable product tuple drift', () => {
  const paths = createSourceFixture(
    path.join(root, 'source-policy-drift'),
    {minimumValidFrames: 4},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(paths),
    /immutable 500ms\/5-of-8 tuple/,
  );
});

test('source checker rejects gate and product policy identifier drift', () => {
  const gatePaths = createSourceFixture(
    path.join(root, 'source-gate-drift'),
    {gateVersion: 'face3d-gate-v3'},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(gatePaths),
    /GateVersion은 face3d-gate-v2/,
  );

  const policyPaths = createSourceFixture(
    path.join(root, 'source-policy-id-drift'),
    {productPolicyId: 'unified-micro-burst-4of8-v1'},
  );
  assert.throws(
    () => inspectUnityFace3DSourceContract(policyPaths),
    /ProductPolicyId는 unified-micro-burst-5of8-v1/,
  );
});

console.log(`\nUnity Face3D runtime preflight tooling: ${passed} tests passed.`);
