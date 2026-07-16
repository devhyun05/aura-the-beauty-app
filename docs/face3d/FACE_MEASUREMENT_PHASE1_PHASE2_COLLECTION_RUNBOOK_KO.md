# 얼굴 측정 Phase 1∥2 로컬 수집·calibration runbook

상태: **준비 완료 / 실기기 수집 미실행 / 승격 미실행**

정본은 `docs/superpowers/plans/2026-07-16-face-measurement-analysis-plan.md` v5와
`AURA_UNIFIED_FACE_CAPTURE_IMPLEMENTATION_PLAN_KO.md` Phase 6B다. 이 문서는 두
정본을 재정의하지 않고 로컬 수집 순서, 증거 파일 계약, dry-run 검증 명령만 고정한다.

## 1. 절대 경계

- 보정 기능 플래그는 기본 `OFF`다.
- Gate 6B 증거, 독립 validation cohort, product-owner approval artifact, receipt
  서명이 모두 없으면 backend는 `calibrated` 자기선언을 거부해야 한다.
- `promote-face3d-calibration.mjs`는 이름과 달리 현재 **검증 전용**이다.
  `--dry-run`이 반드시 필요하며 HMAC 서명, live `FACE3D_GATE_STATUS.json` 변경,
  제품 정책 승격을 수행하지 않는다.
- 이 runbook에서는 iPhone 촬영·설치·로그 pull을 실행하지 않는다. fixture와 dry-run만
  허용한다.
- Phase 1의 원시 478 랜드마크/변환행렬은 제품 payload·repeatability manifest와
  분리된 로컬 디렉터리에만 둔다. 이미지, vertex, landmark 배열을 Git·backend·AI
  payload에 넣지 않는다.

## 2. 가명 ID와 보존·삭제 정책

수집 전에 다음 값을 만든다.

- `cohortId`: `cohort_`로 시작하는 로컬 검증 코호트 가명 ID.
- `subjectContextId`: `subj_`로 시작하는 랜덤 가명 ID. 이름·이메일·학번을 쓰지 않는다.
  제품 사용자 문맥인 `subj_user_<uuid>`는 로컬 수집 ID로 재사용하지 않는다.
- `sessionId`: `session_`으로 시작하는 랜덤 세션 ID.
- subject↔실제 사람 대응표가 꼭 필요하면 repo와 다른 접근제어 위치에 보관한다.
- 원시 랜드마크 보존 기간은 실행 시 1~30일 안에서 명시한다. 기본값을 암묵적으로
  가정하지 않는다.
- 삭제 예정 시각이 오면 raw landmark 디렉터리만 삭제하고, 경로가 사라졌는지 별도로
  확인한다. 파생 repeatability JSON은 `rawFaceDataIncluded:false`일 때만 보존할 수 있다.

원시 자료와 파생 증거 디렉터리는 같거나 상하위 경로여서는 안 된다.

## 3. 고정 수집 순서

한 사람의 한 방문에서 아래 순서를 바꾸지 않는다. 이점은 방문 통합이며 캡처 통합이
아니다. Lab은 한 캡처에서 한 모드만 사용한다.

| 순서 | Phase 1 샷 | 목적 |
|---:|---|---|
| 1 | 정면·표준거리 reference A | 정면 유사 정답 |
| 2 | 피사체 기준 좌 yaw 약 6° | yaw 수렴 |
| 3 | 피사체 기준 우 yaw 약 6° | yaw 수렴 |
| 4 | 턱을 약간 든 pitch 약 8° | pitch 수렴 |
| 5 | 턱을 약간 내린 pitch 약 8° | pitch 수렴 |
| 6 | 피사체 기준 좌 roll 약 3° | 잔여 roll 확인 |
| 7 | 피사체 기준 우 roll 약 3° | 잔여 roll 확인 |
| 8 | 정면·기존 greenlight 안의 가까운 거리 | 원근 민감도 |
| 9 | 정면·기존 greenlight 안의 먼 거리 | 원근 민감도 |
| 10 | 정면·표준거리 reference B | 세션 내 정면 반복성 |

그 뒤 별도 캡처로 `diagnostics-exact-30-v1` 정면·무표정 반복을 실행한다. 반복 횟수는
명령에 반드시 적고 최소 3회다. exact-30 결과는 `validFrameCount=30`,
`targetFrameCount=30`, event type `unified_face_capture_completed`가 모두 맞아야 한다.

## 4. 수집 계획 dry-run 생성

아래 명령은 JSON 계획만 만들며 기기 명령을 실행하지 않는다.

