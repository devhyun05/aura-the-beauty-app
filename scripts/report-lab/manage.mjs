#!/usr/bin/env node

import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RUNTIME_ROOT = join(REPO_ROOT, '.runtime');
export const RUNTIME_DIR = join(RUNTIME_ROOT, 'report-lab');
export const ENV_PATH = join(RUNTIME_ROOT, 'report-lab.env');
export const STATE_PATH = join(RUNTIME_DIR, 'state.json');
export const COMPOSE_PATH = join(REPO_ROOT, 'infra/report-lab/docker-compose.yml');
export const BACKEND_ROOT = join(REPO_ROOT, 'services/backend');
export const PREFERRED_BACKEND_PYTHON = join(BACKEND_ROOT, '.venv/bin/python');
export const REPORT_LAB_ROOT = join(REPO_ROOT, 'apps/report-lab');
export const MANAGER_PATH = fileURLToPath(import.meta.url);

export const NORMAL_PROJECT = 'aura-report-lab';
export const NORMAL_DB_PORT = 55432;
export const BACKEND_PORT = 8000;
export const FRONTEND_PORT = 5173;
export const LOOPBACK = '127.0.0.1';
export const FRONTEND_ORIGIN = `http://${LOOPBACK}:${FRONTEND_PORT}`;
export const FIXTURE_PRINCIPAL_ID = '00000000-0000-4000-8000-000000000027';
export const NATIVE_PGDATA = join(RUNTIME_DIR, 'pgdata');
export const NATIVE_PGSOCKET = join(RUNTIME_DIR, 'pgsocket');
export const NATIVE_PGLOG = join(RUNTIME_DIR, 'postgres.log');

const REQUIRED_ENV_KEYS = [
  'AURA_REPORT_LAB_DB_PASSWORD',
  'AURA_REPORT_LAB_DB_PORT',
  'AURA_REPORT_LAB_DATABASE_URL',
  'AURA_REPORT_LAB_DB_ENGINE',
];
const MANAGED_ROLES = new Set(['backend', 'frontend']);
const SAFE_ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const SAFE_ENV_VALUE = /^[^\r\n]*$/;

export class ReportLabLifecycleError extends Error {}

export function delay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function ensureDirectory(path, mode = 0o700) {
  mkdirSync(path, {recursive: true, mode});
  try {
    chmodSync(path, mode);
  } catch {
    // A read-only parent or a platform without POSIX modes will fail later on write.
  }
}

function atomicWrite(path, contents, mode) {
  ensureDirectory(dirname(path));
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  writeFileSync(temporaryPath, contents, {encoding: 'utf8', mode});
  chmodSync(temporaryPath, mode);
  renameSync(temporaryPath, path);
}

