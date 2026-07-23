import {useLayoutEffect, useRef, useState} from 'react';
import {
  Image,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  StyleSheet,
} from 'react-native';
import {Text, View} from 'tamagui';

import type {
  MakeupFeedbackAnalysisImageSize,
  MakeupFeedbackEvidenceRegion,
  MakeupFeedbackEvidenceRegionId,
  MakeupFeedbackTopicId,
} from '../types';
import {
  feedbackRedesignColors as C,
  feedbackRedesignFonts,
} from './feedbackRedesignTheme';

type FeedbackEvidenceImageProps = {
  accessibilityLabel: string;
  height: number;
  imageSize?: MakeupFeedbackAnalysisImageSize;
  label?: string;
  onSettledChange?: (settled: boolean) => void;
  region?: MakeupFeedbackEvidenceRegion;
  rounded?: boolean;
  source: ImageSourcePropType;
  topicId?: MakeupFeedbackTopicId;
};

const FALLBACK_WIDTH = 320;

export function FeedbackEvidenceImage({
  accessibilityLabel,
  height,
  imageSize,
  label,
  onSettledChange,
  region,
  rounded = true,
  source,
  topicId,
}: FeedbackEvidenceImageProps) {
  const [frameWidth, setFrameWidth] = useState(FALLBACK_WIDTH);
  const canCrop = Boolean(imageSize && region && region.id !== 'full');
  const sourceKey =
    Image.resolveAssetSource(source)?.uri ?? JSON.stringify(source);
  const sourceKeyRef = useRef(sourceKey);
  const onSettledChangeRef = useRef(onSettledChange);
  onSettledChangeRef.current = onSettledChange;

  useLayoutEffect(() => {
    sourceKeyRef.current = sourceKey;
    onSettledChangeRef.current?.(false);
  }, [sourceKey]);

  const handleImageSettled = () => {
    if (sourceKeyRef.current !== sourceKey) return;
    onSettledChangeRef.current?.(true);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);

    if (nextWidth > 0 && nextWidth !== frameWidth) {
      setFrameWidth(nextWidth);
    }
  };

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      onLayout={handleLayout}
      style={[
        styles.frame,
        {height},
        rounded ? styles.rounded : undefined,
      ]}>
      {canCrop && imageSize && region ? (
        <CroppedImage
          frameHeight={height}
          frameWidth={frameWidth}
          imageSize={imageSize}
          onLoadEnd={handleImageSettled}
          region={region}
          source={source}
          topicId={topicId}
        />
      ) : (
        <Image onLoadEnd={handleImageSettled} resizeMode="cover" source={source} style={styles.fullImage} />
      )}

      {label ? (
        <View pointerEvents="none" style={styles.labelBadge}>
          <Text style={styles.labelText}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CroppedImage({
  frameHeight,
  frameWidth,
  imageSize,
  onLoadEnd,
  region,
  source,
  topicId,
}: {
  frameHeight: number;
  frameWidth: number;
  imageSize: MakeupFeedbackAnalysisImageSize;
  onLoadEnd: () => void;
  region: MakeupFeedbackEvidenceRegion;
  source: ImageSourcePropType;
  topicId?: MakeupFeedbackTopicId;
}) {
  const topicBox = topicId
    ? getTopicFocusBox(region.box, topicId, region.id)
    : region.box;
  const paddedBox = addCropPadding(topicBox);
  const cropWidth = Math.max(1, (paddedBox.right - paddedBox.left) * imageSize.width);
  const cropHeight = Math.max(1, (paddedBox.bottom - paddedBox.top) * imageSize.height);
  const scale = Math.max(frameWidth / cropWidth, frameHeight / cropHeight);
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  const renderedCropWidth = cropWidth * scale;
  const renderedCropHeight = cropHeight * scale;
  const left =
    (frameWidth - renderedCropWidth) / 2 -
    paddedBox.left * imageSize.width * scale;
  const top =
    (frameHeight - renderedCropHeight) / 2 -
    paddedBox.top * imageSize.height * scale;

  return (
    <Image
      onLoadEnd={onLoadEnd}
      resizeMode="stretch"
      source={source}
      style={{
        height: renderedHeight,
        left,
        position: 'absolute',
        top,
        width: renderedWidth,
      }}
    />
  );
}

function getTopicFocusBox(
  box: MakeupFeedbackEvidenceRegion['box'],
  topicId: MakeupFeedbackTopicId,
  regionId: MakeupFeedbackEvidenceRegionId,
) {
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

function addCropPadding(box: MakeupFeedbackEvidenceRegion['box']) {
  const horizontalPadding = (box.right - box.left) * 0.18;
  const verticalPadding = (box.bottom - box.top) * 0.18;

  return {
    bottom: Math.min(1, box.bottom + verticalPadding),
    left: Math.max(0, box.left - horizontalPadding),
    right: Math.min(1, box.right + horizontalPadding),
    top: Math.max(0, box.top - verticalPadding),
  };
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    backgroundColor: '#EAF2F7',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  fullImage: {
    height: '100%',
    width: '100%',
  },
  labelBadge: {
    backgroundColor: 'rgba(12,110,158,0.92)',
    borderRadius: 999,
    left: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    position: 'absolute',
    top: 8,
  },
  labelText: {
    color: C.card,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11,
  },
  rounded: {
    borderRadius: 14,
  },
});