```bash
npm run face3d:collection:prepare -- \
  --cohort-id cohort_phase1_20260717 \
  --subject-id subj_7f2d91a4c8e1 \
  --session-id session_20260717_a1b2c3d4 \
  --exact30-repeats 3 \
  --raw-landmark-dir ./local-face-measurement/raw/subj_7f2d91a4c8e1 \
  --evidence-dir ./local-face-measurement/evidence/subj_7f2d91a4c8e1 \
  --retention-days 7 \
  --output ./local-face-measurement/session-plan.json \
  --dry-run
```

출력의 `sequence`가 Phase 1 10개 뒤 exact-30 반복으로 이어지는지,
`deviceActionsExecuted:false`, `uploadAllowed:false`인지 먼저 확인한다.
`privacy.rawLandmarks.createdAtUtc/deleteByUtc`는 replay artifact 보존 계약과 같아야
한다. 실제 촬영 시각은 dry-run에서 추정하지 않고 writer가 각 캡처의
`capturedAtUtc`에 기록한다.

각 Phase 1 샷에는 앱의 `FaceVerticalThirdsInput.validationReplay`에 그대로 전달할
수 있는 `phase1ReplayValidation`이 포함된다.

실기기 빌드나 촬영 전에 임베드된 Unity 런타임이 신규 v3 계약인지 별도로
검사한다. 이 명령은 `UnityFramework.framework/UnityFramework`가 일반·비어 있지
않은 파일인지와 IL2CPP metadata의 v3 문자열을 함께 확인한다. Unity 빌드와 기기
동작은 실행하지 않으며, 실행 파일이 없거나 현재처럼 v1/v2 산출물이 남아 있으면
fail-closed로 중단하고 재빌드 명령만 안내한다.

```bash
npm run face3d:collection:preflight
```

실패 시 안내되는 `bash scripts/unity/build_ios_unity_framework.sh`로 Unity
산출물을 갱신한 다음 같은 preflight를 다시 통과해야 한다. 이번 작업 범위는
preflight·재빌드 스크립트 준비까지이며 실제 Unity 재빌드와 실기기 수집은
수행하지 않는다.

앱의 명시적 검증 랩 진입 스크립트도 준비되어 있다. 이 스크립트만
`validation-only` 플래그를 켜며 일반 앱/기존 face-capture-lab 기본값은 계속 OFF다.
이 작업에서는 스크립트를 실행해 실기기 수집하지 않는다.

```bash
npm run mobile:start:face-measurement-validation-lab
# 또는 실기기 빌드 준비 시
npm run mobile:ios:face-measurement-validation-lab -- --device <UDID>
```

랩의 `Phase 1 · 10-shot replay`는 촬영 전·결과 화면 양쪽에 현재 샷의
각도/거리 안내를 표시한다. `poseNormalizationReplayUri`가 실제 생성된 경우에만
다음 번호로 이동하며, 10번 reference B 저장 뒤에는 자동 반복하지 않고 모드
선택 화면으로 돌아가 Exact 30이 다음 순서임을 표시한다.

```json
{
  "captureId": "cap_p1_01_0123456789abcdef",
  "cohortId": "cohort_phase1_20260717",
  "sessionId": "session_20260717_a1b2c3d4",
  "subjectId": "subj_7f2d91a4c8e1",
  "retentionDays": 7,
  "condition": {
    "distanceLabel": "standard",
    "isReference": true,
    "poseLabel": "frontal",
    "repeatGroup": "frontal-standard",
    "repeatIndex": 1
  }
}
```

1번 reference A와 10번 reference B만 `isReference:true`이며 둘 다
`repeatGroup:"frontal-standard"`, 순서는 각각 `repeatIndex:1/2`다. 나머지 각도·거리
샷은 서로 다른 조건을 같은 repeat group에 섞지 않는다. 모든 `captureId`,
`cohortId`, `sessionId`, `subjectId`는 가명 prefix 계약을 따른다.

Phase 1 raw landmark를 실제 paired replay artifact로 준비할 때는
[`PHASE1_LOCAL_REPLAY_ARTIFACT_KO.md`](../face-ratio/PHASE1_LOCAL_REPLAY_ARTIFACT_KO.md)와
`scripts/face-ratio/prepare-phase1-replay-artifact.mjs`,
`replay-phase1-pose-normalization.mjs` 계약을 따른다. 해당 도구도
`local-face-measurement/` 로컬 경계와 `subj_...` 가명 ID를 사용한다. 캡처
nonce는 Unity가 실제 unified request ID를 그대로 사용하므로
`unified-face-*`, `face-capture-lab-*`, 준비 아티팩트의 `cap_*`를 모두
허용하되, receipt 서명과 one-time ledger로 동일 값을 재사용하지 못하게 한다.

