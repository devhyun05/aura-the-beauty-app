import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-beard-simulation-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const contractsDir = join(
  repoRoot,
  'apps/mobile/src/features/beard-simulation/contracts',
);
const testPath = join(contractsDir, 'beardSimulationContract.test.ts');
const typesPath = join(contractsDir, 'types.ts');
const validatePath = join(contractsDir, 'validate.ts');
const fixturesDir = join(contractsDir, 'fixtures');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--skipLibCheck',
  '--strict',
  '--outDir',
  outDir,
  testPath,
  typesPath,
  validatePath,
]);

run(process.execPath, [
  join(outDir, 'beardSimulationContract.test.js'),
  fixturesDir,
]);
