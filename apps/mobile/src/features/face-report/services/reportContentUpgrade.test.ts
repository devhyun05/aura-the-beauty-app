import type {ReportData} from '../reportTypes';
import {keepActivePageContent} from './reportContentUpgrade';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const currentUpper = {key: 'upper', regionTitle: '기존 눈 카드'};
const currentMid = {key: 'mid', regionTitle: '기존 코 카드'};
const nextUpper = {key: 'upper', regionTitle: '새 눈 카드'};
const nextMid = {key: 'mid', regionTitle: '새 코 카드'};
const current = {
  reportId: 'report-a',
  s3: {cards: [currentUpper, currentMid]},
} as unknown as ReportData;
const next = {
  reportId: 'report-a',
  s3: {cards: [nextUpper, nextMid]},
} as unknown as ReportData;

const upgraded = keepActivePageContent(current, next, 'features:upper');

expectEqual(
  upgraded.s3?.cards[0],
  currentUpper,
  'the active feature card keeps its existing content',
);
expectEqual(
  upgraded.s3?.cards[1],
  nextMid,
  'inactive feature cards receive the new revision',
);
