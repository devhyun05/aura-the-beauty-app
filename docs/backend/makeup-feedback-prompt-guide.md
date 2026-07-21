# 메이크업 AI 피드백 프롬프트 편집 가이드

실제 Bedrock 호출에 쓰이는 프롬프트는 다음 네 UTF-8 Markdown 파일입니다.

- `services/backend/app/services/prompts/makeup_feedback_system.md`: 모델 역할과 공통 안전 원칙
- `services/backend/app/services/prompts/makeup_feedback_user.md`: 평가·점수·부위별 메이크업 방법·JSON 출력 계약
- `services/backend/app/services/prompts/makeup_feedback_conference_preview.md`: 사진 분석과 동시에 만드는 4~6개 준비 대화의 말투·관점·흐름
- `services/backend/app/services/prompts/makeup_feedback_conference.md`: 분석 결과를 근거로 이어지는 AURA 리뷰 크루의 말투·캐릭터·대화 흐름

## 편집 방법

1. 문구와 평가 기준은 Markdown 파일에서 직접 수정합니다.
2. user 템플릿 상단에 적힌 placeholder 이름은 삭제하거나 바꾸지 않습니다.
3. 로컬에서 아래 테스트를 실행합니다.

```powershell
cd services/backend
python -m pytest -q tests/test_makeup_feedback_analysis.py tests/test_makeup_feedback_conference.py tests/test_makeup_feedback_conference_preview.py
```

4. 프롬프트 파일은 Docker 이미지의 `app` 디렉터리에 포함되므로 변경 후 이미지를 다시 빌드하고 배포해야 합니다. `AI_JOB_EXECUTION_MODE=sqs` 환경에서는 API 서비스만 교체하면 안 되며, 같은 새 이미지를 사용하는 `aura-ai-worker` ECS 서비스도 함께 갱신해야 실제 Bedrock 호출에 새 프롬프트가 적용됩니다.

dev가 `AI_JOB_EXECUTION_MODE=sqs`를 사용하면 Bedrock 호출은 API가 아니라 AI worker에서 실행됩니다. 따라서 API와 AI worker를 반드시 같은 backend 이미지로 배포해야 합니다. `.github/workflows/deploy-backend-ecs.yml`에서 worker 자동 배포를 사용하려면 GitHub repository variable에 `AI_WORKER_SERVICE=aura-ai-worker`를 설정하세요. 필요하면 `AI_WORKER_TASK_DEFINITION`과 `AI_WORKER_CONTAINER_NAME`도 환경에 맞게 지정할 수 있습니다.

renderer는 placeholder를 한 번만 치환합니다. 사용자 입력에 placeholder와 같은 문자열이 포함돼도 다시 해석하지 않으며, 필수 placeholder 누락·알 수 없는 이름·깨진 중괄호는 해당 프롬프트 템플릿 오류로 작업을 실패시킵니다.

## 세 AI 호출의 역할 차이

점수와 실제 피드백은 기존 분석 프롬프트의 Bedrock 호출 한 번에서만 결정합니다. 이 응답에서 사진 관찰, 동적 목적 기준, 부위별 평가, 잘한 점·보완할 점, 실행 단계, 종합 점수가 함께 만들어지고 서버 계약 검증을 통과해야 저장됩니다.

사진 분석과 동시에 preview 프롬프트의 별도 Bedrock 호출이 시작됩니다. 이 단계는 사용자 상황·목적, 카메라/앨범 출처, 크기·방향·MIME 같은 비판단 메타데이터만 사용해 무엇을 어떤 순서로 확인할지 대화합니다. 실제 사진 관찰, 점수, 잘한 점, 보완할 점을 확정할 수 없습니다.

분석 결과가 준비된 뒤 로딩 화면의 자연스러운 대화를 만들기 위해 conference 프롬프트를 사용하는 별도 Bedrock 호출이 한 번 더 실행됩니다. 이 호출은 이미 확정된 점수나 평가를 바꾸지 않고, 사진 상태, 사용자 목적, 노출되는 잘한 점·보완할 점, 관찰 근거, 실행 단계, 종합 점수 이유만 대화로 재구성합니다.

결과 대화의 루페(`detail`) 말풍선은 서버가 최종적으로 한 개로 합칩니다. 모바일 결과에 노출되는 `strengths`와 `points`의 제목만 모두 사용해 `잘한 점은 …\n보완할 점은 …` 두 논리 줄로 만들며 description과 topicLabel은 넣지 않습니다. 정상 계약 범위의 제목은 빠짐없이 포함하고, 비정상적으로 큰 외부 입력에만 방어 상한(범주 합계 40개, 제목당 160자, digest 2400자)을 적용합니다.

