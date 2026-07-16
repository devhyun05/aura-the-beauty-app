# Face Analysis Capture Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정면 S1과 3D의 두 단계 촬영을 사전 안내하고, 3D 측정 전에 사용자가 약 3초간 정면·무표정을 유지해야 함을 이해한 뒤 측정을 시작하게 한다.

**Architecture:** 사용자 문구와 시간 계산은 순수 TypeScript 프레젠테이션 모듈로 분리해 계약 테스트로 고정한다. `FaceAnalysisIntroScreen`은 두 단계 개요를 표시하고, `Face3DMeasurementScreen`은 안내 확인 전 Unity 측정을 시작하지 않으며 실패 시 제한된 재시도와 건너뛰기를 제공한다.

**Tech Stack:** React Native, TypeScript, Tamagui/theme tokens, Unity ARKit bridge, Node 기반 TypeScript 계약 테스트

## Global Constraints

- 카메라는 `정면 사진 촬영 1회 + 3D 자동 측정 1회`의 두 단계로 표현한다.
- 3D 유효 프레임 수집은 목표 30, 최소 성공 20, 최대 3000ms 계약을 변경하지 않는다.
- 새 UI·아이콘 라이브러리를 추가하지 않는다.
- 내부 경고 코드와 메시 정점·토폴로지 정보는 사용자 문구에 노출하지 않는다.
- 기존 실패 시 S1만으로 보고서를 계속할 수 있는 `onFinish(null)` 폴백을 유지한다.

---

### Task 1: 촬영 안내 프레젠테이션 계약

**Files:**
- Create: `apps/mobile/src/features/face-analysis/services/faceAnalysisCaptureGuidance.ts`
- Create: `apps/mobile/src/features/face-analysis/services/faceAnalysisCaptureGuidance.test.ts`
- Modify: `scripts/mobile/run-face3d-contract.mjs`

**Interfaces:**
- Consumes: `Face3DStatus`, `DEFAULT_FACE_3D_REQUEST_OPTIONS.maximumDurationMs`
- Produces: `FACE_ANALYSIS_CAPTURE_PLAN`, `FACE_3D_PREFLIGHT_COPY`, `getFace3DRemainingSeconds()`, `getFace3DStatusCopy()`

- [ ] **Step 1: Write the failing contract test**

```ts
expectEqual(FACE_ANALYSIS_CAPTURE_PLAN.length, 2, 'two camera stages');
expectEqual(FACE_ANALYSIS_CAPTURE_PLAN[0].title, '정면 사진 촬영', 'S1 title');
expectEqual(FACE_ANALYSIS_CAPTURE_PLAN[1].title, '3D 얼굴 측정', '3D title');
expect(FACE_3D_PREFLIGHT_COPY.description.includes('약 3초'), '3D duration copy');
expectEqual(getFace3DRemainingSeconds(0, 30), 3, 'initial remaining seconds');
expectEqual(getFace3DRemainingSeconds(20, 30), 1, 'late remaining seconds');
expectEqual(getFace3DStatusCopy('blocked'), '3D 측정을 완료하지 못했어요.', 'safe blocked copy');
```

- [ ] **Step 2: Run the contract and confirm it fails**

Run: `npm run test:face3d --prefix apps/mobile`

Expected: FAIL because `faceAnalysisCaptureGuidance` does not exist.

- [ ] **Step 3: Implement the pure presentation module**

```ts
export const FACE_ANALYSIS_CAPTURE_PLAN = [
  {id: 's1', title: '정면 사진 촬영', description: '가이드에 맞추면 사진을 한 번 촬영해요.'},
  {id: 'face3d', title: '3D 얼굴 측정', description: '셔터 없이 약 3초 동안 자동으로 측정해요.'},
] as const;

export const FACE_3D_PREFLIGHT_COPY = {
  title: '이제 3D 얼굴 측정이에요',
  description: '약 3초 동안 정면을 보고 입술을 편하게 다문 채 표정과 고개를 유지해 주세요.',
  action: '준비됐어요',
} as const;
```

`getFace3DRemainingSeconds()`는 현재 유효 프레임 비율을 3초 수집 창에 매핑하고 0~3 범위를 반환한다. `getFace3DStatusCopy()`는 `state.message` 대신 상태별 사용자 문구만 반환한다.

- [ ] **Step 4: Add the test to the existing Face3D runner and verify green**

Run: `npm run test:face3d --prefix apps/mobile`

