import React from 'react';
import {
  Brush,
  Camera,
  House,
  type LucideProps,
} from 'lucide-react-native';

import {colors, iconSize} from '../theme';

const defaultStrokeWidth = 2.1;

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

export function CameraFooterIcon({
  color = colors.black,
  size = iconSize.xl,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
  return (
    <Camera
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function BrushFooterIcon({
  color = colors.black,
  size = iconSize.md,
  strokeWidth = defaultStrokeWidth,
  ...props
}: LucideProps) {
  return (
    <Brush
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
