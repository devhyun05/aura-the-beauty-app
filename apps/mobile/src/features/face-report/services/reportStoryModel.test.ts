import assert from 'node:assert/strict';
import {buildFaceReportStoryModel} from './reportStoryModel';
import {buildMinimumFaceReportData} from './minimumFaceReport';
import type {ReportData} from '../reportTypes';

function fullInput(): Pick<ReportData, 'goldenMask' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'> {
  return {
    s1: {} as ReportData['s1'],
    s2: {} as NonNullable<ReportData['s2']>,
    s3: {
      cards: [
        {key: 'upper', regionChip: '상안부', regionTitle: '이마 · 눈썹 · 눈'},
        {key: 'mid', regionChip: '중안부', regionTitle: '코 · 인중 · 볼'},
        {key: 'lower', regionChip: '하안부', regionTitle: '입술 · E라인'},
        {key: 'jaw', regionChip: '외곽 라인', regionTitle: '광대 · 턱'},
      ],
    } as ReportData['s3'],
    s4: {} as NonNullable<ReportData['s4']>,
    s5: {} as ReportData['s5'],
    s6: {} as NonNullable<ReportData['s6']>,
    s7: {} as NonNullable<ReportData['s7']>,
    s8: {} as NonNullable<ReportData['s8']>,
  };
}

const full = buildFaceReportStoryModel(fullInput());
assert.equal(full.pages.length, 14);
// 인상은 컬러·피부(퍼스널 컬러+피부) 다음에 온다 — 얼굴 분석 UX 검토(2026-07-24):
// 컬러·피부가 인상보다 먼저 나와야 한다는 요청 반영. sectionId도 'color-skin'으로
// 함께 옮겨야 탭 하이라이트가 페이지 이동 중 얼굴↔컬러·피부로 되돌아가지 않는다.
assert.deepEqual(full.pages.map(page => page.id), [
  'summary:overview',
  'proportion:overview',
  'features:upper',
  'features:mid',
  'features:lower',
  'features:jaw',
  'personal-color:tone',
  'personal-color:drape',
  'skin:overview',
  'impression:overview',
  'styling:natural',
  'styling:glam',
  'body:overview',
  'makeup:cta',
]);
assert.deepEqual(full.sections.map(section => section.id), [
  'summary',
  'face',
  'color-skin',
  'style',
]);
assert.equal(full.featurePageIds.upper, 'features:upper');
assert.equal(full.featurePageIds.mid, 'features:mid');
assert.equal(full.featurePageIds.lower, 'features:lower');
assert.equal(full.sectionCoverPageIds['color-skin'], 'personal-color:tone');

const withGoldenMaskInput = fullInput();
withGoldenMaskInput.goldenMask = {
  available: true,
  byteSize: 38_400,
  captureId: 'capture-1',
  contentType: 'application/vnd.aura.golden-mask',
  createdAt: '2025-07-23T00:00:00.000Z',
  createdAtUnixMs: 1_753_238_400_000,
  indexCount: 6_912,
  mediaId: 'media-1',
  schemaVersion: 'aura.golden-mask.v1',
  source: 'arkit_face_mesh',
  topologyFingerprint: 'a'.repeat(64),
  triangleIndexCount: 6_912,
  trueDepthHardware: true,
  uvCount: 1_220,
  vertexCount: 1_220,
};
const withGoldenMask = buildFaceReportStoryModel(withGoldenMaskInput);
assert.equal(withGoldenMask.pages.length, 14); // 요약+마스크는 한 페이지
assert.deepEqual(withGoldenMask.pages.slice(0, 3).map(page => page.id), [
  'summary:overview',
  'proportion:overview',
  'features:upper',
]);
assert.equal(
  withGoldenMask.pages.find(page => page.id === 'summary:overview')?.contentKey,
  'summary:combined',
);

const sparseInput = fullInput();
sparseInput.s2 = null;
sparseInput.s3 = null;
sparseInput.s4 = null;
sparseInput.s6 = null;
sparseInput.s7 = null;
sparseInput.s8 = null;
const sparse = buildFaceReportStoryModel(sparseInput);
assert.deepEqual(sparse.sections.map(section => section.id), ['summary', 'style']);
assert.deepEqual(sparse.pages.map(page => page.id), [
  'summary:overview',
  'body:overview',
  'makeup:cta',
]);

const partialFeaturesInput = fullInput();
partialFeaturesInput.s3 = {
  cards: [
    {key: 'upper', regionChip: '상안부', regionTitle: '상안부'},
    {key: 'jaw', regionChip: '외곽 라인', regionTitle: '턱'},
  ],
} as ReportData['s3'];
const partialFeatures = buildFaceReportStoryModel(partialFeaturesInput);
assert.equal(partialFeatures.featurePageIds.upper, 'features:upper');
assert.equal(partialFeatures.featurePageIds.jaw, 'features:jaw');
assert.equal(partialFeatures.featurePageIds.mid, undefined);
assert.equal(new Set(partialFeatures.pages.map(page => page.id)).size, partialFeatures.pages.length);

const minimumData = buildMinimumFaceReportData({
  capturedPhotoUri: 'file:///face.jpg',
  faceShape: '계란형',
  has3DModel: true,
  personalColor: '여름 뮤트',
  ratioSummary: '세 구획이 고르게 나뉜 편이에요',
  recommendedMood: '차분한 선명함',
  skinType: '복합성',
});
assert.equal(minimumData.initialPageId, undefined);
assert.equal(minimumData.s1.photo.uri, 'file:///face.jpg');
assert.deepEqual(
  minimumData.s1.cards.map(card => card.label),
  ['얼굴형', '피부 타입', '추천 무드', '퍼스널 컬러', '얼굴 비율', '3D 페이스'],
);
const minimumStory = buildFaceReportStoryModel(minimumData);
assert.deepEqual(minimumStory.sections.map(section => section.id), ['summary', 'style']);
assert.deepEqual(minimumStory.pages.map(page => page.id), [
  'summary:overview',
  'summary:generation',
  'makeup:cta',
]);

console.log('reportStoryModel contract passed');
