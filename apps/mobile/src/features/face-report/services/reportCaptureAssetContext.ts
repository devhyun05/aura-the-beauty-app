import {createContext} from 'react';

export type FaceReportCaptureAssetContextValue = {
  markAssetPending: (assetId: string) => void;
  markAssetSettled: (assetId: string) => void;
  registerAsset: (assetId: string) => void;
  unregisterAsset: (assetId: string) => void;
};

export const FaceReportCaptureAssetContext =
  createContext<FaceReportCaptureAssetContextValue | null>(null);
