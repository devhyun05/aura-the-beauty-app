export function areFaceReportCaptureAssetsSettled({
  assetStates,
  expectedAssetCount,
  layoutReady,
}: {
  assetStates: ReadonlyMap<string, boolean>;
  expectedAssetCount: number;
  layoutReady: boolean;
}) {
  if (!layoutReady || assetStates.size !== expectedAssetCount) {
    return false;
  }

  return Array.from(assetStates.values()).every(Boolean);
}
