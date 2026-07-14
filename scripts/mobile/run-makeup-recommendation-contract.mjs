import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-makeup-recommendation-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const tests = [
  'features/makeup-recommendation/services/makeupRecommendationService.test.ts',
  'features/makeup-recommendation/components/scenarioPuzzleLayout.test.ts',
  'features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts',
  'features/ar/services/recommendedMakeupEditService.test.ts',
  'features/ar/services/savedArLookService.test.ts',
  'app/navigation/routes/makeupRecommendationRouteActions.test.ts',
  'app/navigation/routes/arRouteActions.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module', 'commonjs',
  '--target', 'ES2023',
  '--lib', 'ES2023,DOM',
  '--types', 'node',
  '--esModuleInterop',
  '--skipLibCheck',
  '--rootDir', srcRoot,
  '--outDir', outDir,
  ...tests.map(test => join(srcRoot, test)),
]);
for (const test of tests) run(process.execPath, [join(outDir, test.replace(/\.ts$/, '.js'))]);
