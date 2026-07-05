import {isCameraSessionActive} from './useCameraSessionActive';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  isCameraSessionActive({appState: 'active', isFocused: true}),
  true,
  'focused foreground screen can run camera session',
);
expectEqual(
  isCameraSessionActive({appState: 'active', isFocused: false}),
  false,
  'unfocused screen cannot run camera session',
);
expectEqual(
  isCameraSessionActive({appState: 'inactive', isFocused: true}),
  false,
  'inactive app cannot run camera session',
);
expectEqual(
  isCameraSessionActive({appState: 'background', isFocused: true}),
  false,
  'background app cannot run camera session',
);
