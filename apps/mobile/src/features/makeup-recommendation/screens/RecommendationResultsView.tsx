import {useCallback, useMemo, useRef, useState} from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {APP_HEADER_BASE_HEIGHT} from '../../../shared/ui/AppHeader';
import type {OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';
import {MAKEUP_RESULT_REDESIGN_ENABLED} from '../config/makeupResultRedesignFlag';
import {toRecommendationResultLooks} from '../services/toRecommendationResultLooks';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationImageStatus,
  MakeupRecommendationProfileGender,
  MakeupRecommendationRefinement,
  RecommendedMakeupAreaGuide,
} from '../types';
import {RecommendationResultsScreen, type ImageStatus} from './RecommendationResultsScreen';
import {RecommendationResultsViewLegacy} from './RecommendationResultsViewLegacy';
export {makeupRecommendationResultRoleLabels, toggleExpandedLookId} from './makeupRecommendationViewContracts';

export type RecommendationResultsViewProps = {
  context?: {
    reportLabel?: string;
    situationLabel?: string;
    keywordLabel?: string;
    personalColor?: string;
    profileGender?: MakeupRecommendationProfileGender;
  };
  onApplyAR: (look: MakeupLookRecommendation) => void;
  onAreaOpened: (area: RecommendedMakeupAreaGuide['area'], look: MakeupLookRecommendation) => void;
  onRefine: (refinement: MakeupRecommendationRefinement) => void;
  onReset: () => void;
  onRetry: () => void;
  onRetryRefinement: () => void;
  refinementError?: string;
  results: readonly MakeupLookRecommendation[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageRetryError?: string;
  isReportSaved: boolean;
  isRefining: boolean;
  onRetryImages: (lookId?: string) => void;
};

/**
 * Result screen entry point. Switches between the "Makeup Result v3" redesign and the
 * previous layout via MAKEUP_RESULT_REDESIGN_ENABLED — both honor the same props contract.
 */
export function RecommendationResultsView(props: RecommendationResultsViewProps) {
  return MAKEUP_RESULT_REDESIGN_ENABLED
    ? <RecommendationResultsViewRedesign {...props} />
    : <RecommendationResultsViewLegacy {...props} />;
}

/**
 * Thin adapter around the redesigned RecommendationResultsScreen: maps real
 * MakeupLookRecommendation data into the screen's Look[] view-model. Rendered under the
 * app shell header (DetailRouteChrome overlay), so the screen's own top bar is disabled
 * and content is inset below the shell header.
 */
function RecommendationResultsViewRedesign({
  context,
  onApplyAR,
  onAreaOpened,
  onRetry,
  results,
  imageStatus,
  onRetryImages,
}: RecommendationResultsViewProps) {
  const insets = useSafeAreaInsets();
  const shareRef = useRef<OptionalViewShotRef>(null);

  const looks = useMemo(
    () => toRecommendationResultLooks(results, {personalColor: context?.personalColor}),
    [results, context?.personalColor],
  );
  const anchorLook = useMemo(
    () => results.find(look => look.role === 'anchor') ?? results[0],
    [results],
  );
  const [activeRole, setActiveRole] = useState<string | undefined>(anchorLook?.role);
  const selectedLook = results.find(look => look.role === activeRole) ?? anchorLook;

  // Only failed looks are forced to an error state; everything else lets the
  // <Image> onLoad/onError drive the skeleton→ok transition.
  const screenImageStatus = useMemo(() => {
    const map: Partial<Record<string, ImageStatus>> = {};
    results.forEach(look => {
      if ((look.imageStatus ?? imageStatus) === 'failed') map[look.role] = 'error';
    });
    return map;
  }, [results, imageStatus]);

  const traitChips = context?.personalColor ? [context.personalColor] : [];

  const handleRetryImages = useCallback(
    (roleId: string) => {
      const realId = results.find(look => look.role === roleId)?.id;
      onRetryImages(realId);
    },
    [results, onRetryImages],
  );

  const handleSaveShareCard = useCallback(async () => {
    const uri = await shareRef.current?.capture?.();
    if (uri) {
      try {
        await Share.share({url: uri});
      } catch {
        /* user dismissed the share sheet */
      }
    }
  }, []);

  if (!selectedLook || looks.length === 0) {
    return (
      <AppScreen contentGap={spacing.lg} topPadding="belowShellHeader">
        <Text style={styles.emptyTitle}>추천 결과를 준비하지 못했어요</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>다시 시도하기</Text>
        </Pressable>
      </AppScreen>
    );
  }

  return (
    <View style={styles.host}>
      <RecommendationResultsScreen
        bottomInset={insets.bottom}
        imageStatus={screenImageStatus}
        looks={looks}
        onApplyAR={() => onApplyAR(selectedLook)}
        onLookChange={setActiveRole}
        onPartChange={area => onAreaOpened(area, selectedLook)}
        onRetryImages={handleRetryImages}
        onSaveShareCard={handleSaveShareCard}
        onShare={handleSaveShareCard}
        shareCaptureRef={shareRef}
        showTopBar={false}
        situationLabel={context?.situationLabel}
        topInset={insets.top + APP_HEADER_BASE_HEIGHT}
        traitChips={traitChips}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  emptyTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl},
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
});