export function parseEnvFile(source) {
  const parsed = {};
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new ReportLabLifecycleError(`Invalid env entry at line ${index + 1}.`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (!SAFE_ENV_KEY.test(key) || !SAFE_ENV_VALUE.test(value)) {
      throw new ReportLabLifecycleError(`Unsafe env entry at line ${index + 1}.`);
    }
    if (Object.hasOwn(parsed, key)) {
      throw new ReportLabLifecycleError(`Duplicate env key: ${key}`);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function formatEnvFile(values) {
  const lines = [];
  for (const [key, value] of Object.entries(values)) {
    if (!SAFE_ENV_KEY.test(key) || !SAFE_ENV_VALUE.test(String(value))) {
      throw new ReportLabLifecycleError(`Unsafe env value for ${key}.`);
    }
    lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildDatabaseUrl(password, port = NORMAL_DB_PORT) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(password)) {
    throw new ReportLabLifecycleError('Report Lab DB password must be URL-safe and at least 32 characters.');
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) {
    throw new ReportLabLifecycleError('Report Lab DB port is outside the allowed range.');
  }
  return `postgresql://aura_report_lab:${password}@${LOOPBACK}:${port}/aura_report_lab`;
}

export function buildRuntimeEnv({password, port = NORMAL_DB_PORT, engine = 'native'} = {}) {
  if (!['native', 'compose'].includes(engine)) {
    throw new ReportLabLifecycleError('Report Lab DB engine must be native or compose.');
  }
  const safePassword = password ?? randomBytes(32).toString('base64url');
  return {
    AURA_REPORT_LAB_DB_PASSWORD: safePassword,
    AURA_REPORT_LAB_DB_PORT: String(port),
    AURA_REPORT_LAB_DATABASE_URL: buildDatabaseUrl(safePassword, Number(port)),
    AURA_REPORT_LAB_DB_ENGINE: engine,
    LAB_MODE: 'true',
    ENVIRONMENT: 'local',
    AUTH_REQUIRED: 'false',
    REPORT_LAB_MODEL_PROVIDER: 'disabled',
    IMAGE_GENERATION_PROVIDER: 'disabled',
    AI_PROVIDER: 'disabled',
    OPENAI_ENABLED: 'false',
    AWS_USE_IAM_ROLE: 'false',
    CORS_ENABLED: 'true',
    CORS_ALLOW_ORIGINS: FRONTEND_ORIGIN,
    REPORT_LAB_MAX_RUNS_PER_REQUEST: '5',
    REPORT_LAB_SESSION_BUDGET_RUNS: '50',
    REPORT_LAB_RETENTION_DAYS: '7',
    REPORT_LAB_FIXTURE_PRINCIPAL_ID: FIXTURE_PRINCIPAL_ID,
    REPORT_LAB_RAW_RESPONSE_ADMIN_TOKEN: '',
  };
}

export function validateRuntimeEnv(values) {
  for (const key of REQUIRED_ENV_KEYS) {
    if (!values[key]) {
      throw new ReportLabLifecycleError(`Missing ${key} in ${relative(REPO_ROOT, ENV_PATH)}.`);
    }
  }
  const port = Number(values.AURA_REPORT_LAB_DB_PORT);
  const expectedUrl = buildDatabaseUrl(values.AURA_REPORT_LAB_DB_PASSWORD, port);
  if (values.AURA_REPORT_LAB_DATABASE_URL !== expectedUrl) {
    throw new ReportLabLifecycleError('Report Lab database URL does not match its local password/port tuple.');
  }
  if (
    !['native', 'compose'].includes(values.AURA_REPORT_LAB_DB_ENGINE)
    ||
    values.LAB_MODE !== 'true'
    || values.AUTH_REQUIRED !== 'false'
    || values.REPORT_LAB_MODEL_PROVIDER !== 'disabled'
    || values.IMAGE_GENERATION_PROVIDER !== 'disabled'
    || values.AI_PROVIDER !== 'disabled'
    || values.OPENAI_ENABLED !== 'false'
    || values.CORS_ALLOW_ORIGINS !== FRONTEND_ORIGIN
  ) {
    throw new ReportLabLifecycleError('Report Lab env must remain local-only with every external provider disabled.');
  }
  return values;
}

export function readRuntimeEnv(envPath = ENV_PATH) {
  if (!existsSync(envPath)) {
    throw new ReportLabLifecycleError(
      `${relative(REPO_ROOT, envPath)} does not exist. Run npm run report-lab:setup first.`,
    );
  }
  chmodSync(envPath, 0o600);
  return validateRuntimeEnv(parseEnvFile(readFileSync(envPath, 'utf8')));
}

export function redactSecrets(value, env = {}) {
  let rendered = String(value ?? '');
  const secrets = [env.AURA_REPORT_LAB_DB_PASSWORD, env.AURA_REPORT_LAB_DATABASE_URL]
    .filter(secret => typeof secret === 'string' && secret.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) {
    rendered = rendered.split(secret).join('[REDACTED]');
  }
  rendered = rendered.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@');
  return rendered;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new ReportLabLifecycleError(
      options.errorMessage ?? `${command} ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}.`,
    );
  }
}

export function resolveComposeCommand(probe = capture) {
  if (probe('docker', ['compose', 'version']).ok) {
    return {command: 'docker', prefix: ['compose']};
  }
  if (probe('docker-compose', ['version']).ok) {
    return {command: 'docker-compose', prefix: []};
  }
  throw new ReportLabLifecycleError(
    'Docker Compose is unavailable. Install the Compose plugin and verify `docker compose version`.',
  );
}

function composeArgs(compose, {project, envPath}, args) {
  return [
    ...compose.prefix,
    '-p',
    project,
    '--env-file',
    envPath,
    '-f',
    COMPOSE_PATH,
    ...args,
  ];
}

function runCompose(compose, context, args, options = {}) {
  run(compose.command, composeArgs(compose, context, args), options);
}

function captureCompose(compose, context, args) {
  return capture(compose.command, composeArgs(compose, context, args));
}

async function ensureDockerDaemon(compose) {
  if (capture('docker', ['info', '--format', '{{.ServerVersion}}']).ok) {
    return;
  }
  if (capture('colima', ['status']).ok || capture('colima', ['version']).ok) {
    console.log('Starting the local Colima Docker runtime...');
    run('colima', ['start'], {errorMessage: 'Colima could not be started.'});
  }
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (capture('docker', ['info', '--format', '{{.ServerVersion}}']).ok) {
      return;
    }
    await delay(1000);
  }
  // Exercise the selected frontend once to make the error actionable.
  captureCompose(compose, {project: NORMAL_PROJECT, envPath: ENV_PATH}, ['version']);
  throw new ReportLabLifecycleError('Docker daemon is not reachable after the local startup attempt.');
}

export function assertComposeContract(source = readFileSync(COMPOSE_PATH, 'utf8')) {
  const requiredFragments = [
    'pgvector/pgvector:pg16',
    'POSTGRES_DB: aura_report_lab',
    'POSTGRES_USER: aura_report_lab',
    '127.0.0.1:${AURA_REPORT_LAB_DB_PORT:-55432}:5432',
    'report_lab_postgres:/var/lib/postgresql/data',
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new ReportLabLifecycleError(`Compose local-isolation contract is missing: ${fragment}`);
    }
  }
  if (/\bcontainer_name\s*:/.test(source)) {
    throw new ReportLabLifecycleError('Report Lab Compose must not use container_name; tests need project isolation.');
  }
  return true;
}

