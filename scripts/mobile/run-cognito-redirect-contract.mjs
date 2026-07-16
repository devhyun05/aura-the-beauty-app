import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const outputDirectory = mkdtempSync(join(tmpdir(), 'aura-cognito-redirect-contract-'));
const tscPath = join(repositoryRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const serviceDirectory = join(
  repositoryRoot,
  'apps/mobile/src/features/auth/services',
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
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
  '--outDir',
  outputDirectory,
  join(serviceDirectory, 'cognitoRedirectUri.test.ts'),
  join(serviceDirectory, 'cognitoRedirectUri.ts'),
]);

run(process.execPath, [join(outputDirectory, 'cognitoRedirectUri.test.js')]);

console.log('Cognito redirect contract verified for Expo Go and native builds.');