Expected: `Face3D profile and semantic capture-set contracts passed.`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/face-analysis/services/faceAnalysisCaptureGuidance.ts apps/mobile/src/features/face-analysis/services/faceAnalysisCaptureGuidance.test.ts scripts/mobile/run-face3d-contract.mjs
git commit -m "feat(analysis): define capture guidance contract"
```

### Task 2: 얼굴 분석 시작 화면에 두 단계 안내 추가

**Files:**
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisIntroScreen.tsx`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisIntroScreen.test.tsx`

**Interfaces:**
- Consumes: `FACE_ANALYSIS_CAPTURE_PLAN`
- Produces: 촬영 시작 전 두 단계와 예상 소요 시간을 보여주는 UI

- [ ] **Step 1: Add failing copy assertions**

```ts
expectEqual(getFaceAnalysisCapturePlanTitles().join(','), '정면 사진 촬영,3D 얼굴 측정', 'capture plan titles');
expect(getFaceAnalysisIntroContent().captureDuration.includes('10초'), 'typical duration disclosed');
```

- [ ] **Step 2: Run TypeScript before implementation**

Run: `npm run typecheck --prefix apps/mobile`

Expected: FAIL because the new export and copy do not exist.

- [ ] **Step 3: Render a compact two-row capture plan**

Add `getFaceAnalysisCapturePlanTitles()` and render numbered rows below the hero description. Copy:

```text
카메라는 두 단계로 진행돼요
1 정면 사진 촬영 — 가이드에 맞추면 사진을 한 번 촬영해요.
2 3D 얼굴 측정 — 셔터 없이 약 3초 동안 자동으로 측정해요.
보통 10초 내외이며, 얼굴을 맞추는 시간에 따라 더 걸릴 수 있어요.
```

Use existing `colors`, `spacing`, `radius`, and `typography` tokens.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck --prefix apps/mobile`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/face-analysis/screens/FaceAnalysisIntroScreen.tsx apps/mobile/src/features/face-analysis/screens/FaceAnalysisIntroScreen.test.tsx
git commit -m "feat(analysis): explain two-step face capture"
```

### Task 3: 3D 사전 안내·시간 진행률·재시도 UX

**Files:**
- Modify: `apps/mobile/src/features/face-analysis/screens/Face3DMeasurementScreen.tsx`

**Interfaces:**
- Consumes: `FACE_3D_PREFLIGHT_COPY`, `getFace3DRemainingSeconds()`, `getFace3DStatusCopy()`
- Produces: 사용자 확인 뒤 시작되는 3D 측정, 최대 두 번의 즉시 재시도, 안내 재확인, 건너뛰기

- [ ] **Step 1: Replace automatic mount-start with an explicit preflight state**

Add `instructionsAccepted`, `attemptCount`, and a `beginMeasurement()` callback. The native view may prepare, but `start()` must not run until the user presses `준비됐어요`.

- [ ] **Step 2: Render the preflight screen**

Render the title, 3-second instruction, three short bullets (`정면`, `편안한 표정`, `고개 고정`), and a 56px primary button. Keep `건너뛰기` available only after the camera stage starts.

- [ ] **Step 3: Replace raw messages and frame-first UI**

Use `getFace3DStatusCopy(state.status)` instead of `state.message`. During `collecting`, show `약 N초 남았어요` as the primary value and keep `validFrameCount/targetFrameCount` as smaller developer-support copy.

- [ ] **Step 4: Keep failure on-screen for recovery**

On the first failure, show `다시 측정`. On the second failure, show `안내 다시 보기` and `3D 측정 건너뛰기`. `completed` still calls `onFinish(profile)` exactly once; skip calls `onFinish(null)` exactly once.

- [ ] **Step 5: Run focused and broad verification**

Run:

```bash
npm run test:face3d --prefix apps/mobile
npm run typecheck --prefix apps/mobile
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/face-analysis/screens/Face3DMeasurementScreen.tsx
git commit -m "feat(analysis): guide and retry 3d capture"
```

### Task 4: iPhone 실측 검증

**Files:**
- Runtime evidence only: `Documents/face3d-runtime-evidence/events.jsonl`

**Interfaces:**
- Consumes: installed development build, WiFi Metro, `face3d_analyzed` event
- Produces: exact frame count and metric evidence

- [ ] **Step 1: Launch the main app with the current LAN IP and Cognito environment**

Run Metro without `EXPO_PUBLIC_AURA_EXPERIMENT_APP`, launch `com.aiarmakeupguides.mobile`, and keep the app foregrounded.

- [ ] **Step 2: Complete one S1 + 3D flow**

Expected UI: two-step intro, preflight instruction, 3-second progress, completion.

- [ ] **Step 3: Pull and inspect runtime evidence**

Success requires a new `face3d_analyzed` event with `validFrameCount >= 20`, `targetFrameCount === 30`, and finite values for all five required metrics.

- [ ] **Step 4: Record the verification result without committing device evidence**

Do not add the JSONL file to git.

