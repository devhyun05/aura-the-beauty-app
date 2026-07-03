export type GeneratedBrowRuntimeDiagnosticEvent = {
  anchorStabilizationMode?: string;
  applied?: boolean;
  applyTrigger?: string;
  browAnchorPointCount?: number;
  browCorePointCount?: number;
  browShapeBasePointCount?: number;
  eyeAnchorPointCount?: number;
  expectedMaskUvMaxX?: number;
  expectedMaskUvMaxY?: number;
  expectedMaskUvMinX?: number;
  expectedMaskUvMinY?: number;
  maskTextureSampleChannel?: string;
  maskTriangles?: number;
  maskUvBoundsAvailable?: boolean;
  maskUvMaxX?: number;
  maskUvMaxY?: number;
  maskUvMinX?: number;
  maskUvMinY?: number;
  maskUvSplitMode?: string;
  runtimeReady?: boolean;
  softEdgeTexels?: number;
  stabilizationDeadZoneMeters?: number;
  stabilizationSnapDistanceMeters?: number;
  stabilityMode?: string;
  status?: string;
  surroundAnchorPointCount?: number;
  trackingState?: string;
  upperEyelidAnchorPointCount?: number;
  uvAvailable?: boolean;
};

export type GeneratedBrowRuntimeDiagnosticSummary = {
  detailText: string;
  status: 'ready' | 'waiting' | 'blocked';
  titleText: string;
};

export function summarizeGeneratedBrowRuntimeDiagnostics(
  event: GeneratedBrowRuntimeDiagnosticEvent | null | undefined,
): GeneratedBrowRuntimeDiagnosticSummary {
  if (!event) {
    return {
      detailText: 'event pending',
      status: 'waiting',
      titleText: 'brow runtime waiting',
    };
  }

  const maskTriangles = numberOrZero(event.maskTriangles);
  const browCorePointCount = numberOrZero(event.browCorePointCount);
  const browShapeBasePointCount = numberOrZero(event.browShapeBasePointCount);
  const surroundAnchorPointCount = numberOrZero(event.surroundAnchorPointCount);
  const softEdgeTexels = numberOrZero(event.softEdgeTexels);
  const status =
    event.status === 'blocked'
      ? 'blocked'
      : event.applied === true &&
          event.runtimeReady === true &&
          event.uvAvailable === true &&
          maskTriangles > 0
        ? 'ready'
        : 'waiting';

  return {
    detailText: [
      `tri ${maskTriangles}`,
      `trigger ${event.applyTrigger ?? '-'}`,
      `uv ${formatUvBounds(event)}`,
      `exp ${formatExpectedUvBounds(event)}`,
      `split ${event.maskUvSplitMode ?? '-'}`,
      `stab ${event.stabilityMode ?? '-'}`,
      `dead ${formatMeterValue(event.stabilizationDeadZoneMeters)}`,
      `snap ${formatMeterValue(event.stabilizationSnapDistanceMeters)}`,
      `core ${browCorePointCount}`,
      `base ${browShapeBasePointCount}`,
      `anchor ${surroundAnchorPointCount}`,
      `soft ${softEdgeTexels}`,
      `sample ${event.maskTextureSampleChannel ?? '-'}`,
    ].join(' / '),
    status,
    titleText: [
      `brow ${event.status ?? 'unknown'}`,
      `tracking ${event.trackingState ?? '-'}`,
      `applied ${event.applied === true ? 'yes' : 'no'}`,
    ].join(' / '),
  };
}

function formatExpectedUvBounds(event: GeneratedBrowRuntimeDiagnosticEvent) {
  return [
    formatUvValue(event.expectedMaskUvMinX),
    formatUvValue(event.expectedMaskUvMinY),
    formatUvValue(event.expectedMaskUvMaxX),
    formatUvValue(event.expectedMaskUvMaxY),
  ].join(',');
}

function formatUvBounds(event: GeneratedBrowRuntimeDiagnosticEvent) {
  if (event.maskUvBoundsAvailable !== true) {
    return '-';
  }

  return [
    formatUvValue(event.maskUvMinX),
    formatUvValue(event.maskUvMinY),
    formatUvValue(event.maskUvMaxX),
    formatUvValue(event.maskUvMaxY),
  ].join(',');
}

function formatUvValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : '-';
}

function formatMeterValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(5)
    : '-';
}

function numberOrZero(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
