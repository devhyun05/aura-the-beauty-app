// AURARealtimeGeometry.h 골든벡터 하니스 러너 (macOS 로컬 전용).
//
// ObjC 헤더 원본을 clang 으로 단독 컴파일해 TS 미러와 같은 골든 JSON 을
// 통과시킨다. CI(ubuntu)에서는 실행 불가 — TS 미러 테스트
// (realtimeFrameGeometry.test.ts, distortion 계약 러너 소속)가 CI 몫을 맡는다.
//
// 실행: node scripts/ios/run-realtime-geometry-golden.mjs

import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

if (process.platform !== 'darwin') {
  console.log('[aura:geometry-golden] macOS 전용 하니스 — skip (CI 는 TS 미러가 검증)');
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const headerDir = join(repoRoot, 'apps/mobile/ios/AURA');
const testSource = join(scriptDir, 'realtimeGeometryGolden.test.m');
const goldenPath = join(repoRoot, 'scripts/mobile/fixtures/realtime-geometry-golden.json');
const outDir = mkdtempSync(join(tmpdir(), 'aura-geometry-golden-'));
const binaryPath = join(outDir, 'harness');

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    rmSync(outDir, {force: true, recursive: true});
    process.exit(result.status ?? 1);
  }
}

run('xcrun', [
  'clang',
  '-x', 'objective-c',
  '-fobjc-arc',
  '-I', headerDir,
  '-framework', 'Foundation',
  '-framework', 'CoreGraphics',
  '-o', binaryPath,
  testSource,
]);

run(binaryPath, [goldenPath]);
rmSync(outDir, {force: true, recursive: true});
