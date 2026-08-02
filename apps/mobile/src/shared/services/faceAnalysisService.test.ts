import {
  hasCompleteBackendReportText,
  resolveFaceAnalysisReportImageSource,
  type BackendAnalysisJob,
} from './faceAnalysisService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalCdnBaseUrl = process.env.EXPO_PUBLIC_CDN_BASE_URL;

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://cdn.example.com/api';

const localCaptureSource = resolveFaceAnalysisReportImageSource(
  {
    detailPayload: {
      request: {
        cdnUrl: 'https://cdn.example.com/uploads/capture/server-face.jpg',
      },
    },
  },
  {
    imageUri: 'file:///tmp/latest-face.jpg',
  },
) as {uri?: string};

expectEqual(
  localCaptureSource.uri,
  'file:///tmp/latest-face.jpg',
  'analysis report image source prefers the just-captured local image',
);

const storedCaptureSource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      cdnUrl: 'https://cdn.example.com/uploads/capture/stored-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  storedCaptureSource.uri,
  'https://cdn.example.com/uploads/capture/stored-face.jpg',
  'analysis report image source restores stored capture cdn url',
);

const objectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/object-key-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  objectKeySource.uri,
  'https://cdn.example.com/uploads/capture/object-key-face.jpg',
  'analysis report image source builds cdn url from stored object key',
);

process.env.EXPO_PUBLIC_CDN_BASE_URL = 'https://media.example.com/';

const explicitCdnObjectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/explicit-cdn-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  explicitCdnObjectKeySource.uri,
  'https://media.example.com/uploads/capture/explicit-cdn-face.jpg',
  'analysis report image source uses explicit cdn base url before api base url',
);

const privateObjectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'private/user-media/users/user-id/capture/media-id.jpg',
    },
  },
});

expectEqual(
  privateObjectKeySource,
  undefined,
  'analysis report image source never reconstructs a public url for private media',
);

const signedPrivateSource = resolveFaceAnalysisReportImageSource({
  sourceMedia: {
    cdnUrl: 'https://private-bucket.s3.amazonaws.com/private/user-media/photo.jpg?X-Amz-Signature=signed',
  },
});

expectEqual(
  (signedPrivateSource as {uri?: string}).uri,
  'https://private-bucket.s3.amazonaws.com/private/user-media/photo.jpg?X-Amz-Signature=signed',
  'analysis report image source accepts a backend-issued signed private url',
);

const completeReportWithoutRecommendedMakeup: BackendAnalysisJob = {
  baseMakeupGuide: '얇고 균일한 베이스',
  faceShape: '계란형',
  personalColor: '여름 뮤트',
  recommendedMood: '차분한 선명함',
  shortSummary: '핵심 요약',
  skinAnalysisSummary: '피부 관찰 요약',
  skinType: '복합성',
  summary: '전체 분석 요약',
  toneSummary: '쿨 · 중간 밝기 · 뮤트',
  detailPayload: {
    result: {
      baseMakeupGuide: '얇고 균일한 베이스',
      faceShape: '계란형',
      personalColor: '여름 뮤트',
      recommendedMood: '차분한 선명함',
      shortSummary: '핵심 요약',
      skinAnalysisSummary: '피부 관찰 요약',
      skinType: '복합성',
      summary: '전체 분석 요약',
      toneSummary: '쿨 · 중간 밝기 · 뮤트',
      makeupGuideline: {
        brow: '눈썹 결을 정돈해요.',
        blush: '볼 중앙에 얇게 펴요.',
        highlight: '얼굴 중앙에 광을 더해요.',
        eyeshadow: '뮤트 음영을 얇게 쌓아요.',
        eyeliner: '점막과 꼬리만 정돈해요.',
        lip: '차분한 립을 중심부터 발라요.',
      },
      regionNotes: {
        upper: {
          insight: '상안부 인상',
          evidence: '눈썹과 눈매 흐름',
          recommendation: '눈썹 결을 살려요.',
        },
        mid: {
          insight: '중안부 인상',
          evidence: '볼과 코의 흐름',
          recommendation: '볼 생기를 연결해요.',
        },
        lower: {
          insight: '하안부 인상',
          evidence: '입술 윤곽',
          recommendation: '립 중심을 또렷하게 해요.',
        },
        jaw: {
          insight: '윤곽 인상',
          evidence: '광대와 턱선 흐름',
          recommendation: '윤곽 음영을 얇게 써요.',
        },
      },
      impressionNotes: {
        overallMood: '차분하고 또렷함',
        keywords: ['차분함', '정돈감', '선명함'],
        paragraph: '측정값과 사진에서 차분하고 정돈된 인상이 보여요.',
        axes: [
          {
            key: 'softness',
            leftLabel: '부드러움',
            rightLabel: '또렷함',
            value: 0.2,
          },
          {
            key: 'vividness',
            leftLabel: '차분함',
            rightLabel: '화사함',
            value: -0.2,
          },
        ],
      },
    },
  },
};

expectEqual(
  hasCompleteBackendReportText(completeReportWithoutRecommendedMakeup),
  true,
  'analysis report text completion no longer requires recommended makeup',
);
expectEqual(
  hasCompleteBackendReportText({
    ...completeReportWithoutRecommendedMakeup,
    detailPayload: {
      ...completeReportWithoutRecommendedMakeup.detailPayload,
      result: {
        ...completeReportWithoutRecommendedMakeup.detailPayload?.result,
        recommendedMakeups: [
          {
            title: '과거 추천',
            subtitle: '호환 카드',
            description: '기존 보고서에 저장된 추천 카드',
            tags: ['과거', '호환'],
          },
        ],
      },
    },
  }),
  true,
  'legacy recommended makeup remains backward compatible',
);

expectEqual(
  hasCompleteBackendReportText({
    ...completeReportWithoutRecommendedMakeup,
    detailPayload: {
      ...completeReportWithoutRecommendedMakeup.detailPayload,
      result: {
        ...completeReportWithoutRecommendedMakeup.detailPayload?.result,
        contentStatus: {
          narrativeStatus: 'failed',
          stylingStatus: 'completed',
          sources: {
            core: 'template',
            narrative: 'template',
            styling: 'llm',
          },
        },
        faceAnalysisV2: {
          perception: null,
          consulting: {summary: '스타일링 결과'},
        },
      },
    },
  }),
  true,
  'detailed V2 report accepts projected fallback when one AI stage failed',
);

process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
process.env.EXPO_PUBLIC_CDN_BASE_URL = originalCdnBaseUrl;
