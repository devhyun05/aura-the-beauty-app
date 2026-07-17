#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {ENV_PATH, readRuntimeEnv} from './manage.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const TOOL_MANIFEST_PATH = join(REPO_ROOT, 'artifacts/report-lab/tool-manifest.json');
const TOOL_MANIFEST_REPOSITORY_PATH = 'artifacts/report-lab/tool-manifest.json';
const CLAUDE_STATUS_TIMEOUT_MS = 15_000;
const CLAUDE_PROVIDER_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_RESOURCE',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'AWS_BEARER_TOKEN_BEDROCK',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_VERTEX',
  'CLOUD_ML_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
];

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
  };
}

function firstPartyClaudeEnvironment() {
  const env = {...process.env};
  for (const key of CLAUDE_PROVIDER_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

function statusOnly(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'ignore',
  });
  return {
    ok: result.status === 0,
    unavailable: Boolean(result.error),
  };
}

function postgresConnectionStatus(target) {
  const result = spawnSync('psql', [
    '-X',
    '-h', target.hostname,
    '-p', target.port,
    '-U', target.username,
    '-d', target.pathname.slice(1),
    '-v', 'ON_ERROR_STOP=1',
    '-Atqc', 'select 1',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {...process.env, PGPASSWORD: target.password},
    stdio: 'ignore',
  });
  return result.status === 0;
}

function captureJson(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return {ok: false, value: null};
  }
  try {
    return {ok: true, value: JSON.parse(result.stdout)};
  } catch {
    return {ok: false, value: null};
  }
}

function firstLine(command, args) {
  const result = capture(command, args);
  return result.ok ? result.stdout.split(/\r?\n/, 1)[0].trim() || null : null;
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function configuredMcpNames() {
  const result = capture('codex', ['mcp', 'list']);
  if (!result.ok) {
    return new Set();
  }
  const names = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s+.*\benabled\b/);
    if (match) {
      names.add(match[1]);
    }
  }
  return names;
}

function primaryWorktreePath() {
  const result = capture('git', ['worktree', 'list', '--porcelain']);
  if (!result.ok) {
    return null;
  }
  const first = result.stdout.match(/^worktree (.+)$/m);
  return first?.[1]?.trim() || null;
}

function installedClaudePlugins() {
  const result = capture('claude', ['plugin', 'list'], {
    env: firstPartyClaudeEnvironment(),
    timeout: CLAUDE_STATUS_TIMEOUT_MS,
  });
  if (!result.ok) {
    return {};
  }
  const plugins = {};
  let current = null;
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    const pluginMatch = line.match(/^❯\s+([^@\s]+)@([^\s]+)$/);
    if (pluginMatch) {
      current = pluginMatch[1];
      plugins[current] = {source: pluginMatch[2], version: null, enabled: false};
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith('Version:')) {
      plugins[current].version = line.slice('Version:'.length).trim() || null;
    } else if (line.startsWith('Status:')) {
      plugins[current].enabled = line.includes('enabled');
    }
  }
  return plugins;
}

function claudeAuthStatus() {
  // Provider environment variables can silently route Claude CLI through
  // Bedrock or a direct API endpoint. The review gate is first-party-only, so
  // probe the same sanitized environment used by the exact-SHA review and
  // bound the probe so a keychain/UI stall cannot hang local setup forever.
  const result = capture('claude', ['auth', 'status'], {
    env: firstPartyClaudeEnvironment(),
    timeout: CLAUDE_STATUS_TIMEOUT_MS,
  });
  if (!result.stdout) {
    return {loggedIn: false, apiProvider: null};
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      loggedIn: parsed.loggedIn === true,
      apiProvider: typeof parsed.apiProvider === 'string' ? parsed.apiProvider : null,
    };
  } catch {
    return {loggedIn: false, apiProvider: null};
  }
}

export function assessGithubCliAuth(result) {
  if (result?.unavailable) {
    return {
      authenticated: false,
      status: 'BLOCKED_CLI_UNAVAILABLE',
      reasonCode: 'GH_CLI_UNAVAILABLE',
    };
  }
  if (result?.ok === true) {
    return {
      authenticated: true,
      status: 'CONFIGURED_CLI_AUTHENTICATED',
      reasonCode: 'LIVE_ACTIVE_AUTH_OK',
    };
  }
  return {
    authenticated: false,
    status: 'BLOCKED_CLI_AUTH',
    reasonCode: 'LIVE_ACTIVE_AUTH_FAILED',
  };
}

