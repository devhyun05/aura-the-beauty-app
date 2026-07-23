import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const outputDirectory = mkdtempSync(join(tmpdir(), 'aura-cognito-redirect-contract-'));
const tscPath = join(repositoryRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const mobileSourceDirectory = join(repositoryRoot, 'apps/mobile/src');
const serviceDirectory = join(
  mobileSourceDirectory,
  'features/auth/services',
);
const sharedServiceDirectory = join(
  mobileSourceDirectory,
  'shared/services',
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
  '--jsx',
  'react-jsx',
  '--lib',
  'ES2020,DOM',
  '--types',
  'node',
  '--typeRoots',
  join(repositoryRoot, 'apps/mobile/node_modules/@types'),
  '--rootDir',
  mobileSourceDirectory,
  '--outDir',
  outputDirectory,
  join(serviceDirectory, 'cognitoRedirectUri.test.ts'),
  join(serviceDirectory, 'cognitoRedirectUri.ts'),
  join(serviceDirectory, 'authRefreshPolicy.ts'),
  join(serviceDirectory, 'authRefreshPolicy.test.ts'),
  join(sharedServiceDirectory, 'backendApi.ts'),
  join(sharedServiceDirectory, 'backendApiAuthRefresh.test.ts'),
]);

run(process.execPath, [
  join(outputDirectory, 'features/auth/services/cognitoRedirectUri.test.js'),
]);
run(process.execPath, [
  join(outputDirectory, 'features/auth/services/authRefreshPolicy.test.js'),
]);

run(process.execPath, [
  join(outputDirectory, 'shared/services/backendApiAuthRefresh.test.js'),
]);

const authContextSource = readFileSync(
  join(serviceDirectory, 'authSessionContext.tsx'),
  'utf8',
);
if (
  !authContextSource.includes('const refreshSessionIfNeeded = useCallback(async (force = false) =>') ||
  !authContextSource.includes('setBackendAuthTokenRefreshProvider(async (force = false) =>') ||
  !authContextSource.includes('await refreshSessionIfNeeded(force);') ||
  !authContextSource.includes('sessionRef.current !== currentSession') ||
  !authContextSource.includes('session-refresh:retryable-error') ||
  !authContextSource.includes('session-restore:retryable-error') ||
  !authContextSource.includes('const didRefresh = await refreshSessionIfNeeded(force);') ||
  !authContextSource.includes('if (!didRefresh && sessionRef.current)') ||
  !authContextSource.includes('throw new AuthRefreshTemporarilyUnavailableError()') ||
  !authContextSource.includes('restoredSession = storedSession;') ||
  !authContextSource.includes('setBackendAuthTokenRefreshProvider(null)')
) {
  throw new Error(
    'Auth session context must support forced refresh, reject stale refreshes, and clean up.',
  );
}

const authServiceSource = readFileSync(
  join(serviceDirectory, 'authService.ts'),
  'utf8',
);
const refreshFunctionSource = authServiceSource.slice(
  authServiceSource.indexOf('export async function refreshAuthSession'),
  authServiceSource.indexOf('function decodeBase64UrlJson', authServiceSource.indexOf('export async function refreshAuthSession')),
);
if (
  !refreshFunctionSource.includes('interpretCognitoRefreshResponse(response.status, await response.json())') ||
  refreshFunctionSource.includes('if (!response.ok || body.error || !body.access_token)') ||
  refreshFunctionSource.includes('} catch {\n    return null;')
) {
  throw new Error(
    'Cognito refresh must clear only definitively invalid credentials and throw retryable failures.',
  );
}
const backendApiSource = readFileSync(
  join(sharedServiceDirectory, 'backendApi.ts'),
  'utf8',
);
const forcedRefreshCallCount =
  backendApiSource.match(/authTokenRefreshProvider\(true\)/g)?.length ?? 0;
if (
  !backendApiSource.includes('authTokenRefreshProvider(false)') ||
  !backendApiSource.includes('AUTH_REFRESH_TEMPORARILY_UNAVAILABLE') ||
  !backendApiSource.includes('throw toBackendAuthRefreshError(error)') ||
  !backendApiSource.includes('response.status === 401 && authToken === undefined') ||
  forcedRefreshCallCount !== 1
) {
  throw new Error(
    'Backend API must preflight refresh and force exactly one implicit-auth retry after 401.',
  );
}

console.log('Cognito redirect and backend auth-refresh contracts verified.');
