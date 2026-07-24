import {font, reportTypography, resolveReportFontSize} from './reportTokens';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

expectEqual(resolveReportFontSize(9), 12, 'micro copy has a readable minimum');
expectEqual(resolveReportFontSize(11.5), 13, 'captions use the caption scale');
expectEqual(resolveReportFontSize(12.5), 14, 'strong captions remain legible');
expectEqual(resolveReportFontSize(13.5), 15, 'body copy uses the body scale');
expectEqual(resolveReportFontSize(14.5), 16, 'labels and buttons use the label scale');
expectEqual(resolveReportFontSize(22), 24, 'section titles use the title scale');
expectEqual(resolveReportFontSize(26), 26, 'display text is not enlarged again');
expectEqual(font(11.5, '400', 1.5).lineHeight, 19.5, 'line height follows the resolved size');
expectEqual(reportTypography.body, 15, 'report body token remains explicit');

console.log('report typography contracts passed');
