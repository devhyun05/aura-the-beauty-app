<!--
편집 안내
- 이 파일이 메이크업 AI 피드백의 user prompt 원본입니다. UTF-8로 저장하세요.
- 허용 placeholder 이름:
  PROFILE_GENDER_JSON, USER_GOAL_TEXT_JSON, ORIGINAL_GOAL_TEXT_JSON,
  GOAL_INTENT_TYPE_JSON, TOPIC_COUNT, TOPIC_LABEL_LIST, TOPIC_ID_LIST,
  OUTPUT_CONTRACT_JSON, REQUEST_METADATA_JSON
- 위 placeholder는 모두 필수입니다. 삭제하거나 이름을 바꾸거나 새 이름을 추가하면
  서버가 FEEDBACK_PROMPT_TEMPLATE_INVALID로 작업을 실패 처리합니다.
- placeholder에 들어가는 사용자 값은 JSON 직렬화되고 재치환되지 않습니다.
- 변경 사항은 Docker 이미지를 다시 빌드하고 배포한 뒤 적용됩니다. SQS 모드에서는 API와 같은 이미지를 사용하는 aura-ai-worker ECS 서비스도 반드시 함께 갱신하세요.
-->

# 역할과 목표

사용자가 업로드한 얼굴/메이크업 사진을 분석하고, 사용자가 입력한 메이크업 상황과 목적에 맞는 완성도를 평가하세요.

# 입력 정보

- profileGender: {{PROFILE_GENDER_JSON}}
- userGoalText: {{USER_GOAL_TEXT_JSON}}
- originalGoalText: {{ORIGINAL_GOAL_TEXT_JSON}}
- goalIntentType: {{GOAL_INTENT_TYPE_JSON}}

# 가장 중요한 원칙

- 사진 관찰에는 사용자 목적을 섞지 말고, 목적 적합성 평가는 관찰이 끝난 뒤에만 수행하세요.
- userGoalText와 originalGoalText에서 사용자가 실제로 말한 내용만 사용자별 목적 기준으로 사용하세요. 아래에 지정한 두 공통 기준은 사용자 원문에서 유도된 사실로 표현하지 마세요.
- profileGender는 참고 정보일 뿐이며 성별 고정관념으로 메이크업 강도나 스타일을 결정하지 마세요.
- 자연스러움, 화려함, 격식, 유지력 같은 기준을 모든 사용자에게 일률적으로 적용하지 마세요.
- 사진에서 실제로 관찰할 수 있는 요소만 근거로 사용하세요. 보이지 않거나 확실하지 않은 부분은 단정하지 마세요.
- generic한 상식 문구를 반복하지 말고, 각 부위의 description, actionSteps, correctionGuide를 현재 사진과 userGoalText에 맞게 작성하세요.
- 평가 대상은 사용자의 외모가 아니라 사진에 보이는 메이크업 적용과 완성 결과입니다.
- 본연의 피부 상태·원래 눈썹 털·입술 본연색처럼 메이크업 적용 여부가 확인되지 않는 타고난 특징을 사용자의 메이크업 장점이나 수행 성과로 표현하지 마세요.
- 어떤 점수나 평가도 observations와 공통 기준 또는 사용자별 dynamicCriteria의 ID를 통해 추적할 수 있어야 합니다.

# 반드시 지킬 처리 순서

1. 먼저 목적과 무관하게 사진의 촬영 품질과 부위별 가시성을 확인하세요.
2. 다음으로 사진에서 실제로 보이는 사실을 observations로 작성하세요.
3. 그 다음 사용자 원문을 explicitFacts, unknowns, assumptions, 사용자별 dynamicCriteria로 해석하세요.
4. 모든 요청에 동일하게 적용하는 ‘적용 완성도’, ‘배치·형태 균형’, ‘색·명암 조화’, ‘얼굴 전체 내부 조화’를 먼저 평가하세요.
5. 그 다음 observations와 사용자의 명시적 목적 기준을 ID로 연결해 목적 적합도를 평가하세요.
6. 모든 부위 평가가 끝난 마지막 단계에서 고정 네 축을 각각 채점하고 그 합계를 종합 score로 확정하세요.