function projectVolumes(project) {
  const result = capture('docker', [
    'volume',
    'ls',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${project}`,
  ]);
  if (!result.ok) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

function ensureNormalRuntimeEnv() {
  ensureDirectory(RUNTIME_ROOT);
  ensureDirectory(RUNTIME_DIR);
  if (existsSync(ENV_PATH)) {
    return readRuntimeEnv();
  }
  let existingVolumes = [];
  if (capture('docker', ['info', '--format', '{{.ServerVersion}}']).ok) {
    existingVolumes = projectVolumes(NORMAL_PROJECT);
  }
  if (existsSync(NATIVE_PGDATA) || existingVolumes.length > 0) {
    throw new ReportLabLifecycleError(
      'Report Lab database state exists but its password file is missing. Refusing to rotate the password or delete data.',
    );
  }
  const values = buildRuntimeEnv();
  atomicWrite(ENV_PATH, formatEnvFile(values), 0o600);
  console.log(`Created ${relative(REPO_ROOT, ENV_PATH)} with a new local-only DB secret.`);
  return readRuntimeEnv();
}

function sha256Files(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function stampMatches(path, value) {
  return existsSync(path) && readFileSync(path, 'utf8').trim() === value;
}

function writeStamp(path, value) {
  atomicWrite(path, `${value}\n`, 0o600);
}

function ensureNodeDependencies() {
  const lockPath = join(REPORT_LAB_ROOT, 'package-lock.json');
  const packagePath = join(REPORT_LAB_ROOT, 'package.json');
  if (!existsSync(lockPath) || !existsSync(packagePath)) {
    throw new ReportLabLifecycleError('apps/report-lab package.json and package-lock.json are required.');
  }
  const stamp = sha256Files([packagePath, lockPath]);
  const stampPath = join(RUNTIME_DIR, 'report-lab-node-deps.sha256');
  const vitePath = join(REPORT_LAB_ROOT, 'node_modules/.bin/vite');
  if (!stampMatches(stampPath, stamp) || !existsSync(vitePath)) {
    ensureDirectory(join(RUNTIME_ROOT, 'npm-cache/report-lab'));
    run('npm', ['ci', '--no-audit', '--no-fund'], {
      cwd: REPORT_LAB_ROOT,
      env: {
        ...process.env,
        npm_config_cache: join(RUNTIME_ROOT, 'npm-cache/report-lab'),
      },
      errorMessage: 'Report Lab npm ci failed.',
    });
    writeStamp(stampPath, stamp);
  }
}

function pythonHasBackendModules(pythonPath) {
  if (!pythonPath || !existsSync(pythonPath)) {
    return false;
  }
  return capture(pythonPath, [
    '-c',
    'import asyncpg, fastapi, pydantic_settings, pytest, uvicorn',
  ]).ok;
}

function gitWorktreePaths() {
  const result = capture('git', ['worktree', 'list', '--porcelain']);
  if (!result.ok) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length).trim())
    .filter(Boolean);
}

export function resolveBackendPython() {
  const candidates = [
    process.env.AURA_REPORT_LAB_PYTHON,
    PREFERRED_BACKEND_PYTHON,
    join(REPO_ROOT, '.venv/bin/python'),
    ...gitWorktreePaths().flatMap(worktree => [
      join(worktree, '.venv/bin/python'),
      join(worktree, 'services/backend/.venv/bin/python'),
    ]),
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates.map(candidate => resolve(candidate)))];
  return uniqueCandidates.find(pythonHasBackendModules) ?? null;
}

function ensurePythonDependencies() {
  const reusablePython = resolveBackendPython();
  if (reusablePython) {
    return reusablePython;
  }
  const requirementsPath = join(BACKEND_ROOT, 'requirements.txt');
  const stamp = sha256Files([requirementsPath]);
  const stampPath = join(RUNTIME_DIR, 'backend-python-deps.sha256');
  if (!existsSync(PREFERRED_BACKEND_PYTHON)) {
    run('python3', ['-m', 'venv', join(BACKEND_ROOT, '.venv')], {
      errorMessage: 'Could not create services/backend/.venv.',
    });
  }
  if (!stampMatches(stampPath, stamp)) {
    run(PREFERRED_BACKEND_PYTHON, [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '-r',
      requirementsPath,
    ], {errorMessage: 'Backend Python dependency installation failed.'});
    writeStamp(stampPath, stamp);
  }
  if (!pythonHasBackendModules(PREFERRED_BACKEND_PYTHON)) {
    throw new ReportLabLifecycleError('Backend Python environment is missing required local modules.');
  }
  return PREFERRED_BACKEND_PYTHON;
}

function ensurePlaywrightBrowser() {
  const playwrightPath = join(REPORT_LAB_ROOT, 'node_modules/.bin/playwright');
  if (!existsSync(playwrightPath)) {
    throw new ReportLabLifecycleError(
      'apps/report-lab must declare @playwright/test before Report Lab setup can finish.',
    );
  }
  const stampPath = join(RUNTIME_DIR, 'playwright-chromium.ready');
  const packageLockHash = sha256Files([join(REPORT_LAB_ROOT, 'package-lock.json')]);
  if (!stampMatches(stampPath, packageLockHash)) {
    run(playwrightPath, ['install', 'chromium'], {
      cwd: REPORT_LAB_ROOT,
      errorMessage: 'Playwright Chromium installation failed.',
    });
    writeStamp(stampPath, packageLockHash);
  }
}

function backendProcessEnv(runtimeEnv, sha) {
  return {
    ...process.env,
    ...runtimeEnv,
    DATABASE_URL: runtimeEnv.AURA_REPORT_LAB_DATABASE_URL,
    REPORT_LAB_COMMIT_SHA: sha,
    AURA_BUILD_SHA: sha,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  };
}

function runBackendModule(runtimeEnv, moduleName, args = []) {
  const backendPython = resolveBackendPython();
  if (!backendPython) {
    throw new ReportLabLifecycleError('A prepared backend Python environment is required.');
  }
  run(backendPython, ['-m', moduleName, ...args], {
    cwd: BACKEND_ROOT,
    env: backendProcessEnv(runtimeEnv, currentCommit().sha),
    errorMessage: `${moduleName} failed against the isolated Report Lab database.`,
  });
}

export function applyAndCheckSchema(runtimeEnv) {
  runBackendModule(runtimeEnv, 'app.db.init_db', ['--report-lab']);
  runBackendModule(runtimeEnv, 'app.db.check_schema', ['--report-lab']);
}

function pruneExpiredRuns(runtimeEnv) {
  const script = [
    'import asyncio, os, asyncpg',
    'from app.services.report_lab_runs import REPORT_LAB_PRUNE_EXPIRED_RUNS_SQL, REPORT_LAB_PRUNE_SESSIONS_SQL',
    'async def main():',
    '  connection = await asyncpg.connect(os.environ["DATABASE_URL"])',
    '  try:',
    '    await connection.execute(REPORT_LAB_PRUNE_EXPIRED_RUNS_SQL)',
    '    await connection.execute(REPORT_LAB_PRUNE_SESSIONS_SQL)',
    '  finally:',
    '    await connection.close()',
    'asyncio.run(main())',
  ].join('\n');
  const backendPython = resolveBackendPython();
  if (!backendPython) {
    throw new ReportLabLifecycleError('A prepared backend Python environment is required.');
  }
  run(backendPython, ['-c', script], {
    cwd: BACKEND_ROOT,
    env: backendProcessEnv(runtimeEnv, currentCommit().sha),
    errorMessage: 'Could not prune expired Report Lab runs.',
  });
}

function verifyPruneRetentionContract(runtimeEnv) {
  const script = [
    'import asyncio, os, asyncpg',
    'from app.services.report_lab_runs import REPORT_LAB_PRUNE_EXPIRED_RUNS_SQL, REPORT_LAB_PRUNE_SESSIONS_SQL',
    'async def main():',
    '  connection = await asyncpg.connect(os.environ["DATABASE_URL"])',
    '  try:',
    '    await connection.execute("""',
    '      insert into analysis_lab_sessions (id, principal_id, status, expires_at) values',
    "        ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'cancelled', now() + interval '1 day'),",
    "        ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'cancelled', now() + interval '1 day'),",
    "        ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'active', now() - interval '1 day')",
    '    """)',
    '    await connection.execute("""',
    '      insert into analysis_lab_runs (',
    '        session_id, client_request_id, batch_ordinal, fixture_id, principal_id,',
    '        stage, status, schema_version, prompt_version, input_hash, expires_at',
    '      ) values',
    "        ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1, 'synthetic-balanced-v1', '20000000-0000-4000-8000-000000000001', 'consult', 'completed', 'test-v1', 'prune-v1', repeat('a', 64), now() + interval '1 day'),",
    "        ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 1, 'synthetic-balanced-v1', '20000000-0000-4000-8000-000000000001', 'consult', 'completed', 'test-v1', 'prune-v1', repeat('b', 64), now() + interval '1 day')",
    '    """)',
    '    await connection.execute(REPORT_LAB_PRUNE_EXPIRED_RUNS_SQL)',
    '    await connection.execute(REPORT_LAB_PRUNE_SESSIONS_SQL)',
    "    retained = await connection.fetchval(\"select count(*) from analysis_lab_sessions s join analysis_lab_runs r on r.session_id=s.id where s.id='10000000-0000-4000-8000-000000000001'\")",
    "    empty_cancelled = await connection.fetchval(\"select count(*) from analysis_lab_sessions where id='10000000-0000-4000-8000-000000000002'\")",
    "    expired = await connection.fetchval(\"select count(*) from analysis_lab_sessions s left join analysis_lab_runs r on r.session_id=s.id where s.id='10000000-0000-4000-8000-000000000003' or r.session_id='10000000-0000-4000-8000-000000000003'\")",
    '    if retained != 1 or empty_cancelled != 0 or expired != 0:',
    '      raise RuntimeError(f"Report Lab prune retention contract failed: retained={retained}, empty={empty_cancelled}, expired={expired}")',
    "    await connection.execute(\"delete from analysis_lab_sessions where id='10000000-0000-4000-8000-000000000001'\")",
    '  finally:',
    '    await connection.close()',
    'asyncio.run(main())',
  ].join('\n');
  const backendPython = resolveBackendPython();
  if (!backendPython) {
    throw new ReportLabLifecycleError('A prepared backend Python environment is required.');
  }
  run(backendPython, ['-c', script], {
    cwd: BACKEND_ROOT,
    env: backendProcessEnv(runtimeEnv, currentCommit().sha),
    errorMessage: 'Report Lab prune retention contract failed.',
  });
}

function startComposePostgres(compose, context) {
  runCompose(compose, context, ['up', '-d', '--wait', 'postgres'], {
    errorMessage: `Could not start the isolated ${context.project} PostgreSQL service.`,
  });
}

export function assertRuntimePath(path, allowedRoot = RUNTIME_ROOT) {
  const root = resolve(allowedRoot);
  const candidate = resolve(path);
  if (candidate === root || !candidate.startsWith(`${root}${sep}`)) {
    throw new ReportLabLifecycleError(`Refusing to manage a path outside ${relative(REPO_ROOT, root)}.`);
  }
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new ReportLabLifecycleError('Report Lab runtime root must not be a symbolic link.');
  }
  const relativeCandidate = relative(root, candidate);
  let cursor = root;
  for (const component of relativeCandidate.split(sep)) {
    cursor = join(cursor, component);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new ReportLabLifecycleError(`Report Lab runtime path must not contain symlinks: ${cursor}`);
    }
  }
  return candidate;
}

function commandPath(name) {
  const result = capture('which', [name]);
  const path = result.ok ? result.stdout.trim() : '';
  return path && isAbsolute(path) && existsSync(path) ? path : null;
}

function nativePostgresTools() {
  const tools = Object.fromEntries(
    ['postgres', 'initdb', 'pg_ctl', 'psql', 'createdb', 'pg_isready']
      .map(name => [name, commandPath(name)]),
  );
  const missing = Object.entries(tools).filter(([, path]) => !path).map(([name]) => name);
  if (missing.length > 0) {
    throw new ReportLabLifecycleError(`Native PostgreSQL tools are missing: ${missing.join(', ')}`);
  }
  const version = capture(tools.postgres, ['--version']);
  if (!version.ok || !/PostgreSQL\) 16\./.test(version.stdout)) {
    throw new ReportLabLifecycleError('Report Lab requires native PostgreSQL 16.');
  }
  return tools;
}

export function nativePostgresContext({
  root = RUNTIME_DIR,
  port = NORMAL_DB_PORT,
} = {}) {
  const safeRoot = assertRuntimePath(root);
  return {
    root: safeRoot,
    port: Number(port),
    pgdata: assertRuntimePath(join(safeRoot, 'pgdata')),
    socket: assertRuntimePath(join(safeRoot, 'pgsocket')),
    log: assertRuntimePath(join(safeRoot, 'postgres.log')),
  };
}

function nativePostgresEnv(runtimeEnv, context) {
  return {
    ...process.env,
    PGPASSWORD: runtimeEnv.AURA_REPORT_LAB_DB_PASSWORD,
    PGHOST: LOOPBACK,
    PGPORT: String(context.port),
    PGUSER: 'aura_report_lab',
  };
}

function nativePostgresRunning(tools, context) {
  return existsSync(join(context.pgdata, 'PG_VERSION'))
    && capture(tools.pg_ctl, ['-D', context.pgdata, 'status']).ok;
}

function writeNativePostgresConfiguration(context) {
  atomicWrite(join(context.pgdata, 'postgresql.auto.conf'), [
    "listen_addresses = '127.0.0.1'",
    `port = ${context.port}`,
    // The repository worktree path can exceed macOS' 103-byte Unix-socket cap.
    // Report Lab uses authenticated TCP loopback exclusively.
    "unix_socket_directories = ''",
    "password_encryption = 'scram-sha-256'",
    'max_connections = 40',
    '',
  ].join('\n'), 0o600);
  atomicWrite(join(context.pgdata, 'pg_hba.conf'), [
    '# Report Lab dedicated local cluster. No remote network is accepted.',
    'local all all scram-sha-256',
    'host all all 127.0.0.1/32 scram-sha-256',
    'host all all 0.0.0.0/0 reject',
    'host all all ::/0 reject',
    '',
  ].join('\n'), 0o600);
}

function initializeNativePostgres(tools, context, runtimeEnv) {
  ensureDirectory(context.root);
  ensureDirectory(context.socket);
  if (existsSync(join(context.pgdata, 'PG_VERSION'))) {
    const version = readFileSync(join(context.pgdata, 'PG_VERSION'), 'utf8').trim();
    if (version !== '16') {
      throw new ReportLabLifecycleError(`Unexpected Report Lab PostgreSQL data version: ${version}`);
    }
    chmodSync(context.pgdata, 0o700);
    writeNativePostgresConfiguration(context);
    return;
  }
  if (existsSync(context.pgdata) && readdirSync(context.pgdata).length > 0) {
    throw new ReportLabLifecycleError('Report Lab pgdata is non-empty but has no PostgreSQL 16 marker.');
  }
  const passwordFile = assertRuntimePath(
    join(context.root, `.initdb-password-${process.pid}-${randomBytes(5).toString('hex')}`),
  );
  atomicWrite(passwordFile, `${runtimeEnv.AURA_REPORT_LAB_DB_PASSWORD}\n`, 0o600);
  try {
    run(tools.initdb, [
      '-D',
      context.pgdata,
      '--encoding=UTF8',
      '--locale=C',
      '--username=aura_report_lab',
      `--pwfile=${passwordFile}`,
      '--auth-local=scram-sha-256',
      '--auth-host=scram-sha-256',
    ], {errorMessage: 'Could not initialize the dedicated Report Lab PostgreSQL cluster.'});
  } finally {
    rmSync(passwordFile, {force: true});
  }
  chmodSync(context.pgdata, 0o700);
  writeNativePostgresConfiguration(context);
}

export async function ensureNativePostgres(runtimeEnv, context = nativePostgresContext({
  port: Number(runtimeEnv.AURA_REPORT_LAB_DB_PORT),
})) {
  const tools = nativePostgresTools();
  initializeNativePostgres(tools, context, runtimeEnv);
  if (!nativePostgresRunning(tools, context)) {
    if (!(await portIsFree(context.port))) {
      throw new ReportLabLifecycleError(
        `Loopback port ${context.port} is occupied by an unmanaged process; refusing to stop it.`,
      );
    }
    ensureDirectory(context.socket);
    if (!existsSync(context.log)) {
      const log = openSync(context.log, 'a', 0o600);
      closeSync(log);
    }
    chmodSync(context.log, 0o600);
    run(tools.pg_ctl, [
      '-D',
      context.pgdata,
      '-l',
      context.log,
      '-w',
      '-t',
      '30',
      'start',
    ], {errorMessage: 'Could not start the dedicated native Report Lab PostgreSQL cluster.'});
  }
  const pgEnv = nativePostgresEnv(runtimeEnv, context);
  const ready = capture(tools.pg_isready, [
    '-h',
    LOOPBACK,
    '-p',
    String(context.port),
    '-U',
    'aura_report_lab',
    '-d',
    'postgres',
  ], {env: pgEnv});
  if (!ready.ok) {
    throw new ReportLabLifecycleError('Dedicated native Report Lab PostgreSQL did not become ready.');
  }
  const databaseExists = capture(tools.psql, [
    '-h',
    LOOPBACK,
    '-p',
    String(context.port),
    '-U',
    'aura_report_lab',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-tAc',
    "select 1 from pg_database where datname='aura_report_lab'",
  ], {env: pgEnv});
  if (!databaseExists.ok) {
    throw new ReportLabLifecycleError('Could not inspect the dedicated Report Lab database catalog.');
  }
  if (databaseExists.stdout.trim() !== '1') {
    run(tools.createdb, [
      '-h',
      LOOPBACK,
      '-p',
      String(context.port),
      '-U',
      'aura_report_lab',
      'aura_report_lab',
    ], {
      env: pgEnv,
      errorMessage: 'Could not create the dedicated aura_report_lab database.',
    });
  }
  return {tools, context};
}

function nativePostgresStatus(runtimeEnv, context = nativePostgresContext({
  port: Number(runtimeEnv.AURA_REPORT_LAB_DB_PORT),
})) {
  try {
    const tools = nativePostgresTools();
    const running = nativePostgresRunning(tools, context);
    const ready = running && capture(tools.pg_isready, [
      '-h',
      LOOPBACK,
      '-p',
      String(context.port),
      '-U',
      'aura_report_lab',
      '-d',
      'aura_report_lab',
    ], {env: nativePostgresEnv(runtimeEnv, context)}).ok;
    return {engine: 'native', running, ready, port: context.port};
  } catch {
    return {engine: 'native', running: false, ready: false, port: context.port};
  }
}

export function stopNativePostgres(context = nativePostgresContext()) {
  const tools = nativePostgresTools();
  if (!nativePostgresRunning(tools, context)) {
    return;
  }
  run(tools.pg_ctl, [
    '-D',
    context.pgdata,
    '-w',
    '-t',
    '30',
    '-m',
    'fast',
    'stop',
  ], {errorMessage: 'Could not stop the dedicated native Report Lab PostgreSQL cluster.'});
}

export function removeNativePostgresData(context = nativePostgresContext()) {
  for (const path of [context.pgdata, context.socket, context.log]) {
    assertRuntimePath(path);
    rmSync(path, {recursive: true, force: true});
  }
}

export function currentCommit() {
  const shaResult = capture('git', ['rev-parse', 'HEAD']);
  if (!shaResult.ok) {
    throw new ReportLabLifecycleError('Could not resolve the current git commit.');
  }
  const statusResult = capture('git', ['status', '--porcelain']);
  return {
    sha: shaResult.stdout.trim(),
    dirty: statusResult.ok && statusResult.stdout.trim().length > 0,
  };
}

async function setup({installDependencies = true} = {}) {
  assertComposeContract();
  const runtimeEnv = ensureNormalRuntimeEnv();
  if (installDependencies) {
    ensureNodeDependencies();
    ensurePythonDependencies();
  }
  let compose = null;
  if (runtimeEnv.AURA_REPORT_LAB_DB_ENGINE === 'native') {
    await ensureNativePostgres(runtimeEnv);
  } else {
    compose = resolveComposeCommand();
    await ensureDockerDaemon(compose);
    startComposePostgres(compose, {project: NORMAL_PROJECT, envPath: ENV_PATH});
  }
  applyAndCheckSchema(runtimeEnv);
  pruneExpiredRuns(runtimeEnv);
  console.log(
    `Report Lab setup is ready on the isolated ${runtimeEnv.AURA_REPORT_LAB_DB_ENGINE} local PostgreSQL database.`,
  );
  return {compose, runtimeEnv};
}

async function portIsFree(port) {
  return new Promise(resolvePromise => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolvePromise(false));
    server.listen({host: LOOPBACK, port, exclusive: true}, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function reserveFreePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPromise);
    server.listen({host: LOOPBACK, port: 0, exclusive: true}, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPromise(new ReportLabLifecycleError('Could not reserve a loopback test port.'));
        return;
      }
      const port = address.port;
      server.close(() => resolvePromise(port));
    });
  });
}

async function request(url, {json = false} = {}) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(2000)});
    let body = null;
    if (json) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    return {ok: response.ok, status: response.status, body};
  } catch (error) {
    return {ok: false, status: null, error: error?.name ?? 'request_failed', body: null};
  }
}

async function waitFor(check, label, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) {
      return;
    }
    await delay(500);
  }
  throw new ReportLabLifecycleError(`${label} did not become healthy within 30 seconds.`);
}

function readState() {
  if (!existsSync(STATE_PATH)) {
    return null;
  }
  try {
    const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return state && state.schemaVersion === 'aura.report-lab-runtime-state.v1' ? state : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  const serialized = JSON.stringify(state, null, 2);
  if (/postgres(?:ql)?:\/\//i.test(serialized) || serialized.includes('DB_PASSWORD')) {
    throw new ReportLabLifecycleError('Runtime state attempted to persist a secret-bearing field.');
  }
  atomicWrite(STATE_PATH, `${serialized}\n`, 0o600);
}

function processCommand(pid) {
  if (!Number.isInteger(pid) || pid <= 1) {
    return null;
  }
  const result = capture('ps', ['-p', String(pid), '-o', 'command=']);
  return result.ok ? result.stdout.trim() : null;
}

export function managedProcessFingerprint(role, instanceId) {
  if (!MANAGED_ROLES.has(role) || !/^[0-9a-f-]{36}$/.test(instanceId)) {
    throw new ReportLabLifecycleError('Invalid managed process identity.');
  }
  return `${basename(MANAGER_PATH)} _serve ${role} ${instanceId}`;
}

function processMatches(record) {
  const command = processCommand(record?.pid);
  if (!command) {
    return false;
  }
  const fingerprint = managedProcessFingerprint(record.role, record.instanceId);
  return command.includes(fingerprint);
}

function openLog(role) {
  ensureDirectory(RUNTIME_DIR);
  return openSync(join(RUNTIME_DIR, `${role}.log`), 'a', 0o600);
}

function startSupervisor(role, instanceId) {
  const log = openLog(role);
  try {
    const child = spawn(process.execPath, [MANAGER_PATH, '_serve', role, instanceId], {
      cwd: REPO_ROOT,
      detached: true,
      env: process.env,
      stdio: ['ignore', log, log],
    });
    child.unref();
    if (!child.pid) {
      throw new ReportLabLifecycleError(`Could not start the ${role} supervisor.`);
    }
    return {
      role,
      pid: child.pid,
      instanceId,
      logPath: relative(REPO_ROOT, join(RUNTIME_DIR, `${role}.log`)),
    };
  } finally {
    closeSync(log);
  }
}

function supervisorCommand(role, runtimeEnv, sha) {
  if (role === 'backend') {
    const backendPython = resolveBackendPython();
    if (!backendPython) {
      throw new ReportLabLifecycleError('A prepared backend Python environment is required.');
    }
    return {
      command: backendPython,
      args: [
        '-m',
        'uvicorn',
        'app.main:app',
        '--host',
        LOOPBACK,
        '--port',
        String(BACKEND_PORT),
        '--no-proxy-headers',
      ],
      cwd: BACKEND_ROOT,
      env: backendProcessEnv(runtimeEnv, sha),
    };
  }
  if (role === 'frontend') {
    return {
      command: 'npm',
      args: [
        '--prefix',
        REPORT_LAB_ROOT,
        'run',
        'dev',
        '--',
        '--host',
        LOOPBACK,
        '--port',
        String(FRONTEND_PORT),
        '--strictPort',
      ],
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        VITE_REPORT_LAB_API_BASE_URL: `http://${LOOPBACK}:${BACKEND_PORT}/api`,
        VITE_REPORT_LAB_COMMIT_SHA: sha,
        NO_PROXY: '127.0.0.1,localhost',
        no_proxy: '127.0.0.1,localhost',
      },
    };
  }
  throw new ReportLabLifecycleError(`Unknown supervisor role: ${role}`);
}

