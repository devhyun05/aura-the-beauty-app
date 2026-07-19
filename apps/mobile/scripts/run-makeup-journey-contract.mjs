import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(mobileRoot, '../..');
const sourceRoot = join(mobileRoot, 'src');
const outputDirectory = mkdtempSync(join(tmpdir(), 'aura-makeup-journey-contract-'));
const runtimeShimPath = join(outputDirectory, 'runtime-shim.cjs');
const tscPath = join(mobileRoot, 'node_modules/typescript/bin/tsc');
const typeRoots = join(mobileRoot, 'node_modules/@types');

// These files use lightweight top-level assertions rather than a test framework.
// Keep the list explicit so navigation, feedback, cache, and floating-action wiring
// cannot silently drop out of the MakeupJourney CI gate.
const testFiles = [
  'features/makeup-journey/utils/date.test.ts',
  'features/makeup-journey/utils/presentation.test.ts',
  'features/makeup-journey/utils/chart.test.ts',
  'features/makeup-journey/utils/reportPrompt.test.ts',
  'features/makeup-journey/services/makeupJourneyCache.test.ts',
  'features/makeup-journey/services/makeupJourneyPrivateImage.test.ts',
  'features/makeup-journey/services/makeupJourneyLegacyFallback.test.ts',
  'features/makeup-journey/hooks/useMakeupJourneyResource.test.ts',
  'features/makeup-journey/screens/screenContracts.test.ts',
  'app/navigation/MainTabNavigator.test.ts',
  'app/navigation/flowState.test.tsx',
  'app/navigation/linkingConfig.test.ts',
  'app/navigation/mainTabChrome.test.ts',
  'app/navigation/navigation.test.ts',
  'app/navigation/routes/faceCaptureConfirmationRoutes.test.ts',
  'app/navigation/routes/makeupJourneyRoutes.test.ts',
  'features/home/screens/FloatingActionSettingsScreen.test.tsx',
  'features/makeup-feedback/services/makeupFeedbackJourneyContext.test.ts',
  'features/makeup-feedback/services/makeupFeedbackService.test.ts',
  'shared/config/featureFlags.test.ts',
  'shared/services/floatingActionAnchorStore.test.ts',
  'shared/services/makeupJourneyAnalytics.test.ts',
  'shared/ui/AppFooter.test.tsx',
  'shared/ui/FloatingActionMenu.test.tsx',
  'shared/ui/FooterIcons.test.tsx',
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return false;
  }

  return true;
}

function compiledTestPath(testFile) {
  return join(outputDirectory, testFile.replace(/\.tsx?$/, '.js'));
}