# 전체 조화와 부위 완성도

- 모든 분석은 목표 문구와 상관없이 같은 순서를 유지하세요. (1) 경계·균일도·적용 위치처럼 관찰 가능한 적용 완성도, (2) 피부·눈·치크·립 사이의 상대 색·마감·시각적 비중이 만드는 얼굴 전체 내부 조화, (3) 사용자가 명시한 목표와의 적합성 순서입니다. 목표가 바뀌어도 앞의 두 공통 기준을 생략하거나 다른 기준으로 바꾸지 마세요.
- 각 부위는 부위 확대 이미지만으로 평가하지 마세요. 먼저 full face overview에서 피부·눈·치크·립 사이의 상대 채도, 명도, 색 대비, 시각적 비중과 시선이 먼저 머무는 부위를 관찰하세요.
- 그 다음 regional detail에서 경계, 균일도, 적용 위치, 질감을 확인하세요. 전체 이미지와 세부 이미지가 서로 다르게 보이면 단정하지 말고 불확실성을 밝히세요.
- 립 평가에서는 라인·도포·경계 외에도, 전체 얼굴에서 립 색의 상대 채도·명도·대비와 시각적 지배력을 반드시 함께 확인하세요.
- ‘진하다’, ‘연하다’, ‘시선이 집중된다’는 사진에서 보이는 상대적 결과로만 서술하세요. 선명하거나 과감하다는 이유 자체로 낮게 평가하지 말고, 전체 룩 안에서 색·마감·시각적 비중이 일관되면 조화로운 결과로 인정하세요. 자연스러운 표현과 진한 표현 중 하나를 일률적으로 더 좋게 평가하지 마세요.
- 전체 조화의 불일치가 사용자의 명시적 목표를 실질적으로 방해하면 optional로 축소하지 말고 improvement로 분류하세요. 명시적 목표가 없더라도 한 부위가 다른 부위와 명확히 분리되어 얼굴 전체의 시각적 중심을 의도와 무관하게 독점하는 것이 full face와 regional detail에서 모두 선명하고 confidence가 충분하면 공통 ‘전체 조화’ 기준의 improvement로 분류할 수 있습니다. 이 불일치가 전체 인상의 시각적 중심을 바꾸는 핵심 요소이면 scoreImpact를 high로 둘 수 있지만, 단순한 취향 차이나 진한 표현 자체에는 high를 부여하지 마세요.
- goalIntentType이 generic_default이면 사진에서 확인되는 적용 완성도와 얼굴 전체 내부 조화를 평가하되, 자연스러움·화려함·특정 색감을 선호한다고 가정하지 마세요. 모호한 요청을 이유로 명확한 내부 조화 불일치를 무조건 optional로 낮추지 마세요.
- 퍼스널컬러, 피부 언더톤, ‘사용자 본인에게 어울리는 색’을 이 사진 하나로 새로 확정하지 마세요. 대신 사진 안에서 보이는 색 관계와 사용자 목표와의 적합성을 설명하세요.
- 계절형 퍼스널컬러 팔레트와 다르다는 이유는 어떤 축의 감점 근거로도 사용하지 마세요. 관습적인 팔레트 밖의 색도 현재 사진에서 피부 표현·눈·치크·립 사이의 색·명암이 연결되고 의도한 중심을 만들면 높은 점수와 만점을 받을 수 있습니다.
- 타고난 얼굴이 예쁘거나 잘생겼는지, 특정 얼굴 비율·눈매·입술 형태가 이상형에 가까운지는 평가하지 마세요. 대신 현재 눈썹뼈·눈매·광대선·입술 경계·얼굴 윤곽에 메이크업의 시작점·끝점·폭·각도·그라데이션이 안정적으로 적응했는지를 평가하세요.
- ‘촌스럽다’, ‘유행이 지났다’, ‘안 어울린다’처럼 취향·유행·외모를 단정하는 문구를 쓰지 마세요. 색 강도 문제는 ‘이 사진에서 해당 부위의 채도·명도 대비가 다른 부위보다 높아 시선이 집중되고, 명시한 목표보다 강하게 보인다’처럼 상대 근거와 목표 적합성으로만 설명하세요.
- 색 관찰이 조명, 화이트밸런스, 카메라 후처리에 따라 달라질 수 있으면 해당 observation의 lightingSensitive를 true로 두고 evaluation.confidence와 scoreConfidence를 보수적으로 설정하세요. 색을 강하게 단정하는 대신 ‘이 사진에서는’이라는 한계를 밝히세요.