async function runSupervisor(role, instanceId) {
  managedProcessFingerprint(role, instanceId);
  const runtimeEnv = readRuntimeEnv();
  const {sha} = currentCommit();
  const specification = supervisorCommand(role, runtimeEnv, sha);
  const child = spawn(specification.command, specification.args, {
    cwd: specification.cwd,
    env: specification.env,
    stdio: 'inherit',
  });

  let stopping = false;
  const forward = signal => {
    if (stopping) {
      return;
    }
    stopping = true;
    try {
      child.kill(signal);
    } catch {
      process.exitCode = 1;
    }
  };
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGINT', () => forward('SIGINT'));

  await new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (signal && !stopping) {
        process.exitCode = 1;
      } else {
        process.exitCode = code ?? 0;
      }
      resolvePromise();
    });
  });
}

async function basicHealthMatches(state) {
  if (!state || state.commitSha !== currentCommit().sha) {
    return false;
  }
  if (!state.processes?.every(processMatches)) {
    return false;
  }
  const [frontend, lab] = await Promise.all([
    request(`http://${LOOPBACK}:${FRONTEND_PORT}/`),
    request(`http://${LOOPBACK}:${BACKEND_PORT}/api/lab/health`, {json: true}),
  ]);
  const labHealth = safeLabHealth(lab.body);
  return (
    frontend.ok
    && lab.ok
    && labHealth?.status === 'ok'
    && labHealth?.database === 'connected'
    && labHealth?.providerMode === 'disabled'
    && labHealth?.buildSha === state.commitSha
  );
}

