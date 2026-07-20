import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from 'tamagui';
import { ChevronRight, Image as ImageIcon, ScanFace } from 'lucide-react-native';
import type { BeardStackParamList } from '../navigation/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { beardColors } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'PurposeSelect'>;

function PurposeCard({
  icon,
  title,
  desc,
  meta,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 18,
        paddingVertical: 20,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: beardColors.lightBorder,
        backgroundColor: pressed ? '#F4F5F6' : beardColors.lightBg,
      })}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: beardColors.lightIconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text fontSize={17} fontWeight="700" color={beardColors.lightText}>
          {title}
        </Text>
        <Text fontSize={13.5} lineHeight={20} color={beardColors.lightSecondary}>
          {desc}
        </Text>
        <Text fontSize={12} color={beardColors.lightTertiary} mt={3}>
          {meta}
        </Text>
      </View>
      <ChevronRight size={20} color={beardColors.lightChevron} />
    </Pressable>
  );
}

export function PurposeSelectScreen() {
  const nav = useNavigation<Nav>();
  const { setPath, resetAll } = useBeardFlow();
  const insets = useSafeAreaInsets();

  const pickAnalysis = () => {
    resetAll();
    setPath('analysis');
    nav.navigate('Survey');
  };
  const pickPhoto = () => {
    resetAll();
    setPath('photo');
    nav.navigate('Camera');
  };

  return (
    <View style={{ flex: 1, backgroundColor: beardColors.lightBg, paddingTop: insets.top }}>
      <View style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text fontSize={17} fontWeight="600" color={beardColors.lightText} letterSpacing={-0.2}>
          수염 제거
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 40 }}>
        <Text fontSize={24} fontWeight="700" lineHeight={32} color={beardColors.lightText} letterSpacing={-0.4} mt={12}>
          {'어떤 방식으로\n확인할까요?'}
        </Text>
        <Text fontSize={14.5} lineHeight={23} color={beardColors.lightSecondary} mt={12}>
          수염을 분석해 변화를 알아보거나, 사진 속 수염 자국만 자연스럽게 정리할 수 있어요.
        </Text>
        <View style={{ gap: 14, marginTop: 30 }}>
          <PurposeCard
            icon={<ScanFace size={22} color={beardColors.lightText} strokeWidth={1.8} />}
            title="수염 분석"
            desc="현재 수염 패턴과 줄어든 모습을 함께 확인해요."
            meta="설문 포함 · 상세 보고서 제공"
            onPress={pickAnalysis}
          />
          <PurposeCard
            icon={<ImageIcon size={22} color={beardColors.lightText} strokeWidth={1.8} />}
            title="사진 보정"
            desc="설문 없이 사진 속 수염 자국만 빠르게 정리해요."
            meta="바로 촬영 · 결과 저장"
            onPress={pickPhoto}
          />
        </View>
      </ScrollView>
    </View>
  );
}
