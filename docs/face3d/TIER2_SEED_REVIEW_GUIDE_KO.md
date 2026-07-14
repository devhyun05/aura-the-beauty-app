# TrueDepth Tier-2 시드 사람 검수 가이드

상태: **human review handoff · runtime 미승인**
결정 근거: `docs/face3d/TIER2_LANDMARK_SEED_DECISION_KO.md`

## 1. 이 검수의 목적

목표는 한 사람 얼굴에서 “정답 vertex 한 점”을 맞히는 것이 아니다. ARKit 고정 topology에서 다음 해부 영역을 계속 덮는 **고정 runtime patch 후보**를 두 reviewer가 독립적으로 찾고, 17개 캡처에서 재투영해 gross miss가 없는지 확인하는 것이다.

- 앞광대 Left/Right: `zy-zy` 폭이 아니라 maxillozygomatic/malar 영역의 전방 돌출 proxy
- 콧볼 Left/Right: convex ala의 표준 `alare` 인접 patch; 런타임에는 face-local 바깥 극값 사용
- nasion: sellion의 깊이 극값이 아닌 soft-tissue nasion을 나타내는 중앙 고정점 `15`
- `noseBridgeMidlineIndices`는 `nasalBridgeStraightness`와 `nasalAxisDeviation` 실험용 그룹이다. 현재 ARKit mesh에서 휘어짐 신호가 해부 차이를 안정적으로 반영한다는 증거가 없어 **화면에는 해부 근거를 표시하되 runtime은 `unsupported/null`로 유지**하고, 이번 필수 authoring 대상에서는 제외한다.

`허용 해부 영역(ROI)`과 `대표 target`은 reviewer가 무엇을 해부학적 정답 영역으로 보았는지 남기는 **판정 증거**다. 둘은 g1 vertex를 포함해도 된다. live map에 들어갈 `고정 patch`만 g1 및 다른 Tier-2 runtime patch와 겹치면 안 된다. target이 g1에 있다는 이유로 옆의 free vertex를 “정답”으로 바꾸거나, patch가 target 자체를 반드시 포함하게 만들지 않는다.

자동 후보는 시작 위치를 보여 주는 탐색 레이어일 뿐이다. 현재 자동 후보의 구조 검증 결과는 `0/17 PASS`이므로 그대로 복사해 승인하지 않는다. reviewer는 먼저 **blind review mode에서 자동 suggestion과 imported/fixed patch를 숨긴 채** ROI·target만 기록한다. 단, 이 단계에서 이미 표현 불가라고 판단한 그룹은 `unsupported/null`과 coverage fail/note/reason을 기록할 수 있다. 필수 blind 증거가 완성된 뒤 공개 버튼을 누르면 suggestion/고정 patch가 나타나며 이 공개는 되돌릴 수 없다.

## 2. 보드 생성

얼굴 프레임이 포함되므로 HTML/JSON은 로컬 임시 폴더에만 두고 커밋하거나 외부에 업로드하지 않는다.

한 캡처:

```bash
node scripts/face3d/build-tier2-seed-review.mjs \
  artifacts/face3d/device-captures/pair_face3d_semantic_1783799136465 \
  /tmp/tier2-seed-review/reviewer-a/pair_face3d_semantic_1783799136465.html
```

출력 HTML 경로를 생략하면 `/tmp/tier2-seed-analysis/<capture>.tier2-seed-review.html` 아래에 생성된다.

같은 캡처의 검수 JSON 복원 또는 다른 캡처에 고정 patch 재투영:

```bash
node scripts/face3d/build-tier2-seed-review.mjs \
  artifacts/face3d/device-captures/pair_face3d_semantic_1783799136465 \
  /tmp/tier2-seed-review/reviewer-a/pair_face3d_semantic_1783799136465.html \
  --patch /tmp/tier2-seed-review/reviewer-a/candidate.json
```

각 reviewer는 별도 폴더를 쓰고, 1차 검수가 끝날 때까지 상대 reviewer의 선택 JSON을 보지 않는다. `--patch` JSON의 `capturePairId`가 현재 캡처와 같을 때만 그 캡처의 registration과 annotation을 복원한다. suggestion 공개 상태는 여기에 더해 `blindReviewCompleted=true`, 유효한 공개 시각, 필수 그룹의 완전한 blind evidence가 모두 있을 때만 복원한다. ID가 다르거나 없으면 **고정 groups만 재투영**하고 reviewer ID, registration, ROI, target, selection evidence, coverage verdict/note는 현재 캡처에서 새로 판정하도록 초기화한다. 다른 캡처의 `Registration=pass`가 전파돼서는 안 된다.