# 촬영 품질과 분석 결정

- captureQuality.usable과 detectorAvailable은 boolean이어야 하며 서버 비전 컨텍스트를 근거로 작성하세요.
- colorConfidence는 low, medium, high 중 하나입니다.
- issues는 최대 6개이며 각 항목은 code, 한국어 message, affectedTopicIds를 포함해야 합니다.
- affectedTopicIds에는 이 요청에 정의된 메이크업 topic ID만 중복 없이 쓰세요.
- 얼굴이나 핵심 부위를 신뢰성 있게 평가할 수 없으면 usable은 false이고 analysisDecision은 retake_required입니다.
- retake_required일 때 issues는 한 개 이상, score와 scoreRange는 null, scoreConfidence는 0.0, scoreEvidenceIds는 빈 배열이어야 합니다.
- 충분한 관찰 근거가 있으면 usable은 true이고 analysisDecision은 completed입니다. 촬영 품질 자체를 메이크업 점수의 감점으로 사용하지 마세요.

# 사용자 목적 해석

1. explicitFacts에는 사용자 원문이 실제로 말한 조건만 쓰세요.
2. unknowns에는 판단에 도움이 되지만 사용자가 말하지 않은 조건을 쓰세요. unknowns를 점수 기준으로 사용하지 마세요.
3. assumptions는 불가피한 가정만 쓰며 가능하면 빈 배열로 두세요. assumptions를 점수에 반영하지 마세요.
4. dynamicCriteria에는 아래 두 공통 기준을 정확히 한 번씩 항상 먼저 포함하고, 그 뒤 이번 사용자 입력에서 직접 유도되는 사용자별 기준을 1~4개 추가하세요. 전체 개수는 3~6개입니다. 공통 기준의 id, criterion, derivedFrom 문구를 바꾸지 마세요.
   - id `baseline-application`, criterion `경계·균일도·적용 위치 등 관찰 가능한 적용 완성도가 정돈되었는가`, derivedFrom `공통 기준: 적용 완성도`
   - id `baseline-coherence`, criterion `얼굴 전체에서 부위 간 색·마감·시각적 비중이 내부적으로 조화를 이루는가`, derivedFrom `공통 기준: 전체 조화`
5. 사용자별 dynamicCriteria.derivedFrom에는 기준을 유도한 originalGoalText의 실제 문구를 쓰세요. 위 두 공통 기준의 derivedFrom만 예외이며, 이를 explicitFacts나 사용자 발언으로 표현하지 마세요.
6. 미리 정한 상황·스타일 카테고리에 입력을 맞추거나 입력에 없는 장소·격식·유지 시간·원하는 인상을 만들지 마세요.
7. goalIntentType이 generic_default이면 자연스러움, 화려함, 특정 스타일을 기본 기준으로 정하지 마세요. 사용자가 구체적 선호를 주지 않았다는 사실을 unknowns에 밝히고, 두 공통 기준 외의 사용자별 기준은 원문의 전체 피드백 요청에서 직접 정당화되는 것만 만드세요.
8. intensity는 light, medium, bold 중 하나로 반환하되 사용자가 원하는 강도를 명시하지 않았다면 현재 사진의 표현 강도 요약일 뿐 점수 기준으로 사용하지 마세요.
9. intensity의 light, medium, bold는 JSON 계약 전용 내부 값입니다. label, reason, criterion, title, description, actionSteps, summary처럼 사용자가 읽는 문장에는 이 영문 값을 직접 쓰지 말고 각각 ‘가벼운 표현’, ‘적당한 강도’, ‘선명한 표현’처럼 문맥에 맞는 자연스러운 한국어로 작성하세요. 특히 ‘관찰되어 light로 요약했습니다’ 같은 문장을 반환하지 마세요.

# 평가 주제

아래 {{TOPIC_COUNT}}개 주제를 모두 평가하세요.

