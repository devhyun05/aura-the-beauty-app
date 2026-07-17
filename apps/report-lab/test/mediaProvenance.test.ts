import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

import {SYNTHETIC_FACE_REPORT_FIXTURE} from '@aura/face-report-contract/syntheticFixture';
import {FIXTURE_CATALOG} from '../src/api/reportLabClient.ts';

const UNAVAILABLE_MEDIA_ID = 'report-lab-image-unavailable-v1';

function collectMedia(value: unknown): Array<{assetId: string; alt: string}> {
  if (Array.isArray(value)) {
    return value.flatMap(collectMedia);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const record = value as Record<string, unknown>;
  const current =
    typeof record.assetId === 'string' && typeof record.alt === 'string'
      ? [{assetId: record.assetId, alt: record.alt}]
      : [];
  return [...current, ...Object.values(record).flatMap(collectMedia)];
}

function collectAppFiles(root: string): string[] {
  const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage', '.npm-cache']);
  return readdirSync(root, {withFileTypes: true}).flatMap(entry => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? collectAppFiles(path) : [path];
  });
}

test('Report Lab ships an explicit no-image state and no bundled visual media', () => {
  const appRoot = fileURLToPath(new URL('../', import.meta.url));
  const assetsRoot = fileURLToPath(new URL('../src/assets/', import.meta.url));
  const manifest = JSON.parse(
    readFileSync(new URL('../src/assets/report-lab-manifest.json', import.meta.url), 'utf8'),
  ) as {
    assets: unknown[];
    unavailableMediaStates: Array<{stateId: string}>;
  };

  assert.deepEqual(manifest.assets, []);
  assert.deepEqual(
    manifest.unavailableMediaStates.map(state => state.stateId),
    [UNAVAILABLE_MEDIA_ID],
  );
  assert.deepEqual(
    readdirSync(assetsRoot).filter(name => /\.(?:avif|jpe?g|png|webp)$/i.test(name)),
    [],
  );

  const files = collectAppFiles(appRoot);
  const prohibitedMediaExtensions = new Set([
    '.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp',
  ]);
  assert.deepEqual(
    files.filter(path => prohibitedMediaExtensions.has(extname(path).toLowerCase())),
    [],
  );
  const embeddedImagePattern = new RegExp(`data:${'image'}/`, 'i');
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsx', '.ts', '.tsx']);
  assert.deepEqual(
    files.filter(path => (
      textExtensions.has(extname(path).toLowerCase()) &&
      embeddedImagePattern.test(readFileSync(path, 'utf8'))
    )),
    [],
  );

  const sourceFiles = files.filter(path => (
    path.includes('/src/') ||
    path.includes('/public/') ||
    /\/(?:index\.html|vite\.config\.[cm]?[jt]s)$/.test(path)
  ));
  const prohibitedSourcePatterns = [
    new RegExp(`https?:\\/\\/[^\\s"')]+\\.(?:${'avif|bmp|gif|ico|jpe?g|png|svg|webp'})(?:[?#]|$)`, 'i'),
    new RegExp(`${'blob'}:`, 'i'),
    new RegExp(`${'src'}\\s*=\\s*(?:\\{\\s*)?["'\`]https?:\\/\\/`, 'i'),
  ];
  assert.deepEqual(
    sourceFiles.filter(path => {
      const source = readFileSync(path, 'utf8');
      return (
        prohibitedSourcePatterns.some(pattern => pattern.test(source)) ||
        (extname(path).toLowerCase() === '.css' && new RegExp(`${'url'}\\s*\\(`, 'i').test(source))
      );
    }),
    [],
  );
});

test('every fixture media field points to the honest unavailable state', () => {
  const media = collectMedia(SYNTHETIC_FACE_REPORT_FIXTURE);

  assert.equal(media.length, 10);
  for (const item of media) {
    assert.equal(item.assetId, UNAVAILABLE_MEDIA_ID);
    assert.match(item.alt, /표시하지 않음/);
  }
  assert.equal(
    FIXTURE_CATALOG[0]?.provenance,
    '결정적 numeric-free JSON · 승인된 출처의 이미지가 없어 미포함',
  );
});
