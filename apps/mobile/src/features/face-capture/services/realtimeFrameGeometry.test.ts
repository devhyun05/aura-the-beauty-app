// realtimeFrameGeometry(TS 미러) 골든벡터 테스트.
// 같은 JSON 을 로컬 clang 하니스(scripts/ios/run-realtime-geometry-golden.mjs)가
// ObjC 헤더 원본으로도 통과시킨다 — 두 구현의 드리프트를 이 단일 소스로 봉쇄.

import {
  canonicalPoint,
  captureDevicePointFromCanonical,
  detectFrameRotation,
  screenEyeLineTilt,
  visionPointFromCanonical,
  type FrameRotation,
  type NormalizedPoint,
} from './realtimeFrameGeometry';

type GoldenPoint = [number, number];

type RotationCase = {
  name: string;
  isFront: boolean;
  vision: {
    leftEye: GoldenPoint;
    rightEye: GoldenPoint;
    probe: GoldenPoint | null;
  };
  expectRotation: FrameRotation;
  expectCanonical?: Record<'leftEye' | 'rightEye' | 'probe', GoldenPoint>;
  expectDevice?: Record<'leftEye' | 'rightEye' | 'probe', GoldenPoint>;
};

type TiltCase = {
  name: string;
  leftEyeScreen: GoldenPoint;
  rightEyeScreen: GoldenPoint;
  expectTilt: number;
};

type GoldenFixture = {
  tolerance: number;
  rotationCases: RotationCase[];
  tiltCases: TiltCase[];
};

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function toPoint([x, y]: GoldenPoint): NormalizedPoint {
  return {x, y};
}

// 계약 러너의 bare tsc 는 node 타입 없이 컴파일하므로 fs/path/process 를
// import 하지 않고 direct eval 로 CJS 모듈 스코프의 require 에 접근한다
// (컴파일 산출물은 CommonJS 로 node 에서 실행됨 — 러너 참조).
// eslint-disable-next-line no-eval
const nodeRequire = eval('require') as (id: string) => any;
const {readFileSync} = nodeRequire('fs') as {
  readFileSync: (filePath: string, encoding: 'utf8') => string;
};
const {join} = nodeRequire('path') as {join: (...parts: string[]) => string};
// eslint-disable-next-line no-eval
const nodeProcess = eval('process') as {
  cwd: () => string;
  env: Record<string, string | undefined>;
};

// 계약 러너가 cwd=repoRoot 로 실행한다 (run-face-ratio-distortion-contract.mjs 참조).
const fixturePath =
  nodeProcess.env.AURA_GEOMETRY_GOLDEN_PATH ??
  join(nodeProcess.cwd(), 'scripts/mobile/fixtures/realtime-geometry-golden.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFixture;
const {tolerance} = fixture;

function expectClose(actual: number, expected: number, label: string) {
  expect(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function expectPointClose(actual: NormalizedPoint, expected: GoldenPoint, label: string) {
  expectClose(actual.x, expected[0], `${label}.x`);
  expectClose(actual.y, expected[1], `${label}.y`);
}

for (const testCase of fixture.rotationCases) {
  const leftEye = toPoint(testCase.vision.leftEye);
  const rightEye = toPoint(testCase.vision.rightEye);
  const probe = testCase.vision.probe ? toPoint(testCase.vision.probe) : null;

  const detected = detectFrameRotation(leftEye, rightEye, probe);
  expect(
    detected === testCase.expectRotation,
    `${testCase.name}: rotation expected ${testCase.expectRotation}, got ${detected}`,
  );

  if (testCase.expectCanonical && testCase.expectDevice && probe) {
    const points = {leftEye, probe, rightEye};

    for (const key of ['leftEye', 'rightEye', 'probe'] as const) {
      const canonical = canonicalPoint(points[key], detected);
      expectPointClose(canonical, testCase.expectCanonical[key], `${testCase.name}.canonical.${key}`);

      // 역변환 왕복 일치
      const roundTrip = visionPointFromCanonical(canonical, detected);
      expectPointClose(
        roundTrip,
        [points[key].x, points[key].y],
        `${testCase.name}.roundtrip.${key}`,
      );

      const device = captureDevicePointFromCanonical(canonical, testCase.isFront);
      expectPointClose(device, testCase.expectDevice[key], `${testCase.name}.device.${key}`);
    }
  }
}

for (const tiltCase of fixture.tiltCases) {
  const tilt = screenEyeLineTilt(
    toPoint(tiltCase.leftEyeScreen),
    toPoint(tiltCase.rightEyeScreen),
  );
  expectClose(tilt, tiltCase.expectTilt, `${tiltCase.name}.tilt`);
}

console.log(
  `realtimeFrameGeometry tests passed (${fixture.rotationCases.length} rotation cases, ${fixture.tiltCases.length} tilt cases)`,
);
