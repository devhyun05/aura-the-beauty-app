import React, {useCallback, useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  CONSENT_NOTICE,
  GOAL_DISPLAY,
  REGION_DISPLAY,
  SHAVING_STATE_DISPLAY,
} from '../constants';
import {BEARD_GOALS, BEARD_REGIONS, SHAVING_STATES} from '../types';
import type {
  BeardGoal,
  BeardRegion,
  BeardSimulationPhoto,
  BeardSurvey,
  ShavingState,
} from '../types';

interface BeardSimulationInputScreenProps {
  onSubmit: (photo: BeardSimulationPhoto, survey: BeardSurvey) => void;
}

const FREQUENCY_OPTIONS = [0, 3, 7, 14] as const;
const FREQUENCY_LABELS: Record<number, string> = {
  0: '거의 안 함',
  3: '주 2~3회',
  7: '매일',
  14: '하루 2회 이상',
};

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function Question({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.question}>
      <Text style={styles.questionTitle}>{title}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

export function BeardSimulationInputScreen({onSubmit}: BeardSimulationInputScreenProps) {
  const [photo, setPhoto] = useState<BeardSimulationPhoto | null>(null);
  const [shavingState, setShavingState] = useState<ShavingState>('stubble');
  const [goal, setGoal] = useState<BeardGoal>('shadow_reduction');
  const [concernRegions, setConcernRegions] = useState<BeardRegion[]>(['mustache', 'chin']);
  const [shavingFrequencyPerWeek, setShavingFrequency] = useState<number>(7);
  const [makeupCoverUsed, setMakeupCoverUsed] = useState(false);
  const [consultPlanned, setConsultPlanned] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  const pickPhoto = useCallback(async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.9,
    };
    const result = useCamera
      ? await (async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          return permission.granted
            ? ImagePicker.launchCameraAsync(options)
            : null;
        })()
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result && !result.canceled ? result.assets[0] : null;
    if (asset) {
      setPhoto({
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      });
    }
  }, []);

  const toggleRegion = useCallback((region: BeardRegion) => {
    setConcernRegions(current =>
      current.includes(region)
        ? current.filter(item => item !== region)
        : [...current, region],
    );
  }, []);

  const survey = useMemo<BeardSurvey>(
    () => ({
      shavingState,
      goal,
      concernRegions,
      shavingFrequencyPerWeek,
      makeupCoverUsed,
      consultPlanned,
    }),
    [shavingState, goal, concernRegions, shavingFrequencyPerWeek, makeupCoverUsed, consultPlanned],
  );

  const canSubmit = photo !== null && consentGiven && concernRegions.length > 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>제모 후 모습 미리보기</Text>
      <Text style={styles.subtitle}>
        정면 사진 한 장으로 수염이 줄어든 모습을 참고 이미지로 만들어 드려요.
      </Text>

      <View style={styles.photoBox}>
        {photo ? (
          <Image source={{uri: photo.uri}} style={styles.photoPreview} resizeMode="cover" />
        ) : (
          <Text style={styles.photoPlaceholder}>
            밝은 곳에서 정면을 바라본{'\n'}사진을 준비해 주세요
          </Text>
        )}
      </View>
      <View style={styles.photoButtons}>
        <Pressable style={styles.photoButton} onPress={() => pickPhoto(true)}>
          <Text style={styles.photoButtonLabel}>촬영하기</Text>
        </Pressable>
        <Pressable style={styles.photoButton} onPress={() => pickPhoto(false)}>
          <Text style={styles.photoButtonLabel}>앨범에서 선택</Text>
        </Pressable>
      </View>

      <Question title="1. 평소 면도 상태는 어떤가요?">
        {SHAVING_STATES.map(state => (
          <Chip
            key={state}
            label={SHAVING_STATE_DISPLAY[state]}
            selected={shavingState === state}
            onPress={() => setShavingState(state)}
          />
        ))}
      </Question>

      <Question title="2. 어떤 변화가 궁금한가요?">
        {BEARD_GOALS.map(item => (
          <Chip
            key={item}
            label={GOAL_DISPLAY[item]}
            selected={goal === item}
            onPress={() => setGoal(item)}
          />
        ))}
      </Question>

      <Question title="3. 신경 쓰이는 부위를 골라주세요 (복수 선택)">
        {BEARD_REGIONS.map(region => (
          <Chip
            key={region}
            label={REGION_DISPLAY[region]}
            selected={concernRegions.includes(region)}
            onPress={() => toggleRegion(region)}
          />
        ))}
      </Question>

      <Question title="4. 면도 빈도는 어떻게 되나요?">
        {FREQUENCY_OPTIONS.map(frequency => (
          <Chip
            key={frequency}
            label={FREQUENCY_LABELS[frequency]}
            selected={shavingFrequencyPerWeek === frequency}
            onPress={() => setShavingFrequency(frequency)}
          />
        ))}
      </Question>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>5. 메이크업으로 그림자를 커버하고 있어요</Text>
        <Switch value={makeupCoverUsed} onValueChange={setMakeupCoverUsed} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>6. 제모 상담을 받아볼 계획이 있어요</Text>
        <Switch value={consultPlanned} onValueChange={setConsultPlanned} />
      </View>

      <View style={styles.consentBox}>
        {CONSENT_NOTICE.map(line => (
          <Text key={line} style={styles.consentLine}>
            · {line}
          </Text>
        ))}
        <View style={styles.switchRow}>
          <Text style={styles.consentAgree}>위 내용을 확인했어요</Text>
          <Switch value={consentGiven} onValueChange={setConsentGiven} />
        </View>
      </View>

      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        disabled={!canSubmit}
        onPress={() => photo && onSubmit(photo, survey)}>
        <Text style={styles.submitLabel}>시뮬레이션 시작</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#fff'},
  content: {padding: 20, paddingBottom: 48, gap: 14},
  title: {fontSize: 22, fontWeight: '700', color: '#1c1c1e'},
  subtitle: {fontSize: 14, lineHeight: 20, color: '#666'},
  photoBox: {
    height: 220,
    borderRadius: 16,
    backgroundColor: '#f1f2f4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: {width: '100%', height: '100%'},
  photoPlaceholder: {fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 20},
  photoButtons: {flexDirection: 'row', gap: 10},
  photoButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f2f4',
    alignItems: 'center',
  },
  photoButtonLabel: {fontSize: 14, fontWeight: '600', color: '#333'},
  question: {gap: 8, marginTop: 6},
  questionTitle: {fontSize: 14, fontWeight: '600', color: '#1c1c1e'},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#f1f2f4',
  },
  chipSelected: {backgroundColor: '#1c1c1e'},
  chipLabel: {fontSize: 13, color: '#444'},
  chipLabelSelected: {color: '#fff'},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  switchLabel: {flex: 1, fontSize: 14, fontWeight: '600', color: '#1c1c1e'},
  consentBox: {
    backgroundColor: '#fbf4ec',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginTop: 8,
  },
  consentLine: {fontSize: 12, lineHeight: 17, color: '#8a6d3b'},
  consentAgree: {fontSize: 13, fontWeight: '600', color: '#8a6d3b'},
  submit: {
    marginTop: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
  },
  submitDisabled: {backgroundColor: '#c7c7cc'},
  submitLabel: {fontSize: 16, fontWeight: '700', color: '#fff'},
});
