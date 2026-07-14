# Personal Color Report Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make device-measured personal color the only report classification and explain the color recommendation range and five-axis graph in Korean.

**Architecture:** A pure presentation mapper converts the measured 12-tone result and axes to canonical report text, three-band labels, and palette descriptions. The report uses this mapper whenever a valid measurement exists. The LLM only receives the measured color as makeup-guidance context and does not output a classification.

**Tech Stack:** Expo React Native, TypeScript, existing personal-color engine, FastAPI, pytest.

## Global Constraints

- No new UI or icon libraries.
- Never use LLM personal-color output as a report fallback.
- Render `트루` without parentheses.
- Treat palette chips as a recommendation range, not a diagnosis.

---

## File map

- `apps/mobile/src/features/personal-color/services/personalColorCore/presentation.ts`: pure Korean terminology and axis-band mapping.
- `apps/mobile/src/features/personal-color/components/PersonalColorTypeCard.tsx`: segmented five-axis UI and explanatory palette chips.
- `apps/mobile/src/features/face-analysis/services/faceAnalysisReportDetailModel.ts`: measured report headline values.
- `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx`: passes the effective measured result into the headline model.
- `services/backend/app/services/openai_analysis.py`: removes LLM color classification instruction.

### Task 1: Canonical measured-color presentation

**Files:**
- Create: `apps/mobile/src/features/personal-color/services/personalColorCore/presentation.ts`
- Create: `apps/mobile/src/features/personal-color/services/personalColorCore/presentation.test.ts`
- Modify: `apps/mobile/src/features/personal-color/services/personalColorCore/constants.ts`

**Produces:** `getAxisBandPresentation(axis, value)`, `getMeasuredPersonalColorSummary(result)`, and `getPaletteRangePresentation(item)`.

- [ ] Write a failing pure TypeScript test for `summer_true` becoming `여름 쿨 트루`, for axes `cool/-0.5/-0.4` becoming `쿨 · 밝은 색 · 부드러운 색`, and for `cool/light/clear` becoming `쿨 · 밝은 색 · 맑은 색`.
- [ ] Run the existing tsc-then-node contract pattern and confirm missing presentation exports fail.
- [ ] Implement three equal [-1, 1] bands per axis: temperature (`쿨/뉴트럴/웜`), value (`밝은 색/중간 밝기/깊은 색`), chroma (`부드러운 색/맑은 색/선명한 색`), clarity (`소프트/균형/클리어`), contrast (`저대비/균형/고대비`).
- [ ] Remove parentheses from all `true` entries in `TYPE_LABEL_KO`.
- [ ] Re-run the pure test and confirm it passes.
- [ ] Commit only Task 1 files with `feat(personal-color): add measured result presentation`.

### Task 2: Report headline and diagnostic card

**Files:**
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisReportDetailModel.ts`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx`
- Modify: `apps/mobile/src/features/personal-color/components/PersonalColorTypeCard.tsx`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.test.tsx`
- Modify: `apps/mobile/src/features/face-analysis/components/FaceAnalysisReportCard.test.tsx`

**Consumes:** Task 1 mapper and `MeasuredPersonalColorView | null`.

- [ ] Write failing tests asserting that a valid measurement replaces the report's LLM `personalColor` and `toneSummary`, and a missing measurement shows `측정하지 못했어요` rather than the LLM guess.
- [ ] Run the tests and confirm the current model still returns the LLM strings.
- [ ] Change `getFaceAnalysisReportSummaryItems` to accept the measured result and use `getMeasuredPersonalColorSummary` when `tone` exists.
- [ ] Pass `effectivePersonalColor` to that model in the report detail screen.
- [ ] Replace raw two-ended axis bars with three labelled segments; highlight the selected segment and show `현재 위치: <label>` under each axis.
- [ ] Rename `잘 어울리는 색 계열` to `추천 색 범위`, render the full explanatory label and exemplar colors, and add the caption `진단명이 아니라 현재 측정값 주변의 추천 범위예요.`
- [ ] Run changed tests and `npm run typecheck` from `apps/mobile`; both must pass.
- [ ] Commit only Task 2 files with `feat(report): explain measured personal color`.

### Task 3: Forbid LLM reclassification

**Files:**
- Modify: `services/backend/app/services/openai_analysis.py`
- Modify: `services/backend/tests/test_openai_analysis.py`

**Produces:** An analysis prompt that uses measured color only for makeup guidance.

- [ ] Write a failing pytest asserting that the analysis prompt says `퍼스널 컬러를 새로 판정하지 마` and no longer requires `personalColor` or `toneSummary` output keys.
- [ ] Run `pytest services/backend/tests/test_openai_analysis.py -q` and confirm it fails against the current prompt.
- [ ] Remove `personalColor` and `toneSummary` from the required JSON output guide and add the explicit no-reclassification instruction. Keep response normalization backward compatible with previously stored reports.
- [ ] Re-run pytest and confirm it passes.
- [ ] Commit only Task 3 files with `fix(analysis): prevent LLM color reclassification`.

## Verification

- [ ] Run all Task 1/2 pure tests, `npm run typecheck` in `apps/mobile`, and the Task 3 pytest target.
- [ ] Open a report with an existing measured personal color: its top summary, diagnostic headline, axis bands, and palette wording must agree.
