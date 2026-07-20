import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from 'tamagui';
import { ChevronLeft } from 'lucide-react-native';
import type { BeardStackParamList } from '../navigation/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { Chip, SelectRow } from '../components/SurveyControls';
import { canAdvanceSurvey } from '../contracts/surveyRules';
import { beardColors } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'Survey'>;

const V1 = ['푸른 수염 자국을 줄이고 싶어요', '전체적인 수염 밀도를 줄이고 싶어요', '수염이 많이 줄어든 모습을 보고 싶어요'];
const SHAVE = ['면도 직후', '까슬한 수염', '짧게 자란 수염', '비교적 짙은 수염'];
const AREAS = ['인중', '턱', '입 양쪽', '턱선'];
const FREQ = ['매일', '2~3일에 한 번', '가끔'];
const COVER = ['자주 있어요', '가끔 있어요', '아니요'];
const PLAN = ['알아보고 있어요', '고민 중이에요', '아니요'];

function GroupLabel({ children, extra }: { children: string; extra?: string }) {
  return (
    <Text fontSize={13} fontWeight="600" color={beardColors.lightSecondary} mt={26}>
      {children}
      {extra ? <Text fontWeight="400" color={beardColors.lightTertiary}>{` · ${extra}`}</Text> : null}
    </Text>
  );
}

export function SurveyScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { survey, patchSurvey } = useBeardFlow();
  const [step, setStep] = useState(0);

  const progress = useRef(new Animated.Value((step + 1) / 3)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: (step + 1) / 3, duration: 300, useNativeDriver: false }).start();
  }, [step]);

  const canNext = useMemo(() => canAdvanceSurvey(step, survey), [step, survey]);

  const toggleArea = (i: number) =>
    patchSurvey({ areas: survey.areas.includes(i) ? survey.areas.filter((x) => x !== i) : [...survey.areas, i] });

  const onNext = () => {
    if (!canNext) return;
    if (step < 2) setStep(step + 1);
    else nav.navigate('Camera');
  };
  const onBack = () => {
    if (step > 0) setStep(step - 1);
    else nav.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: beardColors.lightBg, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 48 }}>
        <Pressable onPress={onBack} accessibilityLabel="이전" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={22} color={beardColors.lightText} strokeWidth={2} />
        </Pressable>
        <Text flex={1} textAlign="center" fontSize={16} fontWeight="600" color={beardColors.lightText}>
          수염 분석
        </Text>
        <Text width={44} textAlign="center" fontSize={13} color={beardColors.lightSecondary}>
          {step + 1} / 3
        </Text>
      </View>
      {/* Progress */}
      <View style={{ height: 3, backgroundColor: beardColors.lightTrack, marginHorizontal: 24, borderRadius: 99, overflow: 'hidden' }}>
        <Animated.View
          style={{
            height: '100%',
            backgroundColor: beardColors.lightText,
            borderRadius: 99,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 26, paddingBottom: 130 }}>
        {step === 0 ? (
          <>
            <Text fontSize={21} fontWeight="700" color={beardColors.lightText} letterSpacing={-0.3}>
              어떤 변화가 가장 궁금한가요?
            </Text>
            <View style={{ gap: 10, marginTop: 22 }}>
              {V1.map((label, i) => (
                <SelectRow key={i} label={label} selected={survey.a1 === i} onPress={() => patchSurvey({ a1: i })} />
              ))}
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text fontSize={21} fontWeight="700" color={beardColors.lightText} letterSpacing={-0.3}>
              지금 사진과 가까운 상태를 알려주세요.
            </Text>
            <GroupLabel>면도 상태</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
              {SHAVE.map((label, i) => (
                <Chip key={i} label={label} selected={survey.shave === i} onPress={() => patchSurvey({ shave: i })} />
              ))}
            </View>
            <GroupLabel extra="복수 선택">신경 쓰이는 부위</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
              {AREAS.map((label, i) => (
                <Chip key={i} label={label} selected={survey.areas.includes(i)} onPress={() => toggleArea(i)} />
              ))}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text fontSize={21} fontWeight="700" color={beardColors.lightText} letterSpacing={-0.3}>
              평소 관리 습관을 알려주세요.
            </Text>
            <GroupLabel>면도 빈도</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
              {FREQ.map((label, i) => (
                <Chip key={i} label={label} selected={survey.freq === i} onPress={() => patchSurvey({ freq: i })} />
              ))}
            </View>
            <GroupLabel>메이크업으로 수염 자국을 가리나요?</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
              {COVER.map((label, i) => (
                <Chip key={i} label={label} selected={survey.cover === i} onPress={() => patchSurvey({ cover: i })} />
              ))}
            </View>
            <GroupLabel>제모 상담을 계획하고 있나요?</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
              {PLAN.map((label, i) => (
                <Chip key={i} label={label} selected={survey.plan === i} onPress={() => patchSurvey({ plan: i })} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <LinearGradient colors={['rgba(255,255,255,0)', '#FFFFFF']} locations={[0, 0.35]} style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 24) + 8 }}>
          <Pressable
            onPress={onNext}
            disabled={!canNext}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canNext }}
            style={{
              height: 54,
              borderRadius: 999,
              backgroundColor: beardColors.lightText,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canNext ? 1 : 0.35,
            }}
          >
            <Text fontSize={16} fontWeight="600" color="#FFFFFF">
              {step === 2 ? '사진 촬영하기' : '다음'}
            </Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}
