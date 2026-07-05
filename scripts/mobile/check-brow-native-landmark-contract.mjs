import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const providerPath = resolve(
  repoRoot,
  'apps/mobile/ios/AURA/E7NativeLipBoundaryProviders.swift',
);
const providerSource = readFileSync(providerPath, 'utf8');

const upstreamRightBrowUnique = [55, 107, 66, 105, 63, 70, 46, 53, 52, 65];
const upstreamLeftBrowUnique = [285, 336, 296, 334, 293, 300, 276, 283, 295];
const appLeftBrowBodyBalanceIndex = 282;

function fail(message) {
  console.error(`[aura:brow-native] FAIL ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function extractIntArray(name) {
  const match = providerSource.match(
    new RegExp(`private let ${name} = \\[([\\s\\S]*?)\\]`, 'm'),
  );
  if (!match) {
    fail(`missing Swift array ${name}`);
  }
  return (match[1].match(/\d+/g) ?? []).map(value => Number.parseInt(value, 10));
}

function sameSet(actual, expected) {
  return (
    actual.length === expected.length &&
    expected.every(value => actual.includes(value)) &&
    actual.every(value => expected.includes(value))
  );
}

function hasNoDuplicates(values) {
  return new Set(values).size === values.length;
}

function assertContainsAll(actual, expected, label) {
  const missing = expected.filter(value => !actual.includes(value));
  assert(missing.length === 0, `${label} missing indices ${missing.join(',')}`);
}

const leftBrow = extractIntArray('mediaPipeLeftBrowIndices');
const rightBrow = extractIntArray('mediaPipeRightBrowIndices');
const leftDenseBrow = extractIntArray('mediaPipeLeftDenseBrowIndices');
const rightDenseBrow = extractIntArray('mediaPipeRightDenseBrowIndices');

assert(hasNoDuplicates(leftBrow), 'left brow core indices must not include a duplicate closing point');
assert(hasNoDuplicates(rightBrow), 'right brow core indices must not include a duplicate closing point');
assert(rightBrow.length === 10, `right brow core must keep 10 points, got ${rightBrow.length}`);
assert(leftBrow.length === 10, `left brow core must keep 10 points, got ${leftBrow.length}`);
assert(
  sameSet(rightBrow, upstreamRightBrowUnique),
  `right brow core must match upstream EYE_BROW_CONNECTIONS set, got [${rightBrow.join(',')}]`,
);
assertContainsAll(
  leftBrow,
  upstreamLeftBrowUnique,
  'left brow core upstream EYE_BROW_CONNECTIONS set',
);
assert(
  leftBrow.includes(appLeftBrowBodyBalanceIndex),
  `left brow core must include app body-balance point ${appLeftBrowBodyBalanceIndex}`,
);
assert(
  leftBrow.every(value => upstreamLeftBrowUnique.includes(value) || value === appLeftBrowBodyBalanceIndex),
  `left brow core contains non-reference indices [${leftBrow.join(',')}]`,
);
assertContainsAll(leftDenseBrow, leftBrow, 'left dense brow anchors');
assertContainsAll(rightDenseBrow, rightBrow, 'right dense brow anchors');
assert(
  /"leftEyebrowCore":\s*mediaPipeRegionPayload\(\s*faceLandmarks,\s*indices:\s*mediaPipeLeftBrowIndices/m.test(
    providerSource,
  ),
  'leftEyebrowCore must expose the raw core ring, not the densified boundary',
);
assert(
  /"rightEyebrowCore":\s*mediaPipeRegionPayload\(\s*faceLandmarks,\s*indices:\s*mediaPipeRightBrowIndices/m.test(
    providerSource,
  ),
  'rightEyebrowCore must expose the raw core ring, not the densified boundary',
);
assert(
  /"leftEyebrow":\s*mediaPipeRegionPayload\(\s*faceLandmarks,\s*browCoreIndices:\s*mediaPipeLeftBrowIndices/m.test(
    providerSource,
  ),
  'leftEyebrow must expose the densified generated brow boundary',
);
assert(
  /"rightEyebrow":\s*mediaPipeRegionPayload\(\s*faceLandmarks,\s*browCoreIndices:\s*mediaPipeRightBrowIndices/m.test(
    providerSource,
  ),
  'rightEyebrow must expose the densified generated brow boundary',
);

console.log('[aura:brow-native] PASS');
console.log(`leftCore=[${leftBrow.join(',')}] rightCore=[${rightBrow.join(',')}]`);
console.log(
  `leftDense=${leftDenseBrow.length} rightDense=${rightDenseBrow.length} bodyBalance=${appLeftBrowBodyBalanceIndex}`,
);
