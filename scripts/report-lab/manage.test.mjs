import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

import {
  assessGithubCliAuth,
  assessPostgresLabConfiguration,
  assessReviewTarget,
} from './generate-tool-manifest.mjs';

import {
  FIXTURE_PRINCIPAL_ID,
  FRONTEND_ORIGIN,
  REPO_ROOT,
  RUNTIME_ROOT,
  ReportLabLifecycleError,
  assertComposeContract,
  assertRuntimePath,
  buildDatabaseUrl,
  buildRuntimeEnv,
  formatEnvFile,
  makeTestProjectName,
  managedProcessFingerprint,
  parseEnvFile,
  redactSecrets,
  resolveComposeCommand,
  validateRuntimeEnv,
} from './manage.mjs';

test('generated runtime env is loopback-only and disables every provider', () => {
  const runtimeEnv = buildRuntimeEnv({
    password: 'abcdefghijklmnopqrstuvwxyzABCDE_1234567890-',
    port: 55432,
  });
  assert.equal(runtimeEnv.LAB_MODE, 'true');
  assert.equal(runtimeEnv.AURA_REPORT_LAB_DB_ENGINE, 'native');
  assert.equal(runtimeEnv.AUTH_REQUIRED, 'false');
  assert.equal(runtimeEnv.AI_PROVIDER, 'disabled');
  assert.equal(runtimeEnv.REPORT_LAB_MODEL_PROVIDER, 'disabled');
  assert.equal(runtimeEnv.IMAGE_GENERATION_PROVIDER, 'disabled');
  assert.equal(runtimeEnv.OPENAI_ENABLED, 'false');
  assert.equal(runtimeEnv.CORS_ALLOW_ORIGINS, FRONTEND_ORIGIN);
  assert.equal(runtimeEnv.REPORT_LAB_FIXTURE_PRINCIPAL_ID, FIXTURE_PRINCIPAL_ID);
  assert.match(runtimeEnv.AURA_REPORT_LAB_DATABASE_URL, /@127\.0\.0\.1:55432\/aura_report_lab$/);
  assert.deepEqual(validateRuntimeEnv(runtimeEnv), runtimeEnv);
});

test('runtime env round-trips without shell quoting or duplicate keys', () => {
  const source = formatEnvFile({A_KEY: 'safe-value_1', EMPTY: ''});
  assert.deepEqual(parseEnvFile(source), {A_KEY: 'safe-value_1', EMPTY: ''});
  assert.throws(() => parseEnvFile('A_KEY=first\nA_KEY=second\n'), /Duplicate env key/);
  assert.throws(() => parseEnvFile('unsafe-key=value\n'), /Unsafe env entry/);
});

test('database URL rejects unsafe passwords and non-local ports', () => {
  assert.throws(() => buildDatabaseUrl('short', 55432), ReportLabLifecycleError);
  assert.throws(
    () => buildDatabaseUrl('abcdefghijklmnopqrstuvwxyzABCDE_1234567890-', 80),
    /outside the allowed range/,
  );
});

test('secret redaction removes passwords and complete DSNs', () => {
  const password = 'abcdefghijklmnopqrstuvwxyzABCDE_1234567890-';
  const dsn = buildDatabaseUrl(password, 55432);
  const rendered = redactSecrets(`password=${password} dsn=${dsn}`, {
    AURA_REPORT_LAB_DB_PASSWORD: password,
    AURA_REPORT_LAB_DATABASE_URL: dsn,
  });
  assert.equal(rendered.includes(password), false);
  assert.equal(rendered.includes(dsn), false);
  assert.match(rendered, /\[REDACTED\]/);
});

test('compose contract is loopback-only, pgvector-backed, and project-isolatable', () => {
  assert.equal(assertComposeContract(), true);
  assert.throws(
    () => assertComposeContract(`${readFileSync(join(REPO_ROOT, 'infra/report-lab/docker-compose.yml'), 'utf8')}\ncontainer_name: bad`),
    /must not use container_name/,
  );
});

test('compose frontend prefers plugin and safely falls back to standalone binary', () => {
  const plugin = resolveComposeCommand((command, args) => ({
    ok: command === 'docker' && args.join(' ') === 'compose version',
  }));
  assert.deepEqual(plugin, {command: 'docker', prefix: ['compose']});
  const standalone = resolveComposeCommand(command => ({ok: command === 'docker-compose'}));
  assert.deepEqual(standalone, {command: 'docker-compose', prefix: []});
});

