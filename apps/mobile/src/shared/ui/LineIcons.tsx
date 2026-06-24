import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  Menu,
  Pencil,
  Settings,
  X,
  type LucideProps,
} from 'lucide-react-native';

import {colors, iconSize} from '../theme';

type IconProps = LucideProps & {
  filled?: boolean;
};

const defaultStrokeWidth = 2;

export const LINE_ICON_LIBRARY_NAMES = {
  BookmarkIcon: 'Bookmark',
  ChevronLeftIcon: 'ChevronLeft',
  ChevronRightIcon: 'ChevronRight',
  GearIcon: 'Settings',
  HeartIcon: 'Heart',
  MenuStackIcon: 'Menu',
  PencilIcon: 'Pencil',
  XIcon: 'X',
} as const;

export function ChevronRightIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <ChevronRight
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function ChevronLeftIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <ChevronLeft
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function GearIcon({
  color = colors.textPrimary,
  size = iconSize.lg,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <Settings
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function BookmarkIcon({
  color = colors.textPrimary,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <Bookmark
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function HeartIcon({
  color = colors.heart,
  filled = true,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <Heart
      color={color}
      fill={filled ? color : 'none'}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function XIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <X
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function PencilIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <Pencil
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function MenuStackIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
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
