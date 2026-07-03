import {readFileSync} from 'node:fs';

const EXPECTED_SCHEMA = 'generated_brow_mask_applied';
const EXPECTED_ANCHOR_MODE = 'surround_anchor_eye_eyelid_temple_nose_face_oval_v2';
const EXPECTED_EYE_EXCLUSION_MODE = 'upper_eyelid_expanded_eye_bounds_v2';
const EXPECTED_MASK_SAMPLE_CHANNEL = 'generated_brow_green_alpha';
const EXPECTED_MASK_UV_SPLIT_MODE = 'face_local_x_sign';
const EXPECTED_STABILITY_MODE = 'generated_brow_arface_uv_deadband_fast_follow';
const RECENT_READY_EVENT_LIMIT = 30;
const MAX_EXPECTED_UV_CENTER_DISTANCE = 0.12;
const MAX_EXPECTED_UV_AVERAGE_CENTER_DISTANCE = 0.08;
const MAX_FRAME_TO_FRAME_ALIGNMENT_DELTA = 0.08;

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
  const recentReadyEvents = readyEvents.slice(-RECENT_READY_EVENT_LIMIT);
  const uvAlignmentStats = evaluateRecentReadyUvAlignment(
    recentReadyEvents,
    failures,
    warnings,
  );

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
    requireNumberAtLeast(latestReady, 'browCorePointCount', 20, failures);
    requireNumberAtLeast(latestReady, 'browShapeBasePointCount', 20, failures);
    requireNumberAtLeast(latestReady, 'eyeAnchorPointCount', 20, failures);
    requireNumberAtLeast(latestReady, 'upperEyelidAnchorPointCount', 10, failures);
    requireNumberAtLeast(latestReady, 'softEdgeTexels', 1, failures);
    requireEqual(latestReady, 'maskUvBoundsAvailable', true, failures);
    requireEqual(latestReady, 'maskTextureSampleChannel', EXPECTED_MASK_SAMPLE_CHANNEL, failures);
    requireUvBounds(latestReady, failures);
    requireUvBoundsForPrefix(latestReady, 'expectedMaskUv', failures);
    requireUvBoundsOverlap(latestReady, 'maskUv', 'expectedMaskUv', 0.12, failures);
    requireEqual(latestReady, 'maskUvSplitMode', EXPECTED_MASK_UV_SPLIT_MODE, failures);
    requireEqual(latestReady, 'stabilityMode', EXPECTED_STABILITY_MODE, failures);
    requireNumberInRange(latestReady, 'stabilizationDeadZoneMeters', 0.0001, 0.002, failures);
    requireNumberInRange(latestReady, 'stabilizationSnapDistanceMeters', 0.003, 0.02, failures);
    requireGreaterThanField(
      latestReady,
      'stabilizationSnapDistanceMeters',
      'stabilizationDeadZoneMeters',
      failures,
    );
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
    uvAlignmentStats,
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

function requireNumberInRange(event, field, minimum, maximum, failures) {
  const value = numberField(event, field);
  if (value === undefined || value < minimum || value > maximum) {
    failures.push(
      `${field} expected within ${minimum}..${maximum}, received ${formatValue(value)}.`,
    );
  }
}

