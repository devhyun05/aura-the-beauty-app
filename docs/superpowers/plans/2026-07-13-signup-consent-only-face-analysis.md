# Signup Consent-Only Face Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users enter face capture and create analysis reports without a second face-analysis consent request or server-side face-consent record.

**Architecture:** The mobile routes retain their existing authentication check but remove the face-consent controller and render the intro/camera screens directly. The backend keeps ordinary authentication and media ownership checks while omitting face-consent reads, consent snapshots, and consent-derived database values from analysis report creation.

**Tech Stack:** Expo React Native, TypeScript, React Navigation, FastAPI, asyncpg, pytest.

## Global Constraints

- Do not modify signup consent collection or normal authentication.
- Do not add libraries or modify user-owned iOS/Unity files.
- Preserve face-capture quality gates, media ownership checks, and analysis authorization.
- Remove obsolete face-analysis consent columns and constraints through an idempotent schema migration; update both backend schema documents.
- Use focused tests first, then run mobile typecheck and affected backend tests.

---

### Task 1: Remove the mobile pre-capture consent gate

**Files:**
- Modify: `apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx`
- Modify: `apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.test.ts`
- Delete: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisConsentScreen.tsx`
- Delete: `apps/mobile/src/features/face-analysis/services/faceAnalysisConsentGate.ts`
- Delete: `apps/mobile/src/features/face-analysis/services/faceAnalysisConsentModel.ts`
- Delete: `apps/mobile/src/features/face-analysis/services/faceAnalysisConsentService.ts`
- Delete: their focused `*.test.ts` files
- Modify: `apps/mobile/src/features/auth/services/authSessionContext.tsx`
- Modify: `apps/mobile/src/features/settings/services/accountService.ts`

**Consumes:** Existing `useAuthSession`, `FaceAnalysisIntroScreen`, and `CameraFaceCaptureScreen`.

**Produces:** Authenticated routes render the existing intro/camera surfaces directly and never request `/users/me/consents`.

- [ ] **Step 1: Write the failing route-contract test**

Add an assertion that the source route module no longer imports `getFaceAnalysisConsentStatus`, `FaceAnalysisConsentScreen`, or `useFaceAnalysisConsentController`, and that the direct capture route retains `CameraFaceCaptureScreen`.

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node scripts/mobile/run-face-profile-contract.mjs`

Expected: the new assertion fails because the current route imports the consent controller.

- [ ] **Step 3: Implement the minimal route cleanup**

Remove the consent imports, controller, consent-only route surface, retry redirect, and `refresh()` calls. Keep only session restoration/auth redirects. Make the intro guide open directly and make `FaceCaptureRouteScreen` render `CameraFaceCaptureScreen` after authentication.

Remove now-unused cache cleanup imports/calls from auth-session and account services, then delete the unused face-consent feature files and their tests.

- [ ] **Step 4: Run the focused mobile checks**

Run:
`node scripts/mobile/run-face-profile-contract.mjs`
`npm run typecheck`

Expected: both exit successfully, and no mobile source imports the removed face-consent modules.

- [ ] **Step 5: Commit**

`git add apps/mobile/src`
`git commit -m "fix: remove duplicate face analysis consent gate"`

### Task 2: Remove backend face-consent enforcement from analysis jobs

**Files:**
- Modify: `services/backend/app/api/analysis.py`
- Modify: `services/backend/app/services/analysis_face_profiles.py`
- Modify: `services/backend/tests/test_analysis_face_profiles.py`
- Modify: `services/backend/tests/test_analysis_face_profiles_postgres.py`
- Modify: `docs/backend/schema.sql`
- Modify: `docs/backend/aws-postgresql-schema.dbml`

**Consumes:** Authenticated `CreateAnalysisJob` requests with already-owned source media.

**Produces:** Analysis job creation and face-profile persistence need no `camera_analysis`, `ai_processing`, or `third_party_ai` row.

- [ ] **Step 1: Write the failing backend tests**

Add one unit test that `build_consent_snapshot({})` is no longer needed by the profile insertion path, and one PostgreSQL/API-path test that creates an analysis report without inserting user-consent rows.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`pytest services/backend/tests/test_analysis_face_profiles.py -q`
`pytest services/backend/tests/test_analysis_face_profiles_postgres.py -q`

Expected: the new case fails because the existing implementation requires `camera_analysis`.

- [ ] **Step 3: Implement the minimal backend cleanup**

In `analysis.py`, remove `require_active_consent` calls and do not construct `consent_rows`. In `analysis_face_profiles.py`, make `insert_analysis_face_profile` omit consent inputs and consent-derived persistence. Add idempotent `alter table analysis_face_profiles drop column if exists ...` statements for the obsolete consent columns, then mirror the final table shape in `aws-postgresql-schema.dbml`. Remove only face-analysis consent imports and helpers that become unused; leave account-level consent APIs untouched unless they have no remaining caller.

- [ ] **Step 4: Run backend verification**

Run:
`pytest services/backend/tests/test_analysis_face_profiles.py services/backend/tests/test_analysis_face_profiles_postgres.py -q`

Expected: both suites pass, including the new no-face-consent creation case.

- [ ] **Step 5: Commit**

`git add services/backend/app services/backend/tests`
`git commit -m "fix: use signup consent for face analysis"`

### Task 3: Verify the integrated flow

**Files:**
- Modify only if a failed check identifies a direct dependency.

**Consumes:** The mobile route cleanup and backend no-consent job creation.

**Produces:** An authenticated face-analysis entry path that is not blocked by the missing production `/users/me/consents` route.

- [ ] **Step 1: Run focused repository scans**

Run:
`rg -n 'getFaceAnalysisConsentStatus|FaceAnalysisConsentScreen|useFaceAnalysisConsentController' apps/mobile/src`
`rg -n 'require_active_consent' services/backend/app/api/analysis.py`

Expected: no matches.

- [ ] **Step 2: Run regression checks**

Run:
`npm run typecheck --prefix apps/mobile`
`pytest services/backend/tests/test_analysis_face_profiles.py services/backend/tests/test_analysis_face_profiles_postgres.py services/backend/tests/test_user_consents.py -q`

Expected: all commands pass.

- [ ] **Step 3: Build and run the iOS app after server deployment**

Start Metro on port 8082, install the updated app, and open Face Analysis. Expected: the existing intro/camera flow appears immediately; it does not display “서버 확인이 필요해요”.

- [ ] **Step 4: Commit any verification-only fixes**

`git add <only files changed by the failed verification>`
`git commit -m "fix: complete signup consent-only flow"`
