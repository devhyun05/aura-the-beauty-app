import React, {useMemo, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {AnalysisCard} from '../components/AnalysisCard';
import {BeforeAfterSlider} from '../components/BeforeAfterSlider';
import {DisclaimerBlock} from '../components/DisclaimerBlock';
import {PreservationChecklist} from '../components/PreservationChecklist';
import {StageTabs} from '../components/StageTabs';
import {REFERENCE_INFO, STAGE_DISPLAY} from '../constants';
import {BEARD_STAGES} from '../types';
import type {BeardSimulationResult, BeardSimulationStage} from '../types';

interface BeardSimulationResultScreenProps {
  beforeUri: string;
  result: BeardSimulationResult;
  onDelete: () => void;
  onRetake: () => void;
}

export function BeardSimulationResultScreen({
  beforeUri,
  result,
  onDelete,
  onRetake,
}: BeardSimulationResultScreenProps) {
  const availableStages = useMemo(
    () => result.stages.map(stageResult => stageResult.stage),
    [result.stages],
  );
  const [selectedStage, setSelectedStage] = useState<BeardSimulationStage>(
    availableStages[0] ?? 'mild',
  );
  const [referenceOpen, setReferenceOpen] = useState(false);

  const selected = result.stages.find(
    stageResult => stageResult.stage === selectedStage,
  );

  const confirmDelete = () => {
    Alert.alert('사진과 결과 삭제', '업로드한 사진과 생성된 결과가 모두 즉시 삭제돼요.', [
      {text: '취소', style: 'cancel'},
      {text: '삭제', style: 'destructive', onPress: onDelete},
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>제모 후 모습 미리보기</Text>

      <StageTabs
        stages={[...BEARD_STAGES]}
        availableStages={availableStages}
        selected={selectedStage}
        onSelect={setSelectedStage}
      />

      {selected ? (
        <>
          <BeforeAfterSlider beforeUri={beforeUri} afterUri={selected.imageRef} />
          <Text style={styles.stageDescription}>
            {STAGE_DISPLAY[selected.stage].description}
          </Text>
          <PreservationChecklist guard={selected.guard} />
        </>
      ) : (
        <View style={styles.noStageBox}>
          <Text style={styles.noStageText}>
            안전 검증을 통과한 단계가 없어 결과를 표시할 수 없어요. 다른 사진으로 다시
            시도해 주세요.
          </Text>
        </View>
      )}

      {result.failures.length > 0 ? (
        <Text style={styles.failureNote}>
          일부 단계는 원본 보존 검증을 통과하지 못해 표시되지 않아요 (
          {result.failures.map(failure => STAGE_DISPLAY[failure.stage].label).join(', ')}).
        </Text>
      ) : null}

      <AnalysisCard analysis={result.analysis} />

      {result.consultQuestions.length ? (
        <View style={styles.consultCard}>
          <Text style={styles.consultTitle}>상담 때 이렇게 물어보세요</Text>
          {result.consultQuestions.map(question => (
            <Text key={question} style={styles.consultQuestion}>
              “{question}”
            </Text>
          ))}
        </View>
      ) : null}

      <DisclaimerBlock disclaimers={result.disclaimers} />

      <Pressable style={styles.referenceToggle} onPress={() => setReferenceOpen(open => !open)}>
        <Text style={styles.referenceToggleLabel}>
          {REFERENCE_INFO.title} {referenceOpen ? '▲' : '▼'}
        </Text>
      </Pressable>
      {referenceOpen ? <Text style={styles.referenceBody}>{REFERENCE_INFO.body}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryLabel}>다른 사진으로</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={confirmDelete}>
          <Text style={styles.deleteLabel}>사진·결과 즉시 삭제</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#fff'},
  content: {padding: 20, paddingBottom: 48, gap: 14},
  title: {fontSize: 20, fontWeight: '700', color: '#1c1c1e'},
  stageDescription: {fontSize: 13, color: '#666', lineHeight: 19},
  noStageBox: {backgroundColor: '#fdf1f1', borderRadius: 14, padding: 16},
  noStageText: {fontSize: 13, color: '#a33', lineHeight: 19},
  failureNote: {fontSize: 12, color: '#a33', lineHeight: 17},
  consultCard: {backgroundColor: '#f2f4fb', borderRadius: 14, padding: 14, gap: 8},
  consultTitle: {fontSize: 12, color: '#4a5a8a'},
  consultQuestion: {fontSize: 13, color: '#333', lineHeight: 19},
  referenceToggle: {paddingVertical: 4},
  referenceToggleLabel: {fontSize: 13, color: '#888'},
  referenceBody: {fontSize: 12, color: '#888', lineHeight: 18},
  actions: {flexDirection: 'row', gap: 10, marginTop: 8},
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f2f4',
    alignItems: 'center',
  },
  secondaryLabel: {fontSize: 14, fontWeight: '600', color: '#333'},
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fdecec',
    alignItems: 'center',
  },
  deleteLabel: {fontSize: 14, fontWeight: '600', color: '#c0392b'},
});