현재 도구는 anatomy L/R, topology fingerprint, g1/Tier-2 runtime patch overlap, 연결성, UV mirror, winner boundary를 검사한다(`scripts/face3d/tier2-seed-review-core.mjs:312-898`; `scripts/face3d/build-tier2-seed-review.mjs:683-1068`).

## 3. 화면 사용법

### 공통 순서

1. `Reviewer`에 식별자를 입력한다.
2. blind review mode를 유지해 suggestion과 imported/fixed patch를 숨긴다. `모든 vertex`와 필요 시 `g1 reserved 표시`만 켜서 해부 영역을 판단한다.
3. 2D 점들이 얼굴 프레임과 맞는지 본 뒤 `Registration=pass` 또는 `fail`을 선택한다. `captureFraming.fullMeshInFrame=false` 경고는 registration과 별도다. 이 경우 중앙부 overlay registration은 판정할 수 있어도 그 캡처를 **전체 mesh framing PASS**로 세면 안 된다(`scripts/face3d/build-tier2-seed-review.mjs:123-167,744-744,911-915`).
4. 대상 그룹을 선택하고 `대상 그룹 solo`를 누른다.
5. `허용 해부 영역`을 선택한다. ROI는 해부 판정 증거이므로 g1 vertex를 포함할 수 있다.
6. ROI 안에서 `대표 target 1점`을 표시한다. target도 증거이며 g1이어도 된다. 런타임 winner나 고정 index를 뜻하지 않는다.
7. 필수 그룹마다 ROI+target이 준비됐는지 확인한다. blind 단계에서 unsupported로 판정하는 그룹은 대신 `coverageVerdict=fail`, coverage note, 구체적인 reason을 입력한다.
8. `1차 해부 표시 완료 · 자동 후보 공개`를 누른다. 공개는 되돌릴 수 없고, 이때까지 suggestion과 imported/fixed patch는 보이지 않는다. JSON 복사·저장 버튼도 공개 전에는 비활성화돼 blind 증거만 따로 export할 수 없다.
9. 공개된 `고정 patch`를 검토·수정한다. patch의 모든 index는 reviewer ROI 안에 있어야 하고 g1/Tier-2 runtime patch와 disjoint여야 한다. target을 반드시 포함할 필요는 없다.
10. 3D에서 정면, **피사체 자신의** Left/Right 쪽 45도, subnasal 보기를 바꾸며 patch의 표면 위치와 연결성을 확인한다. 3D에는 texture가 없으므로 alar crease처럼 색/주름으로 구분되는 경계를 새로 판정할 수는 없다(`scripts/face3d/build-tier2-seed-review.mjs:796-803,1004-1037`).
11. `candidate_review` 그룹은 suggestion/fixed patch를 확인한 뒤 이 캡처의 해부 coverage를 `pass|fail`로 판정하고 coverage note를 작성한다. 자동 후보를 본 뒤 ROI/target을 바꾸면 note에 이유를 남기고 독립 검수 원칙을 훼손하지 않았는지 다시 확인한다.
12. 빨간 검증 목록을 확인하고 `임시 검수 JSON 저장`으로 내보낸다. export의 `reviewOutcome`과 `validation.completionStatus`가 `candidate_structural_pass`면 이 캡처의 모든 runtime 후보가 로컬 구조 gate를 통과했다는 뜻이다. `complete_with_unsupported`는 unsupported 판정까지 빠짐없이 끝났지만 완전한 runtime 후보가 아니라는 뜻이다. 둘 다 두 reviewer 합의나 live map 승인을 뜻하지 않는다.

`candidate_review`인 필수 그룹은 ROI, ROI 안 target, ROI의 부분집합인 patch, `coverageVerdict=pass`, coverage note가 필요하다. 해부 영역 또는 안전한 free patch를 신뢰성 있게 표현할 수 없으면 억지로 vertex를 고르지 말고 `unsupported / null`을 선택한다. 이때 기존 ROI/target은 실패 근거로 보존할 수 있지만 provisional authoring JSON의 `groups[key]=[]`와 고정 patch는 비어 있어야 하고, 승인 runtime map의 flat optional 필드는 생략/`null`이어야 한다. `coverageVerdict=fail`, coverage note, 구체적인 unsupported reason도 필요하다(`apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DSemanticMap.cs:323-334,416-424`).

