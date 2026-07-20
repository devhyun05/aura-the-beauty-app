import type { BeardPath } from '../contracts/types';

/** React Navigation stack param list for the beard-simulation feature. */
export type BeardStackParamList = {
  PurposeSelect: undefined;
  Survey: undefined;
  Camera: undefined;
  Generating: undefined;
  Result: undefined;
  Report: undefined;
  Failure: { reason?: string } | undefined;
};

export type BeardScreenName = keyof BeardStackParamList;

/** Convenience alias for screens that need to know the active path. */
export type WithPath = { path: BeardPath };
