import {AppState, NativeEventEmitter, NativeModules, Platform} from 'react-native';

type NativePerformanceSample = {
  cpuPercent: number;
  displayMaxFps: number;
  droppedFrames: number;
  fps: number;
  lowPowerMode: boolean;
  physicalFootprintMb: number;
  residentMemoryMb: number;
  thermalState: string;
  timestampMs: number;
};

type PerformanceAggregate = {
  cpuMax: number;
  cpuTotal: number;
  droppedFrames: number;
  footprintEnd: number | null;
  footprintMax: number;
  footprintStart: number | null;
  fpsMin: number;
  fpsTotal: number;
  jsLagMax: number;
  residentMax: number;
  sampleCount: number;
};

type NativePerformanceModule = {
  start?: (intervalMs: number) => void;
  stop?: () => void;
};

const SAMPLE_INTERVAL_MS = 1000;
const PERFORMANCE_EVENT = 'AURAPerformanceMetric';
const PERF_PREFIX = '[aura:perf]';

let activeFeature = 'startup';
let activeRoute = 'Startup';
let activeStage: string | null = null;
let aggregate = createAggregate();
let cleanup: (() => void) | null = null;
let enabled = false;
let latestJsLagMs = 0;
let latestSample: NativePerformanceSample | null = null;
let routeStartedAt = Date.now();

function createAggregate(): PerformanceAggregate {
  return {
    cpuMax: 0,
    cpuTotal: 0,
    droppedFrames: 0,
    footprintEnd: null,
    footprintMax: 0,
    footprintStart: null,
    fpsMin: Number.POSITIVE_INFINITY,
    fpsTotal: 0,
    jsLagMax: 0,
    residentMax: 0,
    sampleCount: 0,
  };
}

