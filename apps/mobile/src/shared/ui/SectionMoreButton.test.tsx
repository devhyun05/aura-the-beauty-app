import {
  SECTION_MORE_BUTTON_ICON_NAME,
  SectionMoreButton,
} from './SectionMoreButton';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  SECTION_MORE_BUTTON_ICON_NAME,
  'ArrowRight',
  'section more button icon',
);

<SectionMoreButton
  accessibilityLabel="추천 메이크업 필터 더보기"
  label="더보기"
  onPress={() => undefined}
/>;
