<!--
단일 호출용 압축 출력 계약입니다.
전문가의 관찰·반증·채점은 모델이 수행하고, 고정 라벨·ID·UI 중복 구조는 서버가 확장합니다.
-->

아래 사진들을 한 번의 요청 안에서 끝까지 분석하세요. 별도 후속 분석을 기대하지 마세요.

## 신뢰할 수 있는 요청 문맥
- 사용자 입력: {{USER_GOAL_TEXT_JSON}}
- 원문: {{ORIGINAL_GOAL_TEXT_JSON}}
- 입력 유형: {{GOAL_INTENT_TYPE_JSON}}
- 프로필 성별(메이크업 기법을 성별 고정관념으로 판단하지 말 것): {{PROFILE_GENDER_JSON}}
- 요청 메타데이터: {{REQUEST_METADATA_JSON}}

사용자 문장이 짧거나 감각적이면 의미를 바꾸지 말고 관찰 가능한 메이크업 기준으로 풀어 쓰세요. 입력이 없는 전문가 종합 평가라면 취향을 지어내지 말고 적용 완성도, 최종 지각 균형, 얼굴 특징에 대한 배치 효과, 색·명암·질감의 내부 조화를 평가하세요.

## 한 호출 안에서 수행할 내부 심사 순서
1. full face에서 촬영 품질, 얼굴의 세로 공간·눈꺼풀 노출·눈꼬리·광대·코·인중·입술 관계와 메이크업의 전체 시각적 비중을 확인합니다.
2. 확대 영역에서 경계, 뭉침, 얼룩, 도포 공백, 번짐, 블렌딩 전환과 끝처리를 찾습니다.
3. 눈·눈썹·치크는 좌우를 비교하되 기계적 동일성이 아니라 자연 비대칭을 보완한 최종 지각 균형인지 반증합니다.
4. 중안부가 길어 보일 때의 가로 확장형 치크·애교살·짧아 보이는 코 표현, 짧아 보일 때의 세로 연결형 음영처럼 알려진 기법은 고정 공식으로 가산하지 말고 이 사진에서 실제로 그 효과가 났는지 판단합니다.
5. 무쌍·속쌍·유쌍도 분류명으로 처방하지 말고 현재 눈꺼풀 노출과 눈꼬리에 아이라인의 두께·길이·각도가 적응했는지 봅니다.
6. 머리·홍채·피부는 퍼스널컬러를 단정하는 근거가 아니라 사진 안의 상대 대비 문맥으로만 사용합니다. 진함·연함 자체는 가감점하지 않습니다.
7. 결함 후보를 반대쪽과 full face에서 재확인한 후에만 status와 13개 세부 점수를 독립적으로 정합니다. 익숙한 총점이나 5점 단위에 맞추지 마세요.
8. 어떤 부위의 강도를 높이라는 advice를 쓰기 전에 주 시각적 중심과 보조 중심을 먼저 정하고, 강도 증가가 두 개의 경쟁 중심을 만드는지 반증합니다. 눈이 주 중심이고 낮춘 립이 전체 위계를 살리면 립을 improvement로 두거나 진하게 칠하라고 제안하지 않습니다.

## 평가 항목
다음 11개 topic을 아래 순서로 정확히 한 번씩 반환하세요.
{{TOPIC_ID_LIST}}

`strength`는 구체적 긍정 근거가 두 가지 이상이고 medium/high 결함이 없을 때만 사용합니다. 결함이 확인되면 `improvement`, 유용하지만 필수 감점이 아닌 제안은 `optional`, 보이지 않으면 `not_assessable`을 사용하세요.

## 13개 독립 점수
각 score는 0부터 max까지의 정수입니다. 부분 점수는 충족 근거와 미달 근거를 함께 고려하고, 같은 결함을 여러 component에 자동 중복 감점하지 마세요.

