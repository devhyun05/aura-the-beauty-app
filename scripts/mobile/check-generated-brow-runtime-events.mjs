import {readFileSync} from 'node:fs';

const EXPECTED_SCHEMA = 'generated_brow_mask_applied';
const EXPECTED_ANCHOR_MODE = 'surround_anchor_eye_eyelid_temple_nose_face_oval_v2';
const EXPECTED_EYE_EXCLUSION_MODE = 'upper_eyelid_expanded_eye_bounds_v2';
const EXPECTED_MASK_SAMPLE_CHANNEL = 'generated_brow_green_alpha';
const EXPECTED_MASK_UV_SPLIT_MODE = 'face_local_x_sign';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

if (args.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const eventPath = args.find(arg => !arg.startsWith('-'));
if (!eventPath) {
  printUsage();
  process.exit(2);
}

const events = readRuntimeEvents(readFileSync(eventPath, 'utf8'));
const result = evaluateGeneratedBrowEvents(events);
printResult(result);
process.exit(result.pass ? 0 : 1);

function printUsage() {
  console.log(`Usage:
  node scripts/mobile/check-generated-brow-runtime-events.mjs <generated_brow_mask_applied.jsonl>
  node scripts/mobile/check-generated-brow-runtime-events.mjs <generated_brow_mask_applied.latest.json>
  node scripts/mobile/check-generated-brow-runtime-events.mjs --self-test

The input files are written by Unity under:
  <Application.persistentDataPath>/e7-runtime-events/generated_brow_mask_applied.jsonl
`);
}

function readRuntimeEvents(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('{')) {
    return [JSON.parse(trimmed)];
  }

  return trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function evaluateGeneratedBrowEvents(events) {
  const browEvents = events.filter(event => event?.type === EXPECTED_SCHEMA);
  const latest = browEvents[browEvents.length - 1] ?? null;
  const readyEvents = browEvents.filter(isReadyBrowEvent);
  const latestReady = readyEvents[readyEvents.length - 1] ?? null;
  const blockedCounts = countBy(
    browEvents
      .filter(event => event.status === 'blocked')
      .map(event => stringField(event, 'blockedReason') || 'unknown'),
  );
  const failures = [];
  const warnings = [];

  if (browEvents.length === 0) {
    failures.push('No generated_brow_mask_applied events found.');
  }

  if (!latestReady) {
    failures.push('No ready/partial generated brow event with applied=true, uvAvailable=true, and maskTriangles>0.');
  }

  if (latestReady) {
    requireNumberAtLeast(latestReady, 'faceCount', 1, failures);
    requireNumberAtLeast(latestReady, 'maskTriangles', 1, failures);
    requireNumberAtLeast(latestReady, 'meshVertexCount', 1, failures);
    requireNumberAtLeast(latestReady, 'meshUvCount', 1, failures);
    requireNumberAtLeast(latestReady, 'surroundAnchorPointCount', 70, failures);
    requireNumberAtLeast(latestReady, 'browAnchorPointCount', 20, failures);
    requireNumberAtLeast(latestReady, 'eyeAnchorPointCount', 20, failures);
    requireNumberAtLeast(latestReady, 'upperEyelidAnchorPointCount', 10, failures);
    requireNumberAtLeast(latestReady, 'softEdgeTexels', 1, failures);
    requireEqual(latestReady, 'maskUvBoundsAvailable', true, failures);
    requireEqual(latestReady, 'maskTextureSampleChannel', EXPECTED_MASK_SAMPLE_CHANNEL, failures);
    requireUvBounds(latestReady, failures);
    requireEqual(latestReady, 'maskUvSplitMode', EXPECTED_MASK_UV_SPLIT_MODE, failures);
    requireNumberAtLeast(latestReady, 'maskNegativeXTriangleCount', 1, failures);
    requireNumberAtLeast(latestReady, 'maskPositiveXTriangleCount', 1, failures);
    requireEqual(latestReady, 'maskNegativeXUvBoundsAvailable', true, failures);
    requireEqual(latestReady, 'maskPositiveXUvBoundsAvailable', true, failures);
    requireUvBoundsForPrefix(latestReady, 'maskNegativeXUv', failures);
    requireUvBoundsForPrefix(latestReady, 'maskPositiveXUv', failures);
    requireEqual(latestReady, 'anchorStabilizationMode', EXPECTED_ANCHOR_MODE, failures);
    requireEqual(latestReady, 'eyeExclusionMode', EXPECTED_EYE_EXCLUSION_MODE, failures);
    requireEqual(latestReady, 'cleanupStrength', 0, failures);
    requireEqual(latestReady, 'neutralizeStrength', 0, failures);

    if (stringField(latestReady, 'trackingState') !== 'Tracking') {
      warnings.push(`Latest ready trackingState is ${stringField(latestReady, 'trackingState') || 'unknown'}.`);
    }

    const syncWorst = numberField(latestReady, 'overlaySyncWorstDurationMs');
    if (syncWorst !== undefined && syncWorst > 50) {
      warnings.push(`overlaySyncWorstDurationMs is high: ${syncWorst}ms.`);
    }
  }

  return {
    blockedCounts,
    browEventCount: browEvents.length,
    failures,
    latest,
    latestReady,
    pass: failures.length === 0,
    readyEventCount: readyEvents.length,
    warnings,
  };
}

function isReadyBrowEvent(event) {
  return (
    (event.status === 'ready' || event.status === 'partial') &&
    event.applied === true &&
    event.runtimeReady === true &&
    event.uvAvailable === true &&
    numberField(event, 'maskTriangles') > 0
  );
}

function requireNumberAtLeast(event, field, minimum, failures) {
  const value = numberField(event, field);
  if (value === undefined || value < minimum) {
    failures.push(`${field} expected >= ${minimum}, received ${formatValue(value)}.`);
  }
}

function requireEqual(event, field, expected, failures) {
  const value = event[field];
  if (value !== expected) {
    failures.push(`${field} expected ${formatValue(expected)}, received ${formatValue(value)}.`);
  }
}

function requireUvBounds(event, failures) {
  const minX = numberField(event, 'maskUvMinX');
  const minY = numberField(event, 'maskUvMinY');
  const maxX = numberField(event, 'maskUvMaxX');
  const maxY = numberField(event, 'maskUvMaxY');
  const values = {maskUvMinX: minX, maskUvMinY: minY, maskUvMaxX: maxX, maskUvMaxY: maxY};

  Object.entries(values).forEach(([field, value]) => {
    if (value === undefined || value < 0 || value > 1) {
      failures.push(`${field} expected within 0..1, received ${formatValue(value)}.`);
    }
  });

  if (
    minX !== undefined &&
    minY !== undefined &&
    maxX !== undefined &&
    maxY !== undefined &&
    (maxX <= minX || maxY <= minY)
  ) {
    failures.push(
      `mask UV bounds expected positive area, received [${minX}, ${minY}, ${maxX}, ${maxY}].`,
    );
  }
}

function requireUvBoundsForPrefix(event, prefix, failures) {
  const minX = numberField(event, `${prefix}MinX`);
  const minY = numberField(event, `${prefix}MinY`);
  const maxX = numberField(event, `${prefix}MaxX`);
  const maxY = numberField(event, `${prefix}MaxY`);
  const values = {
    [`${prefix}MinX`]: minX,
    [`${prefix}MinY`]: minY,
    [`${prefix}MaxX`]: maxX,
    [`${prefix}MaxY`]: maxY,
  };

  Object.entries(values).forEach(([field, value]) => {
    if (value === undefined || value < 0 || value > 1) {
      failures.push(`${field} expected within 0..1, received ${formatValue(value)}.`);
    }
  });

  if (
    minX !== undefined &&
    minY !== undefined &&
    maxX !== undefined &&
    maxY !== undefined &&
    (maxX <= minX || maxY <= minY)
  ) {
    failures.push(
      `${prefix} bounds expected positive area, received [${minX}, ${minY}, ${maxX}, ${maxY}].`,
    );
  }
}

function numberField(event, field) {
  const value = event?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(event, field) {
  const value = event?.[field];
  return typeof value === 'string' ? value : undefined;
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatValue(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

function printResult(result) {
  console.log(`[aura:brow-runtime] ${result.pass ? 'PASS' : 'FAIL'}`);
  console.log(`events=${result.browEventCount} ready=${result.readyEventCount}`);

  if (result.latestReady) {
    console.log(
      [
        `latestReady.status=${result.latestReady.status}`,
        `maskTriangles=${result.latestReady.maskTriangles}`,
        `faceCount=${result.latestReady.faceCount}`,
        `trackingState=${result.latestReady.trackingState}`,
        `uvAvailable=${result.latestReady.uvAvailable}`,
        `maskTextureSampleChannel=${result.latestReady.maskTextureSampleChannel}`,
        `maskUvSplitMode=${result.latestReady.maskUvSplitMode}`,
        `maskNegativeXTriangles=${result.latestReady.maskNegativeXTriangleCount}`,
        `maskPositiveXTriangles=${result.latestReady.maskPositiveXTriangleCount}`,
        `softEdgeTexels=${result.latestReady.softEdgeTexels}`,
        `anchorMode=${result.latestReady.anchorStabilizationMode}`,
      ].join(' '),
    );
  }

  if (Object.keys(result.blockedCounts).length > 0) {
    console.log(`blockedReasons=${JSON.stringify(result.blockedCounts)}`);
  }

  result.warnings.forEach(warning => console.warn(`[aura:brow-runtime] WARN ${warning}`));
  result.failures.forEach(failure => console.error(`[aura:brow-runtime] FAIL ${failure}`));
}

function runSelfTest() {
  const sampleEvent = {
    anchorStabilizationMode: EXPECTED_ANCHOR_MODE,
    applied: true,
    browAnchorPointCount: 24,
    cleanupStrength: 0,
    eyeAnchorPointCount: 20,
    eyeExclusionMode: EXPECTED_EYE_EXCLUSION_MODE,
    faceCount: 1,
    maskTriangles: 118,
    maskNegativeXTriangleCount: 56,
    maskNegativeXUvBoundsAvailable: true,
    maskNegativeXUvMaxX: 0.44,
    maskNegativeXUvMaxY: 0.47,
    maskNegativeXUvMinX: 0.31,
    maskNegativeXUvMinY: 0.35,
    maskPositiveXTriangleCount: 62,
    maskPositiveXUvBoundsAvailable: true,
    maskPositiveXUvMaxX: 0.62,
    maskPositiveXUvMaxY: 0.48,
    maskPositiveXUvMinX: 0.49,
    maskPositiveXUvMinY: 0.36,
    maskTextureSampleChannel: EXPECTED_MASK_SAMPLE_CHANNEL,
    maskUvBoundsAvailable: true,
    maskUvMaxX: 0.62,
    maskUvMaxY: 0.48,
    maskUvMinX: 0.31,
    maskUvMinY: 0.35,
    maskUvSplitMode: EXPECTED_MASK_UV_SPLIT_MODE,
    meshUvCount: 1220,
    meshVertexCount: 1220,
    neutralizeStrength: 0,
    runtimeReady: true,
    softEdgeTexels: 824,
    status: 'ready',
    surroundAnchorPointCount: 84,
    trackingState: 'Tracking',
    type: EXPECTED_SCHEMA,
    upperEyelidAnchorPointCount: 12,
    uvAvailable: true,
  };
  const result = evaluateGeneratedBrowEvents([sampleEvent]);
  printResult(result);
  if (!result.pass) {
    process.exit(1);
  }
}
