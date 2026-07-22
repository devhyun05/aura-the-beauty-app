import assert from 'node:assert/strict';
import {buildFaceReportStoryModel} from './reportStoryModel';
import type {ReportData} from '../reportTypes';

function fullInput(): Pick<ReportData, 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'> {
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
assert.equal(full.pages.length, 22);
assert.deepEqual(full.pages.map(page => page.id), [
  'summary:cover',
  'summary:overview',
  'proportion:cover',
  'proportion:overview',
  'features:cover',
  'features:upper',
  'features:mid',
  'features:lower',
  'features:jaw',
  'personal-color:cover',
  'personal-color:tone',
  'personal-color:drape',
  'body:cover',
  'body:overview',
  'impression:cover',
  'impression:overview',
  'styling:cover',
  'styling:natural',
  'styling:glam',
  'skin:cover',
  'skin:overview',
  'makeup:cta',
]);
assert.equal(full.featurePageIds.upper, 'features:upper');
assert.equal(full.featurePageIds.mid, 'features:mid');
assert.equal(full.featurePageIds.lower, 'features:lower');
assert.equal(full.sectionCoverPageIds['personal-color'], 'personal-color:cover');

const sparseInput = fullInput();
sparseInput.s2 = null;
sparseInput.s3 = null;
sparseInput.s4 = null;
sparseInput.s6 = null;
sparseInput.s7 = null;
sparseInput.s8 = null;
const sparse = buildFaceReportStoryModel(sparseInput);
assert.deepEqual(sparse.sections.map(section => section.id), ['summary', 'body', 'makeup']);
assert.deepEqual(sparse.pages.map(page => page.id), [
  'summary:cover',
  'summary:overview',
  'body:cover',
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

console.log('reportStoryModel contract passed');