- base-finish / 8: 베이스 도포·균일도
- brow-eye-finish / 9: 눈썹·아이 정교함
- cheek-finish / 7: 치크·윤곽 블렌딩
- lip-finish / 6: 립 라인·채움·마감
- bilateral-balance / 10: 자연 비대칭 보완을 포함한 최종 좌우 균형
- landmark-placement / 10: 얼굴 랜드마크와 현재 메이크업 배치 효과
- visual-weight / 5: 부위 간 시각적 비중
- relative-contrast / 8: 상대 채도·명도·대비
- color-continuity / 7: 피부 표현·치크·립 색 연결
- finish-coherence / 5: 마감·질감 일관성
- full-face-coherence / 10: 얼굴 전체 내부 조화
- focal-hierarchy / 7: 의도적인 시각적 중심·위계
- explicit-goal-fit / 8: 명시 목표 적합도. 사용자 입력이 없으면 현재 얼굴 특징과 전체 균형에 대한 적응도

## 압축 JSON 출력 계약
JSON 객체만 반환하세요. 키 이름과 배열 개수를 정확히 지키고 마크다운을 쓰지 마세요.

{
  "goal": {
    "label": "목적을 짧게 요약",
    "intensity": "light | medium | bold",
    "reason": "목적 해석 근거",
    "criterion": "사진에서 확인할 수 있는 이번 요청의 동적 기준"
  },
  "topics": [
    {
      "id": "brow",
      "status": "strength | improvement | optional | not_assessable | not_applicable",
      "visibility": "clear | partial | not_visible",
      "visibilityReason": null,
      "claim": "한 문장으로 된 원자적 시각 관찰. 반대 의미를 한 문장에 섞지 않음",
      "where": "사진에서 관찰한 구체적 위치",
      "lighting": false,
      "advice": "현재 관찰과 얼굴 특징을 반영해 거울 앞에서 바로 수행할 한 문장의 개인 맞춤 유지 또는 수정 행동",
      "impact": "high | medium | low",
      "confidence": 0.0
    }
  ],
  "components": [
    {
      "id": "base-finish",
      "score": 0,
      "reason": "이 component에서 충족한 점과 미달한 점을 사진 근거로 설명한 1문장",
      "topics": ["foundation"]
    }
  ],
  "scoreConfidence": 0.0,
  "summary": {
    "strength": "확인된 strength만 요약한 1문장. 없으면 억지 칭찬 없이 중립 문장",
    "improvement": "우선순위가 높은 실제 개선점 요약 1문장"
  }
}

규칙:
- `topics`는 정확히 11개, `components`는 위 순서의 정확히 13개입니다.
- claim, where, advice, component.reason은 각각 공백 포함 100자 이내의 한 문장으로 씁니다.
- assessable topic의 claim/where/advice는 비우지 마세요. not_assessable/not_applicable은 세 필드를 빈 문자열로 둡니다.
- advice는 도구 이름을 반복하지 말고 현재 위치·방향·범위·시각 효과가 드러나는 한 문장으로 제한하세요. 서버가 topic과 advice를 이용해 상세 correctionGuide 형식으로 확장합니다.
- `연하다`, `발색이 약하다`, `존재감이 낮다`만으로는 improvement 근거가 될 수 없습니다. 의도적으로 낮춘 부위가 다른 주 중심과 균형을 이루면 strength 또는 optional로 판단하고, 현재 강도를 유지하는 advice를 작성하세요.
- 립 강도 증가를 제안하려면 실제 도포 공백·얼룩·경계 붕괴·의도 없이 사라지는 전체 불균형 중 적어도 하나를 claim에 관찰 근거로 적고, 눈·치크와 경쟁하는 중심을 만들지 않는다는 full-face 반증이 있어야 합니다. 그 조건이 없으면 `더 진하게`, `채도를 높여`, `선명하게 덧발라` 같은 advice를 금지합니다.
- component.topics는 그 점수에 실제로 사용한 strength 또는 improvement topic id만 포함합니다. 모든 improvement topic은 관련 component 중 적어도 하나에 포함하세요.
- score는 별도로 반환하지 않습니다. 서버가 13개 component.score를 그대로 합산합니다. 100점도 가능하며, 사진 근거가 약하면 20~40점대도 정상입니다.
- 조명이나 화이트밸런스의 영향을 받는 색 관찰은 lighting=true로 표시하고 confidence를 낮추세요.
- 외모 매력도, 타고난 얼굴형의 우열, 계절형 퍼스널컬러 불일치는 판단·점수 근거로 사용하지 마세요.