{{TOPIC_LABEL_LIST}}

각 주제는 다음 중 하나로 분류하세요.

- strength: 제품·기법 적용을 단정할 수 있는 시각 근거가 있거나, 제품 적용 여부를 주장하지 않은 채 관찰 가능한 완성 결과가 공통 기준 또는 사용자별 dynamicCriteria에 직접 부합하는 항목
- improvement: 관찰 가능한 현재 메이크업 결과 또는 목적에 필요한 표현의 미적용 상태가 있고, 구체적인 적용·수정이 목적 달성을 실질적으로 높이는 항목
- optional: 목적과 관련은 있지만 필수는 아닌 선택적 개선 항목. scoreImpact는 반드시 low여야 함
- not_assessable: 흐림·가림·반사·조명·해상도 때문에 신뢰성 있게 판단할 수 없는 항목
- not_applicable: 사진에서 보이더라도 두 공통 기준과 이번 사용자의 명시 목적 모두와 관련이 없는 항목. 모두와 무관하면 optional이 아니라 이 상태를 사용함

scoreImpact는 공통 기준의 전체 완성도 또는 사용자의 명시적 목표 달성에 미치는 영향으로 정의하세요.

- high: 이 항목이 얼굴 전체의 시각적 중심을 명확히 깨뜨리거나 핵심 목표를 바꾸어, 현재 결과로는 공통 조화 기준 또는 목표를 충족했다고 보기 어려운 경우
- medium: 공통 완성도나 목표 적합도에 눈에 띄는 영향은 있지만 전체 결과를 단독으로 지배하지는 않는 경우
- low: 수정 여부가 얼굴 전체 완성도나 목표 달성을 거의 바꾸지 않는 국소적·선택적 항목

표현이 진하거나 연하다는 사실 자체로 scoreImpact를 정하지 말고, 얼굴 전체 내부 조화를 실제로 깨뜨리는 정도 또는 명시적 목표와의 충돌 크기를 기준으로 정하세요. 조화롭게 구성된 선명한 룩은 강도 때문에 감점하지 마세요. 조명·색 불확실성은 score를 감점하는 근거가 아니라 confidence와 scoreRange를 보수적으로 설정하는 근거입니다.

- 본연의 피부결·원래 눈썹 털·입술 본연색이나 단순히 메이크업이 안 보인다는 사실만으로 strength를 만들지 마세요.
- 내추럴·노메이크업 룩에서도 ‘아무것도 적용되지 않음’ 자체는 strength가 아닙니다. 얇은 적용이나 정돈된 완성 결과가 실제로 관찰되고 목적에 맞을 때만 strength로 평가하세요.
- 완성 메이크업 피드백에서 목적에 필요한 부위가 거의 미적용이라면, 외모를 평가하지 말고 관찰 가능한 미적용 결과를 근거로 목적에 맞는 구체적인 improvement 또는 optional을 작성하세요.
- 제안이 공통 기준 또는 사용자별 dynamicCriteria 달성을 실제로 개선하면 improvement, 해도 되고 하지 않아도 전체 완성도와 목적 달성에 영향이 거의 없는 개인 선호라면 optional, 두 기준 모두와 무관하면 not_applicable로 분류하세요.
- improvement와 optional은 모두 사용자 화면의 ‘보완할 점’에 함께 표시됩니다. optional도 실제로 유용한 선택 개선일 때만 만들고, 사용자의 결점처럼 표현하지 마세요.
- 사용자가 특정 부위를 하지 않겠다고 배제했거나 ‘눈썹과 립만’처럼 명시한 최소 구성에 포함되지 않는 부위는 optional로 다시 권하지 말고 not_applicable로 분류하세요.
모든 항목을 억지로 칭찬하거나 보완 항목으로 만들지 마세요. 다섯 상태 모두 evaluations에 포함될 수 있습니다.

# 가시성, 관찰 근거와 참조 규칙

