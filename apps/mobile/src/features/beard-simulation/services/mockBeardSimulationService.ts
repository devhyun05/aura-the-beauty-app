import { Image } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import type {
  BeardSimulationResult,
  BeardSimulationService,
  SimulateInput,
} from '../contracts/types';
import { beardTiming } from '../tokens/tokens';

/**
 * Mock implementation of `BeardSimulationService`.
 *
 * Ships with the 4 neutral placeholder assets + prototype timings, and three toggles so
 * every UI state is reachable without a backend:
 *   - generationDelay  → the "평소보다 조금 더 걸리고 있어요" delayed-notice path
 *   - generationFailure → status:'blocked' → the 실패/재촬영 screen
 *   - saveFailure       → saveResultToLibrary rejects → 저장 실패 토스트 + 다시 시도
 *
 * TODO(backend): replace with the real Stage 2 service. The real `simulate` should call the
 * generation engine + face-preservation guard and return the same shape; `saveResultToLibrary`
 * stays as-is (expo-media-library) or moves server-side per final data policy.
 */

// require() → resolved string URIs so the mock honours `imageUri: string` from the contract.
// Null-safe for test/node environments where resolveAssetSource may not be wired.
const asset = (m: number): string => Image.resolveAssetSource?.(m)?.uri ?? String(m);

const PLACEHOLDERS = {
  original: asset(require('../assets/portrait-original.png')),
  natural: asset(require('../assets/portrait-natural.png')),
  noticeable: asset(require('../assets/portrait-noticeable.png')),
  strong: asset(require('../assets/portrait-strong.png')),
};

/** Static asset map also used by screens for demo preview (camera/loading original). */
export const beardPlaceholderAssets = {
  original: require('../assets/portrait-original.png'),
  natural: require('../assets/portrait-natural.png'),
  noticeable: require('../assets/portrait-noticeable.png'),
  strong: require('../assets/portrait-strong.png'),
} as const;

// Analysis payload — verbatim from the prototype. Do not reword (forbidden: 진단/영구제모/회차/효과보장).
const MOCK_ANALYSIS = {
  summarySentences: [
    '턱과 인중을 중심으로 수염 그림자가 모여 있어요.',
    '털의 밀도보다 면도 후 남는 푸른 그림자가 더 눈에 띄는 편이에요.',
  ],
  cells: [
    { k: '수염 타입 요약', v: '그림자 중심' },
    { k: '밀도', v: '중간' },
    { k: '푸른 그림자', v: '두드러지는 편' },
    { k: '주요 분포', v: '턱 · 인중' },
    { k: '촬영 품질', v: '좋음' },
    { k: '원본 보존', v: '확인됨' },
  ],
  consults: [
    '인중과 턱에 남는 푸른 수염 자국이 고민입니다. 제 피부와 수염 상태를 기준으로 어떤 점을 확인해야 하는지 상담받고 싶어요.',
    '면도 후 시간이 지나면 자국이 다시 두드러지는 편인데, 제 상태에서는 어떤 관리 방법을 먼저 알아보면 좋을까요?',
  ],
  tips: [
    '같은 조명과 각도에서 변화 사진을 남겨 보세요.',
    '정면과 45도 사진을 함께 기록하면 비교가 쉬워요.',
    '과도한 사진 필터 없이 비교하는 것이 정확해요.',
    '면도 도구는 청결하게 관리해 주세요.',
    '자극이나 피부 이상이 있을 때는 앱이 판단하지 않아요. 전문가와 상담해 주세요.',
  ],
};

export interface MockConfig {
  /** Adds the delayed-notice window and stretches total latency. */
  generationDelay?: boolean;
  /** Returns status:'blocked' with a guard reason → failure screen. */
  generationFailure?: boolean;
  /** Makes saveResultToLibrary reject. */
  saveFailure?: boolean;
  /** Skip real MediaLibrary permission/save (used in demo/story/test). Default true. */
  useRealMediaLibrary?: boolean;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMockBeardSimulationService(
  config: MockConfig = {},
): BeardSimulationService {
  const {
    generationDelay = false,
    generationFailure = false,
    saveFailure = false,
    useRealMediaLibrary = false,
  } = config;

  return {
    async simulate(input: SimulateInput): Promise<BeardSimulationResult> {
      // Happy path resolves fast so the GeneratingScreen owns the demo cadence; delay/fail
      // stretch it so the delayed-notice / failure paths are exercised. The real backend can
      // return whenever it likes — GeneratingScreen holds a minimum visual duration either way.
      const totalLatency = generationFailure
        ? beardTiming.failToFailure
        : generationDelay
          ? beardTiming.delayToResult
          : 250;
      await wait(totalLatency);

      if (generationFailure) {
        return {
          status: 'blocked',
          inputImageUri: input.imageUri,
          resultImageUri: null,
          guard: {
            passed: false,
            // Drives failure screen problem chips (max 2, non-blaming tone).
            blockedReason: '조명이 어두워요 · 턱선이 프레임 밖에 있어요',
          },
        };
      }

      return {
        status: 'ready',
        inputImageUri: input.imageUri,
        resultImageUri: PLACEHOLDERS.strong,
        analysis: input.path === 'analysis' ? MOCK_ANALYSIS : undefined,
        guard: { passed: true },
      };
    },

    async saveResultToLibrary(uri: string): Promise<void> {
      if (saveFailure) {
        await wait(beardTiming.saveLatency);
        throw new Error('mock: save failed');
      }
      if (!useRealMediaLibrary) {
        await wait(beardTiming.saveLatency);
        return;
      }
      // TODO(backend): confirm final data policy for where the saved image lives.
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        throw new Error('media-library-permission-denied');
      }
      await MediaLibrary.saveToLibraryAsync(uri);
    },
  };
}

/** Default demo instance (happy path, no real media-library writes). */
export const mockBeardSimulationService = createMockBeardSimulationService();

/**
 * Ready result factory for Storybook/tests that need to seed the Result/Report screens
 * directly without walking the whole flow.
 */
export function demoReadyResult(path: 'analysis' | 'photo'): BeardSimulationResult {
  return {
    status: 'ready',
    inputImageUri: PLACEHOLDERS.original,
    resultImageUri: PLACEHOLDERS.strong,
    analysis: path === 'analysis' ? MOCK_ANALYSIS : undefined,
    guard: { passed: true },
  };
}