## 5. runtime event → 공통 repeatability manifest

adapter 입력은 `aura.face3d-repeatability-source-index.v1`이다. 성공 attempt는
`subjectId`, `sessionId`, `shotKind:"neutral"`, `sourcePath`, `captureId`를 갖는다.
실패 attempt도 버리지 않고 `status:"failed"`와 `failureReason`으로 남겨 실패율 분모에
포함한다.

```json
{
  "schemaVersion": "aura.face3d-repeatability-source-index.v1",
  "cohortRole": "calibration",
  "frameCount": 30,
  "collectionPolicyId": "diagnostics-exact-30-v1",
  "gateVersion": "face3d-gate-v2",
  "appBuild": "com.nicewei.aura.dev@1.0.0+100",
  "attempts": [
    {
      "attemptId": "attempt_30_001",
      "subjectId": "subj_7f2d91a4c8e1",
      "sessionId": "session_20260717_a1b2c3d4",
      "pairId": "pair_neutral_repeat_001",
      "shotKind": "neutral",
      "status": "success",
      "sourcePath": "./events-001.jsonl",
      "captureId": "cap_30_001_a1b2c3d4"
    }
  ]
}
```

source index와 event 파일은 같은 로컬 bundle 아래 둔다. adapter는 bundle 밖 경로와
symlink 탈출을 거부한다.

```bash
npm run face3d:repeatability:adapt -- \
  --index ./local-face-measurement/repeatability-30-source.json \
  --output ./local-face-measurement/repeatability-30.json
```

adapter는 다음 두 입력을 같은 `aura.face3d-repeatability-manifest.v2`로 만든다.

- raw `unified_face_capture_completed.face3d`, 또는 mobile runtime logger가 만든
  `event.type:"face3d_analyzed"` +
  `unifiedCapture.sourceEventType:"unified_face_capture_completed"`: exact diagnostics
  입력. policy와 `N/N`을 강제한다.
- 기존 `face3d_analyzed.profile`: legacy 호환 입력. 공통 분석에는 쓸 수 있지만 Gate 6B
  승격 증거로는 거부된다.

`aura.face3d-repeatability-manifest.v2`의 metric entry는 `valueMm`,
`valueMmConfidence`, `valueMmValidFrameCount`,
`valueMmMad`를 한 묶음으로 보존한다. 각 값은 normalized 집계 품질을 복사하지 않고
raw-meter 표본에서 별도로 계산한다. raw inlier가 exact policy의 N개(제품
micro-burst는 최소 5개)에 못 미치면 `valueMm`은 반드시 null이어야 한다. single-frame
exact-1은 두 confidence가 0이고 두 MAD가 null이어야 한다.

manifest 버전 v2와 embedded Face3D profile 버전은 별개다. 신규 수집·calibration
후보는 반드시 `aura.face3d-profile.v3`이어야 하며 v1/v2 profile은 legacy read-only
분석에만 허용하고 calibration 승격 증거로는 거부한다.

공통 manifest에는 profile/metric과 source SHA만 남고 이미지·랜드마크·vertex는 남지
않는다. 각 파일은 정확히 3명×각 3회 neutral 성공 캡처를 가져야 하며, 실패 attempt는
별도 attempt summary에 포함한다. 여섯 frame count 파일의
`subjectId/sessionId/pairId` 구성은 서로 같아야 한다. 즉 같은 사람·세션·반복 위치를
frame count만 바꿔 비교한다.

같은 방식으로 서로 섞지 않은 독립 파일을 만든다.

```text
repeatability-1.json
repeatability-3.json
repeatability-5.json
repeatability-8.json
repeatability-12.json
repeatability-30.json
```

## 6. 독립 validation cohort

promotion bundle은
`aura.face3d-calibration-validation-cohort.v1`을 별도로 요구한다.

- calibration set과 subject/session ID가 하나라도 겹치면 실패한다.
- Phase -1 기준은 수집 전에 `approved_before_collection`이어야 한다.
- 최소 60개 독립 가명 subject/session pair를 요구한다.
- 각 pair는 같은 사람·자세의 exact `1/3/5/8/12/30` profile을 모두 갖는다.
- frame count별 total/succeeded/failed/failureRate를 count에서 다시 검증한다.
- raw face data는 포함하지 않는다.

