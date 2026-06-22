import { Button, Text, XStack, YStack } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageSpacing,
} from '../../../shared/theme/tokens';
import type { AnalysisReportPreview } from '../../../shared/types/userPage';
import { ProfileChip } from './ProfileChip';

interface AnalysisReportPreviewCardProps {
  report: AnalysisReportPreview;
  onPress?: () => void;
}

export const AnalysisReportPreviewCard = ({
  report,
  onPress,
}: AnalysisReportPreviewCardProps) => {
  return (
    <Button
      alignItems="stretch"
      backgroundColor={userPageColors.surface}
      borderColor={userPageColors.borderSubtle}
      borderRadius={userPageRadius.image}
      borderWidth={1}
      height="auto"
      onPress={onPress}
      padding={0}
      pressStyle={{ opacity: 0.72 }}
    >
      <YStack gap={userPageSpacing.itemGap} padding={16}>
        <XStack alignItems="flex-start" justifyContent="space-between">
          <YStack flex={1} gap={4}>
            <Text color={userPageColors.text} fontSize={16} fontWeight="700">
              {report.title}
            </Text>
            <Text color={userPageColors.textSoft} fontSize={12}>
              {report.analyzedAt}
            </Text>
          </YStack>

          <Text color={userPageColors.accentMuted} fontSize={24} lineHeight={24}>
            &gt;
          </Text>
        </XStack>

        <XStack flexWrap="wrap" gap={8}>
          <ProfileChip label={report.personalColor} />
          <ProfileChip label={report.skinType} />
        </XStack>

        <Text color={userPageColors.textMuted} fontSize={14} lineHeight={20}>
          {report.summary}
        </Text>
      </YStack>
    </Button>
  );
};