function isPerformanceLoggingEnabled(): boolean {
  if (!__DEV__) {
    return false;
  }

  const value = process.env.EXPO_PUBLIC_PERFORMANCE_LOGGING?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function logPerformance(event: string, payload: Record<string, unknown>): void {
  console.info(`${PERF_PREFIX} ${JSON.stringify({event, ...payload})}`);
}

function classifyFeature(routeName: string): string {
  if (routeName === 'HomeTab' || routeName === 'MainTabs') return 'home';
  if (routeName === 'ProfileTab' || routeName.startsWith('Profile')) return 'profile';
  if (routeName === 'ConsultingTab' || routeName.startsWith('Consulting')) return 'consulting';
  if (routeName.startsWith('Auradin')) return 'auradin';
  if (
    routeName === 'UnityMakeupCapture' ||
    routeName === 'ARFilter' ||
    routeName.startsWith('MakeupFilter') ||
    routeName === 'HomeFilterStore'
  ) {
    return 'ar_makeup';
  }
  if (routeName.startsWith('Face') || routeName === 'Tutorial') return 'face_analysis';
  if (routeName.startsWith('MakeupRecommendation')) return 'makeup_recommendation';
  if (routeName.startsWith('MakeupFeedback') || routeName.startsWith('MakeupCorrection')) {
    return 'makeup_feedback';
  }
  if (routeName.startsWith('ReferenceMakeup') || routeName.startsWith('ExtractedMakeup')) {
    return 'makeup_extraction';
  }
  if (routeName.startsWith('Hair') || routeName.startsWith('SavedHair')) return 'hair';
  if (routeName.startsWith('Product') || routeName === 'LikedProductList') return 'products';
  if (routeName.startsWith('Community')) return 'community';
  if (routeName === 'Login' || routeName === 'ProfileSetup') return 'auth';
  return 'other';
}

function flushRouteSummary(reason: string): void {
  if (!enabled) {
    return;
  }

  const durationMs = Date.now() - routeStartedAt;
  const samples = aggregate.sampleCount;
  logPerformance('feature-summary', {
    reason,
    feature: activeFeature,
    route: activeRoute,
    durationMs,
    sampleCount: samples,
    cpuAvgPct: samples ? round(aggregate.cpuTotal / samples) : null,
    cpuPeakPct: samples ? round(aggregate.cpuMax) : null,
    footprintStartMb: aggregate.footprintStart === null ? null : round(aggregate.footprintStart),
    footprintEndMb: aggregate.footprintEnd === null ? null : round(aggregate.footprintEnd),
    footprintDeltaMb:
      aggregate.footprintStart === null || aggregate.footprintEnd === null
        ? null
        : round(aggregate.footprintEnd - aggregate.footprintStart),
    footprintPeakMb: samples ? round(aggregate.footprintMax) : null,
    residentPeakMb: samples ? round(aggregate.residentMax) : null,
    fpsAvg: samples ? round(aggregate.fpsTotal / samples) : null,
    fpsMin: samples ? round(aggregate.fpsMin) : null,
    droppedFrames: samples ? Math.round(aggregate.droppedFrames) : null,
    jsLagPeakMs: samples ? round(aggregate.jsLagMax) : null,
  });
}

function handleNativeSample(sample: NativePerformanceSample): void {
  latestSample = sample;
  aggregate.sampleCount += 1;
  aggregate.cpuTotal += sample.cpuPercent;
  aggregate.cpuMax = Math.max(aggregate.cpuMax, sample.cpuPercent);
  aggregate.footprintStart ??= sample.physicalFootprintMb;
  aggregate.footprintEnd = sample.physicalFootprintMb;
  aggregate.footprintMax = Math.max(aggregate.footprintMax, sample.physicalFootprintMb);
  aggregate.residentMax = Math.max(aggregate.residentMax, sample.residentMemoryMb);
  aggregate.fpsTotal += sample.fps;
  aggregate.fpsMin = Math.min(aggregate.fpsMin, sample.fps);
  aggregate.droppedFrames += sample.droppedFrames;
  aggregate.jsLagMax = Math.max(aggregate.jsLagMax, latestJsLagMs);

  logPerformance('sample', {
    feature: activeFeature,
    route: activeRoute,
    stage: activeStage,
    cpuPct: round(sample.cpuPercent),
    footprintMb: round(sample.physicalFootprintMb),
    residentMb: round(sample.residentMemoryMb),
    fps: round(sample.fps),
    droppedFrames: Math.round(sample.droppedFrames),
    jsLagMs: round(latestJsLagMs),
    thermal: sample.thermalState,
    lowPowerMode: sample.lowPowerMode,
  });
}

export function recordFeaturePerformanceRoute(routeName: string | undefined): void {
  const nextRoute = routeName?.trim() || 'Unknown';
  if (nextRoute === activeRoute) {
    return;
  }

  flushRouteSummary('route-change');
  activeRoute = nextRoute;
  activeFeature = classifyFeature(nextRoute);
  activeStage = null;
  aggregate = createAggregate();
  routeStartedAt = Date.now();

  if (enabled) {
    logPerformance('route-enter', {feature: activeFeature, route: activeRoute});
  }
}

export function setFeaturePerformanceStage(stage: string | null): void {
  if (activeStage === stage) {
    return;
  }
  activeStage = stage;
  if (enabled) {
    logPerformance('stage', {feature: activeFeature, route: activeRoute, stage});
  }
}

export function recordFeaturePerformanceMarker(
  name: string,
  details: Record<string, unknown> = {},
): void {
  if (!enabled) {
    return;
  }
  logPerformance('marker', {
    feature: activeFeature,
    route: activeRoute,
    stage: activeStage,
    name,
    ...(latestSample
      ? {
          cpuPct: round(latestSample.cpuPercent),
          footprintMb: round(latestSample.physicalFootprintMb),
          residentMb: round(latestSample.residentMemoryMb),
        }
      : {}),
    ...details,
  });
}

export function startFeaturePerformanceLogging(): () => void {
  if (cleanup) {
    return cleanup;
  }
  if (!isPerformanceLoggingEnabled() || Platform.OS !== 'ios') {
    return () => undefined;
  }

  const nativeModule = NativeModules.AURAPerformanceMonitor as
    | NativePerformanceModule
    | undefined;
  if (!nativeModule?.start) {
    logPerformance('native-unavailable', {platform: Platform.OS});
    return () => undefined;
  }

  enabled = true;
  aggregate = createAggregate();
  routeStartedAt = Date.now();
  logPerformance('session-start', {feature: activeFeature, route: activeRoute});
  logPerformance('route-enter', {feature: activeFeature, route: activeRoute});

  const emitter = new NativeEventEmitter(NativeModules.AURAPerformanceMonitor);
  const metricSubscription = emitter.addListener(
    PERFORMANCE_EVENT,
    handleNativeSample,
  );
  const memoryWarningSubscription = AppState.addEventListener('memoryWarning', () => {
    recordFeaturePerformanceMarker('ios-memory-warning');
  });

  let expectedTickAt = performance.now() + SAMPLE_INTERVAL_MS;
  const jsLagTimer = setInterval(() => {
    const now = performance.now();
    latestJsLagMs = Math.max(0, now - expectedTickAt);
    expectedTickAt = now + SAMPLE_INTERVAL_MS;
  }, SAMPLE_INTERVAL_MS);

  nativeModule.start(SAMPLE_INTERVAL_MS);

  cleanup = () => {
    flushRouteSummary('session-stop');
    nativeModule.stop?.();
    metricSubscription.remove();
    memoryWarningSubscription.remove();
    clearInterval(jsLagTimer);
    cleanup = null;
    enabled = false;
    latestSample = null;
  };
  return cleanup;
}
