import {useState} from 'react';
import {
  Image,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  StyleSheet,
} from 'react-native';
import {Text, View} from 'tamagui';

import {
  colors,
  feedbackColors,
  feedbackRadius,
  radius,
  spacing,
  typography,
} from '../../../shared/theme';
import type {
  MakeupFeedbackAnalysisImageSize,
  MakeupFeedbackCorrectionGuide,
  MakeupFeedbackEvaluation,
  MakeupFeedbackEvidenceRegion,
  MakeupFeedbackEvidenceRegionId,
  MakeupFeedbackTopicId,
} from '../types';

export type MakeupFeedbackEvidenceMedia = {
  imageSize: MakeupFeedbackAnalysisImageSize;
  regions: MakeupFeedbackEvidenceRegion[];
  source: ImageSourcePropType;
};

type MakeupFeedbackEvidencePreviewProps = {
  evaluation?: MakeupFeedbackEvaluation;
  guide?: MakeupFeedbackCorrectionGuide;
  media?: MakeupFeedbackEvidenceMedia;
  variant: 'strength' | 'improvement';
};

type FocusBox = MakeupFeedbackEvidenceRegion['box'];

const FALLBACK_FRAME_WIDTH = 320;
const FRAME_HEIGHT = 164;
const CORRECTION_BLUE = '#5B78A6';

const topicFallbackRegionIds: Record<
  MakeupFeedbackEvaluation['kind'],
  MakeupFeedbackEvidenceRegionId[]
> = {
  cheek: ['left_cheek', 'right_cheek'],
  eye: ['left_eye', 'right_eye'],
  lip: ['lips'],
};