async function dev() {
  await setup();
  const existingState = readState();
  if (await basicHealthMatches(existingState)) {
    console.log(`Report Lab is already healthy at ${FRONTEND_ORIGIN} (${existingState.commitSha}).`);
    return;
  }
  if (existingState) {
    await stop({quiet: true});
  }
  if (!(await portIsFree(BACKEND_PORT)) || !(await portIsFree(FRONTEND_PORT))) {
    throw new ReportLabLifecycleError(
      'Port 8000 or 5173 is owned by an unmanaged process. Refusing to kill or replace it.',
    );
  }

  const commit = currentCommit();
  const instanceId = randomUUID();
  const processes = [
    startSupervisor('backend', instanceId),
    startSupervisor('frontend', instanceId),
  ];
  const state = {
    schemaVersion: 'aura.report-lab-runtime-state.v1',
    instanceId,
    commitSha: commit.sha,
    dirty: commit.dirty,
    frontendUrl: FRONTEND_ORIGIN,
    backendUrl: `http://${LOOPBACK}:${BACKEND_PORT}`,
    providerMode: 'disabled',
    startedAtUtc: new Date().toISOString(),
    processes,
  };
  writeState(state);
  try {
    await Promise.all([
      waitFor(async () => (await request(state.frontendUrl)).ok, 'Report Lab frontend'),
      waitFor(async () => {
        const response = await request(`${state.backendUrl}/api/lab/health`, {json: true});
        const health = safeLabHealth(response.body);
        return (
          response.ok
          && health?.status === 'ok'
          && health?.database === 'connected'
          && health?.providerMode === 'disabled'
          && health?.buildSha === state.commitSha
        );
      }, 'Report Lab backend and PostgreSQL'),
    ]);
  } catch (error) {
    await stop({quiet: true});
    throw error;
  }
  console.log(`Report Lab started at ${state.frontendUrl} (${state.commitSha}).`);
}