test('managed process fingerprints and test project names are strict', () => {
  const instanceId = '00000000-0000-4000-8000-000000000027';
  assert.equal(
    managedProcessFingerprint('backend', instanceId),
    `manage.mjs _serve backend ${instanceId}`,
  );
  assert.throws(() => managedProcessFingerprint('unknown', instanceId), /Invalid managed process/);
  assert.match(makeTestProjectName(1234, 'abc123'), /^aura-report-lab-test-1234-abc123$/);
});

test('native PostgreSQL data deletion is constrained to the gitignored runtime root', () => {
  assert.equal(
    assertRuntimePath(join(RUNTIME_ROOT, 'report-lab/pgdata')),
    join(RUNTIME_ROOT, 'report-lab/pgdata'),
  );
  assert.throws(() => assertRuntimePath(join(REPO_ROOT, 'services/backend')), /outside/);
  assert.throws(() => assertRuntimePath(RUNTIME_ROOT), /outside/);
});

test('root package exposes all lifecycle commands through the single manager', () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  for (const command of ['setup', 'dev', 'test', 'stop', 'down', 'status']) {
    assert.equal(
      packageJson.scripts[`report-lab:${command}`],
      `node scripts/report-lab/manage.mjs ${command}`,
    );
  }
  assert.equal(
    packageJson.scripts['report-lab:tool-manifest'],
    'node scripts/report-lab/generate-tool-manifest.mjs',
  );
});

test('backend supervisor ignores proxy headers and test command runs the real app tests', () => {
  const source = readFileSync(join(REPO_ROOT, 'scripts/report-lab/manage.mjs'), 'utf8');
  assert.match(source, /'--no-proxy-headers'/);
  assert.match(source, /\['typecheck', 'test', 'build'\]/);
});

test('tool manifest is local-only, blocker-honest, and contains no secret or DSN', () => {
  const manifestPath = join(REPO_ROOT, 'artifacts/report-lab/tool-manifest.json');
  const source = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(source);

  assert.equal(manifest.schemaVersion, 'aura.report-lab-tool-manifest.v2');
  assert.match(manifest.reviewTarget.commitSha, /^[0-9a-f]{40}$/);
  assert.equal(
    typeof manifest.reviewTarget.codeWorktreeCleanAtCapture,
    'boolean',
  );
  assert.equal(manifest.reviewTarget.captureTiming, 'before-manifest-write');
  assert.equal(manifest.reviewTarget.manifestIncludedInReviewTarget, false);
  assert.equal(Object.hasOwn(manifest, 'dirty'), false);
  assert.equal(Object.hasOwn(manifest, 'commitSha'), false);
  assert.equal(manifest.policy.execution, 'local-only');
  assert.equal(manifest.policy.cloudPlan, 'cancelled');
  assert.equal(manifest.policy.externalModelProviders, 'disabled');
  assert.equal(manifest.policy.secretsOrDatabaseDsnIncluded, false);
  assert.equal(manifest.claudeReviewGate.model, 'claude-fable-5');
  assert.equal(manifest.claudeReviewGate.effort, 'high');
  assert.equal(typeof manifest.claudeReviewGate.loggedIn, 'boolean');
  const postgresTool = manifest.tools.find(tool => tool.name === 'postgres-lab');
  assert.deepEqual(postgresTool.expectedTarget, {
    host: '127.0.0.1',
    port: 55432,
    database: 'aura_report_lab',
  });
  assert.match(
    postgresTool.status,
    /^(?:BLOCKED_CONFIGURATION_UNREADABLE|BLOCKED_NOT_CONFIGURED|BLOCKED_WRONG_TARGET|BLOCKED_CONNECTION|CONFIGURED_DEDICATED_LOCAL_TARGET)$/,
  );
  assert.equal(typeof postgresTool.verification.reasonCode, 'string');
  const githubTool = manifest.tools.find(tool => tool.name === 'GitHub');
  assert.match(
    githubTool.status,
    /^(?:BLOCKED_CLI_AUTH|BLOCKED_CLI_UNAVAILABLE|CONFIGURED_CLI_AUTHENTICATED)$/,
  );
  assert.equal(typeof githubTool.verification.reasonCode, 'string');
  assert.equal(manifest.tools.some(tool => /aws|bedrock/i.test(tool.name)), false);
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(source, /AURA_REPORT_LAB_DB_PASSWORD|DATABASE_URI/i);
  assert.doesNotMatch(source, /gho_[a-zA-Z0-9]+/);
});

