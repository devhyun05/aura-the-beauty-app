import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-report-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const featuresDir = join(repoRoot, 'apps/mobile/src/features');

// 순수(RN 무의존) 파일만 나열한다.
const entries = [
  'face-report/reportFormat.ts',
  'face-report/reportFormat.test.ts',
  'face-report/reportFeatureAxes.ts',
  'face-report/reportFeatureAxes.test.ts',
  'face-report/services/reportStoryModel.ts',
  'face-report/services/minimumFaceReport.ts',
  'face-report/services/reportStoryModel.test.ts',
  'face-report/services/reportContentUpgrade.ts',
  'face-report/services/reportContentUpgrade.test.ts',
  'face-report/services/reportCompletionStatus.ts',
  'face-report/services/reportCompletionStatus.test.ts',
  'face-report/services/goldenMaskInteraction.ts',
  'face-report/services/goldenMaskInteraction.test.ts',
  'face-report/services/faceDepthPresentation.ts',
  'face-report/services/faceDepthPresentation.test.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts',
  'ar/stencil/src/composer/bodyProfile.ts',
  'ar/stencil/src/composer/bodyProfile.test.ts',
  'face-analysis/services/faceAnalysisReportGate.ts',
  'face-analysis/services/faceAnalysisReportGate.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module', 'commonjs',
  '--target', 'ES2020',
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
  '--types', 'node,react',
  '--typeRoots', join(repoRoot, 'apps/mobile/node_modules/@types'),
  '--rootDir', srcRoot,
  '--outDir', outDir,
  ...entries.map(file => join(featuresDir, file)),
  join(srcRoot, 'shared/ui/storyReportPagerGesture.ts'),
  join(srcRoot, 'shared/ui/storyReportPagerGesture.test.ts'),
  join(srcRoot, 'shared/services/faceAnalysisService.test.ts'),
]);

run(process.execPath, [join(outDir, 'features/face-report/reportFormat.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/reportFeatureAxes.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportStoryModel.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportContentUpgrade.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/reportCompletionStatus.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/goldenMaskInteraction.test.js')]);
run(process.execPath, [join(outDir, 'features/face-report/services/faceDepthPresentation.test.js')]);
run(process.execPath, [join(outDir, 'features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.js')]);
run(process.execPath, [join(outDir, 'features/ar/stencil/src/composer/bodyProfile.test.js')]);
run(process.execPath, [join(outDir, 'features/face-analysis/services/faceAnalysisReportGate.test.js')]);
run(process.execPath, [join(outDir, 'shared/ui/storyReportPagerGesture.test.js')]);
run(process.execPath, [join(outDir, 'shared/services/faceAnalysisService.test.js')]);

const regionCardSource = readFileSync(
  join(featuresDir, 'face-report/sections/S3Features.tsx'),
  'utf8',
);
if (regionCardSource.includes('이 부위의 결론')) {
  throw new Error('Region report must not render the removed conclusion label.');
}
for (const required of [
  '<ReportGlassSurface',
  'cropRect: undefined',
  'accessibilityState={{expanded: selected, selected}}',
]) {
  if (!regionCardSource.includes(required)) {
    throw new Error(`Region report progressive disclosure contract missing: ${required}`);
  }
}
console.log('region report visual hierarchy contract passed');
