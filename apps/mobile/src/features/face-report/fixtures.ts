// fixtures.ts — demo dataset reproducing the approved HTML's visible state exactly:
// hairline-missing S2 default, S3 mid-face 경계 유보 + lower-face 판정 보류, no legacy badge.
import type { ReportData } from './reportTypes';

export const demoReport: ReportData = {
  topBarTitle: '얼굴 분석 보고서',

  s1: {
    photo: { placeholderLabel: '분석 셀피' },
    dateLine: '2026년 7월 17일 · 3회차 분석',
    headline: '부드러운 곡선형 · 여름 뮤트',
    body: '전체적으로 곡선이 부드럽게 이어지는 얼굴이에요. 차분한 색감과 은은한 대비가 편안하고 정돈된 분위기를 만들어요.',
    legacyReport: false,
    legacyBadge: '이 판정은 이전 기준으로 측정된 결과예요',
    cards: [
      { label: '얼굴형', value: '타원형 우세 · 곡선' },
      { label: '퍼스널컬러', value: '여름 뮤트 중심' },
      { label: '대비 인상', value: '저대비 · 부드러움' },
      { label: '추천 무드', value: '은은한 정돈' },
    ],
  },

  s2: {
    eyebrow: 'PROPORTION',
    title: '얼굴의 구획부터 볼게요',
    sub: '세로 구획을 보면 얼굴에서 어느 부위가 상대적으로 강조되는지 알 수 있어요.',
    photo: { placeholderLabel: '얼굴 전체 정면 컷' },
    hairlineMissing: true,
    hairlineY: 0.16, browY: 0.38, noseBaseY: 0.64, chinY: 0.88,
    lineLabels: { hairline: '헤어라인', brow: '미간', noseBase: '코밑', chin: '턱끝' },
    hairlineMissingPill: '헤어라인 미확인',
    hairlineHatchHeight: 0.38,
    upperBandOk: { top: 0.16, height: 0.22 },
    bands: [
      {
        key: 'upper', top: 0, height: 0.38, pillLabel: '상안부', pillY: 0.27, pillCentered: false,
        title: '상안부',
        desc: '이마 · 눈썹 · 눈 — 또렷한 눈매가 시작되는 구획이에요',
        descMissing: '헤어라인 미확인으로 이번 회차에는 구획하지 못했어요 — 눈썹·눈 분석은 아래 카드에서 볼 수 있어요',
      },
      {
        key: 'mid', top: 0.38, height: 0.26, pillLabel: '중안부', pillY: 0.51, pillCentered: true, restingTint: true,
        title: '중안부', desc: '코 · 인중 · 볼 — 완만한 곡선이 이어지는 구획이에요',
      },
      {
        key: 'lower', top: 0.64, height: 0.24, pillLabel: '하안부', pillY: 0.76, pillCentered: true,
        title: '하안부', desc: '입술 · E라인 — 시선이 잠시 머무는 구획이에요',
      },
    ],
    missingNotice: {
      title: '헤어라인이 확인되지 않았어요',
      body: '앞머리에 가려 헤어라인을 찾지 못해, 이번 보고서는 미간·코밑·턱끝 세 지점으로만 구획했어요.',
      cta: '이마가 보이게 다시 찍기 ›',
    },
    viewCardLabel: '카드 보기 ›',
    paragraph: '중안부와 하안부가 자연스럽게 이어지고, 시선이 하안부에 잠시 머무는 인상이에요. 턱끝까지의 흐름이 완만해 전체 윤곽이 부드럽게 읽혀요.',
  },

  s3: {
    eyebrow: 'FEATURES',
    title: '이목구비, 하나씩 설명할게요',
    sub: '눈매·눈썹·입술·턱선의 방향을 보면 전체 인상과 어울리는 메이크업 균형을 알 수 있어요.',
    cards: [
      {
        key: 'upper', regionChip: '상안부', regionTitle: '이마 · 눈썹 · 눈',
        photo: { placeholderLabel: '눈가 확대 컷' },
        guide: { kind: 'slantLine', from: { x: 0.12, y: 0.52 }, length: 0.52, angleDeg: -7, marker: { x: 0.63, y: 0.44 } },
        guideLabel: '눈꼬리 기울기 선', guideLabelX: 0.12,
        axes: [
          { leftLabel: '내려간 눈꼬리', rightLabel: '올라간 눈꼬리', state: { kind: 'point', position: 0.64 } },
          { leftLabel: '좁은 눈 사이', rightLabel: '넓은 눈 사이', state: { kind: 'point', position: 0.47 }, caption: '평균에 가까운 간격이에요' },
        ],
        whatIf: {
          axisIndex: 0,
          config: {
            zones: [
              { upTo: 0.38, text: '눈꼬리가 내려가 부드럽고 순한 인상으로 읽혔을 거예요.' },
              { upTo: 0.58, text: '평균 구간이라 단정하고 차분한 인상에 가까웠을 거예요.' },
              { upTo: 0.8, text: '지금 내 위치와 같은, 또렷한 인상 구간이에요.' },
              { upTo: 1, text: '여기까지 올라가면 또렷함을 지나 날카로운 인상으로 읽히기 시작해요.' },
            ],
            idleCaption: '올라간 쪽에 조금 더 가까워요 · 트랙을 끌면 "만약에" 위치를 볼 수 있어요',
            prefix: '만약 여기라면',
            resetLabel: '원래대로',
          },
        },
        paragraph: '눈꼬리가 살짝 올라가 있어 또렷한 인상을 줘요. 눈 사이 간격은 평균에 가까워 균형이 좋아요. 눈꼬리 각도와 눈 사이 간격을 함께 보면, 시선이 눈가에 먼저 머무는 편이에요.',
      },
      {
        key: 'mid', regionChip: '중안부', regionTitle: '코 · 인중 · 볼',
        photo: { placeholderLabel: '코·인중 확대 컷' },
        guide: { kind: 'dashedVertical', x: 0.44, top: 0.18, height: 0.58 },
        guideLabel: '콧대 중심선', guideLabelX: 0.5,
        axes: [
          {
            leftLabel: '짧은 인중', rightLabel: '긴 인중', state: { kind: 'band', start: 0.5, width: 0.26 },
            statusChip: '경계 유보', caption: '촬영 오차 구간이 판정 경계에 걸쳐 있어요 — 평균과 긴 쪽 사이로 보여요',
          },
          { leftLabel: '완만한 콧대', rightLabel: '뚜렷한 콧대', state: { kind: 'point', position: 0.42 }, caption: '완만한 쪽에 조금 더 가까워요' },
        ],
        paragraph: '콧대의 흐름이 완만해서 얼굴 전체의 곡선 인상과 잘 이어져요. 볼의 볼륨이 은은하게 남아 있어 중안부가 편안하게 읽히는 편이에요.',
      },
      {
        key: 'lower', regionChip: '하안부', regionTitle: '입술 · E라인',
        photo: { placeholderLabel: '입술 확대 컷' },
        guide: { kind: 'ellipse', cx: 0.5, cy: 0.56, rx: 0.24, ry: 0.08, dashed: false },
        guideLabel: '입술 라인', guideLabelX: 0.26,
        axes: [
          { leftLabel: '얇은 입술', rightLabel: '도톰한 입술', state: { kind: 'point', position: 0.68 }, caption: '도톰한 쪽에 가까워요' },
          {
            leftLabel: '들어간 E라인', rightLabel: '나온 E라인', state: { kind: 'withheld' },
            statusChip: '판정 보류', caption: '옆모습 각도를 확인하지 못해 판정을 보류했어요 — 측면이 살짝 보이게 찍으면 볼 수 있어요',
          },
        ],
        paragraph: '입술의 볼륨이 도톰한 편이라 하안부에 부드러운 존재감이 있어요. 입꼬리의 곡선이 완만해서 표정이 없어도 온화하게 읽히는 인상이에요.',
      },
      {
        key: 'jaw', regionChip: '외곽 라인', regionTitle: '광대 · 턱',
        photo: { placeholderLabel: '턱 라인 확대 컷' },
        guide: { kind: 'ellipse', cx: 0.5, cy: 0.9, rx: 0.32, ry: 0.6, dashed: true },
        guideLabel: '턱 곡선 가이드', guideLabelX: 0.18, guideLabelAlign: 'right',
        blend: {
          label: '얼굴형 블렌드', dominantLabel: '타원형 우세', secondaryLabel: '둥근형', dominantRatio: 0.65,
          caption: '타원형 특징이 우세하고, 둥근형 특징이 함께 보여요',
        },
        axes: [
          { leftLabel: '각진 턱', rightLabel: '둥근 턱', state: { kind: 'point', position: 0.71 }, caption: '둥근 쪽에 가까워요' },
        ],
        paragraph: '광대에서 턱끝으로 내려오는 선이 끊김 없이 이어져요. 턱끝의 둥근 곡선이 전체 윤곽을 부드럽게 마무리해서, 곡선형 인상의 중심이 되는 부위예요.',
      },
    ],
  },

  s4: {
    eyebrow: 'PERSONAL COLOR',
    title: '색은 이렇게 어울려요',
    sub: '피부와 이목구비의 색 관계를 보면 얼굴을 맑게 살리는 색을 찾을 수 있어요.',
    season: {
      headline: '여름 뮤트 중심, 겨울 브라이트에 걸쳐요',
    },
    toneProbabilities: [
      {type: 'summer_muted', label: '여름 뮤트', ratio: 0.28},
      {type: 'winter_bright', label: '겨울 브라이트', ratio: 0.2},
      {type: 'summer_true', label: '여름 트루', ratio: 0.12},
      {type: 'winter_true', label: '겨울 트루', ratio: 0.1},
      {type: 'summer_light', label: '여름 라이트', ratio: 0.08},
      {type: 'winter_deep', label: '겨울 딥', ratio: 0.06},
      {type: 'spring_bright', label: '봄 브라이트', ratio: 0.05},
      {type: 'autumn_muted', label: '가을 뮤트', ratio: 0.04},
      {type: 'spring_light', label: '봄 라이트', ratio: 0.03},
      {type: 'autumn_true', label: '가을 트루', ratio: 0.02},
      {type: 'spring_true', label: '봄 트루', ratio: 0.01},
      {type: 'autumn_deep', label: '가을 딥', ratio: 0.01},
    ],
    toneMap: {
      caption: '12타입 prototype과의 가까움이에요. 굵은 영역이 현재 결과가 걸쳐 있는 톤 범위예요.',
      area: {x: 0.12, y: 0.36, w: 0.82, h: 0.26},
      points: [
        {type: 'spring_light', label: '봄 라이트', x: 0.62, y: 0.22, weight: 0.03, active: false},
        {type: 'spring_bright', label: '봄 브라이트', x: 0.78, y: 0.38, weight: 0.05, active: false},
        {type: 'spring_true', label: '봄 트루', x: 0.68, y: 0.46, weight: 0.01, active: false},
        {type: 'summer_light', label: '여름 라이트', x: 0.36, y: 0.22, weight: 0.08, active: false},
        {type: 'summer_true', label: '여름 트루', x: 0.28, y: 0.44, weight: 0.12, active: true},
        {type: 'summer_muted', label: '여름 뮤트', x: 0.2, y: 0.54, weight: 0.28, active: true},
        {type: 'autumn_muted', label: '가을 뮤트', x: 0.28, y: 0.68, weight: 0.04, active: false},
        {type: 'autumn_true', label: '가을 트루', x: 0.56, y: 0.68, weight: 0.02, active: false},
        {type: 'autumn_deep', label: '가을 딥', x: 0.66, y: 0.84, weight: 0.01, active: false},
        {type: 'winter_bright', label: '겨울 브라이트', x: 0.86, y: 0.54, weight: 0.2, active: true},
        {type: 'winter_true', label: '겨울 트루', x: 0.76, y: 0.66, weight: 0.1, active: true},
        {type: 'winter_deep', label: '겨울 딥', x: 0.8, y: 0.86, weight: 0.06, active: false},
      ],
    },
    axes: [
      { leftLabel: '따뜻한 톤', rightLabel: '차가운 톤', axisLabel: '온도', state: { kind: 'point', position: 0.66 } },
      { leftLabel: '어두운 편', rightLabel: '밝은 편', axisLabel: '명도', state: { kind: 'point', position: 0.6 } },
      { leftLabel: '은은한 채도', rightLabel: '선명한 채도', axisLabel: '채도', state: { kind: 'point', position: 0.32 } },
      { leftLabel: '부드럽게 섞인', rightLabel: '맑게 트인', axisLabel: '청탁', state: { kind: 'point', position: 0.38 } },
      { leftLabel: '저대비', rightLabel: '고대비', axisLabel: '대비', state: { kind: 'point', position: 0.28 } },
    ],
    drape: {
      title: '직접 입혀 보세요',
      sub: '아래 색을 탭하면 드레이프처럼 얼굴에 대볼 수 있어요',
      photo: { placeholderLabel: '셀피' },
      goodTag: '잘 어울리는 색', badTag: '피할 색',
      goodCaption: '얼굴 주변이 정돈되고 피부 결이 고르게 살아나요',
      badCaption: '색이 얼굴보다 먼저 읽혀서 인상이 살짝 가라앉아 보여요',
      goodTitle: '잘 어울리는 색',
      badTitle: '피하면 좋은 색',
      goodSwatches: [
        { name: '더스티 로즈', color: '#C98A9B' },
        { name: '라벤더', color: '#9D93C4' },
        { name: '파우더 블루', color: '#8FB6CC' },
        { name: '세이지', color: '#9DB5A4' },
        { name: '모브', color: '#A97D91' },
        { name: '그레이 네이비', color: '#6E7E96' },
        { name: '로즈 베이지', color: '#D8B3B0' },
        { name: '소프트 플럼', color: '#8E7A99' },
      ],
      badSwatches: [
        { name: '마리골드', color: '#E0902F' },
        { name: '카멜', color: '#B07B3F' },
        { name: '올리브', color: '#7F7C33' },
        { name: '토마토 레드', color: '#D2472E' },
      ],
      initialSwatch: { name: '더스티 로즈', color: '#C98A9B', good: true },
      disclaimer: '촬영 조명 기준 상대 진단이에요. 조명이 다르면 결과가 달라질 수 있어요.',
    },
  },

  s5: {
    eyebrow: 'BODY TYPE',
    title: '체형은 설문으로 봤어요',
    sub: '체형 특성을 알면 옷의 핏과 비율을 더 자연스럽게 고를 수 있어요.',
    silhouettePlaceholder: '실루엣\n일러스트\n(모래시계형)',
    silhouetteLabel: '실루엣 타입', silhouetteValue: '모래시계형',
    skeletonLabel: '골격 타입', skeletonValue: '웨이브',
    surveyNote: '체형 설문 기반 · ', surveyLink: '다시 답하기',
    doTitle: '이렇게 입어보세요',
    doItems: [
      '허리선이 살아 있는 상의 — 실루엣의 곡선을 그대로 살려요',
      '부드럽고 흐르는 소재 — 웨이브 골격의 결과 잘 어울려요',
      '밝은 톤 상의로 시선을 위로 — 얼굴의 저대비 인상과 이어져요',
    ],
    avoidTitle: '이건 피해도 좋아요',
    avoidItems: [
      '박시한 일자 핏 — 허리 곡선이 사라져 답답해 보일 수 있어요',
      '두껍고 뻣뻣한 소재 — 골격의 부드러운 결과 어긋나요',
    ],
  },

  s6: {
    eyebrow: 'IMPRESSION',
    title: '모아 보면 이런 인상이에요',
    sub: '이목구비와 윤곽을 함께 보면 얼굴에서 먼저 느껴지는 분위기를 알 수 있어요.',
    axes: [
      { key: 'softness', leftLabel: '부드러움', rightLabel: '또렷함', value: 0.3 },
      { key: 'vividness', leftLabel: '차분함', rightLabel: '화사함', value: -0.2 },
    ],
    keywords: ['또렷한', '곡선적인', '저대비', '차분한', '온화한'],
    paragraph: '또렷한 눈매가 첫인상을 만들고, 곡선적인 윤곽과 차분한 색감이 그 인상을 부드럽게 감싸요. 대비가 낮은 편이라 강한 색보다는 은은한 색이 얼굴의 흐름을 살려줘요. 체형의 곡선도 같은 결이라, 전체적으로 하나의 무드로 이어지는 타입이에요.',
  },

  s7: {
    eyebrow: 'STYLING',
    title: '같은 얼굴, 두 가지 방향',
    naturalCard: {
      chip: '내추럴', variant: 'natural',
      title: '결을 살린 은은한 정돈',
      rows: [
        { category: '베이스', title: '얇게 여러 번, 세미매트 피니시', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 은은한 저대비 톤이라 두꺼운 커버보다 결이 보이는 베이스가 어울려요' },
        { category: '눈썹', title: '결 정리 후 빈 곳만 채우기', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 눈썹 산이 완만해서 각을 만들지 않는 편이 자연스러워요' },
        { category: '아이', title: '라인 없이 톤업 섀도 한 겹', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 눈꼬리가 이미 올라가 있어 라인 없이도 또렷해요' },
        { category: '블러셔', title: '볼 중앙에 둥글게', evidence: 'artist', evidenceLabel: '아티스트 제안', why: '아티스트들은 곡선형 얼굴에 둥근 블러셔 터치를 권해요' },
        { category: '립', title: '로지 뮤트 MLBB', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 여름 뮤트 팔레트와 같은 톤이라 얼굴이 정돈돼 보여요' },
      ],
    },
    glamCard: {
      chip: '글램', variant: 'glam',
      title: '대비를 한 단계 끌어올리는 무드',
      rows: [
        { category: '베이스', title: '광 피니시, 컨투어는 최소로', evidence: 'artist', evidenceLabel: '아티스트 제안', why: '아티스트들은 대비를 색 대신 광으로 올리는 방식을 권해요' },
        { category: '눈썹', title: '꼬리를 살짝 길게', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 눈꼬리 방향과 나란해져 시선이 눈가에 모여요' },
        { category: '아이', title: '눈꼬리에만 딥 브라운 포인트', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 올라간 눈꼬리 방향을 따라가면 인상이 흐트러지지 않아요' },
        { category: '블러셔', title: '광대 위쪽으로 스치듯', evidence: 'artist', evidenceLabel: '아티스트 제안', why: '아티스트들은 글램 무드에 높은 블러셔 위치를 권해요' },
        { category: '립', title: '베리 계열 새틴', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 겨울 브라이트에 걸친 2차 톤을 립에서만 살짝 빌려와요' },
      ],
    },
  },

  s8: {
    eyebrow: 'SKIN',
    title: '피부는 이렇게 보여요',
    sub: '사진에서 관찰 가능한 피부 부면을 항목별로 정리했어요.',
    aspects: [
      { key: 'texture', heading: '피부결', label: '매끄러운 편', description: '전반적으로 매끄럽고 미세한 요철이 적어요.' },
      { key: 'pores', heading: '모공', label: '미세모공', description: 'T존에 미세한 모공이 관찰돼요.' },
      { key: 'sebumDryness', heading: '유수분', label: '복합성', description: 'T존은 약간 유분기, 볼은 중성에 가까워요.' },
      { key: 'shineDistribution', heading: '유분 분포', label: 'T존 중심', description: '이마와 코 부위에 광이 집중돼요.' },
      { key: 'shineType', heading: '광 타입', label: '자연광', description: '번들거림보다 은은한 윤기에 가까워요.' },
      { key: 'pigmentation', heading: '색소', label: '옅은 편', description: '두드러진 색소 침착은 관찰되지 않아요.' },
      { key: 'redness', heading: '붉은기', label: '약한 붉은기', description: '볼과 코 주변에 자연스러운 혈색이 있어요.' },
      { key: 'darkCircles', heading: '다크서클', label: '옅은 그림자', description: '눈 아래 경미한 그림자가 관찰돼요.' },
      { key: 'toneUniformity', heading: '톤 균일감', label: '고른 편', description: '부위 간 톤 차이가 크지 않아요.' },
    ],
  },

  s9: {
    eyebrow: 'STYLE',
    title: '세 가지 방향으로 스타일을 추천해요',
    sub: '같은 얼굴도 전략에 따라 달라져요 — 균형·동안·개성 강조 중 취향에 맞게 골라 보세요.',
    lanes: [
      {
        laneKey: 'balance',
        chip: '균형',
        title: '지금의 균형을 자연스럽게 정돈',
        description: '이목구비가 고르게 분포해, 전체를 은은하게 다듬어 균형을 유지하는 방향이에요.',
        moves: [
          { region: '눈', note: '자연스러운 라인으로 또렷함만 더해요.' },
          { region: '볼', note: '얼굴 안쪽으로 은은하게 — 튀지 않는 혈색.' },
          { region: '립', note: 'MLBB 톤으로 차분하게 마무리해요.' },
        ],
      },
      {
        laneKey: 'youthful',
        chip: '동안',
        title: '중안부는 짧게, 볼엔 생기',
        description: '볼을 눈밑 가까이 올려 시선을 얼굴 중앙으로 모아 어려 보이게 하는 방향이에요.',
        moves: [
          { region: '볼', note: '눈밑에 가깝게 높이 — 중안부를 짧아 보이게.' },
          { region: '눈', note: '아래 눈꺼풀에 은은한 음영으로 애교살 느낌을 더해요.' },
          { region: '립', note: '중앙만 톡 물들이는 그라데이션으로 어린 느낌.' },
        ],
      },
      {
        laneKey: 'accent',
        chip: '개성 강조',
        title: '눈을(를) 주인공으로',
        description: '한 곳에 포인트를 집중하는 원포인트 전략이에요. 시선을 가장 오래 끄는 눈을(를) 주인공으로, 나머지는 덜어냈어요.',
        moves: [
          { region: '눈', note: '색과 대비를 끌어올려 이 부위를 확실한 주인공으로.' },
          { region: '립', note: '톤을 낮춰 강조 부위와 경쟁하지 않게 절제.' },
          { region: '베이스', note: '매끈하게만 정돈해 포인트가 더 도드라지게.' },
        ],
      },
    ],
  },

  footer: {
    disclaimer: '이 보고서는 이번 촬영 사진 기준의 상대 분석이에요. 조명과 각도가 달라지면 결과도 함께 달라질 수 있어요.',
    cta: '다시 촬영하고 업데이트',
  },
};