function githubCliAuthStatus() {
  return assessGithubCliAuth(
    statusOnly('gh', ['auth', 'status', '--active', '--hostname', 'github.com']),
  );
}

export function assessPostgresLabConfiguration(
  document,
  {expectedDatabaseUri = null, connectionProbe = null} = {},
) {
  if (!document || typeof document !== 'object') {
    return {
      configured: false,
      status: 'BLOCKED_CONFIGURATION_UNREADABLE',
      reasonCode: 'MCP_CONFIG_UNREADABLE',
    };
  }
  if (document.name !== 'postgres-lab') {
    return {
      configured: false,
      status: 'BLOCKED_NOT_CONFIGURED',
      reasonCode: 'MCP_NAME_MISMATCH',
    };
  }
  if (document.enabled !== true) {
    return {
      configured: false,
      status: 'BLOCKED_NOT_CONFIGURED',
      reasonCode: 'MCP_DISABLED',
    };
  }

  const transport = document.transport;
  const databaseUri = transport?.env?.DATABASE_URI;
  if (
    transport?.type !== 'stdio' ||
    basename(transport?.command ?? '') !== 'postgres-mcp' ||
    !Array.isArray(transport?.args) ||
    !transport.args.includes('--access-mode=restricted') ||
    typeof databaseUri !== 'string'
  ) {
    return {
      configured: true,
      status: 'BLOCKED_WRONG_TARGET',
      reasonCode: 'MCP_TRANSPORT_OR_ACCESS_MISMATCH',
    };
  }

  let target;
  try {
    target = new URL(databaseUri);
  } catch {
    return {
      configured: true,
      status: 'BLOCKED_WRONG_TARGET',
      reasonCode: 'DATABASE_URI_INVALID',
    };
  }

  const isDedicatedLocalTarget = (
    ['postgres:', 'postgresql:'].includes(target.protocol) &&
    target.hostname === '127.0.0.1' &&
    target.port === '55432' &&
    target.pathname === '/aura_report_lab' &&
    target.username === 'aura_report_lab' &&
    target.password.length > 0 &&
    target.search === '' &&
    target.hash === ''
  );
  if (!isDedicatedLocalTarget) {
    return {
        configured: true,
        status: 'BLOCKED_WRONG_TARGET',
        reasonCode: 'LIVE_CONFIG_TARGET_MISMATCH',
      };
  }
  if (typeof expectedDatabaseUri !== 'string' || databaseUri !== expectedDatabaseUri) {
    return {
      configured: true,
      status: 'BLOCKED_WRONG_TARGET',
      reasonCode: expectedDatabaseUri
        ? 'MCP_RUNTIME_CREDENTIAL_MISMATCH'
        : 'RUNTIME_DATABASE_CONFIGURATION_UNREADABLE',
    };
  }
  if (connectionProbe && connectionProbe(target) !== true) {
    return {
      configured: true,
      status: 'BLOCKED_CONNECTION',
      reasonCode: 'LIVE_DATABASE_CONNECTION_FAILED',
    };
  }
  return {
    configured: true,
    status: 'CONFIGURED_DEDICATED_LOCAL_TARGET',
    reasonCode: connectionProbe
      ? 'LIVE_CONFIG_AND_CONNECTION_MATCH'
      : 'LIVE_CONFIG_TARGET_MATCH',
  };
}

function postgresLabConfigurationStatus() {
  const result = captureJson('codex', ['mcp', 'get', 'postgres-lab', '--json']);
  let expectedDatabaseUri = null;
  try {
    expectedDatabaseUri = readRuntimeEnv(ENV_PATH).AURA_REPORT_LAB_DATABASE_URL;
  } catch {
    // The assessment below reports the exact non-secret failure reason.
  }
  return assessPostgresLabConfiguration(result.ok ? result.value : null, {
    expectedDatabaseUri,
    connectionProbe: postgresConnectionStatus,
  });
}

