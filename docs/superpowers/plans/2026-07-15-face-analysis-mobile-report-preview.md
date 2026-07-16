# Face Analysis Mobile Report Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 얼굴 분석 보고서의 측정·AI 분석·추천 흐름을 390px 모바일 세로형 단일 HTML로 미리 볼 수 있게 한다.

**Architecture:** 빌드 도구나 외부 네트워크가 필요 없는 정적 HTML 한 파일에 구조, 스타일, 샘플 데이터, 상호작용을 포함한다. 저장소의 얼굴 분석·메이크업 이미지를 상대 경로로 재사용하고 Playwright로 모바일·데스크톱 렌더링을 검증한다.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, existing repository image assets, Playwright verification

## Global Constraints

- 산출물은 `docs/previews/face-analysis-report-mobile-preview.html` 단일 파일이다.
- 기준 모바일 폭은 390px이며 가로 스크롤이 없어야 한다.
- 예시 데이터임을 표시하고 민감도 3 지표는 노출하지 않는다.
- 새 라이브러리, CDN, 외부 폰트, 외부 이미지 URL을 사용하지 않는다.
- 현재 앱의 보고서 섹션 순서를 유지한다.

---

### Task 1: 모바일 보고서 구조와 콘텐츠

**Files:**
- Create: `docs/previews/face-analysis-report-mobile-preview.html`

**Interfaces:**
- Consumes: existing images under `apps/mobile/src/assets/images/`
- Produces: independently openable HTML report preview

- [ ] **Step 1: Establish the semantic section contract**

The document must contain elements with these IDs:

```text
report-hero, beauty-profile, analysis-summary, vertical-thirds,
face3d-depth, face-geometry, personal-color, ai-analysis,
makeup-recommendation, makeup-tips, create-filter-action
```

- [ ] **Step 2: Build the 390px editorial layout**

Use a full-bleed hero with `filter-lovely-pink-actress-before.png`, warm ivory background, black primary type, and one muted rose accent. Use whitespace and dividers for routine information; reserve cards for interactive or bounded measurement groups.

- [ ] **Step 3: Add realistic sample results**

Include 30/30 successful 3D data, all five required metrics, six optional metrics, sixteen 2D geometry labels, personal color, three AI pipeline statuses, nine derived insights, one perception summary, one consulting summary, and makeup tips.

- [ ] **Step 4: Add the recommendation comparison**

Use the existing before/after pair:

```text
../../apps/mobile/src/assets/images/makeup-filters/filter-lovely-pink-actress-before.png
../../apps/mobile/src/assets/images/makeup-filters/filter-lovely-pink-actress.png
```

- [ ] **Step 5: Validate static structure**

Open the file directly and confirm every required ID exists and all relative images load.

- [ ] **Step 6: Commit**

```bash
git add docs/previews/face-analysis-report-mobile-preview.html
git commit -m "docs: add mobile face report preview"
```

### Task 2: Interaction and responsive behavior

**Files:**
- Modify: `docs/previews/face-analysis-report-mobile-preview.html`

**Interfaces:**
- Consumes: Task 1 section IDs
- Produces: keyboard-operable detail toggle and before/after comparison

- [ ] **Step 1: Add native disclosure controls**

Use `<details>` and `<summary>` for the eleven 3D metrics and measurement detail so keyboard behavior works without custom ARIA scripting.

- [ ] **Step 2: Add before/after buttons**

Use two `<button>` elements with `aria-pressed`; update the image source and active label without rebuilding the page.

- [ ] **Step 3: Add restrained motion**

Use one initial section reveal, sticky bottom action presence, and a fast image crossfade. Disable all movement inside `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 4: Verify responsive rules**

At 390px, the page has no horizontal overflow and touch targets are at least 44px. At 1440px, center the 430px preview frame without stretching the report.

- [ ] **Step 5: Commit**

```bash
git add docs/previews/face-analysis-report-mobile-preview.html
git commit -m "docs: polish face report preview interactions"
```

### Task 3: Browser visual verification

**Files:**
- Verify: `docs/previews/face-analysis-report-mobile-preview.html`

**Interfaces:**
- Consumes: final static HTML
- Produces: screenshots and browser-console verification

- [ ] **Step 1: Start a local static server**

Serve the repository root on localhost without modifying project dependencies.

- [ ] **Step 2: Inspect at 390x844**

Confirm hero crop, typography, all section headings, sticky action, disclosure controls, and before/after toggle. Capture a full-page screenshot outside the repository.

- [ ] **Step 3: Inspect at 1440x1000**

Confirm the report remains centered and no content stretches beyond 430px. Capture a full-page screenshot outside the repository.

- [ ] **Step 4: Check console and accessibility basics**

Expected: no console errors, no broken images, buttons expose labels and pressed state, `<summary>` controls are keyboard reachable.

- [ ] **Step 5: Run repository verification**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended files changed.

