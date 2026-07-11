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

const productionBundleId = 'com.aura.mobile';
const developmentBundleId = 'com.aiarmakeupguides.mobile';

const [appJsonSource, xcodeProject] = await Promise.all([
  readFile(appJsonPath, 'utf8'),
  readFile(xcodeProjectPath, 'utf8'),
]);

const appConfig = JSON.parse(appJsonSource);
const expoBundleId = appConfig?.expo?.ios?.bundleIdentifier;

if (expoBundleId !== developmentBundleId) {
  throw new Error(
    `Expo development bundle identifier must be ${developmentBundleId}; received ${expoBundleId ?? 'undefined'}.`,
  );
}

const configuredBundleIds = [
  ...xcodeProject.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
].map((match) => match[1]);

const expectedBundleIds = [developmentBundleId, productionBundleId];

if (
  configuredBundleIds.length !== expectedBundleIds.length ||
  configuredBundleIds.some((bundleId, index) => bundleId !== expectedBundleIds[index])
) {
  throw new Error(
    `Xcode bundle identifiers must be Debug=${developmentBundleId} and Release=${productionBundleId}; received ${configuredBundleIds.join(', ') || 'none'}.`,
  );
}

console.log(
  `iOS bundle identifiers verified: Debug=${developmentBundleId}, Release=${productionBundleId}.`,
);