모바일은 실제 화면에 표시된 마지막 2~3개 준비 메시지만 previewContext로 전달합니다. 이 문맥은 대화의 연결에만 쓰이고 사진 사실의 근거가 될 수 없습니다. 준비 대화나 결과 대화 호출이 실패해도 메인 사진 분석의 성공 여부에는 영향을 주지 않습니다.

각 근거 발언은 `evidenceRefs`를 함께 반환해야 합니다. 서버는 등록되지 않은 ref, 역할과 맞지 않는 ref, 내부 enum, 의료·치료 주장, 브랜드·구매 추천을 거부합니다. 하나라도 걸러져 네 역할이 모두 참여한 5~7개 대화가 되지 않으면 전체 생성 결과를 폐기합니다. 모델은 대화의 구성만 선택하고, 화면에 보이는 사실 문장은 서버 근거에서 렌더링되므로 모델 문구가 새로운 관찰 사실을 추가하지 않습니다.

부분 가시성 이유와 조명 민감도는 관찰 근거에 함께 보존하며, 대화 프롬프트는 이 제한을 관찰보다 먼저 설명하도록 요구합니다. 생성 대화를 폐기하거나 호출이 실패한 경우 앱은 같은 구조화 결과로 만든 근거 기반 기본 대화를 사용하므로 피드백 결과 자체는 실패하지 않습니다. `evidenceRefs`는 검증용이며 사용자 화면에는 표시하지 않습니다.

preview/conference 프롬프트에서는 분석자의 캐릭터, 말투, 참여 순서, 대화 흐름과 연결 방식을 조정할 수 있지만 사진의 관찰 사실, 점수, 평가 근거는 바꿀 수 없습니다. preview 템플릿의 `PREVIEW_CONTEXT_JSON`, `CONVERSATION_SEED_JSON`, `OUTPUT_CONTRACT_JSON`과 conference 템플릿의 `EVIDENCE_CONTEXT_JSON`, `PREVIEW_HANDOFF_JSON`, `OUTPUT_CONTRACT_JSON` placeholder는 모두 반드시 유지해야 합니다. JSON 스키마나 서버 검증 규칙을 바꾸려면 Python 코드와 테스트도 함께 수정해야 합니다.

### 대화 안전 렌더링 경계

preview 모델은 사용자의 목적과 비판단 이미지 메타데이터를 바탕으로 4~6개의 짧은 준비 대화를 직접 작성합니다. 첫 로컬 연결 문장은 `conversationSeed`로 전달되며 첫 AI 화자는 seed와 달라야 하고, 이후 각 발언은 `replyTo`로 바로 앞 발언을 이어야 합니다. AI의 `text`는 50~70자의 한국어 한 문장, 역할별 `contextRefs`, 계획형 표현, 비연속 화자, 프롬프트 주입·상태 로그·사진 관찰 주장 금지 검증을 모두 통과한 경우에만 화면에 그대로 표시됩니다. 하나라도 실패하면 전체 AI 미리보기를 폐기하고 서버의 안전 문장으로 대체합니다. 사진 상태어는 단정형으로 쓰면 거부하며, `번짐 여부`, `들뜸 가능성`, `번졌는지`처럼 불확실성을 문법적으로 직접 표시한 계획형 span만 허용합니다.

결과 conference 모델은 분석자, 발언 순서, `evidenceRefs`를 선택합니다. 근거가 필요한 화면 문장은 모델 원문 대신 해당 ref가 가리키는 서버의 정확한 evidence 문구와 역할별 도입부로 렌더링합니다. 사실 주장이 없는 마지막 결과 전환 문장만 검증 후 모델 문구를 유지할 수 있습니다.

프롬프트에서는 캐릭터, 참여 순서, 반응 흐름을 조정할 수 있지만 사진 관찰, 점수, 평가 근거는 바꿀 수 없습니다. conference 템플릿의 `EVIDENCE_CONTEXT_JSON`, `PREVIEW_HANDOFF_JSON`, `OUTPUT_CONTRACT_JSON` 세 placeholder는 반드시 유지해야 하며, 서버 렌더링 규칙을 바꾸려면 Python 코드와 테스트도 함께 수정해야 합니다.

## AI 출력 필수 계약

