import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mobileSourceRoot = join(repoRoot, 'apps', 'mobile', 'src');
const readSource = relativePath =>
  readFileSync(join(mobileSourceRoot, relativePath), 'utf8');

const checklistSource = readSource(
  join('features', 'face-analysis', 'services', 'faceAnalysisCaptureChecklist.ts'),
);
const introSource = readSource(
  join('features', 'face-analysis', 'screens', 'FaceAnalysisIntroScreen.tsx'),
);
const tutorialSource = readSource(
  join('features', 'onboarding', 'screens', 'FaceCaptureTutorialScreen.tsx'),
);
const tutorialTestSource = readSource(
  join('features', 'onboarding', 'screens', 'FaceCaptureTutorialScreen.test.tsx'),
);
const introRouteSource = readSource(
  join('app', 'navigation', 'routes', 'faceAnalysisIntroRoute.tsx'),
);

const expectedItems = [
  {
    description: '얼굴에 큰 그림자나 색 번짐이 없도록 밝고 고른 빛에서 촬영해 주세요.',
    id: 'light',
    imageAccessibilityLabel:
      '왼쪽은 한쪽 그림자와 색 번짐이 있는 잘못된 예시, 오른쪽은 얼굴에 빛이 고르게 닿는 올바른 예시',
    title: '밝고 고른 빛에서',
  },
  {
    description: '앞머리를 옆으로 넘겨 헤어라인이 모두 보이게 해 주세요.',
    id: 'forehead',
    imageAccessibilityLabel:
      '왼쪽은 앞머리가 헤어라인을 가린 잘못된 예시, 오른쪽은 이마와 헤어라인이 모두 보이는 올바른 예시',
    title: '이마가 보이게',
  },
  {
    description: '옆머리를 귀 뒤로 넘겨 양쪽 귀와 얼굴 옆선이 보이게 해 주세요.',
    id: 'ears',
    imageAccessibilityLabel:
      '왼쪽은 옆머리가 귀를 가린 잘못된 예시, 오른쪽은 머리를 넘겨 양쪽 귀가 보이는 올바른 예시',
    title: '양쪽 귀가 보이게',
  },
  {
    description: '안경·모자·큰 귀걸이를 빼고 얼굴 경계를 가리지 않게 해 주세요.',
    id: 'accessory',
    imageAccessibilityLabel:
      '왼쪽은 안경과 모자와 큰 귀걸이를 착용한 잘못된 예시, 오른쪽은 액세서리를 모두 뺀 올바른 예시',
    title: '액세서리 없이',
  },
  {
    description: '웃거나 입을 벌리지 말고 입술에 힘을 뺀 편안한 표정을 지어 주세요.',
    id: 'expression',
    imageAccessibilityLabel:
      '왼쪽은 입을 벌리고 크게 웃는 잘못된 예시, 오른쪽은 입을 편하게 다문 올바른 예시',
    title: '표정은 편안하게',
  },
  {
    description: '턱끝이 잘리지 않도록 얼굴 전체를 화면 안에 담아 주세요.',
    id: 'framing',
    imageAccessibilityLabel:
      '왼쪽은 얼굴이 아래로 치우쳐 턱끝이 잘린 잘못된 예시, 오른쪽은 얼굴 전체와 턱끝이 화면 중앙에 들어온 올바른 예시',
    title: '턱끝까지 화면 안에',
  },
];

const itemPattern =
  /\{\s*description:\s*'([^']+)',\s*id:\s*'([^']+)',\s*imageAccessibilityLabel:\s*'([^']+)',\s*title:\s*'([^']+)',\s*\}/gs;
const actualItems = [...checklistSource.matchAll(itemPattern)].map(match => ({
  description: match[1],
  id: match[2],
  imageAccessibilityLabel: match[3],
  title: match[4],
}));
assert.deepEqual(actualItems, expectedItems, 'shared checklist must contain exactly the six approved items');

assert.match(introSource, /FACE_ANALYSIS_CAPTURE_CHECKLIST\.map/);
assert.match(tutorialSource, /FACE_ANALYSIS_CAPTURE_CHECKLIST\.map/);
assert.match(introRouteSource, /<FaceCaptureTutorialSheet/);
assert.doesNotMatch(introRouteSource, /Image\.prefetch|appAssetUri/);

const expectedAssets = {
  accessory: '04-no-accessories.png',
  ears: '03-ears-clear.png',
  expression: '05-neutral-expression.png',
  forehead: '02-forehead-clear.png',
  framing: '06-full-chin.png',
  light: '01-even-light.png',
};
const expectedTips = {
  accessory: '안경·모자·큰 귀걸이는 빼 주세요.',
  ears: '양쪽 귀와 얼굴 옆선이 모두 보여야 해요.',
  expression: '입을 다물고 입술에 힘을 빼 주세요.',
  forehead: '이마와 헤어라인이 모두 보여야 해요.',
  framing: '턱끝이 잘리지 않았는지 확인해 주세요.',
  light: '큰 그림자와 색 번짐이 없는지 확인해 주세요.',
};

let totalAssetBytes = 0;
for (const item of expectedItems) {
  const fileName = expectedAssets[item.id];
  assert.ok(
    tutorialSource.includes(
      `${item.id}: require('../../../assets/images/face-capture-guide/${fileName}')`,
    ),
    `missing local image mapping for ${item.id}`,
  );
  assert.ok(
    tutorialSource.includes(`${item.id}: '${expectedTips[item.id]}'`),
    `tip must only restate the approved ${item.id} condition`,
  );

  const imagePath = join(
    mobileSourceRoot,
    'assets',
    'images',
    'face-capture-guide',
    fileName,
  );
  const png = readFileSync(imagePath);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 896, `${fileName} width`);
  assert.equal(png.readUInt32BE(20), 724, `${fileName} height`);
  assert.equal(png[25], 2, `${fileName} must be RGB without alpha`);
  assert.ok(png.length < 1_100_000, `${fileName} should remain mobile-sized`);
  totalAssetBytes += png.length;
}
assert.ok(totalAssetBytes < 6_000_000, 'six guide assets should stay below 6 MB total');

assert.match(tutorialSource, /\(\['incorrect', 'correct'\] as const\)\.map/);
assert.match(tutorialSource, /kind === 'incorrect'[\s\S]*?<XIcon[\s\S]*?: \([\s\S]*?<Check/);
assert.match(tutorialSource, /comparisonBadgeOverlay:[\s\S]*?flexDirection: 'row'/);
assert.match(tutorialSource, /comparisonBadgeHalf:[\s\S]*?alignItems: 'flex-end'[\s\S]*?justifyContent: 'flex-end'/);
assert.match(tutorialSource, /importantForAccessibility="no-hide-descendants"/);
assert.match(tutorialSource, /accessibilityLabel=\{step\.imageAccessibilityLabel\}/);
assert.match(tutorialSource, /horizontal[\s\S]*?pagingEnabled/);
assert.match(tutorialSource, /<PaginationDots[\s\S]*?count=\{faceCaptureTutorialSteps\.length\}/);
assert.match(tutorialSource, /const isFinalStep = currentStepIndex === faceCaptureTutorialSteps\.length - 1/);
assert.match(tutorialSource, /onPress=\{handleStartCapturePress\}/);
assert.match(
  tutorialTestSource,
  /밝고 고른 빛에서,이마가 보이게,양쪽 귀가 보이게,액세서리 없이,표정은 편안하게,턱끝까지 화면 안에/,
);
assert.doesNotMatch(tutorialSource, /작은 액세서리|눈썹과 입술에 힘을 빼고 정면/);

console.log('faceCaptureTutorialContract.test.mjs passed');
