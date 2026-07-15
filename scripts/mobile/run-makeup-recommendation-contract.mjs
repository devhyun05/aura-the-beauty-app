import {mkdtempSync, readFileSync} from 'node:fs';
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

const scenarioPuzzleWallSource = readFileSync(
  join(srcRoot, 'features/makeup-recommendation/components/ScenarioPuzzleWall.tsx'),
  'utf8',
);
if (scenarioPuzzleWallSource.includes('scenarios.some(item => !measurements[item.id])')) {
  throw new Error('ScenarioPuzzleWall must keep measured cards visible while appended cards are being measured.');
}
if (scenarioPuzzleWallSource.includes('placements.length === 0 ? scenarios.map')) {
  throw new Error('ScenarioPuzzleWall must measure only missing cards without hiding existing placements.');
}
const scenarioDiscoverySource = readFileSync(
  join(srcRoot, 'features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx'),
  'utf8',
);
for (const duplicatePrompt of ['지금 끌리는 한 문장', '마음 가는 문장을 골라보세요.']) {
  if (scenarioDiscoverySource.includes(duplicatePrompt)) {
    throw new Error(`Scenario discovery must not repeat its prompt: ${duplicatePrompt}`);
  }
}
const questionScreenSource = readFileSync(
  join(srcRoot, 'features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx'),
  'utf8',
);
if (!questionScreenSource.includes('scenarioLabel={session.scenarioLabel}')) {
  throw new Error('Question screen must keep the initially selected scenario visible.');
}
const makeupServiceSource = readFileSync(
  join(srcRoot, 'features/makeup-recommendation/services/makeupRecommendationService.ts'),
  'utf8',
);
const recommendationResultsSource = readFileSync(
  join(srcRoot, 'features/makeup-recommendation/screens/RecommendationResultsView.tsx'),
  'utf8',
);
if (makeupServiceSource.includes("generationMode === 'localFallback'") || recommendationResultsSource.includes("generationMode === 'localFallback'")) {
  throw new Error('AI failures must be surfaced for retry instead of displaying fixture recommendations.');
}
if (recommendationResultsSource.includes('임시 추천')) {
  throw new Error('Recommendation results must never be presented as a temporary substitute for failed AI.');
}

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
