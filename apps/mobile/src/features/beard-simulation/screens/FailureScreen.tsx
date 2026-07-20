import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from 'tamagui';
import { X } from 'lucide-react-native';
import type { BeardStackParamList } from '../navigation/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { useToast } from '../state/ToastContext';
import { beardColors } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'Failure'>;
type Rt = RouteProp<BeardStackParamList, 'Failure'>;

const DEFAULT_CHIPS = ['조명이 어두워요', '턱선이 프레임 밖에 있어요'];

export function FailureScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const insets = useSafeAreaInsets();
  const { setInputImage, resetForNewPhoto } = useBeardFlow();
  const toast = useToast();

  const chips = (route.params?.reason ? route.params.reason.split(' · ') : DEFAULT_CHIPS).slice(0, 2);

  const picking = useRef(false);

  const exit = () => {
    resetForNewPhoto();
    nav.popToTop();
  };
  const retry = () => nav.replace('Camera');
  const pickAlbum = async () => {
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
      if (!asset?.uri) return; // 취소 — 실패 화면 유지.

      const jpeg = await manipulateAsync(asset.uri, [], { compress: 0.9, format: SaveFormat.JPEG });
      setInputImage(jpeg.uri);
      nav.replace('Generating');
    } catch {
      toast.show('err', '사진을 불러오지 못했어요');
    } finally {
      picking.current = false;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: beardColors.onyxLoadingBase, alignItems: 'center', paddingHorizontal: 32, paddingTop: insets.top + 88 }}>
      <Pressable onPress={exit} accessibilityLabel="닫기" style={{ position: 'absolute', top: insets.top, left: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }}>
        <X size={19} color={beardColors.textPrimary} strokeWidth={2} />
      </Pressable>

      <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: 'rgba(184,164,255,0.4)', backgroundColor: 'rgba(184,164,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
        <Text fontSize={26} fontWeight="700" color={beardColors.lavender}>!</Text>
      </View>

      <Text fontSize={20} fontWeight="700" color={beardColors.textPrimary} textAlign="center" lineHeight={29} letterSpacing={-0.3} mt={26}>
        {'이 사진으로는 자연스러운 결과를\n만들기 어려워요'}
      </Text>
      <Text fontSize={14} lineHeight={23} color={beardColors.textSecondary} textAlign="center" mt={14}>
        {'얼굴형이 달라 보일 수 있는 결과는 만들지 않아요.\n밝은 곳에서 얼굴을 정면으로 맞춰 다시 촬영해 주세요.'}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
        {chips.map((c, i) => (
          <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(27,31,37,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
            <Text fontSize={12.5} color="#C6CBD4">{c}</Text>
          </View>
        ))}
      </View>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: Math.max(insets.bottom, 28) + 24, gap: 10 }}>
        <Pressable onPress={retry} style={{ height: 54, borderRadius: 999, backgroundColor: beardColors.textPrimary, alignItems: 'center', justifyContent: 'center' }}>
          <Text fontSize={16} fontWeight="600" color={beardColors.lightText}>다시 촬영하기</Text>
        </Pressable>
        <Pressable onPress={() => void pickAlbum()} style={{ height: 48, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Text fontSize={15} fontWeight="600" color={beardColors.textPrimary}>다른 사진 선택</Text>
        </Pressable>
      </View>
    </View>
  );
}
