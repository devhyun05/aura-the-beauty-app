import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const result = spawnSync(
  process.execPath,
  ['scripts/face-ratio/test-phase1-replay.mjs'],
  {cwd: repoRoot, stdio: 'inherit'},
);

process.exit(result.status ?? 1);