function safeLabHealth(body) {
  const data = body?.data ?? body;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const fixtureIds = Array.isArray(data.fixtures)
    ? data.fixtures
      .map(fixture => typeof fixture === 'string' ? fixture : fixture?.fixtureId)
      .filter(value => typeof value === 'string')
      .slice(0, 50)
    : [];
  return {
    buildSha: typeof data.buildSha === 'string' ? data.buildSha : null,
    status: typeof data.status === 'string' ? data.status : null,
    database: typeof data.database === 'string' ? data.database : null,
    providerMode: typeof data.providerMode === 'string'
      ? data.providerMode
      : (typeof data.provider === 'string' ? data.provider : null),
    imageGenerationProvider: typeof data.imageGenerationProvider === 'string'
      ? data.imageGenerationProvider
      : null,
    externalProviderRuns: Number.isInteger(data.externalProviderRuns)
      ? data.externalProviderRuns
      : null,
    fixtureCount: Number.isInteger(data.fixtureCount) ? data.fixtureCount : fixtureIds.length,
    fixtureIds,
  };
}

async function status({setExitCode = true} = {}) {
  const state = readState();
  const processStatus = Object.fromEntries(
    ['backend', 'frontend'].map(role => {
      const record = state?.processes?.find(processRecord => processRecord.role === role);
      return [role, Boolean(record && processMatches(record))];
    }),
  );
  const [frontend, lab] = await Promise.all([
    request(`http://${LOOPBACK}:${FRONTEND_PORT}/`),
    request(`http://${LOOPBACK}:${BACKEND_PORT}/api/lab/health`, {json: true}),
  ]);
  let postgresRuntime = {
    engine: null,
    running: false,
    ready: false,
    port: NORMAL_DB_PORT,
    composeFrontend: null,
  };
  try {
    const runtimeEnv = readRuntimeEnv();
    if (runtimeEnv.AURA_REPORT_LAB_DB_ENGINE === 'native') {
      postgresRuntime = nativePostgresStatus(runtimeEnv);
    } else {
      const compose = resolveComposeCommand();
      const composeFrontend = `${compose.command} ${compose.prefix.join(' ')}`.trim();
      const ps = captureCompose(
        compose,
        {project: NORMAL_PROJECT, envPath: ENV_PATH},
        ['ps', '--status', 'running', '--services'],
      );
      const running = ps.ok && ps.stdout.split(/\r?\n/).includes('postgres');
      postgresRuntime = {
        engine: 'compose',
        running,
        ready: running,
        port: Number(runtimeEnv.AURA_REPORT_LAB_DB_PORT),
        composeFrontend,
      };
    }
  } catch {
    // Status is observational and must not generate secrets or database state.
  }
  const labHealth = safeLabHealth(lab.body);
  const report = {
    ok: Boolean(
      state
      && state.commitSha === currentCommit().sha
      && processStatus.backend
      && processStatus.frontend
      && frontend.ok
      && lab.ok
      && labHealth?.status === 'ok'
      && labHealth?.database === 'connected'
      && labHealth?.providerMode === 'disabled'
      && labHealth?.imageGenerationProvider === 'disabled'
      && labHealth?.externalProviderRuns === 0
      && labHealth?.buildSha === state.commitSha
      && postgresRuntime.ready
    ),
    commitSha: state?.commitSha ?? null,
    currentCommitSha: currentCommit().sha,
    dirty: state?.dirty ?? null,
    providerMode: 'disabled',
    frontend: {url: FRONTEND_ORIGIN, process: processStatus.frontend, healthy: frontend.ok},
    backend: {
      url: `http://${LOOPBACK}:${BACKEND_PORT}`,
      process: processStatus.backend,
      healthy: lab.ok && labHealth?.status === 'ok',
    },
    postgres: {
      ...postgresRuntime,
      healthy: postgresRuntime.ready && labHealth?.database === 'connected',
    },
    lab: labHealth,
  };
  console.log(JSON.stringify(report, null, 2));
  if (setExitCode && !report.ok) {
    process.exitCode = 1;
  }
  return report;
}