- 최상위: `analysisDecision`, `captureQuality`, `score`, `scoreRange`, `scoreConfidence`, `scoreEvidenceIds`, `scoreLabel`, `scoreReason`, `interpretedGoal`, `evaluations`, `summary`
- 목적 해석: `label`, `intensity`, `reason`, `explicitFacts`, `unknowns`, `assumptions`, `dynamicCriteria`
- 동적 기준: `id`, `criterion`, `derivedFrom`
- 부위별: `topicId`, `topicLabel`, `status`, `visibility`, `visibilityReason`, `observations`, `goalCriterionIds`, `title`, `description`, `actionSteps`, `scoreImpact`, `confidence`
- 관찰 근거: `id`, `claim`, `evidenceLocation`, `lightingSensitive`
- `evaluations`에는 눈썹부터 립까지 11개 topic이 정확히 한 번씩 포함되어야 합니다.
- `goalCriterionIds`는 같은 응답의 `dynamicCriteria.id`만, `scoreEvidenceIds`는 같은 응답의 `observations.id`만 참조할 수 있습니다.
- 관찰 가능한 `strength`, `improvement`, `optional` 항목은 관찰 근거와 목적 기준을 연결하고 실행 가능한 한국어 `actionSteps` 1~3개를 반환합니다.
- `not_assessable`, `not_applicable` 항목은 `observations`, `goalCriterionIds`, `actionSteps`를 빈 배열로 반환하며 점수 감점 근거로 사용하지 않습니다.
- `scoreReason`은 실제 관찰 근거와 동적 목적 기준을 연결한 1~2문장입니다.

## 사용자 노출 정책

- `strength`는 `잘한 점`으로 표시합니다.
- `improvement`와 목적에 유용한 저영향 `optional`은 모두 `보완할 점`으로 합쳐 표시합니다. `optional`도 결점처럼 쓰지 말고 선택적 개선으로 작성합니다.
- `not_assessable`과 `not_applicable`은 서버 감사·품질 판단에는 유지하지만 사용자 부위 카드, 목록 카운트, 에이전트 대화에는 노출하지 않습니다.
- `scoreEvidenceIds`는 `strength` 또는 `improvement`의 관찰만 참조할 수 있습니다. `optional`은 사용자에게 유용한 제안일 수 있지만 종합 점수의 근거로 사용하지 않습니다.
- 점수는 AI가 사진 근거로 13개 component를 각각 채점하고 서버가 그 합으로 네 축과 총점을 확정합니다. 결함 개수나 `scoreImpact` 등급으로 점수 상한을 만들지 않습니다. 타고난 피부·눈썹·입술색을 메이크업 수행 성과로 칭찬하거나, 사용자 원문에 없는 스타일을 점수 기준으로 추가하면 안 됩니다.
- `scoreRange`, `scoreConfidence`, `modelVersion`은 계약·디버깅용으로 보존하지만 모바일 결과 화면과 저장·공유 이미지에는 표시하지 않습니다.

## 처리 순서와 점수 정책

Bedrock 호출은 한 번만 수행하며, 같은 응답 안에서 아래 순서를 지키도록 프롬프트를 구성합니다.

1. 촬영 품질과 부위별 가시성을 확인합니다.
2. 사진에 실제로 보이는 사실을 `observations`로 기록합니다.
3. 사용자 원문을 `explicitFacts`, `unknowns`, `assumptions`, `dynamicCriteria`로 해석합니다.
4. 관찰 ID와 동적 기준 ID를 연결해 11개 부위를 평가합니다.
5. 평가가 끝난 뒤에만 AI가 전체 근거를 종합해 점수를 판단합니다.

점수는 정해진 스타일별 선호 점수가 아닙니다. 모델은 모든 사용자에게 같은 네 축(`적용 완성도 30 + 배치·형태 균형 25 + 색·명암 조화 20 + 전체 조화·목표 적합도 25`)을 적용하고, 사용자의 실제 입력에서 유도한 `dynamicCriteria`와 사진의 `observations`를 연결해 각 축을 채점합니다. `generic_default`에도 자연스러움, 데일리, 화려함 같은 선호를 자동 적용하지 않습니다.

v10은 결함 개수에 따른 고정 상한 대신 13개 분석 component를 독립적으로 채점합니다.