test('review target separates the exact code commit from post-review manifest metadata', () => {
  const clean = assessReviewTarget({
    headSha: 'a'.repeat(40),
    statusPorcelain: ' M artifacts/report-lab/tool-manifest.json\n',
  });
  assert.equal(clean.commitSha, 'a'.repeat(40));
  assert.equal(clean.codeWorktreeCleanAtCapture, true);
  assert.equal(clean.manifestWorktreeStateAtCapture, 'MODIFIED_OR_UNTRACKED');
  assert.equal(clean.manifestIncludedInReviewTarget, false);

  const dirty = assessReviewTarget({
    headSha: 'b'.repeat(40),
    statusPorcelain: ' M apps/report-lab/src/App.tsx\n M artifacts/report-lab/tool-manifest.json\n',
  });
  assert.equal(dirty.codeWorktreeCleanAtCapture, false);
});

test('GitHub live-check result is classified without retaining command output', () => {
  assert.deepEqual(assessGithubCliAuth({ok: true, unavailable: false}), {
    authenticated: true,
    status: 'CONFIGURED_CLI_AUTHENTICATED',
    reasonCode: 'LIVE_ACTIVE_AUTH_OK',
  });
  assert.deepEqual(assessGithubCliAuth({ok: false, unavailable: false}), {
    authenticated: false,
    status: 'BLOCKED_CLI_AUTH',
    reasonCode: 'LIVE_ACTIVE_AUTH_FAILED',
  });
  assert.deepEqual(assessGithubCliAuth({ok: false, unavailable: true}), {
    authenticated: false,
    status: 'BLOCKED_CLI_UNAVAILABLE',
    reasonCode: 'GH_CLI_UNAVAILABLE',
  });
});

test('postgres-lab live config verifies exact restricted loopback target without retaining DSN', () => {
  const credential = 'credential-placeholder-never-rendered';
  const document = {
    name: 'postgres-lab',
    enabled: true,
    transport: {
      type: 'stdio',
      command: '/local/bin/postgres-mcp',
      args: ['--access-mode=restricted'],
      env: {
        DATABASE_URI: `postgresql://${'aura_report_lab'}:${credential}@${'127.0.0.1'}:${55432}/${'aura_report_lab'}`,
      },
    },
  };
  const expectedDatabaseUri = document.transport.env.DATABASE_URI;
  const assessment = assessPostgresLabConfiguration(document, {
    expectedDatabaseUri,
    connectionProbe: () => true,
  });
  assert.deepEqual(assessment, {
    configured: true,
    status: 'CONFIGURED_DEDICATED_LOCAL_TARGET',
    reasonCode: 'LIVE_CONFIG_AND_CONNECTION_MATCH',
  });
  assert.equal(JSON.stringify(assessment).includes(credential), false);
  assert.equal(JSON.stringify(assessment).includes('postgresql:'), false);

  document.transport.args = ['--access-mode=unrestricted'];
  assert.equal(
    assessPostgresLabConfiguration(document).reasonCode,
    'MCP_TRANSPORT_OR_ACCESS_MISMATCH',
  );
  document.transport.args = ['--access-mode=restricted'];
  assert.equal(
    assessPostgresLabConfiguration(document, {
      expectedDatabaseUri: expectedDatabaseUri.replace(credential, 'rotated-credential'),
      connectionProbe: () => true,
    }).reasonCode,
    'MCP_RUNTIME_CREDENTIAL_MISMATCH',
  );
  assert.equal(
    assessPostgresLabConfiguration(document, {
      expectedDatabaseUri,
      connectionProbe: () => false,
    }).reasonCode,
    'LIVE_DATABASE_CONNECTION_FAILED',
  );
  document.transport.env.DATABASE_URI = `postgresql://${'aura_report_lab'}:${credential}@${'127.0.0.1'}:${5432}/${'aura_report_lab'}`;
  assert.equal(
    assessPostgresLabConfiguration(document).reasonCode,
    'LIVE_CONFIG_TARGET_MISMATCH',
  );
});

test('runtime, build, npm cache, and coverage artifacts are ignored', () => {
  const gitignore = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
  for (const ignored of [
    '/.runtime/',
    'apps/report-lab/dist/',
    'apps/report-lab/.npm-cache/',
    'apps/report-lab/coverage/',
  ]) {
    assert.match(gitignore, new RegExp(ignored.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