function requireGreaterThanField(event, greaterField, lesserField, failures) {
  const greaterValue = numberField(event, greaterField);
  const lesserValue = numberField(event, lesserField);
  if (
    greaterValue === undefined ||
    lesserValue === undefined ||
    greaterValue <= lesserValue
  ) {
    failures.push(
      `${greaterField} expected > ${lesserField}, received ${formatValue(
        greaterValue,
      )} <= ${formatValue(lesserValue)}.`,
    );
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

function requireUvBoundsOverlap(event, actualPrefix, expectedPrefix, maxCenterDistance, failures) {
  const actual = boundsForPrefix(event, actualPrefix);
  const expected = boundsForPrefix(event, expectedPrefix);
  if (!actual || !expected) {
    return;
  }

  const intersectionWidth =
    Math.min(actual.maxX, expected.maxX) - Math.max(actual.minX, expected.minX);
  const intersectionHeight =
    Math.min(actual.maxY, expected.maxY) - Math.max(actual.minY, expected.minY);
  if (intersectionWidth <= 0 || intersectionHeight <= 0) {
    failures.push(
      `${actualPrefix} and ${expectedPrefix} expected to overlap, received ${formatBounds(
        actual,
      )} vs ${formatBounds(expected)}.`,
    );
    return;
  }

  const actualCenterX = (actual.minX + actual.maxX) * 0.5;
  const actualCenterY = (actual.minY + actual.maxY) * 0.5;
  const expectedCenterX = (expected.minX + expected.maxX) * 0.5;
  const expectedCenterY = (expected.minY + expected.maxY) * 0.5;
  const centerDistance = Math.hypot(
    actualCenterX - expectedCenterX,
    actualCenterY - expectedCenterY,
  );
  if (centerDistance > maxCenterDistance) {
    failures.push(
      `${actualPrefix} and ${expectedPrefix} centers expected within ${maxCenterDistance}, received ${centerDistance.toFixed(
        4,
      )}.`,
    );
  }
}

function evaluateRecentReadyUvAlignment(events, failures, warnings) {
  if (events.length === 0) {
    return null;
  }

  let missingBounds = 0;
  let invalidBounds = 0;
  let nonOverlappingBounds = 0;
  let centerDistanceSum = 0;
  let maxCenterDistance = 0;
  let maxFrameToFrameAlignmentDelta = 0;
  let measuredCount = 0;
  let previousOffset = null;

  events.forEach(event => {
    const actual = boundsForPrefix(event, 'maskUv');
    const expected = boundsForPrefix(event, 'expectedMaskUv');
    if (!actual || !expected) {
      missingBounds += 1;
      return;
    }

    if (!isValidUnitBounds(actual) || !isValidUnitBounds(expected)) {
      invalidBounds += 1;
      return;
    }

    if (!boundsOverlap(actual, expected)) {
      nonOverlappingBounds += 1;
    }

    const actualCenter = boundsCenter(actual);
    const expectedCenter = boundsCenter(expected);
    const offset = {
      x: actualCenter.x - expectedCenter.x,
      y: actualCenter.y - expectedCenter.y,
    };
    const centerDistance = Math.hypot(offset.x, offset.y);
    centerDistanceSum += centerDistance;
    maxCenterDistance = Math.max(maxCenterDistance, centerDistance);

    if (previousOffset) {
      maxFrameToFrameAlignmentDelta = Math.max(
        maxFrameToFrameAlignmentDelta,
        Math.hypot(offset.x - previousOffset.x, offset.y - previousOffset.y),
      );
    }
    previousOffset = offset;
    measuredCount += 1;
  });

  const averageCenterDistance =
    measuredCount > 0 ? centerDistanceSum / measuredCount : Number.POSITIVE_INFINITY;

  if (missingBounds > 0) {
    failures.push(
      `${missingBounds} recent ready brow events missing maskUv or expectedMaskUv bounds.`,
    );
  }

  if (invalidBounds > 0) {
    failures.push(
      `${invalidBounds} recent ready brow events have invalid maskUv or expectedMaskUv bounds.`,
    );
  }

  if (nonOverlappingBounds > 0) {
    failures.push(
      `${nonOverlappingBounds} recent ready brow events have non-overlapping expected/applied UV bounds.`,
    );
  }

  if (measuredCount > 0 && maxCenterDistance > MAX_EXPECTED_UV_CENTER_DISTANCE) {
    failures.push(
      `recent brow UV max center distance expected <= ${MAX_EXPECTED_UV_CENTER_DISTANCE}, received ${maxCenterDistance.toFixed(
        4,
      )}.`,
    );
  }

  if (
    measuredCount > 0 &&
    averageCenterDistance > MAX_EXPECTED_UV_AVERAGE_CENTER_DISTANCE
  ) {
    failures.push(
      `recent brow UV average center distance expected <= ${MAX_EXPECTED_UV_AVERAGE_CENTER_DISTANCE}, received ${averageCenterDistance.toFixed(
        4,
      )}.`,
    );
  }

  if (
    measuredCount > 1 &&
    maxFrameToFrameAlignmentDelta > MAX_FRAME_TO_FRAME_ALIGNMENT_DELTA
  ) {
    failures.push(
      `recent brow UV frame-to-frame alignment delta expected <= ${MAX_FRAME_TO_FRAME_ALIGNMENT_DELTA}, received ${maxFrameToFrameAlignmentDelta.toFixed(
        4,
      )}.`,
    );
  }

  if (events.length < 8) {
    warnings.push(
      `Only ${events.length} ready brow event(s) available; movement/jitter coverage is weak.`,
    );
  }

  const maxSyncWorst = Math.max(
    ...events
      .map(event => numberField(event, 'overlaySyncWorstDurationMs'))
      .filter(value => value !== undefined),
    0,
  );
  if (maxSyncWorst > 50) {
    warnings.push(`recent overlaySyncWorstDurationMs is high: ${maxSyncWorst}ms.`);
  }

  return {
    averageCenterDistance,
    maxCenterDistance,
    maxFrameToFrameAlignmentDelta,
    measuredCount,
    recentEventCount: events.length,
  };
}

function boundsForPrefix(event, prefix) {
  const minX = numberField(event, `${prefix}MinX`);
  const minY = numberField(event, `${prefix}MinY`);
  const maxX = numberField(event, `${prefix}MaxX`);
  const maxY = numberField(event, `${prefix}MaxY`);
  if (
    minX === undefined ||
    minY === undefined ||
    maxX === undefined ||
    maxY === undefined
  ) {
    return null;
  }

  return {maxX, maxY, minX, minY};
}

function isValidUnitBounds(bounds) {
  return (
    bounds.minX >= 0 &&
    bounds.minY >= 0 &&
    bounds.maxX <= 1 &&
    bounds.maxY <= 1 &&
    bounds.maxX > bounds.minX &&
    bounds.maxY > bounds.minY
  );
}

function boundsOverlap(first, second) {
  return (
    Math.min(first.maxX, second.maxX) > Math.max(first.minX, second.minX) &&
    Math.min(first.maxY, second.maxY) > Math.max(first.minY, second.minY)
  );
}

function boundsCenter(bounds) {
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

function formatBounds(bounds) {
  return `[${bounds.minX}, ${bounds.minY}, ${bounds.maxX}, ${bounds.maxY}]`;
}

function formatBoundsForPrefix(event, prefix) {
  const bounds = boundsForPrefix(event, prefix);
  return bounds ? formatBounds(bounds) : '-';
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
        `expectedUv=${formatBoundsForPrefix(result.latestReady, 'expectedMaskUv')}`,
        `stability=${result.latestReady.stabilityMode}`,
        `deadZone=${result.latestReady.stabilizationDeadZoneMeters}`,
        `snap=${result.latestReady.stabilizationSnapDistanceMeters}`,
        `browCorePoints=${result.latestReady.browCorePointCount}`,
        `browShapeBasePoints=${result.latestReady.browShapeBasePointCount}`,
        `softEdgeTexels=${result.latestReady.softEdgeTexels}`,
        `anchorMode=${result.latestReady.anchorStabilizationMode}`,
      ].join(' '),
    );
  }

  if (result.uvAlignmentStats) {
    console.log(
      [
        `uvAlign.samples=${result.uvAlignmentStats.measuredCount}/${result.uvAlignmentStats.recentEventCount}`,
        `uvAlign.maxCenter=${result.uvAlignmentStats.maxCenterDistance.toFixed(4)}`,
        `uvAlign.avgCenter=${result.uvAlignmentStats.averageCenterDistance.toFixed(4)}`,
        `uvAlign.maxFrameDelta=${result.uvAlignmentStats.maxFrameToFrameAlignmentDelta.toFixed(4)}`,
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
    browCorePointCount: 20,
    browShapeBasePointCount: 20,
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
    expectedMaskUvMaxX: 0.61,
    expectedMaskUvMaxY: 0.47,
    expectedMaskUvMinX: 0.32,
    expectedMaskUvMinY: 0.36,
    maskUvSplitMode: EXPECTED_MASK_UV_SPLIT_MODE,
    meshUvCount: 1220,
    meshVertexCount: 1220,
    neutralizeStrength: 0,
    runtimeReady: true,
    softEdgeTexels: 824,
    stabilityMode: EXPECTED_STABILITY_MODE,
    stabilizationDeadZoneMeters: 0.00055,
    stabilizationSnapDistanceMeters: 0.0065,
    status: 'ready',
    surroundAnchorPointCount: 84,
    trackingState: 'Tracking',
    type: EXPECTED_SCHEMA,
    upperEyelidAnchorPointCount: 12,
    uvAvailable: true,
  };
  const sampleEvents = Array.from({length: 8}, (_, index) => {
    const horizontalShift = index * 0.001;
    const verticalShift = index * 0.0005;
    return {
      ...sampleEvent,
      maskUvMaxX: sampleEvent.maskUvMaxX + horizontalShift,
      maskUvMaxY: sampleEvent.maskUvMaxY + verticalShift,
      maskUvMinX: sampleEvent.maskUvMinX + horizontalShift,
      maskUvMinY: sampleEvent.maskUvMinY + verticalShift,
    };
  });
  const result = evaluateGeneratedBrowEvents(sampleEvents);
  printResult(result);
  if (!result.pass) {
    process.exit(1);
  }
}