### 그룹별 판정 기준

| 그룹 | 포함 | 제외 | patch 계약 |
|---|---|---|---|
| `malarApexLeft/Right` | lower-orbital 바깥쪽의 앞광대 뼈 언덕 표면 | 코 옆기둥, lower eyelid, nasolabial/buccal mound, 얼굴 silhouette/옆광대 | 좌우 각 5개 이상, 한 component, UV mirror exact; 전방 max winner가 patch 경계가 아니어야 함 |
| `alarLeft/Right` | convex alar lobule와 표준 alare를 덮는 표면 | alar crease, cheek, columella, nostril 내부 | 좌우 각 5개 이상, 한 component, UV mirror exact; face-local lateral winner가 patch 경계가 아니어야 함 |
| `nasion` | 정중선, upper palpebral sulci 높이, sellion보다 약간 위/앞인 soft-tissue 영역 | deepest sellion, 눈썹/미간의 임의 최고·최저점 | 중앙 self-mirror vertex `15` 한 점 고정; g1 controlled overlap 허용 |
| `noseBridgeMidline` | nasion에서 코끝으로 이어지는 콧대 중앙 능선 | 눈썹·눈꺼풀, 콧볼, 한쪽으로 치우친 점열 | 중앙 연결점 최소 4개; 실제 중앙선 보존을 위해 g1 controlled overlap 허용 |

해부학적 Left는 피사체 자신의 왼쪽이다. 현재 전면카메라 검수 프레임은 거울 표시이므로 **화면 왼쪽, -face-local lateral**이다. Right는 화면 오른쪽, `+face-local lateral`이다. 그룹 계약은 Left `sideSign=-1`, Right `sideSign=+1`로 고정하고, validator가 ROI/target과 runtime patch 모두에서 반대쪽 vertex를 차단한다(`scripts/face3d/tier2-seed-review-core.mjs:25-63,480-492,736-748`). Export의 `isMirrored:false`는 실제 판별값이 아니라 하드코딩된 값이므로 좌우 근거로 사용하지 않는다(`apps/unity/MakeupAR/Assets/Scripts/E7SynchronizedCaptureExporter.cs:698-723`).

콧대중앙선의 G1 evidence `[10,12,14,16,36]`는 해부 위치 기록으로 정상 보존한다. 다만 현재는 runtime patch를 비우고 `unsupported/null`로 판정하므로 `nasalBridgeStraightness`와 `nasalAxisDeviation`도 null이다. 후속 재검증을 시작할 때만 그룹 결론을 `시드 검수 계속`으로 바꾸고 **`콧대 G1 근거 → free runtime patch 적용`**을 사용한다. 기준 캡처에서의 실험용 free 제안은 `[13,158,387,607]`이지만 현재 승인 후보는 아니다.

## 4. 두 reviewer 확정 절차

### 단계 A — 독립 영역 표시

1. primary frame은 `...1783799136465`로 한다.
2. Reviewer A/B가 suggestion과 fixed patch를 보지 않는 blind mode에서 독립적으로 각 필수 그룹의 ROI와 target을 표시한다. 표현 불가 그룹만 이 단계에서 unsupported coverage fail/note/reason을 기록한다.
3. target index의 일치 자체를 합격 조건으로 삼지 않는다. 두 ROI가 같은 해부 표면을 가리키는지, 서로 겹치는 topology 영역이 충분한지를 본다.
4. blind 증거가 완성되면 각 reviewer가 자동 후보를 **되돌릴 수 없게** 공개하고, fixed patch를 검토한 뒤 candidate coverage verdict/note를 기록해 JSON을 저장한다.
5. 둘 중 한 명이라도 해부 영역 또는 g1-disjoint runtime patch를 신뢰할 수 없다고 `coverageVerdict=fail`로 판정하면 해당 그룹은 우선 `unsupported/null`이다. 논의를 통해 가이드를 명확히 한 뒤 두 사람이 독립 재검수할 수는 있으나, 한 명 선택을 다른 한 명에게 그대로 복사하지 않는다.
   - alar와 malar는 좌우 비교 및 UV mirror pair가 필요한 bilateral family 단위다. 한 side가 unsupported면 반대 side도 runtime patch를 비우고 같은 family 전체를 unsupported로 판정한다. nasion은 단독 판정할 수 있다.
