// fixtures.ts — demo dataset reproducing the approved HTML's visible state exactly:
// hairline-missing S2 default, S3 mid-face 경계 유보 + lower-face 판정 보류, no legacy badge.
import type { ReportData } from './reportTypes';
import { color } from './reportTokens';

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
    sub: '사진 위 가늠선은 실제 측정 위치를 그대로 옮긴 거예요.',
    photo: { placeholderLabel: '얼굴 전체 정면 컷' },
    hairlineMissing: true,
    hairlineY: 0.16, browY: 0.38, noseBaseY: 0.64, chinY: 0.88,
    lineLabels: { hairline: '이마선', brow: '미간', noseBase: '코밑', chin: '턱끝' },
    hairlineMissingPill: '이마선 미확인',
    hairlineHatchHeight: 0.38,
    upperBandOk: { top: 0.16, height: 0.22 },
    bands: [
      {
        key: 'upper', top: 0, height: 0.38, pillLabel: '상안부', pillY: 0.27, pillCentered: false,
        title: '상안부',
        desc: '이마 · 눈썹 · 눈 — 또렷한 눈매가 시작되는 구획이에요',
        descMissing: '이마선 미확인으로 이번 회차에는 구획하지 못했어요 — 눈썹·눈 분석은 아래 카드에서 볼 수 있어요',
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
      body: '앞머리에 가려 이마선을 찾지 못해, 이번 보고서는 미간·코밑·턱끝 세 지점으로만 구획했어요.',
      cta: '이마가 보이게 다시 찍기 ›',
    },
    viewCardLabel: '카드 보기 ›',
    paragraph: '중안부와 하안부가 자연스럽게 이어지고, 시선이 하안부에 잠시 머무는 인상이에요. 턱끝까지의 흐름이 완만해 전체 윤곽이 부드럽게 읽혀요.',
  },

  s3: {
    eyebrow: 'FEATURES',
    title: '이목구비, 하나씩 설명할게요',
    sub: '확대 사진과 스펙트럼의 마커는 실제 측정 결과가 정한 위치예요.',
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
    season: {
      headline: '여름 뮤트 중심, 겨울 브라이트에 걸쳐요',
      blend: { dominantLabel: '여름 뮤트', secondaryLabel: '겨울 브라이트', dominantRatio: 0.75 },
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
      sub: '아래 색을 탭하면 드레이프처럼 둘러볼 수 있어요 · 다이얼로 조명도 바꿔 보세요',
      photo: { placeholderLabel: '셀피' },
      goodTag: '잘 어울리는 색', badTag: '피할 색',
      goodCaption: '얼굴 주변이 정돈되고 피부 결이 고르게 살아나요',
      badCaption: '색이 얼굴보다 먼저 읽혀서 인상이 살짝 가라앉아 보여요',
      dial: {
        heading: '조명', warm: '웜', cool: '쿨',
        warmCaption: '따뜻한 조명 — 웜하게 보여요',
        neutralCaption: '기준 조명 (진단 기준)',
        coolCaption: '차가운 조명 — 쿨하게 보여요',
      },
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
      disclaimer: '이 결과는 촬영 조명 기준의 상대 진단이에요. 조명이 크게 다르면 결과가 달라질 수 있어요.',
    },
  },

  s5: {
    eyebrow: 'BODY TYPE',
    title: '체형은 설문으로 봤어요',
    silhouettePlaceholder: '실루엣\n일러스트\n(모래시계형)',
    silhouetteLabel: '실루엣 타입', silhouetteValue: '모래시계형',
    skeletonLabel: '골격 타입', skeletonValue: '웨이브',
    surveyNote: '설문 기반 분석 · ', surveyLink: '다시 답하기',
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
    diagramTitle: '시선이 머무는 순서',
    playLabel: '순서 재생', playingLabel: '재생 중…',
    rings: [
      { left: 0.16, right: 0.16, top: 0.27, height: 0.19, dashed: true, color: color.magenta, restFill: 'rgba(255,11,131,0.09)', activeFill: 'rgba(255,11,131,0.3)' },
      { left: 0.28, right: 0.28, top: 0.66, height: 0.15, dashed: false, color: color.accentLight, restFill: 'rgba(110,203,232,0.14)', activeFill: 'rgba(110,203,232,0.4)' },
    ],
    markers: [
      { n: 1, right: 0.02, top: 0.22, color: color.magenta },
      { n: 2, right: 0.12, top: 0.63, color: color.accent },
    ],
    faceGuides: [0.36, 0.64],
    items: [
      { n: 1, color: color.magenta, text: '눈가 — 또렷한 눈매가 먼저 읽혀요' },
      { n: 2, color: color.accent, text: '입가 — 부드러운 곡선이 이어서 보여요' },
    ],
    stepMs: [950, 1150],
    keywords: ['또렷한', '곡선적인', '저대비', '차분한', '온화한'],
    paragraph: '또렷한 눈매가 첫인상을 만들고, 곡선적인 윤곽과 차분한 색감이 그 인상을 부드럽게 감싸요. 대비가 낮은 편이라 강한 색보다는 은은한 색이 얼굴의 흐름을 살려줘요. 체형의 곡선도 같은 결이라, 전체적으로 하나의 무드로 이어지는 타입이에요.',
  },

  s7: {
    eyebrow: 'STYLING',
    title: '같은 얼굴, 두 가지 방향',
    noteParts: [
      { text: '칩이 ' },
      { text: '측정 근거', color: '#0E7DA8', bold: true },
      { text: '면 내 측정 결과에서 나온 제안, ' },
      { text: '아티스트 제안', color: '#5C7480', bold: true },
      { text: '이면 업계 관행 기반이에요.' },
    ],
    naturalLabel: '내추럴', glamLabel: '글램',
    mixZones: {
      nearNatural: '지금 보기 — 내추럴에 가까움',
      middle: '지금 보기 — 두 무드의 중간',
      nearGlam: '지금 보기 — 글램에 가까움',
    },
    lookSummary: {
      natural: { title: '결을 살린 은은한 정돈', desc: '블러셔는 볼 중앙에 둥글게, 아이 포인트는 거의 없이 — 슬라이더를 당기면 포인트가 이동해요' },
      glam: { title: '대비를 한 단계 끌어올리는 무드', desc: '블러셔가 광대 위쪽으로 올라가고, 눈꼬리에 포인트가 실려요 — 립도 베리 쪽으로 깊어져요' },
    },
    naturalCard: {
      chip: '내추럴', variant: 'natural',
      title: '결을 살린 은은한 정돈',
      sub: '가진 곡선과 저대비 톤을 그대로 살리는 방향이에요.',
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
      sub: '저대비 얼굴에 포인트를 더해 또렷함을 키우는 방향이에요.',
      rows: [
        { category: '베이스', title: '광 피니시, 컨투어는 최소로', evidence: 'artist', evidenceLabel: '아티스트 제안', why: '아티스트들은 대비를 색 대신 광으로 올리는 방식을 권해요' },
        { category: '눈썹', title: '꼬리를 살짝 길게', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 눈꼬리 방향과 나란해져 시선이 눈가에 모여요' },
        { category: '아이', title: '눈꼬리에만 딥 브라운 포인트', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 올라간 눈꼬리 방향을 따라가면 인상이 흐트러지지 않아요' },
        { category: '블러셔', title: '광대 위쪽으로 스치듯', evidence: 'artist', evidenceLabel: '아티스트 제안', why: '아티스트들은 글램 무드에 높은 블러셔 위치를 권해요' },
        { category: '립', title: '베리 계열 새틴', evidence: 'measured', evidenceLabel: '측정 근거', why: '왜 나에게 — 겨울 브라이트에 걸친 2차 톤을 립에서만 살짝 빌려와요' },
      ],
    },
  },

  footer: {
    disclaimer: '이 보고서는 이번 촬영 사진 기준의 상대 분석이에요. 조명과 각도가 달라지면 결과도 함께 달라질 수 있어요.',
    cta: '다시 촬영하고 업데이트',
  },
};