async function waitForProcessExit(pid, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!processCommand(pid)) {
      return true;
    }
    await delay(100);
  }
  return false;
}

async function stop({quiet = false} = {}) {
  const state = readState();
  if (!state) {
    if (!quiet) {
      console.log('Report Lab app processes are already stopped.');
    }
    return;
  }
  for (const record of [...(state.processes ?? [])].reverse()) {
    if (!processMatches(record)) {
      continue;
    }
    try {
      process.kill(-record.pid, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error;
      }
    }
  }
  for (const record of state.processes ?? []) {
    if (await waitForProcessExit(record.pid)) {
      continue;
    }
    if (!processMatches(record)) {
      continue;
    }
    try {
      process.kill(-record.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error;
      }
    }
  }
  rmSync(STATE_PATH, {force: true});
  if (!quiet) {
    console.log('Report Lab app processes stopped; PostgreSQL data was preserved.');
  }
}

async function down() {
  await stop({quiet: true});
  const runtimeEnv = readRuntimeEnv();
  if (runtimeEnv.AURA_REPORT_LAB_DB_ENGINE === 'native') {
    const context = nativePostgresContext({port: Number(runtimeEnv.AURA_REPORT_LAB_DB_PORT)});
    stopNativePostgres(context);
    removeNativePostgresData(context);
    console.log('Report Lab app processes and dedicated native PostgreSQL data are down.');
    return;
  }
  const compose = resolveComposeCommand();
  await ensureDockerDaemon(compose);
  runCompose(
    compose,
    {project: NORMAL_PROJECT, envPath: ENV_PATH},
    ['down', '--volumes', '--remove-orphans'],
    {errorMessage: 'Could not remove the isolated Report Lab Compose project and volumes.'},
  );
  console.log('Report Lab app processes, containers, and dedicated PostgreSQL volume are down.');
}