const appJsonPath = join(mobileRoot, 'app.json');
const runtimeShim = `
const Module = require('node:module');

const originalLoad = Module._load;
const noop = () => undefined;
const component = () => null;

function chainableStub() {
  const target = function stubbedModuleValue() {
    return null;
  };
  let proxy;
  proxy = new Proxy(target, {
    get(_target, property) {
      if (property === '__esModule') return true;
      if (property === 'default') return proxy;
      if (property === 'then') return undefined;
      return proxy;
    },
  });
  return proxy;
}

const proxy = chainableStub();

class AnimatedValue {
  constructor(value) {
    this.value = value;
  }
  interpolate() {
    return this;
  }
  setValue(value) {
    this.value = value;
  }
}

const animatedOperation = () => ({start: callback => callback?.()});
const react = {
  __esModule: true,
  default: null,
  Fragment: Symbol.for('react.fragment'),
  createContext: value => ({Provider: component, Consumer: component, _currentValue: value}),
  createElement: () => null,
  forwardRef: render => render,
  memo: value => value,
  useCallback: callback => callback,
  useContext: context => context?._currentValue,
  useEffect: noop,
  useLayoutEffect: noop,
  useMemo: factory => factory(),
  useRef: value => ({current: value}),
  useState: initial => [typeof initial === 'function' ? initial() : initial, noop],
};
react.default = react;

const reactNative = {
  __esModule: true,
  AccessibilityInfo: {announceForAccessibility: noop},
  Alert: {alert: noop},
  Animated: {
    Value: AnimatedValue,
    View: component,
    add: (...values) => values[0],
    parallel: animatedOperation,
    spring: animatedOperation,
    timing: animatedOperation,
  },
  Dimensions: {get: () => ({height: 844, width: 390})},
  Easing: {cubic: proxy, inOut: value => value, out: value => value},
  Image: Object.assign(component, {resolveAssetSource: () => ({height: 1, width: 1})}),
  Keyboard: {dismiss: noop},
  Linking: {openURL: async () => undefined},
  Modal: component,
  PanResponder: {create: () => ({panHandlers: {}})},
  Platform: {OS: 'ios', select: values => values.ios ?? values.default},
  Pressable: component,
  ScrollView: component,
  StatusBar: component,
  StyleSheet: {
    absoluteFill: {},
    absoluteFillObject: {},
    create: styles => styles,
    flatten: style => style,
    hairlineWidth: 1,
  },
  Text: component,
  TextInput: component,
  TouchableOpacity: component,
  UIManager: {getViewManagerConfig: () => null},
  View: component,
  useWindowDimensions: () => ({height: 844, width: 390}),
};

const tamagui = new Proxy(
  {__esModule: true},
  {get: (target, property) => property in target ? target[property] : component},
);
const lucide = new Proxy(
  {__esModule: true},
  {get: (target, property) => property in target ? target[property] : component},
);
const asyncStorage = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

const explicitlyStubbed = new Map([
  ['react', react],
  ['react/jsx-runtime', {
    __esModule: true,
    Fragment: react.Fragment,
    jsx: () => null,
    jsxs: () => null,
  }],
  ['react-native', reactNative],
  ['tamagui', tamagui],
  ['lucide-react-native', lucide],
  ['@react-native-async-storage/async-storage', {
    __esModule: true,
    default: asyncStorage,
  }],
  ['react-native-safe-area-context', {
    __esModule: true,
    SafeAreaProvider: component,
    SafeAreaView: component,
    useSafeAreaInsets: () => ({bottom: 0, left: 0, right: 0, top: 0}),
  }],
  ['@react-navigation/native', {
    __esModule: true,
    NavigationContainer: component,
    useFocusEffect: noop,
    useIsFocused: () => true,
    useNavigation: () => proxy,
    useRoute: () => ({params: {}}),
  }],
]);

const externalPrefixes = [
  '@react-native-',
  '@react-navigation/',
  '@shopify/',
  'expo',
  'react-native-',
  'three',
];

Module._load = function patchedLoad(request, parent, isMain) {
  if (explicitlyStubbed.has(request)) {
    return explicitlyStubbed.get(request);
  }
  if (request.endsWith('app.json')) {
    return originalLoad.call(this, ${JSON.stringify(appJsonPath)}, parent, isMain);
  }
  if (/\\.(png|jpe?g|gif|webp|svg|mp4|ttf|otf)$/i.test(request)) {
    return 1;
  }
  if (externalPrefixes.some(prefix => request === prefix || request.startsWith(prefix))) {
    return proxy;
  }
  return originalLoad.call(this, request, parent, isMain);
};
`;

try {
  writeFileSync(runtimeShimPath, runtimeShim, 'utf8');

  const compiled = run(process.execPath, [
    tscPath,
    '--module',
    'commonjs',
    '--target',
    'ES2020',
    '--jsx',
    'react-jsx',
    '--esModuleInterop',
    '--skipLibCheck',
    '--types',
    'node',
    '--typeRoots',
    typeRoots,
    '--rootDir',
    sourceRoot,
    '--outDir',
    outputDirectory,
    // The workflow runs the strict project typecheck first. This pass only emits
    // the selected top-level assertion tests and their transitive dependencies.
    '--noCheck',
    ...testFiles.map(testFile => join(sourceRoot, testFile)),
  ]);

  if (compiled) {
    for (const testFile of testFiles) {
      if (!run(process.execPath, ['--require', runtimeShimPath, compiledTestPath(testFile)])) {
        break;
      }
    }
  }

  if (process.exitCode === undefined) {
    console.log(`MakeupJourney contract passed (${testFiles.length} assertion files).`);
  }
} finally {
  rmSync(outputDirectory, {force: true, recursive: true});
}
