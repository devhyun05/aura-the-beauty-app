import {
  getMakeupCorrectionGuideIconName,
  getMakeupCorrectionGuideSections,
  getMakeupCorrectionGuideTabs,
} from './makeupCorrectionGuideModel';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const tabs = getMakeupCorrectionGuideTabs();
const sections = getMakeupCorrectionGuideSections();

expectEqual(tabs[0]?.id, 'all', 'makeup correction guide starts with all tab');
expectEqual(sections.length, 5, 'makeup correction guide section count');
expectEqual(sections[0]?.id, 'eye', 'makeup correction guide first section');
expectEqual(
  getMakeupCorrectionGuideIconName('lip'),
  'heart',
  'makeup correction lip guide icon',
);
