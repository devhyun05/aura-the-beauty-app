import {Heart} from 'lucide-react-native';

import {colors, iconSize} from '../../../shared/theme';

export const PROFILE_HEART_ICON_LIBRARY_NAME = 'Heart';

export const HeartIcon = () => {
  return (
    <Heart
      color={colors.black}
      fill={colors.black}
      pointerEvents="none"
      size={iconSize.xs}
      strokeWidth={2.1}
    />
  );
};
