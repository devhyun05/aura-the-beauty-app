import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const mobileRoot = path.join(repositoryRoot, 'apps/mobile');
const requireFromMobile = createRequire(path.join(mobileRoot, 'package.json'));
const plistModule = requireFromMobile('@expo/plist');
const plist = plistModule.default ?? plistModule;

const appJsonPath = path.join(mobileRoot, 'app.json');
const infoPlistPath = path.join(mobileRoot, 'ios/AURA/Info.plist');
const [appJsonSource, infoPlistSource] = await Promise.all([
  readFile(appJsonPath, 'utf8'),
  readFile(infoPlistPath, 'utf8'),
]);

const appConfig = JSON.parse(appJsonSource).expo;
const info = plist.parse(infoPlistSource);

function pluginOptions(pluginName) {
  const entry = appConfig.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === pluginName,
  );
  return entry?.[1] ?? {};
}

function requireEqual(label, actual, expected) {
  if (!expected || actual !== expected) {
    throw new Error(`${label} must match app.json. Expected ${JSON.stringify(expected)}.`);
  }
}

const camera = pluginOptions('expo-camera');
const imagePicker = pluginOptions('expo-image-picker');
const mediaLibrary = pluginOptions('expo-media-library');
const location = pluginOptions('expo-location');

requireEqual('NSCameraUsageDescription', info.NSCameraUsageDescription, camera.cameraPermission);
requireEqual(
  'NSPhotoLibraryUsageDescription',
  info.NSPhotoLibraryUsageDescription,
  imagePicker.photosPermission,
);
requireEqual(
  'NSPhotoLibraryAddUsageDescription',
  info.NSPhotoLibraryAddUsageDescription,
  mediaLibrary.savePhotosPermission,
);
requireEqual(
  'NSLocationWhenInUseUsageDescription',
  info.NSLocationWhenInUseUsageDescription,
  location.locationWhenInUsePermission,
);

const urlSchemes = (info.CFBundleURLTypes ?? []).flatMap(
  (entry) => entry.CFBundleURLSchemes ?? [],
);
if (!urlSchemes.includes(appConfig.scheme)) {
  throw new Error(`Info.plist must register the ${appConfig.scheme} URL scheme.`);
}
if (info.NSAppTransportSecurity?.NSAllowsArbitraryLoads !== false) {
  throw new Error('Info.plist must keep NSAllowsArbitraryLoads disabled.');
}

console.log('iOS privacy descriptions, OAuth URL scheme, and transport security verified.');