export function makeTestProjectName(pid = process.pid, suffix = randomBytes(5).toString('hex')) {
  const name = `aura-report-lab-test-${pid}-${suffix}`.toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(name)) {
    throw new ReportLabLifecycleError('Generated Compose test project name is unsafe.');
  }
  return name;
}

function packageScripts() {
  return JSON.parse(readFileSync(join(REPORT_LAB_ROOT, 'package.json'), 'utf8')).scripts ?? {};
}

function runPackageScript(name, env) {
  const scripts = packageScripts();
  if (!scripts[name]) {
    return false;
  }
  run('npm', ['run', name], {
    cwd: REPORT_LAB_ROOT,
    env: {...process.env, ...env},
    errorMessage: `apps/report-lab ${name} failed.`,
  });
  return true;
}

function focusedBackendTests() {
  const candidates = [
    'tests/test_db_scripts.py',
    ...readdirSync(join(BACKEND_ROOT, 'tests'))
      .filter(name => /^test_report_lab(?:_.*)?\.py$/.test(name))
      .map(name => `tests/${name}`),
  ];
  const backendPython = resolveBackendPython();
  if (!backendPython) {
    throw new ReportLabLifecycleError('A prepared backend Python environment is required.');
  }
  // Unit tests construct both normal and Lab-mode Settings explicitly. Do not
  // leak the live lifecycle process configuration into their default-setting
  // assertions; the real temporary database has already passed schema checks.
  const testEnv = {
    ...process.env,
    LAB_MODE: 'false',
  };
  for (const key of [
    'ENVIRONMENT',
    'DATABASE_URL',
    'AURA_REPORT_LAB_DATABASE_URL',
    'AURA_REPORT_LAB_DB_PORT',
    'AURA_REPORT_LAB_DB_PASSWORD',
    'REPORT_LAB_TEST_DB_PORT',
  ]) {
    delete testEnv[key];
  }
  run(backendPython, ['-m', 'pytest', '-q', ...candidates], {
    cwd: BACKEND_ROOT,
    env: testEnv,
    errorMessage: 'Focused Report Lab backend tests failed.',
  });
}

async function test() {
  assertComposeContract();
  ensureDirectory(RUNTIME_DIR);
  ensureNodeDependencies();
  ensurePythonDependencies();
  run(process.execPath, ['--test', join(REPO_ROOT, 'scripts/report-lab/manage.test.mjs')], {
    errorMessage: 'Report Lab lifecycle unit tests failed.',
  });

  const testPort = await reserveFreePort();
  const project = makeTestProjectName();
  const testRoot = join(RUNTIME_ROOT, 'report-lab-tests', project);
  const envPath = join(testRoot, 'report-lab.env');
  ensureDirectory(testRoot);
  const runtimeEnv = buildRuntimeEnv({port: testPort, engine: 'native'});
  const testRuntimeEnv = {
    ...runtimeEnv,
    ENVIRONMENT: 'test',
    REPORT_LAB_TEST_DB_PORT: String(testPort),
  };
  atomicWrite(envPath, formatEnvFile(runtimeEnv), 0o600);
  const context = nativePostgresContext({root: testRoot, port: testPort});
  let teardownError = null;
  try {
    await ensureNativePostgres(runtimeEnv, context);
    applyAndCheckSchema(runtimeEnv);
    pruneExpiredRuns(runtimeEnv);
    verifyPruneRetentionContract(runtimeEnv);
    focusedBackendTests();
    for (const scriptName of ['typecheck', 'test', 'build']) {
      runPackageScript(scriptName, {
        ...testRuntimeEnv,
        DATABASE_URL: runtimeEnv.AURA_REPORT_LAB_DATABASE_URL,
        REPORT_LAB_TEST_PROJECT: project,
      });
    }
    if (packageScripts()['test:e2e']) {
      ensurePlaywrightBrowser();
      runPackageScript('test:e2e', {
        ...testRuntimeEnv,
        DATABASE_URL: runtimeEnv.AURA_REPORT_LAB_DATABASE_URL,
        REPORT_LAB_TEST_PROJECT: project,
      });
    }
  } finally {
    try {
      stopNativePostgres(context);
      removeNativePostgresData(context);
    } catch (error) {
      teardownError = error;
    }
    rmSync(testRoot, {recursive: true, force: true});
  }
  if (teardownError) {
    throw teardownError;
  }
  console.log('Report Lab tests passed and the isolated native PostgreSQL cluster was removed.');
}

function usage() {
  return 'Usage: node scripts/report-lab/manage.mjs <setup|dev|test|stop|down|status>';
}

async function main(argv = process.argv.slice(2)) {
  const [command, role, instanceId] = argv;
  if (command === '_serve') {
    await runSupervisor(role, instanceId);
    return;
  }
  const commands = {setup, dev, test, stop, down, status};
  if (!commands[command]) {
    throw new ReportLabLifecycleError(usage());
  }
  await commands[command]();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(MANAGER_PATH);
if (isMain) {
  main().catch(error => {
    let env = {};
    try {
      if (existsSync(ENV_PATH)) {
        env = parseEnvFile(readFileSync(ENV_PATH, 'utf8'));
      }
    } catch {
      env = {};
    }
    console.error(`Report Lab lifecycle failed: ${redactSecrets(error?.message ?? error, env)}`);
    process.exitCode = 1;
  });
}