- 적용 완성도: 베이스 도포·균일도 8, 눈썹·아이 정교함 9, 치크·윤곽 블렌딩 7, 립 라인·채움·마감 6
- 배치·형태 균형: 좌우 대칭·균형 10, 랜드마크 기준 배치 10, 부위 간 시각적 비중 5
- 색·명암 조화: 상대 채도·명도·대비 8, 피부·치크·립 색 연결 7, 마감·질감 일관성 5
- 전체 조화·목표 적합도: 얼굴 전체 내부 조화 10, 시각적 중심·위계 7, 명시 목표 적합도 8

각 component는 `score`, `maxScore`, 1~2문장의 `reason`, 사진 관찰을 가리키는 `evidenceIds`를 가집니다. 서버는 component 합을 axis 점수로, axis 합을 최종 점수로 사용하므로 AI가 먼저 정한 총점에 설명을 끼워 맞출 수 없습니다. axis의 근거 ID도 component 근거의 합집합으로 정규화합니다. `scoreConfidence`는 메이크업 실력 점수가 아니라 사진 근거 판독 신뢰도이며, 점수 근거 evaluation의 최저 confidence, 색 판독 신뢰도, detector/lighting 제한보다 높지 않게 서버가 보정합니다.

서버에는 92점 상한이나 5점 단위 버킷이 없습니다. 각 component는 1점 단위 정수로 채점하고 그 합을 반올림 없이 그대로 보존하므로 0~100의 모든 정수가 가능하며, 근거가 충족되면 93~100도 그대로 저장합니다. 13개 component가 모두 최대점이면 정확히 100점입니다. 모든 `improvement`는 최소 한 개 observation이 실제 component 근거에 포함되어야 하므로, 보고서에 적힌 명확한 결함을 점수 계산에서 누락할 수 없습니다.

기존 v9 보고서는 재채점하지 않습니다. 새 분석은 `makeup-feedback:bedrock-v10-expert-analytic-rubric`으로 저장하며, 모바일은 v9와 v10을 모두 읽어 과거 기록을 유지합니다.

- 충분히 분석 가능하면 `analysisDecision=completed`, `captureQuality.usable=true`, 숫자 `score`, 점수를 포함하는 `scoreRange`, `scoreConfidence`, 실제 근거 ID인 `scoreEvidenceIds`를 반환합니다.
- 핵심 부위를 신뢰성 있게 분석할 수 없으면 `analysisDecision=retake_required`, `captureQuality.usable=false`, 한 개 이상의 구조화된 `issues`, `score=null`, `scoreRange=null`, `scoreConfidence=0.0`, `scoreEvidenceIds=[]`를 반환합니다.
- `captureQuality`에는 서버 비전 기준의 `detectorAvailable`, 부위별 색 귀속 신뢰도인 `colorConfidence=low|medium|high`, 최대 6개의 `issues[{code,message,affectedTopicIds}]`가 포함됩니다.
- 일부 부위만 가려진 경우에는 가능한 부위는 계속 분석하고, 해당 부위만 `not_assessable`로 표시합니다. 가려짐 자체를 메이크업 감점으로 처리하지 않습니다.

## 프롬프트 수정 시 주의점

- 새로운 고정 목적 분류나 고정 점수 가중치를 추가하지 말고, 사용자 원문에서 평가 기준을 유도하도록 문구를 작성합니다.
- 모델이 보이지 않는 요소를 추측하도록 만들지 않습니다. 사진 관찰 문장에는 위치와 조명 민감도를 함께 요구합니다.
- `status`, `visibility`, ID 참조, 재촬영 상태의 null 규칙을 바꾸려면 프롬프트뿐 아니라 Python 검증 계약과 테스트도 함께 수정해야 합니다.
- Bedrock 응답 길이는 현재 `max_tokens=16384`입니다. 계약 필드를 더 늘릴 때는 11개 항목이 잘리지 않는지 테스트해야 합니다.

## 모델에 전달되는 요청 메타데이터

이미지 URL, 저장소 키, 사용자 식별자 같은 값이 프롬프트로 들어가지 않도록 다음 허용 목록만 전달합니다.

- `source`, `sourceLabel`, `source_label`
- `contentType`, `content_type`
- `width`, `height`
- `task`

허용 목록을 바꿀 때는 민감정보가 포함되지 않는지 확인하고 메타데이터 테스트를 함께 수정하세요.

누락되거나 잘못된 live AI 결과는 기본 문구나 82점 결과로 보정하지 않습니다. `AppError`를 전파해 기존 feedback job이 `failed` 상태와 오류 상세를 저장하게 합니다.
