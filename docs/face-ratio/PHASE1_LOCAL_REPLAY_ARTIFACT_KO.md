# Phase 1 얼굴 비율 로컬 replay 아티팩트

이 아티팩트는 z 기반 포즈 정규화의 paired 비교만을 위한 로컬 검증 자료다.
제품 `measurements` payload, AI payload, 원격 로그에는 넣지 않는다.

## 개인정보·보존 계약

- `artifactClass`: `local-validation-only`
- `privacy.localOnly`: `true`
- `privacy.productPayloadIncluded`: `false`
- `privacy.rawFaceDataIncluded`: `true`
- `privacy.sourceImagesIncluded`: `false`
- 피험자는 이름·이메일·계정 ID 대신 `subj_7f2d91a4c8e1` 같은 가명 ID만 쓴다.
- 원본 사진 URI/파일 경로/사용자 ID는 JSON에 기록하지 않는다.
- 기본 보존 상한은 30일이며, Phase 1 관문 판정 또는 해당 PR 종료 시 더 이른
  시점에 공식 cleanup CLI의 `--all`로 raw replay를 삭제한다.
- artifact는 `privacy.retention.createdAtUtc`와 `deleteByUtc`를 함께 저장한다.
  앱은 Validation Lab 진입과 다음 raw 저장 전에 만료됐거나 retention metadata가
  손상된 전용 세션 디렉터리를 삭제하며, 기존 파일에 쓰면서 보존 기간을 연장하지
  않는다. 단, 앱이 종료·suspend되어 코드가 실행되지 않으면 OS가 `deleteByUtc`에
  맞춰 대신 삭제해 주지는 않는다. 다음 앱 진입 또는 공식 CLI 실행에서 집행한다.
- `local-face-measurement/`와 fallback
  `artifacts/face-ratio/phase1-local/`은 저장소 `.gitignore`에 포함되어 있다.

정본 스키마는
`scripts/face-ratio/phase1-local-replay-artifact.schema.json`이다.
`condition.repeatGroup`은 같은 피험자·같은 각도·같은 거리 조건의 반복 촬영끼리만
같게 지정한다. 서로 다른 각도를 한 그룹에 섞으면 지터 진단으로 해석할 수 없다.
한 피험자·세션의 replay-ready artifact는 정본 순서의 10장을 정확히 포함해야 한다.
첫 장과 열 번째 장만 정면·표준거리 reference A/B이며 같은 `repeatGroup`의
`repeatIndex` 1/2를 사용한다. 기준값은 A/B 측정값의 중앙값이며 A/B 자체의
드리프트도 MAE 분모와 `raw/normalizedReferencePairDrift` 진단에 포함된다.

## 준비된 도구

앱 런타임에서는
`EXPO_PUBLIC_AURA_FACE_RATIO_POSE_NORMALIZATION=validation-only`이고
`FaceVerticalThirdsInput.validationReplay`에 아래 가명 메타데이터가 모두 있을 때만
`Documents/face-ratio-phase1-validation/<cohort>/<subject>/<session>/phase1-replay.json`
에 원시 478점·4×4 행렬을 누적한다.

- `cohortId: cohort_*`
- `subjectId: subj_*`
- `sessionId: session_*`
- `captureId: cap_*`
- `retentionDays: 1..30`
- `acquisition`: `camera` / `native` / `front`
- `condition`: 거리·포즈·reference 여부·반복 그룹/순서

writer는 개발 빌드 전용이다. 플래그가 켜졌는데 메타데이터가 없거나 저장에 실패하면
legacy 보정 결과로 폴백하지 않고 분석을 차단한다. source image/URI는 이 raw 파일에
넣지 않고, 제품 측정/AI payload에는 raw 배열과 로컬 artifact URI를 넣지 않는다.
prepared plan 수집을 재시작하면 기존 artifact가 plan의 canonical capture prefix와
일치하는지 검증하고 다음 샷부터 재개한다. 다른 plan의 유효 artifact는 자동 삭제나
덮어쓰기를 하지 않는다. 기기 Lab 화면의 명시적 prepared raw reset 또는 새 plan을
요구하며, repo-local cleanup CLI가 기기 Documents를 지운다고 가정하지 않는다.
Phase 1과 Exact 30의 export·검증이 끝나면 Lab의
`완료된 기기 raw 삭제 및 세션 종료`를 눌러 Documents의 raw replay를 조기
삭제한다. 삭제된 session-plan은 재개용으로 쓰지 않고 새 가명 ID로 다시 만든다.

Unity `faceLandmarks` 응답과 별도 가명 metadata를 로컬 artifact에 추가:

```json
{
  "artifactCreatedAtUtc": "2026-07-17T00:00:00.000Z",
  "capturedAtUtc": "2026-07-17T00:01:00.000Z",
  "cohortId": "cohort_phase1_local",
  "sessionId": "session_20260717_a1b2c3d4",
  "captureId": "cap_p1_01_a1b2c3d4",
  "subjectId": "subj_7f2d91a4c8e1",
  "deleteAfterDays": 7,
  "condition": {
    "distanceLabel": "standard",
    "isReference": true,
    "poseLabel": "frontal",
    "repeatGroup": "frontal-standard",
    "repeatIndex": 1
  }
}
```

```sh
node scripts/face-ratio/prepare-phase1-replay-artifact.mjs \
  --response /local/path/face-landmarks.json \
  --metadata /local/path/capture-metadata.json \
  --output local-face-measurement/raw/subj_7f2d91a4c8e1/phase1-replay.json
```

이 공식 writer는 output별 cross-process lock과 동일 디렉터리의 atomic
temp+`fsync`+rename을 사용한다. 같은 `captureId`의 동일 payload는 no-op이고,
다른 payload·lock timeout·stale lock은 fail-closed다. metadata에는
`artifactCreatedAtUtc`와 1~30의 `deleteAfterDays`를 반드시 명시하며, 허용된
repo-local root 안에서도 중간 symlink를 통과하는 output은 거부한다.

동일 raw 입력에서 보정 전/후를 replay하고 MAD·정면 기준 MAE를 비교:

```sh
node scripts/face-ratio/replay-phase1-pose-normalization.mjs \
  --input local-face-measurement/raw/subj_7f2d91a4c8e1/phase1-replay.json \
  --output local-face-measurement/evidence/subj_7f2d91a4c8e1/phase1-report.json
```

만료·손상 replay 정리와 관문/PR 종료 시 완료 정리:

```sh
npm run face-ratio:phase1:prune -- \
  --root ./local-face-measurement/raw

npm run face-ratio:phase1:prune -- \
  --root ./local-face-measurement/raw \
  --all
```

`matrixOrthogonalityResidual`과 `roundTripRmsPx`는 행렬/구현 무결성 진단일
뿐 landmark confidence가 아니다. 수치 confidence로 환산하지 않으며, 관문은
보정 전 대비 MAD 감소와 자기 정면 reference A/B 중앙값 MAE 감소를 별도 축으로
판정한다.

실기기 수집은 이 구현 세션에서 실행하지 않는다. 위 명령은 수집이 끝난 뒤
검증 세션에서만 사용한다.