6. 현 보드는 각 reviewer JSON을 만들고 한 캡처의 구조를 검사한다. 두 JSON의 ROI/target 합의도와 blind-review 준수 여부를 자동 비교하는 batch consensus 도구는 아직 후속 작업이다.

### 단계 B — 고정 patch 후보 구성

1. 두 reviewer의 ROI 공통부를 patch의 허용 상한으로 삼는다. 해부 증거인 ROI/target은 g1과 겹쳐도 된다.
2. runtime winner 주위에 한 겹 이상의 topology 여유가 남도록 **ROI 공통부 안의 free topology**에서 patch를 구성한다. target을 반드시 포함할 필요는 없다.
3. 고정 runtime patch에는 g1과 다른 Tier-2 그룹에 겹치는 index를 넣지 않는다.
4. 좌우 patch는 UV mutual-nearest mirror exact, 같은 cardinality, residual `<=0.00125`를 만족시킨다.
5. nasion은 중앙 고정점 `15` 하나만 허용한다.

### 단계 C — 17개 재투영

primary authoring에서 해부 영역과 고정 patch가 승인된 뒤에는 후보 JSON을 `--patch ... --reprojection`으로 17개 보드에 각각 불러온다. 이 모드는 고정 patch를 처음부터 표시하고 vertex 편집을 잠그므로 ROI/target을 다시 클릭하지 않는다. 캡처 ID가 다르면 reviewer·registration·coverage는 초기화되며, 각 캡처에서 registration, framing 경고, 고정 patch의 해부 coverage만 새로 판정한다. Export는 `reviewMode=fixed_patch_reprojection`, `blindReviewCompleted=false`로 기록되어 독립 blind authoring과 혼동되지 않는다.

```sh
node scripts/face3d/build-tier2-seed-review.mjs \
  <capture-dir> <output.html> \
  --patch <primary-approved.json> \
  --reprojection
```

`--reprojection`이 없는 기존 `--patch` 교차-capture import는 독립 authoring 용도이므로 고정 groups만 전달하고 ROI·target·coverage를 초기화한 채 blind mode를 유지한다.

- 공식 pose set: subject-01 `...1550595/...1552908/...1555305`, subject-02 `...9298585/...9315132/...9318477`, subject-03 `...9381863/...9388370/...9393013`
- 9개 pose board에서 두 reviewer 모두 그룹별 `coverageVerdict=pass`
- 나머지 8개에서도 그룹별 coverage fail/gross miss 0
- `...1783798897441`은 전체 mesh 209개가 frame 밖으로 확인된 캡처다. 중앙 target overlay는 볼 수 있지만 전체-mesh framing PASS의 증거로 사용하지 않는다.

브라우저/export의 `reviewOutcome` 및 `validation.completionStatus`가 `candidate_structural_pass`여도 **한 캡처의 authoring 구조 gate**만 뜻한다. `complete_with_unsupported`는 검수 기록 완결 상태이지 runtime seed PASS가 아니다. 결정문의 두 reviewer consensus, same-neutral, pose 위치 오차와 metric range 임계값까지 통과하기 전에는 runtime/live asset으로 옮기지 않는다.

## 5. 검수 완료 후 handoff

제출물은 reviewer별로 다음을 분리한다.

- primary frame의 독립 검수 JSON(`blindReviewCompleted`, `suggestionsRevealedAtUtc` 포함; blind-only export는 없음)
- 17개 capture별 재투영 검수 JSON(`registrationStatus`, `captureFraming.fullMeshInFrame`, 그룹별 coverage verdict/note 포함)
- `unsupported/null` 그룹의 보존된 ROI/target 증거, `coverageVerdict=fail`, coverage note, 구체적 사유
- 두 reviewer가 합의한 후보 patch JSON 또는 “합의 후보 없음” 결론

사람 검수가 끝난 다음 구현 단계는 다음과 같다.

1. 두 reviewer JSON의 ROI/target 합의도와 17-capture gate를 계산하는 batch validator 추가
2. 합격 patch만 새 g2 candidate map에 넣고 approval receipt 생성
3. alar centroid 공식을 face-local lateral extreme pair로 변경
4. Unity/offline evaluator parity, null/disjoint/tie-break 테스트
5. 새 `mapId`를 live asset으로 전환하기 전 신규 `3명 × 각 3회 neutral` discriminability gate 수행