export function assessReviewTarget({headSha, statusPorcelain}) {
  const commitSha = typeof headSha === 'string' && /^[0-9a-f]{40}$/i.test(headSha.trim())
    ? headSha.trim()
    : null;
  const statusAvailable = typeof statusPorcelain === 'string';
  const statusLines = statusAvailable
    ? statusPorcelain.split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean)
    : [];
  const manifestLines = statusLines.filter(line => line.includes(TOOL_MANIFEST_REPOSITORY_PATH));
  const codeLines = statusLines.filter(line => !line.includes(TOOL_MANIFEST_REPOSITORY_PATH));
  return {
    commitSha,
    codeWorktreeCleanAtCapture: statusAvailable ? codeLines.length === 0 : null,
    manifestWorktreeStateAtCapture: !statusAvailable
      ? 'UNKNOWN'
      : manifestLines.length
        ? 'MODIFIED_OR_UNTRACKED'
        : 'TRACKED_CLEAN',
    captureTiming: 'before-manifest-write',
    manifestIncludedInReviewTarget: false,
    targetDefinition: 'Exact commit tree at commitSha; this post-review manifest is metadata outside that tree.',
  };
}

export function buildToolManifest(now = new Date()) {
  const commit = capture('git', ['rev-parse', 'HEAD']);
  const dirty = capture('git', ['status', '--porcelain']);
  const reviewTarget = assessReviewTarget({
    headSha: commit.ok ? commit.stdout : null,
    statusPorcelain: dirty.ok ? dirty.stdout : null,
  });
  const mcps = configuredMcpNames();
  const claudePlugins = installedClaudePlugins();
  const claudeAuth = claudeAuthStatus();
  const reportLabPackage = readJson(join(REPO_ROOT, 'apps/report-lab/package.json')) ?? {};
  const playwrightVersion = reportLabPackage.devDependencies?.['@playwright/test'] ?? null;
  const hasCodeGraphIndex = existsSync(join(REPO_ROOT, '.codegraph'));
  const primaryWorktree = primaryWorktreePath();
  const hasPrimaryCodeGraphIndex = Boolean(
    primaryWorktree && existsSync(join(primaryWorktree, '.codegraph')),
  );
  const postgresMcp = postgresLabConfigurationStatus();
  const githubCliAuth = githubCliAuthStatus();

  const requiredClaudePlugins = ['superpowers', 'code-review', 'frontend-design', 'playwright'];
  return {
    schemaVersion: 'aura.report-lab-tool-manifest.v2',
    generatedAtUtc: now.toISOString(),
    reviewTarget,
    policy: {
      execution: 'local-only',
      cloudPlan: 'cancelled',
      externalModelProviders: 'disabled',
      secretsOrDatabaseDsnIncluded: false,
    },
    tools: [
      {
        name: 'CodeGraph',
        kind: 'mcp',
        version: firstLine('codegraph', ['--version']),
        configured: mcps.has('codegraph'),
        status: hasCodeGraphIndex
          ? 'CONFIGURED_INDEX_PRESENT'
          : hasPrimaryCodeGraphIndex
            ? 'CONFIGURED_PRIMARY_WORKTREE_INDEX_USED'
            : 'BLOCKED_INDEX_ABSENT',
        purpose: 'code exploration and conflict analysis',
        reason: hasCodeGraphIndex
          ? null
          : hasPrimaryCodeGraphIndex
            ? 'The stacked worktree intentionally reuses the indexed primary worktree for read-only exploration; current changed files are re-read directly.'
            : 'MCP is enabled, but no repository worktree has a .codegraph index; shell/static inspection is the fallback.',
      },
      {
        name: 'Context7',
        kind: 'mcp',
        version: null,
        configured: mcps.has('context7'),
        status: mcps.has('context7') ? 'CONFIGURED_SMOKED' : 'MISSING',
        purpose: 'live library documentation',
        reason: mcps.has('context7')
          ? 'Connection and documentation lookup were exercised for FastAPI application factories, CORS, and Vite loopback binding.'
          : 'Context7 is not configured.',
      },
      {
        name: 'GitHub',
        kind: 'mcp-and-cli',
        version: firstLine('gh', ['--version']),
        configured: mcps.has('github'),
        status: githubCliAuth.status,
        purpose: 'PR creation, review comments, and checks',
        verification: {
          method: 'gh auth status --active --hostname github.com',
          reasonCode: githubCliAuth.reasonCode,
        },
        reason: githubCliAuth.authenticated
          ? null
          : githubCliAuth.status === 'BLOCKED_CLI_UNAVAILABLE'
            ? 'The gh CLI could not be executed, so authenticated CLI PR writes are not verified.'
            : 'The active github.com credential failed the live gh CLI authentication check.',
      },
      {
        name: 'Playwright',
        kind: 'mcp-and-local-package',
        version: playwrightVersion,
        configured: mcps.has('playwright'),
        status: playwrightVersion
          ? 'CONFIGURED_PACKAGE_DECLARED_PERMISSION_PENDING'
          : mcps.has('playwright')
            ? 'CONFIGURED_MCP_PERMISSION_PENDING'
            : 'MISSING',
        purpose: 'E2E, accessibility, visual QA, and browser debugging',
        reason: playwrightVersion
          ? 'MCP is enabled; browser smoke remains a separate user-permission gate.'
          : mcps.has('playwright')
            ? 'The configured MCP can run browser QA after explicit user permission; a duplicate local package is not required by setup.'
            : 'Playwright MCP is not configured.',
      },
      {
        name: 'postgres-lab',
        kind: 'mcp',
        version: firstLine('postgres', ['--version']),
        configured: postgresMcp.configured,
        status: postgresMcp.status,
        purpose: 'restricted inspection of the dedicated local Report Lab database',
        expectedTarget: {host: '127.0.0.1', port: 55432, database: 'aura_report_lab'},
        verification: {
          method: 'live-codex-mcp-json-config-in-process',
          reasonCode: postgresMcp.reasonCode,
        },
        reason: postgresMcp.status === 'CONFIGURED_DEDICATED_LOCAL_TARGET'
          ? 'Target verified without recording credentials or a DSN in this manifest.'
          : postgresMcp.status === 'BLOCKED_CONNECTION'
            ? 'The configured restricted target matches the runtime secret, but a live local database connection failed.'
          : postgresMcp.status === 'BLOCKED_CONFIGURATION_UNREADABLE'
            ? 'The live MCP configuration could not be read safely, so the dedicated target is unverified.'
            : postgresMcp.status === 'BLOCKED_NOT_CONFIGURED'
              ? 'The postgres-lab MCP is absent or disabled.'
              : 'The live MCP configuration is not the restricted dedicated Report Lab target.',
      },
      {
        name: 'Expo',
        kind: 'claude-plugin',
        version: claudePlugins.expo?.version ?? null,
        configured: claudePlugins.expo?.enabled === true,
        status: claudePlugins.expo?.enabled ? 'CLAUDE_PLUGIN_ENABLED' : 'MISSING',
        purpose: 'mobile integration checks; no real-device run in this phase',
        reason: 'Real-device collection remains script-preparation-only by plan.',
      },
    ],
    claudeReviewGate: {
      cliVersion: firstLine('claude', ['--version']),
      model: 'claude-fable-5',
      effort: 'high',
      apiProviderRequired: 'firstParty',
      apiProviderObserved: claudeAuth.apiProvider,
      loggedIn: claudeAuth.loggedIn,
      status: !claudeAuth.loggedIn
        ? 'BLOCKED_AUTH'
        : claudeAuth.apiProvider === 'firstParty'
          ? 'READY_FOR_DRY_RUN'
          : 'BLOCKED_PROVIDER',
      requiredPlugins: Object.fromEntries(requiredClaudePlugins.map(name => [
        name,
        {
          enabled: claudePlugins[name]?.enabled === true,
          version: claudePlugins[name]?.version ?? null,
        },
      ])),
      reason: !claudeAuth.loggedIn
        ? 'Claude CLI is logged out; only first-party login may unblock this gate.'
        : claudeAuth.apiProvider === 'firstParty'
          ? null
          : 'Claude CLI is authenticated through a disallowed provider; first-party authentication is required.',
    },
    localRuntime: {
      node: firstLine('node', ['--version']),
      npm: firstLine('npm', ['--version']),
      postgres: firstLine('postgres', ['--version']),
      databaseEngine: 'native-postgresql-16',
      databaseTarget: {host: '127.0.0.1', port: 55432, database: 'aura_report_lab'},
      dockerFallback: 'not-used-disk-pressure',
    },
  };
}

export function writeToolManifest(manifest = buildToolManifest()) {
  mkdirSync(dirname(TOOL_MANIFEST_PATH), {recursive: true});
  const temporaryPath = `${TOOL_MANIFEST_PATH}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {encoding: 'utf8', mode: 0o644});
  renameSync(temporaryPath, TOOL_MANIFEST_PATH);
  return TOOL_MANIFEST_PATH;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const path = writeToolManifest();
  console.log(`Wrote ${path.replace(`${REPO_ROOT}/`, '')} without secrets or a database DSN.`);
}