export function MakeupFeedbackEvidencePreview({
  evaluation,
  guide,
  media,
  variant,
}: MakeupFeedbackEvidencePreviewProps) {
  if (!evaluation || !media) {
    return null;
  }

  const visibleRegions = resolveVisibleRegions(evaluation, media.regions, guide);

  if (visibleRegions.length === 0) {
    return null;
  }

  const isImprovement = variant === 'improvement';
  const regionLabels = visibleRegions.map(region =>
    getRegionLabel(region.id, evaluation.topicId),
  );

  return (
    <View
      accessibilityLabel={
        isImprovement
          ? `${regionLabels.join(', ')} 각각의 확대 사진. 수정 위치 ${guide?.targetArea ?? evaluation.topicLabel}`
          : `${regionLabels.join(', ')} 각각의 확대 사진. 잘 표현된 부위`
      }
      style={styles.container}
      testID={`makeup-feedback-${variant}-evidence-preview`}>
      <View style={styles.regionRow}>
        {visibleRegions.map(region => (
          <EvidenceRegionTile
            evaluation={evaluation}
            isImprovement={isImprovement}
            key={region.id}
            media={media}
            region={region}
          />
        ))}
      </View>

      {isImprovement && guide ? (
        <View style={styles.guideSummary}>
          <View style={styles.targetCopy}>
            <Text style={styles.guideLabel}>어디에</Text>
            <Text style={styles.guideValue}>{guide.targetArea}</Text>
            <Text style={styles.coverageText}>{guide.coverage}</Text>
          </View>
          <View style={styles.guideMetaRow}>
            <View style={styles.guideMetaChip}>
              <Text style={styles.guideMetaLabel}>도구</Text>
              <Text numberOfLines={1} style={styles.guideMetaValue}>{guide.tool}</Text>
            </View>
            <View style={styles.guideMetaChip}>
              <Text style={styles.guideMetaLabel}>사용량</Text>
              <Text numberOfLines={1} style={styles.guideMetaValue}>{guide.amount}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function EvidenceRegionTile({
  evaluation,
  isImprovement,
  media,
  region,
}: {
  evaluation: MakeupFeedbackEvaluation;
  isImprovement: boolean;
  media: MakeupFeedbackEvidenceMedia;
  region: MakeupFeedbackEvidenceRegion;
}) {
  const [frameWidth, setFrameWidth] = useState(FALLBACK_FRAME_WIDTH / 2);
  const topicBox = getTopicFocusBox(region.box, evaluation.topicId, region.id);
  const focusBox = addFocusPadding(topicBox);
  const imageWidth = positiveFiniteOrFallback(media.imageSize.width);
  const imageHeight = positiveFiniteOrFallback(media.imageSize.height);
  const focusWidth = finiteOrFallback(focusBox.right - focusBox.left, 1);
  const focusHeight = finiteOrFallback(focusBox.bottom - focusBox.top, 1);
  const focusLeft = finiteOrFallback(focusBox.left, 0);
  const focusTop = finiteOrFallback(focusBox.top, 0);
  const cropWidth = Math.max(1, focusWidth * imageWidth);
  const cropHeight = Math.max(1, focusHeight * imageHeight);
  const scale = Math.min(frameWidth / cropWidth, FRAME_HEIGHT / cropHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const cropRenderedWidth = cropWidth * scale;
  const cropRenderedHeight = cropHeight * scale;
  const imageLeft =
    (frameWidth - cropRenderedWidth) / 2
    - focusLeft * imageWidth * scale;
  const imageTop =
    (FRAME_HEIGHT - cropRenderedHeight) / 2
    - focusTop * imageHeight * scale;
  const regionLabel = getRegionLabel(region.id, evaluation.topicId);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);

    if (nextWidth > 0 && nextWidth !== frameWidth) {
      setFrameWidth(nextWidth);
    }
  };

  return (
    <View
      accessibilityLabel={`${regionLabel} 확대 사진`}
      onLayout={handleLayout}
      style={styles.regionTile}>
      <Image
        resizeMode="stretch"
        source={media.source}
        style={{
          height: renderedHeight,
          left: imageLeft,
          position: 'absolute',
          top: imageTop,
          width: renderedWidth,
        }}
      />
      <View pointerEvents="none" style={styles.photoScrim} />
      <View style={isImprovement ? styles.correctionBadge : styles.evidenceBadge}>
        <Text
          numberOfLines={1}
          style={isImprovement ? styles.correctionBadgeText : styles.evidenceBadgeText}>
          {regionLabel}
        </Text>
      </View>
    </View>
  );
}

function finiteOrFallback(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveFiniteOrFallback(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveVisibleRegions(
  evaluation: MakeupFeedbackEvaluation,
  regions: readonly MakeupFeedbackEvidenceRegion[],
  guide?: MakeupFeedbackCorrectionGuide,
) {
  const requestedRegionIds = new Set(
    (evaluation.observations ?? []).flatMap(
      observation => observation.evidenceRegionIds ?? [],
    ),
  );
  const requestedSpecificRegions = regions.filter(
    region => region.id !== 'full' && requestedRegionIds.has(region.id),
  );

  if (requestedSpecificRegions.length > 0) {
    return filterRegionsForGuide(requestedSpecificRegions, guide);
  }

  const fallbackIds = new Set(topicFallbackRegionIds[evaluation.kind]);
  const topicRegions = regions.filter(region => fallbackIds.has(region.id));

  if (topicRegions.length > 0) {
    return filterRegionsForGuide(topicRegions, guide);
  }

  return [];
}

function filterRegionsForGuide(
  regions: MakeupFeedbackEvidenceRegion[],
  guide?: MakeupFeedbackCorrectionGuide,
) {
  if (!guide || regions.length < 2) {
    return regions;
  }

  const targetText = `${guide.targetArea} ${guide.coverage}`;
  const mentionsLeft = /(왼쪽|좌측)/.test(targetText);
  const mentionsRight = /(오른쪽|우측)/.test(targetText);

  if (mentionsLeft === mentionsRight || /(양쪽|양측)/.test(targetText)) {
    return regions;
  }

  const sidePrefix = mentionsLeft ? 'left_' : 'right_';
  const sideRegions = regions.filter(region => region.id.startsWith(sidePrefix));
  return sideRegions.length > 0 ? sideRegions : regions;
}

function getTopicFocusBox(
  box: FocusBox,
  topicId: MakeupFeedbackTopicId,
  regionId: MakeupFeedbackEvidenceRegionId,
): FocusBox {
  const width = box.right - box.left;
  const height = box.bottom - box.top;

  if (regionId === 'left_eye' || regionId === 'right_eye') {
    if (topicId === 'brow') {
      return {...box, bottom: box.top + height * 0.62};
    }

    if (topicId === 'aegyosal') {
      return {...box, top: box.top + height * 0.36};
    }

    if (topicId === 'eyeshadow') {
      return {
        ...box,
        bottom: box.top + height * 0.72,
        top: box.top + height * 0.06,
      };
    }

    if (topicId === 'lens') {
      return {
        ...box,
        bottom: box.top + height * 0.88,
        top: box.top + height * 0.22,
      };
    }

    if (topicId === 'lash') {
      return {
        ...box,
        bottom: box.top + height * 0.82,
        top: box.top + height * 0.2,
      };
    }

    if (topicId === 'eyeliner') {
      return {
        ...box,
        bottom: box.top + height * 0.86,
        top: box.top + height * 0.26,
      };
    }

    return {
      ...box,
      bottom: box.top + height * 0.9,
      top: box.top + height * 0.18,
    };
  }

  if (
    (regionId === 'left_cheek' || regionId === 'right_cheek') &&
    topicId === 'highlight'
  ) {
    return {
      bottom: box.top + height * 0.72,
      left: box.left + width * 0.08,
      right: box.right - width * 0.08,
      top: box.top,
    };
  }

  return box;
}

function addFocusPadding(box: FocusBox): FocusBox {
  const horizontalPadding = (box.right - box.left) * 0.08;
  const verticalPadding = (box.bottom - box.top) * 0.12;

  return {
    bottom: Math.min(1, box.bottom + verticalPadding),
    left: Math.max(0, box.left - horizontalPadding),
    right: Math.min(1, box.right + horizontalPadding),
    top: Math.max(0, box.top - verticalPadding),
  };
}

function getRegionLabel(
  regionId: MakeupFeedbackEvidenceRegionId,
  topicId: MakeupFeedbackTopicId,
) {
  const side = regionId.startsWith('left_') ? '왼쪽' : '오른쪽';

  if (regionId === 'left_eye' || regionId === 'right_eye') {
    const eyeLabelByTopic: Partial<Record<MakeupFeedbackTopicId, string>> = {
      aegyosal: `${side} 눈 아래`,
      brow: `${side} 눈썹`,
      eyeliner: `${side} 아이라인`,
      eyeshadow: `${side} 눈두덩`,
      lash: `${side} 속눈썹`,
      lens: `${side} 눈`,
    };
    return eyeLabelByTopic[topicId] ?? `${side} 눈`;
  }

  return {
    full: '전체',
    left_cheek: '왼쪽 볼',
    lips: '입술',
    right_cheek: '오른쪽 볼',
  }[regionId];
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: feedbackColors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.md,
    overflow: 'hidden',
  },
  correctionBadge: {
    backgroundColor: CORRECTION_BLUE,
    borderRadius: radius.pill,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
  correctionBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
  },
  coverageText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  evidenceBadge: {
    backgroundColor: 'rgba(16, 18, 20, 0.80)',
    borderRadius: radius.pill,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
  evidenceBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
  },
  guideLabel: {
    color: CORRECTION_BLUE,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
  },
  guideMetaChip: {
    backgroundColor: 'rgba(91, 120, 166, 0.10)',
    borderRadius: radius.sm,
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  guideMetaLabel: {
    color: CORRECTION_BLUE,
    fontFamily: typography.fontFamily.bold,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 12,
  },
  guideMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  guideMetaValue: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: 15,
  },
  guideSummary: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  guideValue: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  photoScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  regionRow: {
    flexDirection: 'row',
    gap: 2,
    width: '100%',
  },
  regionTile: {
    backgroundColor: feedbackColors.surfaceMuted,
    flex: 1,
    height: FRAME_HEIGHT,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  targetCopy: {gap: 2},
});