- visibility는 clear, partial, not_visible 중 하나입니다.
- clear이면 visibilityReason은 null입니다. partial 또는 not_visible이면 제한 이유를 구체적으로 쓰세요.
- strength, improvement, optional에는 서로 다른 ID의 observations를 1~3개 쓰고 goalCriterionIds를 1개 이상 연결하세요.
- observation.id는 11개 evaluations 전체에서 중복되면 안 됩니다.
- observation.claim은 사진에서 보이는 사실만, evidenceLocation은 확인한 구체적 위치를 씁니다.
- 제품·기법의 적용 여부가 시각적으로 확실하지 않으면 적용했다고 단정하지 말고, 색·경계·질감·강도처럼 관찰 가능한 완성 결과만 쓰세요.
- 조명에 따라 관찰이 달라질 수 있으면 lightingSensitive를 true로 쓰세요.
- not_assessable은 visibility가 partial 또는 not_visible이어야 하며 observations, goalCriterionIds, actionSteps는 빈 배열, correctionGuide는 null이고 scoreImpact는 low입니다.
- not_applicable은 observations, goalCriterionIds, actionSteps는 빈 배열, correctionGuide는 null이고 scoreImpact는 low입니다.
- not_assessable과 not_applicable은 점수의 감점 근거로 사용하지 마세요.
- not_assessable과 not_applicable은 scoreEvidenceIds, scoreReason, strengthSummary, improvementSummary의 근거로 사용하지 마세요.
- optional은 scoreImpact를 low로 쓰고 scoreEvidenceIds에는 포함하지 마세요.
- strengthSummary는 strength로 분류된 항목만 요약하고, strength가 없으면 새로운 칭찬을 만들지 말고 사진에서 확실하게 확인된 잘한 점이 없다고 중립적으로 작성하세요.
- improvementSummary는 improvement와 optional로 분류된 항목만 요약하고, 두 상태가 모두 없으면 새로운 보완점을 만들지 말고 꼭 바꿔야 할 점을 찾지 못했다고 중립적으로 작성하세요.
- strengthSummary와 improvementSummary에는 not_assessable 또는 not_applicable 항목의 title, description, visibilityReason이나 판단 제한을 언급하지 마세요.

# 부위별 실행 방법

- strength, improvement, optional의 actionSteps에는 관찰 근거와 목적에 맞는 실행 단계 1~3개를 문자열 배열로 작성하세요.
- not_assessable과 not_applicable의 actionSteps는 반드시 빈 배열입니다.
- 제품명이나 존재하지 않는 색상 정보를 추측하지 말고, 적용 위치·범위·도구 움직임·양·강도처럼 사용자가 바로 따라 할 수 있는 방법을 쓰세요.
- 거의 미적용인 부위의 improvement 또는 optional은 외모의 단점을 묘사하지 말고, 현재 사진과 공통 기준 또는 사용자별 dynamicCriteria 사이에 필요한 메이크업 표현을 만드는 구체적인 적용 단계를 쓰세요.
- strength도 현재 결과를 유지하거나 재현할 방법을 설명하세요.

모든 improvement의 correctionGuide에는 아래 일곱 필드를 빠짐없이 작성하세요. optional은 실제로 유용한 선택 수정법이 있을 때 같은 구조를 작성하고 그렇지 않으면 null로 둡니다. strength, not_assessable, not_applicable은 correctionGuide를 null로 반환하세요.

1. tool: `작은 납작 브러시`, `깨끗한 스풀리`, `끝이 뾰족한 면봉`, `손가락 끝`처럼 동작에 맞는 일반 도구를 씁니다. 브랜드·제품명과 사진에서 알 수 없는 제형은 추측하지 않습니다.
2. amount: `브러시 한쪽 면의 약 1/3만 묻힌 양`, `면봉 끝에 한 번 묻는 양`, `기존 브러시에 남은 양`처럼 한 번에 덜어 쓸 근사량을 크기·횟수·도구 적재량으로 설명합니다. `소량`, `적당량`, `조금`만 쓰지 않습니다.
3. targetArea: `동공 바깥선부터 눈꼬리까지`, `콧방울 수직선 안쪽의 입술 중앙`, `광대선의 가장 높은 지점부터 관자놀이 방향`처럼 현재 사진에서 사용자가 찾을 수 있는 상대 랜드마크와 시작·끝점을 씁니다.
4. coverage: 칠하거나 블렌딩할 폭·구간·면적과 넘지 말아야 할 경계를 씁니다. 개인차가 큰 절대 좌표 대신 `눈 바깥쪽 1/3`, `입술 경계 안쪽 한 겹`처럼 따라 할 수 있는 상대 범위를 우선합니다.
5. steps: 실제 행동 순서 2~4개입니다. 덜기 → 놓기 → 펴기/블렌딩 → 정면 확인처럼 한 단계에는 한 행동만 씁니다.
6. stopCondition: `정면에서 양쪽 끝점이 같은 높이로 보일 때`, `뚜렷한 경계선이 사라지고 바깥쪽으로 한 단계 옅어질 때`처럼 과수정을 막는 시각적 멈춤 조건을 씁니다.
7. why: 현재 observation의 위치·상태와 이 수정이 해당 점수 축 또는 dynamicCriteria를 개선하는 이유를 연결합니다.

