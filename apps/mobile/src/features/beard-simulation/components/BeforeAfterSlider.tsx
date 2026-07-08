import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Image, PanResponder, StyleSheet, Text, View} from 'react-native';

interface BeforeAfterSliderProps {
  beforeUri: string;
  afterUri: string;
  aspectRatio?: number; // width / height
}

/** Drag the divider to compare: left of the handle shows AFTER, right shows
 * BEFORE (both images fill the same frame; the after layer is clipped). */
export function BeforeAfterSlider({
  beforeUri,
  afterUri,
  aspectRatio = 3 / 4,
}: BeforeAfterSliderProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [ratio, setRatio] = useState(0.5);
  const ratioRef = useRef(ratio);

  const setDivider = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0.02), 0.98);
    ratioRef.current = clamped;
    setRatio(clamped);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: event => {
          if (containerWidth > 0) {
            setDivider(event.nativeEvent.locationX / containerWidth);
          }
        },
        onPanResponderMove: (_event, gesture) => {
          if (containerWidth > 0) {
            setDivider(ratioRef.current + gesture.dx / containerWidth / 8);
          }
        },
      }),
    [containerWidth, setDivider],
  );

  const dividerX = containerWidth * ratio;

  return (
    <View
      style={[styles.container, {aspectRatio}]}
      onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
      {...panResponder.panHandlers}>
      <Image source={{uri: beforeUri}} style={styles.image} resizeMode="cover" />
      {containerWidth > 0 ? (
        <View style={[styles.afterClip, {width: dividerX}]}>
          <Image
            source={{uri: afterUri}}
            style={[styles.image, {width: containerWidth}]}
            resizeMode="cover"
          />
        </View>
      ) : null}
      <View style={[styles.divider, {left: dividerX - 1}]} />
      <View style={[styles.handle, {left: dividerX - 14}]}>
        <Text style={styles.handleText}>⇔</Text>
      </View>
      <Text style={[styles.cornerLabel, styles.afterLabel]}>시뮬레이션</Text>
      <Text style={[styles.cornerLabel, styles.beforeLabel]}>현재</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  afterClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#fff',
  },
  handle: {
    position: 'absolute',
    top: '50%',
    width: 28,
    height: 28,
    marginTop: -14,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: {fontSize: 13, color: '#333'},
  cornerLabel: {
    position: 'absolute',
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 11,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  afterLabel: {left: 10},
  beforeLabel: {right: 10},
});
