import React, { useEffect, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { CameraType, CameraView } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from 'tamagui';
import { ChevronLeft, Images, RefreshCw } from 'lucide-react-native';
import { useCameraSessionActive } from '../../../shared/hooks/useCameraSessionActive';
import { LiveCameraLayer } from '../../../shared/ui';
import type { BeardStackParamList } from '../navigation/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { useToast } from '../state/ToastContext';
import { beardColors, beardTiming } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'Camera'>;

const CAM_MSGS = ['얼굴을 정면으로 맞춰주세요', '턱 아래까지 보이게 해주세요', '입 주변의 그림자를 줄여주세요', '촬영 준비가 되었어요'];

/**
 * 촬영 화면.
 *
 * 라이브 프리뷰는 face-capture와 동일한 <LiveCameraLayer/>(expo-camera CameraView +
 * useCameraPermissions)를 사용한다. 가이드 칩은 촬영 안내 문구를 순환 표시할 뿐이며
 * 촬영 가능 여부는 카메라 준비 상태로만 판단한다.
 */
export function CameraScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { setInputImage } = useBeardFlow();
  const toast = useToast();
  const [stage, setStage] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cameraRef = useRef<CameraView>(null);
  const cameraSessionActive = useCameraSessionActive();
  const [facing, setFacing] = useState<CameraType>('front');
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    setStage(0);
    [1, 2, 3].forEach((i) => {
      timers.current.push(setTimeout(() => setStage(i), beardTiming.camCycle * i + beardTiming.camCycleOffset));
    });
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const guideDone = stage === 3;
  const picking = useRef(false);

  const proceed = (imageUri: string) => {
    setInputImage(imageUri);
    nav.navigate('Generating');
  };

  // S3 PUT의 Content-Type: image/jpeg와 실제 바이트를 맞추기 위해 JPEG로 변환한다.
  const normalizeAndProceed = async (uri: string) => {
    const jpeg = await manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
    proceed(jpeg.uri);
  };

  // 셔터 — 화면 내 라이브 프리뷰에서 직접 촬영한다.
  const onShutter = async () => {
    if (picking.current) return;
    if (!cameraReady || !cameraRef.current) {
      toast.show('err', '카메라를 사용할 수 없어요 · 설정에서 카메라 권한을 확인해 주세요');
      return;
    }
    picking.current = true;
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (!picture?.uri) throw new Error('Camera did not return an image file.');
      await normalizeAndProceed(picture.uri);
    } catch {
      toast.show('err', '사진을 촬영하지 못했어요');
    } finally {
      picking.current = false;
    }
  };

  // 앨범 선택 경로는 기존 그대로 expo-image-picker를 사용한다.
  const onAlbum = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.show('err', '앨범 접근 권한이 필요해요');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset?.uri) return; // 취소 — 촬영 화면 유지.
      await normalizeAndProceed(asset.uri);
    } catch {
      toast.show('err', '사진을 불러오지 못했어요');
    } finally {
      picking.current = false;
    }
  };

  const onFlip = () => {
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
  };
  const onPolicy = () => toast.show('ok', '사진 처리 및 삭제 기준 문서로 이동해요 (프로토타입)'); // TODO(backend): link real policy doc.
  const onBack = () => nav.goBack();

  // Spotlight oval geometry (286×372, centred, top 178).
  const ovalW = 286;
  const ovalH = 372;
  const ovalTop = 178;
  const ovalLeft = (W - ovalW) / 2;
  const scrim = 'rgba(0,0,0,0.34)';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* 라이브 카메라 프리뷰 (face-capture의 LiveCameraLayer 재사용 — 권한 요청/설정 안내 포함) */}
      <LiveCameraLayer
        active={cameraSessionActive}
        facing={facing}
        ref={cameraRef}
        onCameraReady={() => setCameraReady(true)}
        onMountError={() => setCameraReady(false)}
      />

      {/* Spotlight scrim (4 bands around the oval bounding box).
          FIDELITY: exact oval-only dimming needs a mask lib (not in stack) — bounding-box approx. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ovalTop, backgroundColor: scrim }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: ovalTop + ovalH, left: 0, right: 0, bottom: 0, backgroundColor: scrim }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: ovalTop, left: 0, width: ovalLeft, height: ovalH, backgroundColor: scrim }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: ovalTop, right: 0, width: ovalLeft, height: ovalH, backgroundColor: scrim }} />

      {/* Top / bottom gradients */}
      <LinearGradient colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 190 }} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 250 }} pointerEvents="none" />

      {/* Back */}
      <View style={{ position: 'absolute', top: insets.top, left: 12 }}>
        <Pressable onPress={onBack} accessibilityLabel="이전" style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <BlurView intensity={16} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,22,26,0.4)' }} />
          <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Title block */}
      <View style={{ position: 'absolute', top: insets.top + 60, left: 28, right: 28, alignItems: 'center' }}>
        <Text fontSize={17.5} fontWeight="700" color="#FFFFFF" textAlign="center" letterSpacing={-0.2}>
          수염이 잘 보이는 사진을 준비해 주세요
        </Text>
        <Text fontSize={13} lineHeight={20} color="rgba(255,255,255,0.75)" textAlign="center" mt={7}>
          {'밝은 곳에서 얼굴을 정면으로 맞추고,\n턱 아래까지 보이게 촬영해 주세요.'}
        </Text>
      </View>

      {/* Guide oval */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: ovalTop,
          left: ovalLeft,
          width: ovalW,
          height: ovalH,
          borderRadius: ovalW / 2,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: guideDone ? beardColors.lavender : 'rgba(255,255,255,0.65)',
        }}
      />

      {/* Status chip */}
      <View style={{ position: 'absolute', bottom: 212, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ borderRadius: 999, overflow: 'hidden' }}>
          <BlurView intensity={16} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Text
            paddingHorizontal={16}
            paddingVertical={9}
            fontSize={13}
            fontWeight="600"
            backgroundColor={guideDone ? beardColors.lavender : 'rgba(20,22,26,0.6)'}
            color={guideDone ? beardColors.onLavender : '#FFFFFF'}
          >
            {CAM_MSGS[stage]}
          </Text>
        </View>
      </View>

      {/* Policy link */}
      <View style={{ position: 'absolute', bottom: 172, left: 0, right: 0, alignItems: 'center' }}>
        <Pressable onPress={onPolicy}>
          <Text fontSize={12} color="rgba(255,255,255,0.6)" textDecorationLine="underline">
            사진 처리 및 삭제 기준
          </Text>
        </Pressable>
      </View>

      {/* Controls */}
      <View style={{ position: 'absolute', bottom: Math.max(insets.bottom, 34) + 24, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 48 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => void onAlbum()} accessibilityLabel="앨범에서 선택" style={{ width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(20,22,26,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Images size={20} color="#FFFFFF" strokeWidth={1.8} />
          </Pressable>
          <Text fontSize={11} color="rgba(255,255,255,0.7)">앨범</Text>
        </View>

        <Pressable onPress={() => void onShutter()} accessibilityLabel="촬영" disabled={!cameraReady} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', opacity: cameraReady ? 1 : 0.35 }} />
        </Pressable>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Pressable onPress={onFlip} accessibilityLabel="카메라 전환" style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <BlurView intensity={16} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.16)' }} />
            <RefreshCw size={19} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
          <Text fontSize={11} color="rgba(255,255,255,0.7)">전환</Text>
        </View>
      </View>
    </View>
  );
}