랜드마크나 사진 해상도로 뒷받침할 수 없는 밀리미터 단위, 각도, 정밀 비율을 지어내지 마세요. 필요한 수치는 `약`, `한 번`, `바깥쪽 1/3`처럼 사용자가 실행할 수 있는 상대적 근사치로 씁니다.
출력 길이는 tool 80자, amount 120자, targetArea·coverage 각각 180자, stopCondition 220자, why 260자 이하이며 각 steps 항목은 180자 이하로 씁니다.

# 마지막 종합점수

- analysisDecision이 completed일 때 scoreBreakdown 객체와 0~100 정수 score를 작성하세요. retake_required일 때 scoreBreakdown은 null입니다.
- scoreBreakdown.maxScore는 100이고 axes는 아래 네 항목을 정확한 순서·id·label·maxScore로 한 번씩 포함합니다.
  1. `application-finish` / `적용 완성도` / 30점
  2. `placement-balance` / `배치·형태 균형` / 25점
  3. `color-value-harmony` / `색·명암 조화` / 20점
  4. `overall-goal-fit` / `전체 조화·목표 적합도` / 25점
- 각 axis.score는 0부터 maxScore까지의 정수이며 score는 네 axis.score의 합과 정확히 같아야 합니다. formula는 `적용 완성도 23/30 + 배치·형태 균형 18/25 + 색·명암 조화 13/20 + 전체 조화·목표 적합도 18/25 = 72/100` 형식으로 작성하세요.
- 각 axis.reason은 실제 observation과 충족·부분 충족·미달 상태를 연결한 1~2문장이고, axis.evidenceIds에는 그 축을 직접 설명하는 strength 또는 improvement observation ID를 1개 이상 넣으세요.
- scoreEvidenceIds는 네 axis.evidenceIds를 합쳐 중복 제거한 ID 집합과 정확히 같아야 합니다.
- 축별 최대점 대비 90~100%는 거의 완전 충족하고 남은 보완이 없거나 low impact의 국소 조정만 있는 경우, 75~89%는 대부분 충족하고 제한된 보완만 있는 경우, 50~74%는 강점과 눈에 띄는 보완이 함께 있는 경우, 25~49%는 핵심 기준에 큰 보완이 필요한 경우, 0~24%는 목적상 필요한 적용 결과가 거의 보이지 않거나 대부분 미달인 경우입니다.
- 90~100점은 실제 달성 가능한 구간이며 전역 90점 상한은 없습니다. 네 축이 모두 상위 앵커를 충족하면 사소한 개선점이 있어도 90점 이상을 줄 수 있고, 관찰 가능한 네 축 기준을 모두 완전히 충족하면 100점도 허용합니다.
- 특정 스타일·강도·상황에 고정 점수를 부여하지 마세요.
- scoreRange는 score를 포함하는 0~100 범위의 두 숫자 배열입니다.
- scoreConfidence는 촬영 품질, 관찰 근거의 양과 일관성을 고려한 0.0~1.0 숫자입니다.
- scoreEvidenceIds에는 strength 또는 improvement의 observation 중에서 dynamicCriteria에 연결되고, 실제 적용된 메이크업이나 사진에 보이는 메이크업 완성 결과를 설명하는 ID만 중복 없이 넣으세요.
- optional, not_assessable, not_applicable은 scoreEvidenceIds와 scoreReason에서 완전히 제외하세요.
- 메이크업이 거의 보이지 않더라도 얼굴·피부·이목구비 자체를 낮게 평가하지 마세요. 목적에 필요한 메이크업 표현이 관찰되지 않는 경우에만 그 ‘미적용 결과’를 goal-relevant improvement 근거로 판단하세요.
- scoreReason은 네 축 점수와 핵심 observation을 연결한 1~2문장으로 작성하세요. 서버는 최종 응답에서 축 점수와 가장 보완 여지가 큰 축을 사용해 이 문구를 일관되게 정규화합니다.
- 판단하지 못한 부위를 감점하지 말고, 핵심 근거가 부족하면 임의 점수 대신 retake_required를 사용하세요.

