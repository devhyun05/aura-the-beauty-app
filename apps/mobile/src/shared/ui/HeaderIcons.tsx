import {Menu, Search, UserRound, type LucideProps} from 'lucide-react-native';

import {colors, iconSize} from '../theme';

type HeaderIconProps = LucideProps;

const defaultStrokeWidth = 2;

export const HEADER_ICON_LIBRARY_NAMES = {
  MenuHeaderIcon: 'Menu',
  ProfileHeaderIcon: 'UserRound',
  SearchHeaderIcon: 'Search',
} as const;

export function SearchHeaderIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: HeaderIconProps) {
  return (
    <Search
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function MenuHeaderIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: HeaderIconProps) {
  return (
    <Menu
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function ProfileHeaderIcon({
  color = colors.black,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: HeaderIconProps) {
  return (
    <UserRound
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
