// 첨부 프레임워크 단위 검증 (프로젝트 관례: expectEqual + tsc --noEmit 게이트).
// 레지스트리 contribute가 kind별로 요청 기여(promptSuffix/reportId/context)를 올바로 합성하는지.

import {
  attachmentChipLabel,
  buildRequestParts,
  type AuradinAttachment,
} from './attachments';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// report → context.personalColor + reportId
const reportOnly = buildRequestParts([
  {kind: 'report', id: 'r-1', personalColor: '여름 쿨 라이트'},
]);
expectEqual(reportOnly.context.personalColor, '여름 쿨 라이트', 'report contributes personalColor');
expectEqual(reportOnly.reportId, 'r-1', 'report contributes reportId');
expectEqual(reportOnly.promptSuffix, '', 'report adds no prompt suffix');

// report 칩 라벨은 톤 2단어로 축약
expectEqual(
  attachmentChipLabel({kind: 'report', personalColor: '여름 쿨 라이트'}),
  '여름 쿨 · 리포트',
  'report chip label shortens tone',
);

// filter → parse_intent 표준구가 promptSuffix에 합성
const filters = buildRequestParts([
  {kind: 'filter', attribute: 'category', value: '립', label: '립'},
  {kind: 'filter', attribute: 'priceKrw', value: '2만원 이하', label: '2만원↓'},
]);
expectEqual(filters.promptSuffix, '립 2만원 이하', 'filters compose canonical prompt suffix');
expectEqual(filters.context.personalColor, undefined, 'filters add no context');

// 혼합: report + filter
const mixed = buildRequestParts([
  {kind: 'report', id: 'r-2', personalColor: '봄 웜'},
  {kind: 'filter', attribute: 'channel', value: '올리브영', label: '올리브영'},
] as AuradinAttachment[]);
expectEqual(mixed.context.personalColor, '봄 웜', 'mixed keeps report context');
expectEqual(mixed.promptSuffix, '올리브영', 'mixed keeps filter suffix');

// 빈 첨부 → 빈 기여
const empty = buildRequestParts([]);
expectEqual(empty.promptSuffix, '', 'empty attachments → empty suffix');
expectEqual(empty.reportId, undefined, 'empty attachments → no reportId');

// eslint-disable-next-line no-console
console.log('attachments.test.ts: all assertions passed');
