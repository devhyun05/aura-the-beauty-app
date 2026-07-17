import React from 'react';
import {
  CalendarDays,
  House,
  MessageCircle,
  Sparkles,
  UserRound,
  type LucideProps,
} from 'lucide-react-native';

import {colors, iconSize} from '../theme';

const defaultStrokeWidth = 2.1;
export const FOOTER_ACTION_ICON_NAME = 'Sparkles';

export function HomeFooterIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
  return (
    <House
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function ProfileFooterIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
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

export function ConsultingFooterIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
  return (
    <MessageCircle
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function JourneyFooterIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
  return (
    <CalendarDays
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function FloatingActionFooterIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
  return (
    <Sparkles
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
