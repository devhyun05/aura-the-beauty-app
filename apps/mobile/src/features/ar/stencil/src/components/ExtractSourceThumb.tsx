/**
 * 룩 추출 원본 사진 썸네일 + 확대 모달 (검증용) — 갤러리 사진 1장에서 부위색을 측정해
 * 컴포저 룩을 만드는 "룩 추출(#1)" 실행 시, 추출에 쓴 원본 사진을 화면 구석에 작은
 * 썸네일로 상시 표시하고, 탭하면 전체화면으로 확대해 추출 결과 색과 원본을 나란히 비교한다.
 *
 * 배치: 좌상단 모서리(우측 도구 레일·하단 컴포저 시트와 겹치지 않음). URI가 없으면
 * (한 번도 추출 안 함) 아무것도 그리지 않는다. 순수 표시 컴포넌트 — URI 저장은 App이 담당.
 */
import React, {useState} from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

interface Props {
  /** 마지막 추출에 쓴 원본 사진 로컬 URI (null이면 미표시) */
  uri: string | null;
  /** 세이프에어리어 기준 top 오프셋(App에서 insets.top + 8 전달) */
  topOffset: number;
}

export default function ExtractSourceThumb({uri, topOffset}: Props) {
  const [expanded, setExpanded] = useState(false);

  // 한 번도 추출하지 않았으면 썸네일·모달 모두 미표시.
  if (!uri) {
    return null;
  }

  return (
    <>
      {/* 썸네일 — 좌상단 모서리. 탭하면 전체화면 확대. */}
      <TouchableOpacity
        style={[styles.thumbWrap, {top: topOffset}]}
        activeOpacity={0.8}
        onPress={() => setExpanded(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="추출 원본 사진 크게 보기"
        testID="extract-source-thumb">
        <Image source={{uri}} style={styles.thumb} resizeMode="cover" />
        <Text style={styles.badge}>원본</Text>
      </TouchableOpacity>

      {/* 확대 모달 — 반투명 배경 위 contain 사진. 배경/사진 탭 또는 ✕로 닫기. */}
      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setExpanded(false)}
          accessibilityLabel="닫기">
          <Image source={{uri}} style={styles.full} resizeMode="contain" />
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setExpanded(false)}
            hitSlop={16}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbWrap: {
    position: 'absolute',
    left: 12,
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {
    width: '92%',
    height: '82%',
  },
  closeBtn: {
    position: 'absolute',
    top: 44,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  closeTxt: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