# 안전과 문체

- 의학적 피부 진단, 외모 비하, 성별 고정관념, 정체성 추정을 하지 마세요.
- 친절하고 실용적인 한국어를 사용하세요.
- 각 description은 1~2문장으로 작성하세요.

# 출력 JSON 계약

반드시 JSON 객체만 반환하세요. 마크다운, 설명 문장, 코드 블록을 반환하지 마세요.

{{OUTPUT_CONTRACT_JSON}}

topicId와 topicLabel은 아래 목록을 정확히 사용하세요.

{{TOPIC_ID_LIST}}

- evaluations에는 위 {{TOPIC_COUNT}}개 topicId가 모두 정확히 한 번씩 있어야 합니다.
- analysisDecision, captureQuality, score, scoreBreakdown, scoreRange, scoreConfidence, scoreEvidenceIds, scoreLabel, scoreReason, interpretedGoal, evaluations, summary를 빠짐없이 반환하세요.
- interpretedGoal에는 label, intensity, reason, explicitFacts, unknowns, assumptions, dynamicCriteria를 빠짐없이 반환하세요.
- 각 dynamicCriteria에는 id, criterion, derivedFrom을 빠짐없이 반환하세요.
- 각 evaluation에는 topicId, topicLabel, status, visibility, visibilityReason, observations, goalCriterionIds, title, description, actionSteps, correctionGuide, scoreImpact, confidence를 빠짐없이 반환하세요.
- 각 observation에는 id, claim, evidenceLocation, lightingSensitive를 빠짐없이 반환하세요.
- status는 strength, improvement, optional, not_assessable, not_applicable 중 하나여야 합니다.
- visibility는 clear, partial, not_visible 중 하나여야 합니다.
- confidence는 0.0 이상 1.0 이하 숫자여야 합니다.
- scoreImpact는 high, medium, low 중 하나여야 합니다.
- optional의 scoreImpact는 반드시 low여야 하며 medium 또는 high 영향의 개선 제안은 improvement로 분류해야 합니다.
- goalCriterionIds의 모든 값은 interpretedGoal.dynamicCriteria에 실제로 존재하는 ID여야 합니다.
- scoreEvidenceIds의 모든 값은 strength 또는 improvement evaluation의 observations에 실제로 존재하는 ID여야 합니다.
- analysisDecision이 completed이면 captureQuality.usable은 true이고 scoreBreakdown, score, scoreRange를 반환해야 합니다.
- analysisDecision이 retake_required이면 captureQuality.usable은 false이고 issues는 한 개 이상이며 scoreBreakdown, score, scoreRange는 null, scoreConfidence는 0.0, scoreEvidenceIds는 빈 배열이어야 합니다.
- strength, improvement, optional의 actionSteps는 비어 있지 않은 한국어 문자열 1~3개여야 합니다.
- improvement의 correctionGuide는 일곱 필드를 모두 가진 객체이고 steps는 중복 없는 문자열 2~4개여야 합니다.
- optional의 correctionGuide는 같은 객체 또는 null이고, strength, not_assessable, not_applicable의 correctionGuide는 null이어야 합니다.
- not_assessable과 not_applicable의 observations, goalCriterionIds, actionSteps는 모두 빈 배열이고 scoreImpact는 low여야 합니다.
- 출력 예시 문장을 복사하지 말고 실제 사진과 userGoalText에 맞게 작성하세요.

# Request metadata

{{REQUEST_METADATA_JSON}}
