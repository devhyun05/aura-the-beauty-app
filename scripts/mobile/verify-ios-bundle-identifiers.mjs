import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const appJsonPath = path.join(repositoryRoot, 'apps/mobile/app.json');
const xcodeProjectPath = path.join(
  repositoryRoot,
  'apps/mobile/ios/AURA.xcodeproj/project.pbxproj',
);
const entitlementsPath = path.join(
  repositoryRoot,
  'apps/mobile/ios/AURA/AURA.entitlements',
);

const expectedBundleId = 'com.aurathebeautyapp.mobile';
const expectedTeamId = 'BRA7W3G4QS';

const [appJsonSource, xcodeProject, entitlements] = await Promise.all([
  readFile(appJsonPath, 'utf8'),
  readFile(xcodeProjectPath, 'utf8'),
  readFile(entitlementsPath, 'utf8'),
]);

const appConfig = JSON.parse(appJsonSource);
const expoBundleId = appConfig?.expo?.ios?.bundleIdentifier;

if (expoBundleId !== expectedBundleId) {
  throw new Error(
    `Expo bundle identifier must be ${expectedBundleId}; received ${expoBundleId ?? 'undefined'}.`,
  );
}

if (appConfig?.expo?.ios?.appleTeamId !== expectedTeamId) {
  throw new Error(
    `Expo Apple team ID must be ${expectedTeamId}; received ${appConfig?.expo?.ios?.appleTeamId ?? 'undefined'}.`,
  );
}

if (appConfig?.expo?.ios?.usesAppleSignIn !== true) {
  throw new Error('Expo ios.usesAppleSignIn must be enabled.');
}

const configuredBundleIds = [
  ...xcodeProject.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
].map((match) => match[1]);

const expectedBundleIds = [expectedBundleId, expectedBundleId];

if (
  configuredBundleIds.length !== expectedBundleIds.length ||
  configuredBundleIds.some((bundleId, index) => bundleId !== expectedBundleIds[index])
) {
  throw new Error(
    `Xcode bundle identifiers must both be ${expectedBundleId}; received ${configuredBundleIds.join(', ') || 'none'}.`,
  );
}

const configuredTeamIds = [
  ...xcodeProject.matchAll(/DEVELOPMENT_TEAM = ([^;]+);/g),
].map((match) => match[1]);

if (
  configuredTeamIds.length !== 2 ||
  configuredTeamIds.some((teamId) => teamId !== expectedTeamId)
) {
  throw new Error(
    `Xcode development teams must both be ${expectedTeamId}; received ${configuredTeamIds.join(', ') || 'none'}.`,
  );
}

if (
  !entitlements.includes('<key>com.apple.developer.applesignin</key>') ||
  !entitlements.includes('<string>Default</string>')
) {
  throw new Error('Sign in with Apple entitlement must be configured with Default access.');
}

console.log(
  `iOS Apple login identifiers verified: Bundle ID=${expectedBundleId}, Team ID=${expectedTeamId}.`,
);