## 7. Gate 6B dry-run

검증기는 정본 기준을 그대로 적용한다.

- required metric별 `discriminability >= 2.0`
- short-frame within spread ≤ exact-30의 1.25배
- paired median bias ≤ exact-30 between-subject spread의 10%
- paired p95 bias ≤ exact-30 between-subject spread의 25%
- 실패율 악화 ≤ 5%p
- 후보 p95 capture window ≤ 500ms
- 5/8/12 중 통과한 가장 작은 수만 선택
- exact-1은 자동 승격하지 않음

confidence model artifact는 `coverage`를 품질로 쓰지 않고 completion과 분리하거나
제거해야 한다. `pose`, `neutralExpression`, `tracking`, `nativeSync`,
`independentRepeatability` 신호가 모두 있어야 하며 `featureFlagDefault:"off"`여야 한다.

```bash
npm run face3d:calibration:promote -- \
  --manifest ./local-face-measurement/calibration-bundle/promotion-manifest.json \
  --output ./local-face-measurement/calibration-bundle/dry-run-result.json \
  --dry-run
```

성공 결과도 `status:evidence_validated_unsigned_not_promoted`,
`signingKeyId:null`, `signature:null`, `receiptSha256:null`이다. `unsignedReceipt`는
모바일·backend wire 계약과 같은 평면 필드 구조이지만, null 서명 필드 때문에 제품
receipt로 사용할 수 없다.

## 8. receipt binding과 backend registry 계약

서명 입력은 아래 11개 필드만 key-sort compact JSON으로 직렬화한다.

```text
receiptId, captureNonce, profileBindingSha256, collectionPolicyId,
gateVersion, appBuild, issuedAtUtc, expiresAtUtc, subjectContextId,
reportContextId, approvalArtifactSha256
```

- 알고리즘: `hmac-sha256-v1`, hex signature
- `receiptId`, `captureNonce`, 발급/만료, 가명 subject/report context가 replay 방어에
  참여한다.
- `captureNonce`는 Unity profile이 가진 실제 mobile request ID를 그대로 쓴다.
  제품 producer의 `unified-face-*`, Lab의 `face-capture-lab-*`를 `cap_*`로
  재작성하지 않는다. 안전한 ASCII token 검증과 profile/envelope 일치 검사는
  유지한다.
- product receipt의 subject context는
  `subj_user_<canonical lowercase user UUID>`만 허용한다.
- report context는 `report_photo_capture_<canonical lowercase photoCapture UUID>`,
  photoCapture가 없는 경로만
  `report_source_media_<canonical lowercase media UUID>`를 허용한다. backend는
  인증 사용자와 실제 photoCapture/media 소유권 문맥을 대조한다.
- 위 product receipt 문맥은 §2의 로컬 수집 가명 `subj_...`/`session_...`와 별개다.
- profile binding 전에 profile 최상위의 `calibrationReceipt`,
  `profileBindingSha256`, `serverCalibrationReceiptStatus`만 제외한다.
- profile의 모든 finite number는 정수도 포함해
  `{"$face3dNumber":"fixed12_trimmed"}`로 재귀 치환한다. `-0`은 `"0"`이다.
- 그 뒤 object key sort + compact JSON + SHA-256을 적용한다.
- runtime server는 receipt one-time consumption/replay ledger를 별도로 가져야 한다.

`docs/face3d/FACE3D_GATE_STATUS.json`의 registry shape는 다음과 같다.

```json
{
  "confidenceCalibration": {
    "status": "pending",
    "validationStatus": "not_run",
    "profileSchemaVersion": "aura.face3d-profile.v3",
    "policyId": null,
    "gateVersion": "face3d-gate-v2",
    "receiptSchemaVersion": "aura.face3d-confidence-calibration-receipt.v1",
    "signatureAlgorithm": "hmac-sha256-v1",
    "approvalArtifactPath": null,
    "approvalArtifactSha256": null,
    "receiptPath": null,
    "receiptSha256": null
  }
}
```

backend 허용 조건은 최소한 `status=="approved"`, policy/gate 일치,
approval/receipt SHA 존재와 committed artifact 일치, HMAC 유효, issued/expires 유효,
one-time ledger 미소진이다. 하나라도 없으면 fail closed다.

## 9. 로컬 자동 검증

```bash
npm run face3d:test:repeatability
npm run face3d:test:calibration
```

두 번째 suite는 합성 profile만 사용한다. 실제 얼굴, 카메라, iPhone, HMAC secret,
제품 승격을 사용하지 않는다.
